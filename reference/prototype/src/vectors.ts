/**
 * v0.2.1 SPEC Appendix A.2: test vectors for the wire crypto (A.1). Writes ../../conformance/test-vectors.json.
 * TEST KEYS ONLY: derived from public labels; never use them for anything real.
 */
import { writeFileSync } from "node:fs";
import { sign as nodeSign } from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalize } from "./jcs.js";
import { digestOf, digestBytes, possessionDigest, signDigest, verifySignature, ed25519FromLabel, passkeyFromLabel, sha256, isCanonicalMoney, rfc4647Lookup, isCanonicalDidJwk, isRfc3339Seconds, resolveKey, sameKey } from "./crypto.js";
import { periodWindowStart } from "./owner.js";
import type { Signature } from "../../../protocol-shapes.js";

export function buildVectors() {
  const at = "2026-10-24T16:00:00Z";
  const k = ed25519FromLabel("test-vector-1");
  const pk = passkeyFromLabel("test-vector-owner");
  const payload = { protocol: "shokai/0.3", encounter_id: "tv-1", msg_id: "tv-1-1", sent_at: at, from: k.did, to: "did:key:z6MkTestHost", type: "greeting", locales: ["ja-JP", "en-US"], nonce: "n-0001", note: "café ✓ 1.0" };
  const jcs = canonicalize(payload);
  const digest = digestOf(payload);
  const sig = signDigest(digest, k, at);
  const wrongBytes: Signature = { ...sig, value: "" };
  // a signature over the UTF-8 digest STRING (the round-1 ambiguity) must NOT verify
  wrongBytes.value = nodeSign(null, Buffer.from(digest, "utf8"), k.privateKey).toString("base64url");
  const poss = possessionDigest("tv-1", "host-nonce-0001");
  const possSig = signDigest(poss, k, at);
  const pkSig = signDigest(digest, pk, at);
  const clientData = JSON.parse(Buffer.from(pkSig.webauthn!.client_data_json, "base64url").toString("utf8"));
  const prefixed = { ...clientData, challenge: Buffer.from(digest, "utf8").toString("base64url") };
  const pkPrefixed: Signature = { ...pkSig, webauthn: { ...pkSig.webauthn!, client_data_json: Buffer.from(JSON.stringify(prefixed)).toString("base64url") } };
  // v0.2.3 negatives: an assertion made for another relying party, and one with UV cleared (UP only).
  const pkWrongRp = signDigest(digest, pk, at, { rpId: "0wners.example" });
  const pkNoUv = signDigest(digest, pk, at, { flags: 0x01 });
  // v0.2.4 negatives: webauthn.rp_id that disagrees with the signed rpIdHash, and a passkey signature with no rp_id.
  const pkRpMismatch = signDigest(digest, pk, at, { rpId: "0wners.example", statedRpId: pk.rpId });
  const pkRpMissing = signDigest(digest, pk, at, { omitRpId: true });
  // v0.2.4 (host-3-021): a platform-signed AllowanceStatus fixture, with its (test) platform key.
  const plat = ed25519FromLabel("test-vector-platform");
  const statusPayload = { allowance_id: "al-tv-1", allowance_digest: digestOf({ allowance_id: "al-tv-1" }), status: "active" as const, issued_at: at, next_update: "2026-10-24T17:00:00Z" };
  const statusDigest = digestOf(statusPayload);
  const allowanceStatus = { payload: statusPayload, payload_digest: statusDigest, signatures: [signDigest(statusDigest, plat, at)] };
  const jwk = JSON.parse(Buffer.from(pk.did.slice("did:jwk:".length), "base64url").toString("utf8"));
  const reordered = "did:jwk:" + Buffer.from(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).toString("base64url");
  const spaced = "did:jwk:" + Buffer.from(JSON.stringify(jwk, null, 1)).toString("base64url");
  return {
    note: "Shōkai test vectors for spec v0.3.0 (SPEC Appendix A.2). TEST KEYS ONLY, derived from public labels. Path in the repository: conformance/test-vectors.json.",
    key_derivation: {
      ed25519: "seed = SHA-256(UTF-8(\"shokai-demo-seed:\" + label)); the 32-byte seed is the RFC 8032 private key",
      p256_passkey: "d = SHA-256(UTF-8(\"shokai-demo-passkey:\" + label)) read as a big-endian integer (the P-256 private scalar)",
      labels: { ed25519: "test-vector-1", passkey: "test-vector-owner", platform: "test-vector-platform" },
    },
    jcs_digest: { payload, jcs, digest, digest_raw_hex: digestBytes(digest).toString("hex") },
    ed25519: {
      seed_hex: sha256("shokai-demo-seed:test-vector-1").toString("hex"), did: k.did, key_id: k.keyId,
      public_key: Buffer.from(k.publicKey.export({ format: "jwk" }).x as string, "base64url").toString("base64url"),
      signed_bytes: "the 32 raw SHA-256 bytes of JCS(payload) (digest_raw_hex)", signature: sig,
      negative_signature_over_digest_string: wrongBytes, expect: { signature: true, negative_signature_over_digest_string: false },
    },
    possession_proof: { encounter_id: "tv-1", nonce: "host-nonce-0001", jcs: canonicalize({ encounter_id: "tv-1", nonce: "host-nonce-0001" }), digest: poss, signature: possSig },
    passkey: {
      did: pk.did, key_id: pk.keyId, rp_id: pk.rpId, origin: `https://${pk.rpId}`, challenge: clientData.challenge, challenge_rule: "base64url(raw 32 digest bytes), no 'sha-256:' prefix",
      signature: pkSig, negative_prefixed_challenge: pkPrefixed, negative_wrong_rp: pkWrongRp, negative_uv_cleared: pkNoUv,
      negative_rp_id_mismatch: pkRpMismatch, negative_rp_id_missing: pkRpMissing,
      rp_rule: "v0.2.4: webauthn.rp_id is REQUIRED and bound by rpIdHash; when the owner's card is known its owner_binding.rp_id MUST equal it; with no card known, verify against webauthn.rp_id",
      expect: { signature: true, signature_with_no_card_known: true, negative_prefixed_challenge: false, negative_wrong_rp: false, negative_uv_cleared: false, negative_rp_id_mismatch: false, negative_rp_id_missing: false },
    },
    allowance_status: {
      rule: "v0.2.4 (G7, §5.2): platform-signed (Ed25519 test key 'test-vector-platform'); fresh while now < next_update and next_update - issued_at <= 1 h (D12)",
      platform_did: plat.did, platform_seed_hex: sha256("shokai-demo-seed:test-vector-platform").toString("hex"), status: allowanceStatus,
      expect: { signature: true, fresh_at: "2026-10-24T16:59:59Z", stale_at: "2026-10-24T17:00:00Z", max_lifetime_s: 3600 },
    },
    did_jwk: {
      rule: "base64url (no padding) of UTF-8 JSON with members kty, crv, x, y in that order, no whitespace; compare keys by parsed JWK, never by string",
      canonical: pk.did, non_canonical_member_order: reordered, non_canonical_whitespace: spaced,
      expect: { canonical: true, non_canonical_member_order: false, non_canonical_whitespace: false, same_key_when_parsed: true },
    },
    timestamps: {
      rule: "RFC 3339, UTC 'Z', whole seconds; ±300 s clock skew tolerated on not-before / expiry checks",
      valid: ["2026-10-24T16:00:00Z", "2026-02-28T23:59:59Z"], invalid: ["2026-10-24T16:00:00.000Z", "2026-10-24T09:00:00-07:00", "2026-10-24 16:00:00Z", "2026-10-24T16:00Z", "1729785600"],
    },
    budget_periods: {
      rule: "consecutive windows anchored at allowance.valid_from (UTC); P1M adds calendar months, clamped to month end",
      cases: [
        { anchor: "2026-10-26T16:00:00Z", period: "P1D", now: "2026-10-27T15:59:59Z", expect_window_start: "2026-10-26T16:00:00Z" },
        { anchor: "2026-10-26T16:00:00Z", period: "P7D", now: "2026-11-03T12:00:00Z", expect_window_start: "2026-11-02T16:00:00Z" },
        { anchor: "2026-01-31T00:00:00Z", period: "P1M", now: "2026-03-01T00:00:00Z", expect_window_start: "2026-02-28T00:00:00Z" },
      ],
    },
    money: { valid: ["0", "64.00", "1000", "0.000001", "42000.00"], invalid: ["1,000.00", "1.000,00", "080.00", "-5", "1e3", "64.", ".5", "1.0000001", " 64"], currency_valid: ["USD", "JPY", "BRL", "EUR"], currency_invalid: ["usd", "US$", "¥"] },
    rfc4647_lookup: [
      { ranges: ["ja-JP"], available: ["ja-JP", "en-US"], default: "en-US", expect: { locale: "ja-JP", match: "exact" } },
      { ranges: ["pt-PT"], available: ["pt", "en-US"], default: "en-US", expect: { locale: "pt", match: "fallback" } },
      { ranges: ["pt-PT"], available: ["pt-BR", "en-US"], default: "en-US", expect: { locale: "en-US", match: "none" } },
      { ranges: ["es-MX", "es-ES"], available: ["en-US", "es-ES"], default: "en-US", expect: { locale: "es-ES", match: "exact" } },
      { ranges: ["es-MX"], available: ["en-US", "es"], default: "en-US", expect: { locale: "es", match: "fallback" } },
      { ranges: ["zh-Hant-TW"], available: ["zh-Hant", "en-US"], default: "en-US", expect: { locale: "zh-Hant", match: "fallback" } },
    ],
  };
}

export function checkVectors(v: ReturnType<typeof buildVectors>): boolean {
  const okJcs = canonicalize(v.jcs_digest.payload) === v.jcs_digest.jcs && digestOf(v.jcs_digest.payload) === v.jcs_digest.digest;
  const okEd = verifySignature(v.jcs_digest.digest, v.ed25519.signature) && !verifySignature(v.jcs_digest.digest, v.ed25519.negative_signature_over_digest_string);
  const okPoss = digestOf({ encounter_id: v.possession_proof.encounter_id, nonce: v.possession_proof.nonce }) === v.possession_proof.digest && verifySignature(v.possession_proof.digest, v.possession_proof.signature);
  const okPk = v.passkey.challenge === digestBytes(v.jcs_digest.digest).toString("base64url") && verifySignature(v.jcs_digest.digest, v.passkey.signature, v.passkey.rp_id) && !verifySignature(v.jcs_digest.digest, v.passkey.negative_prefixed_challenge, v.passkey.rp_id);
  const okMoney = v.money.valid.every((x) => isCanonicalMoney({ value: x, currency: "USD" })) && v.money.invalid.every((x) => !isCanonicalMoney({ value: x, currency: "USD" }))
    && v.money.currency_valid.every((c) => isCanonicalMoney({ value: "1", currency: c })) && v.money.currency_invalid.every((c) => !isCanonicalMoney({ value: "1", currency: c }));
  const okLoc = v.rfc4647_lookup.every((t) => JSON.stringify(rfc4647Lookup(t.ranges, t.available, t.default)) === JSON.stringify(t.expect));
  const okNeg = !verifySignature(v.jcs_digest.digest, v.passkey.negative_wrong_rp, v.passkey.rp_id) && !verifySignature(v.jcs_digest.digest, v.passkey.negative_uv_cleared, v.passkey.rp_id)
    && !verifySignature(v.jcs_digest.digest, v.passkey.negative_rp_id_mismatch) && !verifySignature(v.jcs_digest.digest, v.passkey.negative_rp_id_missing)
    && verifySignature(v.jcs_digest.digest, v.passkey.signature); // v0.2.4: no card known → the signature's own rp_id
  const st = v.allowance_status.status;
  const okStatus = digestOf(st.payload) === st.payload_digest && verifySignature(st.payload_digest, st.signatures[0]) && st.signatures[0].signer === v.allowance_status.platform_did
    && Date.parse(st.payload.next_update) - Date.parse(st.payload.issued_at) <= 3600 * 1000;
  const okJwk = isCanonicalDidJwk(v.did_jwk.canonical) && !isCanonicalDidJwk(v.did_jwk.non_canonical_member_order) && !isCanonicalDidJwk(v.did_jwk.non_canonical_whitespace)
    && sameKey(resolveKey(v.did_jwk.canonical), resolveKey(v.did_jwk.non_canonical_member_order));
  const okTime = v.timestamps.valid.every(isRfc3339Seconds) && v.timestamps.invalid.every((t) => !isRfc3339Seconds(t));
  const okPeriod = v.budget_periods.cases.every((c) => new Date(periodWindowStart(c.anchor, c.period as "P1D", c.now)).toISOString().replace(".000Z", "Z") === c.expect_window_start);
  return okJcs && okEd && okPoss && okPk && okMoney && okLoc && okNeg && okJwk && okTime && okPeriod && okStatus;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = new URL("../../../../../../conformance/test-vectors.json", import.meta.url);
  const v = buildVectors();
  writeFileSync(out, JSON.stringify(v, null, 2) + "\n");
  console.log(`wrote ${fileURLToPath(out)} (self-check: ${checkVectors(v) ? "ok" : "FAILED"})`);
}
