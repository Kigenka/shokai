# Cards

The **card** (*meishi*, the Japanese business card) is how a representative introduces itself: who it's here for, signed by that person or organisation. A `RepresentativeCard` contains:

- the **principal** (who it represents) and its **role** ("Representative of Kiran Vale", "Account manager, Pacific freight team")
- its **standing**, as the principal asserts it (the gatekeeper's own record is what counts)
- its **mandate scope**: the outer bound of purposes and actions any mandate under it may authorise
- its **locales** and etiquette preferences
- the representative's own key, and `issued_at` / `expires_at`
- for a person, an `owner_binding` naming the owner's passkey and its relying party

It is signed by the principal.

```json
{
  "card_id": "card-kiran-01",
  "protocol": "shokai/0.3",
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
*Abridged and illustrative: the envelope, signatures and some required members are omitted.*

## One representative, several cards

A card is for one role, so a representative can carry more than one, each signed by its owner:

- **My door** (inbound): the card it shows as the host at its owner's own place, a shop, a meeting room, a person's door for brands.
- **When I go out** (outbound): the card it shows as a visitor at other places.
- **Per place, if the owner wants:** a narrower card for one place, or a separate identity per place so places can't link visits by the owner key; other details such as timing or the chat key can still link them (per-place owner identity, [SPEC](../../SPEC.md) §2.8 and §12.3).

Each card has its own scope and expiry and can be revoked on its own; revoking one ends its open visits and leaves the others alone. A place sees only the card shown to it. More cards never mean less accountability: conduct, sign-up limits and refusals stick to the owner, across all their cards and representatives, and coming back under a new card to get around a "not now" counts as misconduct. The spec sets no number; one card per role is the simple default. A walkthrough with both roles: `scenarios/dual-role.md` in the repository.

## Proving it is really yours

Cards are exchanged **both ways**: the place shows its card too. Each side greets with a fresh `nonce`, and the presenter signs the counterpart's nonce with the card's key (the **possession proof**). A copied card replayed by another key fails, and binds only the presenter, never the card's real owner.

## Claims and proof levels

A card may carry claims ("licensed adviser", "account manager"). Each has a proof level: `self_declared` < `evidenced` < `vouched` < `verified`. The receiver computes the effective level itself and never takes the asserted one on trust. `vouched` counts only when a valid vouch in this encounter names the claim.

## Every message is signed

Every protocol message travels as a signed envelope (`payload`, `payload_digest`, `signatures`): Ed25519 over the SHA-256 digest of the RFC 8785 (JCS) canonical form. A message whose content no longer matches its signature gets no answer.

*[Spec](../../SPEC.md): Identity, cards, claims and keys (the card, proof of possession, claims and proof levels, the signed envelope).*
