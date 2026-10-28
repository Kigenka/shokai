/**
 * Bank gatekeeper with a strict mandate: a request it cannot grant is "taken
 * inside" (considering), a human decides (ConsiderationOutcome), and the
 * representative returns in a new encounter to be seated.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Exchange } from "../wire.js";
import { type ScenarioResult, readCard, reportQuote } from "./common.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "Bank: taking it inside, then an answer",
    "Aya's representative proposes an agent-access pilot to a fictional savings bank. The gatekeeper can't grant that itself, but it's eligible by policy, so it takes the idea inside to a human. A week later the human says yes, and the representative returns, is recognized, and is seated for an introductory call.",
    [["Aya's representative", "Personal representative of Aya"], ["Harborlight's gatekeeper", "Representative of Harborlight Savings & Trust (fictional bank)"], ["Head of Digital Partnerships", "A human inside the bank (fictional role)"], ["Mika", "Fictional friend who vouches"]],
  );
  const w = makeWorld(rec);
  const y = w.ayaRep, h = w.hosts.harborRep;
  w.issueMandate(y, w.owners.aya, "mand-aya-bank", "x-partnership", "Propose an Shōkai access pilot to Harborlight and attend an intro call",
    ["bank.product_info", "bank.propose_agent_pilot", "bank.pilot_intro_call"]);
  const x = new Exchange(y, h);

  rec.h2("First visit: the proposal");
  x.send(y, y.greet("bank-1", h));
  x.send(y, y.presentCard("bank-1"));
  x.send(y, y.introduce("bank-1", w.mikaVouch));
  readCard(h, "bank-1", rec);
  x.send(y, y.request("bank-1", { mandate_id: "mand-aya-bank", actions: ["bank.propose_agent_pilot"], pitch: "A small pilot where verified, owner-bound representatives can ask product questions safely.", seeking: ["seek-harborlight", "pilots"] }));
  rec.note("Why considering and not a no: proposing a pilot is outside the bank's standard policy, but it's on the policy's consideration list, and the visitor is verified, owner-bound and introduced. Eligibility is decided by policy alone; only the human inside will weigh the pitch.");
  x.send(y, y.farewell("bank-1", "taken_inside")); // v0.2.4 (§4): after considering, taken_inside

  rec.h2("Inside the bank, a human decides");
  w.clock.advance(60 * 24 * 6);
  const cons = y.getEnc("bank-1").received.response!;
  const ref = cons.decision === "considering" ? cons.consideration_ref : "";
  rec.say("Head of Digital Partnerships", "reads the proposal and the pitch (this is the proper place for persuasion) and approves an introductory call.");
  x.send(h, h.considerationOutcome(ref, { kind: "role", role: "Head of Digital Partnerships", human: true }, ["bank.propose_agent_pilot", "bank.pilot_intro_call"]));

  rec.h2("Returning to be seated");
  w.clock.advance(60);
  x.send(y, y.greet("bank-2", h));
  x.send(y, y.presentCard("bank-2"));
  x.send(y, y.introduce("bank-2", w.mikaVouch));
  x.send(y, y.request("bank-2", { mandate_id: "mand-aya-bank", actions: ["bank.pilot_intro_call"], pitch: "Returning as invited.", consideration_ref: ref, relationship_ref: cons.relationship_ref, prior_response_ref: cons.msg_id, register: "established" }));
  x.send(y, y.farewell("bank-2", "seated"));
  const r = y.visitReport("bank-2", { text: "Approve a time for the intro call with Harborlight's Head of Digital Partnerships." },
    ["Hi Aya, good news from Harborlight.", "Last week their gatekeeper couldn't approve the pilot idea itself, but it was eligible, so they took it to their Head of Digital Partnerships.",
     "The answer came back yes to an introductory call. I went back, they recognized our earlier visit, and they seated me for exactly that call, nothing more.", "Suggested next step: pick a time for the call."].join("\n"));
  reportQuote(rec, "Aya's representative", r);
  return { id: "B1", slug: "bank-considering", title: rec.title, rec, world: w, reports: [r], data: { ref } };
}
