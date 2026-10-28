# P16 (draft): sincere approaches, and honest representation

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*Status (2026-10-26, 2:33 PM PT): **Part A DECIDED (D16) and applied in SPEC v0.2.10** (§4.12, §4.17; C167–C169). **Part B DEFERRED** (kept on the side for more thought, the editor). Originally drafted for the editor's review 1:50 PM PT. Fictional names only. Comes from the editor's notes on cold calling done with care, on treating people as test subjects for A/B testing, and on representing someone's values faithfully.*

## Part A: approaches that think of the other person

**Principle.** An approach is judged on context and care, not on how well it hooks attention. Shōkai already decides on signed facts, never persuasion. Part A adds conduct rules against tactics built on attention addiction.

**Proposed rules (door side):**
1. **Variant probing counts as mass-sending.** A brand sending many reworded versions of the same pitch to the same door, or to many doors, to find what converts is treated as one campaign for caps, and it's a conduct signal. Doors count per brand and per campaign, not per wording.
2. **Manipulative pressure is misconduct.** Proposed new code `manipulative_pressure`: false urgency ("only 2 hours left" when untrue), fake scarcity, fake personal familiarity, or claims of prior consent. It sits beside `conditional_inducement`.
3. **Declared context is required.** Every presentation and invitation states why this door, and it must match the door's public categories. That's already in P15 M10; Part A makes a mismatch a conduct signal.
4. **Kind reasons on declines.** These are optional categories (P15), so a sincere approacher learns and improves.

**What it can't do.** The protocol can't read intent. It can make manipulation costly and sincerity rewarding over time, through reputation at each door.

## Part B: honest representation, "speaks for" vs "inspired by"

**Principle.** Faithfulness to someone's values is what earns trust, not looking like them. A representative must be honest about what it is.

**Proposed card field `representation`:**
- `self`: the owner's own representative (the default).
- `delegated`: acts for an organization or person who signed the delegation (a brand, an employer).
- `tribute`: inspired by a person or legacy and authorized by the rightful steward (for example an estate), which signs the card. It must never claim to be the person, and doors show "inspired by, authorized by" to humans.
- An unauthorized tribute can't use a person's name as identity. Display names never count as identity already.

**What it can't do.** No protocol can verify that new words are faithful to someone's values. That trust is earned over time, through reputation and the steward's continued signature. The protocol carries who authorized what, and lets the record speak.

## Open questions
1. ~~Make `manipulative_pressure` a misconduct code in v0.3?~~ Yes (D16, applied in v0.2.10).
2. ~~Is `tribute` in scope for v0.3?~~ No: deferred, kept on the side for later research.

## As applied (v0.2.10)
- Rule 1 → §4.17 "Campaigns, not wordings" and "Variant probing is a conduct signal" (`Offer.campaign_id`; three wordings in 30 days → minor `gate_probing`).
- Rule 2 → `manipulative_pressure` in §4.12, checked against signed facts (`valid_until`, `remaining`, the door's own record; claimed consent never holds). Severe when hidden.
- Rule 3 → §4.17 "Declared context": a mismatch is a minor `purpose_misrepresentation` signal; presentations SHOULD carry context.
- Rule 4 → unchanged (v0.2.9 reason categories); a declined signal may carry `conduct_concern`.
- New: minor door signals add up (three in 90 days count as serious).
- Tests: `reference/engawa/test/v0210.ts` (V210-M1–M5, V1–V3, X1, X2).
