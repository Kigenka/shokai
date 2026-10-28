<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Seeking

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `seeking`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Seeking.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (host, visitor). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A host shows it uses Seeking by publishing a signed `SeekingDeclaration` (and `seeking_ref` in its greeting).

**Requires:** the core. Tests: see `conformance/homes.json` (home `seeking`).

## Seeking declarations
- A host MAY publish a `SeekingDeclaration`. If it does, the declaration MUST be signed and versioned, MUST be scoped by policy, and MUST NOT expose sensitive internals. [SC-S1, L1, C15]
- Visitors SHOULD read Seeking before requesting. [SC-S1, G4b, C15]
- A proposal SHOULD reference the host's Seeking items it addresses. [SC-S1, G4b, C15]

## Where Seeking appears in the core (informative)
- The gatekeeper's greeting MAY carry `seeking_ref` (§3.2); the lobby lists open Seeking items (§3.3); a request names the items it addresses (§5.3); `basis` records the Seeking version when used (§6.1), and the Seeking version is part of the host context the decision is a function of (§6.4).
- Open: is there a well-known location for Seeking? (core §13 item 3).
