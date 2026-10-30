// Architectural press and competition listings, read as RSS feeds or plain web pages and
// filtered with keyword rules (no AI). Each source can have several "channels" (e.g. the
// site's own feed plus a Google News search limited to that site): a source only counts as
// failed when every one of its channels fails.
//
// Checked by hand on 30 Oct 2026:
//  - Dezeen /feed/, competitions.archi/feed/, ArchDaily (Feedburner) and Heritage Network work.
//  - AJ's own /competitions page is a 2014 archive and its feeds block crawlers, so AJ is read
//    through Google News limited to architectsjournal.co.uk.
//  - RIBA competitions moved to riba.org/explore/competitions.
//  - LFA's /competitions/ page lists past projects; only items that read as open calls are kept.

import { fetchText, parseFeed, extractLinks, clip, safeDate, hashId, stripTags } from '../util.mjs';
import { regionForPress, groupFor, fitFor, tagsFor, deadlineFromText, isStudent } from '../classify.mjs';

const OPPORTUNITY_RE = /\b(competition|contest|open call|call for (architects|designers|entries|ideas|proposals)|ideas call|design challenge|seeks? (an )?architects?|architects? sought|sought|invites?|expressions? of interest|tender|framework|brief|commission|procurement|lead designer|design team|now open|launch(es|ed)?|deadline|register)\b/i;
// Results, winners and general news are not opportunities.
const NOT_OPPORTUNITY_RE = /\b(results?:|winners?|wins|won|winning|shortlist(ed)?|selected|picked|scoops|unveils?|revealed?|completes?|completed|opens? to (the )?public|obituary|podcast|interview|opinion|review|book|exhibition review)\b/i;

const googleNews = (q, days = 21) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${days}d`)}&hl=en-GB&gl=GB&ceid=GB:en`;

function toItem(entry, src, refDate) {
  const title = (src.stripPublisherSuffix ? entry.title.replace(/\s+[-|–]\s+[^-|–]{2,60}$/, '') : entry.title).trim();
  const text = `${title} ${entry.description || ''}`;
  if (!title || isStudent(text)) return null;
  if (src.filter !== false) {
    if (!OPPORTUNITY_RE.test(text)) return null;
    if (NOT_OPPORTUNITY_RE.test(title)) return null;
  }
  if (src.include && !src.include.test(text)) return null;
  if (src.exclude && src.exclude.test(title)) return null;
  const region = src.region || (src.defaultRegion && regionForPress(text) === 'International' ? src.defaultRegion : regionForPress(text));
  return {
    id: `${src.key}-${hashId(entry.url.replace(/[?#].*$/, '') || title)}`,
    kind: 'press',
    title,
    group: src.group || groupFor(text),
    region,
    place: entry.place || region,
    buyer: entry.source || src.name,
    brief: clip(entry.description && entry.description !== title ? entry.description : title, 360),
    stage: src.stage || 'Competition / press lead',
    date: entry.deadline || deadlineFromText(text, refDate),
    time: '',
    published: safeDate(entry.published),
    amount: '',
    valueType: '',
    fit: fitFor({ text, kind: 'press' }),
    tags: tagsFor(text),
    source: src.name,
    ref: '',
    url: entry.url,
  };
}

// Drop items older than maxAgeDays (feeds and news searches can return old articles).
const recent = (entry, days) => !entry.published || Date.now() - Date.parse(entry.published) < days * 86400000;

async function readFeed(url, src, refDate) {
  const xml = await fetchText(url, { timeoutMs: 20000, retries: 2, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error(`not a feed (${new URL(url).hostname} returned a web page)`);
  const opts = url.includes('news.google.com') ? { ...src, stripPublisherSuffix: true } : src;
  return parseFeed(xml).filter((e) => recent(e, src.maxAgeDays || 45)).map((e) => toItem(e, opts, refDate)).filter(Boolean);
}

async function readPage(url, src, refDate) {
  const html = await fetchText(url, { timeoutMs: 20000, retries: 2 });
  if (html.length < 500) throw new Error(`empty page from ${new URL(url).hostname}`);
  const entries = src.parsePage ? src.parsePage(html, url) : extractLinks(html, url).filter((l) => src.linkPattern.test(l.url) && l.text.length >= 12).map((l) => ({ title: l.text, url: l.url }));
  const seen = new Set();
  return entries
    .filter((e) => !seen.has(e.url) && seen.add(e.url))
    .map((e) => toItem({ description: '', published: '', source: src.name, ...e }, src, refDate))
    .filter(Boolean)
    .slice(0, 60);
}

// Heritage Network lists each opportunity as a link followed by its deadline (dd/mm/yyyy).
function parseHeritageNetwork(html, base) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']*\/opportunities\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(re)];
  matches.forEach((m, i) => {
    const title = stripTags(m[2]);
    if (title.length < 6) return;
    const following = stripTags(html.slice(m.index, matches[i + 1]?.index ?? m.index + 3000)).slice(0, 600);
    const d = following.match(/(\d{1,2})\/(\d{1,2})\/(20\d\d)/);
    const deadline = d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : '';
    let url;
    try { url = new URL(m[1], base).href; } catch { return; }
    out.push({ title, url, description: following.replace(title, '').trim().slice(0, 300), deadline });
  });
  return out;
}

export const PRESS_SOURCES = [
  {
    key: 'aj',
    name: 'AJ Competitions',
    home: 'https://www.architectsjournal.co.uk/news/competitions',
    channels: [
      { feed: googleNews('site:architectsjournal.co.uk (competition OR contest OR "architect sought" OR "seeks architect" OR "design team" OR "open call")') },
      { feed: googleNews('"Architects\' Journal" (competition OR "architect sought" OR "seeks architect")') },
    ],
    stripPublisherSuffix: true,
    stage: 'Competition (AJ)',
  },
  {
    key: 'dezeen',
    name: 'Dezeen',
    home: 'https://www.dezeen.com/competitions/',
    channels: [
      { feed: 'https://www.dezeen.com/feed/' },
      { feed: googleNews('site:dezeen.com (competition OR "open call" OR contest OR "call for entries")') },
    ],
    stripPublisherSuffix: true,
    stage: 'Competition / open call (Dezeen)',
  },
  {
    key: 'carchi',
    name: 'Competitions.archi',
    home: 'https://competitions.archi/',
    channels: [{ feed: 'https://competitions.archi/feed/' }],
    filter: false, // everything on this site is a competition; results are dropped below
    exclude: /^results?\b|\bwinners?\b|\bresults? (announced|of)\b/i,
    group: 'Competition',
    stage: 'Open competition',
    maxAgeDays: 60,
  },
  {
    key: 'archdaily',
    name: 'ArchDaily',
    home: 'https://www.archdaily.com/',
    channels: [{ feed: 'https://feeds.feedburner.com/Archdaily' }, { feed: 'https://www.archdaily.com/feed' }],
    include: /\b(competition|contest|open call|call for)\b/i,
    stage: 'Competition news (ArchDaily)',
  },
  {
    key: 'riba',
    name: 'RIBA Competitions',
    home: 'https://www.riba.org/explore/competitions',
    channels: [
      { page: 'https://www.riba.org/explore/competitions', linkPattern: /riba\.org\/.*competition.*\/[a-z0-9-]{6,}/i },
      { feed: googleNews('"RIBA Competitions" OR ("RIBA" "design competition")') },
    ],
    filter: false,
    exclude: /^(competitions?|explore|view all|find out more|read more)$/i,
    group: 'Competition',
    defaultRegion: 'UK elsewhere',
    stage: 'RIBA-run competition',
  },
  {
    key: 'lfa',
    name: 'London Festival of Architecture',
    home: 'https://www.londonfestivalofarchitecture.org/competitions/',
    channels: [
      { page: 'https://www.londonfestivalofarchitecture.org/competitions/', linkPattern: /londonfestivalofarchitecture\.org\/[a-z0-9-]*competition[a-z0-9-]*\/[a-z0-9-]{4,}/i },
      { feed: googleNews('"London Festival of Architecture" (competition OR "open call")', 45) },
    ],
    include: /\b(open call|call for|now open|launch(es|ed)?|deadline|enter|submissions?)\b/i,
    region: 'London',
    group: 'Competition',
  },
  {
    key: 'heritage',
    name: 'Heritage Network',
    home: 'https://www.heritagenetwork.org.uk/opportunities',
    channels: [{ page: 'https://www.heritagenetwork.org.uk/opportunities', parsePage: parseHeritageNetwork }],
    filter: false,
    // Only professional design/technical briefs - not trustee, staff or volunteer roles.
    include: /\b(architect|design|conservation|survey|surveyor|ITT|tender|invitation to tender|feasibility|masterplan|project services|building|restoration|repair|consultant|condition)\b/i,
    exclude: /\b(trustee|bookkeeper|volunteer|officer|coordinator|co-ordinator|assistant|chair|director|marketing|fundrais|evaluation)\b/i,
    group: 'Heritage',
    defaultRegion: 'UK elsewhere',
    stage: 'Heritage brief',
  },
  {
    key: 'news',
    name: 'News procurement searches',
    home: 'https://news.google.com/',
    channels: [
      'architectural services tender London',
      'architect appointment heritage conservation London OR Kent OR Surrey OR Sussex',
      'architecture competition London open call',
      '"lead designer" OR "design team" tender council London',
      'international architecture competition open call',
    ].map((q) => ({ feed: googleNews(q) })),
    stripPublisherSuffix: true,
    stage: 'News lead - verify',
  },
];

export async function crawlPress(src, refDate = new Date()) {
  const results = await Promise.allSettled(src.channels.map((c) => (c.feed ? readFeed(c.feed, src, refDate) : readPage(c.page, { ...src, linkPattern: c.linkPattern, parsePage: c.parsePage }, refDate))));
  const failures = results.map((r, i) => (r.status === 'rejected' ? `${src.channels[i].feed ? 'feed' : 'page'} ${i + 1}: ${r.reason?.message || r.reason}` : null)).filter(Boolean);
  if (failures.length === results.length) throw new Error(failures.join('; '));
  const unique = [];
  const titles = new Set();
  for (const it of results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))) {
    const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
    if (titles.has(k)) continue;
    titles.add(k);
    unique.push(it);
  }
  const ok = results.length - failures.length;
  return { items: unique, note: failures.length ? `${ok} of ${results.length} channels read (${failures.join('; ')})` : `${ok} channel${ok > 1 ? 's' : ''} read` };
}
