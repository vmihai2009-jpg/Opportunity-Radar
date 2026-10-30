// BG Opportunity Radar - self-contained web server.
// One Node.js process does everything: serves the page, runs the crawl every 30 minutes,
// answers the Refresh button, handles newsletter sign-ups and sends the Monday email.
// Data is kept as JSON files in DATA_DIR (default ./data). No database needed.
//
//   npm start            run the server
//   npm run check        test every source live and print a report
//   npm run crawl        run one crawl now and exit

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.mjs';
import { fileStore } from './lib/file-store.mjs';
import { runCrawl, loadState, publicView, crawlStatus } from './lib/crawler.mjs';
import { subscribe, confirm, unsubscribe, sendWeeklyDigest, digestDue } from './lib/newsletter-service.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const INTERVAL_MIN = Math.max(5, Number(process.env.CRAWL_INTERVAL_MINUTES || 30));
const REFRESH_GAP_MS = 2 * 60 * 1000;
const PUBLIC_DIR = path.join(ROOT, 'public');

const radarStore = fileStore(path.join(DATA_DIR, 'radar'));
const subscriberStore = fileStore(path.join(DATA_DIR, 'subscribers'));

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- crawling ---------------------------------------------------------------------------
let running = null;
function startCrawl(reason) {
  if (running) return running;
  log(`Crawl started (${reason})`);
  running = runCrawl(radarStore, { reason })
    .then((r) => {
      const failed = Object.values(r.sources || {}).filter((s) => !s.ok).map((s) => s.name);
      log(`Crawl finished in ${Math.round((r.ms || 0) / 1000)}s: ${r.items} opportunities${failed.length ? `; sources with problems: ${failed.join(', ')}` : '; all sources OK'}`);
      return r;
    })
    .catch((e) => { log('Crawl error:', e); return { ok: false, error: e.message }; })
    .finally(() => { running = null; });
  return running;
}

// ---- HTTP helpers -----------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readBody(req, limit = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    const ext = path.extname(file);
    send(res, 200, await readFile(file), { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

const signupHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const hits = (signupHits.get(ip) || []).filter((t) => now - t < 3600000);
  hits.push(now);
  signupHits.set(ip, hits);
  return hits.length > 8;
}

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ---- routes -----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/api/radar' && req.method === 'GET') {
      const state = await loadState(radarStore);
      return json(res, 200, { ...publicView(state), crawl: crawlStatus(state, running) });
    }
    if (p === '/api/refresh' && req.method === 'POST') {
      const state = await loadState(radarStore);
      const recent = state.lastCrawl && Date.now() - Date.parse(state.lastCrawl) < REFRESH_GAP_MS;
      if (!running && !recent) startCrawl('manual');
      return json(res, 202, {
        started: !recent || !!running,
        message: running ? 'Checking all sources now. Results appear as soon as the check finishes.' : 'Sources were checked less than 2 minutes ago, so this is already the latest.',
      });
    }
    if (p === '/api/health') {
      const state = await loadState(radarStore);
      const view = publicView(state);
      const failing = view.sources.filter((s) => s.ok === false).map((s) => s.name);
      const stale = !state.lastCrawl || Date.now() - Date.parse(state.lastCrawl) > (INTERVAL_MIN * 2 + 15) * 60000;
      return json(res, stale ? 503 : 200, { ok: !stale, lastCrawl: state.lastCrawl, crawling: !!running, opportunities: view.items.length, failingSources: failing, sources: view.sources });
    }
    if (p === '/api/newsletter/subscribe' && req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (rateLimited(ip)) return json(res, 429, { ok: false, message: 'Too many attempts. Please try again later.' });
      let email = '';
      try { email = String(JSON.parse(await readBody(req)).email || ''); } catch {}
      const out = await subscribe(subscriberStore, email, siteUrl(req));
      return json(res, out.status, out.body);
    }
    if (p === '/api/newsletter/confirm' || p === '/api/newsletter/unsubscribe') {
      const fn = p.endsWith('confirm') ? confirm : unsubscribe;
      const html = await fn(subscriberStore, url.searchParams.get('id') || '', url.searchParams.get('token') || '', siteUrl(req));
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, p);
  } catch (e) {
    log('Request error', p, e);
    return json(res, 500, { ok: false, message: 'Something went wrong on the server.' });
  }
});

server.listen(PORT, HOST, () => {
  log(`BG Opportunity Radar running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (data in ${DATA_DIR})`);
  log(`Crawling every ${INTERVAL_MIN} minutes; Monday briefing at 07:00 London time`);
});

// A crawl cut short by a restart leaves its lock behind; clear it.
radarStore.delete('crawl-lock').catch(() => {});

// First crawl shortly after start-up, then on every half hour (xx:00 and xx:30).
setTimeout(() => startCrawl('start-up'), 5000);
function scheduleNext() {
  const ms = INTERVAL_MIN * 60000;
  const wait = ms - (Date.now() % ms) + 2000;
  setTimeout(() => { startCrawl('scheduled'); scheduleNext(); }, wait);
}
scheduleNext();

// Check every 5 minutes whether this week's Monday briefing is due (survives restarts).
setInterval(async () => {
  try {
    if (await digestDue(radarStore)) {
      const r = await sendWeeklyDigest(radarStore, subscriberStore, process.env.SITE_URL || `http://localhost:${PORT}`);
      log(`Monday briefing: ${r.items} opportunities sent to ${r.sent} subscriber(s)`);
    }
  } catch (e) {
    log('Monday briefing failed:', e.message);
  }
}, 5 * 60000).unref();

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log('Shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
