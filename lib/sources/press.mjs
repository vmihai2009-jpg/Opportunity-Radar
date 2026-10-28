// Architectural press and competition listings: AJ, Dezeen, RIBA, LFA, Heritage Network
// and the focused Google News searches from the original radar.
// Each is read as RSS or plain HTML and filtered with keyword rules (no AI).

import { fetchText, parseFeed, extractLinks, clip, safeDate, hashId } from '../util.mjs';
import { regionFromText, groupFor, fitFor, tagsFor, deadlineFromText, isStudent } from '../classify.mjs';

const OPPORTUNITY_RE = /\b(competition|contest|open call|call for (architects|designers|entries|ideas)|shortlist(ed)?|seeks?|sought|invites?|appoint(ment)?|tender|framework|brief|expressions? of interest|commission|procurement|lead designer|design team|longlist)\b/i;
const NOT_OPPORTUNITY_RE = /\b(obituary|podcast|review:|book review|interview|opinion|wins? (planning|approval)|completed|unveils? (design|plans) for (house|home)|award(s)? (winners?|ceremony))\b/i;

const googleNews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=en-GB&gl=GB&ceid=GB:en`;

function toItem(entry, src, refDate) {
  const text = `${entry.title} ${entry.description}`;
  if (isStudent(text)) return null;
  if (src.requireOpportunity !== false && (!OPPORTUNITY_RE.test(text) || NOT_OPPORTUNITY_RE.test(entry.title))) return null;
  const region = regionFromText(text) || src.defaultRegion || 'UK & international';
  const title = entry.title.replace(/\s+-\s+[^-]{2,40}$/, src.stripPublisherSuffix ? '' : '$&').trim();
  return {
    id: `${src.key}-${hashId(entry.url.replace(/[?#].*$/, '') || title)}`,
    kind: 'press',
    title,
    group: src.group || groupFor(text),
    region,
    place: region,
    buyer: entry.source || src.name,
    brief: clip(entry.description || title, 360),
    stage: src.stage || 'Competition / press lead',
    date: deadlineFromText(text, refDate),
    time: '',
    published: safeDate(entry.published),
    amount: '',
    valueType: '',
    fit: fitFor({ text, kind: 'press' }),
    tags: tagsFor(text),
    source: src.name,
    ref: '',
    url: entry.url,
    needsCheck: true,
  };
}

async function readRss(src, refDate) {
  const items = [];
  const errors = [];
  for (const url of src.feeds) {
    try {
      const xml = await fetchText(url, { timeoutMs: 10000, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      for (const e of parseFeed(xml)) {
        if (src.match && !src.match.test(`${e.title} ${e.description} ${e.categories.join(' ')}`)) continue;
        const it = toItem(e, src, refDate);
        if (it) items.push(it);
      }
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (errors.length === src.feeds.length) throw new Error(errors[0]);
  return items;
}

async function readPage(src, refDate) {
  const html = await fetchText(src.page, { timeoutMs: 10000 });
  const seen = new Set();
  const items = [];
  for (const l of extractLinks(html, src.page)) {
    if (!src.linkPattern.test(l.url) || l.text.length < 18 || seen.has(l.url)) continue;
    seen.add(l.url);
    const it = toItem({ title: l.text, url: l.url, description: '', published: '', source: src.name }, src, refDate);
    if (it) items.push(it);
  }
  return items.slice(0, 40);
}

export const PRESS_SOURCES = [
  {
    key: 'aj',
    name: 'AJ Competitions',
    home: 'https://www.architectsjournal.co.uk/competitions',
    // AJ's own competitions page, with a Google News fallback limited to architectsjournal.co.uk
    page: 'https://www.architectsjournal.co.uk/competitions',
    linkPattern: /architectsjournal\.co\.uk\/(news|competitions)\/[a-z0-9-]{12,}/i,
    feeds: [googleNews('site:architectsjournal.co.uk (competition OR contest OR "architect sought" OR "seeks architect" OR shortlist OR "design team")')],
    stripPublisherSuffix: true,
    group: '',
    stage: 'Competition (AJ)',
  },
  {
    key: 'dezeen',
    name: 'Dezeen',
    home: 'https://www.dezeen.com/architecture/',
    feeds: ['https://www.dezeen.com/feed/', googleNews('site:dezeen.com (competition OR "open call" OR contest OR "call for entries") architecture')],
    stripPublisherSuffix: true,
    stage: 'Competition / open call (Dezeen)',
  },
  {
    key: 'riba',
    name: 'RIBA Competitions',
    home: 'https://www.architecture.com/awards-and-competitions-landing-page/competitions-landing-page',
    feeds: [googleNews('RIBA Competitions (design competition OR "expressions of interest" OR "architect-led") UK')],
    stripPublisherSuffix: true,
    group: 'Competition',
    stage: 'RIBA-run competition',
  },
  {
    key: 'lfa',
    name: 'London Festival of Architecture',
    home: 'https://www.londonfestivalofarchitecture.org/',
    feeds: [googleNews('"London Festival of Architecture" competition')],
    stripPublisherSuffix: true,
    defaultRegion: 'London',
    group: 'Competition',
  },
  {
    key: 'heritage',
    name: 'Heritage Network',
    home: 'https://www.heritagenetwork.org.uk/opportunities',
    page: 'https://www.heritagenetwork.org.uk/opportunities',
    linkPattern: /heritagenetwork\.org\.uk\/opportunities\/[a-z0-9-]{6,}/i,
    feeds: [],
    requireOpportunity: false,
    group: 'Heritage',
    stage: 'Heritage brief',
  },
  {
    key: 'news',
    name: 'Google News procurement searches',
    home: 'https://news.google.com/',
    feeds: [
      'architectural services tender London workplace office retrofit public sector',
      'architect appointment heritage conservation refurbishment London South East procurement',
      'architectural framework design consultancy Kent Surrey Sussex Hampshire Oxfordshire Berkshire',
      'architecture competition professional practices London South East England',
      'architect lead designer pre market engagement London local authority',
    ].map(googleNews),
    stripPublisherSuffix: true,
    stage: 'News lead - verify',
  },
];

export async function crawlPress(src, refDate = new Date()) {
  const results = await Promise.allSettled([
    src.page ? readPage(src, refDate) : Promise.resolve([]),
    src.feeds.length ? readRss(src, refDate) : Promise.resolve([]),
  ]);
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.filter((r, i) => r.status === 'rejected' && (i === 0 ? src.page : src.feeds.length));
  if (!items.length && failed.length) throw new Error(failed[0].reason?.message || 'unavailable');
  const unique = [];
  const titles = new Set();
  for (const it of items) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
    if (titles.has(k)) continue;
    titles.add(k);
    unique.push(it);
  }
  return { items: unique, note: failed.length ? `partial: ${failed[0].reason?.message}` : '' };
}
