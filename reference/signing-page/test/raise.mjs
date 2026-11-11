// SIGNING.md §8: the one-purchase raise on the reference signing page. The figures are checked against the mandate the owner
// signed, the representative agent's ledger and the held act; on any mismatch the page offers nothing (checkItems refuses).
// Fictional actors only.
import { checkItems, buildItems } from "../items.mjs";
import { digestOf } from "../webauthn.mjs";
let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log("  ✗ " + what); } };
const OWNER = "did:jwk:owner-fixture", PLACE = "did:web:teas.example";
const current = { mandate_id: "m-1", card_id: "card-1", representative_id: "did:key:rep-fixture", principal_id: OWNER, purpose: { code: "purchase" },
  allowed_actions: ["store.buy"], limits: { max_amount: { value: "30.00", currency: "USD" } }, counterparties: [PLACE], issued_at: "2026-11-01T20:00:00Z", expires_at: "2026-11-02T20:00:00Z" };
const HOLD_END = "2026-11-02T00:15:00Z", ACT = "sha-256:act-fixture";
const lr = { place: PLACE, hold_id: "hold-1", limit: { value: "30.00", currency: "USD" }, current: { value: "20.00", currency: "USD" }, proposed: { value: "60.00", currency: "USD" }, expires_at: HOLD_END };
const raiseCtx = (o = {}) => ({ limit_request: { ...lr, ...(o.lr ?? {}) }, current_mandate: { payload: current }, ledger_current: o.ledger ?? { value: "20.00", currency: "USD" },
  held: { tool: "store.buy_tin", amount: o.held ?? { value: "40.00", currency: "USD" }, act_digest: ACT }, place_name: "Linden & Pike Teas", time_zone: "America/Los_Angeles", ...(o.seat ? { seat_limit: o.seat } : {}) });
// a raise comes after the owner has a passkey, so the items name the owner key itself (not "$OWNER_DID")
const filled = (x) => JSON.parse(JSON.stringify(x).replaceAll("$OWNER_DID", OWNER));
const mandate = (o = {}) => ({ mandate_id: "m-2", card_id: "card-1", representative_id: "did:key:rep-fixture", principal_id: OWNER, purpose: { code: "purchase" },
  allowed_actions: ["store.buy"], limits: { max_amount: { value: "60.00", currency: "USD" } }, counterparties: [PLACE], issued_at: "2026-11-02T00:05:00Z", expires_at: HOLD_END,
  supersedes: { mandate_id: "m-1", mandate_digest: digestOf(filled(current)), hold: { hold_id: "hold-1", act_digest: ACT } }, ...o });
const session = (payload, raise) => ({ owner_display_name: "Fixture Owner", items: [{ name: "raise", title: "Approve the tea", summary: ["one purchase"], payload, ...(raise === null ? {} : { raise: raise ?? raiseCtx() }) }] });
const build = (s) => buildItems(s, OWNER, "sign.example")[0];
const refused = (s, re) => { const p = checkItems(s); return p.length > 0 && p.some((x) => re.test(x)) && build(s).problems.length > 0; };

// matching figures: offered, decision first: the question with the purchase amount, the four figures, what it approves and what
// it doesn't, the seller (its name only as a claim), the deadline in the owner's zone, and the signed text that states the action
{ const s = session(mandate()); check(checkItems(s).length === 0, "matching figures: the page starts"); const it = build(s), d = it.decision;
  check(it.own_tap === true, "a raise is never in a one-tap batch (§8 item 8)");
  check(!!d && d.headline === "Approve this purchase (40.00 USD) only?" && /Approve one held purchase \(40\.00 USD\)/.test(it.title), "the question and the title give the purchase amount (40.00 USD), not the total");
  check(d.merchant.some((x) => /teas\.example \(did:web:teas\.example\)/.test(x)), "the site is shown by its verified identifier (§8 item 1)");
  check(JSON.stringify(d.table) === JSON.stringify([["Your normal limit", "30.00 USD"], ["Already paid or held", "20.00 USD"], ["This purchase", "40.00 USD"], ["Total including this purchase", "60.00 USD"]]), "the four figures from the machine fields (§8 item 3)");
  check(/this one purchase of 40\.00 USD/.test(d.scope[0]) && /not a new purchase of 60\.00 USD/.test(d.scope[1]) && /doesn't apply to any other purchase, action or site/.test(d.scope[2]), "says what it approves, that the total isn't a new purchase, and that it applies to nothing else (§8 item 4)");
  check(d.expiry[0] === "By Nov 1, 2026, 4:15 PM PST" && /lapses when the hold ends/.test(d.expiry[1]) && /automatically declined/.test(d.expiry[2]), "the deadline in the owner's time zone, and doing nothing declines (§8 item 5)");
  check(d.merchant.some((x) => /Linden & Pike Teas \(not verified\)/.test(x)) && /don't recognize it, don't approve/.test(d.warning), "a display name only as an unverified claim, with the warning");
  check(d.approve === "Approve this purchase only" && d.decline === "Don't approve", "the buttons say what they do");
  check(it.main.length === 0 && it.details.some((x) => /^HOLD: hold-1\./.test(x)) && it.details.some((x) => /^ACT DIGEST: sha-256:act-fixture\./.test(x)) && it.details.some((x) => /^WHAT: a mandate \(m-2\)/.test(x)), "the technical identifiers are under Details");
  check(it.details.some((x) => /for the one held purchase only; it can't be used for any other purchase/.test(x)), "the aggregate line under Details says it applies to this purchase only");
  check(it.detail_quoted.length === 1 && it.quoted.length === 0, "the supplier's words are under Details, marked as a quote");
  const st = it.payload.shown_to_owner?.text ?? "";
  check(st === d.signed_text && /approving raises your limit to 60\.00 USD for this one purchase only/.test(st) && /Other purchases, at this site or any other, keep their limits/.test(st) && /lapses when the hold ends/.test(st) && /automatically declined/.test(st) && it.digest === digestOf(it.payload),
    "shown_to_owner states the action, is the text shown, and is signed (§8 item 7)");
}
// §8 item 2: a figure that doesn't match the mandate, the ledger or the held act: refused, nothing offered
check(refused(session(mandate(), raiseCtx({ lr: { limit: { value: "25.00", currency: "USD" } } })), /amounts don't match.*limit/), "limit other than the signed mandate's ceiling: refused");
check(refused(session(mandate(), raiseCtx({ seat: { value: "25.00", currency: "USD" } })), /amounts don't match.*limit/), "limit above a lower seat cap: refused");
check(checkItems(session(mandate(), { ...raiseCtx({ seat: { value: "25.00", currency: "USD" }, lr: { limit: { value: "25.00", currency: "USD" }, current: { value: "20.00", currency: "USD" } } }) })).length === 0, "limit equal to a lower seat cap: offered");
check(refused(session(mandate(), raiseCtx({ ledger: { value: "10.00", currency: "USD" } })), /amounts don't match.*representative agent's record/), "current other than the representative agent's ledger: refused");
check(refused(session(mandate(), raiseCtx({ held: { value: "35.00", currency: "USD" } })), /amounts don't match.*the held purchase/), "proposed − current other than the held act's amount: refused");
check(refused(session(mandate(), raiseCtx({ lr: { current: { value: "20.00", currency: "EUR" } } })), /amounts don't match.*currency/), "mixed currencies: refused");
check(refused(session(mandate(), raiseCtx({ lr: { proposed: { value: "abc", currency: "USD" } } })), /amounts don't match/), "a figure that isn't an amount: refused");
// §8 item 6: the mandate is built from the hold
check(refused(session(mandate({ limits: { max_amount: { value: "80.00", currency: "USD" } } })), /max_amount/), "an amount above proposed: refused");
check(refused(session(mandate({ expires_at: "2026-11-03T00:00:00Z" })), /expires_at/), "an expiry after the hold's: refused");
check(refused(session(mandate({ supersedes: { mandate_id: "m-1", mandate_digest: digestOf(filled(current)), hold: { hold_id: "hold-9", act_digest: ACT } } })), /hold_id/), "another hold: refused");
check(refused(session(mandate({ supersedes: { mandate_id: "m-1", mandate_digest: "sha-256:other", hold: { hold_id: "hold-1", act_digest: ACT } } })), /mandate you signed/), "a supersedes that doesn't name the signed mandate: refused");
check(refused(session(mandate({ card_id: "card-2" })), /same Shōkai visitor card/), "another Shōkai visitor card: refused");
check(refused(session(mandate({ under_allowance: { allowance_id: "a-1" } })), /allowance/), "under an allowance: refused");
check(refused(session(mandate({ shown_to_owner: { text: "Approve 60 USD", locale: "en-US" } })), /shown_to_owner/), "a supplied shown_to_owner text: refused");
check(refused(session(mandate(), null), /raise.*context/), "a supersedes.hold without its raise context: refused");
check(checkItems({ owner_display_name: "x", items: [{ name: "r", title: "t", summary: ["s"], payload: mandate(), raise: { limit_request: lr } }] }).some((x) => /items\[0\]\.raise/.test(x)), "an incomplete raise context: refused");
console.log(`signing-page raise (SIGNING.md §8): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
