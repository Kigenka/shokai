// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team finding 2a (§2.6, C281, provisional), regression tests. In process; fictional people.
// A seat granted under a card that names no revocation_url lasts at most NO_REVOCATION_SEAT_TTL_S (3600 s), even when the place's
// seat_ttl_s is a day; a card that names a revocation_url keeps the longer seat (it re-checks its list, C265).
// These checks call seatExpiry, the function the gate uses to set every granted seat's expires_at.
import { seatExpiry, NO_REVOCATION_SEAT_TTL_S } from "../src/core/gate.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

const NOW = "2026-11-04T12:00:00Z";
const MANDATE_FAR = "2026-12-31T00:00:00Z";
const LIST = "https://owner.example/revocations";
const secs = (iso: unknown) => (Date.parse(String(iso)) - Date.parse(NOW)) / 1e3;

function main() {
  console.log("No revocation_url seat lifetime (C281)");
  check(NO_REVOCATION_SEAT_TTL_S === 3600, "NO_REVOCATION_SEAT_TTL_S is 3600 seconds");

  // (a) no revocation_url: capped to 3600 s even with seat_ttl_s 86400.
  const a = secs(seatExpiry(NOW, MANDATE_FAR, 86400, undefined, undefined));
  check(a > 0 && a <= 3600, `(a) a card with no revocation_url gets a seat of ≤ 3600 s under seat_ttl_s 86400 (got ${a})`);
  const aEmpty = secs(seatExpiry(NOW, MANDATE_FAR, 86400, undefined, ""));
  check(aEmpty > 0 && aEmpty <= 3600, "(a) an empty revocation_url counts as none");
  const aDefault = secs(seatExpiry(NOW, MANDATE_FAR, undefined, undefined, undefined));
  check(aDefault > 0 && aDefault <= 3600, "(a) the default one-day seat TTL is capped too");
  const aShort = secs(seatExpiry(NOW, MANDATE_FAR, 86400, 600, undefined));
  check(aShort === 600, "(a) a shorter session limit still wins");
  const aMandate = secs(seatExpiry(NOW, "2026-11-04T12:10:00Z", 86400, undefined, undefined));
  check(aMandate === 600, "(a) an earlier mandate expiry still wins");

  // (b) with a revocation_url: the place's longer seat_ttl_s applies.
  const b = secs(seatExpiry(NOW, MANDATE_FAR, 86400, undefined, LIST));
  check(b === 86400, `(b) a card with a revocation_url keeps seat_ttl_s 86400 (got ${b})`);
  const bSession = secs(seatExpiry(NOW, MANDATE_FAR, 86400, 7200, LIST));
  check(bSession === 7200, "(b) its session limit still applies");

  // (c) A delivered CardRevocation ends a no-url seat at once (C198): SKIPPED here. That path (host.ts, seats ending by cardId) is
  // unchanged by C281, and the excerpts available when writing this test didn't show the createDoor / createRepresentative signatures,
  // so an end-to-end door test isn't written against guessed APIs.

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main();
