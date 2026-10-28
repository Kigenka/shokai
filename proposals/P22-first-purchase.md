<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P22 (draft): the first purchase. A self-introduced representative may browse and buy, like a first-time shopper in a mall

*Status: draft proposal for v0.4, 2026-10-27. Not in SPEC.md; rc4 is feature-frozen and this changes nothing in it. Written against v0.3.0-rc4; section numbers are rc4's. Examples are fictional: Brightwick Outfitters (`did:web:brightwick.example`), an owner buying a scarf for his mother. Real technologies keep their names (D19). Builds on §2.3 cards, §2.5 claims, §3.1 listings and `data_asks`, §4 self-introduction, §5.1 mandates, §5.2 allowances, §6.1 conditions, §6.7, §7.2 acts and `payment_ref`, §8.1, §8.2, §9.1, §9.3 misconduct, §11.2 inbox, and on P21 §5 (pinned acts), P14 and P20. Takes account of the gaps in `scenarios/places-first.md` (c) and (f).*

## In plain words (five lines)
1. **A first-time visitor may buy, as anyone may walk into a shop and buy.** Nobody has to introduce it, and the store doesn't need to know it beforehand.
2. **It still says who it's buying for, in a small, honest way:** that a real person signed for it with a passkey, what it came for, whether it's a gift, and the language and region, and nothing the owner didn't agree to share.
3. **Permission to spend and the way to pay are two different things.** The owner's signed errand says how much, where and until when; the card or wallet goes through the store's normal checkout, with its normal fraud checks. Shōkai never touches card numbers.
4. **The store can set first-visit rules up front:** a spending cap for newcomers, or a fresh owner signature on the exact basket, or an introduction for big amounts, all visible in its listing before the agent arrives.
5. **If a payment is refused as fraud**, the store tells the owner privately, with a signed notice, and remembers it at that store only. A simply declined card is never treated as misconduct, and nothing is ever made public.

---

## 1. What rc4 already gives (no change needed)
- A self-introduced visit (`vouch: null`) is valid and MUST be accepted (§4). A `purchase` visit is seated only within the owner's spending limit (§5.1 "Learn vs buy", D11), counted across visits (§5.1 C175).
- `max_amount` binds the seat; the store charges at most the act's stated `amount` (§7.2 C187).
- "Accept any introducer" carries no weight for money (§4), but nothing requires an introduction to buy: a place's policy decides.
- What the store will ask for (shipping address, payment method) is declared up front (`data_asks`, §3.1, D19).

**Gaps** (scenario note (c)): no structured context about the buyer; no way to show first-purchase requirements in the listing (`requires_introduction` covers account creation only); no link between the owner's authority and the payment rail; no clean finding for a fraudulent payment; no "this is a gift" marker.

## 2. (a) What a spending visitor discloses: the buyer context
### 2.1 The object
```ts
/** P22: a small, owner-approved statement about who is buying, carried in the mandate so the owner's signature covers it. */
type BuyerContext = {
  for_whom: "self" | "gift";          // a gift for someone else; the recipient's details are never here (§2.3 below)
  locale: Locale;                      // the owner's language (BCP 47), for receipts and service
  region?: string;                     // ISO 3166-1 alpha-2, or alpha-2 + "-" + subdivision: where the owner is, coarse
  ship_region?: string;                // where the goods go, same form (may differ for a gift)
  first_visit?: boolean;               // the representative's honest statement that it has no record here
};
// Mandate gains:  buyer_context?: BuyerContext
// Listing action gains (spending actions only): accepts `buyer_context` fields it uses, declared like data_asks (§3.1).
```
### 2.2 Rules
- **What every spending visitor shows (the minimum).** For a request that names a spending action (§3.1 `spends: true`) or a positive `max_amount`, the card and mandate already prove: the principal is a person (`principal.kind`), bound by a passkey with user verification (§2.1, Appendix A.1); the purpose code (§5.1); the limit and the place (`counterparties`). P22 adds `buyer_context.for_whom` and `locale` as the minimum. Everything else is optional. [P22-1]
- **Signed by the owner when it matters.** When the mandate is signed by the owner's passkey, `buyer_context` is the owner's own statement. Under an allowance (§5.2) the representative fills it in and signs it in its own mandate; it is then the principal's statement through its representative (§9.3: a representative's conduct is its owner's). Either way, a false `buyer_context` the place proves false (for example `ship_region` contradicting the address the owner gave) is `purpose_misrepresentation` (§9.3), judged as any other.
- **Disclosure stays the owner's choice.** The representative MUST fill only fields the owner's disclosure policy allows (§2.8 per-place identity, Gatherings `DisclosurePolicy`) and MUST NOT add fields the place's listing didn't declare for that action (§3.1 D19, the same rule as `data_asks`). [P22-2]
- **Not a gate input as prose.** The purpose statement stays prose and never enters the decision (§6.5). The structured fields above MAY enter the gate (§6.4), so a place may, for example, require `ship_region` for a first purchase.
- **Evidence-backed claims, optional.** A place MAY require a claim with a minimum proof level for a first purchase (`MinProof`, §2.5), for example `claim.age_over_18` at `verified` through a W3C VC (VC mapping extension). A `self_declared` claim never meets it (§2.5).
- **Honest wording about "a real person".** A passkey with user verification proves that whoever holds the owner's key passed a local check on their own device, not who that person is (§2.1, §13 item 17). P22's text and the docs say "an owner who signed with a passkey on their own device", never "a verified human". [P22-3]

### 2.3 The gift marker (scenario note gap (c))
- `for_whom: "gift"` says only that. The recipient's name and address are not in the mandate; if the store needs them it asks through a declared `data_ask` (`address`), shared only with the owner's consent (§8.1 `approve_share`, or within what the allowance covers). [P22-4]
- A place MAY use the marker to offer gift services (wrapping, a gift receipt, no prices on the packing slip), and to weigh a billing region that differs from `ship_region` as expected rather than suspicious.

## 3. (d) and (a) First-purchase requirements, shown in the listing
```ts
/** P22: on a spending listing action (§3.1). Everything a newcomer will meet, published before it arrives. */
type FirstPurchase = {
  cap?: Money;                               // the most a newcomer's seat may carry here (first-visit cap)
  owner_signed?: boolean;                    // a mandate signed by the owner's passkey, not one issued under an allowance
  pinned?: "never" | "above_cap" | "always"; // the exact basket pinned in an owner-signed mandate (P21 §5)
  introduction_above?: Money;                // above this, an introduction (a vouch from an introducer the place names, §4)
  context?: ("ship_region" | "region")[];    // buyer_context fields required for a first purchase
  newcomer_until?: { purchases: number; days: number };  // when a principal stops being a newcomer here
};
// PlaceAction gains: first_purchase?: FirstPurchase
```
- **Who is a newcomer.** A principal (compared as DIDs, §2.1; one record across its representatives, §9.3) with fewer than `newcomer_until.purchases` completed purchases at this place, or whose first completed purchase here is under `newcomer_until.days` old. A relationship record (§9.1) is how the place knows. An owner link (§2.8) carries history in, as for everything else. [P22-5]
- **Up front, never as a surprise.** A place with first-purchase requirements MUST publish them in `first_purchase` on the action, and MUST NOT apply stricter first-purchase requirements than it publishes. This closes the gap that `requires_introduction` covers account creation only (scenario note gap (1)). [P22-6]
- **How the door answers**, with existing conditions (§6.1), so no new decision machinery:
  - a request above `cap` → `conditional` with `lower_limit` = `cap` (§6.7 rule 2 style), or `require_vouch {purposes: ["purchase"]}` when the amount is above `introduction_above`;
  - `owner_signed` unmet (a mandate issued under an allowance) → `conditional` with `require_mandate {actions}` and retry `with_credential [signed_mandate]`, meaning "a mandate your owner signs";
  - `pinned` unmet → the same, and the visitor takes the basket home for the owner (§5.2, farewell `taken_home`);
  - a missing required context field → `deny` / `not_now` / `REQUEST_INCOMPLETE`, retry `with_credential [signed_mandate]` (§5.3 C185).
  Each is a setup answer: never `never`, never a notice (Conventions). [P22-7]
- **Caps are the place's policy.** The seat is already bounded by policy (§6.1); `cap` makes the newcomer part of that policy visible. A place SHOULD also keep a total budget for newcomer spending per day (a place setting, not on the wire), because fresh owner identities cost nothing to mint (§12.2 "Fresh keys"). Reference default, informative: USD 150 per newcomer seat, `newcomer_until {purchases: 1, days: 14}`.
- **Learn stays free.** None of this applies to `visitation` (browsing, questions): a newcomer always gets a browse seat under the place's ordinary policy (§5.1, D20).

## 4. (b) Authority to spend is not the payment instrument
### 4.1 The separation
| | Authority (Shōkai) | Instrument (the place's rails) |
|---|---|---|
| What it is | The owner-signed mandate: purpose, `max_amount`, `counterparties`, expiry, optional pinned basket | A card, a wallet, a bank payment, an agentic network token, an AP2 payment mandate, a store gift card |
| Who checks it | The door (§5.1, §6.1, §7.2) | The payment processor, the card network and issuer (3-D Secure, SCA), the wallet, the store's own fraud tools |
| What it proves | The owner allowed this much, here, now | The payer can pay and (with issuer authentication) authorized this payment |

- Shōkai MUST NOT carry a card number, security code, card token, wallet credential or gift-card code in any message, act or report. A spending act carries `amount` and `payment_ref` only (§7.2). [P22-8]
- The protocol never moves money, never says a card is good, and never replaces the place's fraud checks: blocklists (stolen cards, drained or stolen gift cards), velocity rules, address checks and issuer authentication all stay with the place and its processor. [P22-9]

### 4.2 Binding the payment to the same owner (without card data)
Three tools, from lightest to strongest. A place picks per its `first_purchase` policy.
1. **Carry the mandate into the rail's reference.** The place SHOULD put `shokai_ref` = digest(JCS(`{place, mandate_digest, act_msg_id}`)) into the rail's own free-text or metadata field (an order reference, a processor metadata field, the merchant data of a 3-D Secure request, the reference of an AP2 payment mandate or a network agentic token). It joins the payment to the owner's signed authority in the place's records and in any dispute, with no card data in Shōkai and no Shōkai data beyond a digest in the rail. [P22-10]
2. **Owner-present payment.** The checkout tool returns a payment hand-off (a hosted payment page, a wallet sheet, a 3-D Secure challenge) that the owner completes on their own device, later and asynchronously (§5.2 C83: never a live prompt mid-encounter). The issuer's authentication then proves the cardholder approved the amount and merchant (dynamic linking at the rail). The representative carries the hand-off home as `taken_home`; it MUST show the owner the place's verified name and the amount from the machine fields. [P22-11]
3. **Step-up to the owner's passkey on the exact basket.** For a first purchase with `pinned`, the place returns a signed `OrderQuote` (`Signed<{quote_id, place, items: [{sku, name, quantity, unit_price}], total, currency, ship_region?, valid_until}>`); the owner signs a mandate that pins the act `{tool: "checkout.pay", arguments: {quote_id, quote_digest, amount, payment_ref}}` (P21 §5). The signing page shows the place-signed items and total. This is AP2's cart-mandate idea, with the place's signature on the cart and the owner's on the pin. [P22-12]
- **Name consistency is a weak signal.** A place MAY compare the payer's name the rail returns with the card's `display_name`; a mismatch is a fraud signal for the place's own tools, never proof (a gift paid by someone else, a shared family card), and never a gate input or a finding by itself. [P22-13]
- **The honest boundary.** A real owner, with a real passkey, can still pay with a stolen card. Shōkai can't see the card; issuer authentication and the place's fraud checks can. What Shōkai adds is accountability: the purchase is tied to an owner DID that signed it, the place holds the signed mandate and acts as dispute evidence, and conduct sticks to that owner at that place (§9.3).

## 5. (c) When a payment fails fraud checks
### 5.1 A declined payment is not misconduct
- A payment the rail declines for an ordinary reason (insufficient funds, an issuer decline without a fraud reason, an abandoned authentication, a processor outage) is the act's result (`act_result` `ok: false`, or a tool result with `isError`, §7.2 C187). The place releases what the act counted (C194). Nothing is recorded against anyone; this is a setup failure in spirit (Conventions). [P22-14]

### 5.2 A new finding: `payment_misuse`
| Code | Covers | Default severity |
|---|---|---|
| `payment_misuse` | a payment through the representative using an instrument the place's rail or its own records report as lost, stolen or fraudulent (an issuer's lost or stolen decline, a confirmed-fraud chargeback, a gift card on the place's own blocklist), or a payment the owner's issuer later confirms as unauthorized by the cardholder | serious; severe when the fraud is confirmed (a confirmed-fraud chargeback) or on a second finding within 180 days |

- Why a new code rather than `purpose_misrepresentation` or `manipulation`: a fraudulent instrument isn't a misstated purpose or text aimed at an agent; the evidence comes from the rail, often weeks later, and a clear code keeps it from being confused with a decline. It slots into §9.3 unchanged: a signed `MisconductNotice` to the visitor's principal and every introducer in the vouch chain; effects local to this place (§9.3, D3); serious → the principal's standing here `reduced` for 90 days, severe → bound `never` here (§9.3 "A representative's conduct is its owner's conduct"); introducer grades by D1. [P22-15]
- **Evidence, not suspicion.** The finding MUST rest on a rail or record result of the kinds above, referenced by `evidence_digest` (§9.3). A risk score, a name mismatch (P22-13), a region mismatch or a velocity rule alone MUST NOT produce it. [P22-16]
- **Late findings.** A chargeback can arrive weeks after the visit. The place MAY issue the notice then, held for the representative's inbox (§11.2) and for the owner's DID; it names the `encounter_id` and `payment_ref`.
- **Kind wording, never shaming.** The notice's text to the owner MUST be factual and MUST allow that the owner may be the victim: "A payment made through your representative at Brightwick on 27 October was reported as made with a lost or stolen card. If this wasn't you, revoke your representative's card." It MUST NOT be published, shared with other places through Shōkai, or shown to anyone but the principal and the introducers (§9.3, §12.3). What a place shares with its own processor or fraud network for fraud prevention is outside Shōkai and governed by its own law and privacy terms; Shōkai defines no channel for it. [P22-17]
- **A way back.** A place SHOULD lift or downgrade a `payment_misuse` effect when the owner shows the representative's card was revoked for compromise before or soon after the payment (§2.6), and MAY accept a signed `IntroducerReview` (§9.3) for an introduced visitor. The owner's own visit report (§8.2) carries the notice so they can act on it.

## 6. Referral provenance: "how I heard of you" (note only, not a proposal)
- **rc4 has no such field.** Checked: no member in `protocol-shapes.ts` or the text carries an unsigned mention; `Proposal.evidence` refers to signed artifacts; §10's `context.via_vouch` names a *vouch*. The scenario note (f) found the same.
- **Candidate for later (small):** `InvitationRequest.heard_of_via?: {kind: "owner_named" | "mention" | "own_search" | "listing" | "advertising"}`, optional, unsigned by anyone but the visitor, **evidence only**: it MUST NOT be a gate input (§6.4), MUST NOT raise a proof level (§2.5), and is never an introduction (§4: "being connected is never an introduction").
- **Consistency with §10.** At an inbound door, text that claims an introduction no signed vouch shows is impersonation (`manipulation`, severe). A mention must therefore never read as "sent by": the field holds a kind, not a name, and naming the person who mentioned the place (their DID or display name) is left out by default. The friend never agreed to be named to the store, and a named mention is one word away from a claimed introduction. A deliberate, signed vouch (§4) remains the only way to say "sent by".

## 7. Attacks and who covers them
| Attack | What P22 does | Left to the place or rail |
|---|---|---|
| **Stolen agent** | Spends at most the mandate, only at the named place (§5.1 C188), only up to the newcomer `cap`; the instrument isn't in the agent (P22-8), so an owner-present payment needs the cardholder's own authentication (P22-11). | An agentic token the owner provisioned has its own rail limits. |
| **Prompt-injected agent** | Same bounds; a `pinned` basket means only what the owner saw can be bought (P22-12); upsells are declined or taken home (§1, §5.2). | Buying the wrong thing within an unpinned limit; the store's returns policy. |
| **Replay** | Acts single use (§11.3); mandate ledger (§5.1 C175); pinned act single use (P21 §5); quote `valid_until`. | Rail idempotency on `payment_ref`. |
| **Swapped amount or item** | Act `amount` counted, store charges at most that (§7.2 C187); pinned `quote_digest` covers items and total; issuer authentication shows amount and merchant. | — |
| **Stolen card used by a real owner** | Owner bound to the purchase by signature; `shokai_ref` in the rail for disputes (P22-10); `payment_misuse` finding sticks to that owner at that place (P22-15); newcomer caps. | Issuer authentication (3-D Secure, SCA), the store's fraud checks; Shōkai can't see the card. |
| **Stolen or drained gift card** | Same finding when the place's own blocklist hits (P22-15). | The blocklist itself is the place's. |
| **Owner key compromise** | Attacker can sign mandates, but each place caps newcomers (P22-5), the instrument still needs the cardholder's authentication, the owner revokes the card (§2.6). | The rail. |
| **Fresh identities (sybil buyers)** | Each starts as a newcomer under `cap`; `introduction_above` for larger amounts; a place's daily newcomer budget (informative). | The place's velocity and device signals. |
| **Lookalike store taking the payment** | Visitor checks the place against its listing (§3.1 C104); mandate `counterparties` names the exact DID; the hand-off shows the verified name (P22-11). | Phishing payment pages outside the door. |
| **A place framing an owner** | Notices are signed by the place (accountable), local, never published (P22-17); finding needs rail evidence (P22-16). | Disputes between owner and place. |

## 8. Conformance test ideas (not code)
- Self-introduced `purchase` within `cap` and all `first_purchase` items met → `grant`, seat ≤ `cap`. Above `cap` → `conditional` `lower_limit`; above `introduction_above` → `require_vouch`.
- `owner_signed` with an allowance-issued mandate → `conditional` `require_mandate`; the same request with an owner-signed mandate → `grant`.
- A place that applies a first-purchase rule its listing didn't publish → non-conformant (P22-6).
- Missing required `buyer_context` field → `REQUEST_INCOMPLETE`; an undeclared context field sent anyway → the reference representative never sends it (P22-2).
- Pinned basket: act with the signed quote's digest and amount → once; changed total or quote → refused.
- No card number, token or gift-card code appears in any wire message or report (pattern scan).
- Declined payment (simulated insufficient funds) → act result `ok: false`, counts released, no notice. Simulated "stolen card" decline → `payment_misuse` notice to the principal, findings present, effect local; a second place sees nothing.
- A finding from a name mismatch alone → never produced.
- A late notice (after the seat closed) is held for the inbox and collectable by a signed poll (§11.2).
- `buyer_context.for_whom: "gift"` with a different `ship_region` → no penalty from the reference store.

## 9. Open questions for the editor (values)
1. **The newcomer cap.** Reference default USD 150 per newcomer seat, a newcomer until one completed purchase and 14 days. Right shape and size?
2. **Is the gift marker part of the minimum** (recommended: `for_whom` always present on a purchase), or optional?
3. **`payment_misuse`**: serious by default and severe when confirmed (recommended). Should a first, unconfirmed finding be `minor` instead, to protect owners whose agent was hijacked?
4. **Should introducers hear about payment findings?** §9.3 says every introducer in the chain gets a notice. Keep (recommended), since that's what an introduction means?
5. **"How I heard of you"**: keep it as a kind only, never a name (recommended), or let the owner choose to name the friend when the friend agrees?

## 10. Honest residual risks
- **A real owner with a stolen card** can get through when the issuer's authentication is frictionless. Shōkai makes it traceable, not impossible.
- **Fresh identities are free.** Caps and introductions bound a newcomer's reach at each store, but a determined fraudster can be a newcomer at many stores.
- **Within an unpinned limit**, a steered agent can buy the wrong thing; pinning costs the owner a second signature.
- **The binding to the rail is a digest in a free-text field.** It helps disputes and records; it doesn't make the rail enforce the mandate. Agent-payment schemes that verify a referenced mandate (AP2 and network agentic tokens) would close more of that gap; P22 only points at them.
- **Notices can be wrong.** A place can misread a rail result. Locality, signing and the way back (§5.2) limit the harm; they don't remove it.
