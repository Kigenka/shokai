// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Harborlight Bank (fictional): under a 50.00 USD mandate, a transfer with no amount is refused, 30.00 USD
// is sent, then a second visit under the same mandate is refused because 20.00 USD is left. SDK, in one process.
// Usage: (cd packages/shokai && npm run build) && node examples/traces/bank.mjs
import { createDoor, createRepresentative } from "../../packages/shokai/dist/src/index.js";
import { recorder, USD } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const bank = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "harborlight", displayName: "Harborlight Bank", category: "bank",
  about: "A community bank. A mandate's limit is counted across visits.",
  purposes: [
    { code: "account_servicing", statement: "Look at a balance, or send a transfer, within a signed limit." },
  ],
  actions: [
    { action: "balance.view", purposes: ["account_servicing"], level: "discover", data_asks: [] },
    { action: "transfer.send", purposes: ["account_servicing"], level: "act_on_behalf", data_asks: [] },
  ],
  spendingActions: ["transfer.send"],
});
const remy = createRepresentative({ ownerName: "Remy Calder", purposes: ["account_servicing"], actions: ["balance.view", "transfer.send"] });
const ask = { purpose: "account_servicing", actions: ["balance.view", "transfer.send"], limits: { max_amount: USD("50.00") }, why: "a rent transfer for Remy" };

const v1 = await remy.visit(bank, ask);
check(v1.seated, "visit 1: Remy's visiting representative was granted a pass, up to 50.00 USD");
check((await v1.act("balance.view"))?.type === "act_result", "it looks at the balance");
const missing = await v1.act("transfer.send", { to: "rent" });
check(missing?.type === "act_decision" && missing.decision === "deny" && missing.reason_code === "REQUEST_INCOMPLETE", "a transfer with no amount is refused as incomplete, not as silence");
const sent = await v1.act("transfer.send", { to: "rent", amount: USD("30.00") });
check(sent?.type === "act_result", "a 30.00 USD transfer goes through");
await v1.farewell();

const v2 = await remy.visit(bank, ask);
check(v2.seated, "visit 2: the same mandate is accepted again");
// The SDK visitor would also refuse this locally (it counted the first 30.00). Send it so the door's ledger is on the trace.
v2.checkSeatLocally = false;
v2.checkMandateLocally = false;
const again = await v2.act("transfer.send", { to: "rent", amount: USD("30.00") });
check(again?.type === "act_decision" && again.decision === "deny", "a second 30.00 USD transfer is refused: 20.00 USD of the mandate is left");
check(again?.reason_code === "SEAT_SCOPE_EXCEEDED" || /left|limit|cap|20/i.test(JSON.stringify(again ?? {})), "the refusal says the mandate's remaining limit would be passed");
await v2.farewell();
const report = v2.report();
check(/20\.00/.test(report.outcome_rendered?.text ?? "") || /50\.00/.test(report.outcome_rendered?.text ?? ""), "the report home counts across visits");
out.steps.push(
  { who: "Remy's visiting representative", at: "Harborlight Bank", visit: 1, granted: v1.seated, acts: v1.acts.map((a) => `${a.tool}${a.amount ? " " + a.amount.value + " " + a.amount.currency : " (no amount)"}: ${a.ok ? "ok" : "refused"}`) },
  { who: "Remy's visiting representative", at: "Harborlight Bank", visit: 2, granted: v2.seated, acts: v2.acts.map((a) => `${a.tool}${a.amount ? " " + a.amount.value + " " + a.amount.currency : ""}: ${a.ok ? "ok" : "refused"}`) },
);
out.report_home = (report.outcome_rendered?.text ?? "").replace(/key …\S+/g, "key …(this run's key)");
done(new URL("./bank.trace.json", import.meta.url), { place: "Harborlight Bank (fictional)", trace: { visit_1: flow(v1), visit_2: flow(v2) } });
