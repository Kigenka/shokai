/**
 * Signing and verification for Shōkai v0.1 (reference).
 * - Representatives: Ed25519, identified by did:key (zero infrastructure).
 * - Owners: passkeys (WebAuthn, ES256), identified by did:jwk. SIMULATED locally (webauthn-sim).
 * - Organizations: did:web. SIMULATED with an in-memory "well-known" registry (no network).
 * v0.2.1 (SPEC §2.1, A.1): payload_digest = "sha-256:" + base64url(SHA-256(JCS(payload))).
 * Ed25519 signs the 32 RAW digest bytes; a passkey's clientDataJSON.challenge = base64url(raw digest), no prefix.
 */
import {
  createHash, createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify,
  createECDH, type KeyObject,
} from "node:crypto";
import { canonicalize } from "./jcs.js";
import type { Digest, Signature, Signed } from "../../../protocol-shapes.js";

// ---------- digests ----------
export function digestOf(payload: unknown): Digest {
  return "sha-256:" + createHash("sha256").update(canonicalize(payload), "utf8").digest("base64url");
}
export function sha256(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}
/** The exact signed bytes (§2.1): the 32 raw bytes behind a "sha-256:" digest string. */
export function digestBytes(d: Digest): Buffer {
  if (!d.startsWith("sha-256:")) throw new Error("digest must start with sha-256:");
  const b = Buffer.from(d.slice(8), "base64url");
  if (b.length !== 32) throw new Error("digest must be 32 bytes");
  return b;
}
/** §2.4: the possession-proof payload. Its digest is what the card key signs. */
export function possessionDigest(encounter_id: string, nonce: string | undefined): Digest {
  return digestOf({ encounter_id, nonce });
}
/** §9.1: what a continuity key signs when echoing a bound visit receipt. */
export function continuityDigest(encounter_id: string, receipt_id: string, representative_id: string): Digest {
  return digestOf({ encounter_id, receipt_id, representative_id });
}

// ---------- evidence fetching (SIMULATED web; §2.5) ----------
const evidenceWeb = new Map<string, string>();
export function publishEvidence(url: string, content: string): Digest { evidenceWeb.set(url, content); return digestOf({ content }); }
/** Fetch and digest the content at `url` (simulated). undefined when unreachable. */
export function fetchEvidenceDigest(url: string): Digest | undefined { const c = evidenceWeb.get(url); return c === undefined ? undefined : digestOf({ content: c }); }

// ---------- base58btc (for did:key) ----------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58encode(bytes: Uint8Array): string {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}
function b58decode(s: string): Buffer {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  const lead = s.match(/^1*/)![0].length;
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(n === 0n ? "" : hex, "hex")]);
}

// ---------- keys ----------
export type Ed25519Key = { kind: "ed25519"; did: string; keyId: string; privateKey: KeyObject; publicKey: KeyObject };

/** Deterministic Ed25519 key from a label (so transcripts are reproducible). Demo only. */
export function ed25519FromLabel(label: string, didOverride?: string): Ed25519Key {
  const seed = sha256("shokai-demo-seed:" + label);
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x as string, "base64url");
  const didKey = "did:key:z" + b58encode(Buffer.concat([Buffer.from([0xed, 0x01]), raw]));
  const did = didOverride ?? didKey;
  const frag = didOverride ? "key-1" : didKey.slice("did:key:".length);
  return { kind: "ed25519", did, keyId: `${did}#${frag}`, privateKey, publicKey };
}

export type PasskeyKey = { kind: "passkey"; did: string; keyId: string; credentialId: string; privateKey: KeyObject; publicKey: KeyObject; /** v0.2.3 (§A.1): the relying party this passkey is registered with. */ rpId: string };

/** v0.2.3: the simulated owner relying party (fictional). Real deployments state theirs in card.owner_binding.rp_id. */
export const DEFAULT_RP_ID = "owners.example";

/**
 * SIMULATED passkey: a local P-256 key standing in for an authenticator. Demo only.
 * v0.2.3 (§A.2): d = SHA-256("shokai-demo-passkey:" + label); the did:jwk is the canonical form (below).
 */
export function passkeyFromLabel(label: string, rpId: string = DEFAULT_RP_ID): PasskeyKey {
  const d = sha256("shokai-demo-passkey:" + label);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 0x04 || X || Y
  const jwk = { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") };
  const privateKey = createPrivateKey({ key: { ...jwk, d: d.toString("base64url") }, format: "jwk" });
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const did = didJwkFromXY(jwk.x, jwk.y);
  rememberOwnerRp(did, rpId); // simulation: the directory already knows each demo owner's RP (real hosts learn it from the card)
  return { kind: "passkey", did, keyId: `${did}#0`, credentialId: "cred-" + sha256(label).subarray(0, 6).toString("hex"), privateKey, publicKey, rpId };
}

/**
 * v0.2.3 (§2.1): canonical did:jwk for a P-256 key: base64url (no padding) of the UTF-8 JSON with exactly the members
 * kty, crv, x, y in that order and no whitespace. Receivers MUST compare keys by parsed JWK (kty, crv, x, y), never by string.
 */
export function didJwkFromXY(x: string, y: string): string {
  return "did:jwk:" + Buffer.from(JSON.stringify({ kty: "EC", crv: "P-256", x, y })).toString("base64url");
}
export function isCanonicalDidJwk(did: string): boolean {
  try {
    const j = JSON.parse(Buffer.from(did.slice("did:jwk:".length), "base64url").toString("utf8"));
    return did.startsWith("did:jwk:") && didJwkFromXY(j.x, j.y) === did && j.kty === "EC" && j.crv === "P-256";
  } catch { return false; }
}

// ---------- time (v0.2.3, §2.1) ----------
/** RFC 3339, UTC "Z", whole seconds (no fraction). */
export function isRfc3339Seconds(t: unknown): boolean {
  return typeof t === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(t) && !Number.isNaN(Date.parse(t));
}
/** v0.2.3: tolerated clock skew between parties, in seconds. */
export const CLOCK_SKEW_S = 300;
/** Not yet valid: t is more than the skew in the future. */
export function notYetValid(t: string, now: string): boolean { return Date.parse(t) > Date.parse(now) + CLOCK_SKEW_S * 1000; }
/** Expired: now is at or past t plus the skew. */
export function pastExpiry(t: string, now: string): boolean { return Date.parse(now) >= Date.parse(t) + CLOCK_SKEW_S * 1000; }

export type AnyKey = Ed25519Key | PasskeyKey;

// ---------- resolution ----------
/** SIMULATED did:web registry: stands in for https://<domain>/.well-known/did.json. */
const didWebRegistry = new Map<string, KeyObject>();
export function publishDidWeb(did: string, key: KeyObject): void { didWebRegistry.set(did, key); }

export function resolveKey(did: string): KeyObject | undefined {
  try {
    if (did.startsWith("did:key:z")) {
      const bytes = b58decode(did.slice("did:key:z".length));
      if (bytes[0] !== 0xed || bytes[1] !== 0x01) return undefined;
      return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: bytes.subarray(2).toString("base64url") }, format: "jwk" });
    }
    if (did.startsWith("did:jwk:")) {
      const jwk = JSON.parse(Buffer.from(did.slice("did:jwk:".length), "base64url").toString("utf8"));
      return createPublicKey({ key: jwk, format: "jwk" });
    }
    if (did.startsWith("did:web:")) return didWebRegistry.get(did);
  } catch { return undefined; }
  return undefined;
}
export function sameKey(a: KeyObject | undefined, b: KeyObject | undefined): boolean {
  if (!a || !b) return false;
  return a.export({ format: "der", type: "spki" }).equals(b.export({ format: "der", type: "spki" }));
}

// ---------- signing ----------
/**
 * v0.2.3 (§A.1): which RP a verifier expects for an owner's passkey. Learned from a verified card's owner_binding.rp_id
 * (the card itself is checked against the rp_id it states). Unknown owners fall back to the stated card value only.
 */
const knownRp = new Map<string, string>();
export function rememberOwnerRp(ownerDid: string, rpId: string): void { knownRp.set(ownerDid, rpId); }
export function expectedRp(signer: string): string | undefined { return knownRp.get(signer); }

/** Test-only knobs for building NEGATIVE assertions (wrong RP, UV cleared). Never used on the happy path. */
export type AssertionOverrides = { rpId?: string; flags?: number; statedRpId?: string; omitRpId?: boolean };

export function signDigest(digest: Digest, key: AnyKey, at: string, ov: AssertionOverrides = {}): Signature {
  if (key.kind === "ed25519") {
    const value = nodeSign(null, digestBytes(digest), key.privateKey).toString("base64url");
    return { alg: "Ed25519", key_id: key.keyId, signer: key.did, signed_at: at, value };
  }
  // SIMULATED WebAuthn assertion: authenticatorData || SHA-256(clientDataJSON), challenge = digest.
  const rp = ov.rpId ?? key.rpId;
  const authData = Buffer.concat([sha256(rp), Buffer.from([ov.flags ?? 0x05]), Buffer.from([0, 0, 0, 1])]); // flags: UP (0x01) | UV (0x04)
  const clientData = JSON.stringify({ type: "webauthn.get", challenge: digestBytes(digest).toString("base64url"), origin: "https://" + rp, simulated: true });
  const value = nodeSign("sha256", Buffer.concat([authData, sha256(clientData)]), key.privateKey).toString("base64url");
  return {
    alg: "ES256", key_id: key.keyId, signer: key.did, signed_at: at, value,
    webauthn: { authenticator_data: authData.toString("base64url"), client_data_json: Buffer.from(clientData).toString("base64url"), credential_id: key.credentialId,
      ...(ov.omitRpId ? {} : { rp_id: ov.statedRpId ?? rp }) } as NonNullable<Signature["webauthn"]>,
  };
}

export function verifySignature(digest: Digest, sig: Signature, rpId?: string): boolean {
  const pub = resolveKey(sig.signer);
  if (!pub) return false;
  try {
    if (sig.alg === "Ed25519" && !sig.webauthn) {
      if (!keyIdMatchesSigner(sig)) return false;
      return nodeVerify(null, digestBytes(digest), pub, Buffer.from(sig.value, "base64url"));
    }
    if (sig.alg === "ES256" && sig.webauthn) {
      const authData = Buffer.from(sig.webauthn.authenticator_data, "base64url");
      const clientRaw = Buffer.from(sig.webauthn.client_data_json, "base64url");
      const client = JSON.parse(clientRaw.toString("utf8"));
      // v0.2.4 (§2.1, A.1): every passkey signature names its RP (webauthn.rp_id, bound by rpIdHash). When the owner's
      // card is known (rpId passed, or remembered from a verified card), the stated RP MUST equal the card's.
      const stated = sig.webauthn.rp_id;
      if (!stated) return false;
      const known = rpId ?? expectedRp(sig.signer);
      if (known && known !== stated) return false;
      const rp = stated;
      if (client.type !== "webauthn.get" || client.origin !== "https://" + rp) return false;
      if (client.challenge !== digestBytes(digest).toString("base64url")) return false; // A.1: raw digest, no prefix
      if (!keyIdMatchesSigner(sig)) return false;
      if (!authData.subarray(0, 32).equals(sha256(rp))) return false;
      if ((authData[32] & 0x01) === 0 || (authData[32] & 0x04) === 0) return false; // A.1: user present AND user verified
      return nodeVerify("sha256", Buffer.concat([authData, sha256(clientRaw)]), pub, Buffer.from(sig.value, "base64url"));
    }
  } catch { return false; }
  return false;
}

/** §2.1: key_id MUST be a DID URL whose DID is the signer. */
export function keyIdMatchesSigner(sig: Signature): boolean { return sig.key_id.split("#")[0] === sig.signer; }

/** §2.1: the card's representative key must be the key its representative_id (a DID) resolves to. */
export function cardKeyBinds(card: { representative_id: string; representative_key: { key_id: string; public_key: string } }): boolean {
  if (card.representative_key.key_id.split("#")[0] !== card.representative_id) return false;
  const resolved = resolveKey(card.representative_id);
  if (!resolved) return false;
  const pk = card.representative_key.public_key;
  const stated = pk.startsWith("did:") ? resolveKey(pk) : (() => { try { return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pk }, format: "jwk" }); } catch { return undefined; } })();
  return sameKey(resolved, stated);
}

/** §2.1: did:key (Ed25519), did:jwk (P-256) or did:web. */
export function isDid(id: string): boolean { return /^did:(key|jwk|web):/.test(id); }

// ---------- D10: amounts (§5.1) ----------
const MONEY_RE = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/;
const CUR_RE = /^[A-Z]{3}$/;
export function isCanonicalMoney(m: { value: string; currency: string } | undefined): boolean { return !m || (MONEY_RE.test(m.value) && CUR_RE.test(m.currency)); }
/** Scaled integer (10^-6 units). Only call on canonical values. */
export function moneyUnits(value: string): bigint { const [i, f = ""] = value.split("."); return BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)); }

// ---------- D10: locale matching, RFC 4647 §3.4 Lookup ----------
export function rfc4647Lookup(ranges: string[], available: string[], dflt: string): { locale: string; match: "exact" | "fallback" | "none" } {
  const avail = new Map(available.map((a) => [a.toLowerCase(), a]));
  for (const r of ranges) {
    let range = r.toLowerCase();
    let first = true;
    while (range) {
      const hit = avail.get(range);
      if (hit) return { locale: hit, match: first ? "exact" : "fallback" };
      first = false;
      const i = range.lastIndexOf("-");
      if (i < 0) break;
      range = range.slice(0, i);
      if (range.length >= 2 && range[range.length - 2] === "-") range = range.slice(0, -2); // drop a trailing singleton
    }
  }
  return { locale: dflt, match: "none" };
}

export function signed<T>(payload: T, keys: AnyKey[], at: string): Signed<T> {
  const payload_digest = digestOf(payload);
  return { payload, payload_digest, signatures: keys.map((k) => signDigest(payload_digest, k, at)) };
}

export type VerifyResult = { ok: boolean; unsigned: boolean; reason?: string; signers: string[] };

/** Recompute the digest (never trust it as sent) and verify every signature. */
export function verifySigned<T>(s: Signed<T>, expectedSigner?: string): VerifyResult {
  if (digestOf(s.payload) !== s.payload_digest) return { ok: false, unsigned: false, reason: "digest_mismatch", signers: [] };
  if (s.signatures.length === 0) return { ok: false, unsigned: true, reason: "unsigned", signers: [] };
  // v0.2.3: a card is checked against the rp_id it states for its owner (an attacker who edits rp_id breaks the signature).
  const ob = (s.payload as { owner_binding?: { owner_id: string; rp_id: string } } | undefined)?.owner_binding;
  for (const sig of s.signatures) {
    const rp = ob && sig.signer === ob.owner_id ? ob.rp_id : undefined;
    if (!verifySignature(s.payload_digest, sig, rp)) return { ok: false, unsigned: false, reason: "signature_invalid", signers: [] };
  }
  const signers = s.signatures.map((x) => x.signer);
  if (expectedSigner && !signers.includes(expectedSigner)) return { ok: false, unsigned: false, reason: "wrong_signer", signers };
  return { ok: true, unsigned: false, signers };
}

export function short(did: string): string {
  if (did.startsWith("did:jwk:")) return "did:jwk:…" + did.slice(-6);
  if (did.startsWith("did:key:")) return "did:key:…" + did.slice(-6);
  return did;
}
