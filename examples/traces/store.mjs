// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Brightwick Outfitters (fictional): a visiting representative with a 100.00 USD mandate receives a
// pass for order.place, buys for 40.00 USD, then tries 80.00 USD more and is refused. SDK, in one process.
// Usage: (cd packages/shokai && npm run build) && node examples/traces/store.mjs
import { createDoor, createRepresentative } from "../../packages/shokai/dist/src/index.js";
import { recorder, USD } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const store = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "brightwick", displayName: "Brightwick Outfitters", category: "store",
  about: "Outdoor gear. A pass is never wider than the mandate the owner signed.",
  purposes: [{ code: "purchase", statement: "Buying gear, within a signed limit." }],
  actions: [{ action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"],
});
const quill = createRepresentative({ ownerName: "Quillfern", purposes: ["purchase"], actions: ["order.place"] });
const v = await quill.visit(store, { purpose: "purchase", actions: ["order.place"], limits: { max_amount: USD("100.00") }, why: "outdoor gear for the owner", vouch: null });
check(v.seated, "Quillfern's visiting representative was granted a pass for order.place, up to 100.00 USD");
check(v.seat.tool_allowlist.length === 1 && v.seat.tool_allowlist[0] === "order.place", "the pass is only order.place, never wider than the mandate");
const first = await v.act("order.place", { item: "trail pack", amount: USD("40.00") });
check(first?.type === "act_result", "the first order, 40.00 USD, goes through");
// The SDK visitor would also refuse this locally (it keeps the same count). Send it to the door so the trace shows the place's answer.
v.checkSeatLocally = false;
v.checkMandateLocally = false;
const second = await v.act("order.place", { item: "sleeping bag", amount: USD("80.00") });
check(second?.type === "act_decision" && second.decision === "deny", "the second order, 80.00 USD, is refused by the door: it would go past the 100.00 USD limit");
check(second?.reason_code === "SEAT_SCOPE_EXCEEDED" || /limit|cap|pass|seat|left/i.test(JSON.stringify(second ?? {})), "the refusal names a reason (on the wire the code is still a seat-scope code)");
await v.farewell();
out.steps.push({
  who: "Quillfern's visiting representative", at: "Brightwick Outfitters",
  granted: v.seated, tools: v.seat?.tool_allowlist,
  acts: v.acts.map((a) => `${a.tool} ${a.amount?.value ?? "?"} ${a.amount?.currency ?? ""}: ${a.ok ? "ok" : "refused"}`),
});
done(new URL("./store.trace.json", import.meta.url), { place: "Brightwick Outfitters (fictional)", trace: { visit: flow(v) }, refusal: { type: second?.type, decision: second?.decision, reason_code: second?.reason_code } });
