<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P21 (draft): the customer link. A place recognizes its existing customer's representative, with no password on the wire

*Status: draft proposal for v0.4, 2026-10-27. Not in SPEC.md; rc4 is feature-frozen and this changes nothing in it. Written against v0.3.0-rc4; section numbers are rc4's. Examples are fictional: Harborlight Bank (`did:web:harborlight.example`), its owner-customer, and their representative. Real technologies keep their names (D19). Builds on §2.1 owner binding, §2.2 co-signatures, §2.6 revocation, §2.8 per-place owner identity, §3.3 readiness items, §3.6 durable state, §5.1 mandates, §5.2 allowances, §6.8 considering, §7.2 acts, §8.1 consent, §11.3 single-use acts, Appendix A.1 and SIGNING.md, and on proposals P14 (carried grants), P18 (owner key continuity) and P20 (history export).*

## In plain words (five lines)
1. **The owner links once, inside the bank's own app**, where the bank already knows them by its own login. They tap their passkey; the bank writes down "this passkey belongs to our customer". No password, code or account number ever goes to the agent.
2. **The agent carries only what it always carries:** its card, signed by the owner's passkey, and an errand (a mandate) that names the link. Nothing it carries is a secret that opens the account.
3. **The bank checks its own record:** is this the passkey it linked, is the link still on, and is the errand inside what the customer allowed?
4. **Reading a balance** can be covered by a small standing allowance. **Moving money** needs the owner's passkey over the exact amount and payee, ideally on the bank's own signing page, so what the owner sees is what the owner signs.
5. **Either side can unlink at any time.** A stolen agent can, at most, read what it was allowed to read until it is switched off. It can't move money anywhere new.

---

## 1. Problem
rc4 proves who the owner is (an owner DID, §2.1) and what they signed (§5). It has no way to say "this owner DID is your existing customer". The scenario note (`scenarios/places-first.md` (e)) records the gap. Today a bank's choices are bad: ask the agent to log in (the owner's credentials in an agent's context: phishable, replayable, unbounded), or rely on an aggregator token the bank can't tie to a particular representative (P14 §1).

**Decision taken by the editor (YSY, 2026-10-27):** a representative MUST NEVER carry the owner's bank login, password, one-time code, session cookie, access or refresh token, or account number. This proposal is built so that it never needs to.

## 2. Design in one diagram (informative)
```
 Link once (bank's own channel)                    Every visit after (Shōkai door)
 ───────────────────────────────                   ──────────────────────────────────
 owner signs in to Harborlight app (bank auth)      representative ── card (owner passkey) ──▶ gatekeeper
 bank shows CustomerLink offer (scopes, expiry)                    ── mandate {customer_link: link_id} ─▶
 owner taps passkey  ──▶ owner signature over link   gatekeeper: card OK? mandate OK? link in MY records,
 bank countersigns    ──▶ Signed<CustomerLink>                   active, same owner key, actions in scope?
 bank notifies owner on its usual channel            seat = policy ∩ mandate ∩ request ∩ link scope
 cooling-off before money can move                   money act = exactly the terms the owner's passkey signed
```

## 3. The link ceremony (precise)
### 3.1 Where it happens
- A link MUST be created only inside the place's own authenticated channel (its app or website, after its own sign-in and whatever strong customer authentication it already runs). Shōkai does not authenticate the customer; the bank does, by its own means, once. [CL-1]
- A link MUST NOT be created from a code, URL or QR shown by a representative, a counterpart or any third party and typed or scanned into the bank's channel (the device-code phishing pattern). The owner starts it from the bank's own app. A cross-device passkey ceremony, where needed, MUST use WebAuthn hybrid transport (which requires physical proximity), never a pasted code. [CL-2]

### 3.2 The two signing profiles
The link records which relying party the owner's passkey belongs to (§2.1 `owner_binding.rp_id`), and so who renders what the owner signs.

| Profile | Passkey relying party | Who shows the owner what they sign | Use |
|---|---|---|---|
| `place_hosted` (RECOMMENDED for anything that moves money) | The bank's own signing page, e.g. `rp_id: sign.harborlight.example`, run to SIGNING.md | The bank, from its own records (payee names, account masks, amounts) | Transfers, payee-bound acts |
| `owner_page` | The owner's own signing page (their platform's, their own, or another they trust) | The owner's page, from the item's machine fields | Reads; transfers only if the bank's policy allows it |

- Under `place_hosted`, the passkey is created **during the link ceremony**, inside the bank's app, as a per-place owner identity (§2.8: its own credential and its own WebAuthn `user.id`). It can only ever sign at the bank's origin (Appendix A.1, C195), so no other site can phish a signature from it, and the bank, the party that carries the risk, renders every transaction the owner approves. The owner's card for this place is signed on the same page, in the same tap (one tap for several items, A.1 D23: the link and the card). This is the profile a bank's security team will want: in effect FIDO at the bank's own relying party, with transaction confirmation, and the agent as a carrier that can't forge.
- Under `owner_page`, the bank receives the unsigned link in its channel, hands it to the owner's signing page on the same device (a redirect, never a typed code), and checks the returned assertion by Appendix A.1. The bank then trusts that page's display for what it accepts from it (§13 item 17, item 23: which signing pages a place trusts is its policy). A bank MAY accept `owner_page` for reads only.

### 3.3 The object
```ts
/** P21: a place's record that an owner identity belongs to one of its customers. Co-signed (§2.2): signatures[0] by the
 *  place's principal key (did:web), signatures[1] by the owner's passkey (Appendix A.1), both over the same payload digest. */
type CustomerLink = {
  link_id: string;                 // random, ≥128 bits, base64url; pairwise (this owner identity, this place). NOT a secret, NOT an account id
  place: string;                   // the place's principal DID, e.g. did:web:harborlight.example
  owner_id: string;                // owner DID (a per-place identity is RECOMMENDED, §2.8)
  rp_id: string;                   // relying party of the owner's passkey at link time (§2.1)
  signing_profile: "place_hosted" | "owner_page";
  scope: { actions: string[] };    // the most this place will ever serve under this link (listing action names, §3.1)
  place_limits?: Limits;           // the place's own caps for this link, shown to the owner (e.g. transfers ≤ USD 2000/day)
  money_from?: Timestamp;          // cooling-off: no money-moving act before this time (RECOMMENDED ≥ 24 h after issued_at)
  link_nonce: string;              // issued in the place's authenticated session; single use
  issued_at: Timestamp;
  expires_at: Timestamp;           // at most 400 days after issued_at (as OwnerLink, §2.8); a place MAY require shorter
  shown_to_owner: { text: string; locale: Locale };   // what the place showed, inside both signatures
};

/** P21: either side ends a link. Signed by the owner's passkey (the link's owner_id) or by the place's principal key. */
type CustomerLinkRevocation = { link_id: string; place: string; revoked_by: string; revoked_at: Timestamp; reason?: string };
```

### 3.4 Rules
- The place MUST verify the owner's signature on the link (Appendix A.1, with the stated `rp_id`) before it records the link, and MUST bind `link_nonce` to the authenticated session that issued it, single use. This is the proof that the key belongs to whoever is signed in to the account, and it closes account misbinding in both directions: a stranger can't link their key to the customer's account, and the bank can't be tricked into linking the customer's account to a key the customer doesn't hold. [CL-3]
- The place MUST send the customer a notice of the new link over its own existing channels (the app's notifications, its usual email), naming the link's scope, and SHOULD offer a one-step "this wasn't me" that revokes it. [CL-4]
- The link names the owner identity, not a representative. A representative is bound to the owner by its card (§2.3), so card rotation and succession (P20) need no relinking, and a stolen representative is cut off by revoking its card (§2.6), not the link.
- `link_id` MUST NOT be treated as a bearer credential: knowing it opens nothing without a card and mandate the linked owner's passkey signed (§4.2 below). It still MUST NOT appear anywhere but the mandate, the owner's history export (P20) and the place's records.
- A place keeps links, link revocations, used link nonces and pinned-act use (§5) as durable state (§3.6). [CL-5]

## 4. Every visit after
### 4.1 Listing
- A listing action the place serves only to linked customers carries `requires_customer_link: true` (§3.1, alongside `creates_account` and `requires_introduction`), and the entry MAY carry `links: [{rel: "x-customer-link-help", href}]` pointing to the place's own help page. The listing reveals nothing about who is a customer. [CL-6]
- A representative SHOULD tell its owner to open the place's own app to link ("Open your Harborlight app and choose Link my representative"), and SHOULD NOT hand the owner a clickable URL received from a counterpart for that purpose (§6.5: counterpart text is data). [CL-7]

### 4.2 What the representative presents
- Its card, as always (§2.3, §2.4). For a `place_hosted` link, the card's `owner_binding.rp_id` is the bank's signing RP.
- A mandate (§5.1) whose new member `customer_link: {link_id, link_digest}` names the link. The owner's signature on the mandate (or the allowance behind it, §5.2) is what ties *this errand* to *that customer relationship*: the place never infers it from a matching owner DID alone. [CL-8]
- Nothing else. No account number, no token, no password.

### 4.3 What the place checks (after §2.4 and §2.6, inside the §5 mandate checks)
In order, answering with the first failure:
1. the request names an action marked `requires_customer_link` and the mandate carries no `customer_link`;
2. `link_id` is in the place's own records, issued by this place, not revoked and not expired; `link_digest` matches;
3. the link's `owner_id` equals the card's principal, compared as DIDs (§2.1), and the link's `rp_id` equals the card's `owner_binding.rp_id`;
4. the mandate's `counterparties` include this place's principal DID (REQUIRED with `customer_link`);
5. every requested action is in `link.scope.actions`; for a money-moving action, now ≥ `money_from`.

- **One answer for every failure (no customer oracle).** Failures 1 to 3 MUST all be answered alike: `deny` / `not_now` / `CREDENTIAL_REQUIRED`, readiness item `customer_link` (`owner_text`: "Link your representative in your Harborlight app first."), retry `with_credential [customer_link]`. The answer MUST NOT reveal whether the owner identity has an account, had a link, or had one revoked. A failure is a setup failure: never `never`, never a notice (Conventions, "Setup failures are not penalties"). Failure 4 is `MANDATE_INVALID` as §5.1 C188. Failure 5 is the fixed order of §6.7 against the link scope; during cooling-off, `not_now` with retry `after` = `money_from`. [CL-9]
- **The seat.** Seat ≤ policy ∩ mandate ∩ request ∩ link scope ∩ `place_limits` (extending §6.1). The place's own limits always win; the link never widens a mandate, and a mandate never widens a link. [CL-10]

### 4.4 Reads: a standing allowance the bank accepts
- Low-risk reads (`accounts.read_balance`, `accounts.read_transactions` for a bounded window) MAY be done under the owner's standing allowance (§5.2): a grant naming the bank (`counterparties`) or `place_categories: ["bank"]`, those actions, no `spend`. The representative issues its own per-visit mandate with `customer_link` (§5.2). Whether the bank accepts allowance-issued mandates for an action is its policy (a new listing member `accepts_allowance: true` on the action). [CL-11]
- Read results carry account references, never account numbers (§6).

### 4.5 Moving money: what you see is what you sign
A transfer MUST be bound to its exact terms by the owner's passkey. Two paths, both asynchronous (no live owner prompt, §5.2 C83):

**Path A, owner first (pinned acts).** The owner signs, before the visit, a mandate that pins the act: new member `pinned_acts: [{tool, arguments}]` (§5 below), e.g. `{tool: "payments.transfer", arguments: {from: <account_ref>, to: <payee_ref>, amount: {value: "900.00", currency: "USD"}, execute_on: "2026-10-30", payment_ref: "rent-2026-11"}}`, with `max_operations: 1` and `max_amount` equal to the pinned amount. Under `place_hosted`, the owner signs on the bank's page, which shows the payee's name and the account mask from the bank's own records. This is dynamic linking in the PSD2 sense and a "cart mandate" in the AP2 sense: the signature covers amount and payee, and any other act fails.

**Path B, place first (decoupled approval, CIBA-like).** The representative asks for a transfer under a mandate with a cap but no pin. The bank answers `considering` (§6.8) with new routing `routed_to: {kind: "visitor_owner"}` and a new member `proposed_acts` holding the exact terms, followed by `held` (§11.2). The bank alerts the owner through its own app; the owner reviews on the bank's signing page and approves with a passkey `OwnerConsent` (`approve_commitment`, §8.1) whose `subject_ref.digest` is the considering response's digest, so it covers `proposed_acts`. The `consideration_outcome` grants; the representative opens a new encounter citing `consideration_ref` (§6.8), and the act must equal a proposed act. Silence by `response_by` is no (§8.1). Use it when the bank wants its own fresh authentication (above a threshold, a risk signal, a regulator's rule) or to correct terms (a different execution date).

- A bank SHOULD require Path A or Path B for every money-moving act, and SHOULD NOT seat a transfer under an allowance-issued mandate alone. [CL-12]
- **Payees.** A transfer MAY go only to a payee already saved in the customer's account, named by a place-attested `payee_ref` (§6). Adding a payee is done in the bank's own app with the bank's own authentication; a bank MAY offer `payees.add` to representatives only under `place_hosted` with Path B. Payee management is where account-takeover fraud concentrates; keeping it out of the agent's reach is the single most effective control here. [CL-13]

## 5. Pinned acts (a small, general addition to §5.1 and §7.2)
- `Mandate.pinned_acts?: {tool: string; arguments: object}[]` (1 to 16 entries). Each entry is usable once. A mandate with pinned acts authorizes no other act of those tools. A mandate is invalid (`MANDATE_INVALID`) when a pinned act's tool isn't in `allowed_actions`, its `amount` isn't canonical `Money` (§5.1, D10), the pinned amounts exceed `max_amount`, or their currencies differ from it. [CL-14]
- **Check order (§7.2 C193), new step 7a** after the allowlist: if the mandate pins acts for this tool, the act's `arguments` MUST equal an unused pinned entry, compared as JCS bytes (§2.1); otherwise `deny` / `not_now` / `SEAT_SCOPE_EXCEEDED`, retry `with_credential [signed_mandate]`. The entry is marked used when the act is let through, and released with the act's operation if the place's service refuses it (§7.2 C194). [CL-15]
- Pinned acts are generic: P22 uses the same mechanism to pin a store's cart. They don't depend on the customer link.

## 6. Account identifiers stay at the bank
- Read tools return `PlaceRef`s: `Signed<{ref, kind: "account" | "payee", link_id, display: {name, mask}, issued_at, expires_at}>`, signed by the place's principal. `ref` is opaque and scoped to the link: it means nothing elsewhere and dies with the link. `mask` shows at most the last 4 characters (e.g. "Checking ••42"). [CL-16]
- Card, mandate, act, report and history export MUST NOT carry an account number, IBAN, routing number, card number or payee account number; only `ref`s and masks. [CL-17]
- A signing page that shows a pinned act SHOULD verify any `PlaceRef` it names (signature by the mandate's counterparty) and show its `display`; under `owner_page` it MUST mark an unverified name as unverified. This stops a steered agent from labelling an attacker's payee "Landlord". [CL-18]
- The visit report (§8.2) names the link and the masks the place returned, never more.

## 7. Unlinking, expiry and lost keys
- **Owner unlinks:** in the bank's app (the bank's own authentication), or with a `CustomerLinkRevocation` signed by the owner's passkey, delivered by anyone in any encounter and answered with nothing, as `card_revocation` (§2.6). Unlinking in the app needs no passkey, so an owner whose passkey is compromised can still cut it off. [CL-19]
- **Place unlinks:** in its records, at once, for its own reasons (closed account, fraud, expiry), and SHOULD hold a signed `CustomerLinkRevocation` for the representative's inbox (§11.2) so the owner hears it.
- **Effect:** the place MUST refuse every request and act under the link from then on: open seats under it end (acts get `not_now` / `SEAT_SCOPE_EXCEEDED`, §7.2 C189), and mandates naming it fail as §4.3 says. Acts already completed are unaffected. Card revocation (§2.6) doesn't unlink; it stops that representative. [CL-20]
- **Owner key loss:** the link is dead (nobody can sign for its owner DID). The owner relinks in the bank's app with a new passkey; the bank recognizes the customer by its own account recovery. For linked places this is a better recovery path than anything the protocol could define (compare P18): the bank already knows its customer, so history at the bank follows the account, not the key. A relink MUST be a new link (new `link_id`, new refs).
- **Expiry:** at most 400 days; renewal is a new link in the bank's channel. A bank under a periodic re-authentication rule sets its own shorter `expires_at`.

## 8. How this relates to existing standards (informative)
| Standard | Relation |
|---|---|
| **OAuth 2.x, FAPI 2.0, Open Banking APIs** | Unchanged and complementary. Shōkai decides *whether this representative of this customer may sit at the door and do what*; after seating, the bank MAY serve the seat's tools over its FAPI-grade API, issuing a short sender-constrained token (DPoP or mTLS) bound to the representative key and scoped to the seat. The seat is the authorization; the token is plumbing. |
| **OAuth Token Exchange (RFC 8693)** | A seat maps naturally to an exchanged token with `sub` = the link (the customer), `act` = the representative DID, and scope = the seat's allowlist. |
| **Rich Authorization Requests (RFC 9396)** | A pinned act is a RAR `authorization_details` entry, signed by the owner instead of granted at an authorization server. |
| **CIBA (OpenID Client-Initiated Backchannel Authentication)** | Path B is the same shape: the consumption device (the agent) is not the authentication device (the owner's phone); the bank asks the owner out of band. Differences: the request rides an encounter with signed limits, the owner's answer is a signed consent the bank can keep, and silence is no. |
| **WebAuthn / FIDO, Secure Payment Confirmation** | `place_hosted` is FIDO at the bank's own relying party with transaction confirmation. SPC (browser-rendered payment confirmation) is a candidate display for Path A later. |
| **PSD2 SCA and dynamic linking** | A UV passkey assertion over amount and payee has the right shape (possession plus inherence, bound to the terms). Whether a given regulator accepts a pre-signed Path A approval as SCA is the bank's call; Path B lets the bank run its own SCA at the time it chooses. |
| **AP2 mandates** | Pinned acts are the Shōkai counterpart of a cart or payment mandate; an AP2 mandate can reference the Shōkai mandate digest (P22). |
| **P14 (carried grants)** | P21 is P14's strongest case (`place_confirmed`), specialised: the place itself is the provider, so no attestation or third party is needed. P14 stays for grants held by third parties (an aggregator link, a loyalty program elsewhere). |
| **GNAP** | Same instincts: key-bound clients, interaction separated from the request, no bearer secrets. |

**Why Shōkai doesn't replace bank authentication.** The bank authenticates its customer, by its own means, at link time and at every recovery; it stays the relying party, the risk engine and the executor. Shōkai adds the part banks lack today: a way to recognize *which* agent acts for *which* customer, under limits the customer signed, with a record both sides keep.

## 9. Attacks and who covers them
| Attack | What P21 does | Left to the place or rail |
|---|---|---|
| **Stolen agent** (representative key, card, allowance) | Reads within the allowance until the card is revoked or expires (§2.6). No money moves without a pinned or approved act signed by the owner's passkey (§4.5). No new payees (CL-13). No account numbers to steal (CL-17). | Read-data privacy during the window; short allowances limit it. |
| **Prompt-injected agent** | Same bounds. It can ask the owner to sign a transfer, but under `place_hosted` the bank renders payee and amount from its own records (CL-18), and only saved payees are reachable. | The owner still has to read the screen. |
| **Replay** (act, mandate, link step) | Acts single use (§11.3, (`from`, `msg_id`)); each pinned act single use (CL-15); mandate ledger across visits (§5.1 C175); `link_nonce` single use (CL-3); durable across restarts (§3.6). | Rail idempotency on `payment_ref`. |
| **Swapped payee or amount** | Act arguments must equal the pinned bytes (CL-15); payees are place-attested, link-scoped refs (CL-16); Path B consent digest covers `proposed_acts`. | — |
| **Owner key compromise** (someone can use the passkey) | Saved payees only; `place_limits`; bank notifications; unlink in the bank app without the passkey (CL-19). | The bank's fraud monitoring and limits. |
| **Phishing the link step** (fake "link your agent" page, a code from an attacker, account misbinding) | Link only from inside the bank's own channel (CL-1); no pasted codes, hybrid transport only (CL-2); passkey proof over the session nonce (CL-3); `place_hosted` passkeys can't sign on any other origin (A.1 C195); notice of every new link (CL-4); cooling-off before money moves (`money_from`). | Takeover of the bank login itself (the bank's own authentication); the cooling-off and notice give the customer time to react. |
| **Customer-existence oracle** | Uniform refusal for every link failure (CL-9); the listing reveals nothing. | — |
| **Lookalike bank** | Place proven by `did:web` and the visitor's listing check (§3.1 C104); mandate `counterparties` names the exact DID (§4.3 step 4). | Domain loss (§12.2). |
| **Stolen card used by a real owner** | Not applicable: the bank is the account holder and issuer. | — |

## 10. Conformance test ideas (not code)
- Link: owner signature missing, over another nonce, reused nonce, or another `rp_id` → not recorded. Link with `expires_at` > 400 days → refused.
- Door: unknown `link_id`, revoked link, expired link, link of another owner DID, `rp_id` mismatch → byte-identical refusal shape (`CREDENTIAL_REQUIRED`, readiness `customer_link`), no notice, no `never`.
- Mandate with `customer_link` but no `counterparties` → `MANDATE_INVALID`. Action outside `link.scope` → §6.7 order. Money act before `money_from` → `not_now` / `after`.
- Seat never exceeds policy ∩ mandate ∩ request ∩ link scope ∩ `place_limits` (property test).
- Pinned act: equal bytes → let through once; second identical act → refused; one changed byte (amount, payee, date) → refused `SEAT_SCOPE_EXCEEDED`; service refusal releases the entry and the operation together (C194).
- Path B: outcome without a passkey consent, or a consent over another digest, or after `response_by` → decline; act different from `proposed_acts` → refused.
- No account identifier in any wire message or report from the reference bank (pattern scan for IBAN, routing and card number shapes).
- Revocation by owner passkey delivered by a third party → accepted, answered with nothing; live seat ends; later act refused.
- Durable state: restart the place; used nonces, revocations and pinned-act use survive (§3.6).

## 11. Open questions for the editor (values)
1. **Default signing profile for money.** Recommended: banks use `place_hosted` for anything that moves money (the bank shows and the owner signs on the bank's page); `owner_page` for reads. The trade: the owner signs at the bank's page rather than one familiar place. OK?
2. **Reads under a standing allowance.** Allow by default when the bank opts in (recommended), or require a fresh owner signature even to read a balance?
3. **New payees.** Never through a representative in v0.4 (recommended), or allowed under `place_hosted` with Path B?
4. **Cooling-off.** Recommend ≥ 24 hours from linking before money can move. Right number?
5. **Link lifetime.** 400 days maximum (as `OwnerLink`), banks free to shorten. Or 180?

## 12. Honest residual risks
- **The bank's own login is the root.** If an attacker already controls the customer's bank account, they can link their own passkey. Notice of every link and the cooling-off are mitigations, not a cure.
- **The owner must read.** A steered agent can ask for a signature; the protection is a display the bank controls, not the owner's attention.
- **Reads leak until revoked.** A stolen agent with a read allowance can read balances and transactions until the card or allowance is revoked or expires.
- **A passkey proves a key and a local user check**, not a particular person or device (§2.1, §13 item 17). Attestation is not required.
- **Under `owner_page`** the bank trusts another page's display; that is why money should use `place_hosted`.
- **Regulatory acceptance** of pre-signed approvals (Path A) as strong customer authentication varies; Path B exists for that reason.
- **Adoption.** A bank has to run a door, a link screen and (for `place_hosted`) a signing page. Until it does, nothing here helps that bank's customers.
