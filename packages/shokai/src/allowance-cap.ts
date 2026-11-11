// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Period windows (§5.2, C99) are consecutive and anchored at the UTC instant of the allowance's valid_from: a P1D/P7D/P1M window resets
// at that UTC time of day, not at the owner's local midnight (sign valid_from at local midnight for local-day windows).
// v0.5.0, expert review SHK-05 (provisional, C286): a host-side ledger for spending drawn from a standing allowance (SPEC §5.2).
// One place sees every mandate minted under the same allowance grant, so it caps the grant's spending at its own door per period
// window (anchored at the allowance's valid_from) and per seat, however many per-visit mandates the representative mints.
import { MONEY_RE } from "./core/crypto.js";

import { AllowanceLedger as UnitsLedger, type AllowanceRef as UnitsRef, type CapVerdict as UnitsVerdict } from "./core/ext050.js";

export type Period = "P1D" | "P7D" | "P1M";
export interface GrantSpend { currency: string; per_seat?: string; per_period?: { value: string; period: Period } }
export interface AllowanceRef { allowance_id: string; grant_digest: string; valid_from: string; spend?: GrantSpend }
/**
 * Cap verdict. `remainingCents` keeps its historical name for API stability; the value is millionths of the major unit
 * (same scale as `Amt.units` / `parseMoney`), not ISO 4217 minor units. Comparison is decimal major-unit equality (C284 / D10):
 * `"1000"`, `"1000.0"` and `"1000.00"` count the same in any currency; there is no per-currency exponent table.
 */
export type CapVerdict = { ok: true; remainingCents: bigint } | { ok: false; answer: "not_now"; reason_code: "SEAT_SCOPE_EXCEEDED"; which: "no_spend" | "currency" | "per_seat" | "per_period"; remainingCents: bigint; retryAfter?: string };

/**
 * Canonical Money `value` → millionths of the major unit (10^6 scale, same as `parseMoney` / `Amt.units`).
 * Accepts up to 6 fractional digits (C284). Name kept for API stability; not ISO 4217 "cents".
 * @internal Exported from the root entry for the reference and tests; not part of the supported API (may change before 1.0, moves under ./core in 0.6).
 */
export function toCents(v: string): bigint {
  if (!MONEY_RE.test(v)) throw new Error("not a canonical amount: " + v);
  const [i, f = ""] = v.split(".");
  return BigInt(i!) * 1000000n + BigInt((f + "000000").slice(0, 6));
}

/** @deprecated Decimal-string adapter. New callers use the root AllowanceLedger with bigint Amt.units. */
export class AllowanceLedger {
  private ledger = new UnitsLedger();
  constructor(private opts: { now?: () => string } = {}) {}
  private nowIso() { return this.opts.now ? this.opts.now() : new Date().toISOString(); }
  private ref(a: AllowanceRef): UnitsRef {
    return { ...a, spend: a.spend ? { currency: a.spend.currency,
      ...(a.spend.per_seat !== undefined ? { per_seat: toCents(a.spend.per_seat) } : {}),
      ...(a.spend.per_period ? { per_period: { units: toCents(a.spend.per_period.value), period: a.spend.per_period.period } } : {}) } : undefined };
  }
  private verdict(v: UnitsVerdict): CapVerdict {
    return v.ok ? { ok: true, remainingCents: v.remainingUnits ?? 0n } : { ...v, remainingCents: v.remainingUnits, answer: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" };
  }
  check(a: AllowanceRef, seatId: string, amount: string, currency: string): CapVerdict {
    return this.verdict(this.ledger.check(this.ref(a), seatId, toCents(amount), currency, this.nowIso()));
  }
  spend(a: AllowanceRef, seatId: string, amount: string, currency: string): CapVerdict {
    return this.verdict(this.ledger.spend(this.ref(a), seatId, toCents(amount), currency, this.nowIso()));
  }
  release(a: AllowanceRef, seatId: string, amount: string, at = this.nowIso()): void {
    this.ledger.release(this.ref(a), seatId, toCents(amount), at);
  }
}
