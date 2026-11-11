// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests from the local Shōkai 0.5 conformance report (2026-11-08): regressions for its findings 1–3, and direct tests for MUSTs
// the suites only cited (C293, C294, C291, C275, C297; C297's door side closed in pass 2; C298, C300, C301 and C245's log fetch in pass 3). In process plus one 127.0.0.1 HTTP stand-in; fictional people only
// (Mira Tal, Pip, Aya Linden, Ines Ward). Keys are made in memory for this run.
//   finding 1 (§2.3, C3): a RepresentativeCard missing issued_at or expires_at, or with an unparseable one, is invalid, never non-expiring.
//   finding 2 (§7.3, C231): an over-limit raise whose expires_at equals the hold's gets the hold's grace, as an owner consent does.
//   finding 3 (§11.1): a 429/413/503 that isn't a ReplyEnvelope is read as the empty envelope it should have been, not thrown.
// A "GAP" line is a requirement this code does not meet yet: printed, counted apart, and never reported as a pass.
import http from "node:http";
import { createDoor, createRepresentative, developmentPasskey, generateRepresentativeKey, signCard, sign, digestOf, httpTransport, inProcess, possessionPayload, randomId, PROTOCOL, memoryStore, houseDigestFor, summaryDigestFor, type DoorOptions, type Door, type HostModelEstimate } from "../src/index.js";
import { entryUrl } from "../src/core/door.js";
import { LEGACY_TAG } from "../src/core/version.js";
import { isExpired, notYetValid } from "../src/core/crypto.js";
import * as V5 from "../src/core/v050.js";
import { logHeadOf, appendLog } from "../src/core/trust.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0; const gaps: string[] = [];
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const gap = (still: boolean, what: string) => { if (still) { gaps.push(what); console.log("  GAP  " + what); } else { pass++; console.log("  PASS (gap closed) " + what); } };
const USD = (value: string) => ({ value, currency: "USD" });
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
const ikey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
const code = (r: any) => !r ? "no answer" : [r.type, r.decision, r.disposition, r.reason_code].filter(Boolean).join(" / ");
const SUMMARY: S.HouseSummary = { name: "kettle", display_name: "Kettle & Leaf", purpose: { statement: "Buying tea.", locale: "en-US" },
  conduct_rules: [{ code: "no_payment_credentials", text: "Never send card numbers here.", locale: "en-US" }], spec_ref: { version: "0.5.0" } as S.SpecRef };
const kettle = (o: Partial<DoorOptions> = {}, policy: Record<string, unknown> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], approvedBy: { name: "Mira Tal", role: "Owner" }, purchaseHoldSeconds: 120,
  policy: { limit_calls: true, summary: SUMMARY, conduct_rules: SUMMARY.conduct_rules, ...policy } as any, ...o });
const ACTS = ["tea.browse", "tea.order"];
const SCOPE = { purposes: ["purchase", "visitation"] as S.PurposeCode[], actions: ACTS };

// ---------------------------------------------------------------------------------------------------------------- finding 1
async function finding1() {
  console.log("finding 1 (§2.3, C3): issued_at and expires_at are required on a RepresentativeCard; fail closed");
  const NOW = "2026-11-08T12:00:00Z";
  check(isExpired(undefined as any, NOW) && isExpired("not a time", NOW) && isExpired("", NOW), "isExpired: a missing, empty or unparseable expires_at reads as expired (never as no expiry)");
  check(notYetValid(undefined as any, NOW) && notYetValid("2026-13-45T99:00:00Z", NOW), "notYetValid: a missing or unparseable issued_at reads as not yet valid");
  check(!isExpired("2026-11-09T12:00:00Z", NOW) && !notYetValid("2026-11-08T11:00:00Z", NOW) && isExpired("2026-11-07T12:00:00Z", NOW), "well-formed times are judged as before (300 s skew kept)");
  const mira = developmentPasskey();
  const tweaked = (tweak: (p: any) => any) => { const key = generateRepresentativeKey();
    const base = signCard(key, mira, { displayName: "Mira Tal", ...SCOPE, validDays: 1, ownerPrompts: "purchase_only", shownToOwner: { text: "Pip may visit places for Mira.", locale: "en-US" } } as any);
    const p = tweak({ ...base.payload }); return { key, card: sign(p, mira, p.issued_at ?? iso(Date.now())) as S.SignedCard }; };
  const tryCard = async (label: string, tweak: (p: any) => any, door: Door) => {
    const { key, card } = tweaked(tweak);
    const pip = createRepresentative({ ownerName: "Mira Tal", owner: mira, key, card, ...SCOPE } as any);
    const v = await pip.visit(door, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("10.00") } }); (v as any).checkMandateLocally = false;
    return { label, v };
  };
  for (const [mode, door] of [["real", createDoor(kettle())], ["test profile", createDoor(kettle({ testProfile: true }))]] as const) {
    const ok = await tryCard("control", (p) => p, door);
    check(ok.v.seated, `${mode}: control card (both times present) is seated (${code(ok.v.response)})`);
    for (const [label, tweak] of [["no expires_at", (p: any) => { delete p.expires_at; return p; }], ["no issued_at", (p: any) => { delete p.issued_at; return p; }],
      ["expires_at not a time", (p: any) => ({ ...p, expires_at: "never" })], ["issued_at null", (p: any) => ({ ...p, issued_at: null })]] as const) {
      const r = await tryCard(label, tweak, door);
      const d = r.v.response as any;
      check(!r.v.seated && !!d && d.decision === "deny", `${mode}: a card with ${label} is refused, no seat (${code(d)})`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- finding 2
async function finding2() {
  console.log("finding 2 (§7.3, C231): an over-limit raise whose expires_at equals the hold's gets the hold's grace");
  const run = async (who: string, offsetMs: number, policy: Record<string, unknown> = {}) => {
    const shop = createDoor(kettle({}, policy));
    const rep = createRepresentative({ ownerName: who, purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
    const m = rep.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
    const v = await rep.visit(shop, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: m });
    const out = await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: "tea.order", arguments: { amount: USD("40.00"), payment_ref: "g-40" }, hold_for_owner: true, idempotency_key: ikey() }));
    const held = out.find((x: any) => x.type === "act_held") as S.ActHeld;
    const raised = rep.supersedingMandate(m, held as any, "Kettle & Leaf: one purchase of USD 40.00, approve.");
    const at = iso(Date.parse(held.expires_at) + offsetMs);
    const prev = shop.host.clock; shop.host.clock = () => at;
    const conf = await v.send(v.message("act_confirmation", { seat_id: v.seat!.seat_id, hold_id: held.hold_id, mandate: raised, idempotency_key: ikey() }));
    shop.host.clock = prev;
    return { held, raised, conf, shop };
  };
  const a = await run("Aya Linden", 2000);
  check((a.raised.payload as any).expires_at === a.held.expires_at, "setup: the raise's own expires_at equals the hold's");
  const rel = a.conf.find((x: any) => x.type === "act_result") as any;
  check(rel?.ok === true, `a raise delivered 2 s after the hold's expires_at (inside the default 5 s grace) releases the act (${code(a.conf[0])})`);
  const b = await run("Noor Achterberg", 7000);
  check(b.conf.some((x: any) => x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"), "7 s after (past the grace): HOLD_LAPSED, nothing released");
  const c = await run("Tomas Reed", 2000, { hold_grace_s: 0 });
  check(c.conf.some((x: any) => x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"), "a door that states hold_grace_s 0: 2 s after is HOLD_LAPSED (the stated grace is used)");
  const d = await run("Lena Moss", 4000, { hold_grace_s: 3 });
  check(d.conf.some((x: any) => x.type === "act_decision" && x.reason_code === "HOLD_LAPSED"), "a door that states hold_grace_s 3: 4 s after is HOLD_LAPSED");
  const e = await run("Kai Okada", -1000);
  check(e.conf.some((x: any) => x.type === "act_result" && x.ok === true), "before expires_at: released as before");
  check(V5.consentClock("2026-11-08T12:00:02Z", "2026-11-08T12:00:00Z", "2026-11-08T12:00:00Z", 5) === "2026-11-08T12:00:00Z"
    && V5.consentClock("2026-11-08T12:00:02Z", "2026-11-08T11:59:00Z", "2026-11-08T12:00:00Z", 5) === "2026-11-08T12:00:02Z",
    "one clock: only a credential whose expires_at equals the hold's is judged at the hold's end; an earlier one is not stretched");
  // Under shokai/0.3 there is no over-limit raise (a superseding mandate is v0.5.0 only) and a 0.3 hold carries grace 0.
  check(V5.holdLapsed("2026-11-08T12:00:01Z", "2026-11-08T12:00:00Z", 0), "shokai/0.3 holds: grace 0, one second late is lapsed");
}

// ---------------------------------------------------------------------------------------------------------------- finding 3
async function finding3() {
  console.log("finding 3 (§11.1): the visitor's HTTP transport reads a non-envelope 429/413/503 as an empty ReplyEnvelope");
  const srv = http.createServer((req, res) => {
    const st = Number((req.url ?? "/").split("/")[1]) || 500;
    const body = req.url?.endsWith("/text") ? "slow down" : JSON.stringify({ error: "rate limited" });
    res.writeHead(st, { "content-type": req.url?.endsWith("/text") ? "text/plain" : "application/json", ...(st === 429 ? { "retry-after": "60" } : {}) }); res.end(body);
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as any).port; const u = (p: string) => `http://127.0.0.1:${port}/${p}`;
  try {
    const r429 = await httpTransport(u("429"), {}) as any;
    check(Array.isArray(r429.messages) && r429.messages.length === 0 && r429.http_status === 429 && r429.retry_after === "60" && r429.protocol === PROTOCOL, "429 with {error}: an empty envelope, status 429, Retry-After 60 kept");
    const t429 = await httpTransport(u("429/text"), {}) as any;
    check(t429.messages.length === 0 && t429.http_status === 429, "429 with a text body: an empty envelope too");
    for (const st of [413, 503]) { const r = await httpTransport(u(String(st)), {}) as any; check(r.messages.length === 0 && r.http_status === st, `${st} without an envelope: empty envelope`); }
    let threw = ""; try { await httpTransport(u("500"), {}); } catch (e: any) { threw = String(e?.message ?? e); }
    check(threw.includes("without a ReplyEnvelope"), "any other status without an envelope still throws (nothing assumed)");
    let threw200 = ""; try { await httpTransport(u("200"), {}); } catch (e: any) { threw200 = String(e?.message ?? e); }
    check(threw200.includes("without a ReplyEnvelope"), "a 200 without an envelope still throws");
  } finally { srv.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- C294
async function c294() {
  console.log("C294 (§2.3, §2.4 step 3, C210/C211): a card carrying a credential or payment instrument is invalid; so is such a mandate");
  const mira = developmentPasskey(); const door = createDoor(kettle());
  for (const [member, val] of [["password", "hunter2"], ["card_number", "4111111111111111"], ["one_time_code", "123456"], ["account_number", "000123"], ["payment_token", "tok_x"], ["Session-Cookie", "s=1"]] as const) {
    const key = generateRepresentativeKey();
    const base = signCard(key, mira, { displayName: "Mira Tal", ...SCOPE, validDays: 1, ownerPrompts: "purchase_only", shownToOwner: { text: "Pip may visit places for Mira.", locale: "en-US" } } as any);
    const p: any = { ...base.payload, principal: { ...base.payload.principal, [member]: val } };
    const card = sign(p, mira, p.issued_at) as S.SignedCard;
    const pip = createRepresentative({ ownerName: "Mira Tal", owner: mira, key, card, ...SCOPE } as any);
    const v = await pip.visit(door, { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("10.00") } });
    check(!v.seated && (v.response as any)?.decision === "deny", `a card (signed by its owner) carrying ${member} is refused as invalid (${code(v.response)})`);
  }
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
  const m = aya.mandate({ purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") } });
  for (const member of ["payment_token", "card_number"]) {
    const p: any = { ...m.payload, limits: { ...m.payload.limits, [member]: "x-123" } };
    const bad = sign(p, (aya as any).owner, p.issued_at) as any;
    const v = await aya.visit(createDoor(kettle()), { purpose: "purchase", actions: ACTS, limits: { max_amount: USD("30.00") }, useMandate: bad });
    check(!v.seated && ["MANDATE_INVALID", "REQUEST_INCOMPLETE"].includes((v.response as any)?.reason_code ?? "") , `a mandate (signed by the owner) carrying ${member} is refused (${code(v.response)})`);
  }
}

// ---------------------------------------------------------------------------------------------------------------- C293
async function c293() {
  console.log("C293 (§6.11): the host budget meters by the owner's prices, fetches nothing while running, and calls no unpriced model");
  const TZ = "America/Los_Angeles";
  const BUDGET: S.HostBudget = { mode: "metered", time_zone: TZ, per_visit: { usd: "0.020" }, daily: { usd: "0.050" }, monthly: { usd: "1.00" }, alert_at: 0.8,
    prices: { "stand-in-host": { input_per_mtok: "1.00", output_per_mtok: "4.00" } }, newcomer_share: 1 };
  const now = new Date("2026-11-03T18:00:00Z");
  const door = createDoor({ approvedBy: { name: "Pia Holm", role: "Owner" }, name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store",
    purposes: [{ code: "inquiry", statement: "Asking about today's teas." }],
    actions: [{ action: "menu.view", purposes: ["inquiry"], level: "discover", data_asks: [] }, { action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
    testProfile: true, hostBudgetClock: () => now, policy: { host_budget: BUDGET } } as any);
  const ines = createRepresentative({ ownerName: "Ines Ward", purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] });
  const v = await ines.visit(door, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } } as any);
  check(!!v.seat, "setup: Ines is seated");
  let calls = 0; const model = async (e: HostModelEstimate) => { calls++; return { value: "Ember Persimmon is in season.", usage: { input_tokens: e.input_tokens, output_tokens: e.max_output_tokens } }; };
  const realFetch = globalThis.fetch; let fetches = 0;
  (globalThis as any).fetch = async (...a: any[]) => { fetches++; return realFetch(...(a as [any])); };
  try {
    const outs: string[] = [];
    for (let i = 0; i < 3; i++) { const r: any = await door.hostTurn(v.seat!.seat_id, { model: "stand-in-host", input_tokens: 2000, max_output_tokens: 500 }, model); outs.push(r.ok ? "ok" : r.scope); }
    check(outs.join(",") === "ok,ok,ok" && calls === 3, `three priced calls made and metered (${outs.join(",")})`);
    check(fetches === 0, `the door fetched nothing while metering (fetch calls: ${fetches}): MUST NOT fetch prices while it runs`);
    const before = calls;
    const r: any = await door.hostTurn(v.seat!.seat_id, { model: "unpriced-model", input_tokens: 10, max_output_tokens: 10 }, model);
    check(!r.ok && calls === before, `under a usd ceiling a model the owner gave no price for is not called (${r.ok ? "called" : r.scope ?? r.reason ?? "refused"})`);
    check(fetches === 0, "… and still nothing fetched");
  } finally { (globalThis as any).fetch = realFetch; }
}

// ---------------------------------------------------------------------------------------------------------------- C291 / C297 / C275
async function versionAndProvisional() {
  console.log("C297 (H1(d)): a place refuses a shokai/0.3 invitation_request whose mandate carries min_protocol above 0.3 (version-mismatch lobby, C102)");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
  const m = aya.mandate({ purpose: "purchase", actions: ACTS });
  const p: any = { ...m.payload, min_protocol: "shokai/0.5", crit: [...((m.payload as any).crit ?? []), "min_protocol"] };
  const pinned = sign(p, (aya as any).owner, p.issued_at) as any;
  const door = createDoor(kettle());
  let v: any, err = "";
  try { v = await aya.visit(door, { purpose: "visitation", actions: ["tea.browse"], useMandate: pinned, wireTag: LEGACY_TAG } as any); } catch (e: any) { err = String(e?.code ?? e?.message ?? e); }
  const lobby = v && (v.transcript ?? []).map((t: any) => t.message?.payload ?? t.message).find((x: any) => x?.type === "lobby" || x?.reason_code === "VERSION_MISMATCH" || x?.lobby_kind === "version_mismatch");
  const r = v?.response;
  check(!v?.seated, `not seated under shokai/0.3 with a mandate pinned to min_protocol shokai/0.5 (${err || code(r)})`);
  check(err === "SHOKAI_NO_DOWNGRADE" || !!lobby, `the visiting representative will not send it (H1(c), C298): ${err || code(r)}`);
  // Door side (H1(d)), conformance pass 2. This SDK's visitor never sends it (it refuses above, and a door whose Shōkai host card says
  // shokai/0.5 also stops it, C254), so the ritual is posted raw through the SDK door's own HTTP entry point (door.post), signed by
  // Aya's representative key: greeting, card, introduction, then the shokai/0.3 invitation_request carrying the pinned mandate.
  const raw03 = async (mand: S.SignedMandate, tag: string = LEGACY_TAG) => {
    const d = createDoor(kettle()); await (d as any).ready; const rep = (aya as any).key; const card = (aya as any).card as S.SignedCard;
    const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
    const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: tag, encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: card.payload.representative_id, to: d.repId, type, ...body } as any, rep, at());
    const post = async (m: unknown) => ((await d.post(m)).envelope.messages ?? []).map((x: any) => x?.payload ?? x);
    const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }));
    const hostNonce = g.find((x: any) => x.type === "greeting")?.nonce;
    const aud = tag === PROTOCOL ? d.repId : undefined;
    const proof = sign(possessionPayload(enc, hostNonce, aud), rep, at()).signatures[0];
    await post(msg("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id, ...(aud ? { audience: aud } : {}) } }));
    await post(msg("introduction", { vouch: null }));
    const out = await post(msg("invitation_request", { card_digest: card.payload_digest, mandate: mand,
      proposal: { request: { actions: ["tea.browse"] }, value_to_counterparty: { text: "Just looking.", locale: "en-US" }, etiquette_register: "first_meeting" } }));
    return { enc, out };
  };
  const plainM = aya.mandate({ purpose: "visitation", actions: ["tea.browse"] });
  const pinnedV: any = (() => { const q: any = { ...plainM.payload, mandate_id: randomId("mand"), min_protocol: "shokai/0.5", crit: [...((plainM.payload as any).crit ?? []), "min_protocol"] }; return sign(q, (aya as any).owner, q.issued_at ?? iso(Date.now())); })();
  const ctl = await raw03(plainM);
  const ctlResp = ctl.out.find((x: any) => x.type === "invitation_response" && x.encounter_id === ctl.enc);
  check(ctlResp?.decision === "grant", `C297 control: the same raw shokai/0.3 ritual with a mandate without min_protocol is granted at the SDK door (${code(ctlResp)})`);
  const hit = await raw03(pinnedV);
  const brief = hit.out.find((x: any) => x.type === "lobby_briefing");
  check(!!brief && brief.spec_ref?.version === "0.5.0" && hit.out.every((x: any) => x.encounter_id !== hit.enc),
    `C297 (H1(d)): the SDK door answers a shokai/0.3 invitation_request whose mandate carries min_protocol shokai/0.5 with the version-mismatch lobby (C102: a fresh lobby encounter, spec_ref 0.5.0), nothing in the visitor's encounter (${hit.out.map((x: any) => x.type).join(",")})`);
  check(!hit.out.some((x: any) => x.type === "invitation_response" && x.encounter_id === hit.enc && x.decision === "grant"), "C297: nothing is granted under it");
  const at05 = await raw03(pinnedV, PROTOCOL);
  const r05 = at05.out.find((x: any) => x.type === "invitation_response" && x.encounter_id === at05.enc);
  check(r05?.decision === "grant", `C297/C289: under shokai/0.5 the SDK door reads min_protocol listed in crit and seats as usual, never UNSUPPORTED_CRITICAL (${code(r05)})`);
  // Visitor side (H1(c), C298). Measured as a GAP in pass 2; fixed in pass 3 (YSY go, 2026-11-09). With no listing to compare (a bare
  // target), §11.1 "Choosing a tag" says a v0.5.0 visitor MUST start with shokai/0.5; H1(c) says that with min_protocol set it MUST NOT
  // speak shokai/0.3. So a caller's wireTag shokai/0.3 is overridden by the owner's floor: the visit speaks shokai/0.5.
  const tapVisit = async (extra: Record<string, unknown>, target?: (d: Door) => any) => {
    const d3 = createDoor(kettle()); const seen: any[] = [];
    const tap = Object.assign(async (u: string, b: unknown) => { seen.push((b as any)?.payload ?? b); return inProcess(d3)(u, b); }, { getJson: (inProcess(d3) as any).getJson });
    const bare = target ? target(d3) : { entry: d3.entry, representative_id: d3.repId, principal_id: d3.principalId, display_name: "Kettle & Leaf", actions: (d3.listing().places[0] as any).actions };
    let e3 = "", v3: any; try { v3 = await aya.visit(bare as any, { purpose: "visitation", actions: ["tea.browse"], transport: tap, ...extra } as any); } catch (e: any) { e3 = String(e?.code ?? e?.message ?? e); }
    return { seen, e3, v3 };
  };
  for (const [label, extra] of [["the mandate's own min_protocol", { useMandate: pinnedV }], ["ask.minProtocol", { minProtocol: "shokai/0.5" }]] as const) {
    const { seen, e3, v3 } = await tapVisit({ wireTag: LEGACY_TAG, ...extra });
    check(seen.length > 0 && !seen.some((m: any) => m?.protocol === LEGACY_TAG) && seen.every((m: any) => m?.protocol === PROTOCOL) && v3?.tag === PROTOCOL,
      `C298 (H1(c), visitor side): with ${label} set to shokai/0.5, a visit to a bare target (no listing to compare) with wireTag shokai/0.3 sends nothing under shokai/0.3; it speaks shokai/0.5 (§11.1 "Choosing a tag") (${e3 || seen.map((m: any) => m?.type + "@" + m?.protocol).join(",")})`);
    check(!!v3?.seated, `C298: … and that shokai/0.5 visit is seated as usual (${e3 || code(v3?.response)})`);
  }
  const ctl03 = await tapVisit({ wireTag: LEGACY_TAG });
  check(ctl03.seen.length > 0 && ctl03.seen.every((m: any) => m?.protocol === LEGACY_TAG), "C298 control: with no floor, a bare target with wireTag shokai/0.3 still gets the caller's shokai/0.3");
  const old04 = (d: Door) => ({ entry: d.entry, representative_id: d.repId, principal_id: d.principalId, display_name: "Kettle & Leaf", spec_ref: { version: "0.4.0", url: "u" } });
  const oldM = await tapVisit({ useMandate: pinnedV }, old04);
  check(oldM.e3 === "SHOKAI_NO_FALLBACK" && oldM.seen.length === 0, `C298: the mandate's own min_protocol (not only ask.minProtocol) stops the fallback to a listing below 0.5.0, before anything is sent (${oldM.e3 || "sent " + oldM.seen.length})`);
  const hi = await tapVisit({ wireTag: LEGACY_TAG, minProtocol: "shokai/0.6" });
  check(hi.e3 === "SHOKAI_NO_FALLBACK" && hi.seen.length === 0, `C298: a floor this representative can't meet (shokai/0.6 > shokai/0.5) ends the visit before anything is sent (${hi.e3 || "sent " + hi.seen.length})`);
  const badAsk = await tapVisit({ minProtocol: "0.5" });
  check(badAsk.e3 === "SHOKAI_BAD_TAG" && badAsk.seen.length === 0, `C298/C300: a malformed floor ("0.5") is never ignored: the visit ends before anything is sent (${badAsk.e3 || "sent " + badAsk.seen.length})`);
  const badMand: any = (() => { const q: any = { ...plainM.payload, mandate_id: randomId("mand"), min_protocol: "0.5" }; return sign(q, (aya as any).owner, q.issued_at ?? iso(Date.now())); })();
  const badOwn = await tapVisit({ useMandate: badMand });
  check(badOwn.e3 === "SHOKAI_BAD_TAG" && badOwn.seen.length === 0, `C298/C300: a mandate whose own min_protocol is malformed is never presented: the visit ends before anything is sent (${badOwn.e3 || "sent " + badOwn.seen.length})`);
  // Door side H1(e) (C300) and H1(f) (C301), pass 3, through the SDK door's own entry point (raw signed posts).
  for (const tag of [LEGACY_TAG, PROTOCOL]) {
    const mal: any = (() => { const q: any = { ...plainM.payload, mandate_id: randomId("mand"), min_protocol: "0.5", crit: [...((plainM.payload as any).crit ?? []), "min_protocol"] }; return sign(q, (aya as any).owner, q.issued_at ?? iso(Date.now())); })();
    const r = await raw03(mal, tag); const rr = r.out.find((x: any) => x.type === "invitation_response" && x.encounter_id === r.enc);
    check(rr?.decision === "deny" && rr.disposition === "not_now" && rr.reason_code === "MANDATE_INVALID" && JSON.stringify(rr.retry?.credentials) === '["signed_mandate"]',
      `C300 (H1(e)): under ${tag}, the SDK door refuses a mandate whose min_protocol is "0.5" (not a protocol identifier) as an invalid mandate: deny / not_now / MANDATE_INVALID, retry with_credential [signed_mandate] (${code(rr)})`);
  }
  const p06: any = (() => { const q: any = { ...plainM.payload, mandate_id: randomId("mand"), min_protocol: "shokai/0.6", crit: [...((plainM.payload as any).crit ?? []), "min_protocol"] }; return sign(q, (aya as any).owner, q.issued_at ?? iso(Date.now())); })();
  const hi05 = await raw03(p06, PROTOCOL); const brief05 = hi05.out.find((x: any) => x.type === "lobby_briefing");
  const visitorIr05 = hi05.out.filter((x: any) => x.type === "invitation_response" && x.encounter_id === hi05.enc);
  check(!!brief05 && brief05.spec_ref?.version === "0.5.0" && visitorIr05.length === 0 && hi05.out.every((x: any) => x.encounter_id !== hi05.enc),
    `C301 (H1(f)): under shokai/0.5, the SDK door answers a request whose mandate carries min_protocol shokai/0.6 with the version-mismatch lobby only (C102), no invitation_response in the visitor's encounter (${hi05.out.map((x: any) => x.type).join(",")})`);
  // The shared core reads min_protocol (generated from reference/engawa/src; the engawa v050 suite tests 0.5, 0.10, 1, 0.3 and none).
  check(V5.minProtocolAbove03({ min_protocol: "shokai/0.5" }) && V5.minProtocolAbove03({ min_protocol: "shokai/0.10" }) && !V5.minProtocolAbove03({ min_protocol: "shokai/0.3" }),
    "C297/C299: the SDK core compares min_protocol numerically against shokai/0.3");

  console.log("C291 (§0.1): an unclaimed provisional extension's members are read as unknown members (ignored unless in crit, C289)");
  const v2 = await aya.visit(createDoor(kettle()), { purpose: "visitation", actions: ["tea.browse"] } as any);
  check(v2.seated, "setup: seated");
  const plain = await v2.send(v2.message("act", { seat_id: v2.seat!.seat_id, tool: "tea.browse", arguments: {}, x_unclaimed_provisional: { note: "ignored" } } as any));
  check(plain.some((x: any) => x.type === "act_result" && x.ok === true), `an act carrying an unknown provisional member goes on as if it weren't there (${code(plain[0])})`);
  const crit = await v2.send(v2.message("act", { seat_id: v2.seat!.seat_id, tool: "tea.browse", arguments: {}, x_unclaimed_provisional: { note: "must understand" }, crit: ["x_unclaimed_provisional"] } as any));
  check(!crit.some((x: any) => x.type === "act_result" && x.ok === true), `the same member named in crit is not acted on (${code(crit[0])})`);
}

// ---------------------------------------------------------------------------------------------------------------- C296 (pass 2)
async function c296() {
  console.log("C296 (§4.1, pass 2): at the SDK door over 127.0.0.1 HTTP, failed claims count per source address and add a growing backoff (2 s default)");
  const SRC = "203.0.113.7", OTHER = "198.51.100.9";
  const door = createDoor(kettle({ anonRateAddressHeader: "x-forwarded-for" } as any)); await (door as any).ready;
  const host: any = (door as any).host;
  check(host.opts.claimBackoff?.baseS === 2 && host.opts.claimBackoff?.maxS === 3600 && host.opts.claimFailCapPerCard === 10,
    `the SDK door sets the spec defaults: backoff 2 s doubling up to 3600 s, cap 10 per card (${JSON.stringify(host.opts.claimBackoff)}, ${host.opts.claimFailCapPerCard})`);
  const srv = http.createServer(async (req, res) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as any).port; const entryPath = new URL(door.entry).pathname;
  try {
    const guild = generateRepresentativeKey(); const iid = randomId("intro");
    const codes = Array.from({ length: 4 }, () => ({ code: Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url"), salt: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url") }));
    const now0 = Date.now();
    const icard = sign({ introduction_id: iid, protocol: PROTOCOL, kind: "introduction", introducer: { principal_id: guild.id, display_name: "Cedar Row Guild" },
      place: { principal_id: door.principalId }, scope: { purposes: ["visitation", "purchase"] }, relationship: "member_of", introducer_interest: { kind: "none" }, max_claims: codes.length,
      claim_digests: codes.map((c) => V5.claimDigestOf(iid, c.code, c.salt)), revocation_log: "https://guild.example/shokai/revocations/cedar-row",
      issued_at: iso(now0 - 3600e3), expires_at: iso(now0 + 30 * 86400e3), shown_to_owner: { text: `Kettle & Leaf, ${codes.length} claims, 30 days. ` + V5.LENDING_LINE, locale: "en-US" } } as any, guild, iso(now0)) as any;
    const post = async (m: unknown, src: string) => {
      const r = await fetch(`http://127.0.0.1:${port}${entryPath}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": src }, body: JSON.stringify(m) });
      const env: any = await r.json(); return (env.messages ?? []).map((x: any) => x?.payload ?? x);
    };
    const claimFrom = async (name: string, i: number, src: string, wrong = false) => {
      const who = createRepresentative({ ownerName: name, purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
      const rep = (who as any).key; const card = (who as any).card as S.SignedCard; const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
      const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: PROTOCOL, encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: card.payload.representative_id, to: door.repId, type, ...body } as any, rep, at());
      const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }), src);
      const proof = sign(possessionPayload(enc, g.find((x: any) => x.type === "greeting")?.nonce, door.repId), rep, at()).signatures[0];
      const cp = await post(msg("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id, audience: door.repId } }), src);
      const challenge = cp.find((x: any) => x.type === "card_receipt")?.claim_challenge?.challenge;
      const claim = sign({ introduction_id: iid, introduction_digest: icard.payload_digest, code: wrong ? Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url") : codes[i].code, salt: codes[i].salt,
        holder: { principal_id: card.payload.principal.principal_id, card_digest: card.payload_digest }, challenge } as any, rep, at()) as any;
      await post(msg("introduction", { vouch: null, introduction_card: { card: icard, claim } }), src);
      const m = who.mandate({ purpose: "visitation", actions: ["tea.browse"] });
      const out = await post(msg("invitation_request", { card_digest: card.payload_digest, mandate: m, introduction_card_digest: icard.payload_digest, introduction_claim_digest: claim.payload_digest,
        proposal: { request: { actions: ["tea.browse"] }, value_to_counterparty: { text: "Looking around.", locale: "en-US" }, etiquette_register: "first_meeting" } }), src);
      return { challenge, resp: out.find((x: any) => x.type === "invitation_response" && x.encounter_id === enc) };
    };
    const g1 = await claimFrom("Guesser One", 0, SRC, true);
    check(typeof g1.challenge === "string", "setup: the SDK door's card_receipt carries a claim_challenge (C272)");
    check(host.claimFailuresFromSource(SRC) === 1 && host.claimFailuresFromSource(OTHER) === 0,
      `R-4.1-9: the failed claim is counted against its source address, taken from the request (x-forwarded-for, the door's configured client-address header) (${host.claimFailuresFromSource(SRC)} / ${host.claimFailuresFromSource(OTHER)})`);
    const p2 = await claimFrom("Fresh Two", 1, SRC);
    const r2: any = p2.resp;
    check(r2?.decision === "deny" && r2.disposition === "not_now" && r2.reason_code === "RATE_LIMITED" && r2.retry?.kind === "after" && Date.parse(r2.retry.not_before) - Date.now() <= 2000,
      `R-4.1-12/13: a fresh principal's VALID claim from that source within 2 s is refused unchecked: not_now / RATE_LIMITED, retry after the backoff (${code(r2)} ${r2?.retry?.not_before ?? ""})`);
    const p3 = await claimFrom("Fresh Three", 2, OTHER);
    check((p3.resp as any)?.reason_code !== "RATE_LIMITED" && (p3.resp as any)?.decision === "grant", `per source: the same moment, a valid claim from another address isn't in that backoff (${code(p3.resp)})`);
    check(host.claimFailuresFromSource(SRC) === 1, "the refused-unchecked claim is not counted as another failure");
  } finally { srv.close(); }
}

// C296 across two instances that share one store (the hosted door's Upstash path: load liveState, answer, save).
async function c296SharedStore() {
  console.log("C296 (§4.1): failed-claim backoff survives a second instance that only sees the shared store");
  const SRC = "203.0.113.21", OTHER = "198.51.100.21";
  const BASE = "https://kettle.example/shokai";
  const shared = memoryStore();
  const mika = developmentPasskey(); const repKey = generateRepresentativeKey();
  const baseOpts = kettle({ baseUrl: BASE, testProfile: true, anonRateAddressHeader: "x-forwarded-for" } as any);
  const hd = houseDigestFor(baseOpts, mika.id, BASE);
  const hostCard = signCard(repKey, mika, { displayName: "Kettle & Leaf", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"], cardKind: "host",
    host: { place: { principal_id: mika.id, entry: entryUrl(BASE, "kettle") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes", "hold_purchases"] }, house_digest: hd, summary_digest: summaryDigestFor(baseOpts, BASE) },
    shownToOwner: { text: "My representative may welcome visitors at Kettle & Leaf.", locale: "en-US" } } as any);
  const instance = async () => { const d = createDoor(kettle({ baseUrl: BASE, testProfile: true, anonRateAddressHeader: "x-forwarded-for", card: hostCard, keys: { rep: repKey }, store: shared, hostOpts: { seatsPerCard: 8 } } as any)); await (d as any).ready; return d; };
  const door1 = await instance(); const door2 = await instance();
  const listen = async (door: Door) => {
    const srv = http.createServer(async (req, res) => { if (!(await door.handleHttp(req, res))) { res.writeHead(404); res.end(); } });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    return { srv, port: (srv.address() as any).port, path: new URL(door.entry).pathname };
  };
  const a = await listen(door1); const b = await listen(door2);
  try {
    const guild = generateRepresentativeKey(); const iid = randomId("intro");
    const codes = Array.from({ length: 3 }, () => ({ code: Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url"), salt: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url") }));
    const now0 = Date.now();
    const icard = sign({ introduction_id: iid, protocol: PROTOCOL, kind: "introduction", introducer: { principal_id: guild.id, display_name: "Cedar Row Guild" },
      place: { principal_id: door1.principalId }, scope: { purposes: ["visitation", "purchase"] }, relationship: "member_of", introducer_interest: { kind: "none" }, max_claims: codes.length,
      claim_digests: codes.map((c) => V5.claimDigestOf(iid, c.code, c.salt)), revocation_log: "https://guild.example/shokai/revocations/cedar-row",
      issued_at: iso(now0 - 3600e3), expires_at: iso(now0 + 30 * 86400e3), shown_to_owner: { text: `Kettle & Leaf, ${codes.length} claims, 30 days. ` + V5.LENDING_LINE, locale: "en-US" } } as any, guild, iso(now0)) as any;
    const post = async (port: number, path: string, m: unknown, src: string) => {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": src }, body: JSON.stringify(m) });
      const env: any = await r.json(); return (env.messages ?? []).map((x: any) => x?.payload ?? x);
    };
    const claimFrom = async (doorHttp: { port: number; path: string }, door: Door, name: string, i: number, src: string, wrong = false) => {
      const who = createRepresentative({ ownerName: name, purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
      const rk = (who as any).key; const card = (who as any).card as S.SignedCard; const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
      const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: PROTOCOL, encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: card.payload.representative_id, to: door.repId, type, ...body } as any, rk, at());
      const g = await post(doorHttp.port, doorHttp.path, msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }), src);
      const proof = sign(possessionPayload(enc, g.find((x: any) => x.type === "greeting")?.nonce, door.repId), rk, at()).signatures[0];
      const cp = await post(doorHttp.port, doorHttp.path, msg("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id, audience: door.repId } }), src);
      const challenge = cp.find((x: any) => x.type === "card_receipt")?.claim_challenge?.challenge;
      const claim = sign({ introduction_id: iid, introduction_digest: icard.payload_digest, code: wrong ? Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url") : codes[i].code, salt: codes[i].salt,
        holder: { principal_id: card.payload.principal.principal_id, card_digest: card.payload_digest }, challenge } as any, rk, at()) as any;
      await post(doorHttp.port, doorHttp.path, msg("introduction", { vouch: null, introduction_card: { card: icard, claim } }), src);
      const m = who.mandate({ purpose: "visitation", actions: ["tea.browse"] });
      const out = await post(doorHttp.port, doorHttp.path, msg("invitation_request", { card_digest: card.payload_digest, mandate: m, introduction_card_digest: icard.payload_digest, introduction_claim_digest: claim.payload_digest,
        proposal: { request: { actions: ["tea.browse"] }, value_to_counterparty: { text: "Looking around.", locale: "en-US" }, etiquette_register: "first_meeting" } }), src);
      return { challenge, resp: out.find((x: any) => x.type === "invitation_response" && x.encounter_id === enc) };
    };
    const g1 = await claimFrom(a, door1, "Guesser One", 0, SRC, true);
    check(typeof g1.challenge === "string", "shared-store setup: instance 1 issues a claim_challenge");
    check((door1 as any).host.claimFailuresFromSource(SRC) === 1, "instance 1 counted the failed claim against the source");
    const snap = (door1 as any).host.liveState() as any;
    const by = snap?.v050?.claim_fails_by;
    const stored = !!(by && (by.$map || (typeof by === "object")));
    check(stored, "instance 1's liveState carries claim_fails_by (so Upstash would see it)");
    const p2 = await claimFrom(b, door2, "Fresh Two", 1, SRC);
    const r2: any = p2.resp;
    check(r2?.decision === "deny" && r2.disposition === "not_now" && r2.reason_code === "RATE_LIMITED" && r2.retry?.kind === "after",
      `instance 2, reading only the shared store, refuses a valid claim from that source: not_now / RATE_LIMITED (${code(r2)} ${r2?.retry?.not_before ?? ""})`);
    const p3 = await claimFrom(b, door2, "Fresh Three", 2, OTHER);
    check((p3.resp as any)?.reason_code !== "RATE_LIMITED" && (p3.resp as any)?.decision === "grant",
      `a valid claim from another address on instance 2 is not in that backoff (${code(p3.resp)})`);
  } finally { a.srv.close(); b.srv.close(); }
}

// ---------------------------------------------------------------------------------------------------------------- C245 / C271 / C24 (pass 3)
async function c245Log() {
  console.log("C245 C271 C24 (§4.1, §4, pass 3): the SDK door fetches a Shōkai introduction card's revocation log itself and fails closed");
  // An introducer's log on 127.0.0.1 (the test profile lets the door fetch loopback http; Appendix B). Modes: a signed head and no
  // entries; the card revoked; a 500; a bare array (no head); the server gone.
  const guild = generateRepresentativeKey(); let mode = "clear"; let hits = 0; const iid = randomId("intro"); const now0 = Date.now();
  const srv = http.createServer((req, res) => {
    hits++; const url = `http://127.0.0.1:${(srv.address() as any).port}/log`; const at = iso(Date.now());
    if (mode === "500") { res.writeHead(500); res.end("{}"); return; }
    const entries: S.RevocationLogEntry[] = [];
    if (mode === "revoked") appendLog(entries, sign({ vouch_id: iid, introducer_id: guild.id, revoked_at: at } as any, guild, at) as any);
    const body = mode === "bare" ? entries : { entries, head: sign(logHeadOf(url, entries, at) as any, guild, at) };
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const LOG = `http://127.0.0.1:${(srv.address() as any).port}/log`;
  try {
    const door = createDoor(kettle({ testProfile: true, trustedIntroducers: [guild.id], requireVouchFor: ["visitation"] } as any)); await (door as any).ready;
    const host: any = (door as any).host;
    const codes = Array.from({ length: 6 }, () => ({ code: Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url"), salt: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url") }));
    const icard = sign({ introduction_id: iid, protocol: PROTOCOL, kind: "introduction", introducer: { principal_id: guild.id, display_name: "Cedar Row Guild" },
      place: { principal_id: door.principalId }, scope: { purposes: ["visitation", "purchase"] }, relationship: "member_of", introducer_interest: { kind: "none" }, max_claims: codes.length,
      claim_digests: codes.map((c) => V5.claimDigestOf(iid, c.code, c.salt)), revocation_log: LOG,
      issued_at: iso(now0 - 3600e3), expires_at: iso(now0 + 30 * 86400e3), shown_to_owner: { text: `Kettle & Leaf, ${codes.length} claims, 30 days. ` + V5.LENDING_LINE, locale: "en-US" } } as any, guild, iso(now0)) as any;
    const claim = async (name: string, i: number) => {
      const who = createRepresentative({ ownerName: name, purposes: SCOPE.purposes, actions: ACTS, ownerPrompts: "purchase_only" });
      const rep = (who as any).key; const card = (who as any).card as S.SignedCard; const enc = randomId("enc"); let n = 0; const at = () => iso(Date.now());
      const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: PROTOCOL, encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: at(), from: card.payload.representative_id, to: door.repId, type, ...body } as any, rep, at());
      const post = async (m: unknown) => ((await door.post(m)).envelope.messages ?? []).map((x: any) => x?.payload ?? x);
      const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n-vis") }));
      const proof = sign(possessionPayload(enc, g.find((x: any) => x.type === "greeting")?.nonce, door.repId), rep, at()).signatures[0];
      const cp = await post(msg("card_presentation", { card, possession_proof: { ...proof, key_id: card.payload.representative_key.key_id, signer: card.payload.representative_id, audience: door.repId } }));
      const challenge = cp.find((x: any) => x.type === "card_receipt")?.claim_challenge?.challenge;
      const cl = sign({ introduction_id: iid, introduction_digest: icard.payload_digest, code: codes[i].code, salt: codes[i].salt,
        holder: { principal_id: card.payload.principal.principal_id, card_digest: card.payload_digest }, challenge } as any, rep, at()) as any;
      const before = hits;
      await post(msg("introduction", { vouch: null, introduction_card: { card: icard, claim: cl } }));
      const fetchedNow = hits > before;
      const m = who.mandate({ purpose: "visitation", actions: ["tea.browse"] });
      const out = await post(msg("invitation_request", { card_digest: card.payload_digest, mandate: m, introduction_card_digest: icard.payload_digest, introduction_claim_digest: cl.payload_digest,
        proposal: { request: { actions: ["tea.browse"] }, value_to_counterparty: { text: "Looking around.", locale: "en-US" }, etiquette_register: "first_meeting" } }));
      const weight = (host.log as string[]).filter((l) => l.includes(`introduction card ${iid} claimed by`)).at(-1)?.match(/weight=(\w+)/)?.[1];
      return { fetchedNow, weight, resp: out.find((x: any) => x.type === "invitation_response" && x.encounter_id === enc) };
    };
    const ok = await claim("Pia Lund", 0);
    check(ok.fetchedNow, "C245/C24: the SDK door fetches the introduction card's revocation_log itself when the claim arrives (it used to read vouch, allowance and card logs only)");
    check(ok.weight === "full" && ok.resp?.decision === "grant", `C245/C271: with a fresh head signed by the introducer and no entry, the claim counts as a vouch from a named introducer (weight=${ok.weight}; ${code(ok.resp)})`);
    mode = "revoked"; const rv = await claim("Bo Ferreira", 1);
    check(rv.weight === "none" && rv.resp?.decision === "deny", `C245: a VouchRevocation naming the card's introduction_id in that log ends its weight (weight=${rv.weight}; ${code(rv.resp)})`);
    mode = "bare"; const br = await claim("Ines Ward", 2);
    check(br.weight === "none" && br.resp?.decision === "deny", `C271: a bare array (no head) is refused as stale for an introduction card (weight=${br.weight}; ${code(br.resp)})`);
    mode = "500"; const un = await claim("Ren Okabe", 3);
    check(un.weight === "none" && un.resp?.decision === "deny" && un.resp.disposition === "not_now" && un.resp.reason_code === "VOUCH_REQUIRED" && un.resp.retry?.kind === "after"
      && Date.parse(un.resp.retry.not_before) - Date.now() <= 86400e3 + 60e3,
      `§4 "Unreachable vouch log" (C101, C24): an unreachable log gives no weight (fail closed), answered as a setup failure: deny / not_now / VOUCH_REQUIRED, retry after at most 1 day (weight=${un.weight}; ${code(un.resp)} ${un.resp?.retry?.kind ?? ""})`);
    check(![...(host.signals ?? [])].some((x: any) => x.kind !== "gate_probing" && (x.principal === guild.id)), "C101: nothing is recorded against the introducer for an unreachable log");
    mode = "clear"; await new Promise<void>((r) => srv.close(() => r())); srv.closeAllConnections?.();
    const gone = await claim("Mira Tal", 4);
    check(gone.weight === "none" && gone.resp?.reason_code === "VOUCH_REQUIRED", `fail closed: the log host gone (connection refused) is unreachable too (weight=${gone.weight}; ${code(gone.resp)})`);
  } finally { if (srv.listening) srv.close(); }
}

async function main() {
  console.log("SDK conformance-0.5 regressions and direct MUST tests");
  await finding1(); await finding2(); await finding3(); await c294(); await c293(); await versionAndProvisional(); await c296(); await c296SharedStore(); await c245Log();
  console.log(`known gaps (not counted as pass or fail): ${gaps.length}${gaps.length ? "\n    - " + gaps.join("\n    - ") : ""}`);
  console.log(`conformance-0.5: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
