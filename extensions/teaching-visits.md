<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Teaching visits

**Status: experimental** (specified, with little or no implementation; may change or be removed in a later version). *Extension `teaching-visits`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Teaching visits.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (teacher, learner). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A place shows it supports teaching by serving the registered purpose `teaching`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `teaching-visits`).

## Teaching visits [SC-T1]
- A `Lesson` MUST be signed by the teacher, carry its provenance and both owners' consent references, and exclude the learner's private memory. [SC-T1, C25]
- A learner SHOULD adapt a lesson rather than copy it, recording what changed (`LessonAdaptation`). [SC-T1, C26]
- **Passkey action.** `approve_lesson` MUST use `assurance: "passkey"`. [SC-T1, C45, C78, D7]
- *Informative.* A teacher and a learner may keep a `taught` edge in their relationship graphs (core §9.2). Lessons often carry meaning notes (Meaning notes extension).
