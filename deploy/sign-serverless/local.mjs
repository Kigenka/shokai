// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Local harness for the serverless signing page: runs the built handlers (site/api/_lib/core.mjs) behind a loopback HTTP server,
// with a file store laid out like the reference page's DATA_DIR. It takes the SAME env as reference/signing-page/server.mjs
// (RP_ID, TOKEN, ITEMS, DATA_DIR, PORT, TTL_MIN, NOTICE, NOTICE_DAYS, RELAY_SECRET), so the reference e2e runs unchanged against
// it: SIGNING_SERVER=deploy/sign-serverless/local.mjs node reference/signing-page/test/e2e.mjs
// The session is opened through the admin route, as on Vercel; only here may the caller choose the token (allowGivenToken).
// RELAY_SECRET, if set, is checked here as the e2e expects; the serverless deployment has no relay.
import http from "node:http";
import { Readable } from "node:stream";
import { readFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
const HERE = dirname(fileURLToPath(import.meta.url)), LIB = join(HERE, "site", "api", "_lib");
const { createApp, sessionId } = await import(join(LIB, "core.mjs"));
const { dirStore } = await import(join(LIB, "stores.mjs"));
const { checkItems } = await import(join(LIB, "items.mjs"));
const E = process.env, RP_ID = E.RP_ID, TOKEN = E.TOKEN, PORT = Number(E.PORT ?? 8797), TTL_MIN = Number(E.TTL_MIN ?? 30);
const NOTICE = E.NOTICE ?? "none", NOTICE_DAYS = Number(E.NOTICE_DAYS ?? 90);
if (!RP_ID || !/^[a-z0-9.-]+$/.test(RP_ID) || !TOKEN || TOKEN.length < 24) { console.error("RP_ID (a hostname) and TOKEN (≥ 24 chars) are required"); process.exit(2); }
if (!["none", "test-stage"].includes(NOTICE) || !Number.isInteger(NOTICE_DAYS) || NOTICE_DAYS < 90) { console.error('NOTICE must be "none" or "test-stage", and NOTICE_DAYS a whole number of days, at least 90'); process.exit(2); }
const ITEMS = JSON.parse(readFileSync(E.ITEMS ?? join(HERE, "..", "..", "reference", "signing-page", "items.example.json"), "utf8"));
const problems = checkItems(ITEMS); if (problems.length) { console.error("items not ready:\n  " + problems.join("\n  ")); process.exit(2); }
const DATA = E.DATA_DIR ?? join(HERE, "run-data"); mkdirSync(DATA, { recursive: true, mode: 0o700 }); chmodSync(DATA, 0o700);
const SID = sessionId(TOKEN);
const layout = (k) => k === `cred:${RP_ID}` ? "owner-credential.json" : k === `s:${SID}:frozen` ? "frozen-items.json" : k.startsWith(`s:${SID}:signed:`) ? join("signed", k.slice(`s:${SID}:signed:`.length) + ".json") : null;
const store = dirStore(DATA, layout);
const ADMIN = randomBytes(32).toString("base64url");
const app = createApp({ store, rpId: RP_ID, notice: NOTICE, noticeDays: NOTICE_DAYS, adminSecret: ADMIN, allowGivenToken: true, log: (...a) => console.error(new Date().toISOString(), ...a) });
const created = await app.admin(new Request("http://x/api/admin", { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ op: "create", items: ITEMS, ttl_min: Math.min(30, Math.max(1, Math.round(TTL_MIN))), token: TOKEN }) }));
if (created.status !== 200) { console.error("could not open the session:", await created.text()); process.exit(2); }
const RELAY = E.RELAY_SECRET ? createHash("sha256").update(E.RELAY_SECRET).digest() : null;
const relayOk = (req) => !RELAY || timingSafeEqual(createHash("sha256").update(String(req.headers["x-sign-relay"] ?? "")).digest(), RELAY);
const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (!relayOk(req) || !url.pathname.startsWith("/p/")) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : Readable.toWeb(req);
  const request = new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" });
  const r = await app.page(request, decodeURIComponent(url.pathname.slice(3)));
  const close = r.status === 413;
  res.writeHead(r.status, { ...Object.fromEntries(r.headers), ...(close ? { Connection: "close" } : {}) });
  res.end(Buffer.from(await r.arrayBuffer()));
  if (close) res.on("finish", () => req.destroy());
});
srv.listen(PORT, "127.0.0.1", () => console.log(`serverless signing page (local harness) on 127.0.0.1:${PORT}/p/${TOKEN.slice(0, 4)}…, rp_id ${RP_ID}, store ${store.kind}, closes in ${TTL_MIN} min`));
setTimeout(() => { srv.close(); process.exit(0); }, TTL_MIN * 60e3).unref();
