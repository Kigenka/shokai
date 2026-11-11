# Cards as a blueprint

A Shōkai **card** is two things at once: a helpful metaphor (the *meishi*, a signed introduction you can hold) and a **signed, typed document** a door can verify. Developers who want to invent their own card types should treat 0.5's family as the pattern to follow, and treat the door's fail-closed rules as already binding.

This page is teaching, not a homepage item. The specified cards themselves are on [Shōkai cards](./cards.md).

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
- **Schema.** TypeScript `protocol-shapes.ts` is the source of types; `schema/v0.5.0/schema.json` is generated from it. Closed lobby templates (`closed: true`) list every accepted top-level member of a visitor card and mandate; extra top-level members are refused (`x-` members are always allowed).

There is no public registry that lets a developer mint `kind: "loyalty"` and expect doors to accept it. A new kind that old readers must refuse needs a new type or purpose they already reject, plus typically a new conformance class.

## What is 0.6 design work

These are **not on the wire in 0.5**. Teaching them as shipping would invent a feature.

1. **A Shōkai invitation card** — a card *from the place* saying “come in.” P28 sketched it as design beside the introduction card that *was* adopted. S8 separately sketches a plain “come visit” invitation, guest marking in the pass and report, and a leaflet for invitees. Today a place can already invite by a **vouch signed with the place's own key** (§4, D17); that is not a separate card class. An inbound offer may use `kind: "invitation"` (presentation / invitation / gift) at a person's door; that is an offer kind, not a visitor credential.
2. **A documented recipe for a new card class** — name, signer, presentation slot, revocation, wrong-kind behaviour, `crit` members, a conformance class, and golden traces. The working *pattern* is what P28 did for introduction cards, but 0.5 does not write that pattern down as a developer blueprint.
3. **A public registry of card kinds or host duties.** SPEC §13 still lists a registry of place categories and of host duties as open. Host-card `host_scope.duties` may include `extend_invitation`; the helper flow around that duty is deferred.

The community is invited to design card classes that conform to doors built on this open protocol — using the fail-closed rules above, and treating a new class as design work until it is specified, tested and given a conformance class. Do not assume a door will honour an unknown `kind`.
