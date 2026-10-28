<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: Revocation status

**Status: stable** (in the reference with its own tests; within 0.3, it changes only for fixes). *Extension `revocation-status`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: Revocation status.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (allowance issuer (the owner's platform), host, visitor that staples a status). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. A visitor uses it by stapling `InvitationRequest.allowance_status`; an issuer by serving `AllowanceStatus` at the allowance's `revocation_status` address.

**Requires:** the core. Tests: see `conformance/homes.json` (home `revocation-status`).

**What stays in the core (§5.2).** A host checks revocation at `revocation_status`; an unreachable status counts as revoked; a `revoked` or expired allowance is refused; and a fetched revocation wins over a stapled `active`.

## Status publication and lifetime
- **Status and revocation publication.** The allowance's issuer MUST publish an `AllowanceStatus` at the allowance's `revocation_status` URL (§11): `{allowance_id, allowance_digest, status: "active" | "revoked", issued_at, next_update, revocation?}`, signed by the owner binding's platform key, with `next_update - issued_at` at most 1 hour (D12). A revocation MUST be published there. A host MUST fetch the status at the visit or accept a stapled status (`InvitationRequest.allowance_status`) that is fresh (`now < next_update`, lifetime ≤ 1 h, valid signature). An unreachable URL with no fresh stapled status, a stale status, `revoked`, or an expired allowance MUST be refused (fail closed: `MANDATE_INVALID` to a verified visitor). [SC-A1, G7, C98, C82]
- **Status lifetime (D12).** A host MUST refuse an `AllowanceStatus` whose `next_update - issued_at` exceeds 1 hour, even when its signature is valid and `now < next_update`. A revocation therefore stops stapled visits within an hour. [SC-A1, G7, C132, C98, D12]
- **A fetched revocation wins.** A host that fetched a usable status saying `revoked` (valid signature, lifetime ≤ 1 h) MUST refuse the allowance even when the visitor staples a fresh `active` status; a fresh staple still carries a visit while the status URL is unreachable. [SC-A1, G7, C141, C98, D12]

## The issuer's status address
- The issuer's `revocation_status` URL (the owner's platform, not the host) MUST answer `GET` with the current signed `AllowanceStatus` (§5.2), freshly signed, with a lifetime of at most 1 hour (D12), and MUST publish a revocation there as soon as the owner signs it. A host only reads it. [SC-A1, C98, C132, D12]

## Vectors (from Appendix A.5)
- The test vectors also carry a platform-signed `AllowanceStatus` with its 1-hour fresh and stale instants (D12, section `allowance_status`); an implementation of this extension MUST reproduce them. [SC-A1, C132, D12]

## Open questions (informative)
- A host that relies on a stapled allowance status may accept a visit for up to 1 hour after a revocation (§5.2, D12). A stapled signed head of an introducer's vouch log, with the same 1-hour lifetime, is proposed (see the round-3 findings).
