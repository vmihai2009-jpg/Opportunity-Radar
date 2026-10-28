// Offline tests: fake versions of each source are served through a stubbed fetch,
// so the crawl, filters, merging and newsletter content can be checked without the internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCrawl, loadState, publicView } from '../lib/crawler.mjs';
import { weeklyItems, digestEmail } from '../lib/newsletter.mjs';
import { deadlineFromText, regionFromCodes, groupFor, fitFor } from '../lib/classify.mjs';

import { release, memoryStore, stubFetch } from './helpers.mjs';

test('classification rules', () => {
  assert.equal(regionFromCodes(['UKI32']), 'London');
  assert.equal(regionFromCodes(['TLJ1']), 'South East');
  assert.equal(groupFor('Conservation architect for listed pavilion'), 'Heritage');
  assert.equal(fitFor({ text: 'architect refurbishment', cpvs: ['71221000'] }), 'High');
  assert.equal(fitFor({ text: 'asbestos survey', cpvs: ['71315000'] }), 'Adjacent');
  assert.equal(deadlineFromText('Entries close on 30 November.', new Date('2026-10-28')), '2026-11-30');
  assert.equal(deadlineFromText('Deadline: 15 January', new Date('2026-10-28')), '2027-01-15');
});

test('full crawl merges all sources with the right filters', async () => {
  stubFetch();
  const store = memoryStore();
  const r = await runCrawl(store, { budgetMs: 5000 });
  assert.ok(r.ok);
  const state = await loadState(store);
  const ids = Object.keys(state.items);
  assert.ok(ids.includes('fts-ocds-h6vhtk-000001'), 'CPV 712 London notice kept');
  assert.ok(!ids.includes('fts-ocds-h6vhtk-000002'), 'non-CPV-71 notice dropped');
  assert.ok(!ids.includes('fts-ocds-h6vhtk-000003'), 'Scottish notice dropped');
  assert.equal(state.items['fts-ocds-h6vhtk-000004'].region, 'South East');
  assert.equal(state.items['fts-ocds-h6vhtk-000004'].group, 'Heritage');
  assert.equal(state.items['fts-ocds-h6vhtk-000005'].stage, 'Pipeline / pre-market');
  assert.equal(state.items['fts-ocds-h6vhtk-000001'].url, 'https://www.find-tender.service.gov.uk/Notice/000001-2026');
  assert.equal(state.items['fts-ocds-h6vhtk-000001'].amount, '£450k');
  assert.ok(ids.some((i) => i.startsWith('cf-')), 'Contracts Finder item present');
  const titles = Object.values(state.items).map((x) => x.title);
  assert.ok(titles.includes('Open call launched for London pavilion design competition'));
  assert.ok(!titles.some((t) => /Page\\Park completes/.test(t)), 'non-opportunity Dezeen article dropped');
  assert.ok(!titles.some((t) => /Student/.test(t)), 'student competition dropped');
  assert.ok(titles.includes('Architect sought for Camden library overhaul'));
  assert.ok(titles.includes('Haringey seeks architect for Wood Green framework'), 'publisher suffix stripped');
  const dz = Object.values(state.items).find((x) => x.source === 'Dezeen');
  assert.equal(dz.date, '2026-11-30');
  const view = publicView(state);
  assert.ok(view.sources.every((s) => s.ok === true), JSON.stringify(view.sources.filter((s) => !s.ok)));
  assert.ok(state.cursors.fts.from && !state.cursors.fts.cursor, 'checkpoint advanced after finishing pages');
});

test('first-seen dates survive later crawls and award notices remove items', async () => {
  stubFetch();
  const store = memoryStore();
  await runCrawl(store, { budgetMs: 5000 });
  const first = (await loadState(store)).items['fts-ocds-h6vhtk-000001'].firstSeen;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('find-tender') ? new Response(JSON.stringify({ releases: [release('000001', { tag: ['award'] })] })) : realFetch(url);
  await new Promise((r) => setTimeout(r, 5));
  await runCrawl(store, { budgetMs: 5000 });
  const s = await loadState(store);
  assert.ok(!s.items['fts-ocds-h6vhtk-000001'], 'awarded notice removed');
  assert.equal(s.items['fts-ocds-h6vhtk-000004'].firstSeen, (await loadState(store)).items['fts-ocds-h6vhtk-000004'].firstSeen);
  assert.ok(first);
});

test('Monday email lists only new London opportunities', async () => {
  stubFetch();
  const store = memoryStore();
  await runCrawl(store, { budgetMs: 5000 });
  const state = await loadState(store);
  const items = weeklyItems(state);
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.region === 'London'));
  assert.equal(items[0].group, 'Competition', 'competitions listed first');
  const mail = digestEmail(items, { siteUrl: 'https://radar.example', unsubscribeUrl: 'https://radar.example/u' });
  assert.match(mail.subject, /new London opportunit/);
  assert.match(mail.html, /Unsubscribe/);
  assert.ok(!mail.html.includes('<script'));
});
