// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// R8-01: an over-limit hold reserves its amount; intervening in-limit spend can't push a release past the owner-signed ceiling.
// Also covers decline and expiry releasing that reservation. In process; fictional people only.
import { createDoor, createRepresentative, PROTOCOL, type DoorOptions } from "../src/index.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const SUMMARY: S.HouseSummary = { name: "kettle", display_name: "Kettle & Leaf", purpose: { statement: "Buying tea.", locale: "en-US" },
  conduct_rules: [{ code: "no_payment_credentials", text: "Never send card numbers here.", locale: "en-US" }], spec_ref: { version: "0.5.0" } as S.SpecRef };
const kettle = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], approvedBy: { name: "Suzu", role: "Owner" }, purchaseHoldSeconds: 120,
  policy: { limit_calls: true, summary: SUMMARY, conduct_rules: SUMMARY.conduct_rules } as any, ...o });
const ACTS = ["tea.browse", "tea.order"];
const ikey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");

async function main() {
  console.log("R8-01 over-limit ceiling");

  // ---- approval path: intervening in-limit spend is refused; release stays at the signed ceiling
  {
    const shop = createDoor(kettle());
    const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    check(v.seated, "seated under a USD 30 mandate");
    const a20 = await v.act("tea.order", { amount: USD("20.00"), payment_ref: "r-20" }) as any;
    check(a20?.ok === true, "USD 20 spent within the limit");

    // Hold 40 over the limit without confirming yet.
    const holdOut = await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "r-40" },
      hold_for_owner: true, idempotency_key: ikey() }));
    const held = holdOut.find((x: any) => x.type === "act_held") as S.ActHeld | undefined;
    check(!!held?.over_limit && held.over_limit.limit.value === "30.00" && held.over_limit.current.value === "20.00" && held.over_limit.proposed.value === "60.00",
      "over-limit hold: limit 30, current 20, proposed 60");

    // Intervening in-limit purchase (the R8-01 attack): must be refused; the hold stays.
    const mid = await v.act("tea.order", { amount: USD("10.00"), payment_ref: "r-10" }) as any;
    check(mid?.type === "act_decision" && mid.decision === "deny" && mid.reason_code === "SEAT_SCOPE_EXCEEDED",
      "intervening USD 10 during the over-limit hold is refused (amount reserved)");
    check(!shop.host.holds.get(held!.hold_id)?.done, "… and the over-limit hold is still open");

    // Browse (non-spending) still goes on.
    const br = await v.act("tea.browse", {}) as any;
    check(br?.ok === true, "non-spending acts go on while the over-limit hold is open");

    // Owner-signed raise releases at the signed ceiling (60), never 70.
    const raised = aya.supersedingMandate(m, held as any, "Kettle & Leaf: one purchase of USD 40.00 (USD 60.00 in all), approve.");
    const conf = await v.send(v.message("act_confirmation", { seat_id: v.seat!.seat_id, hold_id: held!.hold_id, mandate: raised, idempotency_key: ikey() }));
    const rel = conf.find((x: any) => x.type === "act_result");
    check(rel?.ok === true, "owner-approved release succeeds at the signed ceiling");
    const seat = [...shop.host.seats.values()].find((s) => s.seat.seat_id === v.seat!.seat_id)!;
    // Money units are fixed-point (six fractional digits in the reference): "60.00" → 60_000_000.
    check(seat.spent === 60_000_000n, `after release seat spent is exactly 60.00 units (got ${seat.spent}), never 70.00`);
  }

  // ---- decline releases the reservation so later in-limit spend works again
  {
    const shop = createDoor(kettle());
    const aya = createRepresentative({ ownerName: "Noor Achterberg", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    await v.act("tea.order", { amount: USD("20.00"), payment_ref: "d-20" });
    const holdOut = await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "d-40" },
      hold_for_owner: true, idempotency_key: ikey() }));
    const held = holdOut.find((x: any) => x.type === "act_held") as S.ActHeld;
    const { sign } = await import("../src/index.js");
    const decline = sign<S.OwnerConsent>({ consent_id: "oc-decline", owner_id: aya.owner.id, representative_id: aya.id, action: "approve_purchase", decision: "decline",
      subject_ref: { kind: "act", id: held.hold_id, digest: held.act_digest }, assurance: "passkey", expires_at: held.expires_at,
      issued_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), shown_to_owner: { text: "Decline.", locale: "en-US" } }, aya.owner);
    const dec = await v.send(v.message("act_confirmation", { seat_id: v.seat!.seat_id, hold_id: held.hold_id, consent: decline, idempotency_key: ikey() }));
    check(dec.some((x: any) => x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"), "owner decline lapses the over-limit hold");
    const again = await v.act("tea.order", { amount: USD("10.00"), payment_ref: "d-10" }) as any;
    check(again?.ok === true, "after decline the reservation is gone: USD 10 fits under the remaining 10 of the 30 limit");
  }

  // ---- expiry releases the reservation (1 s hold, wait well past it; no grace)
  {
    const shop = createDoor(kettle({ purchaseHoldSeconds: 1, policy: { limit_calls: true, hold_grace_s: 0, summary: SUMMARY, conduct_rules: SUMMARY.conduct_rules } as any }));
    const aya = createRepresentative({ ownerName: "Tomas Reed", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    await v.act("tea.order", { amount: USD("20.00"), payment_ref: "e-20" });
    const holdOut = await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "e-40" },
      hold_for_owner: true, idempotency_key: ikey() }));
    const held = holdOut.find((x: any) => x.type === "act_held") as S.ActHeld;
    check(!!held?.over_limit && shop.host.cfg.policy.purchase_hold_s === 1, "short-lived over-limit hold made (1 s)");
    // Advance the door's clock past expires_at + grace without depending on wall time under load.
    const past = new Date(Date.parse(held.expires_at) + 2000).toISOString().replace(/\.\d+Z$/, "Z");
    const prev = shop.host.clock; shop.host.clock = () => past;
    const raised = aya.supersedingMandate(m, held as any, "too late");
    const late = await v.send(v.message("act_confirmation", { seat_id: v.seat!.seat_id, hold_id: held.hold_id, mandate: raised, idempotency_key: ikey() }));
    shop.host.clock = prev;
    check(late.some((x: any) => x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"), "confirmation after expiry is HOLD_LAPSED");
    const again = await v.act("tea.order", { amount: USD("10.00"), payment_ref: "e-10" }) as any;
    check(again?.ok === true, "after expiry the reservation is gone: USD 10 fits again");
  }

  // ---- order: release then a later act sees the raised total (no double-count)
  {
    const shop = createDoor(kettle());
    const aya = createRepresentative({ ownerName: "Lena Moss", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    const r = await v.actWithOwner("tea.order", { amount: USD("40.00"), payment_ref: "o-40" }, async () => null, {
      raiseLimit: async (_req, held) => aya.supersedingMandate(m, held as any, "one purchase of 40"),
    }) as any;
    check(r?.ok === true, "clean over-limit raise from empty seat releases");
    const seat = [...shop.host.seats.values()].find((s) => s.seat.seat_id === v.seat!.seat_id)!;
    check(seat.spent === 40_000_000n, `released amount counted once as 40.00 (got ${seat.spent})`);
    const later = await v.act("tea.order", { amount: USD("1.00"), payment_ref: "o-1" }) as any;
    check(later?.type === "act_decision" && later.decision === "deny", "after release the seat is above its signed 30 limit: later spend refused");
  }


  // ---- R9-01: a superseding mandate must not seat a parallel encounter
  {
    const shop = createDoor(kettle());
    const aya = createRepresentative({ ownerName: "Kai Okada", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    const held = await (async () => {
      const out = await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "p-40" },
        hold_for_owner: true, idempotency_key: ikey() }));
      return out.find((x: any) => x.type === "act_held") as S.ActHeld;
    })();
    check(!!held?.over_limit, "R9-01 setup: over-limit hold open");
    const raised = aya.supersedingMandate(m, held as any, "one purchase only");
    const pin = (v: any, label: string) => {
      const retry = v.response?.retry;
      check(!v.seated && v.response?.reason_code === "MANDATE_INVALID" && v.response?.disposition === "not_now"
        && retry?.kind === "with_credential" && JSON.stringify(retry?.credentials) === JSON.stringify(["signed_mandate"]),
        `${label} (seated=${v.seated}, code=${v.response?.reason_code}, disp=${v.response?.disposition}, retry=${JSON.stringify(retry)})`);
    };
    const parallel = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("60.00") }, useMandate: raised });
    pin(parallel, "R9-01 / R9b-04: fresh invitation (after card presentation) refuses superseding mandate as MANDATE_INVALID / not_now / with_credential [signed_mandate]");
    const retried = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("60.00") }, useMandate: raised });
    pin(retried, "R9b-03: with_credential [signed_mandate] retry visit also refuses the superseding mandate");
  }

  // ---- R9b-03: customer-link seating path also hits the supersedes guard
  {
    const shop = createDoor(kettle({
      actions: [
        { action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" },
        { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") }, requires_customer_link: true },
      ],
    }));
    const aya = createRepresentative({ ownerName: "Mina Calder", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const until = new Date(Date.now() + 60_000).toISOString().replace(/\.\d+Z$/, "Z");
    const raised = aya.supersedingMandate(m, {
      hold_id: "hold-placeholder", act_digest: "sha-256:" + "A".repeat(43), expires_at: until,
      over_limit: { proposed: USD("60.00") },
    } as any, "one purchase only");
    const parallel = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("60.00") }, useMandate: raised });
    check(!parallel.seated && parallel.response?.reason_code === "MANDATE_INVALID" && parallel.response?.disposition === "not_now"
      && parallel.response?.retry?.kind === "with_credential" && JSON.stringify(parallel.response?.retry?.credentials) === JSON.stringify(["signed_mandate"]),
      `R9b-03 customer-link path: superseding mandate is MANDATE_INVALID / not_now / [signed_mandate], not a customer-link retry (code=${parallel.response?.reason_code}, retry=${JSON.stringify(parallel.response?.retry)})`);
  }

  // ---- dual totals: seat and mandate figures on over_limit / LimitRequest
  {
    const shop = createDoor(kettle());
    const aya = createRepresentative({ ownerName: "Ren Okada", purposes: ["purchase", "visitation"], actions: ACTS, ownerPrompts: "purchase_only" });
    // Visit 1 under a USD 100 mandate: spend 40, farewell (mandate ledger keeps 40).
    const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("100.00") } });
    const v1 = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("50.00") }, useMandate: m });
    check(v1.seated, "dual: seated visit 1 under mandate 100 / seat 50");
    const s40 = await v1.act("tea.order", { amount: USD("40.00"), payment_ref: "dual-40" }) as any;
    check(s40?.ok === true, "dual: spent 40 in visit 1");
    await v1.farewell();
    // Visit 2: same mandate, seat cap 50; spend 10 then hold 45 over the seat limit.
    const v2 = await aya.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("50.00") }, useMandate: m });
    check(v2.seated && v2.mandateReused, "dual: visit 2 reuses the mandate");
    await v2.act("tea.order", { amount: USD("10.00"), payment_ref: "dual-10" });
    const holdOut = await v2.send(v2.message("act", { seat_id: v2.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("45.00"), payment_ref: "dual-45" },
      hold_for_owner: true, idempotency_key: ikey() }));
    const held = holdOut.find((x: any) => x.type === "act_held") as S.ActHeld | undefined;
    const ol = held?.over_limit;
    check(!!ol && ol.limit.value === "50.00" && ol.current.value === "10.00" && ol.proposed.value === "55.00",
      `dual: binding figures seat-capped (limit 50, current 10, proposed 55); got ${JSON.stringify(ol && { limit: ol.limit, current: ol.current, proposed: ol.proposed })}`);
    check(!!ol?.seat && ol.seat.limit.value === "50.00" && ol.seat.current.value === "10.00",
      `dual: seat totals present (got ${JSON.stringify(ol?.seat)})`);
    check(!!ol?.mandate && ol.mandate.limit.value === "100.00" && ol.mandate.current.value === "50.00",
      `dual: mandate totals include visit-1 spend (limit 100, current 50 = 40+10); got ${JSON.stringify(ol?.mandate)}`);
    const { limitRequestProblem } = await import("../src/index.js");
    const { limitRequestOf, limitRequestClosed } = await import("../src/core/v050.js");
    const req = limitRequestOf("kettle.example", held as any);
    check(limitRequestClosed(req), "dual: LimitRequest closed shape includes seat and mandate");
    const bad = limitRequestProblem(req, { mandate: m, seatLimit: USD("50.00"), current: v2.ledgerCurrent("USD", true), mandateCurrent: v2.ledgerCurrent("USD", false), actAmount: USD("45.00"), heldAmount: held!.amount });
    check(bad === null, `dual: representative accepts matching dual figures (got ${bad})`);
    const missing = limitRequestProblem(req, { mandate: m, seatLimit: USD("50.00"), current: v2.ledgerCurrent("USD", true), actAmount: USD("45.00"), heldAmount: held!.amount });
    check(typeof missing === "string" && /mandate current/i.test(missing ?? ""), `R10-M2: omitting mandateCurrent is an error when req.mandate is present (got ${missing})`);
    const raised = aya.supersedingMandate(m, held as any, "Kettle: one purchase of USD 45 (USD 55 against the seat, mandate already at 50).");
    const conf = await v2.send(v2.message("act_confirmation", { seat_id: v2.seat!.seat_id, hold_id: held!.hold_id, mandate: raised, idempotency_key: ikey() }));
    check(conf.some((x: any) => x.type === "act_result" && x.ok === true), "R9b-02: cross-visit release succeeds (mandate ledger 95 is within its shown ceiling of 50+45)");
    const seat = [...shop.host.seats.values()].find((s) => s.seat.seat_id === v2.seat!.seat_id)!;
    check(seat.spent === 55_000_000n, `R9b-02: after release seat spent is exactly 55.00 (got ${seat.spent})`);
  }

  console.log(`r8-overlimit-ceiling: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

