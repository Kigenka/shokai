/**
 * Apprenticeship visit at an introduction-first creative collective. The
 * lesson is signed, carries provenance and both owners' consents, excludes
 * private memory, and is adapted rather than copied. A term that doesn't
 * translate (mutirão) travels with a meaning note and is explained to the owner.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Exchange } from "../wire.js";
import { signed } from "../crypto.js";
import { type ScenarioResult, reportQuote } from "./common.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "Teaching, not templates: an apprenticeship visit",
    "Aya's representative visits a fictional creative collective that only admits introduced guests. Instead of copying a template, the collective's host teaches it a signed lesson about how they give feedback. The representative adapts the lesson to Aya's way of working, learns a word that doesn't translate (mutirão), and explains it to Aya.",
    [["Aya's representative", "Personal representative of Aya"], ["Lantern's host", "Representative of The Lantern Collective (fictional)"], ["Mika", "Fictional friend who vouches"]],
  );
  const w = makeWorld(rec);
  const y = w.ayaRep, l = w.hosts.lanternRep;
  const mand = w.issueMandate(y, w.owners.aya, "mand-aya-learn", "teaching", "Attend a Lantern session and receive a lesson; never share Aya's private memory", ["community.attend_session", "community.receive_lesson"]);
  const lanternConsent = signed({ consent: "teach Aya's representative one lesson on feedback", by: w.orgs.lantern.id, at: w.clock.now() }, [w.orgs.lantern.key], w.clock.now());
  rec.note("Both owners consented first: Aya through his passkey-signed mandate, the collective through a signed consent.");
  y.adapt = (lesson) => ({
    text: "For Aya: in a group review, begin with what the work makes possible, then offer one concrete change. Keep the word 'mutirão' and explain it when it matters.",
    changes: ["kept the structure (possibility first, one change)", "dropped the collective's ritual of a circle round, which Aya doesn't use", `kept the original term from "${lesson.topic}" with its meaning note`],
  });
  const x = new Exchange(y, l);
  x.send(y, y.greet("teach-1", l));
  x.send(y, y.presentCard("teach-1"));
  x.send(y, y.introduce("teach-1", w.mikaVouch));
  x.send(y, y.request("teach-1", { mandate_id: "mand-aya-learn", actions: ["community.attend_session", "community.receive_lesson"], pitch: "Aya wants to learn how you give feedback in groups.", seeking: ["seek-lantern", "peers"] }));
  x.send(l, l.teach("teach-1", {
    lesson_id: "lesson-feedback-1", teacher: { representative_id: l.did, principal_id: w.orgs.lantern.id }, learner: { representative_id: y.did, principal_id: w.owners.aya.id },
    topic: "How we give feedback in a mutirão",
    content: { text: "In our circle, each person first says what the work makes possible, then offers exactly one change. Nobody stacks critiques. It is a mutirão: everyone builds, everyone learns.", locale: "en-US", meaning_notes: [w.meaningMutirao] },
    provenance: { authored_by: w.orgs.lantern.id, derived_from: ["the collective's practice (fictional)"] }, consent_refs: [mand.payload_digest, lanternConsent.payload_digest], excludes_private_memory: true,
  }));
  const ad = y.adaptations[0];
  rec.say("Aya's representative", "adapts the lesson instead of copying it, and records what changed:");
  rec.quote("Adapted lesson (LessonAdaptation)", `${ad.adapted.text}\n\nChanges: ${ad.changes.join("; ")}.`);
  x.send(y, y.farewell("teach-1", "completed"));
  const r = y.visitReport("teach-1", { text: "Try the 'possibility first, one change' format in your next design review." },
    ["Hi Aya, I visited the Lantern Collective (Mika introduced me). They taught me how they give feedback: start with what the work makes possible, then offer exactly one change.",
     "They used a Portuguese word, 'mutirão'. It means a community coming together voluntarily to build something no one could do alone, where everyone helps and everyone learns. Think of a barn-raising for creative work.",
     "I adapted it to how you work and left out their circle ritual. The lesson is signed by the collective, so their name stays attached to what they taught. None of your private memory was shared."].join("\n"));
  reportQuote(rec, "Aya's representative", r);
  return { id: "T1", slug: "teaching", title: rec.title, rec, world: w, reports: [r], data: {} };
}
