// Government tender APIs that publish in the Open Contracting Data Standard (OCDS):
//  - Find a Tender (all UK above-threshold public notices)
//  - Contracts Finder (smaller English public contracts)
// Both are filtered to CPV division 71000000 (architectural, construction, engineering
// and inspection services) and to London / South East delivery locations.

import { fetchRetry, stripTags, clip, safeDate } from '../util.mjs';
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

// Reads every notice updated since the last checkpoint.
// The government APIs return at most 100 notices per request and do not reliably give a
// "next page" link, so the time range is cut into windows: any window that comes back full
// (100 notices) is split in half and read again, until every window is complete.
// Progress is saved per window, so an interrupted run carries on where it stopped.
const MIN_WINDOW_MS = 60 * 1000;
// A short pause between requests keeps us polite to the government servers (RADAR_PAUSE_MS=0 in tests).
const pause = (src) => { const ms = Number(process.env.RADAR_PAUSE_MS ?? src.pauseMs ?? 0); return ms ? new Promise((r) => setTimeout(r, ms)) : null; };

// One time window for one stage. Follows a "next page" cursor if the API provides one
// (in the body or in a Link header), so nothing is lost whichever way the API paginates.
async function fetchWindow(src, fromMs, toMs, stage) {
  const all = [];
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const url = new URL(src.endpoint);
    url.searchParams.set(src.fromParam, toApiDate(fromMs));
    url.searchParams.set(src.toParam, toApiDate(toMs));
    url.searchParams.set('limit', '100');
    if (stage) url.searchParams.set('stages', stage);
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetchRetry(url.href, { timeoutMs: 40000, retries: 4, headers: { Accept: 'application/json' } });
    const text = await res.text();
    let pkg;
    try { pkg = JSON.parse(text); } catch { throw new Error(`incomplete reply from ${url.hostname} (${text.length} bytes)`); }
    const releases = pkg.releases || [];
    all.push(...releases);
    const link = pkg.links?.next || (res.headers.get('link') || '').match(/<([^>]+)>;\s*rel="?next"?/i)?.[1] || '';
    const next = link ? new URL(link, src.endpoint).searchParams.get('cursor') || '' : pkg.nextCursor || '';
    if (!next || next === cursor || !releases.length) return { releases: all, full: !next && releases.length >= 100 };
    cursor = next;
  }
  return { releases: all, full: false };
}

export async function crawlOcds(src, state = {}, { deadlineAt = Infinity, backfillDays = 30, onProgress } = {}) {
  const nowMs = Date.now();
  const startMs = state.from ? Date.parse(state.from) : nowMs - backfillDays * 86400000;
  const items = [];
  const closeIds = [];
  let requests = 0, releases = 0, matched = 0;
  // Overlap the last 10 minutes so notices published while the previous run was in progress are not missed.
  let cursorMs = Math.max(startMs - 10 * 60000, nowMs - 400 * 86400000);
  let windowMs = 3 * 3600000;
  const seen = new Set();
  let maxId = 0;
  while (cursorMs < nowMs) {
    if (Date.now() > deadlineAt) break;
    const endMs = Math.min(cursorMs + windowMs, nowMs);
    const parts = [];
    let full = false;
    for (const stage of src.stages) {
      const r = await fetchWindow(src, cursorMs, endMs, stage);
      requests++;
      parts.push(...r.releases);
      full = full || r.full;
      await pause(src);
    }
    const batch = parts;
    maxId = Math.max(maxId, maxFtsId(batch));
    if (full && endMs - cursorMs > MIN_WINDOW_MS) {
      windowMs = Math.max(MIN_WINDOW_MS, Math.floor((endMs - cursorMs) / 2));
      continue; // window too busy: read it again in smaller pieces
    }
    for (const r of batch) {
      const key = `${r.ocid}|${r.id}|${r.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      releases++;
      const res = releaseToItem(r, src);
      if (res.item) { items.push(res.item); matched++; }
      if (res.closeId) closeIds.push(res.closeId);
    }
    cursorMs = endMs;
    if (batch.length < 30) windowMs = Math.min(windowMs * 2, 6 * 3600000); // quiet period: take bigger steps
    if (onProgress) onProgress({ cursor: new Date(cursorMs).toISOString(), requests, releases, matched });
  }
  const done = cursorMs >= nowMs;
  let walkNote = '';
  if (src.walkIds) {
    const w = await walkFtsIds(src, state.walk, { items, closeIds, seedMaxId: maxId });
    state = { ...state, walk: w.state };
    walkNote = w.requests ? `; plus ${w.requests} newest notice numbers checked one by one (${w.found} found)` : '';
  }
  return {
    items,
    closeIds,
    state: { from: new Date(cursorMs).toISOString(), walk: state.walk },
    note: `${releases} notices scanned in ${requests} requests, ${matched} matched CPV 71 + location${walkNote}${done ? '' : ' (catching up, continues next run)'}`,
  };
}

// Find a Tender numbers its notices in sequence (e.g. 103297-2026). As a safety net next to the
// time-window search, every run also asks for each new notice number in turn, so a notice is never
// missed even if the search API skips something. Stops after 30 numbers in a row that don't exist yet.
export async function walkFtsIds(src, state = {}, { maxRequests = 400, items, closeIds, seedMaxId = 0 } = {}) {
  const year = new Date().getUTCFullYear();
  let n = state.year === year ? state.lastId || 0 : 0;
  if (!n && seedMaxId) n = seedMaxId;
  if (!n) return { state: { year, lastId: 0 }, requests: 0, found: 0 };
  let misses = 0, requests = 0, found = 0, lastFound = n;
  while (misses < 30 && requests < maxRequests) {
    const id = `${String(n + 1).padStart(6, '0')}-${year}`;
    requests++;
    let pkg = null;
    try {
      const res = await fetchRetry(`${src.endpoint}/${id}`, { timeoutMs: 30000, retries: 2, headers: { Accept: 'application/json' } });
      pkg = JSON.parse(await res.text());
    } catch (e) {
      if (!/HTTP 404|HTTP 400/.test(e.message)) throw e;
    }
    n++;
    const rel = (pkg?.releases || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
    if (!rel) { misses++; continue; }
    misses = 0;
    lastFound = n;
    found++;
    const r = releaseToItem(rel, src);
    if (r.item) items.push(r.item);
    if (r.closeId) closeIds.push(r.closeId);
    await pause(src);
  }
  return { state: { year, lastId: lastFound }, requests, found };
}

export const maxFtsId = (releases) =>
  releases.reduce((m, r) => { const x = String(r.id || '').match(/^(\d{6})-(\d{4})$/); return x && Number(x[2]) === new Date().getUTCFullYear() ? Math.max(m, Number(x[1])) : m; }, 0);

export const FIND_A_TENDER = {
  key: 'fts',
  name: 'Find a Tender',
  home: 'https://www.find-tender.service.gov.uk/Search/Results',
  endpoint: 'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages',
  fromParam: 'updatedFrom',
  toParam: 'updatedTo',
  stages: ['tender', 'planning'],
  pauseMs: 300,
  walkIds: true,
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
  stages: ['tender', 'planning'],
  pauseMs: 300,
  noticeUrl: (r) => {
    const guid = (String(r.ocid || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0];
    return guid ? `https://www.contractsfinder.service.gov.uk/Notice/${guid}` : 'https://www.contractsfinder.service.gov.uk/Search';
  },
};
