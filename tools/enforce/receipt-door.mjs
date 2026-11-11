// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Enforcement-suite door for case 27: Lanternmoss Tea House where giftcard.buy needs a paid TrustReceipt (§6.9). The place's
// principal key is a throwaway test key the suite made and wrote (0600) to --key-file, so the suite can issue the place's own
// receipts; --issuers=<did,...> names other issuers it trusts. The SDK's real reference door on 127.0.0.1 only; nothing leaves.
// --req=good (default): { any_of: [{ all_of: [{ kind: "receipt", receipt_kinds: ["paid"], min_value: $10, issuers: "self" }] }] }.
// --req=flat: a deliberately wrong shape (the rule without its all_of), for the broken-copy control: it must never be met.
// The door reports whether the SDK's own trustPathMet counts one self-issued $25 paid receipt as meeting its requirement (selftest).
// GET /test/notes returns the door's own log lines about trust (diagnosis only; this door exists for the suite).
//   node receipt-door.mjs --port=N --dir=DIR --key-file=FILE [--issuers=did:key:...] [--req=good|flat]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SDK = (process.env.SHOKAI_ENFORCE_SDK ? path.resolve(process.env.SHOKAI_ENFORCE_SDK) : path.resolve(here, "../../packages/shokai/dist/src"));
const { createDoor, generateRepresentativeKey, importRepresentativeKey } = await import(path.join(SDK, "index.js"));
const V5 = await import(path.join(SDK, "core/v050.js"));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const PORT = Number(args.port);
if (!PORT || !args["key-file"]) { console.error("usage: node receipt-door.mjs --port=N --dir=DIR --key-file=FILE [--issuers=DID,...] [--req=good|flat]"); process.exit(2); }
const BASE = `http://127.0.0.1:${PORT}/shokai`;
const USD = (value) => ({ value, currency: "USD" });
const issuers = args.issuers ? String(args.issuers).split(",").filter(Boolean) : [];
const principal = importRepresentativeKey(fs.readFileSync(path.resolve(args["key-file"]), "utf8"));
const RULE = { kind: "receipt", receipt_kinds: ["paid"], min_value: USD("10.00"), issuers: "self" };
const REQS = { good: { any_of: [{ all_of: [RULE] }] }, flat: { any_of: [RULE] } };
const which = String(args.req ?? "good");
const req = REQS[which];
if (!req) { console.log(JSON.stringify({ ready: false, why: `unknown --req=${which}` })); process.exit(2); }
// the facts trustGate builds for a first-time visitor with one self-issued paid receipt of $25 (money in micro-units, as parseMoney)
const FACTS = { introduction: null, place_invitation: false, customer_link: false, mandate_max: { units: 40000000n, currency: "USD" }, history: null,
  receipts: [{ kind: "paid", value: { units: 25000000n, currency: "USD" }, issuer: "self" }] };
let selftest = false; try { selftest = V5.trustPathMet(req, FACTS) >= 0; } catch { selftest = false; }
const house = {
  name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store", about: "A small tea house.", approvedBy: { name: "Pia", role: "Owner" },
  purposes: [{ code: "purchase", statement: "Gift cards, bought for an owner." }],
  actions: [{ action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "giftcard.buy", purposes: ["purchase"], level: "act_on_behalf", data_asks: [], limits: { max_amount: USD("200.00") } }],
  spendingActions: ["giftcard.buy"],
  policy: { trust_requirements: { "giftcard.buy": req }, ...(issuers.length ? { trust_issuers: issuers } : {}) },
  testProfile: true, baseUrl: BASE, keys: { rep: generateRepresentativeKey(), principal } };

let door;
try { door = createDoor(house); }
catch (e) { console.log(JSON.stringify({ ready: false, refused: true, code: e.code ?? null, problems: String(e.problems ? JSON.stringify(e.problems) : e.message).slice(0, 300) })); process.exit(4); }
const srv = http.createServer(async (rq, res) => {
  let body = ""; for await (const c of rq) { body += c; if (body.length > 256 * 1024) { res.writeHead(413).end(); return; } }
  if (rq.url === "/test/notes") {
    let out = []; try { out = (door.host?.log ?? []).map((x) => typeof x === "string" ? x : JSON.stringify(x)).filter((x) => /trust|receipt/i.test(x)); } catch { out = []; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out)); return;
  }
  try { if (await door.handleHttp(rq, res, body)) return; } catch { res.writeHead(500).end(); return; }
  res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
});
srv.listen(PORT, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, base: BASE, principal: door.principalId, req: which, shape: req, selftest })));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => srv.close(() => process.exit(0)));
