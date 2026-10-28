<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai extension: W3C VC mapping

**Status: experimental** (specified, with little or no implementation; may change or be removed in a later version). *Extension `vc-mapping`, version 0.3.0, tied to the core [SPEC.md](../SPEC.md) v0.3.0 (wire `shokai/0.3`). Normative for implementations that claim this extension. Section references without a document name are to the core.*

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](../LICENSE). Patent commitment (draft): [PATENTS.md](../PATENTS.md). Names and logo: [TRADEMARKS.md](../TRADEMARKS.md).*

**Conformance level: W3C VC mapping.** An implementation conforms to this extension when it conforms to the core and meets every requirement below for the roles it plays (issuer that chooses VC form, verifier). An implementation that doesn't support it never uses the messages, members or actions below, and the core is complete without it. An artifact in VC form shows it by its `@context` and `type`.

**Requires:** the core. Tests: see `conformance/homes.json` (home `vc-mapping`).

## Mapping to W3C Verifiable Credentials 2.0 (normative for issuers that choose VC form) [D3]

Our wire shapes stay primary (D3/P1). A party MAY additionally express cards, mandates, vouches, revocations and consents as **W3C Verifiable Credentials Data Model v2.0** credentials (a W3C Recommendation since 15 May 2025). When it does, the mapping below applies.

### VC.1 Common
| Shōkai | VC 2.0 |
|---|---|
| `Signed<T>.payload` | `credentialSubject` plus top-level properties below |
| signer (principal or introducer) | `issuer` (DID) |
| `issued_at` / `expires_at` | `validFrom` / `validUntil` |
| Ed25519 signature over JCS | Data Integrity proof, cryptosuite `eddsa-jcs-2022` (Data Integrity EdDSA Cryptosuites v1.0) |
| revocation log entry | `credentialStatus` with `BitstringStatusListEntry`, `statusPurpose: "revocation"` (Bitstring Status List v1.0) |

- `@context` MUST include `https://www.w3.org/ns/credentials/v2` and an Shōkai context that defines the terms below. [SC-R1, C3, D3]
- A VC-form artifact MUST carry the same semantic content as its wire form. A verifier MUST be able to derive the wire digest from it, and MUST treat a mismatch as an invalid signature. [SC-R1, C3, C40, D3]

### VC.2 Types
| Wire shape | VC `type` | `issuer` | `credentialSubject.id` |
|---|---|---|---|
| `RepresentativeCard` | `["VerifiableCredential", "ShokaiRepresentativeCard"]` | principal DID | representative DID |
| `Mandate` | `["VerifiableCredential", "ShokaiMandate"]` | principal DID | representative DID |
| `Vouch` | `["VerifiableCredential", "ShokaiVouch"]` | introducer DID | representative DID (plus `cardDigest`) |
| `OwnerConsent` (D7) | `["VerifiableCredential", "ShokaiOwnerConsent"]` | owner DID (passkey) or the owner binding's platform DID (chat reply) | representative DID |
| `Allowance` (D11) | `["VerifiableCredential", "ShokaiAllowance"]` | owner DID | representative DID (grants disclosed one at a time by digest) |
| `PeerInvitation` (D11) | `["VerifiableCredential", "ShokaiPeerInvitation"]` | inviting owner DID | invited owner DID |
| `VouchRevocation` | a status-list update by the introducer. The log entry MAY also be published as a VC. | introducer DID | the vouch credential id |

- Claims and imprint facets map to `credentialSubject.claims[]` with `proofLevel` and `evidence`. A verifier MUST still compute effective levels (§2.5). Being inside a VC does not raise a claim to `verified`. [SC-S2, C31, D3]

### VC.3 DIDs
- Individuals' representatives use `did:key` (Ed25519, multibase).
- Organizations use `did:web`, with the key in `https://<domain>/.well-known/did.json`.
- Owners use a `did:key` or `did:jwk` for the passkey's P-256 public key. `did:jwk` is the JWK `{kty: "EC", crv: "P-256", x, y}` serialized as JSON and base64url-encoded; its key id is `<did>#0`.

## Owner signatures in VC form (core Appendix A.1)
- In VC form, the same assertion travels in a proof with `type: "ShokaiWebAuthnProof"`.

*Check the status of the referenced W3C documents again before publishing.*

*No executable test covers this mapping yet; a VC round-trip test is planned for the conformance runner.*
