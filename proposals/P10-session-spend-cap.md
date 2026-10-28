# P10. Default seat spend cap is session-wide (not per_operation)

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Proposal only; SPEC.md (v0.2.7) untouched. Drafted 2026-10-26 (PT) from red-team round 2 (X1). Builds on P1–P9.*

## Problem
A seat whose `max_amount_scope` is `per_operation` (or absent with per-act checking only) lets an agent split a payment across different `payment_ref`s and spend many times the owner's intended session budget. Same-`payment_ref` structuring is already caught as severe `seat_overreach` (round 1 / X2). Cross-ref splits are not.

## Proposal
1. The default `max_amount_scope` for a seat is **the seat** (session): the sum of all spending acts under that seat MUST NOT exceed `max_amount`.
2. `per_operation` becomes an **explicit opt-in** on the mandate/request, and places that serve money SHOULD refuse it for consumer payment purposes unless the owner also set a session cap.
3. Keep the existing same-`payment_ref` structuring rule (severe).

## Open questions
- Should `per_operation` without a session cap be `not_a_fit`, or only a warning in the seat brand?
- Does a place that already uses `per_operation` for quotes/holds need a migration note?
