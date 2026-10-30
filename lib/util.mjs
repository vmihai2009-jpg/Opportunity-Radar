// Small shared helpers: polite fetching, text clean-up and RSS parsing.
// Everything here is plain rule-based code - no AI or external services.

// A normal browser identity: several press sites refuse requests from unknown "bot" agents.
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Company networks often route web traffic through a proxy. If HTTPS_PROXY / HTTP_PROXY is set,
// send all requests through it (Node's built-in fetch ignores those settings on its own).
let proxyReady = null;
function useProxyIfConfigured() {
  if (proxyReady) return proxyReady;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  proxyReady = proxy
    ? import('undici').then(({ EnvHttpProxyAgent, setGlobalDispatcher }) => setGlobalDispatcher(new EnvHttpProxyAgent())).catch(() => {})
    : Promise.resolve();
  return proxyReady;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithTimeout(url, { timeoutMs = 20000, headers = {}, ...rest } = {}) {
  const ctrl = new AbortController();
  await useProxyIfConfigured();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...rest,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-GB,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
        ...headers,
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? `timed out after ${Math.round(timeoutMs / 1000)}s (${new URL(url).hostname})` : `${e.cause?.code || e.cause?.message || e.message} (${new URL(url).hostname})`);
  } finally {
    clearTimeout(timer);
  }
}

// Fetch with automatic retries: network errors, timeouts, 429 (too many requests) and 5xx
// are retried with increasing waits, honouring the site's Retry-After header.
export async function fetchRetry(url, { retries = 3, ...opts } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, opts);
      if (res.ok) return res;
      const host = new URL(url).hostname;
      lastErr = new Error(`HTTP ${res.status} from ${host}`);
      if (!(res.status === 429 || res.status >= 500 || res.status === 408)) throw lastErr; // permanent
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Math.min(60000, retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt));
    } catch (e) {
      if (/^HTTP 4\d\d/.test(e.message) && !/HTTP 429|HTTP 408/.test(e.message)) throw e;
      lastErr = e;
      if (attempt < retries) await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function fetchText(url, opts = {}) {
  return (await fetchRetry(url, opts)).text();
}

export async function fetchJSON(url, opts = {}) {
  const res = await fetchRetry(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`unexpected non-JSON reply from ${new URL(url).hostname}`);
  }
}

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', pound: '£', eacute: 'é' };

export function decodeEntities(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export const stripTags = (s = '') =>
  decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const clip = (s = '', n = 320) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

// Parses RSS 2.0 and Atom into [{title, url, published, description, source, categories}]
export function parseFeed(xml) {
  const out = [];
  const rssItems = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  for (const b of rssItems) {
    out.push({
      title: stripTags(tag(b, 'title')),
      url: stripTags(tag(b, 'link')) || (b.match(/<guid[^>]*>([^<]+)<\/guid>/i) || [])[1] || '',
      published: stripTags(tag(b, 'pubDate')) || stripTags(tag(b, 'dc:date')),
      description: stripTags(tag(b, 'description')),
      source: stripTags(tag(b, 'source')),
      categories: [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripTags(m[1])),
    });
  }
  if (!rssItems.length) {
    for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
      const b = m[1];
      const link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
      out.push({
        title: stripTags(tag(b, 'title')),
        url: decodeEntities(link),
        published: stripTags(tag(b, 'published')) || stripTags(tag(b, 'updated')),
        description: stripTags(tag(b, 'summary')) || stripTags(tag(b, 'content')),
        source: '',
        categories: [...b.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((m) => decodeEntities(m[1])),
      });
    }
  }
  return out.filter((x) => x.title && /^https?:\/\//.test(x.url));
}

// Extract <a href> links from an HTML page, resolved against the page URL.
export function extractLinks(html, baseUrl) {
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href;
    try { href = new URL(decodeEntities(m[1]), baseUrl).href; } catch { continue; }
    const text = stripTags(m[2]);
    if (text) links.push({ url: href, text });
  }
  return links;
}

export const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export function safeDate(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function hashId(s) {
  // Small stable non-crypto hash for ids (FNV-1a)
  let h = 0x811c9dc5;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
