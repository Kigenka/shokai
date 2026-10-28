# P12. Bound live encounter state (DoS)

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Proposal only; SPEC.md untouched. Drafted 2026-10-26 (PT) from red-team round 2 (D1, D2).*

## Problem
A flood of fresh-key signed greetings creates one `Enc` (and a nonce map entry) per arrival. Without a cap, host memory grows without bound. Round 1 already rate-limits anonymous prose and caps body size; signed fresh keys bypass per-sender buckets.

## What we fixed in s6 (not SPEC)
`HostOpts.maxEncounters` (pilot default 5000): when the cap is reached, the oldest closed encounter is evicted, and `usedNonces` / `seenMsgs` are trimmed to 4× the cap. Conformance leaves it off. Tests: RT2-D1, RT2-D2.

## Proposal
1. A place MUST bound the number of live encounters it keeps, and MUST bound replay maps derived from them.
2. Evicting a closed encounter MUST NOT revive a spent invitation or clear a `never` binding (those live in separate maps keyed by DID).
3. Standardise `429 / RATE_LIMITED` for encounter-cap refusals (with P6).

## Open questions
- Default cap for a public place vs a pair door?
- Prefer refuse-new vs evict-oldest when the cap is hit?
