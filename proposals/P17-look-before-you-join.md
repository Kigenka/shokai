# P17 (draft): look before you join

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Status: draft for the editor's review, 2026-10-26 2:45 PM PT. Not in SPEC.md. Comes from the editor's notes on "sign in first" data capture, platform lock-in, and welcoming every visitor (a store greeting passers-by without being pushy).*

## Problem
Today many places ask you to sign in, or give an email, before showing what's inside. Sign-in becomes a way to capture data, and big sign-in providers add lock-in. A representative can't judge a new bank, store or community for its owner if it has to hand over identity first.

## What already works
- Browsing the lobby and place listing is open by design (§4); no account needed.
- Pairwise identifiers: a place sees a different identifier per owner, so a visit isn't a tracking hook.
- The brand door's fixed "no data for gift" rule (§4.17) already protects people in one direction.

## Proposed (place side)
1. **A welcome before sign-in.** A place SHOULD offer an anonymous welcome visit: a public description of what's inside, what an account unlocks, and sample content or terms, enough for a representative to compare places for its owner. Omotenashi: greet and thank every visitor, without pushing.
2. **Declared data asks.** When a place offers an account, it MUST declare up front which data is required, which is optional, why each is needed, and how long it's kept. This mirrors the declared strings on brand offers. A representative can compare asks across places, and a mismatch between the declaration and what's actually requested is a conduct signal.
3. **Minimum necessary.** Places SHOULD ask only what the service needs. "Sign in to see anything" is allowed (each place decides) but must be declared, so representatives can tell their owners.
4. **No sign-in-provider lock-in.** The representative's card is its identity at the door; no third-party sign-in provider is needed to join. Places may still offer one as an option.
5. **Report home.** The representative tells its owner: "New bank looked good. To open an account they need X and Y, for these reasons. Shall I go ahead?" Joining stays the owner's decision.

## Open questions
1. Should the anonymous welcome visit be SHOULD (recommended) or MAY?
2. Should declared data asks be part of v0.3, or kept for later thought?
