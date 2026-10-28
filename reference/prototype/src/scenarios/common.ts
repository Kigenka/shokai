import type { Recorder } from "../transcript.js";
import type { Representative } from "../representative.js";
import type { World } from "../cast.js";
import type { VisitReport } from "../../../../protocol-shapes.js";

export type ScenarioResult = {
  id: string; slug: string; title: string; rec: Recorder; world: World;
  reports: VisitReport[]; data: Record<string, unknown>;
};

/** Narrate how `reader` weighs the counterpart's claims and imprint, by EFFECTIVE proof level. */
export function readCard(reader: Representative, encounterId: string, rec: Recorder): void {
  const e = reader.getEnc(encounterId);
  if (!e.theirCard) return;
  e.weighed = reader.weigh(e.theirCard, e);
  rec.say(reader.name, `reads ${e.theirCard.principal.display_name}'s card and weighs each claim by what can actually be confirmed:`);
  rec.table(["Claim or imprint facet", "Card says", "Counted as", "Why"], e.weighed.map((w) => [`${w.area}: ${w.label}`, w.asserted, w.asserted === w.effective ? `**${w.effective}**` : `**${w.effective}** (downgraded)`, w.why]));
  const s = reader.strengths(e);
  if (s.length) rec.note(`Up front, ${reader.name} can say this representative is strong at: ${s.map((x) => `${x.text} (${x.proof_level})`).join("; ")}. Self-declared items are welcomed, but they aren't weighed.`);
}

/** Narrate who the counterpart is to my principal, from my local, earned relationship graph. */
export function whoIs(reader: Representative, otherPrincipal: string, rec: Recorder, otherName: string): void {
  const edges = reader.graph.whoIs(otherPrincipal);
  if (!edges.length) { rec.note(`${reader.name} checks its relationship graph: no history with ${otherName} yet.`); return; }
  rec.note(`${reader.name} checks its relationship graph (earned through the protocol, never imported): ${edges.map((x) => `${x.kind} since ${x.since.slice(0, 10)}, standing ${x.standing}${x.attestations ? `, attested by ${x.attestations.length} owner passkeys` : ""}`).join("; ")}.`);
}

export function reportQuote(rec: Recorder, who: string, r: VisitReport): void {
  rec.quote(`${who}'s report home (VisitReport, in its own voice, for its owner)`, r.voice.text);
  rec.json("VisitReport (structured)", r);
}
