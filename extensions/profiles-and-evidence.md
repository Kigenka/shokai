<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Profiles and evidence

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `profiles-and-evidence`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Profiles and evidence.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (card issuer, receiver, gatekeeper using `min_proof`). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A card shows it uses the extension by carrying a `PrincipalImprint` or `EvidenceRef`s with a `content_digest`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `profiles-and-evidence`).

## Imprint and evidence
- A card MAY carry `claims` and a `PrincipalImprint` (expertise, worldview, working style, taste). Each claim or facet carries a `proof_level` (`self_declared` < `evidenced` < `vouched` < `verified`) and `evidence_refs`.
- A receiver MUST compute an effective proof level for each imprint facet as core §2.5 says for claims; it MUST NOT exceed the asserted level. [SC-P1, SC-S2, C31]
- `evidenced` MUST count only when an `EvidenceRef` carries a `content_digest`, the receiver fetched the reference, and the fetched content's digest matched; `content_digest` is `"sha-256:"` + base64url of SHA-256 over the raw response bytes (the body need not be JSON, so no JCS). Otherwise the item counts as `self_declared`, and a receiver that didn't fetch MUST report it as `self_declared`. [SC-S2, C31, C61]
- `MinProof.target` MAY name an imprint group (`imprint.<group>`); as for claims, a `self_declared` facet MUST NOT satisfy a requirement of `evidenced` or higher. [SC-S2, FA1, C32, C74]
- A representative SHOULD tell its owner what the counterpart is strong at, using only facets at `evidenced` or above, with their effective levels. [SC-P1, C30, C31]
- A representative's `VisitReport` (core §8.2) MUST also say what strengths it read. [SC-P1, C30]
