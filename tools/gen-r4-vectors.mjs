#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Review 4 (R4-01, R4-04): writes two sections of conformance/test-vectors.json and the recorded shokai/0.5 trace G1-v05.
//   possession_proof_v05  byte-exact audience-bound possession proofs (SPEC §2.4, Appendix A.2, C292): visitor→door,
//                         door→visitor, and three negatives (audience absent, another door's audience, a proof object whose
//                         `audience` differs from the signed one).
//   must_understand       crit cases (Conventions, C289): a browse door accepts a card carrying an opt-in member; an unknown
//                         critical member, or a malformed crit, is refused.
//   conformance/golden-v05-g1.json  the opening of a shokai/0.5 visit (greeting, greeting, card_presentation both ways),
//                         every message signed with label-derived keys at fixed times, so every digest and signature is exact.
// Keys derive from public labels (key_derivation). Ed25519 is deterministic, so a rerun writes the same bytes.
//   node tools/gen-r4-vectors.mjs           write
//   node tools/gen-r4-vectors.mjs --check   exit 1 if anything differs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const C = await import(join(root, "reference/engawa/dist/src/crypto.js"));
const TVP = [join(root, "conformance/test-vectors.json"), join(root, "packages/shokai/conformance-data/test-vectors.json")];
const G1P = join(root, "conformance/golden-v05-g1.json");
const AT = "2026-11-01T09:00:00Z";
const visRep = C.ed25519FromLabel("test-vector-1"), visOwner = C.ed25519FromLabel("test-vector-visitor-owner");
const doorRep = C.ed25519FromLabel("test-vector-door"), doorOwner = C.ed25519FromLabel("test-vector-door-owner"), other = C.ed25519FromLabel("test-vector-other-door");
const proof = (k, encounter_id, nonce, audience, objAudience = audience) => {
  const payload = audience === undefined ? { encounter_id, nonce } : { encounter_id, nonce, audience };
  const sig = C.signEd(k, C.digestOf(payload), AT);
  return { payload, jcs: C.jcs(payload), digest: C.digestOf(payload), proof: objAudience === undefined ? sig : { ...sig, audience: objAudience } };
};
const ENC = "tv-05-1", HN = "host-nonce-0501", VN = "visitor-nonce-0501";
const refuse = { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", readiness: "possession_proof", binds: "nothing" };
const pp = {
  note: "Audience-bound possession proofs under shokai/0.5 (SPEC §2.4, C292). The signed payload is JCS({encounter_id, nonce, audience}); the proof object is the Signature plus the same `audience`. A door verifies over its own representative id; a visitor over its own. Keys: key_derivation labels below. Every value is exact.",
  labels: { visitor_representative: "test-vector-1", visitor_owner: "test-vector-visitor-owner", door_representative: "test-vector-door", door_owner: "test-vector-door-owner", other_door: "test-vector-other-door" },
  ids: { visitor_representative: visRep.id, door_representative: doorRep.id, other_door: other.id },
  cases: [
    { name: "visitor_to_door", direction: "visitor→door", verifier_audience: doorRep.id, ...proof(visRep, ENC, HN, doorRep.id), expect: "accept" },
    { name: "door_to_visitor", direction: "door→visitor", verifier_audience: visRep.id, ...proof(doorRep, ENC, VN, visRep.id), expect: "accept" },
    { name: "audience_absent", direction: "visitor→door", verifier_audience: doorRep.id, ...proof(visRep, ENC, HN, undefined), expect: refuse, why: "the shokai/0.3 form, presented under shokai/0.5" },
    { name: "other_doors_audience", direction: "visitor→door", verifier_audience: doorRep.id, ...proof(visRep, ENC, HN, other.id), expect: refuse, why: "made for another door: a relay" },
    { name: "object_audience_differs", direction: "visitor→door", verifier_audience: doorRep.id, ...proof(visRep, ENC, HN, other.id, doorRep.id), expect: refuse, why: "the object names this door but the signature covers another; verifying over this door's id fails" },
  ],
};
const mu = {
  note: "Must-understand members (Conventions, C289; review 4 R4-01). `implemented` = the critical members the reader implements ([] for a Core Door (browse)). accept = the reader reads the artefact; otherwise deny / not_now / UNSUPPORTED_CRITICAL.",
  cases: [
    { name: "browse door, card with owner_prompts and no crit", implemented: [], payload: { card_id: "c-1", owner_prompts: "purchase_only" }, accept: true },
    { name: "browse door, host card with place.site and no crit", implemented: [], payload: { card_id: "h-1", place: { site: "https://tea.example" } }, accept: true },
    { name: "browse door, unknown critical member", implemented: [], payload: { card_id: "c-2", x_narrow: { only: "weekday" }, crit: ["x_narrow"] }, accept: false },
    { name: "reader with supersedes.hold, one-act raise", implemented: ["supersedes.hold"], payload: { mandate_id: "m-1", supersedes: { mandate_id: "m-0", hold: { hold_id: "h-7", act_digest: "sha-256:x" } }, crit: ["supersedes.hold"] }, accept: true },
    { name: "reader without supersedes.hold, one-act raise", implemented: [], payload: { mandate_id: "m-1", supersedes: { mandate_id: "m-0", hold: { hold_id: "h-7", act_digest: "sha-256:x" } }, crit: ["supersedes.hold"] }, accept: false },
    { name: "crit names a member the payload doesn't carry", implemented: ["max_claims"], payload: { kind: "introduction", crit: ["max_claims"] }, accept: false },
    { name: "empty crit", implemented: [], payload: { card_id: "c-3", crit: [] }, accept: false },
    { name: "context request, array path fields[].sensitive, reader implements it", implemented: ["fields[].sensitive"], payload: { kind: "context_request", fields: [{ name: "allergies", sensitive: true }, { name: "party_size" }], crit: ["fields[].sensitive"] }, accept: true },
    { name: "context request, array path fields[].sensitive, reader doesn't", implemented: [], payload: { kind: "context_request", fields: [{ name: "allergies", sensitive: true }], crit: ["fields[].sensitive"] }, accept: false },
    { name: "array path no element carries", implemented: ["fields[].sensitive"], payload: { kind: "context_request", fields: [{ name: "party_size" }], crit: ["fields[].sensitive"] }, accept: false },
  ],
};
const b64uR = (b) => Buffer.from(b).toString("base64url"), raw43 = b64uR(visRep.pubRaw);
const rke = {
  note: "Review 4 R4-07 (SPEC §2.1): representative_key.public_key has one encoding, base64url without padding of the raw 32-byte Ed25519 key (43 characters). Any other form is a malformed card: deny / not_now / CREDENTIAL_REQUIRED, retry with_credential [signed_card], never `never`.",
  representative_id: visRep.id,
  cases: [
    { name: "raw base64url (the one encoding)", public_key: raw43, expect: "accept" },
    { name: "the did:key string", public_key: visRep.id, expect: "malformed" },
    { name: "padded base64url", public_key: raw43 + "=", expect: "malformed" },
    { name: "standard base64 alphabet", public_key: Buffer.from(visRep.pubRaw).toString("base64").replace(/=+$/, ""), expect: Buffer.from(visRep.pubRaw).toString("base64").replace(/=+$/, "") === raw43 ? "accept" : "malformed" },
    { name: "31 bytes", public_key: b64uR(visRep.pubRaw.subarray(0, 31)), expect: "malformed" },
  ],
};
// --- G1-v05: the opening of a shokai/0.5 visit, recorded with fixed keys and times.
const b64u = (b) => Buffer.from(b).toString("base64url");
const card = C.makeSigned({ card_id: "card-tv-visitor", protocol: "shokai/0.5", representative_id: visRep.id,
  principal: { principal_id: visOwner.id, kind: "company", display_name: "Mossgate Studio (fictional)" }, role: "Mossgate Studio's representative agent",
  standing: { tier: "standard" }, mandate_scope: { purposes: ["visitation"], actions: ["menu.view"] }, locales: ["en-US"],
  representative_key: { key_id: visRep.key_id, alg: "Ed25519", public_key: b64u(visRep.pubRaw) }, owner_prompts: "purchase_only",
  issued_at: "2026-10-01T00:00:00Z", expires_at: "2027-04-01T00:00:00Z" }, visOwner, AT);
const HOUSE = { name: "tea", display_name: "Kiyomi Tea (fictional)", principal_id: doorOwner.id, policy: { actions: [{ action: "menu.view", purposes: ["visitation"], spends: false }],
  summary: { name: "tea", display_name: "Kiyomi Tea (fictional)", purpose: { statement: "A tea shop. Browse the menu.", locale: "en-US" }, retention_days: 0 } } };
const hostCard = C.makeSigned({ card_id: "card-tv-door", kind: "host", protocol: "shokai/0.5", representative_id: doorRep.id,
  principal: { principal_id: doorOwner.id, kind: "company", display_name: "Kiyomi Tea (fictional)" }, role: "Front-door representative", standing: { tier: "principal" },
  mandate_scope: { purposes: ["visitation"], actions: ["menu.view"] }, locales: ["en-US"], org_approval: { approver: { name: "Kiyomi Arai (fictional)", role: "Owner" }, approved_at: "2026-10-01T00:00:00Z" },
  representative_key: { key_id: doorRep.key_id, alg: "Ed25519", public_key: b64u(doorRep.pubRaw) },
  place: { principal_id: doorOwner.id, entry: "https://tea.example/shokai/tea/entry", site: "https://tea.example" },
  host_scope: { actions: ["menu.view"], duties: ["seat"] }, house_digest: C.digestOf(HOUSE), summary_digest: C.digestOf(HOUSE.policy.summary), preset: "browse",
  shown_to_owner: { text: "Kiyomi Tea's host representative may welcome visitors and show them the menu (menu.view), until 2027-04-01.", locale: "en-US" },
  issued_at: "2026-10-01T00:00:00Z", expires_at: "2027-04-01T00:00:00Z" }, doorOwner, AT);
let vs = 0, hs = 0; const hdr = (who, type, extra) => ({ protocol: "shokai/0.5", encounter_id: ENC, msg_id: who === "v" ? `${ENC}-v${++vs}` : `${ENC}-h${++hs}`, sent_at: AT, from: who === "v" ? visRep.id : doorRep.id, ...extra, type });
const m1 = C.makeSigned(hdr("v", "greeting", { locales: ["en-US"], nonce: VN }), visRep, AT);
const m2 = C.makeSigned(hdr("h", "greeting", { to: visRep.id, locales: ["en-US"], nonce: HN }), doorRep, AT);
const m3 = C.makeSigned(hdr("v", "card_presentation", { to: doorRep.id, card, possession_proof: pp.cases[0].proof }), visRep, AT);
const m4 = C.makeSigned(hdr("h", "card_presentation", { to: visRep.id, in_reply_to: m3.payload.msg_id, card: hostCard, possession_proof: pp.cases[1].proof }), doorRep, AT);
const g1 = { trace: "G1-v05", protocol: "shokai/0.5", spec: "0.5.0",
  note: "Recorded shokai/0.5 opening (SPEC §2.2, §2.4, §3.2; C292, C289): byte-exact. Keys from key_derivation labels (test-vectors.json possession_proof_v05.labels), all times " + AT + ". The visitor card carries owner_prompts and the host card place.site, neither in crit (R4-01). The host card is complete (the C3 members, org_approval for an organization, host_scope, house_digest over the recorded house config, summary_digest, shown_to_owner), so a conformant visitor replaying the trace continues. Check: every payload_digest = digest(JCS(payload)), every signature verifies and regenerates identically (Ed25519), both proofs verify over their audience and fail without it.",
  house: HOUSE, messages: [m1, m2, m3, m4] };
// Review 6 R6-05 (§2.2, C284): one reading. Each case is a whole body as received (text), accept or reject.
const ijson = { note: "SPEC §2.2 C284 (review 6 R6-05): each `text` is a body exactly as received; `expect` is accept or reject. Numbers: the token, parsed to the nearest double and re-serialised per RFC 8785 §3.2.2.3, must denote the same value.",
  cases: [
    ["plain object", '{"a":1,"b":"x"}', "accept"],
    ["duplicate name at top", '{"a":1,"a":2}', "reject"],
    ["duplicate name at depth", '{"p":{"q":[{"r":1,"r":1}]}}', "reject"],
    ["escaped-equal names", '{"a":1,"\\u0061":2}', "reject"],
    ["same name in sibling objects", '{"x":{"a":1},"y":{"a":2}}', "accept"],
    ["escaped lone surrogate", '{"s":"\\ud800"}', "reject"],
    ["escaped surrogate pair", '{"s":"\\ud83d\\ude00"}', "accept"],
    ["raw lone surrogate", '{"s":"\ud800"}', "reject"],
    ["byte-order mark", '\ufeff{"a":1}', "reject"],
    ["trailing content", '{"a":1} x', "reject"],
    ["control character in a string", '{"s":"a\u0001b"}', "reject"],
    ["number 1e400 (overflow)", '{"n":1e400}', "reject"],
    ["number 1e-400 (underflow)", '{"n":1e-400}', "reject"],
    ["number 9007199254740993 (2^53+1, not a double)", '{"n":9007199254740993}', "reject"],
    ["number 1152921504606846976 (2^60: a double, but JCS writes 1152921504606847000)", '{"n":1152921504606846976}', "reject"],
    ["number -0", '{"n":-0}', "accept"],
    ["number 0.1", '{"n":0.1}', "accept"],
    ["number 1.0E2", '{"n":1.0E2}', "accept"],
    ["number 0.1000000000000000055511151231257827 (over-precise)", '{"n":0.1000000000000000055511151231257827}', "reject"],
    ["number 1.00000000000000000001 (over-precise)", '{"n":1.00000000000000000001}', "reject"],
  ].map(([name, text, expect]) => ({ name, text, expect })) };
const out = (o) => JSON.stringify(o, null, 2) + "\n";
const check = process.argv.includes("--check"); let drift = 0;
for (const p of TVP) { const tv = JSON.parse(readFileSync(p, "utf8")); const want = { ...tv, possession_proof_v05: pp, must_understand: mu, representative_key_encoding: rke, ijson_c284: ijson };
  const body = out(want); if (readFileSync(p, "utf8") !== body) { if (check) { console.error("drift: " + p); drift++; } else writeFileSync(p, body); } }
if (!existsSync(G1P) || readFileSync(G1P, "utf8") !== out(g1)) { if (check) { console.error("drift: " + G1P); drift++; } else writeFileSync(G1P, out(g1)); }
if (check && drift) process.exit(1);
console.log(check ? "gen-r4-vectors: current ✓" : "gen-r4-vectors: wrote possession_proof_v05, must_understand and conformance/golden-v05-g1.json");
