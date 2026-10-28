// Example visitor client over the §11 HTTP binding (also an E2E test), v0.2.5. Run with a server up: node dist/test/http-e2e.js [port]
// It also runs a loopback fixture server (Appendix B.1: http loopback status and vouch-log URLs in a conformance run).
import http from "node:http";
import type * as S from "../src/shapes.js";
import { makeSigned, makeOwnerSigned, randomId, newEd25519, digestOf, ed25519FromLabel, TEST_INTRODUCER_LABEL, type PasskeyOwner } from "../src/crypto.js";
import { possessionPayload } from "../src/verify.js";
import { visitor, mandate, inboxPoll, signBy, ownerConsent, type Visitor } from "./kit.js";

const BASE = `http://127.0.0.1:${process.argv[2] ?? 8787}`;
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const plus = (s: number) => new Date(Date.now() + s * 1000).toISOString().replace(/\.\d+Z$/, "Z");
let ok = 0, bad = 0; const check = (c: boolean, w: string) => { c ? ok++ : bad++; console.log(`  ${c ? "PASS" : "FAIL"}  ${w}`); };
const req = async (p: string, method = "GET", b?: string) => { const r = await fetch(p.startsWith("http") ? p : BASE + p, { method, body: b }); let body: any = null; try { body = await r.json(); } catch { body = null; } return { status: r.status, body }; };
const post = async (p: string, b: string) => { const r = await req(p, "POST", b); if (r.status !== 200) throw new Error(`POST ${p} → ${r.status}`); return r.body; };
const pl = (env: any) => (env.messages as any[]).map((m) => m.payload ?? m);
const types = (env: any) => pl(env).map((p) => p.type);
const path = (u: string) => new URL(u).pathname;

// ---- loopback fixtures (B.1) ----
const fixtures = new Map<string, () => unknown>();
const fx = http.createServer((q, s) => { const f = fixtures.get(q.url ?? ""); if (!f) { s.writeHead(404); s.end(); return; } s.writeHead(200, { "content-type": "application/json" }); s.end(JSON.stringify(f())); });
await new Promise<void>((r) => fx.listen(0, "127.0.0.1", () => r()));
const FX = `http://127.0.0.1:${(fx.address() as any).port}`;

// ---- door (§11.1) ----
const root = await req("/");
check(root.status === 200 && root.body.type === "door_pointer" && root.body.spec_ref?.version === "0.3.0" && root.body.places.every((p: any) => p.inbox && p.entry && p.lobby), "GET / → 200 DoorPointer with spec_ref 0.2.10 and each place's inbox (C118, C119)");
const unk = await req("/no/such/route"); check(unk.status === 404 && unk.body.type === "door_pointer", "unknown path → 404 DoorPointer");
for (const old of ["/places/fernwood/state", "/places/fernwood/admin/allowances", "/places/engawa/guests"]) { const r = await req(old); check(r.status === 404 && r.body.type === "door_pointer", `stand-in ${old} → 404 DoorPointer`); }
const list = await req("/places");
check(list.status === 200 && list.body.type === "place_listing" && list.body.places.every((p: any) => p.spec_ref?.version === "0.3.0" && p.inbox && p.entry && p.category && Array.isArray(p.actions) && !("x-shokai-inbox" in p)),
  "GET /places → every entry has inbox + spec_ref; x-shokai-inbox gone (C119)");
check(list.body.places.every((p: any) => p["x-test-profile"] === "shokai-b/0.3"), "every entry declares x-test-profile shokai-b/0.3 (Appendix B)");
check(list.body.places.filter((p: any) => p["x-test-decider"] === true).map((p: any) => p.name).join() === "harborlight", "only the bank (harborlight) declares x-test-decider: true (B.4)");
const P = (n: string) => list.body.places.find((p: any) => p.name === n);
const fern = P("fernwood"), harbor = P("harborlight"), pairP = P("pair"), eng = P("engawa");
check((await req(path(fern.entry))).status === 404 && (await req(path(fern.entry), "PUT", "{}")).status === 404 && (await req(path(fern.lobby), "DELETE")).status === 404 && (await req("/", "POST", "{}")).status === 404,
  "GET/PUT on an entry, DELETE on a lobby, POST on / → 404 (C120)");
{ // §11.1 (C200): the 404 at a place's own address names that place in `here` and says POST; any other address has no `here`.
  const g = await req(path(fern.entry)); const i = await req(path(fern.inbox)); const other = await req("/places/no-such-place/entry"); const proto = await req("/places/__proto__/entry");
  check(g.status === 404 && g.body.here?.name === "fernwood" && g.body.here?.entry === fern.entry && g.body.here?.method === "POST" && i.body.here?.name === "fernwood",
    "GET <entry> or <inbox> → 404 DoorPointer whose `here` names that place, with method POST (C200)");
  check(other.status === 404 && other.body.here === undefined && unk.body.here === undefined && proto.status === 404 && proto.body.type === "door_pointer" && proto.body.here === undefined,
    "a 404 for an address that isn't a place's own (unknown name, __proto__, unknown path) carries no `here` (C200)");
}
const viaLobby = await post(path(fern.lobby), "Hello! Can I buy a cup?");
check(types(viaLobby).includes("lobby_briefing") && pl(viaLobby).find((p) => p.type === "lobby_briefing").inbox === fern.inbox, "POST at the lobby works like the entry → the lobby, which names the inbox (C120)");
const prose = await post(path(fern.entry), "Hello!");
check(prose.protocol === "shokai/0.3" && pl(prose).find((p) => p.type === "lobby_briefing").spec_ref?.version === "0.3.0", "prose at the entry → 200 ReplyEnvelope with the lobby (spec_ref 0.2.5)");
{ // v0.3.0-rc1 (§3.1, D20): the front is open to look at. A bare request (no headers beyond fetch's own, no card, no cookie) reads the listing and the lobby, and nothing is set on the reader.
  const bare = await fetch(BASE + "/places"); const bl: any = await bare.json();
  const lob = await fetch(BASE + path(fern.lobby), { method: "POST", body: "Just looking, thanks." }); const le: any = await lob.json();
  check(bare.status === 200 && bl.type === "place_listing" && bl.places.length > 0 && lob.status === 200 && pl(le).some((p) => p.type === "lobby_briefing") && !bare.headers.has("set-cookie") && !lob.headers.has("set-cookie"),
    "D20 front open: a bare GET /places and an unsigned lobby POST → 200, with no card, key or cookie asked for and no cookie set (C173)");
}

// ---- a ritual over HTTP ----
function ritual(v: Visitor, place: any, enc = randomId("enc")) {
  let n = 0; const E = path(place.entry);
  const msg = (type: string, body: object) => JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: enc, msg_id: `${enc}-${++n}`, sent_at: now(), from: v.rep.id, to: place.representative_id, type, ...body }, v.rep, now()));
  return { enc, E, msg, send: (type: string, body: object) => post(E, msg(type, body)),
    async open(vouch: unknown = null) { const g = await post(E, msg("greeting", { locales: ["en-US"], nonce: randomId("n") })); const hn = pl(g).find((p) => p.type === "greeting").nonce;
      const proof = makeSigned(possessionPayload(enc, hn), v.rep, now()).signatures[0]; await post(E, msg("card_presentation", { card: v.card, possession_proof: proof }));
      return post(E, msg("introduction", { vouch })); } };
}
const proposal = (actions: string[], limits?: S.Limits) => ({ request: { actions, ...(limits ? { limits } : {}) }, value_to_counterparty: { text: "Hi!", locale: "en-US" }, etiquette_register: "first_meeting" });
const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ["store.browse_catalog", "store.place_order"] });
const m = mandate(dana, "purchase", ["store.browse_catalog", "store.place_order"], { max_amount: { value: "80.00", currency: "USD" } }, { valid_from: plus(-3600), expires_at: plus(86400) });
const rd = ritual(dana, fern); await rd.open();
const r = await rd.send("invitation_request", { card_digest: dana.card.payload_digest, mandate: m, proposal: proposal(["store.browse_catalog", "store.place_order"], { max_amount: { value: "80.00", currency: "USD" } }), "x-client": "e2e" });
const resp = pl(r).find((p) => p.type === "invitation_response");
check(resp?.decision === "grant" && resp.seat.limits.max_amount.value === "80.00", "prepared visit over HTTP → grant, 80.00 USD seat (an unknown x- member ignored)");

// ---- polls (§11.2) ----
const inbox = path(fern.inbox);
const mine = await req(inbox, "POST", JSON.stringify(inboxPoll(dana.rep, fern.representative_id, now())));
check(mine.status === 200 && mine.body.protocol === "shokai/0.3" && Array.isArray(mine.body.messages), "signed inbox_poll → 200 ReplyEnvelope (C121)");
const anyone = await req(inbox, "POST", JSON.stringify(inboxPoll(newEd25519(), fern.representative_id, now())));
check(anyone.status === 200 && anyone.body.messages.length === 0, "a valid poll from any signer → 200 with its own (empty) inbox (C121)");
const forged = inboxPoll(newEd25519(), fern.representative_id, now()); (forged.payload as any).from = dana.rep.id;
const f = await req(inbox, "POST", JSON.stringify(forged));
check(f.status === 403 && JSON.stringify(f.body) === '{"protocol":"shokai/0.3","messages":[]}', "poll not signed by its from → 403 + empty envelope (C122)");
const once = JSON.stringify(inboxPoll(dana.rep, fern.representative_id, now())); await req(inbox, "POST", once);
check((await req(inbox, "POST", once)).status === 403, "reused poll msg_id → 403 (C122)");
check((await req(inbox, "POST", JSON.stringify(inboxPoll(dana.rep, fern.representative_id, plus(-301))))).status === 403, "poll sent_at 301 s off → 403 (C122)");

// ---- B.1: loopback vouch log (harborlight payment_initiation needs a vouch) ----
const acme = visitor("Acme", "company", { purposes: ["payment_initiation"], actions: ["bank.submit_payment"] });
// v0.2.8 (§4, Appendix B.5): a payment needs an introducer the bank names; in a conformance run that is the test introducer.
const intro = ed25519FromLabel(TEST_INTRODUCER_LABEL);
fixtures.set("/log/ok", () => []);
const mkVouch = (log: string) => signBy(intro, { vouch_id: randomId("vouch"), introducer: { principal_id: intro.id, display_name: "Example Accounting" }, subject: { representative_id: acme.rep.id, card_digest: acme.card.payload_digest },
  scope: { purposes: ["payment_initiation"] }, revocation_log: log, relationship: "known_personally", issued_at: plus(-86400), expires_at: plus(30 * 86400) } as S.Vouch);
const am = mandate(acme, "payment_initiation", ["bank.submit_payment"], { max_amount: { value: "100.00", currency: "USD" } }, { valid_from: plus(-3600), expires_at: plus(86400) });
const goodV = mkVouch(FX + "/log/ok");
const rv = ritual(acme, harbor); await rv.open(goodV);
const rvr = pl(await rv.send("invitation_request", { card_digest: acme.card.payload_digest, mandate: am, vouch_digest: goodV.payload_digest, proposal: proposal(["bank.submit_payment"], { max_amount: { value: "100.00", currency: "USD" } }) })).find((p) => p.type === "invitation_response");
check(rvr?.decision === "grant", "vouch whose revocation log is a loopback http URL (B.1) → fetched, empty, full weight → grant");
const badV = mkVouch(FX + "/log/missing");
const rb = ritual(acme, harbor); await rb.open(badV);
const rbr = pl(await rb.send("invitation_request", { card_digest: acme.card.payload_digest, mandate: am, vouch_digest: badV.payload_digest, proposal: proposal(["bank.submit_payment"], { max_amount: { value: "100.00", currency: "USD" } }) })).find((p) => p.type === "invitation_response");
check(rbr?.decision === "deny" && rbr.disposition === "not_now", "unreachable loopback log → the vouch has no weight → deny not_now");

// ---- C142 encounter binding over HTTP (the C109 bug): an outsider's message in Acme's encounter ----
{ const mal = visitor("Mallory", "company", { purposes: ["payment_initiation"], actions: ["bank.submit_payment"] });
  const ra2 = ritual(acme, harbor); await ra2.open(goodV);
  const om = JSON.stringify(makeSigned({ protocol: "shokai/0.3", encounter_id: ra2.enc, msg_id: "mal-1", sent_at: now(), from: mal.rep.id, to: harbor.representative_id, type: "invitation_request",
    card_digest: mal.card.payload_digest, mandate: mandate(mal, "payment_initiation", ["bank.submit_payment"], {}, { valid_from: plus(-3600), expires_at: plus(86400) }), proposal: proposal(["bank.submit_payment"]) }, mal.rep, now()));
  const or = await post(path(harbor.entry), om); const d = pl(or);
  check(d.length === 1 && d[0].type === "invitation_response" && d[0].to === mal.rep.id && d[0].in_reply_to === "mal-1" && d[0].reason_code === "RITUAL_ORDER" && d[0].disposition === "not_now", "outsider in Acme's encounter → deny not_now RITUAL_ORDER addressed to the outsider (C142)");
  const ap = await req(path(harbor.inbox), "POST", JSON.stringify(inboxPoll(acme.rep, harbor.representative_id, now())));
  check(ap.status === 200 && !pl(ap.body).some((p) => p.in_reply_to === "mal-1"), "nothing held for Acme because of it (C109 fix)");
  const mp = await req(path(harbor.inbox), "POST", JSON.stringify(inboxPoll(mal.rep, harbor.representative_id, now())));
  check(mp.status === 200 && mp.body.messages.length === 0, "and nothing held for the outsider either (the deny came in the reply)");
  const cont = pl(await ra2.send("invitation_request", { card_digest: acme.card.payload_digest, mandate: am, vouch_digest: goodV.payload_digest, proposal: proposal(["bank.submit_payment"], { max_amount: { value: "100.00", currency: "USD" } }) })).find((p) => p.type === "invitation_response");
  check(cont?.decision === "grant", "Acme's encounter is unchanged: its own request is still granted");
}

// ---- B.4 test decider at the bank (C138, C139) ----
{ const acme2 = visitor("Acme Two", "company", { purposes: ["account_servicing"], actions: ["bank.get_balance", "bank.change_beneficiary"] });
  const v2 = signBy(intro, { vouch_id: randomId("vouch"), introducer: { principal_id: intro.id, display_name: "Example Accounting" }, subject: { representative_id: acme2.rep.id, card_digest: acme2.card.payload_digest },
    scope: { purposes: ["account_servicing"] }, revocation_log: FX + "/log/ok", relationship: "known_personally", issued_at: plus(-86400), expires_at: plus(30 * 86400) } as S.Vouch);
  const rc = ritual(acme2, harbor); await rc.open(v2);
  const cm = mandate(acme2, "account_servicing", ["bank.get_balance"], {}, { valid_from: plus(-3600), expires_at: plus(86400) });
  const cr = await rc.send("invitation_request", { card_digest: acme2.card.payload_digest, mandate: cm, vouch_digest: v2.payload_digest, proposal: proposal(["bank.change_beneficiary"]) });
  const ty = types(cr); const cons = pl(cr).find((p) => p.type === "invitation_response"); const held = pl(cr).find((p) => p.type === "held");
  check(cons?.decision === "considering" && ty.indexOf("held") === ty.indexOf("invitation_response") + 1 && held.answer_by === cons.response_by && held.in_reply_to === cons.in_reply_to, "considering → held right after it (in_reply_to = request, answer_by = response_by) (C138)");
  const cp = await req(path(harbor.inbox), "POST", JSON.stringify(inboxPoll(acme2.rep, harbor.representative_id, now())));
  const oc = pl(cp.body).find((p) => p.type === "consideration_outcome");
  check(oc?.decision === "conditional" && JSON.stringify(oc.conditions) === '[{"code":"require_mandate","params":{"actions":["bank.change_beneficiary"]}}]' && oc.retry?.kind === "with_credential" && oc.retry.credentials?.[0] === "signed_mandate" && oc.decided_by?.kind === "role" && oc.decided_by.human === false && JSON.stringify(oc.approved.actions) === '["bank.change_beneficiary"]' && Date.parse(oc.approved.valid_until) - Date.parse(oc.basis.decided_at) === 7 * 86400e3 && !oc.seat,
    "poll → the test decider's conditional require_mandate, retry signed_mandate (v0.2.6; approved actions, 7 days, decided_by human: false, no seat) (C139)");
}

// ---- B.1: loopback allowance status at fernwood ----
const aya = visitor("Aya", "person", { purposes: ["visitation"], actions: ["store.browse_catalog"] });
const learn: S.AllowanceGrant = { grant_id: "learn", salt: "learn-salt-0123456789abcdef", purposes: ["visitation"], place_categories: ["store"], actions: ["store.browse_catalog"] };
const allowance = makeOwnerSigned<S.Allowance>({ allowance_id: "al-e2e", owner_id: aya.owner.id, representative_id: aya.rep.id, card_id: aya.card.payload.card_id, grant_digests: [digestOf(learn)],
  shown_to_owner: { text: "Look around in stores.", locale: "en-US" }, valid_from: plus(-3600), expires_at: plus(30 * 86400), revocation_status: FX + "/status" }, aya.owner as PasskeyOwner, now());
let statusLife = 3600;
fixtures.set("/status", () => makeSigned<S.AllowanceStatus>({ allowance_id: "al-e2e", allowance_digest: allowance.payload_digest, status: "active", issued_at: plus(-60), next_update: plus(statusLife - 60) }, aya.platform, plus(-60)));
const um = makeSigned<S.Mandate>({ mandate_id: "m-e2e", principal_id: aya.owner.id, representative_id: aya.rep.id, card_id: aya.card.payload.card_id, purpose: { code: "visitation", statement: "Look around", locale: "en-US" },
  allowed_actions: ["store.browse_catalog"], limits: {}, valid_from: plus(-3600), expires_at: plus(86400), under_allowance: { allowance_id: "al-e2e", allowance_digest: allowance.payload_digest, grant_digest: digestOf(learn) } }, aya.rep, now());
const ra = ritual(aya, fern); await ra.open();
const rar = pl(await ra.send("invitation_request", { card_digest: aya.card.payload_digest, mandate: um, allowance: { allowance, grant: learn }, proposal: proposal(["store.browse_catalog"]) })).find((p) => p.type === "invitation_response");
check(rar?.decision === "grant", "allowance whose status URL is loopback http (B.1), 1-hour status → grant");
statusLife = 7200;
const ra2 = ritual(aya, fern); await ra2.open();
const rar2 = pl(await ra2.send("invitation_request", { card_digest: aya.card.payload_digest, mandate: um, allowance: { allowance, grant: learn }, proposal: proposal(["store.browse_catalog"]) })).find((p) => p.type === "invitation_response");
check(rar2?.decision === "deny" && rar2.reason_code === "MANDATE_INVALID", "2-hour status → refused (D12, C132)");

// ---- B.2: pair place with the test owner ----
const kiran = visitor("Kiran Vale", "person", { purposes: ["collaboration"], actions: ["peer.share_portfolio_sample", "peer.commit_to_project"] });
const kOwner = kiran.owner as PasskeyOwner;
const inv = makeOwnerSigned<S.PeerInvitation>({ invitation_id: randomId("inv"), from_owner: { principal_id: kOwner.id, display_name: "Kiran Vale" }, to_owner: { principal_id: pairP.principal_id, display_name: "Aya Linden" },
  representatives: [kiran.rep.id, pairP.representative_id], purposes: ["collaboration"], place: { place_id: randomId("pair"), kind: "pair", house_rules: { default_attribution: "private", private_never_leaves: true } },
  valid_from: plus(-60), expires_at: plus(14 * 86400), answer_by: plus(86400) }, kOwner, now());
const ip = ritual(kiran, pairP, inv.payload.invitation_id + "-invite");
const ir = await ip.send("peer_invitation", { invitation: inv, reply_to: FX + "/kiran/entry" });
const heldI = pl(ir).find((p) => p.type === "held");
check(!!heldI && heldI.inbox === pairP.inbox && ir.messages[0].signatures?.length === 1, "peer_invitation → signed held {in_reply_to, inbox} in the reply (C123)");
const kp = await req(path(pairP.inbox), "POST", JSON.stringify(inboxPoll(kiran.rep, pairP.representative_id, now())));
const ans = pl(kp.body).find((p) => p.type === "peer_invitation_answer");
check(kp.status === 200 && ans?.answer.payload.decision === "approve" && ans.answer.payload.subject_ref.digest === inv.payload_digest, "poll → the test owner's signed accept_invitation (B.2, C124)");
// Kiran's owner-signed invitation was answered; now Aya's side needs its own invitation to seat Kiran: the test owner issues none over the wire, so we meet under Kiran's invitation by the B.2 path only.

// ---- B.3: the test gathering ----
const vis = visitor("Visitor V", "person", { purposes: ["invitation", "gathering"], actions: ["gathering.request_invitation", "gathering.attend"] });
const gr = ritual(vis, eng); await gr.open();
const gm = mandate(vis, "invitation", ["gathering.request_invitation"], {}, { valid_from: plus(-3600), expires_at: plus(86400) });
const grr = pl(await gr.send("invitation_request", { card_digest: vis.card.payload_digest, mandate: gm, proposal: proposal(["gathering.request_invitation"]) })).find((p) => p.type === "invitation_response");
check(grr?.decision === "grant", "gathering.request_invitation (purpose invitation) → grant (B.3)");
const vp = await req(path(eng.inbox), "POST", JSON.stringify(inboxPoll(vis.rep, eng.representative_id, now())));
const gi = pl(vp.body).find((p) => p.type === "gathering_invitation");
check(!!gi && gi.gathering.payload.invitees.some((x: any) => x.representative_id === vis.rep.id), "poll → gathering_invitation with a re-signed Gathering naming the visitor (C127)");
if (gi) {
  const consent = ownerConsent(vis.owner as PasskeyOwner, vis.rep.id, "accept_house_rules", { kind: "gathering", id: gi.gathering.payload.gathering_id, digest: gi.gathering.payload_digest }, { issued_at: now(), expires_at: plus(86400) });
  const ge = ritual(vis, eng); await ge.open();
  const am2 = mandate(vis, "gathering", ["gathering.attend"], {}, { valid_from: plus(-3600), expires_at: plus(86400) });
  const ger = pl(await ge.send("invitation_request", { card_digest: vis.card.payload_digest, mandate: am2, owner_consents: [consent], proposal: proposal(["gathering.attend"]) })).find((p) => p.type === "invitation_response");
  check(ger?.decision === "grant", "the new invitee enters with accept_house_rules over the new Gathering digest");
}
fx.close();
console.log(`\n${ok} pass, ${bad} fail`); process.exitCode = bad ? 1 : 0;
