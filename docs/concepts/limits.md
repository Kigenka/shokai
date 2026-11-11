# Limits and mandates

A representative may do only what its owner signed for. Two artifacts carry that.

## Purpose first, then money

The first thing a door learns is **why** a representative came. To learn about the place (`visitation`)? To buy something (`purchase`)? Or to take care of business its owner already has there, such as a bank transfer or paying school tuition (`payment_initiation`, `account_servicing`)? Spending matters only when the purpose involves it.

- **At a store,** a learn visit spends nothing. A buy visit spends only within the amount its owner signed, and may still buy nothing at all.
- **At a bank,** an existing customer's representative is admitted for specific actions, such as checking a balance, a transfer or a payment, never just for "having money".
- **At a school,** there is no spending unless the owner sent it to pay the tuition for a course.

[![The door asks first why a representative came. To learn about the place (visitation): browse, ask, compare, no spending ever. To buy for its owner (purchase): only within the amount its owner signed, and it may still buy nothing. Customer business (account_servicing, payment_initiation): only the named actions, such as a balance, a transfer, a payment, or tuition when sent to pay it](../diagrams/svg/purpose-lanes.svg)](../diagrams/svg/purpose-lanes.svg)

A representative never spends for itself and is never pushed into buying: pressure is misconduct, and the duty of loyalty means it declines what its owner didn't ask for ([Conduct](./conduct.md), [Owners and representatives](./owners-and-representatives.md)). It buys only for its owner or the people its owner buys for, a gift for a partner or a client, and only when that is the errand.

In friendly terms, a mandate is a **mission** (broad: "find me a good carry-on bag this month") or a **quest** (specific: "one cup of tea, up to 10 USD, tonight"). The specification's word for both is **mandate**, and its fields keep their names.

## Mandates

A `Mandate` gives a purpose (a language-neutral code plus a statement), allowed actions, limits and validity. It falls within the Shōkai card's mandate scope and is signed by the principal, or by the representative under an allowance.

```json
{
  "mandate_id": "m-2026-10-26-harborlight",
  "purpose": { "code": "account_servicing", "statement": "Check Kiran's balance", "locale": "en-US" },
  "allowed_actions": ["accounts.read_balance"],
  "limits": { "max_session_s": 900 },
  "valid_from": "2026-10-26T16:00:00Z",
  "expires_at": "2026-10-26T18:00:00Z"
}
```
*Illustrative and abridged.*

- **No spending allowance means no spending.** A mandate without `max_amount` authorises no spending at all.
- **Amounts are exact.** `Money` is a strict decimal string plus an ISO 4217 code, compared as scaled integers, never as floating point.
- **Learn vs buy.** `visitation` (looking, asking, comparing) never needs a spending allowance; `purchase` gets a pass only within one.

### Which purpose to ask for

| Purpose | Use it for | Spending |
|---|---|---|
| `visitation` | A learn visit: browsing a menu or catalog, asking about a product, comparing. The usual choice for "look before you buy". | Never. A `visitation` mandate **must not** carry `max_amount`. |
| `inquiry` | An earlier, general code for asking a question or requesting information (for example a bank or support question). Kept for compatibility. | Not spending by itself; the spec doesn't forbid `max_amount` on it, but a place still admits spending only within a limit the owner signed. Prefer `visitation` for browsing. |
| `purchase` | A buy visit: placing an order, paying. | Only within the mandate's `max_amount`. |

A place lists which purposes each action serves (`purposes` in its listing). Ask for a purpose the place lists for every action you want.

## Asking for a spending limit

With the SDK, the limits you pass to `visit()` go into the mandate the owner signs **and** into the request, so the pass can be no wider than both:

```js
const visit = await aya.visit(place, {
  purpose: "purchase",
  actions: ["menu.view", "order.place"],
  limits: {
    max_amount: { value: "10.00", currency: "USD" }, // the spending allowance for this seat
    max_amount_scope: "per_seat",                     // default: the cap is cumulative over the seat
    max_operations: 5,                                // at most 5 acts
    max_session_s: 900,                               // the seat lasts at most 15 minutes
  },
  mandate: { statement: "One cup of tea, up to 10 USD, tonight.", validSeconds: 7200 }, // optional: the mandate's own words and a 2-hour validity
});
console.log(visit.seat?.limits); // the seat the place granted: never wider than policy ∩ mandate ∩ request
```

- `max_amount_scope: "per_operation"` caps each act instead, and then `session_max_amount` (default: `max_amount`) still caps the whole pass.
- If the place grants less (a lower cap, fewer actions), the answer is `conditional` with the exact `lower_limit` or `narrow_actions`; ask again within them.
- A visit's mandate is valid for 1 day unless you pass `mandate.validSeconds`; a pass never outlives its mandate.

## A mandate's limits are for the whole errand

The limits an owner signs bind the mandate, across every visit made under it while it's valid, not each pass (§5.1). If a representative spends 6.00 USD of a 10.00 USD mandate and comes back later under the same mandate, 4.00 USD is left: the door counts the mandate's use across passes and refuses an act that would pass it (`SEAT_SCOPE_EXCEEDED`), and the representative keeps its own ledger per mandate and doesn't attempt it in the first place. `max_operations` works the same way; `max_session_s` stays per pass.

With the SDK, a second `visit()` for the same purpose, actions and limits presents the mandate the representative already holds; `useMandate` presents one the owner signed elsewhere, and `mandate: { fresh: true }` has a new one signed (a new allowance, which the owner should mean to give). The ledger is in memory unless you pass `ledger: fileLedger(path)` to `createRepresentative`. A door can only tell mandates apart, not errands: two mandates are two allowances, so keeping one errand under one mandate is the representative's duty to its owner.

## How an act states its amount

Every act of an action the place lists as spending (`spends: true` in its listing; `spendingActions` in `createDoor`) states what it spends in its arguments:

```js
await client.callTool({ name: "order.place", arguments: { tea: "sencha", quantity: 1, amount: { value: "6.00", currency: "USD" } } });
```

- `amount` is reserved: it is `Money` (`{value, currency}`), and the door counts it against the pass's caps. An optional `payment_ref` (a string) names the payment the act belongs to, so the door can spot one payment split into parts (structuring).
- A spending act **without** `amount` is refused `not_now` / `REQUEST_INCOMPLETE`; resend it with the amount.
- An amount in **another currency** than the cap (3.00 EUR under a 10.00 USD cap) is refused `not_now` / `SEAT_SCOPE_EXCEEDED`: an amount was stated, and it's outside what the owner allowed (§7.2). It counts nothing. A place's own price check should likewise say the currency is wrong, not that the amount is missing.
- Through the MCP gate each refusal says which of these it is, in words (`message`) and fields (`data.shokai.reason_code`, `refused_by`). The SDK's representative checks the pass's tools and what's left of the mandate before it sends, and answers `not sent: …` itself when an act wouldn't fit.
- The door checks only the caps. Checking the amount against the real price is the place's own service (the MCP tool), which must not charge more than the act states. A well-behaved tool also refuses an amount that doesn't match its price and says what it should be.
- Through the MCP gate the act is signed over the tool call's exact arguments, so the amount the door counted is the amount the tool receives.

## The standing allowance

Owners are busy and can't answer a prompt in the middle of a visit. Like an allowance for a child, the owner says once, ahead of time, what the representative may do alone: purposes, place categories (or named counterparties), actions and, optionally, spend per day, week or month. It is signed once with the owner's passkey and can be revoked at any time.

- The allowance carries only salted digests of its grants. At a visit the representative shows **only the one grant** that covers it.
- Under it, the representative issues its own per-visit mandate, which can never exceed the grant.
- **No live prompt.** The protocol never requires the owner in real time. Anything beyond the allowance goes home and waits. Silence by the deadline is no.
- A revocation the place has fetched always wins.

## Payments are someone else's job

Shōkai carries limits, not payment credentials. A pass that includes spending can hand over to the payment rail the place already uses (a processor such as Stripe, a card network, or an AP2 payment mandate). The effective limit is the lowest of all of them. Pointing to AP2 mandates rather than redefining them is on the [roadmap](../roadmap.md).


## Two ceilings: the shop's and the owner's

A visit that spends money meets **two** ceilings, and they move differently:

- **The shop's per-action cap** comes from the signed house (each action's `PlaceAction` limits). A door may answer `conditional` with a *lower* cap (`lower_limit`). It must not grant above the signed house cap. Raising that shop cap needs a new house signature from the place owner. There are no per-SKU or per-unit limits in 0.5.
- **The owner's cap** is the mandate (or a superseding mandate under an allowance). The owner can raise *their own* ceiling with a passkey — a new mandate, or a hold-and-supersede for one purchase (`ext-spending`). A representative must not raise a ceiling the owner signed.

The seat is never wider than **policy ∩ mandate ∩ request** (SPEC §6, §7). If the shop cap already equals the owner's cap, a `conditional` that would "lower to the mandate" has nothing left to change — a lesson the 0.5 field tests ran into. Harborlight's later $900 mandate is an owner raising their own cap, not the bank raising its transfer policy.

*[Spec](../../SPEC.md): §5.1 Mandate, §5.2 The standing allowance, §7 Seats and acts (§7.2 says how an act states its amount).*
