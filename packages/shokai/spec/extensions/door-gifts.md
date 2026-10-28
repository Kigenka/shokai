<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Door gifts

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `door-gifts`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Door gifts.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (inbound door, brand). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A door shows it accepts gifts by stating gift caps in its policy's public part and serving `door.gift`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `door-gifts`).

**The core rule stays in the core.** "No data for a gift" (core §10): a gift that costs data is never accepted by the representative; it is at most taken home, and only the owner can accept it. The door's policy always carries `no_data_for_gift: true`.

## Gifts at an inbound door
- **Gift caps.** A door that offers gifts states, in its policy's public part, gift rules (`max_per_brand`, `max_total`, optional `max_value`, and `no_data_for_gift`, always `true`), and every admission MUST respect the gift caps, refusing beyond them with `not_now` / `RATE_LIMITED` and retry `after` the time a slot frees. [SC-L0, C153, C156, D15]
- **The gift action.** A door that offers gifts serves a third action, `door.gift` (kind `gift`, purposes `presentation` and `gift`), carrying one `Offer` in its `arguments.offer`. A seat MUST allow at most one gift per visit; another is refused `not_now` / `SEAT_SCOPE_EXCEEDED`. [SC-L0, C157, D15]
- A gift MUST declare up front everything the owner would give, in `strings` (`email`, `address`, `phone`, `marketing_consent`, `account`, `purchase`, `review`, `follow`). [SC-M1, C157, C159, D15]
- A gift above `max_value` MUST be declined, using no uninvited slot. [SC-L0, C157, C158, D15]
- **The gift ceiling.** A gift with any string gets at most `kept_for_later` (core §10, the ceiling); taste then picks at or below it and MUST NOT produce `declined_reported`. [SC-M1, C158, D15]
- **Undeclared conditions and claiming.** A gift whose text makes something a condition that its `strings` don't declare MUST be `declined_reported` (`conditional_inducement`, serious). An accepted gift is claimed with its ticket, never with an address the representative hands over. [SC-M1, C159, D15]
- **Claim tickets.** An accepted gift's `offer_outcome` carries a single-use `claim_ticket`, derived per brand like every pairwise identifier (core §10). [SC-M1, C158, C163, D15]
