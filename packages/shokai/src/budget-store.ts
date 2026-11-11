// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Pluggable stores for state that must survive a restart. Today that is the host budget ledger (HostBudgetKeeper.toJSON());
// the door's pending context requests are meant to use the same store. Each store keeps one JSON value.
//
// - MemoryBudgetStore: the default. It keeps today's behaviour, so everything resets on restart.
// - FileBudgetStore: one JSON file with advisory locking and an update(mutator) transaction (lock → reload → apply → atomic
//   rename → unlock), so several processes of one host may share the host-budget ledger (C279, provisional, ext-host-budget).
//   This is separate from `fileStore` in store.ts, which locks the door's visitor durable/live state (including host_budget when
//   carried under Door.store) and already prevents visitor double-spend / single-use-act races (C270).
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeSync, type OpenMode } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Keeps one JSON-safe value. load() returns undefined when nothing has been saved yet. */
export interface BudgetStore<T = unknown> {
  load(): T | undefined;
  save(state: T): void;
  /**
   * Lock (when the store supports it) → reload → apply mutator → write → unlock.
   * Prefer this over load()+save() when several processes share one ledger, so a writer never overwrites another's updates.
   */
  update?(mutator: (cur: T | undefined) => T): void;
}

/** In memory only, and the default. A restart starts from nothing, as before. */
export class MemoryBudgetStore<T = unknown> implements BudgetStore<T> {
  private value: string | undefined;
  load(): T | undefined { return this.value === undefined ? undefined : (JSON.parse(this.value) as T); }
  save(state: T): void { this.value = JSON.stringify(state); }
  update(mutator: (cur: T | undefined) => T): void { this.save(mutator(this.load())); }
}

/**
 * One JSON file with advisory locking. A temp file next to it is written and fsynced, then renamed over it, so a crash leaves
 * either the old file or the new one, never half of one. Each write (and each `update`) holds `<path>.lock` (created exclusively)
 * so two processes never both win. A lock older than `staleMs` (default 10 s) is taken to be left by a crashed process and removed.
 * If the file exists but isn't valid JSON, load() throws, because silently starting from zero would reopen spending caps.
 *
 * Note: visitor double-spend / single-use-act races are prevented by `fileStore` (store.ts, C270), not by this class. This class
 * is the host-model-budget ledger (C279, provisional).
 */
export class FileBudgetStore<T = unknown> implements BudgetStore<T> {
  private readonly staleMs: number;
  constructor(readonly path: string, o: { staleMs?: number } = {}) { this.staleMs = o.staleMs ?? 10_000; }
  load(): T | undefined {
    let text: string;
    try { text = readFileSync(this.path, "utf8"); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw e; }
    try { return JSON.parse(text) as T; } catch { throw Object.assign(new Error(`budget store ${this.path} is not valid JSON`), { code: "SHOKAI_BUDGET_STORE_CORRUPT" }); }
  }
  save(state: T): void {
    const unlock = this.lock();
    try { this.writeAtomic(state); } finally { unlock(); }
  }
  /** Lock → reload → apply → atomic write → unlock. Two concurrent writers each see the other's committed state. */
  update(mutator: (cur: T | undefined) => T): void {
    const unlock = this.lock();
    try { this.writeAtomic(mutator(this.load())); } finally { unlock(); }
  }
  private writeAtomic(state: T): void {
    const dir = dirname(this.path); mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.${basename(this.path)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    const data = JSON.stringify(state);
    let fd: number | undefined;
    try {
      fd = openSync(tmp, "w", 0o600); writeSync(fd, data); fsyncSync(fd); closeSync(fd); fd = undefined;
      renameSync(tmp, this.path);
    } catch (e) {
      if (fd !== undefined) try { closeSync(fd); } catch { /* already failing */ }
      try { rmSync(tmp, { force: true }); } catch { /* best effort */ }
      throw e;
    }
  }
  /** Exclusive create of `<path>.lock`. Returns an unlock function. Throws if the lock stays busy. */
  private lock(): () => void {
    const lockPath = this.path + ".lock";
    let fd: number | undefined;
    for (let i = 0; i < 200; i++) {
      try {
        fd = openSync(lockPath, "wx" as OpenMode, 0o600);
        return () => { try { if (fd !== undefined) closeSync(fd); } catch { /* */ } try { unlinkSync(lockPath); } catch { /* */ } };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try { if (Date.now() - statSync(lockPath).mtimeMs > this.staleMs) unlinkSync(lockPath); } catch { /* retry */ }
        // brief busy-wait; sync store, same pattern as fileStore's async 5–15 ms sleep
        const end = Date.now() + 5 + Math.floor(Math.random() * 10);
        while (Date.now() < end) { /* spin */ }
      }
    }
    throw Object.assign(new Error(`budget store ${this.path} lock busy`), { code: "SHOKAI_BUDGET_STORE_BUSY" });
  }
}

/** A file store at `path`, or a memory store (today's behaviour) when no path is given. */
export function budgetStoreFor<T = unknown>(path?: string): BudgetStore<T> {
  return path ? new FileBudgetStore<T>(path) : new MemoryBudgetStore<T>();
}
