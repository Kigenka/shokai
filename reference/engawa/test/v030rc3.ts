// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.3.0-rc3 conformance checks (2026-10-26): the rules an independent implementation had to guess, now stated (C183–C190).
// The MCP binding's checks (C179–C182) run in the SDK's tests against its gate. Real crypto, fresh fictional keys only (Fernwood Outfitters).
import { appendFileSync } from "node:fs"; // SHOKAI_CHECK_LOG lists each check for scripts/suite-split.mjs (no effect otherwise)
import { fernwood, makeHost, newKeys } from "../src/places.js";
import { makeSigned, newEd25519, digestOf } from "../src/crypto.js";
import { Session, visitor, mandate, clockAt, NOW } from "./kit.js";

let pass = 0, fail = 0; let cur = "";
function scenario(name: string, f: () => void) { cur = name; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v030rc3", group: cur, what, ok: c }) + "\n"); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }
const USD = (value: string) => ({ value, currency: "USD" });
const host = () => { const clock = clockAt(NOW); return makeHost(fernwood, newKeys(), new Map(), clock.now); };
const ACTS = ["store.browse_catalog", "store.place_order"];
const types = (out: any[]) => out.map((m) => m.type);

scenario("RC3-B1 one message per POST: an array or a batch envelope is a malformed body → the lobby, nothing in it acted on (C183)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const s = new Session(h, dana);
  const g = makeSigned(s.msg("greeting", { locales: ["en-US"], nonce: "n-batch-1" }), dana.rep, NOW);
  const arr = h.handle([g]).map((o) => o.message.payload);
  check(arr.some((m: any) => m.type === "lobby_briefing") && !arr.some((m: any) => m.encounter_id === s.enc), "a JSON array holding a signed greeting gets the lobby; the greeting inside opens no encounter");
  const env = h.handle({ protocol: "shokai/0.3", messages: [g] }).map((o) => o.message.payload);
  check(env.some((m: any) => m.type === "lobby_briefing") && !env.some((m: any) => m.encounter_id === s.enc), "a ReplyEnvelope-shaped batch gets the lobby too");
  const real = h.handle(g).map((o) => o.message.payload);
  check(real.some((m: any) => m.type === "greeting" && m.encounter_id === s.enc) && !real.some((m: any) => m.type === "lobby_briefing"), "the same greeting sent alone enters the ritual: its nonce wasn't spent by the batches");
});

scenario("RC3-S1 a good digest with a bad signature gets the lobby and never changes an encounter (C184)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ["store.browse_catalog"]);
  const s = new Session(h, dana); s.ritual(null, m, { actions: ["store.browse_catalog"] });
  const seat = s.response()?.seat;
  check(s.response()?.decision === "grant" && !!seat, "seated for browsing");
  const forged = makeSigned(s.msg("farewell", { outcome: "completed" }), newEd25519(), NOW); (forged.signatures[0] as any).signer = dana.rep.id;
  const fo = s.sendRaw(forged);
  check(fo.some((x) => x.type === "lobby_briefing") && fo.every((x) => x.encounter_id !== s.enc && !x.in_reply_to), "a farewell in Dana's name signed by another key gets the lobby, in a new lobby encounter, with no in_reply_to");
  const bad = makeSigned(s.msg("act", { seat_id: seat.seat_id, tool: "store.browse_catalog", arguments: {} }), dana.rep, NOW);
  bad.signatures[0].value = bad.signatures[0].value.slice(0, -4) + (bad.signatures[0].value.endsWith("AAAA") ? "BBBB" : "AAAA");
  const bo = s.sendRaw(bad);
  check(bo.some((x) => x.type === "lobby_briefing") && !bo.some((x) => x.type === "act_result"), "an act whose signature value was corrupted (digest intact) gets the lobby, and nothing is done");
  const ok = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.browse_catalog", arguments: {} }))[0];
  check(ok?.type === "act_result", "the encounter and the seat are unchanged: Dana's own act still goes through");
});

scenario("RC3-I1 REQUEST_INCOMPLETE always retries with_credential [signed_mandate] (C185)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ACTS, { max_amount: USD("20.00") });
  const fresh = () => { const s = new Session(h, dana); s.greet(); s.present(); s.receipt(); s.introduce(null); return s; };
  const ask = (s: Session, body: Record<string, unknown>) => s.send(s.msg("invitation_request", { proposal: { request: { actions: ["store.browse_catalog"] }, value_to_counterparty: { text: "x", locale: "en-US" }, etiquette_register: "first_meeting" }, ...body })).find((x) => x.type === "invitation_response");
  const isInc = (r: any) => r?.decision === "deny" && r.disposition === "not_now" && r.reason_code === "REQUEST_INCOMPLETE" && r.retry?.kind === "with_credential" && JSON.stringify(r.retry.credentials) === '["signed_mandate"]';
  check(isInc(ask(fresh(), { card_digest: dana.card.payload_digest })), "no mandate → REQUEST_INCOMPLETE, [signed_mandate]");
  check(isInc(ask(fresh(), { card_digest: "sha-256:" + "A".repeat(43), mandate: m })), "a card_digest that isn't the presented card → REQUEST_INCOMPLETE, [signed_mandate]");
  check(isInc(ask(fresh(), { card_digest: dana.card.payload_digest, mandate: m, vouch_digest: "sha-256:" + "B".repeat(43) })), "an extra vouch_digest after vouch: null → REQUEST_INCOMPLETE, [signed_mandate]");
  const s = new Session(h, dana); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("20.00") } }); const seat = s.response()?.seat;
  const a = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { sku: "tin" } }))[0];
  check(a?.type === "act_decision" && isInc(a), "a spending act without amount → act_decision REQUEST_INCOMPLETE, [signed_mandate]");
});

scenario("RC3-P1 probing: the Nth distinct rejected shape is answered never and binds the principal here (C186)", () => {
  const h = host(); const pia = visitor("Pia", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(pia, "purchase", ACTS, { max_amount: USD("10.00") });
  // The answer to the visit: the first invitation_response it got (a bound principal is refused at its card, before its request).
  const try1 = (amount: string, rep = pia) => { const s = new Session(h, rep); s.ritual(null, rep === pia ? m : mandate(rep, "purchase", ACTS, { max_amount: USD("10.00") }), { actions: ACTS, limits: { max_amount: USD(amount) } });
    return s.transcript.map((o: any) => o.message?.payload ?? o.message).find((x: any) => x.type === "invitation_response"); };
  const r1 = try1("11.00"), r2 = try1("12.00"), r2b = try1("12.00");
  check(r1?.decision === "conditional" && r2?.decision === "conditional" && r2b?.decision === "conditional", "two distinct shapes beyond the mandate are conditional; repeating a counted shape doesn't count again");
  const r3 = try1("13.00");
  check(r3?.decision === "deny" && r3.disposition === "never" && !r3.reason_code && r3.retry?.kind === "never", "the 3rd distinct shape is itself answered as probing: deny / never, no code, retry never");
  const plain = try1("10.00");
  check(plain?.decision === "deny" && plain.disposition === "never", "the principal is now bound here: even a request inside the mandate gets never");
  const pia2 = visitor("Pia", "person", { purposes: ["purchase"], actions: ACTS }, { owner: pia.owner });
  const other = try1("10.00", pia2);
  check(other?.decision === "deny" && other.disposition === "never", "… also through a new representative of the same principal");
  const h2 = host(); const s = new Session(h2, pia); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("10.00") } });
  check(s.response()?.decision === "grant", "nothing is bound at any other place");
});

scenario("RC3-A1 the stated amount is what counts (C187)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ACTS, { max_amount: USD("10.00") });
  const s = new Session(h, dana); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("10.00") } }); const seat = s.response()?.seat;
  const act = (v: string) => s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { sku: "tin", amount: USD(v) } }))[0];
  check(act("7.00")?.type === "act_result", "an order stating 7.00 USD passes the gate");
  const r = act("4.00");
  check(r?.type === "act_decision" && r.reason_code === "SEAT_SCOPE_EXCEEDED", "7.00 counted as stated: a further 4.00 passes the 10.00 cap and is refused");
});

scenario("RC3-M1 mandate cross-checks: card_id, counterparties, non-spending max_amount; currency; scope (C188)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase", "visitation"], actions: ACTS });
  const req = (mm: any, request: any) => { const s = new Session(h, dana); s.ritual(null, mm, request); return s.response(); };
  const invalid = (r: any) => r?.decision === "deny" && r.disposition === "not_now" && r.reason_code === "MANDATE_INVALID";
  check(invalid(req(mandate(dana, "purchase", ["store.browse_catalog"], {}, { card_id: "card-someone-else" }), { actions: ["store.browse_catalog"] })), "a mandate for another card_id is MANDATE_INVALID");
  check(invalid(req(mandate(dana, "purchase", ["store.browse_catalog"], {}, { counterparties: ["did:web:another-shop.example"] } as any), { actions: ["store.browse_catalog"] })), "counterparties that don't include this place → MANDATE_INVALID");
  check(req(mandate(dana, "purchase", ["store.browse_catalog"], {}, { counterparties: [h.cfg.principal_id] } as any), { actions: ["store.browse_catalog"] })?.decision === "grant", "counterparties naming this place's principal are fine");
  check(invalid(req(mandate(dana, "visitation", ["store.browse_catalog"], { max_amount: USD("5.00") }), { actions: ["store.browse_catalog"] })), "a visitation (non-spending) mandate carrying max_amount → MANDATE_INVALID");
  const eur = req(mandate(dana, "purchase", ACTS, { max_amount: USD("10.00") }), { actions: ACTS, limits: { max_amount: { value: "10.00", currency: "EUR" } } });
  check(eur?.decision === "conditional" && JSON.stringify(eur.conditions).includes('"currency":"USD"'), "a request in EUR under a USD mandate is beyond it: conditional lower_limit to the mandate's max_amount");
  const g1 = req(mandate(dana, "purchase", ACTS, { max_amount: USD("5.00") }), { actions: ACTS, limits: { max_amount: USD("5.00"), max_amount_scope: "per_operation" } });
  check(g1?.decision === "grant" && g1.seat?.limits?.max_amount_scope !== "per_operation", "a per-seat mandate with a per_operation request: the seat is per seat");
  const g2 = req(mandate(dana, "purchase", ACTS, { max_amount: USD("5.00"), max_amount_scope: "per_operation" }), { actions: ACTS, limits: { max_amount: USD("5.00") } });
  const lim = g2?.seat?.limits;
  check(g2?.decision === "grant" && (lim?.max_amount_scope !== "per_operation" || lim?.session_max_amount?.value === "5.00"), "a per_operation mandate with a per-seat request: the seat's session cap is at most the request's max_amount");
});

scenario("RC3-C1 which answer for which act refusal (C189)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ["store.browse_catalog"], { max_operations: 1 });
  const s = new Session(h, dana); s.ritual(null, m, { actions: ["store.browse_catalog"], limits: { max_operations: 1 } }); const seat = s.response()?.seat;
  const act = (seat_id: string, tool = "store.browse_catalog", sess = s) => sess.send(sess.msg("act", { seat_id, tool, arguments: {} })).find((x) => x.type === "act_decision" || x.type === "act_result" || x.type === "invitation_response");
  const u = act("seat-unknown-1");
  check(u?.type === "act_decision" && u.disposition === "not_a_fit" && u.reason_code === "SEAT_SCOPE_EXCEEDED", "an unknown seat id → act_decision not_a_fit / SEAT_SCOPE_EXCEEDED");
  const o = act(seat.seat_id, "store.gift_wrap");
  check(o?.type === "act_decision" && o.disposition === "not_a_fit" && o.reason_code === "SEAT_SCOPE_EXCEEDED", "a tool outside the allowlist → not_a_fit / SEAT_SCOPE_EXCEEDED");
  check(act(seat.seat_id)?.type === "act_result", "the one allowed operation goes through");
  const used = act(seat.seat_id);
  check(used?.type === "act_decision" && used.disposition === "not_now" && used.reason_code === "SEAT_SCOPE_EXCEEDED", "operations used up → not_now / SEAT_SCOPE_EXCEEDED");
  const eve = visitor("Eve", "person", { purposes: ["purchase"], actions: ACTS }); const intruder = new Session(h, eve); intruder.enc = s.enc;
  const x = act(seat.seat_id, "store.browse_catalog", intruder);
  check(x?.type === "invitation_response" && x.decision === "deny" && x.reason_code === "RITUAL_ORDER", "an act in Dana's encounter from someone else gets the outsider deny (RITUAL_ORDER, an invitation_response)");
});

scenario("RC3-L1 the encounter lifecycle: after a grant or a deny, another request is RITUAL_ORDER; the seat lives on (C190)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ["store.browse_catalog"]);
  const s = new Session(h, dana); s.ritual(null, m, { actions: ["store.browse_catalog"] }); const seat = s.response()?.seat;
  const again = s.request(m, { actions: ["store.browse_catalog"] }).find((x) => x.type === "invitation_response");
  check(again?.decision === "deny" && again.disposition === "not_now" && again.reason_code === "RITUAL_ORDER" && again.retry?.kind === "after", "a second request after a grant → RITUAL_ORDER, retry after");
  check(s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.browse_catalog", arguments: {} }))[0]?.type === "act_result", "the earlier grant's seat still works");
  const d = new Session(h, dana); d.ritual(null, mandate(dana, "purchase", ["store.place_order"], { max_amount: USD("1.00") }), { actions: ["account.close"] });
  const first = d.response();
  const second = d.request(m, { actions: ["store.browse_catalog"] }).find((x) => x.type === "invitation_response");
  check(first?.decision === "deny" && second?.reason_code === "RITUAL_ORDER", `after a deny (${first?.decision}/${first?.reason_code ?? ""}), another request in the encounter → RITUAL_ORDER`);
  void types; void digestOf;
});

console.log(`${pass} v0.3.0-rc3 checks passed, ${fail} failed`);
if (fail) process.exit(1);
