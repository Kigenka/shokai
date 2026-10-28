/**
 * V6: the v0.2.5 checks (S3 round 4). Round 4 ran strict and spec-only with zero side agreements; what remained was
 * consistency between SPEC and the traces and a few underdetermined MUSTs. This scenario checks them through the
 * simulated HTTP door only: a `held` after every considering, the Appendix B.4 test decider for a considering routed to a
 * role (so the bank's outcome is reachable), the B.3 trigger and its normal gate, a fetched revocation beating a stapled
 * status, encounters bound to their parties (an outsider is answered, the original party is left alone), and the poll
 * header rules (including an owner polling with a passkey). All names are fictional; everything is local.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative, type Wire } from "../representative.js";
import { Door, type HttpResponse } from "../door.js";
import { ed25519FromLabel, signed, digestOf } from "../crypto.js";
import type { ScenarioResult } from "./common.js";
import { AllowanceKeeper, publishAllowanceStatus, publishAllowanceRevocation, allowanceRevoked, setStatusReachable } from "../owner.js";
import type { AllowanceRevocation, ConsiderationOutcome, Gathering, InvitationResponse, PeerInvitation, PlaceListing, ReplyEnvelope } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "V6: Round-4 fixes (v0.2.5)",
    "The bank's answer now comes back inside a test run; a considering always says 'held'; someone posting into another visitor's meeting is answered, and the meeting is left alone.",
    [["Aya's representative", "The prepared visitor"], ["Harborlight", "A fictional bank with a test decider"], ["Fernwood Goods", "A fictional online store"], ["Test pair place", "A conformance pair place (fictional)"], ["Lantern's host", "A gathering place (fictional)"], ["Mallory's representative", "A fictional outsider"]],
  );
  const w = makeWorld(rec);
  const { fernwoodRep: fern, harborRep: harbor, lanternRep: lantern } = w.hosts;
  const y = w.ayaRep;
  const now = () => w.clock.now();
  const plus = (min: number) => new Date(Date.parse(now()) + min * 60_000).toISOString().replace(".000Z", "Z");

  // ---- test-profile places
  harbor.profile = { ...harbor.profile!, test_profile: { decider: true } };
  const PID = "pair-v6-test";
  const kiranT = new Representative({ name: "Test pair place", repKey: ed25519FromLabel("rep:kiran-test-v6"), principal: { principal_id: w.owners.kiran.id, kind: "person", display_name: "Kiran Vale" }, principalKey: w.owners.kiran.key,
    locales: ["en-US"], ownerLocale: "en-US", profile: {
      policy: w.policy({ policy_version: "pair-test-v6", requires_introduction: true, standard_actions: ["peer.share_project_brief"], consideration: { actions: ["peer.commit_to_project"], route: { kind: "principal", principal_id: w.owners.kiran.id }, days: 7 }, pair_invitation_required: true }),
      phrases: { "en-US": w.en({ greet: "Hello, friend of a friend." }) }, onboarding_url: "", probe_threshold: 4, norms: { locales: ["en-US"], formality: "casual" }, category: "pair", pair: { place_id: PID }, slug: "pair-test",
      test_profile: { owner: { key: w.owners.kiran.key, owner_id: w.owners.kiran.id } } }, ...w.shared });
  w.owners.kiran.name = "Kiran Vale";
  w.issueCard(kiranT, w.owners.kiran, { role: "Personal representative of Kiran Vale (conformance pair place)", purposes: ["collaboration"], actions: ["peer.share_project_brief", "peer.commit_to_project"] });
  kiranT.pairIntroVouch = w.issueVouch(w.owners.aya, kiranT, ["collaboration"], "friend", "vouch-aya-kiran-v6");
  const g0 = signed<Gathering>({ gathering_id: "g-v6-1", place: { principal_id: w.orgs.lantern.id, display_name: "The Lantern Collective" }, title: "Open circle (test profile)", invitees: [],
    house_rules: { default_attribution: "chatham_house", private_never_leaves: true, pressing_after_decline: "flagged", quoting: "paraphrase_by_default", entry_requires_consent: true }, starts_at: plus(60), ends_at: plus(180) }, [w.orgs.lantern.key], now());
  lantern.profile = { ...lantern.profile!, policy: { ...lantern.profile!.policy, requires_introduction: false, standard_actions: [...lantern.profile!.policy.standard_actions, "gathering.request_invitation"] }, gathering: g0, test_profile: { gathering_signer: w.orgs.lantern.key } };

  const BASE = "http://127.0.0.1:8080";
  const door = new Door(BASE, [fern, harbor, kiranT, lantern], now);
  const listing = door.http({ method: "GET", path: `${BASE}/places` }).body as PlaceListing;
  const entryOf = (h: Representative) => listing.places[door.places.indexOf(h)];
  const msgs = (r: HttpResponse) => ((r.body as ReplyEnvelope).messages ?? []) as unknown as Wire[];
  const post = (h: Representative, wire: Wire) => door.http({ method: "POST", path: entryOf(h).entry, contentType: "application/json", body: wire });
  const viaDoor = (v: Representative, h: Representative, first: Wire): Wire[] => {
    const q: Wire[] = [first]; const seen: Wire[] = []; let guard = 0;
    while (q.length && guard++ < 40) { const r = post(h, q.shift()!); for (const o of msgs(r)) { seen.push(o); q.push(...v.receive(o)); } }
    return seen;
  };
  let pollSeq = 0;
  const poll = (v: Representative, h: Representative, extra: Record<string, unknown> = {}) =>
    door.http({ method: "POST", path: entryOf(h).inbox, body: v.sign({ protocol: "shokai/0.3", encounter_id: `poll-${v.did.slice(-6)}`, msg_id: `v6-poll-${++pollSeq}`, sent_at: now(), from: v.did, to: h.did, type: "inbox_poll", ...extra } as never) });

  // ---------------------------------------------------------------- 1. bank: considering + held, then the B.4 test decider
  rec.h2("A considering always says 'held'; the test decider answers the bank's considering at once (B.4)");
  w.issueMandate(y, w.owners.aya, "mand-v6-bank", "x-partnership", "Propose an access pilot", ["bank.product_info", "bank.propose_agent_pilot"]);
  viaDoor(y, harbor, y.greet("v6-bank", harbor));
  viaDoor(y, harbor, y.presentCard("v6-bank"));
  viaDoor(y, harbor, y.introduce("v6-bank", w.mikaVouch));
  const reqWire = y.request("v6-bank", { mandate_id: "mand-v6-bank", actions: ["bank.propose_agent_pilot"], pitch: "A small pilot." });
  const bankSeen = viaDoor(y, harbor, reqWire);
  const bankResp = bankSeen.find((m) => m.payload.type === "invitation_response")?.payload as InvitationResponse | undefined;
  const bankHeld = bankSeen.find((m) => m.payload.type === "held")?.payload as { in_reply_to: string; inbox: string; answer_by?: string } | undefined;
  const reqMsgId = (reqWire.payload as { msg_id: string }).msg_id;
  w.clock.advance(1);
  const bankOutcome = msgs(poll(y, harbor)).find((m) => m.payload.type === "consideration_outcome")?.payload as ConsiderationOutcome | undefined;

  // ---------------------------------------------------------------- 2. B.3: trigger is the grant; the normal gate still applies
  rec.h2("B.3: the invitation follows the grant; the normal gate still applies");
  w.issueMandate(y, w.owners.aya, "m-v6-gather", "invitation", "Ask to be invited", ["gathering.request_invitation"]);
  viaDoor(y, lantern, y.greet("v6-gather-bad", lantern));
  viaDoor(y, lantern, y.presentCard("v6-gather-bad", { malformedProof: true }));
  const badResp = y.getEnc("v6-gather-bad").received.response as InvitationResponse | undefined;
  const invitesAfterBad = msgs(poll(y, lantern)).filter((m) => m.payload.type === "gathering_invitation").length;
  w.clock.advance(1);
  viaDoor(y, lantern, y.greet("v6-gather", lantern));
  viaDoor(y, lantern, y.presentCard("v6-gather"));
  viaDoor(y, lantern, y.introduce("v6-gather", null));
  viaDoor(y, lantern, y.request("v6-gather", { mandate_id: "m-v6-gather", actions: ["gathering.request_invitation"], pitch: "May I join?" }));
  const goodGather = y.getEnc("v6-gather").received.response as InvitationResponse;
  const actsBeforeInvite = y.getEnc("v6-gather").acts.length;
  const invitesAfterGood = msgs(poll(y, lantern)).filter((m) => m.payload.type === "gathering_invitation").length;

  // ---------------------------------------------------------------- 3. encounters are bound to their parties
  rec.h2("An outsider posting into someone else's encounter is answered; the encounter is left alone");
  const malKey = ed25519FromLabel("rep:mallory-v6");
  const mal = new Representative({ name: "Mallory's representative", repKey: malKey, principal: { principal_id: w.owners.mika.id, kind: "person", display_name: "Mika" }, principalKey: w.owners.mika.key, locales: ["en-US"], ownerLocale: "en-US", phrases: w.VIS_EN, ...w.shared });
  w.issueMandate(y, w.owners.aya, "m-v6-browse", "visitation", "Look around", ["store.browse_catalog"]);
  viaDoor(y, fern, y.greet("v6-open", fern));
  viaDoor(y, fern, y.presentCard("v6-open"));
  const heldForYBefore = (door.held.get(y.did) ?? []).length;
  const outsiderOpen = msgs(post(fern, mal.greet("v6-open", fern)));
  // v0.2.6 (host-5-002): a non-ritual encounter-bound message from a non-party is ignored (no reply, nothing held).
  const outsiderReceipt = msgs(post(fern, mal.sign({ protocol: "shokai/0.3", encounter_id: "v6-open", msg_id: "mal-receipt-1", sent_at: now(), from: mal.did, to: fern.did, type: "card_receipt", card_digest: "sha-256:x" } as never)));
  const openStill = fern.getEnc("v6-open").counterpart === y.did;
  // the pair place: a full meeting, closed, then Mallory greets into it
  w.issueMandate(y, w.owners.aya, "m-v6-collab", "collaboration", "Explore a project", ["peer.share_project_brief"]);
  const kv = w.issueVouch(w.owners.kiran, y, ["collaboration"], "friend", "vouch-kiran-aya-v6");
  const inv = signed<PeerInvitation>({ invitation_id: "inv-v6-1", from_owner: { principal_id: w.owners.aya.id, display_name: "Aya Linden" }, to_owner: { principal_id: w.owners.kiran.id, display_name: "Kiran Vale" },
    representatives: [y.did, kiranT.did], purposes: ["collaboration"], place: { place_id: PID, kind: "pair", house_rules: { default_attribution: "private", private_never_leaves: true } }, valid_from: now(), expires_at: plus(60 * 24 * 14), answer_by: plus(60 * 24 * 7) }, [w.owners.aya.key], now());
  post(kiranT, y.deliverPeerInvitation(inv, kiranT.did, `${BASE}/visitors/aya/inbox`));
  for (const a of msgs(poll(y, kiranT)).filter((m) => m.payload.type === "peer_invitation_answer")) y.receive(a);
  w.clock.advance(1);
  viaDoor(y, kiranT, y.greet(PID, kiranT)); viaDoor(y, kiranT, y.presentCard(PID)); viaDoor(y, kiranT, y.introduce(PID, kv));
  viaDoor(y, kiranT, y.request(PID, { mandate_id: "m-v6-collab", actions: ["peer.share_project_brief"], pitch: "Our brief." }));
  const pairGrant = (y.getEnc(PID).received.response as InvitationResponse).decision;
  viaDoor(y, kiranT, y.farewell(PID, "completed"));
  const lastForY = (msgs(poll(y, kiranT)).at(-1)?.payload as { msg_id?: string } | undefined)?.msg_id;
  const outsiderPair = msgs(post(kiranT, mal.greet(PID, kiranT)));
  const yNewAfterOutsider = msgs(poll(y, kiranT, { since: lastForY })).length;
  const heldForYAfter = (door.held.get(y.did) ?? []).filter((m) => (m.payload as { encounter_id?: string }).encounter_id === "v6-open").length;
  const malDid = mal.did;

  // ---------------------------------------------------------------- 4. a fetched revocation beats a stapled "active"
  rec.h2("A fetched revocation beats a stapled status");
  const statusUrl = `${BASE}/status/aya-v6`;
  const { allowance } = AllowanceKeeper.issue({ owner_id: w.owners.aya.id, ownerKey: w.owners.aya.key, representative_id: y.did, card_id: y.card!.payload.card_id, now: now(), days: 90, status: statusUrl,
    summary: "Learn visits only (test).", grants: [{ grant_id: "learn", purposes: ["visitation"], place_categories: ["store"], actions: ["store.browse_catalog"] }] });
  const pk = y.card!.payload.owner_binding?.platform_key;
  const staple = publishAllowanceStatus(allowance, now())!;
  const before = allowanceRevoked(allowance, staple, pk, plus(5));
  setStatusReachable(statusUrl, false);
  const outageWithStaple = allowanceRevoked(allowance, staple, pk, plus(5));
  setStatusReachable(statusUrl, true);
  publishAllowanceRevocation(statusUrl, signed<AllowanceRevocation>({ allowance_id: allowance.payload.allowance_id, owner_id: w.owners.aya.id, revoked_at: plus(10) }, [w.owners.aya.key], plus(10)));
  const afterRevoke = allowanceRevoked(allowance, staple, pk, plus(15));

  // ---------------------------------------------------------------- 5. poll header members; an owner polls with a passkey
  rec.h2("Polls: only the signature, freshness and msg_id are checked; an owner may poll with a passkey");
  const pollOtherTo = poll(y, fern, { to: harbor.did, encounter_id: "anything" });
  const unknownSince = poll(y, kiranT, { since: "no-such-msg" });
  const allForY = msgs(poll(y, kiranT)).length;
  const ownerPollPayload = { protocol: "shokai/0.3" as const, encounter_id: "owner-poll", msg_id: "v6-owner-poll-1", sent_at: now(), from: w.owners.aya.id, to: fern.did, type: "inbox_poll" as const };
  const ownerPoll = door.http({ method: "POST", path: entryOf(fern).inbox, body: signed(ownerPollPayload, [w.owners.aya.key], now()) });

  return {
    id: "V6", slug: "v0.2.5-round4-checks", title: rec.title, rec, world: w, reports: [],
    data: {
      bankResp, bankHeld, reqMsgId, bankOutcome, badResp, invitesAfterBad, goodGather, actsBeforeInvite, invitesAfterGood,
      outsiderOpen, outsiderReceipt, openStill, heldForYBefore, heldForYAfter, pairGrant, outsiderPair, yNewAfterOutsider, malDid, yDid: y.did,
      before, outageWithStaple, afterRevoke, pollOtherTo, unknownSince: msgs(unknownSince).length, allForY, ownerPoll, listing, digestOf,
    },
  };
}
