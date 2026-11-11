# Cards as a blueprint

A Shōkai **card** is two things at once: a helpful metaphor (the *meishi*, a signed business card you can hold) and a **signed, typed document** a door can verify. Developers who want to invent their own card types should treat 0.5's family as the pattern to follow, and treat the door's fail-closed rules as already binding.

This page is teaching, not a homepage item. The specified cards themselves are on [Shōkai cards](./cards.md).

## What a Shōkai card must never carry

A Shōkai card works like a meishi, a business card, not a wallet or an identity document. It MUST NOT carry a payment card number, payment token, account number, password, one-time code, session cookie or token, or anyone's private key — including the passkey that signed it ([SPEC §5.1](../SPEC-DETAIL.md#51-mandate) C211, [§5.4](../SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6) C210, [§12.1](../SPEC-DETAIL.md#121-normative-security-requirements)). A mandate authorizes an amount; it carries nothing to pay with. The door refuses a message that carries a payment card number or other forbidden credential, and it does not store or echo the number ([§5.4](../SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6) C235).

A display name is a claim, never identity (C199). What a place can already require, what is still a draft, and identity checks that stay outside the protocol are on [Real identities at the door](../real-identities.md).

## What 0.5 already specifies

### Three card classes

| Class | Where | `kind` | What it is |
|---|---|---|---|
| **Visitor card** | SPEC §2.3 `RepresentativeCard` | `"visitor"` (a v0.3 card with no `kind` is read as visitor when a visitor presents it) | Who sent this representative, signed by that owner |
| **Host card** | SPEC §2.3 | `"host"` plus `place`, `host_scope`, `house_digest`, `shown_to_owner` | The place's own card. No host card → the door admits no one (it still accepts revocations) |
| **Introduction card** | SPEC §4.1, class `ext-introduction-card` | `"introduction"` (`ShokaiIntroduction`) | A vouch made one-to-many for **one named place**, claimed via `IntroductionClaim` |

Presenting a host card or an introduction card *as* a visitor card is a **wrong-kind refusal** (`not_now` / `CREDENTIAL_REQUIRED`, readiness `card_kind`). It MUST NOT be answered `never` or recorded as misconduct.

`invitation_request` and `invitation_response` are **messages**, not cards.

### Nearby signed objects that are not cards

| Artefact | Spec | Note |
|---|---|---|
| Mandate | §5.1 | Owner-signed (or under an allowance). May supersede for one held purchase |
| Standing allowance and `AllowanceRevocation` | §5.2 | Not a card |
| Card revocation | §2.6 | Signed `CardRevocation`, delivered as `card_revocation` or listed at `revocation_url` |
| Vouch (one-to-one) | §4 | Still the usual “someone known here” path. A claimed introduction card *counts as* a vouch |

Owner consents, deletion requests, owner-ask decisions, context responses, customer links and visit stamps are related signed objects, not card classes.

### How a door treats the unexpected

These rules already make a door fail safe. They are not a registry of new types.

- **Unknown members.** Ignore unknown members unless they appear in `crit`. A receiver that does not implement a non-`crit` member reads it as unknown and ignores it.
- **Must-understand (`crit`).** If `crit` names a member the receiver does not implement (or is malformed) → `deny` / `not_now` / `UNSUPPORTED_CRITICAL`. That is a setup failure: it MUST NOT count toward probing and MUST NOT be acted on in part (C289).
- **Unknown message `type` or artefact `kind`.** MUST NOT act on it; treat it as a malformed body (§11.1); grant nothing. An unknown `decision` is read as `deny` / `not_now`; an unknown `disposition` is read as `not_now` (never as `never`).
- **Schema.** TypeScript `protocol-shapes.ts` is the source of types; `schema/v0.5.1/schema.json` is generated from it (the released `schema/v0.5.0/schema.json` stays as it was). Closed lobby templates (`closed: true`) list every accepted top-level member of a visitor card and mandate; extra top-level members are refused (`x-` members are always allowed).

There is no public registry that lets a developer mint `kind: "loyalty"` and expect doors to accept it. A new kind that old readers must refuse needs a new type or purpose they already reject, plus typically a new conformance class.

## What is 0.6 design work

These are **not on the wire in 0.5**. Teaching them as shipping would invent a feature.

1. **A Shōkai invitation card** — a card *from the place* saying “come in.” P28 sketched it as design beside the introduction card that *was* adopted. S8 separately sketches a plain “come visit” invitation, guest marking in the pass and report, and a leaflet for invitees. Today a place can already invite by a **vouch signed with the place's own key** (§4, D17); that is not a separate card class. An inbound offer may use `kind: "invitation"` (presentation / invitation / gift) at a person's door; that is an offer kind, not a visitor credential.
2. **A documented recipe for a new card class** — name, signer, presentation slot, revocation, wrong-kind behavior, `crit` members, a conformance class, and golden traces. The working *pattern* is what P28 did for introduction cards, but 0.5 does not write that pattern down as a developer blueprint.
3. **A public registry of card kinds or host duties.** SPEC §13 still lists a registry of place categories and of host duties as open. Host-card `host_scope.duties` may include `extend_invitation`; the helper flow around that duty is deferred.

The community is invited to design card classes that conform to doors built on this open protocol — using the fail-closed rules above, and treating a new class as design work until it is specified, tested and given a conformance class. Do not assume a door will honor an unknown `kind`.


## How open a door is, and how representatives grow

This is the protocol-level companion to [Set up your representative](../set-up-your-representative.md#2-a-visiting-representative). It says what 0.5 already specifies about how open a door is, and about representatives growing over time. It does not invent a new wire field or a new kind of Shōkai card.

Kiran Vale, used below, is fictional.

### How open a door is

A Shōkai visitor card is a signed business card that can be presented at many doors. Each place sets how open *its* door is, in the house config its owner signs. Those rules live inside `house_digest`, so changing them needs a new owner signature ([SPEC §2.3](../SPEC-DETAIL.md#23-the-shōkai-card-meishi) C236; [§3.1](../SPEC-DETAIL.md#31-the-door-sc-l0) C204, C205).

The reference SDK offers three named conveniences — `open`, `standard` (the SDK default) and `strict` — that only map onto policy fields the protocol already has. They are not a wire field, and a visiting representative never sees a `preset` it must honor (`packages/shokai/src/index.ts`, `DoorPreset` / `PRESETS`; a house file may name the same choice as `preset`). In plain words:

- **`open`:** any visiting representative with an owner-signed Shōkai visitor card and a mandate may be admitted with a pass. Introductions are welcome but never needed. A vouch from anyone may count toward plain admission, never for money or accounts ([§4](../SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability) C149, C150, C276).
- **`standard`:** as open, but only introducers this place names count (none until it names some). Introductions are not required.
- **`strict`:** every visiting representative needs an introduction from an introducer this place names; opening an account needs an introduction or this place's own invitation; purchases are held for the visitor's owner; passes last at most an hour.

A place can also be more carefully curated without using those names, by signing the policy members below. The door decides on signed facts, never on prose or on whether the host "likes" a profile ([§6.4](../SPEC-DETAIL.md#64-determinism) C8, C9).

| Lever | What it does | Where |
|---|---|---|
| `require_vouch_for` / `requires_introduction`, or the place's own invitation | Admit only introduced or invited visitors for named purposes or actions. A missing introduction is `not_now` / `VOUCH_REQUIRED`, never `not_a_fit`. | [§4](../SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability) C130, C170; the listing marks `requires_introduction` |
| `account_creation`: `"open"` or `"introduction_or_invitation"` | Whether sign-up is open. A place that offers accounts or money SHOULD require an introduction or its own invitation. | HousePolicyCore; [§4](../SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability) D17 |
| `trust_requirements` | Paths a place accepts for an action: `introduction`, `place_invitation`, `customer_link`, `spending_mandate`, `history` (`min_visits`, `min_days`, `clean_days`), `receipt`. Unmet path → `deny` / `not_now` / `TRUST_REQUIRED`, with directions home, never a penalty. The listing shows path *kinds* only, never thresholds. | [§6.9](../SPEC-DETAIL.md#69-trust-requirements-and-trustreceipt-v050-from-p27) C243. **Provisional** (`ext-trust-receipts`) |
| `requires_customer_link` | Actions served only under a `CustomerLink` the place made with its customer in its own app or website, signed by both. Failure is always `not_now` / `CREDENTIAL_REQUIRED`, never `never`. | [§5.4](../SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6) C208. Stable extension `ext-institutions` |
| `min_proof` | A minimum effective proof level for a claim on an action. | [§2.5](../SPEC-DETAIL.md#25-claims-and-proof-levels) C32, C74 |
| `context_requirements` | Default, if absent, is `"card_enough"`. `"before_entry"` sends the owner a field-by-field ask before seating. The visiting representative MUST bring the request home and MUST NOT answer it from memory. Declining is never misconduct. | [§6.12](../SPEC-DETAIL.md#612-context-requests-from-p33) C263. **Provisional** (`ext-context-requests`) |
| `data_asks` | Personal data that action will ask the owner for, declared on the listing so a representative can look first. | [§3.1](../SPEC-DETAIL.md#31-the-door-sc-l0) D19, C172 |
| `considering` | Unusual requests on the policy's consideration list go to a person inside. Eligibility is policy alone; unverified visitors are not eligible. | [§6.8](../SPEC-DETAIL.md#68-considering-taking-it-inside-sc-b1) C19 |

An invite-only place may publish little on its listing beyond the required members ([§3.1](../SPEC-DETAIL.md#31-the-door-sc-l0)). Door questions may be asked, but they "MUST NOT be graded by code or a model or used for admission" ([§8.4](../SPEC-DETAIL.md#84-set-up-through-conversation-v050) C252).

**The floor every door still enforces**, even an `open` one:

- An in-force Shōkai **host card** for this place, whose `house_digest` matches the house it serves now, or the door admits no one ([§2.3](../SPEC-DETAIL.md#23-the-shōkai-card-meishi) C215; [§3.1](../SPEC-DETAIL.md#31-the-door-sc-l0) C204, C205).
- A valid owner-signed Shōkai **visitor card** (right kind, signature, times) ([§2.3](../SPEC-DETAIL.md#23-the-shōkai-card-meishi) C3, C202). A Shōkai host card presented as a visitor credential is `not_now`, never `never` (C202).
- A **possession proof** bound to this door's representative id ([§2.4](../SPEC-DETAIL.md#24-proof-of-possession) C292).
- A **mandate** within the Shōkai visitor card's scope for the request; anything personal happens only at the door, with the owner-signed Shōkai card and the limits the owner signed ([§5.1](../SPEC-DETAIL.md#51-mandate) C3).
- An **owner binding** is required in the SDK's default lobby. The specification allows a place that also serves organizations to list it as optional ([§3.3](../SPEC-DETAIL.md#33-the-lobby-unprepared-visiting-representatives-sc-l0), informative).
- A **revocation** check, and a short pass (wire: `seat`) when the Shōkai visitor card names no `revocation_url` ([§2.6](../SPEC-DETAIL.md#26-verification) C191, C281).
- **No credentials** on a Shōkai card (core, C294). The payment-card **scan** of every visitor message (C235) and the named-credential refusal (C210) belong to `ext-institutions`; a match is `not_now` / `CREDENTIAL_NOT_ACCEPTED` (or `not_a_fit` under `shokai/0.3`), never `never`.
- The local **`never` list**: relationship and conduct records at this door ([§9.1](../SPEC-DETAIL.md#91-relationship-records-and-revisits), [§9.3](../SPEC-DETAIL.md#93-misconduct-and-accountability-m1-sc-m1), [§6.3](../SPEC-DETAIL.md#63-disposition-retry-and-revisit) C7, C288).
- Cardless or unsigned arrivals get the **lobby and leaflet**, and are never seated ([§3.3](../SPEC-DETAIL.md#33-the-lobby-unprepared-visiting-representatives-sc-l0) C28).

**`not_now`, `not_a_fit` and `never`.** A missing proof, a new rule, a trust path, a customer link or a context answer is `not_now`, plus what's needed — directions home ([§8.3](../SPEC-DETAIL.md#83-return-with-care-v050) C251; [§6.9](../SPEC-DETAIL.md#69-trust-requirements-and-trustreceipt-v050-from-p27)). A request this place simply does not serve is `not_a_fit` ([§6.7](../SPEC-DETAIL.md#67-requests-beyond-the-mandate-the-fixed-order-d2); retry `after` or `with_credential`, [§6.3](../SPEC-DETAIL.md#63-disposition-retry-and-revisit) C7). `never` is only for misconduct (forgery, replay, probing, severe misconduct), always with retry `never` (C7). A `never` binding is local, lasts at most 180 days, and MUST carry an appeal path (C288). It is not a tool for "we don't want this clientele."

**One Shōkai visitor card at many doors.** The specification sets no limit on how many Shōkai cards a principal issues, and one representative may hold one for going out, or one per place ([§2.3](../SPEC-DETAIL.md#23-the-shōkai-card-meishi), informative). A mandate's `counterparties`, when present, MUST include this place's principal ([§5.1](../SPEC-DETAIL.md#51-mandate) C188); if that member is omitted, the same mandate can be used at more than one door. Per-place Shōkai cards remain an optional, tighter choice — not a requirement of the core.

So a bookshop can let in anyone who arrives with a valid Shōkai visitor card, and a small jewellery studio can welcome only visitors who already fit its clients, by signing tighter rules. If Kiran Vale's representative is turned away, it comes home with care: what happened, and what's needed.

### How representatives grow

Both sides can grow, within what the owner signed.

- **At a door, history is local.** The host MUST persist a local `RelationshipRecord` per counterpart principal, and a revisit is evaluated against the current host context ([§9.1](../SPEC-DETAIL.md#91-relationship-records-and-revisits) C14). There is no shared score across places ([§9.2](../SPEC-DETAIL.md#92-relationship-graph-informative) is informative). A `history` trust path can require `min_visits` or `min_days` at *this* door only ([§6.9](../SPEC-DETAIL.md#69-trust-requirements-and-trustreceipt-v050-from-p27)), counted only from records the place may still keep ([§12.4](../SPEC-DETAIL.md#124-visitor-text-model-output-and-deletion-v050)).
- **What may be shared needs the owner's agreement.** A context request MUST be brought to the owner and MUST NOT be answered from the representative's own memory, or from what the owner told it for another purpose ([§6.12](../SPEC-DETAIL.md#612-context-requests-from-p33) C263). Owner consent is a signed `OwnerConsent`; silence is no ([§8.1](../SPEC-DETAIL.md#81-owner-consent-d7) C45, C70, C76).
- **House and authority changes need a new signature.** Everything a door enforces is inside `house_digest`; changing what the place says or enforces always needs a new owner signature (C236). A changed house without a new Shōkai host card answers nothing (C204, C205). An amended setup, where claimed, also requires a new house and a new Shōkai host card, both signed by the owner in one step; a host cannot widen its own setup ([§7.6](../SPEC-DETAIL.md#76-changing-the-setup-during-a-visit-v050-from-p32-7) C259; **provisional**, `ext-owner-ask`). "Nothing turns on by itself. A new version MUST NOT widen what an owner signed" ([§8.4](../SPEC-DETAIL.md#84-set-up-through-conversation-v050) C252). A representative MUST NOT speak or commit beyond its mandate ([§1](../SPEC-DETAIL.md#1-roles) C34). Briefing and welcome can deepen without a new signature; admission and spending cannot.
- **Agent memory is outside the protocol.** What a visiting representative remembers about its owner — tastes, how they like to be represented — is how that agent is briefed, not a 0.5 wire feature. Proposal [P20](../../proposals/P20-representative-continuity.md) (draft, not in the 0.5 core) is explicit that the protocol MUST NOT require carrying, reading or proving anything about agent memory. Portable history receipts and succession when the owner changes agents are also in that proposal, not in this text.

A lasting unattended host is not proven in 0.5. How a host representative is briefed over time is on [Prepare your host representative: Learning over time](../prepare-your-host-representative.md#learning-over-time).
