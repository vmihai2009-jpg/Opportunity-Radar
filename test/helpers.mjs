// Fake versions of every source (shaped like the real replies checked on 30 Oct 2026)
// and an in-memory store, used by the tests and the local preview.

const YEAR = new Date().getUTCFullYear();
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');

export const release = (num, { cpv = '71200000', region = 'UKI3', title = 'Architectural services for town hall refurbishment', tag = ['tender'], end = '2099-12-01T12:00:00Z', postcode = 'SE1 9GF', date = hoursAgo(5), inItems = false } = {}) => ({
  ocid: `ocds-h6vhtk-${num}`, id: `${num}-${YEAR}`, date, tag,
  parties: [{ name: 'London Borough of Example', roles: ['buyer'], address: { locality: 'London', postalCode: postcode, region: 'UKI32' } }],
  tender: {
    title, description: 'Multi-disciplinary design team led by an architect, RIBA stages 2-4.', status: tag.includes('planning') ? 'planned' : 'active',
    ...(inItems ? {} : { classification: { scheme: 'CPV', id: cpv } }),
    value: { amount: 450000, currency: 'GBP' }, ...(end ? { tenderPeriod: { endDate: end } } : {}),
    items: [{ ...(inItems ? { additionalClassifications: [{ scheme: 'CPV', id: cpv }] } : {}), deliveryAddresses: [{ region }] }],
  },
});

// A busy hour with 150 unrelated notices hides one architecture tender: the crawler must split
// the time window to find it, because the API only returns 100 per request.
const BUSY = Array.from({ length: 150 }, (_, i) => release(String(100 + i).padStart(6, '0'), { cpv: '33100000', title: `Medical supplies ${i}`, date: hoursAgo(30 + i / 1000) }));
const FTS = [
  release('000001'),
  release('000002', { cpv: '45000000' }),
  release('000003', { region: 'UKM', postcode: 'G1 1AA' }),
  release('000004', { region: 'UKJ2', title: 'Conservation architect for Grade II listed pavilion', postcode: 'GU1 1AA', inItems: true }),
  release('000005', { cpv: '71300000', title: 'Planned feasibility study', tag: ['planning'], end: '' }),
  release('000007', { cpv: '71400000', title: 'Hidden masterplan in busy hour', date: hoursAgo(30.05) }),
  ...BUSY,
];
// Notice only reachable by its number (the search "missed" it).
const BY_NUMBER = { [`000260-${YEAR}`]: release('000260', { title: 'Late-indexed lead designer for Camden library', cpv: '71220000', date: hoursAgo(0.2) }) };

export function memoryStore() {
  const m = new Map();
  return {
    async get(k, o) { const v = m.get(k); return v === undefined ? null : o?.type === 'json' ? JSON.parse(v) : v; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
  };
}

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.map((i) => `<item><title>${i.t}</title><link>${i.l}</link><pubDate>${new Date(Date.now() - 86400000).toUTCString()}</pubDate><description><![CDATA[${i.d || ''}]]></description></item>`).join('')}</channel></rss>`;

export function stubFetch({ fail = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (fail.some((f) => u.includes(f))) return new Response('blocked', { status: 403 });
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    const ftsOne = u.match(/ocdsReleasePackages\/(\d{6}-\d{4})/);
    if (ftsOne) return BY_NUMBER[ftsOne[1]] ? json({ releases: [BY_NUMBER[ftsOne[1]]] }) : new Response('Not found', { status: 404 });
    if (u.includes('find-tender.service.gov.uk/api') || u.includes('contractsfinder')) {
      const q = new URL(u).searchParams;
      const from = Date.parse((q.get('updatedFrom') || q.get('publishedFrom')) + 'Z');
      const to = Date.parse((q.get('updatedTo') || q.get('publishedTo')) + 'Z');
      const stage = q.get('stages');
      const pool = u.includes('contractsfinder')
        ? [release('cf1', { region: 'London', title: 'Small office retrofit architect' }), release('cf2', { region: 'Scotland', title: 'Overseas mail', cpv: '64112000' })]
        : FTS;
      const hits = pool.filter((r) => { const d = Date.parse(r.date); return d >= from && d <= to && (!stage || r.tag.includes(stage)); });
      return json({ releases: hits.slice(0, 100) }); // no "next" link, like the real API
    }
    if (u.includes('dezeen.com/feed')) return new Response(rss([{ t: 'Open call launched for London pavilion design competition', l: 'https://www.dezeen.com/2026/10/26/pavilion-competition/', d: 'Entries close on 30 November.' }, { t: 'Page\\Park completes school in Edinburgh', l: 'https://www.dezeen.com/2026/10/28/pagepark/' }]));
    if (u.includes('competitions.archi')) return new Response(rss([{ t: 'DIGITAL NOMAD VILLAGE', l: 'https://competitions.archi/competition/digital-nomad-village/', d: 'International ideas competition in Portugal. Registration deadline 15 January 2027.' }, { t: 'Results: Sa Pizzedda', l: 'https://competitions.archi/competition/results-sa-pizzedda/' }]));
    if (u.includes('feedburner') || u.includes('archdaily')) return new Response(rss([{ t: 'Open call: competition for Tbilisi riverside park', l: 'https://www.archdaily.com/1/x' }, { t: 'Politecnica wins competition for cultural hub', l: 'https://www.archdaily.com/2/y' }, { t: 'A house in Chile', l: 'https://www.archdaily.com/3/z' }]));
    if (u.includes('riba.org')) return new Response('<html><body>' + 'x'.repeat(600) + '<a href="/explore/competitions/kingston-university-town-house">Kingston University Town House design competition</a><a href="/explore/competitions">Competitions</a></body></html>');
    if (u.includes('londonfestivalofarchitecture')) return new Response('<html>' + 'x'.repeat(600) + '<a href="/lfa-competition/shine-a-light-on-wilcox-road/">Shine a light on Wilcox Road</a><a href="/lfa-competition/open-call-2027-pavilions/">Open call: LFA 2027 pavilions</a></html>');
    if (u.includes('heritagenetwork')) return new Response('<html>' + 'x'.repeat(600) + '<div><a href="https://www.heritagenetwork.org.uk/opportunities/architect-for-spitalfields-chapel">Architect and design team for Spitalfields chapel</a><p>Deadline: 27/11/2099</p></div><div><a href="/opportunities/bookkeeper-john-rae-society">Bookkeeper (The John Rae Society)</a><p>06/11/2099</p></div></html>');
    if (u.includes('news.google.com')) return new Response(rss([{ t: 'Student competition opens for London bus shelter - AJ', l: 'https://news.google.com/a' }, { t: 'Haringey seeks architect for Wood Green framework - Architects Journal', l: 'https://news.google.com/b' }, { t: 'Contest launched for Manchester Craft and Design Centre pop-up - AJ', l: 'https://news.google.com/c' }]));
    return new Response('nope', { status: 404 });
  };
  return calls;
}
