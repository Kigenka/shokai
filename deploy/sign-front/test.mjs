// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Local check of the sign.kigenka.com front (site/) against the rc4 reference signing page, on loopback only:
// the built relay forwards every path the rc4 page needs (including /about and the one-tap batch routes), refuses everything
// else, and the page arrives with the test-stage notice. Usage: node deploy/sign-front/test.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)), SP = join(HERE, "..", "..", "reference", "signing-page");
const { relay, route } = await import(join(HERE, "site", "api", "relay.js"));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}`); };
const free = () => new Promise((r) => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const TOKEN = randomBytes(24).toString("base64url"), SECRET = randomBytes(32).toString("base64url"), tmp = mkdtempSync(join(tmpdir(), "sign-front-"));
const PORT = await free();
const srv = spawn(process.execPath, [join(SP, "server.mjs")], { env: { ...process.env, RP_ID: "sign.kigenka.com", TOKEN, RELAY_SECRET: SECRET, PORT: String(PORT), TTL_MIN: "5", DATA_DIR: tmp, NOTICE: "test-stage", ITEMS: join(SP, "items.example.json") }, stdio: "ignore" });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const session = { backend_origin: `http://127.0.0.1:${PORT}`, token_sha256: createHash("sha256").update(TOKEN).digest("hex"), relay_secret: SECRET, expires_at: new Date(Date.now() + 5 * 60e3).toISOString() };
  const FPORT = await free();
  const front = http.createServer((req, res) => { const u = new URL(req.url, "http://x"); if (u.pathname.startsWith("/p/")) req.url = "/api/relay?p=" + encodeURIComponent(u.pathname.slice(3)); return relay(req, res, session); }).listen(FPORT, "127.0.0.1");
  const F = `http://127.0.0.1:${FPORT}/p/${TOKEN}`;
  try {
    const site = (f) => readFileSync(join(HERE, "site", f), "utf8");
    ok(/test-stage convenience/.test(site("index.html")) && /href="\/about"/.test(site("index.html")), "inert page names the test stage and links to /about");
    ok(/test-stage convenience/.test(site("about.html")) && /at least 90 days in advance\. A way/.test(site("about.html")) && !/\{\{/.test(site("about.html")), "/about carries the full notice for sign.kigenka.com, filled in");
    ok(route("/api/relay?p=" + TOKEN + "/api/state", null).inert, "no open session: everything is inert");
    let r = await fetch(F + "/"); let t = await r.text();
    ok(r.status === 200 && /test-stage convenience/.test(t), "session page arrives through the relay with the test-stage notice");
    r = await fetch(F + "/about"); t = await r.text();
    ok(r.status === 200 && /About this signing page/.test(t), "/about is relayed during a session");
    r = await fetch(F + "/api/state"); const s = await r.json();
    ok(r.status === 200 && s.rp_id === "sign.kigenka.com", "state through the relay names rp_id sign.kigenka.com");
    r = await fetch(F + "/api/batch/options", { method: "POST", body: "{}" });
    ok(r.status !== 404 && /json/.test(r.headers.get("content-type") ?? ""), `one-tap batch route reaches the page (HTTP ${r.status}, not the inert 404)`);
    r = await fetch(F + "/api/batch/verify", { method: "POST", body: "{}" });
    ok(r.status !== 404, `batch verify route reaches the page (HTTP ${r.status})`);
    r = await fetch(`http://127.0.0.1:${FPORT}/p/${randomBytes(24).toString("base64url")}/api/state`);
    ok(r.status === 404 && /No signing session is open/.test(await r.text()), "a wrong token gets the inert page");
    r = await fetch(F + "/run-data/owner-credential.json");
    ok(r.status === 404, "a path the page doesn't serve is never relayed");
    r = await fetch(`http://127.0.0.1:${PORT}/p/${TOKEN}/api/state`);
    ok(r.status === 404, "the backend refuses a request without the relay secret");
  } finally { front.close(); }
} finally { srv.kill("SIGTERM"); rmSync(tmp, { recursive: true, force: true }); }
console.log(`sign-front: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
