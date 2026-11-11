// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.5.0 black-box checks (C230–C255, C300, C301): what a visitor can see of a door over the §11 HTTP binding. They run against
// any URL. Where a check needs something a door only shows with a test fixture (purchase holds, a named classifier, a start hook), it
// skips with the reason. No act is ever released (no money moves) unless the caller passed `spend` (a place with mock money).
import { createRepresentative, signRaw, Visit, httpTransport, PROTOCOL, digestOf, type Representative } from "./internals.js";
import { acknowledgementOnly, LEGACY_TAG, sign } from "../index.js";
import { V050_MEMBERS } from "../core/v050.js";
import { randomId } from "../core/crypto.js";
import { randomBytes } from "node:crypto";
import { add, na, getJson, postRaw, msgs, pay, flipSig, type Ctx, type SpendOpt } from "./runner.js";
import { visitorRep, createPresignedRep, skipNeedOwnerSign, skipNeedMandate, skipNeedProbe } from "./presigned.js";
import { newPasskeyOwner } from "../core/crypto.js";

const L = "v050" as const;
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
/** §7.2: an idempotency key is base64url of 16 to 32 random bytes. */
const ikey = () => randomBytes(18).toString("base64url");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const first = (out: any[], ...types: string[]) => out.find((x: any) => types.includes(x?.type));
/** An act_result that performed (ok: true); an ok: false one (unknown_argument, no_such_offer…) performed nothing. */
const performed = (r: any) => r?.type === "act_result" && r.ok === true;
/** The action refused the runner's test arguments: the check can't run here (it is skipped, never failed). */
const argsRefused = (r: any) => r?.type === "act_result" && r.ok === false;
const argsNote = (r: any) => `the action refused the runner's test arguments (${r?.error ?? "ok: false"}): pass --spend-args with the arguments one order needs`;
/** The place's own limit for an action from its house summary: max over offers[].max_amount for it, capped by limits.max_amount (§2.3, §7.3). */
function placeLimit(summary: any, action: string): { value: string; currency: string } | undefined {
  const offers = (summary?.offers ?? []).filter((x: any) => x?.action === action && x.max_amount?.value).map((x: any) => x.max_amount);
  const top = offers.reduce((a: any, b: any) => (!a || (b.currency === a.currency && Number(b.value) > Number(a.value)) ? b : a), undefined);
  const lim = summary?.limits?.max_amount?.value ? summary.limits.max_amount : undefined;
  if (top && lim && top.currency === lim.currency) return Number(lim.value) < Number(top.value) ? lim : top;
  return top ?? lim;
}
const code = (r: any) => r ? `${r.type}${r.decision ? "/" + r.decision : ""}${r.disposition ? "/" + r.disposition : ""}${r.reason_code ? "/" + r.reason_code : ""}` : "nothing";
/** Lobby and summary members that are v0.5.0's: never in a message answering shokai/0.3 (§11.1). */
const V05_LOBBY = ["conduct_rules", "third_party_classifiers", "model_providers", "retention_days", "message_cap", "hold_policies", "deletion"];
/** Records kept by the representative or the owner: never on the wire from either side (§5.5, §8.3, §2.3 door questions). */
const NEVER_ON_WIRE = ["return_prefs", "errand_budget", "notify_at", "door_answers", "door_questions_answers"];
const money = (units: bigint, d: number, currency: string) => { const s = units.toString().padStart(d + 1, "0"); return { value: d ? s.slice(0, -d) + "." + s.slice(-d) : s, currency }; };
const unitsOf = (v: string, d: number) => { const [i, f = ""] = String(v).split("."); return BigInt(i + f.padEnd(d, "0").slice(0, d)); };
const sameMoney = (a: any, b: any) => !!a && !!b && a.currency === b.currency && Number(a.value) === Number(b.value);

/** v0.5.0 (C234): asks the host, off the wire, to end a live seat (door.endSeat); resolves true when it did. */
export type EndSeatHook = (place: string, seatId: string) => Promise<boolean>;
/** v0.5.0 (C236): asks the implementation, off the wire, whether a door would start with this place's house config changed by
 *  `patch` (policy members; null removes one). Resolves the problem list (empty: it would start), or null when it can't tell. */
export type TryConfigHook = (place: string, patch: Record<string, unknown>) => Promise<string[] | null>;
export type V050Opts = { spend?: SpendOpt; holdGrace?: number; endSeat?: EndSeatHook; tryConfig?: TryConfigHook };

/** Provisional-section checks (§3.2 C268 host card; §6.12 C267 context request). Never fail a door for lacking provisional features it doesn't advertise. */
async function provisionalChecks(ctx: Ctx, place: any, wire: any[], seen: { dir: string; message: any }[]) {
  // (a) §3.2, C268: GET <entry>/host-card.json is a signed host card whose payload_digest matches the one the door otherwise presents.
  const all: any[] = [...wire, ...seen.map((t) => t.message)];
  const pinned: string | undefined = place?.host_card?.payload_digest ?? place?.host_card_digest
    ?? all.map((m) => m?.host_card?.payload_digest ?? m?.host_card_digest).find((x) => typeof x === "string")
    // R4-03: the host card the door presents in its own card_presentation (§3.2) is the one to compare against.
    ?? all.map(pay).map((m) => m?.type === "card_presentation" && m.card?.payload?.kind === "host" ? m.card.payload_digest : undefined).find((x) => typeof x === "string");
  const title = "GET <entry>/host-card.json returns a signed host card whose payload_digest matches the one the door presents";
  try {
    const res = await fetch(String(place.entry).replace(/\/$/, "") + "/host-card.json", { signal: AbortSignal.timeout(10000) });
    if (res.status === 404 || res.status === 405 || res.status === 501) add(ctx, { id: "v050.host_card_served", level: L, ref: "§3.2, C268", title, ok: "skip", detail: `no host-card endpoint (HTTP ${res.status}); provisional` });
    else {
      const body: any = await res.json().catch(() => undefined);
      const signed = res.status === 200 && Array.isArray(body?.signatures) && body.signatures.length > 0 && !!body.payload;
      const served: string | undefined = body?.payload_digest ?? body?.payload?.payload_digest ?? (signed ? (digestOf as any)(body.payload) : undefined);
      if (!signed) add(ctx, { id: "v050.host_card_served", level: L, ref: "§3.2, C268", title, ok: false, detail: `HTTP ${res.status}: not a signed host card` });
      else if (!pinned) add(ctx, { id: "v050.host_card_served", level: L, ref: "§3.2, C268", title, ok: "skip", detail: "the door presents no payload_digest the runner can compare against; the served card is signed" });
      else add(ctx, { id: "v050.host_card_served", level: L, ref: "§3.2, C268", title, ok: served === pinned, detail: `served ${served} vs presented ${pinned}` });
    }
  } catch (e: any) {
    add(ctx, { id: "v050.host_card_served", level: L, ref: "§3.2, C268", title, ok: "skip", detail: `could not fetch host-card.json (${e?.message ?? e})` });
  }
  // (b) §6.12, C267: each field of a context_request appears verbatim in the house summary's policy.context_requirements.
  const ctitle = "a context_request in an invitation_response names only fields the house summary declares in policy.context_requirements";
  const cr = all.find((m) => m?.type === "invitation_response" && m.context_request)?.context_request;
  const declares = all.map(pay).some((m) => Array.isArray((m?.house_summary ?? m)?.policy?.context_requirements?.fields ?? (m?.house_summary ?? m)?.policy?.context_requirements));
  if (!cr) { add(ctx, { id: "v050.context_request_declared", level: L, ref: "§6.12, C267", title: ctitle, ok: declares ? "skip" : na("class"), detail: declares ? "the summary declares context requirements but no context_request was sent" : "ext-context-requests (provisional) not offered: the house summary declares no policy.context_requirements and no context_request was sent" }); return; }
  const norm = (x: any): string => typeof x === "string" ? x : String(x?.field ?? x?.name ?? JSON.stringify(x));
  const rawFields = Array.isArray(cr) ? cr : cr.fields ?? cr.requested ?? cr.requests;
  const summary = all.map((m) => m?.house_summary ?? m).find((m) => Array.isArray(m?.policy?.context_requirements));
  if (!Array.isArray(rawFields)) { add(ctx, { id: "v050.context_request_declared", level: L, ref: "§6.12, C267", title: ctitle, ok: "skip", detail: "the context_request has no field list the runner can read" }); return; }
  if (!summary) { add(ctx, { id: "v050.context_request_declared", level: L, ref: "§6.12, C267", title: ctitle, ok: false, detail: "a context_request was sent but no house summary declares policy.context_requirements" }); return; }
  const declared = new Set<string>(summary.policy.context_requirements.map(norm));
  const missing = rawFields.map(norm).filter((f: string) => !declared.has(f));
  add(ctx, { id: "v050.context_request_declared", level: L, ref: "§6.12, C267", title: ctitle, ok: missing.length === 0, detail: missing.length ? `not declared: ${missing.join(", ")}` : `${rawFields.length} field(s) all declared` });
}

/** All v0.5.0 checks for the place in ctx (only when it states spec_ref 0.5.0; earlier places get one skip). */
export async function v050Checks(ctx: Ctx, o: V050Opts = {}) {
  const place = ctx.place; if (!place) return;
  if (place.spec_ref?.version !== "0.5.0") { add(ctx, { id: "v050.applies", level: L, ref: "§11.1", title: "v0.5.0 checks (C230–C255) apply to a place whose spec_ref is 0.5.0", ok: "skip", detail: `spec_ref ${place.spec_ref?.version}` }); return; }
  const seen: { dir: string; message: any }[] = [];   // every place message these checks receive (C249, C251–C252)
  const keep = (v: Visit) => { for (const t of v.transcript) if (t.dir === "in") seen.push(t); };
  const actions: any[] = place.actions ?? [];
  const plain = actions.find((a) => !a.spends && (a.needs ?? "standard") === "standard" && !a.creates_account && !a.requires_introduction);
  const purpose = plain?.purposes?.[0];

  // ---- C254: wire tags. accepted_tags in the listing; 0.5 answered in 0.5; 0.3 answered in 0.3 with no v0.5.0 member, signed objects unchanged.
  const tags: string[] = Array.isArray(place.accepted_tags) ? place.accepted_tags : [];
  const greetAs = async (tag: string) => {
    const r = visitorRep(ctx.presigned, { ownerName: "Uma Ferreira (conformance test owner)", purposes: [purpose ?? "visitation"], actions: actions.map((a) => a.action) });
    const v = new Visit(r, place.entry, place.representative_id, httpTransport, place.display_name, place, tag as any);
    const g = await v.send(v.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const proof = signRaw({ encounter_id: v.encounterId, nonce: g.find((m: any) => m.type === "greeting")?.nonce ?? "", ...(v.audience() ? { audience: v.audience() } : {}) }, r.key).signatures[0];
    const c = await v.send(v.message("card_presentation", { card: r.card, possession_proof: { ...proof, ...(v.audience() ? { audience: v.audience() } : {}), key_id: r.card.payload.representative_key.key_id, signer: r.card.payload.representative_id } }));
    keep(v); await v.farewell().catch(() => undefined);
    return { out: [...g, ...c], wire: v.transcript.filter((t) => t.dir === "in").map((t) => t.message) };
  };
  const g5 = await greetAs(PROTOCOL); const g3 = await greetAs(LEGACY_TAG);
  const own05 = (m: any) => [...V050_MEMBERS, ...V05_LOBBY].filter((k) => k in (m ?? {}));
  await provisionalChecks(ctx, place, g5.wire, seen);   // §3.2 C268, §6.12 C267 (provisional)
  const hostCard5 = first(g5.out, "card_presentation")?.card; const hostCard3 = first(g3.out, "card_presentation")?.card;
  add(ctx, { id: "v050.tags", level: L, ref: "§11.1, C254", title: "accepted_tags is listed; a shokai/0.5 greeting is answered in shokai/0.5, a shokai/0.3 one in shokai/0.3 with no v0.5.0 member in the reply's own messages and the signed card unchanged",
    ok: tags.includes(PROTOCOL) && g5.out.length > 0 && g5.out.every((m) => m.protocol === PROTOCOL) && (!tags.includes(LEGACY_TAG) || (g3.out.length > 0 && g3.out.every((m) => m.protocol === LEGACY_TAG && !own05(m).length)
      && (!hostCard5 || hostCard3?.payload_digest === hostCard5.payload_digest))),
    detail: `accepted_tags ${JSON.stringify(tags)}; 0.5 → ${[...new Set(g5.out.map((m) => m.protocol))].join(",")}; 0.3 → ${[...new Set(g3.out.map((m) => m.protocol))].join(",")}${g3.out.some((m) => own05(m).length) ? ` (0.3 reply carried ${g3.out.flatMap(own05).join(", ")})` : ""}` });

  // ---- C248: the house summary is served at <entry>/house-summary.json and matches the Shōkai host card's summary_digest
  const hostCard = hostCard5?.payload; const isHost = hostCard?.kind === "host";
  const sumUrl = place.entry.replace(/\/$/, "") + "/house-summary.json";
  const sr = await getJson(sumUrl).catch(() => ({ status: 0, body: null }));
  const summary = sr.status === 200 && sr.body && typeof sr.body === "object" ? sr.body : null;
  const lob = await postRaw(place.entry, JSON.stringify("Hello, what are the house rules?"));
  const brief = msgs(lob.body).map(pay).find((m) => m.type === "lobby_briefing");
  add(ctx, { id: "v050.summary", level: L, ref: "§2.3, C248", title: "a v0.5.0 host serves GET <entry>/house-summary.json, its digest is the Shōkai host card's summary_digest, and it names this place",
    ok: !isHost ? "skip" : !!summary && hostCard.summary_digest === digestOf(summary) && summary.name === place.name,
    detail: !isHost ? "the place showed no Shōkai host card (kind host)" : `status ${sr.status}; card summary_digest ${hostCard.summary_digest ? "present" : "absent"}${summary ? `, ${hostCard.summary_digest === digestOf(summary) ? "matches" : "does not match"}` : ""}` });
  const restated = ["conduct_rules", "third_party_classifiers", "model_providers"];
  add(ctx, { id: "v050.summary_restates", level: L, ref: "§2.3, §3.3, C248, C246", title: "what the summary restates (conduct rules, classifiers, model providers) equals what the lobby serves",
    ok: !summary || !brief ? "skip" : restated.every((k) => JSON.stringify(summary[k] ?? null) === JSON.stringify(brief[k] ?? null)),
    detail: !summary || !brief ? "no summary or no lobby briefing" : restated.filter((k) => JSON.stringify(summary[k] ?? null) !== JSON.stringify(brief[k] ?? null)).join(", ") || undefined });
  // ---- C246, C250: conduct rules and structured classifier entries in the summary and lobby for 0.5; absent from a 0.3 answer
  const rulesOk = (r: any) => r === undefined || (Array.isArray(r) && r.every((x) => x && typeof x.code === "string" && /^([a-z_]+|x-[a-z0-9_-]+)$/.test(x.code) && typeof x.text === "string" && typeof x.locale === "string"));
  const clsOk = (c: any) => c === undefined || (Array.isArray(c) && c.every((x) => x && typeof x.name === "string" && x.name.trim() && x.name !== "*" && typeof x.purpose?.text === "string" && typeof x.purpose?.locale === "string"
    && Array.isArray(x.jurisdiction) && x.jurisdiction.length > 0 && x.jurisdiction.every((j: unknown) => typeof j === "string" && /^[A-Z]{2}$/.test(j))
    && Number.isInteger(x.retention_days) && x.retention_days >= 0 && x.retention_days <= 90 && (x.role === undefined || x.role === "processor" || x.role === "independent")));
  const lob3 = await postRaw(place.entry, JSON.stringify({ protocol: LEGACY_TAG, type: "x-hello" }));
  const brief3 = msgs(lob3.body).map(pay).find((m) => m.type === "lobby_briefing");
  add(ctx, { id: "v050.conduct", level: L, ref: "§3.3, C246", title: "conduct rules, when the place has them, are well-formed in the summary and the lobby; a shokai/0.3 lobby carries none",
    ok: rulesOk(summary?.conduct_rules) && rulesOk(brief?.conduct_rules) && !(brief3 && brief3.protocol === LEGACY_TAG && "conduct_rules" in brief3),
    detail: `summary ${summary?.conduct_rules ? summary.conduct_rules.length + " rule(s)" : "none"}; lobby ${brief?.conduct_rules ? brief.conduct_rules.length : "none"}; 0.3 lobby ${brief3 ? (brief3.protocol === LEGACY_TAG ? ("conduct_rules" in brief3 ? "carries rules" : "none") : "answered in " + brief3.protocol) : "absent"}` });
  add(ctx, { id: "v050.classifiers", level: L, ref: "§3.3, §12.4, C250", title: "third-party classifiers are listed in the structured shape (name, purpose, jurisdiction, retention_days ≤ 90, role) in the summary and the lobby; none in a shokai/0.3 lobby",
    ok: clsOk(summary?.third_party_classifiers) && clsOk(brief?.third_party_classifiers) && !(brief3 && brief3.protocol === LEGACY_TAG && "third_party_classifiers" in brief3),
    detail: `summary ${summary?.third_party_classifiers ? summary.third_party_classifiers.map((c: any) => c?.name ?? JSON.stringify(c)).join(", ") : "none"}` });
  add(ctx, { id: "v050.model_providers", level: L, ref: "§6.10, §12.4, C250", title: "outside model providers are listed in the structured shape (name, purpose, jurisdiction, retention_days ≤ 90, role) in the summary and the lobby, the same in both; none in a shokai/0.3 lobby",
    ok: clsOk(summary?.model_providers) && clsOk(brief?.model_providers) && JSON.stringify(summary?.model_providers ?? null) === JSON.stringify(brief?.model_providers ?? null) && !(brief3 && brief3.protocol === LEGACY_TAG && "model_providers" in brief3),
    detail: `summary ${summary?.model_providers ? summary.model_providers.map((c: any) => c?.name ?? JSON.stringify(c)).join(", ") : "none (no outside service runs the host's model)"}` });
  add(ctx, { id: "v050.classifier_before_request", level: L, ref: "§12.4, C250", title: "no outside classifier call before invitation_request", ok: na("in-process"),
    detail: "a door's outbound calls aren't observable over HTTP; run in process with a recording classifier (classes.json evidence)" });
  const ret = summary?.retention_days;
  add(ctx, { id: "v050.retention", level: L, ref: "§12.4, C255", title: "retention_days, when stated, is a whole number of days, at most 90",
    ok: ret === undefined ? "skip" : Number.isInteger(ret) && ret >= 0 && ret <= 90, detail: ret === undefined ? "the summary states none (30 by default)" : `${ret} days` });

  // ---- a plain seat for the act-level checks (C233, C234, C235, C237, C239)
  if (!plain) { add(ctx, { id: "v050.seat", level: L, ref: "§7.1", title: "a plain seat for the v0.5.0 act checks", ok: "skip", detail: "the place lists no plain non-spending action" }); }
  const seatFor = async (who: string, _extra: Record<string, unknown> = {}): Promise<{ r: ReturnType<typeof visitorRep>; v: Visit }> => {
    const r = visitorRep(ctx.presigned, { ownerName: `${who} (conformance test owner)`, purposes: [purpose], actions: actions.map((a) => a.action) });
    const browse = ctx.presigned?.mandates.browse;
    if (ctx.presigned && !browse) return { r, v: { seat: undefined, decision: undefined, withdrew: "no browse mandate", transcript: [] } as unknown as Visit };
    const v = await r.visit(place, { purpose, actions: [plain.action], why: "Conformance run: v0.5.0 checks.", ...(browse ? { useMandate: browse } : {}) });
    v.checkSeatLocally = false; v.checkMandateLocally = false; return { r, v };
  };
  if (plain) {
    // C233: idempotent repeats on a plain act: the same key returns the identical signed answer; 10 repeats per seat, then RATE_LIMITED.
    const { v } = await seatFor("Ilse Brandt");
    if (!v.seat) add(ctx, { id: "v050.idempotent", level: L, ref: "§7.2, C233", title: "idempotent repeats", ok: "skip", detail: `not seated (${v.decision ?? v.withdrew ?? "no decision"})` });
    else {
      const key = ikey();
      const act = () => v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: plain.action, arguments: {}, idempotency_key: key }));
      const a0 = await act(); const reps: any[][] = []; for (let i = 0; i < 10; i++) reps.push(await act()); const past = await act();
      const bad = first(await v.send(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: {}, idempotency_key: "not a key!" })), "act_decision", "act_result");
      const ident = reps.every((x) => JSON.stringify(x) === JSON.stringify(a0)); const p = first(past, "act_decision", "act_result");
      add(ctx, { id: "v050.idempotent", level: L, ref: "§7.2, C233", title: "an act repeated with its idempotency key gets the identical signed answer (never performed again); past 10 repeats per seat, not_now / RATE_LIMITED; a malformed key, not_now / REQUEST_INCOMPLETE",
        ok: first(a0, "act_result")?.ok === true && ident && p?.type === "act_decision" && p.reason_code === "RATE_LIMITED" && bad?.type === "act_decision" && bad.reason_code === "REQUEST_INCOMPLETE",
        detail: `first ${code(first(a0, "act_result", "act_decision"))}; 10 repeats ${ident ? "identical" : "differ"}; 11th ${code(p)}; malformed key ${code(bad)}` });
      keep(v); await v.farewell().catch(() => undefined);
    }
    // C235: a payment card number anywhere is refused and never echoed (arguments; a header id).
    { const { v } = await seatFor("Oren Takahashi");
      if (!v.seat) {
        add(ctx, { id: "v050.instrument", level: L, ref: "§5.4, C235", title: "a payment card number is refused and not echoed", ok: "skip", detail: "not seated" });
        // C237 / C239 must still be reported when this visit wasn't seated (they used to be nested in the seated branch and vanished from the run).
        if (ctx.presigned) add(ctx, { id: "v050.one_card", level: L, ref: "§2.4, C237", title: "a card_presentation of another Shōkai visitor card in an encounter is refused (never a second card, never a seat)", ok: "skip", detail: skipNeedOwnerSign("a second owner-signed visitor card for the same representative key") });
        else add(ctx, { id: "v050.one_card", level: L, ref: "§2.4, C237", title: "a card_presentation of another Shōkai visitor card in an encounter is refused (never a second card, never a seat)", ok: "skip", detail: "not seated" });
        add(ctx, { id: "v050.size", level: L, ref: "§3.4, C239", title: "a message over max_message_bytes gets a bounded refusal", ok: "skip", detail: "not seated" });
      } else {
        const pan = "4111111111111111"; const spaced = "4111 1111 1111 1111";
        const out = await v.send(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: { note: `pay with ${spaced}` }, idempotency_key: ikey() }));
        const r = first(out, "act_decision", "act_result");
        const hdr = { ...v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: {} }) }; hdr.msg_id = `${v.encounterId}-${pan}`;
        const ho = await postRaw(place.entry, JSON.stringify(v.signed(hdr))); const hm = msgs(ho.body).map(pay);
        const echoed = (x: unknown) => { const s = JSON.stringify(x ?? null); return s.includes(pan) || s.includes(spaced); };
        add(ctx, { id: "v050.instrument", level: L, ref: "§5.4, C235", title: "a card number in an act's arguments is refused (CREDENTIAL_NOT_ACCEPTED), one in a header id gets the lobby with no in_reply_to; neither is echoed",
          ok: r?.type === "act_decision" && r.decision === "deny" && r.reason_code === "CREDENTIAL_NOT_ACCEPTED" && !echoed(out) && hm.some((m) => m.type === "lobby_briefing") && !hm.some((m) => m.in_reply_to) && !echoed(ho.body),
          detail: `arguments → ${code(r)}${echoed(out) ? " (echoed)" : ""}; header id → ${hm.map((m) => m.type).join(" → ") || "nothing"}${echoed(ho.body) ? " (echoed)" : ""}` });
        // C237: one Shōkai visitor card per encounter: another card (same key, another owner) presented in this encounter is refused.
        if (ctx.presigned) { add(ctx, { id: "v050.one_card", level: L, ref: "§2.4, C237", title: "a card_presentation of another Shōkai visitor card in an encounter is refused (never a second card, never a seat)", ok: "skip", detail: skipNeedOwnerSign("a second owner-signed visitor card for the same representative key") }); }
        else {
        const other = createRepresentative({ ownerName: "Oren Takahashi's other owner (conformance)", purposes: [purpose], actions: [plain.action], key: v.rep.key } as any);
        const proof = signRaw({ encounter_id: v.encounterId, nonce: randomId("n") }, v.rep.key).signatures[0];
        const co = await v.send(v.message("card_presentation", { card: other.card, possession_proof: { ...proof, key_id: other.card.payload.representative_key.key_id, signer: other.card.payload.representative_id } }));
        const cr = first(co, "invitation_response", "act_decision");
        add(ctx, { id: "v050.one_card", level: L, ref: "§2.4, C237", title: "a card_presentation of another Shōkai visitor card in an encounter is refused (never a second card, never a seat)",
          ok: other.card.payload_digest !== v.rep.card.payload_digest && !co.some((m: any) => m.type === "invitation_response" && m.seat) && (cr === undefined ? co.length === 0 : cr.decision === "deny"),
          detail: co.map((m: any) => code(m)).join(" → ") || "no answer" });
        }
        // C239: a message over the place's stated max_message_bytes (house summary; absent = 65536) gets a bounded refusal
        // (not_now / REQUEST_INCOMPLETE, nothing performed), never an integrity alarm or a finding. Performing it fails the check.
        // Sent raw so a refusal at the front (an HTTP 413/400 without a ReplyEnvelope) is seen as one, not as a transport error.
        const maxBytes = Number.isInteger(summary?.max_message_bytes) && summary.max_message_bytes >= 4096 ? summary.max_message_bytes : 65536;
        if (maxBytes > 4 * 1024 * 1024) add(ctx, { id: "v050.size", level: L, ref: "§3.4, C239", title: "a message over max_message_bytes gets a bounded refusal", ok: "skip", detail: `the place states ${maxBytes} bytes; the runner sends at most 4 MiB` });
        else {
          const bigRaw = await postRaw(place.entry, JSON.stringify(v.signed(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: { note: "a".repeat(maxBytes + 1) } })))).catch((e) => ({ status: 0, body: null, why: String(e) }));
          const front = !Array.isArray(bigRaw.body?.messages) && (bigRaw.status === 413 || bigRaw.status === 400);
          const big: any[] = front ? [] : Array.isArray(bigRaw.body?.messages) ? msgs(bigRaw.body).map(pay) : [{ type: "error", why: `HTTP ${bigRaw.status}` }];
          const b = first(big, "act_decision", "act_result", "misconduct_notice", "integrity_alarm");
          add(ctx, { id: "v050.size", level: L, ref: "§3.4, C239", title: `a message over the stated max_message_bytes (${maxBytes}${Number.isInteger(summary?.max_message_bytes) ? "" : ", the default"}) gets a bounded refusal (not_now / REQUEST_INCOMPLETE, or a 413 at the front), never a finding, never performed`,
            ok: big.some((m: any) => m.type === "misconduct_notice" || m.type === "integrity_alarm") ? false : b?.type === "act_decision" && b.reason_code === "REQUEST_INCOMPLETE" ? true : b?.type === "act_result" ? false : !big.length ? true : false,
            detail: big.length ? big.map((m: any) => m.type === "error" ? `error (${m.why})` : code(m)).join(" → ") : `no answer (a size limit at the front${front ? `: HTTP ${bigRaw.status}` : ""})` });
        }
        keep(v); await v.farewell().catch(() => undefined);
      }
    }
    // C234: the farewell is always accepted, also past the message cap, and answered only by the place's own farewell.
    { const { v } = await seatFor("Pilar Okonkwo");
      if (!v.seat) add(ctx, { id: "v050.farewell", level: L, ref: "§3.5, C234", title: "farewell always accepted", ok: "skip", detail: "not seated" });
      else {
        const cap = Number.isInteger(summary?.message_cap) ? summary.message_cap : undefined; let capped: any;
        if (cap !== undefined && cap <= 60) for (let i = 0; i <= cap; i++) { const x = first(await v.send(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: {} })), "act_decision", "act_result"); if (x?.reason_code === "RATE_LIMITED") { capped = x; break; } }
        const said = v.transcript.some((t) => t.dir === "in" && pay(t.message)?.type === "farewell");
        const fo = await v.send(v.message("farewell", { outcome: "completed" }));
        const refused = fo.some((m: any) => m.type === "act_decision" || m.type === "invitation_response" || m.type === "lobby_briefing");
        const answered = fo.filter((m: any) => m.type === "farewell").length;
        add(ctx, { id: "v050.farewell", level: L, ref: "§3.5, C234", title: `a farewell is accepted ${cap !== undefined && cap <= 60 ? `past the message cap (${cap}) ` : ""}and answered only by the place's own farewell, once per encounter`,
          ok: !refused && fo.every((m: any) => m.type === "farewell") && answered === (said ? 0 : 1) && (cap === undefined || cap > 60 || capped?.reason_code === "RATE_LIMITED"),
          detail: `${cap !== undefined ? (capped ? `cap reached (${code(capped)}); ` : cap > 60 ? `cap ${cap} not reached in this run; ` : "the cap never answered RATE_LIMITED; ") : "no message_cap stated; "}the place ${said ? "had already said its farewell (seated with it)" : "had not said its farewell"}; farewell → ${fo.map((m: any) => code(m)).join(" → ") || "nothing (accepted)"}` });
        keep(v);
      }
      // C234 / §6.10 guard 14: the host ends a live seat; exactly one closing farewell (outcome completed, this encounter, its wire tag) is
      // held for the visitor, a later act gets SEAT_SCOPE_EXCEEDED, and the visitor's own farewell gets no second one.
      if (!o.endSeat) add(ctx, { id: "v050.host_farewell", level: L, ref: "§3.5, §6.10, C234", title: "one closing farewell when the host ends a seat", ok: na("in-process"), detail: "ending a seat from the host side is off the wire: pass a hook (--host-console for the reference host) to run it here; otherwise classes.json evidence" });
      else {
        const { v } = await seatFor("Oskar Lindqvist");
        if (!v.seat) add(ctx, { id: "v050.host_farewell", level: L, ref: "§3.5, §6.10, C234", title: "one closing farewell when the host ends a seat", ok: "skip", detail: `not seated (${v.decision ?? v.withdrew ?? "no decision"})` });
        else {
          const ended = await o.endSeat(place.name, v.seat.seat_id).catch(() => false);
          const held = ended ? await v.pollInbox().catch(() => [] as any[]) : [];
          const fws = held.filter((m: any) => m?.type === "farewell");
          const late = ended ? first(await v.send(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: {}, idempotency_key: ikey() })), "act_decision", "act_result") : undefined;
          const fo = ended ? await v.send(v.message("farewell", { seat_id: v.seat.seat_id })).catch(() => [] as any[]) : [];
          keep(v);
          add(ctx, { id: "v050.host_farewell", level: L, ref: "§3.5, §6.10, C234", title: "when the host ends a seat: one closing farewell (completed, this encounter, its tag) held for the visitor; later acts SEAT_SCOPE_EXCEEDED; no second farewell",
            ok: !ended ? false : fws.length === 1 && fws[0].outcome === "completed" && fws[0].encounter_id === v.encounterId && fws[0].protocol === PROTOCOL
              && late?.type === "act_decision" && late.reason_code === "SEAT_SCOPE_EXCEEDED" && !fo.some((m: any) => m?.type === "farewell"),
            detail: !ended ? "the hook didn't end the seat" : `held: ${held.map((m: any) => m?.type).join(", ") || "nothing"}; act after → ${code(late)}; visitor farewell → ${fo.map((m: any) => code(m)).join(", ") || "accepted, nothing back"}` });
        }
      }
    }
  }

  // ---- C238: a revocation whose signature doesn't verify is neither acknowledged nor stored: the card still works
  if (plain) {
    const r = visitorRep(ctx.presigned, { ownerName: "Rafe Lindqvist (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const d = new Visit(r, place.entry, place.representative_id, httpTransport, place.display_name, place);
    await d.send(d.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    // A revocation whose signature does not verify: when pre-signed material is in use the runner has no owner signer, so it
    // signs with a throwaway key and flips the value (still unverified; never presented as an owner signature).
    const revSigner = ctx.presigned ? newPasskeyOwner() : r.owner;
    const rev = signRaw({ card_id: r.card.payload.card_id, card_digest: r.card.payload_digest, principal_id: r.card.payload.principal.principal_id, revoked_at: nowIso(), reason: "compromised" }, revSigner); rev.signatures[0].value = flipSig(rev.signatures[0].value);
    await d.send(d.message("card_revocation", { revocation: rev })); keep(d); await d.farewell().catch(() => undefined);
    const browse = ctx.presigned?.mandates.browse;
    if (ctx.presigned && !browse) { add(ctx, { id: "v050.revocation_verified", level: L, ref: "§12.1, C238", title: "a card_revocation whose signature doesn't verify is not stored: the card is still seated afterwards", ok: "skip", detail: skipNeedMandate("browse", "a later visit under the same card") }); }
    else {
    const after = await r.visit(place, { purpose, actions: [plain.action], why: "Conformance run: after a forged revocation.", ...(browse ? { useMandate: browse } : {}) }); keep(after);
    add(ctx, { id: "v050.revocation_verified", level: L, ref: "§12.1, C238", title: "a card_revocation whose signature doesn't verify is not stored: the card is still seated afterwards",
      ok: !!after.seat, detail: after.seat ? undefined : `${after.decision ?? after.withdrew ?? "no decision"}/${after.response?.disposition ?? ""}/${after.response?.reason_code ?? ""}` });
    await after.farewell().catch(() => undefined);
    }
  }
  add(ctx, { id: "v050.revocation_pressure", level: L, ref: "§12.1, C238", title: "storage limits never drop a revocation in force", ok: na("in-process"), detail: "needs a store filled to its limit, which HTTP can't reach; run in process (classes.json evidence)" });
  add(ctx, { id: "v050.passkey_counter", level: L, ref: "Appendix A.1, C240", title: "passkey counters must increase when nonzero", ok: na("in-process"), detail: "counters need an authenticator that counts; the runner's development passkey signs with 0 (the synced-passkey case); run in process (classes.json evidence)" });
  add(ctx, { id: "v050.pins", level: L, ref: "§3.1, C241", title: "a pinned host card is read from two sources", ok: na("role"), detail: "a visiting representative's duty (Core Visitor), not a door's" });
  // C242: a place that publishes closed templates refuses a signed card carrying a member its template doesn't list (x- members aside).
  const templates = brief?.templates ?? ctx.listing?.templates;
  if (!templates?.card || !plain) add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place that publishes a closed card template refuses a signed card with an unlisted member", ok: !templates?.card ? na("precondition") : "skip", detail: !templates?.card ? "the place publishes no closed card template (classes.json applicability)" : "the place lists no plain action to test it with" });
  else if (templates.closed !== true) add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place that publishes a closed card template refuses a signed card with an unlisted member", ok: na("precondition"), detail: "the templates aren't closed (no closed: true)" });
  else {
    const extra = "nickname"; const listed = extra in templates.card;
    if (listed) add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place whose templates say closed: true refuses a signed card with an unlisted member (deny, never a seat)", ok: "skip", detail: `the template lists ${extra}` });
    else if (ctx.presigned && !ctx.presigned.probes.off_template) add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place that publishes a closed card template refuses a signed card with an unlisted member", ok: "skip", detail: skipNeedProbe("an owner-signed visitor card carrying a member the closed template does not list") });
    else {
    const off = ctx.presigned?.probes.off_template;
    const r = off
      ? createPresignedRep(ctx.presigned!, { purposes: [purpose], actions: actions.map((a) => a.action), card: off })
      : createRepresentative({ ownerName: "Tomasz Ueda (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const card = off ?? signRaw({ ...r.card.payload, [extra]: "Tom" }, r.owner);
    const t = new Visit(r, place.entry, place.representative_id, httpTransport, place.display_name, place);
    const g = await t.send(t.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const proof = signRaw({ encounter_id: t.encounterId, nonce: g.find((m: any) => m.type === "greeting")?.nonce ?? "", ...(t.audience() ? { audience: t.audience() } : {}) }, r.key).signatures[0];
    const out = [...await t.send(t.message("card_presentation", { card, possession_proof: { ...proof, key_id: r.card.payload.representative_key.key_id, signer: r.card.payload.representative_id } }))];
    if (!out.some((m: any) => m.type === "invitation_response")) {
      if (off) { keep(t); await t.farewell().catch(() => undefined);
        add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place whose templates say closed: true refuses a signed card with an unlisted member (deny, never a seat)", ok: "skip", detail: "the door did not refuse the off-template card at presentation, and the runner has no owner-signed mandate bound to that card" });
      } else {
        out.push(...await t.send(t.message("introduction", { vouch: null })));
        out.push(...await t.send(t.message("invitation_request", { card_digest: card.payload_digest, mandate: r.mandate({ purpose, actions: [plain.action] }), proposal: { request: { actions: [plain.action] }, value_to_counterparty: { text: "Conformance run: an off-template card.", locale: "en-US" }, etiquette_register: "first_meeting" } })));
        const ir = out.find((m: any) => m.type === "invitation_response"); keep(t); await t.farewell().catch(() => undefined);
        add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place whose templates say closed: true refuses a signed card with an unlisted member (deny, never a seat)",
          ok: ir?.decision === "deny" && !ir.seat, detail: `card with "${extra}" → ${code(ir)}` });
      }
    } else {
      const ir = out.find((m: any) => m.type === "invitation_response"); keep(t); await t.farewell().catch(() => undefined);
      add(ctx, { id: "v050.templates", level: L, ref: "§2.2, C242", title: "a place whose templates say closed: true refuses a signed card with an unlisted member (deny, never a seat)",
        ok: ir?.decision === "deny" && !ir.seat, detail: `card with "${extra}" → ${code(ir)}` });
    }
    }
  }

  const paths = Array.isArray(summary?.trust_paths) ? summary.trust_paths : [];
  // C243: a fresh visitor asking only for an action with a trust requirement it can't meet: deny / not_now / TRUST_REQUIRED, with the
  // `trust` readiness item (every path's kind with owner_text, the listing's kinds only), retry with_credential, and never a penalty
  // (the same representative agent is then seated for a plain action). Under shokai/0.3: a v0.4.0 code and no v0.5.0 member.
  // C244 (receipts) and C245 (introduction cards) need an issuer or an introducer the place names: a fixture, so they stay skipped.
  const trustAct = actions.find((a) => !a.spends && paths.some((p: any) => p.action === a.action) && Array.isArray(a.purposes) && a.purposes.length);
  if (!trustAct || !plain) add(ctx, { id: "v050.trust", level: L, ref: "§6.9, C243", title: "an unmet trust requirement is directions home, never a penalty", ok: "skip",
    detail: paths.length ? `the summary lists trust paths only for spending actions (${paths.map((p: any) => p.action).join(", ")}); the runner doesn't spend to test them` : "the place states no trust requirements" });
  else if (ctx.presigned) {
    add(ctx, { id: "v050.trust", level: L, ref: "§6.9, C243", title: "an unmet trust requirement is directions home, never a penalty", ok: "skip", detail: skipNeedOwnerSign("a fresh mandate for the trust-gated action, then a later plain visit") });
    add(ctx, { id: "v050.trust_legacy", level: L, ref: "§6.9, C243, C254", title: "under shokai/0.3 a trust refusal uses a v0.4.0 code (POLICY_DENY) and carries no v0.5.0 member", ok: "skip", detail: skipNeedOwnerSign("a shokai/0.3 invitation with an owner-signed mandate for the trust-gated action") });
  }
  else {
    const tp = trustAct.purposes[0], listed: string[] = trustAct.trust?.paths ?? [];
    const r = createRepresentative({ ownerName: "Rafael Okoye (conformance test owner)", purposes: [tp, purpose], actions: actions.map((a) => a.action) });
    const v = await r.visit(place, { purpose: tp, actions: [trustAct.action], why: "Conformance run: an action with a trust requirement." }); keep(v);
    const res = v.response; const ri = (res?.readiness_requirements ?? []).find((x: any) => x?.code === "trust");
    const kinds = (ri?.trust_paths ?? []).map((x: any) => x?.kind);
    const after = await r.visit(place, { purpose, actions: [plain.action], why: "Conformance run: a plain visit after a trust refusal." }); keep(after);
    const seatedAfter = !!after.seat; await after.farewell().catch(() => undefined); if (v.seat) await v.farewell().catch(() => undefined);
    add(ctx, { id: "v050.trust", level: L, ref: "§6.9, C243", title: "an unmet trust requirement: deny / not_now / TRUST_REQUIRED with the trust item (every path, kinds only, each with owner_text) and retry with_credential; the listing shows kinds only; never a penalty",
      ok: res?.decision === "deny" && res.disposition === "not_now" && res.reason_code === "TRUST_REQUIRED" && ri?.required === true && kinds.length > 0
        && (ri.trust_paths as any[]).every((x) => typeof x?.owner_text?.text === "string" && x.owner_text.text.trim().length > 0) && JSON.stringify([...new Set(kinds)].sort()) === JSON.stringify([...new Set(listed)].sort())
        && res.retry?.kind === "with_credential" && Array.isArray(res.retry.credentials) && res.retry.credentials.length > 0 && !/min_|clean_days|min_value/.test(JSON.stringify(trustAct)) && seatedAfter,
      detail: `${trustAct.action} → ${code(res)}${ri ? `; trust item: ${kinds.join(", ")}` : ""}; listing: ${listed.join(", ") || "none"}; then ${plain.action} → ${seatedAfter ? "seated (no penalty)" : code(after.response)}` });
    // under shokai/0.3, by hand (the SDK never downgrades itself)
    const r3 = createRepresentative({ ownerName: "Mina Castell (conformance test owner)", purposes: [tp], actions: actions.map((a) => a.action) });
    const w = new Visit(r3, place.entry, place.representative_id, httpTransport, place.display_name, place, LEGACY_TAG as any);
    const g = await w.send(w.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const proof = signRaw({ encounter_id: w.encounterId, nonce: g.find((m: any) => m.type === "greeting")?.nonce ?? "", ...(w.audience() ? { audience: w.audience() } : {}) }, r3.key).signatures[0];
    const out = [...await w.send(w.message("card_presentation", { card: r3.card, possession_proof: { ...proof, ...(w.audience() ? { audience: w.audience() } : {}), key_id: r3.card.payload.representative_key.key_id, signer: r3.card.payload.representative_id } }))];
    if (!out.some((m: any) => m.type === "invitation_response")) { out.push(...await w.send(w.message("introduction", { vouch: null })));
      out.push(...await w.send(w.message("invitation_request", { card_digest: r3.card.payload_digest, mandate: r3.mandate({ purpose: tp, actions: [trustAct.action] }), proposal: { request: { actions: [trustAct.action] }, value_to_counterparty: { text: "Conformance run: a shokai/0.3 visitor.", locale: "en-US" }, etiquette_register: "first_meeting" } }))); }
    const ir3 = out.find((m: any) => m.type === "invitation_response"); keep(w); await w.farewell().catch(() => undefined);
    add(ctx, { id: "v050.trust_legacy", level: L, ref: "§6.9, C243, C254", title: "under shokai/0.3 a trust refusal uses a v0.4.0 code (POLICY_DENY) and carries no v0.5.0 member",
      ok: !ir3 ? false : ir3.decision !== "grant" && ir3.reason_code === "POLICY_DENY" && !/trust_paths|TRUST_REQUIRED/.test(JSON.stringify(ir3)), detail: code(ir3) });
  }
  add(ctx, { id: "v050.trust_receipts", level: L, ref: "§6.9, C244, C245", title: "TrustReceipt checks and Shōkai introduction card limits", ok: na("class"), detail: "ext-trust-receipts and ext-introduction-card (provisional) not offered: the place names no receipt issuer and no introducer" });
  add(ctx, { id: "v050.errand_budget", level: L, ref: "§5.5, C247", title: "errand budgets stay home and errand_used is reported", ok: na("role"), detail: "a visiting representative's duty (ext-spending, role visitor), not observable at a door" });

  // ---- C300 / C301 (H1(e), H1(f); normative rule change 2026-11-09): a well-signed mandate (re-signed after min_protocol is set; never a stale mutated signature).
  const protoAct = plain ?? actions[0];
  const protoPurpose = protoAct?.purposes?.[0] ?? purpose ?? "visitation";
  const requestPinned = async (who: string, tag: string, minProtocol: unknown): Promise<any> => {
    // Raw signed posts (not Visit.send): the visiting SDK never presents a malformed min_protocol (C298 / SHOKAI_BAD_TAG).
    const role = minProtocol === "0.5" ? "c300" as const : minProtocol === "shokai/0.6" ? "c301" as const : undefined;
    let r: ReturnType<typeof createRepresentative>;
    let mand: any;
    if (ctx.presigned) {
      if (!role || !ctx.presigned.mandates[role]) return { skip: skipNeedMandate(role ?? "c300", `a well-signed mandate whose min_protocol is ${JSON.stringify(minProtocol)}`) };
      r = createPresignedRep(ctx.presigned, { purposes: [protoPurpose], actions: (actions.length ? actions.map((a: any) => a.action) : [protoAct.action]) });
      mand = ctx.presigned.mandates[role]; // present as-is; never re-signed or mutated
    } else {
      r = createRepresentative({ ownerName: `${who} (conformance test owner)`, purposes: [protoPurpose], actions: (actions.length ? actions.map((a) => a.action) : [protoAct.action]) });
      const base = r.mandate({ purpose: protoPurpose, actions: [protoAct.action] });
      const q: any = { ...base.payload, mandate_id: randomId("mand"), min_protocol: minProtocol, crit: [...((base.payload as any).crit ?? []), "min_protocol"] };
      mand = sign(q, (r as any).owner, q.issued_at ?? q.valid_from ?? nowIso());
    }
    const enc = randomId("enc"); let n = 0;
    const msg = (type: string, body: Record<string, unknown>) => sign({ protocol: tag, encounter_id: enc, msg_id: `${enc}-v${++n}`, sent_at: nowIso(), from: r.card.payload.representative_id, to: place.representative_id, type, ...body } as any, (r as any).key, nowIso());
    const post = async (m: unknown) => msgs((await postRaw(place.entry, JSON.stringify(m))).body).map(pay);
    const g = await post(msg("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const hostNonce = g.find((x: any) => x.type === "greeting")?.nonce ?? "";
    const aud = tag === PROTOCOL ? place.representative_id : undefined;
    const proof = signRaw({ encounter_id: enc, nonce: hostNonce, ...(aud ? { audience: aud } : {}) }, r.key).signatures[0];
    await post(msg("card_presentation", { card: r.card, possession_proof: { ...proof, key_id: r.card.payload.representative_key.key_id, signer: r.card.payload.representative_id, ...(aud ? { audience: aud } : {}) } }));
    await post(msg("introduction", { vouch: null }));
    const inv = msg("invitation_request", { card_digest: r.card.payload_digest, mandate: mand, proposal: { request: { actions: [protoAct.action] }, value_to_counterparty: { text: "Conformance run: min_protocol.", locale: "en-US" }, etiquette_register: "first_meeting" } });
    const reqId = (inv as any)?.payload?.msg_id ?? (inv as any)?.msg_id;
    const out = await post(inv);
    return { enc, reqId, out, resp: out.find((x: any) => x.type === "invitation_response" && (x.encounter_id === enc || (!!reqId && x.in_reply_to === reqId))), brief: out.find((x: any) => x.type === "lobby_briefing") };
  };
  if (!protoAct) {
    add(ctx, { id: "v050.min_protocol_malformed", level: L, ref: "§11.1, C300", title: "a well-signed mandate whose min_protocol is not a wire tag is MANDATE_INVALID", ok: "skip", detail: "the place lists no action the runner can request" });
    add(ctx, { id: "v050.min_protocol_above_tag", level: L, ref: "§11.1, C301", title: "a well-signed mandate whose min_protocol is above the request's own tag gets the version-mismatch lobby only", ok: "skip", detail: "the place lists no action the runner can request" });
  } else {
    const bad = await requestPinned("Pia Voss", PROTOCOL, "0.5");
    if (bad.skip) add(ctx, { id: "v050.min_protocol_malformed", level: L, ref: "§11.1, C300", title: "a well-signed shokai/0.5 invitation_request whose mandate carries min_protocol \"0.5\" (not a wire tag) is deny / not_now / MANDATE_INVALID, retry with_credential [signed_mandate], no version-mismatch lobby", ok: "skip", detail: bad.skip });
    else {
    const creds = JSON.stringify(bad.resp?.retry?.credentials ?? []);
    add(ctx, { id: "v050.min_protocol_malformed", level: L, ref: "§11.1, C300",
      title: "a well-signed shokai/0.5 invitation_request whose mandate carries min_protocol \"0.5\" (not a wire tag) is deny / not_now / MANDATE_INVALID, retry with_credential [signed_mandate], no version-mismatch lobby",
      ok: !!bad.resp && bad.resp.decision === "deny" && bad.resp.disposition === "not_now" && bad.resp.reason_code === "MANDATE_INVALID" && creds === '["signed_mandate"]' && !bad.brief,
      detail: `visitor invitation_response ${[bad.resp?.decision, bad.resp?.disposition, bad.resp?.reason_code].filter(Boolean).join(" / ") || "none"}; types=${bad.out.map((x: any) => x.type).join(",")}; briefing=${bad.brief ? "present" : "none"}` });
    }
    const hi = await requestPinned("Pia Voss", PROTOCOL, "shokai/0.6");
    // H1(f): "the visitor's encounter" means an invitation_response whose encounter_id is this visit's, or whose in_reply_to names this invitation_request — not a briefing that happens to include an invitation_response for someone else.
    if (hi.skip) add(ctx, { id: "v050.min_protocol_above_tag", level: L, ref: "§11.1, C301", title: "a well-signed shokai/0.5 invitation_request whose mandate carries min_protocol above the request's own tag (shokai/0.6) is answered with the version-mismatch lobby only", ok: "skip", detail: hi.skip });
    else {
    const visitorIr = hi.out.filter((x: any) => x.type === "invitation_response" && (x.encounter_id === hi.enc || (!!hi.reqId && x.in_reply_to === hi.reqId)));
    add(ctx, { id: "v050.min_protocol_above_tag", level: L, ref: "§11.1, C301",
      title: "a well-signed shokai/0.5 invitation_request whose mandate carries min_protocol above the request's own tag (shokai/0.6) is answered with the version-mismatch lobby only: a lobby_briefing (spec_ref 0.5.0) and MUST NOT also an invitation_response in the visitor's encounter (same encounter_id) or in_reply_to that invitation_request",
      ok: !hi.resp && visitorIr.length === 0 && !!hi.brief && hi.brief.spec_ref?.version === "0.5.0",
      detail: `types=${hi.out.map((x: any) => x.type).join(",")}; spec_ref=${hi.brief?.spec_ref?.version ?? "none"}; visitor_invitation_response=${visitorIr.length}; encounter=${hi.enc}; in_reply_to_req=${hi.reqId ?? "none"}` });
    }
  }

  // ---- C230–C232: purchase holds (only where the Shōkai host card has the hold_purchases duty; nothing is released without `spend`)
  await holdChecks(ctx, place, hostCard, actions, summary, o, keep);

  // ---- C255: deletion requests and receipts
  if (plain && ctx.presigned) {
    for (const [id, title] of [["v050.deletion_held", "a signed deletion_request is answered held, answer_by within 30 days; one for another place, or unsigned, is ignored"], ["v050.deletion_receipt", "a deletion receipt"], ["v050.deletion_ledgers", "deletion ledgers"]] as const)
      add(ctx, { id, level: L, ref: "§12.4, C255", title, ok: "skip", detail: skipNeedOwnerSign("an owner-signed deletion_request (and, for some rows, a fresh max_operations 1 mandate)") });
  } else if (plain) {
    const r = createRepresentative({ ownerName: "Saoirse Mbeki (conformance test owner)", purposes: [purpose], actions: actions.map((a) => a.action) });
    const lim = { max_operations: 1 }; const m = r.mandate({ purpose, actions: [plain.action], limits: lim, validSeconds: 600 });
    const v = await r.visit(place, { purpose, actions: [plain.action], limits: lim, useMandate: m, why: "Conformance run: a deletion request." });
    v.checkSeatLocally = false; v.checkMandateLocally = false;
    if (!v.seat) add(ctx, { id: "v050.deletion", level: L, ref: "§12.4, C255", title: "deletion requests", ok: "skip", detail: `not seated (${v.decision ?? v.withdrew ?? "no decision"})` });
    else {
      const a1 = first(await v.send(v.message("act", { seat_id: v.seat.seat_id, tool: plain.action, arguments: {} })), "act_result", "act_decision");
      const t0 = Date.now(); const req = r.deletionRequest(place.principal_id);
      const held = await v.requestDeletion(req);
      const ab = held?.answer_by ? Date.parse(held.answer_by) : NaN;
      const elsewhere = r.deletionRequest("did:web:another-place.example");
      const oe = await v.send(v.message("deletion_request", { request: elsewhere }));
      const unsigned = await v.send(v.message("deletion_request", { request: { ...req.payload, request_id: randomId("del") } }));
      add(ctx, { id: "v050.deletion_held", level: L, ref: "§12.4, C255", title: "a signed deletion_request is answered held, answer_by within 30 days; one for another place, or unsigned, is ignored",
        ok: held?.type === "held" && ab > t0 - 5000 && ab <= t0 + 30 * 86400e3 + 5000 && !oe.some((x: any) => x.type === "held") && !unsigned.some((x: any) => x.type === "held"),
        detail: `signed → ${held ? `held, answer_by ${held.answer_by}` : "no held"}; other place → ${oe.map((x: any) => x.type).join(",") || "nothing"}; unsigned → ${unsigned.map((x: any) => x.type).join(",") || "nothing"}` });
      let rec: any; for (let i = 0; i < 6 && !rec; i++) { rec = (await v.pollInbox().catch(() => [])).find((x: any) => x?.type === "deletion_receipt" && x.request_id === req.payload.request_id); if (!rec) await sleep(500); }
      const cls: any[] = Array.isArray(summary?.third_party_classifiers) ? summary.third_party_classifiers : [];
      const mps: any[] = Array.isArray(summary?.model_providers) ? summary.model_providers : [];
      add(ctx, { id: "v050.deletion_receipt", level: L, ref: "§12.4, C255", title: "a deletion_receipt comes to the inbox: request_digest, what was requested, deleted and kept (with why), and each named outside service as confirmed or pending",
        ok: !!rec && rec.request_digest === req.payload_digest && Array.isArray(rec.requested) && Array.isArray(rec.deleted) && Array.isArray(rec.kept)
          && rec.kept.every((k: any) => typeof k.kind === "string" && (k.reason === "required_record" || (["legal_obligation", "legal_claim"].includes(k.reason) && typeof k.detail === "string" && k.detail.length > 0)))
          && Array.isArray(rec.outside_services) && rec.outside_services.every((x: any) => ["classifier", "model_provider"].includes(x.role) && ["confirmed", "pending"].includes(x.status))
          && [...cls.map((c) => [c.name, "classifier"]), ...mps.map((c) => [c.name, "model_provider"])].every(([n, role]) => rec.outside_services.some((x: any) => x.name === n && x.role === role)),
        detail: rec ? `deleted ${rec.deleted?.join(", ")}; kept ${rec.kept?.map((k: any) => `${k.kind} (${k.reason})`).join(", ") || "nothing"}; outside services ${rec.outside_services?.map((c: any) => `${c.name} (${c.role}) ${c.status}`).join(", ") || "none"}` : "no deletion_receipt in the inbox" });
      // Findings and ledgers survive: the mandate's max_operations 1 was used before the deletion; a new seat under it still can't act.
      await v.farewell().catch(() => undefined); keep(v);
      const vb = await r.visit(place, { purpose, actions: [plain.action], limits: lim, useMandate: m, why: "Conformance run: the same mandate after a deletion." });
      vb.checkSeatLocally = false; vb.checkMandateLocally = false;
      const a2 = vb.seat ? first(await vb.send(vb.message("act", { seat_id: vb.seat.seat_id, tool: plain.action, arguments: {} })), "act_result", "act_decision") : vb.response;
      add(ctx, { id: "v050.deletion_ledgers", level: L, ref: "§12.4, §5.1, C255", title: "ledgers survive a deletion: a mandate used up before it stays used up",
        ok: a1?.type !== "act_result" ? "skip" : !(a2?.type === "act_result" && a2.ok), detail: `before → ${code(a1)}; after the deletion, under the same mandate → ${code(a2)}` });
      keep(vb); await vb.farewell().catch(() => undefined);
    }
  }

  // ---- C249, C251–C253: what the place sent in these checks
  const all = seen.map((t) => pay(t.message));
  const ack = all.filter((m) => acknowledgementOnly(m));
  add(ctx, { id: "v050.no_ack_only", level: L, ref: "§6.6, C249", title: "the place sent no acknowledgement-only message", ok: all.length ? !ack.length : "skip", detail: ack.length ? ack.map((m) => m.type).join(", ") : `${all.length} message(s) read` });
  const leak = all.filter((m) => NEVER_ON_WIRE.some((k) => JSON.stringify(m).includes(`"${k}"`)));
  add(ctx, { id: "v050.never_on_wire", level: L, ref: "§8.3, §2.3, C251, C252", title: "return-with-care preferences, errand budgets and door-question records never appear on the wire", ok: all.length ? !leak.length : "skip", detail: leak.length ? leak.map((m) => m.type).join(", ") : undefined });
  add(ctx, { id: "v050.appendix_e", level: L, ref: "Appendix E, C253", title: "Appendix E (cost profile) is informative", ok: na("informative"), detail: "Appendix E is informative: nothing to test" });
  // C236: with the implementation's start hook, each invalid house-config member is refused at start-up, naming the member.
  if (!o.tryConfig) add(ctx, { id: "v050.config_refusals", level: L, ref: "§2.3, C236", title: "start-up refusals for each invalid house-config member", ok: na("in-process"), detail: "starting a door is off the wire: pass a start hook (--host-console for the reference host) to run it here; otherwise classes.json evidence" });
  else {
    const svc = { purpose: { text: "Fixture.", locale: "en-US" }, jurisdiction: ["US"], retention_days: 30, role: "processor" };
    const q = { question_id: "q", text: "How did you hear of us?", locale: "en-US" };
    const cases: [string, Record<string, unknown>, string][] = [
      ["an unregistered conduct code", { conduct_rules: [{ code: "no_shouting", text: "Be calm.", locale: "en-US" }] }, "conduct_rules"],
      ["a conduct rule with empty text", { conduct_rules: [{ code: "x-calm", text: "", locale: "en-US" }] }, "conduct_rules"],
      ["a classifier named \"*\"", { third_party_classifiers: [{ name: "*", ...svc }] }, "third_party_classifiers"],
      ["a classifier keeping content 91 days", { third_party_classifiers: [{ name: "Fixture Screen", ...svc, retention_days: 91 }] }, "third_party_classifiers"],
      ["an incomplete model provider", { model_providers: [{ name: "Fixture Inference" }] }, "model_providers"],
      ["retention_days 91", { retention_days: 91 }, "retention_days"],
      ["four door questions", { door_questions: [q, q, q, q] }, "door_questions"],
      ["message_cap 0", { message_cap: 0 }, "message_cap"],
      ["repeat_caps 2.5", { repeat_caps: { per_hold: 2.5 } }, "repeat_caps"],
      ["max_message_bytes 100", { max_message_bytes: 100 }, "max_message_bytes"],
      ["a summary that differs from the policy", { summary: { retention_days: 10 } }, "summary_retention_days"],
    ];
    const base = await o.tryConfig(place.name, {}).catch(() => null);
    const got: string[] = []; let bad = 0;
    for (const [what, patch, member] of cases) { const p = await o.tryConfig(place.name, patch).catch(() => null); const okc = !!p && p.includes(member); if (!okc) bad++; got.push(`${what} → ${p ? (p.length ? p.join(", ") : "started") : "no answer"}`); }
    add(ctx, { id: "v050.config_refusals", level: L, ref: "§2.3, C236", title: "the door starts with its own house config and refuses to start on each invalid member, naming it",
      ok: Array.isArray(base) && base.length === 0 && bad === 0, detail: `as served → ${base ? (base.length ? base.join(", ") : "starts") : "no answer"}; ${got.filter((x) => !/→ .*(conduct_rules|classifiers|model_providers|retention_days|door_questions|message_cap|repeat_caps|max_message_bytes|summary_)/.test(x)).join("; ") || `${cases.length} invalid configs refused`}` });
  }
}

async function holdChecks(ctx: Ctx, place: any, hostCard: any, actions: any[], summary: any, o: V050Opts, keep: (v: Visit) => void) {
  const T = "purchase holds";
  if (ctx.presigned) {
    const why = skipNeedOwnerSign("a fresh spending mandate (e.g. max_amount 1.00), a superseding raise bound to a live hold_id, and an owner decline — those signatures can only be made at hold time");
    for (const [id, title] of [
      ["v050.hold_over_limit", "an act above the limit is held with exact over_limit figures, and released only by a superseding mandate bound to that hold"],
      ["v050.hold_policies", "hold policies are checked before the amount"],
      ["v050.hold_decline", "the owner's decline ends the hold at once"],
      ["v050.hold_grace", "one clock, one grace (≤ 5 s)"],
      ["v050.hold_place_limit", "an act above the place's own limit is refused, never held"],
      ["v050.hold_legacy", "under shokai/0.3 an act above the limit is refused (SEAT_SCOPE_EXCEEDED), never held over the limit"],
      ["v050.hold_release", "the raise releases that act alone"],
    ] as const) add(ctx, { id, level: L, ref: "§7.3, C230–C232", title, ok: "skip", detail: why });
    return;
  }
  const sp = actions.find((a) => a.spends && (a.needs ?? "standard") === "standard" && !a.creates_account && !a.requires_introduction);
  // The place's own limit for the action, as its house summary states it (the listing carries none): the highest offers[].max_amount
  // for the action, capped by summary.limits.max_amount when both are stated in one currency; either alone when only one is.
  const pl: { value: string; currency: string } | undefined = sp ? placeLimit(summary, sp.action) : undefined;
  const duties: string[] = hostCard?.host_scope?.duties ?? [];
  if (!sp || !duties.includes("hold_purchases")) {
    for (const id of ["v050.hold_over_limit", "v050.hold_grace", "v050.hold_policies"]) add(ctx, { id, level: L, ref: "§7.3, C230–C232", title: T, ok: "skip",
      detail: !sp ? "the place lists no spending action" : "the place's Shōkai host card has no hold_purchases duty (no purchase holds)" });
    return;
  }
  const cur = pl?.currency ?? o.spend?.currency ?? "USD"; const d = Math.max(2, (String(pl?.value ?? "").split(".")[1] ?? "").length);
  const M = (v: string) => money(unitsOf(v, d), d, cur); const purpose = sp.purposes?.[0];
  const args = o.spend?.args ?? {};
  // A seat under a mandate of `max`, for a visitor card that discloses the purchase-only live prompt.
  const seat = async (who: string, max: string, tag?: string) => {
    const r = createRepresentative({ ownerName: `${who} (conformance test owner)`, purposes: [purpose], actions: actions.map((a) => a.action), ownerPrompts: "purchase_only" });
    if (!tag) { const v = await r.visit(place, { purpose, actions: [sp.action], limits: { max_amount: M(max) }, why: "Conformance run: purchase holds." });
      v.checkSeatLocally = false; v.checkMandateLocally = false; return { r, v }; }
    // A plain shokai/0.3 visitor (the SDK never downgrades itself, §11.1): the ritual by hand, every message tagged shokai/0.3.
    const v = new Visit(r, place.entry, place.representative_id, httpTransport, place.display_name, place, tag as any);
    const g = await v.send(v.message("greeting", { locales: ["en-US"], nonce: randomId("n") }));
    const proof = signRaw({ encounter_id: v.encounterId, nonce: g.find((m: any) => m.type === "greeting")?.nonce ?? "", ...(v.audience() ? { audience: v.audience() } : {}) }, r.key).signatures[0];
    await v.send(v.message("card_presentation", { card: r.card, possession_proof: { ...proof, ...(v.audience() ? { audience: v.audience() } : {}), key_id: r.card.payload.representative_key.key_id, signer: r.card.payload.representative_id } }));
    await v.send(v.message("introduction", { vouch: null }));
    const m = r.mandate({ purpose, actions: [sp.action], limits: { max_amount: M(max) } }); v.mandateSent = m;
    await v.send(v.message("invitation_request", { card_digest: r.card.payload_digest, mandate: m, proposal: { request: { actions: [sp.action], limits: { max_amount: M(max) } }, value_to_counterparty: { text: "Conformance run: a shokai/0.3 visitor.", locale: "en-US" }, etiquette_register: "first_meeting" } }));
    v.checkSeatLocally = false; v.checkMandateLocally = false; return { r, v };
  };
  // --spend-args, when given, is the action's whole argument set besides amount; else the reference's {amount, payment_ref}.
  const hold = async (v: Visit, amount: string, ref: string) => first(await v.send(v.message("act", { seat_id: v.seat!.seat_id, tool: sp.action, arguments: { ...(o.spend?.args ? {} : { payment_ref: ref }), ...args, amount: M(amount) }, hold_for_owner: true, ...(v.tag === PROTOCOL ? { idempotency_key: ikey() } : {}) })), "act_held", "act_decision", "act_result");
  const confirm = async (v: Visit, hold_id: string, body: Record<string, unknown>) => first(await v.send(v.message("act_confirmation", { seat_id: v.seat!.seat_id, hold_id, ...body, idempotency_key: ikey() })), "act_decision", "act_result");
  /** A consent that can't verify for this hold (wrong digest): CREDENTIAL_REQUIRED while the hold lives, HOLD_LAPSED after. */
  const probe = (r: Representative, h: any) => signRaw({ consent_id: randomId("oc"), owner_id: r.owner.id, representative_id: r.id, action: "approve_purchase", decision: "approve",
    subject_ref: { kind: "act", id: h.hold_id, digest: digestOf({ not: "this act" }) }, assurance: "passkey", expires_at: h.expires_at, issued_at: nowIso(), shown_to_owner: { text: "Conformance probe.", locale: "en-US" } }, r.owner);
  const decline = (r: Representative, h: any) => signRaw({ consent_id: randomId("oc"), owner_id: r.owner.id, representative_id: r.id, action: "approve_purchase", decision: "decline",
    subject_ref: { kind: "act", id: h.hold_id, digest: h.act_digest }, assurance: "passkey", expires_at: h.expires_at, issued_at: nowIso(), shown_to_owner: { text: "Decline this purchase.", locale: "en-US" } }, r.owner);
  const resign = (r: Representative, sm: any, f: (p: any) => void) => { const p = JSON.parse(JSON.stringify(sm.payload)); f(p); return signRaw(p, r.owner); };

  // C230 over the limit: mandate 1.00, a 2.00 purchase asked to be held → act_held with over_limit {1.00, 0.00, 2.00}.
  const { r, v } = await seat("Aya Linden", "1.00");
  if (!v.seat) { add(ctx, { id: "v050.hold_over_limit", level: L, ref: "§7.3, C230", title: T, ok: "skip", detail: `not seated for ${sp.action} (${v.decision ?? v.withdrew ?? "no decision"}${v.response?.reason_code ? " " + v.response.reason_code : ""})` }); return; }
  const h = await hold(v, "2.00", "conf-1");
  const ol = h?.over_limit;
  if (h?.type !== "act_held" || !ol) {
    add(ctx, { id: "v050.hold_over_limit", level: L, ref: "§7.3, C230", title: "an act above the mandate's limit, asked to be held, is held with exact over_limit figures", ok: performed(h) ? false : "skip",
      detail: performed(h) ? "performed above the limit" : argsRefused(h) ? argsNote(h) : `${code(h)}: the place doesn't hold over the limit (no limit_calls)` });
  } else {
    const figures = sameMoney(ol.limit, M("1.00")) && sameMoney(ol.current, M("0")) && sameMoney(ol.proposed, M("2.00"));
    const raise = r.supersedingMandate(v.mandateSent!, h, `${place.display_name}: this one purchase of ${cur} 2.00 above your ${cur} 1.00 limit, approve by ${h.expires_at}.`);
    const consent = await confirm(v, h.hold_id, { consent: probe(r, h) });
    const above = await confirm(v, h.hold_id, { mandate: resign(r, raise, (p) => { p.limits.max_amount = M("3.00"); }) });
    const below = await confirm(v, h.hold_id, { mandate: resign(r, raise, (p) => { p.limits.max_amount = M("1.50"); }) });
    const later = await confirm(v, h.hold_id, { mandate: resign(r, raise, (p) => { p.expires_at = new Date(Date.parse(h.expires_at) + 3600e3).toISOString().replace(/\.\d+Z$/, "Z"); }) });
    const unshown = await confirm(v, h.hold_id, { mandate: resign(r, raise, (p) => { delete p.shown_to_owner; }) });
    const unbound = await confirm(v, h.hold_id, { mandate: resign(r, raise, (p) => { delete p.supersedes.hold; }) });
    const cr = (x: any) => x?.type === "act_decision" && x.reason_code === "CREDENTIAL_REQUIRED";
    const refusals = { consent, above, below, later, unshown, unbound };
    add(ctx, { id: "v050.hold_over_limit", level: L, ref: "§7.3, C230", title: "an act above the limit is held with exact over_limit figures, and released only by a superseding mandate bound to that hold, max_amount = proposed, expiring no later than the hold, shown to the owner",
      ok: figures && Object.values(refusals).every(cr),
      detail: `over_limit ${ol.limit?.value}/${ol.current?.value}/${ol.proposed?.value}; ${Object.entries(refusals).filter(([, x]) => !cr(x)).map(([k, x]) => `${k} → ${code(x)}`).join("; ") || "consent, above, below, later expiry, no shown_to_owner and unbound all refused (CREDENTIAL_REQUIRED)"}` });
    // C232: one open hold (when the place limits open holds): a second purchase during it is refused before its amount is looked at.
    const hp = (await getJson(place.entry.replace(/\/$/, "") + "/house-summary.json").catch(() => ({ body: null } as any))).body?.hold_policies;
    const second = await hold(v, "0.50", "conf-2");
    add(ctx, { id: "v050.hold_policies", level: L, ref: "§7.3, C232", title: "hold policies are checked before the amount: with max_open_holds 1, a second purchase during an open hold is not_now / POLICY_DENY (retry after the open hold ends)",
      ok: hp?.max_open_holds !== 1 ? "skip" : second?.type === "act_decision" && second.reason_code === "POLICY_DENY" && second.retry?.kind === "after",
      detail: hp?.max_open_holds !== 1 ? `the summary states hold_policies ${JSON.stringify(hp ?? null)} (the check needs max_open_holds 1)` : `second purchase → ${code(second)}${second?.retry ? " " + JSON.stringify(second.retry) : ""}` });
    // Decline: the hold ends at once (HOLD_LAPSED), and a new hold can be made right away (it no longer counts).
    const dec = await confirm(v, h.hold_id, { consent: decline(r, h) });
    const afterDec = await hold(v, "2.00", "conf-3");
    add(ctx, { id: "v050.hold_decline", level: L, ref: "§7.3, C230, C232", title: "the owner's decline ends the hold at once: HOLD_LAPSED, and it stops counting (a new hold is made at once)",
      ok: dec?.type === "act_decision" && dec.reason_code === "HOLD_LAPSED" && afterDec?.type === "act_held", detail: `decline → ${code(dec)}; a new purchase → ${code(afterDec)}` });
    // C231: one clock, grace ≤ 5 s. Held just before expires_at; lapsed after expires_at + 5 s (any valid grace) or the stated grace.
    const life = afterDec?.type === "act_held" ? Date.parse(afterDec.expires_at) - Date.now() : NaN;
    if (!(life <= 30_000)) add(ctx, { id: "v050.hold_grace", level: L, ref: "§7.3, C231", title: "one clock, one grace (≤ 5 s)", ok: "skip", detail: afterDec?.type === "act_held" ? `holds last ${Math.round(life / 1000)} s here; the check waits for one to end (use a fixture place with holds ≤ 30 s)` : "no hold to time" });
    else {
      const exp = Date.parse(afterDec.expires_at); const g = o.holdGrace;
      await sleep(exp - Date.now() - 1500); const before = await confirm(v, afterDec.hold_id, { consent: probe(r, afterDec) });
      let inside: any; if (g !== undefined && g >= 1) { await sleep(exp + (g - 0.6) * 1000 - Date.now()); inside = await confirm(v, afterDec.hold_id, { consent: probe(r, afterDec) }); }
      await sleep(exp + ((g ?? 5) + 1.2) * 1000 - Date.now()); const outside = await confirm(v, afterDec.hold_id, { consent: probe(r, afterDec) });
      const alive = (x: any) => x?.reason_code === "CREDENTIAL_REQUIRED";
      add(ctx, { id: "v050.hold_grace", level: L, ref: "§7.3, C231", title: `one clock, one grace: held just before expires_at${g !== undefined && g >= 1 ? ` and just inside the stated grace (${g} s)` : ""}, lapsed (HOLD_LAPSED) just outside ${g !== undefined ? `the stated grace (${g} s)` : "the largest grace (5 s)"}`,
        ok: alive(before) && (inside === undefined || alive(inside)) && outside?.reason_code === "HOLD_LAPSED",
        detail: `before → ${code(before)}${inside ? `; inside → ${code(inside)}` : ""}; outside → ${code(outside)}${g === undefined ? " (pass --hold-grace to check just inside the place's grace)" : ""}` });
    }
  }
  keep(v); await v.farewell().catch(() => undefined);
  // C230: held only when proposed is within the place's own stated limit, else refused.
  if (!pl) add(ctx, { id: "v050.hold_place_limit", level: L, ref: "§7.3, C230", title: "an act above the place's own limit is refused, never held", ok: "skip", detail: "the house summary states no limit for " + sp.action });
  else { const { v: w } = await seat("Pia Sato", "1.00");
    const beyond = money(unitsOf(pl.value, d) + unitsOf("1.00", d), d, cur).value;
    const x = w.seat ? await hold(w, beyond, "conf-4") : undefined;
    add(ctx, { id: "v050.hold_place_limit", level: L, ref: "§7.3, C230", title: `an act whose proposed total is above the place's own limit for the action (${pl.value} ${cur}) is refused, never held`,
      ok: !w.seat || argsRefused(x) ? "skip" : x?.type === "act_decision" && x.decision === "deny", detail: !w.seat ? "not seated" : argsRefused(x) ? `${beyond} ${cur}: ${argsNote(x)}` : `${beyond} ${cur} → ${code(x)}` });
    keep(w); await w.farewell().catch(() => undefined); }
  // C230: a shokai/0.3 visitor gets SEAT_SCOPE_EXCEEDED, never an over-limit hold.
  { const { v: w } = await seat("Quinn Adeyemi", "1.00", LEGACY_TAG);
    const x = w.seat ? await hold(w, "2.00", "conf-5") : undefined;
    add(ctx, { id: "v050.hold_legacy", level: L, ref: "§7.3, §11.1, C230", title: "under shokai/0.3 an act above the limit is refused (SEAT_SCOPE_EXCEEDED), never held over the limit",
      ok: !w.seat || argsRefused(x) ? "skip" : x?.type === "act_decision" && x.reason_code === "SEAT_SCOPE_EXCEEDED", detail: !w.seat ? `not seated under shokai/0.3 (${code(w.response)})` : argsRefused(x) ? argsNote(x) : code(x) });
    keep(w); await w.farewell().catch(() => undefined); }
  // C230 release (moves money: only with `spend`): the raise releases that act alone; a later spending act is above the limit; reuse is MANDATE_INVALID.
  if (!o.spend?.value) { add(ctx, { id: "v050.hold_release", level: L, ref: "§7.3, C230", title: "the raise releases that act alone; a later spending act is above the limit; the same mandate again is MANDATE_INVALID", ok: "skip", detail: "releasing moves money: pass --spend (a place with mock money)" }); return; }
  const V = o.spend.value; const twice = money(unitsOf(V, d) * 2n, d, cur).value;
  const { r: rr, v: w } = await seat("Rin Castellanos", V);
  if (!w.seat) { add(ctx, { id: "v050.hold_release", level: L, ref: "§7.3, C230", title: "release", ok: "skip", detail: "not seated" }); return; }
  const hh = await hold(w, twice, "conf-6");
  if (hh?.type !== "act_held" || !hh.over_limit) { add(ctx, { id: "v050.hold_release", level: L, ref: "§7.3, C230", title: "release", ok: "skip", detail: `no over-limit hold (${code(hh)})` }); return; }
  const nm = rr.supersedingMandate(w.mandateSent!, hh, `${place.display_name}: this one purchase of ${cur} ${twice} above your ${cur} ${V} limit, approve by ${hh.expires_at}.`);
  const rel = await confirm(w, hh.hold_id, { mandate: nm });
  const later = await hold(w, V, "conf-7");
  const h2 = later?.type === "act_held" ? later : undefined;
  const reuse = h2 ? await confirm(w, h2.hold_id, { mandate: nm }) : undefined;
  add(ctx, { id: "v050.hold_release", level: L, ref: "§7.3, C230", title: "the raise releases that act alone; a later spending act is above the limit (held over it or refused); the same mandate offered again is MANDATE_INVALID",
    ok: rel?.type === "act_result" && rel.ok === true && later?.type !== "act_result" && (!h2 || (sameMoney(h2.over_limit?.current, M(twice)) && reuse?.reason_code === "MANDATE_INVALID")),
    detail: `release → ${code(rel)}; a later ${V} → ${code(later)}${h2 ? ` (current ${h2.over_limit?.current?.value})` : ""}; the same mandate again → ${code(reuse)}` });
  keep(w); await w.farewell().catch(() => undefined);
}
