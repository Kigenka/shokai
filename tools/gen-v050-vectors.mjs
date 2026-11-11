#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Writes the `v050` section of conformance/test-vectors.json (SPEC Appendix A.2, checks C230–C254).
// Computed values (Luhn results, key checks, lapse times, digests, windows) come from the reference's pure core
// (reference/engawa/dist/src/v050.js); expected answers are the specification's, written out by hand.
//   node tools/gen-v050-vectors.mjs           write
//   node tools/gen-v050-vectors.mjs --check   exit 1 if the section differs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const V = await import(join(root, "reference/engawa/dist/src/v050.js"));
const C = await import(join(root, "reference/engawa/dist/src/crypto.js"));
const TVP = join(root, "conformance/test-vectors.json");
const usd = (value) => ({ value, currency: "USD" });
const tpc = (name) => ({ name, purpose: { text: "Screens visitor messages for injected instructions.", locale: "en-US" }, jurisdiction: ["US"], retention_days: 30, role: "processor" });

// --- C235: payment-instrument scan
const scanStrings = [
  ["4111111111111111", "a 16-digit test number"],
  ["4111 1111 1111 1111", "spaces between digits are stripped"],
  ["4111-1111-1111-1111", "dashes between digits are stripped"],
  ["\uFF14\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11", "fullwidth digits"],
  ["\u0664\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661\u0661", "Arabic-Indic digits"],
  ["order 7 then 4111111111111111 please", "inside prose"],
  ["4111111111111112", "the 16 digits fail the Luhn sum, but a shorter window inside passes: a false positive accepted by design"],
  ["1111111111111111", "no 13–19-digit window passes the Luhn sum"],
  ["4111a1111b1111c1111", "letters between digits break the run"],
  ["411111111111", "12 digits: below the window"],
  ["m-20261101-0007", "an ordinary header id"],
];
const scan = scanStrings.map(([s, why]) => ({ input: s, why, match: V.luhnLike(s) }));
const scanValues = [
  [{ note: "x" }, "no digits", null],
  [["4111", "1111", "1111", "1111"], "array elements joined in order", null],
  [{ "4111111111111111": "x" }, "a member name", null],
  [{ protocol: "shokai/0.5", msg_id: "m-4111111111111111", encounter_id: "e-1", type: "act" }, "a header id (msg_id)", null],
  [{ arguments: { amount: usd("12.00"), note: "table for two" } }, "an ordinary act body", null],
].map(([value, why]) => ({ value, why, match: V.carriesInstrument(value) }));

// --- C233: idempotency keys
const b = (n, fill = 0) => Buffer.alloc(n, fill).toString("base64url");
const keys = [[b(16), "16 bytes"], [b(32, 7), "32 bytes"], [b(15), "15 bytes: too short"], [b(33), "33 bytes: too long"],
  [b(16) + "==", "padded"], ["AAAA+AAAAAAAAAAAAAAAAA", "not base64url"]].map(([k, why]) => ({ key: k, why, valid: V.idempotencyKeyOk(k) }));

// --- C231: one clock, one grace
const exp = "2026-11-01T20:00:00Z";
const at = (s) => new Date(Date.parse(exp) + s * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const lapse = [[undefined, 5], [undefined, 6], [5, 5], [0, 1], [9, 5], [9, 6], [2, 3]].map(([stated, after]) => ({ hold_grace_s: stated ?? null, grace_used_s: V.graceOf(stated), now: at(after), lapsed: V.holdLapsed(at(after), exp, stated) }));
const consentClock = { hold_expires_at: exp, consent_expires_at: exp, hold_grace_s: 5, now: at(3), judged_at: V.consentClock(at(3), exp, exp, 5) };

// --- C243: grant caps (sliding windows)
const now = "2026-11-01T20:00:00Z"; const ago = (h) => new Date(Date.parse(now) - h * 3600e3).toISOString().replace(/\.\d{3}Z$/, "Z");
const caps = [
  [{ max: 2, period: "P1D" }, [ago(1), ago(23)], "two uses inside 24 h"],
  [{ max: 2, period: "P1D" }, [ago(1), ago(25)], "one use is older than 24 h"],
  [{ max: 3, period: "P1M" }, [ago(24 * 29), ago(24 * 10), ago(1)], "three uses inside 30 × 24 h"],
  [{ max: 3, period: "P1M" }, [ago(24 * 31), ago(24 * 10), ago(1)], "one use is older than 30 × 24 h"],
  [{ max: 1, period: "P1Y" }, [ago(24 * 364)], "inside 365 × 24 h"],
].map(([cap, uses, why]) => ({ cap, now, uses, why, reached: V.capReached(uses, cap, now) }));

// --- C245, C248: digests
const summary = { name: "lanternmoss", display_name: "Lanternmoss Tea House", purpose: { statement: "Tea, a quiet table and small gifts to take home.", locale: "en-US" },
  conduct_rules: [{ code: "no_payment_credentials", text: "Please never send a card number here; we take payment at our own checkout.", locale: "en-US" }],
  offers: [{ action: "shop.buy_tea", label: "Buy a tin of tea", max_amount: usd("40.00") }], limits: { max_amount: usd("40.00"), max_operations: 4 },
  hold_policies: { max_open_holds: 1, max_holds: 4 }, trust_paths: [{ action: "shop.buy_tea", paths: ["spending_mandate"] }],
  spec_ref: { version: "0.5.0", url: "https://shokai.example/spec/v0.5.0" } };
const claim = { introduction_id: "intro-fernwood-1", code: "K7Q2-M4XR", salt: "c2FsdC1mb3ItdGVzdHMtb25seQ" };

const conduct = [
  [[{ code: "no_recording", text: "Please don't record the conversation.", locale: "en-US" }], "a registered code"],
  [[{ code: "x-quiet-table", text: "Keep voices low after nine.", locale: "en-US" }], "an x- code"],
  [[{ code: "no_shouting", text: "No shouting.", locale: "en-US" }], "neither registered nor x-"],
  [[{ code: "no_resale", text: "", locale: "en-US" }], "empty text"],
].map(([rules, why]) => ({ rules, why, valid: V.conductRulesValid(rules) }));

const section = {
  note: "v0.5.0 vectors (C230–C254). Computed values come from the reference's pure core; expected answers are the specification's. Regenerate: node tools/gen-v050-vectors.mjs. Fictional parties only.",
  C230_over_limit: {
    worked_example: { limit: usd("30.00"), current: usd("20.00"), act_amount: usd("40.00"), proposed: usd("60.00"), superseding_max_amount: usd("60.00"), after_release: "spent 60.00 against a limit of 30.00; every later spending act is above the limit" },
    rule: "§7.3: with policy.limit_calls: true, an act is above the limit when amount + current > limit; limit = the lower of the seat's and the mandate's max_amount as signed; current = what counts against that binding ceiling (acts let through + open holds); proposed = current + amount; seat and mandate each carry {limit, current} for both totals.",
    figures: [
      { seat_max_amount: usd("40.00"), mandate_max_amount: usd("60.00"), let_through: [usd("20.00")], open_holds: [], act_amount: usd("25.00"), expect: { held: true, over_limit: { limit: usd("40.00"), current: usd("20.00"), proposed: usd("45.00"), seat: { limit: usd("40.00"), current: usd("20.00") }, mandate: { limit: usd("60.00"), current: usd("20.00") } } } },
      { seat_max_amount: usd("30.00"), mandate_max_amount: usd("30.00"), let_through: [usd("20.00")], open_holds: [], act_amount: usd("15.00"), expect: { held: true, over_limit: { limit: usd("30.00"), current: usd("20.00"), proposed: usd("35.00"), seat: { limit: usd("30.00"), current: usd("20.00") }, mandate: { limit: usd("30.00"), current: usd("20.00") } } }, why: "a seat capped at its mandate (policy ∩ mandate ∩ request, §6.1)" },
      { seat_max_amount: usd("40.00"), mandate_max_amount: usd("60.00"), let_through: [usd("20.00")], open_holds: [], declined_holds: [usd("25.00")], act_amount: usd("30.00"), expect: { held: true, over_limit: { limit: usd("40.00"), current: usd("20.00"), proposed: usd("50.00"), seat: { limit: usd("40.00"), current: usd("20.00") }, mandate: { limit: usd("60.00"), current: usd("20.00") } } }, why: "a declined hold is released at once and stops counting in current" },
      { seat_max_amount: usd("40.00"), mandate_max_amount: usd("60.00"), let_through: [usd("10.00")], open_holds: [usd("15.00")], act_amount: usd("20.00"), expect: { held: true, over_limit: { limit: usd("40.00"), current: usd("25.00"), proposed: usd("45.00"), seat: { limit: usd("40.00"), current: usd("25.00") }, mandate: { limit: usd("60.00"), current: usd("25.00") } } }, why: "an open ordinary hold's reservation counts" },
    ],
    not_held: [
      { case: "shokai/0.3 act", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" } },
      { case: "no hold_for_owner", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" } },
      { case: "Shōkai visitor card without owner_prompts: purchase_only", expect: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED" }, why: "§7.3 Asking comes first" },
      { case: "policy.limit_calls absent or false", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" } },
      { case: "per_operation seat or a session_max_amount", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" } },
      { case: "amount in another currency", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" } },
      { case: "a payment_ref already used in the seat", expect: "structuring rules of §7.2 apply; never held" },
      { case: "max_operations reached", expect: { decision: "deny", disposition: "not_now", reason_code: "SEAT_SCOPE_EXCEEDED" }, why: "operations are checked before amounts" },
    ],
    superseding_mandate: {
      rule: "§5.1, §7.3: supersedes = {mandate_id, mandate_digest} of the seat's current mandate and hold = {hold_id, act_digest} of this hold; shown_to_owner present; same card_id (the seat's Shōkai visitor card); not under an allowance; allows the tool; max_amount = proposed exactly (same currency); expires_at no later than the hold's; valid now; doesn't outlive the Shōkai visitor card; binds exactly one act and never becomes the seat's mandate; owner passkey per the card's owner_binding.",
      on_failure: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED", retry: { kind: "with_credential", credentials: ["signed_mandate"] }, hold: "stays until expires_at + grace" },
      cases: [
        { change: "none", expect: "that act released, nothing else; its amount counts against the seat and its current mandate (one ledger); the seat keeps its mandate, so a later spending act is above the limit (refused, or held again)" },
        { change: "supersedes.hold missing", expect: "refused" },
        { change: "supersedes.hold.act_digest is another act's", expect: "refused" },
        { change: "supersedes.hold.hold_id is another hold's", expect: "refused" },
        { change: "supersedes.mandate_digest is not the current mandate's", expect: "refused" },
        { change: "shown_to_owner missing", expect: "refused" },
        { change: "max_amount below proposed", expect: "refused" },
        { change: "max_amount above proposed", expect: "refused (no standing headroom)" },
        { change: "expires_at later than the hold's expires_at", expect: "refused" },
        { change: "offered again after its act was released, or for another hold", expect: "refused: not_now / MANDATE_INVALID" },
        { change: "under_allowance set", expect: "refused" },
        { change: "card_id of another Shōkai visitor card", expect: "refused (C237)" },
        { change: "sent as an approve_purchase consent instead", expect: "refused" },
        { change: "both consent and mandate", expect: "refused" },
      ],
    },
    declined: { rule: "an owner consent over the held act with decision decline, or no valid mandate by expires_at + grace", expect: { decision: "deny", disposition: "not_now", reason_code: "HOLD_LAPSED", retry: { kind: "after" } }, released: "operation unreserved at once; stops counting in current" },
    limit_request: { keys: [...V.LIMIT_REQUEST_KEYS], closed: true, example: { place: "did:web:lanternmoss.example", hold_id: "hold-7", limit: usd("40.00"), current: usd("20.00"), proposed: usd("45.00"), expires_at: "2026-11-01T20:15:00Z", seat: { limit: usd("40.00"), current: usd("20.00") }, mandate: { limit: usd("60.00"), current: usd("20.00") } },
      example_valid: null, with_free_text_valid: null },
  },
  C231_grace: { rule: "§7.3: held while the place's clock ≤ expires_at + grace; grace = policy.hold_grace_s clamped to 0–5 s, absent = 5; a shokai/0.3 hold has no grace.", expires_at: exp, cases: lapse, consent_clock: consentClock },
  C232_hold_policies: { rule: "§7.3: hold policies are checked before the amount and scope checks; counted per seat.", cases: [
    { hold_policies: { max_open_holds: 1 }, state: "one hold open on the seat; the new act is also above the amount", expect: { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "after", not_before: "the open hold's expires_at" } } },
    { hold_policies: { max_holds: 4 }, state: "four holds made on the seat", expect: { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "with_credential", credentials: ["signed_mandate"] } } },
    { hold_policies: { max_purchases: 1 }, state: "one held purchase released", expect: { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "with_credential", credentials: ["signed_mandate"] } } },
    { hold_policies: {}, state: "any", expect: "no hold limit" } ] },
  C233_idempotency: { rule: "§7.2: 16–32 random bytes, base64url without padding; scope = seat (act) or hold (confirmation); caps policy.repeat_caps, defaults per_hold 5, per_seat 10.", keys,
    defaults: { ...V.REPEAT_CAPS_DEFAULT },
    answers: [
      { case: "malformed key", expect: { decision: "deny", disposition: "not_now", reason_code: "REQUEST_INCOMPLETE" } },
      { case: "repeat within caps", expect: "the original signed answer, byte for byte; nothing performed again" },
      { case: "confirmation repeat past the hold cap (6th)", expect: { decision: "deny", disposition: "not_now", reason_code: "HOLD_LAPSED", retry: { kind: "after" } } },
      { case: "act repeat past the seat cap (11th), no hold", expect: { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after" } } },
      { case: "shokai/0.3 message with a key", expect: "the key is not read (v0.4.0 rules)" } ] },
  C234_farewell: { rule: "§3.5, §7.1: a seated visitor's farewell is always accepted; answered only by the place's own farewell when it hasn't sent one; otherwise an empty reply (the closing receipt).", cases: [
    { place_farewell_sent: true, quota_or_cap_used_up: false, expect: { http: 200, messages: [] } },
    { place_farewell_sent: true, quota_or_cap_used_up: true, expect: { http: 200, messages: [] } },
    { place_farewell_sent: false, after: "conditional", expect: { messages: [{ type: "farewell", outcome: "withdrawn" }] } },
    { place_farewell_sent: true, second_visitor_farewell: true, expect: { decision: "deny", disposition: "not_now", reason_code: "RITUAL_ORDER" } },
    { host_ends_seat: true, place_farewell_sent: true, expect: { held_for_inbox: [{ type: "farewell", outcome: "completed" }], visitor_answers: "nothing" } } ] },
  C235_scan: { rule: "§5.4: every string, member name and number, header ids included; array strings and numbers also joined; Unicode Nd digits; non-letter non-digit between digits stripped; 13–19-digit windows, Luhn; depth > 12 counts as a match. Runs after C210.", strings: scan, values: scanValues,
    answers: [
      { message: "act or act_confirmation (shokai/0.5)", expect: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_NOT_ACCEPTED", retry: { kind: "after" } } },
      { message: "act or act_confirmation (shokai/0.3)", expect: { decision: "deny", disposition: "not_a_fit", reason_code: "CREDENTIAL_NOT_ACCEPTED", retry: { kind: "after" } } },
      { message: "act with a payment_token member and a card number", expect: { decision: "deny", disposition: "not_a_fit", reason_code: "CREDENTIAL_NOT_ACCEPTED" }, why: "C210 first" },
      { message: "invitation_request", expect: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_NOT_ACCEPTED", retry: { kind: "after" } } },
      { message: "any other message", expect: "the lobby (§3.1, C184)" },
      { message: "match in msg_id", expect: "answered in a fresh lobby encounter the place names; no in_reply_to; the id is never echoed" } ] },
  C236_signed_policy: { rule: "§2.3: every v0.5.0 policy member is inside house_digest.", members: ["limit_calls", "hold_grace_s", "repeat_caps", "hold_policies", "trust_requirements", "trust_issuers", "trust_obtain_url", "established_introducers", "conduct_rules", "summary", "message_cap", "door_questions", "third_party_classifiers"], expect: "a door acting on a copy outside house_digest is non-conformant; it SHOULD refuse to start" },
  C237_one_card: { cases: [
    { case: "a second card_presentation of another Shōkai visitor card in the encounter", expect: "refused" },
    { case: "a superseding mandate or consent for another Shōkai visitor card than the seat's", expect: { decision: "deny", disposition: "not_now", reason_code: "CREDENTIAL_REQUIRED" } } ] },
  C238_revocations: { cases: [
    { case: "pushed revocation with a bad signature", expect: "not acknowledged, not stored" },
    { case: "store full, revocation still in force", expect: "expired entries dropped first; otherwise fail closed; never drop one in force" },
    { case: "duplicate or older copy", expect: "MAY be acknowledged; changes nothing" } ] },
  C239_bounded_input: { cases: [
    { max_message_bytes: null, default: V.DEFAULT_MAX_MESSAGE_BYTES, min: V.MIN_MAX_MESSAGE_BYTES, why: "policy.max_message_bytes absent: 65536; a stated value below 4096 is an invalid house config" },
    { max_message_bytes: 8192, message: "act", message_bytes: 9000, expect: { decision: "deny", disposition: "not_now", reason_code: "REQUEST_INCOMPLETE", performed: false }, never: "misconduct finding or integrity alarm" },
    { max_message_bytes: 8192, message: "act", message_bytes: 6000, expect: "read as usual" },
    { max_message_bytes: 8192, message: "card_receipt", message_bytes: 9000, expect: { http: 200, messages: [] } },
    { max_message_bytes: 8192, message: "farewell", message_bytes: 9000, expect: "accepted (C234)" },
    { max_message_bytes: 8192, message: "act", message_bytes: 9000, binding: "HTTP", expect: "or 413 with an empty ReplyEnvelope at the front (a front limit at least max_message_bytes)" },
    { message_cap: 3, message_number: 4, message: "act", expect: { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED", retry: { kind: "after" } } },
    { message_cap: 3, message_number: 4, message: "invitation_request", expect: { http: 200, messages: [] } },
    { message_cap: 3, message_number: 4, message: "farewell", expect: "outside the cap (C234)" },
    { message_cap: 3, message_number: 4, message: "act (shokai/0.3)", expect: { reason_code: "RATE_LIMITED" }, why: "a v0.4.0 code" } ] },
  C240_counter: { cases: [
    { stored: 0, presented: 0, accept: true }, { stored: 5, presented: 6, accept: true }, { stored: 5, presented: 5, accept: false }, { stored: 0, presented: 3, accept: true }, { stored: 7, presented: 0, accept: false },
    { case: "second registration for an owner id", accept: false } ] },
  C241_pins_and_keys: { cases: [
    { case: "two pin sources by different operators agree with the Shōkai host card digest", expect: "go on" },
    { case: "the sources disagree, or the digest isn't the pin", expect: "stop and tell the owner" },
    { case: "a private key in published vectors (other than the key_derivation labels)", expect: "non-conformant" } ] },
  C242_closed_templates: { marker: "PlaceTemplates.closed: true (from policy.closed_templates)", cases: [
    { templates_closed: false, object: "Shōkai visitor card with an unknown top-level member", expect: "ignored (Conventions); templates are fill-in hints" },
    { templates_closed: true, object: "Shōkai visitor card with a top-level member its template doesn't list", off_template: V.offTemplate({ card_id: "c", nickname: "Tom" }, { card_id: "<card id>" }),
      expect: { decision: "deny", disposition: "not_now", retry: { kind: "with_credential", credentials: ["signed_card"] }, seat: false } },
    { templates_closed: true, object: "mandate with a top-level member its template doesn't list", expect: { decision: "deny", disposition: "not_now", reason_code: "REQUEST_INCOMPLETE", seat: false } },
    { templates_closed: true, object: "a member with an <optional …> placeholder, or an x- member", off_template: V.offTemplate({ card_id: "c", "x-team": "blue", owner_prompts: "never" }, { card_id: "<card id>", owner_prompts: "<optional>" }), expect: "accepted" },
    { templates_closed: true, rule: "never drop the member and act on the rest" } ] },
  C243_trust: { rule: "§6.9: deterministic, after §6.7; grant periods are sliding windows (P1D 24 h, P7D 7×24 h, P1M 30×24 h, P1Y 365×24 h).", period_ms: { ...V.PERIOD_MS }, caps,
    answers: [
      { case: "no path met (shokai/0.5)", expect: { decision: "deny", disposition: "not_now", reason_code: "TRUST_REQUIRED", readiness: ["trust"], retry: { kind: "with_credential" } } },
      { case: "some actions met (shokai/0.5)", expect: { decision: "conditional", conditions: ["narrow_actions"], reason_code: "TRUST_REQUIRED" } },
      { case: "no path met (shokai/0.3)", expect: { decision: "deny", disposition: "not_now", reason_code: "POLICY_DENY", retry: { kind: "with_credential", credentials: ["vouch"] }, readiness: [] } },
      { case: "a cap reached", expect: { decision: "deny", disposition: "not_now", reason_code: "RATE_LIMITED" }, never: "a penalty" } ] },
  C244_receipts: { check_order: ["signature against issuer (did:web or did:key; never an owner passkey)", "issuer is the place or in policy.trust_issuers (never \"*\")", "subject.principal_id = the Shōkai visitor card's principal (third mismatch in 24 h: gate_probing)", "audience, covers.actions, min_value (same currency)", "times ±300 s", "revocation (unreachable: not_now, retry within a day)", "per_receipt caps"] },
  C245_introduction_card: { rule: "§4.1: claim digest = digest(JCS({introduction_id, code, salt})); a VouchRevocation whose vouch_id is the card's introduction_id revokes it.", claim, claim_digest: V.claimDigestOf(claim.introduction_id, claim.code, claim.salt),
    max_claims: V.INTRODUCTION_MAX_CLAIMS, max_lifetime_days: V.INTRODUCTION_MAX_LIFETIME_MS / 86400e3, lending_line: V.LENDING_LINE,
    answers: [
      { case: "every claim bound to others (shokai/0.5)", expect: { decision: "deny", disposition: "not_now", reason_code: "INTRODUCTION_USED_UP" } },
      { case: "Shōkai introduction card (introduction_card) under shokai/0.3", expect: "not read; counts as vouch: null" } ] },
  C246_conduct_rules: { cases: conduct, served_in: ["LobbyBriefing.conduct_rules", "HouseSummary.conduct_rules"] },
  C247_errand_budget: { rule: "§5.5: max_minutes is wall-clock minutes from when the representative agent took up the budget (before its first step), waiting included; a new budget for the same mandate replaces the limits, not what was used; never sent to a place.", cases: [
    { max_minutes: 30, started: "2026-11-01T19:00:00Z", next_step_at: "2026-11-01T19:29:00Z", step_estimate_minutes: 0, expect: "go on" },
    { max_minutes: 30, started: "2026-11-01T19:00:00Z", next_step_at: "2026-11-01T19:31:00Z", step_estimate_minutes: 0, expect: "stop and bring the errand home" },
    { max_tokens: 20000, used_tokens: 19500, step_estimate_tokens: 800, expect: "stop and bring the errand home" },
    { new_budget: { max_minutes: 60 }, started: "2026-11-01T19:00:00Z", now: "2026-11-01T19:50:00Z", expect: "10 minutes left (counted from when the first budget was taken up)" } ] },
  C248_house_summary: { summary, summary_digest: V.summaryDigest(summary), rule: "summary_digest = digest(JCS(summary)) on the Shōkai host card; served at <entry>/house-summary.json; checked before use." },
  C249_no_ack: { cases: [{ message: "a message whose only content is 'thanks' or 'received'", expect: "SHOULD NOT be sent" }, { message: "a reply to the place's seat-closing farewell", expect: "not sent" }] },
  C250_system1: { cases: [
    { label: "ok", confidence: 0.97, threshold: 0.8, expect: { escalate: false } },
    { label: "injection", confidence: 0.55, threshold: 0.8, expect: { escalate: true } },
    { label: "injection", confidence: 0.99, threshold: 0.8, expect: { may: ["pause", "narrow", "escalate"], never: ["finding", "penalty"] } },
    { classifier: "timeout", expect: { may: ["pause", "narrow"], never: ["widen"] } },
    { classifier: { name: "acme-screen", runs: "third_party" }, third_party_classifiers: null, expect: { called: false, action: "the fail-closed action" }, why: "absent = none allowed" },
    { classifier: { name: "acme-screen", runs: "third_party" }, third_party_classifiers: [], expect: { called: false, action: "the fail-closed action" } },
    { classifier: { name: "acme-screen", runs: "third_party" }, third_party_classifiers: [tpc("other-screen")], expect: { called: false, action: "the fail-closed action" } },
    { classifier: { name: "acme-screen", runs: "third_party" }, third_party_classifiers: [tpc("acme-screen")], expect: { called: true } },
    { classifier: { name: "acme-screen", runs: "third_party" }, third_party_classifiers: [tpc("acme-screen")], visitor_tag: "shokai/0.3", expect: { called: false } },
    { classifier: { name: "house-rules", runs: "in_house" }, third_party_classifiers: null, expect: { called: true } } ],
    lobby: "a place that names any shows the list in its house summary (read before the invitation_request) and in LobbyBriefing.third_party_classifiers (not under shokai/0.3)",
    entry_shape: { required: ["name", "purpose", "jurisdiction", "retention_days"], optional: ["role"], name_never: "*", retention_days_max: 90 } },
  C251_return: { cases: [{ decisions_waiting: 5, expect: "at most three in the summary; the rest behind one link or question" }] },
  C252_setup: { cases: [{ door_questions: 4, expect: "invalid (at most three)" }, { answer: { answered_by: "representative" }, expect: "shown to the owner in the next summary; never graded or used for admission" }] },
  C253_high_volume: { cases: [{ case: "cardless visitor", expect: "the leaflet, no model call" }] },
  C254_wire_tag: { rule: "§11.1: senders emit shokai/0.5; receivers accept shokai/0.5 and, during the window, shokai/0.3; replies and place-started messages in a 0.3 encounter carry shokai/0.3.",
    window_days: V.WIRE_TAG_TRANSITION_DAYS, window_end: "[0.3 WINDOW END: the v0.5.0 release date + 90 days, set at release]",
    window_example: { release_date_example_only: "2026-12-01T00:00:00Z", window_end: V.legacyWindowEnd("2026-12-01T00:00:00Z") },
    accept: [["shokai/0.5", null], ["shokai/0.3", null], ["shokai/0.3", "2027-03-01T00:00:00Z"], ["shokai/0.4", null]].map(([tag, until]) => ({ tag, now: "2027-02-01T00:00:00Z", legacy_until: until, accepted: V.wireTagAccepted(tag, "2027-02-01T00:00:00Z", until) }))
      .concat([{ tag: "shokai/0.3", now: "2027-04-01T00:00:00Z", legacy_until: "2027-03-01T00:00:00Z", accepted: V.wireTagAccepted("shokai/0.3", "2027-04-01T00:00:00Z", "2027-03-01T00:00:00Z"), note: "after the window a receiver MAY treat it as a version mismatch" }]),
    reply_tag: [["shokai/0.3", V.replyTag("shokai/0.3")], ["shokai/0.5", V.replyTag("shokai/0.5")]].map(([incoming, reply]) => ({ incoming, reply })),
    place_started: [{ encounter_tag: "shokai/0.3", message: "seat closing farewell, held consideration_outcome or notice", tag: "shokai/0.3" }, { encounter_tag: null, message: "door_pointer, a new Shōkai host card or place listing", tag: "shokai/0.5" }],
    visitor_card_tags_accepted: ["shokai/0.3", "shokai/0.5"] },
};
// fill the two LimitRequest validity checks from the pure core
section.C230_over_limit.limit_request.example_valid = V.limitRequestClosed(section.C230_over_limit.limit_request.example);
section.C230_over_limit.limit_request.with_free_text_valid = V.limitRequestClosed({ ...section.C230_over_limit.limit_request.example, note: "please approve" });

const tv = JSON.parse(readFileSync(TVP, "utf8"));
const note = String(tv.note).replace(/spec v0\.4\.0 \(unchanged from v0\.3\.0;/, "spec v0.5.0 (the v0.3.0 vectors unchanged, plus `v050` for C230–C254;");
const want = { ...tv, note, v050: section };
const text = JSON.stringify(want, null, 2) + "\n";
if (process.argv.includes("--check")) { if (readFileSync(TVP, "utf8") !== text) { console.error("v050 vectors are stale: run node tools/gen-v050-vectors.mjs"); process.exit(1); } console.log("v050 vectors up to date ✓"); }
else { writeFileSync(TVP, text); console.log("wrote conformance/test-vectors.json v050 (" + Object.keys(section).length + " entries)"); }
