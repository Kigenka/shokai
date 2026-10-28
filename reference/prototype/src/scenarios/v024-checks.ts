/**
 * V5: the v0.2.4 checks (S3 round 3). Round 3's cross-test could not reach the vouch log, the pair place or the gathering
 * without side agreements. This scenario runs those paths SPEC-ONLY through the HTTP binding (§11) and the conformance
 * test profile (Appendix B): a loopback door, a simulated pair owner that answers by a documented rule, and a gathering
 * place that admits a verified requester of `gathering.request_invitation`. It also covers the round-3 fixes: inbox
 * fields, the door root, POST lobby, 404 for other methods, poll freshness and replay, the `held` notice, the stated
 * passkey rp_id, vouch_digest, a missing vouch (not now), templates by purpose, and D12 (the 1-hour allowance status).
 * All names are fictional; everything is local (127.0.0.1 is a loopback base in name only; nothing listens).
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative, type Wire } from "../representative.js";
import { Exchange } from "../wire.js";
import { Door, type HttpResponse } from "../door.js";
import { ed25519FromLabel, passkeyFromLabel, signed, signDigest, digestOf, verifySigned, verifySignature } from "../crypto.js";
import type { ScenarioResult } from "./common.js";
import { AllowanceKeeper, publishAllowanceStatus, statusUsable, verifyConsent, testOwnerInvitationRule, STATUS_MAX_LIFETIME_H } from "../owner.js";
import type { DoorPointer, Gathering, InvitationResponse, LobbyBriefing, PeerInvitation, PlaceListing, ReplyEnvelope, ConsiderationOutcome } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "V5: Round-3 fixes and the spec-only test path (v0.2.4)",
    "Everything a round-3 tester needed a side agreement for, done from the spec alone: the door's inboxes, a pair place whose test owner answers by a written rule, a gathering that admits a verified requester, and the round-3 fixes as mechanical checks.",
    [["Aya's representative", "The prepared visitor"], ["Fernwood Goods", "A fictional online store"], ["Harborlight", "A fictional bank"], ["Test pair place", "A conformance pair place with a simulated owner (fictional)"], ["Lantern's host", "A gathering place (fictional)"], ["A stranger", "A fictional representative with nothing waiting"]],
  );
  const w = makeWorld(rec);
  const { fernwoodRep: fern, harborRep: harbor, lanternRep: lantern } = w.hosts;
  const y = w.ayaRep;
  const now = () => w.clock.now();
  const plus = (min: number) => new Date(Date.parse(now()) + min * 60_000).toISOString().replace(".000Z", "Z");

  // ---------------------------------------------------------------- the test-profile places
  const PID = "pair-v5-test";
  const kiranT = new Representative({ name: "Test pair place", repKey: ed25519FromLabel("rep:kiran-test"), principal: { principal_id: w.owners.kiran.id, kind: "person", display_name: "Kiran Vale" }, principalKey: w.owners.kiran.key,
    locales: ["en-US"], ownerLocale: "en-US", profile: {
      policy: w.policy({ policy_version: "pair-test-v5", requires_introduction: true, standard_actions: ["peer.share_project_brief"], consideration: { actions: ["peer.commit_to_project"], route: { kind: "principal", principal_id: w.owners.kiran.id }, days: 7 }, pair_invitation_required: true }),
      phrases: { "en-US": w.en({ greet: "Hello, friend of a friend." }) }, onboarding_url: "", probe_threshold: 4, norms: { locales: ["en-US"], formality: "casual" }, category: "pair", pair: { place_id: PID }, slug: "pair-test",
      test_profile: { owner: { key: w.owners.kiran.key, owner_id: w.owners.kiran.id } } }, ...w.shared });
  w.owners.kiran.name = "Kiran Vale";
  w.issueCard(kiranT, w.owners.kiran, { role: "Personal representative of Kiran Vale (conformance pair place)", purposes: ["collaboration"], actions: ["peer.share_project_brief", "peer.commit_to_project"] });
  kiranT.pairIntroVouch = w.issueVouch(w.owners.aya, kiranT, ["collaboration"], "friend", "vouch-aya-kiran-v5");
  const g0 = signed<Gathering>({ gathering_id: "g-v5-1", place: { principal_id: w.orgs.lantern.id, display_name: "The Lantern Collective" }, title: "Open circle (test profile)", invitees: [],
    house_rules: { default_attribution: "chatham_house", private_never_leaves: true, pressing_after_decline: "flagged", quoting: "paraphrase_by_default", entry_requires_consent: true }, starts_at: plus(60), ends_at: plus(180) }, [w.orgs.lantern.key], now());
  lantern.profile = { ...lantern.profile!, policy: { ...lantern.profile!.policy, requires_introduction: false, standard_actions: [...lantern.profile!.policy.standard_actions, "gathering.request_invitation"] }, gathering: g0, test_profile: { gathering_signer: w.orgs.lantern.key } };

  const BASE = "http://127.0.0.1:8080";
  const door = new Door(BASE, [fern, harbor, kiranT, lantern], now);
  const listing = door.http({ method: "GET", path: `${BASE}/places` }).body as PlaceListing;
  const entryOf = (h: Representative) => listing.places[door.places.indexOf(h)];
  const root = door.http({ method: "GET", path: `${BASE}/` });
  const rootSlash = door.http({ method: "GET", path: `${BASE}` });

  rec.h2("The door: root, listing, inboxes");
  rec.note(`The door root answers with its pointer; every place names its entry, lobby and inbox, and the spec it speaks (v${listing.places[0].spec_ref.version}).`);

  // drive a visit through the door's HTTP binding only (the visitor sees nothing but HTTP responses)
  const viaDoor = (v: Representative, url: string, first: Wire): void => {
    const q: Wire[] = [first];
    let guard = 0;
    while (q.length && guard++ < 40) {
      const m = q.shift()!;
      const r = door.http({ method: "POST", path: url, contentType: "application/json", body: m });
      for (const o of (r.body as ReplyEnvelope).messages ?? []) q.push(...v.receive(o as unknown as Wire));
    }
  };
  let pollSeq = 0;
  const poll = (v: Representative, h: Representative, ov: { sent_at?: string; msg_id?: string; unsigned?: boolean } = {}): HttpResponse => {
    const p = { protocol: "shokai/0.3" as const, encounter_id: `poll-${v.did.slice(-6)}`, msg_id: ov.msg_id ?? `v5-poll-${++pollSeq}`, sent_at: ov.sent_at ?? now(), from: v.did, to: h.did, type: "inbox_poll" as const };
    return door.http({ method: "POST", path: entryOf(h).inbox, body: ov.unsigned ? { payload: p, payload_digest: digestOf(p), signatures: [] } : v.sign(p) });
  };
  const pollMsgs = (r: HttpResponse) => ((r.body as ReplyEnvelope).messages ?? []) as unknown as Wire[];

  // methods and paths
  const lobbyPost = door.http({ method: "POST", path: entryOf(fern).lobby, contentType: "application/json", body: y.greet("v5-lobby-post", fern) });
  const getEntry = door.http({ method: "GET", path: entryOf(fern).entry });
  const putEntry = door.http({ method: "PUT", path: entryOf(fern).entry, body: {} });
  const deleteRoot = door.http({ method: "DELETE", path: `${BASE}/` });
  const getLobby = door.http({ method: "GET", path: entryOf(fern).lobby });
  // a malformed header timestamp → treated as malformed → the lobby
  const badTs = y.sign({ ...(y.greet("v5-badts", fern).payload as object), encounter_id: "v5-badts", sent_at: "2026-10-25 01:00:00" } as never);
  const badTsResp = door.http({ method: "POST", path: entryOf(fern).entry, contentType: "application/json", body: badTs });

  // polls: stranger (200, empty), unsigned / stale / replayed / mismatched (403, empty envelope)
  rec.h2("Polling: anyone may ask for their own mail; only a bad poll is refused");
  const stranger = new Representative({ name: "A stranger", repKey: ed25519FromLabel("rep:stranger-v5"), principal: { principal_id: w.owners.mika.id, kind: "person", display_name: "Mika" }, principalKey: w.owners.mika.key, locales: ["en-US"], ownerLocale: "en-US", phrases: w.VIS_EN, ...w.shared });
  const strangerPoll = poll(stranger, fern);
  const unsignedPoll = poll(y, fern, { unsigned: true });
  const stalePoll = poll(y, fern, { sent_at: plus(-10) });
  const futurePoll = poll(y, fern, { sent_at: plus(10) });
  const okPoll = poll(y, fern, { msg_id: "v5-poll-replay" });
  const replayPoll = poll(y, fern, { msg_id: "v5-poll-replay" });
  const mismatchPoll = door.http({ method: "POST", path: entryOf(fern).inbox, body: stranger.sign({ protocol: "shokai/0.3", encounter_id: "poll-x", msg_id: "v5-poll-mis", sent_at: now(), from: y.did, to: fern.did, type: "inbox_poll" } as never) });

  // ---------------------------------------------------------------- pair place, spec-only
  rec.h2("A pair place with a test owner: invitation → held → answer in the inbox → meeting → commitment outcome in the inbox");
  w.issueMandate(y, w.owners.aya, "m-v5-collab", "collaboration", "Explore a project with Kiran; never commit", ["peer.share_project_brief", "peer.commit_to_project"]);
  const kv = w.issueVouch(w.owners.kiran, y, ["collaboration"], "friend", "vouch-kiran-aya-v5");
  const mkInv = (id: string, purposes: PeerInvitation["purposes"], answerBy: string, days = 14) => signed<PeerInvitation>({ invitation_id: id, from_owner: { principal_id: w.owners.aya.id, display_name: "Aya Linden" }, to_owner: { principal_id: w.owners.kiran.id, display_name: "Kiran Vale" },
    representatives: [y.did, kiranT.did], purposes, place: { place_id: PID, kind: "pair", house_rules: { default_attribution: "private", private_never_leaves: true } }, valid_from: now(), expires_at: plus(60 * 24 * days), answer_by: answerBy }, [w.owners.aya.key], now());
  const yInbox = `${BASE}/visitors/aya/inbox`;
  const inv = mkInv("inv-v5-1", ["collaboration"], plus(60 * 24 * 7));
  const deliverResp = door.http({ method: "POST", path: entryOf(kiranT).entry, contentType: "application/json", body: y.deliverPeerInvitation(inv, kiranT.did, yInbox) });
  const heldMsgs = pollMsgs(deliverResp);
  const held = heldMsgs.find((m) => m.payload.type === "held");
  w.clock.advance(1);
  const answerPoll = poll(y, kiranT);
  const answers = pollMsgs(answerPoll).filter((m) => m.payload.type === "peer_invitation_answer");
  for (const a of answers) y.receive(a);
  const accepted = y.peerInvitation?.invitation.payload.invitation_id === "inv-v5-1";
  w.clock.advance(1);
  viaDoor(y, entryOf(kiranT).entry, y.greet(PID, kiranT));
  viaDoor(y, entryOf(kiranT).entry, y.presentCard(PID));
  viaDoor(y, entryOf(kiranT).entry, y.introduce(PID, kv));
  viaDoor(y, entryOf(kiranT).entry, y.request(PID, { mandate_id: "m-v5-collab", actions: ["peer.share_project_brief"], pitch: "Here's our brief." }));
  const meetResp = y.getEnc(PID).received.response as InvitationResponse;
  viaDoor(y, entryOf(kiranT).entry, y.request(PID, { mandate_id: "m-v5-collab", actions: ["peer.commit_to_project"], pitch: "Shall we commit?" }));
  const commitResp = y.getEnc(PID).received.response as InvitationResponse;
  const consWire = kiranT.decisions.find((d) => d.encounter_id === PID && d.response.decision === "considering");
  w.clock.advance(1);
  const outcomePoll = poll(y, kiranT);
  const outcome = pollMsgs(outcomePoll).find((m) => m.payload.type === "consideration_outcome")?.payload as ConsiderationOutcome | undefined;
  const outcomeConsent = outcome?.owner_consents?.[0];
  const consDigest = consWire ? digestOf(consWire.response) : "";
  const outcomeConsentV = outcomeConsent ? verifyConsent(outcomeConsent, { owner_id: w.owners.kiran.id, representative_id: kiranT.did, now: now(), subject_digest: consDigest, action: "approve_commitment" }) : undefined;
  viaDoor(y, entryOf(kiranT).entry, y.farewell(PID, "taken_inside"));
  const lastSeen = (pollMsgs(outcomePoll).at(-1)?.payload as { msg_id?: string } | undefined)?.msg_id;
  const emptyAfter = pollMsgs(door.http({ method: "POST", path: entryOf(kiranT).inbox, body: y.sign({ protocol: "shokai/0.3", encounter_id: "poll-since", msg_id: `v5-poll-${++pollSeq}`, sent_at: now(), from: y.did, to: kiranT.did, type: "inbox_poll", since: lastSeen } as never) })).length;
  // the rule declines what is outside it (a purchase purpose); the answer is a signed decline in the inbox
  const invNo = mkInv("inv-v5-2", ["purchase"], plus(60 * 24 * 7));
  door.http({ method: "POST", path: entryOf(kiranT).entry, contentType: "application/json", body: y.deliverPeerInvitation(invNo, kiranT.did, yInbox) });
  const declineAns = pollMsgs(poll(y, kiranT)).find((m) => m.payload.type === "peer_invitation_answer" && (m.payload as { invitation_id?: string }).invitation_id === "inv-v5-2")?.payload as { answer: { payload: { decision: string } } } | undefined;
  const ruleCases = {
    ok: testOwnerInvitationRule(inv.payload, w.owners.kiran.id, kiranT.did, now()).why,
    purpose: testOwnerInvitationRule(invNo.payload, w.owners.kiran.id, kiranT.did, now()).why,
    long: testOwnerInvitationRule(mkInv("inv-v5-long", ["collaboration"], plus(60), 45).payload, w.owners.kiran.id, kiranT.did, now()).why,
  };
  // answer_by already passed: nothing is taken home and no answer comes (silence = decline)
  const invLate = signed<PeerInvitation>({ ...inv.payload, invitation_id: "inv-v5-late", answer_by: plus(-10) }, [w.owners.aya.key], now());
  const lateResp = door.http({ method: "POST", path: entryOf(kiranT).entry, contentType: "application/json", body: y.deliverPeerInvitation(invLate, kiranT.did, yInbox) });
  const lateHeld = pollMsgs(lateResp).some((m) => m.payload.type === "held");
  const lateAnswer = pollMsgs(poll(y, kiranT)).some((m) => m.payload.type === "peer_invitation_answer" && (m.payload as { invitation_id?: string }).invitation_id === "inv-v5-late");
  // an answer issued after answer_by is ignored by the inviter
  const invShort = mkInv("inv-v5-short", ["collaboration"], plus(2));
  const xs = new Exchange(y, kiranT);
  y.deliverPeerInvitation(invShort, kiranT.did, yInbox);
  w.clock.advance(15);
  const before = y.peerInvitation?.invitation.payload.invitation_id;
  const lateAnsWire = kiranT.answerPeerInvitation(invShort, signed({ consent_id: "oc-v5-late", owner_id: w.owners.kiran.id, representative_id: kiranT.did, action: "accept_invitation", decision: "approve",
    subject_ref: { kind: "invitation", id: "inv-v5-short", digest: invShort.payload_digest }, assurance: "passkey", expires_at: plus(60 * 24), shown_to_owner: { text: "Accept (late)?", locale: "en-US" }, issued_at: now() } as never, [w.owners.kiran.key], now()) as never);
  xs.send(kiranT, lateAnsWire);
  const lateIgnored = y.peerInvitation?.invitation.payload.invitation_id === before;

  // ---------------------------------------------------------------- gathering, spec-only
  rec.h2("A gathering that admits a verified requester (test profile)");
  w.issueMandate(y, w.owners.aya, "m-v5-gather", "invitation", "Ask to be invited to the Lantern circle", ["gathering.request_invitation"]);
  w.clock.advance(1);
  viaDoor(y, entryOf(lantern).entry, y.greet("v5-gather", lantern));
  viaDoor(y, entryOf(lantern).entry, y.presentCard("v5-gather"));
  viaDoor(y, entryOf(lantern).entry, y.introduce("v5-gather", null));
  viaDoor(y, entryOf(lantern).entry, y.request("v5-gather", { mandate_id: "m-v5-gather", actions: ["gathering.request_invitation"], pitch: "May Aya's representative join the open circle?" }));
  const gatherResp = y.getEnc("v5-gather").received.response as InvitationResponse;
  const gatherPoll = poll(y, lantern);
  const gInvites = pollMsgs(gatherPoll).filter((m) => m.payload.type === "gathering_invitation");
  for (const g of gInvites) y.receive(g);
  const invitedNow = y.gatheringInvites.some((g) => g.payload.gathering_id === "g-v5-1" && g.payload.invitees.some((i) => i.representative_id === y.did) && verifySigned(g, w.orgs.lantern.id).ok);

  // ---------------------------------------------------------------- passkey rp_id travels in the signature
  rec.h2("Passkeys: the rp_id travels in the signature, so an owner never seen before can be checked");
  const unseen = passkeyFromLabel("owner:never-seen-v5");
  const dgt = digestOf({ v5: "rp" });
  const sigOk = signDigest(dgt, unseen, now());
  const sigMismatch = signDigest(dgt, unseen, now(), { rpId: "0wners.example", statedRpId: "owners.example" });
  const sigMissing = signDigest(dgt, unseen, now(), { omitRpId: true });
  const rp = { statedOk: verifySignature(dgt, sigOk), mismatch: verifySignature(dgt, sigMismatch), missing: verifySignature(dgt, sigMissing), stated: sigOk.webauthn?.rp_id, knownWrong: verifySignature(dgt, sigOk, "elsewhere.example") };

  // ---------------------------------------------------------------- vouch_digest and a missing vouch
  rec.h2("Introductions: vouch_digest must match, and a missing vouch is a setup gap");
  w.issueMandate(y, w.owners.aya, "mand-v5-bank", "x-partnership", "Propose a pilot", ["bank.product_info", "bank.propose_agent_pilot"]);
  const vd = (id: string, vouch: typeof w.mikaVouch | null, patch: (p: Record<string, unknown>) => Record<string, unknown>) => {
    const x = new Exchange(y, harbor);
    x.send(y, y.greet(id, harbor)); x.send(y, y.presentCard(id)); x.send(y, y.introduce(id, vouch));
    const r = y.request(id, { mandate_id: "mand-v5-bank", actions: ["bank.propose_agent_pilot"], pitch: "A small pilot." });
    x.send(y, y.sign(patch({ ...(r.payload as unknown as Record<string, unknown>) }) as never));
    w.clock.advance(1);
    return y.getEnc(id).received.response as InvitationResponse;
  };
  const vdGood = vd("v5-vd-good", w.mikaVouch, (p) => p);
  const vdMissing = vd("v5-vd-missing", w.mikaVouch, (p) => { const q = { ...p }; delete q.vouch_digest; return q; });
  const vdWrong = vd("v5-vd-wrong", w.mikaVouch, (p) => ({ ...p, vouch_digest: digestOf({ other: 1 }) }));
  const vdExtra = vd("v5-vd-extra", null, (p) => ({ ...p, vouch_digest: w.mikaVouch.payload_digest }));
  const noVouch = vd("v5-novouch", null, (p) => p);

  // ---------------------------------------------------------------- templates by purpose
  const lobbyWire = pollMsgs(lobbyPost).find((m) => m.payload.type === "lobby_briefing");
  const viaLobby = door.http({ method: "POST", path: entryOf(fern).lobby, contentType: "text/plain", body: "hello?" });
  const lobby = pollMsgs(viaLobby).find((m) => m.payload.type === "lobby_briefing")?.payload as LobbyBriefing | undefined;

  // ---------------------------------------------------------------- D12: the 1-hour allowance status
  rec.h2("D12: a signed allowance status is good for at most one hour");
  const { allowance } = AllowanceKeeper.issue({ owner_id: w.owners.aya.id, ownerKey: w.owners.aya.key, representative_id: y.did, card_id: y.card!.payload.card_id, now: now(), days: 90, status: `${BASE}/status/aya`,
    summary: "Learn visits only (test).", grants: [{ grant_id: "learn", purposes: ["visitation"], place_categories: ["store"], actions: ["store.browse_catalog"] }] });
  const pk = y.card!.payload.owner_binding?.platform_key;
  const st1 = publishAllowanceStatus(allowance, now());
  const st2 = publishAllowanceStatus(allowance, now(), 2);
  const d12 = { hours: STATUS_MAX_LIFETIME_H, lifetime_s: st1 ? (Date.parse(st1.payload.next_update) - Date.parse(st1.payload.issued_at)) / 1000 : -1, fresh: statusUsable(st1, allowance, pk, plus(59)), stale: statusUsable(st1, allowance, pk, plus(61)), twoHour: statusUsable(st2, allowance, pk, plus(1)) };

  return {
    id: "V5", slug: "v0.2.4-round3-checks", title: rec.title, rec, world: w, reports: [],
    data: {
      y, fern, harbor, kiranT, lantern, listing, root, rootSlash, lobbyPost, lobbyWire, getEntry, putEntry, deleteRoot, getLobby, badTsResp,
      strangerPoll, unsignedPoll, stalePoll, futurePoll, okPoll, replayPoll, mismatchPoll,
      held, heldMsgs, deliverResp, answers, accepted, meetResp, commitResp, outcome, outcomeConsentV, emptyAfter, declineAns, ruleCases, lateHeld, lateAnswer, lateIgnored, invMsgId: "",
      gatherResp, gInvites, invitedNow, rp, vdGood, vdMissing, vdWrong, vdExtra, noVouch, lobby, d12, doorPointer: root.body as DoorPointer,
    },
  };
}
