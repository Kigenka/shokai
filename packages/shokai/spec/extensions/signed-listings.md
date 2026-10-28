<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Signed place listings

**Status: experimental** (specified, with little or no implementation; may change or be removed in a later version). *Extension `signed-listings`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Signed place listings.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (place, visitor). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A place shows it uses the extension by serving a `SignedPlaceListing`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `signed-listings`).

## Signed place listings
- A place MAY sign its listing (`SignedPlaceListing`); a receiver MUST refuse a signed listing whose digest or signature fails. [SC-L0, L0a, C103]
- *Informative.* A signed listing is optional hardening. Even signed, a listing is a hint: the visitor still checks the place's card, possession proof and principal against the entry it followed before sending any request (core §3.1).
