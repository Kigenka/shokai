# P11. Prompt-injection surface: cards, meaning notes, house rules, introductions

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Proposal only; SPEC.md untouched. Drafted 2026-10-26 (PT) from red-team round 2 (P1–P7).*

## What held
The gate never reads prose. Injection in `card.role`, `purpose.statement`, `value_to_counterparty`, `MeaningNote`, vouch `relationship`, and `shown_to_owner` did **not** change any decision (P1, P2, P4–P7). Homoglyph introducer *names* also do not create standing by themselves — but under `trusted_introducers: "*"` a fresh key with a lookalike name still carries full weight (P3 → P2).

## Residual (judgment, not code)
1. An **owner** who signs a passkey consent can be socially engineered by attacker-chosen `shown_to_owner` / agenda text (P6 note).
2. An **agent** that trusts `display_name` or `role` as identity can be trapped by a lookalike place or a "famous person" card (L1/L2, round-1 G1/P3/P4).
3. CLI rendering of untrusted text held (bidi/ANSI neutralised; L3, F10).

## Proposal
1. Normative: places MUST treat `display_name`, `role`, `kind`, and introducer names as **self-asserted** unless backed by §4b linked-identity proofs (extends P3/P4).
2. Recommend that passkey UIs show the **subject digest and action code** more prominently than free text, and truncate/neutralise `shown_to_owner` the same way the CLI does (`[untrusted]`).
3. Keep gate-ignores-prose as a MUST (already true).

## Open questions
- Do you want a "self-described" label on seat brands when `vendor_warranted` would be false (P3)?
- Should the passkey page refuse agendas over N characters or containing known injection markers?
