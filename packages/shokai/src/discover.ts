// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Proposal P26 (draft, not part of the v0.5.0 core; moved out of SPEC §11.1 in v0.5.0): how a visiting representative finds a
// site's door. A site MAY publish its DoorPointer at /.well-known/shokai, and MAY name it from a page with <link rel="shokai"
// href="…">. Both are hints: what counts is the place listing and the Shōkai host card the door shows (§2.3, §3.1).
// P26 amendment A (draft, 2026-11-02): binding a door to the site it claims. `site` on a Discovery and bindToSite() below.
// Nothing here changes the v0.5.0 wire.
import type * as S from "./core/shapes.js";
/** The site path of the discovery file (§11.1 draft): a DoorPointer, served as JSON. */
export const WELL_KNOWN_PATH = "/.well-known/shokai";

/**
 * `site`: the origin whose own /.well-known/shokai this pointer is (P26 amendment A §A2): set only when that file was read at
 * the site's origin with every redirect staying on that origin. null when the pointer came from anywhere else (another origin's
 * file, a redirect off the site, a link to another address): then it is a hint only, never the site's own word.
 */
export type Discovery = { pointer: S.DoorPointer; via: "well-known" | "link" | "app_proxy"; url: string; site: string | null };
/**
 * SPEC §3.1.1 (provisional, v0.5.0 red-team phase 1): the one app-proxy path a hosted shop may use when its platform won't serve
 * /.well-known/ (Shopify serves an installed app's proxy at <store>/apps/<subpath>/…). It counts as the site's own word only when
 * the site's /.well-known/shokai gave no door pointer, the site's home page (its root, "/") names exactly this path in its head with
 * a rel="shokai" link, and the file was answered on the site's origin at exactly this path with no query.
 */
export const APP_PROXY_PATH = "/apps/shokai/door";
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
/** P26 amendment A §A5: the most a visitor reads of the discovery file or the page (larger: no door found, never truncated). */
export const MAX_DISCOVERY_BYTES = 64 * 1024;
const MAX = MAX_DISCOVERY_BYTES;
/** P26 amendment A §A4: at most this many rel="shokai" links are tried, in document order. */
export const MAX_SHOKAI_LINKS = 4;

const loopback = (u: URL) => ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
/** https, or http on this computer when `allowLoopbackHttp` (tests and local development). */
function okScheme(u: URL, allowLoopbackHttp: boolean) { return u.protocol === "https:" || (allowLoopbackHttp && u.protocol === "http:" && loopback(u)); }
/**
 * Reads at most MAX bytes, incrementally: a declared Content-Length over the limit is refused unread, and a stream that passes it is
 * cancelled at once, so an untrusted site can't make the representative buffer more than 64 KiB (+ one chunk). The fetch's
 * AbortSignal.timeout stays attached to the body, so the timeout covers the whole read. Web streams only (runs in browsers too);
 * the same pattern as readCapped() in fetch-policy.ts.
 */
async function capped(r: Response): Promise<string | null> {
  try {
    const declared = Number(r.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX) { await r.body?.cancel().catch(() => {}); return null; }
    if (!r.body) return "";
    const reader = r.body.getReader(); const parts: Uint8Array[] = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      n += value.byteLength; if (n > MAX) { await reader.cancel().catch(() => {}); return null; }
      parts.push(value);
    }
    const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.byteLength; }
    return new TextDecoder().decode(buf);
  } catch { return null; }   // timeout or a broken stream: no door found
}
function asPointer(text: string | null): S.DoorPointer | null {
  if (text === null) return null;
  try { const x = JSON.parse(text); return x && typeof x === "object" && x.type === "door_pointer" && typeof x.place_listing === "string" ? x as S.DoorPointer : null; } catch { return null; }
}
/** The <link rel="shokai" href="…"> hrefs in a page (rel is a space-separated token list). */
export function shokaiLinks(html: string): string[] {
  const out: string[] = [];
  // P26 amendment A §A4: only the document's head counts (the part before </head> when the page has one), so a link placed in
  // a page's body (a comment, a post, a widget) never names the site's door.
  const end = html.search(/<\/head\s*>/i); const head = end >= 0 ? html.slice(0, end) : html;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag); const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const rels = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase().split(/\s+/);
    if (rels.includes("shokai") && href) out.push(href[1] ?? href[2] ?? href[3]);
  }
  return out;
}
/**
 * P26 amendment A §A1: a site's origin in its one comparable form (WHATWG URL origin: lowercase scheme and host, the host in
 * its ASCII (punycode) form, no default port, no path, query, fragment or user info). null for anything that has no such origin.
 */
export function siteOrigin(u: string | URL): string | null {
  try { const x = typeof u === "string" ? new URL(u) : u; if (x.protocol !== "https:" && x.protocol !== "http:") return null; if (x.username || x.password) return null; return x.origin; } catch { return null; }
}
/** The tag a site puts in its pages' <head>. */
export function shokaiLinkTag(href = WELL_KNOWN_PATH): string { return `<link rel="shokai" href="${href.replace(/"/g, "&quot;")}">`; }

/**
 * Find a site's door: GET <origin>/.well-known/shokai, and if there is none, the first <link rel="shokai"> on the page. A
 * redirect is followed only to https (or loopback http in tests), and the well-known document counts only if the final URL's
 * path is exactly /.well-known/shokai with no query. Returns null when the site publishes no door.
 */
export async function discover(siteUrl: string, o: { fetch?: Fetch; allowLoopbackHttp?: boolean } = {}): Promise<Discovery | null> {
  const f: Fetch = o.fetch ?? ((u, i) => fetch(u, i)); const lb = !!o.allowLoopbackHttp;
  const site = new URL(siteUrl); if (!okScheme(site, lb)) throw new Error(`discover: ${site.origin} is not https`);
  const get = async (u: string, accept: string) => {
    try { const r = await f(u, { redirect: "follow", headers: { accept }, signal: AbortSignal.timeout(5000) }); const fin = new URL(r.url || u);
      return { r, fin, ok: r.ok && okScheme(fin, lb) }; } catch { return null; }
  };
  // §A2: the site's own word only when the file was answered on the site's origin, at the exact path with no query. A fetch that
  // follows redirects reports only the final URL, so a redirect that left the origin and came back isn't seen; the final origin is
  // what is compared (listed as a known limit in P26 amendment A §A8).
  const own = (fin: URL) => fin.origin === site.origin && fin.pathname === WELL_KNOWN_PATH && !fin.search ? site.origin : null;
  const wk = await get(site.origin + WELL_KNOWN_PATH, "application/json");
  if (wk?.ok && wk.fin.pathname === WELL_KNOWN_PATH && !wk.fin.search) {
    const p = asPointer(await capped(wk.r)); if (p) return { pointer: p, via: "well-known", url: wk.fin.href, site: own(wk.fin) };
  }
  // §3.1.1 (provisional): the app-proxy path counts only from the site's home page.
  const home = site.origin + "/";
  const page = await get(site.href, "text/html");
  if (!page?.ok) return null;
  const html = await capped(page.r); if (html === null) return null;
  for (const href of shokaiLinks(html).slice(0, MAX_SHOKAI_LINKS)) {
    let u: URL; try { u = new URL(href, page.fin); } catch { continue; }
    if (!okScheme(u, lb)) continue;
    const got = await get(u.href, "application/json"); if (!got?.ok) continue;
    // §A4: a link binds only when it leads to the site's own well-known file, on the origin the page was asked for.
    const p = asPointer(await capped(got.r)); if (!p) continue;
    const fromHome = page.fin.href === home && site.href === home;
    const proxied = fromHome && u.origin === site.origin && u.pathname === APP_PROXY_PATH && !u.search && got.fin.origin === site.origin && got.fin.pathname === APP_PROXY_PATH && !got.fin.search;
    if (proxied) return { pointer: p, via: "app_proxy", url: got.fin.href, site: site.origin };
    return { pointer: p, via: "link", url: got.fin.href, site: page.fin.origin === site.origin ? own(got.fin) : null };
  }
  return null;
}
/** The base URL a DoorPointer names (its place_listing without "/places"), ready for findPlace(base, name). */
export function doorBase(p: S.DoorPointer): string { return p.place_listing.replace(/\/places\/?$/, ""); }

/** P26 amendment A §A3: what a well-known file says about one place. `principal_id` and `place_listing` are optional members. */
type PointerPlace = S.DoorPointer["places"][number] & { principal_id?: string; place_listing?: string };
export type SiteBinding = { ok: true; site: string; entry: string } | { ok: false; why: SiteBindingFailure };
export type SiteBindingFailure = "not_the_sites_file" | "no_site_on_card" | "card_names_another_site" | "not_listed_by_site" | "principal_not_named" | "principal_mismatch" | "entry_mismatch";
/**
 * P26 amendment A §A3: is this door the door of `site`? `discovery` MUST be what discover(site) returned just now (or within the
 * cache rule, §A5), `hostCard` the payload of the place's Shōkai host card, already verified as SPEC §3.1 requires (signature,
 * possession proof, principal, entry, house digest). Returns ok only when the site's own file lists the place's entry, the
 * Shōkai host card names that site, and, for a door on another origin, the file names the card's principal.
 */
export function bindToSite(site: string, discovery: Discovery | null, hostCard: { principal: { principal_id: string }; place?: { principal_id: string; entry: string; site?: string } }): SiteBinding {
  const want = siteOrigin(site); const fail = (why: SiteBindingFailure): SiteBinding => ({ ok: false, why });
  if (!want || !discovery || discovery.site !== want) return fail("not_the_sites_file");
  const place = hostCard.place; if (!place?.site) return fail("no_site_on_card");
  if (siteOrigin(place.site) !== want || place.site !== want) return fail("card_names_another_site");
  const listed = (discovery.pointer.places as PointerPlace[]).filter((x) => x.entry === place.entry);
  if (listed.length !== 1) return fail(listed.length ? "entry_mismatch" : "not_listed_by_site");
  const item = listed[0]; const sameOrigin = siteOrigin(place.entry) === want;
  if (item.principal_id !== undefined && item.principal_id !== place.principal_id) return fail("principal_mismatch");
  if (!sameOrigin && item.principal_id === undefined) return fail("principal_not_named");
  if (place.principal_id !== hostCard.principal.principal_id) return fail("principal_mismatch");
  return { ok: true, site: want, entry: place.entry };
}

/** SPEC §3.1.1 (site binding): the result of checking a door against the website it belongs to. */
export type SiteCheck = { ok: true; site: string; entry: string; via: "well-known" | "link" | "app_proxy" } | { ok: false; site: string | null; why: SiteBindingFailure | "no_site_named" | "site_unreachable" };
/**
 * SPEC §3.1.1: fetch `site`'s own /.well-known/shokai now and check that it lists this door, and that the door's verified Shōkai
 * host card names that site (bindToSite). `hostCard` is the payload of a Shōkai host card the caller already verified (§3.1).
 * Never throws: a site that can't be read is `site_unreachable`, which is not bound.
 */
export async function checkSite(site: string, hostCard: Parameters<typeof bindToSite>[2], o: { fetch?: Fetch; allowLoopbackHttp?: boolean } = {}): Promise<SiteCheck> {
  const want = siteOrigin(site); if (!want) return { ok: false, site: null, why: "not_the_sites_file" };
  let d: Discovery | null = null; try { d = await discover(want, o); } catch { d = null; }
  if (!d) return { ok: false, site: want, why: "site_unreachable" };
  const b = bindToSite(want, d, hostCard);
  return b.ok ? { ok: true, site: b.site, entry: b.entry, via: d.via } : { ok: false, site: want, why: b.why };
}
/** SPEC §3.1.1: how a visitor names a site to its owner: its host (the ASCII form), e.g. "lanternmoss.example". */
export function siteHost(site: string): string { try { return new URL(site).host; } catch { return site; } }
