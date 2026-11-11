// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team 4b (§11.1, C266/C278, provisional): rate limits for what reaches a door without a verified card (lobby prose, unsigned
// ritual bodies, listing, house summary and host card reads), per client address and in total, over a fixed 60-second window.
// Counts are kept in memory: a restart resets them, and several instances without a shared counter each apply their own (a residual,
// as with the encounter caps).

/** §11.1 (C266, C278, provisional): unverified arrivals allowed per client address per window. */
export const ANON_RATE_PER_ADDR = 60;
/** §11.1 (C266, C278, provisional): unverified arrivals allowed in total per window. */
export const ANON_RATE_TOTAL = 600;
/** The window both limits count over (seconds). */
export const ANON_RATE_WINDOW_S = 60;
/** The retry-after a refused arrival gets (seconds). */
export const ANON_RATE_RETRY_S = 60;

const positiveInt = (x: unknown, dflt: number): number => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : dflt);
const norm = (a: string): string => a.trim().toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");

export class AnonRate {
  readonly perAddrCap: number;
  readonly totalCap: number;
  private perAddr = new Map<string, number>();
  private total = 0;
  private start: number;
  /** Caps that aren't positive integers fall back to the defaults. */
  constructor(perAddrCap?: number | undefined, totalCap?: number | undefined, private readonly now: () => number = Date.now) {
    this.perAddrCap = positiveInt(perAddrCap, ANON_RATE_PER_ADDR);
    this.totalCap = positiveInt(totalCap, ANON_RATE_TOTAL);
    this.start = now();
  }
  /**
   * Count one unverified arrival. Returns 0 when it may go on, else the seconds to wait (a 429 with retry-after; never a finding).
   * An arrival with no known address counts only toward the total. A refused arrival isn't counted, so the per-address map holds
   * at most `max(totalCap, 4096)` entries per window, including static reads.
   */
  take(addr?: string | undefined, staticRead = false): number {
    const t = this.now();
    if (t - this.start >= ANON_RATE_WINDOW_S * 1000 || t < this.start) { this.start = t; this.perAddr.clear(); this.total = 0; }
    // Review 6 R6-02 (§11.1): the static reads every visitor makes first (listing, host card, house summary) count per address only,
    // never toward the total, so a flood can't lock every newcomer out.
    if (!staticRead && this.total >= this.totalCap) return ANON_RATE_RETRY_S;
    const key = addr ? norm(addr) : "";
    const n = key ? this.perAddr.get(key) ?? 0 : 0;
    if (key && !this.perAddr.has(key) && this.perAddr.size >= Math.max(this.totalCap, 4096)) return ANON_RATE_RETRY_S;
    if (key && n >= this.perAddrCap) return ANON_RATE_RETRY_S;
    if (!staticRead) this.total++;
    if (key) this.perAddr.set(key, n + 1);
    return 0;
  }
}

/**
 * Shape-only: true when a POST body looks like one signed message (non-empty `signatures` over an object `payload`).
 * This NEVER verifies cryptography. Call sites that use it to skip the anonymous rate limit MUST also require a real signature
 * check and a live encounter/seat binding (see `verifiedArrival` in index.ts). Input must be strict-parsed once by the binding. A body like
 * `{"signatures":[{}]}` is shape-true and still anonymous until verification succeeds.
 */
export function signedArrival(m: any): boolean {
  return !!m && typeof m === "object" && !Array.isArray(m) && !!m.payload && typeof m.payload === "object" && Array.isArray(m.signatures) && m.signatures.length > 0;
}
