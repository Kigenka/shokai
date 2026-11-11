// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Runs the dual-role example in one process with the SDK (no network, keys made for this run) and writes its trace:
// one owner (Kiran), one representative key (Noor) holding two cards: "host of Kiran's meeting room" (the door's card) and
// "Kiran's representative" (going out). Then the owner revokes the going-out card and Noor's open seat at the tea shop ends (C198),
// while the room stays open. Usage: node examples/traces/dual-role.mjs  (after `npm run build` in packages/shokai)
import { writeFileSync } from "node:fs";
import { createDoor, createRepresentative, generateRepresentativeKey, signCardRevocation, cardRevocationMessage } from "../../packages/shokai/dist/src/index.js";

const kiran = generateRepresentativeKey();           // stands in for Kiran's owner key (a passkey in real use; Ed25519 here)
const noor = generateRepresentativeKey();           // Noor's own key: one representative, one key
const USD = (v) => ({ value: v, currency: "USD" });
const out = { steps: [], checks: [] };
const check = (ok, what) => { out.checks.push({ ok: !!ok, what }); if (!ok) { console.error("FAILED: " + what); process.exitCode = 1; } };

// Card 1: Noor keeps Kiran's meeting room. The SDK signs the door's card with the principal key it holds (here Kiran's key).
const room = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "kiran-room", displayName: "Kiran's meeting room", category: "gathering",
  about: "A small meeting room. Noor keeps the door.", keys: { rep: noor, principal: kiran },
  purposes: [{ code: "visitation", statement: "Drop in, look around, leave a note." }],
  actions: [{ action: "room.look", purposes: ["visitation"], level: "discover", data_asks: [] },
            { action: "room.post", purposes: ["visitation"], level: "act_on_behalf", data_asks: [] }] });
// A tea shop with its own keys (fictional).
const shop = createDoor({ approvedBy: { name: "Ren Okabe", role: "Owner" }, name: "tea-shop", displayName: "A tea shop", category: "store",
  purposes: [{ code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] }],
  spendingActions: ["order.place"] });

const roomCard = room.host.card ?? room.host.cfg?.card;  // card 1 (may be internal; reported by id only)
// Card 2: Kiran signs Noor's going-out card, for the same key.
const noorOut = createRepresentative({ ownerName: "Kiran", owner: kiran, key: noor, purposes: ["purchase", "visitation"], actions: ["menu.view", "order.place"] });

// 1. A visitor with no card: the lobby's leaflet.
const lobby = await room.post({ type: "greeting" });
const lobbyTypes = (lobby.envelope?.messages ?? []).map((m) => m.payload?.type);
out.steps.push({ who: "Fen's agent (no card)", at: "room", sent: "an unsigned greeting", got: lobbyTypes });
check(lobbyTypes.includes("lobby_briefing"), "an unprepared arrival at the room gets the leaflet (lobby_briefing), not silence");

// 2. Maru's representative (fictional) visits the room and is seated; it checks Noor's card 1 against the listing.
const maru = createRepresentative({ ownerName: "Maru Ostrander", purposes: ["visitation"], actions: ["room.look", "room.post"] });
const vm = await maru.visit(room, { purpose: "visitation", actions: ["room.look", "room.post"], why: "to leave a note for Kiran" });
check(vm.seated && vm.placeCheck.ok, "Maru's representative checked the room's card (signed by Kiran's key, naming Noor) and was seated");
const posted = await vm.act("room.post", { text: "Hello from Maru" });
check(posted?.type === "act_result", "Maru's representative posts in the room within its seat");
await vm.farewell();
out.steps.push({ who: "Maru's representative", at: "room", seated: vm.seated, placeSigner: "Kiran's key", repKey: "Noor's key", acts: vm.acts.map((a) => a.tool) });

// 3. Noor goes out with card 2 and buys a sencha within 15 USD.
const ve = await noorOut.visit(shop, { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("15.00") }, why: "a green tea for Kiran" });
check(ve.seated, "Noor, with card 2, is seated at the tea shop");
const presented = ve.transcript.filter((m) => m.dir === "out").map((m) => m.message?.payload ?? m.message).find((p) => p?.type === "card_presentation");
const cardOut = presented?.card?.payload ?? presented?.card;
check(cardOut?.card_id === noorOut.card.payload.card_id, "the tea shop sees card 2 only (the going-out card)");
check(noorOut.card.payload.representative_id === room.repId || noorOut.card.payload.representative?.id === room.repId || noorOut.id === room.repId, "both cards name the same representative key (Noor)");
check((await ve.act("menu.view"))?.type === "act_result", "Noor looks at the menu");
const order = await ve.act("order.place", { tea: "sencha", amount: USD("12.00") });
check(order?.type === "act_result", "Noor orders a 12.00 USD sencha, within the 15.00 USD limit");
out.steps.push({ who: "Noor (card 2)", at: "tea shop", seated: ve.seated, acts: ve.acts.map((a) => `${a.tool}${a.amount ? " " + a.amount.value + " " + a.amount.currency : ""}: ${a.ok ? "ok" : "refused"}`) });

// 4. Kiran withdraws card 2 only. Delivered by a fresh visit of Noor's under a new going-out card; the old seat ends (C198).
const noorOut2 = createRepresentative({ ownerName: "Kiran", owner: kiran, key: noor, purposes: ["purchase", "visitation"], actions: ["menu.view", "order.place"] });
const vd = await noorOut2.visit(shop, { purpose: "visitation", actions: ["menu.view"], why: "delivering Kiran's withdrawal of the old card" });
await vd.send(vd.message("card_revocation", cardRevocationMessage(signCardRevocation(kiran, noorOut.card, { reason: "superseded" }))));
const after = await ve.act("menu.view");
check(after?.type === "act_decision" && after.decision === "deny", "after Kiran revokes card 2, Noor's open seat under it is ended");
out.steps.push({ who: "Kiran", at: "tea shop", sent: "card_revocation of card 2", effect: `old seat's next act: ${after?.type}/${after?.decision}` });

// 5. The room (card 1) is untouched.
const maru2 = await maru.visit(room, { purpose: "visitation", actions: ["room.look"], why: "checking back" });
check(maru2.seated, "the meeting room, under card 1, still seats visitors");
out.steps.push({ who: "Maru's representative", at: "room", seated: maru2.seated, note: "card 1 untouched" });

// Trace, as message types in order (no keys, no signatures).
const flow = (v) => v.transcript.map((m) => { const p = m.message?.payload ?? m.message; return { dir: m.dir, type: p?.type, decision: p?.decision }; });
out.trace = { maru_room: flow(vm), noor_shop: flow(ve) };
out.ok = out.checks.every((c) => c.ok);
writeFileSync(new URL("./dual-role.trace.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.checks.filter((c) => c.ok).length}/${out.checks.length} checks passed`);
