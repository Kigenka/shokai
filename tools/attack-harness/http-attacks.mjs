// Round 2 HTTP attacks against a TEMP Engawa on s6 (ephemeral keys, throwaway state, ports 8907–8909).
// Never touches :8790/:8791/:8890–:8893, the pilot's live key home, or any existing run.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { C, K, PL, rec, desc, grant, ROOT, TARGET, ENG, TDIR } from "./lib.mjs";

const PORT = Number(process.env.RT_PORT ?? 5165), FXP = PORT + 1;   // builders range 5102–5179 (was 8907–8908)
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const plus = (s) => new Date(Date.now() + s * 1000).toISOString().replace(/\.\d+Z$/, "Z");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(url, { method = "POST", body } = {}) {
  try {
    const r = await fetch(url, { method, body: body === undefined ? undefined : typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, body: j, headers: r.headers };
  } catch (e) { return { status: 0, body: null, error: String(e.message ?? e) }; }
}

function person(name, scope) {
  const v = K.visitor(name, "person", scope ?? { purposes: ["gathering", "visitation", "invitation"], actions: ["gathering.attend", "gathering.request_invitation"] });
  return v;
}

async function startEngawa(port, invitees) {
  const dir = mkdtempSync(join(tmpdir(), "shokai-rt2-"));
  const inv = join(dir, "invitees.json"), places = join(dir, "places.json");
  writeFileSync(inv, JSON.stringify({ note: "rt2 temp", invitees: invitees.map((v) => ({ representative_id: v.rep.id, principal_id: v.owner.id })) }));
  writeFileSync(places, JSON.stringify({ note: "rt2", fetch_allow: [`http://127.0.0.1:${FXP}/`] }));
  const p = spawn("node", ["dist/src/pilot-server.js", "--mode=engawa", `--port=${port}`, `--invitees=${inv}`, `--places=${places}`, `--state=${join(dir, "state")}`, "--ephemeral-keys=true", "--max-encounters=100"],
    { cwd: ENG, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (d) => (log += d)); p.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 80 && !/gathering digest|listening|S5 pilot|S6|pilot/.test(log); i++) await sleep(100);
  // Wait until /places answers
  let place = null;
  for (let i = 0; i < 50; i++) {
    const r = await req(`http://127.0.0.1:${port}/places`, { method: "GET" });
    if (r.status === 200 && r.body?.places?.[0]) { place = r.body.places[0]; break; }
    await sleep(100);
  }
  if (!place) throw new Error("engawa did not start: " + log.slice(-500));
  return { p, dir, base: `http://127.0.0.1:${port}`, place, log: () => log, stop: () => new Promise((r) => { p.once("exit", r); p.kill(); }) };
}

const ines = person("Ines Calder");
const eng = await startEngawa(PORT, [ines]);
try {
  // H1: ephemeral keys. Two fresh starts must get two different place keys (in-memory keys, never the pilot's live key home).
  // Nothing on disk is read: the check compares the two listings.
  const eng2 = await startEngawa(PORT + 3, [ines]);
  const liveRep = eng.place.representative_id, rep2 = eng2.place.representative_id;
  await eng2.stop();
  const usedEph = !!liveRep && !!rep2 && liveRep !== rep2;
  rec({ id: "H1", cat: "supply", sev: "medium", title: "Temp Engawa runs with --ephemeral-keys (fresh keys per start, never the live key home)", tried: "start pilot-server twice with --ephemeral-keys=true", expected: "two different representative DIDs", actual: `first=${(liveRep||"").slice(0,28)}… second=${(rep2||"").slice(0,28)}…`, held: usedEph, level: "code" });

  // H2: anonymous flood still rate-limited (regression of L1)
  const codes = {};
  await Promise.all(Array.from({ length: 200 }, async (_, i) => { const r = await req(eng.place.entry, { body: "flood " + i }); codes[r.status] = (codes[r.status] ?? 0) + 1; }));
  rec({ id: "H2", cat: "dos", sev: "medium", title: "Lobby flood still rate-limited (regression)", tried: "200 parallel prose POSTs", expected: "some 429s", actual: JSON.stringify(codes), held: (codes[429] ?? 0) > 0, level: "code" });

  // H3: oversize body still 413 (regression of I4)
  const big = await req(eng.place.entry, { body: "x".repeat(300 * 1024) });
  rec({ id: "H3", cat: "dos", sev: "high", title: "Oversize body still 413 (regression)", tried: "300 KB POST", expected: "413", actual: String(big.status), held: big.status === 413, level: "code" });

  // H4: stranger still cannot self-invite (regression of F5)
  const vex = person("Vex Arlo");
  // minimal ritual for invitation
  const enc = C.randomId("enc");
  const E = eng.place.entry;
  const g = await req(E, { body: C.makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: enc + "-g", sent_at: now(), from: vex.rep.id, to: eng.place.representative_id, type: "greeting", locales: ["en-US"], nonce: C.randomId("n") }, vex.rep, now()) });
  const hn = (g.body?.messages ?? []).map((m) => m.payload ?? m).find((m) => m.type === "greeting")?.nonce;
  const proof = C.makeSigned({ encounter_id: enc, nonce: hn }, vex.rep, now()).signatures[0];
  await req(E, { body: C.makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: enc + "-c", sent_at: now(), from: vex.rep.id, to: eng.place.representative_id, type: "card_presentation", card: vex.card, possession_proof: proof }, vex.rep, now()) });
  await req(E, { body: C.makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: enc + "-i", sent_at: now(), from: vex.rep.id, to: eng.place.representative_id, type: "introduction", vouch: null }, vex.rep, now()) });
  const m = K.mandate(vex, "invitation", ["gathering.request_invitation"], {}, { valid_from: plus(-3600), expires_at: plus(86400) });
  const rq = await req(E, { body: C.makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: enc + "-r", sent_at: now(), from: vex.rep.id, to: eng.place.representative_id, type: "invitation_request", card_digest: vex.card.payload_digest, mandate: m, proposal: { request: { actions: ["gathering.request_invitation"] }, value_to_counterparty: { text: "hi", locale: "en-US" }, etiquette_register: "first_meeting" } }, vex.rep, now()) });
  const decision = (rq.body?.messages ?? []).map((x) => x.payload ?? x).find((x) => x.type === "invitation_response");
  rec({ id: "H4", cat: "gathering", sev: "critical", title: "Stranger self-invite still blocked (F5 regression)", tried: "fresh owner asks gathering.request_invitation", expected: "not grant / no auto-invitation", actual: desc(decision), held: !grant(decision), level: "code" });
} finally {
  await eng.stop();
}
