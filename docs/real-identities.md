# Real identities at the door

This is the protocol-level companion to the homepage explainer. It says what 0.5 already specifies, what is still a draft, and what stays outside Shōkai. It does not invent a new wire field or a new kind of Shōkai card.

Harborlight Bank and Kiran Vale, used below, are fictional.

## What a Shōkai card must never carry

A Shōkai card works like a meishi, a business card, not a wallet or an identity document.

- It MUST NOT carry a payment card number, payment token, account number, password, one-time code, session cookie or token ([SPEC §5.4](./SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6) C210). A mandate authorizes an amount; it carries nothing to pay with ([§5.1](./SPEC-DETAIL.md#51-mandate) C211).
- A representative MUST NOT put a private key, or anything that derives one, in a message, a prompt, a report or a log ([§12.1](./SPEC-DETAIL.md#121-normative-security-requirements)). The owner's passkey stays with the owner and is used on the signing page; it is not pasted into chat and not placed on an agent server.
- In v0.5.0 the door scans every message a visitor sends for anything that looks like a payment card number, refuses a match, and MUST NOT store, log or echo it ([§5.4](./SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6) C235).

The same bans apply to a mandate and to an act. A Shōkai card, mandate or act that carries a forbidden credential is invalid or refused.

## What 0.5 already lets a place check

The name shown on a Shōkai card is a claim, never identity ([§2.1](./SPEC-DETAIL.md#21-keys-identifiers-and-key-resolution-d3) C199). A look-alike name, photo or handle grants nothing. Decisions, records and reports use the verified identifier (the principal DID), and owner-facing text shows an unverified name only as a claim.

A WebAuthn passkey signature proves that credential signed the data. It does not prove who the person is in law, their legal capacity, or their authority over an account ([SECURITY.md](../SECURITY.md), [SIGNING.md](../SIGNING.md)).

What a place can already require, as signed facts the door can check:

- **A company's real domain.** An organization principal SHOULD be a `did:web` on a domain it controls ([§2.1](./SPEC-DETAIL.md#21-keys-identifiers-and-key-resolution-d3)). The worked example is Harborlight Bank at `harborlight.example` in [Identity proofs](./examples/identity-proofs.md).
- **A customer link**, for a bank or other institution that already knows the owner. Actions marked `requires_customer_link` are served only under a `CustomerLink` the place made with its customer in its own app or website, signed by both ([§5.4](./SPEC-DETAIL.md#54-institutions-the-existing-customer-check-and-the-credential-rule-v040-k6), extension `ext-institutions`). The agent never holds the owner's password or session.
- **An introduction** from someone the place already trusts ([§4](./SPEC-DETAIL.md#4-introduce-introductions-vouching-and-introducer-accountability)).
- **Trust requirements** a place lists for some actions: paths of kinds `introduction`, `place_invitation`, `customer_link`, `spending_mandate`, `history` or `receipt` ([§6.9](./SPEC-DETAIL.md#69-trust-requirements-and-trustreceipt-v050-from-p27)). There is no path kind for a government identity document or a social-profile URL.

A place may also declare what it will ask the owner for (`data_asks`, [§3.1](./SPEC-DETAIL.md#31-the-door-sc-l0)). That is declared data, not an identity-verification protocol.

## A post from a real social profile (still a draft)

Proposal [P23](../proposals/P23-identity-binding.md) describes binding a person to an established account: the owner posts, from their real profile, a statement that names their owner key, and signs an `IdentityLink` that names the account and a `proof_url`. A place that can fetch that post can treat the profile as evidence. It proves the owner controlled that account when the post went up. It is not a legal identity.

That binding, and a listing flag that would require one, are **not in the 0.5 core**. The worked examples (Kiran Vale's X account, and a fictional impostor turned away because the famous account never posted the stranger's key) are in [Identity proofs](./examples/identity-proofs.md). Examples 2 and 3 on that page say they follow P23 and are not in the published core.

## Outside the protocol: government ID verification

A driver's license, passport or face photograph does not go on a Shōkai card. 0.5 has no listing field, trust-path kind or SDK hook that asks for one. Proposal [P20](../proposals/P20-representative-continuity.md) puts biometrics, liveness checks, face or voice data and government ID **out of scope** as a Sybil defense in this protocol: a place that needs legal identity uses its own process outside Shōkai. P23 sketches a later, optional eID layer (for example a mobile driver's license with selective disclosure); that layer is not on the 0.5 wire, and the protocol would never require it.

The intended pattern — not a specified 0.5 feature — is that the place sends the visitor's owner to a proper identity-verification service. The document and selfie stay with that service. Only a signed result or reference should reach the door. For example, Harborlight Bank's leaflet would ask Kiran Vale, not her representative, to finish an identity check with the bank's chosen provider before her agent is admitted for that action.

Services that offer document-plus-selfie or liveness checks include, as examples only:

- [Stripe Identity](https://stripe.com/identity)
- [Persona](https://withpersona.com/product/verifications/government-id/)
- [Onfido (now Entrust IDV)](https://www.entrust.com/products/identity-verification)
- [Jumio](https://www.jumio.com/products/identity-verification/)
- [Veriff](https://www.veriff.com/product/identity-verification)
- [ID.me Identity Proofing](https://www.id.me/platform/identity-proofing)
- [CLEAR1](https://identity.clearme.com/product/use-cases/identity-verification)

Shōkai has no integration with any of these services, endorses none of them, and nothing has been built or tested with them. They are named so a builder can see what “a proper verification service” means today. Complementary protocols that deal with issuer-backed identity, including KYA-OS and x401, are described in [Relationship to other protocols](./relationship-to-other-protocols.md); nothing has been built or tested with those either.

The host side of a place is under the place owner's control: they sign the host Shōkai card and the door's rules. Stronger checks on *visitors* are checks their owners complete, then present as signed facts the door can verify.
