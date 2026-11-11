// Built into a platform (Level 3): one door per site, state in the platform's key-value store, activity as events.
import { createDoor, kvStore } from "@kigenka/shokai";

const kv = new Map();                              // stand-in for Redis, Upstash, Vercel KV, Cloudflare KV…
const store = (site) => kvStore({
  get: async (k) => kv.get(k) ?? null,
  set: async (k, v) => void kv.set(k, v),
  cas: async (k, expected, next) => ((kv.get(k) ?? null) === expected ? (kv.set(k, next), true) : false),
}, `shokai:${site}`);

export const events = [];
export function doorFor(site) {
  return createDoor({ ...site.door, store: store(site.id), onEvent: (e) => events.push({ site: site.id, ...e }) });
}
