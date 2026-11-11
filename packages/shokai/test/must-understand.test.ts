// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, expert review SHK-03 (provisional, C289): must-understand members and unknown enum values (SPEC Conventions).
// A mandate carrying supersedes.hold in crit is refused by a reader that doesn't implement it (no silent widening); unknown
// decision, disposition, reason code, retry kind and message type all fail closed. Fictional people.
import { checkCritical, readDecision, readDisposition, readReasonCode, readRetryKind, actOnType } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

function main() {
  console.log("SDK must-understand members (C289)");
  const mandate = { mandate_id: "m-aiko", supersedes: { mandate_id: "m-0", hold: "hold-7" }, crit: ["supersedes.hold"] };
  const old = checkCritical(mandate, ["supersedes"]);
  check(!old.ok && old.reason_code === "UNSUPPORTED_CRITICAL" && old.answer === "not_now" && old.unknown[0] === "supersedes.hold", "an older reader refuses a one-act raise it can't read, instead of a general raise");
  check(checkCritical(mandate, ["supersedes", "supersedes.hold"]).ok, "a reader that implements it accepts");
  check(checkCritical({ mandate_id: "m" }, []).ok, "no crit: ordinary extension rules apply");
  check(!checkCritical({ crit: [] }, []).ok, "an empty crit is malformed");
  check(!checkCritical({ crit: "sensitive" } as Record<string, unknown>, ["sensitive"]).ok, "a crit that isn't an array is malformed");
  check(!checkCritical({ sensitive: true, crit: ["sensitive", "sensitive"] }, ["sensitive"]).ok, "duplicate names are malformed");
  const cr = { fields: [{ name: "diagnosis", sensitive: true }, { name: "party_size" }], crit: ["fields[].sensitive"] };
  check(checkCritical(cr, ["fields[].sensitive"]).ok && !checkCritical(cr, []).ok, "fix check: an array path (fields[].sensitive) is carried when one element has it; a reader without it refuses");
  check(!checkCritical({ fields: [{ name: "a" }], crit: ["fields[].sensitive"] }, ["fields[].sensitive"]).ok, "an array path no element carries is malformed");
  const absent = checkCritical({ crit: ["max_claims"] }, ["max_claims"]);
  check(!absent.ok && absent.malformed === true, "a crit name the payload doesn't carry is malformed");
  check(!checkCritical({ place: { site: "x" }, x_extra: 1, crit: ["place.site", "x_extra"] }, ["place.site"]).ok, "an unknown member listed in crit is refused");

  const d1 = readDecision({ decision: "defer" });
  check(d1.decision === "deny" && d1.disposition === "not_now" && !d1.granted && d1.unknown === true, "an unknown decision reads as deny / not_now, nothing granted");
  check(readDecision({ decision: "grant" }).granted && !readDecision({ decision: "considering" }).granted, "known decisions read as before");
  const d2 = readDecision({ decision: "deny", disposition: "forever" });
  check(d2.disposition === "not_now" && d2.unknown === true, "an unknown disposition reads as not_now, never as never");
  check(readDisposition("never").value === "never", "a known disposition is kept");
  check(readReasonCode("FUTURE_CODE", ["POLICY_DENY"]) === undefined && readReasonCode("POLICY_DENY", ["POLICY_DENY"]) === "POLICY_DENY", "an unknown reason code reads as absent");
  check(readRetryKind("later_maybe") === undefined && readRetryKind("after") === "after", "an unknown retry kind reads as no retry advice");
  check(!actOnType("v06_new_message", ["hello", "invitation_request"]) && actOnType("hello", ["hello"]), "an unknown message type is not acted on");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
try { main(); } catch (e) { console.error(e); process.exitCode = 1; }
