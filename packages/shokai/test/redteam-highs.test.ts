// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team HIGH findings, regression tests (provisional). In process; fictional people.
// §4.1: an introduction card is bound to one place. A card naming place X is rejected ("other_place") at place Y and accepted at X.
// The signature check uses a stub Verifier that only accepts the introducer principal's id, so the test isolates the place binding
// (and the signature-by-introducer rule) in checkIntroductionCard without needing the signing helpers.
import * as V from "../src/core/v050.js";
import { openOnlyVouch, capOpenOnly } from "../src/core/gate.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

const INTRODUCER = "did:web:introducer.example";
const PLACE_X = "did:web:place-x.example";
const PLACE_Y = "did:web:place-y.example";
const NOW = "2026-11-03T12:00:00Z";

// Stub verifier: a signature is "valid" only when checked against the introducer's principal id.
const verifier: any = { signed: (_c: unknown, principal: string) => principal === INTRODUCER };
const badVerifier: any = { signed: () => false };

const LINE: unknown = (V as any).LENDING_LINE;
const card = (placeId: string): any => ({
  payload: {
    kind: "introduction",
    introduction_id: "intro-1",
    introducer: { principal_id: INTRODUCER },
    place: { principal_id: placeId },
    max_claims: 1,
    claim_digests: ["digest-1"],
    issued_at: "2026-11-03T00:00:00Z",
    expires_at: "2026-11-10T00:00:00Z",
    shown_to_owner: { text: typeof LINE === "string" ? LINE : "" },
    revocation_log: "https://introducer.example/revocations",
  },
  payload_digest: "pd-1",
});

function main() {
  console.log("Red team HIGH findings");
  const check_ = (c: any, place: string, vf: any = verifier) => (V.checkIntroductionCard as any)(vf, c, { place, now: NOW }) as { ok: boolean; why?: string };

  // §4.1: one place only.
  const atY = check_(card(PLACE_X), PLACE_Y);
  check(atY.ok === false && atY.why === "other_place", "§4.1: a card naming place X is rejected at place Y with why other_place");
  const atX = check_(card(PLACE_X), PLACE_X);
  if (typeof LINE === "string") check(atX.ok === true, "§4.1: the same card is accepted at place X");
  else check(atX.why !== "other_place", "§4.1: the same card is not rejected as other_place at place X (LENDING_LINE not exported, so full acceptance is not asserted)");
  const atYReverse = check_(card(PLACE_Y), PLACE_X);
  check(atYReverse.ok === false && atYReverse.why === "other_place", "§4.1: a card naming Y is likewise rejected at X");
  const unsigned = check_(card(PLACE_X), PLACE_X, badVerifier);
  check(unsigned.ok === false && unsigned.why === "signature", "an invalid signature is rejected even at the right place");

  // §4 "No accept-anyone for money or accounts" (trusted_introducers "*"): SKIPPED. The decision is made inline in the door's request
  // handling (needsNamedIntroducer plus door state), and the excerpts show neither its export nor its body, so it is not tested here.

  // §4 C276 (H3): a ring of vouches at an accept-anyone place doesn't raise standing; the same vouches at a curated place do.
  const HOST = "did:web:host.example"; const RING = ["did:web:ring-a.example", "did:web:ring-b.example", "did:web:ring-c.example"];
  const open_ = { trusted_introducers: "*" as const };
  const curated = { trusted_introducers: RING };
  const openW = RING.map((r) => capOpenOnly("full", openOnlyVouch(open_, r, HOST)));
  const curW = RING.map((r) => capOpenOnly("full", openOnlyVouch(curated, r, HOST)));
  check(openW.every((w) => w === "reduced") && RING.every((r) => openOnlyVouch(open_, r, HOST)), "ring vouches at an accept-anyone place: reduced, open only (no known status)");
  check(curW.every((w) => w === "full") && RING.every((r) => !openOnlyVouch(curated, r, HOST)), "same vouches at a curated place: full weight, count toward standing");
  check(!openOnlyVouch({ trusted_introducers: "*", established_introducers: [RING[0]] }, RING[0], HOST) && !openOnlyVouch(open_, HOST, HOST), "an introducer the place names, or its own invitation, keeps full weight under \"*\"");
  check(capOpenOnly("suspended", true) === "suspended", "a penalty is never raised by the cap");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main();
