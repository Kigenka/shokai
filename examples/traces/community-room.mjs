// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// A gathering at The Engawa (fictional), recorded on the 0.5 SDK core (the Gatherings extension).
// Three invited representatives enter with their owners' accept_house_rules consents. Kiran shares a work
// insight. Noor asks how Kiran is doing and is told "that's private"; Aya (a friend, by the representatives'
// own scripted disclosure rule) asks the same and gets an answer. Noor presses once; the place records a
// light flag, not a misconduct notice. Aya's takeaway is what may leave the room.
// The friend-or-not answers are scripted from each owner's disclosure rule; the door records the signed
// privacy declines and the light flag. No paid model calls. Usage:
// (cd packages/shokai && npm run build) && node examples/traces/community-room.mjs
import { engawa, placeKeys, visitor, mandate, ownerConsent, Session, makeHost, recorder, core, NOW } from "./lib.mjs";

const { check, done, out } = recorder();
const k = placeKeys("engawa");
const aya = visitor("Aya", "person", { purposes: ["gathering"], actions: [core.ATTEND_ACTION] });
const kiran = visitor("Kiran Vale", "person", { purposes: ["gathering"], actions: [core.ATTEND_ACTION] });
const noor = visitor("Noor Halloran", "person", { purposes: ["gathering"], actions: [core.ATTEND_ACTION] });
const invitees = [aya, kiran, noor].map((v) => ({ representative_id: v.rep.id, principal_id: v.owner.id, invited_by: k.principal.id }));
const cfg = engawa(k, invitees);
const h = makeHost(cfg, k, () => NOW);
const g = h.cfg.gathering;
check(!!g?.payload?.gathering_id, "The Engawa has a signed gathering");
const invs = h.place.invitations();
check(invs.length === 3 && invs.every((o) => o.held && (o.message.payload ?? o.message).type === "gathering_invitation"), "each invitee is sent a gathering invitation, held for its inbox");

const enter = (v) => {
  const s = new Session(h, v);
  s.enc = "enc-" + v.name.toLowerCase().replace(/\W+/g, "-");
  const consent = ownerConsent(v.owner, v.rep.id, "accept_house_rules", { kind: "gathering", id: g.payload.gathering_id, digest: g.payload_digest });
  s.ritual(null, mandate(v, "gathering", [core.ATTEND_ACTION]), { actions: [core.ATTEND_ACTION] }, { owner_consents: [consent] });
  return s;
};
const sa = enter(aya); const sk = enter(kiran); const sn = enter(noor);
check([sa, sk, sn].every((s) => s.response()?.decision === "grant"), "all three enter with a pass after their owners accept the house rules");
out.steps.push({ who: "The Engawa", at: "gathering", sent: "gathering_invitation to Aya, Kiran and Noor" });
out.steps.push({ who: "Aya, Kiran and Noor", at: "The Engawa", granted: true, note: "each owner signed accept_house_rules" });

const gid = g.payload.gathering_id;
const room = (s, type, body) => {
  const m = s.msg(type, { gathering_id: gid, ...body });
  m.to = gid;
  m.encounter_id = gid;
  return m;
};

// Kiran shares a work insight (may leave, unattributed).
sk.send(room(sk, "gathering_message", { kind: "chat", topic: "work", text: { text: "Showing rough cuts at about 60% made feedback braver and saved two weeks per film.", locale: "en-US" }, attribution: "chatham_house", verbatim_consent: true }));
out.steps.push({ who: "Kiran's visiting representative", at: "The Engawa", sent: "work insight (Chatham House; may be quoted, unattributed)" });

// Noor marks something private (never leaves).
sn.send(room(sn, "gathering_message", { kind: "chat", topic: "craft", text: { text: "A private note about a piece still in the kiln.", locale: "en-US" }, attribution: "private" }));
out.steps.push({ who: "Noor's visiting representative", at: "The Engawa", sent: "an item marked private (never leaves)" });

// Noor asks about Kiran's wellbeing. Kiran's representative declines: wellbeing is for friends, and Noor is not yet close.
const q1 = room(sn, "gathering_message", { kind: "question", topic: "wellbeing", text: { text: "How is Kiran doing these days?", locale: "en-US" }, attribution: "chatham_house" });
sn.send(q1);
sk.send(room(sk, "privacy_decline", { in_reply_to: q1.msg_id, topic: "wellbeing", courtesy: { locale: "en-US", register: "first_meeting", text: "That's private, but thank you for asking. I'll pass along that you asked." }, penalized: false }));
out.steps.push({ who: "Noor's visiting representative", at: "Kiran's visiting representative", sent: "How is Kiran doing?", got: "privacy_decline (not penalized)" });

// Aya asks the same. Aya is a friend (scripted from Kiran's disclosure rule); Kiran answers, with consent to tell Aya by name.
const q2 = room(sa, "gathering_message", { kind: "question", topic: "wellbeing", text: { text: "How is Kiran doing these days?", locale: "en-US" }, attribution: "chatham_house" });
sa.send(q2);
sk.send(room(sk, "gathering_message", { kind: "chat", topic: "wellbeing", text: { text: "Kiran is doing well, deep in the edit of a new film, and would love to catch up.", locale: "en-US" }, attribution: "attributable_with_consent", attribution_consent_for: [aya.owner.id], verbatim_consent: true }));
out.steps.push({ who: "Aya's visiting representative", at: "Kiran's visiting representative", sent: "How is Kiran doing?", got: "an answer, with consent to pass it on" });

// Noor presses once. The place records a light flag; no misconduct notice (notice_at is 3).
const q3 = room(sn, "gathering_message", { kind: "question", topic: "wellbeing", text: { text: "Oh come on, just a hint: is something wrong?", locale: "en-US" }, attribution: "chatham_house" });
sn.send(q3);
const snapAfterPress = h.place.snapshot();
sk.send(room(sk, "privacy_decline", { in_reply_to: q3.msg_id, topic: "wellbeing", courtesy: { locale: "en-US", register: "first_meeting", text: "As I said, that's private. Thank you for understanding." }, penalized: false }));
const snap = h.place.snapshot();
check((Object.values(snapAfterPress.presses).some((n) => n >= 1) || Object.values(snap.presses).some((n) => n >= 1) || (snap.flags?.length ?? 0) >= 1), "pressing after a decline is noted at the place");
out.steps.push({ who: "Noor's visiting representative", at: "Kiran's visiting representative", sent: "presses again", got: "privacy_decline; a light flag, no misconduct notice" });

const take = h.place.takeaway(aya.rep.id);
check(take.some((t) => /rough cuts|feedback|film/i.test(t.text)), "Aya's takeaway includes the work insight (unattributed or paraphrased)");
check(!take.some((t) => /kiln/i.test(t.text)), "the private item does not leave the room in Aya's takeaway");
check(take.some((t) => /doing well|catch up/i.test(t.text) && t.attributed_to), "the answer meant for Aya may leave, attributed, with consent");
out.steps.push({ who: "Aya's visiting representative", at: "Aya (owner)", sent: "report home: what it may tell, and a story offered but not told" });
out.takeaway_kinds = take.map((t) => t.kind);
out.flags = snap.flags?.length ?? 0;
out.presses = Object.values(snap.presses).reduce((a, n) => a + n, 0);

const entries = [
  { who: "aya_enter", types: sa.types() },
  { who: "kiran_enter", types: sk.types() },
  { who: "noor_enter", types: sn.types() },
];
done(new URL("./community-room.trace.json", import.meta.url), {
  place: "The Engawa (fictional)",
  note_on_friends: "Whether Kiran's representative answers Aya and declines Noor is scripted from Kiran's disclosure rule (wellbeing is for friends). The door records the signed privacy declines and the press.",
  trace: { invitations: invs.length, entries, room: { items: snap.items, flags: snap.flags?.length ?? 0, presses: out.presses } },
});
