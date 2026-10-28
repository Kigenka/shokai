// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.3.0-rc4 conformance checks (2026-10-27): card revocation, durable state and refuse-on-loss, the act check order and counting,
// the WebAuthn profile (crossOrigin, topOrigin, batch), per-place owner identity and OwnerLink (C191–C196).
// Real crypto, fresh fictional keys only (Fernwood Outfitters; visitors Dana and Pia are fictional).
import { appendFileSync } from "node:fs"; // SHOKAI_CHECK_LOG lists each check for scripts/suite-split.mjs (no effect otherwise)
import { fernwood, makeHost, newKeys, inboundDoor } from "../src/places.js";
import { doorPointer, ownAddressOf } from "../src/door.js";
import { Host } from "../src/host.js";
import { RealVerifier } from "../src/verify.js";
import { testJudge, verifyDoorPolicy, nameKey, DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT } from "../src/inbound.js";
import { makeSigned, digestOf, newPasskeyOwner, newEd25519, signPasskey, signPasskeyBatch, signPasskeyWith, checkSig, resolveDid, batchDigest, type PasskeyOwner } from "../src/crypto.js";
import { verifyOwnerLink } from "../src/trust.js";
import type * as S from "../src/shapes.js";
import { Session, visitor, mandate, clockAt, NOW, signBy, vouch, type Visitor } from "./kit.js";

let pass = 0, fail = 0; let cur = "";
function scenario(name: string, f: () => void) { cur = name; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v030rc4", group: cur, what, ok: c }) + "\n"); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }
const USD = (value: string) => ({ value, currency: "USD" });
const ACTS = ["store.browse_catalog", "store.place_order"];
const host = (keys = newKeys(), opts = {}) => { const clock = clockAt(NOW); return makeHost(fernwood, keys, new Map(), clock.now, opts); };
const cardRevocation = (v: { owner: any; card: S.SignedCard }, extra: Partial<S.CardRevocation> = {}): S.Signed<S.CardRevocation> =>
  signBy(v.owner, { card_id: v.card.payload.card_id, card_digest: v.card.payload_digest, principal_id: v.owner.id, revoked_at: NOW, reason: "key_compromise", ...extra } as S.CardRevocation);
const firstResponse = (s: Session) => s.transcript.map((o: any) => o.message?.payload ?? o.message).find((x: any) => x.type === "invitation_response");
const deliver = (s: Session, rev: S.Signed<S.CardRevocation>) => s.send(s.msg("card_revocation", { revocation: rev }));
const isRevokedDeny = (r: any) => r?.decision === "deny" && r.disposition === "not_now" && !r.reason_code && r.retry?.kind === "with_credential" && JSON.stringify(r.retry.credentials) === '["signed_card"]';

scenario("RC4-R1 a card its principal revoked is refused as not_now, with nothing recorded against anyone (C191)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ["store.browse_catalog"]);
  const s0 = new Session(h, dana); s0.ritual(null, m, { actions: ["store.browse_catalog"] });
  check(s0.response()?.decision === "grant", "before revocation Dana's card is seated");
  const eve = visitor("Eve", "person", { purposes: ["purchase"], actions: ACTS });
  const fake = signBy(eve.owner, { card_id: dana.card.payload.card_id, principal_id: dana.owner.id, revoked_at: NOW } as S.CardRevocation);
  const sx = new Session(h, eve); sx.greet(); deliver(sx, fake);
  const s1 = new Session(h, dana); s1.ritual(null, m, { actions: ["store.browse_catalog"] });
  check(s1.response()?.decision === "grant", "a revocation signed by someone other than the card's principal is ignored");
  const s2 = new Session(h, eve); s2.greet(); const out = deliver(s2, cardRevocation(dana));
  check(out.length === 0, "a delivered card_revocation is accepted from anyone (here: another visitor's encounter) and not answered");
  const s3 = new Session(h, dana); s3.greet(); s3.present();
  check(isRevokedDeny(firstResponse(s3)), "the revoked card is now refused: deny / not_now, no reason code, retry with_credential [signed_card]");
  const thief = new Session(h, dana); thief.greet(); const bad = { ...dana.card };
  thief.present(bad, visitor("X", "person", { purposes: [], actions: [] }).rep);   // a well-formed proof by the wrong key
  check(isRevokedDeny(firstResponse(thief)), "a failing possession proof on a revoked card is still not_now (revocation is checked before the proof)");
  check(!h.isNever(dana.owner.id) && !h.isNever(dana.rep.id), "… so a thief with a revoked card never gets the real owner bound here");
  const dana2 = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS }, { owner: dana.owner as PasskeyOwner });
  const s4 = new Session(h, dana2); s4.ritual(null, mandate(dana2, "purchase", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s4.response()?.decision === "grant", "the owner's new card (new representative key) is seated: the revocation named one card");
  const other = cardRevocation(dana, { card_digest: "sha-256:" + "A".repeat(43) });
  const h2 = host(); const s5 = new Session(h2, eve); s5.greet(); deliver(s5, other);
  const s6 = new Session(h2, dana); s6.ritual(null, m, { actions: ["store.browse_catalog"] });
  check(s6.response()?.decision === "grant", "a revocation naming another card_digest doesn't revoke this version of the card");
});

scenario("RC4-R2 the card's revocation_url: listed → refused; unreachable → not_now retry after; empty → fine (C191)", () => {
  const url = "https://owners.example/shokai/cards/revoked";
  const mk = () => { const d = visitor("Pia", "person", { purposes: ["purchase"], actions: ACTS }); const o = d.owner as PasskeyOwner;
    const card = signBy(o, { ...d.card.payload, revocation_url: url } as S.RepresentativeCard); return { ...d, card }; };
  const pia = mk(); const m = mandate(pia, "purchase", ["store.browse_catalog"]);
  const run = (body: unknown | null) => { const h = host(); if (body !== null) h.fetched.set(url, { ok: true, at: NOW, body }); const s = new Session(h, pia); s.ritual(null, m, { actions: ["store.browse_catalog"] }); return firstResponse(s); };
  check(run([])?.decision === "grant", "an empty list: the card is seated");
  check(isRevokedDeny(run([cardRevocation(pia)])), "the card's own signed revocation in the list → refused like a delivered one");
  const forged = signBy(visitor("Eve", "person", { purposes: [], actions: [] }).owner, { card_id: pia.card.payload.card_id, principal_id: pia.owner.id, revoked_at: NOW } as S.CardRevocation);
  check(run([forged])?.decision === "grant", "an entry not signed by the card's principal is skipped");
  const un = run(null);
  check(un?.decision === "deny" && un.disposition === "not_now" && un.retry?.kind === "after" && Date.parse(un.retry.not_before) - Date.parse(NOW) <= 86400e3, "a list the place couldn't fetch → not_now, retry after (at most a day): fail closed, a setup failure");
});

scenario("RC4-D1 durable state: mandate ledgers, nevers and spent nonces survive a restart (C192)", () => {
  const keys = newKeys(); const h = host(keys); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ["store.browse_catalog"], { max_operations: 2 });
  const s = new Session(h, dana); s.ritual(null, m, { actions: ["store.browse_catalog"], limits: { max_operations: 2 } }); const seat = s.response()?.seat;
  check(s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.browse_catalog", arguments: {} }))[0]?.type === "act_result", "one of the mandate's two operations used");
  h.bindNever("did:key:z6MkfictionalBoundVisitor");
  const saved = JSON.parse(JSON.stringify(h.durableState()));
  check(!JSON.stringify(saved).includes("PRIVATE") && !JSON.stringify(saved).includes("priv"), "the saved state holds no private keys");
  const h2 = host(keys); h2.restoreDurable(saved);
  check(h2.isNever("did:key:z6MkfictionalBoundVisitor"), "a never binding is still in force after the restart");
  const t = new Session(h2, dana); t.ritual(null, m, { actions: ["store.browse_catalog"], limits: { max_operations: 2 } }); const seat2 = t.response()?.seat;
  const a1 = t.send(t.msg("act", { seat_id: seat2.seat_id, tool: "store.browse_catalog", arguments: {} }))[0];
  const a2 = t.send(t.msg("act", { seat_id: seat2.seat_id, tool: "store.browse_catalog", arguments: {} }))[0];
  check(a1?.type === "act_result" && a2?.type === "act_decision" && a2.reason_code === "SEAT_SCOPE_EXCEEDED", "the same mandate after the restart has one operation left, not two");
  check(saved.used_nonces.length > 0 && saved.used_nonces.every(([k]: [string]) => h2.usedNonces.has(k)) && saved.mandate_use.length === 1, "spent nonces and the mandate ledger are carried over");
});

scenario("RC4-D2 refuse-on-loss: a place that lost its state refuses mandates valid before it (C192)", () => {
  const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const old = mandate(dana, "purchase", ["store.browse_catalog"], { max_operations: 2 });
  const h = host(newKeys(), { stateEpoch: NOW });
  const s = new Session(h, dana); s.ritual(null, old, { actions: ["store.browse_catalog"] }); const r = s.response();
  check(r?.decision === "deny" && r.disposition === "not_now" && r.reason_code === "MANDATE_INVALID" && JSON.stringify(r.retry?.credentials) === '["signed_mandate"]', "a mandate valid from before the state epoch → MANDATE_INVALID, retry [signed_mandate]");
  const fresh = mandate(dana, "purchase", ["store.browse_catalog"], { max_operations: 2 }, { valid_from: NOW });
  const t = new Session(h, dana); t.ritual(null, fresh, { actions: ["store.browse_catalog"] });
  check(t.response()?.decision === "grant", "a new mandate valid from now is counted from zero and seated");
  const just = mandate(dana, "purchase", ["store.browse_catalog"], {}, { valid_from: new Date(Date.parse(NOW) - 60e3).toISOString().replace(".000Z", "Z") });
  const u = new Session(h, dana); u.ritual(null, just, { actions: ["store.browse_catalog"] });
  check(u.response()?.reason_code === "MANDATE_INVALID", "the epoch has no skew allowance: a mandate dated a minute before it is refused too");
  const ahead = mandate(dana, "purchase", ["store.browse_catalog"], {}, { valid_from: new Date(Date.parse(NOW) + 120e3).toISOString().replace(".000Z", "Z") });
  const w = new Session(h, dana); w.ritual(null, ahead, { actions: ["store.browse_catalog"] });
  check(w.response()?.reason_code === "MANDATE_INVALID", "with an epoch, a mandate dated 2 minutes ahead of the place's clock is refused (no forward skew), so it can't have been used before a later restart");
  const h1 = host(); const x = new Session(h1, dana); x.ritual(null, ahead, { actions: ["store.browse_catalog"] });
  check(x.response()?.decision === "grant", "without an epoch the §2.2 skew still applies: the same mandate is seated");
  const h0 = host(); const v = new Session(h0, dana); v.ritual(null, old, { actions: ["store.browse_catalog"] });
  check(v.response()?.decision === "grant", "without stateEpoch (durable state) the old mandate is seated");
});

scenario("RC4-O1 the act check order: seat first, then amount form, spending cap, allowlist, amount, limits (C193)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const s = new Session(h, dana); s.ritual(null, mandate(dana, "purchase", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] }); const seat = s.response()?.seat;
  const act = (seat_id: string, tool: string, args: any) => s.send(s.msg("act", { seat_id, tool, arguments: args })).find((x: any) => x.type === "act_decision" || x.type === "act_result");
  const u = act("seat-none", "store.place_order", { amount: { value: "1,00", currency: "usd" } });
  check(u?.type === "act_decision" && u.disposition === "not_a_fit" && u.reason_code === "SEAT_SCOPE_EXCEEDED", "no seat + a malformed amount → the door's not_a_fit / SEAT_SCOPE_EXCEEDED, never REQUEST_INCOMPLETE or tool output");
  const f = act(seat.seat_id, "store.browse_catalog", { amount: { value: "1,00", currency: "USD" } });
  check(f?.type === "act_decision" && f.reason_code === "REQUEST_INCOMPLETE", "in the seat, a malformed amount → REQUEST_INCOMPLETE");
  const p = act(seat.seat_id, "store.place_order", { amount: USD("1.00") });
  check(p?.type === "act_decision" && p.disposition === "not_now" && p.reason_code === "SEAT_SCOPE_EXCEEDED", "money in a seat without max_amount → not_now / SEAT_SCOPE_EXCEEDED (before the allowlist; trace G7)");
  const w = act(seat.seat_id, "store.gift_wrap", {});
  check(w?.type === "act_decision" && w.disposition === "not_a_fit", "a free tool outside the allowlist → not_a_fit");
  check(act(seat.seat_id, "store.browse_catalog", {})?.type === "act_result", "only an act that passes every check reaches the place's service");
});

scenario("RC4-C1 every admitted act counts one operation; a service refusal releases operation and amount together (C194)", () => {
  const h = host(); const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(dana, "purchase", ACTS, { max_amount: USD("10.00"), max_operations: 2 });
  const s = new Session(h, dana); s.ritual(null, m, { actions: ACTS, limits: { max_amount: USD("10.00"), max_operations: 2 } }); const seat = s.response()?.seat;
  const act = (tool: string, args: any) => { const msg = s.msg("act", { seat_id: seat.seat_id, tool, arguments: args }); return { msg, r: s.send(msg)[0] }; };
  check(act("store.browse_catalog", {}).r?.type === "act_result", "a non-spending act is admitted …");
  const o = act("store.place_order", { sku: "tin", amount: USD("8.00"), payment_ref: "p1" });
  check(o.r?.type === "act_result", "… and a spending one");
  check(act("store.browse_catalog", {}).r?.reason_code === "SEAT_SCOPE_EXCEEDED", "the non-spending act counted: a third act is past max_operations 2");
  check(h.releaseAct(dana.rep.id, o.msg.msg_id), "the service refused the order (out of stock): the place releases it");
  check(!h.releaseAct(dana.rep.id, o.msg.msg_id), "a release happens once");
  const o2 = act("store.place_order", { sku: "tin", amount: USD("9.00"), payment_ref: "p1" });
  check(o2.r?.type === "act_result", "both were released: one operation is free again and 9.00 fits the 10.00 cap; the refused part isn't structuring");
  check(act("store.browse_catalog", {}).r?.type === "act_decision", "and the count is back at its limit");
});

scenario("RC4-W1 the owner signing profile: exact origin, no crossOrigin, no topOrigin; optional batch (C195)", () => {
  const o = newPasskeyOwner(); const k = resolveDid(o.id)!; const d = digestOf({ fictional: "item", n: 1 });
  check(checkSig(signPasskey(o, d, NOW), d, k, o.rpId).ok, "a plain assertion verifies");
  check(checkSig(signPasskeyWith(o, d, NOW, { crossOrigin: false }), d, k, o.rpId).ok, "crossOrigin: false is allowed");
  check(checkSig(signPasskeyWith(o, d, NOW, { crossOrigin: true }), d, k, o.rpId).why === "cross_origin", "crossOrigin: true (signed inside another site's frame) is refused");
  check(checkSig(signPasskeyWith(o, d, NOW, { topOrigin: "https://elsewhere.example" }), d, k, o.rpId).why === "top_origin", "a topOrigin is refused");
  check(!checkSig(signPasskeyWith(o, d, NOW, {}, "https://" + o.rpId + ":8443"), d, k, o.rpId).ok, "an origin with a port isn't the exact origin");
  const ds = [1, 2, 3].map((n) => digestOf({ fictional: "item", n }));
  const b = signPasskeyBatch(o, ds, NOW);
  check(b.every((sg, i) => checkSig(sg, ds[i], k, o.rpId).ok), "one tap over three items: each item's signature verifies at its batch_index");
  check(!checkSig(b[0], ds[1], k, o.rpId).ok, "a batch signature doesn't verify for another item of the batch at the wrong index");
  check(!checkSig(b[0], digestOf({ other: true }), k, o.rpId).ok, "… nor for an item not in the batch");
  const one = signPasskeyBatch(o, [ds[0]], NOW)[0]; check(!checkSig(one, ds[0], k, o.rpId).ok, "a batch of one is refused (sign it alone)");
  const dup = signPasskeyBatch(o, [ds[0], ds[0]], NOW)[0]; check(!checkSig(dup, ds[0], k, o.rpId).ok, "a batch with a repeated item is refused");
  const many = Array.from({ length: 17 }, (_, n) => digestOf({ n })); check(!checkSig(signPasskeyBatch(o, many, NOW)[0], many[0], k, o.rpId).ok, "more than 16 items is refused");
  check(batchDigest(ds) === digestOf({ batch: ds }), "the batch challenge is digest(JCS({batch:[…]}))");
});

scenario("RC4-F1 per-place owner identity and OwnerLink: unlinked by default, joined for one place only with both passkeys (C196)", () => {
  const h = host(); const tea = newPasskeyOwner(); const shop = newPasskeyOwner();   // one person, two passkeys (two per-place identities)
  const atShop = visitor("Dana", "person", { purposes: ["purchase"], actions: ACTS }, { owner: shop });
  check(tea.id !== shop.id, "two places see two unrelated owner DIDs");
  const mk = (extra: Partial<S.OwnerLink> = {}, signers: PasskeyOwner[] = [tea, shop]): S.Signed<S.OwnerLink> => {
    const payload: S.OwnerLink = { link_id: "link-1", owners: [tea.id, shop.id], audience: h.cfg.principal_id, issued_at: NOW, expires_at: "2026-12-01T00:00:00Z", ...extra };
    const d = digestOf(payload); return { payload, payload_digest: d, signatures: signers.map((o) => signPasskey(o, d, NOW)) };
  };
  const rpOf = () => "owners.example";
  check(verifyOwnerLink(h.verifier, mk(), { audience: h.cfg.principal_id, principal: shop.id, now: NOW, rpOf }).ok, "a link both passkeys signed, for this place, verifies");
  check((verifyOwnerLink(h.verifier, mk({}, [shop]), { audience: h.cfg.principal_id, principal: shop.id, now: NOW, rpOf } ) as any).why === "signature", "signed by one passkey only → refused");
  check((verifyOwnerLink(h.verifier, mk({ audience: "did:web:another-place.example" }), { audience: h.cfg.principal_id, principal: shop.id, now: NOW, rpOf } ) as any).why === "audience", "a link for another place → refused");
  check((verifyOwnerLink(h.verifier, mk({ expires_at: "2028-12-01T00:00:00Z" }), { audience: h.cfg.principal_id, principal: shop.id, now: NOW, rpOf } ) as any).why === "lifetime", "a link longer than 400 days → refused");
  h.bindNever(tea.id);
  const m = mandate(atShop, "purchase", ["store.browse_catalog"]);
  const s = new Session(h, atShop); s.ritual(null, m, { actions: ["store.browse_catalog"] });
  check(s.response()?.decision === "grant", "unlinked, the other identity's history doesn't follow (that is the privacy the owner chose)");
  const t = new Session(h, atShop); t.ritual(null, m, { actions: ["store.browse_catalog"] }, { owner_link: mk() });
  check(t.response()?.decision === "deny" && t.response()?.disposition === "never", "linked, it does: a link can't be used to launder a never");
  void USD;
});

scenario("RC4-R5 revoking a card ends every open seat it holds; the owner's new card is unaffected (C198)", () => {
  const h = host(); const theo = visitor("Theo", "person", { purposes: ["purchase"], actions: ACTS });
  const m = mandate(theo, "purchase", ["store.browse_catalog"]);
  const s = new Session(h, theo); s.ritual(null, m, { actions: ["store.browse_catalog"] }); const seat = s.response()?.seat;
  const s2 = new Session(h, theo); s2.ritual(null, m, { actions: ["store.browse_catalog"] }); const seat2 = s2.response()?.seat;
  const act = (ss: Session, seat_id: string) => ss.send(ss.msg("act", { seat_id, tool: "store.browse_catalog", arguments: {} })).find((x: any) => x.type === "act_decision" || x.type === "act_result");
  check(!!seat && !!seat2 && act(s, seat.seat_id)?.type === "act_result", "two open seats under one card; an act before the revocation succeeds");
  const theo2 = visitor("Theo", "person", { purposes: ["purchase"], actions: ACTS }, { owner: theo.owner as PasskeyOwner });
  const sb = new Session(h, theo2); sb.ritual(null, mandate(theo2, "purchase", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] }); const seatB = sb.response()?.seat;
  const sx = new Session(h, visitor("Eve", "person", { purposes: [], actions: [] })); sx.greet();
  const fake = signBy(visitor("Mal", "person", { purposes: [], actions: [] }).owner, { card_id: theo.card.payload.card_id, principal_id: theo.owner.id, revoked_at: NOW } as S.CardRevocation);
  deliver(sx, fake);
  check(act(s, seat.seat_id)?.type === "act_result", "a revocation the card's principal didn't sign ends nothing");
  const out = deliver(sx, cardRevocation(theo, { reason: "superseded" }));
  check(out.length === 0, "the owner's revocation is accepted from anyone, in any encounter, and not answered");
  const d1 = act(s, seat.seat_id), d2 = act(s2, seat2.seat_id);
  check(d1?.type === "act_decision" && d1.decision === "deny" && d1.disposition === "not_now" && !d1.reason_code && d1.retry?.kind === "with_credential" && JSON.stringify(d1.retry.credentials) === '["signed_card"]',
    "an act in a seat the revoked card holds is refused: deny / not_now, no reason code, retry with_credential [signed_card]");
  check(d2?.type === "act_decision" && d2.decision === "deny", "… in every open seat that card holds, not only one");
  check(!h.isNever(theo.owner.id) && !h.isNever(theo.rep.id), "ending the seats binds nothing (a revocation is never misconduct)");
  check(!!seatB && act(sb, seatB.seat_id)?.type === "act_result", "the owner's new card (same owner, new key) keeps its own seat");
});

scenario("RC4-R6 names are claims, never identity: a famous name earns nothing and the place's report says 'claims to be' (C199)", () => {
  const h = host();
  const mira = visitor("Mira Castellane", "person", { purposes: ["purchase"], actions: ACTS });       // the fictional champion's own card
  const fake = visitor("Mira Castellane", "person", { purposes: ["purchase"], actions: ACTS });       // an impersonator: same name, its own keys
  const s1 = new Session(h, mira); s1.ritual(null, mandate(mira, "purchase", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  const s2 = new Session(h, fake); s2.ritual(null, mandate(fake, "purchase", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  const ref1 = s1.response()?.relationship_ref, ref2 = s2.response()?.relationship_ref;
  check(!!ref1 && !!ref2 && ref1 !== ref2, "two cards with the same display name are two principals: separate relationship records (keyed by the owner DID)");
  const text = h.report(s2.enc).voice?.text ?? "";
  check(/the owner with key …\S{8} \(claims to be "Mira Castellane"; not verified\)/.test(text) && !/I met Mira Castellane/.test(text),
    "the place's report to its owner names the visitor by key and shows the famous name only as 'claims to be'");
});

scenario("RC4-A1 a 404 at a place's own address names that place, even an unlisted door, and no other (C200, C163)", () => {
  const base = "http://127.0.0.1:1/shokai"; const fern = host();
  const owner = newPasskeyOwner(); const rep = newEd25519();
  const door = new Host(inboundDoor(rep, owner, "Kiran Vale", { judge: testJudge }), rep, null, new RealVerifier(), clockAt(NOW).now, {});
  const hosts: Record<string, Host> = { [fern.cfg.name]: fern, [door.cfg.name]: door }; const find = (n: string) => (Object.hasOwn(hosts, n) ? hosts[n] : undefined);
  const plain = doorPointer(base, Object.values(hosts));
  check(plain.here === undefined && plain.places.map((p) => p.name).join() === fern.cfg.name, "the ordinary pointer lists only the advertised place; the unlisted door is absent and there is no `here` (C163)");
  const at = (path: string) => doorPointer(base, Object.values(hosts), ownAddressOf(path.split("/").filter(Boolean), find));
  const d = at(`/places/${door.cfg.name}/entry`);
  check(d.here?.name === door.cfg.name && d.here?.entry === `${base}/places/${door.cfg.name}/entry` && d.here?.method === "POST" && d.places.every((p) => p.name !== door.cfg.name),
    "GET at the unlisted door's own entry: `here` names that door with method POST, and `places` still doesn't list it");
  check(at(`/places/${door.cfg.name}/inbox`).here?.name === door.cfg.name && at(`/places/${fern.cfg.name}/lobby`).here?.name === fern.cfg.name, "its lobby and inbox are its own addresses too, for any place");
  check([`/places/${door.cfg.name}/state`, "/places/no-such/entry", "/places/__proto__/entry", "/places/constructor/entry", "/no/such", `/places/${door.cfg.name}`].every((p) => at(p).here === undefined),
    "any other address, an unknown name, or a name like __proto__: no `here`, so nothing about another place is said");
});

scenario("RC4-N1 a visitor claiming the door owner's own name under another key: refused by default and asked for an introduction, the owner told at once; seat_as_stranger is the opt-in (C201)", () => {
  const scope = { purposes: ["presentation" as const, "gift" as const], actions: [DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT] };
  const door = (o: Record<string, unknown> = {}) => { const owner = newPasskeyOwner(); const rep = newEd25519(); const noor = newPasskeyOwner(); const logs = new Map();
    const h = new Host(inboundDoor(rep, owner, "Kiran Vale", { trusted_introducers: [noor.id], judge: testJudge, ...o }), rep, null, new RealVerifier(), clockAt("2026-11-02T18:00:00Z").now, { fetched: logs });
    return { h, owner, noor, logs }; };
  const knock = (h: Host, v: Visitor, vch: S.SignedVouch | null = null) => { const s = new Session(h, v); s.ritual(vch, mandate(v, "presentation", [DOOR_PRESENT]), { actions: [DOOR_PRESENT] }); return s; };
  const withRole = (v: Visitor, role: string): Visitor => ({ ...v, card: signBy(v.owner, { ...v.card.payload, role }) });
  const isAskForIntro = (r: any) => r?.decision === "deny" && r.disposition === "not_now" && r.reason_code === "POLICY_DENY" && r.retry?.kind === "with_credential" && JSON.stringify(r.retry.credentials) === '["vouch"]';
  // the default (no setting): refused not_now and asked for an introduction, never `never`; the owner hears at once, by key; the visitor learns nothing of the alert
  const d = door(); check(d.h.cfg.door!.policy.payload.public.own_name_visitors === undefined, "the default policy carries no own_name_visitors (absent = refuse)");
  const corwin = visitor("Kiran Vale", "person", scope);
  const s = knock(d.h, corwin); const r = s.response(); const al = d.h.ownerAlerts.at(-1);
  check(isAskForIntro(r) && !JSON.stringify(s.transcript).includes('"never"') && d.h.ownerAlerts.length === 1 && al?.code === "own_name_used" && al.handled === "refused" && al.visitor_principal === corwin.owner.id
    && al.visitor_representative === corwin.rep.id && al.encounter_id === s.enc, "by default the namesake is refused not_now and asked for a vouch (never `never`: a real namesake exists), and the owner gets an own_name_used alert naming its verified keys");
  const voice = d.h.report(s.enc).voice?.text ?? "";
  check(/Someone used your name here: the owner with key …\S{8} \(claims to be "Kiran Vale"; not verified\); I didn't let them in, and asked them for an introduction/.test(voice), "the report home says so in plain words, naming the visitor by key: " + voice.slice(-170));
  check(!JSON.stringify(s.transcript).includes("own_name") && !JSON.stringify(s.transcript).includes("Someone used your name"), "the visitor learns nothing about the alert (it is owner-facing, off the wire)");
  // the comparison: case, accents, spacing, invisible characters, and a role naming the owner; a different name or the owner's own principal: no alert
  const n0 = d.h.ownerAlerts.length;
  for (const nm of ["KIRAN  VALE", "Kíran Vale", "Kiran\u200b Vale"]) knock(d.h, visitor(nm, "person", scope));
  knock(d.h, withRole(visitor("Corwin Thale", "person", scope), "On behalf of Kiran Vale"));
  check(d.h.ownerAlerts.length === n0 + 4 && d.h.ownerAlerts.slice(n0).every((x) => x.handled === "refused") && nameKey("Kíran  VALE") === nameKey("kiran vale"), "case, accents, extra spaces, invisible characters, and a role 'On behalf of Kiran Vale' all count as her name, and are refused");
  const n1 = d.h.ownerAlerts.length; const other = knock(d.h, visitor("Kiran Valen", "person", scope)).response(); const self = knock(door().h, visitor("Kiran Vale", "person", scope, { owner: d.owner }));
  check(d.h.ownerAlerts.length === n1 && other?.decision === "grant", "a different name raises nothing and is judged as usual; neither does the owner's own principal (her own card, another representative)"); void self;
  // a genuine namesake introduced by someone the door trusts is seated, and the owner still hears of it
  const namesake = visitor("Kiran Vale", "person", scope); const vch = vouch(d.noor, "Noor Halloran", namesake, ["presentation", "gift"], d.logs, undefined, undefined, { introducer_interest: "none" });
  const nsr = knock(d.h, namesake, vch).response();
  check(nsr?.decision === "grant" && d.h.ownerAlerts.at(-1)?.handled === "treated_as_stranger", "a namesake introduced by an introducer the door trusts is seated, and the owner still hears of it");
  // opt-in: seat_as_stranger judges it exactly as a stranger; the owner still hears at once
  const o = door({ own_name_visitors: "seat_as_stranger" }); const so = knock(o.h, visitor("Kiran Vale", "person", scope));
  check(so.response()?.decision === "grant" && o.h.ownerAlerts.at(-1)?.handled === "treated_as_stranger" && /I treated them as a stranger/.test(o.h.report(so.enc).voice?.text ?? ""),
    "with own_name_visitors: \"seat_as_stranger\" (the owner's opt-in) it is judged as a stranger, and the owner is still alerted");
  const bad = (v: string) => { const b = door({ tamper: (p: S.DoorPolicy) => ({ ...p, public: { ...p.public, own_name_visitors: v as any } }) });
    return verifyDoorPolicy(b.h.verifier, b.h.cfg.door!.policy, { owner_id: b.owner.id, rep_id: b.h.cfg.rep_id, rpId: b.owner.rpId, now: "2026-11-02T18:00:00Z" }).ok; };
  check(!bad("maybe") && !bad("seat") && bad("refuse") && bad("seat_as_stranger"), "only \"refuse\" and \"seat_as_stranger\" are valid own_name_visitors values");
});

console.log(`${pass} v0.3.0-rc4 checks passed, ${fail} failed`);
if (fail) process.exit(1);
