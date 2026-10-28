// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc2): a mandate's limits bind across visits (§5.1, C175 at the door, C176 at the representative), and the
// report home covers every visit and act under the mandate (§8.2, C176).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDoor, createRepresentative, fileLedger, generateRepresentativeKey, developmentPasskey, signCardRevocation, cardRevocationMessage, placeLabel, type Door, type Transport } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const shop = () => createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.list", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });
const direct = (d: Door): Transport => async (_u, body) => (await d.post(body)).envelope;
const ask = (d: Door) => ({ purpose: "purchase" as const, actions: ["menu.list", "order.place"], limits: { max_amount: USD("10.00") }, transport: direct(d) });

async function main() {
  console.log("SDK mandate ledger (@kigenka/shokai)");
  const door = shop(); const place = door.listing().places[0];
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.list", "order.place"] });

  const v1 = await aya.visit(place, ask(door));
  check(v1.seated && !v1.mandateReused, "visit 1: seated under a new mandate (10.00 USD)");
  check((await v1.act("order.place", { tea: "sencha", amount: USD("6.00") }) as any)?.type === "act_result", "visit 1: an order for 6.00 USD goes through");
  await v1.farewell(); const r1 = v1.report();

  const v2 = await aya.visit(place, ask(door));
  check(v2.seated && v2.mandateReused && v2.mandateSent?.payload.mandate_id === v1.mandateSent?.payload.mandate_id,
    "visit 2 with the same errand presents the mandate it already holds, so its count continues (§5.1)");
  const local: any = await v2.act("order.place", { tea: "sencha", amount: USD("6.00") });
  check(local?.refused_by === "representative" && /4\.00 USD left/.test(local.why) && !v2.transcript.some((m) => (m.message?.payload ?? m.message)?.type === "act"),
    "visit 2: the representative doesn't send a 6.00 USD order when 4.00 USD is left of the mandate (C176)");
  const sneak = await v2.send(v2.message("act", { seat_id: v2.seat!.seat_id, tool: "order.place", arguments: { tea: "sencha", amount: USD("6.00") } }));
  check(sneak[0]?.type === "act_decision" && sneak[0].reason_code === "SEAT_SCOPE_EXCEEDED",
    "the door refuses the same act sent anyway: the mandate's cap binds across seats (C175), though the new seat has spent nothing");
  check((await v2.act("order.place", { tea: "tin", amount: USD("4.00") }) as any)?.type === "act_result", "what's left (4.00 USD) can still be spent");
  await v2.farewell(); const r2 = v2.report("en-US", { timeZone: "America/Los_Angeles" });
  const um = r2.under_mandate!;
  check(!!um && um.visits.length === 2 && um.acts_done === 2 && um.spent[0]?.value === "10.00" && um.remaining?.amount?.value === "0.00",
    "visit 2's report covers both visits under the mandate: 2 actions done, 10.00 USD spent, 0.00 left (§8.2, C176)");
  check(um.visits[0].encounter_id === v1.encounterId && (um.visits[0].reported_in ?? []).includes(r1.report_id), "the earlier visit is listed with the report that already covered it");
  check(/visit 2 under the mandate/.test(r2.outcome_rendered.text) && /Earlier: here, 1 action done, 6\.00 USD spent/.test(r2.outcome_rendered.text)
    && /spent 10\.00 USD of the 10\.00 USD allowed, 0\.00 USD left/.test(r2.outcome_rendered.text), "the owner-readable text names the earlier visit and the mandate's totals");

  const v3 = await aya.visit(place, { ...ask(door), mandate: { fresh: true } });
  check(v3.seated && !v3.mandateReused && v3.mandateSent?.payload.mandate_id !== v1.mandateSent?.payload.mandate_id && !v3.report().under_mandate?.visits.slice(0, -1).length,
    "mandate: { fresh: true } has a new mandate signed: a separate allowance with its own ledger");

  // A ledger that outlives the process: the same owner and representative, later, continue the mandate's count.
  const path = join(mkdtempSync(join(tmpdir(), "shokai-ledger-")), "ledger.json");
  const owner = developmentPasskey(); const key = generateRepresentativeKey();
  const run1 = createRepresentative({ ownerName: "Aya Linden", owner, key, purposes: ["purchase"], actions: ["menu.list", "order.place"], ledger: fileLedger(path) });
  const d2 = shop(); const p2 = d2.listing().places[0];
  const a = await run1.visit(p2, ask(d2)); await a.act("order.place", { tea: "sencha", amount: USD("6.00") }); await a.farewell(); a.report();
  const run2 = createRepresentative({ ownerName: "Aya Linden", owner, key, card: run1.card, purposes: ["purchase"], actions: ["menu.list", "order.place"], ledger: fileLedger(path) });
  const b = await run2.visit(p2, ask(d2)); const again: any = await b.act("order.place", { tea: "sencha", amount: USD("6.00") });
  check(b.mandateReused && again?.refused_by === "representative" && b.report().under_mandate?.visits.length === 2, "with fileLedger, a later run continues the same mandate: the second 6.00 USD order isn't sent, and its report covers run 1's visit");
  check(!/"d"\s*:|private|secret/i.test(readFileSync(path, "utf8")), "the ledger file holds mandates and acts, no keys");


  // v0.3.0-rc4 (§5.1, journey J3): an amount on a NON-spending action (a quote) is not money spent.
  { const d = shop(); const pl = d.listing().places[0]; const tomas = createRepresentative({ ownerName: "Tomas Reyna", purposes: ["purchase"], actions: ["menu.list", "order.place"] });
    const v = await tomas.visit(pl, ask(d));
    check(pl.actions.find((a) => a.action === "menu.list")?.spends === false, "the listing marks menu.list spends: false");
    check((await v.act("menu.list", { amount: USD("6.00") }) as any)?.type === "act_result", "a non-spending act that names an amount (a quote) goes through");
    const e = v.ledgerEntry!;
    check(!e.visits[0].acts[0].amount && v.beyondMandate("order.place", { amount: USD("10.00") }) === null,
      "… and the representative's ledger doesn't count it: the whole 10.00 USD is still free for a spending act (only spending actions move money, §5.1)");
    check(v.spendOf("order.place", { amount: USD("6.00") })?.value === "6.00" && v.spendOf("gift.wrap", { amount: USD("1.00") })?.value === "1.00",
      "an amount on a spending action, or on an action the listing doesn't describe, still counts (fail safe)");
    await v.farewell(); check(/[Ss]pent nothing/.test(JSON.stringify(v.report())), "the report says nothing was spent"); }

  // v0.3.0-rc4 (§2.6, C198): revoking a card ends every open seat it holds.
  { const d = shop(); const pl = d.listing().places[0]; const owner = developmentPasskey();
    const a = createRepresentative({ ownerName: "Theo Marchetti", owner, purposes: ["purchase"], actions: ["menu.list", "order.place"] });
    const va = await a.visit(pl, ask(d));
    check((await va.act("menu.list", {}) as any)?.type === "act_result", "representative A is seated and acts");
    const b = createRepresentative({ ownerName: "Theo Marchetti", owner, purposes: ["purchase"], actions: ["menu.list", "order.place"] });
    const vb = await b.visit(pl, ask(d));
    await vb.send(vb.message("card_revocation", cardRevocationMessage(signCardRevocation(owner, a.card, { reason: "superseded" }))));
    const after: any = await va.act("menu.list", {});
    check(after?.type === "act_decision" && after.decision === "deny" && after.disposition === "not_now" && !after.reason_code,
      "after the owner's revocation (delivered by the new representative B), A's still-open seat is ended: its next act is refused");
    check((await vb.act("menu.list", {}) as any)?.type === "act_result", "B's own seat, under the owner's new card, keeps working"); }

  // v0.3.0-rc4 (§8.2, C104; trickster Petra Vosk): a report names a place by its verified identifier, its display name only as a claim.
  check(/^the place with key …\S{8} \(claims to be "Harborlight Bank"; not verified\)$/.test(placeLabel("did:key:z6MkuKJnH2riowVqC9jzYgWx6D9euixzZhxJn456xHo6NPQ6", "Harborlight Bank", true)),
    "a did:key place is named by its key; 'Harborlight Bank' is reported as its own unverified claim");
  check(placeLabel("did:web:bank.example", "Harborlight Bank", true).startsWith("bank.example (claims to be"), "a did:web place is named by its domain");
  check(placeLabel("did:web:bank.example", "Harborlight Bank", false) === 'a place that claims to be "Harborlight Bank" (not verified)', "a place whose card didn't check out is never named as if verified");
  console.log(`${pass} SDK mandate checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
