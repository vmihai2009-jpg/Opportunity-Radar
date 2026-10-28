// Copies the curated starting list into public/seeds.json so the page still shows
// something useful if it is opened without the live data service (e.g. straight from disk).
import { writeFileSync } from 'node:fs';
import { SEEDS } from '../lib/seeds.mjs';
writeFileSync(new URL('../public/seeds.json', import.meta.url), JSON.stringify(SEEDS.map((s) => ({ ...s, kind: 'curated' }))));
console.log(`Wrote ${SEEDS.length} curated entries to public/seeds.json`);
