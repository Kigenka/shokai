// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Brand door on the 0.5 SDK core (SPEC §10): Noor Halloran (fictional) introduces Maison Ardoise (fictional)
// at Kiran Vale's own door. One presentation, one gift; the brand learns only the outcome code; the gift comes
// as a claim ticket, never an address. Fresh fictional keys, no network, a frozen clock.
// Usage: (cd packages/shokai && npm run build) && node examples/traces/brand-door.mjs
import { inboundDoor, visitor, mandate, vouch, Session, makeHost, recorder, core, NOW } from "./lib.mjs";

const { check, done, out } = recorder();
const logs = new Map();
const kiran = core.newPasskeyOwner();
const doorRep = core.ed25519FromLabel("brand-door-kiran-rep");
const noor = core.newPasskeyOwner();
const cfg = inboundDoor(doorRep, kiran, "Kiran Vale", { trusted_introducers: [noor.id], judge: core.testJudge });
const h = makeHost(cfg, { rep: doorRep, principal: null }, () => NOW, { fetched: logs });

const brandOwner = core.ed25519FromLabel("brand-door-maison");
const brand = visitor("Maison Ardoise", "company", { purposes: ["presentation", "gift"], actions: [core.DOOR_PRESENT, core.DOOR_GIFT] }, { owner: brandOwner, rep: core.ed25519FromLabel("brand-door-maison-rep") });
const offer = (kind, item, category, x = {}) => ({
  offer_id: "of-" + kind, kind, item, category, valid_until: "2026-12-31T00:00:00Z", needs_from_owner: [],
  ...(kind === "gift" ? { strings: [] } : {}), ...x,
});
const coat = offer("presentation", "Travel coat in charcoal wool", "travel");
const scarf = offer("gift", "Cashmere scarf", "fashion", { value: { value: "90.00", currency: "USD" } });
const intro = vouch(noor, "Noor Halloran", brand, ["presentation", "gift"], logs, { introducer_interest: "none" });

const s = new Session(h, brand);
s.enc = "enc-brand-door";
s.ritual(intro, mandate(brand, "presentation", [core.DOOR_PRESENT, core.DOOR_GIFT]), { actions: [core.DOOR_PRESENT, core.DOOR_GIFT] });
const resp = s.response();
check(resp?.decision === "grant", "the introduced brand is granted a pass at Kiran's door");

const outcomes = [];
const tickets = [];
for (const o of [coat, scarf]) {
  const r = s.send(s.msg("act", { seat_id: resp.seat.seat_id, tool: o.kind === "gift" ? core.DOOR_GIFT : core.DOOR_PRESENT, arguments: { offer: o } }));
  const oc = r.find((x) => x.type === "offer_outcome");
  outcomes.push(oc?.outcome);
  tickets.push(!!oc?.claim_ticket);
  if (o.kind === "gift") check(typeof oc?.claim_ticket === "string", "the gift comes as a claim ticket, never an address");
}
check(outcomes[0] === "kept_for_later" && outcomes[1] === "accepted", "the coat is kept for Kiran's digest; the scarf is accepted");
const digest = h.door.digest;
check(digest.length === 2 && digest.every((x) => x.introducer_interest === "none"), "Kiran's digest shows Noor's introduction and her declaration: a genuine recommendation ('none')");
check(!JSON.stringify(s.transcript).includes("kyoto"), "Kiran's private note never appears on the wire");

out.steps.push(
  { who: "Noor (introducer)", at: "Maison Ardoise", sent: "vouch for presentation and gift, interest none" },
  { who: "Maison Ardoise's visiting representative", at: "Kiran's door", granted: resp?.decision === "grant", outcomes },
);
out.outcomes = outcomes;
out.claim_ticket_issued = tickets[1] === true;
const wire = [];
for (const o of s.transcript) {
  const q = o.message?.payload ?? o.message;
  const row = { dir: o.dir ?? (o.held ? "held" : "in"), type: q?.type };
  if (q?.type === "introduction") row.vouch = q?.vouch ? "Noor's vouch" : null;
  if (q?.decision) row.decision = q.decision;
  if (q?.outcome) row.outcome = q.outcome;
  if (q?.tool) row.tool = q.tool;
  wire.push(row);
}
// The visitor-side messages are in s.transcript only as host replies; also record the acts we sent via types already on the host side.
done(new URL("./brand-door.trace.json", import.meta.url), { place: "Kiran Vale's door (fictional)", trace: { visit: wire } });
