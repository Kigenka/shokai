// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.4.0 conformance checks (2026-10-29): two Shōkai cards (the Shōkai visitor card and the Shōkai host card), the house digest,
// a withdrawn host card, the purchase-only live owner prompt, the credential rule, a mandate that carries no payment instrument,
// and the existing-customer check at an institution (C202–C215), with the golden traces K1–K6 replayed.
// Real crypto, fresh fictional keys only (Fernwood Goods, Harborlight Savings & Trust; visitors Aya Linden and Kiran Vale are fictional).
import fs, { appendFileSync } from "node:fs";
import { fernwood, makeHost, newKeys, withHostCard, harborlightInstitution, type PlaceKeys } from "../src/places.js";
import { placeListing, entryUrl } from "../src/door.js";
import { Host, MAX_HOLD_S } from "../src/host.js";
import { RealVerifier } from "../src/verify.js";
import { makeSigned, makeOwnerSigned, digestOf, newPasskeyOwner, newEd25519, randomId, type PasskeyOwner, type Ed25519Signer } from "../src/crypto.js";
import { houseDigest, visitorPlaceCardCheck, checkHostCardFields, forbiddenMembers, PLACE_CARD_REPORTS, cardKindOf, type FetchCache } from "../src/trust.js";
import type { PlaceConfig } from "../src/policy.js";
import type * as S from "../src/shapes.js";
import { Session, visitor, mandate, clockAt, NOW, signBy, ownerConsent, type Visitor } from "./kit.js";

let pass = 0, fail = 0; let cur = "";
function scenario(name: string, f: () => void) { cur = name; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v040", group: cur, what, ok: c }) + "\n"); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }
const USD = (value: string) => ({ value, currency: "USD" });
const ACTS = ["store.browse_catalog", "store.place_order"];
const BASE = "https://door.fernwood.example/shokai";
const FERN_ENTRY = entryUrl(BASE, "fernwood");
const WRONG_KIND = "This door expects a Shōkai visitor card. You presented a Shōkai host card. Please come back with your Shōkai visitor card, or ask your owner for one.";
const emit = process.argv.includes("--emit"); const emitted: Record<string, unknown[]> = {};
const keep = (k: string, msgs: unknown[]) => { (emitted[k] ??= []).push(...msgs); };

/** A visitor whose card is re-signed with v0.4.0 members (kind, owner_prompts, shown_to_owner, …). */
function v4(v: Visitor, extra: Partial<S.RepresentativeCard>): Visitor {
  const card = signBy(v.owner, { ...v.card.payload, ...extra } as S.RepresentativeCard); return { ...v, card };
}
const visitorCard = (name: string, extra: Partial<S.RepresentativeCard> = {}, opts: { owner?: PasskeyOwner } = {}) =>
  v4(visitor(name, "person", { purposes: ["purchase", "visitation"], actions: ACTS }, opts), { kind: "visitor",
    shown_to_owner: { text: `${name}'s representative may visit stores for ${name}, look around and buy within the limits ${name} signs for each errand.`, locale: "en-US" }, ...extra });
/** Fernwood with a v0.4.0 Shōkai host card; `tweak` changes the house config BEFORE the card is signed. */
function fernHost(o: { keys?: PlaceKeys; clock?: ReturnType<typeof clockAt>; tweak?: (c: PlaceConfig) => void; card?: Parameters<typeof withHostCard>[3]; fetched?: FetchCache } = {}) {
  const keys = o.keys ?? newKeys(); const clock = o.clock ?? clockAt(NOW);
  const c0 = fernwood(keys); o.tweak?.(c0);
  const c = withHostCard(c0, keys.principal, FERN_ENTRY, o.card);
  const h = new Host(c, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: FERN_ENTRY, fetched: o.fetched ?? new Map() });
  return { h, keys, clock, cfg: c };
}
const firstResponse = (s: Session) => s.transcript.map((o: any) => o.message?.payload ?? o.message).find((x: any) => x.type === "invitation_response");
const placeCard = (s: Session) => s.transcript.map((o: any) => o.message?.payload ?? o.message).find((x: any) => x.type === "card_presentation")?.card as S.SignedCard | undefined;

// ------------------------------------------------------------------------------------------------ K1, C202, C214
scenario("K1 a Shōkai host card shown as a visitor's credential: the fixed, fixable refusal (C202)", () => {
  const { h } = fernHost();
  const aya = visitorCard("Aya Linden");
  // Aya's own door's Shōkai host card (Kettle & Leaf), presented by mistake at Fernwood's door.
  const ayaHost = v4(aya, { kind: "host", place: { principal_id: aya.owner.id, entry: "https://kettle-and-leaf.example/shokai/places/door/entry" },
    host_scope: { actions: ["tea.reserve"], duties: ["seat"] }, house_digest: digestOf({ house: "kettle-and-leaf" }),
    shown_to_owner: { text: "Suzu may welcome visitors at Kettle & Leaf.", locale: "en-US" } });
  const s = new Session(h, ayaHost); s.greet(); s.present();
  const r = firstResponse(s); keep("K1", s.transcript.map((o: any) => o.message?.payload ?? o.message));
  check(r?.decision === "deny" && r.disposition === "not_now" && r.reason_code === "CREDENTIAL_REQUIRED", "deny / not_now / CREDENTIAL_REQUIRED");
  check(r?.retry?.kind === "with_credential" && JSON.stringify(r.retry.credentials) === '["signed_card"]', "retry with_credential [signed_card] (a fresh visit with the other Shōkai card)");
  const rr = r?.readiness_requirements?.[0];
  check(r?.readiness_requirements?.length === 1 && rr?.code === "card_kind" && rr.required === true, "one readiness item: card_kind, required");
  check(rr?.owner_text?.text === WRONG_KIND && rr.owner_text.locale === "en-US", "owner_text is the fixed sentence, word for word");
  check(!h.isNever(aya.owner.id) && !h.isNever(aya.rep.id) && h.outbox.length === 0 && !(h.records.get(aya.owner.id)?.misconduct?.length), "never `never`, no notice, nothing recorded against anyone");
  check(!s.transcript.some((o: any) => (o.message?.payload ?? o.message)?.type === "card_presentation"), "the gatekeeper presents no card of its own after refusing");
  const s2 = new Session(h, aya); s2.ritual(null, mandate(aya, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s2.response()?.decision === "grant", "a new visit with the Shōkai visitor card is seated");
  const legacy = visitor("Kiran Vale", "person", { purposes: ["visitation"], actions: ACTS });
  check(legacy.card.payload.kind === undefined && cardKindOf(legacy.card.payload, "visitor") === "visitor", "a v0.3.0 card without kind reads as a visitor card when a visitor presents it (C214)");
  const s3 = new Session(h, legacy); s3.ritual(null, mandate(legacy, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s3.response()?.decision === "grant", "… and is seated as before");
  const loc = ["ja-JP", "es-ES", "fr-FR", "pt-BR"].map((l) => { const x = v4(aya, { kind: "host", locales: [l] }); const sl = new Session(h, x); sl.greet(); sl.present();
    return firstResponse(sl)?.readiness_requirements?.[0]; });
  check(loc.every((x) => x?.code === "card_kind" && /Shōkai visitor card/.test(x.owner_text.text) && !/\b(mandate|DID|nonce|digest)\b/i.test(x.owner_text.text)), "the sentence exists in every lobby locale, names the Shōkai visitor card, and has no protocol words");
});

// ------------------------------------------------------------------------------------------------ K2, C203, C204, C206
scenario("K2 the place's card: a Shōkai visitor card, or a Shōkai host card for another place, ends the visit (C203, C204)", () => {
  const keys = newKeys(); const { h, cfg } = fernHost({ keys });
  const aya = visitorCard("Aya Linden"); const s = new Session(h, aya); s.greet(); s.present();
  const pc = placeCard(s)!; const listing = placeListing(BASE, [h], NOW).places[0];
  const at = (card: S.SignedCard, entry = listing.entry, spending = false) => visitorPlaceCardCheck(new RealVerifier(), card, { principal_id: listing.principal_id, entry, house_digest: listing.house_digest,
    actions: listing.actions.map((a) => a.action), fetched: new Map(), spending });
  check(pc.payload.kind === "host" && at(pc).ok, "Fernwood's own Shōkai host card passes the visitor's checks at its own entry");
  check(listing.house_digest === houseDigest(cfg) && pc.payload.house_digest === listing.house_digest, "the listing entry names the house digest the host card carries");
  const popup = withHostCard(fernwood(keys), keys.principal, entryUrl(BASE, "fernwood-popup")).card!;
  const r1 = at(popup);
  check(!r1.ok && r1.problem === "other_place" && r1.report === PLACE_CARD_REPORTS.other_place, "the pop-up's host card at the shop's entry: other_place, with the fixed report");
  const vis = makeSigned<S.RepresentativeCard>({ ...pc.payload, kind: "visitor" }, keys.principal, NOW);
  const r2 = at(vis);
  check(!r2.ok && r2.problem === "visitor_card" && r2.report === "This place showed a Shōkai visitor card instead of a Shōkai host card, so I didn't go in.", "a Shōkai visitor card at a door: the visitor doesn't go in, and says so in the fixed sentence");
  keep("K2", [{ check: "visitorPlaceCardCheck", popup: r1, visitor_card: r2 }]);
  const legacy = makeSigned<S.RepresentativeCard>({ ...pc.payload, kind: undefined, place: undefined, host_scope: undefined, house_digest: undefined } as any, keys.principal, NOW);
  const r3 = at(legacy); check(r3.ok && r3.legacy, "a v0.3.0 place card (no kind) reads as a host card from a gatekeeper (C214)");
  const noAppr = makeSigned<S.RepresentativeCard>({ ...pc.payload, org_approval: undefined } as any, keys.principal, NOW);
  check(checkHostCardFields(noAppr.payload, { principal_id: listing.principal_id }).ok === false && !at(noAppr).ok, "an organization's host card without the record of the person who approved it is incomplete (C206)");
  const noScope = makeSigned<S.RepresentativeCard>({ ...pc.payload, host_scope: { actions: ["store.browse_catalog"], duties: ["seat"] } }, keys.principal, NOW);
  check(!at(noScope).ok, "a host card whose host scope doesn't cover the listed actions is refused (C206)");
  // The door's own side: a door whose host card names another place answers nothing (it doesn't speak for its owner here).
  const c2 = withHostCard(fernwood(keys), keys.principal, FERN_ENTRY, { entryOverride: entryUrl(BASE, "fernwood-popup") });
  const h2 = new Host(c2, keys.rep, keys.principal, new RealVerifier(), clockAt(NOW).now, { entryUrl: FERN_ENTRY });
  const s2 = new Session(h2, aya); const out = s2.greet();
  check(out.length === 0 && h2.hostCardProblem() === "other_place", "a door holding the pop-up's host card at the shop's address stays closed");
  // Separate keys (SHOULD, C206): a representative's visitor card and its host card use different keys.
  check(pc.payload.representative_key.public_key !== aya.card.payload.representative_key.public_key, "the host card's representative key is not the visitor card's");
});

// ------------------------------------------------------------------------------------------------ K3, C207
scenario("K3 a withdrawn Shōkai host card: the visitor checks the place owner's list (C207)", () => {
  const url = "https://fernwood.example/shokai/cards/revoked";
  const keys = newKeys(); const { h } = fernHost({ keys, card: { revocation_url: url } });
  const aya = visitorCard("Aya Linden"); const s = new Session(h, aya); s.greet(); s.present();
  const pc = placeCard(s)!; const listing = placeListing(BASE, [h], NOW).places[0];
  const run = (body: unknown | null, spending: boolean) => { const f: FetchCache = new Map(); if (body !== null) f.set(url, { ok: true, at: NOW, body });
    return visitorPlaceCardCheck(new RealVerifier(), pc, { principal_id: listing.principal_id, entry: listing.entry, house_digest: listing.house_digest, actions: listing.actions.map((a) => a.action), fetched: f, spending }); };
  const rev = makeSigned<S.CardRevocation>({ card_id: pc.payload.card_id, card_digest: pc.payload_digest, principal_id: keys.principal.id, revoked_at: NOW, reason: "superseded" }, keys.principal, NOW);
  const forged = makeSigned<S.CardRevocation>({ card_id: pc.payload.card_id, principal_id: keys.principal.id, revoked_at: NOW }, newEd25519(), NOW);
  check(run([], true).ok, "an empty list: the host card is in force");
  const w = run([rev], false);
  check(!w.ok && w.problem === "withdrawn" && w.report === PLACE_CARD_REPORTS.withdrawn, "the owner's signed withdrawal in the list: the visitor doesn't go in, and reports why");
  check(run([forged], true).ok, "an entry not signed by the place's principal is skipped");
  const u = run(null, true);
  check(!u.ok && u.problem === "unchecked_withdrawal", "a list the visitor can't fetch ends a spending visit (fail closed)");
  const ub = run(null, false);
  check(ub.ok && ub.revocation === "unreachable", "… and is noted, not fatal, for a visit that spends nothing");
  keep("K3", [{ check: "visitorPlaceCardCheck", withdrawn: w, unreachable_spending: u }]);
  // The door's side, as in v0.3.0: the owner's revocation delivered to the door itself closes it.
  const s2 = new Session(h, aya); s2.greet(); s2.send(s2.msg("card_revocation", { revocation: rev }));
  check(h.revokedCards.size === 1, "the door takes in its own host card's revocation (it is the one message a door with a problem still reads)");
});

// ------------------------------------------------------------------------------------------------ K4, C205
scenario("K4 a house-config change needs a new owner signature (C205)", () => {
  const keys = newKeys(); const clock = clockAt(NOW); const { h, cfg } = fernHost({ keys, clock });
  const aya = visitorCard("Aya Linden");
  const s = new Session(h, aya); check(s.greet().some((m: any) => m.type === "greeting"), "with its signed house config the door answers");
  const before = placeListing(BASE, [h], NOW).places[0].house_digest;
  h.cfg.policy.spending_actions = [...h.cfg.policy.spending_actions, "store.request_quote"];   // the house changed after the owner signed
  const after = placeListing(BASE, [h], NOW).places[0].house_digest;
  check(before !== after && after === houseDigest(h.cfg), "the listing names the new house digest at once");
  const s2 = new Session(h, aya); const out = s2.greet();
  check(out.length === 0 && h.hostCardProblem() === "house_changed" && h.log.some((l) => /door is closed/.test(l)), "the door stays closed (no answer) while its host card fingerprints another house config");
  const pc = cfg.card!;
  const r = visitorPlaceCardCheck(new RealVerifier(), pc, { principal_id: cfg.principal_id, entry: FERN_ENTRY, house_digest: after, actions: h.cfg.policy.actions.map((a) => a.action), fetched: new Map(), spending: false });
  check(!r.ok && r.problem === "house_changed" && r.report === PLACE_CARD_REPORTS.house_changed, "a visitor that reads the new listing and the old host card doesn't go in");
  keep("K4", [{ house_digest_signed: before, house_digest_now: after, visitor: r }]);
  const resigned = withHostCard({ ...h.cfg, card: pc }, keys.principal, FERN_ENTRY, { card_id: "card-fernwood-goods-host-2" });
  h.cfg.card = resigned.card;
  const s3 = new Session(h, aya); s3.ritual(null, mandate(aya, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s3.response()?.decision === "grant" && h.hostCardProblem() === null, "the owner signs a new host card over the new house config: the door opens again");
  const v = visitor("Kiran Vale", "person", { purposes: ["visitation"], actions: ACTS });
  const visitorAtDoor = { ...h.cfg, card: v.card };
  const h4 = new Host({ ...visitorAtDoor, card: signBy(v.owner, { ...v.card.payload, kind: "visitor" } as S.RepresentativeCard) }, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: FERN_ENTRY });
  check(h4.hostCardProblem() !== null && new Session(h4, aya).greet().length === 0, "a Shōkai visitor card can't keep a door");
});

// ------------------------------------------------------------------------------------------------ K7, C215
scenario("K7 a door admits only while its Shōkai host card for this place is active (C215)", () => {
  const keys = newKeys(); const clock = clockAt(NOW); const { h } = fernHost({ keys, clock });
  const aya = visitorCard("Aya Linden");
  const s = new Session(h, aya); s.ritual(null, mandate(aya, "visitation", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(h.hostCardProblem() === null && s.response()?.decision === "grant", "with an active Shōkai host card for this place, the door admits");
  const pc = h.cfg.card!;
  const rev = makeSigned<S.CardRevocation>({ card_id: pc.payload.card_id, card_digest: pc.payload_digest, principal_id: keys.principal.id, revoked_at: NOW, reason: "superseded" }, keys.principal, NOW);
  const s2 = new Session(h, aya); s2.greet(); s2.send(s2.msg("card_revocation", { revocation: rev }));
  check(h.hostCardProblem() === "withdrawn" && new Session(h, aya).greet().length === 0, "once its owner withdraws the Shōkai host card, the door answers no one");
  const k2 = newKeys(); const c2 = clockAt(NOW); const { h: h2 } = fernHost({ keys: k2, clock: c2 });
  c2.advance((Date.parse(h2.cfg.card!.payload.expires_at) - Date.parse(NOW)) / 1000 + 1);
  check(h2.hostCardProblem() === "expired" && new Session(h2, aya).greet().length === 0, "after its Shōkai host card expires, the door answers no one");
});

// ------------------------------------------------------------------------------------------------ K5, C212, C213
scenario("K5 the purchase-only live owner prompt: held, approved by passkey, declined, or lapsed in silence (C212, C213)", () => {
  const clock = clockAt(NOW);
  const { h } = fernHost({ clock, tweak: (c) => { c.policy.purchase_hold_s = 300; }, card: { duties: ["seat", "issue_passes", "receipts", "consider", "misconduct_notices", "hold_purchases"] } });
  const aya = visitorCard("Aya Linden", { owner_prompts: "purchase_only", shown_to_owner: { text: "Aya Linden's representative may buy within the limits Aya signs, and may ask Aya live to approve a purchase; nothing else waits on Aya.", locale: "en-US" } });
  const m = mandate(aya, "purchase", ACTS, { max_amount: USD("50.00") });
  const s = new Session(h, aya); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("50.00") } });
  const seat = s.response()?.seat; check(!!seat && s.response()?.decision === "grant", "Aya's representative is seated to buy within USD 50");
  const act = (args: Record<string, unknown>, tool = "store.place_order", hold = true) => s.send(s.msg("act", { seat_id: seat.seat_id, tool, arguments: args, ...(hold ? { hold_for_owner: true } : {}) }));
  const out1 = act({ amount: USD("20.00"), payment_ref: "order-1" }); const held = out1.find((x: any) => x.type === "act_held");
  check(!!held && held.amount.value === "20.00" && Date.parse(held.expires_at) - Date.parse(NOW) === 300e3 && held.hold_id && held.act_digest, "a purchase asked to be held: act_held with the amount, a hold id, the act's digest and the hold's end");
  check(!out1.some((x: any) => x.type === "act_result"), "nothing is charged while it is held");
  const browse = act({}, "store.browse_catalog", false);
  check(browse[0]?.type === "act_result", "the conversation isn't held: another act in the seat goes on");
  const signedAct = s.transcript.length; void signedAct;
  const consent = ownerConsent(aya.owner as PasskeyOwner, aya.rep.id, "approve_purchase", { kind: "act", id: held.hold_id, digest: held.act_digest },
    { shown_to_owner: { text: "Buy at Fernwood Goods: store.place_order, USD 20.00 (order-1). Approve?", locale: "en-US" } });
  const ok = s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: held.hold_id, consent }));
  check(ok[0]?.type === "act_result" && ok[0].ok === true && ok[0].in_reply_to === held.in_reply_to, "the owner's passkey approve_purchase over the held act: the purchase goes through, answering the held act");
  keep("K5", [s.transcript.map((o: any) => o.message?.payload ?? o.message).find((x: any) => x.type === "act_held"), ok[0]]);
  const again = s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: held.hold_id, consent }));
  check(again[0]?.type === "act_decision" && again[0].reason_code === "HOLD_LAPSED", "a hold is used once");
  // Declined: lapses, nothing charged, the reservation released.
  const h2 = act({ amount: USD("25.00"), payment_ref: "order-2" }).find((x: any) => x.type === "act_held");
  const over = act({ amount: USD("10.00"), payment_ref: "order-3" });
  check(over[0]?.type === "act_decision" && over[0].reason_code === "SEAT_SCOPE_EXCEEDED", "a held amount is reserved: 20 spent + 25 held leaves less than 10 of USD 50");
  const no = ownerConsent(aya.owner as PasskeyOwner, aya.rep.id, "approve_purchase", { kind: "act", id: h2.hold_id, digest: h2.act_digest }, { decision: "decline" });
  const d = s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: h2.hold_id, consent: no }));
  check(d[0]?.type === "act_decision" && d[0].decision === "deny" && d[0].disposition === "not_now" && d[0].reason_code === "HOLD_LAPSED", "the owner declines: the act lapses (HOLD_LAPSED)");
  const fits = act({ amount: USD("25.00"), payment_ref: "order-4" }, "store.place_order", false);
  check(fits[0]?.type === "act_result", "… and its USD 25 reservation is released (25 more now fits)");
  // Silence is no.
  const h3 = act({ amount: USD("5.00"), payment_ref: "order-5" }).find((x: any) => x.type === "act_held");
  clock.advance(301);
  const late = ownerConsent(aya.owner as PasskeyOwner, aya.rep.id, "approve_purchase", { kind: "act", id: h3.hold_id, digest: h3.act_digest });
  const l = s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: h3.hold_id, consent: late }));
  check(l[0]?.reason_code === "HOLD_LAPSED" && h.holds.get(h3.hold_id)?.done === true, "silence past the hold's end is no: a late yes finds the act lapsed");
  keep("K5", [l[0]]);
  // A wrong subject, or a chat reply, isn't a yes.
  const h4 = act({ amount: USD("1.00"), payment_ref: "order-6" }).find((x: any) => x.type === "act_held");
  const wrong = ownerConsent(aya.owner as PasskeyOwner, aya.rep.id, "approve_purchase", { kind: "act", id: h4.hold_id, digest: held.act_digest });
  const w = s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: h4.hold_id, consent: wrong }));
  check(w[0]?.reason_code === "CREDENTIAL_REQUIRED" && JSON.stringify(w[0].retry?.credentials) === '["owner_consent"]' && h.holds.get(h4.hold_id)?.done !== true, "a consent over another act is refused; the hold stays until its end");
  const chat = ownerConsent(aya.owner as PasskeyOwner, aya.rep.id, "approve_purchase", { kind: "act", id: h4.hold_id, digest: h4.act_digest }, { assurance: "chat_reply" as any });
  check(s.send(s.msg("act_confirmation", { seat_id: seat.seat_id, hold_id: h4.hold_id, consent: chat }))[0]?.reason_code === "CREDENTIAL_REQUIRED", "a chat-reply consent can't approve a purchase (passkey only)");
  // Purchases only.
  clock.advance(-301);
  const q = act({}, "store.browse_catalog");
  check(q[0]?.type === "act_decision" && q[0].disposition === "not_a_fit" && q[0].reason_code === "LIVE_PROMPT_PURCHASE_ONLY", "a live owner prompt for anything but a purchase is refused (LIVE_PROMPT_PURCHASE_ONLY)");
  const z = act({ amount: USD("0") });
  check(z[0]?.reason_code === "LIVE_PROMPT_PURCHASE_ONLY", "an amount of zero spends nothing, so it can't be held either");
  keep("K5", [q[0]]);
  check(MAX_HOLD_S === 900, "the reference caps any hold at 15 minutes, whatever the policy says");
  // Disclosure: a visitor card that didn't tell its owner can't ask live; a place whose host card didn't tell its owner doesn't hold.
  const kiran = visitorCard("Kiran Vale");
  const sk = new Session(h, kiran); sk.ritual(null, mandate(kiran, "purchase", ACTS, { max_amount: USD("50.00") }), { actions: ACTS, limits: { max_amount: USD("50.00") } });
  const ks = sk.response()?.seat;
  const kr = sk.send(sk.msg("act", { seat_id: ks.seat_id, tool: "store.place_order", arguments: { amount: USD("5.00") }, hold_for_owner: true }));
  check(kr[0]?.reason_code === "CREDENTIAL_REQUIRED" && JSON.stringify(kr[0].retry?.credentials) === '["signed_card"]', "a visitor card without owner_prompts \"purchase_only\" can't ask its owner live (the owner wasn't told)");
  const { h: plain } = fernHost({ tweak: (c) => { c.policy.purchase_hold_s = 300; } });
  const sp = new Session(plain, aya); sp.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("50.00") } });
  const pr = sp.send(sp.msg("act", { seat_id: sp.response()?.seat?.seat_id, tool: "store.place_order", arguments: { amount: USD("5.00") }, hold_for_owner: true }));
  check(pr[0]?.reason_code === "POLICY_DENY", "a place whose host card doesn't list hold_purchases holds nothing (its owner wasn't told)");
});

// ------------------------------------------------------------------------------------------------ C210, C211
scenario("C210 C211 the credential rule, and a mandate amount that carries no payment instrument", () => {
  const { h } = fernHost();
  const aya = visitorCard("Aya Linden");
  const m = mandate(aya, "purchase", ACTS, { max_amount: USD("50.00") });
  const s = new Session(h, aya); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("50.00") } }); const seat = s.response()?.seat;
  const r = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { amount: USD("5.00"), checkout: { "Card-Number": "4242424242424242", CVV: "123" } } }));
  check(r[0]?.type === "act_decision" && r[0].disposition === "not_a_fit" && r[0].reason_code === "CREDENTIAL_NOT_ACCEPTED" && r[0].retry?.kind === "after", "an act carrying card data is refused before the service: not_a_fit / CREDENTIAL_NOT_ACCEPTED, retry at once without it");
  const r2 = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.browse_catalog", arguments: { login: { password: "hunter2" } } }));
  check(r2[0]?.reason_code === "CREDENTIAL_NOT_ACCEPTED", "… and so is one carrying a password");
  check(!h.isNever(aya.owner.id) && h.outbox.length === 0, "a setup failure: nothing recorded, no notice");
  const ok = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { amount: USD("5.00"), payment_ref: "p1" } }));
  check(ok[0]?.type === "act_result", "the same purchase without them goes through (the refused act counted nothing)");
  const mi = mandate(aya, "purchase", ACTS, { max_amount: USD("50.00") }, { "x-wallet": { payment_token: "tok_visa" } } as any);
  const s2 = new Session(h, aya); s2.ritual(null, mi, { actions: ACTS, limits: { max_amount: USD("50.00") } });
  check(s2.response()?.decision === "deny" && s2.response()?.reason_code === "MANDATE_INVALID", "a mandate that carries a payment token is invalid (MANDATE_INVALID): an amount authorizes spending, it carries no instrument");
  const bad = v4(aya, { "x-login": { password: "hunter2" } } as any);
  const s3 = new Session(h, bad); s3.greet(); s3.present();
  check(firstResponse(s3)?.disposition === "not_now" && JSON.stringify(firstResponse(s3)?.retry?.credentials) === '["signed_card"]', "a card that carries a password is refused like an invalid card");
  check(forbiddenMembers({ a: { "One-Time-Code": 1 } }).includes("one_time_code") && forbiddenMembers({ payment_method: "card" }).length === 0, "member names are compared case-insensitively; a data-ask word like payment_method is not a credential");
});

// ------------------------------------------------------------------------------------------------ K6, C208, C209
scenario("K6 the existing-customer check at an institution: one answer for every link failure (C208, C209)", () => {
  const keys = newKeys(); const clock = clockAt(NOW); const entry = entryUrl("https://door.harborlight.example/shokai", "harborlight");
  const c = withHostCard(harborlightInstitution(keys), keys.principal, entry, { approver: { name: "Ren Okabe", role: "Head of Digital Banking" } });
  const h = new Host(c, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: entry });
  const kiranOwner = newPasskeyOwner();
  const kiran = v4(visitor("Kiran Vale", "person", { purposes: ["account_servicing"], actions: ["bank.get_balance", "bank.submit_payment"] }, { owner: kiranOwner }), { kind: "visitor" });
  const link = (owner: PasskeyOwner, extra: Partial<S.CustomerLink> = {}): S.Signed<S.CustomerLink> => {
    const p: S.CustomerLink = { link_id: randomId("cl"), place: keys.principal.id, owner_id: owner.id, rp_id: owner.rpId, scope: { actions: ["bank.get_balance", "bank.submit_payment"] },
      money_from: "2026-10-26T00:00:00Z", issued_at: "2026-10-24T00:00:00Z", expires_at: "2027-10-24T00:00:00Z", shown_to_owner: { text: "Link Kiran Vale's representative to Harborlight: read balances; payments from 26 Oct.", locale: "en-US" }, ...extra };
    const a = makeSigned(p, keys.principal, NOW), b = makeOwnerSigned(p, owner, NOW);
    return { payload: p, payload_digest: a.payload_digest, signatures: [...a.signatures, ...b.signatures] };
  };
  const l = link(kiranOwner); check(h.recordCustomerLink(l), "the bank records a link made in its own app (co-signed by the bank's key and the owner's passkey)");
  check(!h.recordCustomerLink({ ...l, signatures: [l.signatures[0]] }), "a link without the owner's passkey signature isn't recorded");
  const listing = placeListing("https://door.harborlight.example/shokai", [h], NOW).places[0];
  check(listing.actions.filter((a) => a.needs !== "considering").every((a) => a.requires_customer_link === true) && !JSON.stringify(listing).includes(l.payload.link_id), "the listing marks the actions requires_customer_link and reveals nothing about who is a customer");
  const ask = (v: Visitor, extra: Partial<S.Mandate>) => { const s = new Session(h, v); s.ritual(null, mandate(v, "account_servicing", ["bank.get_balance"], {}, { counterparties: [keys.principal.id], ...extra }), { actions: ["bank.get_balance"] }); return s; };
  const shape = (r: any) => JSON.stringify({ d: r?.decision, x: r?.disposition, c: r?.reason_code, r: r?.retry, q: r?.readiness_requirements?.map((y: any) => [y.code, y.required, y.owner_text.text]), ctx: r?.context_statement?.text });
  const none = ask(kiran, {}).response();
  const unknown = ask(kiran, { customer_link: { link_id: "cl-unknown", link_digest: "sha-256:" + "A".repeat(43) } }).response();
  const dana = v4(visitor("Dana", "person", { purposes: ["account_servicing"], actions: ["bank.get_balance"] }), { kind: "visitor" });
  const foreign = ask(dana, { customer_link: { link_id: l.payload.link_id, link_digest: l.payload_digest } }).response();
  const l2 = link(kiranOwner); h.recordCustomerLink(l2); h.endCustomerLink(l2.payload.link_id);
  const ended = ask(kiran, { customer_link: { link_id: l2.payload.link_id, link_digest: l2.payload_digest } }).response();
  check(none?.decision === "deny" && none.disposition === "not_now" && none.reason_code === "CREDENTIAL_REQUIRED" && none.readiness_requirements?.[0]?.code === "customer_link"
    && JSON.stringify(none.retry) === '{"kind":"with_credential","credentials":["customer_link"]}', "no link in the mandate: not_now / CREDENTIAL_REQUIRED, readiness customer_link, retry [customer_link]");
  check([unknown, foreign, ended].every((r) => shape(r) === shape(none)), "an unknown link, another owner's link and an ended link get the very same answer (no customer oracle)");
  check(!h.isNever(dana.owner.id) && h.outbox.length === 0, "a setup failure: never `never`, no notice");
  keep("K6", [none]);
  const nocp = new Session(h, kiran); nocp.ritual(null, mandate(kiran, "account_servicing", ["bank.get_balance"], {}, { customer_link: { link_id: l.payload.link_id, link_digest: l.payload_digest } }), { actions: ["bank.get_balance"] });
  check(nocp.response()?.reason_code === "MANDATE_INVALID", "a mandate naming a customer link but not this bank among its counterparties is invalid");
  const s = ask(kiran, { customer_link: { link_id: l.payload.link_id, link_digest: l.payload_digest } });
  check(s.response()?.decision === "grant", "the linked customer's representative, with a mandate naming the link, is seated");
  keep("K6", [{ type: "invitation_response", decision: s.response()?.decision }]);
  const seat = s.response()?.seat;
  check(s.send(s.msg("act", { seat_id: seat.seat_id, tool: "bank.get_balance", arguments: {} }))[0]?.type === "act_result", "a balance read in the seat goes through");
  // Cooling-off and payments.
  const l3 = link(kiranOwner, { money_from: "2026-10-24T20:01:00Z" }); h.recordCustomerLink(l3);
  const pay = new Session(h, kiran); pay.ritual(null, mandate(kiran, "account_servicing", ["bank.submit_payment"], { max_amount: USD("100.00") }, { counterparties: [keys.principal.id], customer_link: { link_id: l3.payload.link_id, link_digest: l3.payload_digest } }),
    { actions: ["bank.submit_payment"], limits: { max_amount: USD("100.00") } });
  const ps = pay.response()?.seat;
  const early = pay.send(pay.msg("act", { seat_id: ps.seat_id, tool: "bank.submit_payment", arguments: { amount: USD("10.00"), payee_ref: "payee-landlord" } }));
  check(early[0]?.reason_code === "POLICY_DENY" && early[0].retry?.kind === "after" && early[0].retry.not_before === "2026-10-24T20:01:00Z", "no money moves before the link's cooling-off ends: not_now, retry after money_from");
  clock.advance(120);
  const later = pay.send(pay.msg("act", { seat_id: ps.seat_id, tool: "bank.submit_payment", arguments: { amount: USD("10.00"), payee_ref: "payee-landlord" } })); if (later[0]?.type !== "act_result") console.log(JSON.stringify(later[0])); check(later[0]?.type === "act_result", "after it, the payment within the mandate goes through");
  const acct = pay.send(pay.msg("act", { seat_id: ps.seat_id, tool: "bank.submit_payment", arguments: { amount: USD("10.00"), to: { account_number: "000123456789" } } }));
  if (acct[0]?.reason_code !== "CREDENTIAL_NOT_ACCEPTED") console.log(JSON.stringify(acct[0])); check(acct[0]?.reason_code === "CREDENTIAL_NOT_ACCEPTED", "an account number never travels: payees are the bank's own references");
  h.endCustomerLink(l3.payload.link_id);
  const after = pay.send(pay.msg("act", { seat_id: ps.seat_id, tool: "bank.submit_payment", arguments: { amount: USD("1.00"), payee_ref: "payee-landlord" } }));
  check(after[0]?.reason_code === "SEAT_SCOPE_EXCEEDED", "ending the link ends its open seats at once");
  const narrow = link(kiranOwner, { scope: { actions: ["bank.get_balance"] } }); h.recordCustomerLink(narrow);
  const sn = new Session(h, kiran); sn.ritual(null, mandate(kiran, "account_servicing", ["bank.submit_payment"], { max_amount: USD("5.00") }, { counterparties: [keys.principal.id], customer_link: { link_id: narrow.payload.link_id, link_digest: narrow.payload_digest } }),
    { actions: ["bank.submit_payment"], limits: { max_amount: USD("5.00") } });
  check(sn.response()?.decision === "deny" && sn.response()?.reason_code === "MANDATE_SCOPE_EXCEEDED", "an action outside the link's scope isn't served (the link never widens a mandate)");
  check(h.hostCardProblem() === null && c.card!.payload.org_approval?.approver.name === "Ren Okabe", "the bank's host card is signed by the bank's key with the record of the person who approved it");
});

// ------------------------------------------------------------------------------------------------ golden traces K1–K6
scenario("K-traces the golden traces K1–K6 agree with the reference", () => {
  const md = fs.readFileSync(new URL("../../../../conformance/golden-traces.md", import.meta.url), "utf8");
  const blocks: Record<string, any[]> = {}; let hd = "", inb = false, buf: string[] = [];
  for (const line of md.split("\n")) { if (!inb && /^## K\d/.test(line)) hd = line.slice(3).split(":")[0]; else if (!inb && /^##+ /.test(line)) hd = "";
    if (line.startsWith("```")) { if (inb && hd) { try { (blocks[hd] ??= []).push(JSON.parse(buf.join("\n"))); } catch { /* not json */ } } buf = []; inb = !inb; continue; } if (inb) buf.push(line); }
  check(["K1", "K2", "K3", "K4", "K5", "K6"].every((k) => blocks[k]?.length), "every K trace has a JSON block");
  const k1 = blocks.K1?.[0]?.find((m: any) => m.type === "invitation_response");
  check(k1?.reason_code === "CREDENTIAL_REQUIRED" && k1.readiness_requirements?.[0]?.code === "card_kind" && k1.readiness_requirements[0].owner_text.text === WRONG_KIND && JSON.stringify(k1.retry.credentials) === '["signed_card"]', "K1's refusal is the reference's, with the fixed sentence");
  const k5 = blocks.K5?.[0]; const held = k5?.find((m: any) => m.type === "act_held"); const conf = k5?.find((m: any) => m.type === "act_confirmation"); const res = k5?.find((m: any) => m.type === "act_result");
  check(!!held && conf?.consent?.$fixture !== undefined && res?.in_reply_to === held.in_reply_to && k5.some((m: any) => m.reason_code === "LIVE_PROMPT_PURCHASE_ONLY"), "K5 holds a purchase, confirms it, and refuses a non-purchase hold as the reference does");
  const k6 = blocks.K6?.[0]; const refusals = k6?.filter((m: any) => m.type === "invitation_response" && m.decision === "deny") ?? [];
  check(refusals.length >= 2 && refusals.every((r: any) => r.reason_code === "CREDENTIAL_REQUIRED" && r.readiness_requirements?.[0]?.code === "customer_link") && new Set(refusals.map((r: any) => JSON.stringify({ ...r, msg_id: 0, in_reply_to: 0, encounter_id: 0, to: 0, basis: 0, sent_at: 0, relationship_ref: 0 }))).size === 1, "K6's refusals with no link and with another owner's link are identical apart from addressing");
  const pick = (m: any) => m && JSON.stringify({ t: m.type, d: m.decision, x: m.disposition, c: m.reason_code, r: m.retry?.kind, rc: m.retry?.credentials, q: m.readiness_requirements?.map((y: any) => [y.code, y.required, y.owner_text?.text]), amt: m.amount, ok: m.ok });
  const live = (k: string, f: (m: any) => boolean) => (emitted[k] as any[] | undefined)?.find((m) => m && f(m));
  const pairs: [string, (m: any) => boolean][] = [["K1", (m) => m.type === "invitation_response"], ["K5", (m) => m.type === "act_held"], ["K5", (m) => m.type === "act_result"],
    ["K5", (m) => m.reason_code === "HOLD_LAPSED"], ["K5", (m) => m.reason_code === "LIVE_PROMPT_PURCHASE_ONLY"], ["K6", (m) => m.type === "invitation_response" && m.decision === "deny"]];
  for (const [k, f] of pairs) { const a = pick(blocks[k]?.[0]?.find(f)), b = pick(live(k, f)); check(!!a && a === b, `${k}: the trace's ${JSON.parse(a ?? '{"t":"?"}').t} (decision, disposition, reason, retry, readiness, owner_text) is what the reference sends`); }
  const k2 = JSON.stringify(blocks.K2 ?? []); const k3 = JSON.stringify(blocks.K3 ?? []); const k4 = JSON.stringify(blocks.K4 ?? []);
  check(k2.includes(PLACE_CARD_REPORTS.visitor_card) && k2.includes(PLACE_CARD_REPORTS.other_place), "K2 carries both fixed report sentences");
  check(k3.includes(PLACE_CARD_REPORTS.withdrawn) && k4.includes(PLACE_CARD_REPORTS.house_changed), "K3 and K4 carry their fixed report sentences");
});

// ------------------------------------------------------------------------------------------------ L1 (host-local, not on the wire)
scenario("L1 visits in progress move between instances: liveState / restoreLive (host-local, wire unchanged)", () => {
  const clock = clockAt(NOW); const keys = newKeys();
  const { h, cfg } = fernHost({ keys, clock, tweak: (c) => { c.policy.purchase_hold_s = 300; }, card: { duties: ["seat", "issue_passes", "receipts", "consider", "misconduct_notices", "hold_purchases"] } });
  const twin = () => new Host(cfg, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: FERN_ENTRY });
  const move = (from: Host, to: Host) => { to.restoreDurable(JSON.parse(JSON.stringify(from.durableState()))); to.restoreLive(JSON.parse(JSON.stringify(from.liveState()))); return to; };
  const aya = visitorCard("Aya Linden", { owner_prompts: "purchase_only", shown_to_owner: { text: "Aya Linden's representative may buy within the limits Aya signs, and may ask Aya live to approve a purchase; nothing else waits on Aya.", locale: "en-US" } });
  const m = mandate(aya, "purchase", ACTS, { max_amount: USD("50.00") });
  const s = new Session(h, aya); const hop = () => { s.h = move(s.h, twin()); };
  s.greet(); hop(); s.present(); hop(); s.receipt(); hop(); s.introduce(null, {}); hop(); s.request(m, { actions: ACTS, limits: { max_amount: USD("50.00") } }, {});
  const seat = s.response()?.seat;
  check(s.response()?.decision === "grant" && !!seat, "greeting, card, receipt, introduction and request each answered by a different instance: seated");
  hop();
  check(!!s.h.seats.get(seat.seat_id) && s.h.seats.get(seat.seat_id)!.spent === 0n, "the pass and its counts (amounts as integers) are in the restored instance");
  const r1 = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { amount: USD("30.00"), payment_ref: "o-1" } })); hop();
  const r2 = s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { amount: USD("30.00"), payment_ref: "o-2" } })); hop();
  check(r1[0]?.type === "act_result" && r1[0].ok && r2[0]?.type === "act_decision" && r2[0].decision === "deny", "spending under the pass is counted across instances: 30, then 30 more over a 50 cap is refused");
  const sent = s.transcript.map((o: any) => (o.message?.payload ?? o.message)?.msg_id);
  check(new Set(sent).size === sent.length && s.h.bootTag !== null, "a restored instance tags its msg_ids, so instances never send the same one (§2.2)");
  const h4 = s.h;
  check(JSON.stringify(h4.liveState()) === JSON.stringify(move(h4, twin()).liveState()), "liveState → restoreLive → liveState is exact");
  check(!JSON.stringify(h4.liveState()).includes(JSON.stringify(keys.rep).slice(1, 20)), "the live state holds no key material");
});

// ------------------------------------------------------------------------------------------------ L2 (host-local, not on the wire)
scenario("L2 pruning finished visits: HostOpts.retainS (host-local; what §3.6 keeps is kept)", () => {
  const clock = clockAt(NOW); const keys = newKeys();
  const { cfg } = fernHost({ keys, clock });
  // C281: a card with a revocation_url keeps the place's longer seat TTL (needed here so the pass outlives a 2-hour advance).
  // Prefetch an empty, reachable list so present/act are not refused as revocation_unreachable (C265).
  const revUrl = "https://aya.example/shokai/revocations";
  const fetched: FetchCache = new Map([[revUrl, { ok: true, at: NOW, body: [] }]]);
  const h = new Host(cfg, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: FERN_ENTRY, retainS: 3600, fetched });
  const aya = visitorCard("Aya Linden", { revocation_url: revUrl });
  const m = mandate(aya, "purchase", ACTS, { max_amount: USD("50.00") });
  const s = new Session(h, aya);
  s.greet(); s.present(); s.receipt(); s.introduce(null, {}); s.request(m, { actions: ACTS, limits: { max_amount: USD("50.00") } }, {});
  const seat = s.response()?.seat;
  const act = makeSigned(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: { amount: USD("20.00"), payment_ref: "o-1" } }), aya.rep, NOW);
  const r1 = s.sendRaw(act); s.send(s.msg("farewell", { outcome: "completed" }));
  check(r1[0]?.type === "act_result" && r1[0].ok && h.seenMeta.size > 0 && h.encTouched.has(s.enc), "seated and served; with retainS the place notes when each key was seen and each visit's last message");
  clock.advance(2 * 3600); const p1 = h.prune();
  check(p1.encounters === 0 && h.seats.has(seat.seat_id) && s.sendRaw(act).length === 0, "two hours after the farewell the pass is still live (§3.2: a seat outlives its encounter): nothing dropped, a replayed act is not handled again");
  const mkey = [...h.mandateUse.keys()][0]; const spent = h.mandateUse.get(mkey)!.spent;
  clock.advance((Date.parse(seat.expires_at) - Date.parse(clock.now())) / 1000 + 3600 + 301 + 1); const p2 = h.prune();
  check(p2.encounters === 1 && p2.seats === 1 && p2.admitted === 1 && !h.encounters.has(s.enc) && !h.seats.has(seat.seat_id), "an hour after the pass ends: its encounter, pass and counted act are dropped");
  check(h.usedNonces.size === 1 && h.records.size > 0, "the greeting nonce (§2.4: the receipts' lifetime, up to 7 days) and the relationship record (§9) are kept");
  const r2 = s.sendRaw(act);
  check(!r2.some((x: any) => x.type === "act_result" && x.ok) && (!h.mandateUse.has(mkey) || h.mandateUse.get(mkey)!.spent === spent), "the act replayed after the prune finds no pass: refused, nothing counted again");
  const d = JSON.parse(JSON.stringify(h.durableState())); const h2 = new Host(cfg, keys.rep, keys.principal, new RealVerifier(), clock.now, { entryUrl: FERN_ENTRY, retainS: 3600 }); h2.restoreDurable(d);
  check(JSON.stringify(h2.durableState().seen_meta) === JSON.stringify(d.seen_meta) && JSON.stringify(h2.durableState().mandate_use) === JSON.stringify(d.mandate_use), "seen times and mandate expiries survive durableState → restoreDurable");
  clock.advance(8 * 86400); h.prune();
  check(h.usedNonces.size === 0 && h.seenMsgs.size === 0 && h.mandateUse.get(mkey)?.spent === spent, "a week later the nonce is dropped; the mandate, valid to the end of December, keeps its count (§5.1, C175)");
  clock.advance(70 * 86400); h.prune();
  check(h.mandateUse.size === 0, "once the mandate has expired (plus skew and the retention), its count is dropped too");
  const off = fernHost({ keys: newKeys(), clock: clockAt(NOW) }).h; const so = new Session(off, visitorCard("Ben Okafor")); so.greet(); so.present();
  check(off.encTouched.size === 0 && off.seenMeta.size === 0 && !("seen_meta" in off.durableState()) && !("enc_touched" in off.liveState()), "without retainS nothing new is kept (the golden traces' state is unchanged)");
});

if (emit) console.log(JSON.stringify(emitted, null, 2));
console.log(`${pass} v0.4.0 checks passed, ${fail} failed`);
if (fail) process.exit(1);
