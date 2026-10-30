// Offline tests: fake versions of each source are served through a stubbed fetch,
// so the crawl, filters, merging and newsletter content can be checked without the internet.
process.env.RADAR_PAUSE_MS = '0';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCrawl, loadState, publicView } from '../lib/crawler.mjs';
import { weeklyItems, digestEmail } from '../lib/newsletter.mjs';
import { digestDue } from '../lib/newsletter-service.mjs';
import { deadlineFromText, regionFromCodes, groupFor, fitFor, regionForPress } from '../lib/classify.mjs';
import { fileStore } from '../lib/file-store.mjs';
import { memoryStore, stubFetch } from './helpers.mjs';

const YEAR = new Date().getUTCFullYear();
const byTitle = (state, t) => Object.values(state.items).find((x) => x.title === t);

test('classification rules', () => {
  assert.equal(regionFromCodes(['UKI32']), 'London');
  assert.equal(regionFromCodes(['TLJ1']), 'South East');
  assert.equal(groupFor('Conservation architect for listed pavilion'), 'Heritage');
  assert.equal(fitFor({ text: 'architect refurbishment', cpvs: ['71221000'] }), 'High');
  assert.equal(fitFor({ text: 'asbestos survey', cpvs: ['71315000'] }), 'Adjacent');
  assert.equal(deadlineFromText('Entries close on 30 November.', new Date('2026-10-28')), '2026-11-30');
  assert.equal(deadlineFromText('Deadline: 15 January', new Date('2026-10-28')), '2027-01-15');
  assert.equal(regionForPress('Contest launched for Manchester pop-up'), 'UK elsewhere');
  assert.equal(regionForPress('Ideas competition in Portugal'), 'International');
  assert.equal(regionForPress('Camden library overhaul'), 'London');
});

test('full crawl: every source read, filters applied, nothing missed', async () => {
  stubFetch();
  const store = memoryStore();
  const r = await runCrawl(store);
  assert.ok(r.ok);
  const state = await loadState(store);
  const ids = Object.keys(state.items);
  const view = publicView(state);
  assert.deepEqual(view.sources.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`), [], 'every source OK');

  // Find a Tender
  assert.ok(ids.includes('fts-ocds-h6vhtk-000001'), 'CPV 712 London notice kept');
  assert.ok(!ids.includes('fts-ocds-h6vhtk-000002'), 'non-CPV-71 notice dropped');
  assert.ok(!ids.includes('fts-ocds-h6vhtk-000003'), 'Scottish notice dropped');
  assert.equal(state.items['fts-ocds-h6vhtk-000004'].region, 'South East', 'CPV inside items[] is found');
  assert.equal(state.items['fts-ocds-h6vhtk-000004'].group, 'Heritage');
  assert.equal(state.items['fts-ocds-h6vhtk-000005'].stage, 'Pipeline / pre-market');
  assert.ok(ids.includes('fts-ocds-h6vhtk-000007'), 'notice hidden in a busy hour found by splitting the window');
  assert.ok(ids.includes('fts-ocds-h6vhtk-000260'), 'notice found by walking notice numbers');
  assert.equal(state.items['fts-ocds-h6vhtk-000001'].url, `https://www.find-tender.service.gov.uk/Notice/000001-${YEAR}`);
  assert.equal(state.items['fts-ocds-h6vhtk-000001'].amount, '£450k');
  assert.equal(state.items['fts-ocds-h6vhtk-000001'].place, 'London, SE1 9GF');
  assert.equal(state.cursors.fts.walk.lastId, 260);

  // Contracts Finder
  assert.ok(ids.some((i) => i.startsWith('cf-') && state.items[i].title === 'Small office retrofit architect'));
  assert.ok(!Object.values(state.items).some((x) => x.title === 'Overseas mail'));

  // Press
  const titles = Object.values(state.items).map((x) => x.title);
  assert.equal(byTitle(state, 'Open call launched for London pavilion design competition').date, '2026-11-30');
  assert.ok(!titles.some((t) => /Page\\Park completes/.test(t)), 'non-opportunity Dezeen article dropped');
  assert.ok(!titles.some((t) => /Student/.test(t)), 'student competition dropped');
  assert.equal(byTitle(state, 'Haringey seeks architect for Wood Green framework').region, 'London', 'publisher suffix stripped');
  assert.equal(byTitle(state, 'Contest launched for Manchester Craft and Design Centre pop-up').region, 'UK elsewhere');
  assert.equal(byTitle(state, 'DIGITAL NOMAD VILLAGE').region, 'International');
  assert.ok(!titles.includes('Results: Sa Pizzedda'), 'competition results dropped');
  assert.ok(titles.includes('Open call: competition for Tbilisi riverside park'));
  assert.ok(!titles.includes('Politecnica wins competition for cultural hub'), 'winner announcements dropped');
  assert.ok(titles.includes('Kingston University Town House design competition'), 'RIBA page parsed');
  assert.ok(titles.includes('Open call: LFA 2027 pavilions') && !titles.includes('Shine a light on Wilcox Road'), 'LFA: open calls only');
  const hn = byTitle(state, 'Architect and design team for Spitalfields chapel');
  assert.equal(hn.date, '2099-11-27', 'Heritage Network deadline read');
  assert.ok(!titles.some((t) => /Bookkeeper/.test(t)), 'non-design heritage roles dropped');
  assert.ok(view.items.some((x) => x.region === 'International'), 'International category has items');
});

test('a blocked channel falls back to the other channel; a dead source keeps its old items', async () => {
  stubFetch();
  const store = memoryStore();
  await runCrawl(store);
  const before = (await loadState(store)).sources.dezeen.listed;
  stubFetch({ fail: ['dezeen.com/feed'] });
  await runCrawl(store);
  let s = await loadState(store);
  assert.equal(s.sources.dezeen.ok, true, 'Google News channel still works');
  stubFetch({ fail: ['heritagenetwork'] });
  await runCrawl(store);
  s = await loadState(store);
  assert.equal(s.sources.heritage.ok, false);
  assert.match(s.sources.heritage.error, /403/);
  assert.ok(byTitle(s, 'Architect and design team for Spitalfields chapel'), 'items kept while source is down');
  assert.ok(before >= 1);
});

test('later crawls only read new notices and keep first-seen dates', async () => {
  const calls = stubFetch();
  const store = memoryStore();
  await runCrawl(store);
  const first = (await loadState(store)).items['fts-ocds-h6vhtk-000001'].firstSeen;
  calls.length = 0;
  await new Promise((r) => setTimeout(r, 5));
  await runCrawl(store);
  const s = await loadState(store);
  assert.equal(s.items['fts-ocds-h6vhtk-000001'].firstSeen, first);
  assert.ok(calls.filter((u) => u.includes('find-tender')).length < 40, 'incremental run is small');
});

test('file store survives a round trip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'radar-'));
  const store = fileStore(dir);
  stubFetch();
  await runCrawl(store);
  const s = await loadState(store);
  assert.ok(Object.keys(s.items).length > 10);
  await rm(dir, { recursive: true });
});

test('Monday email lists only new London opportunities, once per Monday', async () => {
  stubFetch();
  const store = memoryStore();
  await runCrawl(store);
  const items = weeklyItems(await loadState(store));
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.region === 'London'));
  assert.equal(items[0].group, 'Competition', 'competitions listed first');
  const mail = digestEmail(items, { siteUrl: 'https://radar.example', unsubscribeUrl: 'https://radar.example/u' });
  assert.match(mail.subject, /new London opportunit/);
  assert.match(mail.html, /Unsubscribe/);
  const monday8am = new Date('2026-11-02T08:00:00Z');
  assert.equal(await digestDue(store, monday8am), true);
  await store.setJSON('digest-meta', { lastSentDate: '2026-11-02' });
  assert.equal(await digestDue(store, monday8am), false);
  assert.equal(await digestDue(store, new Date('2026-11-03T08:00:00Z')), false, 'not on Tuesday');
});
