// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The Shōkai conformance runner: black-box checks of a door over the §11 HTTP binding, the §11.3 MCP binding when the place
// serves MCP, plus the normative test vectors (Appendix A.2) against an implementation's own crypto functions. Core and MCP
// checks always run (MCP only where the place advertises an endpoint, or one is named with `mcp`); extensions are opt-in, and
// their results never change the core verdict.
import { readFileSync } from "node:fs";
import { createRepresentative, verifySigned, makeSignedRaw, signRaw, Visit, httpTransport, PROTOCOL, SPEC_VERSION, type Representative } from "./internals.js";
import { randomId } from "../core/crypto.js";
import { SPEC_RC_SAME_WIRE } from "../core/version.js";

export type Level = "core" | "mcp" | "visit-receipts" | "signed-listings" | "vectors";
export type Result = { id: string; level: Level; title: string; ref: string; status: "pass" | "fail" | "warn" | "skip"; detail?: string };
export type Report = { target: string; spec: string; protocol: string; started_at: string; results: Result[]; summary: Record<string, { pass: number; fail: number; warn: number; skip: number }>;
  /** What the test vectors ran against: an implementation module's own functions, or this runner's own crypto (a door's crypto
   *  can't be reached over HTTP, so with a URL target the vectors say nothing about the door). */
  vectors_against?: string };
/**
 * Optional functions an implementation module exports (as `implementation`) so the vectors can test its own crypto. Each is
 * called with exactly the arguments below (never as an array callback), and a missing one makes its vector `skip`:
 * - `digest(payload)` → `"sha-256:" + base64url(SHA-256(JCS(payload)))`;
 * - `verify(signature, digest, did, rpId?)` → true when the `Signature` verifies over the digest for the key `did` resolves to
 *   (Ed25519 over the 32 raw digest bytes; ES256 passkey assertions per Appendix A.1, checked against `rpId` when given);
 * - `isTimestamp(s)` → RFC 3339 UTC whole seconds with `Z`; `isMoney(s)` → a strict decimal `Money.value` string (§5.1);
 * - `lookupLocale(ranges, available, default)` → `{locale, match: "exact" | "fallback" | "none"}` (RFC 4647 lookup, §6.6);
 * - `isCanonicalDidJwk(did)` → the canonical did:jwk form (§2.1).
 */
export type Implementation = {
  digest?: (payload: unknown) => string;
  verify?: (sig: any, digest: string, did: string, rpId?: string) => boolean;
  isTimestamp?: (s: string) => boolean;
  isMoney?: (s: string) => boolean;
  lookupLocale?: (ranges: string[], available: string[], dflt: string) => { locale: string; match: string };
  isCanonicalDidJwk?: (did: string) => boolean;
};
export const EXTENSIONS: Level[] = ["visit-receipts", "signed-listings"];
/** Levels whose failures make a door NOT CONFORMANT to the core (the MCP binding is core where the place serves MCP, §11.3). */
export const CORE_LEVELS: Level[] = ["core", "mcp"];

const vectorsPath = new URL("../../../conformance-data/test-vectors.json", import.meta.url);

type Ctx = { base: string; results: Result[]; place?: any; listing?: any; rep?: Representative };
/** The frozen scenario each black-box check belongs to (scenarios/CATALOG): door and lobby SC-L0, the ritual SC-S1, seats SC-S1,
 *  tamper / order / nonce SC-R1, a copied card SC-M1. */
const SCENARIO: Record<string, string> = { door: "SC-L0", lobby: "SC-L0", inbox: "SC-L0", body: "SC-L0", ritual: "SC-S1", seat: "SC-S1", request: "SC-L0", mandate: "SC-A1", lifecycle: "SC-R1",
  "neg.order": "SC-R1", "neg.tamper": "SC-R1", "neg.nonce": "SC-R1", "neg.bad_signature": "SC-R1", "neg.copied_card": "SC-M1", "neg.probing": "SC-M1", mcp: "SC-S1" };
function add(ctx: Ctx, r: Omit<Result, "status"> & { ok: boolean | "warn" | "skip"; detail?: string }) {
  const sc = r.level === "core" || r.level === "mcp" ? (SCENARIO[r.id] ?? SCENARIO[r.id.split(".")[0]]) : undefined; if (sc) r = { ...r, ref: `${sc}; ${r.ref}` };
  const status = r.ok === true ? "pass" : r.ok === "warn" ? "warn" : r.ok === "skip" ? "skip" : "fail";
  ctx.results.push({ id: r.id, level: r.level, title: r.title, ref: r.ref, status, ...(r.detail ? { detail: r.detail } : {}) });
}
async function getJson(url: string): Promise<{ status: number; body: any; cookie?: boolean }> {
  const r = await fetch(url, { redirect: "error" }); let body: any = null; try { body = await r.json(); } catch { body = null; } return { status: r.status, body, cookie: r.headers.has("set-cookie") };
}
async function postRaw(url: string, body: string): Promise<{ status: number; body: any; cookie?: boolean }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, redirect: "error" }); let j: any = null; try { j = await r.json(); } catch { j = null; } return { status: r.status, body: j, cookie: r.headers.has("set-cookie") };
}
const msgs = (env: any): any[] => (Array.isArray(env?.messages) ? env.messages : []);
const pay = (m: any) => m?.payload ?? m;
/** Every message the place sends verifies (JCS digest, signature) under the representative its listing names. */
function allSignedBy(env: any, rep: string): { ok: boolean; why?: string } {
  for (const m of msgs(env)) { if (!m?.payload) return { ok: false, why: "unsigned message " + (m?.type ?? "") };
    const v = verifySigned(m, { expectSigner: rep }); if (!v.ok) return { ok: false, why: `${pay(m).type}: ${v.why}` }; }
  return { ok: true };
}

export async function runConformance(base: string, opts: { levels?: Level[]; place?: string; implementation?: Implementation; vectorsAgainst?: string; mcp?: string; spend?: SpendOpt } = {}): Promise<Report> {
  const levels = new Set<Level>(["core", "mcp", ...(opts.levels ?? [])]);
  base = base.replace(/\/$/, "");
  const ctx: Ctx = { base, results: [] }; const started_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  if (base) await coreHttp(ctx, opts.place, levels, opts.mcp, opts.spend);
  if (levels.has("vectors")) vectors(ctx, opts.implementation);
  const summary: Report["summary"] = {};
  for (const r of ctx.results) { const s = (summary[r.level] ??= { pass: 0, fail: 0, warn: 0, skip: 0 }); s[r.status]++; }
  return { target: base || "(vectors only)", spec: SPEC_VERSION, protocol: PROTOCOL, started_at, results: ctx.results, summary,
    ...(levels.has("vectors") ? { vectors_against: opts.vectorsAgainst ?? (opts.implementation ? "the implementation passed in" : "nothing (no implementation)") } : {}) };
}

/** The spending checks. `value` is one honest order's amount (a canonical decimal, e.g. "6.00"); `args` are the other arguments that
 *  order needs (e.g. {"tea": "sencha"}). With `value` set, a conformant door admits exactly ONE act of that amount (use mock money). */
export type SpendOpt = { value?: string; currency?: string; args?: Record<string, unknown> };
const toUnits = (v: string) => { const m = /^(\d+)(?:\.(\d+))?$/.exec(v); if (!m) return null; const d = (m[2] ?? "").length; return { u: BigInt(m[1] + (m[2] ?? "")), d }; };
const fromUnits = (u: bigint, d: number) => { const s = u.toString().padStart(d + 1, "0"); return d ? s.slice(0, -d) + "." + s.slice(-d) : s; };

async function coreHttp(ctx: Ctx, placeName: string | undefined, levels: Set<Level>, mcpUrl?: string, spendOpt: SpendOpt = {}) {
  const L: Level = "core";
  // ---- the door (§3.1, §11.1)
  const root = await getJson(ctx.base + "/").catch(() => ({ status: 0, body: null }));
  add(ctx, { id: "door.root", level: L, ref: "§3.1, §11.1", title: "GET <door>/ answers a door_pointer (protocol, spec_ref, place_listing)",
    ok: root.status === 200 && root.body?.type === "door_pointer" && root.body?.protocol === PROTOCOL && !!root.body?.spec_ref && typeof root.body?.place_listing === "string", detail: `status ${root.status}, type ${root.body?.type}` });
  const listing = await getJson(ctx.base + "/places").catch(() => ({ status: 0, body: null })); ctx.listing = listing.body;
  const places: any[] = Array.isArray(listing.body?.places) ? listing.body.places : [];
  add(ctx, { id: "door.listing", level: L, ref: "§3.1", title: "GET <door>/places answers a place_listing with at least one place",
    ok: listing.status === 200 && listing.body?.type === "place_listing" && listing.body?.protocol === PROTOCOL && places.length > 0, detail: `status ${listing.status}, ${places.length} place(s)` });
  const place = placeName ? places.find((p) => p.name === placeName) : places[0]; ctx.place = place;
  if (!place) { add(ctx, { id: "door.place", level: L, ref: "§3.1", title: "the place to test is listed", ok: false, detail: placeName ? `no place named ${placeName}` : "no places" }); return; }
  add(ctx, { id: "door.entry", level: L, ref: "§3.1, §11.1", title: "the listing entry names entry, lobby, inbox, representative_id, spec_ref and actions",
    ok: ["entry", "lobby", "inbox", "representative_id"].every((k) => typeof place[k] === "string") && typeof place.spec_ref?.version === "string" && Array.isArray(place.actions),
    detail: `place ${place.name}, spec_ref ${place.spec_ref?.version}` });
  // §3.1 (compatibility, informative): v0.3.0 changes nothing on the wire from its release candidate 0.3.0-rc4, so a door naming
  // "0.3.0-rc4" passes with a note; any other version is a warning (the verdict comes from the checks, not from the label).
  const sv = place.spec_ref?.version;
  add(ctx, { id: "door.spec_ref", level: L, ref: "§3.1", title: `spec_ref.version is "${SPEC_VERSION}" (or its release candidate "${SPEC_RC_SAME_WIRE}", the same wire)`,
    ok: sv === SPEC_VERSION || sv === SPEC_RC_SAME_WIRE ? true : "warn",
    detail: sv === SPEC_RC_SAME_WIRE ? `${sv}: the release candidate of ${SPEC_VERSION}, with no wire change; update the label when convenient` : String(sv) });
  const actions: any[] = place.actions ?? [];
  add(ctx, { id: "door.data_asks", level: L, ref: "§3.1 (SHOULD), C172", title: "each listed action declares data_asks (the personal data it will ask the owner for)",
    ok: actions.length && actions.every((a) => Array.isArray(a.data_asks)) ? true : "warn", detail: actions.filter((a) => !Array.isArray(a.data_asks)).map((a) => a.action).join(", ") || undefined });
  const lost = await getJson(ctx.base + "/no-such-address-" + randomId("x")).catch(() => ({ status: 0, body: null }));
  add(ctx, { id: "door.404", level: L, ref: "§3.1", title: "an unknown address answers 404 with a door_pointer, never a bare 404", ok: lost.status === 404 && lost.body?.type === "door_pointer", detail: `status ${lost.status}` });
  // §11.1 (C200, rc4 round-4 clarification): a GET at the place's own entry is a 404 whose pointer names that place in `here`
  // and says its addresses take a POST; an address that isn't a place's own carries no `here`, and `here` never names another place.
  const atEntry = await getJson(place.entry).catch(() => ({ status: 0, body: null }));
  const here = atEntry.body?.here;
  // v0.3.0: a SHOULD, so a missing `here` is a warning; a `here` that names another place, or one on an unknown address, fails. MUST in v0.4.
  const hereOk = here?.entry === place.entry && here?.name === place.name && here?.method === "POST";
  add(ctx, { id: "door.404_here", level: L, ref: "§11.1, C200 (SHOULD in v0.3.0; MUST planned for v0.4)", title: "GET <entry> answers 404 with a door_pointer whose `here` names this place's entry and says POST; an unknown address has no `here`",
    ok: lost.body?.here !== undefined || (here !== undefined && !hereOk) ? false : atEntry.status === 404 && atEntry.body?.type === "door_pointer" && hereOk ? true : "warn",
    detail: `status ${atEntry.status}, here ${here ? `${here.name} ${here.method}` : "absent"}${lost.body?.here !== undefined ? "; the unknown address carried `here`" : ""}` });

  // ---- the lobby (§3.3)
  const prose = await postRaw(place.entry, JSON.stringify("Hello! Could my assistant come in?"));
  const pm = msgs(prose.body).map(pay); const brief = pm.find((m) => m.type === "lobby_briefing"); const deny = pm.find((m) => m.type === "invitation_response");
  add(ctx, { id: "lobby.prose", level: L, ref: "§3.1, §3.3, §11.1", title: "prose at the entry gets the lobby: a greeting first, a briefing, then deny / not_now with readiness, then a farewell",
    ok: prose.status === 200 && pm[0]?.type === "greeting" && !!brief && deny?.decision === "deny" && deny?.disposition === "not_now" && Array.isArray(deny?.readiness_requirements) && pm.some((m) => m.type === "farewell"),
    detail: pm.map((m) => m.type).join(" → ") });
  // D20: the runner sends no card, key, cookie or credential, so reaching the listing and the lobby at all shows the front is open.
  add(ctx, { id: "front.open", level: L, ref: "§3.1, C173", title: "the agent front is open to look at: the listing and the lobby answer a reader with no card, key or cookie, and set no cookie",
    ok: listing.status === 200 && prose.status === 200 && !!brief && !(listing as any).cookie && !(prose as any).cookie, detail: (listing as any).cookie || (prose as any).cookie ? "a cookie was set on an anonymous reader" : undefined });
  add(ctx, { id: "lobby.briefing", level: L, ref: "§3.3", title: "the briefing carries onboarding_url, spec_ref, actions and inbox",
    ok: !!brief && typeof brief.onboarding_url === "string" && !!brief.spec_ref && Array.isArray(brief.actions) && typeof brief.inbox === "string" });
  add(ctx, { id: "lobby.signed", level: L, ref: "§2.2", title: "the place signs what it sends on the lobby path", ...(() => { const s = allSignedBy(prose.body, place.representative_id); return { ok: s.ok, detail: s.why }; })() });
  const bad = await postRaw(place.entry, "{not json");
  add(ctx, { id: "lobby.malformed", level: L, ref: "§3.1, §11.1", title: "a malformed body at the entry gets the lobby", ok: bad.status === 200 && msgs(bad.body).map(pay).some((m) => m.type === "lobby_briefing") });
  if (levels.has("visit-receipts")) {
    const vr = brief?.visit_receipt; const life = vr ? Date.parse(vr.expires_at) - Date.parse(vr.issued_at) : NaN;
    add(ctx, { id: "ext.visit_receipt", level: "visit-receipts", ref: "Visit receipts extension", title: "every briefing carries a one-time bearer visit_receipt valid at most 7 days",
      ok: !!vr && vr.handling === "bearer_secret" && life > 0 && life <= 7 * 86400e3, detail: vr ? `${vr.handling}, ${life / 3600e3} h` : "absent" });
  }
  if (levels.has("signed-listings")) {
    const sl = ctx.listing?.signed_listing ?? null;
    add(ctx, { id: "ext.signed_listing", level: "signed-listings", ref: "Signed place listings extension", title: "the listing is offered signed by the place's principal", ok: sl ? verifySigned(sl).ok : "skip", detail: sl ? undefined : "no signed listing offered (not automated beyond this check)" });
  }

  // ---- the ritual (§3.2, §5.3, §6.1) with a fresh test representative
  const usable = actions.filter((a) => !a.spends && (a.needs ?? "standard") === "standard" && !a.creates_account && !a.requires_introduction);
  if (!usable.length) { add(ctx, { id: "ritual.grant", level: L, ref: "§3.2", title: "a prepared visitor can be seated for a listed non-spending action", ok: "skip", detail: "the place lists no plain non-spending action" }); return; }
  const target = usable[0]; const purpose = target.purposes?.[0];
  const rep = createRepresentative({ ownerName: "Aya Linden (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) }); ctx.rep = rep;
  const visit = await rep.visit(place, { purpose, actions: [target.action], why: "Conformance run: checking the ritual." });
  // The runner tests the door, so its own representative-side checks (§5.1 ledger, the local seat check) are off: every act goes out.
  visit.checkSeatLocally = false; visit.checkMandateLocally = false;
  const inbound = visit.transcript.filter((t) => t.dir === "in").map((t) => t.message);
  add(ctx, { id: "ritual.greeting", level: L, ref: "§3.2, §2.4", title: "the place answers a signed greeting with its own greeting and a fresh nonce", ok: inbound.map(pay).some((m) => m.type === "greeting" && typeof m.nonce === "string" && m.nonce.length >= 8) });
  add(ctx, { id: "ritual.place_id", level: L, ref: "§3.1, C104", title: "the place's card is signed by its listed principal, names its listed representative and proves possession over this visit's nonce",
    ok: visit.placeCheck.ok ? true : visit.placeCheck.unchecked ? "warn" : false, detail: visit.placeCheck.why });
  add(ctx, { id: "ritual.decision", level: L, ref: "§6.1", title: "a prepared visitor gets one of grant / conditional / deny / considering, with a basis", ok: ["grant", "conditional", "deny", "considering"].includes(visit.decision ?? "") && !!visit.response?.basis, detail: `${visit.decision}${visit.response?.disposition ? "/" + visit.response.disposition : ""}${visit.response?.reason_code ? " " + visit.response.reason_code : ""}` });
  add(ctx, { id: "ritual.grant", level: L, ref: "§7.1", title: "seated for a listed non-spending action asked within the mandate; the seat is no wider than the request", ok: visit.decision === "grant" && !!visit.seat && visit.seat.tool_allowlist.every((t) => t === target.action) ? true : visit.decision === "conditional" || visit.decision === "considering" ? "warn" : false,
    detail: visit.seat?.tool_allowlist.join(", ") ?? `not seated (${visit.decision ?? "no decision"}${visit.response?.disposition ? "/" + visit.response.disposition : ""}${visit.response?.reason_code ? " " + visit.response.reason_code : ""})` });
  // §2.2 (C197): the place answers in the encounter the visitor named; one that names its own fails every honest visitor's possession proof.
  add(ctx, { id: "ritual.encounter", level: L, ref: "§2.2, §2.4, C197", title: "the place answers in the visitor's encounter: every message it sent carries the encounter_id the visitor's greeting named",
    ok: inbound.length > 0 && inbound.map(pay).every((m) => m?.encounter_id === visit.encounterId), detail: [...new Set(inbound.map(pay).map((m) => m?.encounter_id).filter((e) => e !== visit.encounterId))].join(", ") || undefined });
  add(ctx, { id: "ritual.signed", level: L, ref: "§2.2", title: "every message the place sent in the ritual verifies under its listed representative", ...(() => { const s = allSignedBy({ messages: inbound }, place.representative_id); return { ok: s.ok, detail: s.why }; })() });
  if (visit.seat) {
    const outside = actions.find((a) => !visit.seat!.tool_allowlist.includes(a.action))?.action ?? "x-not-listed.tool";
    const r = await visit.act(outside, {});
    add(ctx, { id: "seat.outside", level: L, ref: "§7.2, C189", title: "an act outside the seat is refused explicitly (act_decision deny)", ok: r?.type === "act_decision" && r?.decision === "deny" && (r as any)?.refused_by !== "representative", detail: `${outside}: ${r?.type}/${r?.disposition ?? ""}/${r?.reason_code ?? ""}` });
    const spend = actions.find((a) => a.spends);
    if (spend) { const r2 = await visit.act(spend.action, { amount: { value: "1.00", currency: "USD" } });
      add(ctx, { id: "seat.no_spend", level: L, ref: "§5.2, §7.2 (D11)", title: "a seat without a spending limit refuses an act that moves money", ok: r2?.type === "act_decision" && r2?.decision === "deny" && (r2 as any)?.refused_by !== "representative" }); }
    // §7.2 (C189): an unknown seat id is not_a_fit / SEAT_SCOPE_EXCEEDED, an act_decision.
    const u = (await visit.send(visit.message("act", { seat_id: "seat-" + randomId("unknown"), tool: target.action, arguments: {} }))).find((x: any) => x.type === "act_decision" || x.type === "act_result" || x.type === "invitation_response");
    add(ctx, { id: "seat.unknown", level: L, ref: "§7.2, C189", title: "an act naming a seat that doesn't exist gets act_decision deny / not_a_fit / SEAT_SCOPE_EXCEEDED",
      ok: u?.type === "act_decision" && u.decision === "deny" && u.disposition === "not_a_fit" && u.reason_code === "SEAT_SCOPE_EXCEEDED", detail: `${u?.type}/${u?.disposition ?? ""}/${u?.reason_code ?? ""}` });
    // §7.2 (C193): the seat is checked first: an act with no seat and a malformed amount gets the seat's refusal, never REQUEST_INCOMPLETE or tool output.
    const ua = (await visit.send(visit.message("act", { seat_id: "seat-" + randomId("unknown"), tool: target.action, arguments: { amount: { value: "1,00", currency: "usd" } } }))).find((x: any) => x.type === "act_decision" || x.type === "act_result" || x.type === "invitation_response");
    add(ctx, { id: "act.order", level: L, ref: "§7.2, C193", title: "the seat is checked before the amount: no seat plus a malformed amount gets not_a_fit / SEAT_SCOPE_EXCEEDED, never the place's service",
      ok: ua?.type === "act_decision" && ua.disposition === "not_a_fit" && ua.reason_code === "SEAT_SCOPE_EXCEEDED", detail: `${ua?.type}/${ua?.disposition ?? ""}/${ua?.reason_code ?? ""}` });
    // §2.2 (C184): a good digest with a bad signature, in this live encounter, gets the lobby and changes nothing.
    const forged = makeSignedRaw(visit.message("act", { seat_id: visit.seat.seat_id, tool: target.action, arguments: {} }), rep);
    forged.signatures[0].value = flipSig(forged.signatures[0].value);
    const fo = await postRaw(place.entry, JSON.stringify(forged)); const fm = msgs(fo.body).map(pay);
    const still = (await visit.send(visit.message("act", { seat_id: visit.seat.seat_id, tool: target.action, arguments: {} }))).find((x: any) => x.type === "act_result" || x.type === "act_decision");
    add(ctx, { id: "neg.bad_signature", level: L, ref: "§2.2, C184", title: "a message whose digest matches but whose signature doesn't verify gets the lobby (no in_reply_to) and changes no encounter",
      ok: fm.some((m) => m.type === "lobby_briefing") && !fm.some((m) => m.type === "act_result" || m.in_reply_to) && still?.type === "act_result",
      detail: `forged act → ${fm.map((m) => m.type).join(" → ") || "no messages"}; the real act afterwards → ${still?.type ?? "nothing"}${still?.reason_code ? "/" + still.reason_code : ""}` });
  }
  // ---- §5.1 (C175): a mandate's limits bind across every seat granted under it. Tested with max_operations: 1 on the same
  // non-spending action, so nothing is bought: one act in a first visit, then the same mandate presented again in a second visit.
  if (visit.seat) {
    const lim = { max_operations: 1 };
    const m = rep.mandate({ purpose, actions: [target.action], limits: lim, validSeconds: 600 });
    const va = await rep.visit(place, { purpose, actions: [target.action], limits: lim, useMandate: m, why: "Conformance run: a mandate used across two visits." });
    const sendAct = async (v: Visit) => (await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: target.action, arguments: {} }))).find((x: any) => x.type === "act_result" || x.type === "act_decision");
    const first = va.seat ? await sendAct(va) : undefined; await va.farewell().catch(() => undefined);
    if (first?.type !== "act_result") add(ctx, { id: "seat.mandate_across", level: L, ref: "§5.1, C175", title: "a mandate's limits bind across visits: an act past them in a new seat under the same mandate is refused", ok: "skip", detail: `the first visit's act under max_operations 1 didn't go through (${first?.type ?? va.decision})` });
    else {
      const vb = await rep.visit(place, { purpose, actions: [target.action], limits: lim, useMandate: m, why: "Conformance run: the same mandate again." });
      const second = vb.seat ? await sendAct(vb) : undefined; await vb.farewell().catch(() => undefined);
      add(ctx, { id: "seat.mandate_across", level: L, ref: "§5.1, C175, C194", title: "a mandate's limits bind across visits: an act past them in a new seat under the same mandate is refused",
        ok: vb.seat ? second?.type === "act_decision" && second?.decision === "deny" : vb.decision === "deny",
        detail: vb.seat ? `second visit's act: ${second?.type}/${second?.reason_code ?? ""}` : `second visit not seated (${vb.decision}/${vb.response?.reason_code ?? ""})` });
    }
  }
  // ---- §5.1, §7.2 (C175): money caps are enforced by the door, not only promised. A door that seats a spending limit and then
  // lets acts past it through is not conformant. The first check moves no money at a conformant door: the seat's cap is 0.01 and the
  // one act asks for 1.00, so a conformant door refuses it before anything happens. (A door that admits it has shown it ignores caps.)
  const spendAct = actions.find((a) => a.spends && (a.needs ?? "standard") === "standard" && !a.creates_account && !a.requires_introduction);
  const cur = spendOpt.currency ?? "USD"; const sargs = spendOpt.args ?? {};
  const capTitle = "a seat's max_amount is enforced: an act asking for more than the seat's cap is refused by the door, not carried out";
  if (!spendAct) add(ctx, { id: "seat.max_amount", level: L, ref: "§5.1, §7.2", title: capTitle, ok: "skip", detail: "the place lists no plain spending action" });
  else {
    const sp = spendAct.purposes?.[0];
    const rs = createRepresentative({ ownerName: "Bo Ferreira (conformance test owner)", purposes: [sp], actions: [spendAct.action] });
    const vs = await rs.visit(place, { purpose: sp, actions: [spendAct.action], limits: { max_amount: { value: "0.01", currency: cur } }, why: "Conformance run: a cap of 0.01." });
    vs.checkSeatLocally = false; vs.checkMandateLocally = false;
    if (!vs.seat) add(ctx, { id: "seat.max_amount", level: L, ref: "§5.1, §7.2", title: capTitle, ok: "skip", detail: `not seated with a 0.01 ${cur} cap (${vs.decision ?? "no decision"}${vs.response?.reason_code ? "/" + vs.response.reason_code : ""})` });
    else {
      const r = await vs.act(spendAct.action, { ...sargs, amount: { value: "1.00", currency: cur } });
      add(ctx, { id: "seat.max_amount", level: L, ref: "§5.1, §7.2", title: capTitle,
        ok: r?.type === "act_decision" && r?.decision === "deny" && (r as any)?.refused_by !== "representative",
        detail: `1.00 ${cur} under a 0.01 ${cur} seat: ${r?.type}/${(r as any)?.reason_code ?? ""}${r?.type === "act_result" ? " (the door let it through)" : ""}` });
    }
    await vs.farewell().catch(() => undefined);
    // Totals, opt-in (--spend <amount>): a conformant door admits exactly one act of that amount. The mandate and the seat each allow
    // just under two; a second act in the same seat, then one in a new seat under the same mandate, must both be refused.
    const t1 = "a seat's max_amount is a running total: a second act that would take the seat past its cap is refused";
    const t2 = "a mandate's max_amount is a running total across its seats: an act in a new seat that would take the mandate past it is refused";
    const one = spendOpt.value ? toUnits(spendOpt.value) : null;
    if (!one || one.u < 1n) { const why = spendOpt.value ? `--spend ${spendOpt.value} isn't a plain decimal amount` : "opt-in: pass --spend <one order's amount> (and --spend-args) against mock money; a conformant door then admits exactly one order";
      add(ctx, { id: "seat.max_amount_total", level: L, ref: "§5.1, §7.2", title: t1, ok: "skip", detail: why }); add(ctx, { id: "mandate.max_amount_total", level: L, ref: "§5.1, C175", title: t2, ok: "skip", detail: why }); }
    else {
      const amount = { value: spendOpt.value!, currency: cur }; const cap = { value: fromUnits(one.u * 2n - 1n, one.d), currency: cur };
      const rt = createRepresentative({ ownerName: "Bo Ferreira (conformance test owner)", purposes: [sp], actions: [spendAct.action] });
      const m = rt.mandate({ purpose: sp, actions: [spendAct.action], limits: { max_amount: cap }, validSeconds: 600 });
      const va = await rt.visit(place, { purpose: sp, actions: [spendAct.action], limits: { max_amount: cap }, useMandate: m, why: "Conformance run: one order under a cap of just under two." });
      va.checkSeatLocally = false; va.checkMandateLocally = false;
      const first = va.seat ? await va.act(spendAct.action, { ...sargs, amount }) : undefined;
      if (first?.type !== "act_result") { const why = `the first order of ${amount.value} ${cur} under a ${cap.value} cap didn't go through (${first?.type ?? va.decision ?? "not seated"}${(first as any)?.reason_code ? "/" + (first as any).reason_code : ""})`;
        add(ctx, { id: "seat.max_amount_total", level: L, ref: "§5.1, §7.2", title: t1, ok: "skip", detail: why }); add(ctx, { id: "mandate.max_amount_total", level: L, ref: "§5.1, C175", title: t2, ok: "skip", detail: why }); await va.farewell().catch(() => undefined); }
      else {
        const second = await va.act(spendAct.action, { ...sargs, amount }); await va.farewell().catch(() => undefined);
        add(ctx, { id: "seat.max_amount_total", level: L, ref: "§5.1, §7.2", title: t1, ok: second?.type === "act_decision" && second?.decision === "deny" && (second as any)?.refused_by !== "representative",
          detail: `second ${amount.value} ${cur} under a ${cap.value} seat: ${second?.type}/${(second as any)?.reason_code ?? ""}` });
        const vb = await rt.visit(place, { purpose: sp, actions: [spendAct.action], limits: { max_amount: cap }, useMandate: m, why: "Conformance run: the same mandate again." });
        vb.checkSeatLocally = false; vb.checkMandateLocally = false;
        const third = vb.seat ? await vb.act(spendAct.action, { ...sargs, amount }) : undefined; await vb.farewell().catch(() => undefined);
        add(ctx, { id: "mandate.max_amount_total", level: L, ref: "§5.1, C175", title: t2, ok: vb.seat ? third?.type === "act_decision" && third?.decision === "deny" && (third as any)?.refused_by !== "representative" : vb.decision === "deny",
          detail: vb.seat ? `${amount.value} ${cur} in a new seat under the same ${cap.value} mandate: ${third?.type}/${(third as any)?.reason_code ?? ""}` : `the new seat was refused (${vb.decision}/${vb.response?.reason_code ?? ""})` });
      }
    }
  }
  // ---- §11.3 the MCP binding (C179–C182), with the seat of the first visit
  if (visit.seat) await mcpChecks(ctx, place, rep, visit, target.action, actions, mcpUrl);
  else add(ctx, { id: "mcp.binding", level: "mcp", ref: "§11.3", title: "the MCP binding", ok: "skip", detail: "not seated, so no seat to call tools with" });
  // ---- §3.5 (C190): another request in the closed encounter is RITUAL_ORDER; the seat lives on
  if (visit.seat) {
    const again = (await visit.send(visit.message("invitation_request", { card_digest: rep.card.payload_digest, mandate: visit.mandateSent, proposal: proposal([target.action]) }))).find((m: any) => m.type === "invitation_response");
    const act2 = (await visit.send(visit.message("act", { seat_id: visit.seat.seat_id, tool: target.action, arguments: {} }))).find((x: any) => x.type === "act_result" || x.type === "act_decision");
    add(ctx, { id: "lifecycle.again", level: L, ref: "§3.5, C190", title: "after a grant, another request in the encounter gets deny / not_now / RITUAL_ORDER (retry after) and the seat still works",
      ok: again?.decision === "deny" && again?.disposition === "not_now" && again?.reason_code === "RITUAL_ORDER" && again?.retry?.kind === "after" && act2?.type !== undefined && !(act2?.type === "act_decision" && act2?.reason_code === "RITUAL_ORDER"),
      detail: `second request → ${again?.decision ?? "nothing"}/${again?.disposition ?? ""}/${again?.reason_code ?? ""}; act afterwards → ${act2?.type ?? "nothing"}${act2?.reason_code ? "/" + act2.reason_code : ""}` });
  }
  // ---- §11.1 (C183): one message per POST; an array or a batch envelope is a malformed body → the lobby, nothing in it acted on
  {
    const b = new Visit(rep, place.entry, place.representative_id, httpTransport);
    const g = makeSignedRaw(b.message("greeting", { locales: ["en-US"], nonce: randomId("n-batch") }), rep);
    const asArray = msgs((await postRaw(place.entry, JSON.stringify([g]))).body).map(pay);
    const asBatch = msgs((await postRaw(place.entry, JSON.stringify({ protocol: PROTOCOL, messages: [g] }))).body).map(pay);
    const lobbyOnly = (ms: any[]) => ms.some((m) => m.type === "lobby_briefing") && !ms.some((m) => m.encounter_id === b.encounterId);
    add(ctx, { id: "body.batch", level: L, ref: "§11.1, C183", title: "a POST holding several messages (a JSON array, or a batch envelope) gets the lobby, and the messages inside aren't handled",
      ok: lobbyOnly(asArray) && lobbyOnly(asBatch), detail: `array → ${asArray.map((m) => m.type).join(" → ") || "nothing"}; batch → ${asBatch.map((m) => m.type).join(" → ") || "nothing"}` });
    const t2 = new Visit(rep, place.entry, place.representative_id, httpTransport);
    const gw = makeSignedRaw(t2.message("greeting", { locales: ["en-US"], nonce: randomId("n") }), rep); gw.signatures[0].value = flipSig(gw.signatures[0].value);
    const gm = msgs((await postRaw(place.entry, JSON.stringify(gw))).body).map(pay);
    add(ctx, { id: "lobby.bad_signature", level: L, ref: "§2.2, C184", title: "a greeting with a good digest and a bad signature gets the lobby, not the ritual and not silence",
      ok: gm.some((m) => m.type === "lobby_briefing") && !gm.some((m) => m.type === "greeting" && m.encounter_id === t2.encounterId), detail: gm.map((m) => m.type).join(" → ") || "no messages" });
  }
  // ---- §5.3 (C185) and §5.1 (C188), each with a fresh owner so honest rejections never add up to probing (B.7)
  {
    const r1 = createRepresentative({ ownerName: "Ines Calloway (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const inc = await requestAfterIntro(r1, place, { card_digest: r1.card.payload_digest, proposal: proposal([target.action]) });
    add(ctx, { id: "request.incomplete", level: L, ref: "§5.3, C185", title: "a request with no mandate gets deny / not_now / REQUEST_INCOMPLETE with retry with_credential [signed_mandate]",
      ok: inc?.decision === "deny" && inc?.disposition === "not_now" && inc?.reason_code === "REQUEST_INCOMPLETE" && inc?.retry?.kind === "with_credential" && JSON.stringify(inc?.retry?.credentials) === '["signed_mandate"]',
      detail: `${inc?.decision ?? "nothing"}/${inc?.disposition ?? ""}/${inc?.reason_code ?? ""} ${JSON.stringify(inc?.retry ?? null)}` });
    const r2 = createRepresentative({ ownerName: "Ines Calloway (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const base = r2.mandate({ purpose, actions: [target.action] }).payload;
    const other = signRaw({ ...base, mandate_id: randomId("mand"), card_id: "card-" + randomId("another") }, r2.owner);
    const wrongCard = await requestAfterIntro(r2, place, { card_digest: r2.card.payload_digest, mandate: other, proposal: proposal([target.action]) });
    const elsewhere = signRaw({ ...base, mandate_id: randomId("mand"), counterparties: ["did:web:another-place.example"] }, r2.owner);
    const wrongPlace = await requestAfterIntro(r2, place, { card_digest: r2.card.payload_digest, mandate: elsewhere, proposal: proposal([target.action]) });
    const inv = (r: any) => r?.decision === "deny" && r?.disposition === "not_now" && r?.reason_code === "MANDATE_INVALID";
    add(ctx, { id: "mandate.cross", level: L, ref: "§5.1, C188", title: "a mandate for another card_id, or whose counterparties leave out this place, is deny / not_now / MANDATE_INVALID",
      ok: inv(wrongCard) && inv(wrongPlace), detail: `card_id → ${wrongCard?.decision ?? "nothing"}/${wrongCard?.reason_code ?? ""}; counterparties → ${wrongPlace?.decision ?? "nothing"}/${wrongPlace?.reason_code ?? ""}` });
  }
  // ---- §2.6 (C191): a card its principal revoked, delivered as card_revocation, is refused as not_now with no reason code
  {
    const rr = createRepresentative({ ownerName: "Rowan Achterberg (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const d = new Visit(rr, place.entry, place.representative_id, httpTransport);
    await d.send(d.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const revocation = signRaw({ card_id: rr.card.payload.card_id, card_digest: rr.card.payload_digest, principal_id: rr.owner.id, revoked_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), reason: "superseded" }, rr.owner);
    await d.send(d.message("card_revocation", { revocation }));
    const after = await rr.visit(place, { purpose, actions: [target.action], why: "Conformance run: a revoked card." });
    const ar = after.response;
    add(ctx, { id: "card.revoked", level: L, ref: "§2.6, C191", title: "a card whose principal delivered a signed card_revocation is refused: deny / not_now, no reason code, retry with_credential [signed_card]",
      ok: !after.seat && ar?.decision === "deny" && ar?.disposition === "not_now" && !ar?.reason_code && ar?.retry?.kind === "with_credential" && JSON.stringify(ar?.retry?.credentials) === '["signed_card"]',
      detail: `${ar?.decision ?? after.decision ?? "nothing"}/${ar?.disposition ?? ""}/${ar?.reason_code ?? ""} ${JSON.stringify(ar?.retry ?? null)}` });
  }
  // ---- §2.6 (C198): revoking a card ends every open seat it holds; the next act in a seat opened before the revocation is refused
  {
    const rs = createRepresentative({ ownerName: "Theo Marchetti (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const sv = await rs.visit(place, { purpose, actions: [target.action], why: "Conformance run: a seat, then a revoked card." });
    if (!sv.seat) add(ctx, { id: "card.revoked_seat", level: L, ref: "§2.6, C198", title: "revoking a card ends every open seat it holds: the next act in that seat is refused (deny / not_now, no reason code)", ok: "skip", detail: `not seated (${sv.decision ?? "no decision"})` });
    else {
      sv.checkSeatLocally = false; sv.checkMandateLocally = false;
      const d = new Visit(rs, place.entry, place.representative_id, httpTransport);
      await d.send(d.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
      await d.send(d.message("card_revocation", { revocation: signRaw({ card_id: rs.card.payload.card_id, card_digest: rs.card.payload_digest, principal_id: rs.owner.id, revoked_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), reason: "superseded" }, rs.owner) }));
      const r: any = await sv.act(target.action, {});
      await sv.farewell().catch(() => {}); await d.farewell().catch(() => {});   // free both encounters: small test doors cap open encounters (§3.4)
      add(ctx, { id: "card.revoked_seat", level: L, ref: "§2.6, C198", title: "revoking a card ends every open seat it holds: the next act in that seat is refused (deny / not_now, no reason code)",
        ok: r?.type === "act_decision" && r?.decision === "deny" && r?.disposition === "not_now" && !r?.reason_code && r?.refused_by !== "representative",
        detail: `${r?.type ?? "nothing"}/${r?.decision ?? ""}/${r?.disposition ?? ""}/${r?.reason_code ?? ""}` });
    }
  }
  // ---- §9.3 (C186): probing, with its own fresh owner; skipped where the place declares Appendix B.7's x-test-probing "off"
  if (place["x-test-probing"] === "off" && place["x-test-profile"]) add(ctx, { id: "neg.probing", level: L, ref: "§9.3, C186, B.7", title: "probing: the Nth distinct rejected shape is answered never and binds the principal", ok: "skip", detail: "the place declares x-test-probing \"off\" (Appendix B.7)" });
  else {
    const pr = createRepresentative({ ownerName: "Pell Ostrander (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const m1 = pr.mandate({ purpose, actions: [target.action], limits: { max_operations: 1 }, validSeconds: 600 });
    const answers: any[] = [];
    for (const n of [2, 3, 4]) answers.push(await requestAfterIntro(pr, place, { card_digest: pr.card.payload_digest, mandate: m1, proposal: proposal([target.action], { max_operations: n }) }));
    const plain = await requestAfterIntro(pr, place, { card_digest: pr.card.payload_digest, mandate: m1, proposal: proposal([target.action], { max_operations: 1 }) }, true);
    const never = (r: any) => r?.decision === "deny" && r?.disposition === "never" && !r?.reason_code && r?.retry?.kind === "never";
    const counted = answers.slice(0, 2).every((r) => r?.decision === "conditional" || (r?.decision === "deny" && r?.reason_code === "MANDATE_SCOPE_EXCEEDED"));
    add(ctx, { id: "neg.probing", level: L, ref: "§9.3, C186", title: "probing: the 3rd distinct shape beyond the mandate is answered deny / never (no code), and the principal stays bound at this place",
      ok: counted ? never(answers[2]) && never(plain) : "skip", detail: counted ? `answers: ${answers.map((r) => `${r?.decision ?? "nothing"}/${r?.disposition ?? ""}`).join(", ")}; then a request inside the mandate → ${plain?.decision ?? "nothing"}/${plain?.disposition ?? ""}`
        : `the place didn't reject requests beyond the mandate as §6.7 says (${answers.map((r) => `${r?.decision ?? "nothing"}/${r?.reason_code ?? ""}`).join(", ")}); not a probing test` });
  }
  // ---- negative checks that stay refused in every revision (Conventions; §2.2, §2.4, §3.2)
  const early = new Visit(rep, place.entry, place.representative_id, httpTransport);
  await early.send(early.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
  const er = await early.send(early.message("invitation_request", { card_digest: rep.card.payload_digest, mandate: rep.mandate({ purpose, actions: [target.action] }), proposal: { request: { actions: [target.action] }, value_to_counterparty: { text: "skip ahead", locale: "en-US" }, etiquette_register: "first_meeting" } }));
  add(ctx, { id: "neg.order", level: L, ref: "§3.2", title: "a request before the card is refused explicitly (deny), never seated", ok: er.some((m: any) => m.type === "invitation_response" && m.decision === "deny") && !er.some((m: any) => m.seat) });
  const nonce = randomId("n-reuse");
  const g1 = new Visit(rep, place.entry, place.representative_id, httpTransport); await g1.send(g1.message("greeting", { locales: ["en-US"], nonce }));
  const g2 = new Visit(rep, place.entry, place.representative_id, httpTransport); const r2 = await g2.send(g2.message("greeting", { locales: ["en-US"], nonce }));
  add(ctx, { id: "neg.nonce", level: L, ref: "§2.4", title: "a signed greeting that reuses a nonce is refused", ok: r2.some((m: any) => m.type === "invitation_response" && m.decision === "deny") });
  const t = new Visit(rep, place.entry, place.representative_id, httpTransport);
  const w = makeSignedRaw(t.message("greeting", { locales: ["en-US"], nonce: randomId("n") }), rep); w.payload.nonce = "changed-after-signing";
  const tr = await postRaw(place.entry, JSON.stringify(w)); const tm = msgs(tr.body).map(pay);
  add(ctx, { id: "neg.tamper", level: L, ref: "§2.2", title: "a message changed after signing is not accepted (no greeting back)", ok: !tm.some((m) => m.type === "greeting"), detail: tm.map((m) => m.type).join(" → ") || "no messages" });
  const mallory = createRepresentative({ ownerName: "Mallory Quist (conformance)", purposes: [purpose], actions: [target.action] });
  const c = new Visit(mallory, place.entry, place.representative_id, httpTransport);
  await c.send(c.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
  const proof = makeSignedRaw({ encounter_id: c.encounterId, nonce: c.lastHostNonce }, mallory).signatures[0];
  const cr = await c.send(c.message("card_presentation", { card: rep.card, possession_proof: { ...proof, key_id: rep.card.payload.representative_key.key_id, signer: rep.card.payload.representative_id } }));
  add(ctx, { id: "neg.copied_card", level: L, ref: "§2.4", title: "someone else's card with a proof by another key is refused", ok: cr.some((m: any) => m.type === "invitation_response" && m.decision === "deny") });
  const poll = await postRaw(place.inbox, JSON.stringify({ type: "inbox_poll" }));
  add(ctx, { id: "inbox.unsigned", level: L, ref: "§11.2", title: "an unsigned inbox poll gets 403 and nothing", ok: poll.status === 403 && msgs(poll.body).length === 0, detail: `status ${poll.status}` });
  await visit.farewell().catch(() => undefined);
}

function vectors(ctx: Ctx, impl: Implementation | undefined) {
  const L: Level = "vectors"; const TV = JSON.parse(readFileSync(vectorsPath, "utf8"));
  const I: Implementation = impl ?? {};
  const run = (id: string, title: string, f: (() => boolean) | null) => add(ctx, { id, level: L, ref: "Appendix A.2", title, ok: f ? (() => { try { return f(); } catch { return false; } })() : "skip", detail: f ? undefined : "the implementation module exports no function for this" });
  const J = TV.jcs_digest; const E = TV.ed25519; const PK = TV.passkey;
  run("vec.jcs", "JCS (RFC 8785) + SHA-256 digest of the vector payload", I.digest ? () => I.digest!(J.payload) === J.digest : null);
  run("vec.ed25519", "Ed25519 signature over the 32 raw digest bytes verifies; over the digest string it fails", I.verify ? () => I.verify!(E.signature, J.digest, E.did) === true && I.verify!(E.negative_signature_over_digest_string, J.digest, E.did) === false : null);
  run("vec.passkey", "passkey (WebAuthn ES256) assertion verifies; prefixed challenge, wrong rp, UV cleared all fail", I.verify ? () => I.verify!(PK.signature, J.digest, PK.did, PK.rp_id) === true && [PK.negative_prefixed_challenge, PK.negative_wrong_rp, PK.negative_uv_cleared].every((s: any) => I.verify!(s, J.digest, PK.did, PK.rp_id) === false) : null);
  run("vec.passkey_profile", "owner signing profile (A.1): crossOrigin false ok; crossOrigin true, topOrigin, an origin with a port, http or a subdomain refused; a one-tap batch verifies per item, a wrong index, a batch of one or a repeated item refused",
    I.verify && TV.passkey_profile ? () => { const PP = TV.passkey_profile;
      const single = Object.values<any>(PP.cases).every((c) => I.verify!(c.signature, PP.digest, PP.did, PP.rp_id) === (c.expect === true));
      const batch = PP.batch.signatures.every((sg: any, i: number) => I.verify!(sg, PP.batch.digests[i], PP.did, PP.rp_id) === true);
      const neg = Object.values<any>(PP.batch.negatives).every((c) => I.verify!(c.signature, c.verify_against, PP.did, PP.rp_id) === false);
      return single && batch && neg; } : null);
  run("vec.timestamps", "timestamps: RFC 3339 UTC Z whole seconds only", I.isTimestamp ? () => TV.timestamps.valid.every((x: string) => I.isTimestamp!(x) === true) && !TV.timestamps.invalid.some((x: string) => I.isTimestamp!(x) === true) : null);
  run("vec.money", "money: strict decimal strings", I.isMoney ? () => TV.money.valid.every((x: string) => I.isMoney!(x) === true) && !TV.money.invalid.some((x: string) => I.isMoney!(x) === true) : null);
  run("vec.locale", "RFC 4647 lookup", I.lookupLocale ? () => TV.rfc4647_lookup.every((c: any) => { const r = I.lookupLocale!(c.ranges, c.available, c.default); return r.locale === c.expect.locale && r.match === c.expect.match; }) : null);
  run("vec.did_jwk", "did:jwk canonical form", I.isCanonicalDidJwk ? () => I.isCanonicalDidJwk!(TV.did_jwk.canonical) === true && !I.isCanonicalDidJwk!(TV.did_jwk.non_canonical_member_order) && !I.isCanonicalDidJwk!(TV.did_jwk.non_canonical_whitespace) : null);
}

/** The verdict: core (with the MCP binding where it applies) decides conformance; extensions are reported on their own. */
export function verdict(r: Report): { core: "pass" | "fail"; coreFails: number; extensionFails: Record<string, number> } {
  const coreFails = r.results.filter((x) => CORE_LEVELS.includes(x.level) && x.status === "fail").length;
  const extensionFails: Record<string, number> = {};
  for (const x of r.results) if (!CORE_LEVELS.includes(x.level) && x.level !== "vectors" && x.status === "fail") extensionFails[x.level] = (extensionFails[x.level] ?? 0) + 1;
  return { core: coreFails ? "fail" : "pass", coreFails, extensionFails };
}
export function formatReport(r: Report): string {
  const lines = [`Shōkai conformance: ${r.target}  (spec ${r.spec}, wire ${r.protocol})`, ""];
  const order: Level[] = ["core", "mcp", "visit-receipts", "signed-listings", "vectors"];
  const head: Record<string, string> = { core: "core", mcp: "core: the MCP binding (§11.3; only where the place serves MCP)" };
  for (const lv of order) { const rs = r.results.filter((x) => x.level === lv); if (!rs.length) continue;
    lines.push(lv === "vectors" && r.vectors_against ? `vectors (run against ${r.vectors_against})` : head[lv] ?? `extension: ${lv} (optional; doesn't affect the core verdict)`);
    for (const x of rs) lines.push(`  ${x.status.toUpperCase().padEnd(4)} ${x.id.padEnd(20)} ${x.title} [${x.ref}]${x.detail && x.status !== "pass" ? "\n         " + x.detail : ""}`);
    const s = r.summary[lv]; lines.push(`  → ${s.pass} pass, ${s.fail} fail, ${s.warn} warn, ${s.skip} skip`, ""); }
  const v = verdict(r); const warn = r.results.some((x) => CORE_LEVELS.includes(x.level) && x.status === "warn");
  const vecFails = r.results.filter((x) => x.level === "vectors" && x.status === "fail").length;
  const ranCore = r.results.some((x) => CORE_LEVELS.includes(x.level) && x.status !== "skip");
  lines.push(v.core === "fail" ? `Core: NOT CONFORMANT: ${v.coreFails} failing core check(s).` : ranCore ? `Core: all core checks that ran passed${warn ? " (with warnings on SHOULDs)" : ""}.` : "Core: no core checks ran (no door was tested).");
  for (const [lv, n] of Object.entries(v.extensionFails)) lines.push(`Extension ${lv}: ${n} failing check(s). Extensions are optional; this doesn't change the core verdict.`);
  if (vecFails) lines.push(`Vectors: ${vecFails} failing (against ${r.vectors_against ?? "the implementation"}).`);
  return lines.join("\n");
}

// ---------- helpers for the rc3 checks ----------
const proposal = (acts: string[], limits?: Record<string, unknown>) => ({ request: { actions: acts, ...(limits ? { limits } : {}) }, value_to_counterparty: { text: "Conformance run.", locale: "en-US" }, etiquette_register: "first_meeting" });
/** A different but well-formed signature value (same length), so only the signature fails, never the digest. */
function flipSig(v: string): string { const c = v[10] === "A" ? "B" : "A"; return v.slice(0, 10) + c + v.slice(11); }
/** A fresh encounter up to the introduction (greeting, card with its possession proof, vouch: null), then one request; its answer. */
async function requestAfterIntro(rep: Representative, place: any, body: Record<string, unknown>, firstAnswer = false): Promise<any> {
  const v = new Visit(rep, place.entry, place.representative_id, httpTransport); const seen: any[] = [];
  seen.push(...await v.send(v.message("greeting", { locales: ["en-US"], nonce: randomId("n") })));
  const proof = makeSignedRaw({ encounter_id: v.encounterId, nonce: v.lastHostNonce }, rep).signatures[0];
  seen.push(...await v.send(v.message("card_presentation", { card: rep.card, possession_proof: { ...proof, key_id: rep.card.payload.representative_key.key_id, signer: rep.card.payload.representative_id } })));
  seen.push(...await v.send(v.message("introduction", { vouch: null })));
  const out = await v.send(v.message("invitation_request", body)); seen.push(...out);
  return (firstAnswer ? seen : out).map(pay).find((m: any) => m.type === "invitation_response");
}
type McpReply = { status: number; json: any; session?: string };
async function mcpPost(url: string, body: unknown, headers: Record<string, string> = {}): Promise<McpReply> {
  const r = await fetch(url, { method: "POST", redirect: "error", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  const text = await r.text(); let json: any = null;
  try { json = JSON.parse(text); } catch { for (const l of text.split("\n")) if (l.startsWith("data:")) { try { const j = JSON.parse(l.slice(5)); if (j && (j.result !== undefined || j.error !== undefined)) { json = j; break; } } catch { /* next */ } } }
  return { status: r.status, json, session: r.headers.get("mcp-session-id") ?? undefined };
}
const b64act = (signed: unknown) => Buffer.from(JSON.stringify(signed), "utf8").toString("base64url");
/** §11.3: the MCP binding, black-box, with a seated visit. */
async function mcpChecks(ctx: Ctx, place: any, rep: Representative, visit: Visit, tool: string, actions: any[], forced?: string) {
  const M: Level = "mcp";
  const link = (place.links ?? []).find((l: any) => l?.rel === "mcp-server");
  const url: string | undefined = forced ?? link?.href;
  if (!url) { add(ctx, { id: "mcp.endpoint", level: M, ref: "§11.3, C179", title: "the MCP binding applies when the place serves MCP (links rel mcp-server)", ok: "skip", detail: "the place advertises no MCP endpoint; pass --mcp <url> to test one anyway" }); return; }
  let sameOrigin = false; try { sameOrigin = new URL(url).origin === new URL(place.entry).origin; } catch { sameOrigin = false; }
  add(ctx, { id: "mcp.endpoint", level: M, ref: "§11.3, C179", title: "the listing names the MCP endpoint (links rel mcp-server) on the entry's origin",
    ok: !!link && sameOrigin, detail: link ? (sameOrigin ? undefined : `${link.href} is not on ${new URL(place.entry).origin}`) : `no mcp-server link in the listing; testing ${url} because it was named` });
  const H: Record<string, string> = { "mcp-protocol-version": "2025-06-18" };
  const init = await mcpPost(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "shokai-conformance", version: SPEC_VERSION } } }, H).catch((e) => ({ status: 0, json: null, err: String(e) }) as any);
  if (init.session) H["mcp-session-id"] = init.session;
  const initOk = init.status === 200 && !!init.json?.result;
  add(ctx, { id: "mcp.initialize", level: M, ref: "§11.3, C180", title: "initialize is answered without a seat or an act", ok: initOk, detail: `status ${init.status}${init.json?.error ? ", error " + init.json.error.code : ""}${(init as any).err ? ", " + (init as any).err : ""}` });
  if (!initOk) return;
  await mcpPost(url, { jsonrpc: "2.0", method: "notifications/initialized" }, H).catch(() => undefined);
  const seatId = visit.seat!.seat_id; const allowed = visit.seat!.tool_allowlist;
  let n = 10; const call = (name: string, args: Record<string, unknown>, extra: Record<string, string> = {}) => mcpPost(url, { jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, { ...H, ...extra });
  const refused = (x: McpReply) => x.json?.error?.code === -32040;
  const sh = (x: McpReply) => x.json?.error?.data?.shokai;
  const list0 = await mcpPost(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, H);
  const list1 = await mcpPost(url, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }, { ...H, "shokai-seat": seatId });
  const names1: string[] = Array.isArray(list1.json?.result?.tools) ? list1.json.result.tools.map((t: any) => t.name) : [];
  add(ctx, { id: "mcp.list", level: M, ref: "§11.3, C180", title: "tools/list answers without a seat; with Shokai-Seat it lists only the seat's tools",
    ok: Array.isArray(list0.json?.result?.tools) && Array.isArray(list1.json?.result?.tools) && names1.every((t) => allowed.includes(t)),
    detail: `without a seat: ${list0.json?.error ? "error " + list0.json.error.code : (list0.json?.result?.tools?.length ?? "?") + " tool(s)"}; with the seat: ${names1.join(", ") || "none"} (seat allows ${allowed.join(", ")})` });
  const none = await call(tool, {});
  const s0 = sh(none);
  add(ctx, { id: "mcp.refusal", level: M, ref: "§11.3, C181", title: "a tools/call without a signed act is refused: HTTP 200, JSON-RPC -32040, data.shokai {refused_by, decision deny, disposition, reason_code, door, entry}",
    ok: none.status === 200 && refused(none) && s0?.decision === "deny" && typeof s0?.disposition === "string" && typeof s0?.door === "string" && typeof s0?.entry === "string" && s0?.refused_by === "gate" && s0?.reason_code === "CREDENTIAL_REQUIRED",
    detail: `status ${none.status}, ${none.json?.error ? `error ${none.json.error.code}, data.shokai ${JSON.stringify(s0 ?? null).slice(0, 160)}` : "no error: the call went through"}` });
  const a1 = visit.signAct(tool, {}); const hdr1 = { "shokai-seat": seatId, "shokai-act": b64act(a1) };
  const ok1 = await call(tool, {}, hdr1);
  add(ctx, { id: "mcp.act", level: M, ref: "§11.3, C179", title: "a tools/call carrying a matching signed act (Shokai-Act) for a tool in the seat passes the gate",
    ok: ok1.status === 200 && !!ok1.json && !refused(ok1), detail: refused(ok1) ? `refused: ${ok1.json.error.message}` : ok1.json?.error ? `error ${ok1.json.error.code} (not a Shōkai refusal)` : undefined });
  const replay = await call(tool, {}, hdr1);
  const a2 = visit.signAct(tool, {}); const changed = await call(tool, { x_changed: "after signing" }, { "shokai-seat": seatId, "shokai-act": b64act(a2) });
  const outside = actions.find((a) => !allowed.includes(a.action))?.action ?? "x-not-listed.tool";
  const a3 = visit.signAct(tool, {}); const otherTool = await call(outside, {}, { "shokai-seat": seatId, "shokai-act": b64act(a3) });
  const stalePayload = { ...visit.message("act", { seat_id: seatId, tool, arguments: {} }), sent_at: new Date(Date.now() - 3600e3).toISOString().replace(/\.\d+Z$/, "Z") };
  const stale = await call(tool, {}, { "shokai-seat": seatId, "shokai-act": b64act(makeSignedRaw(stalePayload, rep)) });
  add(ctx, { id: "mcp.gate", level: M, ref: "§11.3, C179", title: "the gate refuses a replayed act, changed arguments, another tool than the act names, and a stale act (-32040)",
    ok: [replay, changed, otherTool, stale].every(refused), detail: `replay ${refused(replay) ? "refused" : "PASSED"}, changed arguments ${refused(changed) ? "refused" : "PASSED"}, other tool ${refused(otherTool) ? "refused" : "PASSED"}, stale ${refused(stale) ? "refused" : "PASSED"}` });
  const a4 = visit.signAct(outside, {}); const out = await call(outside, {}, { "shokai-seat": seatId, "shokai-act": b64act(a4) }); const s4 = sh(out);
  add(ctx, { id: "mcp.door_refusal", level: M, ref: "§11.3, C181, C189", title: "a signed act for a tool outside the seat is refused by the door: refused_by door, its act_decision, SEAT_SCOPE_EXCEEDED",
    ok: refused(out) && s4?.refused_by === "door" && s4?.reason_code === "SEAT_SCOPE_EXCEEDED" && !!s4?.act_decision, detail: `${out.json?.error ? `error ${out.json.error.code}, ${JSON.stringify(s4 ?? null).slice(0, 160)}` : "no error: the call went through"}` });
  const spend = actions.find((a) => a.spends)?.action ?? tool;
  const amt = { amount: { value: "1.00", currency: "USD" } };
  const a5 = visit.signAct(spend, amt); const bumped = await call(spend, { amount: { value: "9.00", currency: "USD" } }, { "shokai-seat": seatId, "shokai-act": b64act(a5) });
  add(ctx, { id: "mcp.amount", level: M, ref: "§11.3, C182", title: "the amount travels in the call's arguments under the act's digest: a call whose amount differs from the signed one is refused",
    ok: refused(bumped), detail: refused(bumped) ? undefined : "a call stating 9.00 USD under an act signed for 1.00 USD was not refused" });
}
