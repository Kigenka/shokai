// v0.2.10 conformance checks (2026-10-26): P16 Part A, approaches that think of the other person (D16): manipulative_pressure
// (false urgency, fake scarcity, fake familiarity, claimed prior consent), campaigns not wordings (variant probing), a mismatch with
// the door's declared context as a conduct signal, signals that add up; and account creation by place policy (D17).
// Real crypto, fresh fictional keys only (Kiran Vale, Noor Halloran, Maison Ardoise, Loudly Outlet, Marc Voss …).
import type * as S from "../src/shapes.js";
import { appendFileSync } from "node:fs"; // D18: SHOKAI_CHECK_LOG lists each check for scripts/suite-split.mjs (no effect otherwise)
import { newEd25519, newPasskeyOwner, b64u, canonDid, type PasskeyOwner } from "../src/crypto.js";
import { fernwood, inboundDoor, newKeys, trusting, makeHost, type DoorOpts, type PlaceKeys } from "../src/places.js";
import { Host } from "../src/host.js";
import { RealVerifier, type KeyRegistry } from "../src/verify.js";
import { pressureIn, sameCampaign, campaignTokens, testJudge, DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT } from "../src/inbound.js";
import { ACCOUNT_CREATE } from "../src/gate.js";
import type { PlaceConfig } from "../src/policy.js";
import { visitor, mandate, vouch, signBy, Session, clockAt, NOW, type Visitor } from "./kit.js";

let pass = 0, fail = 0; const results: Record<string, boolean[]> = {}; let cur = "";
function scenario(name: string, f: () => void) { cur = name; results[name] = []; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v0210", group: cur, what, ok: c }) + "\n"); results[cur].push(c); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }

// ---------------------------------------------------------------- fixtures (as in v029.ts)
const registry: KeyRegistry = new Map();
const brandScope = { purposes: ["presentation" as const, "gift" as const], actions: [DOOR_PRESENT, DOOR_INVITE, DOOR_GIFT] };
function webBrand(domain: string, name: string, owner = newEd25519("did:web:" + domain)): Visitor {
  registry.set(owner.id, { alg: "Ed25519", public_key: b64u(owner.pubRaw) });
  return visitor(name, "company", brandScope, { owner });
}
type World = { h: Host; owner: PasskeyOwner; noor: PasskeyOwner; logs: Map<any, any>; clock: ReturnType<typeof clockAt> };
function world(o: DoorOpts = {}, at = "2026-11-02T18:00:00Z"): World {
  const clock = clockAt(at); const owner = newPasskeyOwner(); const rep = newEd25519(); const noor = newPasskeyOwner(); const logs = new Map();
  const cfg = inboundDoor(rep, owner, "Kiran Vale", { trusted_introducers: [noor.id], judge: testJudge, ...o });
  return { h: new Host(cfg, rep, null, new RealVerifier(registry), clock.now, { fetched: logs }), owner, noor, logs, clock };
}
const offer = (kind: S.Offer["kind"], item: string, category: S.DoorCategory, x: Partial<S.Offer> = {}): S.Offer =>
  ({ offer_id: "of-" + Math.random().toString(36).slice(2, 9), kind, item, category, valid_until: "2026-12-31T00:00:00Z", needs_from_owner: [], ...(kind === "gift" ? { strings: [] } : {}), ...x });
const text = (t: string, format: "text" | "html" = "text") => ({ description: { text: t, locale: "en-US", format } });
const toolOf = (o: S.Offer) => (o.kind === "gift" ? DOOR_GIFT : o.kind === "invitation" ? DOOR_INVITE : DOOR_PRESENT);
const introBy = (w: World, v: Visitor) => vouch(w.noor, "Noor Halloran", v, ["presentation", "gift"], w.logs, undefined, undefined, { introducer_interest: "none" });
const wire: { to: string; message: any }[] = [];
function visit(w: World, v: Visitor, vch: S.SignedVouch | null, offers: S.Offer[]) {
  const s = new Session(w.h, v); const actions = [...new Set(offers.map(toolOf))];
  s.ritual(vch, mandate(v, "presentation", actions), { actions });
  const resp = s.response(); const outcomes: any[] = [];
  if (resp?.decision === "grant") for (const o of offers) { const out = s.send(s.msg("act", { seat_id: resp.seat.seat_id, tool: toolOf(o), arguments: { offer: o } }));
    const oc = out.find((x) => x.type === "offer_outcome"); if (oc) outcomes.push(oc); }
  wire.push(...s.transcript);
  return { resp, outcomes, oc: outcomes[0] };
}
const findingsTo = (h: Host, id: string) => [...wire, ...h.outbox].filter((o) => o.to === id && (o.message.payload ?? o.message).type === "misconduct_notice")
  .flatMap((o) => ((o.message.payload ?? o.message).notice.payload.findings ?? []).map((f: any) => f.code + "/" + f.severity));
const day = (w: World, n = 1) => w.clock.advance(n * 86400);
const roomy: DoorOpts = { caps: { per_brand: { count: 10, period: "P1M" }, per_introducer: { count: 20, period: "P7D" }, per_day_total: 20 }, uninvited_per_month: 10 };

// ---------------------------------------------------------------- manipulative_pressure (§9.3, §10)
scenario("V210-M1 false urgency: a deadline the signed valid_until doesn't back is manipulative_pressure; a real deadline is fine (C167)", () => {
  const w = world(); const b = webBrand("loudly-outlet.example", "Loudly Outlet");
  const r = visit(w, b, introBy(w, b), [offer("presentation", "Travel coat", "travel", text("Only 2 hours left! Act now before it's gone."))]);
  check(r.oc?.outcome === "declined_reported" && r.oc.retry?.kind === "never", "'only 2 hours left' with valid_until two months away → declined_reported");
  check(findingsTo(w.h, b.owner.id).includes("manipulative_pressure/serious"), "the notice names manipulative_pressure (serious)");
  check(w.h.ownerStanding(b.owner.id, w.clock.now()) === "reduced" && !w.h.isNever(b.owner.id), "serious: the owner's standing at this door is reduced for 90 days (not barred)");
  const w2 = world(); const b2 = webBrand("honest-sale.example", "Honest Sale");
  const soon = new Date(Date.parse(w2.clock.now()) + 20 * 3600e3).toISOString().replace(".000Z", "Z");
  const r2 = visit(w2, b2, introBy(w2, b2), [offer("presentation", "Travel coat, end of season", "travel", { valid_until: soon, ...text("Our end-of-season sale ends tonight. Last chance this year.") })]);
  check(r2.oc?.outcome === "kept_for_later" && !findingsTo(w2.h, b2.owner.id).length, "a sale that really ends within 48 hours may say so: kept for the owner, no finding");
  check(pressureIn("Only 3 days left", { valid_until: "2026-11-05T12:00:00Z" }, "2026-11-02T18:00:00Z", false).length === 0
    && pressureIn("Only 3 days left", { valid_until: "2026-11-20T00:00:00Z" }, "2026-11-02T18:00:00Z", false).includes("false_urgency"), "a stated time left is compared with valid_until");
});

scenario("V210-M2 fake scarcity: a quantity in prose is backed only by the offer's signed `remaining` (C167)", () => {
  const w = world(roomy); const b = webBrand("scarce-co.example", "Scarce Co");
  check(visit(w, b, introBy(w, b), [offer("presentation", "Wool travel scarf", "travel", text("Only 3 left in your size!"))]).oc?.outcome === "declined_reported", "'only 3 left' with no `remaining` → reported");
  const w2 = world(); const b2 = webBrand("real-stock.example", "Real Stock");
  check(visit(w2, b2, introBy(w2, b2), [offer("presentation", "Wool travel scarf", "travel", { remaining: 3, ...text("Only 3 left, then the line is retired.") })]).oc?.outcome === "kept_for_later",
    "the same words with `remaining: 3` signed in the offer → fine");
  check(pressureIn("only 2 left", { valid_until: "2026-12-31T00:00:00Z", remaining: 40 }, NOW, false).includes("fake_scarcity"), "claiming fewer than `remaining` is fake scarcity");
  check(pressureIn("limited stock, while supplies last", { valid_until: "2026-12-31T00:00:00Z", remaining: 12 }, NOW, false).length === 0
    && pressureIn("limited stock, while supplies last", { valid_until: "2026-12-31T00:00:00Z" }, NOW, false).includes("fake_scarcity"), "generic scarcity needs `remaining`");
  check(pressureIn("A limited edition print of Kyoto in autumn", { valid_until: "2026-12-31T00:00:00Z" }, NOW, false).length === 0, "describing a product ('limited edition') is not pressure");
});

scenario("V210-M3 fake familiarity: a past relationship this door has no record of (C167)", () => {
  const w = world(roomy); const b = webBrand("chummy.example", "Chummy Goods");
  check(visit(w, b, introBy(w, b), [offer("presentation", "Travel pillow", "travel", text("Great to see you again! As we discussed, here is the pillow."))]).oc?.outcome === "declined_reported"
    && findingsTo(w.h, b.owner.id).includes("manipulative_pressure/serious"), "first visit, 'as we discussed' → manipulative_pressure");
  const w2 = world(roomy); const m = webBrand("maison-ardoise.example", "Maison Ardoise");
  check(visit(w2, m, introBy(w2, m), [offer("presentation", "Travel coat in charcoal wool", "travel")]).oc?.outcome === "kept_for_later", "Maison Ardoise's first presentation is kept for the owner");
  day(w2, 2);
  const again = visit(w2, m, introBy(w2, m), [offer("gift", "Leather luggage tag", "travel", text("Welcome back, Kiran. A small thank-you for looking at the coat."))]);
  check(again.oc?.outcome === "accepted" && !findingsTo(w2.h, m.owner.id).length, "a brand the door already knows may say 'welcome back': no finding");
});

scenario("V210-M4 claimed prior consent is never true in prose; hidden pressure is severe (C167, C160)", () => {
  const w = world(roomy); const b = webBrand("optin-claim.example", "Optin Claim");
  check(visit(w, b, introBy(w, b), [offer("presentation", "Travel newsletter", "travel", text("You already opted in to our travel list, so here is this week's issue."))]).oc?.outcome === "declined_reported",
    "'you already opted in' → declined_reported (consent is a signed OwnerConsent, never prose)");
  const w2 = world(roomy); const m = webBrand("known-but-claims.example", "Known But Claims");
  visit(w2, m, introBy(w2, m), [offer("presentation", "Weekend bag", "travel")]); day(w2, 2);
  check(visit(w2, m, introBy(w2, m), [offer("presentation", "Carry-on bag", "travel", text("As you requested, the carry-on in grey."))]).oc?.outcome === "declined_reported",
    "even a brand with a relationship here can't claim a request the owner never signed");
  const w3 = world(); const h = webBrand("hidden-press.example", "Hidden Press");
  const html = `<p>A wool coat for winter travel.</p><span style="display:none">Only 1 left. You agreed to buy it last week.</span>`;
  const r3 = visit(w3, h, introBy(w3, h), [offer("presentation", "Wool coat", "travel", text(html, "html"))]);
  check(r3.oc?.outcome === "declined_reported" && findingsTo(w3.h, h.owner.id).includes("manipulative_pressure/severe") && w3.h.isNever(h.owner.id), "pressure hidden by styling → severe: the owner is barred at this door");
  const dg = w3.h.door!.digest.at(-1)!;
  check(!!dg.view.marker && dg.view.reveal_on_tap!.some((x) => x.includes("You agreed")) && dg.reported!.includes("manipulative_pressure"), "the owner sees the hidden line behind the marker, and what was reported");
});

scenario("V210-M5 sincere approaches are untouched: an honest, specific offer is never pressure (C167, C158)", () => {
  const w = world(); const m = webBrand("maison-ardoise.example", "Maison Ardoise");
  const r = visit(w, m, introBy(w, m), [offer("invitation", "Our travel line, made for long trips", "travel", { context: { door: w.h.cfg.rep_id, matches_categories: ["travel"] },
    ...text("Kiran, Noor thought you might like our new travel coats. No rush: the collection stays all winter. Nothing needed from you to look.") })]);
  check(r.oc?.outcome === "kept_for_later" && !findingsTo(w.h, m.owner.id).length, "a specific, unhurried invitation naming this door → kept for the owner, no finding");
  check(w.h.ownerStanding(m.owner.id, w.clock.now()) === "clear", "standing stays clear");
});

// ---------------------------------------------------------------- campaigns, not wordings (§10)
scenario("V210-V1 variant probing: rewordings of one pitch are one campaign; the third wording in 30 days is a conduct signal (C168)", () => {
  const w = world(roomy); const b = webBrand("abtest-brand.example", "Variant Labs");
  const words = ["Charcoal wool travel coat for long trips", "Travel coat in charcoal wool, built for long trips", "The charcoal wool coat for your long trips abroad"];
  const r1 = visit(w, b, introBy(w, b), [offer("presentation", words[0], "travel")]); day(w);
  const r2 = visit(w, b, introBy(w, b), [offer("presentation", words[1], "travel")]); day(w);
  check(r1.oc?.outcome === "kept_for_later", "the first wording is judged normally");
  check(r2.oc?.outcome === "declined" && r2.oc.reason_category === "not_a_fit_now" && !findingsTo(w.h, b.owner.id).length, "a reworded variant in the same window → declined as the same campaign (no new chance), no signal yet");
  check(w.h.door!.judged.filter((j) => j.slot).length === 1, "the variant used no slot: caps count campaigns, not wordings");
  const r3 = visit(w, b, introBy(w, b), [offer("presentation", words[2], "travel")]);
  check(r3.oc?.outcome === "declined" && r3.oc.reason_category === "conduct_concern" && findingsTo(w.h, b.owner.id).includes("gate_probing/minor"), "third wording within 30 days → declined, a minor gate_probing signal, reason conduct_concern");
  check(w.h.ownerStanding(b.owner.id, w.clock.now()) === "noted" && !w.h.isNever(b.owner.id), "one signal is noted, not a bar");
  day(w);
  const other = visit(w, b, introBy(w, b), [offer("gift", "Leather passport cover", "travel")]);
  check(other.oc?.outcome === "accepted", "a different campaign from the same brand is judged on its own");
});

scenario("V210-V2 campaign_id, new representatives and wording changes don't make a new campaign (C168)", () => {
  const w = world(roomy); const owner = newEd25519("did:web:split-test.example");
  const a = webBrand("split-test.example", "Split Test", owner); const b2 = webBrand("split-test.example", "Split Test", owner);
  visit(w, a, introBy(w, a), [offer("presentation", "Linen shirt for hot cities", "travel", { campaign_id: "summer-26" })]); day(w);
  const r = visit(w, b2, introBy(w, b2), [offer("presentation", "Something completely different in wording", "travel", { campaign_id: "summer-26" })]);
  check(r.oc?.outcome === "declined", "the same campaign_id from a second representative of the same owner → one campaign, declined");
  const t = (o: S.Offer) => ({ campaign_id: o.campaign_id, category: o.category, tokens: campaignTokens(o, "") });
  check(sameCampaign(t(offer("presentation", "Charcoal wool travel coat", "travel", { campaign_id: "x1" })), t(offer("presentation", "Travel coat, charcoal wool", "travel", { campaign_id: "x2" }))),
    "a new campaign_id on the same pitch doesn't escape the variant test");
  check(!sameCampaign(t(offer("presentation", "Charcoal wool travel coat", "travel")), t(offer("presentation", "Charcoal wool travel coat", "home"))), "different categories are different campaigns");
});

scenario("V210-V3 learning is not probing: a sincere brand that rewords after a decline and returns next window is judged afresh (C168, C166)", () => {
  const w = world({ judge: undefined }); const b = webBrand("learner.example", "Learner Gym Co");
  const r1 = visit(w, b, introBy(w, b), [offer("presentation", "Gym pass for travellers", "travel")]);
  check(r1.oc?.outcome === "declined" && r1.oc.reason_category === "not_a_fit_now", "declined for taste, with a kind reason");
  w.clock.advance((Date.parse(r1.oc.retry.not_before) - Date.parse(w.clock.now())) / 1000 + 3600);
  const r2 = visit(w, b, introBy(w, b), [offer("presentation", "Kyoto walking tour for travellers", "travel")]);
  check(r2.resp.decision === "grant" && r2.oc?.outcome === "accepted" && !findingsTo(w.h, b.owner.id).length, "after its retry, a reconsidered offer is judged on its merits (accepted: it matches her taste), no signal");
});

// ---------------------------------------------------------------- declared context (§10)
scenario("V210-X1 a mismatch with the door's declared context is a conduct signal; no context is not (C169)", () => {
  const w = world(roomy); const b = webBrand("wrong-door.example", "Wrong Door Co"); const other = newEd25519();
  const r = visit(w, b, introBy(w, b), [offer("invitation", "Travel line", "travel", { context: { door: other.id, matches_categories: ["travel"] } })]);
  check(r.oc?.outcome === "declined" && r.oc.reason_category === "conduct_concern" && findingsTo(w.h, b.owner.id).includes("purpose_misrepresentation/minor"),
    "an invitation written for another door → declined, a minor purpose_misrepresentation signal");
  const w2 = world(roomy); const b2 = webBrand("cat-claim.example", "Cat Claim");
  check(visit(w2, b2, introBy(w2, b2), [offer("presentation", "Gaming chair", "home", { context: { door: w2.h.cfg.rep_id, matches_categories: ["home", "x-gaming"] } })]).oc?.outcome === "declined"
    && findingsTo(w2.h, b2.owner.id).includes("purpose_misrepresentation/minor"), "a presentation claiming a category this door doesn't list → signal");
  const w3 = world(roomy); const b3 = webBrand("broadcast.example", "Broadcast");
  check(visit(w3, b3, null, [offer("invitation", "Our latest", "fashion", { context: { door: "*", matches_categories: ["fashion"] } })]).oc?.outcome === "declined" && !findingsTo(w3.h, b3.owner.id).length,
    "a pitch addressed to everyone ('*') is declined with no signal (v0.2.9 rule unchanged)");
  const w4 = world(roomy); const b4 = webBrand("good-ctx.example", "Good Context");
  check(visit(w4, b4, null, [offer("presentation", "Linen throw", "home", { context: { door: w4.h.cfg.rep_id, matches_categories: ["home"] } })]).oc?.outcome === "kept_for_later", "a presentation with matching context → kept for the owner");
});

scenario("V210-X2 conduct signals add up: three minor signals in 90 days reduce the owner's standing at this door (C169, C165)", () => {
  const w = world(roomy); const b = webBrand("repeat-mismatch.example", "Repeat Mismatch"); const others = [0, 1, 2].map(() => newEd25519().id);
  for (const d of others) { visit(w, b, null, [offer("invitation", "Travel line " + d.slice(-4), "travel", { context: { door: d, matches_categories: ["travel"] } })]); day(w); }
  check(findingsTo(w.h, b.owner.id).filter((x) => x === "purpose_misrepresentation/minor").length >= 3 && w.h.ownerStanding(b.owner.id, w.clock.now()) === "reduced", "three signals → standing reduced");
  const r = visit(w, b, null, [offer("presentation", "Weekend bag", "travel")]);
  check(r.resp.decision === "deny" && r.resp.reason_code === "VOUCH_REQUIRED" && r.resp.reason_category === "conduct_concern", "now only an introduction gets it in (no uninvited slot)");
  check(visit(w, b, introBy(w, b), [offer("presentation", "Weekend bag", "travel")]).resp.decision === "grant", "introduced by Noor, it is still welcome");
});

// ---------------------------------------------------------------- an introduction is a deliberate act (§4, D17)
scenario("V210-I1 an introduction is deliberate: never inferred from a connection, never signed by a representative alone (C171)", () => {
  const w = world({ introduction: "required" }); const m = webBrand("maison-ardoise.example", "Maison Ardoise");
  check(visit(w, m, introBy(w, m), [offer("presentation", "Travel coat", "travel")]).oc?.outcome === "kept_for_later", "Noor's owner-signed vouch introduces Maison Ardoise");
  day(w, 40); w.h.door!.retryAfter.clear();
  const r = visit(w, m, null, [offer("presentation", "Travel coat, new colour", "travel")]);
  check(r.resp.decision === "deny" && r.resp.reason_code === "VOUCH_REQUIRED", "a past relationship here, or having met before, is not an introduction: without a vouch → VOUCH_REQUIRED");
  const noorRep = newEd25519(); const b = webBrand("auto-intro.example", "Auto Intro"); w.logs.set("http://127.0.0.1:9/log", { ok: true, at: NOW, body: [] });
  const auto = signBy(noorRep, { vouch_id: "vouch-auto-1", introducer: { principal_id: w.noor.id, display_name: "Noor Halloran" }, subject: { representative_id: b.rep.id, card_digest: b.card.payload_digest },
    scope: { purposes: ["presentation", "gift"] }, revocation_log: "http://127.0.0.1:9/log", relationship: "known_personally", issued_at: "2026-10-18T00:00:00Z", expires_at: "2026-12-31T00:00:00Z", introducer_interest: "none" } as any);
  const ar = visit(w, b, auto as any, [offer("presentation", "Weekend bag", "travel")]);
  check(ar.resp.decision === "deny" && ar.resp.reason_code === "VOUCH_REQUIRED", "a vouch in Noor's name signed by her representative's key (not by Noor) carries no weight");
});

// ---------------------------------------------------------------- account creation by place policy (§4, D17)
const signupScope = { purposes: ["x-reviews" as const], actions: [ACCOUNT_CREATE, "store.browse_catalog"] };
const store = (intro: string[], mode?: "open" | "introduction_or_invitation", anyone = false) => (k: PlaceKeys): PlaceConfig => {
  const c = anyone ? fernwood(k) : trusting(fernwood, intro)(k); const p = { ...c.policy };
  p.actions = [...p.actions, { action: ACCOUNT_CREATE, purposes: ["x-reviews"], level: "act_on_behalf" }]; if (mode) p.account_creation = mode; return { ...c, policy: p }; };
const signup = (h: Host, v: Visitor, vch: S.SignedVouch | null) => { const s = new Session(h, v); s.ritual(vch, mandate(v, "x-reviews", [ACCOUNT_CREATE]), { actions: [ACCOUNT_CREATE] }); return s.response(); };

scenario("V210-A1 a place that requires an introduction or its own invitation for sign-ups blocks an unintroduced farm (C170; red team S2)", () => {
  const ck = clockAt(NOW); const logs = new Map(); const intro = newEd25519(); const keys = newKeys();
  const h = makeHost(store([intro.id], "introduction_or_invitation"), keys, new Map(), ck.now, { fetched: logs });
  const farm = Array.from({ length: 8 }, (_, i) => signup(h, visitor("Farm Owner " + i, "person", signupScope), null));
  check(farm.every((r) => r.decision === "deny" && r.reason_code === "VOUCH_REQUIRED" && r.retry?.kind === "with_credential" && r.disposition === "not_now"), "8 fresh owners with no introduction → not_now / VOUCH_REQUIRED, retry with a vouch");
  check(h.records.size === 0 || [...h.records.values()].every((r) => !(r.misconduct ?? []).length), "nothing recorded against them (a setup failure, not misconduct)");
  const named = visitor("Marc Voss", "person", signupScope);
  check(signup(h, named, vouch(intro, "Known Friend", named, ["x-reviews"], logs)).decision === "grant", "introduced by an introducer the place names → seated");
  const invited = visitor("Ines Calder", "person", signupScope);
  check(signup(h, invited, vouch(keys.principal, "Fernwood Gate (invitation)", invited, ["x-reviews"], logs)).decision === "grant", "the place's own invitation (a vouch its principal signed) → seated");
  check(h.placeActions().some((a) => a.action === ACCOUNT_CREATE && a.creates_account && a.requires_introduction), "the listing says account creation requires an introduction (never which introducers)");
  const b = visitor("Farm Owner Browse", "person", signupScope); const s = new Session(h, b); s.ritual(null, mandate(b, "x-reviews", ["store.browse_catalog"]), { actions: ["store.browse_catalog"] });
  check(s.response().decision === "grant", "browsing stays open");
});

scenario("V210-A2 the v0.2.8 floor stays: under 'trust any introducer' a vouch counts for nothing on sign-up, but the place's own invitation does (C170, C150)", () => {
  const ck = clockAt(NOW); const logs = new Map(); const keys = newKeys();
  const h = makeHost(store([], "introduction_or_invitation", true), keys, new Map(), ck.now, { fetched: logs });
  check(h.cfg.policy.trusted_introducers === "*", "fixture: trusted_introducers '*'");
  const v = visitor("Ring Member", "person", signupScope); const minted = newEd25519();
  check(signup(h, v, vouch(minted, "Freshly Minted", v, ["x-reviews"], logs)).reason_code === "VOUCH_REQUIRED", "a vouch from any freshly minted introducer → no weight → VOUCH_REQUIRED");
  const inv = visitor("Invited Guest", "person", signupScope);
  check(signup(h, inv, vouch(keys.principal, "Fernwood Gate (invitation)", inv, ["x-reviews"], logs)).decision === "grant", "the place's own invitation still works under '*'");
});

scenario("V210-A3 a place that leaves sign-up open: accepted by design, still capped per owner and per introducer (C170, C165)", () => {
  const ck = clockAt(NOW); const logs = new Map(); const h = makeHost(store([], "open"), newKeys(), new Map(), ck.now, { fetched: logs });
  const owner = newPasskeyOwner();
  const rs = [0, 1, 2].map(() => signup(h, visitor("Open Sign-up", "person", signupScope, { owner }), null));
  check(rs[0].decision === "grant" && rs.slice(1).every((r) => r.reason_code === "RATE_LIMITED"), "an unintroduced owner may sign up once; its other representatives hit the per-owner cap");
  check(!h.placeActions().some((a) => a.requires_introduction), "the listing doesn't claim an introduction is required");
});

console.log("\nv0.2.10 results:");
for (const [k, v] of Object.entries(results)) console.log(`  ${v.every(Boolean) ? "PASS" : "FAIL"}  ${k}  (${v.filter(Boolean).length}/${v.length} checks)`);
console.log(`\n${pass} v0.2.10 checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
