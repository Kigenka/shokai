// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team (SHK-06, C287, provisional; SPEC §4.1, §11.1): free principals. A key costs nothing to make, so guessing an introduction
// code with many fresh principals, filling seats, or flooding signed ritual traffic must be bounded per card and per source, not
// per principal. This module holds the building blocks:
//  - codeEntropyBits / hasMinimumCodeEntropy: the 40-bit floor for introduction codes (an upper bound from alphabet and length);
//  - ClaimGuard: failed claims per card across all principals (suspension past a cap) and a growing backoff per principal and source;
//  - SeatCaps: concurrent seats per visitor card and per source, with idle eviction;
//  - NewcomerBudget: signed traffic from principals with no history counts like anonymous traffic (C278).
// Counts are kept in memory: a restart resets them, and several instances without a shared counter each apply their own.
// Wired (pre-release review round 2): createDoor() applies NewcomerBudget to signed arrivals in respond() and the seat caps
// (SEATS_PER_CARD, SEATS_PER_SOURCE) on the grant path in the core host. the per-card claim failure cap (CLAIM_FAIL_CAP_PER_CARD) on the claim path; and (conformance pass 2, 2026-11-08, C296) the
// growing backoff per guessing principal and per source (CLAIM_BACKOFF_BASE_S, CLAIM_BACKOFF_MAX_S) in the core host's claim path
// (Host opts.claimBackoff), with failures counted per source. ClaimGuard itself stays a standalone building block.

import { AnonRate } from "./anon-rate.js";

/** §4.1 (C287): the minimum entropy of an introduction code, in bits. */
export const MIN_CODE_ENTROPY_BITS = 40;
/** §4.1 (C287): failed claim attempts per card per window before claims on it are suspended. */
export const CLAIM_FAIL_CAP_PER_CARD = 10;
/** §4.1 (C287): the window failed claims count over (seconds). */
export const CLAIM_FAIL_WINDOW_S = 86400;
/** §4.1 (C287): the first backoff after a failed claim (seconds); it doubles with each failure in the window. */
export const CLAIM_BACKOFF_BASE_S = 2;
/** §4.1 (C287): the longest backoff (seconds). */
export const CLAIM_BACKOFF_MAX_S = 3600;
/** §11.1 (C287): concurrent seats per visitor card. */
export const SEATS_PER_CARD = 2;
/** §11.1 (C287, RR-08): concurrent seats per anonymous or newcomer source: a coarse fallback (agent platforms share egress addresses). */
export const SEATS_PER_SOURCE = 16;
/** §11.1 (C287, RR-08): newcomer signed messages per principal per minute (the primary key). */
export const NEWCOMER_PER_PRINCIPAL = 60;
/** §11.1 (C287, RR-08): newcomer signed messages per source per minute (a coarse fallback). */
export const NEWCOMER_PER_SOURCE = 600;
/** §11.1 (C287): a seat idle for longer than this (seconds) MAY be closed. */
export const SEAT_IDLE_S = 900;
/** What a refused claim or seat is answered (nothing is granted). */
export const FREE_PRINCIPAL_ANSWER = "not_now" as const;

const positiveInt = (x: unknown, dflt: number): number => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : dflt);
const normSource = (s: string | undefined): string => (s ? s.trim().toLowerCase() : "");

// Smallest alphabet first, so the estimate is the most conservative alphabet the code fits.
const ALPHABETS: Array<{ bits: number; fits: RegExp }> = [
  { bits: Math.log2(10), fits: /^[0-9]+$/ },
  { bits: 4, fits: /^[0-9a-fA-F]+$/ },
  { bits: 5, fits: /^[A-Za-z2-7]+$/ },
  { bits: Math.log2(36), fits: /^[0-9A-Za-z]+$/ },
  { bits: 6, fits: /^[A-Za-z0-9_-]+$/ },
  { bits: Math.log2(94), fits: /^[\x21-\x7e]+$/ },
];

/**
 * §4.1 (C287): an upper bound on a code's entropy in bits, from the smallest common alphabet it fits and its length. It can't tell a
 * random code from a chosen one: codes must come from a cryptographically secure random source. A code of one repeated character,
 * an empty code, or one outside printable ASCII gets 0.
 */
export function codeEntropyBits(code: string): number {
  const c = typeof code === "string" ? code.trim() : "";
  if (!c || new Set(c).size < 2) return 0;
  for (const a of ALPHABETS) if (a.fits.test(c)) return a.bits * c.length;
  return 0;
}

/** §4.1 (C287): whether a code meets the entropy floor (default 40 bits). */
export function hasMinimumCodeEntropy(code: string, minBits: number = MIN_CODE_ENTROPY_BITS): boolean {
  return codeEntropyBits(code) >= minBits;
}

export type ClaimGuardOptions = {
  perCardCap?: number | undefined;
  windowS?: number | undefined;
  backoffBaseS?: number | undefined;
  backoffMaxS?: number | undefined;
  /** Called once when a card's claims are suspended: notify the introducer (SHOULD, §4.1). Errors are swallowed. */
  onSuspend?: ((card: string) => void) | undefined;
  now?: (() => number) | undefined;
};

export type ClaimVerdict =
  | { ok: true }
  | { ok: false; why: "suspended" | "backoff"; retryAfterS: number; answer: typeof FREE_PRINCIPAL_ANSWER };

type Backoff = { n: number; first: number; until: number };

/** §4.1 (C287): failed claims per card across all principals, and a growing backoff per principal and per source. */
/** @internal Exported from the root entry for the reference and tests; not part of the supported API (may change before 1.0, moves under ./core in 0.6). */
export class ClaimGuard {
  readonly perCardCap: number;
  readonly windowS: number;
  readonly backoffBaseS: number;
  readonly backoffMaxS: number;
  private readonly now: () => number;
  private readonly onSuspend: ((card: string) => void) | undefined;
  private cardFails = new Map<string, number[]>();
  private suspendedUntil = new Map<string, number>();
  private backoffs = new Map<string, Backoff>();

  constructor(o: ClaimGuardOptions = {}) {
    this.perCardCap = positiveInt(o.perCardCap, CLAIM_FAIL_CAP_PER_CARD);
    this.windowS = positiveInt(o.windowS, CLAIM_FAIL_WINDOW_S);
    this.backoffBaseS = positiveInt(o.backoffBaseS, CLAIM_BACKOFF_BASE_S);
    this.backoffMaxS = positiveInt(o.backoffMaxS, CLAIM_BACKOFF_MAX_S);
    this.now = o.now ?? Date.now;
    this.onSuspend = o.onSuspend;
  }

  private get windowMs(): number { return this.windowS * 1000; }

  /** Failed attempts on a card still in the window. */
  failures(card: string): number {
    const t = this.now();
    return (this.cardFails.get(card) ?? []).filter((x) => t - x < this.windowMs).length;
  }

  /** Whether claims on this card are suspended now. */
  suspended(card: string): boolean {
    const until = this.suspendedUntil.get(card);
    return until !== undefined && until > this.now();
  }

  /** Lift a suspension (the owner's call); the card's failure count starts again. */
  lift(card: string): void { this.suspendedUntil.delete(card); this.cardFails.delete(card); }

  /** Check before verifying a claim. A refused claim is answered not_now and isn't checked. */
  allowed(card: string, principal: string, source?: string | undefined): ClaimVerdict {
    const t = this.now();
    const su = this.suspendedUntil.get(card);
    if (su !== undefined) {
      if (su > t) return { ok: false, why: "suspended", retryAfterS: Math.ceil((su - t) / 1000), answer: FREE_PRINCIPAL_ANSWER };
      this.suspendedUntil.delete(card); this.cardFails.delete(card);
    }
    let until = 0;
    for (const k of this.keys(principal, source)) { const b = this.backoffs.get(k); if (b && b.until > until) until = b.until; }
    if (until > t) return { ok: false, why: "backoff", retryAfterS: Math.ceil((until - t) / 1000), answer: FREE_PRINCIPAL_ANSWER };
    return { ok: true };
  }

  /** Count one failed claim attempt. Returns whether the card is now suspended and the backoff the guesser now carries. */
  recordFailure(card: string, principal: string, source?: string | undefined): { suspended: boolean; retryAfterS: number } {
    const t = this.now();
    if (this.cardFails.size + this.backoffs.size > 8192) this.sweep(t);
    const list = (this.cardFails.get(card) ?? []).filter((x) => t - x < this.windowMs);
    list.push(t);
    this.cardFails.set(card, list);
    if (list.length >= this.perCardCap && !this.suspended(card)) {
      this.suspendedUntil.set(card, t + this.windowMs);
      if (this.onSuspend) { try { this.onSuspend(card); } catch { /* notifying is best effort */ } }
    }
    let until = t;
    for (const k of this.keys(principal, source)) {
      const prev = this.backoffs.get(k);
      const b: Backoff = prev && t - prev.first < this.windowMs ? prev : { n: 0, first: t, until: t };
      b.n++;
      const s = Math.min(this.backoffMaxS, this.backoffBaseS * 2 ** Math.min(b.n - 1, 30));
      b.until = t + s * 1000;
      this.backoffs.set(k, b);
      if (b.until > until) until = b.until;
    }
    return { suspended: this.suspended(card), retryAfterS: Math.ceil((until - t) / 1000) };
  }

  private keys(principal: string, source: string | undefined): string[] {
    const ks: string[] = [];
    if (principal) ks.push("p:" + principal);
    const s = normSource(source); if (s) ks.push("s:" + s);
    return ks;
  }

  private sweep(t: number): void {
    for (const [k, l] of this.cardFails) if (!l.some((x) => t - x < this.windowMs) && !this.suspended(k)) this.cardFails.delete(k);
    for (const [k, u] of this.suspendedUntil) if (u <= t) this.suspendedUntil.delete(k);
    for (const [k, b] of this.backoffs) if (t - b.first >= this.windowMs && b.until <= t) this.backoffs.delete(k);
  }
}

export type SeatCapsOptions = {
  perCard?: number | undefined;
  perSource?: number | undefined;
  idleS?: number | undefined;
  now?: (() => number) | undefined;
};

export type SeatOpen =
  | { ok: true; seatId: string }
  | { ok: false; which: "card" | "source"; answer: typeof FREE_PRINCIPAL_ANSWER };

type SeatRec = { card: string; source: string; last: number };

/** §11.1 (C287): concurrent seats per visitor card and per anonymous/newcomer source, with idle eviction. */
export class SeatCaps {
  readonly perCard: number;
  readonly perSource: number;
  readonly idleS: number;
  private readonly now: () => number;
  private seats = new Map<string, SeatRec>();
  private byCard = new Map<string, number>();
  private bySource = new Map<string, number>();
  private seq = 0;

  constructor(o: SeatCapsOptions = {}) {
    this.perCard = positiveInt(o.perCard, SEATS_PER_CARD);
    this.perSource = positiveInt(o.perSource, SEATS_PER_SOURCE);
    this.idleS = positiveInt(o.idleS, SEAT_IDLE_S);
    this.now = o.now ?? Date.now;
  }

  /** Open seats now (after evicting idle ones). */
  get open(): number { this.evictIdle(); return this.seats.size; }

  /** Try to open a seat for a visitor card key from a source. Idle seats are evicted first. */
  tryOpen(cardKey: string, source?: string | undefined): SeatOpen {
    this.evictIdle();
    const s = normSource(source);
    if ((this.byCard.get(cardKey) ?? 0) >= this.perCard) return { ok: false, which: "card", answer: FREE_PRINCIPAL_ANSWER };
    if (s && (this.bySource.get(s) ?? 0) >= this.perSource) return { ok: false, which: "source", answer: FREE_PRINCIPAL_ANSWER };
    const seatId = "seat-" + (++this.seq);
    this.seats.set(seatId, { card: cardKey, source: s, last: this.now() });
    this.byCard.set(cardKey, (this.byCard.get(cardKey) ?? 0) + 1);
    if (s) this.bySource.set(s, (this.bySource.get(s) ?? 0) + 1);
    return { ok: true, seatId };
  }

  /** A message from the visitor in this seat: it isn't idle. Returns false for an unknown or closed seat. */
  touch(seatId: string): boolean {
    const r = this.seats.get(seatId); if (!r) return false;
    r.last = this.now(); return true;
  }

  /** Close a seat. Returns false if it wasn't open. */
  close(seatId: string): boolean {
    const r = this.seats.get(seatId); if (!r) return false;
    this.seats.delete(seatId);
    const c = (this.byCard.get(r.card) ?? 1) - 1; if (c > 0) this.byCard.set(r.card, c); else this.byCard.delete(r.card);
    if (r.source) { const n = (this.bySource.get(r.source) ?? 1) - 1; if (n > 0) this.bySource.set(r.source, n); else this.bySource.delete(r.source); }
    return true;
  }

  /** Close seats idle for longer than idleS; returns their ids (the door sends each its closing farewell, §7.1). */
  evictIdle(): string[] {
    const t = this.now(); const out: string[] = [];
    for (const [id, r] of this.seats) if (t - r.last > this.idleS * 1000) out.push(id);
    for (const id of out) this.close(id);
    return out;
  }
}

/**
 * §11.1 (C287, RR-08): signed ritual traffic from a principal with no history at the place counts toward a newcomer budget keyed
 * first by principal (default 60 a minute) and then by source as a coarse fallback (default 600 a minute, so a shared platform
 * egress isn't throttled like one visitor). A total cap is optional (off by default), so traffic from many addresses can't lock
 * out every genuine newcomer. Returns 0 to go on, else the seconds for retry-after.
 */
export type NewcomerBudgetOptions = { perPrincipal?: number | undefined; perSource?: number | undefined; total?: number | undefined; now?: (() => number) | undefined };
export class NewcomerBudget {
  private readonly byPrincipal: AnonRate;
  private readonly bySource: AnonRate;
  constructor(o: NewcomerBudgetOptions = {}) {
    const now = o.now ?? Date.now; const total = positiveInt(o.total, Number.MAX_SAFE_INTEGER);
    this.byPrincipal = new AnonRate(positiveInt(o.perPrincipal, NEWCOMER_PER_PRINCIPAL), Number.MAX_SAFE_INTEGER, now);
    this.bySource = new AnonRate(positiveInt(o.perSource, NEWCOMER_PER_SOURCE), total, now);
  }
  take(principal: string, source: string | undefined, hasHistory: boolean): number {
    if (hasHistory) return 0;
    return this.byPrincipal.take(principal ? "p:" + principal : undefined) || this.bySource.take(source);
  }
}
