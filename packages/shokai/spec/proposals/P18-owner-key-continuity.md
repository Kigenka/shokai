<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P18 (draft): owner key continuity

*Status: draft for the editor's review, 2026-10-27. Not in SPEC.md. Written against v0.3.0-rc4.*

## Problem
An owner's identity at a place is a passkey's `did:jwk` (SPEC §2.1, §2.8). If the owner loses that passkey (a lost phone with no synced copy, a deleted credential, a signing page whose domain is gone), they can't sign a revocation, a new card or an owner link (§2.8, which needs both passkeys). They come back as a newcomer: their relationship records, standing and kept promises at each place are gone. A stolen representative key is covered (card revocation, §2.6); a lost owner key is not.

## What already helps (rc4)
- A standby card revocation, signed when the card is issued and kept by the owner (§2.6, SIGNING.md §6).
- Passkeys synced by the owner's platform.
- Short card and mandate lifetimes.

## Options
1. **A recovery key named in advance.** The card (or a separate owner statement) names a second owner key, for example a hardware security key kept in a drawer, that may later sign a `KeySuccession {old_owner, new_owner, at}`. A place that verifies it treats the new owner DID as the old one (as an owner link does), for every place, without the old key.
2. **Social recovery.** The owner names k of n trusted people (their own owner DIDs); k of them co-sign a succession. Stronger against a single lost drawer key; slower and harder to explain.
3. **Signing-page custody.** The signing page vouches for a succession after its own account recovery. Simple for owners, but makes the page a trust point that can take over identities; probably only as an option a place can refuse.

## Questions
- Must a place honour a succession, or may it treat the new identity as a newcomer anyway? (Recommendation: MAY honour, never MUST: reputation stays local, D3.)
- A succession can launder a `never` as easily as an owner link could; it should carry the old identity's record and nevers, like a link.
- Does succession conflict with per-place identities (§2.8)? Each per-place identity would need its own recovery key, or one recovery key would link them all at recovery time.

## Recommendation
Option 1, optional, for v0.4; keep the standby revocation as the rc4 answer.
