// Sends the Monday briefing: new London / Greater London opportunities from the past 7 days.
// 07:00 UTC = 7am in winter (GMT) and 8am in summer (BST).
import { getStore } from '@netlify/blobs';
import { loadState } from '../../lib/crawler.mjs';
import { SUBSCRIBER_STORE, weeklyItems, digestEmail, sendEmails } from '../../lib/newsletter.mjs';

export default async () => {
  const siteUrl = Netlify.env.get('SITE_URL') || Netlify.env.get('URL') || '';
  const state = await loadState(getStore({ name: 'radar', consistency: 'strong' }));
  const items = weeklyItems(state);
  const subs = getStore({ name: SUBSCRIBER_STORE, consistency: 'strong' });
  const { blobs } = await subs.list();
  const messages = [];
  for (const { key } of blobs) {
    const s = await subs.get(key, { type: 'json' });
    if (s?.status !== 'active') continue;
    const unsubscribeUrl = `${siteUrl}/api/newsletter/unsubscribe?id=${key}&token=${s.token}`;
    const mail = digestEmail(items, { siteUrl, unsubscribeUrl });
    messages.push({ to: s.email, ...mail, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } });
  }
  const sent = messages.length ? await sendEmails(Netlify.env.get('RESEND_API_KEY'), Netlify.env.get('MAIL_FROM'), messages) : 0;
  console.log(`Monday briefing: ${items.length} opportunities, sent to ${sent} subscriber(s)`);
};

export const config = {
  schedule: '0 7 * * 1', // Mondays 07:00 UTC
};
