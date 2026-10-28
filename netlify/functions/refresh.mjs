// "Refresh now" button: runs a crawl straight away, at most once every 2 minutes.
import { getStore } from '@netlify/blobs';
import { loadState, publicView, runCrawl } from '../../lib/crawler.mjs';

const MIN_GAP_MS = 2 * 60 * 1000;

export default async () => {
  const store = getStore({ name: 'radar', consistency: 'strong' });
  const before = await loadState(store);
  if (before.lastCrawl && Date.now() - Date.parse(before.lastCrawl) < MIN_GAP_MS) {
    return Response.json({ ...publicView(before), refreshed: false, message: 'Sources were checked less than 2 minutes ago, so this is already the latest.' });
  }
  const result = await runCrawl(store, { budgetMs: 40000, reason: 'manual' });
  const after = await loadState(store);
  return Response.json({
    ...publicView(after),
    refreshed: !result.skipped,
    message: result.skipped ? 'A check is already running; showing the latest results.' : 'All sources checked just now.',
  });
};

export const config = { path: '/api/refresh', method: 'POST' };
