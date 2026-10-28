// Runs the crawl automatically every 30 minutes (Netlify scheduled function, UTC cron).
import { getStore } from '@netlify/blobs';
import { runCrawl } from '../../lib/crawler.mjs';

export default async () => {
  const result = await runCrawl(getStore({ name: 'radar', consistency: 'strong' }), { budgetMs: 23000, reason: 'scheduled' });
  console.log('Scheduled crawl', JSON.stringify({ ok: result.ok, skipped: result.skipped, items: result.items, ms: result.ms }));
};

export const config = {
  schedule: '*/30 * * * *', // on the hour and half past, every day
};
