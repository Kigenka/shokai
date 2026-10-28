// The conformance runner passes a conformant door and catches a broken one.
import http from "node:http";
import { runConformance, formatReport, verdict } from "../src/conformance/runner.js";
import { createNotesDoor, startGatedServer, buildNotesServer } from "../examples/toy-mcp/server.js";
import { shokaiGate, statelessMcp, ShokaiGate, type GateAdapter } from "../src/mcp.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const listen = (h: http.RequestListener) => new Promise<{ s: http.Server; port: number }>((r) => { const s = http.createServer(h); s.listen(0, "127.0.0.1", () => r({ s, port: (s.address() as any).port })); });

console.log("Conformance runner");
const door = createNotesDoor();
const good = await listen(async (req, res) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
door.setBaseUrl(`http://127.0.0.1:${good.port}/shokai`);
const r1 = await runConformance(`http://127.0.0.1:${good.port}/shokai`, { levels: ["visit-receipts"] });
check(r1.results.filter((x) => x.status === "fail").length === 0 && r1.summary.core.pass >= 19, `a conformant door passes (${r1.summary.core.pass} core checks)`);
check(r1.results.some((x) => x.id === "ritual.place_id" && x.status === "pass"), "the runner checks the place against its listing like a visitor must (ritual.place_id, C104)");
const r1v = await runConformance(`http://127.0.0.1:${good.port}/shokai`, { levels: ["vectors"], vectorsAgainst: "this runner's own crypto, NOT the door" });
check(/NOT the door/.test(r1v.vectors_against ?? ""), "with a URL target the report says the vectors ran against the runner's own crypto, not the door");
check(r1.results.some((x) => x.id === "seat.mandate_across" && x.status === "pass"), "the runner checks that a mandate's limits bind across visits (seat.mandate_across, C175)");
check(r1.results.some((x) => x.id === "door.404_here" && x.status === "pass"), "GET <entry> at a conformant door: a 404 pointer that names the door in `here` (door.404_here, C200)");
good.s.close();

// A pre-C200 door: GET <entry> gets the bare pointer (no `here`). v0.3.0: a warning only; the door stays CONFORMANT (MUST in v0.4).
const doorC200 = createNotesDoor();
const noHere = await listen(async (req, res) => {
  if (req.method === "GET" && /\/places\/[^/]+\/entry$/.test(new URL(req.url ?? "/", "http://x").pathname)) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify(doorC200.pointer())); return; }
  if (!(await doorC200.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
doorC200.setBaseUrl(`http://127.0.0.1:${noHere.port}/shokai`);
const rC200 = await runConformance(`http://127.0.0.1:${noHere.port}/shokai`);
check(rC200.results.some((x) => x.id === "door.404_here" && x.status === "warn") && verdict(rC200).core === "pass", "a door whose GET <entry> pointer doesn't name it gets a door.404_here warning and stays CONFORMANT (SHOULD in v0.3.0)");
noHere.s.close();

// v0.3.0 (§3.1, compatibility): a door whose listing still names its release candidate "0.3.0-rc4" (no wire change) passes
// door.spec_ref with a note; one that names another version gets a warning; neither changes the verdict.
for (const [label, want] of [["0.3.0-rc4", "pass"], ["0.2.9", "warn"]] as const) {
  const d = createNotesDoor();
  const srv = await listen(async (req, res) => {
    if (req.method === "GET" && /\/places$/.test(new URL(req.url ?? "/", "http://x").pathname)) {
      const end = res.end.bind(res) as any;
      (res as any).end = (body?: any, ...rest: any[]) => end(typeof body === "string" || Buffer.isBuffer(body) ? String(body).replaceAll('"version":"0.3.0"', `"version":"${label}"`) : body, ...rest);
    }
    if (!(await d.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
  d.setBaseUrl(`http://127.0.0.1:${srv.port}/shokai`);
  const r = await runConformance(`http://127.0.0.1:${srv.port}/shokai`);
  const sr = r.results.find((x) => x.id === "door.spec_ref");
  check(sr?.status === want && String(sr?.detail).includes(label) && verdict(r).core === "pass", `a door naming spec_ref "${label}" gets door.spec_ref ${want} and stays CONFORMANT`);
  srv.s.close();
}

// A door that counts limits per seat only: it forgets each mandate's use before every message.
const door3 = createNotesDoor();
const perSeat = await listen(async (req, res) => { (door3 as any).host.mandateUse.clear(); if (!(await door3.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
door3.setBaseUrl(`http://127.0.0.1:${perSeat.port}/shokai`);
const r3 = await runConformance(`http://127.0.0.1:${perSeat.port}/shokai`);
check(r3.results.some((x) => x.id === "seat.mandate_across" && x.status === "fail"), "a door that resets a mandate's allowance with each new seat is caught (seat.mandate_across)");
perSeat.s.close();

// rc4 clarification (§2.2, C197): a door that names its own encounter (its host renames every encounter it opens) checks the
// visitor's possession proof over its own id. The runner's visitor stops at the greeting, and the door is NOT CONFORMANT.
const door4 = createNotesDoor(); { const h: any = (door4 as any).host; const orig = h.newEnc.bind(h);
  h.newEnc = (id: string, ...rest: unknown[]) => { const e = orig(id, ...rest); e.id = "place-" + id; return e; }; }
const minting = await listen(async (req, res) => { if (!(await door4.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
door4.setBaseUrl(`http://127.0.0.1:${minting.port}/shokai`);
const rMint = await runConformance(`http://127.0.0.1:${minting.port}/shokai`);
const fMint = new Set(rMint.results.filter((x) => x.status === "fail").map((x) => x.id));
check(fMint.has("ritual.encounter") && fMint.has("ritual.place_id") && fMint.has("ritual.grant"), `a door that names its own encounter is caught (ritual.encounter, ritual.place_id, ritual.grant: ${[...fMint].join(", ")})`);
check(r1.results.some((x) => x.id === "ritual.encounter" && x.status === "pass"), "the reference door answers in the visitor's encounter (ritual.encounter, C197)");
check(r1.results.some((x) => x.id === "lobby.prose" && x.status === "pass"), "the reference lobby opens with a greeting (lobby.prose, §3.1)");
minting.s.close();

// S1 (adversarial review, 2026-10-28): money caps. A tea door that seats a spending limit honestly, and the same door with its caps
// switched off after seating (every seat's and mandate's max_amount raised before each message), like the review's broken-cap door.
const { createDoor } = await import("../src/index.js");
const teaDoor = () => createDoor({ name: "tea-shop", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.view", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });
const honestTea = teaDoor();
const ht = await listen(async (req, res) => { if (!(await honestTea.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
honestTea.setBaseUrl(`http://127.0.0.1:${ht.port}/shokai`);
const rT = await runConformance(`http://127.0.0.1:${ht.port}/shokai`, { spend: { value: "6.00", args: { tea: "sencha" } } });
const st = (r: any, id: string) => r.results.find((x: any) => x.id === id)?.status;
check(verdict(rT).core === "pass" && st(rT, "seat.max_amount") === "pass" && st(rT, "seat.max_amount_total") === "pass" && st(rT, "mandate.max_amount_total") === "pass",
  `an honest spending door passes the cap checks (seat.max_amount, seat.max_amount_total, mandate.max_amount_total: ${["seat.max_amount", "seat.max_amount_total", "mandate.max_amount_total"].map((i) => st(rT, i)).join(", ")})`);
const rT0 = await runConformance(`http://127.0.0.1:${ht.port}/shokai`);
check(st(rT0, "seat.max_amount") === "pass" && st(rT0, "seat.max_amount_total") === "skip", "without --spend the always-on cap check runs (no money moves at an honest door) and the totals are skipped, not passed");
ht.s.close();
const brokenTea = teaDoor(); const BIG = { value: "999999.00", currency: "USD" };
const bt = await listen(async (req, res) => {
  for (const s of (brokenTea as any).host.seats.values()) { s.seat = { ...s.seat, limits: { ...(s.seat.limits ?? {}), max_amount: BIG } }; if (s.mlimits) s.mlimits = { ...s.mlimits, max_amount: BIG }; }
  if (!(await brokenTea.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
brokenTea.setBaseUrl(`http://127.0.0.1:${bt.port}/shokai`);
const rB = await runConformance(`http://127.0.0.1:${bt.port}/shokai`, { spend: { value: "6.00", args: { tea: "sencha" } } });
check(verdict(rB).core === "fail" && st(rB, "seat.max_amount") === "fail" && st(rB, "seat.max_amount_total") === "fail" && st(rB, "mandate.max_amount_total") === "fail",
  `the broken-cap door is caught (${["seat.max_amount", "seat.max_amount_total", "mandate.max_amount_total"].map((i) => i + " " + st(rB, i)).join(", ")})`);
const rB0 = await runConformance(`http://127.0.0.1:${bt.port}/shokai`);
check(verdict(rB0).core === "fail" && st(rB0, "seat.max_amount") === "fail", "without --spend the broken-cap door already fails seat.max_amount");
bt.s.close();

// A broken door: a bare 404 for unknown paths, and the place's replies are not signed.
const door2 = createNotesDoor();
const bad = await listen(async (req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  if (u.pathname.startsWith("/shokai/no-such")) { res.writeHead(404); res.end("not found"); return; }
  if (req.method === "POST" && u.pathname.endsWith("/entry")) {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const env = (await door2.post(Buffer.concat(chunks).toString("utf8"))).envelope;
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ...env, messages: env.messages.map((m: any) => m.payload ?? m) })); return;
  }
  if (!(await door2.handleHttp(req, res))) { res.writeHead(404); res.end(); }
});
door2.setBaseUrl(`http://127.0.0.1:${bad.port}/shokai`);
const r2 = await runConformance(`http://127.0.0.1:${bad.port}/shokai`);
const failed = new Set(r2.results.filter((x) => x.status === "fail").map((x) => x.id));
check(failed.has("door.404"), "a bare 404 is caught (door.404)");
check(failed.has("lobby.signed"), "unsigned replies are caught (lobby.signed)");
check(failed.has("ritual.place_id"), "a place whose replies don't verify fails the visitor's identity check (ritual.place_id)");
bad.s.close();

// v0.3.0-rc3: the rc3 core checks pass at the reference door (C183–C186, C188–C190).
for (const id of ["body.batch", "lobby.bad_signature", "neg.bad_signature", "request.incomplete", "mandate.cross", "seat.unknown", "lifecycle.again", "neg.probing", "act.order", "card.revoked", "card.revoked_seat"])
  check(r1.results.some((x) => x.id === id && x.status === "pass"), `the reference door passes ${id}`);
check(r1.results.some((x) => x.id === "mcp.endpoint" && x.status === "skip") && !r1.results.some((x) => x.level === "mcp" && x.status === "fail"), "a door with no MCP endpoint skips the MCP binding (mcp.endpoint skip), never fails it");
// v0.3.0-rc3: the verdict is core only; a requested extension that fails is reported apart and never prints NOT CONFORMANT.
const fake = { ...r1, results: [...r1.results.filter((x) => x.level === "core"), { id: "ext.visit_receipt", level: "visit-receipts" as const, title: "x", ref: "x", status: "fail" as const }] };
const txt = formatReport(fake);
check(verdict(fake).core === "pass" && !/NOT CONFORMANT/.test(txt) && /Extension visit-receipts: 1 failing/.test(txt), "an extension failure is reported on its own and doesn't make the door NOT CONFORMANT");
const fake2 = { ...r1, results: [...r1.results, { id: "door.404", level: "core" as const, title: "x", ref: "x", status: "fail" as const }] };
check(/Core: NOT CONFORMANT: 1 failing core check/.test(formatReport(fake2)), "a core failure still prints NOT CONFORMANT");

// v0.3.0-rc3: the MCP binding (§11.3, C179–C182) against the SDK's gated toy server.
const g = await startGatedServer();
const r4 = await runConformance(g.base + "/shokai");
const mcpIds = ["mcp.endpoint", "mcp.initialize", "mcp.list", "mcp.refusal", "mcp.act", "mcp.gate", "mcp.door_refusal", "mcp.amount"];
for (const id of mcpIds) check(r4.results.some((x) => x.id === id && x.status === "pass"), `the gated server passes ${id}` + (r4.results.find((x) => x.id === id)?.detail ? ` (${r4.results.find((x) => x.id === id)!.detail})` : ""));
check(verdict(r4).core === "pass", "the gated server is conformant, MCP included");
g.server.close();
// A gate that lets every call through (no act checked) is caught.
const door5 = createNotesDoor(); const open: GateAdapter = { check: () => ({ allow: true }) };
const loose = await listen(shokaiGate(door5, statelessMcp(buildNotesServer), { adapter: open }));
door5.setBaseUrl(`http://127.0.0.1:${loose.port}/shokai`);
const r5 = await runConformance(`http://127.0.0.1:${loose.port}/shokai`);
const f5 = new Set(r5.results.filter((x) => x.status === "fail").map((x) => x.id));
check(f5.has("mcp.refusal") && f5.has("mcp.gate") && verdict(r5).core === "fail", "a gate that doesn't check acts is caught (mcp.refusal, mcp.gate) and the door is NOT CONFORMANT");
loose.s.close();
// A gate that skips the freshness window is caught by mcp.gate. (A replay is refused by the door too: an act's (from, msg_id) is single use there.)
const door6 = createNotesDoor(); const real = new ShokaiGate(door6, { skewSeconds: 1e9 });
const reuse = await listen(shokaiGate(door6, statelessMcp(buildNotesServer), { adapter: real }));
door6.setBaseUrl(`http://127.0.0.1:${reuse.port}/shokai`);
const r6 = await runConformance(`http://127.0.0.1:${reuse.port}/shokai`);
check(r6.results.some((x) => x.id === "mcp.gate" && x.status === "fail" && /stale PASSED/.test(x.detail ?? "")), "a gate that accepts an act an hour old is caught (mcp.gate: stale)");
reuse.s.close();
// --mcp forces the binding on a door that doesn't advertise it; an endpoint that isn't there fails, it isn't skipped.
const door7 = createNotesDoor();
const plain = await listen(async (req, res) => { if (!(await door7.handleHttp(req, res))) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify(door7.pointer())); } });
door7.setBaseUrl(`http://127.0.0.1:${plain.port}/shokai`);
const r7 = await runConformance(`http://127.0.0.1:${plain.port}/shokai`, { mcp: `http://127.0.0.1:${plain.port}/mcp` });
check(r7.results.some((x) => x.id === "mcp.initialize" && x.status === "fail"), "a forced --mcp endpoint that doesn't speak MCP fails mcp.initialize");
plain.s.close();
console.log(`${pass} runner checks passed, ${fail} failed`); if (fail) process.exit(1);
