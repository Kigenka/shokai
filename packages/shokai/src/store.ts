// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Where a door keeps what §3.6 says it must remember (nonces, mandate counts, never bindings, revocations…) and its visits in
// progress (encounters, passes, held purchases, single-use acts), for doors that run on serverless hosts or as several instances
// with no sticky sessions; and the door's activity events. Host-local: nothing here is on the wire.
import { readFile, writeFile, rename, open, stat, unlink, type FileHandle } from "node:fs/promises";
import type { DurableState, LiveState } from "./core/host.js";

/**
 * What a door writes: the §3.6 durable state, and under `live` its visits in progress, so any instance can answer any message.
 * A store treats it as one opaque JSON value; it holds no private keys.
 */
export type DoorState = DurableState & { live?: LiveState & { sdk?: { used_acts?: [string, number][]; /** §6.11: the host budget ledger. */ host_budget?: import("./host-budget.js").HostBudgetLedgerJson } } };
/** What a store holds: the door's state and a version that grows by one with every write. */
export type StoredState = { version: number; state: DoorState };
/**
 * A door's durable-state store. `save` writes only if the stored version is still `expectedVersion` (compare and set) and
 * returns the new version, or null when another instance wrote first; the door then withholds its answer (HTTP 429, §11.1)
 * and reloads, so two instances can never both count against the same allowance from stale state.
 */
export interface DoorStore {
  load(): Promise<StoredState | null>;
  save(state: DoorState, expectedVersion: number): Promise<number | null>;
}

/** In memory, for tests and single-process doors. Share one between two doors to stand in for two instances. */
export function memoryStore(): DoorStore & { peek(): StoredState | null } {
  let cur: StoredState | null = null;
  return {
    async load() { return cur ? JSON.parse(JSON.stringify(cur)) : null; },
    async save(state, expected) { if ((cur?.version ?? 0) !== expected) return null; cur = { version: expected + 1, state: JSON.parse(JSON.stringify(state)) }; return cur.version; },
    peek: () => cur,
  };
}

/**
 * A JSON file (atomic rename). Several processes may share it (instances on one machine or a shared volume): each write holds
 * `<path>.lock` (created exclusively) while it compares the version and renames, so two writers never both win. A lock older than
 * `staleMs` (default 10 s) is taken to be left by a crashed process and removed.
 */
export function fileStore(path: string, o: { staleMs?: number } = {}): DoorStore {
  const read = async (): Promise<StoredState | null> => { try { return JSON.parse(await readFile(path, "utf8")); } catch (e: any) { if (e?.code === "ENOENT") return null; throw e; } };
  const lockPath = path + ".lock"; const stale = o.staleMs ?? 10_000;
  const lock = async (): Promise<FileHandle | null> => {
    for (let i = 0; i < 200; i++) {
      try { return await open(lockPath, "wx", 0o600); }
      catch (e: any) {
        if (e?.code !== "EEXIST") throw e;
        try { const st = await stat(lockPath); if (Date.now() - st.mtimeMs > stale) { await unlink(lockPath).catch(() => {}); continue; } } catch { continue; }
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
      }
    }
    return null;   // busy for too long: report a conflict (the door withholds its answer; the visitor retries)
  };
  return {
    load: read,
    async save(state, expected) {
      const h = await lock(); if (!h) return null;
      try {
        const cur = await read(); if ((cur?.version ?? 0) !== expected) return null;
        const next = { version: expected + 1, state }; const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
        await writeFile(tmp, JSON.stringify(next), { mode: 0o600 }); await rename(tmp, path); return next.version;
      } finally { await h.close().catch(() => {}); await unlink(lockPath).catch(() => {}); }
    },
  };
}

/**
 * Any key-value service (Redis, Upstash, Vercel KV, Cloudflare KV…), given three small functions. `cas(key, expected, next)`
 * must replace the value only if it is still `expected` (null = absent) and say whether it did: with Redis, a short Lua script
 * or WATCH/MULTI. Without `cas`, get-then-set is used, which is only safe with a single instance.
 */
export function kvStore(kv: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<unknown>;
  cas?(key: string, expected: string | null, next: string): Promise<boolean> }, key = "shokai:door-state"): DoorStore {
  return {
    async load() { const v = await kv.get(key); return v ? JSON.parse(v) : null; },
    async save(state, expected) {
      const raw = await kv.get(key); const cur: StoredState | null = raw ? JSON.parse(raw) : null;
      if ((cur?.version ?? 0) !== expected) return null;
      const next = JSON.stringify({ version: expected + 1, state });
      if (kv.cas) return (await kv.cas(key, raw, next)) ? expected + 1 : null;
      await kv.set(key, next); return expected + 1;
    },
  };
}

/**
 * Door activity, for logs, a dashboard or a platform managing many doors. Machine fields only: no prose, no names, no card
 * contents, no owner identifiers (§12.3). `encounter_id` is the random id the visiting representative chose for its visit.
 */
export type DoorEvent = { at: string; place: string; encounter_id?: string } & (
  | { type: "arrival"; as: "ritual" | "lobby" | "inbox" }
  | { type: "leaflet" }                                            // an agent without a Shōkai visitor card got the leaflet (§3.3)
  | { type: "decision"; decision: string; disposition?: string; reason_code?: string; purpose?: string }
  | { type: "pass"; seat_id: string; tools: string[]; expires_at?: string }   // admitted with a pass
  | { type: "act"; tool?: string; ok: boolean; reason_code?: string; amount?: { value: string; currency: string } }
  | { type: "farewell"; outcome?: string }
  | { type: "closed"; why: "host_card" | "withdrawn" }              // the door answered 503 (§2.3, §2.6)
  | { type: "busy"; why: "capacity" | "store_conflict" }            // 429 (§3.4, or another instance wrote first)
  // v0.5.0 (§7.4–§7.6): questions outside the setup, the owner's answers, amendments and bookings. Codes and digests only.
  | { type: "ask"; status: "answered" | "withheld" | "pending_owner" | "incomplete"; seat_id: string; topic?: string; answer_id?: string; ask_ref?: string; matched_by: "code"; missing?: string[] }
  | { type: "owner_review"; review_id: string; ask_ref: string; response_by: string }
  | { type: "owner_answer"; ask_ref: string; status: "answered" | "declined" | "no_answer"; choice?: string }
  | { type: "setup_amended"; setup_version: number; prev_house_digest: string; house_digest: string; changes: { op: string; action?: string; answer_id?: string }[] }
  | { type: "amendment_refused"; why: string }
  | { type: "booking"; status: "confirmed" | "changed" | "cancelled"; confirmation_id: string; start: string; party_size: number }
  // §6.11 (provisional): the host budget. Whether a host model call was allowed, and the owner's notices. Codes only.
  | { type: "host_model"; status: "allowed" | "closed"; seat_id: string; scope?: string }
  | { type: "owner_notice"; notice_id: string; kind: "alert" | "ceiling" | "unpriced"; scope: string }
);
