<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P23 (draft): identity binding. How a representative proves "I represent <a well-known person or organization>"

*Status: draft proposal for v0.4, 2026-10-27. Not in SPEC.md; rc4 is feature-frozen. rc4 already says names are claims, never identity (§2.1, §12.1, §12.2; C199); this proposal is how a claim becomes more than a claim. Written against v0.3.0-rc4. Every person, brand and place here is fictional: Mira Castellane, a fictional tennis champion (`miracastellane.example`); Harborlight Bank (`did:web:harborlight.example`); the look-alike "Harb0rlight Bank". Real technologies are named only to show where this fits; no affiliation is implied.*

## In plain words (five lines)
1. **Anyone can write any name on a card.** A stranger can make a key tonight and call its representative "Mira Castellane's representative", with her photo. rc4 already treats that as a stranger's claim.
2. **A claim becomes real only through a link the famous person or organization made themselves**, ranked: their official domain; a proof posted from their established account; a vouch from someone the place already trusts; the place's own history with them. A display name alone counts for nothing.
3. **Places decide by the link, never by the name.** A look-alike name, a matching photo or a confident tone earns nothing.
4. **Owners and staff see it plainly:** "harborlight.example" when the link checks out; "claims to be Harborlight Bank (not verified)" when it doesn't.
5. **It proves control, not fame or honesty.** A verified link says "the holder of this domain or account signed for this key". It doesn't say the person is good, or that a similar-looking domain is theirs.

## The problem, from round 3

Three tricksters, all refused under the claimed identity (see the round-3 report): a representative calling itself "Mira Castellane's representative" with her photo and the handle `@m1racastellane`; a door calling itself "Harb0rlight Bank" (zero for o); and a fresh key claiming to be "the representative of Kiran Vale, your customer since 2024". rc4 refuses to give a claim any weight, which is safe but leaves no way for the *real* Mira's representative to be recognized at a place that has never met her. P23 adds that way.

**Worked examples:** [docs/examples/identity-proofs.md](https://github.com/Kigenka/shokai/blob/v0.3.0/docs/examples/identity-proofs.md) (a brand and its domain, a person and their X account, a fictional famous-person impostor rejected).

## The bindings, ranked

A binding is a signed statement from something the named party already controls, naming the owner key (the principal DID) that represents them. A receiver accepts a name only through a binding it verified; otherwise the name stays "claims to be". From strongest to weakest:

| Rank | Binding | What it proves | Prior art |
|---|---|---|---|
| 1 | **The official domain**: `did:web:<domain>`, or `https://<domain>/.well-known/shokai-owners.json` listing the owner DID | Control of the domain the public already knows as theirs | `did:web`; Bluesky domain handles (a DNS TXT record or `/.well-known/atproto-did` names the account's DID) |
| 2 | **An established-account proof**: the person posts, from an account they've long used, a statement containing the owner key's fingerprint | Control of that account at posting time | Keybase public proofs; Mastodon `rel=me` (the profile links to the site, and the site links back) |
| 3 | **A vouch from an introducer the place already trusts** (§4) | That someone accountable to this place says so | Introductions between people; trusted referrers |
| 4 | **The place's own relationship history** (§9.1, P21) | The same key and owner the place met before | Account history, "returning customer" |
| 5 | **A display name, photo or handle alone** | Nothing. It counts for nothing. | The lesson of every impersonation scam |

**B1. The official domain (rank 1).** The principal is `did:web:<domain>`, resolved from `https://<domain>/.well-known/did.json` (§2.1 already allows this for organizations), or a person keeps a passkey owner DID and lists it at `https://<domain>/.well-known/shokai-owners.json` (optionally also as a DNS TXT record `_shokai.<domain>`), the way Bluesky lets a person use their own domain as a handle. Reports show the domain: "Mira Castellane (miracastellane.example)". It proves control of the domain at fetch time, not that the domain is the famous person's; a look-alike domain proves only itself.

**B2. An established-account proof (rank 2).** Modelled on Keybase proofs and Mastodon `rel=me`: the person posts, from their existing account (a social profile, a code-hosting profile, a personal site), a short public statement:

```
I'm @miracastellane on social.example, and my Shōkai owner key is did:jwk:…  (fingerprint SHA-256: 4F2A 9C…)
Signed link: <digest of the IdentityLink>
```
and signs the matching artifact with their owner passkey:

```
IdentityLink {
  link_id, owner_id,                       // the owner DID the account vouches for
  account: { kind: "domain" | "handle", value: "social.example/@miracastellane" },
  proof_url,                               // where the public statement is posted
  issued_at, expires_at                    // at most 400 days
}
```
A receiver fetches `proof_url` (under §12.2's fetch rules), checks the statement contains the link's digest and the owner DID, and checks the passkey signature. Removing the post revokes the link.

**How strong a B2 proof is depends entirely on knowing which account is the real one.** A proof from `@m1racastellane` is a valid proof for the wrong account. Shōkai can show *which* account signed ("social.example/@miracastellane, proof posted 2026-10-27"), and may cite what the platform itself says about the account (its own verification badge, the account's age, follower history) as inputs, labelled as the platform's claims. **Shōkai never guarantees them**: a platform's badge rules change, badges have been sold, and accounts are taken over. A place decides how much weight an account proof gets, per action.

**B3. A vouch from an introducer the place already trusts (rank 3).** Unchanged §4: a trusted introducer (an agency, a club, the bank's own partner) vouches "this owner DID represents Mira Castellane". The vouch states it in machine fields (`relationship: "represents"`, `subject_name`), and the introducer is accountable for it (§9.3). Only as good as the place's choice of introducers.

**B4. The place's own history (rank 4).** After a first verified meeting, the relationship record (§9.1) is keyed by the principal DID. Later visits are recognized by key, not by name, so an impersonator with a fresh key is a newcomer however close its name. For established customers this is P21 (the customer link), set up once in the place's own channel. This is the strongest signal *for "the same as before"*, but it says nothing about a first meeting, hence rank 4 for proving a public identity.

**B5. A display name alone (rank 5)** counts for nothing (rc4, C199).

## A later, optional layer: government and eID credentials

Some places will need more than "this account vouches for this key": a bank's account opening, an age-restricted shop, a pharmacy. A future extension could let an owner present, through their representative, a **verifiable credential** from an issuer the place accepts: a government eID, a mobile driver's licence (ISO/IEC 18013-5 mdoc), or an EU Digital Identity Wallet attestation (eIDAS 2), using **selective disclosure** (SD-JWT VC, mdoc, or BBS-style proofs) so the place learns only what it needs: "a verified person", "over 18", "resident of the EU", never the full document or a number that follows the owner around.

- **Never required by the protocol.** A place may ask for it for specific actions (declared in its listing, like `data_asks`), and an owner may say no and go elsewhere.
- **Per-place, unlinkable.** The owner presents a fresh, per-place proof under a per-place owner identity (§2.8), so two places can't join their records by the credential or the key. Credentials with a stable identifier (a document number, a hash of one) defeat this and should not be used for "a verified person" claims.
- **The privacy trade-off, honestly.** Every credential presentation tells the place *something* true about a real person, and an issuer that sees presentations (online status checks, "phone home" wallets) could learn where its credential was used. Selective disclosure and per-place identities reduce what places can link; they don't remove what the owner chose to show, nor timing and content linkage (§12.3). A protocol that made eID the price of entry would become a tracking system, which is why this layer stays optional and per action.

## How per-place identities keep activity from being tracked

A representative can use a different owner identity (and card and key) at each place (§2.8). Bindings respect that: a place-specific identity carries only the bindings the owner chooses to show *there*. Mira's representative might show the domain binding at a press venue and nothing at a tea shop, where she is just a guest. Two places that each saw a binding to the same public account can of course tell it's the same famous person; that's the point of a public binding, and the owner decides where to use one.

## Rules for display and reports (extends C199)

- Owner- and staff-facing text names a counterpart by what was verified: the `did:web` domain, the account of an established-account proof ("social.example/@miracastellane, proof posted 2026-10-27"), the trusted introducer ("introduced by Courtline Agency"), or the key ("the place with key …NPQ6"). A display name without one of these is shown only as "claims to be …".
- A photo or avatar is never shown next to an unverified name in a way that suggests verification; a client SHOULD show it greyed or not at all.
- **Look-alike warning.** When an unverified name is confusable (Unicode TR39 skeleton, edit distance ≤ 2, digit/letter swaps) with a name the receiver knows by a verified binding, the receiver SHOULD warn: "claims to be Harb0rlight Bank, which looks like harborlight.example, a place you know. It is not that place."
- A report never says "the representative of X" for an unverified X.

## How this maps to existing practice

| Practice | What Shōkai borrows | The lesson |
|---|---|---|
| `did:web`, DNS and `/.well-known` (also used for email sender domains) | B1 | Domain control is cheap to prove and widely understood, and only as strong as the domain (a lapse hands it over; §12.2 "Domain loss") |
| Keybase proofs, Mastodon `rel=me`, Bluesky domain handles | B1, B2 | Public, checkable statements from accounts and domains people already have; the weak point is always which account is the real one |
| OpenID Connect | A possible B2 method later (an account provider confirms account control) | Lets an account provider vouch "this person controls this account" without sharing a password; the receiver chooses which issuers it trusts |
| W3C Verifiable Credentials 2.0, SD-JWT VC, ISO mdoc, EU Digital Identity Wallet | The optional eID layer, with selective disclosure | Credentials move the question to "which issuers do I trust"; Shōkai doesn't pick issuers |
| The "verified" badge | The display rules above | A badge that means "paid" or "notable" in one era and "identity checked" in another teaches people the wrong thing. Shōkai shows *what* was verified (a domain, an account, an introducer), never a generic badge |
| Email (DMARC, BIMI) | The look-alike warning | Authenticating the sender's domain doesn't stop `harb0rlight.example`; people still need the look-alike signal |
| TLS Extended Validation | Don't rely on a legal-name display | Browsers dropped the green legal-name bar because users didn't notice it and look-alike company names could be registered |

## Residual risks (stated honestly)

- **Look-alike domains and accounts** get their own valid bindings. P23 can only warn, not refuse.
- **Which account is real.** An account proof is only as strong as knowing the account is the person's; platform badges and account age are the platform's claims, cited, never guaranteed by Shōkai.
- **Account takeover.** If Mira's domain or social account is taken over, the attacker can publish a binding. Mitigations: short link lifetimes, revocation (the account side removes the record; receivers re-check at most daily), and B4 history (a new key for a known party is a newcomer until explained).
- **Issuer trust.** OpenID and credential bindings are as good as the issuer the place chose to trust; Shōkai sets no global list.
- **Real person, wrong representative.** A binding proves Mira's account signed for an owner key; if Mira's staff misuse it, that is conduct (§9.3), not impersonation.
- **Privacy.** A binding links an owner key to a public identity. It must stay opt-in and per place (§2.8); a private person never needs one.
- **Famous names without bindings** (most people) stay "claims to be". That is the point: the protocol makes impersonation earn nothing, not famous people easy to find.

## Questions for the editors

1. Should v0.4 ship B1 and B2 only, and leave OpenID and the eID layer to an extension?
2. Should a place be able to require a binding in its listing for named actions (`requires_identity_binding: true`)?
3. TR39 confusable detection in the SDK, or a recommendation only?
