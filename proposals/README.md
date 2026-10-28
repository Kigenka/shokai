# Proposals

Numbered proposals for changing the Shōkai specification. A proposal isn't normative until it's merged into `SPEC.md` (or an extension) and listed in `CHANGELOG.md`. Section numbers inside each proposal are those of the draft it was written against; SPEC Appendix D maps them.

| # | Title | Status in v0.3.0 |
|---|---|---|
| P1–P8 | [Red-team round 1 proposals](./P1-P8-red-team-round-1.md) (freshness, introducer standing, seat brand, self-asserted kind and name, IntroducerReview signer, 429/413, press scope, fetch scope) | P2 adopted in part; the rest proposed (SPEC §13 item 18) |
| P9 | [Swarm resistance](./P9-swarm-resistance.md) | Minimal sign-up caps adopted (§9.4); account creation by place policy adopted (§3.1); the rest proposed |
| P10 | [Session-wide spend cap](./P10-session-spend-cap.md) | Adopted (§7) |
| P11 | [Prompt-injection surface](./P11-prompt-injection-surface.md) | Proposed |
| P12 | [Bounded encounter state (DoS)](./P12-dos-encounter-cap.md) | Adopted as refuse-new (§3.4) |
| P13 | [Supply chain of the reference code](./P13-supply-chain-reference.md) | Applied in the reference (pinned TypeScript, lockfiles, ephemeral keys); proposed for the spec |
| P14 | [Carried grants](./P14-carried-grants.md) | Proposed |
| P15 | [The inbound door](./P15-inbound-door.md) | Adopted (§10); open questions closed with the recommended defaults (§13 item 19) |
| P16 | [Sincerity and representation](./P16-sincerity-and-representation.md) | Part A adopted (§9.3, §10); Part B deferred |
| P17 | [Look before you join](./P17-look-before-you-join.md) | Declared data asks adopted as a recommendation (§3.1); the rest proposed |
| P18 | [Owner key continuity](./P18-owner-key-continuity.md) | Proposed (v0.3.0 has standby revocations only, §2.6) |
| P19 | [Asynchronous alignment](./P19-alignment.md) | Deferred: not before v0.4 (cut to keep v0.3 small) |
| P20 | [Representative continuity and history](./P20-representative-continuity.md) (sketch vectors: [P20-vectors.json](./P20-vectors.json)) | Draft; partly decided (D25): Continuity planned as an optional v0.3 extension; place receipts deferred to v0.4 |
| P21 | [The customer link](./P21-customer-link.md): a place recognizes its existing customer's representative; link once in the place's own channel, no credentials on the wire, owner passkey over the exact terms of every money-moving act | Draft for v0.4 (not in rc4) |
| P22 | [The first purchase](./P22-first-purchase.md): a self-introduced visitor may buy; buyer context, first-purchase rules in the listing, authority separate from the payment instrument, `payment_misuse` finding; notes "how I heard of you" as a later candidate | Draft for v0.4 (not in rc4) |
| P23 | [Identity binding](./P23-identity-binding.md): how a representative proves "I represent <a well-known person or organization>": did:web, a signed link from an account the person controls (DNS, .well-known, OpenID, credentials), trusted introducers, place history, and "claims to be" display rules | Draft for v0.4 (rc4 has only the rule that names are claims, C199) |
| P24 | [Owner key move](./P24-owner-key-move.md): an owner moves to a new key with a statement signed by the old key and the new one; places may carry the history across (never clearing a `never`); covers a signing-page address move, and says honestly that a lost old key falls back to vouches and the place's own relationship | Draft for v0.4 (not in rc4; rc4 has standby revocations only, §2.6) |
| P25 | [Door status](./P25-door-status.md): open, closed for now, back at a time, under construction, by appointment, leave a note; a signed hint in the leaflet and the 404 pointer's `here`, never a decision; leave-a-note goes to the owner's representative and is never auto-acted on | Draft for v0.4 (not in rc4; no rc4 wire change) |

**Feature freeze (2026-10-27).** The 0.3 line was feature-frozen except for clarifications: no proposal was merged into it before v0.3.0, and changes until then were for clarity, correctness and packaging only. Proposals marked adopted were merged before the freeze.

## Candidates (not yet drafted)

Gaps found in the [places-first working note](../scenarios/places-first.md) that have no proposal yet. A candidate is a note, not a proposal: nothing here is normative or scheduled.

- **Card exchange in the room (a *meishi* exchange).** In v0.3.0 an attendee of a gathering exchanges cards only with the place; it sees other attendees' DIDs on the signed guest list and their signed room items, never their cards, and nothing lets it keep another attendee's card after the gathering (Gatherings extension; core §3.2, §9.2). A later proposal could add a signed card offer that one attendee chooses to give another inside a gathering, within what its owner allowed (its disclosure policy or allowance) and the house rules; the receiver may keep it after the gathering as a local relationship edge. It must never count as a vouch or an introduction (§4), never imply consent to be contacted (a follow-up meeting stays a Peer meetings invitation signed by both owners), be reported home to both owners (§8.2), and be revocable by the giver. See [places-first (g)](../scenarios/places-first.md#g-the-room-representatives-meeting-inside-a-place).
- **"How I heard of you."** A non-authoritative note of an unsigned mention, never read as an introduction; noted in [P22](./P22-first-purchase.md) and [places-first (f)](../scenarios/places-first.md#f-a-referral-trail-a-friends-representative-mentions-a-brand).
- **Two of an owner's own agents meet (v0.4 clarification).** v0.3.0 lets a host check that a visitor's card is signed by its own owner's key (a card names its principal; records are keyed by the principal; C201 exempts the owner's own principal), but doesn't say explicitly how a host treats its own owner arriving through another representative: same owner recognized by signature, no list or syncing, each card still revoked on its own (§2.6, C198), and no link across per-place identities (§2.8). FAQ: *What if two of my agents meet?* No rc4 wire change.
- **Handoff inside a marketplace** (a market passing a checked visitor to one of its stalls) and **"introduction required to spend" in the listing**: [places-first (d) and (c)](../scenarios/places-first.md#real-gaps-found-summary).

To propose a change, see [CONTRIBUTING.md](../CONTRIBUTING.md).
