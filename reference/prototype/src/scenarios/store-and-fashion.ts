/**
 * Happy paths: Aya's representative at Fernwood Goods (online store) and at
 * Maison Ardoise (heritage fashion house). Shows Seeking matches, proof levels
 * weighed by the host, a seat bounded by policy ∩ mandate ∩ request, an act
 * inside the seat, and an act outside it refused explicitly.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Exchange } from "../wire.js";
import { decide } from "../decide.js";
import { type ScenarioResult, readCard, reportQuote } from "./common.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "Happy paths: an online store and a heritage fashion house",
    "Aya's well-prepared representative visits two fictional places. The store seats it to browse, join a reviewer program and buy within a budget, and refuses one request outside that seat. The fashion house reads its card carefully, says up front what it's strong at and why, and opens a conversation, because its values are vouched for and its expertise is evidenced.",
    [["Aya's representative", "Personal representative of Aya, onboarded through the full guided interview"], ["Fernwood Goods", "Fictional online store"], ["Maison Ardoise", "Fictional heritage luxury house (craft, restraint, longevity)"], ["Mika", "Fictional friend who vouches for Aya's representative"]],
  );
  const w = makeWorld(rec);
  const y = w.ayaRep;
  w.issueMandate(y, w.owners.aya, "mand-aya-store", "purchase", "Browse Fernwood, join its reviewer program, and buy a gift up to $150",
    ["store.browse_catalog", "store.join_reviewer_program", "store.place_order"], { max_amount: { value: "150.00", currency: "USD" }, max_operations: 2 });
  w.issueMandate(y, w.owners.aya, "mand-aya-maison", "collaboration", "Open a conversation with Maison Ardoise about storytelling work",
    ["maison.discovery_conversation", "maison.receive_brand_brief"]);
  rec.note("Aya approved both mandates with his passkey (simulated WebAuthn) before the visits.");

  rec.h2("At Fernwood Goods (online store)");
  const s = new Exchange(y, w.hosts.fernwoodRep);
  s.send(y, y.greet("store-1", w.hosts.fernwoodRep));
  s.send(y, y.presentCard("store-1"));
  s.send(y, y.introduce("store-1", null));
  readCard(w.hosts.fernwoodRep, "store-1", rec);
  s.send(y, y.request("store-1", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog", "store.join_reviewer_program", "store.place_order"], limits: { max_amount: { value: "150.00", currency: "USD" } },
    pitch: "Aya writes about makers and would review the new ceramics line honestly.", seeking: ["seek-fernwood", "reviewers"] }));
  rec.note("The reviewer program needs evidenced expertise; Aya's imprint has it, so the request is complete. The seat is the smallest of store policy ($500), Aya's mandate ($150) and the request ($150).");
  s.send(y, y.act("store-1", "store.place_order", { item: "Set of two hand-thrown cups", amount: { value: "120.00", currency: "USD" } }));
  s.send(y, y.act("store-1", "store.export_customer_list", {}));
  s.send(y, y.farewell("store-1", "completed"));

  rec.h2("At Maison Ardoise (heritage fashion house)");
  const m = new Exchange(y, w.hosts.maisonRep);
  m.send(y, y.greet("maison-1", w.hosts.maisonRep));
  m.send(y, y.presentCard("maison-1"));
  m.send(y, y.introduce("maison-1", w.mikaVouch));
  readCard(w.hosts.maisonRep, "maison-1", rec);
  m.send(y, y.request("maison-1", { mandate_id: "mand-aya-maison", actions: ["maison.discovery_conversation", "maison.receive_brand_brief"],
    pitch: "Aya tells heritage stories with restraint; we'd love to hear what you're seeking for creators.", seeking: ["seek-ardoise", "creators"] }));
  const d = w.hosts.maisonRep.decisions.at(-1)!;
  const what = decide({ ...d.input, visitor: { ...d.input.visitor, evidence: d.input.visitor.evidence.map((e) => e.area === "imprint.worldview" ? { ...e, level: "self_declared" } : e) } });
  rec.note(`What if Aya's values claim were only self-declared? Running the same gate with that one change gives: decision=${what.decision}${what.disposition ? " " + what.disposition : ""}, needing ${what.readiness?.map((r) => r.code).join(", ") ?? "nothing"}. A polished presentation earns a welcome, never more than the evidence supports.`);
  m.send(y, y.farewell("maison-1", "completed"));

  const r = y.visitReport("maison-1", { text: "Approve a 20-minute discovery call with Maison Ardoise's team; I'll prepare three heritage-story ideas." },
    ["Hi Aya, two visits today.",
     "Fernwood Goods seated me to browse, join their reviewer program and buy within your $150 limit. I ordered the two hand-thrown cups ($120). They refused, explicitly, when I tested a request outside my seat, as they should.",
     "Maison Ardoise read your card closely. They counted your storytelling expertise as evidenced and your 'representatives, not representations' value as vouched (thanks to Mika). Your taste and working style were welcomed but not weighed, since they're self-declared. They opened a discovery conversation and will send their brand brief.",
     "Suggested next step: a short discovery call with their team."].join("\n"));
  reportQuote(rec, "Aya's representative", r);
  return { id: "S1", slug: "store-and-fashion", title: rec.title, rec, world: w, reports: [r], data: { counterfactual: what } };
}
