// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// One representative, two cards, in one process with the 0.5 SDK (no network, keys made for this run):
// one owner (Kiran), one representative key (Noor) holding two cards: "host of Kiran's meeting room" (the door's card) and
// "Kiran's representative" (going out). Then the owner revokes the going-out card and Noor's open pass at the tea shop ends (C198),
// while the room stays open. Usage: (cd packages/shokai && npm run build) && node examples/traces/dual-role.mjs
import { createDoor, createRepresentative, signCardRevocation, cardRevocationMessage } from "../../packages/shokai/dist/src/index.js";
import { recorder, USD, core } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const kiran = core.ed25519FromLabel("dual-role-kiran");
const noor = core.ed25519FromLabel("dual-role-noor");

const room = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "kiran-room", displayName: "Kiran's meeting room", category: "gathering",
  about: "A small meeting room. Noor keeps the door.", keys: { rep: noor, principal: kiran },
  purposes: [{ code: "visitation", statement: "Drop in, look around, leave a note." }],
  actions: [{ action: "room.look", purposes: ["visitation"], level: "discover", data_asks: [] },
            { action: "room.post", purposes: ["visitation"], level: "act_on_behalf", data_asks: [] }],
});
const shop = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "tea-shop", displayName: "A tea shop", category: "store",
  purposes: [{ code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"],
});
const noorOut = createRepresentative({ ownerName: "Kiran", owner: kiran, key: noor, purposes: ["purchase", "visitation"], actions: ["menu.view", "order.place"] });

const lobby = await room.post({ type: "greeting" });
const lobbyTypes = (lobby.envelope?.messages ?? []).map((m) => m.payload?.type);
out.steps.push({ who: "Fen's agent (no card)", at: "room", sent: "an unsigned greeting", got: lobbyTypes });
check(lobbyTypes.includes("lobby_briefing"), "an unprepared arrival at the room gets the leaflet (lobby_briefing), not silence");

const maru = createRepresentative({ ownerName: "Maru Ostrander", purposes: ["visitation"], actions: ["room.look", "room.post"] });
const vm = await maru.visit(room, { purpose: "visitation", actions: ["room.look", "room.post"], why: "to leave a note for Kiran" });
check(vm.seated && vm.placeCheck.ok, "Maru's representative checked the room's card (signed by Kiran's key, naming Noor) and was granted a pass");
const posted = await vm.act("room.post", { text: "Hello from Maru" });
check(posted?.type === "act_result", "Maru's representative posts in the room within its pass");
await vm.farewell();
out.steps.push({ who: "Maru's representative", at: "room", granted: vm.seated, placeSigner: "Kiran's key", repKey: "Noor's key", acts: vm.acts.map((a) => a.tool) });

const ve = await noorOut.visit(shop, { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("15.00") }, why: "a green tea for Kiran" });
check(ve.seated, "Noor, with card 2, is granted a pass at the tea shop");
const presented = ve.transcript.filter((m) => m.dir === "out").map((m) => m.message?.payload ?? m.message).find((p) => p?.type === "card_presentation");
const cardOut = presented?.card?.payload ?? presented?.card;
check(cardOut?.card_id === noorOut.card.payload.card_id, "the tea shop sees card 2 only (the going-out card)");
check(noorOut.card.payload.representative_id === room.repId || noorOut.card.payload.representative?.id === room.repId || noorOut.id === room.repId, "both cards name the same representative key (Noor)");
check((await ve.act("menu.view"))?.type === "act_result", "Noor looks at the menu");
const order = await ve.act("order.place", { tea: "sencha", amount: USD("12.00") });
check(order?.type === "act_result", "Noor orders a 12.00 USD sencha, within the 15.00 USD limit");
out.steps.push({ who: "Noor (card 2)", at: "tea shop", granted: ve.seated, acts: ve.acts.map((a) => `${a.tool}${a.amount ? " " + a.amount.value + " " + a.amount.currency : ""}: ${a.ok ? "ok" : "refused"}`) });

const noorOut2 = createRepresentative({ ownerName: "Kiran", owner: kiran, key: noor, purposes: ["purchase", "visitation"], actions: ["menu.view", "order.place"] });
const vd = await noorOut2.visit(shop, { purpose: "visitation", actions: ["menu.view"], why: "delivering Kiran's withdrawal of the old card" });
await vd.send(vd.message("card_revocation", cardRevocationMessage(signCardRevocation(kiran, noorOut.card, { reason: "superseded" }))));
const after = await ve.act("menu.view");
check(after?.type === "act_decision" && after.decision === "deny", "after Kiran revokes card 2, Noor's open pass under it is ended");
out.steps.push({ who: "Kiran", at: "tea shop", sent: "card_revocation of card 2", effect: `old pass's next act: ${after?.type}/${after?.decision}` });

const maru2 = await maru.visit(room, { purpose: "visitation", actions: ["room.look"], why: "checking back" });
check(maru2.seated, "the meeting room, under card 1, still grants a pass");
out.steps.push({ who: "Maru's representative", at: "room", granted: maru2.seated, note: "card 1 untouched" });

done(new URL("./dual-role.trace.json", import.meta.url), { trace: { maru_room: flow(vm), noor_shop: flow(ve) } });
