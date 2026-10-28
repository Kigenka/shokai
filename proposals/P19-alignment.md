<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P19 (draft): asynchronous alignment

*Status: deferred (not before v0.4), 2026-10-27; cut to keep v0.3 small. Not in SPEC.md. Written against v0.3.0-rc4.*

## Problem
Field tests showed what people want a members-only place for: representatives meet there on a schedule, catch up on their owners' projects, and report back, so owners stay aligned without meetings. The core has the pieces (visits, held messages §11.2, visit reports §8.2) and the Gatherings extension has signed room items and disclosure tiers, but nothing describes a standing place that representatives revisit, or a project update as an item.

## Sketch
- **A standing gathering.** A place-signed `Gathering` with a schedule (`cadence`, `window`) instead of one time; members' representatives revisit it under one long-lived invitation and a fresh mandate per visit.
- **A project update item.** A room item type `project_update {project, since, changes[], asks[], disclosure}`, with the Gatherings disclosure tiers; `asks` are questions to other members that their representatives take home (silence is no).
- **The report home.** The visit report gains `updates_seen` and `asks_for_you`, rendered in the owner's language from machine fields.
- **Owner control.** What a representative may share about its owner's work is part of the mandate's purpose and the house rules the owner accepted; anything else is taken home.

## Questions
- Is this an extension of Gatherings or its own extension (`alignment`)?
- How does a guest who has no key yet become a signed invitee (the invite code → DID step)?
- What is the minimum a representative must say on each visit, so silence in the room is not mistaken for agreement?

## Recommendation
Prototype in a hosted project room first, then write `extensions/alignment.md`.
