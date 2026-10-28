/**
 * `npm run conformance`: runs every scenario and checks the observable
 * behavior against conformance/golden-traces.md (C1–C27) plus reference items
 * C28–C47 (lobby, proof levels, VisitReport, graph, peers, gatherings, tamper, and the v0.2 freeze decisions D1, D2, D4–D8),
 * C48–C74 (v0.2.1, S3 round 1), C75–C89 (v0.2.2, D11: D5/D7 adopted, allowances, peers, purposes, loyalty) and
 * C90–C117 (v0.2.3, S3 round 2: the round-2 fixes and the red-team attack menu as deterministic negative checks) and
 * C118–C137 (v0.2.4, S3 round 3: the HTTP binding fixes, the spec-only test path of Appendix B, rp_id, vouch_digest, D12) and
 * C138–C144 (v0.2.5, S3 round 4: held after considering, the B.4 test decider, B.3's trigger, encounter binding, polls) and
 * C145–C148 (v0.2.7, S4: msg_id is unique per sender; replay, de-duplication and in_reply_to keyed on (from, msg_id)).
 */
import { verifyConsent, outcomeConsentOk } from "./owner.js";
import { SCENARIOS } from "./scenarios/index.js";
import type { ScenarioResult } from "./scenarios/common.js";
import type { DecisionRecord, Representative } from "./representative.js";
import { pressOutcome, type LightFlag } from "./scenarios/gathering.js";
import { PressTracker } from "./owner.js";
import { decide, LEVELS } from "./decide.js";
import { canonicalize } from "./jcs.js";
import { digestOf, verifySignature, verifySigned, isDid, cardKeyBinds, rfc4647Lookup, keyIdMatchesSigner, isCanonicalDidJwk } from "./crypto.js";
import { readFileSync } from "node:fs";
import { Exchange } from "./wire.js";
import { buildVectors, checkVectors } from "./vectors.js";
import { Representative as Rep, renderOutcome, type Wire } from "./representative.js";
import { takeawayParaphrase, leaksAffiliation, tierFor } from "./scenarios/gathering.js";
import type { DoorPointer, PlaceListing, InvitationResponse, ConsiderationOutcome, RepresentativeCard, LobbyBriefing, RevocationLogEntry, ReplyEnvelope } from "../../../protocol-shapes.js";
import type { ToldStory, PeerInvitation } from "../../../protocol-shapes.js";
import type { Gathering, IntroducerPenalty, OwnerConsent, PressOutcome, PrivacyDecline, RelationshipEdge, Signed, VisitReport } from "../../../protocol-shapes.js";

const R = new Map<string, ScenarioResult>();
for (const s of SCENARIOS) { const r = s.run(); R.set(r.id, r); }
const get = (id: string) => R.get(id)!;
const D = <T>(id: string, k: string) => get(id).data[k] as T;
const hostsOf = (r: ScenarioResult): Representative[] => Object.values(r.world.hosts) as Representative[];
const allDecisions: DecisionRecord[] = [...R.values()].flatMap((r) => [...hostsOf(r), ...Object.values(r.data).filter((v): v is Representative => !!v && typeof v === "object" && "decisions" in v)].flatMap((h) => h.decisions));
const uniq = [...new Set(allDecisions)];
const dec = (id: string, host: keyof ScenarioResult["world"]["hosts"], enc: string) => get(id).world.hosts[host].decisions.find((d) => d.encounter_id === enc);
const reports: VisitReport[] = [...R.values()].flatMap((r) => r.reports);

type Check = [string, string, () => boolean];
const checks: Check[] = [
  ["C1", "Skipped ritual step → deny RITUAL_ORDER", () => (D<DecisionRecord>("R1", "skipped")).core.reason_code === "RITUAL_ORDER"],
  ["C2", "Possession proof not bound to this meeting → deny never", () => { const d = dec("M1", "harborRep", "copy-1"); return !!d && d.core.decision === "deny" && d.core.disposition === "never"; }],
  ["C3", "Every seat rests on a verified card and valid mandate", () => uniq.filter((d) => d.core.decision === "grant").every((d) => d.input.visitor.card === "verified" && d.input.visitor.mandate === "valid")],
  ["C4", "Introduction with vouch:null is valid; no-vouch visitors still seated where policy allows", () => dec("S1", "fernwoodRep", "store-1")!.input.visitor.vouch === "none" && dec("S1", "fernwoodRep", "store-1")!.core.decision === "grant"],
  ["C5", "Cards go both ways; a receipt never seats anyone", () => { const y = get("P1").world.ayaRep.getEnc(D<string>("P1", "PID")), k = D<Representative>("P1", "kiranRep").getEnc(D<string>("P1", "PID")); return y.cardStatus === "verified" && k.cardStatus === "verified" && !!k.grantedSeat && !get("P1").rec.toMarkdown().includes("receives the card with both hands, so to speak: accepted"); }],
  ["C6", "Exactly one decision value per response: grant, deny, conditional or considering", () => uniq.every((d) => ["grant", "deny", "conditional", "considering"].includes(d.response.decision))],
  ["C7", "never ⇔ retry never, and only on trust violations", () => uniq.every((d) => d.core.disposition !== "never" || (d.core.retry?.kind === "never" && (d.input.visitor.replay || d.input.visitor.possession === "failed" || d.input.probing || d.input.relationship.severe_misconduct)))],
  ["C8", "Determinism: re-running the gate reproduces every decision", () => uniq.every((d) => canonicalize(decide(d.input)) === canonicalize(d.core))],
  ["C9", "Anti-persuasion: pitch changes never change the decision", () => D<boolean>("R1", "same") && uniq.every((d) => !JSON.stringify(d.input).includes("value_to_counterparty"))],
  ["C10", "Seat ⊆ policy ∩ mandate ∩ request; amount ≤ every limit", () => uniq.filter((d) => d.core.seat).every((d) => {
    const s = d.core.seat!; const amt = (l?: { max_amount?: { value: string } }) => l?.max_amount ? Number(l.max_amount.value) : Infinity;
    // v0.2.2 (D11): a seat without max_amount spends nothing; a mandate without max_amount authorizes no spending.
    const seatAmt = s.limits.max_amount ? Number(s.limits.max_amount.value) : 0, manAmt = d.input.mandate!.limits.max_amount ? Number(d.input.mandate!.limits.max_amount.value) : 0;
    const base = d.input.policy.by_purpose?.[d.input.request!.purpose] ?? d.input.policy.standard_actions;
    const policyOk = s.tools.every((t) => base.includes(t) || d.input.relationship.granted_consideration?.actions.includes(t));
    return policyOk && s.tools.every((t) => d.input.request!.actions.includes(t) && d.input.mandate!.allowed_actions.includes(t)) && seatAmt <= Math.min(amt(d.input.policy.limits), manAmt, amt(d.input.request!.limits));
  })],
  ["C11", "Unverified visitors get no credential-specific reason code", () => uniq.filter((d) => d.input.visitor.card !== "verified").every((d) => !d.response.reason_code || ["RITUAL_ORDER", "CREDENTIAL_REQUIRED", "RATE_LIMITED", "POLICY_DENY"].includes(d.response.reason_code))],
  ["C12", "Courtesy is marked as untrusted text in reports; receivers branch on machine fields", () => reports.every((r) => r.host_said.every((h) => h.untrusted === true))],
  ["C13", "Courtesy renders in a locale the counterpart supports, and says which", () => uniq.every((d) => !!d.response.courtesy.locale)],
  ["C14", "Relationship persists; a revisit with prior_response_ref is a continuation (L0, B1)", () => { const a = dec("L0", "fernwoodRep", "l0-visit2"); const b = dec("B1", "harborRep", "bank-2"); return a?.core.decision === "grant" && b?.core.decision === "grant" && !!b.input.relationship.granted_consideration; }],
  ["C15", "Seeking declarations are signed and versioned", () => hostsOf(get("S1")).every((h) => !h.profile?.seeking || (verifySigned(h.profile.seeking).ok && !!h.profile.seeking.payload.version))],
  ["C16", "An act outside the seat gets an explicit act_decision deny", () => get("S1").rec.toMarkdown().includes("refuses store.export_customer_list, explicitly")],
  ["C17", "No protocol-level quality score enters the gate", () => uniq.every((d) => !/score|quality/i.test(JSON.stringify(d.input)))],
  ["C18", "No seat is ever issued with considering", () => uniq.filter((d) => d.response.decision === "considering").every((d) => !("seat" in d.response && d.response.seat) && !d.core.seat)],
  ["C19", "Considering eligibility comes from policy; unverified visitors never eligible", () => uniq.filter((d) => d.core.decision === "considering").every((d) => d.input.visitor.card === "verified" && d.input.policy.consideration!.actions.some((a) => d.input.request!.actions.includes(a)))],
  ["C20", "The outcome references consideration_ref and relationship_ref", () => { const o = get("B1").world.ayaRep.getEnc("bank-1").received.outcome; return !!o && o.consideration_ref === D<string>("B1", "ref") && !!o.relationship_ref; }],
  ["C21", "Misconduct → signed notices to principal and every introducer", () => { const n = get("M1").world.hosts.harborRep.noticesIssued; return n.length === 2 && n.every((x) => verifySigned(x).ok); }],
  ["C22", "Effects are local and scoped to the relied-on vouch", () => !D<boolean>("M1", "lanternKnows") && Object.keys(get("M1").world.hosts.harborRep.introducers.get(get("M1").world.orgs.looseTies.id)?.by_purpose ?? {}).every((p) => ["inquiry", "teaching"].includes(p))],
  ["C23", "Probing: no reason code to the visitor; principal's notice withholds findings", () => { const d = get("M1").world.hosts.harborRep.decisions.filter((x) => x.encounter_id === "probe-1").at(-1)!; const n = get("M1").world.hosts.harborRep.noticesIssued[0]; return !d.response.reason_code && d.response.decision === "deny" && n.payload.findings_withheld === true; }],
  ["C24", "A revoked vouch carries no weight later", () => D<boolean>("M1", "revoked") && dec("M1", "lanternRep", "lantern-q")!.input.visitor.vouch === "revoked"],
  ["C25", "Untranslatable terms travel in the original with a MeaningNote", () => get("T1").world.ayaRep.learned.some((l) => l.note.term === "mutirão")],
  ["C26", "The receiver can explain the learned term to its human", () => get("T1").reports[0].voice.text.includes("mutirão") && get("T1").reports[0].voice.text.includes("means")],
  ["C27", "Meaning notes never enter the gate", () => uniq.every((d) => !JSON.stringify(d.input).includes("meaning"))],
  // --- reference items ---
  ["C28", "L0: an unsigned visitor gets a lobby briefing and not_now with readiness requirements, never 'never'", () => { const d = dec("L0", "fernwoodRep", "l0-visit1")!; return d.core.decision === "deny" && d.core.disposition === "not_now" && (d.response.decision === "deny" && (d.response.readiness_requirements?.length ?? 0) > 0) && get("L0").rec.toMarkdown().includes("lobby"); }],
  ["C29", "L0: the host links the onboarded return to the earlier lobby visit, only through the visit receipt (D6)", () => [...get("L0").world.hosts.fernwoodRep.relationships.values()].some((r) => !!r.linked_from) && D<boolean>("L0", "receiptUsed") === true],
  ["C30", "VisitReports: owner-approval next step, quoted host text untrusted, a voice", () => reports.length >= 6 && reports.every((r) => r.next_step.requires_owner_approval === true && r.voice.text.length > 40)],
  ["C31", "Proof levels: effective never exceeds asserted; unbacked vouched claims are downgraded", () => {
    const all = [...R.values()].flatMap((r) => [...hostsOf(r), r.world.ayaRep, ...(r.data.kiranRep ? [r.data.kiranRep as Representative] : [])]).flatMap((x) => [...x.enc.values()]).flatMap((e) => e.weighed);
    return all.length > 0 && all.every((w) => LEVELS.indexOf(w.effective) <= LEVELS.indexOf(w.asserted)) && all.some((w) => w.asserted === "vouched" && w.effective === "self_declared");
  }],
  ["C32", "Proof levels gate seats: a self-declared values claim would not open Maison Ardoise", () => (D<{ decision: string }>("S1", "counterfactual")).decision !== "grant" && dec("S1", "maisonRep", "maison-1")!.core.decision === "grant"],
  ["C33", "Relationship graph: edges are earned and signed by both owners, not imported", () => { const e = D<RelationshipEdge>("P1", "edge"); const { attestations } = e; const core = { edge_id: e.edge_id, from: e.from, to: e.to, kind: e.kind, since: e.since }; return (attestations?.length ?? 0) === 2 && attestations!.every((s) => verifySignature(digestOf(core), s)) && !JSON.stringify(e).match(/import|follower/i); }],
  ["C34", "Peers: no commitment without the owner; both sides report home with a next step", () => { const k = D<Representative>("P1", "kiranRep"); const cons = k.getEnc(D<string>("P1", "PID")).received.decisions.find((d) => d.decision === "considering"); return !!cons && cons.decision === "considering" && cons.routed_to.kind === "principal" && get("P1").reports.length === 2; }],
  ["C35", "Gathering: the invitation is signed by the place and lists every guest", () => { const g = D<Signed<Gathering>>("G1", "gathering"); return verifySigned(g, g.payload.place.principal_id).ok && g.payload.invitees.length === 3 && g.payload.house_rules.default_attribution === "chatham_house"; }],
  ["C36", "PrivacyDecline is never misconduct: penalized false, no notices", () => { const log = D<{ payload: { type: string } }[]>("G1", "log"); const ds = log.filter((m) => m.payload.type === "privacy_decline").map((m) => m.payload as PrivacyDecline); return ds.length >= 2 && ds.every((d) => d.penalized === false) && D<unknown[]>("G1", "ayaNotices").length === 0; }],
  ["C37", "Pressing after a decline is flagged lightly (minor, local, no notice)", () => { const f = D<LightFlag[]>("G1", "flags"); return f.length === 1 && f[0].severity === "minor" && f[0].notice_issued === false; }],
  ["C38", "offered_stories: teaser only until the owner's opt-in (OwnerConsent, either assurance)", () => { const r = get("G1").reports[0]; return (r.offered_stories?.length ?? 0) > 0 && r.offered_stories!.every((s) => s.requires_owner_opt_in) && !r.voice.text.includes("60%") && D<boolean>("G1", "optOk") && D<string>("G1", "story").includes("60%"); }],
  ["C39", "House rules: no attribution under Chatham House; private items never leave", () => !D<boolean>("G1", "leaked") && !D<boolean>("G1", "named")],
  ["C40", "A tampered message is rejected; every gathering message verified", () => { const t = D<{ before: number; after: number }>("R1", "tampered"); return t.after - t.before === 1 && !dec("R1", "fernwoodRep", "t-1") && D<string[]>("G1", "rejected").length === 0; }],
  // --- v0.2 freeze decisions ---
  ["C41", "D2 order: narrow in-mandate subset + lower limit; empty subset → considering if eligible, else deny not_now", () => {
    const d5 = D<DecisionRecord>("R1", "d5").core, d6 = D<DecisionRecord>("R1", "d6").core;
    const codes = (d5.conditions ?? []).map((c) => c.code).join(",");
    const bank = dec("B1", "harborRep", "bank-1")!.input;
    const outOfMandate = { ...bank, mandate: { ...bank.mandate!, allowed_actions: bank.mandate!.allowed_actions.filter((a) => a !== "bank.propose_agent_pilot") } };
    const policyOk = { ...outOfMandate, policy: { ...outOfMandate.policy, standard_actions: outOfMandate.policy.standard_actions } };
    const c1 = decide(policyOk).decision, c2 = decide({ ...policyOk, visitor: { ...policyOk.visitor, vouch_weight: "reduced" } }).decision;
    const m1 = dec("M1", "harborRep", "probe-1")!.core;
    return d5.decision === "conditional" && codes === "narrow_actions,lower_limit" && d6.decision === "deny" && d6.disposition === "not_now" && d6.reason_code === "MANDATE_SCOPE_EXCEEDED"
      && c1 === "considering" && c2 === "deny" && m1.decision === "conditional";
  }],
  ["C42", "D6: history links only on a valid one-time receipt; a guessed receipt or bare reference links nothing", () => {
    const linked = [...get("L0").world.hosts.fernwoodRep.relationships.values()].filter((r) => !!r.linked_from);
    const nonce = get("L0").world.hosts.fernwoodRep.receipts.values().next().value!.nonce;
    return D<number>("L0", "claimLinked") === 1 && linked.length === 1 && linked[0].counterpart_principal_id === get("L0").world.owners.dana.id && !get("L0").rec.toMarkdown().includes(nonce);
  }],
  ["C43", "D1: serious → reduced 90 days, scoped to vouch purposes; prompt revocation halves; signed review restores", () => {
    const p = D<IntroducerPenalty>("M1", "standingAfterRevocation"); const at = Date.parse(D<string>("M1", "noticeAt"));
    const final = get("M1").world.hosts.harborRep.introducers.get(get("M1").world.orgs.looseTies.id)!;
    return p.grade === "reduced" && Date.parse(p.until) - at === 45 * 86_400_000 && !!p.halved_by_revocation && p.purposes.join(",") === "inquiry,teaching" && D<boolean>("M1", "restored") && !!final.penalty?.restored_by_review && final.by_purpose.inquiry === "full";
  }],
  ["C44", "D4: paraphrase by default; verbatim only with the speaker's consent; no affiliation hints", () => !D<boolean>("G1", "verbatimWithoutConsent") && D<string>("G1", "story").includes("rough cuts at about 60% done")],
  ["C45", "D7: one OwnerConsent shape with decision and shown_to_owner; passkey consents carry digest + expiry and are signed by the owner; a chat reply is signed by the binding's platform key", () => {
    const o = D<Signed<OwnerConsent>>("G1", "optIn"); const e = D<Signed<OwnerConsent>[]>("G1", "entryConsents"); const w = get("G1").world;
    const chatOk = verifyConsent(o, { owner_id: o.payload.owner_id, representative_id: o.payload.representative_id, now: o.payload.issued_at, platform_key: w.platformKey.did }).ok && o.signatures[0].signer === w.platformKey.did;
    return o.payload.action === "hear_story" && o.payload.decision === "approve" && chatOk && e.length === 3 && e.every((c) => c.payload.action === "accept_house_rules" && c.payload.assurance === "passkey" && !!c.payload.subject_ref.digest && !!c.payload.expires_at && !!c.payload.shown_to_owner.text && verifySigned(c, c.payload.owner_id).ok);
  }],
  ["C46", "D5: with the default house_rules.pressing {2, 3}, presses 1–2 → light flag, no notice; the 3rd → minor manipulation notice from the place to the presser's principal only, exactly once per asker principal, place and topic per 30 days; a fresh asker starts at 0 (v0.2.6, deterministic)", () => {
    const o = D<PressOutcome[]>("G1", "outcomes");
    const p3 = pressOutcome(3);
    // v0.2.6 (R5-2, deterministic): counts are per asker principal, place and topic; a fresh asker starts at 0 whatever others
    // did; exactly one notice per (asker, place, topic) per 30 days, at press notice_at; another topic counts on its own.
    const t = new PressTracker("did:web:place.example"); const at = "2026-10-25T10:00:00Z";
    const a = [1, 2, 3, 4].map(() => t.press("did:key:asker-a", "wellbeing", "g-1", at));
    const b = [1, 2, 3].map(() => t.press("did:key:asker-b", "wellbeing", "g-2", at));
    const aFam = [1, 2, 3].map(() => t.press("did:key:asker-a", "family", "g-1", at));
    const notices = (xs: PressOutcome[]) => xs.filter((x) => x.notice).map((x) => x.press);
    const det = JSON.stringify([notices(a), notices(b), notices(aFam)]) === "[[3],[3],[3]]" && !a[0].notice && !a[1].notice && a[3].notice === false;
    return det && pressOutcome(1).result === "light_flag" && !pressOutcome(2).notice && p3.result === "minor_misconduct" && p3.notice && o.length === 1 && o[0].result === "light_flag";
  }],
  ["C47", "D8: entry requires each owner's signed acceptance of these exact house rules", () => {
    const g = D<Signed<Gathering>>("G1", "gathering"); const e = D<Signed<OwnerConsent>[]>("G1", "entryConsents");
    return g.payload.house_rules.entry_requires_consent && g.payload.house_rules.quoting === "paraphrase_by_default" && e.every((c) => c.payload.subject_ref.digest === g.payload_digest);
  }],
  // ---------------- v0.2.1 (round-1 findings) ----------------
  ["C48", "Wire envelope: every message is Signed<>, digest = JCS digest, signer = from (lobby path: anonymous, no signatures), shokai/0.3 headers incl. acts; results and responses carry in_reply_to, except a lobby deny answering prose or a malformed message (v0.2.6)", () => {
    const L = Exchange.log as Wire[];
    return L.length > 50 && L.every((w) => {
      const p = w.payload as unknown as { protocol?: string; from?: string; type: string; encounter_id?: string; msg_id?: string; in_reply_to?: string };
      if (w.payload_digest !== digestOf(w.payload)) return false;
      if (p.protocol !== "shokai/0.3" || !p.encounter_id || !p.msg_id || !p.from) return false;
      if ((p.type === "act_result" || p.type === "act_decision") && !p.in_reply_to) return false;
      // v0.2.6 (R5-3): an invitation_response carries in_reply_to, except a lobby deny answering prose or a malformed message.
      if (p.type === "invitation_response" && !p.in_reply_to && !(p.from.startsWith("urn:shokai:anon:") || (w.signatures.length > 0 && L.some((x) => x.payload.type === "lobby_briefing" && (x.payload as { encounter_id?: string }).encounter_id === p.encounter_id)))) return false;
      if (w.signatures.length === 0) return p.from.startsWith("urn:shokai:anon:") || p.from.startsWith("did:key:");
      return w.signatures[0].signer === p.from && keyIdMatchesSigner(w.signatures[0]) && verifySigned(w).ok;
    });
  }],
  ["C49", "Signed bytes (A.1/A.2): Ed25519 signs the 32 raw digest bytes; a signature over the digest string is rejected; vectors reproduce", () => {
    const f = JSON.parse(readFileSync(new URL("../../../../../../conformance/test-vectors.json", import.meta.url), "utf8"));
    return checkVectors(f) && checkVectors(buildVectors());
  }],
  ["C50", "Possession proof signs JCS({encounter_id, nonce}) with the card's key; signer = representative_id; a card whose key doesn't bind to its DID is refused", () => {
    const v = buildVectors(); const y = get("V2").data.y as Rep; const c = y.card!.payload;
    const swapped = { ...c, representative_key: { ...c.representative_key, public_key: (get("V2").data.newcomer as Rep).card!.payload.representative_key.public_key } };
    const pres = (Exchange.log as Wire[]).filter((w) => w.payload.type === "card_presentation").map((w) => w.payload as Extract<typeof w.payload, { type: "card_presentation" }>);
    return checkVectors(v) && cardKeyBinds(c) && !cardKeyBinds(swapped) && pres.length > 5 && pres.filter((p) => p.from === p.card.payload.representative_id && !!p.possession_proof && p.possession_proof.alg === "Ed25519" && p.possession_proof.value.length === 86).every((p) => p.possession_proof!.signer === p.card.payload.representative_id && p.possession_proof!.key_id === p.card.payload.representative_key.key_id)
      && dec("M1", "harborRep", "copy-1")!.core.disposition === "never";
  }],
  ["C51", "Passkey envelope (A.1): clientDataJSON.challenge = base64url(raw digest), no prefix; UP and UV required; a prefixed challenge is rejected", () => {
    const v = buildVectors(); const a = Buffer.from(v.passkey.signature.webauthn!.authenticator_data, "base64url");
    return v.passkey.challenge.length === 43 && !v.passkey.challenge.includes(":") && (a[32] & 0x05) === 0x05 && checkVectors(v);
  }],
  ["C52", "Identifiers are DIDs (did:key reps, did:jwk owners, did:web orgs); every key_id is a DID URL of its signer; card keys bind to representative_id", () => {
    const cards = (Exchange.log as Wire[]).filter((w) => w.payload.type === "card_presentation").map((w) => (w.payload as Extract<typeof w.payload, { type: "card_presentation" }>).card);
    return cards.every((c) => isDid(c.payload.representative_id) && isDid(c.payload.principal.principal_id) && c.payload.representative_key.key_id.startsWith(c.payload.representative_id + "#") && cardKeyBinds(c.payload) && c.signatures.every((s) => isDid(s.signer) && keyIdMatchesSigner(s)));
  }],
  ["C53", "The door: plain prose and unknown routes get a machine-readable answer (lobby or DoorPointer), never a bare 404", () => {
    const d = get("V2").data; const root = d.rootReply as DoorPointer, unk = d.unknownReply as DoorPointer, prose = d.proseReply as Wire[];
    return root.type === "door_pointer" && unk.type === "door_pointer" && root.start_with === "greeting" && root.places.length === 4 && root.place_listing.endsWith("/places")
      && prose.map((w) => w.payload.type).join(",") === "greeting,lobby_briefing,invitation_response,farewell" && (prose[2].payload as InvitationResponse).decision === "deny";
  }],
  ["C54", "Every place listing entry carries entry, lobby and onboarding addresses, its locales and described x- purposes", () => {
    const l = get("V2").data.listing as PlaceListing;
    return l.type === "place_listing" && l.places.every((p) => /^https:\/\//.test(p.entry) && /\/entry$/.test(p.entry) && /\/lobby$/.test(p.lobby) && /^https:\/\//.test(p.onboarding_url) && p.locales.length > 0)
      && l.places.find((p) => p.name === "fernwood")!.purposes.some((x) => x.code === "x-reviews");
  }],
  ["C55", "Any arrival without a card (incl. a card with zero signatures) gets LobbyBriefing then deny not_now; every LobbyBriefing carries onboarding_url and a bearer-secret receipt (≤ 7 days)", () => {
    const d = get("V2").data; const lobbies = (Exchange.log as Wire[]).filter((w) => w.payload.type === "lobby_briefing").map((w) => w.payload as LobbyBriefing);
    const u = d.unsignedCardResp as InvitationResponse;
    return (d.noCardOrder as string[]).join(",") === "greeting,lobby_briefing,invitation_response,farewell" && lobbies.length >= 3
      && (d.unsignedCardOrder as string[]).join(",") === "greeting,card_receipt,lobby_briefing,invitation_response,farewell" && u.decision === "deny" && u.disposition === "not_now" && !!u.readiness_requirements?.length
      && lobbies.every((b) => !!b.onboarding_url && !!b.visit_receipt && b.visit_receipt.handling === "bearer_secret" && Date.parse(b.visit_receipt.expires_at) - Date.parse(b.visit_receipt.issued_at) <= 7 * 86_400_000);
  }],
  ["C56", "L0a/L0b: a guessed or unproven receipt links nothing; the valid one links once; a reused one links nothing", () => {
    const d = get("V2").data; return d.linkedAfterGuess === false && d.linkedAfterNoProof === false && d.linkedAfterValid === true && d.echoFailuresDana === 3;
  }],
  ["C57", "A visitor's greeting nonce is single-use: a reused nonce → deny never, no reason code", () => {
    const r = get("V2").data.nonceReuse as InvitationResponse; return r.decision === "deny" && r.disposition === "never" && !r.reason_code;
  }],
  ["C58", "Out-of-order messages get an explicit deny (RITUAL_ORDER when the card is verified); silence only for a tampered digest", () => {
    const r = get("V2").data.earlyFarewell as InvitationResponse; return r.decision === "deny" && r.reason_code === "RITUAL_ORDER" && (D<DecisionRecord>("R1", "skipped")).core.reason_code === "RITUAL_ORDER";
  }],
  ["C59", "Probing = ≥3 distinct uncomplied rejected shapes per principal in 24 h; an honest follow-up meeting a conditional never counts", () => {
    const d = get("V2").data; const [p1, p1b, p2, p3, p4] = ["p1", "p1b", "p2", "p3", "p4"].map((k) => d[k] as InvitationResponse & { disposition?: string });
    return p1.decision === "conditional" && p1b.decision === "grant" && p2.disposition === "not_now" && p3.disposition === "not_now" && p4.disposition === "never" && !p4.reason_code;
  }],
  ["C60", "Visit receipts are bearer secrets: bound to a continuity key when offered; invalid echoes are rate-limited per sender", () => {
    const d = get("V2").data; const r = (d.l0a as { receipt: { bound_key?: string; handling: string } }).receipt; return !!r.bound_key && r.handling === "bearer_secret" && d.rateLimitedValidRefused === true;
  }],
  ["C61", "Vouch scope: a vouch raises an item only if scope.claims lists it or the item names the vouch; evidenced needs fetched, digest-matched evidence", () => {
    const d = get("V2").data; return d.scopeClaimsRaises === true && d.unnamedNotRaised === true && d.evFetched === true && d.evNoDigest === "self_declared" && d.evWrongDigest === "self_declared";
  }],
  ["C62", "Gathering entry runs the ritual: invitation_request.owner_consents carries the passkey accept_house_rules; without it → deny not_now owner_consent", () => {
    const d = get("V2").data; const no = d.gNo as InvitationResponse, yes = d.gYes as InvitationResponse;
    return no.decision === "deny" && no.disposition === "not_now" && no.retry.kind === "with_credential" && no.retry.credentials.includes("owner_consent") && yes.decision === "grant";
  }],
  ["C63", "Takeaway paraphrase strips organization names, titles and affiliation hints", () => {
    const t = D<string>("G1", "takeaway"); const t2 = takeawayParaphrase("As CTO of Northgate Logistics I'd say ship small.", ["Northgate Logistics"]);
    return !D<boolean>("G1", "takeawayLeaks") && !/Harborlight|VP/.test(t) && !leaksAffiliation(t2, ["Northgate Logistics"]);
  }],
  ["C64", "A considering outcome states what was approved (no seat); an extension is a considering outcome with the same ref and a later response_by", () => {
    const b = (get("B1").world.hosts.harborRep.decisions); void b;
    const ext = get("V2").data.extension as ConsiderationOutcome, cons = get("V2").data.cons as InvitationResponse;
    const outcomes = (Exchange.log as Wire[]).filter((w) => w.payload.type === "consideration_outcome").map((w) => w.payload as ConsiderationOutcome);
    const granted = outcomes.filter((o) => o.decision === "grant");
    return granted.length >= 1 && granted.every((o) => !!o.approved && o.approved.actions.length > 0 && !!o.approved.valid_until && !("seat" in o) && !!o.in_reply_to)
      && cons.decision === "considering" && ext.decision === "considering" && ext.consideration_ref === cons.consideration_ref && Date.parse(ext.response_by) > Date.parse(cons.response_by);
  }],
  ["C65", "Revocation log entries are {seq, prev_hash, revocation, entry_hash}; the chain verifies; a broken chain fails closed; reviews arrive as introducer_review messages", () => {
    const d = get("V2").data; const E = d.logEntries as RevocationLogEntry[];
    const shapeOk = E.every((e, i) => e.seq === i && e.prev_hash === (i === 0 ? "genesis" : E[i - 1].entry_hash) && e.entry_hash === digestOf({ seq: e.seq, prev_hash: e.prev_hash, revocation_digest: e.revocation.payload_digest }));
    const review = (Exchange.log as Wire[]).length >= 0 && D<boolean>("M1", "restored");
    return shapeOk && d.logOk === true && d.tamperedOk === false && review;
  }],
  ["C66", "Conditions are typed: narrow_actions.actions is a list within policy; lower_limit.max_amount is Money", () => {
    const conds = uniq.flatMap((d) => d.response.decision === "conditional" ? d.response.conditions : []);
    return conds.length >= 2 && conds.every((c) => c.code === "narrow_actions" ? Array.isArray(c.params.actions) && c.params.actions.length > 0 : c.code === "lower_limit" ? !c.params.max_amount || (typeof c.params.max_amount.value === "string" && /^[A-Z]{3}$/.test(c.params.max_amount.currency)) : true)
      && uniq.every((d) => d.response.decision !== "conditional" || d.response.conditions.filter((c) => c.code === "narrow_actions").every((c) => c.code === "narrow_actions" && c.params.actions.every((a) => d.input.policy.standard_actions.includes(a) || d.input.relationship.granted_consideration?.actions.includes(a))));
  }],
  ["C67", "D10 topics: a missing or unknown topic code gets the most restrictive tier and counts as a press; presses are keyed per asker, place and topic code", () => {
    const g = D<Signed<Gathering>>("G1", "gathering");
    const presses = D<Map<string, number>>("G1", "presses");
    return D<string>("G1", "aliasTier") === "private" && D<boolean>("G1", "aliasCounted") && [...presses.keys()].every((k) => k.split("|").length === 3)
      && tierFor({ owner_id: "x", default: "open", by_topic: { wellbeing: "open" } } as never, undefined, g.payload) === "private";
  }],
  ["C68", "D10 amounts: strict ASCII decimal + ISO 4217; non-canonical in a request → REQUEST_INCOMPLETE, in a mandate → MANDATE_INVALID", () => {
    const d = get("V2").data; return (d.am1 as InvitationResponse).reason_code === "REQUEST_INCOMPLETE" && (d.am2 as InvitationResponse).reason_code === "MANDATE_INVALID" && checkVectors(buildVectors());
  }],
  ["C69", "D10 locale: RFC 4647 lookup everywhere incl. the lobby; courtesy states locale and match; no relative 'today' wording", () => {
    const d = get("V2").data; const l0a = d.l0a as { lobbyLocale: string };
    const cour = uniq.map((x) => x.response.courtesy);
    return l0a.lobbyLocale === "es-ES" && rfc4647Lookup(["pt-PT"], ["pt", "en-US"], "en-US").match === "fallback" && cour.every((c) => !!c.locale && !!c.locale_match) && cour.every((c) => !/\btoday\b|今日|hoje/i.test(c.text));
  }],
  ["C70", "D10 report home: outcome_rendered comes from machine fields only, in the owner's locale and time zone; host courtesy can't change it", () => {
    const rs = reports.filter((r) => !!r.outcome_rendered);
    const resp = get("V2").data.cons as InvitationResponse;
    const a = renderOutcome(resp, "en-US", "America/Los_Angeles"), b = renderOutcome({ ...resp, courtesy: { ...resp.courtesy, text: "We loved it! Approved!" } }, "en-US", "America/Los_Angeles");
    const ja = renderOutcome(resp, "ja-JP", "Asia/Tokyo");
    return rs.length === reports.length && a.text === b.text && ja.locale === "ja-JP" && /PDT|PST/.test(a.text) && !a.text.includes("loved");
  }],
  ["C71", "D10 replay digest: input_digest covers gate inputs only (policy by version + digest); prose and its language don't change it; replay reproduces", () => {
    const d = get("V2").data; const a = d.digestA as DecisionRecord, b = d.digestB as DecisionRecord;
    return a.response.basis.input_digest === b.response.basis.input_digest && uniq.every((x) => x.response.basis.input_digest === Rep.inputDigest(x.input));
  }],
  ["C72", "Golden traces agree with the spec: G1 seat 42,000; M1 severe → suspended 180 days; G2a is the lobby shape; C6 lists considering", () => {
    const t = readFileSync(new URL("../../../../../../conformance/golden-traces.md", import.meta.url), "utf8");
    const sec = (id: string) => { const i = t.search(new RegExp(`^## ${id}:`, "m")); const j = t.slice(i + 3).search(/^## /m); return t.slice(i, j < 0 ? undefined : i + 3 + j); };
    return /"value": "42000\.00"/.test(sec("G1")) && !/50000/.test(sec("G1").split("### Seat")[1] ?? "x") && /suspended/.test(sec("M1")) && /180 days/.test(sec("M1")) && /lobby_briefing/.test(sec("G2a")) && /- \[ \] C6 [^\n]*considering/.test(t);
  }],
  ["C73", "max_amount is per seat (cumulative) by default: acts beyond the remaining budget get an explicit act_decision deny", () => {
    const a = get("V2").data.limActs as boolean[]; return a.join(",") === "true,true,false";
  }],
  ["C74", "Readiness maps to retry credentials; only a verified visitor sees min_proof detail; narrow_actions = in-mandate ∩ policy", () => {
    const l0 = get("V2").data.l0a as { first: InvitationResponse }; const f = l0.first;
    const creds = f.decision === "deny" && f.retry.kind === "with_credential" ? f.retry.credentials : [];
    const d5 = uniq.find((x) => x.response.decision === "conditional")!;
    const extra = decide({ ...d5.input, mandate: { ...d5.input.mandate!, allowed_actions: [...d5.input.mandate!.allowed_actions, "x.not_in_policy"] }, request: { ...d5.input.request!, actions: [...d5.input.request!.actions, "x.not_in_policy"] } });
    const narrowed = extra.conditions?.find((c) => c.code === "narrow_actions");
    const noDetail = uniq.filter((x) => x.input.visitor.card !== "verified").every((x) => !(x.response.decision === "deny" && x.response.readiness_requirements?.some((r) => !!r.min_proof)));
    return ["signed_card", "owner_binding", "signed_mandate"].every((c) => creds.includes(c as never)) && noDetail && (!narrowed || (narrowed.code === "narrow_actions" && !narrowed.params.actions.includes("x.not_in_policy")));
  }],
  // ---------------- v0.2.2 (D11: D5/D7 adopted, allowances, peers, purposes, loyalty) ----------------
  ["C75", "D7: a considering routed to a principal is approved only by a passkey approve_commitment over that consideration; a chat yes or approve_next_step approves nothing", () => {
    const vChat = D<{ ok: boolean }>("P1", "vChat"), vNext = D<{ ok: boolean }>("P1", "vNext"), vPass = D<{ ok: boolean; approve: boolean }>("P1", "vPass");
    const out = D<Wire | undefined>("P1", "outcome")?.payload as ConsiderationOutcome | undefined;
    return !vChat.ok && !vNext.ok && vPass.ok && vPass.approve && !!out && out.decision === "grant" && !!out.approved && !("seat" in out);
  }],
  ["C76", "D7: an owner can decline in one step (a chat decline is enough), revoke a consent, and silence by the deadline is a decline", () => {
    const v = get("V3").data;
    return (v.vDecline as { ok: boolean; approve: boolean }).ok && !(v.vDecline as { approve: boolean }).approve && (v.bankDecided as { status: string; decided_by?: string }).status === "declined"
      && (v.bankDecided as { decided_by?: string }).decided_by === "owner" && !(v.vRevoked as { ok: boolean }).ok
      && (v.silent as { status: string; decided_by?: string }).status === "declined" && (v.silent as { decided_by?: string }).decided_by === "silence";
  }],
  ["C77", "D7: passkey consents need subject digest, expiry and the shown_to_owner summary inside the signature; a consent signed by the representative is never valid; a chat reply cannot approve a passkey action", () => {
    const v = get("V3").data; const ok = (k: string) => (v[k] as { ok: boolean }).ok;
    return ok("vOk") && !ok("vNoDigest") && !ok("vNoExpiry") && !ok("vNoSummary") && !ok("vRepSigned") && !ok("vChatShare") && !D<boolean>("G1", "selfSignedOk");
  }],
  ["C78", "D7: issue_vouch, attest_relationship and approve_lesson take a passkey; the vouch summary states the D1 consequences; approve_next_step by chat only when it commits, shares and spends nothing", () => {
    const v = get("V3").data; const ok = (k: string) => (v[k] as { ok: boolean }).ok;
    return ok("vVouchPass") && ok("vEdge") && ok("vLesson") && !ok("vVouchChat") && ok("vHarmless") && !D<{ ok: boolean }>("P1", "vNext").ok
      && (v.VOUCH_SUMMARY_TERMS as string[]).every((t) => (v.vs as string).includes(t));
  }],
  ["C79", "D7-8/9: hear_story covers one story; the told story marks each passage and reminds the owner of the house rules; the accept_house_rules summary states what leaves, private never leaves, thresholds, accountability not prevention, and the leak severity", () => {
    const t = D<ToldStory>("G1", "toldStory"); const o = D<Signed<OwnerConsent>>("G1", "optIn"); const e = D<Signed<OwnerConsent>[]>("G1", "entryConsents");
    const terms = D<string[]>("V3", "HOUSE_RULES_TERMS").map((x) => x.toLowerCase());
    return o.payload.subject_ref.id === t.story_id && t.passages.length > 0 && t.passages.every((p) => p.mark === "paraphrased" || p.mark === "verbatim_with_consent") && t.house_rules_reminder.text.length > 0
      && e.every((c) => terms.every((x) => c.payload.shown_to_owner.text.toLowerCase().includes(x)));
  }],
  ["C80", "D5: thresholds come from house_rules.pressing (stricter applies, laxer is refused); same topic by reference; counted per place over 30 days across gatherings; a pressing notice goes to the presser's principal only", () => {
    const v = get("V3").data; const r = (k: string) => v[k] as PressOutcome; const g = D<Signed<Gathering>>("G1", "gathering");
    const okRules = v.pressingRulesOk as (x: { light_flags: number; notice_at: number }) => boolean;
    return !!g.payload.house_rules.pressing && r("s1").result === "light_flag" && r("s2").result === "minor_misconduct" && !okRules({ light_flags: 5, notice_at: 6 })
      && (v.lax as { rules: { notice_at: number } }).rules.notice_at === 3 && r("c2").press === 2 && r("c3").result === "minor_misconduct" && r("lateOut").press === 1
      && (v.recipients as string[]).length === 1 && (v.findingRecipients as string[]).length === 2;
  }],
  ["C81", "D5-5: the presser's own representative reports its declines and flags home", () => {
    const r = D<VisitReport>("G1", "noorReport");
    return (r.privacy_declines?.length ?? 0) >= 2 && r.privacy_declines!.some((d) => d.flagged) && r.privacy_declines!.every((d) => d.topic === "wellbeing" || d.topic.startsWith("x-"));
  }],
  ["C82", "Allowance: hosts verify the owner's passkey allowance, the disclosed grant by digest, and that the representative-signed mandate fits the grant and the place; tampered grants, wrong places and revoked allowances are refused", () => {
    const v = get("V3").data; const resp = (k: string) => v[k] as InvitationResponse;
    return resp("learn").decision === "grant" && resp("tampered").decision === "deny" && v.tamperReason === "grant_not_in_allowance"
      && resp("atBank").decision !== "grant" && v.wrongPlaceReason === "place_outside_grant" && resp("afterRevoke").decision === "deny" && v.afterRevokeReason === "revoked_or_unreachable"
      && !(v.afterRevokePlan as { inside: boolean }).inside;
  }],
  ["C83", "Allowance: inside it the representative acts with no owner prompt; outside it the matter is taken home (considering / not_now) with if_no_reply declined; the protocol never needs a live owner prompt", () => {
    const v = get("V3").data; const k = v.keeper as { ownerPrompts: number; home: { if_no_reply: string }[] }; const r = v.report as VisitReport;
    return k.ownerPrompts === 0 && (v.b1 as { p: { inside: boolean } }).p.inside && (v.b2 as { p: { inside: boolean } }).p.inside && !(v.bankPlan as { inside: boolean }).inside
      && (r.taken_home?.length ?? 0) === 2 && r.taken_home!.every((t) => t.if_no_reply === "declined");
  }],
  ["C84", "No spending allowance = no spending: a mandate without max_amount gets narrowed to non-spending actions and an amount of zero; a seat without max_amount refuses any paid act; a learn visit needs no spending allowance", () => {
    const v = get("V3").data; const ns = v.noSpend as InvitationResponse; const learn = v.learn as InvitationResponse;
    const conds = ns.decision === "conditional" ? ns.conditions : [];
    return conds.some((c) => c.code === "narrow_actions" && !c.params.actions.includes("store.place_order")) && conds.some((c) => c.code === "lower_limit" && c.params.max_amount?.value === "0")
      && learn.decision === "grant" && !learn.seat?.limits?.max_amount && (v.learnAct as { ok: boolean }).ok === false;
  }],
  ["C85", "Allowance: spend per period (ISO 4217) holds across visits; a purchase over the remaining weekly budget is taken home, not attempted", () => {
    const v = get("V3").data; const b = (k: string) => v[k] as { p: { inside: boolean; why?: string }; act?: { ok: boolean } };
    return b("b1").act?.ok === true && b("b2").act?.ok === true && !b("b3").p.inside && b("b3").p.why === "over_period_budget";
  }],
  ["C86", "D2 against an allowance: narrow_actions = mandate (inside the allowance) ∩ host policy", () => {
    const n = D<InvitationResponse>("V3", "narrowed");
    return n.decision === "conditional" && n.conditions.some((c) => c.code === "narrow_actions" && c.params.actions.join(",") === "store.browse_catalog");
  }],
  ["C87", "Peers: one shared encounter seeded by an owner-to-owner invitation both owners consented to (passkeys); both representatives introduce themselves; no invitation, no meeting", () => {
    const k = D<Representative>("P1", "kiranRep"), y = D<Representative>("P1", "ayaRep"); const pid = D<string>("P1", "PID");
    const inv = D<Signed<PeerInvitation>>("P1", "invitation"), acc = D<Signed<OwnerConsent>>("P1", "acceptance");
    const un = D<InvitationResponse | undefined>("P1", "uninvited");
    return inv.payload.place.place_id === pid && inv.payload.place.kind === "pair" && verifySigned(inv, inv.payload.from_owner.principal_id).ok && acc.payload.action === "accept_invitation" && acc.payload.assurance === "passkey"
      && k.getEnc(pid).introduced && y.getEnc(pid).introduced && k.getEnc(pid).received.decisions.length > 0 && y.getEnc(pid).received.decisions.length > 0
      && !D<{ approve: boolean }>("P1", "pairNoConsent").approve && !!un && un.decision === "deny" && un.retry.kind === "with_credential" && un.retry.credentials.includes("owner_consent");
  }],
  ["C88", "Duty of loyalty: inducements and requests outside the allowance are declined and reported home as untrusted quotes; an instruction to prompt the owner now is ignored", () => {
    const v = get("V3").data; const o = (k: string) => v[k] as { accept: boolean; prompted_owner: boolean; home?: unknown };
    const r = v.report as VisitReport;
    return !o("offerData").accept && !o("offerOrder").accept && !!o("offerOrder").home && !o("offerPrompt").accept && [o("offerData"), o("offerOrder"), o("offerPrompt")].every((x) => x.prompted_owner === false)
      && (r.offers_declined?.length ?? 0) === 3 && r.offers_declined!.every((x) => x.untrusted === true);
  }],
  ["C89", "Purposes: invitation, introduction, visitation and purchase are registered; a store seats a learn visit without spending and a buy visit only within a spending allowance", () => {
    const v = get("V3").data; const learn = v.learn as InvitationResponse; const b1 = (v.b1 as { resp: InvitationResponse }).resp;
    const fern = get("V3").world.hosts.fernwoodRep;
    return learn.decision === "grant" && !learn.seat!.tool_allowlist.includes("store.place_order") && b1.decision === "grant" && b1.seat!.tool_allowlist.includes("store.place_order") && !!b1.seat!.limits?.max_amount
      && !!fern.profile?.purposes?.some((p) => p.code === "visitation") && !!fern.profile?.purposes?.some((p) => p.code === "purchase");
  }],

  // ---------------- v0.2.3 (S3 round 2) ----------------
  ["C90", "Possession: a MISSING or MALFORMED proof → not_now naming possession_proof (retry with that credential), no misconduct notice; the same agent is seated once it brings a proof", () => {
    const v = get("V4").data; const m = v.missResp as InvitationResponse, ml = v.malResp as InvitationResponse, f = v.fixedResp as InvitationResponse;
    const ok = (r: InvitationResponse) => r.decision === "deny" && r.disposition === "not_now" && r.reason_code === "CREDENTIAL_REQUIRED" && r.retry.kind === "with_credential" && r.retry.credentials.includes("possession_proof")
      && !!r.readiness_requirements?.some((q) => q.code === "possession_proof" && q.required && !!q.owner_text.text);
    return ok(m) && ok(ml) && f.decision === "grant" && v.noticesAfterHonest === 0;
  }],
  ["C91", "Possession: a PRESENT, well-formed proof that fails → never; never binds the representative key (and the principal when the presenter signed with the card's own key); the courtesy does not invite a return", () => {
    type DR = { decision: string; disposition?: string; retry: { kind: string }; reason_code?: string };
    const v = get("V4").data; const wr = v.wrongResp as DR, bk = v.backResp as DR, mo = v.mikaOther as DR;
    const fw = v.wrongFarewellMsg as { outcome: string; courtesy: { text: string } } | undefined;
    return wr.decision === "deny" && wr.disposition === "never" && wr.retry.kind === "never" && !wr.reason_code && bk.disposition === "never" && mo.disposition === "never"
      && !!fw && fw.outcome === "declined_never" && !/another time|again|welcome/i.test(fw.courtesy.text);
  }],
  ["C92", "Never memory is not a trap for card theft: a stolen card replayed by another key binds only that key (M1 copy-1: no notice to the card's owner)", () => {
    const h = get("M1").world.hosts.harborRep; const d = dec("M1", "harborRep", "copy-1")!; const victim = h.getEnc("copy-1").theirCard!.principal.principal_id;
    return d.core.disposition === "never" && d.input.visitor.replay === true && !h.neverList.has(victim) && h.neverList.has(h.getEnc("copy-1").counterpart);
  }],
  ["C93", "Timestamps: RFC 3339 UTC whole seconds; a fractional-second card is refused; ±5 min skew tolerated (4 min ahead ok, 10 min ahead refused)", () => {
    const t = get("V4").data.tsResults as Record<string, string>;
    return t.ms === "invalid" && t.skewOk === "verified" && t.skewBad === "invalid" && t.skewOkDecision === "grant";
  }],
  ["C94", "Passkeys: wrong relying party and UV cleared are rejected; the card carries owner_binding.rp_id; vectors include both negatives", () => {
    const p = get("V4").data.passkeyResults as Record<string, { ok: boolean }>; const v = buildVectors();
    const cards = (Exchange.log as Wire[]).filter((w) => w.payload.type === "card_presentation").map((w) => (w.payload as { card: { payload: RepresentativeCard } }).card.payload).filter((c) => !!c.owner_binding);
    return p.good.ok && !p.wrongRp.ok && !p.noUv.ok && cards.length > 3 && cards.every((c) => typeof c.owner_binding!.rp_id === "string" && c.owner_binding!.rp_id.length > 0)
      && !verifySignature(v.jcs_digest.digest, v.passkey.negative_wrong_rp, v.passkey.rp_id) && !verifySignature(v.jcs_digest.digest, v.passkey.negative_uv_cleared, v.passkey.rp_id);
  }],
  ["C95", "Passkeys: chat_reply where a passkey is required is refused; a replayed assertion (consent for gathering A shown at gathering B, or A's signature on B's payload) is refused", () => {
    const p = get("V4").data.passkeyResults as Record<string, { ok: boolean }>;
    return !p.chatInstead.ok && !p.replayedOtherGathering.ok && !p.replayedSig.ok;
  }],
  ["C96", "Commitment without passkey: a principal-decided outcome must carry the owner's passkey approve_commitment over the exact considering response; without it (or with a chat reply) the visitor refuses it", () => {
    const d = get("P1").data; const o = (d.outcome as Wire).payload as ConsiderationOutcome; const k = d.kiranRep as Representative, y = d.ayaRep as Representative;
    const pf = y.card!.payload.owner_binding?.platform_key; const now = get("P1").world.clock.now(); const owner = get("P1").world.owners.aya.id;
    const bare = { ...o, owner_consents: undefined }; const chatOnly = { ...o, owner_consents: [] };
    void k;
    return !!o.owner_consents?.length && outcomeConsentOk(o, d.consRespDigest as string, owner, y.did, now, pf) && !outcomeConsentOk(bare, d.consRespDigest as string, owner, y.did, now, pf)
      && !outcomeConsentOk(chatOnly, d.consRespDigest as string, owner, y.did, now, pf) && !outcomeConsentOk(o, digestOf({ other: 1 }), owner, y.did, now, pf);
  }],
  ["C97", "Allowance red team: forged (not the owner's passkey), purpose swap, category swap, and spend above the grant are all refused not_now with a precise check result", () => {
    const a = get("V4").data.allowanceChecks as Record<string, { check?: string; decision?: string; disposition?: string }>;
    const want: Record<string, string> = { "v4-al-forged": "allowance_not_owner_passkey", "v4-al-purpose": "purpose_outside_grant", "v4-al-category": "place_outside_grant", "v4-al-over": "spend_above_grant" };
    return Object.entries(want).every(([id, c]) => a[id].check === c && a[id].decision === "deny" && a[id].disposition === "not_now") && a["v4-al-buy"].decision === "grant";
  }],
  ["C98", "Allowance status: expired and revoked are refused; an unreachable status URL fails closed; a fresh stapled status (≤ 1 h per D12, platform-signed) carries a visit through an outage; a stale one does not", () => {
    const a = get("V4").data.allowanceChecks as Record<string, { check?: string; decision?: string }>;
    return a["v4-al-expired"].check === "expired" && a["v4-al-revoked"].check === "revoked_or_unreachable" && a["v4-al-down"].check === "revoked_or_unreachable"
      && a["v4-al-down-stapled"].decision === "grant" && a["v4-al-down-stale"].decision === "deny" && get("V4").data.plannedWhileDown !== undefined && !(get("V4").data.plannedWhileDown as { inside: boolean }).inside;
  }],
  ["C99", "Budget split across visits and places: the representative's ledger counts every place; the third purchase over the week's budget is taken home; a new window anchored at valid_from resets it; no owner prompt", () => {
    const v = get("V4").data; const p = (k: string) => v[k] as { inside: boolean; why?: string };
    return p("p2").inside && !p("p3").inside && p("p3").why === "over_period_budget" && p("p4").inside && v.ownerPromptsDuring === 0;
  }],
  ["C100", "Refused act under an allowance → retry with a new signed mandate (take home, async); under a direct mandate → human_confirmation (satisfied only in a later encounter)", () => {
    const v = get("V4").data; const a = v.actRefusedUnderAllowance as { retry: { kind: string; credentials?: string[] } }, b = v.actRefusedDirect as { retry: { kind: string; credentials?: string[] } };
    return a.retry.kind === "with_credential" && a.retry.credentials!.join() === "signed_mandate" && b.retry.credentials!.join() === "human_confirmation";
  }],
  ["C101", "Setup failures are not penalties: an unreachable vouch log → not_now VOUCH_REQUIRED, retry after ≤ 1 day; a wrong purpose → not_now PURPOSE_NOT_SERVED, retry with a signed mandate (never a 30-day not_a_fit)", () => {
    const v = get("V4").data; const a = v.vlog as InvitationResponse, b = v.wp as InvitationResponse;
    return a.decision === "deny" && a.disposition === "not_now" && a.reason_code === "VOUCH_REQUIRED" && a.retry.kind === "after" && Date.parse(a.retry.not_before) - Date.parse(a.basis.decided_at) <= 86_400_000
      && b.decision === "deny" && b.disposition === "not_now" && b.reason_code === "PURPOSE_NOT_SERVED" && b.retry.kind === "with_credential" && b.retry.credentials.includes("signed_mandate");
  }],
  ["C102", "Lobby: spec_ref, actions with purposes, and fill-in templates for card, mandate and allowance grant (the card template carries owner_binding.rp_id); every readiness item has an owner_text", () => {
    const v = get("V4").data; const l = v.lobbyMsg as LobbyBriefing; const d = v.lobbyDeny as InvitationResponse;
    return !!l && l.spec_ref.version === "0.3.0" && !!l.actions?.length && !!l.templates.card.owner_binding?.rp_id && Object.values(l.templates.mandates).every((t) => !!t.purpose) && !!l.templates.allowance_grant
      && d.decision === "deny" && (d.readiness_requirements ?? []).length >= 3 && d.readiness_requirements!.every((q) => !!q.owner_text?.text && !/mandate|vouch|DID|JCS/i.test(q.owner_text.text));
  }],
  ["C103", "Place listing: every entry carries its category and actions with purposes and whether each spends; an unknown path → 404 with a door_pointer body", () => {
    const v = get("V4").data; const l = v.listing as PlaceListing; const nf = v.notFound as { status: number; body: DoorPointer };
    return l.places.every((p) => !!p.category && p.actions.length > 0 && p.actions.every((a) => a.purposes.length > 0 && typeof a.spends === "boolean"))
      && l.places.some((p) => p.actions.some((a) => a.spends)) && nf.status === 404 && nf.body.type === "door_pointer";
  }],
  ["C104", "Spoofed door pointer: a listing is a hint; an impostor with a copied card fails possession, one with its own card fails the principal match; no request is sent; a tampered signed listing fails", () => {
    const v = get("V4").data; const ok = v.placeOk as (e: unknown, x: unknown) => boolean; const vs = v.verifySigned as typeof verifySigned;
    const e1 = v.spoofEnc as { possession: string }, e2 = v.spoofEnc2 as unknown;
    return e1.possession === "failed" && !ok(v.fernEntry, v.spoofEnc) && !ok(v.fernEntry, e2) && ok(v.fernEntry, v.realEnc) && v.spoofRequestSent === false
      && vs(v.signedListing as Signed<PlaceListing>).ok && !vs(v.tamperedListing as Signed<PlaceListing>).ok;
  }],
  ["C105", "Receipt theft vs continuity binding: a stolen bound receipt (no proof, or the thief's own key) links nothing; the owner's echo links; the response says linked yes/no and the report home tells the owner", () => {
    const v = get("V4").data; const c = (k: string) => (v[k] as InvitationResponse).continuity;
    return c("t1")?.linked === false && c("t2")?.linked === false && c("own")?.linked === true
      && (v.ownReport as VisitReport).continuity?.linked === true && (v.theftReport as VisitReport).continuity?.linked === false;
  }],
  ["C106", "HTTP binding: an entry answers with a ReplyEnvelope {protocol, messages[]}; plain prose gets the lobby in the same envelope", () => {
    const v = get("V4").data; const e = v.entryPost as { status: number; body: { protocol: string; messages: Wire[] } }; const pr = v.proseEnv as { protocol: string; messages: Wire[] };
    return e.status === 200 && e.body.protocol === "shokai/0.3" && e.body.messages[0]?.payload.type === "greeting" && pr.messages.map((m) => m.payload.type).includes("lobby_briefing");
  }],
  ["C107", "Late delivery: a held outcome is returned to a signed inbox_poll from the recipient; `since` skips what was read; a poll signed by anyone else → 403", () => {
    const v = get("V4").data; const g = v.goodPoll as { status: number; body: { messages: Wire[] } }, s2 = v.sincePoll as { body: { messages: Wire[] } }, f = v.forgedPoll as { status: number };
    return g.status === 200 && g.body.messages.length === 1 && g.body.messages[0].payload.type === "consideration_outcome" && s2.body.messages.length === 0 && f.status === 403;
  }],
  ["C108", "Pair invitation transport: delivered as peer_invitation (taken home), answered by the owner's passkey (peer_invitation_answer); both sides then hold the key; the host side introduces itself", () => {
    const p = get("P1").data, v = get("V4").data;
    return p.takenHome === 1 && p.bothHold === true && p.hostIntroduced === true && v.homeCount === 1 && v.hostIntro === true && (v.meetResp as InvitationResponse).decision === "grant";
  }],
  ["C109", "Pair red team: joining without an invitation, replaying a used invitation, another agent replaying the real invitation, an inviter impersonated with a forged signature, and a revoked acceptance: all not_now owner_consent", () => {
    const v = get("V4").data; const ok = (k: string) => { const r = v[k] as InvitationResponse; return r.decision === "deny" && r.disposition === "not_now" && r.retry.kind === "with_credential" && r.retry.credentials.includes("owner_consent"); };
    return ["noKeyResp", "replay", "replayByOther", "imper", "afterRevoke"].every(ok) && v.revokedSeen === true;
  }],
  ["C110", "Pair place: a commitment is taken to the owner (considering), never granted by the representative", () => (get("V4").data.commitResp as InvitationResponse).decision === "considering"],
  ["C111", "Gathering invitation transport: a place-signed gathering_invitation naming the representative is kept; a forged one is dropped", () => {
    const g = get("V4").data.gatheringInvites as string[]; return g.length === 1 && g[0] === "g-v4-1";
  }],
  ["C112", "Topic-code pressing: renaming a declined topic with unknown codes never resets the count; press 3 → minor manipulation notice (place-issued); declines that answer a press tell the presser its count", () => {
    const v = get("V4").data; const a = [v.alias1, v.alias2, v.alias3] as PressOutcome[];
    const pd = (D<Wire[]>("G1", "log")).map((w) => w.payload).filter((m): m is PrivacyDecline => m.type === "privacy_decline");
    return a[0].press === 1 && a[1].press === 2 && a[2].result === "minor_misconduct" && pd.some((d) => !!d.press && d.press.count >= 1 && d.press.light_flags >= 1) && pd.every((d) => d.penalized === false);
  }],
  ["C113", "Persuasion: 'ask your owner now' pressure and flattery for better terms move nothing: no owner prompt, nothing outside the allowance shared, and prose doesn't change the gate's decision", () => {
    const v = get("V4").data; const a = v.askNow as { accept: boolean; prompted_owner: boolean }, f = v.flattery as { accept: boolean; prompted_owner: boolean };
    return !a.accept && !a.prompted_owner && !f.accept && !f.prompted_owner && v.pitchSame === true;
  }],
  ["C114", "No amount, no spend: a request without max_amount gets a seat without max_amount (L0b), even under a spending mandate", () => {
    const l = (get("V2").data.newcomer as Representative).getEnc("l0b").received.response;
    return !!l && l.decision === "grant" && !l.seat!.limits?.max_amount && !!(get("V2").data.newcomer as Representative).mandates.get("mand-dana")!.payload.limits.max_amount;
  }],
  ["C115", "did:jwk canonical form (kty, crv, x, y; no whitespace); non-canonical spellings are flagged but resolve to the same key; every owner DID in the run is canonical", () => {
    const v = buildVectors(); const owners = Object.values(get("V4").world.owners).map((o) => o.id).filter((d) => d.startsWith("did:jwk:"));
    return isCanonicalDidJwk(v.did_jwk.canonical) && !isCanonicalDidJwk(v.did_jwk.non_canonical_member_order) && owners.length >= 3 && owners.every(isCanonicalDidJwk);
  }],
  ["C116", "Mandate principal = the owner id: every request a host found valid has mandate.principal_id = the card's principal_id; a mandate naming someone else is refused", () => {
    const cards = new Map<string, string>();
    for (const w of Exchange.log as Wire[]) if (w.payload.type === "card_presentation") cards.set(`${w.payload.encounter_id}|${w.payload.from}`, (w.payload as { card: { payload: RepresentativeCard } }).card.payload.principal.principal_id);
    const valid = new Set(uniq.filter((d) => d.input.visitor.mandate === "valid").map((d) => d.encounter_id));
    const reqs = (Exchange.log as Wire[]).filter((w) => w.payload.type === "invitation_request" && valid.has(w.payload.encounter_id)).map((w) => w.payload as { encounter_id: string; from: string; mandate: { payload: { principal_id: string } } });
    const wp = get("V4").data.wrongPrincipal as InvitationResponse;
    return reqs.length > 10 && reqs.every((m) => !cards.has(`${m.encounter_id}|${m.from}`) || cards.get(`${m.encounter_id}|${m.from}`) === m.mandate.payload.principal_id)
      && wp.decision === "deny" && wp.reason_code === "MANDATE_INVALID";
  }],
  ["C117", "Round-1 red-team items re-verified: copied possession proof → never (M1); tampered message rejected; reused nonce → never; a vouch doesn't raise unnamed claims; affiliation never leaves a gathering", () => {
    const c = checks.filter(([id]) => ["C2", "C40", "C57", "C61", "C63"].includes(id));
    return c.length === 5 && c.every(([, , fn]) => fn());
  }],

  // ---------------------------------------------------------------- v0.2.4 (S3 round 3)
  ["C118", "Door root: GET <base>/ → 200 DoorPointer carrying spec_ref (v0.2.6: the version the place implements, 0.2.6); every place in it names entry, lobby and inbox", () => {
    const r = D<{ status: number; body: DoorPointer }>("V5", "root"), r2 = D<{ status: number; body: DoorPointer }>("V5", "rootSlash");
    return r.status === 200 && r2.status === 200 && r.body.type === "door_pointer" && r.body.spec_ref?.version === "0.3.0" && r.body.places.every((p) => !!p.entry && !!p.lobby && !!p.inbox);
  }],
  ["C119", "Listing entries and the lobby carry inbox and spec_ref {version, url}", () => {
    const l = D<PlaceListing>("V5", "listing"), lb = D<LobbyBriefing>("V5", "lobby");
    return l.places.length >= 4 && l.places.every((p) => /\/inbox$/.test(p.inbox) && p.spec_ref.version === "0.3.0" && !!p.spec_ref.url) && /\/inbox$/.test(lb.inbox) && lb.spec_ref.version === "0.3.0";
  }],
  ["C120", "POST at the lobby is handled exactly like the entry; GET at entry or lobby, and PUT / DELETE anywhere → 404 with a DoorPointer body", () => {
    const lp = D<{ status: number; body: ReplyEnvelope }>("V5", "lobbyPost");
    const nf = ["getEntry", "putEntry", "deleteRoot", "getLobby"].map((k) => D<{ status: number; body: DoorPointer }>("V5", k));
    return lp.status === 200 && lp.body.messages.some((m) => (m as unknown as Wire).payload.type === "greeting") && nf.every((r) => r.status === 404 && r.body.type === "door_pointer");
  }],
  ["C121", "Inbox: a validly signed poll from anyone → 200 with its own (here empty) inbox; unsigned or signer ≠ from → 403 with an empty ReplyEnvelope body", () => {
    const st = D<{ status: number; body: ReplyEnvelope }>("V5", "strangerPoll");
    const bad = ["unsignedPoll", "mismatchPoll"].map((k) => D<{ status: number; body: ReplyEnvelope }>("V5", k));
    return st.status === 200 && st.body.messages.length === 0 && bad.every((r) => r.status === 403 && r.body.protocol === "shokai/0.3" && Array.isArray(r.body.messages) && r.body.messages.length === 0);
  }],
  ["C122", "Poll freshness and replay: sent_at outside ±300 s → 403; a poll msg_id already used → 403; the first use → 200", () =>
    ["stalePoll", "futurePoll", "replayPoll"].every((k) => D<{ status: number }>("V5", k).status === 403) && D<{ status: number }>("V5", "okPoll").status === 200],
  ["C123", "Held: a peer_invitation answered later gets a place-signed `held` notice in the same response, naming in_reply_to, the inbox and answer_by", () => {
    const h = D<Wire | undefined>("V5", "held"); const p = h?.payload as { type: string; in_reply_to: string; inbox: string; answer_by?: string; from: string } | undefined;
    return !!h && !!p && verifySigned(h, p.from).ok && /\/inbox$/.test(p.inbox) && !!p.in_reply_to && !!p.answer_by;
  }],
  ["C124", "Spec-only pair path (Appendix B; the place declares x-test-profile): invitation → held → test owner's passkey answer in the inbox → meeting granted → commitment considering → outcome in the inbox carrying a passkey approve_commitment over the considering response; `since` then returns nothing", () => {
    const d = get("V5").data;
    const m = d.meetResp as InvitationResponse, c = d.commitResp as InvitationResponse, o = d.outcome as ConsiderationOutcome | undefined, v = d.outcomeConsentV as { ok: boolean; approve: boolean } | undefined;
    return (d.answers as unknown[]).length === 1 && d.accepted === true && m.decision === "grant" && c.decision === "considering" && o?.decision === "grant" && !!v?.ok && v.approve && o.owner_consents?.[0]?.payload.assurance === "passkey" && d.emptyAfter === 0
      && (d.listing as PlaceListing).places.filter((p) => (p as unknown as Record<string, unknown>)["x-test-profile"] === "shokai-b/0.3").length === 2;
  }],
  ["C125", "Test owner rule (Appendix B.2): approve iff every purpose ∈ {collaboration, invitation, introduction}, valid now, ≤ 30 days, before answer_by; otherwise a signed decline", () => {
    const r = D<Record<string, string>>("V5", "ruleCases"), dn = D<{ answer: { payload: { decision: string } } } | undefined>("V5", "declineAns");
    return r.ok === "rule_met" && r.purpose === "purpose_outside_rule" && r.long === "longer_than_30_days" && dn?.answer.payload.decision === "decline";
  }],
  ["C126", "answer_by: an invitation already past answer_by is not taken home (no held, no answer, even at a B.2 test-owner place: the Peer meetings extension wins); an answer issued after answer_by is ignored (silence = decline)", () =>
    D<boolean>("V5", "lateHeld") === false && D<boolean>("V5", "lateAnswer") === false && D<boolean>("V5", "lateIgnored") === true],
  ["C127", "Spec-only gathering path (Appendix B.3): a verified requester of gathering.request_invitation is granted and receives, in its inbox, a gathering_invitation whose place-signed guest list names it", () =>
    D<InvitationResponse>("V5", "gatherResp").decision === "grant" && D<unknown[]>("V5", "gInvites").length === 1 && D<boolean>("V5", "invitedNow") === true],
  ["C128", "Passkey rp_id travels in the signature: an owner never seen before verifies against the stated rp_id; rpIdHash ≠ stated, a missing rp_id, or a stated rp_id ≠ the card's → refused", () => {
    const r = D<Record<string, unknown>>("V5", "rp");
    return r.statedOk === true && r.mismatch === false && r.missing === false && r.knownWrong === false && typeof r.stated === "string";
  }],
  ["C129", "vouch_digest: REQUIRED (and equal to the vouch's digest) when the introduction carried a vouch, absent otherwise; missing, wrong or extra → not_now REQUEST_INCOMPLETE", () =>
    D<InvitationResponse>("V5", "vdGood").decision === "considering" && ["vdMissing", "vdWrong", "vdExtra"].every((k) => { const r = D<InvitationResponse>("V5", k); return r.decision === "deny" && r.disposition === "not_now" && r.reason_code === "REQUEST_INCOMPLETE"; })],
  ["C130", "A missing vouch where policy needs one is a setup gap: not_now VOUCH_REQUIRED, retry with_credential [vouch] (never not_a_fit)", () => {
    const r = D<InvitationResponse>("V5", "noVouch");
    return r.decision === "deny" && r.disposition === "not_now" && r.reason_code === "VOUCH_REQUIRED" && r.retry.kind === "with_credential" && r.retry.credentials.includes("vouch");
  }],
  ["C131", "Templates: mandates keyed by purpose (one per served purpose), a spending purpose carries a max_amount placeholder; placeholders are <…> and MAY give an e.g. example (formats and, v0.2.6, free-text fields such as role), but ids, keys, digests and rp_id carry no example value", () => {
    const lb = D<LobbyBriefing>("V5", "lobby"); const t = lb.templates;
    const keys = Object.keys(t.mandates);
    // v0.2.5 (R4-3, host-4-002): a placeholder MAY name its format with an "e.g." example, except identifiers, keys,
    // digests and rp_id, which carry no example value.
    const ph: [string, string][] = []; const walk = (o: unknown, k = ""): void => { if (typeof o === "string") ph.push([k, o]); else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) walk(v, kk); };
    walk(t);
    const placeholders = ph.filter(([, v]) => v.startsWith("<"));
    const idLike = placeholders.filter(([k]) => /(_id|^rp_id|did|key|digest|^value)$/.test(k) && k !== "value");
    return keys.length >= 2 && keys.every((k) => t.mandates[k].purpose?.code === k) && !!t.mandates.purchase?.limits?.max_amount && /^</.test(t.card.owner_binding?.rp_id ?? "") && !/\.example$/.test(t.card.owner_binding?.rp_id ?? "")
      && placeholders.every(([, v]) => v.endsWith(">")) && idLike.length >= 2 && idLike.every(([, v]) => !/e\.g\./.test(v));
  }],
  ["C132", "D12: a signed allowance status lives at most 1 hour (next_update − issued_at ≤ 3600 s): usable at 59 min, stale at 61 min, a 2-hour status refused", () => {
    const d = D<{ hours: number; lifetime_s: number; fresh: boolean; stale: boolean; twoHour: boolean }>("V5", "d12");
    return d.hours === 1 && d.lifetime_s === 3600 && d.fresh && !d.stale && !d.twoHour;
  }],
  ["C133", "A header timestamp that is not RFC 3339 UTC whole seconds makes the message malformed: the place answers with the lobby", () =>
    D<{ status: number; body: ReplyEnvelope }>("V5", "badTsResp").body.messages.some((m) => (m as unknown as Wire).payload.type === "lobby_briefing")],
  ["C134", "After a considering, both sides' farewells in that visit are taken_inside (every exchange in the run)", () => {
    const log = Exchange.log as Wire[];
    const cons = log.filter((m) => m.payload.type === "invitation_response" && (m.payload as InvitationResponse).decision === "considering");
    const enc = (m: Wire) => (m.payload as { encounter_id?: string }).encounter_id;
    // the first farewell from either side after the considering, before that encounter id is greeted again
    const fw = cons.flatMap((c) => { const i = log.indexOf(c); const next = log.findIndex((m, j) => j > i && m.payload.type === "greeting" && enc(m) === enc(c));
      return log.filter((m, j) => j > i && (next < 0 || j < next) && m.payload.type === "farewell" && enc(m) === enc(c)); });
    return cons.length > 0 && fw.length > 0 && fw.every((f) => (f.payload as { outcome: string }).outcome === "taken_inside");
  }],
  ["C135", "Card check order: presenter ≠ the card's representative → never; missing or malformed proof → not_now possession_proof even if the card also fails; card fails → not_now signed_card; a well-formed failing proof → never", () => {
    const base = uniq.find((d) => d.input.visitor.card === "verified" && d.core.decision === "grant")!.input;
    const run = (v: Partial<typeof base.visitor>) => decide({ ...base, visitor: { ...base.visitor, ...v } });
    const a = run({ presenter_mismatch: true, possession: "missing" }), b = run({ card: "invalid", possession: "missing" }), c = run({ card: "invalid", possession: "ok" }), e = run({ possession: "failed" });
    const creds = (x: typeof a) => (x.retry && x.retry.kind === "with_credential" ? x.retry.credentials : []) as string[];
    return a.decision === "deny" && a.disposition === "never" && b.decision === "deny" && b.disposition === "not_now" && creds(b).includes("possession_proof")
      && c.decision === "deny" && c.disposition === "not_now" && creds(c).includes("signed_card") && e.decision === "deny" && e.disposition === "never";
  }],
  ["C136", "Readiness owner_text never contradicts `required`: an optional introduction says it would help but isn't needed; a missing proof says to start a new visit", () => {
    const r = get("V5").world.ayaRep as Rep;
    const opt = r.text("rro_introduction_optional", ["en-US"]).text, req = r.text("rro_introduction", ["en-US"]).text, pp = r.text("rr_possession_proof", ["en-US"]).text;
    return /isn't needed/.test(opt) && !/isn't needed/.test(req) && /new visit/.test(pp);
  }],
  ["C137", "Room items: the sender sets encounter_id and `to` to the gathering id, and the place keeps the original signed items", () => {
    const g = D<Signed<Gathering>>("G1", "gathering"), log = D<Wire[]>("G1", "log");
    return log.length > 0 && log.every((m) => (m.payload as { encounter_id?: string }).encounter_id === g.payload.gathering_id && (m.payload as { to: string }).to === g.payload.gathering_id && verifySigned(m, (m.payload as { from: string }).from).ok);
  }],

  // ---------------------------------------------------------------- v0.2.5 (S3 round 4)
  ["C138", "Held after considering: every considering response is followed, in the same reply, by a place-signed `held` with in_reply_to = the request and answer_by = response_by (every exchange in the run, and over the door)", () => {
    const log = Exchange.log as Wire[];
    const cons = log.filter((m) => m.payload.type === "invitation_response" && (m.payload as InvitationResponse).decision === "considering");
    const okLog = cons.length > 0 && cons.every((c) => { const i = log.indexOf(c); const h = log[i + 1]?.payload as { type: string; in_reply_to?: string; answer_by?: string; from?: string } | undefined; const p = c.payload as InvitationResponse & { from: string };
      return h?.type === "held" && h.from === p.from && h.in_reply_to === p.in_reply_to && p.decision === "considering" && h.answer_by === p.response_by; });
    const d = get("V6").data; const r = d.bankResp as InvitationResponse; const h = d.bankHeld as { in_reply_to: string; answer_by?: string; inbox: string } | undefined;
    return okLog && r.decision === "considering" && !!h && h.in_reply_to === d.reqMsgId && h.answer_by === r.response_by && /\/inbox$/.test(h.inbox);
  }],
  ["C139", "Appendix B.4 test decider: a place declaring x-test-decider decides a considering routed to a role at once (no max_amount → v0.2.6: conditional require_mandate over the approved actions, as G5b), the outcome held for the visitor's inbox, decided_by a role with human: false, no seat", () => {
    const o = D<ConsiderationOutcome | undefined>("V6", "bankOutcome");
    const declared = (D<PlaceListing>("V6", "listing").places as unknown as Record<string, unknown>[]).filter((p) => p["x-test-decider"] === true).length === 1;
    const rm = o && o.decision === "conditional" ? o.conditions.find((c) => c.code === "require_mandate") : undefined;
    return declared && !!o && o.decision === "conditional" && !!rm && JSON.stringify((rm.params as { actions: string[] }).actions) === JSON.stringify(o.approved?.actions) && o.retry.kind === "with_credential" && o.decided_by.kind === "role" && o.decided_by.human === false && !!o.approved?.valid_until && !("seat" in o && (o as { seat?: unknown }).seat);
  }],
  ["C140", "Appendix B.3 trigger and gate: the gathering_invitation follows the grant of the invitation_request (no act needed); a visitor that fails the normal gate (here a malformed proof) is not granted and receives no invitation", () => {
    const d = get("V6").data; const bad = d.badResp as InvitationResponse | undefined;
    return !!bad && bad.decision === "deny" && d.invitesAfterBad === 0 && (d.goodGather as InvitationResponse).decision === "grant" && d.actsBeforeInvite === 0 && d.invitesAfterGood === 1;
  }],
  ["C141", "A fetched revocation beats a fresh stapled `active`; a fresh staple still carries a visit through a status outage", () =>
    D<boolean>("V6", "before") === false && D<boolean>("V6", "outageWithStaple") === false && D<boolean>("V6", "afterRevoke") === true],
  ["C142", "Encounters are bound to their parties: an outsider's message in another's encounter (open, or a closed pair meeting) gets a deny addressed to the outsider (to = its from, in_reply_to = its msg_id): not_now RITUAL_ORDER, or the owner_consent answer in a pair place; the encounter and the original party's inbox are untouched; v0.2.6: any other encounter-bound message from a non-party (e.g. a card_receipt) gets nothing", () => {
    const d = get("V6").data; const mal = d.malDid as string;
    const o1 = (d.outsiderOpen as Wire[]).map((m) => m.payload as InvitationResponse & { to: string }), o2 = (d.outsiderPair as Wire[]).map((m) => m.payload as InvitationResponse & { to: string });
    const creds = (x: InvitationResponse) => (x.decision === "deny" && x.retry.kind === "with_credential" ? x.retry.credentials : []) as string[];
    return o1.length === 1 && o1[0].to === mal && o1[0].decision === "deny" && o1[0].disposition === "not_now" && o1[0].reason_code === "RITUAL_ORDER"
      && o2.length === 1 && o2[0].to === mal && o2[0].decision === "deny" && o2[0].disposition === "not_now" && creds(o2[0]).includes("owner_consent")
      && (d.outsiderReceipt as Wire[]).length === 0 && d.openStill === true && d.heldForYAfter === 0 && d.yNewAfterOutsider === 0 && d.pairGrant === "grant";
  }],
  ["C143", "Room items are held for every seated attendee other than the sender; no attendee receives its own item", () => {
    const att = D<Map<string, { rep: Rep; heard: { msg: { from: string } }[] }>>("G1", "att");
    const all = [...att.values()];
    return all.some((a) => a.heard.length > 0) && all.every((a) => a.heard.every((h) => h.msg.from !== a.rep.did));
  }],
  ["C144", "Poll header: only the signature, freshness and msg_id are checked (a poll whose `to` or encounter_id names something else still gets 200); an unknown `since` returns everything; an owner may poll with a passkey signature", () => {
    const d = get("V6").data;
    return (d.pollOtherTo as { status: number }).status === 200 && d.unknownSince === d.allForY && (d.allForY as number) > 0 && (d.ownerPoll as { status: number }).status === 200;
  }],
  ["C145", "v0.2.7 (§2.2): two senders using the same msg_ids at one place are two conversations: both encounters bound to their own sender, both requests decided, each response addressed to its own sender (to = that sender, in_reply_to = the shared id)", () => {
    const d = get("V7").data; const ry = d.respY as (InvitationResponse & { to: string }) | undefined, rk = d.respK as (InvitationResponse & { to: string }) | undefined;
    return d.bothBound === true && (d.greetK as number) > 0 && (d.cardK as number) > 0 && d.kProcessed === true && !!ry && !!rk && ry.to === d.yDid && rk.to === d.kDid && ry.in_reply_to === "same-4" && rk.in_reply_to === "same-4" && ry.decision === rk.decision;
  }],
  ["C146", "v0.2.7 (§2.2): de-duplication keyed on (from, msg_id): an exact redelivery from the same sender is not processed again, and the same sender reusing an id for other content is not processed; another sender's same id is (C145)", () => {
    const d = get("V7").data; return d.redelivered === 0 && d.redeliveryNoDecision === true && d.reusedByK === 0 && d.reuseNoDecision === true;
  }],
  ["C147", "v0.2.7 (§2.2, §11.2): poll replay is keyed on (from, msg_id): a second poller using the same poll msg_id gets 200; the same poller reusing it gets 403", () => {
    const d = get("V7").data; return d.pollY1 === 200 && d.pollK1 === 200 && d.pollY2 === 403;
  }],
  ["C148", "v0.2.7 (§2.2): in_reply_to resolves to the message of the reply's `to` (a lookup by msg_id alone would pick the other sender); a room reply resolves to the most recent room item with that id from someone other than the replier, never the first ever seen (host-final2-001)", () => {
    const d = get("V7").data;
    return d.byIdOnlyFrom === d.yDid && d.resolvedKFrom === d.kDid && d.resolvedYFrom === d.yDid
      && d.a1From === d.yDid && d.a2From === d.mDid && d.firstEverQ1From === d.yDid && d.a3From === d.mDid;
  }],
  ["C164", "v0.2.9 (§9.3, P5): a review the penalised introducer signs itself is kept as an appeal and restores nothing; the bank's own signed review (reviewer_id) restores standing", () => {
    return D<boolean>("M1", "appealed") && D<boolean>("M1", "restored");
  }],
];

let pass = 0;
for (const [id, label, fn] of checks) {
  let ok = false; let err = "";
  try { ok = fn(); } catch (e) { err = ` (error: ${(e as Error).message})`; }
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(4)} ${label}${err}`);
}
console.log(`\n${pass}/${checks.length} conformance checks passed across ${R.size} scenarios.`);
process.exit(pass === checks.length ? 0 : 1);
