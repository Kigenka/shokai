// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, SHK-02 (C288): setup failures never count toward probing and never yield `never`; they back off within a bound.
// Only signed misconduct escalates to `never`, which carries an expiry (at most 180 days) and an appeal path (SPEC §9.3, §2.4).
// Fictional people.
import { classify, PenaltyLedger } from "../src/penalties.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

async function main() {
  console.log("SDK graduated penalties (C288)");
  const t0 = Date.parse("2026-11-10T09:00:00Z");
  const at = (s: number) => new Date(t0 + s * 1e3).toISOString();
  const ledger = () => new PenaltyLedger({ appeal: { kind: "url", url: "https://example.org/places/taste-blend/appeal" } });

  // Three distinct unlisted purposes from a fresh principal.
  const L = ledger();
  const hana = "did:example:hana";
  const kinds = ["gift-swap", "survey", "resale"].map(() => classify("PURPOSE_NOT_SERVED", { purpose: "unlisted" }));
  check(kinds.every((k) => k === "setup"), "PURPOSE_NOT_SERVED for an unlisted purpose classifies as setup");
  const outs = kinds.map((k, i) => L.record(hana, k, at(i)));
  check(outs.every((o) => o.disposition === "not_now"), "three distinct unlisted purposes from a fresh principal never give never");
  check(classify("PURPOSE_NOT_SERVED", { purpose: "refused" }) === "setup" && classify("REQUEST_INCOMPLETE") === "setup" && classify(undefined, { schemaError: true }) === "setup",
    "a refused listed purpose, REQUEST_INCOMPLETE and a schema error are setup failures");

  // A possession proof signed over the wrong nonce.
  const L2 = ledger();
  const ren = "did:example:ren";
  const wk = classify("CREDENTIAL_REQUIRED", { proof: "wrong_nonce" });
  check(wk === "setup", "a wrong-nonce proof classifies as setup");
  const w = L2.record(ren, wk, at(0));
  check(w.disposition === "not_now" && (w as any).retryAfterS === 60, "the first wrong-nonce proof gives not_now with a 60 s retry");

  // Backoff grows but is capped.
  const retries: number[] = [];
  for (let i = 1; i <= 10; i++) { const o = L2.record(ren, "setup", at(i * 10)); retries.push(o.disposition === "not_now" ? o.retryAfterS : -1); }
  check(retries.every((r) => r > 0), "repeated setup failures never give never");
  check(retries.every((r, i) => i === 0 || r >= retries[i - 1]) && retries[0] > 60, "the retry grows with repeats");
  check(Math.max(...retries) === 3600 && retries.every((r) => r <= 3600), "the retry is capped at one hour");
  const quiet = L2.record(ren, "setup", at(10 * 10 + 2 * 86400));
  check(quiet.disposition === "not_now" && quiet.retryAfterS === 60, "after a quiet day the backoff starts over");

  // Warnings and heuristics never ban.
  check(classify(undefined, { signed: true, finding: "copied_proof", heuristic: true }) === "other", "heuristic detection alone is not signed misconduct");
  check(classify(undefined, { finding: "forged_claim" }) === "other", "an unsigned finding is not signed misconduct");
  const L3 = ledger();
  const warn = [0, 1, 2, 3, 4].map((i) => L3.record("did:example:sora", "other", at(i)));
  check(warn.every((o) => o.disposition === "not_now" && o.retryAfterS === 60), "warnings never ban and don't lengthen the retry");

  // Signed misconduct escalates to never with expiry and appeal.
  const L4 = ledger();
  const kenta = "did:example:kenta";
  const mk = classify(undefined, { signed: true, finding: "copied_proof" });
  check(mk === "signed_misconduct", "a signed copied possession proof is signed misconduct");
  check(classify(undefined, { signed: true, finding: "replay" }) === "signed_misconduct" && classify(undefined, { signed: true, finding: "contradicting_claim" }) === "signed_misconduct",
    "a signed replay and a contradicting signed claim are signed misconduct");
  const n = L4.record(kenta, mk, at(0));
  const exp = n.disposition === "never" ? Date.parse(n.expiresAt) : NaN;
  check(n.disposition === "never", "signed misconduct escalates to never");
  check(Number.isFinite(exp) && exp > t0 && exp <= t0 + 180 * 86400e3, "the never carries an expiry within 180 days");
  check(n.disposition === "never" && n.appeal.kind === "url" && n.appeal.url.startsWith("https://"), "the never carries an appeal path");
  const during = L4.record(kenta, "setup", at(86400));
  check(during.disposition === "never", "while the never stands, later attempts stay never");

  // Expiry lifts it.
  check(L4.status(kenta, new Date(exp + 1000)) === undefined, "after expiry the never is lifted");
  const after = L4.record(kenta, "setup", new Date(exp + 2000));
  check(after.disposition === "not_now" && after.retryAfterS === 60, "after expiry a setup failure gets a short not_now again");

  // Options guard the bounds.
  let threw = false; try { new PenaltyLedger({ appeal: { kind: "owner_signed_message" }, neverDays: 365 }); } catch { threw = true; }
  check(threw, "a never longer than 180 days is refused");
  let threw2 = false; try { new PenaltyLedger({} as any); } catch { threw2 = true; }
  check(threw2, "a ledger without an appeal path is refused");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
