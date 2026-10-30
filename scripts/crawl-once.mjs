// Runs one full crawl into the data folder and prints a summary:  npm run crawl
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env.mjs';
import { fileStore } from '../lib/file-store.mjs';
import { runCrawl } from '../lib/crawler.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(ROOT, '.env'));
const store = fileStore(path.join(path.resolve(ROOT, process.env.DATA_DIR || 'data'), 'radar'));
const r = await runCrawl(store, { reason: 'command line' });
if (r.skipped) { console.log(r.reason); process.exit(0); }
for (const s of Object.values(r.sources)) console.log(`${s.ok ? 'OK  ' : 'FAIL'}  ${s.name.padEnd(32)} ${s.ok ? `${s.found} found, ${s.added} new - ${s.note}` : s.error}`);
console.log(`\n${r.items} opportunities saved in ${Math.round(r.ms / 1000)}s`);
