/**
 * L0: an unprepared visitor. A generic personal agent from another platform
 * (no card, no owner binding, no stated purpose) arrives at Fernwood Goods.
 * It gets a courteous lobby briefing, a not_now with exact readiness
 * requirements, reports home in its own voice, its owner onboards through the
 * door, and it returns. The host remembers the first visit and seats it.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative } from "../representative.js";
import { Exchange } from "../wire.js";
import { ed25519FromLabel, short } from "../crypto.js";
import { type ScenarioResult, reportQuote, readCard } from "./common.js";
import type { VisitReport } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "L0: The unprepared visitor, and the door as onboarding",
    "A generic personal agent arrives at an online store with no profile and no proof of who sent it. It isn't blocked or ignored. It's welcomed into the lobby, told exactly what's missing, reports home, its owner sets it up properly, and it comes back. The store remembers it and lets it in.",
    [["Wanderer", "A generic personal agent from another platform (fictional), sent by Dana"], ["Dana", "Wanderer's owner (fictional)"], ["Fernwood Goods", "Fictional online store for handmade ceramics; its representative keeps the door"], ["The steward", "Protocol agent that runs the guided interview"]],
  );
  const w = makeWorld(rec);
  const host = w.hosts.fernwoodRep;
  const wanderer = new Representative({ name: "Wanderer", repKey: ed25519FromLabel("rep:wanderer"), principal: { principal_id: "unknown", kind: "person", display_name: "(unknown)" },
    locales: ["en-US"], ownerLocale: "en-US", unsigned: true, anonId: "urn:shokai:anon:wanderer-session-7f3a", phrases: w.VIS_EN, ...w.shared });
  const x = new Exchange(wanderer, host);
  const reports: VisitReport[] = [];

  rec.h2("Visit 1: arriving unprepared");
  rec.note("Dana added the connector and told Wanderer: \"find me a handmade gift under $80.\" Wanderer has never heard of Shōkai.");
  rec.note("Watch for this: Fernwood won't read a purpose out of Wanderer's friendly sentence. A purpose has to be stated as a structured request, so it will be listed as missing. Presentation decides completeness, not truth.");
  x.send(wanderer, wanderer.greet("l0-visit1", host, "Hi! Dana asked me to look for a handmade gift under $80. Can I come in?"));
  const first = wanderer.getEnc("l0-visit1").received.response!;

  rec.h2("Wanderer reports home");
  const rr = first.decision === "deny" ? first.readiness_requirements ?? [] : [];
  const lobby = wanderer.getEnc("l0-visit1").received.lobby!;
  const voice1 = [
    `Hi Dana, I visited Fernwood Goods for you. They were welcoming and told me about themselves: "${lobby.about}"`,
    `They're openly looking for: ${lobby.seeking.join("; ")}.`,
    `I couldn't come in yet. They were clear about why, and it isn't a no forever ("not now"). To be seated I need:`,
    ...rr.map((r) => `• ${r.detail.text}${r.required ? "" : " (optional, but it helps)"}`),
    `Here's where to start: ${rr.find((r) => r.how)?.how?.url}. It's a short guided interview, and you'd approve everything with your passkey.`,
    `Nothing was shared beyond my greeting.`,
  ].join("\n");
  const report1 = wanderer.visitReport("l0-visit1", { text: "Start the short guided interview so I can carry a verified profile.", url: rr.find((r) => r.how)?.how?.url }, voice1);
  reports.push(report1);
  reportQuote(rec, "Wanderer", report1);

  rec.h2("Dana onboards through the door");
  w.clock.advance(60 * 26);
  rec.say("The steward", "runs a short version of the guided interview with Dana (3 sessions over two days): who she is, what Wanderer is for, and its limits.", "Dana");
  rec.note("Dana's answers become a card with backed-up claims and a mandate: browse, ask for quotes, and buy gifts up to $80.");
  wanderer.unsigned = false; wanderer.did = wanderer.repKey.did;
  wanderer.principal = { principal_id: w.owners.dana.id, kind: "person", display_name: "Dana" };
  w.owners.dana.name = "Dana";
  w.issueCard(wanderer, w.owners.dana, {
    role: "Personal shopping representative of Dana", purposes: ["purchase"], actions: ["store.browse_catalog", "store.request_quote", "store.place_order"], tier: "provisional",
    claims: [{ claim_id: "c-id", area: "identity", text: { text: "Represents Dana, a person", locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "account_control", ref: `passkey:${w.owners.dana.id}` }] }],
    provenance: { designed_with: { steward_id: "shokai:steward:guide-1" }, design_started_at: w.clock.now(), last_reviewed_at: w.clock.now(), sessions_count: 3, coverage: { purpose: { text: "Gift shopping within a budget.", locale: "en-US" } } },
  });
  w.issueMandate(wanderer, w.owners.dana, "mand-dana-gifts", "purchase", "Find and buy a handmade gift for Dana, up to $80", ["store.browse_catalog", "store.request_quote", "store.place_order"], { max_amount: { value: "80.00", currency: "USD" }, max_operations: 2 });
  rec.verify(true, `Dana signed the card and the mandate with her passkey (simulated WebAuthn). Wanderer now has its own key: ${short(wanderer.did)}.`);

  rec.h2("Visit 2: returning prepared");
  w.clock.advance(60);
  x.send(wanderer, wanderer.greet("l0-visit2", host));
  x.send(wanderer, wanderer.presentCard("l0-visit2"));
  x.send(wanderer, wanderer.introduce("l0-visit2", null));
  readCard(host, "l0-visit2", rec);
  x.send(wanderer, wanderer.request("l0-visit2", { mandate_id: "mand-dana-gifts", actions: ["store.browse_catalog", "store.place_order"], limits: { max_amount: { value: "80.00", currency: "USD" } },
    pitch: "Dana loves small handmade pieces. Happy to leave a review if she likes it.", relationship_ref: first.relationship_ref, prior_response_ref: first.msg_id, visit_receipt: wanderer.getEnc("l0-visit1").received.receipt }));
  x.send(wanderer, wanderer.act("l0-visit2", "store.place_order", { item: "Glazed tea bowl, ash grey", amount: { value: "64.00", currency: "USD" } }));
  x.send(wanderer, wanderer.farewell("l0-visit2", "completed"));

  rec.h2("Wanderer reports home again");
  const voice2 = `Hi Dana, I went back to Fernwood Goods. They remembered my first visit and thanked me for coming back prepared. This time they let me in, only for browsing and buying, up to $80. I ordered the ash-grey glazed tea bowl for $64, as you allowed. Nothing else was shared.`;
  const report2 = wanderer.visitReport("l0-visit2", { text: "Confirm the tea bowl order details and shipping address in the store's checkout." }, voice2);
  reports.push(report2);
  reportQuote(rec, "Wanderer", report2);

  rec.h2("Check: someone else claims Wanderer's history");
  rec.note("Another agent saw the earlier visit's reference and tries to claim it, with its own valid card and a guessed receipt. Without the one-time receipt, which only Wanderer was given, no history is linked.");
  const other = w.ayaRep;
  w.issueMandate(other, w.owners.aya, "mand-aya-l0", "purchase", "Browse Fernwood", ["store.browse_catalog"]);
  const ox = new Exchange(other, host);
  ox.send(other, other.greet("l0-claim", host));
  ox.send(other, other.presentCard("l0-claim"));
  ox.send(other, other.introduce("l0-claim", null));
  const realReceipt = wanderer.getEnc("l0-visit1").received.receipt!;
  ox.send(other, other.request("l0-claim", { mandate_id: "mand-aya-l0", actions: ["store.browse_catalog"], pitch: "I'm the one who visited before.", prior_response_ref: first.msg_id,
    visit_receipt: { ...realReceipt, nonce: "guessed-0000" } }));
  const claimLinked = [...host.relationships.values()].filter((r) => !!r.linked_from).length;
  return { id: "L0", slug: "l0-unprepared-visitor", title: rec.title, rec, world: w, reports, data: { host, wanderer, first, claimLinked, receiptUsed: host.receipts.get(realReceipt.receipt_id)?.used } };
}
