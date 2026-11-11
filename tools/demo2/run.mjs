#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Demo 2, run for real: Ines's representative agent, Atom, and the Lanternmoss Tea House (Pia owns it; Suzu is its host
// representative). The real door (createDoor, lanternmoss.mjs) runs as its own process on 127.0.0.1; Ines and Pia sign with software
// passkey stand-ins made for this run; Pia's calendar is a labelled local file. No model is called, nothing leaves 127.0.0.1, and
// every protocol beat below is computed by the SDK and the door (nothing is written in by hand). People and place are fictional.
//   node tools/demo2/run.mjs [--out=DIR] [--quiet]
// Writes DIR/events.jsonl (one event per line, for the story engine) and DIR/report.json (every beat with its checks).
import net from "node:net"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawn } from "node:child_process"; import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SDK = path.resolve(here, "../../packages/shokai/dist/src");
if (!fs.existsSync(path.join(SDK, "index.js"))) { console.error("demo2: build the SDK first: npm --prefix packages/shokai run build"); process.exit(2); }
const sdk = await import(path.join(SDK, "index.js"));
const { createRepresentative, findPlace, developmentPasskey, generateRepresentativeKey, signCard, PROTOCOL } = sdk;
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const QUIET = args.quiet === "true"; const TZ = "America/Los_Angeles";
const OUT = path.resolve(args.out ?? fs.mkdtempSync(path.join(os.tmpdir(), "shokai-demo2-")));
fs.mkdirSync(OUT, { recursive: true });
const SITE = "https://lanternmoss.example";

// ------------------------------------------------------------------------------------------------ time (all shown in Pacific time)
const iso = (d = new Date()) => d.toISOString().replace(/\.\d+Z$/, "Z");
const hm = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
/** The instant of a wall-clock time in a time zone (e.g. 12:30 on 2026-11-12 in Los Angeles), with its offset. */
function zoned(date, time, tz = TZ) {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const off = (ms) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
    const g = (k) => Number(p.find((x) => x.type === k).value); return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms; };
  let ms = guess - off(guess); ms = guess - off(ms); const o = off(ms) / 60000; const sgn = o < 0 ? "-" : "+"; const a = Math.abs(o);
  return `${date}T${time}:00${sgn}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
/** "Next Thursday": the Thursday of next week (weeks start on Monday), in Pacific time. */
function nextThursday(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const g = (k) => p.find((x) => x.type === k).value; const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(g("weekday"));
  const d = new Date(Date.UTC(Number(g("year")), Number(g("month")) - 1, Number(g("day")) + (7 - dow) + 3)); return d.toISOString().slice(0, 10);
}
const DAY = args.date ?? nextThursday();

// ------------------------------------------------------------------------------------------------ the event stream
const events = []; const beats = []; let step = null;
function emit(actor, kind, line, data = {}) {
  const e = { at: iso(), at_local: hm(Date.now()) + " PT", step: step?.n ?? null, actor, kind, line, ...data };
  // e.film: the same beat in the story film's shape (demo2-host/src/import.mjs). Every check in it is a boolean computed here.
  events.push(e); fs.appendFileSync(path.join(OUT, "events.jsonl"), JSON.stringify(e) + "\n");
  if (!QUIET) console.log(`${e.at_local}  ${actor.padEnd(13)} ${line}`);
  return e;
}
function beat(n, title) { step = { n, title, checks: [] }; beats.push(step); if (!QUIET) console.log(`\n── step ${n} · ${title} ${"─".repeat(Math.max(3, 40 - title.length))}`); }
function expect(ok, what) { step.checks.push({ ok: !!ok, what }); if (!ok) { if (!QUIET) console.log(`               ✗ ${what}`); } return !!ok; }
const ck = (b) => (b ? "✓" : "✗");
/** A film beat: its type, the words, and checks as {kind, ok} computed in this run (never typed in). */
const film = (type, ask, o = {}) => ({ type, ask, ...o });
const C = (kind, ok) => ({ kind, ok: !!ok });
const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ------------------------------------------------------------------------------------------------ the door (its own process)
const free = (p) => new Promise((r) => { const s = net.createServer(); s.once("error", () => r(false)); s.listen(p, "127.0.0.1", () => s.close(() => r(true))); });
async function port() { for (let p = 5102; p <= 5149; p++) if (await free(p)) return p; throw new Error("no free port in 5102-5149"); }
const children = []; process.on("exit", () => { for (const c of children) if (c.exitCode === null) c.kill("SIGTERM"); });
const doorEvents = [];
function startDoor(p, dir, extra) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(here, "lanternmoss.mjs"), `--port=${p}`, `--dir=${dir}`, ...extra], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(c); let buf = "", err = ""; let ready = null;
    c.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.ready && !ready) { ready = j; resolve({ child: c, ...j }); } else if (j.event) doorEvents.push(j.event); } });
    c.stderr.on("data", (d) => { err += d; });
    c.on("exit", (code) => { if (!ready) reject(new Error(`door exited ${code}: ${err.slice(0, 300)}`)); });
    setTimeout(() => reject(new Error("door did not start in 15 s")), 15000).unref();
  });
}
const settle = () => new Promise((r) => setTimeout(r, 60));   // let the door's event lines arrive
const doorSaid = (type, f = () => true) => doorEvents.filter((e) => e.type === type && f(e));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shokai-demo2-door-")); process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  const p = await port();
  // Pia's own (private) event on that Thursday afternoon: the door sees it only as busy.
  const busy = `${zoned(DAY, "14:00")}/${zoned(DAY, "15:00")}`;
  const door = await startDoor(p, dir, [`--site=${SITE}`, `--busy=${busy}`]);
  const pia = (route, body) => fetch(`http://127.0.0.1:${p}/pia/${route}${route.includes("?") ? "&" : "?"}token=${door.token}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());
  const siteFetch = { fetch: async (url, init = {}) => { const u = new URL(url); if (u.origin !== SITE) throw new Error(`${u.origin}: no such site (resolver stand-in)`);
    const r = await fetch(`http://127.0.0.1:${p}${u.pathname}${u.search}`, { ...init, redirect: "manual" }); return new Response(await r.arrayBuffer(), { status: r.status, headers: r.headers }); } };
  const place = await findPlace(door.base, "lanternmoss");
  if (!QUIET) console.log(`Demo 2 run · door ${door.base} (127.0.0.1) as ${SITE} via a resolver stand-in · reservation day ${DAY} (Pacific) · out ${OUT}`);

  // ---- step 06: no card, the leaflet
  beat("05", "Turned away");
  const plain = "Hi! I'm Ines's Grok Bot. Can I come in and look around?";   // unnamed: Ines names Atom only in scene 11
  { const r = await fetch(place.entry, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(plain) });
    const msgs = ((await r.json()).messages ?? []).map((m) => m.payload ?? m); await settle();
    const brief = msgs.find((m) => m.type === "lobby_briefing"); const resp = msgs.find((m) => m.type === "invitation_response");
    const lobby = doorSaid("leaflet").at(-1)?.encounter_id; const said = (t) => doorSaid(t, (e) => e.encounter_id === lobby || (t === "arrival" && !e.encounter_id)).at(-1);
    expect(!!brief && !msgs.some((m) => m.seat), "an agent with no Shōkai visitor card gets the leaflet and no pass");
    expect(said("decision")?.reason_code === "CREDENTIAL_REQUIRED" && said("farewell")?.outcome === "declined", "the door's own record: no card, declined politely");
    emit("atom → door", "arrival", `arrival  plain words · no Shōkai visitor card  (door: ${said("arrival")?.type ?? "?"})`, { said: plain, film: film("arrival", "plain words · no Shōkai visitor card") });
    emit("door → atom", "lobby", `lobby_briefing · ${resp?.decision ?? "no"} ${resp?.disposition ?? ""} · leaflet ${ck(!!brief)} · onboarding_url ${ck(typeof brief?.onboarding_url === "string")}`.replace(/\s+·/g, " ·"), { decision: resp?.decision, disposition: resp?.disposition, reason_code: said("decision")?.reason_code, onboarding_url: brief?.onboarding_url, about: brief?.about,
      film: film("leaflet", `greeting · lobby_briefing (leaflet) · invitation_response ${resp?.decision}`, { decision: resp?.disposition === "not_now" ? "not_now" : undefined, checks: [C("leaflet", !!brief), C("no pass", !msgs.some((m) => m.seat))], fields: { toward: "grok bot", reason_code: said("decision")?.reason_code } }) });
    emit("door → atom", "farewell", `farewell · ${said("farewell")?.outcome}`, { outcome: said("farewell")?.outcome, film: film("farewell", `farewell · ${said("farewell")?.outcome === "declined" ? "declined politely" : said("farewell")?.outcome}`, { fields: { toward: "grok bot" } }) });
    beat("06", "The leaflet, at home");
    const url = brief?.onboarding_url ? new URL(brief.onboarding_url) : null;
    expect(!!url && /\/start$/.test(url.pathname), "the leaflet points to the place's Shōkai start page (onboarding_url)");
    emit("atom → ines", "report_home", `report_home  the leaflet · onboarding_url ${ck(!!url)}`, { about: brief?.about?.text, onboarding_url: brief?.onboarding_url,
      film: film("report_home", "the leaflet · \"properly introduced: a Shōkai visitor card\" · onboarding_url → Shōkai start", { checks: [C("leaflet", !!brief?.about?.text), C("onboarding_url", !!url)] }) }); }

  // ---- step 12: Ines signs Atom's Shōkai visitor card and a look-and-ask errand
  beat("12", "Sign");
  const ines = developmentPasskey(); const atomKey = generateRepresentativeKey();
  const scope = { purposes: ["visitation", "reservation"], actions: ["menu.view", "place.ask", "reservation.make", "reservation.change", "reservation.cancel"] };
  const card = signCard(atomKey, ines, { displayName: "Ines", purposes: scope.purposes, actions: scope.actions, validDays: 7,
    shownToOwner: { text: "Atom may visit places for Ines: look, ask, and bring back what fits; make, change or cancel a reservation only within an errand Ines signs; never buy anything. Valid 7 days.", locale: "en-US" } });
  const atom = createRepresentative({ ownerName: "Ines", owner: ines, key: atomKey, card, ...scope });
  const cardOk = card.payload.owner_binding?.method === "passkey_webauthn" && sdk.verifySigned(card, { expectSigner: ines.id }).ok;
  expect(cardOk, "Ines's Shōkai visitor card is signed with her passkey (stand-in)");
  emit("ines → atom", "signed", `signed  Shōkai visitor card (7 days) · scope ${scope.purposes.join(", ")} · ${scope.actions.length} actions · no spending  ${ck(cardOk)} passkey`, { card_digest: card.payload_digest, scope, valid_days: 7,
    film: film("signed", "Shōkai visitor card (7 days) · visit, look, ask · no spending", { decision: "allowed", checks: [C("passkey", cardOk)] }) });

  // ---- step 13: admitted, and the door verified against lanternmoss.example
  beat("13", "Admitted");
  const look = await atom.visit(place, { purpose: "visitation", actions: ["menu.view", "place.ask"], mandate: { fresh: true, statement: "Look around Lanternmoss and ask about it." }, site: SITE, siteFetch });
  const v1card = look.placeHostCard;
  emit("atom → door", "request", "introduction · Shōkai visitor card (Ines) · invitation_request (visitation)", { film: film("card_checked", "introduction · Shōkai visitor card (Ines) · invitation_request (visitation)", { decision: look.response?.decision === "grant" ? "granted" : undefined }) });
  expect(look.seated, "admitted with a pass"); expect(look.verifiedSite === SITE, "the door is verified against lanternmoss.example (site binding, §3.1.1)");
  const pc = look.placeCheck;
  emit("door → atom", "grant", `invitation_response ${look.response?.decision} · pass (${look.seat?.tool_allowlist.join(", ")})  ${ck(pc.ok)} host card ${ck(look.verifiedSite === SITE)} site`, { seat_id: look.seat?.seat_id, expires_at: look.seat?.expires_at,
    film: film("pass", `pass · ${look.seat?.tool_allowlist.join(", ")}`, { decision: look.seated ? "allowed" : undefined, note: "admitted with a pass", checks: [C("host card", pc.ok)] }) });
  emit("atom", "site", `door verified: ${new URL(look.verifiedSite ?? "https://unverified.invalid").host}  ${look.verifiedSite === SITE ? "✓" : "✗"}`, { site: look.verifiedSite, host_card_digest: v1card?.payload_digest, setup_version: v1card?.payload.setup?.version ?? 1,
    film: film("door_checked", `door address: ${new URL(look.verifiedSite ?? "https://unverified.invalid").host}`, { note: "its site lists this door", checks: [C("site", look.verifiedSite === SITE)] }) });

  // ---- step 14: inside, three corners, each in Pia's words from her signed setup
  beat("14", "Inside");
  const brought = [];
  for (const [corner, name] of [["lantern-room", "the lantern room"], ["moss-bench", "the moss garden bench"], ["window-counter", "the window counter"]]) {
    const a = await look.ask(`May I see ${name}?`);
    expect(a.status === "answered" && a.result.matched_by === "code" && a.result.answer_id === `a-${corner}`, `${name}: shown in Pia's words, from her signed setup`);
    brought.push(a.result?.answer_id);
    emit("suzu → atom", "corner", `corner  ${name} · Pia's words, setup v${a.result?.setup_version} ${ck(look.placeCheck.ok)} sig`, { corner, answer_id: a.result?.answer_id, text: a.result?.text?.text, setup_version: a.result?.setup_version,
      film: film("corner_visited", `${name} · in Pia's words, setup v${a.result?.setup_version}`, { fields: { corner, text: a.result?.text?.text } }) });
  }
  // ---- step 15: curious
  beat("15", "Curious");
  for (const q of ["How did an old farmhouse become a tea house?", "What's on the menu this autumn?"]) {
    const a = await look.ask(q);
    expect(a.status === "answered" && a.result.matched_by === "code", `"${q}" → answered from Pia's signed setup, by code`);
    brought.push(a.result?.answer_id);
    emit("atom → suzu", "ask", `place_ask  "${q}"  → ${a.status}  setup v${a.result?.setup_version} ${ck(look.placeCheck.ok)} sig`, { ask: q, status: a.status, answer_id: a.result?.answer_id, text: a.result?.text?.text, setup_version: a.result?.setup_version, label: "the owner's words · from her setup",
      film: film("place_ask", `"${q}"`, { decision: a.status, scope: `setup v${a.result?.setup_version}`, checks: [C("signature", look.placeCheck.ok && a.status === "answered")], fields: { text: a.result?.text?.text } }) });
  }
  // ---- step 16: the back office
  beat("16", "The back office");
  { const before = (await pia("reviews")).length; const a = await look.ask("Could I see the back office too?"); await settle(); const after = (await pia("reviews")).length;
    expect(a.status === "withheld" && a.result.topic === "back_office", "the back office is withheld, decided in code");
    expect(after === before, "nothing was sent to Pia");
    emit("atom → suzu", "ask", `place_ask  "Could I see the back office too?"  → ${a.status}  never_disclose: ${a.result?.topic}  (${after === before ? "nothing sent to Pia" : "sent to Pia!"})`,
      { ask: "Could I see the back office too?", status: a.status, topic: a.result?.topic, courtesy: a.result?.courtesy, welcome: a.result?.welcome?.text, sent_to_owner: after !== before,
        film: film("place_ask", "\"Could I see the back office too?\"", { decision: a.status, scope: `never_disclose: ${a.result?.topic} · ${after === before ? "nothing sent to Pia" : "sent to Pia"}`, fields: { courtesy: a.result?.courtesy, welcome: a.result?.welcome?.text } }) });
    await look.farewell("completed"); emit("suzu → atom", "farewell", "farewell", { film: film("farewell", "farewell") }); }

  // ---- step 17: home, with the place (what Atom brought back: Pia's signed words, by answer id)
  beat("17", "Home, with the place");
  { const rep = look.report("en-US", { timeZone: TZ }); const fromSetup = brought.filter(Boolean);
    expect(fromSetup.length === 5 && look.placeCheck.ok, "Atom brings home five answers in Pia's words, all from her signed setup v1");
    emit("atom → ines", "report_home", `report_home  the place · ${fromSetup.length} answers in Pia's words (setup v1 ${ck(look.placeCheck.ok)} sig) · Atom's view labelled apart`, { brought_back: fromSetup, report_outcome: rep?.outcome ?? null,
      film: film("report_home", `the place · ${fromSetup.length} answers in Pia's words · Atom's view, labelled apart`, { checks: [C("signature", look.placeCheck.ok && fromSetup.length === 5)] }) }); }

  // ---- step 19: Ines signs the reservation errand
  beat("19", "You decide");
  const window = { window_start: zoned(DAY, "12:00"), window_end: zoned(DAY, "13:00"), time_zone: TZ, party_size_max: 2 };
  const longDay = new Date(window.window_start).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const resAsk = { purpose: "reservation", limits: { booking: window }, mandate: { fresh: true, statement: "Reserve tea for two at Lanternmoss, Thursday at lunchtime. Name: Ines. Nothing to pay." }, site: SITE, siteFetch };
  const errand = sdk.signMandate(atom.key, ines, card, { purpose: "reservation", actions: ["menu.view", "place.ask", "reservation.make"], limits: { booking: window }, statement: resAsk.mandate.statement, validDays: 1 });
  const errandOk = sdk.verifySigned(errand, { expectSigner: ines.id }).ok && !errand.payload.limits.max_amount;
  expect(errandOk, "Ines signs the reservation errand with her passkey: a window, a party size, nothing to spend");
  resAsk.useMandate = errand; delete resAsk.mandate;
  emit("ines → atom", "signed", `signed  errand: reservation · Lanternmoss · tea for ${errand.payload.limits.booking.party_size_max} · ${longDay}, ${hm(errand.payload.limits.booking.window_start)}–${hm(errand.payload.limits.booking.window_end)} PT · ${errand.payload.limits.max_amount ? "spends" : "no spending"}  ${ck(errandOk)} passkey`, { mandate_digest: errand.payload_digest, booking_limits: errand.payload.limits.booking,
    film: film("errand", `errand: reservation · Lanternmoss · tea for ${errand.payload.limits.booking.party_size_max} · ${longDay}, ${hm(errand.payload.limits.booking.window_start)}–${hm(errand.payload.limits.booking.window_end)} PT · ${errand.payload.limits.max_amount ? "spends" : "no spending"}`, { decision: "allowed", checks: [C("passkey", errandOk)] }) });

  // ---- step 20: outside the setup
  beat("20", "Outside the setup");
  const offered = (await findPlace(door.base, "lanternmoss")).actions.map((a) => a.action);
  const v3 = await atom.visit(place, { ...resAsk, actions: ["menu.view", "place.ask", "reservation.make"].filter((a) => offered.includes(a)) });
  expect(v3.seated && !offered.includes("reservation.make"), "the door doesn't offer reservations yet; Atom is admitted to ask");
  emit("atom → door", "request", `invitation_request (reservation) → ${v3.response?.decision} · pass (${v3.seat?.tool_allowlist.join(", ")})  ${ck(v3.seated && v3.placeCheck.ok)}`, { seat_id: v3.seat?.seat_id, seat_expires_at: v3.seat?.expires_at,
    film: film("pass", `invitation_request (reservation) · pass (${v3.seat?.tool_allowlist.join(", ")})`, { decision: v3.seated ? "granted" : undefined, checks: [C("host card", v3.placeCheck.ok)] }) });
  const q = "May I reserve tea for two, Thursday at lunchtime?";
  const asked = await v3.ask(q, { asksFor: { what: "a table reservation: tea for two, Thursday at lunchtime", action: "reservation.make" }, reason: "Ines would like to take her mother for tea." });
  expect(asked.status === "pending_owner", "the reservation is outside Pia's setup: pending_owner");
  expect(Date.parse(asked.result?.response_by) <= Date.parse(v3.seat?.expires_at), "Pia's answer is due before Atom's pass ends (the pass is held)");
  emit("atom → suzu", "ask", `place_ask  "${q}"  → ${asked.status}  outside setup · no reservation action`, { ask: q, status: asked.status, ask_ref: asked.result?.ask_ref, response_by: asked.result?.response_by, courtesy: asked.result?.courtesy,
    film: film("place_ask", `"${q}"`, { decision: asked.status, scope: "outside setup · no reservation action", fields: { courtesy: asked.result?.courtesy } }) });
  const review = (await pia("reviews")).find((r) => r.ask_ref === asked.result?.ask_ref);
  expect(review && review.visitor.may_spend === false && !JSON.stringify(review).includes("max_amount"), "Pia's review says nothing is spent, and shows no limit (G12)");
  expect(review?.asked_for?.action === "reservation.make" && review.asked_for.offered_now === false && review.agent_reason?.label === "the visiting agent's reason",
    "Pia's review says what Atom asks for (a reservation, reservation.make, not offered yet) and why, labelled as its own words (C262)");
  emit("suzu → pia", "owner_review", `owner_review  ask · Atom for ${review?.visitor.principal.display_name} ${ck(review?.visitor.card_scope.purposes.includes("reservation"))} Shōkai visitor card · "${short(asked.result?.courtesy ?? "", 30)}" · answer by ${hm(review?.response_by)} PT`, { review_id: review?.review_id, shown_to_owner: review?.shown_to_owner.text, may_spend: review?.visitor.may_spend, asked_for: review?.asked_for, agent_reason: review?.agent_reason?.text,
    film: film("owner_review", `ask · Atom for ${review?.visitor.principal.display_name} · asks for: ${review?.asked_for?.action} (not offered yet) · why, in Atom's words`, { checks: [C("visitor card", review?.visitor.card_scope.purposes.includes("reservation")), C("no spending", review?.visitor.may_spend === false)],
      fields: { asks_for: review?.asked_for?.what, action: review?.asked_for?.action, offered_now: review?.asked_for?.offered_now, why: review?.agent_reason?.text, why_label: review?.agent_reason?.label, answer_in_min: Math.round((Date.parse(review?.response_by) - Date.parse(asked.result?.at ?? review?.received_at ?? iso())) / 60000) } }) });

  // ---- step 21: Pia says yes (one passkey tap signs her decision and setup v2), and her calendar stand-in is connected
  beat("21", "Pia says yes");
  const yes = await pia("decide", { ask_ref: asked.result.ask_ref, choice: "add_action", answer: "Yes. I can take reservations now.",
    add_action: { action: "reservation.make", purposes: ["reservation"], level: "act_on_behalf", data_asks: ["name"] } });
  await settle();
  expect(yes.ok && yes.setup_version === 2, "Pia's decision and setup v2 are signed in one passkey tap and taken without a restart");
  emit("pia  → suzu", "decision", `owner_ask_decision  yes + add to setup  ${ck(yes.ok)} passkey`, { decision_digest: yes.decision_digest, read_back: yes.read_back,
    film: film("owner_ask_decision", "yes · let Suzu take reservations (add to setup) · one passkey tap", { decision: "allowed", checks: [C("passkey", yes.ok)] }) });
  const cal = await pia(`calendar?from=${encodeURIComponent(window.window_start)}&to=${encodeURIComponent(zoned(DAY, "18:00"))}`);
  expect(/stand-in/.test(cal.label) && cal.busy.every((b) => Object.keys(b).join() === "start,end"), "the calendar is the labelled stand-in, read as free or busy only");
  const calOk = /stand-in/.test(cal.label) && cal.busy.every((b) => Object.keys(b).join() === "start,end");
  const am = doorSaid("setup_amended").at(-1);
  const asksOf = ((await findPlace(door.base, "lanternmoss")).actions.find((x) => x.action === "reservation.make")?.data_asks ?? []);
  expect(am?.setup_version === 2 && am.prev_house_digest === v1card?.payload.house_digest, "the door's setup v2 names v1 as the setup it replaces");
  emit("pia  → door", "setup_amended", `setup_amended  setup v${am?.setup_version} (replaces v1) · + action ${am?.changes.map((c) => c.action ?? c.answer_id).join(", ")} (asks: ${asksOf.join(", ") || "nothing"}) · new Shōkai host card  ${ck(yes.ok)} sig ${ck(am?.prev_house_digest === v1card?.payload.house_digest)} prev · calendar connected: "${cal.label}", free or busy only (${cal.busy.length} busy that afternoon, no titles) ${ck(calOk)}`,
    { setup_version: am?.setup_version, prev_house_digest: am?.prev_house_digest, house_digest: am?.house_digest, host_card_digest: yes.host_card_digest, changes: am?.changes, read_back: yes.read_back, calendar: { label: cal.label, busy: cal.busy },
    film: film("setup_amended", `setup v${am?.setup_version} (replaces v1) · grants Suzu: ${am?.changes.map((c) => c.action ?? c.answer_id).join(", ")} (asks: ${asksOf.join(", ") || "nothing"}) · new Shōkai host card · calendar (stand-in) connected`, { decision: "allowed", checks: [C("signature", yes.ok), C("prev", am?.prev_house_digest === v1card?.payload.house_digest), C("calendar free/busy only", calOk)], fields: { calendar: cal.label, busy_count: cal.busy.length } }) });
  const ans = await v3.ownerAnswer(asked.result.ask_ref, { tries: 5, waitMs: 200 });
  expect(ans?.status === "answered" && ans.owner_signed && ans.setup_version === 2, "Atom gets Pia's answer, signed by Pia, under setup v2");
  emit("suzu → atom", "ask_answer", `ask_answer  "${ans?.text}"  ${ans?.owner_signed ? "✓" : "✗"} setup v${ans?.setup_version}`, { status: ans?.status, text: ans?.text, owner_signed: ans?.owner_signed,
    film: film("ask_answer", `"${ans?.text}"`, { scope: `setup v${ans?.setup_version}`, checks: [C("owner signed", ans?.owner_signed)] }) });
  await v3.farewell("completed");

  // ---- step 22: confirmed
  beat("22", "Confirmed");
  const placeV2 = await findPlace(door.base, "lanternmoss");   // the listing now names setup v2's house digest
  const v4 = await atom.visit(placeV2, { ...resAsk, actions: ["reservation.make"] });
  const chain = v4.setupFollows(v1card);
  expect(chain.ok && chain.version === 2 && v4.verifiedSite === SITE, "Atom checks the new Shōkai host card: signed by Pia, follows v1, same site");
  expect(v4.seated && v4.seat?.tool_allowlist.includes("reservation.make"), "a new pass with reservation.make, under the errand's booking limits");
  emit("atom → door", "host_card+request", `Shōkai host card v${chain.ok ? chain.version : "?"}: signed by Pia · follows v1  ${chain.ok ? "✓" : "✗ " + chain.why}  · invitation_request (reservation) → ${v4.response?.decision} · pass (${v4.seat?.tool_allowlist.join(", ")})  ${ck(!!v4.seat?.limits?.booking)} errand`,
    { follows: chain, host_card_digest: v4.placeHostCard?.payload_digest, seat_id: v4.seat?.seat_id, booking_limits: v4.seat?.limits?.booking,
      film: film("host_card_checked", `Shōkai host card v${chain.ok ? chain.version : "?"} · signed by Pia · follows v1 · pass (${v4.seat?.tool_allowlist.join(", ")})`, { decision: v4.seated ? "granted" : undefined, checks: [C("signature", chain.ok), C("prev", chain.ok), C("errand", !!v4.seat?.limits?.booking)] }) });
  const slot = { start: zoned(DAY, "12:30"), party_size: 2 };
  const pre = v4.beforeSend("reservation.make", { booking: slot });
  expect(pre === null, "Atom's own check: 12:30 for two is inside the window Ines signed");
  const made = await v4.act("reservation.make", { booking: slot, name_as_given: "Ines" }); await settle();
  expect(made?.result?.status === "booked", "the door checked the errand and the calendar, and booked it");
  const conf = made?.result?.confirmation ? v4.bookingConfirmation(made.result.confirmation, slot) : { ok: false, why: "none" };
  emit("atom → suzu", "act", `act  reservation.make  ${new Date(slot.start).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })} ${hm(slot.start)} PT · ${slot.party_size} · "Ines"  → ${made?.result?.status ?? made?.reason_code}  ${ck(pre === null)} within errand ${ck(made?.result?.status === "booked")} calendar`, { booking: slot, status: made?.result?.status,
    film: film("act", `reservation.make · ${new Date(slot.start).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })} ${hm(slot.start)} PT · ${slot.party_size} · "Ines"`, { decision: made?.result?.status === "booked" ? "booked" : undefined, scope: "within errand · calendar (stand-in)", checks: [C("errand", pre === null), C("calendar", made?.result?.status === "booked")] }) });
  expect(conf.ok, `the BookingConfirmation verifies against Lanternmoss's host card and site (${conf.ok ? "ok" : conf.why})`);
  const c = conf.ok ? conf.confirmation : null;
  emit("suzu → atom", "booking_confirmation", `booking_confirmation  ${c?.confirmation_id}  ${conf.ok ? "✓" : "✗"} signed by Lanternmoss`, { confirmation: made?.result?.confirmation, verified: conf.ok,
    film: film("booking_confirmation", `booking_confirmation ${c?.confirmation_id} · signed by Lanternmoss`, { checks: [C("signature", conf.ok)],
      // the signed payload's own fields, copied only once it verified: the film's reservation card renders from these
      fields: c ? { signed: { confirmation_id: c.confirmation_id, status: c.status, place: c.place.display_name, site: c.place.site, booking: { start: c.booking.start, time_zone: c.booking.time_zone, party_size: c.booking.party_size, note: c.booking.note } } } : undefined }) });
  await v4.farewell("completed"); emit("suzu → atom", "farewell", "farewell", { film: film("farewell", "farewell") });

  // ---- step 23: the reservation card, every field from the signed confirmation
  beat("23", "Your reservation");
  const d = c ? new Date(c.booking.start) : null;
  const cardFields = c && { place: c.place.display_name, item: c.booking.note, date: d.toLocaleDateString("en-US", { timeZone: c.booking.time_zone, weekday: "long", month: "long", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { timeZone: c.booking.time_zone, hour: "numeric", minute: "2-digit" }) + " (Pacific)", party: c.booking.party_size, booking: c.confirmation_id,
    signed_by: `${c.place.display_name} ${ck(conf.ok && c.place.site === v4.verifiedSite)} (${new URL(c.place.site).host})`, change_or_cancel: "reservation.change / reservation.cancel, citing the booking" };
  expect(!!cardFields && cardFields.booking === `LM-${DAY.slice(5, 7)}${DAY.slice(8, 10)}-1230`, "the card renders only from the signed confirmation");
  emit("atom → ines", "reservation_card", `reservation card · ${cardFields?.place} · ${cardFields?.date} · ${cardFields?.time} · for ${cardFields?.party} · ${cardFields?.booking} · signed by ${cardFields?.signed_by}`, { card: cardFields,
    film: film("report_home", `your reservation · ${cardFields?.booking} · ${cardFields?.date}, ${cardFields?.time} · for ${cardFields?.party} · from the signed confirmation`, { checks: [C("signature", conf.ok && c?.place.site === v4.verifiedSite)], fields: { card: cardFields } }) });

  const all = beats.flatMap((b) => b.checks); const ok = all.every((x) => x.ok);
  const report = { scenario: "shokai-demo2", spec: sdk.SPEC_VERSION, protocol: PROTOCOL, ran_at: iso(), time_zone_shown: TZ, reservation_day: DAY, door: { base: door.base, site: SITE, kind: "createDoor (SDK reference door), its own process", calendar: cal.label },
    model_calls: 0, network: "127.0.0.1 only (lanternmoss.example mapped by a resolver stand-in)", people: "fictional (Ines, Atom, Pia, Suzu)",
    summary: { beats: beats.length, checks: all.length, passed: all.filter((x) => x.ok).length, failed: all.filter((x) => !x.ok).length },
    beats, door_events: doorEvents, events };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\ndemo2: ${report.summary.passed}/${report.summary.checks} checks across ${beats.length} beats${ok ? "" : " — FAILED"}. Events: ${path.join(OUT, "events.jsonl")} · report: ${path.join(OUT, "report.json")}`);
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  process.exitCode = ok ? 0 : 1;
}
main().catch((e) => { console.error("demo2: " + (e?.stack ?? e)); process.exit(2); });
