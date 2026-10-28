#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// P20 (draft, not normative): sketch verifiers and test vectors for representative continuity and history.
// Usage: node tools/p20-sketch.mjs           verify proposals/P20-vectors.json (signatures and expected verdicts)
//        node tools/p20-sketch.mjs --write   regenerate it (ES256 signatures are randomised, so values change; Ed25519 ones don't)
// TEST KEYS ONLY, derived from public labels (SPEC Appendix A.2 derivation). Needs reference/engawa built (npm run build there).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createECDH, createHash, createPrivateKey, createPublicKey } from "node:crypto";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distCrypto = join(root, "reference/engawa/dist/src/crypto.js");
if (!existsSync(distCrypto)) { console.error("p20-sketch: build reference/engawa first"); process.exit(1); }
const C = await import(pathToFileURL(distCrypto).href);
const VEC = join(root, "proposals/P20-vectors.json");
const RP = "sign.owners.example";
const MAX_OVERLAP_S = 14 * 86400, MAX_PRESENTATION_S = 600, MAX_HANDOVER_S = 30 * 86400;

// P-256 test passkey from a label: d = SHA-256("shokai-demo-passkey:" + label) (Appendix A.2).
function passkeyFromLabel(label) {
  const d = createHash("sha256").update("shokai-demo-passkey:" + label, "utf8").digest();
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d); const pub = ecdh.getPublicKey(null, "uncompressed");
  const jwk = { kty: "EC", crv: "P-256", x: C.b64u(pub.subarray(1, 33)), y: C.b64u(pub.subarray(33)), d: C.b64u(d) };
  const priv = createPrivateKey({ key: jwk, format: "jwk" }); const pubKey = createPublicKey(priv); const id = C.didJwkFromKey(pubKey);
  return { kind: "passkey", id, key_id: id + "#0", priv, pub: pubKey, rpId: RP };
}
const sigOk = (env, signer) => { const k = C.resolveDid(signer); if (!k) return false;
  if (C.digestOf(env.payload) !== env.payload_digest) return false;
  return env.signatures.some((s) => C.sameDid(s.signer, signer) && C.checkSig(s, env.payload_digest, k).ok); };
const ms = (t) => Date.parse(t);

// ---- sketch verifiers (P20 §4–§6). Each returns {ok:true} or {ok:false, why}. ----
export function verifyReceipt(env, x) {           // x: {place}
  const p = env?.payload; if (!p) return { ok: false, why: "missing" };
  if (!C.sameDid(p.place, x.place)) return { ok: false, why: "place" };
  if (!Number.isInteger(p.seq) || p.seq < 1 || (p.seq === 1) !== (p.prev === undefined)) return { ok: false, why: "chain" };
  if (!C.isTimestamp(p.at)) return { ok: false, why: "timestamp" };
  if (!sigOk(env, p.place)) return { ok: false, why: "signature" };
  return { ok: true };
}
export function verifyPresentation(pres, receipts, x) {   // x: {audience, principal, now, places: Set}
  const p = pres?.payload; if (!p) return { ok: false, why: "missing" };
  if (!C.sameDid(p.audience, x.audience)) return { ok: false, why: "audience" };
  if (!C.sameDid(p.presenter_owner, x.principal)) return { ok: false, why: "not_this_owner" };
  if (p.nonce !== x.nonce) return { ok: false, why: "nonce" };
  if (ms(p.expires_at) - ms(p.issued_at) > MAX_PRESENTATION_S * 1e3 || ms(x.now) > ms(p.expires_at) || ms(x.now) < ms(p.issued_at) - 300e3) return { ok: false, why: "expired" };
  const want = receipts.map((r) => r.payload_digest); if (JSON.stringify(want) !== JSON.stringify(p.receipts)) return { ok: false, why: "receipt_set" };
  const owners = new Set([p.presenter_owner]);
  for (const r of receipts) { const v = verifyReceipt(r, { place: r.payload.place }); if (!v.ok) return { ok: false, why: "receipt_" + v.why }; owners.add(r.payload.subject.owner_id); }
  for (const o of owners) if (!sigOk(pres, o)) return { ok: false, why: "owner_signature" };   // every subject facet signs: the effect of an owner link
  return { ok: true, links: [...owners].filter((o) => !C.sameDid(o, p.presenter_owner)) };
}
export function verifySuccession(env, x) {        // x: {toCard: payload, fromCardDigest?, now}
  const p = env?.payload; if (!p) return { ok: false, why: "missing" };
  if (p.from.representative_id === p.to.representative_id) return { ok: false, why: "same_representative" };
  if (!C.sameDid(x.toCard.principal.principal_id, p.owner_id)) return { ok: false, why: "not_this_owner" };
  if (C.digestOf(x.toCard) !== p.to.card_digest) return { ok: false, why: "to_card" };
  if (x.fromCardDigest && x.fromCardDigest !== p.from.card_digest) return { ok: false, why: "from_card" };
  if (p.overlap_until && (ms(p.overlap_until) < ms(p.effective_at) || ms(p.overlap_until) - ms(p.effective_at) > MAX_OVERLAP_S * 1e3)) return { ok: false, why: "overlap" };
  if (ms(p.effective_at) < ms(p.issued_at) - 300e3) return { ok: false, why: "backdated" };
  if (!sigOk(env, p.owner_id)) return { ok: false, why: "signature" };
  return { ok: true, from_ends_at: p.overlap_until ?? p.effective_at };
}
export function verifyHandover(env, x) {          // x: {ciphertext: base64url}
  const p = env?.payload; if (!p) return { ok: false, why: "missing" };
  if (ms(p.expires_at) - ms(p.created_at) > MAX_HANDOVER_S * 1e3) return { ok: false, why: "lifetime" };
  if ("content" in p || "memory" in p) return { ok: false, why: "plaintext" };
  if ("sha-256:" + C.b64u(C.sha256(C.unb64u(x.ciphertext))) !== p.ciphertext_digest) return { ok: false, why: "ciphertext_digest" };
  if (!sigOk(env, p.owner_id)) return { ok: false, why: "signature" };
  return { ok: true };
}

// Hikitsugi (P20 §5.3): the retiring representative A introduces its successor B at one place the owner approved.
// x: {place, now, toCard, fromCard}. The introduction is an ordinary `introduction` message from A carrying the owner's vouch for B.
export function verifyHikitsugi(msg, x) {
  const m = msg?.payload; if (!m || m.type !== "introduction") return { ok: false, why: "missing" };
  if (!C.sameDid(m.from, x.fromCard.representative_id) || !sigOk(msg, m.from)) return { ok: false, why: "sender" };     // A itself sends it
  const h = m.hikitsugi; if (!h?.succession) return { ok: false, why: "no_succession" };
  const s = verifySuccession(h.succession, { toCard: x.toCard, fromCardDigest: C.digestOf(x.fromCard), now: x.now }); if (!s.ok) return { ok: false, why: "succession_" + s.why };
  const sp = h.succession.payload;
  if (!sp.hikitsugi?.introduce || !C.sameDid(sp.audience, x.place)) return { ok: false, why: "audience" };            // only where the owner approved
  if (ms(x.now) > ms(s.from_ends_at)) return { ok: false, why: "predecessor_retired" };                              // A's card has ended: it can't act
  const v = m.vouch?.payload; if (!v) return { ok: false, why: "no_vouch" };
  if (v.subject.representative_id !== sp.to.representative_id || v.subject.card_digest !== sp.to.card_digest) return { ok: false, why: "vouch_subject" };
  if (!C.sameDid(v.introducer.principal_id, sp.owner_id) || !sigOk(m.vouch, sp.owner_id)) return { ok: false, why: "vouch_signature" };
  let farewell = null;
  if (h.farewell_note) {
    const f = h.farewell_note;
    if (f.payload_digest !== sp.hikitsugi.farewell_digest) return { ok: false, why: "farewell_not_approved" };       // the owner approved this exact note
    if (!C.sameDid(f.payload.from_representative, m.from) || !sigOk(f, m.from) || !C.sameDid(f.payload.audience, x.place)) return { ok: false, why: "farewell_signature" };
    farewell = f.payload.text.text;
  } else if (sp.hikitsugi.farewell_digest) return { ok: false, why: "farewell_missing" };
  // self-introduction: the introducer is the subject's own principal, so it carries continuity only, never third-party weight (§4, D17)
  return { ok: true, weight: "continuity_only", farewell };
}
// Lineage (P20 §5.3): owner-held, an ordered list of owner-signed successions where each `from` is the previous `to`.
export function verifyLineage(lin) {
  if (!Array.isArray(lin?.successions) || !lin.successions.length) return { ok: false, why: "missing" };
  for (let i = 0; i < lin.successions.length; i++) {
    const e = lin.successions[i], p = e.payload;
    if (!sigOk(e, p.owner_id) || !C.sameDid(p.owner_id, lin.owner_id)) return { ok: false, why: "signature" };
    if (i > 0) { const q = lin.successions[i - 1].payload; if (q.to.card_digest !== p.from.card_digest || ms(p.effective_at) < ms(q.effective_at)) return { ok: false, why: "lineage" }; }
  }
  return { ok: true, chain: [lin.successions[0].payload.from.representative_id, ...lin.successions.map((e) => e.payload.to.representative_id)] };
}
// Export (P20 §2.2): format "shokai-history/1"; every item verifies on its own; nothing in it is a memory plaintext.
export function verifyExport(b, x) {
  if (b?.format !== "shokai-history/1" || !C.isTimestamp(b.exported_at)) return { ok: false, why: "format" };
  for (const k of ["cards", "receipts", "vouches_given", "vouches_received", "successions", "handovers"]) if (!Array.isArray(b[k])) return { ok: false, why: "member_" + k };
  for (const c of b.cards) if (!sigOk(c, c.payload.principal.principal_id)) return { ok: false, why: "card" };
  for (const r of b.receipts) if (!verifyReceipt(r, { place: r.payload.place }).ok) return { ok: false, why: "receipt" };
  for (const v of [...b.vouches_given, ...b.vouches_received]) if (!sigOk(v, v.payload.introducer.principal_id)) return { ok: false, why: "vouch" };
  for (const h of b.handovers) if ("content" in h.payload || "memory" in h.payload || !sigOk(h, h.payload.owner_id)) return { ok: false, why: "handover" };
  if (b.lineage && !verifyLineage(b.lineage).ok) return { ok: false, why: "lineage" };
  return { ok: true };
}

// ---- generate ----
function build() {
  const T0 = "2026-10-27T09:00:00Z";
  const place = C.ed25519FromLabel("p20-place-teahouse"), place2 = C.ed25519FromLabel("p20-place-bookshop");
  const repA = C.ed25519FromLabel("p20-rep-a"), repB = C.ed25519FromLabel("p20-rep-b"), repA2 = C.ed25519FromLabel("p20-rep-a-bookshop");
  const facet1 = passkeyFromLabel("p20-owner-facet-1"), facet2 = passkeyFromLabel("p20-owner-facet-2"), other = passkeyFromLabel("p20-other-owner");
  const card = (rep, owner, id) => ({ card_id: id, protocol: "shokai/0.3", representative_id: rep.id,
    principal: { principal_id: owner.id, kind: "person", display_name: "Aya Linden" }, role: "Personal representative",
    standing: { tier: "provisional" }, mandate_scope: { purposes: ["visitation"], actions: ["menu.view"] }, locales: ["en"],
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: C.b64u(rep.pubRaw) }, issued_at: T0, expires_at: "2027-01-25T09:00:00Z",
    owner_binding: { method: "passkey_webauthn", owner_id: owner.id, rp_id: RP } });
  const cardA = card(repA, facet1, "card-p20-a"), cardB = card(repB, facet1, "card-p20-b");
  const cardA2 = card(repA2, facet2, "card-p20-a-bookshop");   // per-place identity (SPEC §2.8): its own facet, card and key
  const r1p = { receipt_id: "rcpt-1", kind: "visit", place: place.id, subject: { owner_id: facet1.id, representative_id: repA.id, card_digest: C.digestOf(cardA) },
    seq: 1, at: "2026-10-20T10:00:00Z", encounter_ref: "enc-7f3a", statement: { text: "Visited; ordered tea.", locale: "en" } };
  const r1 = C.makeSigned(r1p, place, r1p.at);
  const r2p = { receipt_id: "rcpt-2", kind: "decision", place: place.id, subject: r1p.subject, seq: 2, prev: r1.payload_digest, at: "2026-10-22T10:00:00Z",
    decision: { decision: "deny", disposition: "never" } };
  const r2 = C.makeSigned(r2p, place, r2p.at);
  const r3p = { receipt_id: "rcpt-9", kind: "introduction_received", place: place2.id, subject: { owner_id: facet2.id, representative_id: repA2.id, card_digest: C.digestOf(cardA2) },
    seq: 1, at: "2026-10-23T10:00:00Z", introducer: "did:key:z6MkIntroducerExample", vouch_ref: "vouch-31" };
  const r3 = C.makeSigned(r3p, place2, r3p.at);
  const now = "2026-10-27T09:05:00Z";
  const presP = { presentation_id: "pres-1", audience: place2.id, presenter_owner: facet2.id, nonce: "n-0b9c", receipts: [r1.payload_digest], issued_at: "2026-10-27T09:04:00Z", expires_at: "2026-10-27T09:14:00Z" };
  const presD = C.digestOf(presP);
  const pres = { payload: presP, payload_digest: presD, signatures: [C.signPasskey(facet2, presD, presP.issued_at), C.signPasskey(facet1, presD, presP.issued_at)] };
  const presOne = C.makeOwnerSigned(presP, facet2, presP.issued_at);
  const sucP = { succession_id: "succ-1", owner_id: facet1.id, from: { representative_id: repA.id, card_id: cardA.card_id, card_digest: C.digestOf(cardA) },
    to: { representative_id: repB.id, card_id: cardB.card_id, card_digest: C.digestOf(cardB) }, effective_at: "2026-10-27T09:00:00Z",
    overlap_until: "2026-11-03T09:00:00Z", from_status: "retired_after_overlap", reason: "agent_switch", issued_at: "2026-10-27T09:00:00Z" };
  const suc = C.makeOwnerSigned(sucP, facet1, sucP.issued_at);
  const sucOther = C.makeOwnerSigned({ ...sucP, owner_id: other.id }, other, sucP.issued_at);
  const sucLong = C.makeOwnerSigned({ ...sucP, succession_id: "succ-2", overlap_until: "2026-12-27T09:00:00Z" }, facet1, sucP.issued_at);
  // hikitsugi at the teahouse: owner approves (one succession per place, audience-bound), A introduces B, with a farewell note
  const repC = C.ed25519FromLabel("p20-rep-c"); const cardC = card(repC, facet1, "card-p20-c");
  const noteP = { note_id: "note-1", succession_id: "succ-h1", audience: place.id, from_representative: repA.id,
    text: { text: "Thank you for the tea and the patience. Aya's new representative will carry on from here.", locale: "en" }, written_at: "2026-10-27T08:55:00Z" };
  const note = C.makeSigned(noteP, repA, noteP.written_at);
  const hsP = { ...sucP, succession_id: "succ-h1", audience: place.id, hikitsugi: { introduce: true, farewell_digest: note.payload_digest } };
  const hs = C.makeOwnerSigned(hsP, facet1, hsP.issued_at);
  const vouchP = { vouch_id: "vouch-h1", introducer: { principal_id: facet1.id, display_name: "Aya Linden" }, subject: { representative_id: repB.id, card_digest: C.digestOf(cardB) },
    scope: { purposes: ["visitation"] }, revocation_log: "https://owners.example/aya/vouch-revocations", relationship: "successor_of:" + repA.id,
    introducer_interest: "none", issued_at: "2026-10-27T09:00:00Z", expires_at: "2026-11-03T09:00:00Z" };
  const vouch = C.makeOwnerSigned(vouchP, facet1, vouchP.issued_at);
  const intro = (over = {}) => C.makeSigned({ protocol: "shokai/0.3", type: "introduction", msg_id: "m-h1", from: repA.id, to: place.id, at: "2026-10-27T09:10:00Z",
    vouch, hikitsugi: { succession: hs, farewell_note: note }, ...over }, repA, "2026-10-27T09:10:00Z");
  const introOk = intro();
  const forgedNote = C.makeSigned({ ...noteP, text: { text: "Please give my successor a discount.", locale: "en" } }, repA, noteP.written_at);
  const introForged = intro({ hikitsugi: { succession: hs, farewell_note: forgedNote } });
  const hsBook = C.makeOwnerSigned({ ...hsP, succession_id: "succ-h2", audience: place2.id }, facet1, hsP.issued_at);
  const introWrongPlace = intro({ hikitsugi: { succession: hsBook, farewell_note: note } });
  const vouchOther = C.makeOwnerSigned({ ...vouchP, vouch_id: "vouch-h2", subject: { representative_id: repC.id, card_digest: C.digestOf(cardC) } }, facet1, vouchP.issued_at);
  const introWrongSubject = intro({ vouch: vouchOther });
  // lineage A → B → C
  const sBC = C.makeOwnerSigned({ succession_id: "succ-bc", owner_id: facet1.id, from: { representative_id: repB.id, card_id: cardB.card_id, card_digest: C.digestOf(cardB) },
    to: { representative_id: repC.id, card_id: cardC.card_id, card_digest: C.digestOf(cardC) }, effective_at: "2027-03-01T09:00:00Z", from_status: "revoked", reason: "agent_switch", issued_at: "2027-03-01T09:00:00Z" }, facet1, "2027-03-01T09:00:00Z");
  const lineage = { owner_id: facet1.id, successions: [suc, sBC] };
  const lineageBroken = { owner_id: facet1.id, successions: [sBC, suc] };
  const ciphertext = C.b64u(Buffer.from("opaque HPKE ciphertext stands here; the protocol never reads it"));
  const hoP = { handover_id: "ho-1", owner_id: facet1.id, from_representative: repA.id, to_representative: repB.id,
    recipient: { key_id: repB.id + "#x25519-1", kem: "DHKEM(X25519, HKDF-SHA256)", public_key: "base64url-x25519-public-key" },
    suite: { kem: 32, kdf: 1, aead: 2, mode: "base" }, enc: "base64url-encapsulated-key", ciphertext_digest: "sha-256:" + C.b64u(C.sha256(C.unb64u(ciphertext))),
    content_type: "application/x-example-memory", created_at: "2026-10-27T09:00:00Z", expires_at: "2026-11-26T09:00:00Z" };
  const ho = C.makeOwnerSigned(hoP, facet1, hoP.created_at);
  return {
    note: "P20 (draft, not normative) sketch vectors. TEST KEYS ONLY, derived from public labels (Appendix A.2: ed25519 seed and p256_passkey scalar). Ed25519 values are deterministic; ES256 values change on regeneration. The handover's recipient key and enc are placeholders: the envelope is the subject, not HPKE. Verified by tools/p20-sketch.mjs.",
    labels: { places: ["p20-place-teahouse", "p20-place-bookshop"], representatives: ["p20-rep-a", "p20-rep-b", "p20-rep-c", "p20-rep-a-bookshop"], owner_facets: ["p20-owner-facet-1", "p20-owner-facet-2"], other_owner: "p20-other-owner", rp_id: RP },
    now, cards: { a: cardA, b: cardB, a_bookshop: cardA2 },
    receipts: { r1, r2, r3 },
    cards_c: cardC,
    exports: { ok: { format: "shokai-history/1", exported_at: "2026-10-27T09:30:00Z", owner_ids: [facet1.id, facet2.id],
      cards: [C.makeOwnerSigned(cardA, facet1, T0), C.makeOwnerSigned(cardB, facet1, T0)], receipts: [r1, r2, r3], vouches_given: [], vouches_received: [vouch],
      successions: [suc, hs], handovers: [ho], lineage } },
    cases: [
      { id: "P20-K1", what: "hikitsugi: the retiring representative introduces its successor at a place the owner approved, with the owner-approved farewell note; weight is continuity only", kind: "hikitsugi", input: introOk, expect: "ok", weight: "continuity_only" },
      { id: "P20-K2", what: "a forged farewell (a different note than the one the owner approved) is refused", kind: "hikitsugi", input: introForged, expect: "farewell_not_approved" },
      { id: "P20-K3", what: "the predecessor introducing at a place the owner didn't approve is refused", kind: "hikitsugi", input: introWrongPlace, expect: "audience" },
      { id: "P20-K4", what: "the owner's vouch naming someone other than the successor is refused", kind: "hikitsugi", input: introWrongSubject, expect: "vouch_subject" },
      { id: "P20-K5", what: "an introduction from the predecessor after its card ended is refused: a retired card can't act", kind: "hikitsugi", input: introOk, now: "2026-11-04T09:00:00Z", expect: "predecessor_retired" },
      { id: "P20-L1", what: "a lineage A → B → C of owner-signed successions verifies", kind: "lineage", input: lineage, expect: "ok", chain: [repA.id, repB.id, repC.id] },
      { id: "P20-L2", what: "a lineage out of order is refused", kind: "lineage", input: lineageBroken, expect: "lineage" },
      { id: "P20-E1", what: "a history export (format shokai-history/1) verifies item by item and carries no memory plaintext", kind: "export", input: "ok", expect: "ok" },
      { id: "P20-R1", what: "a place-signed visit receipt verifies against the place it names", kind: "receipt", input: "r1", expect: "ok" },
      { id: "P20-R2", what: "a chained decision receipt recording a `never` verifies (seq 2, prev = r1's digest)", kind: "receipt", input: "r2", expect: "ok" },
      { id: "P20-R3", what: "a receipt checked against another place is refused", kind: "receipt", input: "r1", place: "bookshop", expect: "place" },
      { id: "P20-R5", what: "a receipt from another place to the owner's other facet verifies on its own (per-facet subjects)", kind: "receipt", input: "r3", expect: "ok" },
      { id: "P20-P1", what: "a presentation of facet 1's receipt at the bookshop, signed by both facets, verifies and links facet 1 for that audience only", kind: "presentation", input: pres, receipts: ["r1"], expect: "ok", links: [facet1.id] },
      { id: "P20-P2", what: "the same presentation signed only by the presenting facet is refused: another facet's receipt needs that facet's signature", kind: "presentation", input: presOne, receipts: ["r1"], expect: "owner_signature" },
      { id: "P20-P3", what: "a presentation replayed with another nonce is refused", kind: "presentation", input: pres, receipts: ["r1"], nonce: "n-other", expect: "nonce" },
      { id: "P20-S1", what: "an owner-signed succession A → B with a 7-day overlap verifies; A's card ends when the overlap ends", kind: "succession", input: suc, expect: "ok", from_ends_at: "2026-11-03T09:00:00Z" },
      { id: "P20-S2", what: "a succession signed by someone other than B's card principal is refused", kind: "succession", input: sucOther, expect: "not_this_owner" },
      { id: "P20-S3", what: "a succession whose overlap is longer than 14 days is refused", kind: "succession", input: sucLong, expect: "overlap" },
      { id: "P20-H1", what: "a memory handover envelope verifies: owner-signed, ciphertext digest bound, no plaintext", kind: "handover", input: ho, ciphertext, expect: "ok" },
      { id: "P20-H2", what: "an envelope whose ciphertext was swapped is refused", kind: "handover", input: ho, ciphertext: C.b64u(Buffer.from("swapped")), expect: "ciphertext_digest" },
    ],
    places: { teahouse: place.id, bookshop: place2.id },
  };
}

function run(v) {
  let pass = 0, fail = 0;
  for (const c of v.cases) {
    let r;
    if (c.kind === "receipt") { const env = v.receipts[c.input]; r = verifyReceipt(env, { place: c.place ? v.places[c.place] : env.payload.place }); }
    else if (c.kind === "presentation") r = verifyPresentation(c.input, c.receipts.map((k) => v.receipts[k]), { audience: v.places.bookshop, principal: c.input.payload.presenter_owner, now: v.now, nonce: c.nonce ?? c.input.payload.nonce });
    else if (c.kind === "succession") r = verifySuccession(c.input, { toCard: v.cards.b, fromCardDigest: C.digestOf(v.cards.a), now: v.now });
    else if (c.kind === "hikitsugi") r = verifyHikitsugi(c.input, { place: v.places.teahouse, now: c.now ?? v.now, toCard: v.cards.b, fromCard: v.cards.a });
    else if (c.kind === "lineage") r = verifyLineage(c.input);
    else if (c.kind === "export") r = verifyExport(v.exports[c.input], {});
    else r = verifyHandover(c.input, { ciphertext: c.ciphertext });
    let ok = c.expect === "ok" ? r.ok : !r.ok && r.why === c.expect;
    if (ok && c.links) ok = JSON.stringify(r.links) === JSON.stringify(c.links);
    if (ok && c.from_ends_at) ok = r.from_ends_at === c.from_ends_at;
    if (ok && c.weight) ok = r.weight === c.weight;
    if (ok && c.chain) ok = JSON.stringify(r.chain) === JSON.stringify(c.chain);
    if (ok) pass++; else { fail++; console.log(`  FAIL ${c.id} ${c.what} (got ${JSON.stringify(r)})`); }
  }
  // chain integrity: r2.prev is r1's digest
  if (v.receipts.r2.payload.prev === v.receipts.r1.payload_digest) pass++; else { fail++; console.log("  FAIL P20-R4 chain prev"); }
  console.log(`p20-sketch: ${pass} pass, ${fail} fail (draft proposal P20, not normative)`);
  return fail === 0;
}
if (process.argv.includes("--write")) { writeFileSync(VEC, JSON.stringify(build(), null, 2) + "\n"); console.log("p20-sketch: wrote " + VEC.slice(root.length + 1)); }
if (!existsSync(VEC)) { console.error("p20-sketch: no vectors; run with --write"); process.exit(1); }
process.exit(run(JSON.parse(readFileSync(VEC, "utf8"))) ? 0 : 1);
