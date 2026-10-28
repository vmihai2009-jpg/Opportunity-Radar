// Monday email: sign-up records, the digest content and sending through Resend (resend.com).
// Subscribers confirm by email first (double opt-in) and every email carries an unsubscribe link.

import { createHash, randomBytes } from 'node:crypto';

export const SUBSCRIBER_STORE = 'radar-subscribers';
const DAY = 86400000;

export const subscriberKey = (email) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40);
export const newToken = () => randomBytes(18).toString('hex');
export const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(e.trim());

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '');

const GROUP_ORDER = ['Competition', 'Delivery', 'Feasibility', 'Public realm', 'Heritage'];

// London + Greater London opportunities first seen in the last 7 days and still open.
export function weeklyItems(state, now = new Date()) {
  const since = now.getTime() - 7 * DAY;
  const today = now.toISOString().slice(0, 10);
  return Object.values(state.items || {})
    .filter((x) => x.region === 'London')
    .filter((x) => Date.parse(x.firstSeen || 0) >= since)
    .filter((x) => !x.date || x.date >= today)
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (a.date || '9999').localeCompare(b.date || '9999'));
}

const wrap = (inner) => `<!doctype html><html><body style="margin:0;background:#E4EAA6;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#000">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:640px;background:#E4EAA6" cellspacing="0" cellpadding="0"><tr><td>
<p style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:26px;font-weight:600;margin:0 0 4px;text-decoration:underline;text-underline-offset:4px">Barr Gazetas</p>
${inner}
</td></tr></table></td></tr></table></body></html>`;

export function digestEmail(items, { siteUrl, unsubscribeUrl, now = new Date() }) {
  const week = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const groups = GROUP_ORDER.map((g) => [g, items.filter((x) => x.group === g)]).filter(([, l]) => l.length);
  const body = groups.length
    ? groups.map(([g, list]) => `<h2 style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;font-size:22px;font-weight:600;margin:28px 0 8px;border-bottom:1px solid #000;padding-bottom:6px">${esc(g)} <span style="font-weight:400">(${list.length})</span></h2>` +
        list.map((x) => `<div style="background:#fff;padding:14px 16px;margin:0 0 8px">
<a href="${esc(x.url)}" style="color:#000;font-size:17px;font-weight:bold;text-decoration:none">${esc(x.title)}</a>
<div style="font-size:12px;color:#333;margin-top:6px">${esc(x.buyer || 'Client to confirm')} · ${esc(x.place || x.region)}${x.date ? ` · <b>Deadline ${esc(fmtDate(x.date))}</b>` : ''}${x.amount ? ` · ${esc(x.amount)}` : ''} · ${esc(x.source)}</div>
<div style="font-size:13px;line-height:1.5;margin-top:6px;color:#222">${esc((x.brief || '').slice(0, 260))}</div></div>`).join('')).join('')
    : `<p style="font-size:15px;line-height:1.6">No new London opportunities were picked up this week. The full radar is still worth a look for open deadlines.</p>`;
  const html = wrap(`<p style="font-size:13px;margin:0 0 22px;letter-spacing:.02em">Opportunity Radar · Monday briefing · ${esc(week)}</p>
<h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:34px;line-height:1.1;margin:0 0 10px">${items.length ? `${items.length} new opportunit${items.length === 1 ? 'y' : 'ies'} in London this week` : 'A quiet week in London'}</h1>
<p style="font-size:14px;line-height:1.6;margin:0 0 8px">Competitions, tenders and design briefs added to the radar in the last seven days for London and Greater London. Always check the original notice before bidding.</p>
<p style="margin:16px 0"><a href="${esc(siteUrl)}" style="display:inline-block;background:#000;color:#fff;padding:11px 16px;text-decoration:none;font-size:14px">Open the radar</a></p>
${body}
<p style="font-size:11px;line-height:1.6;color:#333;margin-top:30px;border-top:1px solid #000;padding-top:12px">You're receiving this because you signed up on the BG Opportunity Radar. <a href="${esc(unsubscribeUrl)}" style="color:#000">Unsubscribe</a>.</p>`);
  const text = [`Opportunity Radar - Monday briefing (${week})`, `${items.length} new London opportunities`, '', ...items.map((x) => `- ${x.title}\n  ${x.buyer || ''} | ${x.date ? 'Deadline ' + fmtDate(x.date) : 'No deadline published'} | ${x.source}\n  ${x.url}`), '', `Radar: ${siteUrl}`, `Unsubscribe: ${unsubscribeUrl}`].join('\n');
  return { subject: items.length ? `BG Radar: ${items.length} new London opportunit${items.length === 1 ? 'y' : 'ies'} this week` : 'BG Radar: quiet week in London', html, text };
}

export function confirmEmail({ confirmUrl }) {
  const html = wrap(`<h1 style="font-family:'Times New Roman',Times,serif;font-weight:400;font-size:32px;margin:18px 0 10px">Confirm your Monday briefing</h1>
<p style="font-size:14px;line-height:1.6">Click below to start receiving the Opportunity Radar every Monday morning: new competitions and tenders in London and Greater London from the past week.</p>
<p style="margin:20px 0"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#000;color:#fff;padding:11px 16px;text-decoration:none;font-size:14px">Confirm subscription</a></p>
<p style="font-size:11px;color:#333">If you didn't ask for this, ignore this email and nothing will be sent.</p>`);
  return { subject: 'Confirm your BG Opportunity Radar Monday briefing', html, text: `Confirm your subscription: ${confirmUrl}` };
}

export async function sendEmails(apiKey, from, messages) {
  if (!apiKey) throw new Error('RESEND_API_KEY is not set, so emails cannot be sent yet');
  if (!from) throw new Error('MAIL_FROM is not set');
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({ from, ...m }));
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    sent += batch.length;
    if (i + 100 < messages.length) await new Promise((r) => setTimeout(r, 600));
  }
  return sent;
}
