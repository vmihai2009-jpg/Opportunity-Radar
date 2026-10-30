// Live check of every source, independent of the saved data.
// Run on the server with:  npm run check
// Prints one line per source and exits with code 1 if any source could not be read,
// so it can also be used by a monitoring system.

import { crawlOcds, FIND_A_TENDER, CONTRACTS_FINDER } from '../lib/sources/ocds.mjs';
import { crawlPress, PRESS_SOURCES } from '../lib/sources/press.mjs';

const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const sinceHours = Number(process.argv[2] || 48);

async function check(name, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    const sample = r.items.slice(0, 2).map((x) => `      · ${x.title.slice(0, 90)}  [${x.region}]`).join('\n');
    console.log(`OK    ${pad(name, 32)} ${pad(r.items.length + ' items', 10)} ${((Date.now() - t) / 1000).toFixed(1)}s  ${r.note || ''}${sample ? '\n' + sample : ''}`);
    return true;
  } catch (e) {
    console.log(`FAIL  ${pad(name, 32)} ${e.message}`);
    return false;
  }
}

console.log(`Checking all sources live (government notices from the last ${sinceHours} hours)...\n`);
const from = new Date(Date.now() - sinceHours * 3600000).toISOString();
const results = await Promise.all([
  check(FIND_A_TENDER.name, () => crawlOcds(FIND_A_TENDER, { from, walk: {} })),
  check(CONTRACTS_FINDER.name, () => crawlOcds(CONTRACTS_FINDER, { from })),
  ...PRESS_SOURCES.map((s) => check(s.name, () => crawlPress(s))),
]);
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} source(s) could not be read. See README "If a source fails".` : '\nAll sources read successfully.');
process.exit(failed ? 1 : 0);
