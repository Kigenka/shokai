// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Willowfold Tea House (fictional): a visiting representative introduces itself, receives a pass,
// looks at the menu, orders a Spring Sencha for 6.00 USD within a 10.00 USD mandate, and collects a stamp.
// SDK, in one process, no network, keys made for the run. Usage: (cd packages/shokai && npm run build) && node examples/traces/tea-shop.mjs
import { createDoor, createRepresentative } from "../../packages/shokai/dist/src/index.js";
import { recorder, USD } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const shop = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "willowfold", displayName: "Willowfold Tea House", category: "store",
  about: "A small tea house. Looking is free. Buying needs a signed mandate.",
  purposes: [{ code: "purchase", statement: "Ordering tea, within a signed limit." }],
  actions: [
    { action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
    { action: "stamp.collect", purposes: ["purchase"], level: "discover", data_asks: [] },
  ],
  spendingActions: ["order.place"],
});
const listing = shop.listing();
check(listing.places?.some((p) => p.name === "willowfold" && p.display_name === "Willowfold Tea House"), "the listing is readable with no card (looking is free)");
out.steps.push({ who: "Aya's visiting representative", at: "Willowfold Tea House", sent: "read the listing (no card)", got: "listing" });

const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place", "stamp.collect"] });
const v = await aya.visit(shop, { purpose: "purchase", actions: ["menu.view", "order.place", "stamp.collect"], limits: { max_amount: USD("10.00") }, why: "a green tea for Aya", vouch: null });
check(v.seated && v.placeCheck.ok, "Aya's visiting representative checked the host card and was granted a pass");
check((await v.act("menu.view"))?.type === "act_result", "it looks at the menu within the pass");
const order = await v.act("order.place", { tea: "Spring Sencha", amount: USD("6.00") });
check(order?.type === "act_result", "it orders a Spring Sencha for 6.00 USD, within the 10.00 USD limit");
check((await v.act("stamp.collect"))?.type === "act_result", "it collects a stamp within the pass");
await v.farewell();
const report = v.report();
check(!!report.outcome_rendered?.text && /pass|admitted/i.test(report.outcome_rendered.text), "it writes a report home for Aya");
out.steps.push({
  who: "Aya's visiting representative", at: "Willowfold Tea House",
  granted: v.seated, tools: v.seat?.tool_allowlist, acts: v.acts.map((a) => `${a.tool}${a.amount ? " " + a.amount.value + " " + a.amount.currency : ""}: ${a.ok ? "ok" : "refused"}`),
});
out.report_home = (report.outcome_rendered?.text ?? "").replace(/key …\S+/g, "key …(this run's key)");
done(new URL("./tea-shop.trace.json", import.meta.url), { place: "Willowfold Tea House (fictional)", trace: { visit: flow(v) } });
