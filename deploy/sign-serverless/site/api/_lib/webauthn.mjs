/** Minimal WebAuthn verification (no dependencies) for the Shōkai reference signing page. ES256 only (SIGNING.md, SPEC Appendix A.1). */
import { createHash, createPublicKey, verify as nodeVerify, randomBytes } from "node:crypto";

export const sha256 = (b) => createHash("sha256").update(b).digest();
export const b64u = (b) => Buffer.from(b).toString("base64url");
export const fromB64u = (s) => Buffer.from(s, "base64url");

/** RFC 8785 JCS (same rules as the reference implementation). */
export function canonicalize(v) {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("JCS: non-finite"); return JSON.stringify(v); }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonicalize(x === undefined ? null : x)).join(",") + "]";
  if (typeof v === "object") { const k = Object.keys(v).filter((x) => v[x] !== undefined).sort(); return "{" + k.map((x) => JSON.stringify(x) + ":" + canonicalize(v[x])).join(",") + "}"; }
  throw new Error("JCS: unsupported " + typeof v);
}
export const digestOf = (payload) => "sha-256:" + sha256(Buffer.from(canonicalize(payload), "utf8")).toString("base64url");
export const digestBytes = (d) => fromB64u(d.replace(/^sha-256:/, ""));

/** Minimal CBOR decoder (major types 0–5 and 7 simple values), enough for attestationObject and COSE keys. */
export function cborDecode(buf) {
  let i = 0;
  const len = (ai) => { if (ai < 24) return ai; if (ai === 24) return buf[i++]; if (ai === 25) { const v = buf.readUInt16BE(i); i += 2; return v; } if (ai === 26) { const v = buf.readUInt32BE(i); i += 4; return v; } throw new Error("CBOR: length too large"); };
  const item = () => {
    const b = buf[i++], mt = b >> 5, ai = b & 31;
    switch (mt) {
      case 0: return len(ai);
      case 1: return -1 - len(ai);
      case 2: { const n = len(ai); const v = buf.subarray(i, i + n); i += n; return Buffer.from(v); }
      case 3: { const n = len(ai); const v = buf.subarray(i, i + n).toString("utf8"); i += n; return v; }
      case 4: { const n = len(ai); const a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
      case 5: { const n = len(ai); const m = new Map(); for (let k = 0; k < n; k++) { const key = item(); m.set(key, item()); } return m; }
      case 7: if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; throw new Error("CBOR: unsupported simple");
      default: throw new Error("CBOR: unsupported major type " + mt);
    }
  };
  const v = item();
  return { value: v, rest: i };
}

export function parseAuthData(ad) {
  const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], signCount: ad.readUInt32BE(33) };
  out.up = !!(out.flags & 0x01); out.uv = !!(out.flags & 0x04); out.at = !!(out.flags & 0x40);
  if (out.at) {
    const credIdLen = ad.readUInt16BE(53);
    out.credentialId = ad.subarray(55, 55 + credIdLen);
    const { value } = cborDecode(ad.subarray(55 + credIdLen));
    out.cose = value;
  }
  return out;
}

/** COSE EC2 P-256 (kty 2, alg -7, crv 1) → canonical JWK {kty, crv, x, y}. */
export function coseToJwk(cose) {
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) throw new Error("only ES256 / P-256 keys are accepted");
  return { kty: "EC", crv: "P-256", x: b64u(cose.get(-2)), y: b64u(cose.get(-3)) };
}
/** SPEC §2.1: canonical did:jwk = base64url of exactly {"kty","crv","x","y"} in that order. */
export const didJwk = (jwk) => "did:jwk:" + b64u(JSON.stringify({ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }));

/** Registration (navigator.credentials.create) verification. Returns the credential to store, or throws. */
export function verifyRegistration({ clientDataJSON, attestationObject }, { challenge, rpId, origin }) {
  const cd = JSON.parse(fromB64u(clientDataJSON).toString("utf8"));
  if (cd.type !== "webauthn.create") throw new Error("clientData.type is not webauthn.create");
  if (cd.challenge !== challenge) throw new Error("challenge mismatch");
  if (cd.origin !== origin) throw new Error(`origin mismatch (${cd.origin})`);
  // Shōkai v0.3.0-rc4 (SIGNING.md, Appendix A.1, C195): the owner signs on the signing page itself, never inside another site's frame.
  if (cd.crossOrigin !== undefined && cd.crossOrigin !== false) throw new Error("crossOrigin ceremony refused");
  if (cd.topOrigin !== undefined) throw new Error("topOrigin present: embedded ceremony refused");
  const att = cborDecode(fromB64u(attestationObject)).value;
  const ad = parseAuthData(att.get("authData"));
  if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error("rpIdHash mismatch");
  if (!ad.up || !ad.uv) throw new Error("user presence and user verification are both required");
  if (!ad.at || !ad.cose) throw new Error("no attested credential data");
  const jwk = coseToJwk(ad.cose);
  return { credential_id: b64u(ad.credentialId), public_key_jwk: jwk, owner_did: didJwk(jwk), sign_count: ad.signCount, fmt: att.get("fmt") };
}

/** Assertion (navigator.credentials.get) verification against a stored credential. Throws on any failure. */
export function verifyAssertion({ credentialId, clientDataJSON, authenticatorData, signature }, { credential, challenge, rpId, origin }) {
  if (credentialId !== credential.credential_id) throw new Error("unknown credential");
  const clientRaw = fromB64u(clientDataJSON), authData = fromB64u(authenticatorData);
  const cd = JSON.parse(clientRaw.toString("utf8"));
  if (cd.type !== "webauthn.get") throw new Error("clientData.type is not webauthn.get");
  if (cd.challenge !== challenge) throw new Error("challenge mismatch");
  if (cd.origin !== origin) throw new Error(`origin mismatch (${cd.origin})`);
  // Shōkai v0.3.0-rc4 (SIGNING.md, Appendix A.1, C195): the owner signs on the signing page itself, never inside another site's frame.
  if (cd.crossOrigin !== undefined && cd.crossOrigin !== false) throw new Error("crossOrigin ceremony refused");
  if (cd.topOrigin !== undefined) throw new Error("topOrigin present: embedded ceremony refused");
  const ad = parseAuthData(authData);
  if (!ad.rpIdHash.equals(sha256(rpId))) throw new Error("rpIdHash mismatch");
  if (!ad.up || !ad.uv) throw new Error("user presence and user verification are both required");
  const pub = createPublicKey({ key: credential.public_key_jwk, format: "jwk" });
  const ok = nodeVerify("sha256", Buffer.concat([authData, sha256(clientRaw)]), pub, fromB64u(signature));
  if (!ok) throw new Error("signature does not verify");
  return { signCount: ad.signCount };
}

export const randomToken = (n = 24) => randomBytes(n).toString("base64url");
