// Simple JSON file storage for the self-hosted server (replaces Netlify Blobs).
// Each key is one file inside DATA_DIR. Writes go to a temporary file first and are then
// renamed into place, so a crash or power cut can never leave a half-written file.

import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';

const safeName = (key) => String(key).replace(/[^a-zA-Z0-9._-]/g, '_');

export function fileStore(dir) {
  const ready = mkdir(dir, { recursive: true });
  const file = (key) => path.join(dir, safeName(key) + '.json');
  return {
    async get(key, opts = {}) {
      await ready;
      try {
        const text = await readFile(file(key), 'utf8');
        return opts.type === 'json' ? JSON.parse(text) : text;
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async setJSON(key, value) {
      await ready;
      const target = file(key);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, target);
    },
    async delete(key) {
      await ready;
      await unlink(file(key)).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    },
    async list() {
      await ready;
      const names = await readdir(dir);
      return { blobs: names.filter((n) => n.endsWith('.json')).map((n) => ({ key: n.slice(0, -5) })) };
    },
  };
}
