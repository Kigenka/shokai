// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The enforcement suite's host-budget door (§6.11, provisional): Lanternmoss Tea House with a host representative whose model may
// cost at most $0.020 a visit, $0.050 a day and $1.00 a month, signed by Pia (a software passkey stand-in made for this run). The
// "model" is a stand-in that only counts its calls and reports fixed usage (2,000 tokens in, 500 out: $0.004 at Pia's prices); no
// AI, nothing leaves 127.0.0.1. Pia's notices are read with the run's owner token; the test clock moves only the budget's day.
//   node budget-door.mjs --port=N --dir=DIR                    first start: Pia signs, the door opens
//   node budget-door.mjs --port=N --dir=DIR --house=raised      restart with the daily ceiling raised to $5.00, Pia's old host card
//   node budget-door.mjs --port=N --dir=DIR --house=unsigned    restart with a budget on a host card Pia signed for a house without one
//   node budget-door.mjs --port=N --dir=DIR --house=same        the control: restart with the house as Pia signed it
//   node budget-door.mjs --port=N --dir=DIR --known=DID         the newcomers' share at its default (a quarter of the day), with one
//                                                               visiting owner Pia lists as known (case 22)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SDK = (process.env.SHOKAI_ENFORCE_SDK ? path.resolve(process.env.SHOKAI_ENFORCE_SDK) : path.resolve(here, "../../packages/shokai/dist/src"));
const { createDoor, signCard, developmentPasskey, generateRepresentativeKey, exportRepresentativeKey, importRepresentativeKey, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor } = await import(path.join(SDK, "index.js"));
const { entryUrl } = await import(path.join(SDK, "core/door.js"));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const PORT = Number(args.port); const DIR = path.resolve(args.dir); fs.mkdirSync(DIR, { recursive: true });
const restart = ["raised", "unsigned", "same"].includes(args.house);
// A restart is checked against the address Pia signed for (the first start's), as door.mjs does.
const BASE = restart ? fs.readFileSync(path.join(DIR, "base.txt"), "utf8") : `http://127.0.0.1:${PORT}/shokai`;
export const BUDGET = { mode: "metered", time_zone: "America/Los_Angeles", per_visit: { usd: "0.020" }, daily: { usd: "0.050" }, monthly: { usd: "1.00" }, alert_at: 0.8,
  prices: { "stand-in-host": { input_per_mtok: "1.00", output_per_mtok: "4.00" } },
  newcomer_share: 1 };   // case 21 drains the day's own ceiling; case 22 runs the newcomers' share at its default
if (args.known) { delete BUDGET.newcomer_share; BUDGET.known_visitors = [String(args.known)]; }
const EST = { model: "stand-in-host", input_tokens: 2000, max_output_tokens: 500 };
let offset = 0, modelCalls = 0, door;
function house(budget = BUDGET) {
  return { name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store", about: "A small tea house. Agents may look at today's teas and talk with Suzu.",
    purposes: [{ code: "inquiry", statement: "Asking about today's teas." }],
    actions: [{ action: "menu.view", purposes: ["inquiry"], level: "discover", data_asks: [] }, { action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
    ...(budget ? { policy: { host_budget: budget } } : {}), testProfile: true, baseUrl: BASE, hostBudgetClock: () => new Date(Date.now() + offset),
    hostOpts: { service: (a, ctx) => {
      if (a.tool !== "concierge.talk") return undefined;
      const c = door.hostBudgetCheck(ctx.seat_id, EST);   // before the call: could it pass a ceiling?
      if (!c.ok) return { ok: true, result: { status: "closed", text: c.text } };
      modelCalls++;   // the stand-in model: fixed words, fixed usage
      door.hostBudgetSettle(c.ticket, { input_tokens: EST.input_tokens, output_tokens: EST.max_output_tokens });
      return { ok: true, result: { status: "answered", text: "This autumn it's Ember Persimmon." } };
    } } };
}
function card(rep, pia, opts) {
  const P = houseConfigFor({ ...opts, card: undefined }).policy;
  return signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: ["inquiry"], actions: opts.actions.map((a) => a.action), cardKind: "host", validDays: 30,
    host: { place: { principal_id: pia.id, entry: entryUrl(BASE, opts.name) }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(opts, pia.id, BASE), summary_digest: summaryDigestFor(opts, BASE) },
    shownToOwner: { text: "Suzu, my host representative, may welcome agents at Lanternmoss Tea House and talk about today's teas. Its model may cost at most $0.02 a visit, $0.05 a day and $1.00 a month.", locale: "en-US" } });
}
const repFile = path.join(DIR, "suzu-rep.key");
if (restart) {
  const rep = importRepresentativeKey(fs.readFileSync(repFile, "utf8"));
  const c = JSON.parse(fs.readFileSync(path.join(DIR, args.house === "unsigned" ? "nobudget-card.json" : "host-card.json"), "utf8"));
  const b = args.house === "raised" ? { ...BUDGET, daily: { usd: "5.00" }, monthly: { usd: "100.00" } } : BUDGET;
  try { createDoor({ ...house(b), card: c, keys: { rep } }); console.log(JSON.stringify({ started: true })); process.exit(0); }
  catch (e) { console.log(JSON.stringify({ started: false, code: e.code ?? null, why: String(e.message).slice(0, 200) })); process.exit(3); }
}
const rep = generateRepresentativeKey(); fs.writeFileSync(repFile, exportRepresentativeKey(rep), { mode: 0o600 });
const pia = developmentPasskey();
const hostCard = card(rep, pia, house()); fs.writeFileSync(path.join(DIR, "host-card.json"), JSON.stringify(hostCard));
fs.writeFileSync(path.join(DIR, "nobudget-card.json"), JSON.stringify(card(rep, pia, house(null)))); fs.writeFileSync(path.join(DIR, "base.txt"), BASE);
door = createDoor({ ...house(), card: hostCard, keys: { rep }, stateFile: path.join(DIR, "door-state.json") });
const token = randomBytes(16).toString("hex");
const srv = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) { body += c; if (body.length > 256 * 1024) { res.writeHead(413).end(); return; } }
  const u = new URL(req.url ?? "/", "http://x"); const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (u.pathname.startsWith("/pia/") || u.pathname.startsWith("/test/")) {
    if (u.searchParams.get("token") !== token) { res.writeHead(403).end(); return; }
    if (u.pathname === "/pia/notices") return json({ notices: door.ownerNotices(), used: door.hostBudgetUsed(), model_calls: modelCalls });
    if (u.pathname === "/test/clock") { offset += Number(u.searchParams.get("advance_ms") ?? 0); return json({ now: new Date(Date.now() + offset).toISOString() }); }
  }
  try { if (await door.handleHttp(req, res, body)) return; } catch { res.writeHead(500).end(); return; }
  res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
});
srv.listen(PORT, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, base: BASE, token })));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => srv.close(() => process.exit(0)));
