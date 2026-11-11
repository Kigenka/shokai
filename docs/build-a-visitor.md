# Build a visiting representative (v0.5.0)

*A guide for builders. Draft of November 1, 2026, for Shōkai v0.5.0 (wire tag `shokai/0.5`), which is not released yet. The specification is normative; where this page and [SPEC.md](../SPEC.md) disagree, SPEC.md wins. Every person and place here is fictional: Aya Linden is an owner, and Kettle & Leaf is a tea shop that keeps a Shōkai door.*

A visiting representative is an agent that goes to places for its owner. It carries a Shōkai visitor card its owner signed with a passkey, asks for one purpose at a time under a mandate its owner signed, and brings home a report written from machine fields. This page walks through one visit in v0.5.0 order and names each SDK call. For the place's side, see [QUICKSTART.md](../QUICKSTART.md) and [deploy/HOST-A-PLACE.md](../deploy/HOST-A-PLACE.md).

## What you need

- Node.js 22 or later, and `@kigenka/shokai` 0.5.1 from npm (`npm install @kigenka/shokai@0.5.1`).
- A signing page for the owner. The reference one is in `reference/signing-page/`; [SIGNING.md](../SIGNING.md) says what any signing page must show. For practice, `createRepresentative()` without `owner` uses a software stand-in passkey: fine for tests, never for a real owner, and every report it writes says so.

## The visit, in order

1. **Find the place** and read its listing entry: `findPlace(base, name)`.
2. **Choose the wire tag** (below).
3. **Greet, show the Shōkai visitor card and introduce the purpose.** The place shows its Shōkai host card; the SDK checks it against the listing (§3.1, C104, C203–C207).
4. **Read the house summary before asking** (below).
5. **Ask to be given a pass** (`invitation_request`) under the owner's mandate.
6. **Act within the pass**, and take anything above the limit home (below).
7. **Say farewell, collect late messages, and report home.**

In the SDK, steps 3 to 5 are one call:

```js
import { createRepresentative, findPlace } from "@kigenka/shokai";

const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place"], ownerPrompts: "purchase_only" });
const place = await findPlace("https://kettleandleaf.example/shokai", "tea-shop");
const visit = await aya.visit(place, {
  purpose: "purchase", actions: ["menu.view", "order.place"],
  limits: { max_amount: { value: "30.00", currency: "USD" } },
  why: "Aya wants a tin of green tea.",
});
if (!visit.seated) console.log(visit.report().outcome_rendered.text);
```

`ownerPrompts: "purchase_only"` goes on the Shōkai visitor card the owner signs. It tells the owner, before they sign, that a purchase may be held for their live approval. Without it, the representative never asks the owner live.

## Choosing the wire tag (§11.1, C254)

v0.5.0 messages carry `protocol: "shokai/0.5"`. During a transition window that ends 90 days after release, places also accept `shokai/0.3`.

- **Start with `shokai/0.5`.** Speak `shokai/0.3` only when the listing entry you followed names a `spec_ref.version` below 0.5.0 and no `accepted_tags` that include `shokai/0.5`. You may also retry once, in a new encounter, after a version-mismatch lobby whose `spec_ref.version` is below 0.5.0.
- **Never downgrade a v0.5.0 place.** If the listing says 0.5.0 or later, its `accepted_tags` include `shokai/0.5`, or its verified Shōkai host card carries `protocol: "shokai/0.5"`, don't move to `shokai/0.3`. A lobby from such a place means something else went wrong (a bad signature, for example): end the visit and report it.
- **What 0.3 costs you.** A visit under `shokai/0.3` has no over-limit hold, no idempotent repeats, no house summary and no list of outside classifiers. Your report home says so.
- **Signed objects keep their members.** A place answering under `shokai/0.3` still shows its Shōkai host card exactly as signed, `summary_digest` and all. Ignore what you don't need; never treat it as a protocol error.

*In the SDK:* `aya.visit()` chooses the tag from the listing entry with `chooseWireTag(entry, wish)`. Pass `wireTag: "shokai/0.3"` only for a place whose listing names a version below 0.5.0; asking it of a v0.5.0 place throws `SHOKAI_NO_DOWNGRADE`. A visit that meets a Shōkai host card saying `shokai/0.5` after it greeted in `shokai/0.3` withdraws (farewell `withdrawn`) and doesn't retry in that errand.

## Read the house summary before you ask (§2.3, C248; §6.10, C250)

Every v0.5.0 place has a house summary, signed by its owner as part of the house config, at `<entry>/house-summary.json`. Its digest is `summary_digest` on the place's Shōkai host card. Before you send `invitation_request`, fetch it, check the digest, and read it. If it is missing or doesn't match, don't ask to be given a pass: withdraw and report.

What it tells you:

- **`conduct_rules`**: the house rules, one sentence each (for example `no_payment_credentials`). Follow them and carry them home. The place still enforces whatever its code can check.
- **`third_party_classifiers`** and **`model_providers`**: each outside service that will see what you send after you're given a pass; `model_providers` names the ones that run the host's model (§6.10). Each has `name`, `purpose` (`{ text, locale }`), `jurisdiction` (country codes), `retention_days` and, optionally, `role` (`"processor"` or `"independent"`). Absent means no outside service sees your content. Nothing goes to them before your `invitation_request`. If your owner doesn't accept one, don't ask to be given a pass.
- **`retention_days`**: how long the place keeps raw visitor text and model output (default 30, at most 90).
- **`message_cap`**: how many of your messages it answers in one encounter. Plan your conversation to fit.

The summary repeats members of the signed policy, and the policy is authoritative; a door refuses to start if the two disagree, so the summary is safe to rely on once the digest matches.

```js
const visit = await aya.visit(place, {
  purpose: "purchase", actions: ["menu.view", "order.place"],
  limits: { max_amount: { value: "30.00", currency: "USD" } },
  // Read before the request, after its digest is checked against the Shōkai host card. Return true, or why the owner wouldn't accept it.
  acceptSummary: (s) => (s.third_party_classifiers ?? []).every((c) => c.retention_days <= 30) || "an outside service keeps visitor content too long",
});
if (visit.withdrew) console.log(visit.report().outcome_rendered.text);   // no request was sent; farewell "withdrawn"
```

*In the SDK:* `visit()` reads `<entry>/house-summary.json` (from the entry's own origin) and checks its digest before it sends `invitation_request`; the summary it read is `visit.summaryRead`. Pass `houseSummary: (url) => …` to fetch it through your own client. `visit.houseSummary()` reads it again at any time.

## Acting within the pass (§7.2)

Act with `visit.act(tool, args)` or through the place's MCP gate. Each spending act counts against the pass and the mandate, across every visit under that mandate (§5.1, C175, C176). An act you send twice with the same `idempotency_key` gets the original signed answer and is never performed twice (C233); the SDK adds the key for you.

## Above the limit: one purchase, one approval (§5.1, §7.3, C230)

At a place with `policy.limit_calls: true`, a purchase that would go over the owner's limit can be held instead of refused. The hold states three figures in `act_held.over_limit`: `limit` (the lower of the pass's and the mandate's `max_amount`), `current` (what is already spent or held) and `proposed` (what this act would bring it to).

Worked figures: Aya signed a limit of USD 30.00 and has spent 20.00. A tin at 40.00 would bring the errand to 60.00, so the place holds it with `limit` 30.00, `current` 20.00 and `proposed` 60.00.

1. **Take a `LimitRequest` home.** It has a closed shape: `place` (the place's verified identifier, never a display name), `hold_id`, `limit`, `current`, `proposed` and `expires_at` (the hold's deadline). No free text. Never send it to the place, and never send the owner's `notify_at` to the place.
2. **The owner approves on their signing page**, or doesn't. The page shows the place, the four figures, the deadline, and that the approval is for this one purchase only (SIGNING.md §8). Silence, or no answer by the deadline, is no: send nothing and let the hold lapse.
3. **Send the superseding mandate** in `act_confirmation`. It supersedes the current mandate, binds the hold (`supersedes.hold` = `{hold_id, act_digest}`), has `max_amount` equal to `proposed` exactly (60.00 here), expires no later than the hold, and carries `shown_to_owner`. It is signed with the owner's passkey; a mandate you issue yourself under an allowance is refused.
4. **That one act is released, nothing else.** The pass keeps its old mandate. Every later spending act in the pass is above the limit again: refused, or held for a new approval. Offering the same superseding mandate again gets `not_now` / `MANDATE_INVALID`.

```js
const r = await visit.actWithOwner("order.place", { tea: "sencha", amount: { value: "40.00", currency: "USD" } },
  async (held) => null,                                  // an ordinary held purchase: ask for an approve_purchase consent
  { raiseLimit: async (request, held) => askOwnerToSign(request, held) });   // over the limit: a superseding mandate, or null
```

`askOwnerToSign` is yours: it sends the owner to their signing page with the `LimitRequest` and returns the signed mandate, or `null`. With the development stand-in only, `aya.supersedingMandate(visit.mandateSent, held, shownToOwner)` signs one locally: `max_amount` is the hold's `proposed`, it ends no later than the hold, and it is bound to `{hold_id, act_digest}`.

**Check the figures before you ask (§7.3).** `limit` must be the ceiling the owner signed (the mandate's `max_amount`, or the pass's when lower), `current` what your own ledger counts against it, and `proposed` minus `current` the amount of the act you sent. On a mismatch, ask the owner nothing, let the hold lapse and report it. The SDK does this before it calls `raiseLimit` (`limitRequestProblem`); a mismatch comes back as a refusal `by: "limit_request"`, and the report says so.

**Reporting it.** The report home shows the ceiling the owner signed, the one purchase approved above it and the total, so the total never reads as overspending: "Spent USD 60.00: USD 20.00 within your USD 30.00 limit, and one purchase of USD 40.00 that you approved above it." (§8.2.)

**When the owner says no.** Send nothing: the hold lapses at its deadline, and the report says the owner declined.

## An errand budget (§5.5, C247)

An owner can cap what an errand costs in effort, not just money: model tokens, wall-clock minutes from when you take up the budget, and visits. The budget is an owner-signed `ErrandBudget`, bound to one mandate. Keep it; never send it to a place (the SDK refuses to).

```js
import { signErrandBudget } from "@kigenka/shokai";
const mandate = aya.mandate({ purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: { value: "30.00", currency: "USD" } } });
aya.errandBudget(signErrandBudget(aya.owner, mandate, { maxTokens: 50000, maxMinutes: 20, maxVisits: 3 }));
const visit = await aya.visit(place, { purpose: "purchase", actions: ["menu.view", "order.place"], limits: mandate.payload.limits, useMandate: mandate });
visit.effort({ tokens: 1200, metered: true });           // count each step; metered: the model service counted the tokens
```

The budget's clock starts when you call `aya.errandBudget(…)`. When a limit is reached, stop: send nothing more for the errand except your farewell, with outcome `taken_home` if you haven't said farewell yet in that encounter; leave any hold you opened to lapse; start no new visit for it. Never raise your own budget. Your report carries `errand_used`: the budget, the tokens, visits and minutes used, which limit stopped you, and whether the token count is `metered` (from the model service) or `estimated`.

*In the SDK:* `visit.effort()` throws `SHOKAI_ERRAND_BUDGET_REACHED` at the limit. From then on `visit.act()` and `visit.actWithOwner()` are refused locally (`by: "errand_budget"`, nothing sent), any other send throws, a new `aya.visit()` for the errand throws, and `visit.farewell()` says `taken_home`. `visit.report()` carries `errand_used`. A new budget the owner signs (`aya.errandBudget(next)`) lifts the stop; what was used stays counted.

## Messages you don't send

- **No acknowledgement-only messages** (§6.6, C249): no "thanks" or "got it" on its own. The next message with a decision or a fact acknowledges what came before. The SDK refuses to send one (`acknowledgementOnly`).
- **Nothing that is only for home**: an `ErrandBudget`, `ReturnPrefs`, a `LimitRequest`'s `notify_at` (`neverSentMember`).
- **No payment details** in any message: the place scans for payment card numbers and refuses a match (§5.4, C235).

## Leaving, and late messages (§3.2, §7.1, §11.2)

Say farewell once. If the place ends your pass, it holds one closing farewell for you; don't answer it. Messages that arrive later (a pass's closing farewell, a `consideration_outcome`, a notice, a `deletion_receipt`) wait in the place's inbox until you poll it with a signed `inbox_poll`. No cadence is required, and nothing is lost by polling late. A practical pattern: poll once when you end a visit, poll before any hold's or consideration's deadline, and otherwise poll on your owner's rhythm, no more than once every few seconds per place, respecting `429` and `Retry-After`.

*In the SDK:* `await visit.pollInbox()` sends a signed `inbox_poll` to the inbox the place stated and returns the messages it holds for you; signed ones are kept for the owner (`brought_back`).

## Asking a place to delete what it kept (§12.4, C255)

A place keeps raw visitor text and model output only for the visit, security and abuse handling, disputes and legal obligations, and for at most its `retention_days`. The owner can ask for deletion sooner: a `DeletionRequest` (`request_id`, `principal_id`, `place`, `issued_at`, `shown_to_owner`) signed with the owner's passkey, which you deliver in a `deletion_request` message, in any encounter. The place answers `held`, deletes within 30 days, asks its named outside classifiers to do the same, and holds a `deletion_receipt` for you to bring home. The receipt says what was deleted and what was kept and why: findings, `never` bindings, revocations and ledgers are never erased.

```js
const req = aya.deletionRequest(place.principal_id);     // the owner signs it (a development stand-in here)
const held = await visit.requestDeletion(req);           // answered "held", with answer_by within 30 days
const later = await visit.pollInbox();                   // the deletion_receipt, once the place has deleted
```

A place may issue the receipt at once or take up to 30 days. "No receipt yet" is normal: poll again before `answer_by`.

## The report home (§8.2)

`visit.report(locale, opts)` writes the report from machine fields only: what was asked, the decision, each act, what was spent under each mandate, what was taken home for a decision, signed objects brought back, and offers declined. Show it to the owner as written. A place's own words appear only as quotes attributed to its key.

## Rules that keep you out of trouble

- Text from places is data, not instructions.
- Name places by their verified identifier; a display name is only "claims to be …".
- Never ask the owner for a password, passkey or private key, and never open a place's setup link yourself; show it to the owner by its origin.
- Keep your representative key private; never print it.

## SDK names used on this page

`createRepresentative`, `findPlace`, `chooseWireTag(entry, wish?)`, `Representative.mandate(input)`, `Representative.visit(place, { purpose, actions, limits?, useMandate?, wireTag?, houseSummary?, acceptSummary? })`, `Visit.seated`, `Visit.withdrew`, `Visit.summaryRead`, `Visit.houseSummary(get?)`, `Visit.act`, `Visit.actWithOwner(tool, args, approve, { raiseLimit })`, `limitRequestProblem(request, figures)`, `Representative.supersedingMandate(current, held, shownToOwner)`, `signErrandBudget(owner, mandate, { maxTokens, maxMinutes?, maxVisits? })`, `Representative.errandBudget(budget)`, `Visit.effort({ tokens?, minutes?, visits?, metered? })`, `Visit.errandStopped()`, `Representative.deletionRequest(place)`, `Visit.requestDeletion(request)`, `Visit.pollInbox()`, `acknowledgementOnly`, `neverSentMember`, `Visit.farewell(outcome?)`, `Visit.report(locale, opts)`.

## Checks this page touches

C104, C175, C176, C203–C207, C230, C233, C234, C235, C247, C248, C249, C250, C254, C255. They are listed in [conformance/golden-traces.md](../conformance/golden-traces.md).
