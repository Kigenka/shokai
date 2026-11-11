// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, expert review SHK-05 (provisional, C286): a place caps spending drawn from one allowance grant at its own door (SPEC §5.2).
// Ten per-visit mandates under a per_seat 40 / per_period 100 a month grant cannot spend 400 at one place. Fictional people.
// Scale: remainingCents / toCents use millionths of the major unit (same as parseMoney / Amt.units, C284), not ISO 4217 cents.
import { AllowanceLedger as UnitsLedger } from "../src/index.js";
import { AllowanceLedger as CoreLedger } from "../src/core/ext050.js";
import { AllowanceLedger, toCents, type AllowanceRef } from "../src/allowance-cap.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const units = (major: string) => toCents(major); // 10^6 scale

function main() {
  console.log("SDK allowance cap (C286)");
  let now = "2026-11-05T10:00:00Z";
  const L = new AllowanceLedger({ now: () => now });
  const a: AllowanceRef = { allowance_id: "allow-mei", grant_digest: "gd-groceries", valid_from: "2026-10-31T00:00:00Z",
    spend: { currency: "USD", per_seat: "40.00", per_period: { value: "100.00", period: "P1M" } } };

  // The expert's reproduction: ten mandates, 40 each, one place.
  const ok: boolean[] = [];
  for (let i = 0; i < 10; i++) ok.push(L.spend(a, `seat-${i}`, "40.00", "USD").ok);
  check(ok.filter(Boolean).length === 2, "only two 40.00 spends fit a 100.00 month: " + ok.map((x) => (x ? "y" : "n")).join(""));
  const third = L.check(a, "seat-x", "40.00", "USD");
  check(!third.ok && third.which === "per_period" && third.answer === "not_now" && third.reason_code === "SEAT_SCOPE_EXCEEDED", "the third is not_now / SEAT_SCOPE_EXCEEDED (per_period)");
  check(!third.ok && third.remainingCents === units("20.00"), "the refusal states 20.00 remaining (millionths scale)");
  check(!third.ok && third.retryAfter === "2026-11-30T00:00:00Z", "retry after names the next window (31 Oct anchor clamps to 30 Nov)");
  check(L.spend(a, "seat-y", "20.00", "USD").ok, "the remaining 20.00 can still be spent");
  check(!L.check(a, "seat-z", "0.01", "USD").ok, "then nothing is left this window");

  // Per seat.
  const L2 = new AllowanceLedger({ now: () => now });
  check(L2.spend(a, "s", "30.00", "USD").ok && !L2.check(a, "s", "10.01", "USD").ok, "two acts in one seat can't pass per_seat 40.00 together");
  const ps = L2.check(a, "s", "10.01", "USD");
  check(!ps.ok && ps.which === "per_seat", "the refusal names per_seat");

  // A fresh grant digest under the same allowance is a different grant; another allowance is unaffected.
  check(L.check({ ...a, allowance_id: "allow-other" }, "s1", "40.00", "USD").ok, "another allowance has its own budget");

  // Next window.
  now = "2026-11-30T00:00:01Z";
  check(L.spend(a, "seat-new", "40.00", "USD").ok, "a new window starts the count again (no carry-over)");

  // No spend, wrong currency, split amounts.
  check(!L.check({ ...a, spend: undefined }, "q", "1.00", "USD").ok, "a grant with no spend allows no spending");
  check(!L.check(a, "q", "1.00", "EUR").ok, "a different currency is refused");
  const L3 = new AllowanceLedger({ now: () => now });
  let n = 0; for (let i = 0; i < 200; i++) if (L3.spend(a, `split-${i}`, "0.75", "USD").ok) n++;
  check(n === 133, "splitting into small acts across seats still stops at the period cap (133 × 0.75)");

  // C284 / D10: decimal major-unit equality; no ISO 4217 per-currency exponents. ¥4,000 == ¥4,000.00; "1.001" is valid.
  check(toCents("4000") === toCents("4000.00") && toCents("4000") === toCents("4000.0"), '"4000" JPY equals "4000.00" / "4000.0" (same millionths)');
  const jpy: AllowanceRef = { allowance_id: "allow-yen", grant_digest: "gd-tea", valid_from: "2026-10-31T00:00:00Z",
    spend: { currency: "JPY", per_period: { value: "4000", period: "P1M" } } };
  const Lj = new AllowanceLedger({ now: () => "2026-11-05T10:00:00Z" });
  check(Lj.spend(jpy, "seat-j", "4000.00", "JPY").ok, "a ¥4,000 limit vs a ¥4,000.00 spend is equal (NOT 100×)");
  check(!Lj.check(jpy, "seat-j2", "0.01", "JPY").ok, "after ¥4,000 spent, nothing remains this window");
  check(toCents("1.001") === 1001000n, '"1.001" (3 fractional digits) is valid at the 10^6 scale');
  check(units("20.00") === 20000000n, "20.00 major units = 20 × 10^6 millionths");

  const uncapped = L.check({ ...a, spend: { currency: "USD" } }, "no-cap", "0.001", "USD");
  check(uncapped.ok && uncapped.remainingCents >= 0n, "Muse: an uncapped grant never returns a negative successful remainder");
  check(UnitsLedger === CoreLedger, "Muse: public micro-unit ledger is exactly the ledger used by the door");
  const core = new UnitsLedger(), ref = { allowance_id: "roundtrip", grant_digest: "grant", valid_from: "2026-11-01T00:00:00Z",
    spend: { currency: "USD", per_seat: 40000000n, per_period: { units: 100000000n, period: "P1M" as const } } };
  core.spend(ref, "s", 40000000n, "USD", "2026-11-05T00:00:00Z");
  const back = new UnitsLedger(); back.restore(JSON.parse(JSON.stringify(core.snapshot("2026-11-05T00:00:00Z"))), "2026-11-05T00:00:00Z");
  check(!back.spend(ref, "s", 1n, "USD", "2026-11-05T00:00:00Z").ok, "Muse: serialization preserves per-seat spend");
  back.release(ref, "s", 1000n, "2026-11-05T00:00:00Z");
  check(back.spend(ref, "s", 1000n, "USD", "2026-11-05T00:00:00Z").ok, "Muse: release uses micro-units, including sub-cent amounts");
  back.prune("2026-12-01T00:00:00Z", new Set());
  const empty = back.snapshot("2026-12-01T00:00:00Z");
  check(empty.spent.length === 0 && empty.seat_spent.length === 0, "Muse: expired windows and ended seats are dropped");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
try { main(); } catch (e) { console.error(e); process.exitCode = 1; }
