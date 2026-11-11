#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Byte-exact shokai/0.5 recorded traces (owner ask 2026-11-05):
//   1. G1-v05 browse opening — delegated to gen-r4-vectors.mjs (conformance/golden-v05-g1.json)
//   2. Relay refusal — possession proof made for another door (conformance/golden-v05-relay.json)
//   3. Allowance + ordinary purchase hold — closed artefacts under an under_allowance mandate
//      (conformance/golden-v05-allowance-hold.json)
// Keys: ed25519FromLabel (deterministic). Fixed times.
//   node tools/gen-v05-byte-traces.mjs
//   node tools/gen-v05-byte-traces.mjs --check
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const out = (o) => JSON.stringify(o, null, 2) + "\n";

// 1. G1-v05 + possession_proof vectors (includes relay case source)
const r4 = spawnSync(process.execPath, [join(root, "tools/gen-r4-vectors.mjs"), ...(check ? ["--check"] : [])], { stdio: "inherit" });
if (r4.status) process.exit(r4.status);

const C = await import(join(root, "reference/engawa/dist/src/crypto.js"));
const AT = "2026-11-01T09:00:00Z";
const visRep = C.ed25519FromLabel("test-vector-1");
const doorRep = C.ed25519FromLabel("test-vector-door");
const other = C.ed25519FromLabel("test-vector-other-door");
const ENC = "tv-05-1", HN = "host-nonce-0501";

// 2. Relay refusal (byte-exact proof case)
const payload = { encounter_id: ENC, nonce: HN, audience: other.id };
const digest = C.digestOf(payload);
const sig = C.signEd(visRep, digest, AT);
const relay = {
  trace: "R1-v05-relay",
  protocol: "shokai/0.5",
  spec: "0.5.0",
  note: "Byte-exact: a possession proof whose audience is another door (a relay). The verifying door (test-vector-door) MUST refuse it under shokai/0.5 (SPEC §2.4, C292). Keys from key_derivation labels; time " + AT + ".",
  labels: { visitor_representative: "test-vector-1", door_representative: "test-vector-door", other_door: "test-vector-other-door" },
  ids: { visitor_representative: visRep.id, door_representative: doorRep.id, other_door: other.id },
  verifier_audience: doorRep.id,
  signed_payload: payload,
  jcs: C.jcs(payload),
  digest,
  proof: { ...sig, audience: other.id },
  expect: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", readiness: "possession_proof", binds: "nothing" },
};
const relayPath = join(root, "conformance/golden-v05-relay.json");
if (!existsSync(relayPath) || readFileSync(relayPath, "utf8") !== out(relay)) {
  if (check) { console.error("drift: " + relayPath); process.exit(1); }
  writeFileSync(relayPath, out(relay));
}

// 3. Allowance + ordinary purchase hold — closed LimitRequest is NOT used (over-limit forbidden under allowance).
//    Record the under_allowance mandate binding + an act_held without over_limit (ordinary hold for owner).
const visOwner = C.ed25519FromLabel("test-vector-visitor-owner");
const b64u = (b) => Buffer.from(b).toString("base64url");
const allowanceId = "allow-tv-05", grantId = "grant-tv-05";
const grantDigest = C.digestOf({ allowance_id: allowanceId, grant_id: grantId, per_seat: { value: "50.00", currency: "USD" } });
const allowanceDigest = C.digestOf({ allowance_id: allowanceId, principal_id: visOwner.id });
const mandatePayload = {
  mandate_id: "m-tv-allow-1",
  principal_id: visOwner.id, representative_id: visRep.id, card_id: "card-tv-visitor",
  purpose: { code: "purchase", statement: "Buying tea at Kettle & Leaf.", locale: "en-US" }, allowed_actions: ["tea.order"],
  limits: { max_amount: { value: "50.00", currency: "USD" } },
  under_allowance: { allowance_id: allowanceId, allowance_digest: allowanceDigest, grant_digest: grantDigest },
  valid_from: AT, expires_at: "2026-11-01T12:00:00Z",
  shown_to_owner: { text: "Buy tea at Kettle & Leaf under today's allowance, up to USD 50.00.", locale: "en-US" },
};
const mandate = C.makeSigned(mandatePayload, visRep, AT); // representative-signed under allowance
const holdId = "hold-tv-allow-1";
const actDigest = C.digestOf({ type: "act", tool: "tea.order", amount: { value: "12.00", currency: "USD" }, payment_ref: "a-1" });
const held = {
  type: "act_held", protocol: "shokai/0.5", encounter_id: "tv-05-allow-1", msg_id: "tv-05-allow-1-h1",
  sent_at: AT, from: doorRep.id, to: visRep.id, in_reply_to: "tv-05-allow-1-v5",
  seat_id: "seat-tv-allow-1", tool: "tea.order", amount: { value: "12.00", currency: "USD" },
  hold_id: holdId, act_digest: actDigest, expires_at: "2026-11-01T09:05:00Z",
  // no over_limit: ordinary purchase hold under an allowance (C230 / R4-09)
};
const heldEnv = C.makeSigned(held, doorRep, AT);
const allowHold = {
  trace: "A1-v05-allowance-hold",
  protocol: "shokai/0.5",
  spec: "0.5.0",
  note: "Byte-exact artefacts for an ordinary purchase hold under an under_allowance mandate (SPEC §5.2, §7.3). No over_limit member: a place MUST NOT hold above the limit under an allowance. Keys from labels; time " + AT + ". Digests and signatures regenerate identically.",
  labels: { visitor_representative: "test-vector-1", visitor_owner: "test-vector-visitor-owner", door_representative: "test-vector-door" },
  mandate,
  act_held: heldEnv,
  checks: {
    under_allowance: true,
    over_limit_absent: !("over_limit" in held),
    act_digest_matches: held.act_digest === actDigest,
  },
};
const allowPath = join(root, "conformance/golden-v05-allowance-hold.json");
if (!existsSync(allowPath) || readFileSync(allowPath, "utf8") !== out(allowHold)) {
  if (check) { console.error("drift: " + allowPath); process.exit(1); }
  writeFileSync(allowPath, out(allowHold));
}

console.log(check
  ? "gen-v05-byte-traces: G1-v05 + relay + allowance-hold current ✓"
  : "gen-v05-byte-traces: wrote/checked golden-v05-g1, golden-v05-relay, golden-v05-allowance-hold");
