// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// @kigenka/shokai/browser: sign a Shōkai payload with the owner's REAL passkey, in the browser. No Node built-ins, no dependencies.
// The challenge is the payload's digest: base64url of SHA-256 over its JCS (RFC 8785) form (SPEC Appendix A.1). Send the result to
// your server and finish with `signedFromPasskeyAssertion` from "@kigenka/shokai", which verifies it before you use it.
/* eslint-disable @typescript-eslint/no-explicit-any */
const g: any = globalThis;

/** RFC 8785 JSON canonicalization (the subset Shōkai payloads use: no non-finite numbers). */
export function jcs(v: unknown): string {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("JCS: non-finite number"); return JSON.stringify(v); }
  if (Array.isArray(v)) return "[" + v.map((x) => jcs(x === undefined ? null : x)).join(",") + "]";
  if (typeof v === "object") { const o = v as Record<string, unknown>; return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + jcs(o[k])).join(",") + "}"; }
  throw new Error("JCS: unsupported value");
}
const toB64u = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; for (const c of u) s += String.fromCharCode(c);
  return g.btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = (s: string) => Uint8Array.from(g.atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c: string) => c.charCodeAt(0));

/** "sha-256:" + base64url of SHA-256(JCS(payload)), computed with WebCrypto. */
export async function digestOf(payload: unknown): Promise<string> {
  const h = await g.crypto.subtle.digest("SHA-256", new TextEncoder().encode(jcs(payload)));
  return "sha-256:" + toB64u(h);
}
export type PasskeyAssertion = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string };
/**
 * Ask the owner's passkey to sign `payload` (user verification required). Show the owner what they are signing first, in plain
 * words: the passkey prompt itself shows only the site name. Returns the assertion as base64url fields.
 */
export async function signWithPasskey(payload: unknown, o: { rpId: string; credentialId?: string; timeoutMs?: number }): Promise<{ payload_digest: string; assertion: PasskeyAssertion }> {
  const payload_digest = await digestOf(payload);
  const a = await g.navigator.credentials.get({ publicKey: { challenge: fromB64u(payload_digest.slice(8)), rpId: o.rpId, userVerification: "required", timeout: o.timeoutMs ?? 120000,
    ...(o.credentialId ? { allowCredentials: [{ type: "public-key", id: fromB64u(o.credentialId) }] } : {}) } });
  if (!a) throw new Error("the passkey prompt was dismissed; nothing was signed");
  return { payload_digest, assertion: { credentialId: toB64u(a.rawId), clientDataJSON: toB64u(a.response.clientDataJSON), authenticatorData: toB64u(a.response.authenticatorData), signature: toB64u(a.response.signature) } };
}
