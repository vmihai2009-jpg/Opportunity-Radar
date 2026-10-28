// Government tender APIs that publish in the Open Contracting Data Standard (OCDS):
//  - Find a Tender (all UK above-threshold public notices)
//  - Contracts Finder (smaller English public contracts)
// Both are filtered to CPV division 71000000 (architectural, construction, engineering
// and inspection services) and to London / South East delivery locations.

import { fetchJSON, stripTags, clip, safeDate } from '../util.mjs';
import { regionFromCodes, regionFromPostcode, regionFromText, isNationalScope, groupFor, fitFor, tagsFor, formatMoney, isStudent } from '../classify.mjs';

export const CPV_PREFIX = '71'; // CPV 71000000 and every code beneath it

const toApiDate = (d) => new Date(d).toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS (UTC)

function cpvCodes(tender = {}) {
  const codes = [];
  const push = (c) => { if (c && /cpv/i.test(c.scheme || 'CPV') && c.id) codes.push(String(c.id).replace(/-\d$/, '')); };
  push(tender.classification);
  for (const it of tender.items || []) {
    push(it.classification);
    (it.additionalClassifications || []).forEach(push);
  }
  (tender.additionalClassifications || []).forEach(push);
  return [...new Set(codes)];
}

function locationOf(release) {
  const tender = release.tender || {};
  const codes = [];
  const texts = [];
  for (const it of tender.items || []) {
    for (const a of [...(it.deliveryAddresses || []), ...(it.deliveryLocations || []).map((l) => l.address || {})]) {
      if (a.region) codes.push(a.region);
      // Region fields are often bare NUTS/ITL codes (e.g. "UKI3"); keep those out of the readable place name.
      const regionName = a.region && !/^(UK|TL)[A-Z0-9]*$/i.test(a.region) ? a.region : '';
      texts.push([a.streetAddress, a.locality, regionName, a.postalCode].filter(Boolean).join(' '));
      if (a.postalCode && regionFromPostcode(a.postalCode)) codes.push(regionFromPostcode(a.postalCode) === 'London' ? 'UKI' : 'UKJ');
    }
    for (const l of it.deliveryLocations || []) if (l.description) texts.push(l.description);
  }
  const buyer = (release.parties || []).find((p) => (p.roles || []).includes('buyer')) || release.buyer || {};
  const addr = buyer.address || {};
  // Delivery location wins; buyer address is the fallback.
  let region = regionFromCodes(codes) || regionFromText(texts.join(' '));
  let place = texts.find((t) => t && t.trim()) || [addr.locality, addr.postalCode].filter(Boolean).join(', ');
  // Buyer address is only used when the notice gives no delivery location at all.
  const hasDelivery = codes.length > 0 || texts.some((t) => t && t.trim());
  if (!region && !hasDelivery) {
    region = regionFromCodes([addr.region]) || regionFromPostcode(addr.postalCode) || regionFromText([addr.locality, addr.region].join(' '));
    if (region) place = [addr.locality, addr.postalCode].filter(Boolean).join(', ');
  }
  if (!region && isNationalScope(codes, texts.join(' ') + ' ' + (tender.description || ''))) region = 'National';
  return { region, place: place || [addr.locality, addr.region].filter(Boolean).join(', '), buyerName: buyer.name || release.buyer?.name || '' };
}

function stageOf(release) {
  const tags = release.tag || [];
  const status = release.tender?.status || '';
  if (tags.some((t) => /award|contract|implementation|tenderCancellation/i.test(t)) || /cancelled|unsuccessful|complete|withdrawn/i.test(status)) return 'closed';
  if (tags.includes('planning') || tags.includes('planningUpdate') || status === 'planning' || status === 'planned') return 'Pipeline / pre-market';
  return 'Open tender';
}

export function releaseToItem(release, src) {
  const tender = release.tender || {};
  const cpvs = cpvCodes(tender);
  if (!cpvs.some((c) => c.startsWith(CPV_PREFIX))) return { skip: 'cpv' };
  const stage = stageOf(release);
  const id = `${src.key}-${release.ocid || release.id}`;
  if (stage === 'closed') return { closeId: id };
  const loc = locationOf(release);
  if (!['London', 'South East', 'National'].includes(loc.region)) return { skip: 'region' };
  const title = stripTags(tender.title || release.title || '');
  const description = stripTags(tender.description || '');
  const text = `${title} ${description}`;
  if (!title || isStudent(text)) return { skip: 'content' };
  const value = tender.value || tender.maxValue || tender.minValue || {};
  const deadline = tender.tenderPeriod?.endDate || tender.submissionTerms?.deadline || '';
  const pipelineDate = !deadline ? tender.communication?.futureNoticeDate || tender.contractPeriod?.startDate || '' : '';
  return {
    item: {
      id,
      kind: 'tender',
      title,
      group: groupFor(text),
      region: loc.region,
      place: clip(loc.place, 80) || loc.region,
      buyer: loc.buyerName,
      brief: clip(description || title, 420),
      stage: tender.procurementMethodDetails ? `${stage} · ${tender.procurementMethodDetails}` : stage,
      date: deadline ? deadline.slice(0, 10) : '',
      time: deadline && /T\d\d:\d\d/.test(deadline) ? deadline.slice(11, 16) : '',
      milestone: pipelineDate ? pipelineDate.slice(0, 10) : '',
      published: safeDate(release.date),
      amount: formatMoney(value.amount, value.currency),
      valueType: value.amount ? 'Published estimated value (may be a framework total, not a fee)' : '',
      fit: fitFor({ text, cpvs, kind: 'tender' }),
      cpv: cpvs.filter((c) => c.startsWith('71')).slice(0, 4),
      tags: tagsFor(text),
      source: src.name,
      ref: release.id || release.ocid,
      url: src.noticeUrl(release),
    },
  };
}

// Pages through updates since the last checkpoint, within a time budget.
// state: { from, to, cursor } - persisted between runs so a backlog drains over several runs.
export async function crawlOcds(src, state = {}, { deadlineAt, backfillDays = 14 } = {}) {
  const now = new Date();
  let from = state.from || new Date(now.getTime() - backfillDays * 86400000).toISOString();
  let to = state.to || now.toISOString();
  let cursor = state.cursor || '';
  const items = [];
  const closeIds = [];
  let pages = 0, releases = 0, finished = false;
  while (Date.now() < deadlineAt) {
    const url = new URL(src.endpoint);
    url.searchParams.set(src.fromParam, toApiDate(from));
    url.searchParams.set(src.toParam, toApiDate(to));
    url.searchParams.set('stages', src.stages);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const pkg = await fetchJSON(url.href, { timeoutMs: Math.max(3000, Math.min(15000, deadlineAt - Date.now())) });
    pages++;
    for (const r of pkg.releases || []) {
      releases++;
      const res = releaseToItem(r, src);
      if (res.item) items.push(res.item);
      if (res.closeId) closeIds.push(res.closeId);
    }
    const next = pkg.links?.next || pkg.nextCursor || '';
    const nextCursor = next ? (next.includes('cursor=') ? new URL(next, src.endpoint).searchParams.get('cursor') : next) : '';
    if (!nextCursor || !(pkg.releases || []).length || nextCursor === cursor) { finished = true; break; }
    cursor = nextCursor;
  }
  const newState = finished ? { from: to, to: '', cursor: '' } : { from, to, cursor };
  return { items, closeIds, state: newState, note: `${pages} page(s), ${releases} notices scanned${finished ? '' : ' - backlog continues next run'}` };
}

export const FIND_A_TENDER = {
  key: 'fts',
  name: 'Find a Tender',
  home: 'https://www.find-tender.service.gov.uk/Search/Results?cpv_codes=71000000',
  endpoint: 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
  fromParam: 'updatedFrom',
  toParam: 'updatedTo',
  stages: 'planning,tender,award',
  noticeUrl: (r) =>
    /^\d{6}-\d{4}$/.test(r.id || '')
      ? `https://www.find-tender.service.gov.uk/Notice/${r.id}`
      : `https://www.find-tender.service.gov.uk/Search/Results?keywords=${encodeURIComponent(r.ocid || r.id || '')}`,
};

export const CONTRACTS_FINDER = {
  key: 'cf',
  name: 'Contracts Finder',
  home: 'https://www.contractsfinder.service.gov.uk/Search',
  endpoint: 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search',
  fromParam: 'publishedFrom',
  toParam: 'publishedTo',
  stages: 'planning,tender,award',
  noticeUrl: (r) => {
    const guid = (String(r.ocid || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
    return guid ? `https://www.contractsfinder.service.gov.uk/Notice/${guid}` : 'https://www.contractsfinder.service.gov.uk/Search';
  },
};
