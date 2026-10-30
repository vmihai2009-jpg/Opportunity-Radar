// The crawl: reads every source, merges results into the saved list, remembers when each
// opportunity was first seen (for the Monday email) and records the health of every source.

import { crawlOcds, FIND_A_TENDER, CONTRACTS_FINDER } from './sources/ocds.mjs';
import { crawlPress, PRESS_SOURCES } from './sources/press.mjs';
import { SEEDS } from './seeds.mjs';

export const STATE_KEY = 'state';
const LOCK_KEY = 'crawl-lock';
const MAX_ITEMS = 2500;
const DAY = 86400000;

export const ALL_SOURCES = [FIND_A_TENDER, CONTRACTS_FINDER, ...PRESS_SOURCES].map((s) => ({ key: s.key, name: s.name, home: s.home }));

export function emptyState() {
  return { items: {}, sources: {}, cursors: {}, lastCrawl: null, crawlCount: 0 };
}

export async function loadState(store) {
  const s = await store.get(STATE_KEY, { type: 'json' });
  return s && s.items ? s : emptyState();
}

function upsert(state, item, now) {
  const prev = state.items[item.id];
  state.items[item.id] = {
    ...item,
    firstSeen: prev?.firstSeen || now,
    lastSeen: now,
  };
}

function prune(state, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  const cutoffPast = new Date(Date.parse(now) - 14 * DAY).toISOString().slice(0, 10);
  for (const [id, it] of Object.entries(state.items)) {
    const lastSeen = Date.parse(it.lastSeen || it.firstSeen || now);
    const published = Date.parse(it.published || it.firstSeen || now);
    const pastDeadline = it.date && it.date < cutoffPast;
    const stalePress = it.kind === 'press' && !it.date && Date.parse(now) - published > 45 * DAY;
    const pressDeadlinePassed = it.kind === 'press' && it.date && it.date < today && Date.parse(now) - published > 30 * DAY;
    const staleTender = it.kind === 'tender' && !it.date && Date.parse(now) - Math.max(lastSeen, published) > 150 * DAY;
    if (pastDeadline || stalePress || pressDeadlinePassed || staleTender) delete state.items[id];
  }
  const all = Object.values(state.items);
  if (all.length > MAX_ITEMS) {
    all.sort((a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''));
    for (const it of all.slice(MAX_ITEMS)) delete state.items[it.id];
  }
}

async function withLock(store, staleMs, fn) {
  const lock = await store.get(LOCK_KEY, { type: 'json' }).catch(() => null);
  if (lock && Date.now() - lock.at < staleMs) return { skipped: true, reason: 'A crawl is already running' };
  await store.setJSON(LOCK_KEY, { at: Date.now() });
  try {
    return await fn();
  } finally {
    await store.delete(LOCK_KEY).catch(() => {});
  }
}

// Runs every source in parallel. A source that fails keeps the opportunities it found before,
// and its error is recorded for the Sources panel and the health check.
export async function runCrawl(store, { reason = 'scheduled', backfillDays = 30 } = {}) {
  return withLock(store, 45 * 60000, async () => {
    const started = Date.now();
    const now = new Date().toISOString();
    const state = await loadState(store);
    await store.setJSON('crawl-progress', { startedAt: now, reason });

    const seedCutoff = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
    for (const seed of SEEDS) {
      if (seed.date && seed.date < seedCutoff) continue;
      if (!state.items[seed.id]) state.items[seed.id] = { ...seed, kind: 'curated', firstSeen: seed.published ? `${seed.published}T08:00:00.000Z` : now, lastSeen: now };
    }

    const jobs = [
      ...[FIND_A_TENDER, CONTRACTS_FINDER].map((src) => ({
        src,
        run: async () => {
          const res = await crawlOcds(src, state.cursors[src.key], { backfillDays });
          state.cursors[src.key] = res.state;
          return res;
        },
      })),
      ...PRESS_SOURCES.map((src) => ({ src, run: () => crawlPress(src, new Date()) })),
    ];

    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    const finished = new Date().toISOString();
    // The same article often appears through several sources (e.g. AJ and the news searches):
    // keep the first copy only.
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 70);
    const pressTitles = new Map(Object.values(state.items).filter((x) => x.kind === 'press').map((x) => [norm(x.title), x.id]));
    results.forEach((r, i) => {
      const { src } = jobs[i];
      if (r.status === 'fulfilled') {
        r.value.items = r.value.items.filter((it) => {
          if (it.kind !== 'press') return true;
          const owner = pressTitles.get(norm(it.title));
          if (owner && owner !== it.id) return false;
          pressTitles.set(norm(it.title), it.id);
          return true;
        });
      }
      const prev = state.sources[src.key] || {};
      if (r.status === 'fulfilled') {
        let added = 0;
        for (const it of r.value.items) {
          if (!state.items[it.id]) added++;
          upsert(state, it, finished);
        }
        for (const id of r.value.closeIds || []) delete state.items[id];
        const listed = Object.values(state.items).filter((x) => x.source === src.name).length;
        state.sources[src.key] = { name: src.name, home: src.home, ok: true, found: r.value.items.length, added, listed, note: r.value.note || '', checkedAt: finished, lastOk: finished };
      } else {
        const listed = Object.values(state.items).filter((x) => x.source === src.name).length;
        state.sources[src.key] = { name: src.name, home: src.home, ok: false, found: 0, added: 0, listed, error: String(r.reason?.message || r.reason).slice(0, 300), checkedAt: finished, lastOk: prev.lastOk || null };
      }
    });

    prune(state, finished);
    state.lastCrawl = finished;
    state.lastCrawlReason = reason;
    state.lastCrawlMs = Date.now() - started;
    state.crawlCount = (state.crawlCount || 0) + 1;
    await store.setJSON(STATE_KEY, state);
    await store.delete('crawl-progress').catch(() => {});
    return { ok: true, items: Object.keys(state.items).length, ms: state.lastCrawlMs, sources: state.sources };
  });
}

export function crawlStatus(state, running) {
  return { running: Boolean(running), lastCrawlMs: state.lastCrawlMs || null, crawlCount: state.crawlCount || 0 };
}

// What the web page receives.
export function publicView(state) {
  return {
    lastCrawl: state.lastCrawl,
    lastCrawlReason: state.lastCrawlReason || null,
    nextCrawlBy: state.lastCrawl ? new Date(Date.parse(state.lastCrawl) + 30 * 60000).toISOString() : null,
    sources: ALL_SOURCES.map((s) => ({ key: s.key, home: s.home, ...(state.sources[s.key] || { name: s.name, ok: null }) })),
    items: Object.values(state.items),
  };
}
