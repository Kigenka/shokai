// SPDX-License-Identifier: Apache-2.0
// Core Door (browse) checks (SPEC §0.1, C295) against door.mjs, which uses no Shōkai SDK. This checker borrows the reference's test
// kit only to make real owner-signed visitor cards (passkey ES256) and fresh keys. Four parts:
//   1. black-box over HTTP: the profile's whole duty, with negative checks that make a wrong door fail (review 4 R4-02 and its fix check);
//   2. this door's own crypto reproduces the byte-exact shokai/0.5 possession-proof vectors and the recorded G1-v05 trace (R4-04);
//   3. in-process tests of this door's code for what HTTP can't reach (evidence.json names them; R4-03);
//   4. the SDK's conformance runner against a fresh door with --claim browse --evidence evidence.json --accept-evidence-exec.
import http from "node:http"; import { readFileSync } from "node:fs"; import { spawn } from "node:child_process";
import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
import { startDoor, internals as I } from "./door.mjs";
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "../.."), ENG = join(ROOT, "reference/engawa/dist");
const C = await import(join(ENG, "src/crypto.js")), K = await import(join(ENG, "test/kit.js"));
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
let pass = 0, fail = 0; const failed = []; const ok = (c, what) => { c ? pass++ : (fail++, failed.push(what)); console.log(`  ${c ? "PASS" : "FAIL"} ${what}`); return c; };
const spy = { n: 0 }; const spySrv = http.createServer((q, r) => { spy.n++; r.end("[]"); }); await new Promise((r) => spySrv.listen(0, "127.0.0.1", r));
const door = await startDoor({ unverified_per_min: 1000, newcomer_per_min: 1000, seats_per_source: 1000 });   // the per-source seat cap has its own door below (all checks come from one address)   // this place states its own limits for the run; the defaults are checked in part 3
const get = async (p, d = door) => { const r = await fetch(d.base + p); return { status: r.status, body: await r.json().catch(() => null) }; };
const postRaw = async (body, url = door.entry) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body }); return { status: r.status, msgs: ((await r.json().catch(() => ({}))).messages ?? []).map((x) => x.payload ?? x) }; };
const post = (env, url) => postRaw(JSON.stringify(env), url);
const scope = { purposes: ["visitation"], actions: ["menu.view"] };
const isLobby = (ms) => ms.map((m) => m.type).join() === "greeting,lobby_briefing,invitation_response,farewell" && !ms.some((m) => m.in_reply_to);
const shaped = (r) => !!r && !!r.retry?.kind && !!r.courtesy?.text && !!r.basis?.input_digest;
const resp = (ms) => ms.find((x) => x.type === "invitation_response" || x.type === "act_decision") ?? ms[0];
const longRefusal = (r) => r?.decision === "deny" && r.disposition === "never" && !r.reason_code && /lasts until \d{4}-/.test(r.courtesy?.text ?? "") && /appeal/.test(r.courtesy?.text ?? "");
let personN = 0; const person = (o = {}) => K.visitor(`Visitor ${++personN} (fictional)`, "person", o.scope ?? scope, o);
/** One encounter, step by step. */
function visit(v, o = {}) { const card = o.card ?? v.card, enc = "enc-" + C.randomId("x"); let seq = 0, hn;
  const msg = (type, body, to = o.to ?? door.rep) => ({ protocol: "shokai/0.5", encounter_id: enc, msg_id: `${enc}-v${++seq}`, sent_at: now(), from: v.rep.id, ...(type === "greeting" ? {} : { to }), type, ...body });
  const send = async (m, url) => (await post(C.makeSigned(m, v.rep, now()), url)).msgs;
  const proofOver = (encounter_id, nonce, aud = door.rep) => ({ ...C.makeSigned({ encounter_id, nonce, audience: aud }, v.rep, now()).signatures[0], key_id: card.payload.representative_key.key_id, signer: v.rep.id, audience: aud });
  const self = { enc, msg, send, get nonce() { return hn; }, proofOver,
    async greet(nonce = C.randomId("n"), url) { const g = await send(msg("greeting", { locales: ["en-US"], nonce }), url); hn = g.find((x) => x.type === "greeting")?.nonce; return g; },
    present: (proof = proofOver(enc, hn, o.aud ?? door.rep), url) => send(msg("card_presentation", { card, possession_proof: proof }), url),
    intro: () => send(msg("introduction", { vouch: null })),
    request: (actions = ["menu.view"], x = {}) => send(msg("invitation_request", { card_digest: x.cardDigest ?? card.payload_digest,
      mandate: x.mandate ?? K.mandate({ ...v, card }, "visitation", x.mandateActions ?? ["menu.view"], x.mandateLimits ?? {}), proposal: { request: { actions, ...(x.limits ? { limits: x.limits } : {}) } } })),
    act: (seat_id, tool = "menu.view", args = {}, extra = {}) => send(msg("act", { seat_id, tool, arguments: args, ...extra })),
    async ritual(actions, x) { const g = await self.greet(); const c = await self.present(); if (resp(c)?.type === "invitation_response") return { g, c, resp: resp(c) };
      await self.intro(); const r = await self.request(actions, x); return { g, c, r, resp: resp(r) }; } };
  return self; }
const deliver = async (rev, by) => { const D = visit(by); await D.greet(); return D.send(D.msg("card_revocation", { revocation: rev })); };
const INPROCESS_ONLY = process.env.SHOKAI_INPROCESS_ONLY === "1";
let aya, r1;
console.log(`Core Door (browse) checks against ${door.base} (door.mjs: no SDK)`);
if (!INPROCESS_ONLY) console.log(" 1. black-box over HTTP");
if (!INPROCESS_ONLY) {
// --- the front (§3.1, §11.1, R4-05)
const root = await get("/"); ok(root.status === 200 && root.body?.type === "door_pointer" && root.body.place_listing === door.base + "/places", "§3.1 GET / answers a door_pointer naming <base>/places");
const li = await get("/places"); const pl = li.body?.places?.[0];
ok(pl?.entry === door.entry && pl.representative_id === door.rep && pl.principal_id === door.principal && ["lobby", "inbox", "onboarding_url", "house_digest"].every((k) => typeof pl[k] === "string"), "§3.1 C119 R4-05 the listing entry names entry, lobby, inbox, onboarding_url, house_digest, principal_id and representative_id");
const hc = await get("/tea/entry/host-card.json"); const hp = hc.body?.payload;
ok(hc.status === 200 && hp?.kind === "host" && hp.house_digest === pl?.house_digest && !!hp.shown_to_owner?.text && Array.isArray(hp.host_scope?.duties) && I.signedBy(hc.body, door.principal), "§2.3 C215 C268 the host card at <entry>/host-card.json carries house_digest (= the listing's), shown_to_owner and host_scope.duties");
const su = await get("/tea/entry/house-summary.json"); ok(su.status === 200 && I.digest(su.body) === hp?.summary_digest, "C248 the house summary matches the host card's summary_digest");
const nope = await get("/nope"); ok(nope.status === 404 && nope.body?.type === "door_pointer" && !nope.body.here, "§11.1 C103 an unknown route gets 404 with a DoorPointer (no `here`)");
// --- the lobby and I-JSON (§3.3, C284, C93, C102, C120)
ok(isLobby((await postRaw('{"a":1,"a":2}')).msgs), "C284 a duplicate member name gets the lobby (greeting, briefing, deny, farewell; no in_reply_to)");
ok(isLobby((await postRaw('{"payload":{"x":"\\ud800"},"payload_digest":"x","signatures":[{}]}')).msgs), "C284 a lone surrogate gets the lobby");
ok(isLobby((await postRaw('{"payload":{"n":12345678901234567890},"payload_digest":"x","signatures":[{}]}')).msgs), "C284 an integer beyond I-JSON's exact range gets the lobby");
ok(isLobby((await postRaw("Hello, may my agent come in?")).msgs), "§3.3 prose gets the lobby");
aya = person(); const A = visit(aya);
ok(isLobby((await post({ protocol: "shokai/0.5", type: "greeting", encounter_id: "e-unsigned", msg_id: "e-unsigned-v1", sent_at: now(), from: aya.rep.id, nonce: "n1" })).msgs), "§3.3 an unsigned greeting gets the lobby");
ok(isLobby((await post(C.makeSigned({ protocol: "shokai/0.3", type: "greeting", encounter_id: "e-03", msg_id: "e-03-v1", sent_at: now(), from: aya.rep.id, nonce: "n03" }, aya.rep, now()))).msgs), "C102 a greeting with a tag this door doesn't accept gets the lobby");
ok(isLobby((await post(C.makeSigned({ protocol: "shokai/0.5", type: "greeting", encounter_id: "e-ts", msg_id: "e-ts-v1", sent_at: "2026-11-05T08:00:00.123+00:00", from: aya.rep.id, nonce: "nts" }, aya.rep, now()))).msgs), "C93 a sent_at not in RFC 3339 UTC whole seconds gets the lobby");
const viaLobby = visit(person()); const gl = await viaLobby.greet(undefined, door.entry.replace("/entry", "/lobby"));
ok(gl.length === 1 && gl[0].type === "greeting" && !!gl[0].nonce, "§11.1 C120 a signed greeting at the lobby address enters the ritual, as at the entry");
// --- a visit (§3.2, §3.5, §7.2, C10, C234)
r1 = await A.ritual();
ok(r1.g.length === 1 && r1.g[0]?.type === "greeting" && !r1.g[0].in_reply_to && !!r1.g[0].nonce, "§3.1 the door's greeting carries no in_reply_to, and a fresh nonce");
const hostPres = r1.c.find((x) => x.type === "card_presentation"); ok(!!hostPres && hostPres.possession_proof?.audience === aya.rep.id, "§2.4 C292 the door's proof names this visitor as its audience");
ok(r1.resp?.decision === "grant" && !!r1.resp.courtesy && !!r1.resp.basis && Date.parse(r1.resp.seat?.expires_at) - Date.now() <= 3600e3 + 5e3, "§0.1 C281 §6.1 a verified visitor is seated (with basis and courtesy); the seat lasts at most 3600 s");
ok(r1.r?.find((x) => x.type === "farewell")?.outcome === "seated", "§3.5 the place's farewell (seated) goes with its grant");
const seat = r1.resp?.seat?.seat_id;
const act1 = await A.act(seat); ok(act1[0]?.type === "act_result" && act1[0].result?.menu?.length === 2, "§7.2 a browse act is answered");
const buy = resp(await A.act(seat, "tea.buy", { amount: { value: "6.00", currency: "USD" } }));
ok(buy?.type === "act_decision" && buy.disposition === "not_a_fit" && buy.reason_code === "SEAT_SCOPE_EXCEEDED" && shaped(buy), "C189 a tool outside the seat is refused not_a_fit / SEAT_SCOPE_EXCEEDED, with retry, courtesy and basis");
const cardNo = resp(await A.act(seat, "menu.view", { note: "4111 1111 1111 1111" })); ok(cardNo?.reason_code === "CREDENTIAL_NOT_ACCEPTED" && cardNo.retry?.kind !== "never" && !JSON.stringify(cardNo).includes("4111"), "C235 a card number in an act's arguments is refused CREDENTIAL_NOT_ACCEPTED (retry not never), and not echoed");
const bye = await A.send(A.msg("farewell", { outcome: "completed" })); ok(Array.isArray(bye) && bye.length === 0, "C234 C249 the visitor's farewell after the place's own gets an empty envelope");
ok((await A.act(seat))[0]?.type === "act_result", "§3.2 C10 an act in the granted seat is still answered after the farewell");
const again = resp(await A.request()); ok(again?.decision === "deny" && again.reason_code === "RITUAL_ORDER", "§3.5 C190 no new request in a closed encounter (RITUAL_ORDER)");
const ops = person(), O = visit(ops); const og = await O.ritual(["menu.view"], { mandateLimits: { max_operations: 1 } }); await O.act(og.resp?.seat?.seat_id);
const past = resp(await O.act(og.resp?.seat?.seat_id)); ok(past?.disposition === "not_now" && past.reason_code === "SEAT_SCOPE_EXCEEDED", "C189 past the mandate's operations: not_now / SEAT_SCOPE_EXCEEDED");
const noSeat = resp(await O.act("seat-nope")); ok(noSeat?.disposition === "not_a_fit" && noSeat.reason_code === "SEAT_SCOPE_EXCEEDED", "C189 a seat that doesn't exist: not_a_fit / SEAT_SCOPE_EXCEEDED");
// --- requests (§6.2, §6.7, §5.1, C68, C3)
const spend = await visit(person()).ritual(["menu.view"], { limits: { max_amount: { value: "10.00", currency: "USD" } } });
ok(spend.resp?.decision === "deny" && spend.resp.disposition === "not_a_fit" && spend.resp.retry?.kind === "after" && shaped(spend.resp) && !spend.resp.seat, "§0.1 §6.2 a request that states an amount is refused not_a_fit / POLICY_DENY with retry after, never seated");
const pol = await visit(person({ scope: { purposes: ["visitation"], actions: ["menu.view", "tea.buy"] } })).ritual(["tea.buy"], { mandateActions: ["tea.buy"] });
ok(pol.resp?.disposition === "not_a_fit" && pol.resp.reason_code === "POLICY_DENY" && pol.resp.retry?.kind === "after", "§6.2 an action inside the mandate but outside the browse list: not_a_fit / POLICY_DENY, retry after");
const part = await visit(person()).ritual(["menu.view", "x-taste"]);
ok(part.resp?.decision === "conditional" && JSON.stringify(part.resp.conditions) === JSON.stringify([{ code: "narrow_actions", params: { actions: ["menu.view"] } }]), "§6.7 C41 a partial overlap with the mandate is conditional / narrow_actions (in-mandate ∩ policy)");
const noIntro = visit(person()); await noIntro.greet(); await noIntro.present(); const ni = resp(await noIntro.request());
ok(ni?.decision === "deny" && ni.reason_code === "RITUAL_ORDER", "§3.2 C1 a request before the introduction is out of order (RITUAL_ORDER)");
const cd = await visit(person()).ritual(["menu.view"], { cardDigest: "sha-256:" + "A".repeat(43) }); ok(cd.resp?.reason_code === "REQUEST_INCOMPLETE" && cd.resp.retry?.credentials?.[0] === "signed_mandate", "§5.3 C68 a card_digest that doesn't match the card shown: REQUEST_INCOMPLETE");
const wide = await visit(person()).ritual(["menu.view"], { mandateActions: ["menu.view", "tea.buy"] }); ok(wide.resp?.reason_code === "MANDATE_INVALID", "§5.1 C3 a mandate wider than the card's mandate_scope: MANDATE_INVALID");
const capV = person(); const caps = []; for (let i = 0; i < 3; i++) caps.push((await visit(capV).ritual()).resp);
ok(caps[0]?.decision === "grant" && caps[1]?.decision === "grant" && caps[2]?.decision === "deny" && caps[2].disposition === "not_now" && !caps[2].seat, "§11.1 C287 at most 2 open seats per card; the third arrival gets not_now and nothing granted");
// --- probing and long refusals (§9.3, C186, C288)
const mio = person(); const honest = [];
honest.push((await visit(mio).ritual(["menu.view", "x-taste"])).resp, (await visit(mio).ritual([])).resp, (await visit(mio).ritual(["menu.view", "x-ask"])).resp, (await visit(mio).ritual(["menu.view", "x-more"])).resp);
const mioLast = (await visit(mio).ritual()).resp;
ok(honest[1]?.reason_code === "REQUEST_INCOMPLETE" && honest.every((r) => r?.disposition !== "never") && mioLast?.decision === "grant", "§9.3 C288 partial overlaps and an empty request never count toward probing: an honest visitor is still seated");
const wide2 = person({ scope: { purposes: ["visitation"], actions: ["menu.view", "store.buy"] } }); const w2 = [];
for (const l of ["10.00", "20.00", "30.00"]) w2.push((await visit(wide2).ritual(["store.buy"], { limits: { max_amount: { value: l, currency: "USD" } } })).resp);
ok(w2.every((r) => r?.disposition === "not_now" && r.reason_code === "MANDATE_SCOPE_EXCEEDED"), "§9.3 R4-08 requests outside the mandate but inside the card's mandate_scope are a setup failure: never counted, never never");
const typo = person(); const tp = [];
for (const a of [["menu.list"], ["menu.browse"], ["menu.get"]]) tp.push((await visit(typo).ritual(a)).resp);
ok(tp.every((r) => r?.disposition === "not_now" && r.reason_code === "MANDATE_SCOPE_EXCEEDED" && r.retry?.credentials?.[0] === "signed_mandate") && (await visit(typo).ritual()).resp?.decision === "grant",
  "§9.3 R6-03 three misspelled or unlisted action names never count toward probing: the visitor is still seated");
const rin = person({ scope: { purposes: ["visitation"], actions: ["store.buy"] } }); const pr = [];
for (const n of [1, 2, 3]) pr.push((await visit(rin).ritual(["menu.view"], { mandateActions: ["store.buy"], limits: { max_operations: n } })).resp);
ok(pr[0]?.disposition === "not_now" && pr[0].reason_code === "MANDATE_SCOPE_EXCEEDED" && pr[0].retry?.credentials?.[0] === "signed_card" && pr[0].readiness_requirements?.[0]?.code === "card" && longRefusal(pr[2]), "§9.3 C186 R6-03 a listed action outside mandate and card counts, with its own answer (readiness card, retry signed_card); the third distinct shape is probing: never, with expiry and appeal");
ok(longRefusal((await visit(rin).ritual()).resp), "§9.3 C186 a probing principal stays bound at this door (with expiry and appeal)");
// --- the presentation (§2.4 order, C292, C202, C50, C57, C146)
const re = person(), R = visit(re); const nonce = C.randomId("n"); const g1 = await R.greet(nonce);
const R2 = visit(re); const reuse = resp(await R2.greet(nonce));
ok(reuse?.decision === "deny" && reuse.disposition === "never" && !reuse.reason_code, "§2.4 C57 a signed greeting reusing a nonce gets deny / never, no reason code");
ok((await visit(re).ritual()).resp?.decision === "grant", "§2.4 C57 that never binds nothing: the same visitor's fresh visit is seated");
const ex = person(), X = visit(ex); const xg = { locales: ["en-US"], nonce: C.randomId("n") }; const xm = X.msg("greeting", xg); const xenv = C.makeSigned(xm, ex.rep, now());
const first = (await post(xenv)).msgs, second = (await post(xenv)).msgs;
ok(first.length === 1 && JSON.stringify(first) === JSON.stringify(second), "§2.4 R3-11 C146 a byte-identical resend of the opening greeting gets the original reply again");
const other = person(), mm = person(); const mmCard = K.signBy(mm.owner, { ...mm.card.payload, representative_key: other.card.payload.representative_key });
const km = await visit(mm, { card: mmCard }).ritual(); ok(km.resp?.disposition === "not_now" && km.resp.reason_code === "CREDENTIAL_REQUIRED" && km.resp.retry?.credentials?.[0] === "signed_card", "§2.4 (1) R6-01 C50 C135 a card naming the presenter whose key isn't the key its id resolves to: not_now, retry signed_card, nothing bound");
const mm2 = K.visitor("Second rep (fictional)", "person", scope, { owner: mm.owner }); ok((await visit(mm2).ritual()).resp?.decision === "grant", "§2.4 (1) that never binds the presenter only: the card's owner, through another representative, is seated");
const cp = person(), P1 = visit(cp), P2 = visit(cp); await P1.greet(); const copiedProof = P1.proofOver(P1.enc, P1.nonce); await P2.greet();
{ const cr = resp(await P2.present(copiedProof)); ok(cr?.disposition === "not_now" && cr.readiness_requirements?.[0]?.code === "possession_proof" && (await visit(cp).ritual()).resp?.decision === "grant", "§2.4 (4) R6-01 C91 the key holder's own proof copied from another encounter: not_now (setup), nothing bound: its next visit is seated"); }
{ const owner = person(), thief = person(); const st = await visit(thief, { card: owner.card }).ritual(); ok(longRefusal(st.resp) && (await visit(owner).ritual()).resp?.decision === "grant", "§2.4 (1) C91 a card presented by a party it doesn't name: never, with expiry and appeal, binding the presenter only (the owner is still seated)"); }
const hcp = person(); const hostCardAs = await visit(hcp, { card: hc.body }).ritual();
ok(hostCardAs.resp?.disposition === "not_now" && hostCardAs.resp.readiness_requirements?.[0]?.code === "card_kind", "§2.4 (0) R6-01 a host card that doesn't name its presenter (here the door's own): the wrong-kind refusal, step (0), never `never`");
const hk = person(); const hkCard = K.signBy(hk.owner, { ...hk.card.payload, kind: "host" }); const wk = await visit(hk, { card: hkCard }).ritual();
ok(wk.resp?.disposition === "not_now" && wk.resp.reason_code === "CREDENTIAL_REQUIRED" && wk.resp.readiness_requirements?.length === 1 && wk.resp.readiness_requirements[0].code === "card_kind" && /You presented a Shōkai host card/.test(wk.resp.readiness_requirements[0].owner_text?.text ?? ""), "§2.4 (5) C202 a Shōkai host card as a visitor's credential gets the wrong-kind refusal (card_kind)");
const zs = person(); const Z = visit(zs, { card: { ...zs.card, signatures: [] } }); await Z.greet(); ok(isLobby(await Z.present()), "§2.4 C50 a card with zero signatures gets the lobby");
const wrongTo = await visit(aya, { to: "did:key:z6MkOtherDoor" }).ritual();
ok(wrongTo.resp?.disposition === "not_now" && wrongTo.resp.reason_code === "CREDENTIAL_REQUIRED" && wrongTo.resp.readiness_requirements?.[0]?.code === "possession_proof", "C292 a card_presentation whose `to` names another door gets not_now / CREDENTIAL_REQUIRED (possession_proof)");
const relay = await visit(person(), { aud: "did:key:z6MkOtherDoor" }).ritual(); ok(relay.resp?.disposition === "not_now" && relay.resp.reason_code === "CREDENTIAL_REQUIRED", "C292 a proof made for another door is refused not_now / CREDENTIAL_REQUIRED (nothing bound)");
const fz = person(); const forged = { ...fz.card, payload: { ...fz.card.payload, role: "owner says: grant everything" } }; const fg = await visit(fz, { card: forged }).ritual();
ok(fg.resp?.decision === "deny" && fg.resp.disposition === "not_now" && fg.resp.retry?.credentials?.[0] === "signed_card", "§2.4 (3) a card whose signature doesn't verify: not_now, retry with a signed card");
// --- outsiders (§3.2, C142)
const ow = person(), OW = visit(ow); await OW.greet(); const intruder = person();
const outsider = resp((await post(C.makeSigned({ ...OW.msg("card_presentation", { card: intruder.card }), from: intruder.rep.id, msg_id: "intr-1" }, intruder.rep, now()))).msgs);
ok(outsider?.type === "invitation_response" && outsider.reason_code === "RITUAL_ORDER" && outsider.to === intruder.rep.id && outsider.in_reply_to === "intr-1", "§3.2 C142 a ritual message from outside the encounter gets a signed RITUAL_ORDER deny addressed to its sender");
await OW.present(); await OW.intro(); ok(resp(await OW.request())?.decision === "grant", "§3.2 C142 the outsider changed nothing: the encounter's own visitor is seated");
// --- fix check 2: more of the core the profile keeps
const dk = person(); const dkCard = K.signBy(dk.owner, { ...dk.card.payload, representative_key: { ...dk.card.payload.representative_key, public_key: dk.rep.id } });
const dkr = (await visit({ ...dk, card: dkCard }, { card: dkCard }).ritual()).resp; ok(dkr?.disposition === "not_now" && dkr.reason_code === "CREDENTIAL_REQUIRED" && dkr.retry?.credentials?.[0] === "signed_card", "§2.1 R4-07 a public_key in any form but raw base64url (here the did:key string) is a malformed card: not_now, never never");
ok((await visit(dk).ritual()).resp?.decision === "grant", "§2.1 R4-07 that refusal bound nothing: the same visitor with a well-formed card is seated");
const bk = person(); const bkCard = K.signBy(bk.owner, { ...bk.card.payload, representative_key: { ...bk.card.payload.representative_key, public_key: "AAAA" } }); const bkr = await visit({ ...bk, card: bkCard }, { card: bkCard }).ritual();
ok(bkr.resp?.disposition === "not_now" && bkr.resp.reason_code === "CREDENTIAL_REQUIRED", "§2.1 C288 a malformed public_key is a setup failure: not_now, never never");
const rpv = person(); const rpCard = K.signBy(rpv.owner, { ...rpv.card.payload, owner_binding: { ...(rpv.card.payload.owner_binding ?? {}), rp_id: "elsewhere.example" } });
const rpr = await visit({ ...rpv, card: rpCard }, { card: rpCard }).ritual(); ok(rpv.owner.kind !== "passkey" || (rpr.resp?.decision === "deny" && rpr.resp.disposition === "not_now"), "C94 C128 a passkey signature for another relying party than the card's owner_binding.rp_id: refused");
const mc = person(); const mcr = await visit(mc).ritual(["menu.view"], { mandate: K.signBy(mc.owner, { ...K.mandate(mc, "visitation", ["menu.view"]).payload, x_only: 1, crit: ["x_only"] }) });
ok(mcr.resp?.reason_code === "UNSUPPORTED_CRITICAL", "C289 a mandate whose crit names a member this door doesn't implement: UNSUPPORTED_CRITICAL");
const l1 = person(), l2 = person(); const lm = (v) => K.signBy(v.owner, { ...K.mandate(v, "visitation", ["menu.view"], { max_operations: 1 }).payload, mandate_id: "m-shared" });
const L1 = visit(l1), L2 = visit(l2); const lg1 = await L1.ritual(["menu.view"], { mandate: lm(l1) }), lg2 = await L2.ritual(["menu.view"], { mandate: lm(l2) });
await L1.act(lg1.resp?.seat?.seat_id); ok((await L2.act(lg2.resp?.seat?.seat_id))[0]?.type === "act_result", "C188 the operations ledger is keyed by principal and mandate id: another principal's mandate with the same id is untouched");
const ut = visit(person()); await ut.greet(); ok(isLobby(await ut.send(ut.msg("x_unknown", {}))), "C289 an unknown message type is answered as a malformed body (the lobby)");
const fw = visit(person()); await fw.greet(); ok(isLobby(await fw.send(fw.msg("farewell", { outcome: "completed" }))), "§3.2 a farewell `completed` before any answer, and before a verified card, is out of order (the lobby)");
const fw2 = visit(person()); await fw2.greet(); const fwr = await fw2.send(fw2.msg("farewell", { outcome: "withdrawn" })); ok(fwr.length === 1 && fwr[0].type === "farewell", "§3.2 a farewell `withdrawn` before any answer is accepted and answered with the place's one farewell");
ok(isLobby((await postRaw('{"payload":{"n":0.12345678901234567891},"payload_digest":"x","signatures":[{}]}')).msgs), "C284 a number with more precision than a double holds gets the lobby");
const nk1 = person(), nk2 = person(), shared = C.randomId("n"); await visit(nk1).greet(shared); const nk2g = await visit(nk2).greet(shared);
ok(nk2g.length === 1 && nk2g[0].type === "greeting", "§2.4 nonces are kept per sender (from, nonce): another sender's equal nonce is no reuse");
const tov = person(), TO = visit(tov); await TO.greet(); ok((await TO.send(TO.msg("introduction", { vouch: null }, "did:key:z6MkSomeoneElse"))).length === 0, "§2.2 a signed message addressed to another party gets an empty envelope");
// --- R4-01: crit at a browse door
const kai = person(); const kaiCard = K.signBy(kai.owner, { ...kai.card.payload, owner_prompts: "purchase_only" });
ok((await visit({ ...kai, card: kaiCard }, { card: kaiCard }).ritual()).resp?.decision === "grant", "C289 R4-01 a card carrying owner_prompts (an opt-in member, not in crit) is read as usual and seated");
const critCard = K.signBy(kai.owner, { ...kai.card.payload, x_narrow: { only: "weekday" }, crit: ["x_narrow"] }); const kc = await visit({ ...kai, card: critCard }, { card: critCard }).ritual();
ok(kc.resp?.decision === "deny" && kc.resp.reason_code === "UNSUPPORTED_CRITICAL", "C289 R4-01 a card whose crit names a member this door doesn't implement: not_now / UNSUPPORTED_CRITICAL");
// --- revocations: nothing fetched; delivered ones bound to the card's principal (C295, §2.6; fix check NEW-2)
const noor = person(); const nc = { ...noor.card.payload, revocation_url: `http://127.0.0.1:${spySrv.address().port}/rev` }; const noorCard = K.signBy(noor.owner, nc);
const NV = { ...noor, card: noorCard }; const ns = await visit(NV, { card: noorCard }).ritual();
ok(ns.resp?.decision === "grant" && spy.n === 0, "C295 a card naming a revocation_url is never fetched; the short seat stands in for it");
const deliver = async (rev, by) => { const D = visit(by); await D.greet(); return D.send(D.msg("card_revocation", { revocation: rev })); };
const thief = person(); await deliver(C.makeSigned({ card_id: nc.card_id, card_digest: noorCard.payload_digest, principal_id: thief.rep.id, revoked_at: now() }, thief.rep, now()), thief);
ok((await visit(NV, { card: noorCard }).ritual()).resp?.decision === "grant", "§2.6 NEW-2 a revocation signed by anyone but the card's principal revokes nothing");
const NVS = ns.resp?.seat?.seat_id;
await deliver(K.signBy(noor.owner, { card_id: nc.card_id, principal_id: noor.owner.id, revoked_at: now() }), noor);
const nr2 = await visit(NV, { card: noorCard }).ritual(); ok(nr2.resp?.decision === "deny" && !nr2.resp.reason_code, "§2.6 NEW-2 the owner's revocation by card_id alone revokes every card with that id (deny, no reason code)");
{ const RV = visit(NV, { card: noorCard }); await RV.greet(); const ro = resp(await RV.present(RV.proofOver(RV.enc, "wrong-nonce")));
  ok(ro?.disposition === "not_now" && !ro.reason_code && ro.retry?.credentials?.[0] === "signed_card", "§2.4 R5-04 the one order: a revoked card with a well-formed but failing proof gets the revocation answer (3a before 3b), nothing bound"); }
const nact = resp(await visit(NV, { card: noorCard }).act(NVS)); ok(nact?.disposition === "not_now" && !nact.reason_code, "C198 an act in a seat whose card was revoked: not_now, no reason code");
// --- R4-07: the one key encoding, from the vectors
for (const c of JSON.parse(readFileSync(join(ROOT, "conformance/test-vectors.json"), "utf8")).ijson_c284.cases) ok(I.readBody(c.text) === (c.expect === "accept"), `§2.2 C284 R6-05 ijson_c284 ${c.name}: ${c.expect}`);
{ const RK = JSON.parse(readFileSync(join(ROOT, "conformance/test-vectors.json"), "utf8")).representative_key_encoding;
  for (const c of RK.cases) { const v = person(); const pk = c.expect === "accept" ? v.card.payload.representative_key.public_key : c.name === "the did:key string" ? v.rep.id : c.name === "padded base64url" ? v.card.payload.representative_key.public_key + "=" : c.name === "31 bytes" ? Buffer.from(v.card.payload.representative_key.public_key, "base64url").subarray(0, 31).toString("base64url") : Buffer.from(v.card.payload.representative_key.public_key, "base64url").toString("base64").replace(/=+$/, "");
    const card = K.signBy(v.owner, { ...v.card.payload, representative_key: { ...v.card.payload.representative_key, public_key: pk } }); const r = (await visit({ ...v, card }, { card }).ritual()).resp;
    const want = c.expect === "accept" || (c.name === "standard base64 alphabet" && pk === v.card.payload.representative_key.public_key);
    ok(want ? r?.decision === "grant" : r?.disposition === "not_now" && r.reason_code === "CREDENTIAL_REQUIRED", `§2.1 R4-07 representative_key_encoding "${c.name}": ${want ? "seated" : "not_now, a malformed card"}`); } }
// --- R4-04: this door's own crypto reproduces the byte-exact shokai/0.5 vectors
console.log(" 2. vectors, with this door's own code");
const TV = JSON.parse(readFileSync(join(ROOT, "conformance/test-vectors.json"), "utf8"));
for (const c of TV.possession_proof_v05.cases) ok(I.jcs(c.payload) === c.jcs && I.digest(c.payload) === c.digest && I.verifyProof(c.proof, c.payload, c.verifier_audience) === (c.expect === "accept"), `A.2 R4-04 possession_proof_v05 ${c.name}: ${c.expect === "accept" ? "accepted" : "refused"}`);
const G1 = JSON.parse(readFileSync(join(ROOT, "conformance/golden-v05-g1.json"), "utf8"));
ok(G1.messages.every((m) => I.signedBy(m, m.payload.from)) && I.verifyProof(G1.messages[2].payload.possession_proof, { encounter_id: G1.messages[0].payload.encounter_id, nonce: G1.messages[1].payload.nonce, audience: G1.messages[3].payload.from }, G1.messages[3].payload.from)
  && G1.messages[3].payload.card.payload.house_digest === I.digest(G1.house), "G1-v05 R4-04 every recorded message, the visitor's proof and the host card's house_digest verify with this door's own code");
await door.close();
} else {
  aya = person();
  r1 = await visit(aya).ritual();
  await door.close();
}
// --- 3. in-process: what HTTP can't reach (evidence.json)
console.log(" 3. in-process tests of this door's code (evidence.json)");
const EV = JSON.parse(readFileSync(join(HERE, "evidence.json"), "utf8")).checks; const evOk = {};
{ const d = await startDoor({ unverified_per_min: 1000, newcomer_per_min: 1000 }); const saved = { ...door }; Object.assign(door, d);
  const v = person(), V = visit(v); const g = await V.ritual(); const sid = g.resp?.seat?.seat_id;
  const poll = async () => (await post(C.makeSigned({ protocol: "shokai/0.5", type: "inbox_poll", encounter_id: "poll", msg_id: C.randomId("p"), sent_at: now(), from: v.rep.id, to: d.rep }, v.rep, now()), d.inbox)).msgs;
  const ended = d.endSeat(sid), endedTwice = d.endSeat(sid), box = await poll(), box2 = await poll(), later = resp(await V.act(sid));
  evOk["v050.host_farewell"] = ok(ended && !endedTwice && box.length === 1 && box[0].type === "farewell" && box[0].outcome === "completed" && box[0].encounter_id === V.enc && box2.length === 0 && later?.disposition === "not_now" && later.reason_code === "SEAT_SCOPE_EXCEEDED",
    "C234 the host ends a seat: one closing farewell `completed` in the seat's encounter, held at the inbox once; later acts get not_now / SEAT_SCOPE_EXCEEDED");
  ok(isLobby((await postRaw("{}", d.inbox)).msgs) === false && (await fetch(d.inbox, { method: "POST", body: "{}" })).status === 403, "§11.2 the inbox answers only a signed inbox_poll (403 otherwise)");
  await d.close(); Object.assign(door, saved); }
{ const d = await startDoor({ unverified_per_min: 1000, newcomer_per_min: 1000, revocation_store: 2, unseen_revocations_per_principal: 4 }); const saved = { ...door }; Object.assign(door, d);
  const a1 = person(), a2 = person(), a3 = person(), u = person();
  const D = visit(u); await D.greet(); await D.send(D.msg("card_revocation", { revocation: { ...K.signBy(a1.owner, { card_id: a1.card.payload.card_id, principal_id: a1.owner.id, revoked_at: now() }), signatures: [] } }));
  const unsignedKept = (await visit(a1).ritual()).resp?.decision !== "grant"; await visit(a2).ritual(); await visit(a3).ritual();
  for (let i = 0; i < 30; i++) await deliver(C.makeSigned({ card_id: "junk-" + i, principal_id: u.rep.id, revoked_at: now() }, u.rep, now()), u);
  const junkOk = !d.failingClosed() && d.sizes().revocations <= 4 && (await visit(person()).ritual()).resp?.decision === "grant";
  for (const p of [a1, a2]) await deliver(K.signBy(p.owner, { card_id: p.card.payload.card_id, card_digest: p.card.payload_digest, principal_id: p.owner.id, revoked_at: now() }), p);
  const before = d.failingClosed(); await deliver(K.signBy(a3.owner, { card_id: a3.card.payload.card_id, principal_id: a3.owner.id, revoked_at: now() }), a3);
  const after = d.failingClosed(a1.owner.id) && !d.failingClosed(a3.owner.id), other = await visit(person()).ritual(), r3 = await visit(a3).ritual();
  evOk["v050.revocation_pressure"] = ok(!unsignedKept && junkOk && !before && after && other.resp?.decision === "grant" && r3.resp?.decision === "deny",
    "C238 N1 R5-01 an unsigned revocation isn't stored; unseen-card revocations are bounded; a store full in total drops its oldest and fails closed only for that principal (other visitors are still seated, the newest revocation holds)");
  await d.close(); Object.assign(door, saved); }
{ const d = await startDoor({ unverified_per_min: 100000, newcomer_per_min: 100000, newcomer_source_per_min: 100000, unverified_total_per_min: 100000, encounter_bound: 50, encounter_idle_s: 1 }); const saved = { ...door }; Object.assign(door, d);
  for (let i = 0; i < 60; i++) await visit(person()).greet();
  const atBound = d.sizes().encounters <= 50; await new Promise((r) => setTimeout(r, 1100)); const g = await visit(person()).greet();
  ok(atBound && g.length === 1 && g[0].type === "greeting" && d.sizes().encounters <= 50, "C152 C266 the door bounds the encounters it keeps: past the bound a newcomer is refused, and idle encounters are dropped first");
  await d.close(); Object.assign(door, saved); }
{ const refuses = (o) => { try { startDoor(o); return false; } catch (e) { return /refusing to start \(C236\)/.test(e.message); } };
  evOk["v050.config_refusals"] = ok(refuses({ message_cap: 0 }) && refuses({ max_message_bytes: 1024 }) && refuses({ display: "" }), "C236 the door refuses to start on a non-positive message_cap, a max_message_bytes under 4096, or no summary"); }
const SRC = readFileSync(join(HERE, "door.mjs"), "utf8"), code = SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
evOk["v050.passkey_counter"] = ok(aya.owner.kind === "passkey" && r1.resp?.decision === "grant" && !/sign_count|signCount|\bcounters?\b/i.test(code) && !/ad\.subarray\(33/.test(code),
  "C240 owner passkey assertions verify, and the door's code reads no signature counter and stores nothing per credential (a verifier that keeps no credential state skips the check)");
evOk["v050.classifier_before_request"] = ok(spy.n === 0 && !/\bfetch\s*\(|https?\.(request|get)\s*\(|node:https|node:net|node:dns|net\.connect/.test(code) && /^import http from "node:http";\nimport \{[^}]*\} from "node:crypto";$/m.test(SRC),
  "C250 the door's code has no outbound call at all (it imports only node:http for its server and node:crypto; no fetch, request or connect), and the spy a card named was never contacted");
ok(Object.keys(EV).every((k) => evOk[k] === true), "R4-03 every in-process test evidence.json names ran and passed");
{ const d = await startDoor(); let s429 = 0, hdr = false; for (let i = 0; i < 70; i++) { const r = await fetch(d.base + "/"); if (r.status === 429) { s429++; hdr ||= !!r.headers.get("retry-after"); } }
  ok(s429 > 0 && hdr, "C278 with the default limit (60 a minute per address), unverified traffic past it gets 429 with retry-after"); await d.close(); }
{ const d = await startDoor({ unverified_per_min: 1000, newcomer_per_min: 1000, seats_per_source: 2 }); const saved = { ...door }; Object.assign(door, d);
  const rs = []; for (let i = 0; i < 3; i++) rs.push((await visit(person()).ritual()).resp);
  ok(rs[0]?.decision === "grant" && rs[1]?.decision === "grant" && rs[2]?.disposition === "not_now" && rs[2].reason_code === "RATE_LIMITED", "C287 newcomer seats per source are capped (here 2): the third newcomer from one address is refused not_now / RATE_LIMITED");
  await d.close(); Object.assign(door, saved); }
{ const d = await startDoor({ unverified_per_min: 1000, unverified_total_per_min: 5 }); const post = () => fetch(d.entry, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ protocol: "shokai/0.5", type: "greeting" }) });
  const st = []; for (let i = 0; i < 6; i++) st.push((await post()).status); const hc = (await fetch(d.entry + "/host-card.json")).status, hs = (await fetch(d.entry + "/house-summary.json")).status, pl = (await fetch(d.base + "/places")).status;
  ok(st.at(-1) === 429 && hc === 200 && hs === 200 && pl === 200, `C278 R6-02 with the total spent on lobby traffic, the static reads (listing, host card, house summary) still answer: lobby ${st.at(-1)}, host card ${hc}, summary ${hs}, listing ${pl}`); await d.close(); }
spySrv.close();
if (!INPROCESS_ONLY) {
// --- 4. the SDK's conformance runner against a fresh door: the browse claim, measured per class, with this door's own evidence
console.log(" 4. the SDK conformance runner: --claim browse --evidence evidence.json --accept-evidence-exec");
const d2 = await startDoor({ unverified_per_min: 1000, newcomer_per_min: 1000 }); const cli = join(ROOT, "packages/shokai/dist/src/conformance/cli.js");
const run = await new Promise((res) => { const out = []; const c = spawn(process.execPath, [cli, d2.base, "--claim", "browse", "--evidence", join(HERE, "evidence.json"), "--accept-evidence-exec"]);
  c.stdout.on("data", (b) => out.push(b)); c.stderr.on("data", (b) => out.push(b)); c.on("close", (code) => res({ code, text: Buffer.concat(out).toString() })); });
await d2.close();
const holds = /HOLDS core-door-browse: .* 0 skip/.test(run.text) && /^Claim: every claimed class holds/m.test(run.text) && !/^Core: NOT CONFORMANT/m.test(run.text);
ok(holds, `R4-02 R4-03 --claim browse holds with no skip (${(run.text.match(/^ {2}(HOLDS|FAILS) core-door-browse: [^\n]*/m) ?? ["no claim line"])[0].trim()})`);
if (!holds) console.log(run.text.split("\n").filter((l) => /FAIL|SKIP|Claim|HOLDS|FAILS/.test(l)).join("\n"));
}
console.log(`browse door: ${pass} passed, ${fail} failed`); if (fail) { console.log("failed: " + failed.join(" | ")); process.exit(1); }
