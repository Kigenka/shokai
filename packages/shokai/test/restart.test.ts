// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc4): a door restarts mid-visit, and its files are rolled back a few minutes. The visitor gets a clear
// "interrupted, knock again"; ids never repeat; a revoked card stays revoked; after a rollback the owner's side re-delivers its
// revocations (§2.2 msg_id uniqueness, §3.6 what a place keeps, §7.2, C198). Fictional place and owners only.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDoor, createRepresentative, developmentPasskey, signCardRevocation, cardRevocationMessage, visitReport, SHOKAI_PLACE_UNREACHABLE, type Door, type Transport } from "../src/index.js";
import { newEd25519 } from "../src/core/crypto.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const keys = { rep: newEd25519(), principal: newEd25519() };
const shop = (stateFile: string) => createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store", keys, stateFile,
  purposes: [{ code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.list", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });
let current: Door;   // the door "process" that is up right now
const wire: Transport = async (_u, body) => (await current.post(body)).envelope;
const ask = { purpose: "purchase" as const, actions: ["menu.list", "order.place"], limits: { max_amount: USD("20.00") }, transport: wire };
const doorIds = (...vs: { transcript: any[] }[]) => vs.flatMap((v) => v.transcript.filter((m) => m.dir === "in").map((m) => (m.message?.payload ?? m.message)?.msg_id));
const refOf = (r: any) => r?.result?.reference as string | undefined;

async function main() {
  console.log("SDK restart and rollback (@kigenka/shokai)");
  const dir = mkdtempSync(join(tmpdir(), "shokai-restart-")); const file = join(dir, "kettle.state.json"); const snapshot = join(dir, "snapshot.json");
  current = shop(file);
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.list", "order.place"] });
  const bobOwner = developmentPasskey();
  const bob = createRepresentative({ ownerName: "Bo Brennan", owner: bobOwner, purposes: ["purchase"], actions: ["menu.list", "order.place"] });
  const v1 = await aya.visit(current.listing().places[0], ask);
  const o1 = await v1.act("order.place", { tea: "sencha", amount: USD("6.00") });
  check(v1.seated && (o1 as any)?.type === "act_result", "run 1: Aya's representative is seated and orders (6.00 of 20.00 USD)");
  const vb = await bob.visit(current.listing().places[0], ask);
  copyFileSync(file, snapshot);                                   // the files as they were a few minutes before the rollback
  await vb.send(vb.message("card_revocation", cardRevocationMessage(signCardRevocation(bobOwner, bob.card, { reason: "withdrawn" }))));
  check(vb.seated && ((await vb.act("menu.list")) as any)?.decision === "deny", "Bo's owner withdraws Bo's card mid-visit: the open seat ends (C198)");

  // the place goes down mid-visit
  const down: Transport = async () => { throw new Error("connect ECONNREFUSED"); };
  (v1 as any).transport = down;
  let err: any = null; try { await v1.act("menu.list"); } catch (e) { err = e; }
  check(err?.code === SHOKAI_PLACE_UNREACHABLE && /didn't answer/.test(err.message) && v1.interrupted === "unreachable", "while the place is down: a clear error (SHOKAI_PLACE_UNREACHABLE), and the visit is marked interrupted");
  (v1 as any).transport = wire;

  // it restarts from its state file (same keys)
  current = shop(file);
  const gone = await v1.act("menu.list") as any;
  check(gone?.type === "act_decision" && gone.disposition === "not_a_fit" && gone.reason_code === "SEAT_SCOPE_EXCEEDED" && /knock again/i.test(gone.courtesy?.text ?? ""),
    "after the restart, the old seat gets not_a_fit / SEAT_SCOPE_EXCEEDED (§3.6, §7.2) with plain words: \"" + (gone?.courtesy?.text ?? "") + "\"");
  check(v1.interrupted === "seat_gone" && /interrupted/.test(visitReport(v1).voice?.text ?? ""), "the visitor marks the visit interrupted, and its report home says so");
  const v2 = await aya.visit(current.listing().places[0], ask);
  const o2 = await v2.act("order.place", { tea: "sencha", amount: USD("6.00") });
  const ids = doorIds(v1, v2);
  check(v2.seated && (o2 as any)?.type === "act_result" && new Set(ids).size === ids.length, `Aya knocks again: seated, the visit completes, and no door msg_id repeats (${ids.length} ids)`);
  check(!!refOf(o1) && !!refOf(o2) && refOf(o1) !== refOf(o2) && v1.encounterId !== v2.encounterId && v1.seat!.seat_id !== v2.seat!.seat_id, `order references, encounters and seats differ (${refOf(o1)} vs ${refOf(o2)})`);
  const extra = await v2.act("order.place", { tea: "sencha", amount: USD("9.00") }) as any;
  check(extra?.type === "act_decision", "the mandate's ledger survived: 6 + 6 spent, a 9.00 USD order would pass 20.00 and is refused");
  await v2.farewell();
  const vb2 = await bob.visit(current.listing().places[0], ask);
  check(!vb2.seated, "Bo's revoked card stays revoked after the restart (the revocation is durable state)");

  // the files are rolled back a few minutes, to before the revocation
  current = shop(snapshot);
  const vb3 = await bob.visit(current.listing().places[0], ask);
  check(vb3.seated, "after a file rollback to before the revocation, the door has forgotten it: Bo's card is seated again (why the owner's side must re-check on wake)");
  await vb3.send(vb3.message("card_revocation", cardRevocationMessage(signCardRevocation(bobOwner, bob.card, { reason: "withdrawn" }))));
  check(((await vb3.act("menu.list")) as any)?.decision === "deny" && !(await bob.visit(current.listing().places[0], ask)).seated, "re-delivering the signed revocation on wake ends the seat again and keeps the card refused");
  const v3 = await aya.visit(current.listing().places[0], ask);
  const ids3 = doorIds(v1, v2, v3);
  check(v3.seated && new Set(ids3).size === ids3.length, "and even after the rollback, no door msg_id repeats (a random per-start tag)");
  await v3.farewell();
  console.log(`${pass} SDK restart checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
