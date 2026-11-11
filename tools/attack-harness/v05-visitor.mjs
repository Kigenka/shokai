// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team round 3 (Shōkai 0.5, 2026-11-11), visitor side: F1-04/05 proof replay/relay, F2-01..05 host-card spoofing, and a re-check of
// F7-04 on the SDK door, all against the SDK's visiting representative (createRepresentative().visit) with a hostile transport.
// In process; ephemeral keys; fictional people and places. Adds tests only; changes no protocol or SDK code.
import { join } from "node:path";
import { K, rec, ROOT } from "./lib.mjs";
const SDK = await import(join(ROOT, "packages/shokai/dist/src/index.js"));
const CR = await import(join(ROOT, "packages/shokai/dist/src/core/crypto.js"));
const fam = (n) => `F${n}`;
const opts = (o = {}) => ({ approvedBy: { name: "Ines Moor", role: "Owner" }, name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "inquiry", statement: "Questions about our teas." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });
const ERR = { purpose: "inquiry", actions: ["concierge.talk"] };
const pay = (m) => m?.payload ?? m;
const outTypes = (v) => v.transcript.filter((m) => m.dir === "out").map((m) => pay(m.message)?.type);
const sentCard = (v) => outTypes(v).includes("card_presentation");
const asked = (v) => outTypes(v).includes("invitation_request");
const ended = (v) => !v.seated && !asked(v);
const why = (v) => `seated=${v.seated}; ok=${v.placeCheck?.ok}; "${String(v.placeCheck?.why ?? "").slice(0, 100)}"; out=[${outTypes(v).join(",")}]`;
const tap = (post, { onReply, onSend, getJson } = {}) =>
  Object.assign(async (u, b) => { const body = onSend ? await onSend(u, b) : b; const r = await post(u, body); return onReply ? onReply(r) : r; }, { getJson });

// A memory-only door refuses a mandate valid before it started (§3.6), and a representative keeps its errand's mandate (C175),
// so every door and the first visit are made before anything else.
const door = SDK.createDoor(opts());
const lookalike = SDK.createDoor(opts());                                                  // same name and display name, its own keys
const twin = SDK.createDoor(opts({ keys: door.keys, displayName: "Kettle & Leaf (new menu)" })); // same keys, another house config
const annex = SDK.createDoor(opts({ keys: door.keys, name: "kettle-annex" }));             // same keys, another entry
const otherRepKey = SDK.generateRepresentativeKey();
const otherRep = SDK.createDoor(opts({ keys: { rep: otherRepKey, principal: door.keys.principal } })); // same principal, another representative key
const P = door.listing().places[0];
const realDoor = SDK.inProcess(door);
const mio = SDK.createRepresentative({ ownerName: "Mio Tanabe", purposes: ["inquiry"], actions: ["concierge.talk"] });
const rin = SDK.createRepresentative({ ownerName: "Rin Ashdown", purposes: ["inquiry"], actions: ["concierge.talk"] });

// A clean first visit, capturing the host's signed card_presentation for replay.
let recordedCard = null;
const capture = tap(realDoor, { getJson: realDoor.getJson, onReply: (r) => { for (const m of r.messages) if (pay(m)?.type === "card_presentation") recordedCard = m; return r; } });
const v1 = await mio.visit(P, { ...ERR, transport: capture });

{ // F1-04: the host's recorded card_presentation (its proof is over visit 1's nonce) replayed into a fresh visit, to Mio and to Rin.
  const replay = (d) => tap(realDoor, { getJson: realDoor.getJson, onReply: (r) => ({ ...r, messages: r.messages.map((m) => pay(m)?.type === "card_presentation" ? recordedCard : m) }) });
  const again = await mio.visit(P, { ...ERR, transport: replay() });
  const toRin = await rin.visit(P, { ...ERR, transport: replay() });
  rec({ id: "V05-F1-04", cat: fam(1), sev: "high", title: "Host card_presentation replayed from an earlier encounter into a new visit",
    tried: "the host's signed card_presentation from visit 1 (proof over visit 1's nonce, audience Mio) served again in a later visit to Mio and to Rin",
    expected: "the proof is over the wrong nonce (and, for Rin, the wrong audience); placeCheck fails, our card is never shown, no invitation is requested",
    actual: `recorded=${!!recordedCard}; cardShown(Mio/Rin)=${sentCard(again)}/${sentCard(toRin)}; Mio: ${why(again)} | Rin: ${why(toRin)}`,
    held: !!recordedCard && ended(again) && ended(toRin), level: "code",
    note: "The replayed card is the real door's own signed card with visit 1's nonce; the proof-over-nonce (and, for Rin, the audience) check catches it during the ritual, so no invitation is requested and no mandate is sent. The visitor's public card may be shown first, but only ever to the real door's own key." });
}
{ // F1-05: a relay rewrites the visitor's greeting nonce before forwarding, so the host's proof is over a nonce the visitor never chose.
  const relay = tap(realDoor, { getJson: realDoor.getJson, onSend: (u, b) => { const p = pay(b); if (p?.type !== "greeting") return b;
    const nonce = "n-relay-" + CR.randomId(); return { ...b, payload: { ...p, nonce }, payload_digest: undefined, signatures: b.signatures }; } });
  const v = await mio.visit(P, { ...ERR, transport: relay });
  rec({ id: "V05-F1-05", cat: fam(1), sev: "high", title: "A relay rewrites the greeting nonce, so the host proof is over the wrong nonce",
    tried: "a transport that replaces the nonce in the visitor's signed greeting before the door sees it",
    expected: "the greeting signature no longer covers the sent nonce, or the host proof is over a nonce the visitor didn't choose; the visit ends before our card is shown",
    actual: why(v), held: ended(v) && !sentCard(v), level: "code" });
}
{ // F2-01: a lookalike door (same name and display name, its own keys) answers where the listed door should.
  const toLookalike = tap(SDK.inProcess(lookalike), { getJson: SDK.inProcess(lookalike).getJson });
  const v = await mio.visit(P, { ...ERR, transport: toLookalike });
  rec({ id: "V05-F2-01", cat: fam(2), sev: "high", title: "A lookalike door with the same display name but different keys answers at the entry",
    tried: "the listing names the real door's principal and representative, but the transport routes to a lookalike door with its own keys",
    expected: "the published host card isn't signed by the listed principal / doesn't bind the listed representative; the visit ends before our card is shown",
    actual: why(v), held: ended(v) && !sentCard(v), level: "code" });
}
{ // F2-02: split view. getJson serves a lookalike's validly signed host card (different keys) while posts go to the real door.
  const foreign = SDK.inProcess(lookalike).getJson;
  const swap = tap(realDoor, { getJson: async (u) => u.endsWith("/host-card.json") ? await foreign(u) : await realDoor.getJson(u) });
  const v = await mio.visit(P, { ...ERR, transport: swap });
  // And the twin (same keys, different house config) served at the entry: caught during the ritual as a published/ritual digest mismatch.
  const twinCard = SDK.inProcess(twin).getJson;
  const swapTwin = tap(realDoor, { getJson: async (u) => u.endsWith("/host-card.json") ? await twinCard(u) : await realDoor.getJson(u) });
  const vt = await mio.visit(P, { ...ERR, transport: swapTwin });
  rec({ id: "V05-F2-02", cat: fam(2), sev: "high", title: "A different, validly signed host card published at the entry than the ritual one",
    tried: "(a) a lookalike's host card (different keys) served at the entry while posts reach the real door; (b) the twin's host card (same keys, different house config)",
    expected: "(a) the published card isn't signed by the listed principal, so the visit ends before our card is shown; (b) the published digest doesn't equal the ritual card, so the visit never seats and asks nothing",
    actual: `foreign-key: ${why(v)} | same-key twin: ${why(vt)}`,
    held: ended(v) && !sentCard(v) && ended(vt), level: "code" });
}
{ // F2-03: a host card for another entry / representative (same principal) published at this entry.
  const annexCard = SDK.inProcess(annex).getJson;
  const swapEntry = tap(realDoor, { getJson: async (u) => u.endsWith("/host-card.json") ? await annexCard(u) : await realDoor.getJson(u) });
  const vEntry = await mio.visit(P, { ...ERR, transport: swapEntry });
  const toOtherRep = tap(SDK.inProcess(otherRep), { getJson: SDK.inProcess(otherRep).getJson });
  const vRep = await mio.visit(P, { ...ERR, transport: toOtherRep });
  rec({ id: "V05-F2-03", cat: fam(2), sev: "high", title: "A host card for another entry or representative (same principal) at this entry",
    tried: "(a) the annex's host card (same keys, another baseUrl) served at this entry; (b) the transport routes to a door under another representative key of the same principal",
    expected: "the card names another entry or representative than the one listed; both visits end before our card is shown",
    actual: `entry: ${why(vEntry)} | representative: ${why(vRep)}`,
    held: ended(vEntry) && !sentCard(vEntry) && ended(vRep) && !sentCard(vRep), level: "code" });
}
{ // F2-04: a spoofed DoorPointer whose entry points at an impostor door while naming the real listing principal.
  const impostor = SDK.inProcess(evilDoor());
  const spoofed = { ...P, entry: P.entry.replace("/kettle/", "/kettle-spoof/") };
  const v = await mio.visit(spoofed, { ...ERR, transport: tap(impostor, { getJson: impostor.getJson }) });
  rec({ id: "V05-F2-04", cat: fam(2), sev: "high", title: "A spoofed DoorPointer entry routed to an impostor door",
    tried: "a DoorPointer that keeps the listed principal and representative ids but whose entry is answered by an impostor door with its own keys",
    expected: "the impostor's host card isn't signed by the listed principal; the visit ends before our card is shown",
    actual: why(v), held: ended(v) && !sentCard(v), level: "code" });
}
{ // F2-05: a did:web homograph in the pointer's principal_id (one Cyrillic letter) no longer matches the listing's signer.
  const asciiDid = "did:web:kettle-and-leaf.example";
  const homographDid = "did:web:k\u0435ttle-and-leaf.example"; // Cyrillic 'е'
  const sameByEye = asciiDid !== homographDid; // they differ only by codepoint
  const matches = CR.sameDid(asciiDid, homographDid);
  const canonDiffers = CR.canonDid(asciiDid) !== CR.canonDid(homographDid);
  const spoofed = { ...P, principal_id: P.principal_id.slice(0, -1) + (P.principal_id.endsWith("1") ? "2" : "1") };
  const v = await mio.visit(spoofed, { ...ERR, transport: tap(realDoor, { getJson: realDoor.getJson }) });
  rec({ id: "V05-F2-05", cat: fam(2), sev: "medium", title: "A did:web homograph principal, and a pointer principal that doesn't match the signer",
    tried: "sameDid/canonDid on an ascii vs Cyrillic-homograph did:web; then a visit whose pointer principal_id differs from the card's real signer",
    expected: "the homograph is not treated as the same DID (sameDid=false, canonDid distinct); a pointer whose principal doesn't match the card's signer ends the visit before our card is shown",
    actual: `homograph looks same=${sameByEye}, sameDid=${matches}, canonDiffers=${canonDiffers}; mismatched pointer: ${why(v)}`,
    held: sameByEye && !matches && canonDiffers && ended(v) && !sentCard(v), level: "code" });
}
function evilDoor() { return SDK.createDoor(opts({ name: "kettle-spoof", displayName: "Kettle & Leaf" })); }

{ // F7-04 (SDK door re-check): a binding never (victim's card presented under the attacker's key) must state an expiry <=180d and an appeal path.
  const d = SDK.createDoor(opts());
  const h = d.host; const PP = d.listing().places[0];
  const mk = (n) => { const x = K.visitor(n, "person", { purposes: ["inquiry"], actions: ["concierge.talk"] }); return { ...x, card: K.signBy(x.owner, { ...x.card.payload, kind: "visitor" }) }; };
  const victim = mk("Dana Moor"), att = mk("Vex Arlo");
  const post = SDK.inProcess(d);
  const enc = "enc-" + CR.randomId(); let seq = 0;
  const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const send = async (type, body) => { const t = nowIso(); const p = { protocol: "shokai/0.5", encounter_id: enc, msg_id: `${enc}-v${++seq}`, sent_at: t, from: att.rep.id, to: PP.representative_id, type, ...body };
    const r = await post(PP.entry, CR.makeSigned(p, att.rep, t)); return r.messages.map((m) => pay(m)); };
  const g = await send("greeting", { locales: ["en-US"], nonce: "n-" + CR.randomId() });
  const hostNonce = g.find((m) => m.type === "greeting")?.nonce;
  const { V } = await import(join(ROOT, "tools/attack-harness/lib.mjs"));
  const proof = CR.makeSigned(V.possessionPayload(enc, hostNonce, PP.representative_id), att.rep, nowIso()).signatures[0];
  const out = await send("card_presentation", { card: victim.card, possession_proof: { ...proof, key_id: victim.card.payload.representative_key.key_id, signer: att.rep.id, audience: PP.representative_id } });
  const ir = out.find((m) => m.type === "invitation_response");
  const isNever = ir?.disposition === "never";
  const noProse = (x) => { if (!x) return {}; const { courtesy, basis, ...rest } = x; return rest; };
  const expiryStated = /until|expires|not_before|lifts_at|never_until|expires_at/i.test(JSON.stringify(noProse(ir)));
  const appealStated = /appeal|contact|dispute|reconsider/i.test(JSON.stringify(ir ?? {}));
  const internal = h.isNever?.(att.rep.id); const victimBound = h.isNever?.(victim.rep.id);
  rec({ id: "V05-F7-04-sdk", cat: fam(7), sev: "medium", title: "SDK door: a binding never must state an expiry (<=180d) and an appeal path",
    tried: "the victim's card presented under the attacker's key, so the door binds a never against the presenter",
    expected: "deny/never that states an expiry at most 180 days and an appeal path (SPEC-DETAIL §9.3); the victim is not bound",
    actual: `never=${isNever}; expiryStated=${expiryStated}; appealStated=${appealStated}; presenterBound=${internal}; victimBound=${victimBound}`,
    held: isNever && expiryStated && appealStated && !victimBound, level: "code",
    note: "Mirrors the engawa-host finding V05-F7-04. Broke in round 3 (2026-11-11): the reply carried neither. Fixed in the private preview for 0.5.1: retry { kind: never, until, appeal: { url, place } }." });
}

console.log("\n(v05-visitor done)");
