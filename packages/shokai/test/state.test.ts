// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.3.0-rc4): a door's durable state survives a restart (stateFile), and a door without one refuses mandates
// valid before it started (refuse-on-loss) (§3.6, C192). Fictional place and owner only.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDoor, createRepresentative, type Door, type Transport } from "../src/index.js";
import { newEd25519 } from "../src/core/crypto.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const keys = { rep: newEd25519(), principal: newEd25519() };
const shop = (stateFile?: string) => createDoor({ name: "kettle", displayName: "Kettle & Leaf", category: "store", keys, ...(stateFile ? { stateFile } : {}),
  purposes: [{ code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.list", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });
const direct = (d: Door): Transport => async (_u, body) => (await d.post(body)).envelope;
const ask = (d: Door) => ({ purpose: "purchase" as const, actions: ["menu.list", "order.place"], limits: { max_amount: USD("10.00") }, transport: direct(d) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("SDK durable door state (@kigenka/shokai)");
  const file = join(mkdtempSync(join(tmpdir(), "shokai-door-")), "kettle.state.json");
  const d1 = shop(file);
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.list", "order.place"] });
  const v1 = await aya.visit(d1.listing().places[0], ask(d1));
  check(v1.seated && (await v1.act("order.place", { tea: "sencha", amount: USD("6.00") }) as any)?.type === "act_result", "run 1: seated, a 6.00 USD order of a 10.00 USD mandate goes through");
  await v1.farewell();
  const saved = readFileSync(file, "utf8");
  check(saved.includes('"mandate_use"') && !/"d"\s*:|PRIVATE KEY|"priv"/.test(saved), "the state file holds the mandate ledger, and no keys");

  const d2 = shop(file);   // the place restarts, same keys, same state file
  const v2 = await aya.visit(d2.listing().places[0], ask(d2));
  check(v2.seated && v2.mandateReused, "run 2: the same mandate is presented and seated");
  const sneak = await v2.send(v2.message("act", { seat_id: v2.seat!.seat_id, tool: "order.place", arguments: { tea: "sencha", amount: USD("6.00") } }));
  check(sneak[0]?.type === "act_decision" && sneak[0].reason_code === "SEAT_SCOPE_EXCEEDED", "the restarted door still counts run 1's 6.00 USD: a second 6.00 USD order is refused (C175 across a restart)");
  await v2.farewell();

  await sleep(1100);
  const d3 = shop();       // the place restarts with its state lost (memory only)
  const v3 = await aya.visit(d3.listing().places[0], ask(d3));
  const r3 = v3.transcript.map((m: any) => m.message?.payload ?? m.message).find((x: any) => x?.type === "invitation_response");
  check(!v3.seated && r3?.reason_code === "MANDATE_INVALID", "a door without its state refuses the old mandate (refuse-on-loss) instead of counting it from zero");
  const v4 = await aya.visit(d3.listing().places[0], { ...ask(d3), mandate: { fresh: true } });
  check(v4.seated, "a new mandate the owner signs now is seated, counted from zero");

  console.log(`${pass} SDK state checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
