// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Shared helpers for the 0.5 example traces: a stable, masked JSON write, and a small core-host kit
// used only by the brand-door and community-room scripts (inbound door and gatherings live in the
// protocol core, not in the high-level createDoor API).
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as core from "../../packages/shokai/dist/src/core/index.js";

export const TRACE_NOTE = "The protocol calls the grant a pass. On the wire the field is still seat.";
export const USD = (v) => ({ value: v, currency: "USD" });
export const NOW = "2026-11-11T18:00:00Z";

const clean = (s) => s
  .replace(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{20,}/g, (d) => "did:key:…" + d.slice(-6))
  .replace(/did:jwk:[A-Za-z0-9_-]{8,}/g, (d) => "did:jwk:…(this run's key)")
  .replace(/did:web:[A-Za-z0-9._~:-]+/g, (d) => "did:web:…" + d.split(":").pop().slice(-12))
  .replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:<port>");
export const mask = (v) => {
  const walk = (x) => {
    if (typeof x === "string") return clean(x);
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [clean(k), walk(val)]));
    return x;
  };
  return walk(v);
};

export const writeTrace = (url, obj) => {
  const out = mask({
    protocol: "shokai/0.5",
    sdk: "@kigenka/shokai 0.5.1 (with the red-team round 3 fixes; 0.5.0 lacks them)",
    note: TRACE_NOTE,
    ...obj,
  });
  writeFileSync(url, JSON.stringify(out, null, 2) + "\n");
  return out;
};

export const recorder = () => {
  const out = { steps: [], checks: [] };
  const check = (ok, what) => {
    out.checks.push({ ok: !!ok, what });
    if (!ok) {
      console.error("FAILED: " + what);
      process.exitCode = 1;
    }
  };
  const flow = (v) => (v.transcript ?? []).map((m) => {
    const p = m.message?.payload ?? m.message;
    const row = { dir: m.dir, type: p?.type };
    if (p?.decision) row.decision = p.decision;
    if (p?.outcome) row.outcome = p.outcome;
    if (p?.reason_code) row.reason_code = p.reason_code;
    return row;
  });
  const done = (fileUrl, extra = {}) => {
    out.ok = out.checks.every((c) => c.ok);
    writeTrace(fileUrl, { ...out, ...extra });
    console.log(`${out.checks.filter((c) => c.ok).length}/${out.checks.length} checks passed`);
    return out;
  };
  return { out, check, flow, done };
};

const AT = "2026-10-01T00:00:00Z";
const pd = (code, text) => ({ code, statement: { text, locale: "en-US" } });
const basePolicy = (v, name) => ({
  policy_version: v, supported_locales: ["en-US"], access_mode: "session", purposes: [], actions: [], spending_actions: [],
  considering: { actions: [], routed_to: { kind: "role", role: "Owner", human: true }, response_days: 14, requires_introduction: true },
  require_vouch_for: [], trusted_introducers: "*",
  lobby: {
    about: { "en-US": "A place that meets representatives at the door." },
    how: { "en-US": "Greet, exchange signed cards, introduce yourself, then state a purpose within a signed mandate." },
    onboarding_url: `https://${name}.example/shokai/onboard`, receipt_ttl_days: 7,
    readiness: [{ code: "card", required: true }, { code: "owner_binding", required: true }, { code: "purpose", required: true }, { code: "introduction", required: false }],
  },
  receipt_echo_limit: 3, probing_threshold: 3, probing_window_s: 86400, ritual_retry_s: 60, not_a_fit_retry_days: 30, paused_retry_days: 30, enforce_owner_passkey: true,
});

function hostCard(k, display, kind, role, scope, locales) {
  return core.makeSigned({
    card_id: "card-" + display.toLowerCase().replace(/\W+/g, "-"),
    protocol: core.PROTOCOL,
    representative_id: k.rep.id,
    principal: { principal_id: k.principal.id, kind, display_name: display },
    role, standing: { tier: "principal" }, mandate_scope: scope, locales,
    representative_key: { key_id: k.rep.key_id, alg: "Ed25519", public_key: core.b64u(k.rep.pubRaw) },
    issued_at: AT, expires_at: "2027-10-01T00:00:00Z",
  }, k.principal, AT);
}

export function placeKeys(label) {
  return {
    rep: core.ed25519FromLabel(label + "-rep"),
    principal: core.ed25519FromLabel(label + "-principal"),
  };
}

/** A person's inbound door (§10), built with the 0.5 core. */
export function inboundDoor(rep, owner, display = "Kiran Vale", o = {}) {
  const p = basePolicy("door-" + display.toLowerCase().replace(/\W+/g, "-") + "-2026.11.11", "door");
  p.category = "x-inbound-door";
  p.lobby.about = { "en-US": `The door of ${display}'s representative. Brands may present one thing at a time, by the door policy the owner signed.` };
  p.purposes = [
    pd("presentation", "Present one item, or invite the owner to look at something, within the door's public categories."),
    pd("gift", "Offer one gift, claimed by ticket. Never in exchange for data."),
  ];
  p.actions = [
    { action: core.DOOR_PRESENT, purposes: ["presentation"], level: "advise" },
    { action: core.DOOR_INVITE, purposes: ["presentation"], level: "advise" },
    { action: core.DOOR_GIFT, purposes: ["presentation", "gift"], level: "advise" },
  ];
  const { categories, trusted_introducers, note, judge, signer, ...pub } = o;
  const salt = core.b64u(Buffer.alloc(16, 7));
  const n = note ?? { for_you: ["kyoto", "travel coat"], not_for_you: ["gym", "watch"] };
  const pol = core.defaultDoorPolicy({
    owner_id: owner.id, representative_id: rep.id,
    categories: categories ?? ["fashion", "travel", "home"],
    trusted_introducers: trusted_introducers ?? [],
    private_digest: core.privateDigest(salt, n),
    ...pub,
  });
  const policy = core.makeOwnerSigned(pol, signer ?? owner, AT);
  p.trusted_introducers = [...(trusted_introducers ?? [])];
  const card = core.makeOwnerSigned({
    card_id: "card-door-" + display.toLowerCase().replace(/\W+/g, "-"),
    protocol: core.PROTOCOL, representative_id: rep.id,
    principal: { principal_id: owner.id, kind: "person", display_name: display },
    role: `Personal representative of ${display} (inbound door)`, standing: { tier: "standard" },
    mandate_scope: { purposes: ["presentation", "gift"], actions: p.actions.map((a) => a.action) },
    locales: p.supported_locales,
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: core.b64u(rep.pubRaw) },
    issued_at: AT, expires_at: "2027-10-01T00:00:00Z",
    owner_binding: { method: "passkey_webauthn", owner_id: owner.id, rp_id: owner.rpId },
  }, owner, AT);
  return {
    name: "door-" + display.toLowerCase().split(" ")[0],
    display_name: `${display}'s door`,
    principal_id: owner.id, rep_id: rep.id, policy: p, card,
    door: { policy, privateNote: { salt, note: n }, secret: Buffer.alloc(32, 3), ...(judge ? { judge } : {}) },
  };
}

/** The Engawa gathering place, built with the 0.5 core. */
export function engawa(k, invitees, when = { starts_at: "2026-10-24T00:00:00Z", ends_at: "2027-12-31T00:00:00Z" }) {
  const p = basePolicy("engawa-2026.11.11", "engawa");
  p.category = "gathering";
  p.supported_locales = ["en-US", "ja-JP"];
  p.lobby.about = {
    "en-US": "The Engawa is a veranda where invited representatives meet, learn from each other and chat. Groups are places: whoever is invited.",
    "ja-JP": "縁側は、招かれた代理人たちが集い、学び合う場所です。",
  };
  p.purposes = [pd("gathering", "Attending an invited gathering (gathering.attend), with your owner's accept_house_rules consent.")];
  p.actions = [{ action: core.ATTEND_ACTION, purposes: ["gathering"], level: "advise", limits: { max_session_s: 7200 } }];
  const d = "The Engawa";
  const g = core.makeSigned({
    gathering_id: "gath-engawa-1",
    place: { principal_id: k.principal.id, display_name: d },
    title: "Autumn evening on the veranda",
    invitees,
    house_rules: {
      default_attribution: "chatham_house", private_never_leaves: true,
      pressing_after_decline: "flagged", pressing: { light_flags: 2, notice_at: 3 },
      quoting: "paraphrase_by_default", entry_requires_consent: true, topics: ["x-ceramics"],
    },
    ...when,
  }, k.principal, AT);
  return {
    name: "engawa", display_name: d, principal_id: k.principal.id, rep_id: k.rep.id, policy: p, gathering: g,
    affiliation_hints: ["kiln", "glaze", "pottery wheel"],
    card: hostCard(k, d, "system", "Host of the veranda", { purposes: ["gathering"], actions: [core.ATTEND_ACTION] }, ["en-US", "ja-JP"]),
  };
}

export function makeHost(cfg, keys, clock = () => NOW, opts = {}) {
  return new core.Host(cfg, keys.rep, keys.principal, new core.RealVerifier(), clock, opts);
}

export function signBy(s, p, at = NOW) {
  return s.kind === "passkey" ? core.makeOwnerSigned(p, s, at) : core.makeSigned(p, s, at);
}

/** A visiting representative for a core Host ritual, speaking shokai/0.5. */
export function visitor(name, kind, scope, opts = {}) {
  const rep = opts.rep ?? core.ed25519FromLabel("visitor-rep-" + name);
  const owner = opts.owner ?? (kind === "person" ? core.newPasskeyOwner() : core.ed25519FromLabel("visitor-owner-" + name));
  const platform = opts.platform ?? core.ed25519FromLabel("visitor-platform-" + name);
  const card = {
    card_id: "card-" + name.toLowerCase().replace(/\W+/g, "-"),
    protocol: core.PROTOCOL,
    representative_id: rep.id,
    principal: { principal_id: owner.id, kind, display_name: name },
    role: name + "'s representative",
    standing: { tier: "standard" },
    mandate_scope: scope,
    locales: opts.locales ?? ["en-US"],
    representative_key: { key_id: rep.key_id, alg: "Ed25519", public_key: core.b64u(rep.pubRaw) },
    issued_at: AT, expires_at: "2027-04-01T00:00:00Z",
    ...(kind === "person" ? { owner_binding: { method: "passkey_webauthn", owner_id: owner.id, platform_key: platform.id, rp_id: opts.rp_id ?? owner.rpId } } : {}),
  };
  return { rep, owner, platform, kind, name, locales: card.locales, card: signBy(owner, card) };
}

export function mandate(v, purpose, actions, limits = {}, extra = {}) {
  return signBy(v.owner, {
    mandate_id: "mand-" + purpose + "-" + v.name.toLowerCase().replace(/\W+/g, "-"),
    principal_id: v.owner.id, representative_id: v.rep.id, card_id: v.card.payload.card_id,
    purpose: { code: purpose, statement: "Purpose statement for " + purpose, locale: "en-US" },
    allowed_actions: actions, limits,
    valid_from: "2026-10-20T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
    ...extra,
  });
}

export function vouch(introducer, introName, v, purposes, cache, extra = {}) {
  const url = "https://introducer.example/shokai/revocations/" + encodeURIComponent(introducer.id);
  if (cache && !cache.has(url)) cache.set(url, { ok: true, at: NOW, body: [] });
  return signBy(introducer, {
    vouch_id: "vouch-" + introName.toLowerCase().replace(/\W+/g, "-"),
    introducer: { principal_id: introducer.id, display_name: introName },
    subject: { representative_id: v.rep.id, card_digest: v.card.payload_digest },
    scope: { purposes },
    revocation_log: url, relationship: "known_personally",
    issued_at: "2026-10-18T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
    ...extra,
  });
}

export function ownerConsent(owner, rep, action, subject, extra = {}) {
  return core.makeOwnerSigned({
    consent_id: "oc-" + action + "-" + (subject.id ?? "x"),
    owner_id: owner.id, representative_id: rep, action, decision: "approve", subject_ref: subject,
    assurance: "passkey", expires_at: "2026-12-31T00:00:00Z",
    shown_to_owner: { text: `Approve ${action} for ${subject.kind} ${subject.id}.`, locale: "en-US" },
    issued_at: NOW, ...extra,
  }, owner, NOW);
}

/** A shokai/0.5 ritual session against one core Host. */
export class Session {
  tag = "shokai/0.5";
  enc = "enc-trace";
  seq = 0;
  sid = "s1";
  hostNonce = "";
  transcript = [];
  last = [];
  constructor(h, v, fromId) { this.h = h; this.v = v; this.fromId = fromId; }
  get from() { return this.v?.rep.id ?? this.fromId ?? "urn:shokai:anon:wanderer"; }
  msg(type, body) {
    return { protocol: this.tag, encounter_id: this.enc, msg_id: `${this.enc}-${this.sid}-v${++this.seq}`, sent_at: NOW, from: this.from, to: this.h.cfg.rep_id, type, ...body };
  }
  send(m, sign = true) {
    this.transcript.push({ dir: "out", message: { payload: m } });
    const wire = sign && this.v ? core.makeSigned(m, this.v.rep, NOW) : { payload: m, payload_digest: core.digestOf(m), signatures: [] };
    const out = this.h.handle(wire);
    for (const o of out) this.transcript.push({ dir: o.held ? "held" : "in", message: o.message ?? o });
    this.last = out.map((o) => (o.message?.payload ?? o.message));
    for (const x of this.last) if (x.type === "greeting" && x.nonce && x.encounter_id === this.enc) this.hostNonce = x.nonce;
    return this.last;
  }
  greet(sign = true) { return this.send(this.msg("greeting", { locales: this.v?.locales ?? ["en-US"], nonce: "n-vis-1" }), sign); }
  present() {
    const aud = this.h.cfg.rep_id;
    const proof = core.makeSigned(core.possessionPayload(this.enc, this.hostNonce, aud), this.v.rep, NOW).signatures[0];
    return this.send(this.msg("card_presentation", {
      card: this.v.card,
      possession_proof: { ...proof, key_id: this.v.card.payload.representative_key.key_id, signer: this.v.card.payload.representative_id, audience: aud },
    }));
  }
  receipt() { return this.send(this.msg("card_receipt", { card_digest: "sha-256:hostcard" })); }
  introduce(vouchSigned, extra = {}) { return this.send(this.msg("introduction", { vouch: vouchSigned, ...extra })); }
  request(m, request, extra = {}, prose = "We would love to work with you.") {
    return this.send(this.msg("invitation_request", {
      card_digest: this.v.card.payload_digest, mandate: m,
      proposal: { request, value_to_counterparty: { text: prose, locale: "en-US" }, etiquette_register: "first_meeting" },
      ...extra,
    }));
  }
  ritual(vouchSigned, m, request, extra = {}) {
    this.greet(); this.present(); this.receipt();
    this.introduce(vouchSigned, extra.invitation_ref ? { invitation_ref: extra.invitation_ref } : {});
    const { invitation_ref, ...rest } = extra; void invitation_ref;
    return this.request(m, request, { ...(vouchSigned ? { vouch_digest: vouchSigned.payload_digest } : {}), ...rest });
  }
  response() { return this.last.find((x) => x.type === "invitation_response"); }
  types() {
    const rows = [];
    for (const o of this.transcript) {
      const q = o.message?.payload ?? o.message;
      const row = { dir: o.dir ?? (o.held ? "held" : "in"), type: q?.type };
      if (q?.decision) row.decision = q.decision;
      if (q?.outcome) row.outcome = q.outcome;
      if (q?.tool) row.tool = q.tool;
      rows.push(row);
    }
    return rows;
  }
}

void randomBytes;
export { core };
