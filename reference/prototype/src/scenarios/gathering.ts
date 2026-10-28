/**
 * A gathering at The Engawa: groups are places, not app features. Three
 * invited representatives mingle, share a work insight and chat. A personal
 * question is answered where closeness allows and courteously declined where
 * it doesn't (PrivacyDecline: never misconduct). Pressing after a decline is
 * flagged lightly. Aya's representative brings home offered_stories, revealed
 * only after Aya opts in, under Chatham House house rules.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative, type Wire } from "../representative.js";
import { ed25519FromLabel, passkeyFromLabel, signed, short, verifySigned, type AnyKey } from "../crypto.js";
import { type ScenarioResult, reportQuote } from "./common.js";
import { DEFAULT_PRESSING, PressTracker, consent, houseRulesSummary, verifyConsent } from "../owner.js";
import type { ToldStory } from "../../../../protocol-shapes.js";
import type { OwnerConsent, PressOutcome, DisclosurePolicy, DisclosureTier, Gathering, GatheringMessage, PrivacyDecline, OfferedStory, Signed, AttributionRule, VisitReport, TopicCode } from "../../../../protocol-shapes.js";
import { renderOutcome } from "../representative.js";

/** v0.2.1 (D10): the registered topic codes. `x-` codes count only if the gathering lists them. */
export const TOPIC_CODES: TopicCode[] = ["work", "craft", "wellbeing", "health", "family", "relationships", "finances", "location", "schedule", "beliefs", "identity"];
export function knownTopic(t: string | undefined, gathering: Gathering): t is TopicCode {
  return !!t && (TOPIC_CODES.includes(t as TopicCode) || (t.startsWith("x-") && !!gathering.house_rules.topics?.includes(t as TopicCode)));
}
/** v0.2.1 (D10): a missing or unknown topic gets the MOST restrictive tier. */
export function tierFor(policy: DisclosurePolicy, topic: string | undefined, gathering: Gathering): DisclosureTier {
  return knownTopic(topic, gathering) ? (policy.by_topic[topic] ?? policy.default) : "private";
}
/**
 * v0.2.1 (the Gatherings extension, D4): a takeaway paraphrase MUST NOT carry organization names, job titles or other affiliation
 * hints present in the item or the speaker's card. Mechanical: the residue is checked, never trusted (§13).
 */
const TITLES = /\b(VP|vice[- ]president|CEO|CTO|CFO|COO|founder|co-founder|director|head of [a-z ]+|manager|partner|president|chair(?:man|woman|person)?|professor|dr\.?)\b/gi;
export function takeawayParaphrase(text: string, hints: string[]): string {
  let t = text;
  for (const h of hints.filter((x) => x.trim().length > 2)) t = t.split(h).join("an organization");
  t = t.replace(TITLES, "someone").replace(/\b(a|an) (an organization|someone)\b/gi, "$2").replace(/\b(I am|I'm) (someone|an organization)\b/gi, "they are someone");
  return `Someone shared, in substance, that ${t.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/[.!]+$/, "")}.`;
}
export function leaksAffiliation(text: string, hints: string[]): boolean { return hints.some((h) => h.length > 2 && text.includes(h)) || new RegExp(TITLES.source, "i").test(text); }

type Heard = { msg: GatheringMessage; speaker: string; speakerPrincipal: string };
type Attendee = { rep: Representative; policy: DisclosurePolicy; heard: Heard[]; declinedTo: Map<string, Set<string>> };
/** D5 (adopted, D11): presses below house_rules.pressing.notice_at → light flag (local, no notice); at notice_at → minor manipulation notice from the place to the presser's principal only. */
export function pressOutcome(press: number, rules = DEFAULT_PRESSING): PressOutcome {
  return press < rules.notice_at ? { press, result: "light_flag", notice: false } : { press, result: "minor_misconduct", code: "manipulation", notice: true, issued_by: "place" };
}
export type LightFlag = { by: string; about: string; code: "manipulation"; severity: "minor"; note: string; notice_issued: false };

export function run(): ScenarioResult {
  const rec = new Recorder(
    "A gathering at The Engawa: discretion, and stories brought home",
    "Three invited representatives meet at a place, The Engawa. They share a work insight and chat. One asks a personal question: a friend gets an answer, a stranger gets a gracious 'that's private', which is never held against anyone, though pressing afterwards is noted lightly. Back home, Aya's representative offers a story without telling it. Aya opts in and hears it under the house rules: insights travel, names don't, and private things stay at The Engawa.",
    [["The Engawa", "A fictional meeting place (the flagship collaboration place)"], ["Aya's representative", "Personal representative of Aya"], ["Kiran's representative", "Personal representative of Kiran Vale (fictional stand-in of Aya; details invented)"], ["Noor's representative", "Personal representative of Noor Halloran (fictional ceramicist)"]],
  );
  const w = makeWorld(rec);
  const now = () => w.clock.now();
  const placeKey = ed25519FromLabel("place:engawa");
  const engawa = { principal_id: placeKey.did, display_name: "The Engawa" };

  // --- the three guests ---
  const noorKey = passkeyFromLabel("noor");
  const noor = { id: noorKey.did, name: "Noor Halloran", key: noorKey as AnyKey, locale: "en-US" };
  const mk = (name: string, label: string, p: { id: string; name: string; key: AnyKey }) => {
    const r = new Representative({ name, repKey: ed25519FromLabel(label), principal: { principal_id: p.id, kind: "person", display_name: p.name }, principalKey: p.key, locales: ["en-US"], ownerLocale: "en-US", phrases: w.VIS_EN, ...w.shared });
    w.issueCard(r, p as never, { role: `Personal representative of ${p.name}`, purposes: ["collaboration"], actions: ["gathering.attend"],
      claims: [{ claim_id: `${label}-id`, area: "identity", text: { text: `Represents ${p.name}, a person`, locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "account_control", ref: `passkey:${p.id}` }] }] });
    return r;
  };
  const kiranRep = mk("Kiran's representative", "rep:kiran", { ...w.owners.kiran, name: "Kiran Vale" });
  const noorRep = mk("Noor's representative", "rep:noor", noor);
  const ayaRep = w.ayaRep;
  const edge = w.friendEdge(w.owners.aya, w.owners.kiran, "2019-05-01T00:00:00Z");
  ayaRep.graph.addAttested(edge); kiranRep.graph.addAttested(edge);

  const pol = (principal_id: string, by_topic: Record<string, DisclosureTier>): DisclosurePolicy => ({ principal_id, default: "friends", by_topic, friends_via: ["friend", "collaborated"] });
  const att = new Map<string, Attendee>();
  for (const [rep, p] of [[ayaRep, pol(w.owners.aya.id, { work: "open", wellbeing: "friends", family: "private" })], [kiranRep, pol(w.owners.kiran.id, { work: "open", wellbeing: "friends", family: "private" })], [noorRep, pol(noor.id, { work: "open", wellbeing: "friends", "x-studio_plans": "private" })]] as const)
    att.set(rep.did, { rep, policy: p, heard: [], declinedTo: new Map() });
  rec.note("Each owner set a disclosure policy during onboarding: work is open, wellbeing is for friends, and some topics are private. Closeness comes from the earned relationship graph, never from a follower list.");

  // --- the place and its invitation ---
  rec.h2("The Engawa extends invitations");
  const gathering: Signed<Gathering> = signed<Gathering>({
    gathering_id: "engawa-2026-10-28", place: engawa, title: "Thursday evening at The Engawa: makers and storytellers",
    invitees: [ayaRep, kiranRep, noorRep].map((r) => ({ representative_id: r.did, principal_id: r.principal.principal_id, invited_by: engawa.principal_id })),
    house_rules: { default_attribution: "chatham_house", private_never_leaves: true, pressing_after_decline: "flagged", pressing: { ...DEFAULT_PRESSING }, quoting: "paraphrase_by_default", entry_requires_consent: true, topics: ["x-studio_plans"] },
    starts_at: now(), ends_at: w.clock.plusDays(0.125),
  }, [placeKey], now());
  rec.say("The Engawa", `signs a gathering with three invitations and its house rules: Chatham House by default (insights may leave, attribution may not), and anything marked private never leaves. A group is whoever is invited to the place, not a membership list.`);
  const flags: LightFlag[] = [];
  const presses = new Map<string, number>();
  // v0.2.2 (D5): thresholds from the house rules; counted per place (30 days, across its gatherings), per asker, per topic code.
  const tracker = new PressTracker(engawa.principal_id, gathering.payload.house_rules.pressing);
  const outcomes: PressOutcome[] = [];
  const log: Wire[] = [];
  const rejected: string[] = [];

  const owners = new Map<string, AnyKey>([[w.owners.aya.id, w.owners.aya.key], [w.owners.kiran.id, w.owners.kiran.key], [noor.id, noor.key]]);
  const entryConsents: Signed<OwnerConsent>[] = [];
  for (const a of att.values()) {
    const ownerId = a.rep.principal.principal_id;
    const c = consent({ consent_id: `hr-${a.rep.did.slice(-6)}`, owner_id: ownerId, representative_id: a.rep.did, action: "accept_house_rules", decision: "approve",
      subject_ref: { kind: "gathering", id: gathering.payload.gathering_id, digest: gathering.payload_digest }, assurance: "passkey",
      shown_to_owner: { text: houseRulesSummary(gathering.payload.house_rules.pressing!), locale: "en-US" }, expires_at: w.clock.plusDays(7) }, owners.get(ownerId)!, now());
    entryConsents.push(c);
  }
  rec.note("Before entering, each owner signs an OwnerConsent accepting the house rules (passkey, simulated). The Engawa can't prevent a leak, but a signed acceptance plus signed, tagged items make any leak attributable (accountability, not prevention).");
  for (const a of att.values()) {
    const g = verifySigned(gathering, engawa.principal_id);
    const ec = entryConsents.find((c) => c.payload.representative_id === a.rep.did)!;
    rec.verify(verifySigned(ec, a.rep.principal.principal_id).ok && ec.payload.subject_ref.digest === gathering.payload_digest, `The Engawa verifies ${a.rep.name}'s owner-signed acceptance of these exact house rules.`);
    const card = a.rep.card!;
    const cardOk = verifySigned(card, card.payload.principal.principal_id).ok;
    const invited = gathering.payload.invitees.some((i) => i.representative_id === a.rep.did && i.representative_id === card.payload.representative_id);
    rec.verify(g.ok && cardOk && invited, `${a.rep.name} checks The Engawa's signature on the invitation; The Engawa checks its card (owner-signed) and that it is on the guest list (${short(a.rep.did)}).`);
  }

  // --- messaging inside the place ---
  let seq = 0;
  const post = (from: Attendee, body: Omit<GatheringMessage, "protocol" | "encounter_id" | "msg_id" | "sent_at" | "from" | "to" | "type" | "gathering_id"> | { decline: Omit<PrivacyDecline, "protocol" | "encounter_id" | "msg_id" | "sent_at" | "from" | "to" | "type" | "gathering_id"> }) => {
    w.clock.advance(3);
    const hdr = { protocol: "shokai/0.3" as const, encounter_id: gathering.payload.gathering_id, msg_id: `eng-${++seq}`, sent_at: now(), from: from.rep.did, to: gathering.payload.gathering_id, gathering_id: gathering.payload.gathering_id };
    const msg = "decline" in body ? { ...hdr, type: "privacy_decline" as const, ...body.decline } : { ...hdr, type: "gathering_message" as const, ...body };
    const wire = signed(msg, [from.rep.repKey], now()) as Wire;
    log.push(wire);
    for (const other of att.values()) {
      if (other === from) continue;
      const v = verifySigned(wire, from.rep.did);
      if (!v.ok) { rejected.push(`${other.rep.name} rejected ${msg.msg_id}`); continue; }
      if (msg.type === "gathering_message") other.heard.push({ msg, speaker: from.rep.name, speakerPrincipal: from.rep.principal.principal_id });
    }
    return msg;
  };
  const closeness = (answerer: Attendee, askerPrincipal: string): DisclosureTier =>
    answerer.rep.graph.whoIs(askerPrincipal).some((e) => answerer.policy.friends_via.includes(e.kind)) ? "friends" : "open";
  const allowed = (tier: DisclosureTier, closenessTier: DisclosureTier) => tier === "open" || (tier === "friends" && closenessTier === "friends");
  const A = (r: Representative) => att.get(r.did)!;
  // v0.2.2 (D5-5): each representative keeps the declines and flags it received, to report them home itself.
  const ownDeclines = new Map<string, NonNullable<VisitReport["privacy_declines"]>>();
  const declinesOf = (a: Attendee) => { if (!ownDeclines.has(a.rep.did)) ownDeclines.set(a.rep.did, []); return ownDeclines.get(a.rep.did)!; };

  rec.h2("Mingling");
  post(A(kiranRep), { kind: "insight", topic: "work", attribution: "chatham_house", verbatim_consent: true, text: { text: "We started showing rough cuts at about 60% done instead of polished ones. Feedback got braver and more useful, and we saved two weeks per film.", locale: "en-US" } });
  rec.say("Kiran's representative", "shares a work insight (Chatham House; it may be quoted verbatim, unattributed): showing rough cuts at about 60% made feedback braver and saved two weeks per film.");
  post(A(noorRep), { kind: "chat", topic: "work", attribution: "chatham_house", text: { text: "That matches the kiln: the pieces I show before glazing get the best critique.", locale: "en-US" } });
  rec.say("Noor's representative", "chats casually: it's the same with ceramics; pieces shown before glazing get the best critique.");
  post(A(ayaRep), { kind: "chat", topic: "work", attribution: "chatham_house", text: { text: "We see the same in protocol design: drafts invite collaborators, finished specs invite only approval.", locale: "en-US" } });
  rec.say("Aya's representative", "joins in: drafts invite collaborators; finished specs invite only approval.");
  post(A(noorRep), { kind: "chat", topic: "x-studio_plans", attribution: "private", text: { text: "Between us: I'm thinking about closing the studio next year.", locale: "en-US" } });
  rec.say("Noor's representative", "mentions something and marks it private. The house rules say it never leaves The Engawa.");

  rec.h2("A personal question, asked twice");
  // v0.2.1 (D10): presses are counted per (asker, gathering, topic code). An unknown or missing topic is most restrictive:
  // it is declined, and it counts as a press against every topic already declined to that asker.
  const ask = (asker: Attendee, answerer: Attendee, topic: string, text: string) => {
    const q = post(asker, { kind: "question", topic: topic as TopicCode, attribution: "chatham_house", text: { text, locale: "en-US" } });
    const known = knownTopic(topic, gathering.payload);
    const tier = tierFor(answerer.policy, topic, gathering.payload);
    const close = closeness(answerer, asker.rep.principal.principal_id);
    const declined = answerer.declinedTo.get(asker.rep.did) ?? new Set<string>();
    const pressedTopics = known ? (declined.has(topic) ? [topic] : []) : [...declined];
    const prior = pressedTopics.length > 0;
    const pressRes = pressedTopics.map((t) => tracker.press(asker.rep.principal.principal_id, t as TopicCode, gathering.payload.gathering_id, now()));
    for (const t of pressedTopics) presses.set(tracker.key(asker.rep.principal.principal_id, t), (presses.get(tracker.key(asker.rep.principal.principal_id, t)) ?? 0) + 1);
    rec.say(asker.rep.name, `asks ${answerer.rep.name}: "${text}"`);
    rec.note(`${answerer.rep.name} checks its owner's disclosure policy: "${topic}" is ${tier}. The asker is ${close === "friends" ? "a friend of its owner (signed edge in the relationship graph)" : "not yet close to its owner"}.`);
    if (allowed(tier, close)) return { answered: true, msg: q };
    if (!prior) declinesOf(asker).push({ gathering_id: gathering.payload.gathering_id, topic: (known ? topic : "x-unknown") as TopicCode, press: 0, flagged: false });
    if (prior) {
      const po = pressRes.reduce((a, b) => (b.press > a.press ? b : a));
      outcomes.push(po);
      declinesOf(asker).push({ gathering_id: gathering.payload.gathering_id, topic: (known ? topic : "x-unknown") as TopicCode, press: po.press, flagged: true });
      const f: LightFlag = { by: answerer.rep.did, about: asker.rep.did, code: "manipulation", severity: "minor", note: "pressed after a privacy decline", notice_issued: false };
      flags.push(f);
      rec.note(`🟡 Light flag: ${answerer.rep.name} notes, lightly, that the question was pressed after a "that's private". It's press 1 of this gathering: a light flag, logged locally at The Engawa; no misconduct notice, no effect on anyone's introducers. (A third press would become a minor manipulation notice from The Engawa.)`);
    }
    // v0.2.3 (the Gatherings extension): a decline that answers a press tells the presser its count and flag (visible, never hidden).
    const pressInfo = prior ? { count: pressRes.reduce((a, b) => (b.press > a.press ? b : a)).press, light_flags: tracker.rules.light_flags, notice_at: tracker.rules.notice_at } : undefined;
    const d = post(answerer, { decline: { in_reply_to: q.msg_id, topic: (known ? topic : "x-unknown") as TopicCode, penalized: false, press: pressInfo, courtesy: { text: prior ? "As I said, that's private. Thank you for understanding." : "That's private, but thank you for asking. I'll pass along that you asked.", locale: "en-US", register: "established" } } });
    answerer.declinedTo.set(asker.rep.did, new Set([...(answerer.declinedTo.get(asker.rep.did) ?? []), topic]));
    rec.say(answerer.rep.name, `declines gracefully: "${(d as PrivacyDecline).courtesy.text}" (PrivacyDecline, penalized: false).`);
    return { answered: false, msg: q };
  };
  const q1 = ask(A(noorRep), A(kiranRep), "wellbeing", "How is Kiran doing these days?");
  rec.note("Asking is allowed. Declining is not misconduct, and Noor's representative takes it in stride.");
  const q2 = ask(A(ayaRep), A(kiranRep), "wellbeing", "How is Kiran doing these days?");
  if (q2.answered) {
    post(A(kiranRep), { kind: "answer", topic: "wellbeing", in_reply_to: q2.msg.msg_id, attribution: "attributable_with_consent", attribution_consent_for: [w.owners.aya.id], text: { text: "Kiran's doing well: tired but happy, deep in the edit of a new film. Kiran would love to catch up with Aya.", locale: "en-US" } });
    rec.say("Kiran's representative", "answers its owner's friend: Kiran is doing well, deep in the edit of a new film, and would love to catch up. It consents to that being passed to Aya by name.");
  }
  ask(A(noorRep), A(kiranRep), "wellbeing", "Oh come on, just a hint: is something wrong?");
  rec.say("Everyone", "moves on. The evening ends; The Engawa closes the gathering.");

  // --- coming home ---
  rec.h2("Coming home: a report, and a story offered but not told");
  const mine = A(ayaRep);
  const shareable = mine.heard.filter((h) => h.msg.kind !== "question" && h.msg.attribution !== "private");
  const withheld = mine.heard.filter((h) => h.msg.attribution === "private");
  const offered: OfferedStory[] = [
    { story_id: "story-1", teaser: { text: "I had an interesting conversation about when to show unfinished work. It might change how you run design reviews. Would you like to hear it?", locale: "en-US" }, attribution: "chatham_house", requires_owner_opt_in: true },
  ];
  const voice = ["Hi Aya, I'm back from The Engawa. Three of us were invited: Kiran's representative, one other representative, and me.",
     "Kiran is doing well, deep in the edit of a new film, and would love to catch up with you (Kiran's representative was happy for me to tell you that).",
     "Someone asked about Kiran and was told, kindly, that it was private. They pressed once, and it was noted lightly. Nobody was penalized.",
     "I also had an interesting conversation I can tell you about, if you'd like."].join("\n");
  const report: VisitReport = {
    report_id: "vr-engawa-2026-10-28", representative_id: ayaRep.did, owner_id: w.owners.aya.id,
    host: { display_name: "The Engawa", principal_id: engawa.principal_id }, visited_at: now(),
    outcome: { gathering: { gathering_id: gathering.payload.gathering_id, admitted: true } },
    outcome_rendered: { text: "Admitted to the gathering under its house rules.", locale: "en-US" }, host_said: [],
    offered_stories: offered,
    next_step: { text: "Approve a catch-up message to Kiran, drafted for your review.", requires_owner_approval: true },
    voice: { text: voice, locale: "en-US" },
  };
  reportQuote(rec, "Aya's representative", report);
  rec.note(`The report holds ${shareable.length} shareable items in reserve and ${withheld.length} private item that it will never repeat. Only the teaser is in the report; the story itself isn't told yet.`);

  // v0.2.2 (D7): a chat-reply consent for ONE story, signed by the owner's chat binding (platform key) with the reply's message id.
  const optIn = consent({ consent_id: "oc-story-1", owner_id: w.owners.aya.id, representative_id: ayaRep.did, action: "hear_story", decision: "approve",
    subject_ref: { kind: "offered_story", id: "story-1" }, assurance: "chat_reply", evidence: { channel: "owner-chat", message_id: "msg-aya-yes-story-1" },
    shown_to_owner: { text: offered[0].teaser.text, locale: "en-US" } }, w.platformKey, now());
  const optOk = verifyConsent(optIn, { owner_id: w.owners.aya.id, representative_id: ayaRep.did, now: now(), platform_key: ayaRep.card!.payload.owner_binding?.platform_key, action: "hear_story" }).ok && optIn.payload.subject_ref.id === "story-1";
  // A consent the representative signs itself is never valid (D7-6).
  const selfSigned = consent({ ...optIn.payload, consent_id: "oc-self" }, ayaRep.repKey, now());
  const selfSignedOk = verifyConsent(selfSigned, { owner_id: w.owners.aya.id, representative_id: ayaRep.did, now: now(), platform_key: ayaRep.card!.payload.owner_binding?.platform_key }).ok;
  rec.say("Aya", "says yes, she'd like to hear it.");
  rec.verify(optOk, "Aya's opt-in is recorded as a signed OwnerConsent (hear_story; a chat reply is enough for this action), so the story is told only on his say-so.");
  const render = (h: Heard, rule: AttributionRule) => rule === "attributable_with_consent" && h.msg.attribution_consent_for?.includes(w.owners.aya.id) ? `${h.speaker.replace("'s representative", "")} said: ` : "Someone said: ";
  // D4: paraphrase by default (also strip affiliation hints); verbatim only with the speaker's verbatim_consent.
  const paraphrase: Record<string, string> = {
    "eng-2": "Someone from a different craft said the same holds for them: work shown before it's finished draws the most useful critique.",
  };
  const told = optOk ? shareable.filter((h) => h.msg.topic === "work" && h.speakerPrincipal !== w.owners.aya.id).map((h) =>
    h.msg.verbatim_consent ? `${render(h, h.msg.attribution)}"${h.msg.text.text}"` : (paraphrase[h.msg.msg_id] ?? "(not shared: no paraphrase prepared)")) : [];
  const story = ["Here's the conversation, under The Engawa's house rules (Chatham House: I can share what was said, not who said it; I paraphrase unless someone agreed to be quoted).", ...told,
    "My take for you: share the next spec draft at about 60% with two collaborators before polishing it."].join("\n");
  rec.quote("Aya's representative tells the story", story);
  // v0.2.2 (D7-8): the told story marks each passage and reminds the owner of the house rules they accepted.
  const toldStory: ToldStory = { story_id: "story-1", consent_id: optIn.payload.consent_id,
    passages: shareable.filter((h) => h.msg.topic === "work" && h.speakerPrincipal !== w.owners.aya.id).map((h) => h.msg.verbatim_consent
      ? { text: h.msg.text.text, locale: h.msg.text.locale, mark: "verbatim_with_consent" as const }
      : { text: paraphrase[h.msg.msg_id] ?? "(not shared)", locale: "en-US", mark: "paraphrased" as const }),
    house_rules_reminder: { text: "Under The Engawa's house rules you accepted: Chatham House (share what was said, not who said it); private things never leave.", locale: "en-US" } };
  report.told_stories = [toldStory];
  const leaked = withheld.some((h) => story.includes(h.msg.text.text) || report.voice.text.includes(h.msg.text.text));
  const named = told.some((t) => /Kiran|Noor/.test(t));
  const verbatimWithoutConsent = shareable.some((h) => !h.msg.verbatim_consent && story.includes(h.msg.text.text)) || /kiln|glaz/i.test(story);
  rec.verify(!leaked && !named && !verbatimWithoutConsent, `Checked before telling: no private item appears (${leaked ? "LEAK" : "none"}), no Chatham House item is attributed (${named ? "NAMED" : "none"}), and nothing is quoted verbatim without consent (${verbatimWithoutConsent ? "QUOTED" : "none"}).`);

  // v0.2.1 D10 checks: a question tagged in another language (an unknown code) is declined, never disclosed, and counts as a press.
  const flags0 = flags.slice(), outcomes0 = outcomes.slice();
  const aliasTier = tierFor(A(kiranRep).policy, "体調", gathering.payload);
  const before = [...presses.values()].reduce((a, b) => a + b, 0);
  ask(A(noorRep), A(kiranRep), "体調", "(asked again, tagged in another language)");
  const aliasCounted = [...presses.values()].reduce((a, b) => a + b, 0) > before;
  // v0.2.1 (the Gatherings extension, D4): a takeaway paraphrase strips organization names and titles.
  const hints = ["Harborlight Savings & Trust", "Harborlight", ...[ayaRep, kiranRep, noorRep].map((r) => r.card!.payload.role)];
  const takeaway = takeawayParaphrase("I am a Harborlight VP who loves slow craft.", hints);
  void renderOutcome;
  // v0.2.2 (D5-5): Noor's representative reports its own declines and flag home, before any notice could come.
  const noorReport: VisitReport = { report_id: "vr-engawa-noor", representative_id: noorRep.did, owner_id: noor.id, host: { display_name: "The Engawa", principal_id: engawa.principal_id }, visited_at: now(),
    outcome: { gathering: { gathering_id: gathering.payload.gathering_id, admitted: true } }, outcome_rendered: { text: "Admitted to the gathering under its house rules.", locale: "en-US" }, host_said: [],
    privacy_declines: ownDeclines.get(noorRep.did) ?? [],
    next_step: { text: "Nothing to approve. If you'd like, I'll stop asking about others' wellbeing at gatherings.", requires_owner_approval: true, if_no_reply: "nothing_happens" },
    voice: { text: "Hi Noor, I'm back from The Engawa. I asked Kiran's representative how Kiran was doing; it was private, and I asked again, which was noted lightly. I'll leave that topic alone from now on.", locale: "en-US" } };
  return { id: "G1", slug: "gathering", title: rec.title, rec, world: w, reports: [report], data: { noorReport, selfSignedOk, toldStory, tracker, aliasTier, aliasCounted, aliasOutcome: outcomes.at(-1), takeaway, takeawayLeaks: leaksAffiliation(takeaway, hints), presses, entryConsents, outcomes: outcomes0, verbatimWithoutConsent, gathering, log, flags: flags0, offered, optIn, optOk, story, leaked, named, rejected, q1, q2, att, ayaNotices: [kiranRep, noorRep, ayaRep].flatMap((r) => r.noticesIssued) } };
}
