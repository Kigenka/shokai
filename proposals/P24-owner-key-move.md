<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P24 (draft): moving an owner to a new key, signed by the old one

*Status: draft proposal for v0.4, 2026-10-27. Not in SPEC.md; rc4 is feature-frozen. **Nothing in this proposal exists today**: in rc4 an owner who changes passkeys gets a new owner identity and is a newcomer at every place (SPEC §2.6, informative note; §2.8). Written against v0.3.0-rc4. Companion to [P18](./P18-owner-key-continuity.md), which covers a key that is already lost; P24 covers a move made while the old key still works. Every person and place here is fictional.*

## In plain words (five lines)
1. **A passkey is tied to the web address it was made on** (its relying party, `rp_id`). If that address ever has to change, or an owner simply wants a new key, the owner needs a new passkey, and today that means a new identity.
2. **P24 lets the owner carry their identity across:** while the old passkey still works, they sign one short statement with it, "my new key is this one", and sign the same statement with the new key.
3. **Places that know the owner then recognize the new key as the same owner**: same history, same standing, and any `never` stays too. A place may still choose to treat the new key as a newcomer; continuity is offered, never forced.
4. **It only works while the old key can still sign.** That is why a planned move must be announced in advance (the signing page notice, below).
5. **If the old key is already gone, there is no shortcut:** the owner starts over with a new identity and rebuilds through vouches from people the place trusts and through the place's own relationship with them (P18 covers recovery keys named in advance).

## Why now
The steward runs a test-stage signing page at `sign.kigenka.com` ([deploy/SIGNING-PAGE-PLAN.md](../deploy/SIGNING-PAGE-PLAN.md)). Every passkey made there names that address forever (SPEC §2.1, Appendix A.1, C195). The plan keeps the address, but owners deserve to know what happens if it ever moves. The honest rc4 answer is "you start over"; P24 is the better answer for v0.4, and the steward commits not to move the address before it exists.

Other reasons an owner moves keys, all covered by the same artifact:
- the owner switches passkey providers or platforms and the passkey doesn't sync across;
- the owner moves from Kigenka's page to their own signing page or their own domain ("your representative is yours", design principle 2);
- an organization rotates the key under its `did:web` (organizations already rotate by editing `did.json`; P24 is mainly for owners whose DID *is* the key, `did:jwk`).

## The artifact

```
KeyMove {
  move_id,
  old_owner,            // the current owner DID (did:jwk, or a P-256 did:key)
  new_owner,            // the new owner DID; for a passkey, on any relying party
  new_rp_id?,           // the new key's relying party, when it is a passkey (informative for display)
  scope: "all" | { audience: [<place principal DIDs>] },
  effective_at,
  expires_at?,          // optional: a move that must be presented by then
  statement?            // a short plain sentence the owner saw, e.g. "I am moving to a new signing page."
}
```

- **Signed by both keys**: the old owner's passkey (proving the old identity agrees) and the new one (proving the new key's holder agrees and preventing a move onto someone else's key). Two ES256 signatures over one digest, as an `OwnerLink` is (SPEC §2.8). Each signature carries its own `webauthn.rp_id`, so the two can name different relying parties.
- **Delivered** like a card revocation (SPEC §2.6): in an `invitation_request` from a card of the new owner, and optionally published at the old card's `revocation_url` next to revocations of the old cards, so a place that only polls the list also learns of it.
- **Paired with revocations.** A move SHOULD come with a `CardRevocation` of each old card, signed by the old key in the same session, so nothing stays open under the old identity (C198 ends its open seats).

## What a place does with it
- **MAY honour it, never MUST** (reputation stays local; D3). A place that honours it treats `new_owner` as `old_owner` for relationship records, standing, conduct, sign-up counts and `never` bindings (§9), from `effective_at` on.
- **A move only carries; it never clears.** Exactly as an owner link (§2.8): a `never`, a reduced standing, a misconduct record and sign-up counts all move with the owner. A move that would land on a key the place has already bound `never` leaves that binding in place.
- **One move per old key.** A place MUST ignore a second move from an `old_owner` it has already seen moved (to a different `new_owner`); a key that moved away can't move again. This stops a stolen old key from "moving" an owner after the real move.
- **Chains.** A → B → C is allowed; each step is its own `KeyMove`, and a place that missed B learns the chain from the list.
- **Scope.** `scope: "all"` is the simple default. An owner who keeps per-place identities (§2.8) moves each one separately with `audience`, so a move doesn't link identities that were kept apart.
- **Privacy.** A `KeyMove` with `scope: "all"` published at a `revocation_url` links the old and new keys for anyone who reads it. That is intended for a public move; owners who want quiet moves present them place by place instead.

## When the address itself moves: two routes
1. **Keep the old address alive long enough to sign the move** (the plan's default). The old page stays up, owners sign their `KeyMove` there with the old passkey, then make a new passkey on the new address. This needs only P24.
2. **Related origins (no new key at all).** WebAuthn Level 3 lets a relying party allow other origins to use its passkeys: the old host serves `https://<rp_id>/.well-known/webauthn` listing the new origin, and the new page keeps asking for the *old* `rp_id` ([web.dev: Related Origin Requests](https://web.dev/articles/webauthn-related-origin-requests), [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/)). Owners keep their passkeys and identity. This needs the old domain to keep serving one small file, browser support, and a change to rc4's signing profile, which requires the origin to be exactly `https://<rp_id>` (Appendix A.1, C195). A v0.4 profile could allow a related origin listed at the `rp_id`'s `.well-known/webauthn`. Candidate for the same release; not proposed in detail here.

Route 2 is gentler for owners; route 1 works in every browser. The notice on the signing page promises only what both share: owners are told in advance and given a way to keep their identity before the old address closes.

## The lost-old-key case, honestly
If the old key can't sign (the phone is gone with no synced copy, or the old address closed before the owner signed a move), P24 can't help, and nothing in rc4 can carry the identity across. What remains:
- **A standby revocation** signed at card issue (SPEC §2.6, SIGNING.md §6), so a lost key's cards can at least be ended.
- **A recovery key named in advance** (P18, option 1), if v0.4 adopts it.
- **Starting over with help:** a new owner identity is a newcomer (§2.8). It rebuilds through **vouches** from introducers the place already trusts (§4: "this new key is the same Kiran Vale you know"; the introducer answers for it, §9.3) and through **the place's own relationship** with the person in its own channel (P21's customer link, for a bank or shop where the person has an account). Both are slower than a move, and both are the place's choice.
- No server, steward or platform can restore an identity on the owner's behalf; that is the price of the owner holding the only key, and it is deliberate (P18 option 3 discusses why).

## Threats
- **A stolen old key signs a move to the thief's key.** Requiring the new key's signature doesn't stop this (the thief holds both keys). The owner delivers the standby revocation (SPEC §2.6) with reason `key_compromise` or `key_lost`; a place MUST then ignore any move from that old owner signed after the revocation's `revoked_at`. A planned move pairs its revocations with reason `superseded`, which voids nothing. Together with "one move per old key", the owner who acts first wins, which is why the open question below asks about a short waiting period.
- **Laundering a `never`.** Prevented: a move carries every binding (above).
- **Linking per-place identities.** Prevented by `audience` scoping; `scope: "all"` is the owner's explicit choice.
- **A fake "the address is moving" notice** (phishing owners to a look-alike page). The notice is published only on the old address itself, in the repository and on the site, and never asks for anything but a passkey prompt on a page whose address the owner can check; a passkey can't be used on a look-alike host at all (Appendix A.1).

## Questions for review
- Should a place be told the reason for a move (`statement`), or is that only for the owner's own record?
- Is "first move wins" enough, or should a move wait a short period (say 72 hours) during which a revocation can cancel it?
- Should P24 and P18 ship as one "owner continuity" extension in v0.4?

## Not in this proposal
Account recovery by a third party, government identity, and any change to how per-place identities are made. See P18 (lost keys) and P23 (identity binding).
