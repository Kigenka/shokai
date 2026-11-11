# Holds, cancellation terms and house manners (P29)

**Status (v0.5.0): Proposed, not in the core.** Shipped with the package for review. It flags one change to an approved rule (P27 §6.5, now SPEC.md §6.9 "Deposits").

*Drafted 2026-10-30 to 2026-10-31 for the editor's review; the drafting history is kept by the editors.*

---

## Part 1. Holds

### 1.1 What it is

A visiting representative can ask a place to **hold** something reservable (a table, an appointment slot, a room, a limited item) while its owner decides. The hold has a signed expiry. Nothing is charged while it is held. If the owner says yes in time, it becomes a booking. If the owner says no, or says nothing, it is released. Silence is no (§8.1).

v0.4.0 already has this for one case: a purchase held for the owner's live approval, for at most 15 minutes (§7.3). P29 keeps that case exactly as it is, and adds a second kind: a **reservation hold**, which is asynchronous. The visit can end, and the owner answers at their own rhythm.

### 1.2 Rules

**Set up by the owner, signed into the house config.**
- A place offers holds only on actions its signed policy lists in `policy.holds` (covered by `house_digest`, §2.3), and only when its Shōkai host card carries the new duty `hold_reservations`. Anything else MUST be refused `not_now` / `POLICY_DENY`, as §7.3 refuses a purchase hold today.
- The listing MAY show each holdable action's longest hold (`hold.max_hold_s`), so a visiting representative can plan. It MUST NOT show the caps below (as P27 Q2: kinds, never thresholds).

**Asking and holding (reuses §7.3's messages).**
- The visiting representative sends the act with `hold_for_owner: true` (In v0.4.0). The door checks it as any act (§7.2, C193), then checks the hold caps (1.3), then answers `act_held` (Reused) with three new optional members: `kind: "reservation"`, `item` (what is held, its times and the place's IANA time zone) and `terms` (Part 2).
- **⚠ Changes a MUST (§7.3, "Asking").** Today a place MUST refuse a `hold_for_owner` act that doesn't spend (`LIVE_PROMPT_PURCHASE_ONLY`) and one from a Shōkai visitor card without `owner_prompts: "purchase_only"`. *Proposed amendment:* both refusals apply to purchase holds only; an act on an action in `policy.holds` is a reservation hold and needs neither. Purchase holds are unchanged.
- **⚠ Changes a MUST (§7.3, "Holding").** Today `expires_at` MUST be at most 15 minutes after the act. *Proposed amendment:* that cap stays for purchase holds. A reservation hold's `expires_at` MUST be at most the earliest of: the act's time plus the place's `max_hold_s`; the protocol ceiling of **72 hours** (proposed, Q1); the mandate's expiry; and the Shōkai visitor card's expiry. This also answers §13 item 28 ("how long a hold may last beyond the 15-minute cap").
- A hold charges nothing (MUST). When confirming would spend (a deposit, Part 2), the door counts and reserves that amount against the seat and the mandate while it is held (§5.1 C175, as §7.3 does), and releases it when the hold ends unconfirmed.

**Deciding (reuses `act_confirmation`).**
- **Yes** is an `act_confirmation` carrying the owner's passkey `OwnerConsent` with the new action **`approve_hold`** (Proposed; listed with the §8.1 passkey actions, as extensions add theirs), over `subject_ref {kind: "hold", id: hold_id, digest: <payload_digest of the act_held>}`. The digest covers the item, the expiry and the terms, so the owner's yes is tied to exactly what they were shown. A chat reply, a consent over another hold, or one after `expires_at` MUST be refused (`not_now` / `CREDENTIAL_REQUIRED`, retry `with_credential [owner_consent]`), and the hold stays until its end. (Guard 13: nothing is booked or spent before the owner's explicit yes.)
- **No** may be a chat reply (§8.1: declining is never harder than approving). It releases the hold at once.
- **⚠ Changes a MUST (§7.3, the seat).** Today a hold lives inside its seat, and a lost hold "keeps its reservation counted until the seat ends". *Proposed amendment:* a reservation hold outlives the seat. The confirmation MAY arrive in a later encounter, from any representative of the same principal holding a valid Shōkai visitor card, citing `hold_id` (as a granted `considering` is used later, §6.8). Hold state is durable state (§3.6): a door that loses a hold lapses it, and never confirms it.
- *Clarification to §5.2 (no MUST changes).* A reservation hold is not a live prompt: the act is answered at once, the visit may end, and nothing in the encounter waits on the owner.

**Release.** A hold ends, by code, with a `HoldOutcome` (1.4), when:
- it expires (`lapsed`), or the owner declines (`declined`);
- the Shōkai visitor card that asked for it is revoked (`ended`; the C198 pattern);
- the place's Shōkai host card is withdrawn, or the place itself releases it (`place_released`, with nothing charged).
A late or second confirmation gets `not_now` / `HOLD_LAPSED` (Reused).

### 1.3 Limits against hold-squatting (Sybil and abuse)

Holding costs a place something even when nobody pays: a held table is a table nobody else can book. So the owner sets caps in the conversation ("At most three of your twelve seats held at once?"), and the door counts them in code.

```ts
type HoldPolicy = {
  max_hold_s: number;                                   // the owner's choice, ≤ 259 200 (72 h)
  per_principal: { max_active: number;                  // canonical DID, across all its Shōkai visitor cards (§9.4)
                   max_lapsed?: { max: number; period: "P7D" | "P1M" } };   // hold-and-drop
  per_introducer?: { max_active: number };              // everyone introduced by one introducer, together (P27 §4.2)
  pool?: { max_active: number };                        // all holds on this action at once
  fresh?: { max_active: number };                       // place-wide, for principals with no history, receipt or introduction here
};
// policy.holds?: Record<action, HoldPolicy>  — under house_digest
```

- **Counted per principal**, across all its representatives and Shōkai visitor cards, compared as canonical DIDs (as §9.4; guard 10, aggregating across cards).
- **Fresh Shōkai visitor cards get little** (P27 Sybil addendum, item 1). The `fresh` cap bounds what a farm of new cards can hold: the worst case is `fresh.max_active` items held for at most `max_hold_s`, numbers the owner chose in advance, like P27's pool cap. A place MAY also put a P27 `trust_requirement` on a holdable action (an inn room held for two nights).
- **Past a cap:** `not_now` / `RATE_LIMITED`, retry `after` the earliest time a hold frees. **Never a penalty:** reaching a cap, or letting a hold lapse, is not misconduct and sends no notice (§9.3 "Conduct, not taste"; P27 §4.5). Silence is an honest no.
- **Bursts** of holds from new Shōkai visitor cards with similar timing, origin or introducer SHOULD be noted as `sybil_signal` (P27 Sybil addendum, item 4), and appear in the place owner's next summary.

### 1.4 Wire shape (reuse first)

```ts
// Reused, with new optional members (absent kind = "purchase": v0.4.0 behavior)
type ActHeld = RitualHeader & {
  type: "act_held"; in_reply_to: string; seat_id: string; tool: string;
  amount: Money;                                 // "0" when confirming charges nothing
  hold_id: string; act_digest: Digest; expires_at: Timestamp;
  kind?: "purchase" | "reservation";
  item?: { ref: string; label: LocalizedText; starts_at?: Timestamp; ends_at?: Timestamp; time_zone?: string };  // IANA zone
  terms?: Signed<BookingTerms>;                  // Part 2; required when the action has terms
};

// New: every change to a hold or booking, written by code (guard 12), signed by the host representative's key
type HoldOutcome = RitualHeader & {
  type: "hold_outcome"; hold_id: string; in_reply_to?: string;
  outcome: "confirmed" | "declined" | "lapsed" | "ended" | "place_released"
         | "cancelled_free" | "cancelled_fee" | "no_show" | "place_cancelled";
  at: Timestamp;
  booking_ref?: string;                          // the place's own reference once confirmed
  terms_digest?: Digest;                         // the terms that applied
  charged?: Money;                               // what the terms allowed; never above the approved amount
};
```

- `HoldOutcome` travels in the hold's encounter when it is open, otherwise through the inbox (§11.2, late delivery). The visiting representative keeps it in `brought_back` (§8.2), and builds `outcome_rendered` from it, never from host courtesy (guard 12).
- **New:** `kind`, `item`, `terms` on `act_held`; `hold_outcome`; `policy.holds`; duty `hold_reservations`; passkey action `approve_hold`. **Reused:** `hold_for_owner`, `act_held`, `act_confirmation`, `HOLD_LAPSED`, `RATE_LIMITED`, `POLICY_DENY`.

### 1.5 Holds in "Return with care"

- **Soon, by default.** A hold reaches the owner in their next summary, as a decision: what is held, the terms in one sentence, the deadline (`expires_at`, in the owner's time zone) and `if_no_reply: "released"`.
- **Now, only if the owner allowed it.** A reservation hold interrupts only when the owner's `return_prefs` counts holds as "now" (approved as a separate signed record the representative keeps), and never in their quiet hours. A purchase hold stays "now" as today.
- **Don't hold what can't reach the owner.** A representative SHOULD set `expires_at` to reach the owner's next summary when the place allows it. When the place's longest hold ends first and holds aren't "now", it SHOULD NOT ask for a hold; it brings the information home instead: "They had Tuesday at 3 PM. Holds there last 30 minutes, so I didn't hold it. Want me to ask for it tomorrow?" This keeps squatting down by design.
- **The place's owner** hears about holds as "Later" (kept, not announced), unless there is a `sybil_signal`, which is "Soon".

---

## Part 2. Cancellation terms, published before booking

### 2.1 What it is

A place can publish its **booking terms**: a free-cancellation window, a deposit or fee, and a no-show rule. The terms are signed and shown to the visitor's owner before they commit. A no-show is then a matter of **agreed terms, not a misconduct finding**.

### 2.2 Rules

- **Signed by the owner only.** `BookingTerms` are signed by the place's principal (never by a delegate: prices and money stay with the owner, P30 §2.3), and named by digest in the policy (`policy.booking_terms`), so changing them is a change of house (§3.1). Being separately signed lets a visiting representative verify them without seeing the whole house config.
- **Published before booking.** The listing entry for each action with terms MUST carry `terms: { terms_digest, owner_text, terms_url }`. The full `Signed<BookingTerms>` MUST travel in the `act_held` (1.4).
- **Shown before the yes.** The owner's `approve_hold` consent covers the `act_held` digest, so it covers the terms. Its `shown_to_owner` MUST state, in plain words, the free-cancellation deadline (in the owner's time zone), any deposit or fee, and the no-show rule (§8.1: a summary must not leave out a limit in the subject).
- **Frozen at booking.** The terms that apply are the ones whose digest the owner approved. A later house change MUST NOT change an existing booking's terms. A place MAY waive a fee in the visitor's favour.
- **Spending only after the explicit yes** (guard 13). A deposit is charged at the place's own checkout after a valid `approve_hold`, never before; nothing a representative carries holds a payment method (C211). Any fee or kept deposit MUST NOT exceed the amount the owner approved (as C187).
- **Fees are computed by code.** Whether a cancellation is free, costs the late fee or is a no-show is a pure function of the terms, the booking's `starts_at` and the time of the cancellation. The door writes the `HoldOutcome` (guard 12).
- **Cancelling.** A visiting representative cancels with an act on the action the terms name (`cancel_action`), citing `booking_ref`. A free cancellation MAY rest on the owner's chat reply (it spends nothing). One that costs a fee needs the owner's passkey (`approve_purchase`, §8.1), after the representative shows the code-computed fee.
- **A no-show is not misconduct.** A no-show MUST NOT be recorded as a §9.3 finding, MUST NOT produce a `MisconductNotice`, and MUST NOT change anyone's standing. The place MAY keep it as a fact in its relationship record (§9.1). Whether it may use that fact in its own policy is open (Q4).
- **If the place cancels,** the visitor pays nothing and any deposit is refunded in full (`if_place_cancels: "full_refund"`, the only value in v0.5.0, Q5).
- **Disputes** follow the place's own `terms_url` (P27 §6.5). The protocol carries the facts both sides signed (the terms, the consent, the outcomes); it doesn't judge.
- **⚠ Changes an approved MUST (P27 §6.5).** P27 says a place that requires a deposit "MUST keep it only on a recorded finding". That rule was written for **trust deposits** (`TrustReceipt`, `kind: "deposit"`) and should stay. *Proposed clarification:* it applies to `TrustReceipt` deposits only. A **booking deposit** under `BookingTerms` MAY be kept as those terms say, and for nothing else. A trust deposit can never be kept for a no-show.

### 2.3 Wire shape

```ts
type BookingTerms = {
  terms_id: string; protocol: "shokai/0.3"; kind: "booking_terms";
  place: { principal_id: string; entry: string };
  actions: string[];                              // the holdable or bookable actions these cover
  cancel_action: string;                          // e.g. "booking.cancel"
  time_zone: string;                              // the place's IANA zone; every window is computed in it
  free_cancel_until?: string;                     // ISO 8601 duration before starts_at, e.g. "PT24H"; absent = none
  deposit?: Money;                                // charged on the owner's yes, at the place's checkout
  late_cancel_fee?: Money;                        // after the free window; at most the deposit when there is one
  no_show: { grace: string; fee?: Money; keeps_deposit: boolean };   // grace e.g. "PT15M"
  if_place_cancels: "full_refund";
  terms_url: string;                              // https; refunds and disputes, the place's own (P27 §6.5)
  owner_text: LocalizedText;                      // the plain summary every visitor's owner reads
  issued_at: Timestamp;
};
// Signed<BookingTerms>: by the place's principal only. policy.booking_terms?: Record<action, Digest>.
```

All amounts are exact `Money` in one currency (D10). **New:** `BookingTerms`, `policy.booking_terms`, the listing's `terms`. **Reused:** `approve_purchase`, `terms_url`, `RelationshipRecord`, `brought_back`.

---

## Part 3. Structured house manners (and questions at the door)

### 3.1 What it is

A place can sign a short list of its **manners, in the owner's own words**: "Please come at your pickup time", "Please don't resell", "Quiet after 10 PM". The visiting representative carries them home, quotes them as the place's words, and remembers them for the next visit ("Carry the place's manners home", approved). Manners are courtesy, not admission rules.

### 3.2 Rules

- **Where they live.** Manners MAY be signed in the house config (under `house_digest`), or in `HouseNotes`, the separately signed notes document P30 proposed and approved as its Q6 default. `HouseNotes` may be signed by the owner, or by a delegate with `edit_notes` (P30 §2.3) named on the Shōkai host card, so fixing a word doesn't need the owner's passkey.
- **Never an admission rule by themselves.** A manner MUST NOT be a gate input (§6.4, §6.5). A door MUST NOT refuse, narrow or penalise a visitor for not having read or accepted a manner.
- **Unless the owner makes it a real rule.** When the owner wants a manner enforced, the host representative makes it a real policy rule in the conversation, which only the owner signs: a cap ("two boxes per household a day"), a trust requirement (P27), or a new proof kind, `house_rules_accepted`. That proof is met by the owner's passkey `accept_house_rules` (Reused, Gatherings) over the current manners' digest, and the door checks it deterministically. The manner text then names that rule (`enforced_by`), so visitors can tell courtesy from rule.
- **Carried home, quoted, remembered.** A visiting representative SHOULD quote manners exactly, marked as the place's words (§8.2), SHOULD remember them for the next visit, and SHOULD remind its owner when it matters (`remind`: before the visit, on arrival, after). Meaning notes MAY explain a term (Meaning notes extension).
- **Conduct in the physical world is out of scope.** An unsorted rubbish bag or a noisy night isn't a door event. P29 adds no finding for it (scenarios gap 11 stays open).

### 3.3 Questions at the door (folds in the pending addendum)

*Depends on the 10:23 PM addendum to "Set up through conversation", which is pending the editor's sign-off. P29 adds only the wire and the checks.*
- A place MAY sign **at most three** questions of its own (in `HouseNotes` or the house config). A door MUST NOT serve more than three, and notes carrying more are invalid.
- Questions attach only to actions on the place's consideration list (§6.8). Answers travel in the `invitation_request` as `door_answers`. They are prose, so they MUST NOT be part of the gate input (§6.4, §6.5): the decision is `considering`, routed to the owner or to a delegate holding `approve_commitment` (P30), with or without answers. A visitor who declines to answer is answered exactly the same way.
- **Never graded.** Neither code nor the host model may score, rank or filter answers. The host representative passes them on verbatim, as quoted data (guard 2), and a person reads them. Fit, not security: answers can be written by an AI, so security stays with the door, the passkeys and P27.
- **`answered_by`.** Every answer carries `answered_by: "owner" | "representative"`; absent counts as `"representative"`. A representative answering on its own SHOULD say so ("My owner hasn't answered this; here's what I believe they'd say"), and SHOULD list that answer in its owner's next summary to confirm or correct. It MUST NOT put personal data in an answer without `approve_share` (§8.1).
- **Not the Shōkai invitation card's questions.** Those may be `required` and ask for declared data (`INVITATION-CARD-DESIGN.md` §5). Door questions are never required and never ask for data.

### 3.4 Wire shape

```ts
type HouseManner = {
  manner_id: string;
  text: LocalizedText;                       // the owner's words; quoted, never paraphrased
  topic?: "arrival" | "conduct" | "privacy" | "resale" | "environment" | `x-${string}`;
  remind?: "before_visit" | "on_arrival" | "after_visit";
  meaning_notes?: MeaningNote[];             // Meaning notes extension
  enforced_by?: string[];                    // policy rules the owner made from it; informative
};
type DoorQuestion = { q_id: string; text: LocalizedText; for_actions: string[] };   // at most 3
type DoorAnswer   = { q_id: string; text: string; locale: Locale; answered_by: "owner" | "representative" };

type HouseNotes = {                          // P30 §2.5 (Q6 default); shape proposed here
  notes_id: string; protocol: "shokai/0.3"; kind: "house_notes";
  place: { principal_id: string; entry: string };
  version: number; supersedes?: Digest;
  manners?: HouseManner[]; questions?: DoorQuestion[];
  delegation_ref?: string;                   // when a delegate with edit_notes signs
  issued_at: Timestamp;
};
// TrustProofRule gains { kind: "house_rules_accepted" }; InvitationRequest gains door_answers?: DoorAnswer[].
```

---

## Conformance checks (deterministic parts)

*Provisional ids. C numbers are assigned at merge, after the Shōkai invitation card's C216–C225.*

| Id | Check |
|---|---|
| H1 | A `hold_for_owner` act on an action not in `policy.holds`, or at a door whose Shōkai host card lacks `hold_reservations`, is refused `not_now` / `POLICY_DENY`. A non-spending act outside `policy.holds` still gets `LIVE_PROMPT_PURCHASE_ONLY`. |
| H2 | A reservation hold's `expires_at` is at most the act's time plus `max_hold_s`, 72 hours, the mandate's expiry and the Shōkai visitor card's expiry; a purchase hold's is still at most 15 minutes. |
| H3 | Active holds are counted per principal across all its Shōkai visitor cards and representatives (canonical DID), and per introducer, `fresh` and `pool`. Past a cap: `not_now` / `RATE_LIMITED`, retry `after` the earliest free time. No finding, no notice. |
| H4 | A hold charges nothing; any deposit is reserved against the seat and the mandate and released when the hold ends unconfirmed. |
| H5 | Only a passkey `approve_hold` over the `act_held` payload digest, before `expires_at`, confirms. A chat reply, another hold's consent or a late one is refused; a late or second confirmation gets `HOLD_LAPSED`. A chat-reply decline releases at once. |
| H6 | A confirmation from a later encounter, by the same principal with a valid Shōkai visitor card, is accepted; one from another principal is refused as a seat held by another (`not_a_fit` / `SEAT_SCOPE_EXCEEDED`). |
| H7 | Revoking the Shōkai visitor card ends its holds at once; a door restart lapses holds and never confirms them. |
| T1 | The listing's `terms_digest`, the `act_held` terms and the policy's `booking_terms` digest agree; terms signed by any key but the place's principal are invalid. |
| T2 | A cancellation's result (`cancelled_free`, `cancelled_fee`, `no_show`) is a pure function of the terms, `starts_at` and the cancellation time, in the terms' time zone (test vectors across a daylight-saving change). |
| T3 | A later house change leaves a confirmed booking's `terms_digest` unchanged. |
| T4 | `charged` never exceeds the approved amount; no deposit is charged before a valid `approve_hold`. |
| T5 | A `no_show` outcome produces no finding, no `MisconductNotice` and no standing change. |
| T6 | Every `HoldOutcome` is signed and matches the door's own hold record (guard 12). |
| M1 | Changing, adding or removing manners or `door_answers` leaves `basis.input_digest` and the decision unchanged. |
| M2 | Notes with more than three questions are invalid; `door_answers` without `answered_by` are read as `"representative"`. |
| M3 | `house_rules_accepted` is met only by a valid passkey `accept_house_rules` over the current manners' digest. |

---

## Worked example (fictional): Asagiri-dō

**Asagiri-dō** is Naoko Arai's third-generation sweets shop (from "Set up through conversation"). It makes sixty boxes of daifuku a day for pickup, and holds a New Year mochi day.

1. **The conversation.** Her host representative asks, "If someone's agent finds a box they like, should I keep it while they ask their owner? For how long?" Naoko: "Until the evening is fine. One box per family on hold." It proposes, and she signs:
   - `box.reserve` holdable for up to 3 hours, one active hold per household, ten held at once, four of them at most for new visitors;
   - terms: free cancellation until 9 AM on pickup day, no deposit, no fee ("unclaimed boxes still go to walk-in neighbors");
   - for the mochi day, a ¥1,000 deposit per box, kept on a no-show, refunded on cancellation before 9 AM the day before;
   - her three manners from setup ("Please come at your pickup time…", "Please don't resell", "Bring your own bag if you can"). "Please don't resell" becomes a real rule, two boxes per household a day; the other two stay courtesy.
2. **A hold.** At 4:10 PM, Tobias Wren's representative agent is admitted with a pass and finds two boxes for tomorrow. Tobias's summary is at 6 PM, and Asagiri-dō holds for up to 3 hours, so it asks for a hold until 7:10 PM. The door answers `act_held`, with the terms attached.
3. **Return with care.** At 6 PM: "Asagiri-dō is holding two boxes for pickup tomorrow at 10 AM. Free to cancel until 9 AM; nothing to pay now. Shall I book them? Answer by 7:10 PM; if you don't, they're released." Tobias taps his passkey at 6:04 PM. The door writes `confirmed`.
4. **A free cancellation.** At 8:30 the next morning Tobias's plans change. He says "cancel", by chat reply, and the door writes `cancelled_free`. No passkey was needed, because nothing was spent.
5. **A no-show, under the terms.** On mochi day, Rafe Kalani's booking passes the 15-minute grace. The door writes `no_show`, `charged: ¥1,000`, under the terms Rafe approved. No finding, no notice, and his standing is unchanged. His summary: "You missed the mochi pickup. Under the terms you approved, Asagiri-dō kept the ¥1,000 deposit. Their terms page explains how to ask about it."
6. **Squatting.** Overnight, forty new Shōkai visitor cards try to hold boxes. Four get holds (the `fresh` cap); the rest get `RATE_LIMITED`. Naoko's summary: "Many new visitors tried to hold boxes overnight; four were held and released at 7 AM. Nothing needs you."
7. **Manners home, and a question.** The mochi day asks one question at the door: "Who will you share the mochi with?" Tobias's representative answers, `answered_by: "representative"`: "My owner hasn't answered this; I believe he'd say his neighbors." Naoko reads it and decides. Tobias's next summary includes that answer for him to confirm, and the night before pickup it reminds him: "Asagiri-dō asks you to bring your own bag if you can."

---

## What's already in v0.4.0, and what's new

| | Already in v0.4.0 | New in P29 |
|---|---|---|
| **Holds** | A purchase held for live approval, at most 15 minutes, `act_held` / `act_confirmation`, `HOLD_LAPSED`, silence is no (§7.3, §8.1) | Reservation holds (async, up to the place's limit, at most 72 h); `approve_hold`; duty `hold_reservations`; `policy.holds` caps per principal, introducer, new Shōkai visitor cards and pool; holds outlive the seat; `HoldOutcome` |
| **Terms** | `terms_url` on a `TrustReceipt` (P27 §6.5); exact `Money` (D10); no payment method (C211); charge at most the stated amount (C187) | `BookingTerms` signed by the owner and shown before the yes; fees computed by code; no-show is terms, not misconduct; the full refund when the place cancels |
| **Manners** | House rules in the signed house config (§2.3); loyalty includes following them (§1); quotes attributed (§8.2); `accept_house_rules` (Gatherings) | A structured `HouseManner` list, optionally in `HouseNotes` (P30); `house_rules_accepted` proof; questions at the door with `answered_by` |
| **Return with care** | One next step, `if_no_reply`, `outcome_rendered` (§8.2) | Holds as "Soon" by default, "now" only under `return_prefs`; don't hold what can't reach the owner |

---

## Open questions (with proposed defaults)

1. **Protocol ceiling for a reservation hold.** *Proposed:* 72 hours. (Scenario 5's inn hold, "answer by Sunday", fits; anything longer is a booking with free cancellation.)
2. **`approve_hold` or reuse `approve_purchase`?** *Proposed:* a new `approve_hold`, because most reservations spend nothing; `approve_purchase` stays for purchases and paid cancellations.
3. **Should the listing show `max_hold_s`?** *Proposed:* yes. A hold length is not a trust threshold, and it lets a representative avoid holds that would lapse unseen.
4. **May a place use its no-show record in its policy** (for example, "a deposit after two no-shows")? *Proposed:* yes, as a P27 path kind shown only as a kind, never as a number, and never as a finding.
5. **Only `full_refund` when the place cancels?** *Proposed:* yes for v0.5.0.
6. **A registered `booking` purpose code** (scenarios gap 12)? *Proposed:* register `booking`, which may carry `max_amount` when terms include a deposit.
7. **Where questions at the door live.** *Proposed:* in `HouseNotes`, so a delegate with `edit_notes` may reword them. Which actions take them stays in the policy, signed by the owner.
8. **Hiding a schedule** (scenarios gap 3). *Proposed:* out of P29; a place MAY show holdable slots only to verified visitors.

---

## Sign-off items for the editor

1. **Reservation holds** beside the unchanged purchase hold, reusing `hold_for_owner`, `act_held` and `act_confirmation`.
2. **The three flagged §7.3 amendments:** purchase-only refusals scoped to purchase holds; the 15-minute cap kept for purchases, with the place's limit (at most 72 h) for reservations; reservation holds outliving the seat as durable state.
3. **`approve_hold`** as a new passkey action, and decline by chat reply.
4. **Hold caps** per principal, introducer, new Shōkai visitor cards and pool, with `RATE_LIMITED`, no penalty, and bursts noted as `sybil_signal`.
5. **Holds in "Return with care":** "Soon" by default, "now" only under `return_prefs`, and "don't hold what can't reach the owner".
6. **`HoldOutcome`**, written by code (guard 12).
7. **`BookingTerms`**, signed by the owner only, published in the listing and shown before the yes, and frozen at booking.
8. **A no-show is terms, not misconduct**, and the **flagged P27 §6.5 clarification** (trust deposits vs booking deposits).
9. **Fees computed by code**; free cancellation by chat reply; paid cancellation by passkey; full refund when the place cancels.
10. **Structured house manners**, optionally in `HouseNotes`, never a gate input unless the owner makes one a real rule (`house_rules_accepted`).
11. **Questions at the door:** the wire (`DoorQuestion`, `DoorAnswer`, `answered_by`) and the checks. This needs the pending addendum's sign-off first.
12. **The conformance checks** H1–H7, T1–T6, M1–M3.
13. **The Asagiri-dō worked example**, and open questions 1–8, or a go with the proposed defaults.

---

*Copy check: "Shōkai visitor card", "Shōkai host card", "Shōkai invitation card" and "Shōkai introduction card" in full; "representative agent", "visiting representative", "host representative", "admitted with a pass", "conversation", "agent"; no banned words; fictional names only; wire identifiers quoted as code. Section numbers checked against `SPEC.md` v0.4.0, P27, P28, P30, the host guards and the setup and return drafts.*

---

**APPROVED (Fri 2026-10-30, 10:55 PM PT, the editor):** P29 as drafted. This covers all sign-off items 1–13, the three §7.3 MUST amendments, the P27 §6.5 narrowing (booking deposits follow the signed `BookingTerms`), and the proposed defaults for open questions 1–8. Questions at the door may live in `HouseNotes`, so a delegate can reword them, while which actions they attach to stays in the owner-signed policy. P30 Q6's default is confirmed as the split-out `HouseNotes`.
