// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, v0.5.0 §3.1.1 (site binding, from P26 amendment A): a door names its website in its owner-signed Shōkai host card and
// is listed by that website's own /.well-known/shokai; a visitor whose owner named the site goes in only when both agree. Loopback
// only (ports 5102–5149); the site names are mapped to local ports by a resolver stand-in; fictional people.
import { createServer, type Server } from "node:http";
import net from "node:net";
import { createDoor, createRepresentative, developmentPasskey, generateRepresentativeKey, signCard, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor,
  verifyDoorCard, findPlace, SHOKAI_DOOR_SITE_INVALID, APP_PROXY_PATH, type DoorOptions, type Door } from "../src/index.js";
import { entryUrl } from "../src/core/door.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const free = (p: number) => new Promise<boolean>((r) => { const s = net.createServer(); s.once("error", () => r(false)); s.listen(p, "127.0.0.1", () => s.close(() => r(true))); });
const used = new Set<number>();
async function port(): Promise<number> { for (let p = 5102; p <= 5149; p++) { if (used.has(p)) continue; if (await free(p)) { used.add(p); return p; } } throw new Error("no free port in 5102-5149"); }
const SITES = new Map<string, number>();
const siteFetch = { fetch: async (url: string, init: RequestInit = {}) => { const u = new URL(url); const p = SITES.get(u.origin); if (!p) throw new Error("no such site (resolver stand-in)");
  const r = await fetch(`http://127.0.0.1:${p}${u.pathname}${u.search}`, { ...init, redirect: "manual" }); return new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers }); } };
const shop = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store",
  purposes: [{ code: "visitation", statement: "Looking around." }, { code: "purchase", statement: "Gift cards." }],
  actions: [{ action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] }, { action: "giftcard.buy", purposes: ["purchase"], level: "act_on_behalf", data_asks: [], limits: { max_amount: USD("40.00") } }],
  spendingActions: ["giftcard.buy"], testProfile: true, ...o });
async function ownerDoor(site: string | undefined, claim = site): Promise<{ door: Door; server: Server; port: number; owner: string }> {
  const p = await port(); const base = `http://127.0.0.1:${p}/shokai`; const pia = developmentPasskey(); const rep = generateRepresentativeKey(); const opts = shop({ baseUrl: base });
  const P = houseConfigFor(opts).policy;
  const card = signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: opts.purposes.map((x) => x.code), actions: opts.actions.map((a) => a.action), cardKind: "host", validDays: 30,
    host: { place: { principal_id: pia.id, entry: entryUrl(base, opts.name), ...(claim ? { site: claim } : {}) }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(opts, pia.id, base), summary_digest: summaryDigestFor(opts, base) },
    shownToOwner: { text: `Suzu may welcome agents at Lanternmoss Tea House${claim ? `, the door of ${claim}` : ""}.`, locale: "en-US" } });
  const door = createDoor({ ...opts, ...(site ? { site } : {}), card, keys: { rep } });
  const server = createServer(async (req, res) => { if (!(await door.handleHttp(req, res, undefined, { wellKnown: true }))) { res.writeHead(404); res.end(); } });
  await new Promise<void>((r) => server.listen(p, "127.0.0.1", () => r()));
  return { door, server, port: p, owner: pia.id };
}

async function main() {
  console.log("SDK site binding (v0.5.0 §3.1.1)");
  const REAL = "https://lanternmoss.example", LOOK = "https://lanternmoss-tea.example";
  // createDoor refuses a site that isn't an origin, and an owner-signed card that names another site.
  for (const bad of ["lanternmoss.example", "https://lanternmoss.example/shop", "ftp://lanternmoss.example", "http://lanternmoss.example"]) {
    let code = ""; try { createDoor({ ...shop(), site: bad }); } catch (e) { code = (e as { code?: string }).code ?? ""; }
    check(code === SHOKAI_DOOR_SITE_INVALID, `createDoor refuses site ${JSON.stringify(bad)} (${code || "accepted"})`);
  }
  { const d = createDoor({ ...shop(), site: REAL, approvedBy: { name: "Pia", role: "Owner" } });
    check(d.host.cfg.card?.payload.place?.site === REAL, "a door that signs its own Shōkai host card names its site in place.site"); }
  const real = await ownerDoor(REAL); SITES.set(REAL, real.port);
  { const wk = await (await fetch(`http://127.0.0.1:${real.port}/.well-known/shokai`)).json() as any;
    check(wk.places?.[0]?.principal_id === real.owner && wk.places?.[0]?.entry === real.door.entry, "the site's /.well-known/shokai lists the door with its principal (door.wellKnown())"); }
  { const c = real.door.host.cfg.card!;
    const v = verifyDoorCard(c, { site: LOOK }); check(!v.ok && /names the site https:\/\/lanternmoss\.example, not this door's site/.test((v as any).why), "verifyDoorCard: a Shōkai host card naming another site is refused for this door");
    let code = ""; try { createDoor({ ...shop({ baseUrl: real.door.base }), site: LOOK, card: c, keys: { rep: real.door.keys.rep } }); } catch (e) { code = (e as { code?: string }).code ?? ""; }
    check(code === "SHOKAI_DOOR_CARD_INVALID", `createDoor with site ${LOOK} and a host card naming ${REAL}: refused (${code})`); }
  const look = await ownerDoor(LOOK); SITES.set(LOOK, look.port);
  const claim = await ownerDoor(REAL);   // a lookalike whose host card claims lanternmoss.example (not listed there)
  const none = await ownerDoor(undefined);   // a door whose host card names no site
  const ines = createRepresentative({ ownerName: "Ines", purposes: ["visitation", "purchase"], actions: ["menu.view", "giftcard.buy"] });
  const look1 = { purpose: "visitation" as const, actions: ["menu.view"], mandate: { fresh: true }, site: REAL, siteFetch };
  const buy = { purpose: "purchase" as const, actions: ["menu.view", "giftcard.buy"], limits: { max_amount: USD("40.00") }, mandate: { fresh: true }, site: REAL, siteFetch };
  const sent = (v: any) => v.transcript.filter((t: any) => t.dir === "out").map((t: any) => (t.message?.payload ?? t.message)?.type);
  { const v = await ines.visit(await findPlace(real.door.base, "lanternmoss"), look1);
    check(v.seated && v.verifiedSite === REAL, `the real door: bound to ${REAL} and seated`);
    check(v.report().host.display_name.startsWith("lanternmoss.example (\"Lanternmoss Tea House\""), `the report names it by the site: ${v.report().host.display_name}`); await v.farewell(); }
  for (const [label, d, why] of [["a lookalike at its own site", look, "card_names_another_site"], ["a lookalike claiming the site", claim, "not_listed_by_site"], ["a door naming no site", none, "no_site_on_card"]] as const) {
    for (const ask of [look1, buy]) {
      const v = await ines.visit(await findPlace(d.door.base, "lanternmoss"), ask);
      check(!v.seated && !sent(v).includes("invitation_request") && (v.placeCheck.site as any)?.why === why && sent(v).at(-1) === "farewell",
        `${label}, ${ask.purpose}: no request sent, a farewell, ${(v.placeCheck.site as any)?.why}`);
    }
  }
  { const v = await ines.visit(await findPlace(look.door.base, "lanternmoss"), { ...look1, unboundSite: "continue" });
    check(v.seated && v.verifiedSite === null && v.placeCheck.site?.continued === true, "unboundSite: continue lets an errand that spends nothing go on, reported as not verified");
    check(!v.report().host.display_name.startsWith("lanternmoss.example"), `… and the report never names it lanternmoss.example (${v.report().host.display_name})`); await v.farewell(); }
  { const v = await ines.visit(await findPlace(look.door.base, "lanternmoss"), { ...buy, unboundSite: "continue" });
    check(!v.seated && !sent(v).includes("invitation_request"), "unboundSite: continue never applies to an errand that spends"); }
  { const v = await ines.visit(await findPlace(look.door.base, "lanternmoss"), { ...look1, site: undefined });
    check(v.seated && v.verifiedSite === LOOK && v.placeCheck.site?.claimed === true, "no site named: the host card's own claim is checked, and binds only to its own site"); await v.farewell(); }
  { SITES.delete(REAL); const v = await ines.visit(await findPlace(real.door.base, "lanternmoss"), buy);
    check(!v.seated && (v.placeCheck.site as any)?.why === "site_unreachable", "the named site can't be read: a purchase doesn't go in (fails closed)"); SITES.set(REAL, real.port); }
  // §3.1.1, provisional app-proxy rule (red-team phase 1): a hosted shop that can't serve /.well-known/ (Shopify) names its app's
  // proxy path from its home page's head; the file there is the site's own word only on that path, from the home page.
  const SHOP = "https://hanabi-shop.example", FAKE = "https://hanabi-shop-sale.example";
  const proxied = await ownerDoor(SHOP);
  const shopServer = async (o: { home?: string; wk?: boolean; path?: string }) => { const p = await port();
    const srv = createServer(async (req, res) => { const u = new URL(req.url ?? "/", "http://x");
      if (u.pathname === "/" ) { res.writeHead(200, { "content-type": "text/html" }); res.end(o.home ?? `<html><head><title>Hanabi</title><link rel="shokai" href="${APP_PROXY_PATH}"></head><body>Shop</body></html>`); return; }
      if (u.pathname === "/.well-known/shokai" && o.wk) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "door_pointer", place_listing: "http://127.0.0.1:1/places", places: [] })); return; }
      if (u.pathname === (o.path ?? APP_PROXY_PATH)) { const wk = await (await fetch(`http://127.0.0.1:${proxied.port}/.well-known/shokai`)).text(); res.writeHead(200, { "content-type": "application/json" }); res.end(wk); return; }
      res.writeHead(404); res.end(); });
    await new Promise<void>((r) => srv.listen(p, "127.0.0.1", () => r())); return { srv, p }; };
  const ask2 = (site: string) => ({ purpose: "visitation" as const, actions: ["menu.view"], mandate: { fresh: true }, site, siteFetch });
  const proxyVisit = async (o: Parameters<typeof shopServer>[0], site = SHOP) => { const sh = await shopServer(o); SITES.set(site, sh.p);
    try { return await ines.visit(await findPlace(proxied.door.base, "lanternmoss"), ask2(site)); } finally { sh.srv.close(); SITES.delete(site); } };
  { const v = await proxyVisit({});
    check(v.seated && v.verifiedSite === SHOP && (v.placeCheck.site as any)?.via === "app_proxy", `app proxy: the shop's home page names ${APP_PROXY_PATH}, which lists the door: bound and seated`);
    check(v.placeCheck.checked.some((t) => t.includes("provisional app-proxy rule")), "the place check says it was bound by the provisional app-proxy rule"); if (v.seated) await v.farewell(); }
  { const v = await proxyVisit({ home: `<html><head><title>Hanabi</title></head><body><link rel="shokai" href="${APP_PROXY_PATH}"></body></html>` });
    check(!v.seated && !sent(v).includes("invitation_request"), "app proxy: a link in the body (a comment, a widget) binds nothing"); }
  { const v = await proxyVisit({ home: `<html><head><link rel="shokai" href="/apps/other/door"></head></html>`, path: "/apps/other/door" });
    check(!v.seated && !sent(v).includes("invitation_request"), "app proxy: any other path is a hint only, not the site's word"); }
  { const v = await proxyVisit({ home: `<html><head><link rel="shokai" href="${APP_PROXY_PATH}?door=1"></head></html>` });
    check(!v.seated && !sent(v).includes("invitation_request"), "app proxy: the path with a query binds nothing"); }
  { const v = await proxyVisit({ wk: true });
    check(!v.seated && !sent(v).includes("invitation_request"), "app proxy: when the site's own /.well-known/shokai answers, it wins (here it doesn't list the door)"); }
  { // A lookalike shop whose home page links to the real shop's proxy file (another origin): binds nothing for either.
    const real2 = await shopServer({}); SITES.set(SHOP, real2.p);
    const fake = await shopServer({ home: `<html><head><link rel="shokai" href="${SHOP}${APP_PROXY_PATH}"></head></html>` }); SITES.set(FAKE, fake.p);
    const v = await ines.visit(await findPlace(proxied.door.base, "lanternmoss"), ask2(FAKE));
    check(!v.seated && !sent(v).includes("invitation_request"), "app proxy: a lookalike shop pointing at the real shop's file binds nothing");
    real2.srv.close(); fake.srv.close(); SITES.delete(SHOP); SITES.delete(FAKE); }
  proxied.server.close();
  for (const s of [real, look, claim, none]) s.server.close();
  console.log(`${pass} site binding checks passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
