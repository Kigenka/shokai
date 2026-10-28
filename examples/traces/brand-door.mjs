// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The brand-door example as a run of the reference implementation (reference/engawa), mirroring its conformance scenario
// V29-D2: Noor Halloran (fictional) introduces Maison Ardoise (fictional) at Kiran Vale's own door (SPEC §10); one presentation,
// one gift; the brand learns only the outcome code. Fresh fictional keys; no network. Writes brand-door.trace.json (message types only).
// Usage: (cd reference/engawa && npm run build) && node examples/traces/brand-door.mjs
import { writeFileSync } from "node:fs";
const E = new URL("../../reference/engawa/dist/", import.meta.url).href;
const { newEd25519, newPasskeyOwner, b64u } = await import(E + "src/crypto.js");
const { inboundDoor } = await import(E + "src/places.js");
const { Host } = await import(E + "src/host.js");
const { RealVerifier } = await import(E + "src/verify.js");
const { testJudge, DOOR_PRESENT, DOOR_GIFT } = await import(E + "src/inbound.js");
const { visitor, mandate, vouch, Session, clockAt } = await import(E + "test/kit.js");

const registry = new Map();
const out = { checks: [] };
const check = (ok, what) => { out.checks.push({ ok: !!ok, what }); if (!ok) { console.error("FAILED: " + what); process.exitCode = 1; } };
const clock = clockAt("2026-11-02T18:00:00Z");
const kiran = newPasskeyOwner(); const doorRep = newEd25519(); const noor = newPasskeyOwner(); const logs = new Map();
const cfg = inboundDoor(doorRep, kiran, "Kiran Vale", { trusted_introducers: [noor.id], judge: testJudge });
const h = new Host(cfg, doorRep, null, new RealVerifier(registry), clock.now, { fetched: logs });
const brandOwner = newEd25519("did:web:maison-ardoise.example"); registry.set(brandOwner.id, { alg: "Ed25519", public_key: b64u(brandOwner.pubRaw) });
const brand = visitor("Maison Ardoise", "company", { purposes: ["presentation", "gift"], actions: [DOOR_PRESENT, DOOR_GIFT] }, { owner: brandOwner });
const offer = (kind, item, category, x = {}) => ({ offer_id: "of-" + kind, kind, item, category, valid_until: "2026-12-31T00:00:00Z", needs_from_owner: [], ...(kind === "gift" ? { strings: [] } : {}), ...x });
const coat = offer("presentation", "Travel coat in charcoal wool", "travel");
const scarf = offer("gift", "Cashmere scarf", "fashion", { value: { value: "90.00", currency: "USD" } });
const v = vouch(noor, "Noor Halloran", brand, ["presentation", "gift"], logs, undefined, undefined, { introducer_interest: "none" });
const wire = []; const handle = h.handle.bind(h);
h.handle = (msg) => { const p = msg?.payload ?? msg; wire.push({ dir: "out", type: p?.type, tool: p?.tool, purpose: p?.purpose?.code ?? p?.purpose, vouch: p?.type === "introduction" ? (p?.vouch ? "Noor's vouch" : null) : undefined });
  const r = handle(msg); for (const o of r) { const q = o.message?.payload ?? o.message; wire.push({ dir: "in", type: q?.type, decision: q?.decision, outcome: q?.outcome }); } return r; };
const s = new Session(h, brand);
s.ritual(v, mandate(brand, "presentation", [DOOR_PRESENT, DOOR_GIFT]), { actions: [DOOR_PRESENT, DOOR_GIFT] });
const resp = s.response();
check(resp?.decision === "grant", "the introduced brand is seated at Kiran's door");
const outcomes = [];
for (const o of [coat, scarf]) { const r = s.send(s.msg("act", { seat_id: resp.seat.seat_id, tool: o.kind === "gift" ? DOOR_GIFT : DOOR_PRESENT, arguments: { offer: o } }));
  const oc = r.find((x) => x.type === "offer_outcome"); outcomes.push(oc?.outcome); if (o.kind === "gift") check(typeof oc?.claim_ticket === "string", "the gift comes as a claim ticket, never an address"); }
check(outcomes[0] === "kept_for_later" && outcomes[1] === "accepted", "the coat is kept for Kiran's digest; the scarf is accepted");
const digest = h.door.digest;
check(digest.length === 2 && digest.every((x) => x.introducer_interest === "none"), "Kiran's digest shows Noor's introduction and her declaration: a genuine recommendation ('none')");
check(!JSON.stringify(s.transcript).includes("kyoto"), "Kiran's private note never appears on the wire");
out.trace = wire.map((w) => Object.fromEntries(Object.entries(w).filter(([, x]) => x !== undefined)));
out.outcomes = outcomes; out.ok = out.checks.every((c) => c.ok);
writeFileSync(new URL("./brand-door.trace.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`${out.checks.filter((c) => c.ok).length}/${out.checks.length} checks passed`);
