// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// What a door may fetch for itself (§2.5, §2.6, §4, §5.2, §12.1 C285): revocation logs, allowance statuses, card revocation lists
// and evidence named in what a visitor sent.
// - Outside the conformance test profile: https only, no userinfo, never a loopback, private, link-local, unique-local, multicast,
//   unspecified or metadata address.
// - A name is resolved once, every address it resolves to is checked, and the connection goes to the checked (pinned) address
//   (DNS-rebinding defence).
// - No redirect is followed. The body is capped at 256 KiB and the whole fetch at 2 s.
// - Fetches are budgeted per target and per principal.
// Anything refused counts as unreachable (fail closed). Not part of the public API.
import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

function privateV4(q: number[]): boolean {
  const [a, b, c] = q;
  if (q.length !== 4 || q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
/** The eight 16-bit groups of an IPv6 address (zone id dropped, embedded dotted v4 accepted), or null when it doesn't parse. */
function v6Groups(x: string): number[] | null {
  let s = x.toLowerCase(); const z = s.indexOf("%"); if (z >= 0) s = s.slice(0, z);
  const m = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (m) { if (isIP(m[2]) !== 4) return null; const q = m[2].split(".").map(Number); s = m[1] + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16); }
  const halves = s.split("::"); if (halves.length > 2) return null;
  const part = (t: string) => (t === "" ? [] : t.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN)));
  const a = part(halves[0]), b = halves.length === 2 ? part(halves[1]) : [];
  if ([...a, ...b].some((n) => Number.isNaN(n))) return null;
  const fill = 8 - a.length - b.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  return [...a, ...new Array(halves.length === 2 ? fill : 0).fill(0), ...b];
}
const v4Of = (hi: number, lo: number) => [hi >>> 8, hi & 255, lo >>> 8, lo & 255];
function privateV6(g: number[]): boolean {
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(8)) return true;                                                     // :: (unspecified)
  if (zeros(7) && g[7] === 1) return true;                                       // ::1 (loopback)
  if (zeros(5) && g[5] === 0xffff) return privateV4(v4Of(g[6], g[7]));           // v4-mapped
  if (zeros(6)) return privateV4(v4Of(g[6], g[7]));                              // v4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateV4(v4Of(g[6], g[7]));   // NAT64
  if (g[0] === 0x2002) return privateV4(v4Of(g[1], g[2]));                       // 6to4
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0x0db8)) return true;           // Teredo, documentation
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
}
/** True for an address a door must never connect to: loopback, private, link-local, unique-local, multicast, unspecified,
 *  metadata (169.254.169.254, fd00:ec2::254 and the like), or anything that isn't an IP address at all. */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.replace(/^\[|\]$/g, "");
  const v = isIP(a);
  if (v === 4) return privateV4(a.split(".").map(Number));
  if (v === 6) { const g = v6Groups(a); return !g || privateV6(g); }
  return true;
}
const hostOf = (u: URL) => u.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");

/** True when a door may fetch `url` itself (static checks only). `testProfile`: Appendix B loopback only (http or https). */
export function doorMayFetch(url: string, testProfile: boolean): boolean {
  let u: URL; try { u = new URL(url); } catch { return false; }
  const host = hostOf(u);
  const loop = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (testProfile) return (u.protocol === "http:" || u.protocol === "https:") && loop;
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !isPrivateAddress(host);
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

/** A DNS lookup returning every address of a name (injectable for tests). */
export type LookupAll = (host: string) => Promise<{ address: string; family: number }[]>;
const systemLookup: LookupAll = (h) => dnsLookup(h, { all: true, verbatim: true });
export type PinnedTarget = { ok: true; host: string; address: string; family: 4 | 6 };
export type RefusedTarget = { ok: false; why: string };

/**
 * C285 (§12.1): the address a door may connect to for `url`, or a refusal.
 * - An address literal is checked as it is.
 * - A name is resolved (by `lookup`, default the system resolver). It is refused when any address it resolves to is private.
 * - In the test profile no DNS is used (loopback only).
 */
export async function resolveForFetch(url: string, o: { lookup?: LookupAll; testProfile?: boolean } = {}): Promise<PinnedTarget | RefusedTarget> {
  const test = !!o.testProfile;
  if (!doorMayFetch(url, test)) return { ok: false, why: "refused by the door fetch policy" };
  const host = hostOf(new URL(url)); const lit = isIP(host);
  if (lit) return { ok: true, host, address: host, family: lit === 6 ? 6 : 4 };
  if (test) return { ok: true, host, address: "127.0.0.1", family: 4 };   // test profile: "localhost" only, no DNS
  let addrs: { address: string; family: number }[];
  try { addrs = await (o.lookup ?? systemLookup)(host); } catch { return { ok: false, why: "the name doesn't resolve" }; }
  if (!Array.isArray(addrs) || !addrs.length) return { ok: false, why: "the name doesn't resolve" };
  if (addrs.some((a) => typeof a?.address !== "string" || isPrivateAddress(a.address))) return { ok: false, why: "the name resolves to an address the door never fetches" };
  const a = addrs[0].address; return { ok: true, host, address: a, family: isIP(a) === 6 ? 6 : 4 };
}

/** C285: with `redirect: "manual"`, any 3xx (or an opaque redirect) is a refused fetch: the reference follows no redirect. */
export function isRedirect(r: { status: number; type?: string }): boolean {
  return r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400);
}

/** C285 (§12.1): a fetch budget per target and per principal, counted in fixed windows. */
export class FetchBudget {
  readonly perTarget: number; readonly perPrincipal: number; readonly windowMs: number;
  private readonly now: () => number;
  private readonly counts = new Map<string, { n: number; since: number }>();
  constructor(o: { perTarget?: number; perPrincipal?: number; windowMs?: number; now?: () => number } = {}) {
    this.perTarget = o.perTarget ?? 120; this.perPrincipal = o.perPrincipal ?? 60; this.windowMs = o.windowMs ?? 60_000; this.now = o.now ?? Date.now;
  }
  private live(k: string, t: number) {
    const c = this.counts.get(k);
    if (!c || t - c.since >= this.windowMs) { const f = { n: 0, since: t }; this.counts.set(k, f); return f; }
    return c;
  }
  /** Counts one fetch to `target` for `principal`; false (nothing counted) when either budget is spent. */
  take(target: string, principal: string): boolean {
    const t = this.now();
    if (this.counts.size > 4096) for (const [k, c] of this.counts) if (t - c.since >= this.windowMs) this.counts.delete(k);
    const a = this.live("t:" + target, t), b = this.live("p:" + principal, t);
    if (a.n >= this.perTarget || b.n >= this.perPrincipal) return false;
    a.n++; b.n++; return true;
  }
}

export type DoorFetched = { ok: boolean; status: number; body: Buffer };
function pinnedGet(url: string, pin: PinnedTarget, timeout: number, max: number): Promise<DoorFetched | null> {
  return new Promise((resolve) => {
    let done = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: DoorFetched | null) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(v); };
    // Connect to the checked address only; TLS still verifies the certificate for the name in the URL.
    const lookup = (_h: string, opts: any, cb: any) => { if (opts && opts.all) cb(null, [{ address: pin.address, family: pin.family }]); else cb(null, pin.address, pin.family); };
    const req = httpsRequest(url, { method: "GET", lookup: lookup as any, headers: { accept: "application/json" } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { res.destroy(); req.destroy(); return finish(null); }   // no redirect is followed
      const declared = Number(res.headers["content-length"]); if (Number.isFinite(declared) && declared > max) { req.destroy(); return finish(null); }
      const parts: Buffer[] = []; let n = 0;
      res.on("data", (c: Buffer) => { n += c.length; if (n > max) { req.destroy(); finish(null); } else parts.push(c); });
      res.on("end", () => finish({ ok: status >= 200 && status < 300, status, body: Buffer.concat(parts) }));
      res.on("error", () => finish(null));
    });
    timer = setTimeout(() => { req.destroy(); finish(null); }, timeout);
    req.on("error", () => finish(null));
    req.end();
  });
}

/**
 * C285 (§12.1): one door fetch under every rule. It returns null when the fetch is refused, redirected, too large, too slow or
 * failing; the caller records null as unreachable (fail closed).
 * - Outside the test profile it connects to the pinned, checked address.
 * - In the test profile (loopback only) it uses fetch with redirect "manual".
 */
export async function doorFetch(url: string, o: { testProfile?: boolean; lookup?: LookupAll; timeoutMs?: number; maxBytes?: number } = {}): Promise<DoorFetched | null> {
  const timeout = o.timeoutMs ?? DOOR_FETCH_TIMEOUT_MS, max = o.maxBytes ?? DOOR_FETCH_MAX_BYTES;
  const pin = await resolveForFetch(url, o); if (!pin.ok) return null;
  try {
    if (o.testProfile) {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "manual" });
      if (isRedirect(r)) { await r.body?.cancel().catch(() => {}); return null; }
      const body = await readCapped(r, max); if (!body) return null;
      return { ok: r.ok, status: r.status, body };
    }
    return await pinnedGet(url, pin, timeout, max);
  } catch { return null; }
}
