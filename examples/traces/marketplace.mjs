// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Mossgate Commons (fictional): an agent with no card is turned away with the leaflet and not_now;
// the same agent returns prepared, introduces itself, and receives a pass to browse the stalls.
// SDK, in one process. Usage: (cd packages/shokai && npm run build) && node examples/traces/marketplace.mjs
import { createDoor, createRepresentative } from "../../packages/shokai/dist/src/index.js";
import { recorder } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const market = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "mossgate", displayName: "Mossgate Commons", category: "marketplace",
  about: "A marketplace with several areas. Looking at the listing is free. Browsing the stalls needs a signed card.",
  purposes: [{ code: "visitation", statement: "Browse the stalls." }],
  actions: [{ action: "stalls.browse", purposes: ["visitation"], level: "discover", data_asks: [] }],
});
const listing = market.listing();
check(listing.places?.length >= 1, "the listing is readable with no card");
out.steps.push({ who: "a plain agent", at: "Mossgate Commons", sent: "read the listing (no card)", got: "listing" });

const lobby = await market.post({ type: "greeting" });
const lobbyTypes = (lobby.envelope?.messages ?? lobby.messages ?? []).map((m) => m.payload?.type ?? m.type);
check(lobbyTypes.includes("lobby_briefing"), "an arrival with no card gets the leaflet, not silence");
check(lobbyTypes.includes("invitation_response") || lobbyTypes.includes("farewell"), "the door also answers not now, and does not leave the arrival hanging");
const deny = (lobby.envelope?.messages ?? lobby.messages ?? []).map((m) => m.payload ?? m).find((p) => p.type === "invitation_response");
check(!deny || deny.decision === "deny" || deny.disposition === "not_now", "the first arrival is not granted a pass");
out.steps.push({ who: "a plain agent (no card)", at: "Mossgate Commons", sent: "an unsigned greeting", got: lobbyTypes, decision: deny?.decision, disposition: deny?.disposition ?? deny?.reason_code });

const sam = createRepresentative({ ownerName: "Sam Okafor", purposes: ["visitation"], actions: ["stalls.browse"] });
const v = await sam.visit(market, { purpose: "visitation", actions: ["stalls.browse"], why: "browse the stalls", vouch: null });
check(v.seated, "the same agent, now prepared with a card, is granted a pass to browse the stalls");
check((await v.act("stalls.browse"))?.type === "act_result", "it browses the stalls within the pass");
await v.farewell();
out.steps.push({ who: "Sam's visiting representative", at: "Mossgate Commons", granted: v.seated, tools: v.seat?.tool_allowlist, acts: v.acts.map((a) => `${a.tool}: ${a.ok ? "ok" : "refused"}`) });
done(new URL("./marketplace.trace.json", import.meta.url), { place: "Mossgate Commons (fictional)", trace: { unprepared: lobbyTypes, prepared: flow(v) } });
