// Serves the current opportunity list to the web page.
import { getStore } from '@netlify/blobs';
import { loadState, publicView } from '../../lib/crawler.mjs';

export default async () => {
  const state = await loadState(getStore({ name: 'radar', consistency: 'strong' }));
  return Response.json(publicView(state), { headers: { 'Cache-Control': 'no-cache' } });
};

export const config = { path: '/api/radar', method: 'GET' };
