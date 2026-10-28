<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Visit receipts

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `visit-receipts`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Visit receipts.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (gatekeeper, returning visitor). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. Every `LobbyBriefing` carries a `visit_receipt` (core §3.3); a gatekeeper that implements this extension links a proven return to it.

**Requires:** the core. Tests: see `conformance/homes.json` (home `visit-receipts`).

## Linking an anonymous visit
- A returning visitor proves continuity by echoing the lobby's `{receipt_id, nonce}` inside a request signed with its new key. [SC-L0, L0b, C42, D6]
- The gatekeeper MUST link the earlier unbound record only when the receipt is known, unused and unexpired, and the nonce matches. It MUST then mark the receipt used. A guessed, unproven or reused receipt MUST link nothing. [SC-L0, L0b, C29, C42, C56, D6]
- **A receipt is a bearer secret** (`handling: "bearer_secret"`): whoever echoes it first continues the visit. Its `expires_at` MUST be at most 7 days after `issued_at`. [SC-L0, C60, D6]
- A gatekeeper MUST rate-limit invalid receipt echoes per sender (default: 3 per hour). Past the limit, even a valid echo MUST NOT link. [SC-L0, L0b, C60]
- A lobby visitor MAY send an ephemeral `continuity_key` (a `did:key`) in its greeting. The receipt then carries `bound_key`, and linking MUST also require `visit_receipt.continuity_proof`: a signature by that key over digest(JCS(`{encounter_id, receipt_id, representative_id}`)). [SC-L0, L0b, C56, C60]
- A bare `relationship_ref` or `prior_response_ref` to an unbound record MUST NOT link history. [SC-L0, C42, D6]
- Receipt nonces MUST NOT appear in reports, transcripts or logs shown to anyone else. [SC-L0, C42, D6]
- Each `LobbyBriefing` mints a new receipt; any unexpired, unused receipt links its own lobby visit (informative).
- **Linking is visible .** A response to a request that echoed a visit receipt MUST carry `continuity: {receipt_id, linked}`, saying whether the earlier visit was linked; the visitor's `VisitReport` MUST carry the same, so the owner knows. [SC-L0, L0b, C105, D6]
- A report (core §8.2) on a visit that echoed a receipt MUST say whether it was linked (`continuity`). [SC-L0, L0b, C105]
- *Informative.* A gatekeeper remembers signed greeting nonces for at least the lifetime of the receipts it issues (core §2.4).
