// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// What a door may fetch for itself (§2.5, §2.6, §4, §5.2): revocation logs, allowance statuses and card revocation lists named in
// what a visitor sent. Outside the conformance test profile only https, and never a loopback, private, link-local or unspecified
// address literal or a localhost name, so a visitor can't point the door at its own host or network (proposal P8, fetch scope;
// a reference hardening, not a new rule). DNS names that resolve
// to private addresses are the operator's to block with egress rules (HOST-A-PLACE.md). Not part of the public API.
import { isIP } from "node:net";

function privateV4(h: string): boolean {
  const p = h.split(".").map(Number); const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && p[2] === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function privateV6(h: string): boolean {
  const x = h.toLowerCase();
  if (x === "::" || x === "::1") return true;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x); if (m) return privateV4(m[1]);
  const hx = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(x);   // the URL parser writes a v4-mapped address in hex
  if (hx) { const n = (parseInt(hx[1], 16) << 16) >>> 0 | parseInt(hx[2], 16); return privateV4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")); }
  return /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
}
/** True when a door may fetch `url` itself. `testProfile`: Appendix B loopback only (http or https). */
export function doorMayFetch(url: string, testProfile: boolean): boolean {
  let u: URL; try { u = new URL(url); } catch { return false; }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loop = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (testProfile) return (u.protocol === "http:" || u.protocol === "https:") && loop;
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v = isIP(host);
  if (v === 4) return !privateV4(host);
  if (v === 6) return !privateV6(host);
  return host.includes(".");
}

/** What a door reads from one such URL at most; a larger or stalled answer counts as unreachable (fail closed, §2.6). */
export const DOOR_FETCH_MAX_BYTES = 256 * 1024;
export const DOOR_FETCH_TIMEOUT_MS = 2000;
/** Reads a response body up to `max` bytes; returns null when it is (or says it is) larger. */
export async function readCapped(r: Response, max = DOOR_FETCH_MAX_BYTES): Promise<Buffer | null> {
  const declared = Number(r.headers.get("content-length")); if (Number.isFinite(declared) && declared > max) { await r.body?.cancel().catch(() => {}); return null; }
  if (!r.body) return Buffer.alloc(0);
  const reader = r.body.getReader(); const parts: Buffer[] = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > max) { await reader.cancel().catch(() => {}); return null; } parts.push(Buffer.from(value)); }
  return Buffer.concat(parts);
}
