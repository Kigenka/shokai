// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Expert-review follow-ups in the reference: C286 (place-side allowance ledger, SPEC §5.2) and C289 (`crit`, SPEC Conventions).
import { AllowanceLedger, critProblem, type AllowanceRef } from "../src/ext050.js";
import { parseMoney } from "../src/crypto.js";

let pass = 0, fail = 0;
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.log("FAIL", name); } };
const u = (v: string) => parseMoney({ value: v, currency: "USD" })!.units;

// C286
const a: AllowanceRef = { allowance_id: "al-1", grant_digest: "sha-256:g", valid_from: "2026-11-01T00:00:00Z",
  spend: { currency: "USD", per_period: { units: u("50.00"), period: "P1D" }, per_seat: u("30.00") } };
const L = new AllowanceLedger(); const now = "2026-11-04T10:00:00Z";
ok(L.spend(a, "seat-1", u("25.00"), "USD", now).ok, "C286 first spend fits");
const s2 = L.spend(a, "seat-1", u("10.00"), "USD", now); ok(!s2.ok && s2.which === "per_seat", "C286 per-seat cap holds");
ok(L.spend(a, "seat-2", u("20.00"), "USD", now).ok, "C286 a fresh seat (new mandate) still draws on the same grant");
const s4 = L.spend(a, "seat-3", u("10.00"), "USD", now); ok(!s4.ok && s4.which === "per_period" && s4.retryAfter === "2026-11-05T00:00:00Z", "C286 per-period cap across mandates, retry at next window");
ok(L.spend(a, "seat-3", u("10.00"), "USD", "2026-11-05T00:00:01Z").ok, "C286 next window renews");
ok(!L.spend(a, "seat-4", u("1.00"), "EUR", now).ok, "C286 currency mismatch refused");
ok(!L.spend({ ...a, spend: undefined }, "seat-5", u("1.00"), "USD", now).ok, "C286 a grant with no spend refuses spending (D11)");
L.release(a, "seat-2", u("20.00"), now); ok(L.spend(a, "seat-6", u("20.00"), "USD", now).ok, "C286 a release (C194) gives the amount back");

// C289
ok(critProblem({ a: 1 }) === null, "C289 no crit");
ok(critProblem({ crit: ["owner_prompts"], owner_prompts: "never" }) === null, "C289 known crit member");
ok(critProblem({ crit: ["supersedes.hold"], supersedes: { hold: "h" } }) === null, "C289 dotted path");
ok(critProblem({ crit: ["x-new"], "x-new": 1 })?.startsWith("crit_unknown") === true, "C289 unknown crit member refused");
ok(critProblem({ crit: [] }) === "crit_malformed", "C289 empty crit malformed");
ok(critProblem({ crit: ["sensitive", "sensitive"], sensitive: 1 }) === "crit_malformed", "C289 duplicate malformed");
ok(critProblem({ crit: ["max_claims"] }) === "crit_names_absent_member", "C289 names a member not carried");

console.log(`ext050 (C286, C289 in the reference): ${pass}/${pass + fail}`);
if (fail) process.exit(1);
