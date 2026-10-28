/**
 * v0.2.2 (D11, the Peer meetings extension): the meeting is ONE shared encounter seeded by an owner-to-owner invitation (the "meeting key") that both
 * owners consent to with passkeys. The invitation creates a small private place for the two representatives; both introduce
 * themselves; a commitment is approved only by the owner's passkey approve_commitment, asynchronously.
 *
 * Peer-to-peer: Aya's representative meets Kiran Vale's representative (a
 * fictional stand-in; all details invented). Neither
 * is a gatekeeper. They were introduced because their owners are friends, they
 * explore a collaboration, and each reports home with a next step to approve.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative } from "../representative.js";
import { Exchange } from "../wire.js";
import { ed25519FromLabel } from "../crypto.js";
import { type ScenarioResult, readCard, reportQuote, whoIs } from "./common.js";
import type { VisitReport, PeerInvitation, OwnerConsent, Signed } from "../../../../protocol-shapes.js";
import { signed, digestOf } from "../crypto.js";
import { consent, verifyConsent } from "../owner.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "Peer collaboration: two friends' representatives explore a project",
    "Aya's representative meets the representative of a friend (Kiran Vale, a fictional stand-in). Neither side is a gatekeeper. They know how they are related from an earned relationship graph, read each other's strengths from their principal imprints, share what their owners allowed, and leave the decision to collaborate with their owners.",
    [["Aya's representative", "Personal representative of Aya"], ["Kiran's representative", "Personal representative of Kiran Vale (fictional stand-in of Aya; details invented)"], ["Aya, Kiran", "The two owners, friends"]],
  );
  const w = makeWorld(rec);
  const ayaRep = w.ayaRep;
  const PID = "pair-aya-kiran-1";
  const peerPolicy = (who: string) => w.policy({ policy_version: `peer-${who}-2026.10`, requires_introduction: true,
    standard_actions: ["peer.share_project_brief", "peer.propose_owner_call", "peer.share_portfolio_sample"],
    consideration: { actions: ["peer.commit_to_project"], route: { kind: "principal", principal_id: who === "aya" ? w.owners.aya.id : w.owners.kiran.id }, days: 7 }, pair_invitation_required: true });
  const peerPhrases = w.en({ greet: "Hello, friend of a friend. Good to finally meet.", grant: "Gladly. Let's share what we can.", considering: "I can't commit on my owner's behalf, but I'll bring this to them and answer within {days} days." });
  ayaRep.profile = { policy: peerPolicy("aya"), phrases: { "en-US": peerPhrases }, onboarding_url: "", probe_threshold: 4, norms: { locales: ["en-US"], formality: "neutral" }, category: "pair", pair: { place_id: PID } };
  ayaRep.phrases = { "en-US": peerPhrases };
  const kiranRep = new Representative({ name: "Kiran's representative", repKey: ed25519FromLabel("rep:kiran"), principal: { principal_id: w.owners.kiran.id, kind: "person", display_name: "Kiran Vale" },
    principalKey: w.owners.kiran.key, locales: ["en-US", "pt-PT"], ownerLocale: "en-US",
    profile: { policy: peerPolicy("kiran"), phrases: { "en-US": peerPhrases }, onboarding_url: "", probe_threshold: 4, norms: { locales: ["en-US", "pt-PT"], formality: "casual" }, category: "pair", pair: { place_id: PID } }, ...w.shared });
  w.owners.kiran.name = "Kiran Vale";
  const ayaVouchForKiranId = "vouch-aya-kiran";
  w.issueCard(kiranRep, w.owners.kiran, {
    role: "Personal representative of Kiran Vale", purposes: ["collaboration"], actions: ["peer.share_project_brief", "peer.propose_owner_call", "peer.share_portfolio_sample", "peer.commit_to_project"],
    claims: [{ claim_id: "k-id", area: "identity", text: { text: "Represents Kiran Vale, a person", locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "account_control", ref: `passkey:${w.owners.kiran.id}` }] }],
    imprint: {
      expertise: [
        { facet_id: "kx1", text: { text: "Documentary filmmaking (invented example)", locale: "en-US" }, proof_level: "evidenced", evidence_refs: [{ kind: "work", ref: "https://kiran-vale.example/films" }] },
        { facet_id: "kx2", text: { text: "Data visualization for public-interest stories (invented example)", locale: "en-US" }, proof_level: "evidenced", evidence_refs: [{ kind: "url", ref: "https://kiran-vale.example/charts" }] },
      ],
      worldview: [{ facet_id: "kw1", text: { text: "Stories should leave people more capable, not just informed", locale: "en-US" }, proof_level: "vouched", evidence_refs: [{ kind: "vouch", ref: ayaVouchForKiranId }] }],
      working_style: [{ facet_id: "ks1", text: { text: "Fast drafts, slow edits", locale: "en-US" }, proof_level: "self_declared", evidence_refs: [] }],
      taste: [{ facet_id: "kt1", text: { text: "Natural light and plain typography", locale: "en-US" }, proof_level: "self_declared", evidence_refs: [] }],
    },
  });
  const collab = ["peer.share_project_brief", "peer.propose_owner_call", "peer.share_portfolio_sample", "peer.commit_to_project"];
  w.issueMandate(ayaRep, w.owners.aya, "mand-aya-collab", "collaboration", "Explore a collaboration with Kiran; share the project brief; never commit without Aya", collab);
  w.issueMandate(kiranRep, w.owners.kiran, "mand-kiran-collab", "collaboration", "Explore a collaboration with Aya; share a portfolio sample; never commit without Kiran", collab);

  rec.h2("Before the meeting: an introduction between friends");
  const kiranVouchForAya = w.issueVouch(w.owners.kiran, ayaRep, ["collaboration"], "friend", "vouch-kiran-aya");
  const ayaVouchForKiran = w.issueVouch(w.owners.aya, kiranRep, ["collaboration"], "friend", ayaVouchForKiranId);
  const edge = w.friendEdge(w.owners.aya, w.owners.kiran, "2019-05-01T00:00:00Z");
  ayaRep.graph.addAttested(edge); kiranRep.graph.addAttested({ ...edge, from: edge.from, to: edge.to });
  kiranRep.graph.me = w.owners.kiran.id;
  rec.say("Aya and Kiran", "each sign a vouch for the other's representative with their passkeys, and both sign their friendship as an edge in the relationship graph. Nothing is imported from a social network.");
  rec.note(`The friendship edge carries ${edge.attestations!.length} owner signatures. Its history: ${edge.history.map((h) => h.event).join("; ")}.`);

  rec.h2("The meeting key: an owner-to-owner invitation");
  const invitation = signed<PeerInvitation>({ invitation_id: "inv-aya-kiran-1", from_owner: { principal_id: w.owners.aya.id, display_name: "Aya Linden" }, to_owner: { principal_id: w.owners.kiran.id, display_name: "Kiran Vale" },
    representatives: [ayaRep.did, kiranRep.did], purposes: ["collaboration"], agenda: { text: "Explore a short documentary explainer together.", locale: "en-US" },
    place: { place_id: PID, kind: "pair", house_rules: { default_attribution: "private", private_never_leaves: true } }, valid_from: w.clock.now(), expires_at: w.clock.plusDays(14), answer_by: w.clock.plusDays(7) }, [w.owners.aya.key], w.clock.now());
  const acceptance = consent({ consent_id: "oc-kiran-accept-inv-1", owner_id: w.owners.kiran.id, representative_id: kiranRep.did, action: "accept_invitation", decision: "approve",
    subject_ref: { kind: "invitation", id: "inv-aya-kiran-1", digest: invitation.payload_digest }, assurance: "passkey", expires_at: w.clock.plusDays(14),
    shown_to_owner: { text: "Aya invites your representative to a private meeting with Aya's representative about a documentary explainer. Nothing said there leaves it, except to you two. No commitment without your passkey.", locale: "en-US" } }, w.owners.kiran.key, w.clock.now());
  rec.say("Aya", "invites Kiran (owner to owner), signing the invitation with a passkey. It names both representatives and creates a private place for the two of them.");
  // v0.2.3 (§11 with the Gatherings or Peer meetings extension): invitation transport. Aya's representative carries the signed invitation to Kiran's representative, which
  // takes it home (async); Kiran's passkey answer travels back as peer_invitation_answer.
  const x0 = new Exchange(ayaRep, kiranRep);
  x0.send(ayaRep, ayaRep.deliverPeerInvitation(invitation, kiranRep.did, "https://door.example/places/aya-representative/entry"));
  const takenHome = kiranRep.invitationsHome.length;
  rec.say("Kiran", "accepts with a passkey, over the exact invitation (accept_invitation), later, when it suits Kiran.");
  x0.send(kiranRep, kiranRep.answerPeerInvitation(invitation, acceptance));
  const bothHold = !!ayaRep.peerInvitation && !!kiranRep.peerInvitation && ayaRep.peerInvitation.acceptance.payload_digest === acceptance.payload_digest;
  kiranRep.pairIntroVouch = ayaVouchForKiran; // v0.2.3 (the Peer meetings extension): the host side introduces itself too
  // Without both owners' consent there is no meeting: a declined invitation opens nothing.
  const declined = consent({ ...acceptance.payload, consent_id: "oc-kiran-decline", decision: "decline" }, w.owners.kiran.key, w.clock.now());
  const pairNoConsent = verifyConsent(declined, { owner_id: w.owners.kiran.id, representative_id: kiranRep.did, now: w.clock.now(), subject_digest: invitation.payload_digest, action: "accept_invitation" });

  rec.h2("The meeting (no gatekeeper: two peers in one shared encounter)");
  const x = new Exchange(ayaRep, kiranRep);
  x.send(ayaRep, ayaRep.greet(PID, kiranRep));
  x.send(ayaRep, ayaRep.presentCard(PID));
  x.send(ayaRep, ayaRep.introduce(PID, kiranVouchForAya));
  const hostIntroduced = !!kiranRep.getEnc(PID).myIntroSent && ayaRep.getEnc(PID).vouchStatus === "valid";
  whoIs(ayaRep, w.owners.kiran.id, rec, "Kiran");
  whoIs(kiranRep, w.owners.aya.id, rec, "Aya");
  readCard(ayaRep, PID, rec);
  readCard(kiranRep, PID, rec);
  rec.note("Note the difference: at this meeting, Aya's \"representatives, not representations\" value is backed by Mika's vouch, but Mika isn't in the room, so Kiran's side counts it only as self-declared. Evidence is weighed per meeting, not assumed.");

  rec.h2("Exploring the project");
  x.send(ayaRep, ayaRep.request(PID, { mandate_id: "mand-aya-collab", actions: ["peer.share_project_brief", "peer.propose_owner_call"], pitch: "A short documentary explainer about agents as representatives: your eye for film, our protocol story.", register: "established" }));
  x.send(ayaRep, ayaRep.act(PID, "peer.share_project_brief", { brief: "6-minute explainer, 3 scenes: the lobby, the meishi, the farewell (example)" }));
  x.send(kiranRep, kiranRep.request(PID, { mandate_id: "mand-kiran-collab", actions: ["peer.share_portfolio_sample", "peer.propose_owner_call"], pitch: "Here's a sample of how I'd film it.", register: "established" }));
  x.send(kiranRep, kiranRep.act(PID, "peer.share_portfolio_sample", { sample: "90-second rough cut, natural light (example)" }));
  x.send(kiranRep, kiranRep.request(PID, { mandate_id: "mand-kiran-collab", actions: ["peer.commit_to_project"], pitch: "Kiran would love to do this. Shall we lock it in?", register: "established" }));
  rec.note("Aya's representative does not commit on Aya's behalf. Committing is outside its standing seat, so it takes the question home: considering, routed to Aya.");
  // v0.2.4 (§4, host-3-018): after a considering, the farewell outcome is taken_inside.
  x.send(ayaRep, ayaRep.farewell(PID, "taken_inside"));

  rec.h2("No meeting key, no meeting");
  const xi = new Exchange(ayaRep, kiranRep);
  xi.send(ayaRep, ayaRep.greet("pair-uninvited", kiranRep)); xi.send(ayaRep, ayaRep.presentCard("pair-uninvited")); xi.send(ayaRep, ayaRep.introduce("pair-uninvited", kiranVouchForAya));
  xi.send(ayaRep, ayaRep.request("pair-uninvited", { mandate_id: "mand-aya-collab", actions: ["peer.share_project_brief"], pitch: "Shall we talk again?", register: "established" }));
  const uninvited = ayaRep.getEnc("pair-uninvited").received.response;
  rec.note("A second meeting outside the invited place isn't admitted: Kiran's representative answers not now, bring an owner consent (an invitation both owners accept).");

  rec.h2("Later: Aya decides the commitment (asynchronously)");
  const consRef = (() => { const c = kiranRep.getEnc(PID).received.decisions.find((d) => d.decision === "considering"); return c && c.decision === "considering" ? c.consideration_ref : ""; })();
  // The commitment is bound to the exact considering response it answers (digest of that response).
  const consResp = ayaRep.decisions.find((d) => d.response.decision === "considering")!.response;
  const subject = { kind: "consideration" as const, id: consRef, digest: digestOf(consResp) };
  const ctx = { owner_id: w.owners.aya.id, representative_id: ayaRep.did, now: w.clock.now(), platform_key: ayaRep.card!.payload.owner_binding?.platform_key, subject_digest: subject.digest, action: "approve_commitment" as const };
  const chatYes = consent({ consent_id: "oc-chat-yes", owner_id: w.owners.aya.id, representative_id: ayaRep.did, action: "approve_commitment", decision: "approve", subject_ref: subject, assurance: "chat_reply",
    evidence: { channel: "owner-chat", message_id: "msg-yes" }, shown_to_owner: { text: "Commit to Kiran's project?", locale: "en-US" } }, w.platformKey, w.clock.now());
  const nextStepYes = consent({ consent_id: "oc-next-yes", owner_id: w.owners.aya.id, representative_id: ayaRep.did, action: "approve_next_step", decision: "approve", subject_ref: { kind: "next_step", id: consRef }, assurance: "chat_reply",
    evidence: { channel: "owner-chat", message_id: "msg-ok" }, step_effects: { commits: true, shares_new: false, spends: false }, shown_to_owner: { text: "Go ahead with Kiran?", locale: "en-US" } }, w.platformKey, w.clock.now());
  const passkeyYes = consent({ consent_id: "oc-commit-1", owner_id: w.owners.aya.id, representative_id: ayaRep.did, action: "approve_commitment", decision: "approve", subject_ref: subject, assurance: "passkey", expires_at: w.clock.plusDays(7),
    shown_to_owner: { text: "Commit to Kiran's documentary project: a 6-minute explainer, no money involved, until Nov 30. You can revoke this.", locale: "en-US" } }, w.owners.aya.key, w.clock.now());
  const vChat = verifyConsent(chatYes, ctx), vNext = verifyConsent(nextStepYes, { ...ctx, action: undefined, subject_digest: undefined }), vPass = verifyConsent(passkeyYes, ctx);
  rec.verify(!vChat.ok, `A quick chat "yes" can't approve a commitment (${vChat.reason}).`);
  rec.verify(!vNext.ok, `approve_next_step can't carry a commitment either (${vNext.reason}).`);
  rec.verify(vPass.ok && vPass.approve, "Aya approves with a passkey (approve_commitment), over the exact consideration, with an expiry and the summary Aya saw.");
  // v0.2.3 (§6.8): the outcome CARRIES the owner's passkey consent, so Kiran's side can check it was really Aya's yes.
  const outcome = vPass.ok && vPass.approve ? ayaRep.considerationOutcome(consRef, { kind: "principal", principal_id: w.owners.aya.id }, ["peer.commit_to_project"], undefined, 30, [passkeyYes]) : undefined;
  if (outcome) x.send(ayaRep, outcome);


  rec.h2("Each side reports home");
  const kiranStrengths = ayaRep.strengths(ayaRep.getEnc(PID));
  const cons = kiranRep.getEnc(PID).received.decisions.find((d) => d.decision === "considering");
  const r1 = ayaRep.visitReport(PID, { text: "Approve a 30-minute call with Kiran next week, then decide yes or no on the collaboration." },
    [`Hi Aya, I met Kiran's representative. Kiran is your friend (since 2019; you both signed that), and Kiran also vouched for me.`,
     `What they're strong at, from Kiran's imprint: ${kiranStrengths.map((s) => `${s.text} (${s.proof_level})`).join("; ")}.`,
     `I shared our project brief (within what you approved). They shared a 90-second rough-cut sample.`,
     `They asked to commit to the project. I didn't: that's your decision. It's waiting for you (${cons && cons.decision === "considering" ? cons.consideration_ref : "pending"}, answer within 7 days).`,
     `My suggestion: a 30-minute call with Kiran next week, then decide.`].join("\n"));
  const ayaStrengths = kiranRep.strengths(kiranRep.getEnc(PID));
  const r2 = kiranRep.visitReport(PID, { text: "Approve the call with Aya and review the shared brief before deciding." },
    [`Hi Kiran, I met Aya's representative. Aya is your friend (since 2019, signed by both of you).`,
     `What they're strong at: ${ayaStrengths.map((s) => `${s.text} (${s.proof_level})`).join("; ")}.`,
     `They shared a project brief: a 6-minute explainer in 3 scenes. I shared your rough-cut sample.`,
     `I asked whether you'd commit. Their representative is taking that to Aya, as it should.`,
     `Suggested next step: approve a call with Aya and read the brief first.`].join("\n"));
  reportQuote(rec, "Aya's representative", r1);
  reportQuote(rec, "Kiran's representative", r2);
  const reports: VisitReport[] = [r1, r2];
  return { id: "P1", slug: "peer-collaboration", title: rec.title, rec, world: w, reports, data: { uninvited, ayaRep, kiranRep, edge, PID, invitation, acceptance, pairNoConsent, vChat, vNext, vPass, outcome, takenHome, bothHold, hostIntroduced, consRespDigest: subject.digest, passkeyYes } };
}
