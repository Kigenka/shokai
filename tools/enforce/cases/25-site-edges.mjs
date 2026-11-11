// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Case 25: the edges of site binding (§3.1.1). Three real doors run on 127.0.0.1 (the real Lanternmoss, a door at a homograph site,
// and a lookalike that claims lanternmoss.example). Local stand-in "websites" (one 127.0.0.1 server per site name, reached through a
// resolver stand-in that follows redirects) serve /.well-known/shokai in every awkward way. Nothing leaves this computer.
import http from "node:http";

export default (H) => [H.kase("25-site-edges",
  "Site binding at the edges",
  "The site's /.well-known/shokai redirects to another origin, to http on an https site, or to another path; the page's head link and the well-known file disagree; the file lists two doors, or one door twice under two owners; the file is malformed or too big; a homograph site name (a Cyrillic а in lanternmoss.example); and a door-key rotation after which the old door must stop binding.",
  "SPEC §3.1.1 (site binding), C257 (P26 amendment A: the site's own file, its own origin and exact path; the host shown in ASCII)",
  async ({ expect, saw }) => {
    const { fs, os, path, sdk, startDoor, port, findPlace, REAL_SITE, wren, go, sentTypes, ERRAND } = H;
    const { checkSite, siteHost, sitePlaceLabel, createDoor } = sdk;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "shokai-edges-")); const kids = [], servers = [];
    const WK = "/.well-known/shokai"; const R = new Map(); const json = (o) => JSON.stringify(o);
    const UNI = "https://l\u0430nternmoss.example", PUNY = new URL(UNI).origin, OTHER = "https://cdn.lanternmoss-tea.example", PLAIN = "http://lanternmoss.example";
    const rfetch = async (url, init = {}) => {   // resolver stand-in that follows redirects and reports the final URL, as a browser would
      let u = new URL(url);
      for (let i = 0; i < 6; i++) {
        const p = R.get(u.origin); if (!p) throw new Error(`${u.origin}: no such site (resolver stand-in)`);
        const r = await fetch(`http://127.0.0.1:${p}${u.pathname}${u.search}`, { headers: init.headers, redirect: "manual", signal: init.signal });
        const loc = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && loc) { u = new URL(loc, u); continue; }
        const out = new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers }); Object.defineProperty(out, "url", { value: u.href }); return out;
      }
      throw new Error("too many redirects");
    };
    const SF = { fetch: rfetch };
    async function mk(origin) {
      const routes = new Map(); const p = await port();
      const s = http.createServer((req, res) => { const r = routes.get(new URL(req.url, "http://x").pathname); if (!r) { res.writeHead(404); return res.end(); }
        res.writeHead(r.status, { "content-type": "application/json", ...r.headers }); res.end(r.body); });
      await new Promise((ok) => s.listen(p, "127.0.0.1", ok)); servers.push(s); R.set(origin, p);
      return { routes, put: (pth, status, body, headers = {}) => routes.set(pth, { status, body, headers }) };
    }
    const open = async (name, site) => {
      const dir = path.join(root, name); const d = await startDoor(await port(), dir, [`--site=${site}`]); kids.push(d.child);
      const pointer = await (await fetch(new URL(d.base).origin + WK)).json();
      const card = JSON.parse(fs.readFileSync(path.join(dir, "lanternmoss-host-card.json"), "utf8")).payload;
      return { ...d, pointer, card, entry: card.place.entry, owner: card.place.principal_id, place: await findPlace(d.base, "lanternmoss") };
    };
    const CK = (site, card) => checkSite(site, card, { fetch: rfetch, allowLoopbackHttp: true });
    const A = (site) => ({ site, siteFetch: SF, mandate: { fresh: true, statement: ERRAND.mandate.statement } });
    const asked = (v) => sentTypes(v).includes("invitation_request"); const shut = (v) => !v.seat && !asked(v);
    const done = async (v) => { if (v.seat) await v.farewell().catch(() => undefined); };
    try {
      const S = await mk(REAL_SITE), O = await mk(OTHER), PL = await mk(PLAIN), PY = await mk(PUNY);
      const d1 = await open("real", REAL_SITE), d2 = await open("homograph", PUNY), d3 = await open("claimer", REAL_SITE);
      const reset = () => { for (const x of [S, O, PL, PY]) x.routes.clear(); };

      // control: the honest path
      reset(); S.put(WK, 200, json(d1.pointer));
      const c0 = await CK(REAL_SITE, d1.card); const v0 = await go(wren(), d1.place, A(REAL_SITE));
      expect(c0.ok === true && c0.via === "well-known", `control: the site's own file lists the door, so it binds (${c0.ok ? c0.via : c0.why})`);
      expect(!!v0.seat && v0.verifiedSite === REAL_SITE, `control: Wren seated at the real door, verified site ${v0.verifiedSite}`); await done(v0);

      // redirects
      const seen = [];
      for (const [label, setup] of [
        ["to another origin", () => { S.put(WK, 302, "", { location: `${OTHER}${WK}` }); O.put(WK, 200, json(d1.pointer)); }],
        ["to http on an https site", () => { S.put(WK, 302, "", { location: `${PLAIN}${WK}` }); PL.put(WK, 200, json(d1.pointer)); }],
        ["to another path on the site", () => { S.put(WK, 302, "", { location: "/static/shokai.json" }); S.put("/static/shokai.json", 200, json(d1.pointer)); }],
      ]) {
        reset(); setup(); const r = await CK(REAL_SITE, d1.card); const v = await go(wren(), d1.place, A(REAL_SITE)); seen.push(`${label}: ${r.why ?? "BOUND"}`);
        expect(!r.ok && shut(v), `the file redirected ${label}: not bound (${r.why ?? "bound"}), ${asked(v) ? "an errand was sent" : "no errand sent"}`); await done(v);
      }
      reset(); PL.put(WK, 200, json(d1.pointer)); const hp = await CK(PLAIN, d1.card);
      expect(!hp.ok, `a site named with plain http is never bound, even though it serves the file (${hp.why ?? "bound"})`);

      // homograph site names
      expect(PUNY.startsWith("https://xn--") && PUNY !== REAL_SITE && siteHost(UNI).startsWith("xn--") && !/[^\x00-\x7f]/.test(siteHost(UNI)), `the lookalike name is compared and shown as its ASCII form (${siteHost(UNI)})`);
      const label = sitePlaceLabel(PUNY, "Lanternmoss Tea House");
      expect(!label.startsWith("lanternmoss.example") && /^xn--/.test(label) && !/[^\x00-\x7f]/.test(label.split(" (")[0]), `a door verified at the homograph site is named "${label.split(" (")[0]}", never lanternmoss.example`);
      let code = ""; try { createDoor({ name: "x", displayName: "X", category: "store", purposes: [{ code: "visitation", statement: "Looking." }], actions: [{ action: "menu.view", purposes: ["visitation"], level: "discover", data_asks: [] }], testProfile: true, site: UNI }); } catch (e) { code = e.code ?? ""; }
      expect(code === "SHOKAI_DOOR_SITE_INVALID", `a door can't name its site in Unicode form; only the ASCII form (${code || "accepted"})`);
      reset(); S.put(WK, 200, json(d1.pointer)); PY.put(WK, 200, json(d2.pointer));
      const vh = await go(wren(), d2.place, A(REAL_SITE));
      expect(shut(vh) && vh.placeCheck.site?.why === "card_names_another_site", `a door at the homograph site, when Jun named lanternmoss.example: refused before any errand (${vh.placeCheck.site?.why})`); await done(vh);
      const vu = await go(wren(), d2.place, A(UNI)); const rn = vu.seat ? vu.report().host.display_name : "";
      expect(!!vu.seat && vu.verifiedSite === PUNY && /^xn--/.test(rn) && !/[^\x00-\x7f]/.test(rn.split(" (")[0]), `Jun pasted the lookalike name: Wren's report names it ${rn.split(" (")[0] || "(not seated)"}, in ASCII`); await done(vu);

      // head link versus the well-known file
      reset(); S.put(WK, 200, json(d3.pointer)); S.put("/", 200, `<html><head><link rel="shokai" href="/moved/door.json"></head><body>Shop</body></html>`, { "content-type": "text/html" }); S.put("/moved/door.json", 200, json(d1.pointer));
      const dis = await CK(REAL_SITE, d1.card); const vd = await go(wren(), d1.place, A(REAL_SITE));
      expect(!dis.ok && dis.why === "not_listed_by_site" && shut(vd), `the well-known file lists another door and the head link lists this one: the file wins, nothing binds (${dis.why ?? "bound"})`); await done(vd);
      reset(); S.put("/", 200, `<html><head><link rel="shokai" href="/moved/door.json"></head></html>`, { "content-type": "text/html" }); S.put("/moved/door.json", 200, json(d1.pointer));
      const lk = await CK(REAL_SITE, d1.card);
      expect(!lk.ok, `no well-known file, only a head link to another path: a hint, never the site's word (${lk.why ?? "bound"})`);

      // two doors in one file
      const item = (d) => d.pointer.places[0];
      reset(); S.put(WK, 200, json({ ...d1.pointer, places: [item(d1), item(d3)] }));
      const t1 = await CK(REAL_SITE, d1.card), t3 = await CK(REAL_SITE, d3.card);
      expect(t1.ok && t1.entry === d1.entry && t3.ok && t3.entry === d3.entry, `a file listing two doors binds each only to its own entry (${t1.ok ? "door 1 ok" : t1.why}, ${t3.ok ? "door 2 ok" : t3.why})`);
      S.put(WK, 200, json({ ...d1.pointer, places: [item(d1), { ...item(d1), principal_id: d3.owner }] }));
      const dup = await CK(REAL_SITE, d1.card);
      expect(!dup.ok, `the same entry listed under two owners is ambiguous: not bound (${dup.why ?? "bound"})`);
      S.put(WK, 200, json({ ...d1.pointer, places: [item(d1), { ...item(d3), principal_id: d1.owner }] }));
      const wp = await CK(REAL_SITE, d3.card), vw = await go(wren(), d3.place, A(REAL_SITE));
      expect(!wp.ok && shut(vw), `a lookalike listed with the real owner's key: its own card's owner differs, not bound (${wp.why ?? "bound"})`); await done(vw);

      // malformed and oversized files
      const bad = [["not JSON", "{not json"], ["a JSON list", "[]"], ["null", "null"], ["the wrong type", json({ ...d1.pointer, type: "door_listing" })], ["no place_listing", json({ type: "door_pointer", places: d1.pointer.places })],
        ["over 64 KiB", json({ ...d1.pointer, padding: "x".repeat(70 * 1024) })]]; const outs = [];
      for (const [name, body] of bad) { reset(); S.put(WK, 200, body); const r = await CK(REAL_SITE, d1.card); outs.push(`${name}: ${r.why ?? "BOUND"}`); expect(!r.ok, `a file that is ${name}: no binding (${r.why ?? "bound"})`); }
      reset(); S.put(WK, 200, json({ ...d1.pointer, padding: "x".repeat(30 * 1024) })); const big = await CK(REAL_SITE, d1.card);
      expect(big.ok === true, `control: the same file at 30 KiB still binds, so the 64 KiB refusal is about size (${big.ok ? "bound" : big.why})`);

      // door-key rotation: the site now lists the new door; the old one must not ride on an earlier answer
      reset(); S.put(WK, 200, json(d1.pointer)); const wr = wren();
      const r1 = await go(wr, d1.place, A(REAL_SITE)); expect(!!r1.seat && r1.verifiedSite === REAL_SITE, "before the rotation, the old door binds"); await done(r1);
      S.put(WK, 200, json(d3.pointer));
      const r2 = await go(wr, d1.place, A(REAL_SITE)), r3 = await go(wr, d3.place, A(REAL_SITE));
      expect(shut(r2) && r2.placeCheck.site?.why === "not_listed_by_site", `after the site lists the new door, the same agent's next visit to the old door is refused, no stale answer (${r2.placeCheck.site?.why ?? "bound"})`);
      expect(!!r3.seat && r3.verifiedSite === REAL_SITE, "…and the new door binds"); await done(r3);
      saw(`refused every redirect (${seen.join("; ")}), kept the file over the head link, bound two listed doors each to its own entry and refused the ambiguous ones, refused malformed and oversized files (${outs.join("; ")}), showed the homograph as ${siteHost(UNI)}, and re-read the site after a rotation.`);
    } finally {
      for (const c of kids) if (c.exitCode === null) c.kill("SIGTERM");
      for (const s of servers) { s.closeAllConnections?.(); s.close(); }
      fs.rmSync(root, { recursive: true, force: true });
    }
  })];
