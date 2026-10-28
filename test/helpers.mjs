// Fake source responses and an in-memory store, used by the tests.
export const release = (id, { cpv = '71200000', region = 'UKI3', title = 'Architectural services for town hall refurbishment', tag = ['tender'], end = '2099-12-01T12:00:00Z', postcode = 'SE1 9GF' } = {}) => ({
  ocid: `ocds-h6vhtk-${id}`, id: `${id}-2026`, date: '2026-10-27T10:00:00Z', tag,
  parties: [{ name: 'London Borough of Example', roles: ['buyer'], address: { locality: 'London', postalCode: postcode } }],
  tender: { title, description: 'Multi-disciplinary design team led by an architect, RIBA stages 2-4.', status: 'active',
    classification: { scheme: 'CPV', id: cpv }, value: { amount: 450000, currency: 'GBP' }, tenderPeriod: { endDate: end },
    items: [{ deliveryAddresses: [{ region }] }] },
});

export function memoryStore() {
  const m = new Map();
  return {
    async get(k, o) { const v = m.get(k); return v === undefined ? null : o?.type === 'json' ? JSON.parse(v) : v; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
  };
}

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.t}</title><link>${i.l}</link><pubDate>Mon, 26 Oct 2026 09:00:00 GMT</pubDate><description><![CDATA[${i.d || ''}]]></description></item>`).join('')}</channel></rss>`;

export function stubFetch() {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('find-tender.service.gov.uk/api')) {
      if (!u.includes('cursor=')) return json({ releases: [release('000001'), release('000002', { cpv: '45000000' }), release('000003', { region: 'UKM', postcode: 'G1 1AA' })], links: { next: u + '&cursor=MTAw' } });
      return json({ releases: [release('000004', { region: 'UKJ2', title: 'Conservation architect for Grade II listed pavilion', postcode: 'GU1 1AA' }), release('000005', { cpv: '71300000', title: 'Planned feasibility study', tag: ['planning'], end: '' })] });
    }
    if (u.includes('contractsfinder')) return json({ releases: [release('cf1', { region: 'London', title: 'Small office retrofit architect' })] });
    if (u.includes('dezeen.com/feed')) return new Response(rss([{ t: 'Open call launched for London pavilion design competition', l: 'https://www.dezeen.com/2026/10/26/pavilion-competition/', d: 'Entries close on 30 November.' }, { t: 'Page\\Park completes school in Edinburgh', l: 'https://www.dezeen.com/2026/10/28/pagepark/' }]));
    if (u.includes('architectsjournal.co.uk/competitions')) return new Response('<a href="/news/architect-sought-for-camden-library-overhaul-contest">Architect sought for Camden library overhaul</a><a href="/news/x">Short</a>');
    if (u.includes('heritagenetwork')) return new Response('<a href="https://www.heritagenetwork.org.uk/opportunities/architect-for-spitalfields-chapel">Architect and design team for Spitalfields chapel</a>');
    if (u.includes('news.google.com')) return new Response(rss([{ t: 'Student competition opens for London bus shelter - AJ', l: 'https://news.google.com/a' }, { t: 'Haringey seeks architect for Wood Green framework - Architects Journal', l: 'https://news.google.com/b' }]));
    return new Response('nope', { status: 404 });
  };
}

