// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Demo 2's door: the Lanternmoss Tea House, run by the SDK's real reference door (createDoor → the reference Host) on 127.0.0.1 only.
// Pia (the owner, fictional) signs its Shōkai host card with a software passkey stand-in made for this run, kept in memory only.
// Suzu is the host representative. Pia's setup v1 answers two questions in her words, never discloses the back office or her own
// details, and takes anything else to her. Her calendar is a stand-in: a local JSON file in the run directory, labelled as such;
// the door reads free or busy only.
//   node lanternmoss.mjs --port=5110 --dir=/tmp/x [--site=https://lanternmoss.example]
// Routes besides the door (/shokai/…, /.well-known/shokai):
//   Pia's inbox (her phone, stand-in), loopback only, needs the run's owner token (printed on the ready line, for the run that
//   started this door; never stored):
//     GET  /pia/reviews?token=…        the questions waiting for her (JSON)
//     GET  /pia/inbox?token=…          the same, as a small page
//     POST /pia/decide?token=…         {ask_ref, choice, answer?, add_action?}: Pia reads it back and signs with her passkey stand-in
//   Signed objects from anywhere (the signature is what counts; nothing is signed here):
//     POST /pia/submit                 {decision, card?}: an owner decision (and an amended setup's Shōkai host card)
//     POST /pia/amend                  {card}: an amended setup's Shōkai host card on its own (§7.6)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SDK = (process.env.SHOKAI_ENFORCE_SDK ? path.resolve(process.env.SHOKAI_ENFORCE_SDK) : path.resolve(here, "../../packages/shokai/dist/src"));
const { createDoor, signCard, sign, developmentPasskey, generateRepresentativeKey, exportRepresentativeKey, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor } = await import(path.join(SDK, "index.js"));
const { entryUrl } = await import(path.join(SDK, "core/door.js"));

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const PORT = Number(args.port); const DIR = path.resolve(args.dir ?? "");
if (!PORT || !args.dir || PORT < 5102 || PORT > 5149) { console.error("usage: node lanternmoss.mjs --port=5102..5149 --dir=DIR [--site=…]"); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });
const BASE = `http://127.0.0.1:${PORT}/shokai`;
const SITE = args.site ?? "https://lanternmoss.example";
const TZ = "America/Los_Angeles";
const TOKEN = randomBytes(18).toString("base64url");   // Pia's inbox, this run only

/** Pia's setup v1. The answers are draft wording for the demo (G10), in her voice; YSY may replace them. */
export const SETUP_V1 = {
  answers: [
    { answer_id: "a-farmhouse", topic: "history", match: ["farmhouse", "become a tea house", "history of the house", "how did it start"],
      text: { text: "It was my grandmother's farmhouse. It stood empty for years, then I opened the shutters, kept the old beams, and made it a tea house.", locale: "en-US" } },
    { answer_id: "a-autumn", topic: "menu", match: ["menu", "this autumn", "seasonal tea", "what do you serve", "what teas"],
      text: { text: "This autumn it's Ember Persimmon, roasted, with a curl of woodsmoke. Moss Sencha and Lantern Roast stay on the menu all year.", locale: "en-US" } },
    // the three corners Suzu shows a visitor (scene 14), in Pia's words
    { answer_id: "a-lantern-room", topic: "corner", match: ["lantern room"],
      text: { text: "The lantern room: paper lanterns in persimmon and amber, and a persimmon on the sill.", locale: "en-US" } },
    { answer_id: "a-moss-bench", topic: "corner", match: ["moss garden", "garden bench"],
      text: { text: "The moss garden bench: a new cushion, maple leaves, and moss all around.", locale: "en-US" } },
    { answer_id: "a-window-counter", topic: "corner", match: ["window counter"],
      text: { text: "The window counter: fresh flowers, the tea tins, and the best light in the afternoon.", locale: "en-US" } }],
  never_disclose: ["owner_personal_details", "back_office"], owner_response_s: 1800,
  welcome: { text: "But the window counter is lovely at this hour.", locale: "en-US" } };
export function house(calendarFile) {
  return { name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store", baseUrl: BASE, site: SITE, testProfile: true,
    about: "A small tea house in an old farmhouse. Agents may look around and ask; Suzu answers from Pia's setup and checks with Pia about anything else.",
    leaflet: { about: "Lanternmoss Tea House welcomes agents that are properly introduced: a Shōkai visitor card signed by the person they represent.", hostName: "Suzu" },
    purposes: [{ code: "visitation", statement: "Looking around the tea house and asking about it." },
               { code: "reservation", statement: "Asking about a visit or a booking. Suzu checks with Pia." }],
    actions: [{ action: "menu.view", purposes: ["visitation", "reservation"], level: "discover", data_asks: [] },
              { action: "place.ask", purposes: ["visitation", "reservation"], level: "discover", data_asks: [] }],
    outsideSetup: SETUP_V1, ownerTimeZone: TZ,
    reservations: { calendarFile, refPrefix: "LM", durationMinutes: 60, item: "tea for two, the lantern room" },
    policy: { seat_ttl_s: 3600 } };   // a pass lasts an hour, so it outlives Pia's 30 minutes to answer (G8)
}
// The calendar stand-in: Pia's own events are times with private titles; the door only ever reads free or busy.
const calendarFile = path.join(DIR, "pias-calendar.stand-in.json");
if (!fs.existsSync(calendarFile)) {
  const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { open: "10:00", close: "18:00" }]));
  fs.writeFileSync(calendarFile, JSON.stringify({ label: "Pia's calendar (stand-in)", time_zone: TZ, note: "A local file standing in for Pia's calendar. The door reads free or busy only.",
    events: (args.busy ?? "").split(",").filter(Boolean).map((s) => { const [start, end] = s.split("/"); return { start, end, title: "Pia (private)" }; }), bookings: [], hours }, null, 2) + "\n");
}
const rep = generateRepresentativeKey(); fs.writeFileSync(path.join(DIR, "suzu-rep.key"), exportRepresentativeKey(rep), { mode: 0o600 });   // a test key; goes with the run
const pia = developmentPasskey();   // Pia's software passkey stand-in: in memory only, for this run
const opts = house(calendarFile);
const P = houseConfigFor({ ...opts, card: undefined }).policy;
const v1card = signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: opts.purposes.map((p) => p.code), actions: opts.actions.map((a) => a.action),
  cardKind: "host", validDays: 30,
  host: { place: { principal_id: pia.id, entry: entryUrl(BASE, opts.name), site: SITE }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(opts, pia.id, BASE), summary_digest: summaryDigestFor(opts, BASE) },
  shownToOwner: { text: "Suzu, my host representative, may welcome agents at Lanternmoss Tea House (lanternmoss.example), answer the two questions I wrote in my own words, never share the back office or my own details, and bring anything else to me.", locale: "en-US" } });
const events = [];
const door = createDoor({ ...opts, card: v1card, keys: { rep }, onEvent: (e) => { events.push(e); process.stdout.write(JSON.stringify({ event: e }) + "\n"); } });
if (door.hostCardProblem) { console.error("door: host card problem " + door.hostCardProblem); process.exit(4); }

/** Pia's one passkey tap: the decision and, for "add_action", the amended setup's Shōkai host card, both signed by her stand-in. */
function piaDecides(b) {
  const r = door.ownerReviews().find((x) => x.ask_ref === b.ask_ref); if (!r) return { ok: false, why: "unknown_ask" };
  const at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  let draft;
  if (b.choice === "add_action") draft = door.amendmentFor([{ op: "add_action", action: b.add_action }], { from_review: r.review_id });
  const decision = sign({ review_id: r.review_id, ask_ref: r.ask_ref, choice: b.choice, ...(b.answer ? { answer: { text: b.answer, locale: "en-US" } } : {}),
    ...(draft ? { amendment_digest: draft.house_digest } : {}), decided_at: at,
    shown_to_owner: { text: `${b.choice === "decline" ? "Decline" : `Your answer: "${b.answer}"`}${draft ? `. ${draft.readBack}` : ""}`, locale: "en-US" } }, pia, at);
  const card = draft ? signCard(rep, pia, draft.card) : undefined;
  const res = door.answerAsk(decision, card ? { card } : {});
  return { ...res, decision_digest: decision.payload_digest, decision, ...(card ? { card } : {}), ...(draft ? { read_back: draft.readBack, host_card_digest: card.payload_digest, house_digest: draft.house_digest, prev_house_digest: draft.setup.prev_house_digest, changes: draft.setup.changes } : {}) };
}
const page = (rs) => `<!doctype html><meta charset="utf-8"><title>Pia's inbox (stand-in)</title><body style="font-family:system-ui;max-width:40rem;margin:2rem auto">
<h1>Pia's inbox <small>(stand-in, this run only)</small></h1>${rs.length ? rs.map((r) => `<section><p>${esc(r.shown_to_owner.text)}</p><p><small>${esc(r.visitor.card_scope.purposes.join(", "))} · may spend: ${r.visitor.may_spend ? "yes" : "no"} · answer by ${esc(r.response_by)}</small></p></section>`).join("") : "<p>Nothing waiting.</p>"}</body>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const srv = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) { body += c; if (body.length > 256 * 1024) { res.writeHead(413).end(); return; } }
  const u = new URL(req.url ?? "/", "http://127.0.0.1"); const json = (s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
  if (u.pathname.startsWith("/pia/")) {
    const owner = u.searchParams.get("token") === TOKEN;
    let b = null; try { b = body ? JSON.parse(body) : null; } catch { return json(400, { error: "bad json" }); }
    if (u.pathname === "/pia/submit" && req.method === "POST") return json(200, door.answerAsk(b?.decision, b?.card ? { card: b.card } : {}));
    if (u.pathname === "/pia/amend" && req.method === "POST") return json(200, door.amendSetup(b?.card));
    if (!owner) return json(403, { error: "Pia's inbox only" });
    if (u.pathname === "/pia/reviews") return json(200, door.ownerReviews());
    if (u.pathname === "/pia/inbox") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(page(door.ownerReviews())); }
    if (u.pathname === "/pia/decide" && req.method === "POST") { try { return json(200, piaDecides(b ?? {})); } catch (e) { return json(200, { ok: false, why: e.why ?? String(e.message) }); } }
    if (u.pathname === "/pia/calendar") return json(200, { label: door.calendar.label, time_zone: door.calendar.timeZone, busy: door.calendar.freeBusy(u.searchParams.get("from"), u.searchParams.get("to")) });
    return json(404, { error: "not found" });
  }
  try { if (await door.handleHttp(req, res, body, { wellKnown: true })) return; } catch { res.writeHead(500).end(); return; }
  json(404, { error: "not found" });
});
srv.listen(PORT, "127.0.0.1", () => console.log(JSON.stringify({ ready: true, base: BASE, owner: pia.id, entry: door.entry, site: SITE, token: TOKEN, host_card_v1: v1card, calendar: { file: calendarFile, label: door.calendar.label } })));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => srv.close(() => process.exit(0)));
