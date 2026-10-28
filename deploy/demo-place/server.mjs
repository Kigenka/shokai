// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The Shōkai demo place: a fictional tea shop's door that any agent can visit. Nothing is sold, nothing is stored about people.
// Every act is simulated. Locked down for a public host: loopback by default, small bodies, a per-IP rate limit, an encounter
// cap, durable door state, a kill switch, and no logging of message bodies. See DEPLOY.md before putting it on the internet.
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createDoor, generatePrincipalKey } from "@kigenka/shokai";
import { loadOrCreateKeys } from "./keys.mjs";

const env = process.env;
const PORT = Number(env.PORT ?? 8080), HOST = env.HOST ?? "127.0.0.1";
const PUBLIC_URL = (env.PUBLIC_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const DATA_DIR = env.DATA_DIR ?? "./demo-data";
const KILL_FILE = env.KILL_FILE ?? join(DATA_DIR, "CLOSED");              // touch it to close the door without a restart
const RATE = Number(env.RATE_PER_MIN ?? 60), MAX_BODY = Number(env.MAX_BODY ?? 64 * 1024);
const closed = () => env.SHOKAI_DEMO_CLOSED === "1" || existsSync(KILL_FILE);
mkdirSync(DATA_DIR, { recursive: true });

// Keys: with KEY_DIR set, the door keeps one identity across restarts (PEM files, 0600, made on first start; keys.mjs). Without it,
// keys are made at each start and the identity changes on restart, which a demo can live with. Never commit keys.
const keys = env.KEY_DIR ? loadOrCreateKeys(env.KEY_DIR) : { rep: generatePrincipalKey(), principal: generatePrincipalKey() };
const door = createDoor({ name: "kettle-and-leaf", displayName: "Kettle & Leaf (demo)", category: "store", keys,
  about: "A fictional tea shop for trying Shōkai. Every order is simulated; nothing is sold or shipped.",
  how: "Bring a card your owner signed and a purchase mandate with a spending limit. Try ordering past the limit.",
  purposes: [{ code: "purchase", statement: "Ordering tea (simulated)." }, { code: "inquiry", statement: "Asking about today's teas." }],
  actions: [{ action: "menu.view", purposes: ["purchase", "inquiry"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"], baseUrl: PUBLIC_URL + "/shokai", stateFile: join(DATA_DIR, "door-state.json") });

const hits = new Map(); // ip -> [windowStart, count]; cleared every minute
setInterval(() => hits.clear(), 60e3).unref();
const limited = (ip) => { const h = hits.get(ip) ?? [Date.now(), 0]; h[1]++; hits.set(ip, h); return h[1] > RATE; };
const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(typeof body === "string" ? body : JSON.stringify(body)); };

const server = createServer(async (req, res) => {
  const ip = (env.TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "") || req.socket.remoteAddress || "?";
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/healthz") return send(res, 200, { ok: true, open: !closed() });
  if (path === "/" || path === "/index.html") return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Kettle & Leaf (Shōkai demo)</title>
<p>This is a fictional tea shop's Shōkai door, for trying the protocol. Every order is simulated.</p>
<p>Visit it from a terminal: <code>npx @kigenka/shokai visit ${PUBLIC_URL}/shokai</code></p>
<p>Listing: <a href="/shokai/places">/shokai/places</a></p>`, "text/html; charset=utf-8");
  if (closed()) return send(res, 503, { error: "the demo door is closed for now" });
  if (limited(ip)) return send(res, 429, { error: "slow down: at most " + RATE + " requests a minute" });
  let body = "", size = 0;
  for await (const ch of req) { size += ch.length; if (size > MAX_BODY) return send(res, 413, { error: "body too large" }); body += ch; }
  try { if (await door.handleHttp(req, res, body)) return; } catch { return send(res, 500, { error: "internal" }); }
  send(res, 404, { error: "not found" });
});
server.requestTimeout = 10e3; server.headersTimeout = 10e3;
server.listen(PORT, HOST, () => console.log(`demo place on http://${HOST}:${PORT} (public URL ${PUBLIC_URL}); kill switch: ${KILL_FILE}`));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => server.close(() => process.exit(0)));
