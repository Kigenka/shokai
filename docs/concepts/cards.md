# Shōkai cards

The **card** (*meishi*, the Japanese business card) is how a representative introduces itself: who it's here for, signed by that person or organisation. A `RepresentativeCard` contains:

- the **principal** (who it represents) and its **role** ("Representative of Kiran Vale", "Account manager, Pacific freight team")
- its **standing**, as the principal asserts it (the host representative's own record is what counts)
- its **mandate scope**: the outer bound of purposes and actions any mandate under it may authorise
- its **locales** and etiquette preferences
- the representative's own key, and `issued_at` / `expires_at`
- for a person, an `owner_binding` naming the owner's passkey and its relying party

It is signed by the principal.

```json
{
  "card_id": "card-kiran-01",
  "protocol": "shokai/0.5",
  "kind": "visitor",
  "representative_id": "did:key:z6MkKiranRep…",
  "principal": { "principal_id": "did:jwk:eyJrdHkiOiJFQyIs…", "kind": "person", "display_name": "Kiran Vale" },
  "role": "Personal representative",
  "mandate_scope": { "purposes": ["visitation", "account_servicing", "purchase"], "actions": ["accounts.read_balance", "catalog.browse"] },
  "locales": ["en-US"],
  "representative_key": { "key_id": "did:key:z6MkKiranRep…#z6MkKiranRep…", "alg": "Ed25519", "public_key": "…" },
  "issued_at": "2026-10-20T09:00:00Z",
  "expires_at": "2027-01-20T09:00:00Z"
}
```
*Abridged and illustrative, v0.5.0 (`shokai/0.5`; a v0.3.0 Shōkai card says `shokai/0.3` and has no `kind`): the envelope, signatures and some required members are omitted.*

A Shōkai card is both a helpful metaphor — a signed introduction you can picture — and a signed, typed document a door can verify. Developers who want to invent their own card types should treat 0.5's family as the pattern and read [Cards as a blueprint](./card-classes.md). A conforming door verifies the three specified classes: visitor, host and introduction. An unknown kind is not honoured; a new class is design work until it is specified, tested and given a conformance class.

## The host card

A host card (`kind: "host"`) is the place's own card. Besides the shared fields above, v0.5.0 requires:

- the **place** (`place`: the door's address, and optionally the website it belongs to)
- its **host scope** (`host_scope`: the actions and duties the host representative may carry out)
- the **house digest** (`house_digest`) and the **summary digest** (`summary_digest`) of the house config the owner approved
- the recap the owner read before signing (`shown_to_owner`)

It is signed by the place's principal — for a shop, the place's own key. Without an active host card the door admits no one (it still accepts revocations). A come-visit invitation from the place (S8) is proposed, not in the core.

## One representative, several cards

A card is for one role, so a representative can carry more than one, each signed by its owner:

- **My door** (inbound): the card it shows as the host at its owner's own place, a shop, a meeting room, a person's door for brands.
- **When I go out** (outbound): the card it shows as a visitor at other places.
- **Per place, if the owner wants:** a narrower card for one place, or a separate identity per place so places can't link visits by the owner key; other details such as timing or the chat key can still link them (per-place owner identity, [SPEC](../../SPEC.md) §2.8 and §12.3).

0.5 specifies three card *classes*: a **visitor card** (`kind: "visitor"`; a v0.3 card with no `kind` is read as visitor when a visitor presents it), a **host card** (`kind: "host"`, naming the place, its `host_scope`, the `house_digest` and that it was `shown_to_owner`), and an **introduction card** (`kind: "introduction"`; SPEC §4.1). A host card presented as a visitor card, or an introduction card presented as a visitor card, is a wrong-kind refusal (`not_now` / `CREDENTIAL_REQUIRED`) — never `never`. Nearby signed objects that are *not* cards — mandates, standing allowances, `card_revocation`s and vouches — are listed on [Cards as a blueprint](./card-classes.md). Invitation cards are not specified in 0.5.

Each card has its own scope and expiry and can be revoked on its own; revoking one ends its open visits and leaves the others alone. A place sees only the card shown to it. More cards never mean less accountability: conduct, sign-up limits and refusals stick to the owner, across all their cards and representatives, and coming back under a new card to get around a "not now" counts as misconduct. The spec sets no number; one card per role is the simple default. A walkthrough with both roles: `scenarios/dual-role.md` in the repository.


## How a card is withdrawn

An owner withdraws a card in two ways (SPEC §2.6):

1. **A delivered, signed `card_revocation`.** Anyone may carry it to the door. The door records it and answers with nothing (no decision, no seat). The card's open visits end.
2. **The card's `revocation_url` list.** The door fetches the published list. If that list cannot be fetched, the door fails closed: it does not treat the card as good.

A place that is changing its host card still accepts revocations while it answers nothing else. A revocation whose signature does not verify is not stored; the card still works.

## Proving it is really yours

Cards are exchanged **both ways**: the place shows its card too. Each side greets with a fresh `nonce`, and the presenter signs the counterpart's nonce with the card's key (the **possession proof**). A copied card replayed by another key fails, and binds only the presenter, never the card's real owner.


## The introduction card

The **introduction card** (SPEC §4.1, class `ext-introduction-card`) is a vouch made one-to-many for **one named place**. Its payload is a `ShokaiIntroduction` with `kind: "introduction"`. A visitor claims it with an `IntroductionClaim`. It is already specified in 0.5; it is not the dashed "place invitation" artwork (S8), and it is not an invitation card from the place saying "come in."

## Claims and proof levels

A card may carry claims ("licensed adviser", "account manager"). Each has a proof level: `self_declared` < `evidenced` < `vouched` < `verified`. The receiver computes the effective level itself and never takes the asserted one on trust. `vouched` counts only when a valid vouch in this encounter names the claim.

## Every message is signed

Every protocol message travels as a signed envelope (`payload`, `payload_digest`, `signatures`): Ed25519 over the SHA-256 digest of the RFC 8785 (JCS) canonical form. A message whose content no longer matches its signature gets no answer.

*[Spec](../../SPEC.md): Identity, cards, claims and keys (the card, proof of possession, claims and proof levels, the signed envelope).*
