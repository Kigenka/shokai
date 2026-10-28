// SDK tests (v0.3.0-rc2): the visitor checks the place against its listing before any request (§3.1, C104); a visit that spends
// (limits, amounts, C174); mandate validity; the report home (what was shared, spent, time zone, next step); the core entry point.
import { createDoor, createRepresentative, verifySigned, type Door, type Transport } from "../src/index.js";
import * as core from "../src/core/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const shop = (name = "kettle") => createDoor({ name, displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "visitation", statement: "Looking at the menu." }, { code: "purchase", statement: "Ordering tea." }],
  actions: [{ action: "menu.list", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
            { action: "order.place", purposes: ["purchase"], level: "act_on_behalf", data_asks: ["name"] }],
  spendingActions: ["order.place"] });
const entryOf = (d: Door) => d.listing().places[0];
const sentRequest = (v: { transcript: { dir: string; message: any }[] }) => v.transcript.some((m) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "invitation_request");
const direct = (d: Door): Transport => async (_u, body) => (await d.post(body)).envelope;

async function main() {
  console.log("SDK visits (@kigenka/shokai)");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["visitation", "purchase"], actions: ["menu.list", "order.place"] });

  // §3.1 / C104: the place is checked against the listing entry before any request.
  const real = shop(); const ok = await aya.visit(entryOf(real), { purpose: "visitation", actions: ["menu.list"], transport: direct(real) });
  check(ok.placeCheck.ok && ok.seated && ok.placeCheck.checked.length >= 3, "a genuine place passes the checks (card by the listed principal, listed representative, possession proof, signed messages)");
  const impostor = shop();
  const spoofPrincipal = await aya.visit({ ...entryOf(impostor), principal_id: real.principalId }, { purpose: "visitation", actions: ["menu.list"], transport: direct(impostor) });
  check(!spoofPrincipal.placeCheck.ok && /principal/.test(spoofPrincipal.placeCheck.why ?? "") && !sentRequest(spoofPrincipal) && !spoofPrincipal.seated,
    "a listing whose principal_id isn't the one that signed the place's card ends the visit with no request sent");
  const spoofRep = await aya.visit({ ...entryOf(real), entry: impostor.entry }, { purpose: "visitation", actions: ["menu.list"], transport: direct(impostor) });
  const cardSent = spoofRep.transcript.some((m) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "card_presentation");
  check(!spoofRep.placeCheck.ok && /did not answer the greeting/.test(spoofRep.placeCheck.why ?? "") && !sentRequest(spoofRep) && !cardSent,
    "a spoofed pointer (another door at the entry) fails at the greeting: the listed representative never answered; not even the card is sent");
  // an impostor that answers in the listed representative's name but signs with its own key
  const forge: Transport = async (_u, body: any) => { const env = await direct(real)(_u, body); return { ...env, messages: env.messages.map((m: any) => ({ ...m, signatures: [] })) }; };
  const unsigned = await aya.visit(entryOf(real), { purpose: "visitation", actions: ["menu.list"], transport: forge });
  check(!unsigned.placeCheck.ok && /not signed by the representative/.test(unsigned.placeCheck.why ?? "") && !sentRequest(unsigned), "replies that aren't signed by the listed representative end the visit before any request");
  // a copied card: the real place's card and an old possession proof, replayed by a relay
  let saved: any = null;
  const recorder: Transport = async (u, body) => { const env = await direct(real)(u, body); const cp = env.messages.find((m: any) => (m.payload ?? m).type === "card_presentation"); if (cp && !saved) saved = cp; return env; };
  await aya.visit(entryOf(real), { purpose: "visitation", actions: ["menu.list"], transport: recorder });
  const replay: Transport = async (u, body) => { const env = await direct(real)(u, body); return { ...env, messages: env.messages.map((m: any) => ((m.payload ?? m).type === "card_presentation" ? saved : m)) }; };
  const copied = await aya.visit(entryOf(real), { purpose: "visitation", actions: ["menu.list"], transport: replay });
  check(!!saved && !copied.placeCheck.ok && /possession proof|another encounter/.test(copied.placeCheck.why ?? "") && !sentRequest(copied), "a copied card with an old possession proof fails over this visit's nonce; no request is sent");
  const noPrincipal = await aya.visit({ entry: real.entry, representative_id: real.repId }, { purpose: "visitation", actions: ["menu.list"], transport: direct(real) });
  check(!noPrincipal.placeCheck.ok && !sentRequest(noPrincipal), "without a principal_id to check against, the visit ends before any request (pass the listing entry)");
  check(/didn't match its listing/.test(spoofPrincipal.report().outcome_rendered.text), "the report home says the place didn't match its listing");
  // rc4 clarification (§2.2, C197): a place that answers in an encounter it named itself; the visitor stops before its card.
  const minting = shop(); { const h: any = (minting as any).host; const orig = h.newEnc.bind(h); h.newEnc = (id: string, ...rest: unknown[]) => { const e = orig(id, ...rest); e.id = "place-" + id; return e; }; }
  const other = await aya.visit(entryOf(minting), { purpose: "visitation", actions: ["menu.list"], transport: direct(minting) });
  const cardOut = other.transcript.some((m) => m.dir === "out" && (m.message?.payload ?? m.message)?.type === "card_presentation");
  check(!other.placeCheck.ok && /another encounter/.test(other.placeCheck.why ?? "") && !cardOut && !sentRequest(other) && !other.seated,
    "a reply in an encounter the place named itself ends the visit at the greeting: no card, no request (§2.2, C197)");
  // an early deny: the place answered before it showed its card, so nothing about it was checked (ok false, unchecked)
  const strict = shop(); (strict as any).host.bindNever(aya.id, new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  const early = direct(strict);
  const denied = await aya.visit(entryOf(strict), { purpose: "visitation", actions: ["menu.list"], transport: early });
  check(denied.placeCheck.ok === false && denied.placeCheck.unchecked === true && denied.placeCheck.checked.length === 0 && !/didn't match its listing/.test(denied.report().outcome_rendered.text),
    "when nothing about the place was checked, placeCheck.ok is false (unchecked), and the report doesn't call it a mismatch");

  // a visit that spends: limits in the mandate and the request; acts state amount (C174)
  const door = shop();
  const v = await aya.visit(door, { purpose: "purchase", actions: ["menu.list", "order.place"], limits: { max_amount: { value: "10.00", currency: "USD" }, max_operations: 5, max_session_s: 900 },
    mandate: { statement: "One cup of tea, up to 10 USD, tonight.", validSeconds: 7200 } });
  const m = v.mandateSent!.payload;
  check(v.seated && v.seat!.limits?.max_amount?.value === "10.00" && m.limits.max_amount?.value === "10.00", "limits go into the mandate the owner signs and into the request; the seat carries max_amount");
  const life = (Date.parse(m.expires_at) - Date.parse(m.valid_from)) / 1000;
  check(life > 7100 && life <= 7300 && m.purpose.statement === "One cup of tea, up to 10 USD, tonight." && verifySigned(v.mandateSent!).ok, "the mandate is scoped by the visit: a 2-hour validity and the owner's own statement");
  const dflt = await aya.visit(door, { purpose: "visitation", actions: ["menu.list"] }); const dl = (Date.parse(dflt.mandateSent!.payload.expires_at) - Date.parse(dflt.mandateSent!.payload.valid_from)) / 86400e3;
  check(dl > 0.99 && dl < 1.01, "a visit's mandate defaults to 1 day (not 30)");
  const noAmt = await v.act("order.place", { tea: "sencha" });
  check(noAmt?.type === "act_decision" && noAmt.reason_code === "REQUEST_INCOMPLETE", "a spending act without arguments.amount is refused REQUEST_INCOMPLETE (C174)");
  check((await v.act("order.place", { tea: "sencha", amount: { value: "6.00", currency: "USD" } }))?.ok === true, "the same act with amount {value, currency} goes through");
  check((await v.act("order.place", { tea: "sencha", amount: { value: "6.00", currency: "USD" } }))?.type === "act_decision", "a second 6.00 would pass the 10.00 cap: refused");
  check((await v.act("menu.list", {}))?.ok === true, "a non-spending act needs no amount");
  await v.farewell();
  const r = v.report("en-US", { timeZone: "America/Los_Angeles" });
  check(r.spent?.length === 1 && r.spent[0].value === "6.00" && r.spent[0].currency === "USD", "the report sums what was spent (6.00 USD), exactly");
  check(/Spent 6\.00 USD of the 10\.00 USD allowed/.test(r.outcome_rendered.text) && /seated me for/.test(r.outcome_rendered.text), "outcome_rendered reads as a sentence for the owner, with the spending");
  const card = r.shared?.find((s) => s.via === "card"); const mand = r.shared?.find((s) => s.via === "mandate"); const act = r.shared?.find((s) => s.via === "act" && s.items.some((i) => i.field === "tea"));
  check(!!card?.items.some((i) => i.field === "owner_display_name" && i.value === "Aya Linden") && !!card?.items.some((i) => i.field === "owner_id") && !!mand && !!act, "the report lists what was shared: the card (display name, owner id), the mandate, each act's arguments");
  check(Array.isArray(r.taken_home) && r.taken_home.length === 0 && Array.isArray(r.offers_declined), "taken_home and offers_declined are stated (empty), not left out");
  check(!/Nothing more is needed/.test(r.next_step.text) && /Nothing is waiting for your approval/.test(r.next_step.text) && r.next_step.if_no_reply === "nothing_happens", "the next step no longer contradicts requires_owner_approval");
  check(/P[DS]T/.test(r.voice.text) && /If you don't reply, nothing happens/.test(r.voice.text), "the voice report renders times in the owner's time zone and says what happens on silence");
  check(/ask you for: name/.test(r.voice.text), "the report repeats the data asks the place declared for the seated actions");

  // §10 (R4 finding F2): at a door, the answer to an offer is a signed offer_outcome, not an act_result. The SDK must count a kept
  // offer as done and a declined one as refused, return the outcome, and say in the report what the door did with it.
  const doorLike = createDoor({ name: "door-ines", displayName: "Ines Calloway's door", category: "x-inbound-door",
    purposes: [{ code: "presentation", statement: "Present one item, or invite the owner." }],
    actions: [{ action: "door.invite", purposes: ["presentation"], level: "advise", data_asks: [] }] });
  const outcomes = ["kept_for_later", "declined"]; let k = 0;
  const atDoor: Transport = async (u, body: any) => {
    const p = body?.payload ?? body;
    if (p?.type !== "act") return direct(doorLike)(u, body);
    const msg = { protocol: p.protocol, encounter_id: p.encounter_id, msg_id: `${p.encounter_id}-oo${k}`, sent_at: new Date().toISOString(), from: doorLike.keys.rep.id, to: p.from,
      type: "offer_outcome", in_reply_to: p.msg_id, seat_id: p.seat_id, offer_id: p.arguments?.offer?.offer_id, offer_digest: core.digestOf(p.arguments?.offer), outcome: outcomes[k++],
      relationship_ref: "rel-test", courtesy: { locale: "en-US", locale_match: "exact", register: "first_meeting", text: "Thank you." } };
    return { messages: [core.makeSigned(msg, doorLike.keys.rep, msg.sent_at)] } as any;
  };
  const ama = createRepresentative({ ownerName: "Ama Okafor", purposes: ["presentation"], actions: ["door.invite"] });
  const dv = await ama.visit(entryOf(doorLike), { purpose: "presentation", actions: ["door.invite"], transport: atDoor });
  const offer = (id: string, item: string) => ({ offer: { offer_id: id, kind: "invitation", item, category: "culture", valid_until: "2027-01-01T00:00:00Z", needs_from_owner: [], context: { door: doorLike.keys.rep.id } } });
  const kept: any = dv.seated ? await dv.act("door.invite", offer("of-1", "Open studio")) : undefined;
  check(kept?.type === "offer_outcome" && kept.outcome === "kept_for_later" && dv.acts[0]?.ok === true && dv.acts[0]?.offer_outcome === "kept_for_later",
    "an act at a door returns the door's signed offer_outcome, and a kept offer counts as done (F2: it used to return undefined and count as refused)");
  const declined: any = dv.seated ? await dv.act("door.invite", offer("of-2", "Studio supper")) : undefined;
  check(declined?.outcome === "declined" && dv.acts[1]?.ok === false, "a declined offer counts as refused");
  const dr = dv.report().outcome_rendered.text;
  check(/I did 1 action; 1 was refused/.test(dr) && /The door kept it for later \("Open studio"\) and the door declined it \("Studio supper"\)\./.test(dr),
    "the report home says what the door did with each offer, from its codes: " + dr);

  // the core entry point
  check(typeof core.Host === "function" && typeof core.digestOf === "function" && core.SPEC_VERSION.startsWith("0.3.0"), "@kigenka/shokai/core exports the protocol core");
  console.log(`${pass} SDK visit checks passed, ${fail} failed`); if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
