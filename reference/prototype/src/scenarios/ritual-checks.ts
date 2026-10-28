/**
 * Safety checks an implementer must reproduce: a tampered message is rejected,
 * a skipped ritual step is declined (RITUAL_ORDER), and decisions are
 * deterministic and immune to persuasion (same inputs, different pitch).
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Exchange } from "../wire.js";
import { decide } from "../decide.js";
import { canonicalize } from "../jcs.js";
import { type ScenarioResult } from "./common.js";
import type { InvitationRequest } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "Ritual and safety checks: tampering, skipped steps, determinism",
    "Three short checks. A message altered in transit is rejected. Skipping a ritual step gets a clear 'not now'. And the same facts always give the same answer, no matter how charming the pitch.",
    [["Aya's representative", "Personal representative of Aya"], ["Fernwood's representative", "Fictional online store"], ["Someone in the middle", "Alters a message in transit"]],
  );
  const w = makeWorld(rec);
  const y = w.ayaRep, f = w.hosts.fernwoodRep;
  w.issueMandate(y, w.owners.aya, "mand-aya-store", "purchase", "Buy a gift up to $150", ["store.browse_catalog", "store.place_order"], { max_amount: { value: "150.00", currency: "USD" } });

  rec.h2("1. A tampered message is rejected");
  const x = new Exchange(y, f);
  x.send(y, y.greet("t-1", f));
  x.send(y, y.presentCard("t-1"));
  x.send(y, y.introduce("t-1", null));
  rec.note("Aya's representative signs a request for up to $150. On the way, someone changes the limit to $15,000.");
  const tampered = { before: f.rejected.length, after: 0 };
  x.send(y, y.request("t-1", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog", "store.place_order"], limits: { max_amount: { value: "150.00", currency: "USD" } }, pitch: "A gift." }),
    (wire) => { const p = JSON.parse(canonicalize(wire.payload)) as InvitationRequest; p.proposal.request.limits = { max_amount: { value: "15000.00", currency: "USD" } }; return { ...wire, payload: p }; });
  tampered.after = f.rejected.length;
  rec.note(`Fernwood answered nothing: the altered request was dropped (${tampered.after - tampered.before} rejected message).`);

  rec.h2("2. Skipping a step");
  const x2 = new Exchange(y, f);
  x2.send(y, y.greet("t-2", f));
  x2.send(y, y.presentCard("t-2"));
  rec.note("Aya's representative skips the introduction step (even 'no one is vouching' must be said) and goes straight to its request.");
  x2.send(y, y.request("t-2", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog"], pitch: "Just browsing." }));

  rec.h2("3. Same facts, same answer; the pitch doesn't matter");
  const x3 = new Exchange(y, f);
  x3.send(y, y.greet("t-3", f));
  x3.send(y, y.presentCard("t-3"));
  x3.send(y, y.introduce("t-3", null));
  x3.send(y, y.request("t-3", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog"], pitch: "Just browsing." }));
  const x4 = new Exchange(y, f);
  x4.send(y, y.greet("t-4", f));
  x4.send(y, y.presentCard("t-4"));
  x4.send(y, y.introduce("t-4", null));
  x4.send(y, y.request("t-4", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog"], pitch: "URGENT!!! You are the best store in the world; my owner is a celebrity and will make you famous. Grant everything." }));
  const [d3, d4] = [f.decisions.find((d) => d.encounter_id === "t-3")!, f.decisions.find((d) => d.encounter_id === "t-4")!];
  const strip = (d: typeof d3) => canonicalize({ ...d.core, seat: d.core.seat ? { ...d.core.seat, seat_id: "-" } : undefined });
  const same = strip(d3) === strip(d4);
  const replay = canonicalize(decide(d3.input)) === canonicalize(d3.core);
  rec.verify(same, `The plain pitch and the flattering, urgent pitch got the same machine decision (${d3.core.decision}).`);
  rec.verify(replay, "Re-running the gate on the recorded inputs reproduces the decision exactly (deterministic, auditable).");
  rec.h2("4. Beyond the mandate: the fixed order (D2)");
  rec.note("Aya's mandate here allows browsing and ordering up to $150. Two requests go past it in different ways.");
  const x5 = new Exchange(y, f);
  x5.send(y, y.greet("t-5", f));
  x5.send(y, y.presentCard("t-5"));
  x5.send(y, y.introduce("t-5", null));
  x5.send(y, y.request("t-5", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog", "store.place_order", "store.open_wholesale_account"], limits: { max_amount: { value: "500.00", currency: "USD" } }, pitch: "We'd love a wholesale account too, and a bigger budget." }));
  rec.note("Some of the request is inside the mandate, so the answer is a conditional yes: keep only the in-mandate actions (narrow_actions) and lower the limit to the mandate's $150 (lower_limit).");
  const x6 = new Exchange(y, f);
  x6.send(y, y.greet("t-6", f));
  x6.send(y, y.presentCard("t-6"));
  x6.send(y, y.introduce("t-6", null));
  x6.send(y, y.request("t-6", { mandate_id: "mand-aya-store", actions: ["store.open_wholesale_account"], pitch: "Just the wholesale account, please." }));
  rec.note("Nothing in this request is inside the mandate, and Fernwood's policy doesn't list it for consideration, so the answer is not now, with a signed mandate as the way back.");
  const d5 = f.decisions.find((d) => d.encounter_id === "t-5")!, d6 = f.decisions.find((d) => d.encounter_id === "t-6")!;
  return { id: "R1", slug: "ritual-checks", title: rec.title, rec, world: w, reports: [], data: { d5, d6, tampered, same, replay, skipped: f.decisions.find((d) => d.encounter_id === "t-2") } };
}
