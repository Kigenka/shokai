// SPDX-License-Identifier: Apache-2.0
// Case 30: the /business "Be first to know" form is inert. A real headless Chrome loads the page, someone fills the fields and
// presses Enter; no request may leave the page, every field and the form's button stay disabled, and no form has an action.
// The browser window is made tall enough to show the whole page at load and nothing is scrolled, so the site's own link prefetch
// (VitePress fetches a linked page's script when the link scrolls into view) happens before counting starts, not because of the test.
import http from "node:http";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

export default (H) => [H.kase("30-business-form-inert", "The shop sign-up form on /business does nothing",
  "A headless browser loads /business, types into every field, clicks the button and presses Enter; the page watches for any request, any enabled field and any form action.",
  "Site /business (\"Shōkai for shops\", coming soon): the notify form is a placeholder that sends nothing",
  async ({ expect, saw }) => {
    const dist = process.env.SHOKAI_SITE_DIST ? H.path.resolve(process.env.SHOKAI_SITE_DIST) : H.path.resolve(H.here, "fixtures/site-dist");
    const chromePath = process.env.SHOKAI_CHROME ?? "/usr/bin/google-chrome";
    if (!H.fs.existsSync(H.path.join(dist, "business.html"))) { expect(false, "site build not found"); saw(`no business.html under ${dist}.`); return; }
    if (!H.fs.existsSync(chromePath)) { expect(false, `Chrome not found at ${chromePath}`); return; }
    const tmp = H.fs.mkdtempSync(H.path.join(H.os.tmpdir(), "shokai-biz-"));
    const hits = []; let chrome, ws, srv;
    try {
      // the site, served from its built files on 127.0.0.1
      srv = http.createServer((req, res) => {
        const u = new URL(req.url ?? "/", "http://x"); let p = decodeURIComponent(u.pathname);
        hits.push(`${req.method} ${p}${u.search}`);
        if (p === "/") p = "/index.html"; else if (!H.path.extname(p)) p += ".html";
        const f = H.path.join(dist, p);
        if (!f.startsWith(dist) || !H.fs.existsSync(f) || !H.fs.statSync(f).isFile()) { res.writeHead(404).end("not found"); return; }
        res.writeHead(200, { "content-type": TYPES[H.path.extname(f)] ?? "application/octet-stream" }); res.end(H.fs.readFileSync(f));
      });
      const sitePort = await H.port(); await new Promise((r) => srv.listen(sitePort, "127.0.0.1", r));
      const cdpPort = await H.port();
      chrome = H.spawn(chromePath, ["--headless=new", `--remote-debugging-port=${cdpPort}`, "--remote-allow-origins=*", `--user-data-dir=${H.path.join(tmp, "profile")}`,
        "--no-first-run", "--no-sandbox", "--disable-gpu", "--disable-extensions", "about:blank"], { stdio: ["ignore", "ignore", "ignore"] });
      H.children.push(chrome);
      // find the page target
      let target = null;
      for (let i = 0; i < 60 && !target; i++) {
        try { const l = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); target = l.find((t) => t.type === "page"); } catch { /* not up yet */ }
        if (!target) await sleep(250);
      }
      if (!target) throw new Error("Chrome did not open a debugging page in 15 s");
      // a small CDP client over Node's global WebSocket
      ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP websocket failed")); });
      let id = 0; const pending = new Map(); const listeners = [];
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const [ok, bad] = pending.get(m.id); pending.delete(m.id); m.error ? bad(new Error(m.error.message)) : ok(m.result); } else if (m.method) for (const l of listeners) l(m); };
      const send = (method, params = {}) => new Promise((ok, bad) => { const n = ++id; pending.set(n, [ok, bad]); ws.send(JSON.stringify({ id: n, method, params })); });
      const once = (method) => new Promise((r) => { const l = (m) => { if (m.method === method) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } }; listeners.push(l); });
      const reqs = [];
      listeners.push((m) => { if (m.method === "Network.requestWillBeSent" && /^(https?|wss?):/.test(m.params.request.url)) reqs.push({ t: Date.now(), url: m.params.request.url }); });
      await send("Network.enable"); await send("Page.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 9000, deviceScaleFactor: 1, mobile: false });   // the whole page in view: nothing to scroll
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url: `http://127.0.0.1:${sitePort}/business` });
      await Promise.race([loaded, sleep(15000)]);
      // let hydration and lazy chunks finish: quiet for a full second, then start counting
      const t0 = Date.now();
      while (Date.now() - t0 < 10000 && (Date.now() - t0 < 1500 || (reqs.length && Date.now() - reqs[reqs.length - 1].t < 1000))) await sleep(200);
      const baseline = reqs.length, hitsBase = hits.length;
      const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
      const before = await ev(`({ fields: document.querySelectorAll("input,textarea,select").length, buttons: document.querySelectorAll(".bl-notify button, .bl-form button").length, title: document.title })`);
      // the visitor: focus and type into each field, click the button, press Enter
      const ids = await ev(`[...document.querySelectorAll("input,textarea,select")].map((e, i) => { if (!e.id) e.id = "enf-" + i; return e.id; })`) ?? [];
      const enter = async () => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); };
      for (const f of ids) {
        await ev(`document.getElementById(${JSON.stringify(f)}).focus({ preventScroll: true })`);
        await send("Input.insertText", { text: "pia@lanternmoss.example" }); await enter();
      }
      const rects = (await ev(`[...document.querySelectorAll(".bl-notify button, .bl-form button")].map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })`)) ?? [];
      for (const r of rects) { for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 }); }
      await enter();
      await sleep(1500);
      const after = await ev(`(() => { const q = (s) => [...document.querySelectorAll(s)]; const fields = q("input,textarea,select"); const btns = q(".bl-notify button, .bl-form button");
        return { href: location.href, fields: fields.length, enabledFields: fields.filter((e) => !e.disabled).map((e) => e.id || e.tagName), buttons: btns.length, enabledButtons: btns.filter((e) => !e.disabled).map((e) => e.textContent.trim()),
          forms: document.forms.length, actions: q("form[action]").length + q("[formaction]").length, typed: fields.filter((e) => e.value).length }; })()`);
      const late = reqs.slice(baseline).map((r) => r.url), lateHits = hits.slice(hitsBase);

      expect(hits.some((h) => h === "GET /business") && reqs.length > 0 && before?.fields >= 3 && before?.buttons >= 1,
        `control: the page loaded (${reqs.length} requests while loading, ${before?.fields} fields, ${before?.buttons} button in the form)`);
      expect(late.length === 0 && lateHits.length === 0, `no request left the page after it loaded, through typing, a click and Enter (${late.length ? late.join(", ") : lateHits.length ? lateHits.join(", ") : "none"})`);
      expect(after?.fields >= 3 && after.enabledFields.length === 0 && after.enabledButtons.length === 0,
        `every field and the form's button is disabled (enabled: ${[...(after?.enabledFields ?? []), ...(after?.enabledButtons ?? [])].join(", ") || "none"})`);
      expect(after?.actions === 0, `no form has an action (forms: ${after?.forms}, action attributes: ${after?.actions})`);
      expect(after?.typed === 0 && /\/business$/.test(after?.href ?? ""), `nothing typed landed in a field and the page stayed put (${after?.typed} fields hold text, at ${after?.href})`);
      saw(`was loaded in a headless browser; ${ids.length} fields typed into, the button clicked, Enter pressed; ${late.length} requests left the page, ${after?.enabledFields?.length ?? "?"} fields enabled.`);
    } finally {
      try { ws?.close(); } catch { /* closed */ }
      if (chrome && chrome.exitCode === null) {
        chrome.kill("SIGTERM");
        await Promise.race([H.exited(chrome), sleep(4000)]);
        if (chrome.exitCode === null) {
          try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
          await Promise.race([H.exited(chrome), sleep(2000)]);
        }
      }
      if (srv) await new Promise((r) => srv.close(() => r()));
      // Chrome can still be writing its user-data dir after the parent exits. A leftover
      // temp profile must not fail a case whose checks already ran.
      for (let i = 0; i < 10; i++) {
        try { H.fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); break; }
        catch (e) { if (i === 9) console.warn(`enforce: case 30 left ${tmp}: ${e.message}`); else await sleep(250); }
      }
    }
  })];
