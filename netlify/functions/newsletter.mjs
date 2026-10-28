// Monday briefing sign-up: subscribe (sends a confirmation email), confirm and unsubscribe.
import { getStore } from '@netlify/blobs';
import { SUBSCRIBER_STORE, subscriberKey, newToken, validEmail, confirmEmail, sendEmails } from '../../lib/newsletter.mjs';

const page = (title, msg, siteUrl) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&display=swap" rel="stylesheet">
<body style="margin:0;min-height:100vh;background:#E4EAA6;color:#000;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center;padding:24px">
<main style="max-width:520px"><p style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:600;text-decoration:underline;margin:0 0 24px">Barr Gazetas</p>
<h1 style="font-family:'Times New Roman',serif;font-weight:400;font-size:40px;line-height:1.1;margin:0 0 14px">${title}</h1><p style="font-size:16px;line-height:1.6">${msg}</p>
<p><a href="${siteUrl}" style="color:#000">Back to the Opportunity Radar</a></p></main></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

export default async (req, context) => {
  const url = new URL(req.url);
  const siteUrl = Netlify.env.get('SITE_URL') || url.origin;
  const store = getStore({ name: SUBSCRIBER_STORE, consistency: 'strong' });
  const action = context.params.action;

  if (action === 'subscribe' && req.method === 'POST') {
    let email = '';
    try { email = String((await req.json()).email || '').trim(); } catch {}
    if (!validEmail(email)) return Response.json({ ok: false, message: 'Please enter a valid email address.' }, { status: 400 });
    const id = subscriberKey(email);
    const existing = await store.get(id, { type: 'json' });
    if (existing?.status === 'active') return Response.json({ ok: true, message: "You're already subscribed. See you on Monday." });
    const token = existing?.token || newToken();
    await store.setJSON(id, { email, status: 'pending', token, createdAt: existing?.createdAt || new Date().toISOString() });
    const confirmUrl = `${siteUrl}/api/newsletter/confirm?id=${id}&token=${token}`;
    try {
      await sendEmails(Netlify.env.get('RESEND_API_KEY'), Netlify.env.get('MAIL_FROM'), [{ to: email, ...confirmEmail({ confirmUrl }) }]);
    } catch (e) {
      console.error('Confirmation email failed', e.message);
      return Response.json({ ok: false, message: 'Signed up, but the confirmation email could not be sent yet. Please try again later.' }, { status: 502 });
    }
    return Response.json({ ok: true, message: 'Nearly there. Check your inbox and click the link to confirm.' });
  }

  const id = url.searchParams.get('id') || '';
  const token = url.searchParams.get('token') || '';
  const record = /^[a-f0-9]{40}$/.test(id) ? await store.get(id, { type: 'json' }) : null;

  if (action === 'confirm') {
    if (!record || record.token !== token) return page('Link not recognised', 'This confirmation link has expired or was already used. You can sign up again on the radar.', siteUrl);
    await store.setJSON(id, { ...record, status: 'active', confirmedAt: new Date().toISOString() });
    return page("You're subscribed", 'Every Monday morning you will receive the new competitions and tenders added that week in London and Greater London.', siteUrl);
  }

  if (action === 'unsubscribe') {
    if (record && record.token === token) await store.delete(id);
    return page('Unsubscribed', 'You will not receive any more Monday briefings. Your email address has been deleted.', siteUrl);
  }

  return new Response('Not found', { status: 404 });
};

export const config = { path: '/api/newsletter/:action' };
