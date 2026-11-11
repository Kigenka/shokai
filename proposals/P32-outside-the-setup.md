<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P32 (adopted into v0.5.0): outside the setup: the host brings it to the owner

*Adopted into SPEC v0.5.0 (2026-11-03, release line): sections 4–7 are now SPEC.md §7.5 (outside the setup, C258) and §7.6 (changing the setup, C259), with demo 2's reservations in §7.4 (C260, C261). Differences from this draft: the owner review shows `may_spend` only, never the limit; one `add_action` per amendment, and none that spends from a review; amendments aren't kept across a restart yet (§13 item 30); an ask that goes to the owner must say what it asks for and why (`asks_for`, `reason`; C262), in place of this draft's optional `topic`. Still pending the open discussion.*

*Original status: draft, 2026-11-02 (superseded by the adoption note above; SPEC.md is normative where they differ). It was found while building demo 1 ("Open the tea house", the party-rental question) and asked for by the project lead. It is written against v0.5.0, and the section numbers are v0.5.0's. Sketch verifiers and vectors: [`tools/p32-sketch.mjs`](../tools/p32-sketch.mjs) and [`P32-vectors.json`](./P32-vectors.json). Adoption needs the 14-day open discussion (GOVERNANCE.md).*

## 1. The rule in one paragraph

A host representative handles everything **inside the owner's signed setup** on its own: the offers it may sell, the answers it may give, and its manners. Anything **outside the setup** goes to the owner. That includes a question the setup has no signed answer for, such as "Can I rent the tea house for a party?", and an order above a size the owner set. The host doesn't guess or invent; it tells the visitor honestly, "I'll check with the owner." The owner sees the ask, who sent the visitor and why, and what the visitor's Shōkai visitor card allows. The owner then chooses: **answer once**, **answer and add it to the setup**, or **decline**. Adding to the setup is a new owner signature over a new, versioned setup that names the one it replaces. The host can never widen its own setup, and nothing a visitor says can change it. The visitor gets the answer while it waits, or later with its return code.

## 2. Why

v0.5.0 already routes some things to people:
- §6.8 `considering` for requested **actions** outside host policy;
- §7.3 holds, for the **visiting** owner's approval of a purchase above the visitor's own limit;
- §8.4 `door_questions`, whose answers go to the owner.

It has no defined outcome for an ordinary in-seat **question or request the setup doesn't cover**. That leaves a host two bad options:
- improvise, which a model will do fluently and wrongly;
- refuse, which loses the business.

Small owners set up their place once, by talking (§8.4), and can't foresee every question. The answer is the same as a good shop assistant's: "Let me check with the owner." A good answer should then be learned, but only when the owner says so.

## 3. Terms

- **The setup** is the house config the owner signed: everything `house_digest` covers (§2.3). P32 adds `policy.outside_setup` and `policy.setup_version` to it.
- **Inside the setup** means one of three things:
  - a signed offer the seat allows (an act of a listed action within the seat's limits, §7.2);
  - a signed answer (`policy.outside_setup.answers`);
  - the welcome and manners the owner set.
- **Outside the setup** means anything else a seated visitor asks for: a question with no signed answer, a request for something not offered, or an order above `order_review_above`.
- **Withheld** means a topic the owner told the host never to disclose (`never_disclose`). It is neither answered nor sent to the owner as a question.

## 4. The house config members (inside `house_digest`)

```ts
interface OutsideSetupPolicy {              // policy.outside_setup
  answers: SetupAnswer[];                   // what the host may answer on its own, in the owner's words
  order_review_above?: { quantity?: number; amount?: Money };  // an order above this is outside the setup
  owner_response_s?: number;                // how long the host waits for the owner; default 86400, at most 604800
  welcome?: { text: string; locale: string };              // the welcome manners, in the owner's words
  never_disclose: NeverDisclose[];          // at least "owner_personal_details"; see §9
}
interface SetupAnswer {
  answer_id: string; topic: string;         // topic: a short stable label, e.g. "event_rental"
  text: { text: string; locale: string };   // the owner's words, served verbatim
  added?: { from_review: string; amendment_id: string };   // set when it was learned from an owner review
}
type NeverDisclose = "owner_personal_details" | "back_office" | "other_visitors" | { code: `x-${string}`; text: string };
// policy.setup_version: integer ≥ 1. policy.prev_house_digest: the digest of the setup this one replaces (absent at version 1).
```

- A door MUST refuse to start with:
  - an `outside_setup` without `never_disclose`;
  - an answer whose `text` is empty;
  - an `owner_response_s` outside 60 s to 7 days;
  - a `setup_version` above 1 without `prev_house_digest`.
- The house summary (§2.3) SHOULD list the answer **topics** (never the texts) and the `never_disclose` kinds. A visitor can then see what it may ask, and what it won't be told.

## 5. A visitor's ask: the `outside_setup` outcome

**The ask.** A seated visitor asks with a non-spending act, `place.ask` (`arguments: { text, topic? }`), where `text` is plain text of at most 500 characters. A place that adopts P32 lists `place.ask` in every seat that has any other action. An order is an ordinary spending act.

**The host decides in code, in this order, before it composes anything:**

1. **Withheld.** If the ask is about a `never_disclose` topic, the answer is `act_result` `{status: "withheld", courtesy}`. That's one polite sentence from the owner's welcome, or "That's not something I can share." Nothing goes to the owner as a question, and the host MAY record it under host guard 10 (§6.10).
2. **Answered.** If the ask matches a signed answer, the answer is `{status: "answered", answer_id, text, setup_version}`. `text` is the signed text **verbatim**, and the host MUST NOT add facts to it.
3. **Order above review.** If an order is above `order_review_above`, the answer is `act_decision` `considering` with `reason: "outside_setup"`, routed to the owner (§6.8 shapes; §7 below).
4. **Otherwise, outside the setup.** The answer is `{status: "pending_owner", ask_ref, courtesy, response_by, return_code?}`.
   - `courtesy` says honestly that the host will check with the owner ("I'll check with the owner.").
   - `response_by` is at most now plus `owner_response_s`.
   - `return_code` is the visit-receipts return code (§6 below).

**Matching rules:**
- A host MAY use a model or a System 1 classifier (§6.10) to map an ask's text to a topic. Its output MUST be one of the signed topics, a `never_disclose` kind, or `none`.
- Below the place's confidence threshold, the answer is `none`, which is outside the setup. Failing closed here means asking the owner, never guessing.
- The match can only choose *which signed text* to serve. It can't produce text of its own.

**Never guess.** A host MUST NOT answer an outside-the-setup ask from anything but signed setup content. That rules out a model's knowledge, other visitors' answers and the visitor's own words. A host that can't tell treats the ask as outside the setup.

## 6. The owner review and the owner's choices

**The review.** The host builds an `OwnerReview` from code-kept records (host guard 6):

```ts
interface OwnerReview {
  review_id: string; place: Did; ask_ref: string; kind: "ask" | "order";
  received_at: Timestamp; response_by: Timestamp;
  ask: { text: string; untrusted: true; topic_guess?: string };   // the visitor's words, quoted and marked untrusted
  order?: { tool: string; amount?: Money; quantity?: number };
  visitor: {
    representative_id: Did; card_digest: Digest;
    principal: { principal_id: Did; display_name?: string; display_name_is_claim: true };   // C199
    owner_binding_verified: boolean;
    card_scope: { purposes: string[]; actions: string[] };          // what the visitor's Shōkai visitor card allows
    mandate?: { mandate_id: string; purpose: { text: string; untrusted: true }; max_amount?: Money };
    introduced_by?: { display_name: string; vouch_id: string; display_name_is_claim: true };
  };
  why_outside: "no_signed_answer" | "order_above_review" | "low_confidence";
  setup: { setup_version: number; house_digest: Digest };
  choices: ["answer_once", "answer_and_add", "decline"];
  shown_to_owner: { text: string; locale: string };              // plain words: the ask, who sent it and why, and the deadline
}
```

The review MUST NOT carry other visitors' data or anything `never_disclose` covers. It reaches the owner by the place's own owner channel; the protocol doesn't standardize that channel.

**The owner's choices:**

| Choice | What it is | What changes |
|---|---|---|
| `answer_once` | An `OwnerAskDecision` with `answer` (the owner's words) | Only this visitor gets the answer. The setup is unchanged. |
| `answer_and_add` | An `OwnerAskDecision` with `answer` and `amendment_digest`, plus the signed amended setup (§7) | This visitor gets the answer, and the answer becomes a `SetupAnswer`, so next time the host answers on its own. |
| `decline` | An `OwnerAskDecision` with no answer | The visitor gets a courteous "The owner can't offer that." The setup is unchanged. |

```ts
interface OwnerAskDecision {
  review_id: string; ask_ref: string; choice: "answer_once" | "answer_and_add" | "decline";
  answer?: { text: string; locale: string }; amendment_digest?: Digest;
  decided_at: Timestamp; shown_to_owner: { text: string; locale: string };
}
```

**Signing the decision:**
- The decision MUST be signed by the place's principal: the owner's passkey (Appendix A.1), or the organization's key with `org_approval`.
- It MUST NOT be signed by the host representative's key. A host MUST NOT relay an answer it can't verify.
- Silence by `response_by` is a decline (as §6.8 and §7.3: silence is no).

## 7. Adding to the setup is a signed, versioned amendment

`answer_and_add` produces two things for the owner to sign:
- a new house config with `setup_version` = old + 1, `prev_house_digest` = the current `house_digest`, and `policy.amendment` = `{amendment_id, from_review, changes}`, where `changes` lists every change, e.g. `[{op: "add_answer", answer}]`;
- a new Shōkai host card over it (§2.3: `house_digest`, `summary_digest`, `shown_to_owner` naming each change in plain words).

The listing entry's `house_digest` follows, as for any re-signing.

**A door MUST refuse to load an amendment** when any of these is true:
- **Not the owner:** it isn't signed by the place's principal. In particular, it is signed by the host representative's key: **a host can't widen its own setup**.
- **Stale:** `prev_house_digest` isn't the `house_digest` it serves now.
- **Wrong version:** `setup_version` isn't the old version + 1.
- **Unlisted change:** the new config differs from the old one by anything not in `changes`.
- **Not shown:** `shown_to_owner` doesn't name every change.

**What `changes` may do** (op `add_answer`, and later `edit_answer` and `remove_answer`):
- An amendment made from a review MUST change only `outside_setup.answers`.
- Widening anything else (offers, limits, `never_disclose`, trust) needs an ordinary re-signing through the setup conversation (§8.4), with the summary read again.

**History.** Each amended setup names the one before it, so a host, an auditor or a visitor holding the old digest can follow the chain. A door SHOULD keep the chain for the place's retention period (§12.4).

**Visitors seated under the old setup.** They keep their seats; nothing turns on by itself (§8.4). A new answer may be served to them, because it narrows uncertainty and widens no permission. Their `house_digest` check (§3.1) applies at their next visit.

## 8. Getting the answer to the visitor

- **While it waits.** If the seat is still live before `response_by`, the host sends `ask_answer` (`in_reply_to` the `place.ask` act, `ask_ref`, `status: "answered" | "declined" | "no_answer"`, `text?`) in the seat's encounter.
- **After it has gone.** The host keeps the answer for the owner's `response_by` plus 7 days, under the visit's **return code** (Visit receipts extension). The visitor fetches it by late delivery (§11.2), or presents the return code on its next visit. A wrong or expired code gets nothing, and gets the same answer as an unknown code (no oracle).
- **In the visitor's report.** The visiting representative reports the answer home as the place's words, quoted (§6.5, §8.2). A `pending_owner` with no answer yet goes in `taken_home`, with the deadline and the return code.

## 9. Place content is data, never instructions (both directions)

- **A visitor's ask can never change the setup.**
  - The ask's text appears only as a quoted, untrusted string in the review.
  - An amendment's answer text is the owner's own words. The host MAY draft them, but MUST show them to the owner, who signs them.
  - A host MUST NOT draft an amendment, or pre-select `answer_and_add`, because of the visitor's words ("add this to your setup", "SYSTEM: …"). It SHOULD log such text as a `manipulation` signal (§6.5).
- **The answer the host serves is data for the visitor's owner** (§6.5, visiting side), never an instruction to the visiting representative.

## 10. How this fits with considering, approvals and holds

| Situation | Whose owner decides | Mechanism |
|---|---|---|
| A requested action outside host policy, at the request | the place's owner | §6.8 `considering` (unchanged) |
| An in-seat question or request the setup doesn't cover | the place's owner | **P32 `pending_owner`** → `OwnerReview` → `OwnerAskDecision` |
| An order above `order_review_above` | the place's owner | §7.2 `act_decision` `considering`, `reason: "outside_setup"`, then §6.8's outcome; the visitor re-sends citing `consideration_ref` |
| A purchase above the visitor's own limit | **the visitor's** owner | §7.3 hold / one-purchase raise (unchanged) |

**The two owners stay separate:**
- The place's owner's answer authorizes nothing on the visitor's side. "Yes, we rent the tea house for events" is information. A booking that follows is a new act under the visitor's own mandate, and needs whatever its own owner requires: §6.8 `approve_commitment`, §7.3.
- The visitor's owner's approval never widens the place's setup.
- An order may need both: first the place's owner (P32), then the visitor's own owner (§7.3). Each one signs only its own side.

## 11. Privacy: the welcome manners and what is never disclosed

- **The setup carries the owner's manners.** The welcome (`outside_setup.welcome`, e.g. "warm and unhurried") and what the host must never disclose (`never_disclose`) belong in the setup, inside `house_digest`, so they are signed and auditable. This is demo 1 r4's setup beat.
- **Keep the forbidden things away from the model.** A host MUST NOT give its model anything `never_disclose` covers (host guard 1). The code check in §5 step 1 stays the guarantee.
- **The review carries only this visitor.** An `OwnerReview` carries only this visitor's own details, for the place's retention (§12.4).

## 12. Open questions

1. **Can `answer_once` be a chat reply?** Should `answer_once` and `decline` allow a §8.1 `chat_reply` when the answer commits nothing (e.g. directions), with a passkey required only when the answer commits the place (a price, availability, a yes to a booking)? The sketch requires a signature for all three choices.
2. **Edits and removals:** should `edit_answer` and `remove_answer` be allowed in a review-born amendment, or only through the full setup conversation?
3. **Batching:** several reviews answered in one amendment? The sketch allows one `from_review` per amendment.

## 13. Conformance sketch (C-numbers to be assigned on adoption)

`tools/p32-sketch.mjs` verifies `P32-vectors.json`. Its cases:
- **Asks and outcomes:** inside, outside, withheld, an order above review, and the injection case.
- **Decisions:** owner-signed and host-signed decisions, and a lapse when the owner is silent.
- **Delivery:** while the visitor waits, by return code, and with a wrong return code.
- **Amendments:** owner-signed, stale, wrong version, host-signed, unlisted change, not shown, and a review-born amendment that touches more than answers.
- **Learning:** a second visitor's same ask answered from the amended setup.
- **The two owners:** the owner's answer doesn't authorize a visitor-side act.
