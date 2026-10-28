// v0.2.8 conformance checks (2026-10-26): P2 "*" forbidden for money / account creation (§4), P10 session-wide spend cap (§7.2),
// P12 encounter cap refuses new arrivals, never existing guests (§13). Real crypto, fresh fictional keys only.
import type * as S from "../src/shapes.js";
import { appendFileSync } from "node:fs"; // D18: SHOKAI_CHECK_LOG lists each check for scripts/suite-split.mjs (no effect otherwise)
import { newEd25519, ed25519FromLabel, TEST_INTRODUCER_LABEL } from "../src/crypto.js";
import { fernwood, harborlight, makeHost, newKeys, trusting, type PlaceKeys } from "../src/places.js";
import { needsNamedIntroducer, ACCOUNT_CREATE } from "../src/gate.js";
import type { PlaceConfig } from "../src/policy.js";
import { visitor, mandate, vouch, Session, clockAt, NOW } from "./kit.js";

let pass = 0, fail = 0; const results: Record<string, boolean[]> = {}; let cur = "";
function scenario(name: string, f: () => void) { cur = name; results[name] = []; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v028", group: cur, what, ok: c }) + "\n"); results[cur].push(c); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }
const clock = clockAt(NOW);
const USD = (v: string): S.Money => ({ value: v, currency: "USD" });
const payScope = { purposes: ["payment_initiation" as const, "account_servicing" as const], actions: ["bank.submit_payment", "bank.get_balance"] };
const act = (s: Session, seat: string, tool: string, amount: string, payment_ref: string) =>
  s.send(s.msg("act", { seat_id: seat, tool, arguments: { amount: USD(amount), payment_ref } }));
const ok = (out: any[]) => out.some((x) => x.type === "act_result" && x.ok);
const denied = (out: any[]) => out.find((x) => x.type === "act_decision");

// A store whose reviewer program signs you up (account-creating), and which lists account.create itself; introduction required.
const signupStore = (k: PlaceKeys): PlaceConfig => {
  const c = fernwood(k); const p = { ...c.policy };
  p.actions = [...p.actions, { action: ACCOUNT_CREATE, purposes: ["x-reviews"], level: "act_on_behalf" }];
  p.account_actions = ["store.join_reviewer_program"]; p.require_vouch_for = ["x-reviews"];
  return { ...c, policy: p };
};

scenario("V28-P2a '*' gives no weight for a money operation (C149)", () => {
  const logs = new Map(); const h = makeHost(harborlight, newKeys(), new Map(), clock.now, { fetched: logs });
  const v = visitor("Ines Calder", "person", payScope); const intro = newEd25519();
  const s = new Session(h, v); const lim = { max_amount: USD("100.00") };
  s.ritual(vouch(intro, "Old Friend", v, ["payment_initiation"], logs), mandate(v, "payment_initiation", ["bank.submit_payment"], lim), { actions: ["bank.submit_payment"], limits: lim });
  const r = s.response();
  check(r.decision === "deny" && r.disposition === "not_now" && r.reason_code === "VOUCH_REQUIRED" && r.retry?.credentials?.[0] === "vouch", "payment under '*': not_now / VOUCH_REQUIRED, retry [vouch]");
  check(h.encounters.get(s.enc)!.vouchWeight === "none" && h.log.some((l) => /trusted_introducers "\*" gives no weight/.test(l)), "the vouch counts as none, and the host says why");
  check(![...h.introducers.values()].length, "nothing recorded against the introducer");
});
scenario("V28-P2b a named introducer still introduces for money (C149)", () => {
  const logs = new Map(); const intro = newEd25519();
  const h = makeHost(trusting(harborlight, [intro.id]), newKeys(), new Map(), clock.now, { fetched: logs });
  const v = visitor("Ines Calder", "person", payScope); const lim = { max_amount: USD("100.00") };
  const s = new Session(h, v); s.ritual(vouch(intro, "Old Friend", v, ["payment_initiation"], logs), mandate(v, "payment_initiation", ["bank.submit_payment"], lim), { actions: ["bank.submit_payment"], limits: lim });
  check(s.response().decision === "grant" && h.encounters.get(s.enc)!.vouchWeight === "full", "listed introducer: grant, full weight");
  const other = newEd25519(); const v2 = visitor("Noor Halloran", "person", payScope);
  const s2 = new Session(h, v2); s2.ritual(vouch(other, "Old Friend", v2, ["payment_initiation"], logs), mandate(v2, "payment_initiation", ["bank.submit_payment"], lim), { actions: ["bank.submit_payment"], limits: lim });
  check(s2.response().reason_code === "VOUCH_REQUIRED", "an unlisted introducer with the same display name: no weight (names are never identity)");
});
scenario("V28-P2e under '*', commitment_introducers names who may introduce money; the Appendix B.5 test introducer is derivable (C149)", () => {
  const logs = new Map(); const ti = ed25519FromLabel(TEST_INTRODUCER_LABEL);
  const named = (k: PlaceKeys): PlaceConfig => { const c = harborlight(k); return { ...c, policy: { ...c.policy, commitment_introducers: [ti.id] } }; };
  const h = makeHost(named, newKeys(), new Map(), clock.now, { fetched: logs }); const lim = { max_amount: USD("100.00") };
  const v = visitor("Ines Calder", "person", payScope); const s = new Session(h, v);
  s.ritual(vouch(ti, "Test Introducer", v, ["payment_initiation"], logs), mandate(v, "payment_initiation", ["bank.submit_payment"], lim), { actions: ["bank.submit_payment"], limits: lim });
  check(s.response().decision === "grant", "named commitment introducer under '*' → grant");
  check(ti.id === ed25519FromLabel("test-introducer-1").id && ti.id.startsWith("did:key:z6Mk"), "test introducer: did:key from SHA-256('shokai-demo-seed:test-introducer-1') (B.5)");
  const v2 = visitor("Noor Halloran", "person", payScope); const s2 = new Session(h, v2);
  s2.ritual(vouch(newEd25519(), "Test Introducer", v2, ["payment_initiation"], logs), mandate(v2, "payment_initiation", ["bank.submit_payment"], lim), { actions: ["bank.submit_payment"], limits: lim });
  check(s2.response().reason_code === "VOUCH_REQUIRED", "anyone else under '*' (same display name) → VOUCH_REQUIRED");
});
scenario("V28-P2c '*' still works where nothing moves money or opens an account (C149)", () => {
  const logs = new Map(); const h = makeHost(harborlight, newKeys(), new Map(), clock.now, { fetched: logs });
  const v = visitor("Ines Calder", "company", { purposes: ["account_servicing"], actions: ["bank.get_balance", "bank.agent_access_pilot"] });
  const s = new Session(h, v); s.ritual(vouch(newEd25519(), "Example Accounting", v, ["account_servicing"], logs), mandate(v, "account_servicing", ["bank.get_balance"]), { actions: ["bank.agent_access_pilot"] });
  check(s.response().decision === "considering" && h.encounters.get(s.enc)!.vouchWeight === "full", "non-money considering under '*': vouch keeps full weight");
  const P = h.cfg.policy;
  check(needsNamedIntroducer(P, ["bank.submit_payment"]) && needsNamedIntroducer(P, ["bank.get_balance"], { max_amount: USD("1.00") }) && !needsNamedIntroducer(P, ["bank.get_balance"], { max_amount: USD("0.00") })
    && needsNamedIntroducer(P, [ACCOUNT_CREATE]) && !needsNamedIntroducer(P, ["bank.get_balance"]), "classification: spending action, positive amount, account.create; zero amount and reads are not");
});
scenario("V28-P2d account creation under '*' needs a named introducer; the lobby says which actions create accounts (C150)", () => {
  const logs = new Map(); const h = makeHost(signupStore, newKeys(), new Map(), clock.now, { fetched: logs });
  const scope = { purposes: ["x-reviews" as const], actions: [ACCOUNT_CREATE, "store.join_reviewer_program", "store.browse_catalog"] };
  for (const a of [ACCOUNT_CREATE, "store.join_reviewer_program"]) {
    const v = visitor("Vex Arlo", "person", scope); const s = new Session(h, v);
    s.ritual(vouch(newEd25519(), "Fresh Friend", v, ["x-reviews"], logs), mandate(v, "x-reviews", [a]), { actions: [a] });
    check(s.response().reason_code === "VOUCH_REQUIRED", `${a} under '*' with a fresh introducer → VOUCH_REQUIRED`);
  }
  const intro = newEd25519(); const h2 = makeHost(trusting(signupStore, [intro.id]), newKeys(), new Map(), clock.now, { fetched: logs });
  const v = visitor("Marc Voss", "person", scope); const s = new Session(h2, v);
  s.ritual(vouch(intro, "Known Friend", v, ["x-reviews"], logs), mandate(v, "x-reviews", ["store.join_reviewer_program"]), { actions: ["store.join_reviewer_program"] });
  check(s.response().decision === "grant", "named introducer → sign-up seated");
  const acts = h.placeActions();
  check(acts.find((x) => x.action === ACCOUNT_CREATE)?.creates_account === true && acts.find((x) => x.action === "store.join_reviewer_program")?.creates_account === true
    && acts.find((x) => x.action === "store.browse_catalog")?.creates_account === undefined, "listing/lobby actions: creates_account true only where it applies (omitted otherwise)");
  const b = new Session(h, visitor("Kiran Vale", "person", scope)); b.ritual(null, mandate(b.v!, "x-reviews", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(b.response().reason_code === "VOUCH_REQUIRED", "(sanity) purpose x-reviews requires an introduction at this test store");
  const w = visitor("Ines Calder", "person", scope); const sw = new Session(h, w);
  sw.ritual(vouch(newEd25519(), "Fresh Friend", w, ["x-reviews"], logs), mandate(w, "x-reviews", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(sw.response().decision === "grant", "same fresh introducer under '*' for a non-account action (browse) → grant: only the account-creating action is gated");
});

const perOpSeat = (lim: S.Limits, req: S.Limits = { max_amount: lim.max_amount }) => {
  const h = makeHost(fernwood, newKeys(), new Map(), clock.now);
  const v = visitor("Ines Calder", "person", { purposes: ["purchase"], actions: ["store.place_order"] });
  const s = new Session(h, v); s.ritual(null, mandate(v, "purchase", ["store.place_order"], lim), { actions: ["store.place_order"], limits: req });
  return { h, s, r: s.response() };
};
scenario("V28-P10a per_operation without a session cap: the session cap defaults to max_amount, across payment_refs (C151)", () => {
  const { s, r } = perOpSeat({ max_amount: USD("200.00"), max_amount_scope: "per_operation" });
  check(r.decision === "grant" && r.seat.limits.max_amount_scope === "per_operation" && JSON.stringify(r.seat.limits.session_max_amount) === JSON.stringify(USD("200.00")), "seat states per_operation and session_max_amount = max_amount");
  check(ok(act(s, r.seat.seat_id, "store.place_order", "150.00", "A")), "first $150 (ref A) ok");
  const d = denied(act(s, r.seat.seat_id, "store.place_order", "150.00", "B"));
  check(!!d && d.disposition === "not_now" && d.reason_code === "SEAT_SCOPE_EXCEEDED", "second $150 on a fresh ref B → not_now / SEAT_SCOPE_EXCEEDED (red team X1)");
  check(ok(act(s, r.seat.seat_id, "store.place_order", "50.00", "C")), "what is left of the session cap ($50) still goes through");
});
scenario("V28-P10b per_operation with an explicit session cap (C151)", () => {
  const { s, r } = perOpSeat({ max_amount: USD("200.00"), max_amount_scope: "per_operation", session_max_amount: USD("400.00") });
  check(JSON.stringify(r.seat.limits.session_max_amount) === JSON.stringify(USD("400.00")), "seat session_max_amount = the owner's $400");
  const id = r.seat.seat_id;
  check(!ok(act(s, id, "store.place_order", "250.00", "A")), "$250 > per-operation $200 → refused");
  check(ok(act(s, id, "store.place_order", "150.00", "B")) && ok(act(s, id, "store.place_order", "150.00", "C")), "$150 + $150 on different refs ok (opt-in per_operation)");
  check(!ok(act(s, id, "store.place_order", "150.00", "D")), "third $150 would make $450 > session $400 → refused");
});
scenario("V28-P10c session cap never above the place's per-seat limit or the mandate; per_seat unchanged (C151)", () => {
  const big = perOpSeat({ max_amount: USD("200.00"), max_amount_scope: "per_operation", session_max_amount: USD("5000.00") });
  check(JSON.stringify(big.r.seat.limits.session_max_amount) === JSON.stringify(USD("500.00")), "session cap clipped to Fernwood's $500 place_order seat limit");
  const over = perOpSeat({ max_amount: USD("200.00"), max_amount_scope: "per_operation", session_max_amount: USD("300.00") }, { max_amount: USD("200.00"), session_max_amount: USD("900.00") });
  const c = over.r.conditions?.find((x: any) => x.code === "lower_limit");
  check(over.r.decision === "conditional" && JSON.stringify(c?.params?.session_max_amount) === JSON.stringify(USD("300.00")), "request asks a session cap above the mandate's → conditional lower_limit {session_max_amount: mandate's}");
  const seat = perOpSeat({ max_amount: USD("200.00") });
  check(seat.r.seat.limits.max_amount_scope === undefined && seat.r.seat.limits.session_max_amount === undefined, "default per_seat seat: no scope, no session field (wire unchanged)");
  check(ok(act(seat.s, seat.r.seat.seat_id, "store.place_order", "150.00", "A")) && !ok(act(seat.s, seat.r.seat.seat_id, "store.place_order", "150.00", "B")), "per_seat: cumulative as before");
});

scenario("V28-P12a at the encounter cap new arrivals are refused; existing guests stay (C152)", () => {
  const h = makeHost(fernwood, newKeys(), new Map(), clock.now, { maxEncounters: 5 });
  const vs = Array.from({ length: 5 }, (_, i) => visitor("Guest " + i, "person", { purposes: ["visitation"], actions: ["store.browse_catalog"] }));
  const ss = vs.map((v) => { const s = new Session(h, v); s.greet(); return s; });
  check(h.encounters.size === 5 && !h.capacityRefused, "five live guests mid-ritual");
  const late = new Session(h, visitor("Late", "person", { purposes: ["visitation"], actions: ["store.browse_catalog"] }));
  const out = late.greet();
  check(h.capacityRefused && out.length === 0 && !h.encounters.has(late.enc) && h.encounters.size === 5 && h.capacityRefusals === 1, "sixth greeting refused: no reply, no state, refusal counted");
  const prose = h.handle("hello, may I come in?");
  check(h.capacityRefused && prose.length === 0 && h.encounters.size === 5, "a prose arrival is refused too (no lobby encounter created)");
  check(ss.every((s) => h.encounters.has(s.enc)), "no existing guest was evicted");
  const s0 = ss[0]; s0.present(); s0.receipt(); s0.introduce(null); s0.request(mandate(s0.v!, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s0.response()?.decision === "grant", "an existing guest completes its ritual and is seated");
});
scenario("V28-P12b closed encounters make room; never bindings and spent state survive (C152)", () => {
  const h = makeHost(fernwood, newKeys(), new Map(), clock.now, { maxEncounters: 3, maxMessageAgeS: 300 });
  for (let i = 0; i < 3; i++) { const s = new Session(h, null, "urn:shokai:anon:w" + i); s.greet(false); }   // unsigned → lobby → closed
  check(h.encounters.size === 3 && [...h.encounters.values()].every((e) => e.closed), "three closed lobby encounters");
  h.bindNever("did:key:z6MkFakeNeverBound", clock.now());
  const v = visitor("Ines Calder", "person", { purposes: ["visitation"], actions: ["store.browse_catalog"] });
  const s = new Session(h, v); s.ritual(null, mandate(v, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(!h.capacityRefused && s.response()?.decision === "grant" && h.encounters.size <= 3, "a closed encounter was dropped to seat the newcomer");
  check(h.isNever("did:key:z6MkFakeNeverBound"), "a never binding is not cleared by dropping encounters");
  check(h.usedNonces.size <= 12, "replay map bounded (≤ 4× cap)");
});
scenario("V28-P12c conformance default: no cap unless set (C152)", () => {
  const h = makeHost(fernwood, newKeys(), new Map(), clock.now);
  for (let i = 0; i < 30; i++) { const s = new Session(h, visitor("F" + i, "person", { purposes: ["visitation"], actions: ["store.browse_catalog"] })); s.greet(); }
  check(h.encounters.size === 30 && !h.capacityRefused, "maxEncounters unset → unbounded (as v0.2.7; places MUST set one in production)");
});

console.log("\nv0.2.8 results:");
for (const [k, v] of Object.entries(results)) console.log(`  ${v.every(Boolean) ? "PASS" : "FAIL"}  ${k}  (${v.filter(Boolean).length}/${v.length} checks)`);
console.log(`\n${pass} v0.2.8 checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
