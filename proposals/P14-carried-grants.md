# P14. Carried grants: your representative shows what you've already approved

*Section numbers in this proposal are those of the draft it was written against; SPEC Appendix D maps them to v0.3.0.*

*This is a proposal, not a SPEC change. Drafted 2026-10-26, 2:30 AM PT, from the editor's idea. SPEC.md (v0.2.7) is untouched. It builds on §2.5 (proof levels), §2.6a (the allowance and its digest-based disclosure), §4.8 (relationship) and P9 (attestations). Examples use fictional names only: Kiran Vale, Harborlight Bank, Sparrowcount (app), Wickferry (linking service), Corsavel, Maison Ardoise.*

## 1. The idea, in plain words
Kiran already approved some things in the past:
- months ago, at Harborlight Bank's own page, she let Sparrowcount read her balances and transactions through Wickferry;
- she's a member of Corsavel's loyalty program;
- she set a spending limit for her representative.

Today none of that travels with her agent. When her representative arrives at Harborlight, the bank sees "Sparrowcount via Wickferry" and can't tell that *this representative* is the one using that link.

**P14 lets the card's owner list what she has already approved: "carried grants".** At a visit, the representative shows only the ones that matter to that place. The place's representative then knows, in context, what's already authorized: "You're Kiran's representative, and you're the one behind her Wickferry link. Welcome back."

**The one rule:** a carried grant is a signed *reference* to an approval that lives elsewhere. It is never the approval itself. The card never carries an access token, a password, a card number, an API key or a Plaid `access_token`. The real access keeps flowing over its own rails (Plaid, OAuth, FDX, MCP, a card network). Shōkai only says "this representative is the one using it, for this reason, within these limits".

**Account-linking APIs aren't MCP, and that's fine.** Shōkai doesn't care what transport the underlying access uses. The reference rides in the introduction. The data or payment keeps moving over Plaid, an FDX API, an MCP server, Stripe or a card network, exactly as it does today.

## 2. What a carried grant can and can't do
- **It adds context, not permission.** A seat still can't exceed the place's policy ∩ mandate ∩ request (§4.3). A carried grant never widens it.
- **It can satisfy a place's requirement.** A place may say "I'll go past public pages only for a representative that is linked to an existing customer consent". That's a new typed condition, `require_grant` (§6).
- **It doesn't replace the allowance.** Spending limits stay in the allowance and mandate (§2.6a). A carried *payment* grant (an AP2 mandate, an agentic card token) is a reference to limits held by the payment rail. The effective limit is the lowest of all of them.
- **It is never a gate input as prose.** Only structured, verified status fields enter the decision (§4.6, §4.7).

## 3. How it works (five steps)
1. **Kiran lists her approvals once.** During setup, her representative (or the card studio) gathers the approvals she already has. She picks which to carry and signs a `GrantManifest` with her passkey. That's the same single signature moment as the card or allowance, and it's valid for many visits.
2. **The manifest shows nothing on its own.** Like the allowance, it carries only salted digests of each grant. A place that sees the manifest learns neither how many grants are real nor what they are. (Decoy digests are allowed, so the count leaks nothing.)
3. **At a visit, the representative presents only what's relevant.** At Harborlight it shows the Wickferry link to Harborlight. At Corsavel it shows the Corsavel membership. Never the other way round, unless Kiran's disclosure policy says so.
4. **The place verifies it the strongest way available** (§4):
   - against its own records (the bank issued that consent; the store issued that membership);
   - or with a signed attestation from the provider;
   - or by asking the provider's own representative.
   
   The place never receives the token.
5. **The place remembers the link, with Kiran's consent.** Its relationship record (§4.8) notes "representative R of Kiran is linked to consent C". The report home tells Kiran which grants were shown and whether they were confirmed.

## 4. Trust levels (they map to §2.5's proof levels)
| Level | Who signed | Can it unlock anything? | Example |
|---|---|---|---|
| `owner_asserted` (= `self_declared`) | Only Kiran's passkey | **No.** Context only | "I have a Wickferry link to Harborlight" |
| `provider_attested` (= `evidenced` / `vouched`) | The provider signs a short-lived `GrantAttestation` (DID resolved via did:web on the provider's domain) | Yes, if the place trusts that provider | Wickferry attests: "pairwise handle H, read balances and transactions, active until 2027-04-01" |
| `place_confirmed` (= `verified`) | The place checked its own records | Yes | Harborlight finds consent C for Kiran, app Sparrowcount via Wickferry, still active. Corsavel finds membership M |

The bank case is the strongest case. **The bank is the data holder: it issued the consent itself.** So it can confirm the grant from its own consent records without asking anyone. That answers the exact question it can't answer today: which agent is using this link.

## 5. Selective disclosure: "know me within your context"
- **The manifest lists digests only.** Each grant has a ≥128-bit salt, as in §2.6a. Unpresented grants stay unguessable.
- **Each grant names the place(s) it concerns** (`relevant_to`: principal DIDs or place categories). A representative MUST NOT present a grant to a place outside `relevant_to` unless the owner's disclosure policy names that place.
- **Pairwise handles.** A grant's `handle` is per place and opaque. It's derived by the provider or the owner's agent, never the raw Plaid `item_id`, Stripe `fca_…` id or OAuth `grant_id`. Two places that compare notes can't join on it.
- **Places declare what they accept.** A `PlaceListing` / `LobbyBriefing` lists `accepts_grants: [{kind, providers?, purposes}]`. A representative presents nothing the place didn't declare for the visit's purpose.
- **No fishing.** A place that asks for grants it didn't declare for the purpose, or for "all your grants", gets a privacy decline. That's logged as a light flag in the report (§9 `privacy_declines`), and the representative tells Kiran.
- **Stapled rather than phoned home.** Where possible, the representative staples a fresh provider attestation, so the place doesn't have to call the provider, and the provider doesn't learn where Kiran's representative goes. Out-of-band checks are for when the place needs them.

## 6. Wire shape sketch (shokai/0.3 style; wire prefix as renamed in v0.3)
```ts
/** One carried grant. Held by the representative; only its digest is in the manifest. */
type CarriedGrant = {
  grant_ref_id: string;
  salt: string;                          // ≥128 bits, base64url (as AllowanceGrant)
  kind: "account_link" | "oauth_grant" | "payment_mandate" | "agentic_token" | "membership" | "subscription_consent";
  provider: string;                      // DID of who holds the real grant, e.g. did:web:wickferry.example
  counterparty: string;                  // DID of the place it concerns, e.g. did:web:harborlight.example
  relevant_to: (string | PlaceCategory)[];
  scope: { codes: string[];              // Shōkai-normalized, e.g. "data.read.balances", "data.read.transactions"
           native?: string[] };          // provider's own scope names, informative
  handle: string;                        // opaque, pairwise per place; NEVER a token, secret or raw provider id
  issued_at: Timestamp; expires_at: Timestamp;
  status_url?: string;                   // provider or owner status (fail closed for anything that unlocks)
  limits?: Limits;                       // only for payment kinds: a copy of the rail's limits, informative
  shown_to_owner: { text: string; locale: Locale };
};

/** Signed once by the owner's passkey (Appendix A.4), like an Allowance. */
type GrantManifest = {
  manifest_id: string; owner_id: string; representative_id: string; card_id: string;
  grant_digests: Digest[];               // digest(JCS(CarriedGrant)), plus optional decoys
  valid_from: Timestamp; expires_at: Timestamp;
  revocation_status: string;             // owner-published status, lifetime ≤ 1 h (as D12)
  shown_to_owner: { text: string; locale: Locale };
};

/** Optional: the provider vouches that the handle is live. Short-lived; stapled by the representative. */
type GrantAttestation = {
  provider: string; counterparty: string; handle: string;
  subject: { owner_id: string; representative_id: string };   // bound to THIS owner and representative
  scope_codes: string[]; status: "active" | "revoked";
  issued_at: Timestamp; next_update: Timestamp;                // lifetime ≤ 1 h
};

/** What travels in introduction / invitation_request, after the card and the place's proof verified. */
type GrantPresentation = {
  manifest: Signed<GrantManifest>;
  grants: CarriedGrant[];                // only those relevant to this place and purpose
  attestations?: Signed<GrantAttestation>[];
  binding: Signature;                    // representative key over digest(JCS({encounter_id, nonce, grant_digests_shown}))
};

/** New typed condition (alongside require_vouch, require_mandate, P9's require_attestation). */
type RequireGrant = { kind: "require_grant"; grant_kinds: string[]; scope_codes?: string[]; min_level: "provider_attested" | "place_confirmed" };
```

**Example: Harborlight, "With Shōkai"**
1. Kiran's representative presents its card, plus one grant: `{kind: "account_link", provider: did:web:wickferry.example, counterparty: did:web:harborlight.example, scope.codes: ["data.read.balances", "data.read.transactions"], handle: "h_7Qx…", expires_at: "2027-04-01T00:00:00Z"}`.
2. Harborlight looks the handle up in its own consent records (assuming Wickferry adopts P14 and gave the bank the pairwise handle when the link was created; without that, the handle can be a reference the bank itself gave Kiran for that linked app, which the bank matches in its own records; open question 6). It finds Kiran's consent "Sparrowcount via Wickferry", active. Level: `place_confirmed`.
3. The bank's representative now knows "this is the representative behind Kiran's existing link". It seats the balance check, and the $900 transfer still goes home (the allowance has no such spend).
4. Report home: "Showed Harborlight your Wickferry link (confirmed by the bank). Showed nothing else."

## 7. How it fits existing linkage (without replacing any of it)
| Existing approval | What the carried grant references | Who can confirm it | Notes |
|---|---|---|---|
| **Plaid Item** (an app's link to a person's bank accounts, made through Plaid) | A pairwise handle for the Item, never Plaid's `access_token` or `item_id` | The institution that holds the accounts (with OAuth-based connections, the person approves access at the institution itself); or the linking service, if it adopts P14 attestations | Plaid's two MCP servers are a Dashboard server for diagnostics and analytics and a local developer toolkit; neither carries end-user account data, so this rides alongside Plaid Link, not MCP |
| **Stripe Financial Connections** account | Handle for the `fca_…` account and its permissions (`balances`, `transactions`, `ownership`, `payment_method`) | The institution that holds the account; or the linking service, if it adopts P14 attestations | Same pattern |
| **OAuth grant** in general (including OAuth-protected MCP servers run by banks or stores) | Handle for the grant, plus scopes and expiry | The authorization server, which already knows its grants. The OpenID FAPI working group's "Grant Management for OAuth 2.0" draft defines a `grant_id` for exactly this | Token exchange `act` (RFC 8693) can carry "R acting for Kiran" on the token side; the carried grant is the introduction side |
| **AP2 mandate** | Digest of the user-signed open Checkout or Payment Mandate (AP2 v0.2) | Any verifier that trusts the signing key: AP2 mandates are signed SD-JWTs | Already verifiable. P14 only links it to the representative |
| **Stripe Shared Payment Token** | The fact that an SPT exists for this seller with these `usage_limits`, not the SPT | Stripe and the seller | The SPT itself is still issued at checkout over ACP/Stripe |
| **Card-network agent programs** (for example Visa's Trusted Agent Protocol or Amex's Agentic Commerce Experiences) | The agent's registered key id and the existence of a network-issued agentic credential with its limits | The network and the issuer | Lets a merchant tie network-signed requests to the Shōkai representative. Payment limits stay the network's |
| **Loyalty or membership** | Member handle (pairwise) | The place itself (it issued it) | The simplest case: `place_confirmed` for free |
| **Marketing consent** (Maison Ardoise's signed "yes, monthly") | Digest of the owner's passkey consent | The brand (it holds the signed yes) | Lets the brand know which representative it may write through |

## 8. Revocation
There are three switches, and any one of them turns the grant off:
1. **Kiran revokes the reference.** She publishes it at `revocation_status`; places fetch it or accept a ≤1 h stapled status (as D12). Revoking the manifest drops every grant at once.
2. **The provider revokes the underlying approval.** Its attestation status flips to `revoked`, or attestations stop being issued.
3. **The place's own records say it's gone.** For example, Kiran unlinked Sparrowcount at the bank.

Failure modes:
- **Fail closed** for anything the grant would unlock: unreachable or stale means absent.
- **Fail soft** for context only: an `owner_asserted` grant can still be mentioned to Kiran's representative as "you said you have…", but it carries no weight.

## 9. Threat model
| # | Attack | What stops it |
|---|---|---|
| G1 | **Copied card or presentation** replayed by another agent | Possession proof (§2.4). `GrantPresentation.binding` signs this encounter's nonce. Attestations bind `representative_id`. A replay gets `never` and binds the replayer only (§2.4) |
| G2 | **Stale grant** (unlinked last week, still on the card) | `expires_at`, an owner status of ≤1 h, a provider attestation of ≤1 h, and the place's own records win. Fail closed |
| G3 | **Overclaiming** ("I can move money" on a read-only link; a fake membership) | `owner_asserted` unlocks nothing. Scope codes are checked against the provider's or place's record, and a mismatch makes the grant absent. A grant the place *proves* false is a misconduct finding (`grant_misrepresentation`, serious; open question 4) |
| G4 | **Laundering** another person's grant | Attestations bind `owner_id` and `representative_id`. `place_confirmed` checks that the handle belongs to this customer in the place's own records |
| G5 | **Correlation across visits or places** | Pairwise handles, salted digests, decoys, only relevant grants, no global grant id. Stapling avoids telling the provider where the representative went. Places may still keep their own relationship record, with consent (§4.8) |
| G6 | **Phishing place** asks for "all your grants" or for ones it doesn't need | The place proves itself first (the fake "corsavel-0utlet" fails before any grant is shown). Places must declare `accepts_grants` per purpose. Undeclared asks get a privacy decline and a light flag, and the report home warns Kiran |
| G7 | **Fake provider** attestation (lookalike domain) | The provider DID is resolved via did:web on its domain, and the place keeps its own trusted-providers list. Display names are self-asserted (P11) |
| G8 | **Compromised representative key** | The representative can't mint grants (owner-signed manifest). Kiran revokes the card and manifest. Attestations bound to the old key die with it |
| G9 | **Downgrade:** the representative omits a revocation it knows about | The place fetches status itself where it can. A fetched `revoked` beats a stapled `active` (as v0.2.5 for allowances) |
| G10 | **Provider learns too much** from verification calls | Prefer place-local confirmation, then stapled attestations. Out-of-band calls are only for when the place needs them. Open question 3 |

**What P14 can't fix:** a provider or place that misuses data it already has; linking services, banks and stores that never offer handles or attestations (then the level stays `owner_asserted` or relies on the place's own records); and a bank that refuses agents entirely.

## 10. Relation to other proposals
- **P9 (attestations):** `GrantAttestation` is a sibling of P9's personhood/identity `attestations` slot. Both are provider-neutral and both are verified by the place.
- **P10 (session spend cap):** payment-kind grants never raise a seat's cap. The cap is min(allowance grant, mandate, rail limits, P10 session default).
- **P11:** names in grants (provider display names) are self-asserted. Only DIDs count.

## 11. Open questions
1. **One signature or two?** Should carried grants live inside the allowance Kiran already signs (one passkey moment), or in a separate manifest (cleaner, and you can change grants without touching limits)? I lean toward separate, signed in the same sitting.
2. **What goes on the first list?** Account links, memberships and marketing consents first, with payment references (AP2, agentic tokens) later? Or payments too, from day one?
3. **Out-of-band checks.** Allow a place to ask the provider directly (the provider then learns the visit), or require stapled attestations and the place's own records only?
4. **Misconduct.** Add `grant_misrepresentation` (serious), or fold it into `purpose_misrepresentation`?
5. **Showing grants across places.** Ever allowed ("show my Corsavel membership to Maison Ardoise")? Or never in v0.3?
6. **Who issues pairwise handles?** The provider (best, but needs their adoption), or Kiran's agent deriving them (works today, but the place can only confirm against its own records)?
