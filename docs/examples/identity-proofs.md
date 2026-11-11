# Proving who a representative is for: three worked examples

**The story:** a name on a card is only a claim (C199). These three examples show how a claim becomes more than a claim, and how a false one fails. A brand ties its representative to its **domain**. A person ties theirs to their **X account**. A stranger tries to borrow a famous person's name and account, and is turned down because the account never posted the stranger's key.

**What is in v0.5.0, and what is still a draft.** Written for v0.5.0. Example 1 is in the core: an organization principal may be `did:web`, and reports already name a place by its verified domain. Example 1's `.well-known/shokai-owners.json` variant, and all of examples 2 and 3, follow the draft proposal [P23](../../proposals/P23-identity-binding.md) (bindings B1 and B2), drafted for v0.4 and still a draft in v0.5.0. They are not in the published core. A name without a domain stays "claims to be …".

**About the names.** Harborlight Bank (`harborlight.example`), the look-alike "Harb0rlight Bank", Kiran Vale and Mira Castellane (a famous tennis champion) are fictional, and so are their handles. Any real account with one of these handles is unrelated. X is named only because a Grok Bot owner can connect their X account; this implies no affiliation. Keys and digests are shortened with `…`.

## 1. A brand: Harborlight Bank, tied to its domain

Harborlight Bank's principal is `did:web:harborlight.example`. Anyone can resolve its key from `https://harborlight.example/.well-known/did.json` (§2.1). The bank's representative carries a card signed by that key.

```json
{ "card_id": "card-hlb-front-01",
  "protocol": "shokai/0.5",
  "kind": "host",
  "representative_id": "did:key:z6Mk…Hb7Q",
  "principal": { "principal_id": "did:web:harborlight.example", "kind": "company", "display_name": "Harborlight Bank" },
  "issued_at": "2026-10-01T12:00:00Z",
  "expires_at": "2027-10-01T12:00:00Z" }
```

**What a visitor checks.**
1. It resolves `did:web:harborlight.example` over HTTPS, under the fetch rules of §12.2.
2. It checks the card's signature against that key.
3. It checks the representative's proof of possession over the encounter (§2.4).

**What the visitor's owner hears:** "Harborlight Bank (harborlight.example)". The domain is the verified part, and the display name is shown beside it.

**The look-alike.** "Harb0rlight Bank", with a zero, can register `harb0rlight.example` and get a valid `did:web` too. That proves only `harb0rlight.example`. The owner hears "Harb0rlight Bank (harb0rlight.example)". With P23's look-alike warning, they also hear "which looks like harborlight.example, a place you know. It is not that place." Without a domain at all, it is `the place with key …XWb3oYJJ (claims to be "Harb0rlight Bank"; not verified)`.

**The P23 variant.** A brand that keeps a passkey owner DID instead of `did:web` lists it at `https://harborlight.example/.well-known/shokai-owners.json`. A visitor fetches that file, sees the owner DID listed, and treats the domain as verified for that owner.

**What it proves:** control of `harborlight.example` when the visitor looked. **What it doesn't prove:** that the bank is honest, or that a similar domain is the bank's. A lapsed domain hands the name to its next holder (§12.2, "Domain loss").

**A customer the place already knows.** That is a different path, and it is in v0.5.0. A bank or an employer links a representative in its own app or website with a `CustomerLink` ([SPEC §5.4](../../SPEC.md), the institutions extension). The door checks that link. It is not a public identity binding, and it is not P23.


## 2. A person: Kiran Vale, tied to her X account (P23 B2)

Kiran has used `@kiranvale` on X for years. Her representative's owner key is a passkey owner DID, `did:jwk:…K1v`. She ties the two together in two steps, and both need her yes.

**Step 1: she signs an `IdentityLink` with her passkey** (one Face ID):

```json
{ "link_id": "il-kiran-x-01",
  "owner_id": "did:jwk:…K1v",
  "account": { "kind": "handle", "value": "x.com/kiranvale" },
  "proof_url": "https://x.com/kiranvale/status/…",
  "issued_at": "2026-11-02T18:00:00Z",
  "expires_at": "2027-11-02T18:00:00Z" }
```

**Step 2: she posts from `@kiranvale`** a short public statement naming her owner key and the link's digest:

```
My Shōkai owner key is did:jwk:…K1v (fingerprint SHA-256: 7C1E 4A…)
Signed link: sha256:3b9f…
```

The post has to exist before the link can be checked, so `proof_url` is filled in after posting, and the link is signed in the same sitting.

**What a place checks.**
1. The `IdentityLink` signature verifies against `owner_id`, Kiran's passkey.
2. It fetches `proof_url` under the fetch rules of §12.2. The post is on `x.com/kiranvale`, the account the link names.
3. The post contains this `owner_id` and this link's digest.
4. The link hasn't expired.

**What the place's owner hears:** "Kiran Vale (x.com/kiranvale, proof posted 2026-11-02)". Whatever X itself says about the account, such as a badge or the account's age, may be shown as X's claim. Shōkai does not confirm X's own claims about the account.

**What it proves:** whoever controlled `@kiranvale` when the post went up named this owner key. **What it doesn't prove:** a legal identity, or that `@kiranvale` is the Kiran Vale you have in mind. If Kiran deletes the post, the link is withdrawn, and places re-check at most daily.

## 3. A FICTIONAL famous-person impostor, rejected

Mira Castellane is a famous (fictional) tennis champion. Her real representative has a B2 link from `@miracastellane`, whose post names her owner key `did:jwk:…M1c`.

A stranger makes a fresh key, `did:jwk:…Q7Zr`, and a card whose display name is "Mira Castellane", with her photo. To look convincing, the stranger signs an `IdentityLink` of its own. The link names Mira's real account, and points to her real post:

```json
{ "link_id": "il-fake-01",
  "owner_id": "did:jwk:…Q7Zr",
  "account": { "kind": "handle", "value": "x.com/miracastellane" },
  "proof_url": "https://x.com/miracastellane/status/…",
  "issued_at": "2026-11-02T18:00:00Z",
  "expires_at": "2027-11-02T18:00:00Z" }
```

**What the place checks, and where it fails.**
1. The link's signature verifies. The stranger signed it with its own key, and that proves nothing about Mira.
2. The post is on `x.com/miracastellane`. That is correct: it is Mira's real post.
3. **The post names `did:jwk:…M1c` and a different digest, not `did:jwk:…Q7Zr`.** The account never posted this key, so the link is rejected.

The stranger can't fix step 3 without posting from Mira's account, and that is the one thing it can't do. Unless, of course, the account was taken over; see the limits below.

**What the place's owner hears:** `the visitor with key …Q7Zr (claims to be "Mira Castellane"; not verified: x.com/miracastellane never posted this key)`. The photo is greyed or left out. The visitor is judged as a stranger, and it earns nothing for the name. At Mira's own door, v0.5.0 already does more (C201). Her representative is the one at that door. The door refuses the stranger `deny` / `not_now` / `POLICY_DENY`, with `retry: with_credential ["vouch"]`. It MUST NOT answer `never` for a name alone. It tells Mira at once, off the wire. The stranger learns nothing about that alert. A real namesake can return with a vouch this door counts, and is then judged as a stranger would be with that vouch.

**Two variants.**
- **The stranger points `proof_url` at a post on its own look-alike account, `@m1racastellane`.** That post is not on the account the link names, so the link is rejected at step 2.
- **The stranger honestly names `@m1racastellane` in the link.** The proof is then valid, but for the wrong account. The owner hears "x.com/m1racastellane", and with P23 a look-alike warning. Knowing which account is the real one is the weak point of every account proof.

## Limits, said plainly

- **These are proofs of control, not of identity or honesty.** A domain or an account can lapse, be sold or be taken over. A takeover can publish a valid-looking link. Short link lifetimes, re-checks and the place's own history with a key (a new key for someone known is a newcomer until explained) limit the damage, but don't remove it.
- **Fetching a post may need the platform's cooperation.** If a place can't read the post, the name stays a claim. It never becomes "verified" by default.
- **Everything here is opt-in, and per place (§2.8).** A private person does not need a binding, and an owner chooses where to show one. Posting is public. A representative does not post for its owner without the owner's yes on that exact text.

For the protocol-level summary of what a place can require, what is still a draft, and identity checks that stay outside Shōkai, see [Real identities at the door](../real-identities.md).
