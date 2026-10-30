// Newsletter actions used by the server: sign-up with email confirmation, unsubscribe,
// and the Monday briefing (sent once per week, even if the server restarts).

import { subscriberKey, newToken, validEmail, confirmEmail, weeklyItems, digestEmail, sendEmails } from './newsletter.mjs';
import { loadState } from './crawler.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const page = (title, msg, siteUrl) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&display=swap" rel="stylesheet">
<body style="margin:0;min-height:100vh;background:#E4EAA6;color:#000;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center;padding:24px">
<main style="max-width:520px"><p style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:600;text-decoration:underline;margin:0 0 24px">Barr Gazetas</p>
<h1 style="font-family:'Times New Roman',serif;font-weight:400;font-size:40px;line-height:1.1;margin:0 0 14px">${esc(title)}</h1><p style="font-size:16px;line-height:1.6">${esc(msg)}</p>
<p><a href="${esc(siteUrl)}" style="color:#000">Back to the Opportunity Radar</a></p></main></body>`;

export async function subscribe(store, rawEmail, siteUrl) {
  const email = String(rawEmail || '').trim();
  if (!validEmail(email)) return { status: 400, body: { ok: false, message: 'Please enter a valid email address.' } };
  const id = subscriberKey(email);
  const existing = await store.get(id, { type: 'json' });
  if (existing?.status === 'active') return { status: 200, body: { ok: true, message: "You're already subscribed. See you on Monday." } };
  const token = existing?.token || newToken();
  await store.setJSON(id, { email, status: 'pending', token, createdAt: existing?.createdAt || new Date().toISOString() });
  try {
    await sendEmails([{ to: email, ...confirmEmail({ confirmUrl: `${siteUrl}/api/newsletter/confirm?id=${id}&token=${token}` }) }]);
  } catch (e) {
    console.error('Confirmation email failed:', e.message);
    return { status: 502, body: { ok: false, message: 'Your address was saved, but the confirmation email could not be sent. Please tell the radar administrator.' } };
  }
  return { status: 200, body: { ok: true, message: 'Nearly there. Check your inbox and click the link to confirm.' } };
}

async function record(store, id, token) {
  if (!/^[a-f0-9]{40}$/.test(id)) return null;
  const r = await store.get(id, { type: 'json' });
  return r && r.token === token ? r : null;
}

export async function confirm(store, id, token, siteUrl) {
  const r = await record(store, id, token);
  if (!r) return page('Link not recognised', 'This confirmation link has expired or was already used. You can sign up again on the radar.', siteUrl);
  await store.setJSON(id, { ...r, status: 'active', confirmedAt: new Date().toISOString() });
  return page("You're subscribed", 'Every Monday morning you will receive the new competitions and tenders added that week in London and Greater London.', siteUrl);
}

export async function unsubscribe(store, id, token, siteUrl) {
  if (await record(store, id, token)) await store.delete(id);
  return page('Unsubscribed', 'You will not receive any more Monday briefings. Your email address has been deleted.', siteUrl);
}

// London-time Monday, 07:00 or later, and not yet sent this week.
function londonParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, hour: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
}

export async function digestDue(radarStore, now = new Date()) {
  const { weekday, hour, date } = londonParts(now);
  if (weekday !== 'Mon' || hour < 7) return false;
  const meta = (await radarStore.get('digest-meta', { type: 'json' })) || {};
  return meta.lastSentDate !== date;
}

export async function sendWeeklyDigest(radarStore, subscriberStore, siteUrl, now = new Date()) {
  const items = weeklyItems(await loadState(radarStore), now);
  const { blobs } = await subscriberStore.list();
  const messages = [];
  for (const { key } of blobs) {
    const s = await subscriberStore.get(key, { type: 'json' });
    if (s?.status !== 'active') continue;
    const unsubscribeUrl = `${siteUrl}/api/newsletter/unsubscribe?id=${key}&token=${s.token}`;
    messages.push({ to: s.email, ...digestEmail(items, { siteUrl, unsubscribeUrl, now }), headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } });
  }
  // Record before sending so a crash part-way can never email people twice.
  await radarStore.setJSON('digest-meta', { lastSentDate: londonParts(now).date, at: now.toISOString(), recipients: messages.length, items: items.length });
  const sent = messages.length ? await sendEmails(messages) : 0;
  return { items: items.length, sent };
}
