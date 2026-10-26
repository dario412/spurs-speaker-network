// Uploaded site packs waiting for review, held in memory only: nothing is written until someone presses Import.
// Bounded (a few packs, 30 minutes each) because each holds a parsed pack with its og images.
import { randomBytes } from 'node:crypto';

/** @param {{ ttl?: number, max?: number, now?: () => number }} [options] */
export function pendingPacks({ ttl = 30 * 60 * 1000, max = 5, now = Date.now } = {}) {
  const entries = new Map();
  const sweep = () => {
    for (const [id, entry] of entries) if (now() - entry.at > ttl) entries.delete(id);
  };
  return {
    /** Stores an entry and returns its id; the oldest entries go when the cap is reached. */
    add(entry) {
      sweep();
      while (entries.size >= max) entries.delete(entries.keys().next().value);
      const id = randomBytes(12).toString('hex');
      entries.set(id, { ...entry, at: now() });
      return id;
    },
    get(id) {
      sweep();
      return entries.get(id);
    },
    delete: id => entries.delete(id),
  };
}
