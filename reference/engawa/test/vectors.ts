// Byte-exact vectors for v0.2.4: conformance/test-vectors.json (SPEC Appendix A.2) in full, plus the byte-exact artifacts in the
// golden traces (F13–F19, L0b, G6, G7, PA2): §2.2 envelope and signed bytes, §2.4 possession, §9.1 continuity, A.1 passkeys with
// relying parties, did:jwk canonical form, RFC 3339 timestamps, budget windows, D10 amounts, RFC 4647 lookup.
import fs from "node:fs";
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createHash, createPrivateKey, createPublicKey, createECDH } from "node:crypto";
import { digestOf, jcs, resolveDid, verifySig, checkSig, parseMoney, lookupLocale, b64u, isCanonicalDidJwk, sameDid, isTimestamp, windowStart, didKeyFromEdRaw, edKeyToRaw, MONEY_RE, CURRENCY_RE } from "../src/crypto.js";
import { RealVerifier, possessionPayload } from "../src/verify.js";
import { verifyAllowanceStatus, STATUS_MAX_LIFETIME_S } from "../src/trust.js";
import { normalise, Door, testJudge, DATA_STRINGS } from "../src/inbound.js";
import { ed25519FromLabel } from "../src/crypto.js";

const md = fs.readFileSync(new URL("../../../../conformance/golden-traces.md", import.meta.url), "utf8");
const traces: Record<string, any[]> = {}; { let h = "", inb = false, buf: string[] = [];
  for (const l of md.split("\n")) { if (!inb && /^##+ /.test(l)) { h = l.replace(/^#+ /, "").split(":")[0].split(" ")[0]; continue; }
    if (l.startsWith("```")) { if (inb) { try { (traces[h] ??= []).push(JSON.parse(buf.join("\n"))); } catch { /* not json */ } buf = []; } inb = !inb; continue; }
    if (inb) buf.push(l); } }
const fx = (k: string) => traces[k][0];
const subst = (x: any): any => Array.isArray(x) ? x.map(subst) : x && typeof x === "object"
  ? ("$fixture" in x ? (traces[String(x.$fixture).split(" ")[0]] ? fx(String(x.$fixture).split(" ")[0]) : x) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, subst(v)]))) : x;
const flat = (k: string) => subst(traces[k].flatMap((b) => (Array.isArray(b) ? b : [b])));
let pass = 0, fail = 0; const rows: string[] = [];
const v = (ok: boolean, what: string) => { ok ? pass++ : fail++; rows.push(`  ${ok ? "PASS" : "FAIL"}  ${what}`); };
const rv = new RealVerifier();
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest();

// --- 0. conformance/test-vectors.json (A.2), every section
const TV = JSON.parse(fs.readFileSync(new URL("../../../../conformance/test-vectors.json", import.meta.url), "utf8"));
{
  const J = TV.jcs_digest;
  v(jcs(J.payload) === J.jcs, "A.2 jcs_digest: JCS(payload) byte-exact");
  v(digestOf(J.payload) === J.digest, "A.2 jcs_digest: digest = sha-256:b64url(SHA-256(JCS))");
  v(sha(Buffer.from(J.jcs, "utf8")).toString("hex") === J.digest_raw_hex, "A.2 jcs_digest: digest_raw_hex = the 32 raw bytes");
  const E = TV.ed25519;
  const seedFor = (label: string) => sha(Buffer.from("shokai-demo-seed:" + label, "utf8"));
  v(seedFor(TV.key_derivation.labels.ed25519).toString("hex") === E.seed_hex, "A.2 key_derivation: Ed25519 seed = SHA-256('shokai-demo-seed:test-vector-1')");
  const edPriv = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(E.seed_hex, "hex")]), format: "der", type: "pkcs8" });
  const edRaw = edKeyToRaw(createPublicKey(edPriv));
  v(didKeyFromEdRaw(edRaw) === E.did && b64u(edRaw) === E.public_key && E.key_id === E.did + "#" + E.did.slice(8), "A.2 ed25519: seed → did:key, public_key, key_id");
  const edK = resolveDid(E.did)!;
  v(verifySig(E.signature, J.digest, edK) === E.expect.signature, "A.2 ed25519: signature over the 32 raw digest bytes verifies");
  v(verifySig(E.negative_signature_over_digest_string, J.digest, edK) === E.expect.negative_signature_over_digest_string, "A.2 ed25519: negative (signed the 'sha-256:…' string) fails");
  v(b64u(nodeSign(null, Buffer.from(J.digest_raw_hex, "hex"), edPriv)) === E.signature.value, "A.2 ed25519: our own signature reproduces the vector byte-for-byte (deterministic Ed25519)");
  const PP = TV.possession_proof;
  v(jcs({ encounter_id: PP.encounter_id, nonce: PP.nonce }) === PP.jcs && digestOf(possessionPayload(PP.encounter_id, PP.nonce)) === PP.digest, "A.2 possession_proof: JCS({encounter_id, nonce}) and digest");
  const ppCard = { representative_id: E.did, representative_key: { key_id: E.key_id, alg: "Ed25519", public_key: E.public_key } } as any;
  v(rv.possession(PP.signature, ppCard, PP.encounter_id, PP.nonce), "A.2 possession_proof: signature verifies with the card key");
  v(!rv.possession(PP.signature, ppCard, PP.encounter_id, PP.nonce + "x"), "A.2 possession_proof: another nonce fails");
  const PK = TV.passkey; const pkK = resolveDid(PK.did)!;
  v(PK.challenge === J.digest.slice(8), "A.2 passkey: challenge = base64url(raw digest), no prefix");
  v(verifySig(PK.signature, J.digest, pkK, PK.rp_id) === PK.expect.signature, `A.2 passkey: assertion verifies against rp_id ${PK.rp_id}`);
  v(PK.signature.webauthn.rp_id === PK.rp_id, "A.2 passkey: the assertion states its rp_id (v0.2.4)");
  v(verifySig(PK.signature, J.digest, pkK) === PK.expect.signature_with_no_card_known, "A.2 passkey: with no card known it verifies against the stated rp_id (§2.1 v0.2.4)");
  v(checkSig(PK.signature, J.digest, pkK, "0wners.example").why === "rp_mismatch", "A.2 passkey: a known card naming another rp_id refuses it");
  v(verifySig(PK.negative_rp_id_mismatch, J.digest, pkK) === PK.expect.negative_rp_id_mismatch && verifySig(PK.negative_rp_id_mismatch, J.digest, pkK, PK.rp_id) === false, "A.2 passkey negative: stated rp_id ≠ rpIdHash fails");
  v(verifySig(PK.negative_rp_id_missing, J.digest, pkK) === PK.expect.negative_rp_id_missing && checkSig(PK.negative_rp_id_missing, J.digest, pkK, PK.rp_id).why === "no_rp", "A.2 passkey negative: missing rp_id fails (even with the card known)");
  v(verifySig(PK.negative_wrong_rp, J.digest, pkK, PK.rp_id) === false && checkSig(PK.negative_wrong_rp, J.digest, pkK, PK.rp_id).why === "rp_mismatch", "A.2 passkey negative: an assertion for 0wners.example is refused when the card says owners.example");
  // D12 allowance status (A.2 v0.2.4)
  const AS = TV.allowance_status; const pk = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(AS.platform_seed_hex, "hex")]), format: "der", type: "pkcs8" });
  v(didKeyFromEdRaw(edKeyToRaw(createPublicKey(pk))) === AS.platform_did, "A.2 allowance_status: platform seed → platform did:key");
  v((rv.signed(AS.status, AS.platform_did) === AS.status.payload_digest) === AS.expect.signature, "A.2 allowance_status: platform signature verifies");
  const fakeCard: any = { owner_binding: { platform_key: AS.platform_did } };
  const al: any = { allowance_id: AS.status.payload.allowance_id };
  const stAt = (now: string) => verifyAllowanceStatus(rv, AS.status, al, AS.status.payload.allowance_digest, fakeCard, now);
  v(stAt(AS.expect.fresh_at).ok && !stAt(AS.expect.stale_at).ok && (stAt(AS.expect.stale_at) as any).why === "status_stale", `A.2 allowance_status: fresh at ${AS.expect.fresh_at}, stale at ${AS.expect.stale_at}`);
  v(STATUS_MAX_LIFETIME_S === AS.expect.max_lifetime_s && Date.parse(AS.status.payload.next_update) - Date.parse(AS.status.payload.issued_at) === AS.expect.max_lifetime_s * 1000, "A.2 allowance_status: max lifetime 3600 s (D12)");
  v(verifySig(PK.negative_prefixed_challenge, J.digest, pkK, PK.rp_id) === PK.expect.negative_prefixed_challenge, "A.2 passkey negative: prefixed challenge fails");
  v(verifySig(PK.negative_wrong_rp, J.digest, pkK, PK.rp_id) === PK.expect.negative_wrong_rp, "A.2 passkey negative: wrong rp (origin/rpIdHash) fails");
  v(verifySig(PK.negative_uv_cleared, J.digest, pkK, PK.rp_id) === PK.expect.negative_uv_cleared, "A.2 passkey negative: UV cleared fails");
  // v0.3.0-rc4 owner signing profile (A.1, C195): exact origin, crossOrigin, topOrigin, one-tap batches
  const PF = TV.passkey_profile; const pfK = resolveDid(PF.did)!;
  const outcome = (sig: any, dg: string) => { const c = checkSig(sig, dg, pfK, PF.rp_id); return c.ok ? true : c.why; };
  for (const [n, c] of Object.entries<any>(PF.cases)) v((outcome(c.signature, PF.digest) === true) === (c.expect === true) && outcome(c.signature, PF.digest) === c.expect, `A.1 passkey_profile ${n}: ${c.expect === true ? "verifies" : "refused (" + c.expect + ")"}`);
  v(PF.batch.batch_digest === digestOf({ batch: PF.batch.digests }) && PF.batch.digests.every((d: string, i: number) => d === digestOf(PF.batch.items[i])), "A.1 passkey_profile batch: item digests and the batch digest digest(JCS({batch}))");
  v(PF.batch.signatures.every((sg: any, i: number) => outcome(sg, PF.batch.digests[i]) === true), "A.1 passkey_profile batch: one tap, three items, each verifies at its batch_index");
  for (const [n, c] of Object.entries<any>(PF.batch.negatives)) v(outcome(c.signature, c.verify_against) === c.expect, `A.1 passkey_profile batch negative ${n}: refused (${c.expect})`);
  // P-256 key derivation for the passkey label
  const d = sha(Buffer.from("shokai-demo-passkey:" + TV.key_derivation.labels.passkey, "utf8"));
  const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d); const pub = ecdh.getPublicKey();
  const jwkDid = "did:jwk:" + b64u(Buffer.from(JSON.stringify({ kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) })));
  v(jwkDid === PK.did && PK.key_id === PK.did + "#0", "A.2 key_derivation: passkey scalar → canonical did:jwk (and key_id #0)");
  const DJ = TV.did_jwk;
  v(isCanonicalDidJwk(DJ.canonical) === DJ.expect.canonical, "A.2 did_jwk: canonical form recognised");
  v(isCanonicalDidJwk(DJ.non_canonical_member_order) === DJ.expect.non_canonical_member_order, "A.2 did_jwk: member order ≠ kty,crv,x,y is not canonical");
  v(isCanonicalDidJwk(DJ.non_canonical_whitespace) === DJ.expect.non_canonical_whitespace, "A.2 did_jwk: whitespace is not canonical");
  v(sameDid(DJ.canonical, DJ.non_canonical_member_order) === DJ.expect.same_key_when_parsed && sameDid(DJ.canonical, DJ.non_canonical_whitespace) === DJ.expect.same_key_when_parsed, "A.2 did_jwk: keys compared as parsed JWKs, never by string");
  const T = TV.timestamps;
  v(T.valid.every((x: string) => isTimestamp(x)), "A.2 timestamps valid: " + T.valid.join(" "));
  v(T.invalid.every((x: string) => !isTimestamp(x)), "A.2 timestamps invalid: " + T.invalid.join(" | "));
  for (const c of TV.budget_periods.cases) v(windowStart(c.anchor, c.period, c.now) === c.expect_window_start, `A.2 budget_periods: ${c.period} anchored ${c.anchor}, now ${c.now} → ${c.expect_window_start}`);
  const M = TV.money;
  v(M.valid.every((x: string) => MONEY_RE.test(x) && !!parseMoney({ value: x, currency: "USD" })), "A.2 money valid: " + M.valid.join(" "));
  v(M.invalid.every((x: string) => !parseMoney({ value: x, currency: "USD" })), "A.2 money invalid: " + M.invalid.join(" | "));
  v(M.currency_valid.every((x: string) => CURRENCY_RE.test(x)) && M.currency_invalid.every((x: string) => !parseMoney({ value: "1", currency: x })), "A.2 money currencies: " + M.currency_valid.join(" ") + " ok; " + M.currency_invalid.join(" ") + " refused");
  for (const c of TV.rfc4647_lookup) { const x = lookupLocale(c.ranges, c.available, c.default); v(x.locale === c.expect.locale && x.match === c.expect.match, `A.2 rfc4647_lookup: ${c.ranges.join(",")} vs ${c.available.join(",")} → ${c.expect.locale}/${c.expect.match}`); }
}

// --- 1. JCS + digest
v(jcs({ b: 1, a: [true, null, "é", { d: 2, c: 1 }] }) === '{"a":[true,null,"é",{"c":1,"d":2}],"b":1}', "JCS: key order, nested objects, raw UTF-8");
v(jcs({ n: 1.5, z: -0, e: 1e21, s: "\u2028\"\\" }) === '{"e":1e+21,"n":1.5,"s":"\u2028\\"\\\\","z":0}', "JCS: number forms (-0 → 0, 1e21 → 1e+21), escapes");
const signedFixtures: [string, any][] = [["F13 card", fx("F13")], ["F14 mandate", fx("F14")], ["F15 allowance", fx("F15")], ["F16 invitation", fx("F16")], ["F17 consent", fx("F17")], ["F18 card", fx("F18")], ["F19 card", fx("F19")]];
signedFixtures.push(["F20 allowance status", fx("F20")]);
const g6 = traces["G6"][0]; signedFixtures.push(["G6 act", g6[0]], ["G6 act_result", g6[1]], ["G6 unsigned greeting", g6[2]]);
const g7 = flat("G7").filter((m: any) => m.type === "invitation_request");
g7.forEach((m: any, i: number) => signedFixtures.push([`G7 mandate ${i + 1}`, m.mandate]));
const l0b = flat("L0b"); const l0bReq = l0b.filter((m: any) => m.type === "invitation_request");
for (const [n, s] of signedFixtures) v(digestOf(s.payload) === s.payload_digest, `digest byte-exact: ${n} (${s.payload_digest.slice(0, 22)}…)`);
// cross-references
const f13 = fx("F13"), f14 = fx("F14"), f15 = fx("F15"), f16 = fx("F16"), f17 = fx("F17");
v(l0bReq.every((r: any) => r.card_digest === f13.payload_digest), "L0b card_digest = digest(JCS(F13 card))");
v(l0bReq.every((r: any) => r.mandate.payload_digest === f14.payload_digest), "L0b mandate = F14 (digest)");
const grants = g7.map((m: any) => m.allowance.grant);
v(grants.every((g: any, i: number) => digestOf(g) === g7[i].mandate.payload.under_allowance.grant_digest && f15.payload.grant_digests.includes(digestOf(g))), "F15 grant_digests = digest(JCS(grant)) for learn and buy-small; = under_allowance.grant_digest");
v(g7.every((m: any) => m.mandate.payload.under_allowance.allowance_digest === f15.payload_digest), "under_allowance.allowance_digest = F15 digest");
const pa2 = flat("PA2"); const invRef = pa2.find((m: any) => m.type === "introduction" && m.invitation_ref)?.invitation_ref;
v(invRef?.digest === f16.payload_digest && f17.payload.subject_ref.digest === f16.payload_digest && f17.payload.subject_ref.kind === "invitation", "PA2 invitation_ref digest = F16 digest = F17 subject_ref digest");
v(pa2.filter((m: any) => m.peer_invitation).every((m: any) => m.peer_invitation.invitation.payload_digest === f16.payload_digest && m.peer_invitation.acceptance.payload_digest === f17.payload_digest), "PA2 peer_invitation carries F16 + F17 byte-for-byte");

// --- 2. signatures (real), key resolution
const signerOf = (s: any) => s.signatures[0]?.signer;
const RP = f13.payload.owner_binding?.rp_id;
v(RP === "owners.example", "F13 card names its owner's relying party (owner_binding.rp_id = owners.example)");
for (const [n, s] of signedFixtures.filter(([n]) => !n.includes("unsigned"))) v(rv.signed(s, signerOf(s), undefined, undefined, RP) === s.payload_digest, `signature verifies: ${n} (${s.signatures[0].alg}, ${signerOf(s).slice(0, 12)}…)`);
for (const [n, s] of signedFixtures.filter(([, s]) => s.signatures?.[0]?.alg === "ES256")) {
  const stated = s.signatures[0].webauthn?.rp_id;
  // v0.2.4: with no card known an owner signature verifies against its stated rp_id; one that states none is refused.
  v(stated ? rv.signed(s, signerOf(s)) === s.payload_digest : rv.signed(s, signerOf(s)) === null, `owner signature with no card known: ${n} (${stated ? "states rp_id " + stated + " → verifies" : "no rp_id stated → refused"})`);
  v(rv.signed(s, signerOf(s), undefined, undefined, "engawa.example") === null, `owner signature refused when the known card names another rp: ${n}`);
}
v(g6[2].signatures.length === 0, "G6: the lobby greeting travels with signatures: []");
v(signedFixtures.every(([, s]) => (s.signatures[0] ? s.signatures[0].signer === (s.payload.from ?? s.signatures[0].signer) : true)), "envelope signer = payload.from (G6)");
v(f13.signatures[0].key_id === f13.signatures[0].signer + "#0", "did:jwk key id is #0");
v(g6[0].signatures[0].key_id === g6[0].signatures[0].signer + "#" + g6[0].signatures[0].signer.slice(8), "did:key key id is did#<multibase>");
const danaKey = resolveDid(f13.payload.representative_id)!;
v(b64u(danaKey.key.export({ format: "der", type: "spki" }).subarray(12) as Buffer) === f13.payload.representative_key.public_key, "F13 representative_key.public_key = the key did:key resolves to");
v(rv.cardKeyBinds(f13.payload), "F13 card key binds (representative_id ↔ representative_key ↔ key_id)");
// Ed25519 signs the 32 raw digest bytes, not the string or the JCS bytes.
const actSig = Buffer.from(g6[0].signatures[0].value, "base64url"); const actKey = resolveDid(g6[0].payload.from)!.key;
v(nodeVerify(null, Buffer.from(g6[0].payload_digest.slice(8), "base64url"), actKey, actSig), "Ed25519 over the 32 raw digest bytes: verifies");
v(!nodeVerify(null, Buffer.from(g6[0].payload_digest, "utf8"), actKey, actSig), "Ed25519 over the 'sha-256:…' string: fails (as it must)");
v(!nodeVerify(null, Buffer.from(jcs(g6[0].payload), "utf8"), actKey, actSig), "Ed25519 over the JCS bytes: fails (as it must)");
const tampered = JSON.parse(JSON.stringify(g6[0])); tampered.payload.arguments.amount.value = "65.00";
v(rv.signed(tampered, signerOf(tampered)) === null, "G6 act with amount changed: digest mismatch → rejected");

// F20 (v0.2.4, D12): platform-signed AllowanceStatus; its key derives from the label "platform:owner-chat" (A.2 key_derivation).
{
  const f20 = fx("F20"); const f18 = fx("F18");
  const seed = sha(Buffer.from("shokai-demo-seed:platform:owner-chat", "utf8"));
  const pk = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  const did = didKeyFromEdRaw(edKeyToRaw(createPublicKey(pk)));
  v(did === f18.payload.owner_binding.platform_key && f20.signatures[0].signer === did, "F20: platform key = F18 owner_binding.platform_key = derived from label 'platform:owner-chat'");
  v(Date.parse(f20.payload.next_update) - Date.parse(f20.payload.issued_at) === 3600e3, "F20: lifetime exactly 1 hour (D12)");
}

// --- 3. possession and continuity proofs (L0b)
const pres = l0b.find((m: any) => m.type === "card_presentation"); const hostNonce = l0b.find((m: any) => m.type === "greeting" && m.from === f13.payload.representative_id ? false : m.type === "greeting" && m.nonce && m.from !== pres.from)?.nonce;
v(hostNonce === "kXEVEvqEG5Sgw7FG", "L0b host nonce read from the host greeting");
v(rv.possession(pres.possession_proof, f13.payload, "l0b", hostNonce), "L0b possession proof = Ed25519 over digest(JCS({encounter_id:'l0b', nonce}))");
v(!rv.possession(pres.possession_proof, f13.payload, "l0b", "other-nonce"), "possession proof over another nonce: fails");
v(!rv.possession(pres.possession_proof, f13.payload, "l0b-reuse", hostNonce), "possession proof replayed into another encounter: fails");
v(digestOf(possessionPayload("l0b", hostNonce)) === digestOf({ encounter_id: "l0b", nonce: hostNonce }), "possession payload is exactly {encounter_id, nonce}");
const ck = flat("L0a").find((m: any) => m.continuity_key)?.continuity_key;
for (const r of l0bReq) {
  const p = r.visit_receipt.continuity_proof;
  v(p.signer === ck && rv.detached(p, { encounter_id: r.encounter_id, receipt_id: r.visit_receipt.receipt_id, representative_id: r.from }, ck), `continuity proof (${r.encounter_id}) = continuity_key over {encounter_id, receipt_id, representative_id}`);
  v(!rv.detached(p, { encounter_id: r.encounter_id + "x", receipt_id: r.visit_receipt.receipt_id, representative_id: r.from }, ck), `continuity proof (${r.encounter_id}) bound to its encounter`);
}

// --- 4. App. A.1 passkey assertions (self-made, correctly signed, one rule broken each)
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const k = { alg: "ES256" as const, key: publicKey };
const d = digestOf({ hello: "passkey" });
function assertion(o: { challenge?: string; type?: string; origin?: string; rp?: string; flags?: number }) {
  const cd = Buffer.from(JSON.stringify({ type: o.type ?? "webauthn.get", challenge: o.challenge ?? d.slice(8), origin: o.origin ?? "https://engawa.example" }));
  const ad = Buffer.concat([sha(o.rp ?? "engawa.example"), Buffer.from([o.flags ?? 0x05]), Buffer.from([0, 0, 0, 9])]);
  return { alg: "ES256" as const, key_id: "x#0", signer: "x", signed_at: "2026-10-24T00:00:00Z", value: b64u(nodeSign("sha256", Buffer.concat([ad, sha(cd)]), privateKey)),
    webauthn: { authenticator_data: b64u(ad), client_data_json: b64u(cd), credential_id: "c", rp_id: o.rp ?? "engawa.example" } };
}
const RPE = "engawa.example";
v(verifySig(assertion({}), d, k, RPE), "A.1: well-formed assertion verifies (challenge = base64url digest, no prefix)");
v(checkSig(assertion({ challenge: d }), d, k, RPE).why === "challenge", "A.1: challenge with the 'sha-256:' prefix rejected");
v(checkSig(assertion({ type: "webauthn.create" }), d, k, RPE).why === "type", "A.1: type ≠ webauthn.get rejected");
v(checkSig(assertion({ origin: "https://evil.example" }), d, k, RPE).why === "origin", "A.1: origin ≠ https://<rp_id> rejected");
v(checkSig({ ...assertion({ rp: "evil.example" }), webauthn: { ...assertion({ rp: "evil.example" }).webauthn, rp_id: RPE } }, d, k).why === "rpIdHash", "A.1: rpIdHash ≠ SHA-256(stated rp_id) rejected");
v(checkSig(assertion({ flags: 0x01 }), d, k, RPE).why === "flags", "A.1: UV flag missing rejected");
v(checkSig(assertion({ flags: 0x04 }), d, k, RPE).why === "flags", "A.1: UP flag missing rejected");
v(verifySig({ ...assertion({}) }, d, k, RPE) && verifySig(assertion({ flags: 0x45 }), d, k, RPE), "A.1: signCount and other flag bits ignored");
v(!verifySig(assertion({}), d, k, "owners.example"), "A.1: a valid assertion for engawa.example fails when the known card says owners.example");
v(verifySig(assertion({}), d, k), "A.1: with no card known, verified against the stated rp_id (v0.2.4)");
const noWa = { ...assertion({}) } as any; delete noWa.webauthn; v(checkSig(noWa, d, k, RPE).why === "no_webauthn", "A.1: ES256 without webauthn rejected");
// P-256 did:key (multicodec 0x1200 → 0x80 0x24, compressed point)
const jwk = publicKey.export({ format: "jwk" }) as any; const x = Buffer.from(jwk.x, "base64url"), y = Buffer.from(jwk.y, "base64url");
const comp = Buffer.concat([Buffer.from([y[31] & 1 ? 3 : 2]), x]);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; const b58 = (b: Buffer) => { let n = BigInt("0x" + b.toString("hex")), s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const c of b) { if (c) break; s = "1" + s; } return s; };
const p256did = "did:key:z" + b58(Buffer.concat([Buffer.from([0x80, 0x24]), comp]));
const rk = resolveDid(p256did);
v(!!rk && rk.alg === "ES256" && JSON.stringify(rk.key.export({ format: "jwk" })) === JSON.stringify(publicKey.export({ format: "jwk" })), "P-256 did:key resolves (point decompression)");

// --- 5. amounts (D10)
const ok = ["0", "80", "80.5", "80.00", "0.000001", "1000000", "42000.00"], bad = ["080", "80.", "80.0000001", "-1", "1e3", " 80", "80,00", ".5", "00"];
v(ok.every((s) => !!parseMoney({ value: s, currency: "USD" })), "canonical amounts accepted: " + ok.join(" "));
v(bad.every((s) => !parseMoney({ value: s, currency: "USD" })), "non-canonical amounts rejected: " + bad.join(" | "));
v(!parseMoney({ value: "1", currency: "usd" }) && !parseMoney({ value: "1", currency: "USDX" }) && !parseMoney({ value: 1, currency: "USD" }) && !parseMoney("80.00 USD") && !parseMoney({ value: "1", currency: "USD", note: "x" }), "currency must be ISO [A-Z]{3}; value a string; no extra keys");
const a = parseMoney({ value: "60.00", currency: "USD" })!, b = parseMoney({ value: "60", currency: "USD" })!, c = parseMoney({ value: "59.999999", currency: "USD" })!;
v(a.units === b.units && c.units < a.units, "amounts compare as exact scaled integers (60.00 = 60 > 59.999999)");

// --- 6. RFC 4647 lookup (§6.6 locale_match)
const L = (r: string[], s: string[]) => { const x = lookupLocale(r, s); return `${x.locale}/${x.match}`; };
v(L(["es-MX", "es-ES", "en-US"], ["en-US", "es-ES"]) === "es-ES/exact", "es-MX,es-ES,en-US vs en-US,es-ES → es-ES exact (L0a)");
v(L(["es-MX"], ["en-US", "es-ES"]) === "en-US/none", "es-MX vs en-US,es-ES → default en-US, none (es-MX truncates to es, not es-ES)");
v(L(["zh-Hant-TW"], ["en-US", "zh-Hant"]) === "zh-Hant/fallback", "zh-Hant-TW vs zh-Hant → fallback");
v(L(["de-CH-x-phonebk"], ["en-US", "de-CH"]) === "de-CH/fallback", "private-use subtag and singleton dropped → de-CH fallback");
v(L(["JA-jp"], ["en-US", "ja-JP"]) === "ja-JP/exact", "case-insensitive exact match");

// --- 7. v0.2.9 inbound door (§10, A.2 inbound_door)
{
  const D = TV.inbound_door;
  for (const c of D.normalisation) {
    const n = normalise(c.input, c.format);
    v(n.visible === c.expect.visible && JSON.stringify(n.hidden) === JSON.stringify(c.expect.hidden) && n.flags.invisible_chars === c.expect.invisible_chars
      && n.flags.hidden_styling === c.expect.hidden_styling && n.flags.instruction_like === c.expect.instruction_like, `A.2 inbound_door normalisation: ${JSON.stringify(c.input).slice(0, 60)} → ${JSON.stringify(c.expect.visible).slice(0, 40)}`);
  }
  for (const c of D.ceilings.cases) {
    const door = new Door({ policy: { payload: { valid_from: "2026-10-01T00:00:00Z", trusted_introducers: [], public: { categories: D.ceilings.door_categories, gifts: {}, caps: { per_brand: { count: 9, period: "P1M" } } } } } as any,
      privateNote: { salt: "s", note: { for_you: [], not_for_you: [] } }, secret: Buffer.alloc(32), judge: testJudge });
    const offer = { offer_id: "of-" + c.name, valid_until: "2026-12-31T00:00:00Z", needs_from_owner: [], ...c.offer };
    const tool = offer.kind === "gift" ? "door.gift" : offer.kind === "invitation" ? "door.invite" : "door.present";
    const r = door.judge({ offer, tool, brand: "did:key:z6MkBrand", brandName: "Brand", doorRep: "did:key:z6MkDoor", introducedWeight: c.introduced, priority: c.introduced, now: "2026-11-02T18:00:00Z" });
    v(r.outcome === c.expect && (!c.finding || r.findings.map((f) => f.code + "/" + f.severity).includes(c.finding)), `A.2 inbound_door ceiling: ${c.name} → ${c.expect}${c.finding ? " (" + c.finding + ")" : ""}`);
  }
  v(windowStart(D.uninvited_window.valid_from, "P1M", D.uninvited_window.now) === D.uninvited_window.expect_window_start
    && windowStart(D.uninvited_window.valid_from, "P1M", new Date(Date.parse(D.uninvited_window.expect_window_start) + 32 * 86400e3).toISOString().replace(".000Z", "Z")) === D.uninvited_window.expect_retry_not_before, "A.2 inbound_door: uninvited allowance window and its retry");
  for (const [k, lbl] of [["door", "test-vector-door"], ["brand", "test-vector-brand"], ["introducer", "test-introducer-1"]] as const)
    v(ed25519FromLabel(lbl).id === D.keys[k].did, `A.2 inbound_door keys: ${lbl} → did:key`);
  const VW = D.vouch_with_interest;
  v(jcs(VW.payload) === VW.jcs && digestOf(VW.payload) === VW.payload_digest && rv.signed(VW, D.keys.introducer.did) === VW.payload_digest && VW.payload.introducer_interest === VW.expect.introducer_interest,
    "A.2 inbound_door: a vouch with introducer_interest (signed field, affiliate) verifies byte-exact");
  const tamperedInterest = { ...VW, payload: { ...VW.payload, introducer_interest: "none" } };
  v(rv.signed(tamperedInterest, D.keys.introducer.did) === null, "A.2 inbound_door: changing introducer_interest to 'none' breaks the signature (a paid introduction can't pass as genuine)");
  const OO = D.offer_outcome;
  v(rv.signed(OO, D.keys.door.did) === OO.payload_digest && Object.keys(OO.payload).every((k: string) => OO.expect.keys_only.includes(k)) && OO.payload.offer_digest === D.offer.digest && digestOf(D.offer.payload) === D.offer.digest,
    "A.2 inbound_door: a signed offer_outcome carries only its code, ticket, retry and pairwise ref; offer_digest = digest(JCS(offer))");
  const doorKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), sha(Buffer.from("shokai-demo-seed:test-vector-door", "utf8"))]), format: "der", type: "pkcs8" });
  v(b64u(nodeSign(null, Buffer.from(OO.payload_digest.slice(8), "base64url"), doorKey)) === OO.signatures[0].value, "A.2 inbound_door: our own signature reproduces the offer_outcome byte-for-byte");
  v(DATA_STRINGS.join() === "email,address,phone,marketing_consent,account", "§10: the data strings a gift may never cost");
}

console.log("Test vectors (byte-exact where the bundle supplies the bytes):");
for (const r of rows) console.log(r);
console.log(`\n${pass} vectors pass, ${fail} fail`);
process.exitCode = fail ? 1 : 0;
