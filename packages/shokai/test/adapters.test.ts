// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0 drop-in door): one door behind Express, Hono, Next route handlers and node:http answers alike; discover()
// finds it from a site's /.well-known/shokai or a <link rel="shokai">; the MCP gate with a store. Loopback only; fictional people.
import { createServer, type Server } from "node:http";
import { createDoor, createRepresentative, discover, doorBase, shokaiDoor, nextDoor, shokaiLinks, shokaiLinkTag, memoryStore, findPlace, bindToSite, siteOrigin, MAX_DISCOVERY_BYTES, ShokaiRawBodyError, ShokaiPayloadTooLargeError, MAX_ADAPTER_BODY, type DoorOptions } from "../src/index.js";
import { Hono } from "hono";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const kettle = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking around." }, { code: "purchase", statement: "Buying tea." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], approvedBy: { name: "Suzu", role: "Owner" }, testProfile: true,
  leaflet: { about: "Kettle & Leaf is a small tea shop that sells loose-leaf teas by the gram.", hostName: "Suzu" }, ...o });
const listen = (s: Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as any).port)));
const strip = (x: any) => JSON.stringify(x).replace(/127\.0\.0\.1:\d+/g, "HOST");

async function main() {
  console.log("SDK drop-in adapters (v0.4.0)");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation", "purchase"], actions: ["tea.browse", "tea.order"] });
  const servers: Server[] = []; const seen: Record<string, { ptr: string; listing: string; start: string; wk: string; seated: boolean }> = {};
  const ports: Record<string, number> = {}; const doors: Record<string, ReturnType<typeof createDoor>> = {};
  const exercise = async (label: string, port: number, door: ReturnType<typeof createDoor>) => {
    ports[label] = port; doors[label] = door;
    const origin = `http://127.0.0.1:${port}`;
    const ptr = await (await fetch(origin + "/shokai/")).json();
    const listing = await (await fetch(origin + "/shokai/places")).json() as any;
    const start = await (await fetch(origin + "/shokai/start")).text();
    const wk = await (await fetch(origin + "/.well-known/shokai")).json();
    const place = await findPlace(origin + "/shokai", "kettle");
    const v = await aya.visit(place, { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
    if (!v.seated) console.log("  (not seated behind " + label + ": " + JSON.stringify({ d: v.decision, r: v.response?.reason_code, i: v.interrupted, last: v.transcript.slice(-1) }).slice(0, 600) + ")");
    seen[label] = { ptr: strip(ptr), listing: strip({ ...listing, generated_at: 0 }), start, wk: strip(wk), seated: v.seated };
    void door;
  };

  // node:http (handleHttp), the baseline
  { const door = createDoor(kettle()); const s = createServer(async (req, res) => { if (!(await door.handleHttp(req, res, undefined, { wellKnown: true }))) { res.writeHead(404); res.end(); } });
    servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`); await exercise("node", port, door); }
  // Express, mounted BEFORE any body parser (the documented arrangement), with an app route behind
  { const mod = "express"; const express: any = (await import(mod)).default; const app = express();
    const door = createDoor(kettle()); app.use(shokaiDoor(door)); app.use(express.json()); app.get("/", (_q: any, r: any) => r.send(`<html><head>${shokaiLinkTag()}</head><body>Kettle & Leaf</body></html>`));
    const s = createServer(app); servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`); await exercise("express", port, door);
    const home = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    check(home.includes('rel="shokai"'), "Express: the app's own routes still answer behind the door");
    const prose = await fetch(`http://127.0.0.1:${port}/shokai/places/kettle/lobby`, { method: "POST", headers: { "content-type": "text/plain" }, body: "hello" });
    check(prose.status === 200 && JSON.stringify(await prose.json()).includes("lobby_briefing"), "Express: a prose POST to the lobby gets the leaflet (no body parser needed)"); }
  // Express with express.json({ verify }) in front, keeping the original bytes in req.rawBody
  { const express: any = (await import("express" as string)).default; const app = express();
    app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
    const door = createDoor(kettle()); app.use(shokaiDoor(door));
    const s = createServer(app); servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`); await exercise("express-rawbody", port, door); }
  // Express with a plain express.json() in front: the original bytes are gone, so the door refuses rather than re-serialise (C284)
  { const express: any = (await import("express" as string)).default; const app = express(); app.use(express.json());
    const door = createDoor(kettle()); app.use(shokaiDoor(door)); let err: any = null;
    app.use((e: any, _q: any, r: any, _n: any) => { err = e; r.status(500).json({ error: e?.code }); });
    const s = createServer(app); servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
    const r = await fetch(`http://127.0.0.1:${port}/shokai/places/kettle/lobby`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"type":"greeting"}' });
    check(r.status === 500 && err instanceof ShokaiRawBodyError && /express\.json\(\{ verify/.test(err.message), "Express: a parsed-only body (express.json() without verify) is refused with ShokaiRawBodyError and a clear fix, never re-serialised");
    const g = await fetch(`http://127.0.0.1:${port}/shokai/places`); check(g.status === 200, "… while GETs behind the same parser still answer"); }
  // Hono (node-server)
  { const { serve } = await import("@hono/node-server"); const door = createDoor(kettle()); const app = new Hono();
    app.all("/shokai/*", (c) => door.fetch(c.req.raw)); app.all("/shokai", (c) => door.fetch(c.req.raw)); app.get("/.well-known/shokai", (c) => door.fetch(c.req.raw));
    const port = await new Promise<number>((r) => { const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (i) => r(i.port)); servers.push(s as unknown as Server); });
    door.setBaseUrl(`http://127.0.0.1:${port}/shokai`); await exercise("hono", port, door); }
  // Next route handlers, served by a small Request/Response bridge (as Next calls them)
  { const door = createDoor(kettle()); const { GET, POST } = nextDoor(door);
    const s = createServer(async (req, res) => { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const r = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers as any, body: req.method === "POST" ? Buffer.concat(chunks) : undefined });
      const out = await (req.method === "POST" ? POST : GET)(r); res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer())); });
    servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`); await exercise("next", port, door); }

  const labels = Object.keys(seen); const b = seen.node;
  check(labels.every((l) => seen[l].seated), `a whole visit is admitted with a pass behind ${labels.join(", ")}`);
  check(labels.every((l) => seen[l].ptr === b.ptr && seen[l].wk === b.wk && seen[l].start === b.start), "every adapter serves the same pointer, the same /.well-known/shokai and the same leaflet page");
  check(labels.every((l) => JSON.parse(seen[l].listing).places[0].actions.join() === JSON.parse(b.listing).places[0].actions.join()), "… and the same place listing (actions, addresses)");

  // C284 negative controls through every supported adapter: bodies with more than one reading must never be read as a greeting
  { const bad = { duplicate: '{"type":"greeting","type":"greeting","x-review":1,"x-review":2}', numeric: '{"type":"greeting","n":1.0}', bigexp: '{"type":"greeting","n":1E400}' };
    for (const l of labels) {
      const port = ports[l]; const door = doors[l] as any; const orig = door.respond.bind(door); let got: unknown[] = [];
      // Parsing now happens once in respond(), before postParsed(). Observe the real adapter's byte boundary,
      // not the old public post() forwarding detail; the request still goes through the actual limiter/parser/host.
      door.respond = (method: string, path: string, read: () => Promise<string>, options: any) =>
        orig(method, path, async () => { const body = await read(); got.push(body); return body; }, options);
      let ok = true; const outs: string[] = [];
      for (const [k, body] of Object.entries(bad)) {
        got = []; const r = await fetch(`http://127.0.0.1:${port}/shokai/places/kettle/lobby`, { method: "POST", headers: { "content-type": "application/json" }, body });
        const t = await r.text(); outs.push(k + ":" + r.status);
        // the door must see the exact original bytes (so its strict I-JSON reading rejects them), and answer with the generic leaflet
        if (!(got.length === 1 && got[0] === body && r.status === 200 && t.includes("lobby_briefing"))) ok = false; }
      door.respond = orig;
      check(ok, `C284 behind ${l}: duplicate-member and non-canonical-number bodies reach the door byte for byte (never re-serialised) and are not read as a greeting (${outs.join(" ")})`); } }

  // discover()
  { const express: any = (await import("express" as string)).default; const app = express(); const door = createDoor(kettle());
    app.use(shokaiDoor(door, { wellKnown: false }));
    app.get("/", (_q: any, r: any) => r.send(`<!doctype html><html><head><link rel="stylesheet" href="/s.css"><link rel="alternate shokai" href="/shokai/"></head></html>`));
    const s = createServer(app); servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
    const d = await discover(`http://127.0.0.1:${port}/`, { allowLoopbackHttp: true });
    check(d?.via === "link" && doorBase(d.pointer) === `http://127.0.0.1:${port}/shokai`, "discover(): no well-known file, so the page's <link rel=\"shokai\"> (rel token list) leads to the door"); }
  { const expressPort = (servers[1].address() as any).port;
    const d = await discover(`http://127.0.0.1:${expressPort}/some/page`, { allowLoopbackHttp: true });
    check(d?.via === "well-known" && d.url.endsWith("/.well-known/shokai"), "discover(): the site's /.well-known/shokai first");
    let threw = false; try { await discover(`http://127.0.0.1:${expressPort}/`); } catch { threw = true; }
    check(threw, "discover(): plain http is refused outside loopback testing"); }
  { // a redirect that leaves the exact path, or goes to http, isn't followed into a door
    const s = createServer((req, res) => {
      if (req.url === "/.well-known/shokai") { res.writeHead(302, { location: "/.well-known/shokai?x=1" }); return res.end(); }
      if (req.url?.startsWith("/.well-known/shokai?")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ type: "door_pointer", place_listing: "http://127.0.0.1/evil/places" })); }
      res.writeHead(200, { "content-type": "text/html" }); res.end("<html></html>"); });
    servers.push(s); const port = await listen(s);
    check(await discover(`http://127.0.0.1:${port}/`, { allowLoopbackHttp: true }) === null, "discover(): a well-known redirect to another path or a query is not a door");
  }
  // P26 amendment A (draft): binding a door to the site it claims. Loopback origins differ by port, so each server is its own site.
  { const P_REAL = "did:jwk:real-lanternmoss-owner", P_FAKE = "did:jwk:someone-else";
    const files: Record<string, unknown> = {}; const pages: Record<string, string> = {}; const moved: Record<string, string> = {};
    const mk = async () => { const s = createServer((req, res) => { const host = `http://${req.headers.host}`;
      if (moved[host + req.url]) { res.writeHead(302, { location: moved[host + req.url] }); return res.end(); }
      if (req.url === "/.well-known/shokai" && files[host] !== undefined) { res.writeHead(200, { "content-type": "application/json" }); return res.end(typeof files[host] === "string" ? files[host] as string : JSON.stringify(files[host])); }
      if (req.url === "/" && pages[host]) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pages[host]); }
      res.writeHead(404, { "content-type": "application/json" }); res.end("{}"); }); servers.push(s); return `http://127.0.0.1:${await listen(s)}`; };
    const S = await mk(), T = await mk(), U = await mk();
    const ptr = (base: string, places: Record<string, unknown>[]) => ({ type: "door_pointer", protocol: "shokai/0.5", place_listing: base + "/shokai/places", places, start_with: "greeting", spec_ref: { version: "0.5.0", url: "https://spec.example/shokai" } });
    const at = (base: string, name = "lanternmoss") => ({ name, entry: `${base}/shokai/places/${name}/entry`, lobby: `${base}/shokai/places/${name}/lobby`, inbox: `${base}/shokai/places/${name}/inbox`, onboarding_url: `${base}/start` });
    const card = (principal: string, entry: string, site?: string) => ({ principal: { principal_id: principal }, place: { principal_id: principal, entry, ...(site ? { site } : {}) } });
    const lb = { allowLoopbackHttp: true };
    files[S] = ptr(S, [at(S), { ...at(T, "lanternmoss-events"), principal_id: P_REAL }]);
    const dS = await discover(S + "/", lb);
    check(dS?.via === "well-known" && dS.site === S, "P26-A: the site's own /.well-known/shokai, read on its own origin, is the site's word (discovery.site)");
    check(bindToSite(S, dS, card(P_REAL, at(S).entry, S)).ok, "P26-A: the site lists the entry and the Shōkai host card names the site: the door is the site's own door");
    check((bindToSite(S, dS, card(P_FAKE, at(U).entry, S)) as any).why === "not_listed_by_site", "P26-A: a fake door elsewhere whose Shōkai host card claims the site isn't listed by the site: not bound");
    check((bindToSite(S, dS, card(P_FAKE, at(U).entry, U)) as any).why === "card_names_another_site", "P26-A: a Shōkai host card that names another site doesn't bind to this one");
    check((bindToSite(S, dS, card(P_REAL, at(S).entry)) as any).why === "no_site_on_card", "P26-A: a Shōkai host card that names no site binds to none (a v0.5.0 card)");
    check(bindToSite(S, dS, card(P_REAL, at(T, "lanternmoss-events").entry, S)).ok, "P26-A: a door on another origin binds when the site's file names it with its principal");
    check((bindToSite(S, dS, card(P_FAKE, at(T, "lanternmoss-events").entry, S)) as any).why === "principal_mismatch", "P26-A: … and not when the Shōkai host card's principal is another one");
    files[S] = ptr(S, [at(S), at(T, "lanternmoss-events")]); const dS2 = await discover(S + "/", lb);
    check((bindToSite(S, dS2, card(P_REAL, at(T, "lanternmoss-events").entry, S)) as any).why === "principal_not_named", "P26-A: a cross-origin door the site's file doesn't pin by principal is a hint, never bound");
    moved[S + "/.well-known/shokai"] = T + "/.well-known/shokai"; files[T] = ptr(T, [at(T)]);
    const dR = await discover(S + "/", lb);
    check(!!dR && dR.site === null && (bindToSite(S, dR, card(P_FAKE, at(T).entry, S)) as any).why === "not_the_sites_file", "P26-A: a well-known redirect to another origin still finds a pointer, but it is never the site's word");
    delete moved[S + "/.well-known/shokai"]; delete files[S];
    pages[S] = `<html><head><title>Lanternmoss</title></head><body><p>A comment: <link rel="shokai" href="${U}/.well-known/shokai"></p></body></html>`; files[U] = ptr(U, [at(U)]);
    check(await discover(S + "/", lb) === null, "P26-A: a rel=\"shokai\" link in the page's body is ignored (head only)");
    pages[S] = `<html><head><link rel="shokai" href="${U}/.well-known/shokai"></head></html>`; const dL = await discover(S + "/", lb);
    check(dL?.via === "link" && dL.site === null, "P26-A: a head link to another origin's file leads to a door, as a hint only (discovery.site null)");
    files[S] = "{\"pad\":\"" + "x".repeat(MAX_DISCOVERY_BYTES) + "\"}"; pages[S] = "<html></html>";
    check(await discover(S + "/", lb) === null, "P26-A: a discovery file over 64 KiB is not read (no door found, never truncated)");
    check(siteOrigin("https://LanternMoss.EXAMPLE:443/tea?x=1#y") === "https://lanternmoss.example" && siteOrigin("https://bücher.example/") === "https://xn--bcher-kva.example" && siteOrigin("https://a:b@lanternmoss.example/") === null,
      "P26-A: siteOrigin(): lowercase, default port dropped, ASCII host, no path; user info has no site"); }
  check(JSON.stringify(shokaiLinks(`<LINK href='/a' REL="Shokai"><link rel=icon href=/b><link rel="me shokai" href="https://x.example/.well-known/shokai">`)) === JSON.stringify(["/a", "https://x.example/.well-known/shokai"]), "shokaiLinks(): any case, any quoting, rel as a token list");

  // the MCP gate with a store: a conflicting write refuses the call, never lets it through
  { const { shokaiGate } = await import("../src/mcp.js"); const shared = memoryStore(); let racing = false;
    const store = { load: shared.load, save: async (st: any, v: number) => { if (racing) { racing = false; await shared.save(st, shared.peek()!.version); } return shared.save(st, v); } };
    const door = createDoor(kettle({ store })); await door.ready; let ran = 0;
    const s = createServer(shokaiGate(door, async (_q, res) => { ran++; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } })); }));
    servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
    const v = await aya.visit(await findPlace(`http://127.0.0.1:${port}/shokai`, "kettle"), { purpose: "visitation", actions: ["tea.browse"], mandate: { fresh: true } });
    const call = async () => fetch(`http://127.0.0.1:${port}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "shokai-act": Buffer.from(JSON.stringify(v.signAct("tea.browse", {}))).toString("base64url") },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "tea.browse", arguments: {} } }) });
    racing = true; const busy = await (await call()).json() as any;
    check(busy.error?.code === -32012 && busy.error?.data?.shokai?.reason_code === "HOST_BUSY" && ran === 0, "MCP gate with a store: another instance wrote first, so the call is refused with a retry and the tool never runs");
    const ok = await (await call()).json() as any;
    check(ok.result && ran === 1, "… and the retry goes through"); }

  // Gemini round-2: a body over MAX_ADAPTER_BODY gets HTTP 413 (not truncated JSON).
  { const express: any = (await import("express" as string)).default; const app = express();
    const door = createDoor(kettle({ name: "bigbody" })); app.use(shokaiDoor(door));
    const s = createServer(app); servers.push(s); const port = await listen(s); door.setBaseUrl(`http://127.0.0.1:${port}/shokai`);
    const big = Buffer.alloc(MAX_ADAPTER_BODY + 1, 0x61); // one byte over the cap
    const r = await fetch(`http://127.0.0.1:${port}/shokai/places/bigbody/lobby`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: big });
    const body = await r.text();
    check(r.status === 413 && /payload_too_large|SHOKAI_PAYLOAD_TOO_LARGE/.test(body), `Express: body > ${MAX_ADAPTER_BODY} bytes → HTTP 413 (got ${r.status}: ${body.slice(0, 120)})`);
    check(typeof ShokaiPayloadTooLargeError === "function", "ShokaiPayloadTooLargeError is exported"); }

  for (const s of servers) s.close();
  console.log(`${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
