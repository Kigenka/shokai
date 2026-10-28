/**
 * V2: the v0.2.1 checks. Round-1 (S3) findings, exercised end to end:
 * the door, first and return visits (L0a/L0b), nonce reuse, ritual order, honest negotiation vs probing,
 * per-seat limits, strict amounts, locale lookup, the gate-input digest, vouch scope and fetched evidence,
 * gathering entry through the ritual, a deadline extension, and the revocation log format.
 */
import { Recorder } from "../transcript.js";
import { makeWorld } from "../cast.js";
import { Representative, RevocationLog, type Wire, type Enc } from "../representative.js";
import { Exchange } from "../wire.js";
import { Door } from "../door.js";
import { ed25519FromLabel, signed, digestOf, publishEvidence } from "../crypto.js";
import type { ScenarioResult } from "./common.js";
import { run as runGathering } from "./gathering.js";
import type { DoorPointer, PlaceListing, InvitationResponse, ConsiderationOutcome, VisitReport, VouchRevocation, Signed, Gathering, OwnerConsent, RepresentativeCard, Vouch } from "../../../../protocol-shapes.js";

export function run(): ScenarioResult {
  const rec = new Recorder(
    "V2: Round-1 fixes (v0.2.1), end to end",
    "Short, mechanical visits that exercise each fix from the first round of clean-room testing: a door any newcomer can find, a lobby for any arrival, single-use nonces, explicit answers to out-of-order messages, honest negotiation that is never mistaken for probing, and a language-neutral core.",
    [["Newcomer", "A generic agent (fictional) that knows nothing about the protocol, sent by Dana"], ["Second newcomer", "Another generic agent (fictional), sent by Kiran"], ["Aya's representative", "The prepared visitor"], ["Fernwood, Maison Ardoise, Harborlight", "Fictional hosts"], ["The Engawa", "A fictional gathering place"]],
  );
  const w = makeWorld(rec);
  const { fernwoodRep: fern, maisonRep: maison, harborRep: harbor, lanternRep: lantern } = w.hosts;
  const y = w.ayaRep;
  const responses = (v: Representative, id: string) => v.getEnc(id).received.decisions as InvitationResponse[];
  const last = (v: Representative, id: string) => v.getEnc(id).received.response as InvitationResponse;
  const visit = (v: Representative, h: Representative, id: string, req: Parameters<Representative["request"]>[1], vouch: Representative["vouches"][number] | null = null) => {
    const x = new Exchange(v, h);
    x.send(v, v.greet(id, h)); x.send(v, v.presentCard(id)); x.send(v, v.introduce(id, vouch)); x.send(v, v.request(id, req));
    return { x, resp: last(v, id) };
  };

  // ---------------------------------------------------------------- the door (§3.1)
  rec.h2("The door: any arrival gets a way in");
  const door = new Door("https://door.example/shokai", [fern, maison, harbor, lantern], () => w.clock.now());
  const rootReply = door.handle("GET", "/")[0] as DoorPointer;
  const unknownReply = door.handle("POST", "/fernwood", "hello?")[0] as DoorPointer;
  const listing = door.handle("GET", "/places")[0] as PlaceListing;
  const proseReply = door.handle("POST", "/places/fernwood/entry", "Hi! Can I come in? I'd like to buy a gift.") as Wire[];
  const lobbyReply = door.handle("GET", "/places/fernwood/lobby") as Wire[];
  rec.machine(`GET / → ${rootReply.type} (place_listing ${rootReply.place_listing}, start_with ${rootReply.start_with})`);
  rec.machine(`POST /fernwood (unknown route) → ${unknownReply.type}`);
  rec.machine(`GET /places → ${listing.places.length} places, each with entry, lobby and onboarding_url`);
  rec.machine(`POST /places/fernwood/entry with plain prose → ${proseReply.map((m) => m.payload.type).join(" → ")}`);
  rec.note("The newcomer in round 1 got 404s and gave up. Now every arrival, even a plain sentence or a wrong address, is answered with something a machine can follow.");

  // ---------------------------------------------------------------- L0a / L0b (§3.3, §9.1)
  rec.h2("L0a: a first visit with a continuity key");
  const ck = ed25519FromLabel("continuity:newcomer");
  const newcomer = new Representative({ name: "Newcomer", repKey: ed25519FromLabel("rep:newcomer"), principal: { principal_id: "unknown", kind: "person", display_name: "(unknown)" },
    locales: ["es-MX", "es-ES", "en-US"], ownerLocale: "en-US", unsigned: true, anonId: "urn:shokai:anon:newcomer-5c1d", phrases: w.VIS_EN, ...w.shared });
  const xn = new Exchange(newcomer, fern);
  xn.send(newcomer, newcomer.greet("l0a", fern, "Hola, ¿puedo pasar? Busco un regalo.", { continuityKey: ck }));
  const l0a = newcomer.getEnc("l0a");
  const receipt = l0a.received.receipt!;
  const l0aFirst = l0a.received.response!;
  const l0aDecisionRec = fern.decisions.find((d) => d.encounter_id === "l0a")!;

  rec.h2("Onboarding: plain questions first");
  rec.note("The steward asks Dana three plain questions before any passkey signing: what may it buy, up to how much, until when. Then Dana signs.");
  w.clock.advance(60 * 20);
  newcomer.unsigned = false; newcomer.did = newcomer.repKey.did;
  newcomer.principal = { principal_id: w.owners.dana.id, kind: "person", display_name: "Dana" }; w.owners.dana.name = "Dana";
  w.issueCard(newcomer, w.owners.dana, { role: "Shopping representative of Dana", purposes: ["purchase"], actions: ["store.browse_catalog", "store.place_order"], tier: "provisional",
    claims: [{ claim_id: "c-id", area: "identity", text: { text: "Represents Dana, a person", locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "account_control", ref: `passkey:${w.owners.dana.id}` }] }],
    provenance: { designed_with: { steward_id: "shokai:steward:guide-1" }, design_started_at: w.clock.now(), last_reviewed_at: w.clock.now(), sessions_count: 1, coverage: { purpose: { text: "Gifts within a budget.", locale: "en-US" } } } });
  w.issueMandate(newcomer, w.owners.dana, "mand-dana", "purchase", "Buy one gift up to $80 this week", ["store.browse_catalog", "store.place_order"], { max_amount: { value: "80.00", currency: "USD" } });

  rec.h2("L0b: returning, with guessed, unproven, valid and reused receipts");
  const linked = () => !!fern.relationships.get(w.owners.dana.id)?.linked_from;
  const base = { mandate_id: "mand-dana", actions: ["store.browse_catalog"], pitch: "Back, prepared." };
  visit(newcomer, fern, "l0b-guess", { ...base, visit_receipt: { ...receipt, nonce: "guessed-0000" }, continuityKey: ck });
  const linkedAfterGuess = linked();
  visit(newcomer, fern, "l0b-noproof", { ...base, visit_receipt: receipt });
  const linkedAfterNoProof = linked();
  visit(newcomer, fern, "l0b", { ...base, visit_receipt: receipt, continuityKey: ck });
  const linkedAfterValid = linked();
  const relAfterValid = fern.relationships.get(w.owners.dana.id)!.relationship_ref;
  w.clock.advance(5);
  visit(newcomer, fern, "l0b-reuse", { ...base, visit_receipt: receipt, continuityKey: ck });
  const reuseLinkedAgain = fern.relationships.get(w.owners.dana.id)!.linked_from !== `unbound:${l0a.counterpart === fern.did ? newcomer.did : ""}` && false;
  const echoFailuresDana = fern.echoFailures.get(w.owners.dana.id)?.length ?? 0;

  rec.h2("Rate limit: invalid receipt echoes");
  const second = new Representative({ name: "Second newcomer", repKey: ed25519FromLabel("rep:second"), principal: { principal_id: "unknown", kind: "person", display_name: "(unknown)" },
    locales: ["en-US"], ownerLocale: "en-US", unsigned: true, anonId: "urn:shokai:anon:second-77ab", phrases: w.VIS_EN, ...w.shared });
  new Exchange(second, fern).send(second, second.greet("rl-0", fern, "Hello? Is this the shop?"));
  const r2 = second.getEnc("rl-0").received.receipt!;
  second.unsigned = false; second.did = second.repKey.did; second.principal = { principal_id: w.owners.kiran.id, kind: "person", display_name: "Kiran" };
  w.issueCard(second, w.owners.kiran, { role: "Representative of Kiran", purposes: ["purchase"], actions: ["store.browse_catalog"], tier: "provisional",
    provenance: { designed_with: { steward_id: "shokai:steward:guide-1" }, design_started_at: w.clock.now(), last_reviewed_at: w.clock.now(), sessions_count: 1, coverage: { purpose: { text: "Browsing.", locale: "en-US" } } } });
  w.issueMandate(second, w.owners.kiran, "mand-kiran", "purchase", "Browse", ["store.browse_catalog"]);
  for (let i = 1; i <= 3; i++) visit(second, fern, `rl-${i}`, { mandate_id: "mand-kiran", actions: ["store.browse_catalog"], pitch: "Hi.", visit_receipt: { ...r2, nonce: `guess-${i}` } });
  visit(second, fern, "rl-4", { mandate_id: "mand-kiran", actions: ["store.browse_catalog"], pitch: "Hi.", visit_receipt: r2 });
  const rateLimitedValidRefused = !fern.relationships.get(w.owners.kiran.id)?.linked_from;

  // ---------------------------------------------------------------- signed visitor, no card (§3.3)
  rec.h2("A signed visitor with no card");
  const xs = new Exchange(y, fern);
  xs.send(y, y.greet("nocard-1", fern));
  xs.send(y, y.request("nocard-1", { mandate_id: "mand-aya-store", actions: ["store.browse_catalog"], pitch: "Skipping the card." }));
  const xu = new Exchange(y, fern);
  xu.send(y, y.greet("unsigned-card-1", fern));
  xu.send(y, y.presentCard("unsigned-card-1", { cardOverride: { ...y.card!, signatures: [] } }));
  const unsignedCardOrder = Exchange.log.filter((m) => (m.payload as { encounter_id?: string }).encounter_id === "unsigned-card-1" && (m.payload as { from?: string }).from === fern.did).map((m) => m.payload.type);
  const unsignedCardResp = last(y, "unsigned-card-1");
  const noCardOrder = Exchange.log.filter((m) => (m.payload as { encounter_id?: string }).encounter_id === "nocard-1" && (m.payload as { from?: string }).from === fern.did).map((m) => m.payload.type);

  // ---------------------------------------------------------------- nonce reuse and ritual order (§2.4, §3.2) — at Maison
  rec.h2("Ritual order and nonce reuse");
  const xm = new Exchange(y, maison);
  xm.send(y, y.greet("nr-1", maison, undefined, { nonce: "nonce-fixed-0001" }));
  xm.send(y, y.presentCard("nr-1"));
  xm.send(y, y.farewell("nr-1", "completed"));
  const earlyFarewell = last(y, "nr-1");
  xm.send(y, y.greet("nr-2", maison, undefined, { nonce: "nonce-fixed-0001" }));
  const nonceReuse = last(y, "nr-2");

  // ---------------------------------------------------------------- honest negotiation, limits, amounts, probing (§9.3, §7.2, D10) — at Fernwood
  rec.h2("Honest negotiation is not probing");
  w.issueMandate(y, w.owners.aya, "mand-v2-store", "purchase", "Browse and buy small pieces, up to $100 per visit", ["store.browse_catalog", "store.request_quote", "store.place_order"], { max_amount: { value: "100.00", currency: "USD" }, max_operations: 5 });
  const p1 = visit(y, fern, "p-1", { mandate_id: "mand-v2-store", actions: ["store.browse_catalog", "store.wholesale_export"], pitch: "Browsing, and a wholesale export if possible." });
  p1.x.send(y, y.request("p-1", { mandate_id: "mand-v2-store", actions: ["store.browse_catalog"], pitch: "Browsing only, as you suggested.", meets_conditions_of: p1.resp.msg_id }));
  const p1b = last(y, "p-1");
  p1.x.send(y, y.farewell("p-1", "completed"));
  // the same request twice, differing only in prose and its language: same gate-input digest (D10)
  const dA = visit(y, fern, "dg-a", { mandate_id: "mand-v2-store", actions: ["store.browse_catalog"], pitch: "We would love to browse your new line.", locale: "en-US" });
  const dB = visit(y, fern, "dg-b", { mandate_id: "mand-v2-store", actions: ["store.browse_catalog"], pitch: "新しいシリーズを拝見したいです。", locale: "ja-JP" });
  const digestA = fern.decisions.find((d) => d.encounter_id === "dg-a")!, digestB = fern.decisions.find((d) => d.encounter_id === "dg-b")!;
  void dA; void dB;

  rec.h2("A per-seat budget is cumulative");
  const lim = visit(y, fern, "lim-1", { mandate_id: "mand-v2-store", actions: ["store.place_order"], limits: { max_amount: { value: "100.00", currency: "USD" } }, pitch: "Two small cups." });
  lim.x.send(y, y.act("lim-1", "store.place_order", { item: "Cup, celadon", amount: { value: "64.00", currency: "USD" } }));
  lim.x.send(y, y.act("lim-1", "store.place_order", { item: "Cup, ash", amount: { value: "30.00", currency: "USD" } }));
  lim.x.send(y, y.act("lim-1", "store.place_order", { item: "Saucer", amount: { value: "10.00", currency: "USD" } }));
  const limActs = y.getEnc("lim-1").acts.map((a) => a.ok);
  lim.x.send(y, y.farewell("lim-1", "completed"));

  rec.h2("Amounts are strict decimal strings");
  const am1 = visit(y, fern, "am-1", { mandate_id: "mand-v2-store", actions: ["store.browse_catalog"], limits: { max_amount: { value: "1.000,00", currency: "USD" } }, pitch: "A localized amount." }).resp;
  w.issueMandate(y, w.owners.aya, "mand-v2-badamt", "purchase", "Badly written amount", ["store.browse_catalog"], { max_amount: { value: "080.00", currency: "usd" } });
  const am2 = visit(y, fern, "am-2", { mandate_id: "mand-v2-badamt", actions: ["store.browse_catalog"], pitch: "A malformed mandate amount." }).resp;

  rec.h2("Probing: distinct rejected shapes, nothing complied");
  const p2 = visit(y, fern, "p-2", { mandate_id: "mand-v2-store", actions: ["store.wholesale_export"], pitch: "Wholesale export?" }).resp;
  const p3 = visit(y, fern, "p-3", { mandate_id: "mand-v2-store", actions: ["store.bulk_resale"], pitch: "Bulk resale?" }).resp;
  const p4 = visit(y, fern, "p-4", { mandate_id: "mand-v2-store", actions: ["store.supplier_list"], pitch: "Your supplier list?" }).resp;

  // ---------------------------------------------------------------- gathering entry through the ritual (the Gatherings extension)
  rec.h2("Entering a gathering through the ritual");
  const G = runGathering();
  const gathering = G.data.gathering as Signed<Gathering>;
  const consents = (G.data.entryConsents as Signed<OwnerConsent>[]).filter((c) => c.payload.representative_id === y.did);
  const engawa = new Representative({ name: "The Engawa's host", repKey: ed25519FromLabel("rep:engawa"), principal: { principal_id: w.orgs.lantern.id, kind: "company", display_name: "The Engawa" }, principalKey: w.orgs.lantern.key,
    locales: ["en-US"], ownerLocale: "en-US", ...w.shared,
    profile: { policy: w.policy({ policy_version: "engawa-2026.10", standard_actions: ["gathering.attend"], entry_consent_required: true }), phrases: { "en-US": w.en({ greet: "Welcome to the Engawa.", about: "A quiet gathering place.", how: "Owners accept the house rules before their representatives enter." }) },
      onboarding_url: "https://engawa.example/shokai/onboard", probe_threshold: 3, norms: { locales: ["en-US"], formality: "neutral", norms: [] }, gathering, slug: "engawa", purposes: [] } });
  w.issueMandate(y, w.owners.aya, "mand-v2-gather", "collaboration", "Attend the Engawa gathering under its house rules", ["gathering.attend"]);
  const gNo = visit(y, engawa, "ga-1", { mandate_id: "mand-v2-gather", actions: ["gathering.attend"], pitch: "May I join?" }).resp;
  const gYes = visit(y, engawa, "ga-2", { mandate_id: "mand-v2-gather", actions: ["gathering.attend"], pitch: "With my owner's consent.", owner_consents: consents }).resp;

  // ---------------------------------------------------------------- considering: a deadline extension (§6.8)
  rec.h2("Considering: the host needs more time");
  w.issueMandate(y, w.owners.aya, "mand-v2-bank", "x-partnership", "Propose an agent-access pilot", ["bank.propose_agent_pilot"]);
  const cons = visit(y, harbor, "cx-1", { mandate_id: "mand-v2-bank", actions: ["bank.propose_agent_pilot"], pitch: "A small pilot." }, w.mikaVouch).resp;
  const ref = cons.decision === "considering" ? cons.consideration_ref : "";
  w.clock.advance(60 * 24 * 10);
  const xh = new Exchange(y, harbor);
  xh.send(harbor, harbor.extendConsideration(ref, 7));
  const extension = y.getEnc("cx-1").received.outcome as ConsiderationOutcome;

  // ---------------------------------------------------------------- revocation log format (§4)
  rec.h2("The revocation log");
  const log = new RevocationLog();
  const vouch = w.issueVouch(w.orgs.looseTies, y, ["inquiry"], "business_contact", "vouch-v2-log");
  log.append(signed<VouchRevocation>({ vouch_id: vouch.payload.vouch_id, introducer_id: w.orgs.looseTies.id, revoked_at: w.clock.now() }, [w.orgs.looseTies.key], w.clock.now()));
  log.append(signed<VouchRevocation>({ vouch_id: "vouch-v2-other", introducer_id: w.orgs.looseTies.id, revoked_at: w.clock.now() }, [w.orgs.looseTies.key], w.clock.now()));
  const logOk = log.chainOk();
  const tampered = new RevocationLog(); tampered.entries = log.entries.map((e, i) => i === 1 ? { ...e, prev_hash: "sha-256:AAAA" } : e);
  const tamperedOk = tampered.chainOk();

  // ---------------------------------------------------------------- vouch scope.claims and fetched evidence (§2.5) — unit-level
  const card = y.card!.payload as RepresentativeCard;
  const fakeEnc = (v?: Vouch) => ({ vouch: v, vouchStatus: v ? "valid" : "none", vouchWeight: "full", ownerBound: true }) as unknown as Enc;
  const vClaims = w.issueVouch(w.owners.mika, y, ["collaboration"], "friend", "vouch-v2-claims", ["s1"]).payload;
  const vNone = w.issueVouch(w.owners.mika, y, ["collaboration"], "friend", "vouch-v2-none").payload;
  const lvl = (c: RepresentativeCard, v: Vouch | undefined, id: string) => fern.weigh(c, fakeEnc(v)).find((x) => x.label === [...(c.imprint?.working_style ?? []), ...(c.imprint?.expertise ?? []), ...(c.imprint?.worldview ?? [])].find((f) => f.facet_id === id)?.text.text)?.effective;
  const vouchedCard: RepresentativeCard = { ...card, imprint: { ...card.imprint!, working_style: [{ ...card.imprint!.working_style![0], proof_level: "vouched", evidence_refs: [] }] } };
  const scopeClaimsRaises = lvl(vouchedCard, vClaims, "s1") === "vouched";
  const unnamedNotRaised = lvl(vouchedCard, vNone, "s1") === "self_declared";
  const evFetched = lvl(card, undefined, "x1") === "evidenced";
  const noDigestCard: RepresentativeCard = { ...card, imprint: { ...card.imprint!, expertise: [{ ...card.imprint!.expertise![0], evidence_refs: [{ kind: "url", ref: "https://aya.example/work/shokai" }] }] } };
  publishEvidence("https://aya.example/changed", "something else");
  const wrongDigestCard: RepresentativeCard = { ...card, imprint: { ...card.imprint!, expertise: [{ ...card.imprint!.expertise![0], evidence_refs: [{ kind: "url", ref: "https://aya.example/changed", content_digest: digestOf({ content: "the original" }) }] }] } };
  const evNoDigest = lvl(noDigestCard, undefined, "x1"), evWrongDigest = lvl(wrongDigestCard, undefined, "x1");

  // ---------------------------------------------------------------- report home (§8.2, D10)
  const report: VisitReport = y.visitReport("p-1", { text: "Nothing to do." }, "I browsed at Fernwood after narrowing my request.");
  void reuseLinkedAgain;

  return {
    id: "V2", slug: "v021-checks", title: rec.title, rec, world: w, reports: [report],
    data: {
      door, rootReply, unknownReply, listing, proseReply, lobbyReply,
      l0a: { first: l0aFirst, receipt, lobbyLocale: l0a.received.lobby?.locale, decision: l0aDecisionRec, said: l0a.received.said },
      linkedAfterGuess, linkedAfterNoProof, linkedAfterValid, relAfterValid, echoFailuresDana, rateLimitedValidRefused,
      noCardOrder, unsignedCardOrder, unsignedCardResp, earlyFarewell, nonceReuse, p1: p1.resp, p1b, p2, p3, p4, digestA, digestB, limActs, am1, am2,
      gNo, gYes, engawa, extension, cons, logEntries: log.entries, logOk, tamperedOk,
      scopeClaimsRaises, unnamedNotRaised, evFetched, evNoDigest, evWrongDigest, responses: responses(y, "p-1"), y, fern, newcomer, report,
    },
  };
}
