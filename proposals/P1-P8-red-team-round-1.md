# P1–P8. Proposals from red-team round 1 (2026-10-25)

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Proposals, not SPEC text. Status in v0.3.0-rc4: P2 adopted in part ("accept any introducer" never covers money or sign-ups, SPEC §4); the rest are listed in SPEC §13 item 18.*

- **P1. Normative message freshness.** Make "a signed entry message whose `sent_at` is more than N seconds from the host's clock is discarded unanswered" a MUST, with N ≤ 300. Today only inbox polls have it. Without it, replaying a victim's old messages after a host restart binds the *victim* `never` (C4). Residual risk even with the fix: a restart within the 5-minute window can still be replayed. Better: persist the seen-greeting nonces, or derive the host nonce from a persistent counter.
- **P2. Introducer standing (E4, open).** With `trusted_introducers: "*"`, any key with a reachable revocation log counts as an introducer, so an attacker can mint one and vouch for itself (a sybil). Proposal: a vouch weighs only if its introducer has its own standing *at this place* (an established record, or a listed trusted introducer). Self-hosted, first-seen introducers carry no weight. Also forbid `"*"` for purposes with money limits.
- **P3. Seat brand from self-claimed role.** The seat brand copies the visitor's self-asserted role with `vendor_warranted: true`, e.g. "Official representative of Celeste Marvane". Proposal: `vendor_warranted` only for claims the place verified, and otherwise a "self-described" label. The golden traces currently expect `true`, so this needs a spec decision and new traces.
- **P4. Kind and display_name are self-asserted (A7, G1).** A person can present as an "organization" with no passkey and call itself "Engawa Staff". Proposal: places MUST NOT show display_name or kind as verified without the §4b linked-identity proofs (D13). An organization kind needs a domain-bound key.
- **P5. Who may sign an IntroducerReview (E7, open).** §9.3 only says the review's signature is verified, so a penalised introducer can lift its own penalty by signing its own review (SC-M1 expects this). Proposal: the review must come from the place's own principal or a named reviewer, never from the penalised party.
- **P6. A standard 429 / RATE_LIMITED reason**, and a 413 for oversize bodies, so representatives back off politely instead of retrying.
- **P7. Decline-topic press weaponisation.** Any guest who declines a topic makes that topic "pressing" for the asker room-wide, and the decliner picks the topic label. A guest can therefore get someone flagged by declining broadly. Proposal: press counts only for the decliner's own declined topic, scoped to that pair.
- **P8. Fetch scope.** The spec should say that a place fetches only status and revocation URLs under the issuer's declared origin, with size and time limits (B10, B11).

