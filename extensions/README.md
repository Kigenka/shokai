<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extensions (v0.3.0)

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

The specification is a **core** ([SPEC.md](../SPEC.md)) plus these optional **extensions** (decision D18).

**The door and the room (informative).** The core is the door: a representative introduces itself at a place and is let in, or given the place's lobby briefing and a kind `not_now`. Gatherings and Peer meetings are the room: inside a place, the representatives it let in can meet. The place signs the guest list and checks every card, and every room item is signed by its sender. Agent-to-agent meeting happens inside a place, never in the open. Every rule is in the core, in one of these documents, or marked informative in the core, and every test runs (see [conformance/homes.json](../conformance/homes.json)).

**Status.** *Stable*: in the reference with its own tests; within 0.3, it changes only for fixes. *Experimental*: specified, with little or no implementation; it may change or be removed in a later version. rc4 is feature-frozen: no new extensions or members until v0.3.0.

**How extensions work.**
- The core is complete on its own: a door can be safe and courteous at its entrance with the core alone.
- Each extension is one short normative document with its own **conformance level**. An implementation claims "core" plus the extensions it implements, for the roles it plays.
- Each extension is **versioned with the core**: an extension at `0.3.0` goes with the core at `0.3.0` and the wire tag `shokai/0.3`. A change to the core that affects an extension bumps both.
- An extension adds rules only for its own messages, members and actions. It never weakens a core rule; where they seem to disagree, the core wins.
- Discovery uses what already exists on the wire (the actions a place lists, the messages it accepts). A general way to advertise extensions is future work.
- Tags in square brackets work as in the core, and `node tools/trace-lint.mjs` checks the core and every extension together.

| Extension | Status | Conformance level | What it covers | Normative statements | Tests homed here |
|---|---|---|---|---|---|
| [Gatherings](./gatherings.md) | Stable | Gatherings | the room: groups as places, guest lists, room items, the relationship graph's rules for edges, three consent kinds, the test gathering (B.3) | 35 | SC-GA1, B.3 test gathering, press runs over HTTP, 21 reference checks |
| [Peer meetings](./peer-meetings.md) | Stable | Peer meetings | a room for two: two people's representatives meeting at a pair place, `accept_invitation`, the test owner (B.2) | 16 | SC-P1, B.2 test owner, PA2 traces, 8 reference checks |
| [Teaching visits](./teaching-visits.md) | Experimental | Teaching visits | lessons and `approve_lesson` | 3 | none of its own (SC-T1 runs under the Meaning notes checks C25, C26) |
| [Profiles and evidence](./profiles-and-evidence.md) | Stable | Profiles and evidence | the imprint and `evidenced` fetching | 5 | SC-S2 |
| [Seeking](./seeking.md) | Stable | Seeking | a place's Seeking declarations | 3 | C15 |
| [Visit receipts](./visit-receipts.md) | Stable | Visit receipts | linking an anonymous lobby visit to a later prepared one (D6), continuity in reports | 8 | receipt checks in SC-L0, L0b traces, 5 reference checks, continuity vectors |
| [Door gifts](./door-gifts.md) | Stable | Door gifts | gifts, claim tickets and gift caps at an inbound door ("no data for a gift" stays core) | 6 | gift ceiling vectors, gift checks |
| [Signed place listings](./signed-listings.md) | Experimental | Signed place listings | a listing signed by the place's principal | 1 | inside core check C104 (the tampered-listing case) |
| [Revocation status](./revocation-status.md) | Stable | Revocation status | how an issuer publishes allowance status, the 1-hour lifetime, stapled statuses | 5 | status vectors, stapled-status checks, C132 |
| [Meaning notes](./meaning-notes.md) | Stable | Meaning notes | meaning across languages and cultural rendering | 5 | L1 trace, C25–C27 |
| [W3C VC mapping](./vc-mapping.md) | Experimental | W3C VC mapping | cards, mandates and vouches as W3C Verifiable Credentials 2.0 | 3 | none yet |

Informative in the core rather than an extension: design phase and provenance (§2.7), the relationship graph (§9.2; its rules for edges live in Gatherings), courtesy rendering and time words (§6.6), lobby templates and the sincere-approach heuristics (Appendix C).

`tools/run-all-suites.sh` runs every suite and prints the counts per home.
