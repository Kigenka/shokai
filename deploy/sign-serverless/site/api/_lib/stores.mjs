// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Storage for the serverless signing page. Every adapter has the same small async interface:
//   get(key) → value | null          set(key, value, ttlS?)          setNX(key, value, ttlS?) → true if it was free
//   take(key) → value | null (read and delete in one step: a challenge can be used once)
//   incr(key, ttlS) → number (the TTL starts with the first increment)          decr(key)          del(key)
// Values are JSON. Only public data is stored: frozen items, the public owner credential, decisions, signed outputs, and
// challenge records. The session token itself is never stored, only its SHA-256.
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

/** In memory, one process. For tests and the local harness only: a real deployment runs on many instances. */
export function memoryStore(now = () => Date.now()) {
  const m = new Map();
  const live = (k) => { const e = m.get(k); if (!e) return null; if (e.exp && e.exp <= now()) { m.delete(k); return null; } return e; };
  return {
    kind: "memory",
    async get(k) { const e = live(k); return e ? structuredClone(e.v) : null; },
    async set(k, v, ttl) { m.set(k, { v: structuredClone(v), exp: ttl ? now() + ttl * 1000 : 0 }); },
    async setNX(k, v, ttl) { if (live(k)) return false; m.set(k, { v: structuredClone(v), exp: ttl ? now() + ttl * 1000 : 0 }); return true; },
    async take(k) { const e = live(k); m.delete(k); return e ? e.v : null; },
    async incr(k, ttl) { const e = live(k); const n = (e?.v ?? 0) + 1; m.set(k, { v: n, exp: e?.exp || (ttl ? now() + ttl * 1000 : 0) }); return n; },
    async decr(k) { const e = live(k); if (e) e.v = Math.max(0, e.v - 1); },
    async del(k) { m.delete(k); },
  };
}

/** Files in a folder (local harness). `layout(key)` may map a key to a readable file name (the reference page's DATA_DIR layout);
 *  every other key goes to .kv/. Mapped files hold the bare value; .kv/ files hold {v, exp}. Single process only. */
export function dirStore(dir, layout = () => null, now = () => Date.now()) {
  mkdirSync(join(dir, ".kv"), { recursive: true, mode: 0o700 });
  const path = (k) => layout(k) ?? join(".kv", Buffer.from(k).toString("base64url") + ".json");
  const W = (f, x) => { const p = join(dir, f); mkdirSync(dirname(p), { recursive: true, mode: 0o700 }); writeFileSync(p + ".tmp", JSON.stringify(x, null, 2) + "\n", { mode: 0o600 }); renameSync(p + ".tmp", p); };
  const R = (k) => { const f = path(k), p = join(dir, f); if (!existsSync(p)) return null; const x = JSON.parse(readFileSync(p, "utf8"));
    if (layout(k)) return { v: x, exp: 0 }; if (x.exp && x.exp <= now()) { rmSync(p, { force: true }); return null; } return x; };
  const put = (k, v, exp) => W(path(k), layout(k) ? v : { v, exp });
  return {
    kind: "dir",
    async get(k) { return R(k)?.v ?? null; },
    async set(k, v, ttl) { put(k, v, ttl ? now() + ttl * 1000 : 0); },
    async setNX(k, v, ttl) { if (R(k)) return false; put(k, v, ttl ? now() + ttl * 1000 : 0); return true; },
    async take(k) { const e = R(k); rmSync(join(dir, path(k)), { force: true }); return e?.v ?? null; },
    async incr(k, ttl) { const e = R(k); const n = (e?.v ?? 0) + 1; put(k, n, e?.exp || (ttl ? now() + ttl * 1000 : 0)); return n; },
    async decr(k) { const e = R(k); if (e) put(k, Math.max(0, e.v - 1), e.exp); },
    async del(k) { rmSync(join(dir, path(k)), { force: true }); },
  };
}

/** Upstash Redis over its REST API (what Vercel's Marketplace "Upstash for Redis" integration provides). No package needed:
 *  one HTTPS POST per command. GETDEL and SET NX make challenge use and decisions atomic across instances. */
export function upstashStore({ url, token, fetchImpl = fetch, prefix = "sign:" }) {
  if (!url || !/^https:\/\//.test(url) && !/^http:\/\/127\.0\.0\.1[:/]/.test(url)) throw new Error("storage URL must be https");
  if (!token) throw new Error("storage token missing");
  const cmd = async (...args) => {
    const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error("storage error: " + (j.error ?? r.status)); return j.result; };
  const K = (k) => prefix + k, P = (v) => JSON.stringify(v), U = (s) => s == null ? null : JSON.parse(s);
  return {
    kind: "upstash",
    async get(k) { return U(await cmd("GET", K(k))); },
    async set(k, v, ttl) { await (ttl ? cmd("SET", K(k), P(v), "EX", String(ttl)) : cmd("SET", K(k), P(v))); },
    async setNX(k, v, ttl) { return (await (ttl ? cmd("SET", K(k), P(v), "NX", "EX", String(ttl)) : cmd("SET", K(k), P(v), "NX"))) === "OK"; },
    async take(k) { return U(await cmd("GETDEL", K(k))); },
    async incr(k, ttl) { const n = await cmd("INCR", K(k)); if (n === 1 && ttl) await cmd("EXPIRE", K(k), String(ttl)); return n; },
    async decr(k) { await cmd("DECR", K(k)); },
    async del(k) { await cmd("DEL", K(k)); },
  };
}

/** The store a deployment uses: Upstash when its env vars are set (either naming the integration uses), else none.
 *  A deployment never falls back to memory: per-instance memory would lose challenges and allow double decisions. */
export function storeFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashStore({ url, token });
  if (env.SIGN_STORE === "memory" && env.VERCEL !== "1") return memoryStore();
  return null;
}
