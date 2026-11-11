// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (v0.4.0): the two Shōkai cards from the SDK's side. A door signs a Shōkai host card bound to its entry and house config;
// a representative's card is a Shōkai visitor card; the wrong kind, a changed house, an owner-signed host card for another
// address, the purchase-only live owner prompt (actWithOwner) and the credential rule. In process; fictional people only.
import { createDoor, createRepresentative, signCard, sign, generateRepresentativeKey, developmentPasskey, houseDigestFor, SHOKAI_DOOR_CARD_INVALID, SHOKAI_HOUSE_CHANGED, SHOKAI_APPROVER_REQUIRED,
  type DoorOptions } from "../src/index.js";
import { entryUrl } from "../src/core/door.js";
import { PLACE_CARD_REPORTS } from "../src/core/trust.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const thrown = (f: () => unknown): any => { try { f(); return null; } catch (e) { return e; } };
const USD = (value: string) => ({ value, currency: "USD" });
const BASE = "http://127.0.0.1:0/shokai";
const kettle = (o: Partial<DoorOptions> = {}): DoorOptions => ({ name: "kettle", displayName: "Kettle & Leaf", category: "store",
  purposes: [{ code: "purchase", statement: "Buying tea." }, { code: "visitation", statement: "Looking around." }],
  actions: [{ action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover" }, { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", limits: { max_amount: USD("100.00") } }],
  spendingActions: ["tea.order"], approvedBy: { name: "Suzu", role: "Owner" }, ...o });

async function main() {
  console.log("SDK two Shōkai cards (v0.4.0)");
  const noApprover = thrown(() => createDoor(kettle({ approvedBy: undefined })));
  check(noApprover?.code === SHOKAI_APPROVER_REQUIRED && /approvedBy: \{ name, role \}/.test(noApprover.message), "a company door without approvedBy throws SHOKAI_APPROVER_REQUIRED with a clear message (no placeholder approver)");
  check(thrown(() => createDoor(kettle({ approvedBy: { name: " ", role: "Owner" } })))?.code === SHOKAI_APPROVER_REQUIRED && thrown(() => createDoor(kettle({ approvedBy: { name: "Suzu", role: "" } })))?.code === SHOKAI_APPROVER_REQUIRED, "… and so does a blank name or role");
  const door = createDoor(kettle());
  const card = door.host.cfg.card!.payload; const entry = door.listing().places[0];
  check(card.kind === "host" && card.place?.entry === door.entry && card.place?.principal_id === door.principalId, "a door signs a Shōkai host card bound to its own entry and principal");
  check(card.house_digest === entry.house_digest && !!card.host_scope?.actions.includes("tea.order") && card.org_approval?.approver.name === "Suzu" && !!card.shown_to_owner, "… with its house digest (named on the listing too), host scope, the approving person and the owner's summary");
  const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"] });
  check(aya.card.payload.kind === "visitor", "a representative's card is a Shōkai visitor card by default");
  const v = await aya.visit(door, { purpose: "visitation", actions: ["tea.browse"] });
  check(v.seated && v.placeCheck.checked.includes("a Shōkai host card for this place and its house config"), "the visitor checks the place's Shōkai host card and is admitted with a pass");

  // the wrong kind at the door
  const k = generateRepresentativeKey(); const owner = developmentPasskey();
  const ayaHost = signCard(k, owner, { displayName: "Aya Linden", purposes: ["visitation"], actions: ["tea.browse"], cardKind: "host",
    host: { place: { principal_id: owner.id, entry: "https://aya.example/shokai/places/door/entry" }, host_scope: { actions: ["door.present"], duties: ["seat"] }, house_digest: "sha-256:" + "A".repeat(43) },
    shownToOwner: { text: "My representative may keep my door.", locale: "en-US" } });
  const wrong = createRepresentative({ ownerName: "Aya Linden", owner, key: k, card: ayaHost, purposes: ["visitation"], actions: ["tea.browse"] });
  const w = await wrong.visit(door, { purpose: "visitation", actions: ["tea.browse"] });
  const rr = w.response?.readiness_requirements?.[0];
  check(w.decision === "deny" && w.response?.disposition === "not_now" && rr?.code === "card_kind" && /Please come back with your Shōkai visitor card/.test(rr.owner_text.text), "a Shōkai host card shown as a visitor's credential gets the fixed, fixable refusal");
  check(thrown(() => signCard(k, owner, { displayName: "Aya", purposes: ["visitation"], actions: ["tea.browse"], cardKind: "host" })) !== null, "signCard refuses a Shōkai host card without its place binding");

  // a changed house
  const before = door.listing().places[0];
  door.changeHouse({ spending_actions: ["tea.order", "tea.browse"] });
  const after = door.listing().places[0];
  check(before.house_digest !== after.house_digest && door.hostCardProblem === null, "changeHouse re-signs the place-key Shōkai host card over the new house config");
  const stale = await aya.visit({ entry: before.entry, representative_id: before.representative_id!, principal_id: before.principal_id, actions: before.actions, house_digest: before.house_digest! },
    { purpose: "visitation", actions: ["tea.browse"], transport: async (_u, b) => (await door.post(b)).envelope });
  check(!stale.placeCheck.ok && stale.placeCheck.problem === "house_changed" && stale.placeCheck.report === PLACE_CARD_REPORTS.house_changed && !stale.transcript.some((m) => (m.message?.payload ?? m.message)?.type === "invitation_request"),
    "a visitor holding the old listing sees the change, sends no request, and has the fixed sentence for its owner");

  // an owner-signed Shōkai host card
  const suzu = developmentPasskey(); const rep = generateRepresentativeKey(); const opts = kettle({ approvedBy: undefined });   // an owner-signed card needs no approvedBy
  const hd = houseDigestFor(opts, suzu.id, BASE);
  const hostCard = (o: { entry?: string; house?: string; kind?: "host" | "visitor" } = {}) => signCard(rep, suzu, { displayName: "Kettle & Leaf", kind: "person", purposes: ["purchase", "visitation"], actions: ["tea.browse", "tea.order"],
    cardKind: o.kind ?? "host", ...(o.kind === "visitor" ? {} : { host: { place: { principal_id: suzu.id, entry: o.entry ?? entryUrl(BASE, "kettle") }, host_scope: { actions: ["tea.browse", "tea.order"], duties: ["seat", "issue_passes"] }, house_digest: o.house ?? hd } }),
    shownToOwner: { text: "My representative may welcome visitors at Kettle & Leaf and serve tea.browse, tea.order.", locale: "en-US" } });
  const od = createDoor({ ...opts, card: hostCard(), keys: { rep } });
  check(od.hostCardProblem === null && od.listing().places[0].house_digest === hd, "an owner signs a Shōkai host card over houseDigestFor(…): the door opens with it");
  check(thrown(() => createDoor({ ...opts, card: hostCard({ house: "sha-256:" + "B".repeat(43) }), keys: { rep } }))?.code === SHOKAI_HOUSE_CHANGED, "a host card over another house config: SHOKAI_HOUSE_CHANGED");
  check(thrown(() => createDoor({ ...opts, card: hostCard({ entry: entryUrl(BASE, "kettle-popup") }), keys: { rep } }))?.code === SHOKAI_DOOR_CARD_INVALID, "a host card for another entry: SHOKAI_DOOR_CARD_INVALID");
  check(thrown(() => createDoor({ ...opts, card: hostCard({ kind: "visitor" }), keys: { rep } }))?.code === SHOKAI_DOOR_CARD_INVALID, "a Shōkai visitor card can't keep a door");
  od.setBaseUrl("http://127.0.0.1:4999/shokai");
  const closed = await od.post({});
  check(od.hostCardProblem === "other_place" && closed.status === 503 && od.listing().places.length === 0, "moved to another address, the owner-signed door closes (503, empty listing) until its owner signs anew");

  // the purchase-only live owner prompt
  const shop = createDoor(kettle({ purchaseHoldSeconds: 120 }));
  const kiran = createRepresentative({ ownerName: "Kiran Vale", purposes: ["purchase"], actions: ["tea.browse", "tea.order"], ownerPrompts: "purchase_only" });
  check(kiran.card.payload.owner_prompts === "purchase_only" && /ask Kiran Vale live to approve a purchase/.test(kiran.card.payload.shown_to_owner?.text ?? ""), "the visitor card tells its owner a purchase may be held for them");
  check(shop.host.cfg.card!.payload.host_scope!.duties.includes("hold_purchases") && /hold a purchase/.test(shop.host.cfg.card!.payload.shown_to_owner!.text), "the place's host card tells its owner it holds purchases");
  const kv = await kiran.visit(shop, { purpose: "purchase", actions: ["tea.browse", "tea.order"], limits: { max_amount: USD("30.00") } });
  let seen: S.ActHeld | undefined;
  const yes = async (h: S.ActHeld) => { seen = h; return sign<S.OwnerConsent>({ consent_id: "oc-k1", owner_id: kiran.owner.id, representative_id: kiran.id, action: "approve_purchase", decision: "approve",
    subject_ref: { kind: "act", id: h.hold_id, digest: h.act_digest }, assurance: "passkey", expires_at: h.expires_at, issued_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    shown_to_owner: { text: `Buy at Kettle & Leaf: ${h.tool}, USD ${h.amount.value}. Approve?`, locale: "en-US" } }, kiran.owner); };
  const r = await kv.actWithOwner("tea.order", { amount: USD("12.00"), payment_ref: "o-1" }, yes) as any;
  check(!!seen && r?.type === "act_result" && r.ok === true, "actWithOwner: held, the owner approves by passkey, the purchase goes through");
  const n = await kv.actWithOwner("tea.order", { amount: USD("5.00"), payment_ref: "o-2" }, async () => null) as any;
  check(n?.refused_by === "owner", "the owner says no: nothing is sent, the hold lapses");
  const nb = await kv.actWithOwner("tea.browse", {}, yes) as any;
  check(nb?.refused_by === "representative" && /only for a purchase/.test(nb.why), "a live prompt for anything but a purchase is refused before anything is sent");
  const quiet = await aya.visit(shop, { purpose: "purchase", actions: ["tea.order"], limits: { max_amount: USD("30.00") } });
  const q = await quiet.actWithOwner("tea.order", { amount: USD("5.00") }, yes) as any;
  check(q?.refused_by === "representative" && /owner_prompts/.test(q.why), "a representative whose card didn't tell its owner can't ask them live");

  // the credential rule
  const c = await kv.act("tea.order", { amount: USD("1.00"), card_number: "4242424242424242" }) as any;
  check(c?.reason_code === "CREDENTIAL_NOT_ACCEPTED", "a card number in an act is refused at the door (CREDENTIAL_NOT_ACCEPTED)");
  console.log(`${pass} SDK two-card checks passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
