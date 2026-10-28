<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Meaning notes

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `meaning-notes`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Meaning notes.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (author, receiver, representative reporting home). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A message shows it uses the extension by carrying a `MeaningNote`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `meaning-notes`).

## Meaning across languages [L1, SC-T1]
- No language is the default. A term that doesn't translate SHOULD be kept in the original with a `MeaningNote` (term, source locale, literal gloss, intended meaning, usage context, human explanation hint, confidence). [L1, SC-T1, C25]
- The authoritative meaning is the author's `intended_meaning` plus the machine fields. A receiver MUST NOT act on its own translation where it contradicts the note. [L1, C25]
- A receiver MUST be able to explain any note it relied on to its human, in the human's language. A meaning the receiver inferred itself MUST be marked `receiver_inferred` and MUST NOT be treated as authoritative. [L1, SC-T1, C26]
- Meaning notes MUST NOT be an input to the gate. [L1, C27]
- A representative's `VisitReport` (core §8.2) MUST also list the meaning notes it learned. [SC-L0, C30, C26]

## Cultural rendering, deferred to the v0.3 multilingual work
**S3 exit (D11).** The editor signed off the S3 exit for **English only**, per D10 and D11. The cultural reviewer's "no" for ja-JP, pt-BR and pt-PT stands and is carried into v0.3; round 2 tests the English core.

D10 makes the core language-neutral now (topic codes, strict amounts, RFC 4647 lookup, IANA time zones, reports rendered from machine fields, a replay digest over gate inputs only). These rendering items from round 1 are deferred, with the testers' notes kept in the findings file:
1. A courtesy contract: register, honorific level and phrase lists per locale.
2. De-identification that covers honorifics and grammatical gender (for example Japanese -san/-sama, Portuguese gendered titles), beyond names and titles.
3. Address preferences (how a person wishes to be addressed) on cards.
4. Regional variants of meaning notes (pt-BR and pt-PT, for example).
5. A translation keyword rule for gate-adjacent text, `LocalizedText` everywhere a human reads text, and a glossary.
6. Japanese and Portuguese golden traces end to end (the cultural reviewer's sign-off for ja-JP, pt-BR and pt-PT is still "no").
7. Thresholds that ask for a human confirmation above an amount (`confirm_above`).
