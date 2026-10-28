// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Generates the `passkey_profile` section of conformance/test-vectors.json (v0.3.0-rc4, Appendix A.1, C195): exact origin
// (no port, https only), crossOrigin, topOrigin, and one-tap batches. ECDSA signatures are randomised, so this runs once and the
// output is frozen; verification is deterministic. Run it only to regenerate on purpose:  node tools/gen-passkey-profile-vectors.mjs --write
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, createECDH, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { fileURLToPath } from "node:url";
const C = await import("../reference/engawa/dist/src/crypto.js");
const file = fileURLToPath(new URL("../conformance/test-vectors.json", import.meta.url));
const TV = JSON.parse(readFileSync(file, "utf8"));
const b64u = (b) => Buffer.from(b).toString("base64url");
const label = TV.key_derivation.labels.passkey;
const d = createHash("sha256").update("shokai-demo-passkey:" + label).digest();
const ecdh = createECDH("prime256v1"); ecdh.setPrivateKey(d); const pt = ecdh.getPublicKey();
const priv = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pt.subarray(1, 33)), y: b64u(pt.subarray(33)) }, format: "jwk" });
const did = C.didJwkFromKey(createPublicKey(priv));
if (did !== TV.passkey.did) throw new Error("derived key does not match the passkey vector's did");
const rp = TV.passkey.rp_id, AT = "2026-10-27T09:00:00Z", digest = TV.jcs_digest.digest;
const authData = Buffer.concat([C.sha256(rp), Buffer.from([0x05]), Buffer.from([0, 0, 0, 1])]);
const cred = "cred-" + createHash("sha256").update("passkey-profile").digest("hex").slice(0, 12);
function assertion(clientData, extraWebauthn = {}) {
  const cd = Buffer.from(JSON.stringify(clientData));
  return { alg: "ES256", key_id: did + "#0", signer: did, signed_at: AT, value: b64u(sign("sha256", Buffer.concat([authData, C.sha256(cd)]), priv)),
    webauthn: { authenticator_data: b64u(authData), client_data_json: b64u(cd), credential_id: cred, rp_id: rp, ...extraWebauthn } };
}
const base = (o = {}) => ({ type: "webauthn.get", challenge: digest.slice(8), origin: "https://" + rp, ...o });
const items = [{ item: "card" }, { item: "mandate" }, { item: "owner_link" }].map((p) => ({ payload: p, digest: C.digestOf(p) }));
const ds = items.map((i) => i.digest), bd = C.batchDigest(ds);
const batchSig = assertion({ type: "webauthn.get", challenge: bd.slice(8), origin: "https://" + rp });
const perItem = ds.map((_, i) => ({ ...batchSig, webauthn: { ...batchSig.webauthn, batch: ds, batch_index: i } }));
const one = C.batchDigest([ds[0]]), oneSig = assertion({ type: "webauthn.get", challenge: one.slice(8), origin: "https://" + rp }, { batch: [ds[0]], batch_index: 0 });
const dupD = C.batchDigest([ds[0], ds[0]]), dupSig = assertion({ type: "webauthn.get", challenge: dupD.slice(8), origin: "https://" + rp }, { batch: [ds[0], ds[0]], batch_index: 0 });
const out = {
  note: "v0.3.0-rc4 owner signing profile (Appendix A.1, C195). Key: the passkey vector's key (label key_derivation.labels.passkey). Single-item cases sign jcs_digest.digest; verify each with rp_id = passkey.rp_id and compare the outcome with expect (true = verifies; otherwise the reason a verifier refuses it). Reason codes are the reference's and are informative; the true/false outcome is normative.",
  did, rp_id: rp, digest,
  cases: {
    cross_origin_false: { signature: assertion(base({ crossOrigin: false })), expect: true, why: "crossOrigin present and false is allowed" },
    cross_origin_true: { signature: assertion(base({ crossOrigin: true })), expect: "cross_origin", why: "made inside another site's frame" },
    top_origin_present: { signature: assertion(base({ crossOrigin: false, topOrigin: "https://shop.example" })), expect: "top_origin", why: "topOrigin present" },
    origin_with_port: { signature: assertion(base({ origin: "https://" + rp + ":8443" })), expect: "origin", why: "origin must be exactly https://<rp_id>, no port" },
    origin_http: { signature: assertion(base({ origin: "http://" + rp })), expect: "origin", why: "https only" },
    origin_subdomain: { signature: assertion(base({ origin: "https://sign." + rp })), expect: "origin", why: "exact host; a subdomain of rp_id is not the signing origin" },
  },
  batch: {
    items: items.map((i) => i.payload), digests: ds, batch_digest: bd,
    challenge_rule: "challenge = base64url(raw bytes of digest(JCS({\"batch\": [d1 … dn]}))), in the order the page showed the items",
    signatures: perItem, expect: true,
    negatives: {
      wrong_index: { signature: perItem[0], verify_against: ds[1], expect: "batch_item", why: "signature 0 checked for item 1" },
      not_in_batch: { signature: perItem[0], verify_against: TV.jcs_digest.digest, expect: "batch_item", why: "an item that is not in the batch" },
      batch_of_one: { signature: oneSig, verify_against: ds[0], expect: "batch", why: "a batch needs 2–16 items; sign one item alone" },
      duplicate_item: { signature: dupSig, verify_against: ds[0], expect: "batch", why: "items must be distinct" },
    },
  },
};
// self-check against the reference before writing
const k = C.resolveDid(did); const res = (sig, dg) => { const c = C.checkSig(sig, dg, k, rp); return c.ok ? true : c.why; };
for (const [n, c] of Object.entries(out.cases)) if (res(c.signature, digest) !== c.expect) throw new Error(`${n}: got ${res(c.signature, digest)}`);
perItem.forEach((s, i) => { if (res(s, ds[i]) !== true) throw new Error("batch item " + i); });
for (const [n, c] of Object.entries(out.batch.negatives)) if (res(c.signature, c.verify_against) !== c.expect) throw new Error(`${n}: got ${res(c.signature, c.verify_against)}`);
if (process.argv.includes("--write")) { TV.passkey_profile = out; writeFileSync(file, JSON.stringify(TV, null, 2) + "\n"); console.log("passkey_profile written"); }
else console.log("ok (dry run; --write to replace the frozen section)");
