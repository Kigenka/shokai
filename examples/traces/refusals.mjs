// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Two refusals at the door, recorded on 0.5.1 with the red-team round 3 fixes (0.5.0 still has both bugs).
// Juniper Tea Room, Dana Moor and Vex Arlo are fictional.
// 1. Vex's representative shows Dana's card under its own key (a stolen card). The door answers "never" to that representative,
//    and the reply now states when the ban lifts (at most 180 days) and where to appeal. Dana and her representative are not banned.
// 2. Dana's own representative, admitted with a pass, sends an order that carries a pasted login session. The door refuses it
//    (CREDENTIAL_NOT_ACCEPTED) before the place's service sees it; the same order without the session goes through.
// SDK, in one process, no network, keys made for the run. Usage: (cd packages/shokai && npm run build) && node examples/traces/refusals.mjs
import { createDoor, createRepresentative, sign, possessionPayload, randomId } from "../../packages/shokai/dist/src/index.js";
import { recorder, USD } from "./lib.mjs";

const { check, flow, done, out } = recorder();
const DAY = 86400e3;
const iso = (t) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const door = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "juniper", displayName: "Juniper Tea Room", category: "store",
  about: "A small tea room. Looking is free. Buying needs a signed mandate.",
  appealUrl: "https://juniper.example/appeals",
  purposes: [{ code: "purchase", statement: "Ordering tea, within a signed limit." }],
  actions: [
    { action: "menu.view", purposes: ["purchase"], level: "discover", data_asks: [] },
    { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: [] },
  ],
  spendingActions: ["order.place"],
});
await door.ready;

// 1. A stolen card.
const dana = createRepresentative({ ownerName: "Dana Moor", purposes: ["purchase"], actions: ["menu.view", "order.place"] });
const vex = createRepresentative({ ownerName: "Vex Arlo", purposes: ["purchase"], actions: ["menu.view"] });
const vcard = dana.card, akey = vex.key, aid = vex.card.payload.representative_id;
const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
const msg = (type, body) => sign({ protocol: "shokai/0.5", encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: aid, to: door.repId, type, ...body }, akey, at());
const post = async (m) => ((await door.post(m)).envelope.messages ?? []).map((x) => x?.payload ?? x);
const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }));
const hostNonce = g.find((x) => x.type === "greeting")?.nonce;
const proof = sign(possessionPayload(enc, hostNonce, door.repId), akey, at()).signatures[0];
const res = await post(msg("card_presentation", { card: vcard, possession_proof: { ...proof, key_id: vcard.payload.representative_key.key_id, signer: vcard.payload.representative_id, audience: door.repId } }));
const ir = res.find((x) => x.type === "invitation_response");
check(ir?.decision === "deny" && ir?.disposition === "never", "a representative showing someone else's card is refused with a never reply");
const days = Math.round((Date.parse(ir?.retry?.until ?? "") - Date.now()) / DAY);
check(Number.isFinite(days) && days > 0 && days <= 180, "the reply states when the ban lifts, within 180 days");
check(ir?.retry?.appeal?.url === "https://juniper.example/appeals" && !!ir?.retry?.appeal?.place, "the reply names the place and where to appeal");
check(!ir?.reason_code, "the reply gives no reason code (it does not coach the attempt)");
out.steps.push({
  who: "Vex's representative, showing Dana's card", at: "Juniper Tea Room",
  got: { type: ir?.type, decision: ir?.decision, disposition: ir?.disposition, retry: { kind: ir?.retry?.kind, until: `<the run's date + ${days} days>`, appeal: { url: ir?.retry?.appeal?.url, place: "<the place's owner ID>" } } },
});

// 2. A pasted login session inside an order.
const v = await dana.visit(door, { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("10.00") }, why: "a pot of tea for Dana", vouch: null });
check(v.seated, "Dana's own representative is granted a pass (the stolen-card attempt did not ban Dana or her representative)");
v.checkSeatLocally = false;
const bad = await v.act("order.place", { tea: "Hojicha", amount: USD("5.00"), session: { id: "s-FAKE", cookie: "sid=FAKE" } });
check(bad?.type === "act_decision" && bad?.decision === "deny" && bad?.reason_code === "CREDENTIAL_NOT_ACCEPTED", "an order carrying a pasted login session is refused before the place's service sees it");
const good = await v.act("order.place", { tea: "Hojicha", amount: USD("5.00") });
check(good?.type === "act_result", "the same order without the session goes through, within the 10.00 USD limit");
await v.farewell();
out.steps.push({ who: "Dana's visiting representative", at: "Juniper Tea Room", tools: v.seat?.tool_allowlist,
  acts: [`order.place with a pasted session: ${bad?.decision} (${bad?.disposition}, ${bad?.reason_code})`, `order.place 5.00 USD: ${good?.type === "act_result" ? "ok" : "refused"}`] });
done(new URL("./refusals.trace.json", import.meta.url), { place: "Juniper Tea Room (fictional)", trace: { stolen_card: res.map((p) => ({ dir: "in", type: p?.type, decision: p?.decision, disposition: p?.disposition })), dana_visit: flow(v) } });
