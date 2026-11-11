# Trust can have a price, set by the place (P27)

**Status (v0.5.0): Adopted into the core**, SPEC.md §6.9 (trust requirements, `TrustReceipt`), §6.2 (`TRUST_REQUIRED`) and design principle 7. The text below is the proposal as approved; where it and SPEC.md differ, SPEC.md wins. The addenda are kept for the record.

*Drafted 2026-10-30 to 2026-10-31 for the editor's review; the drafting history is kept by the editors.*

---

## 1. Why

A place that gives something away for free is still paying for it: free credits are someone's compute, a free sample is stock and postage, a free account is support and risk. Today a place has two settings: open to anyone, or closed. P27 gives it the dial in between. **Each place chooses, per offering, how much trust a visiting representative agent must show before it gets something that costs the place money.** The default stays free and open.

**What happens to good companies when sign-ups are cheap.** *(Decided, D: replaces the anonymous scenario.)* On 2026-10-30 (8:59 AM PT), the founder of Frevana, an AI startup, shared this publicly ([post](https://x.com/wenyanhh/status/2116198317340434444)):

> we lost $4k overnight 😭
>
> woke up to 5.5k+ signups thinking we FINALLY went viral
>
> turns out someone made thousands of fake accounts to drain our free AI credits.
>
> even email verification didn't stop them lol
>
> and what did they use all those credits for?? a WHOLE short drama

Frevana did what a generous, growing company should do: it gave new people something real to try. That generosity is exactly what cheap sign-ups exploit. An email address costs an attacker nothing, so a free offer is priced at zero for whoever can make addresses in bulk. P27 is the missing setting: a place can keep its free offer and still say, for the part that really costs money, "show me a little more first."

## 2. The split: what the protocol standardizes, what the place decides (Decided)

| The protocol standardizes | The place decides |
|---|---|
| **How a place declares a trust requirement per offering**, in its signed house config (`policy`), covered by the `house_digest` on its Shōkai host card (§2.3) | **Whether to set one at all** (default: none, free and open) |
| **The proofs** a visiting representative agent can present, and how the door checks each one, deterministically, before any model runs | **The price**: fee, deposit amount, how many honest visits, which introducers, which issuers |
| **How free grants are counted**: per owner, introducer and receipt, and a place-wide pool | **The caps**, and whether to count actions or real units |
| **The answers**: a fixable `deny` / `not_now` that names the honest way in, never a penalty | **The payment**, at its own checkout, on its own rail (§0; C211 stays) |
| **The shape of a paid or deposit-backed proof**: an issuer-signed `TrustReceipt`, with expiry, revocation and replay rules | **Who issues it**, **whether it asks for a deposit at all**, and how a deposit is held, refunded and disputed (its own terms) |

The protocol never sets a price, never moves money and never holds a payment method.

## 3. What already exists in v0.4.0, and what P27 adds

| Trust level | Status | Where |
|---|---|---|
| Self-introduction (`vouch: null`) | **In v0.4.0** | §4 |
| An introduction from an accountable introducer; the place's own invitation | **In v0.4.0** | §4 (D17, C149, `introducer_interest`), §9.3 (D1) |
| Per-owner and per-introducer counting, for sign-ups only | **In v0.4.0** | §9.4 (C165) |
| Conduct and history records per principal; owner links | **In v0.4.0, as building blocks** | §9.1, §9.3 (C161), §2.8 |
| A signed spending limit, paid at the place's own checkout; no payment method in a mandate | **In v0.4.0** | §5.1 (D11, C175, C211), §7.3 |
| An existing-customer link | **In v0.4.0** | §5.4 (K6, C208) |
| `trust_requirement` per offering; grant counting with a pool cap; "after N honest visits" (`history`); `TrustReceipt`; codes `TRUST_REQUIRED`, `trust`, `trust_receipt` | **Decided** | §4–§6 below |
| `costs_place` on a listed action, with a strong SHOULD for a pool cap | **Decided** (Q8) | §4.3 |
| First purchase builds trust | **Decided** (A) | §6.4 |
| Kinds of introduction, and "whoever introduces you lends you their name" | **Decided** (B) | §5; the one-to-many form is P28 |
| Refusals as a path back | **Decided** (C) | §4.5 |
| Receipt levels (loyalty) | **Informative** | §6.7 |
| Opt-in circles | **Future work** | P27 §13 (below) |

## 4. The `trust_requirement` field (Decided)

### 4.1 Where it lives

- **In the policy (signed).** `policy.trust_requirements` maps an action name to a `TrustRequirement`. It is part of the house config, so changing the price is a change of house that needs a new owner signature on the Shōkai host card (§2.3, §3.1, C205).
- **In the listing (public summary).** Each `PlaceAction` MAY carry `trust: { paths: TrustPathKind[], obtain_url? }`, naming **the kinds of proof** the place accepts (`introduction`, `history`, `deposit`, `paid`, `spending_mandate`, `customer_link`, …). *Decided (Q2):* the listing and every answer show **kinds, never numeric thresholds**: no visit counts, day counts or cap sizes, so an attacker can't read how long to wait or how far to go.
- **Issuers are not public.** *Decided (Q3):* third-party issuers a place accepts are named only to a **verified** visiting representative (its Shōkai visitor card verified at step 2), in the `trust` readiness item; never in the listing or the lobby, as for `trusted_introducers` (§4). A place's own `obtain_url` may be public.
- **Absent = today's behavior.** A small shop that sets nothing pays nothing extra.

### 4.2 Shape

```ts
type TrustRequirement = {
  any_of: { all_of: TrustProofRule[] }[];   // met when ANY path is met; a path is met when ALL its proofs are
  grants?: GrantCaps;
};

type TrustProofRule =
  | { kind: "introduction"; kinds?: IntroductionKind[] }      // §5; default: any named introducer (never under "*")
  | { kind: "place_invitation" }                              // a vouch signed by the place's own key (§4, D17)
  | { kind: "customer_link" }                                 // §5.4
  | { kind: "spending_mandate"; min_max_amount: Money }       // §5.1: pay per use at the place's checkout
  | { kind: "history"; min_visits: number; min_days: number; clean_days: number }
  | { kind: "receipt"; receipt_kinds: ("paid" | "deposit")[]; min_value?: Money; issuers: "self" | "named" };

type GrantCaps = {
  unit?: "action" | `x-${string}`;                            // default "action" (Q7)
  per_principal: { max: number; period: "P1D" | "P7D" | "P1M" | "P1Y" };
  per_introducer?: { max: number; period: string };
  per_receipt?: { max: number; period: string };
  pool?: { max: number; period: string };                     // the whole place, everyone together
};
```

- **`history`** is a pure function of the place's own §9.1 record: past encounters that ended in a `grant` with no later finding, the age of the first, and the date of the last finding. *Decided (Q6):* visits under an owner link (§2.8) count, because a link only adds; a `never` carried by a link still binds.
- **Units** *(Decided, Q7)*: by default the door counts **actions** (each act let through is one). A place MAY count **real units** instead (`unit: "x-video_seconds"`, `"x-samples"`): its service reports `units_used` in the act's result, and the door counts that, releasing it with the act when the service refuses (C187, C194). Why: one free act can be a 5-second clip or a 2-minute film; units let a place cap what it actually spends. A door that can't see its service's result counts actions.

Example: free HD video with four ways in.

```json
"trust_requirements": {
  "video.generate_hd": {
    "any_of": [
      { "all_of": [ { "kind": "history", "min_visits": 3, "min_days": 7, "clean_days": 90 } ] },
      { "all_of": [ { "kind": "introduction", "kinds": ["customer", "established"] } ] },
      { "all_of": [ { "kind": "receipt", "receipt_kinds": ["deposit"], "min_value": { "value": "5.00", "currency": "USD" }, "issuers": "self" } ] },
      { "all_of": [ { "kind": "spending_mandate", "min_max_amount": { "value": "1.00", "currency": "USD" } } ] }
    ],
    "grants": { "per_principal": { "max": 10, "period": "P1D" }, "pool": { "max": 400, "period": "P1D" } }
  }
}
```

The listing shows only `"trust": { "paths": ["history", "introduction", "deposit", "spending_mandate"] }`.

### 4.3 The pool cap and `costs_place` (Decided, Q8)

- A `PlaceAction` MAY carry `costs_place: true`: serving it costs the place real money (compute, stock, postage, people's time).
- A place **SHOULD** set a `grants.pool` cap on every action it marks `costs_place`, and **SHOULD** mark every such action. *(Strongly recommended: the SDK warns at startup when a `costs_place` action has no pool cap.)* The pool is the one number that bounds the worst case, whatever gets through.

**Worked example (illustrative).** A platform gives each new owner 10 free credits; a credit costs it $0.75 in compute, so a free sign-up costs it $7.50. With no pool cap, its loss grows with every fake owner: the post's $4k overnight. With a pool of $300 a day (400 credits), the worst day costs **$300**, whether 40 real people or 5,000 fake owners show up. When the pool is used up, later visitors get `not_now` / `RATE_LIMITED` with a retry at the next window and a kind sentence for the owner, for example "Free credits are back tomorrow." Nobody is punished, the place stops paying, and the trust paths (§4.2) still let returning, introduced or paying owners in.

### 4.4 How the door checks it (deterministic, before any model)

The check is a gate input like any other (§6.4): verified artifacts, relationship facts, policy version and time. No prose, no model.

1. **At the request (step 5).** After §6.7's fixed order and beside the introduction check: evaluate each requested action's paths. All met: decide as today. Some: `conditional` with `narrow_actions` (§6.7 rule 1). None: `deny` / `not_now` / `TRUST_REQUIRED` (§4.5).
2. **At each act (new step 9a in C193, after operation counts).** Count against the grant caps: per principal (canonical DID, across all its representative agents, §9.4), per introducer relied on, per receipt, and the pool. Past a cap: `not_now` / `RATE_LIMITED`, retry `after` the time a slot frees. Refused acts count nothing; released acts release their grant.
3. **Cost to the place.** A signature check per receipt, a revocation list cached up to an hour per issuer (none for self-issued receipts), and a few key-value counters per act in the store the door already has.

A place SHOULD NOT run a model for a visitor whose requirement isn't met (pairs with Principle 7's proposed SHOULD).

### 4.5 Refusals as a path back (Decided, C)

A refusal is never the end of the conversation; it is directions home. An agent has no feelings to hurt, but its owner does, and an owner who hears "here is the honest way in" has somewhere better to go than a fake account.
- **Every `TRUST_REQUIRED` answer MUST name what's missing**: a readiness item `trust` listing every path the place accepts for that action (kinds only, §4.1; named issuers only to a verified visitor), each with `owner_text`, one plain sentence the representative agent can show its owner as is. Example: "This place gives free HD videos to returning visitors, to people introduced by one of its customers, or with a refundable deposit. You can also pay per video." Plus `obtain_url` when the place issues its own receipts.
- **Retry** `with_credential` lists the credentials for the paths offered (`vouch`, `signed_mandate`, `customer_link`, new `trust_receipt`). When only `history` can be met, retry `after` a time the place chooses that doesn't reveal its threshold.
- **The representative agent MUST bring it home.** Its visit report (§8.2) MUST carry the paths as its next step, quoted as the place's words, and it MUST NOT try to meet a requirement by borrowing or making up a proof: protecting its owner's reputation is part of its duty of loyalty (§1).
- **Never a penalty.** No `never`, no finding, no notice for an unmet requirement or a reached cap (Conventions, "Setup failures are not penalties"; §9.4). `TRUST_REQUIRED` is not a probing rejection (§9.3). The one exception is deliberate misuse of someone else's receipt (§6.3, rule 3).
- **Codes.** Reason `TRUST_REQUIRED`: MUST NOT be sent to an unverified visitor, MAY to a verified one (as `VOUCH_REQUIRED`, §6.2). Readiness code `trust`. Credential kind `trust_receipt`.

## 5. Kinds of introduction (Decided, B)

**The principle.** In Japanese practice, an introduction (*shōkai*) is a loan of the introducer's name: if you behave badly, the person who introduced you loses face too. That's why asking "can you introduce me?" is uncomfortable, and why a good introduction is worth so much. Shōkai already builds this in: a vouch is a deliberate, owner-signed act (§4, `issue_vouch` §8.1), the owner is shown the consequences before signing, and an introducer whose vouch was relied on and abused is `reduced` for 90 days or `suspended` for 180 (§9.3, D1). P27 lets a place say **which kinds** of introduction it accepts for something that costs it money, because they don't weigh the same.

| Kind | Who answers for the visitor | How the door knows (deterministic) | Whose name is at stake | What's new |
|---|---|---|---|---|
| **Self-introduction** | the owner alone | `vouch: null` (§4) | the owner's own (§9.3, C161) | Nothing. The free baseline; trust then grows by `history` |
| **`customer`**: a vouch from an existing customer | a person the place already serves | the introducer's principal has a customer link here (§5.4) or a clean record of paid visits here (§9.1), checked by the place from its own records, never taken from a claim | the customer's standing here (D1) | The kind name; no wire change |
| **`established`**: a known public figure or established reputation | a person or organization the place names | the introducer is on the place's named list and the place checked its identity binding (`did:web` on its own domain, or P23 binding). A famous name on a vouch is a claim and weighs nothing (C199) | the figure's standing at this place (D1); its public name, in practice | The kind name; no wire change |
| **`organization`**: a company sending its own representative agent | the company itself, as principal | the Shōkai visitor card's principal is a `did:web` organization whose domain the place accepts (`organizations: "named"` or `"any_did_web"`) | the company's: a representative agent's conduct is its principal's (§9.3, C161) | `organizations` setting |
| **`named`** (default) | any introducer on the place's named list | today's §4 rules | the introducer's (D1) | Nothing |

**Additions only where needed:**
- `TrustProofRule.introduction.kinds?` (above) and the policy member `organizations?`.
- **No new vouch member.** v0.4.0's `Vouch.relationship` (a string the introducer signs, for example `"client_of_record"`) already says how the introducer knows the subject. P27 only recommends values (`customer_of_place`, `colleague`, `employer`, `friend`, `other`). It stays a claim and never decides a kind: the door decides from its own records. *(v2 proposed a new `Vouch.relation`; v3 drops it in favour of the existing member.)*
- The `issue_vouch` summary (§8.1) SHOULD add one plain line: "You are lending your name: if they misbehave at this place, your own introductions there count for less for up to 180 days."
- Nothing in the wire changes for self-introduction, `named` or how penalties work.
- **One to many: P28.** A vouch names one subject. An introducer who wants to introduce people it doesn't know yet (ten collaborators who might like a tea house) issues a **Shōkai introduction card** (P28): owner-signed, one place, a counted number of claims, each bound to its holder's key. At the door a claimed Shōkai introduction card counts as a vouch from that introducer, and its kind is decided here, by the same table.

## 6. `TrustReceipt`: paid or deposit-backed proof (Decided, Q1)

*Decided (Q1):* the wire name is **`TrustReceipt`**; the word "attestation" is reserved for device attestation (§13 items 17 and 23).

### 6.1 What it is

An issuer's signed statement: "the owner behind this Shōkai visitor card paid a fee (or holds a deposit) of this value, for these offerings at this place, until this time." It is presented with the Shōkai visitor card. It is neither a Shōkai visitor card nor a Shōkai host card, and never replaces a Shōkai visitor card.

```ts
type TrustReceipt = {
  receipt_id: string;
  kind: "paid" | "deposit";
  issuer: string;                     // DID: the place's own principal ("self"), or an issuer the place names
  subject: { principal_id: string };  // the owner DID of the Shōkai visitor card (canonical, §2.1)
  audience: string;                   // exactly one place's principal DID (Q4)
  covers: { actions: string[] };
  value: Money;                       // exact amounts (D10)
  receipt_ref: string;                // the issuer's own opaque reference; never a payment instrument (C210, C211)
  terms_url?: string;                 // https; refund, forfeit and dispute terms: the place's own
  issued_at: Timestamp; expires_at: Timestamp;   // at most 400 days
  revocation_url?: string;            // https, list of Signed<TrustReceiptRevocation>; absent when issuer = audience
  shown_to_owner: { text: string; locale: Locale };  // what the owner read before paying, inside the signature
  level?: string;                     // informative, place-defined (§6.7)
};
type TrustReceiptRevocation = { receipt_id: string; issuer: string; revoked_at: Timestamp;
  reason?: "refunded" | "forfeited" | "chargeback" | "expired_early" | "other"; notice_ref?: string };
```

Carried in the `invitation_request` as `trust_receipts: Signed<TrustReceipt>[]`, with `trust_receipt_digests` bound like `vouch_digest` (§5.3).

**One place per receipt** *(Decided, Q4)*: `audience` MUST name exactly one place. Multi-place receipts are out of v0.5.0. Why: a receipt shown at many places is the same object at each, so those places could join their records about one owner, undoing per-place identities (§2.8, §12.3). To revisit later for creator networks, with privacy protections (for example a fresh receipt per place from one payment).

### 6.2 How an owner gets one (no new infrastructure)

The simplest issuer is the place itself. It lists a spending action, for example `trust.deposit` (`spends: true`). The representative agent calls it under a mandate its owner signed with a passkey (§5.1); payment happens at the place's own checkout, or the purchase is held for the owner's approval (§7.3). The `act_result` returns the signed `TrustReceipt`, which the representative agent keeps and reports home (`brought_back`, §8.2). The owner can also pay on the place's website. C211 holds: the mandate and the receipt carry no payment method.

### 6.3 What the door checks, in order

1. Signature verifies against `issuer` (`did:web` or `did:key`; an owner passkey can't issue). Digest bound in the request.
2. `issuer` is the place's own principal or on its named issuer list. **No `"*"`**: anyone can mint an issuer key (as C149 for introducers).
3. **Replay and reuse.** `subject.principal_id` equals the presented Shōkai visitor card's principal (parsed DIDs). A copied receipt is useless without that owner's Shōkai visitor card and its possession proof (§2.4). *Decided (Q9):* a single receipt for another owner, or a forged or broken one, is a **fixable setup failure** (it may be an honest mix-up): it counts as absent and gets §4.5's answer. **Repeatedly presenting another owner's receipt is a `gate_probing` signal** (approved): by default the third such presentation from one principal within 24 hours (§9.3's probing defaults) is a `gate_probing` finding against that principal (serious: a notice, and its standing here `reduced` for 90 days, C161). Why: one mismatch is a mistake; a principal cycling through other people's receipts is trying to borrow trust it didn't earn.
4. `audience` is this place; `covers.actions` includes the requested action; `value` meets `min_value` in the same currency, compared exactly.
5. Times: RFC 3339, ±300 s skew (§2.2); not expired.
6. Revocation: self-issued, the place's own record; otherwise the `revocation_url`, each entry verified, cached up to one hour; unreachable → `not_now`, retry `after` ≤ 1 day (fail closed, §12.1, never `never`).
7. Counting: `grants.per_receipt` caps what one receipt buys per period, so one payment can't fund a swarm; the per-principal and pool caps still apply.

### 6.4 First purchase builds trust (Decided, A)

Many web shops already work this way: you pay once, and from then on you're a known customer. P27 makes it explicit and safe.
- A place MAY issue a `TrustReceipt` (`kind: "paid"`, `value` = the purchase) when an owner completes a first purchase through a spending act under a passkey-signed mandate (§5.1, §7.3), and return it in that act's result. This is the first-purchase path of P22, now leaving trust behind it.
- A place MAY instead **allocate part of the first purchase as a deposit** (`kind: "deposit"`, `value` = the allocated part). If it does, it MUST say so in the listing (`trust.first_purchase: { allocates_deposit: true }`) and in the receipt's `shown_to_owner`, and the owner MUST see it before approving the purchase (the mandate's or the held purchase's summary, §8.1). The stated `amount` is still the most the place may charge (C187); the deposit is part of it, never on top. §6.5 applies to it.
- A customer link (§5.4, P21) MAY likewise be accompanied by a self-issued receipt when the place makes the link in its own channel.
- Payment always happens at the place's own checkout. C211 is unchanged: nothing a representative agent carries holds a payment method.

### 6.5 Deposits (Decided, Q5)

- **Optional per place.** Many places will never ask for one; `history` and introductions need no money at all.
- **If a place requires a deposit, it MUST keep it only on a recorded finding**: a §9.3 finding it sent as a `MisconductNotice`. The revocation then carries `reason: "forfeited"` and `notice_ref`. Declining for fit, timing or taste MUST NOT forfeit (§9.3, C158).
- **Refund ends it.** A refunded or charged-back deposit MUST be revoked (`reason: "refunded"` / `"chargeback"`), and the door ends the open seats that relied on it at once (the C198 pattern).
- **Disputes** follow the place's own terms (`terms_url`, summarized in `shown_to_owner` before the owner pays). The protocol carries the facts both sides signed; it doesn't judge.

### 6.6 How this relates to §13 items 17 and 23

Items 17 and 23 are about **device attestation**: proving what made a passkey, or which signing pages to trust. They stay open; P27 doesn't depend on them and doesn't solve them. A `TrustReceipt` is an **economic** statement from an issuer the place chose, about an owner DID. It doesn't claim a unique human or a real device; it says someone put money behind this owner identity at this place. If items 17 or 23 are resolved later, each can become one more `TrustProofRule` kind (`signing_page`) with no change to this design. A personhood service could be a named issuer; the core never requires one.

### 6.7 Receipt levels (informative)

A `TrustReceipt` MAY carry `level`, a label the place defines (`"1"`, `"silver"`, `"regular"`). Honest customers move up over time, like a loyalty program or airline miles: a place can reissue a higher-level receipt after several clean purchases or visits, and its own policy can let a higher level meet more paths or larger grants. Levels are the place's choice: the protocol gives them no meaning, they never travel to another place (§6.1, one `audience`), and a level never overrides a recorded finding. A place that uses levels SHOULD describe them in plain words in the receipt's `shown_to_owner`.

## 7. Honest limits

- **A passkey proves continuity, not a unique human.** It shows "the same owner as last time" (§2.1). Passkeys can be created in software, one device can create many, and an owner may hold one identity per place (§2.8). P27 doesn't change that.
- **Price raises the cost of mass fake owners; it doesn't make them impossible.** Thousands of free owner keys cost nearly nothing. Thousands of deposits, introductions from people who lose standing, or honest histories built over days cost real money or time. An attacker who pays has paid the place.
- **The pool cap is the hard floor** (§4.3): whatever gets through, the worst day costs what the owner chose in advance.
- **Introductions can be bought or traded.** `introducer_interest` makes paid introductions visible, and D1 makes abused ones costly; it doesn't make them impossible.
- **Outside the door is out of scope.** A platform's ordinary website and sign-up form need their own defenses (§3, D20).
- **Paying for trust can exclude people.** That's why free paths (history, introductions) sit beside paid ones and the default is open. A place that offers only a paid path shows that choice openly in its listing.

## 8. Low cost for mom-and-pop shops

- **Free and open by default.** No `trust_requirements`, no change. A basic Shōkai visitor card is free to make and every place answers it (§3.3, §4).
- **Cheap checks.** Counters and signature checks in the key-value store the door already uses; no model, no issuer network, no registry.
- **No extra infrastructure.** A shop can be its own issuer (§6.2), needs no revocation URL for its own receipts, and most shops will use only `history` and introductions.
- **SDK presets** (proposed): `open` (nothing), `gentle` (one honest visit or an introduction for anything that `costs_place`, plus a pool cap), `strict` (an introduction or a deposit).

## 9. Worked examples (fictional)

**a. Lumenreel, a video-credit startup.** `video.preview` (cheap, low resolution) stays open: 3 per owner a day, pool 2,000 a day. `video.generate_hd` uses §4.2's four paths. Each new owner gets 10 free HD credits ($0.75 each to Lumenreel) once a path is met, with a $300-a-day pool (§4.3). On a night of mass fake sign-ups, every fake owner gets the leaflet or the preview tier; HD needs a week of honest visits, an introduction from a customer or a named creator who answers for it, a refundable $5 deposit each, or real payment. The worst free day is the two pool caps, numbers Lumenreel chose in advance.

**b. Hanamori Tea, a small tea shop with free sample tins.** A tin costs the shop about $4 with postage. Browsing and questions stay open. `sample.request` (`costs_place: true`, `data_asks: ["address"]`) needs one earlier honest visit, or an introduction by one of its customers (`kinds: ["customer"]`). Caps: 1 per owner a year, pool 10 a week. Nothing new to run: no receipts, no checkout change. The most samples can cost it is about $40 a week.

**c. Kestrel Row Auctions, a bidding deposit.** `bid.place` needs a self-issued deposit receipt of at least $200, covering one sale and expiring 7 days after it. The owner's representative agent gets it through `trust.deposit` under a passkey-signed mandate (payment at the house's checkout), and every bid still sits under the owner's signed ceiling (Design questions f). After the sale the house refunds and revokes the receipt (`reason: "refunded"`). If a winning bid goes unpaid, the house records a finding, sends a notice, and keeps the deposit under the terms the owner read (`reason: "forfeited"`, `notice_ref`). A returning buyer whose first purchase earned a receipt (§6.4) can bid at the next sale without a new deposit, if the house allows it.

## 10. Compatibility and the wire tag (Decided)

Keep `shokai/0.3`. Everything is additive: new policy and listing members, new request members, a new signed artifact, new code values. A v0.4.0 visiting representative agent that ignores them still gets a well-formed `deny` / `not_now` with readiness and retry; a v0.4.0 place ignores the new request members. One clarifying sentence to add: an unknown reason code, readiness code or credential kind is treated as a fixable setup failure (v0.4.0 only says so for unknown members).

## 11. Decisions recorded (from open questions 1–9)

| # | Question | Decision (the editor, 2026-10-30) | Where |
|---|---|---|---|
| 1 | Wire name | `TrustReceipt`; credential `trust_receipt`; "attestation" reserved for device attestation | §6 |
| 2 | Show thresholds? | Kinds of proof only, never numbers | §4.1 |
| 3 | Third-party issuers | Named only to verified visitors | §4.1 |
| 4 | Multi-place receipts | Out of v0.5.0; revisit for creator networks with privacy protections | §6.1 |
| 5 | Deposits | Optional per place; if required, forfeit only on a recorded finding (MUST); disputes by the place's terms | §6.5 |
| 6 | History across owner links | Counts | §4.2 |
| 7 | Grant units | Actions by default; a place MAY count real units its service reports | §4.2 |
| 8 | Pool cap | Strong SHOULD for every `costs_place` offering | §4.3 |
| 9 | Another owner's receipt | Once: fixable setup failure. Repeatedly: `gate_probing` signal | §6.3 |

## 12. Sign-off

**Approved:**
1. P27 for v0.5.0 with the split in §2.
2. `trust_requirement` in the signed policy, with the public `trust` summary.
3. Grant counting per owner, introducer and receipt, and the place-wide pool cap ("Free credits are back tomorrow").
4. "After N honest visits" as the standard `history` proof.
5. `TrustReceipt`, the door checks, no `"*"` for issuers.
6. A place issuing its own receipt through its normal checkout (`trust.deposit`), with C211 unchanged.
7. The two deposit guards.
8. Codes `TRUST_REQUIRED`, `trust`, `trust_receipt`, and the unknown-code clarification.
9. Keep the wire tag `shokai/0.3`.
10. *(Replaced by D.)*
11. The three fictional examples.
12. Open questions 1–9 as recorded in §11, including Q9's third-use-within-24-hours rule.
13. **A.** First purchase builds trust (§6.4).
14. **B.** Kinds of introduction (§5).
15. **C.** Refusals as a path back, with its two MUSTs (§4.5).
16. **D.** The named scenario: the quote, the link and the framing as written (§1). The founder's name and the investor stay out for now.

**Deferred:** **E.** A red-team pass on P27, when the editor says it's time.

**New in v3, for the editor to confirm:**
- Dropping v2's new `Vouch.relation` in favour of v0.4.0's existing `Vouch.relationship` (§5): the same meaning, no new member.
- Receipt levels as an informative note (§6.7).
- Opt-in circles recorded as future work after 0.5.0 (P27 §13).

## 13. Future work (after 0.5.0): opt-in circles

*Future work, not part of v0.5.0.* A group of places (online shops, a business club, a fan club, a creators' network) may want to recognize one owner across all of them: a stamp rally, a riddle answered at each stop, a member perk. That is tracking, and agents could do it at fifty places in a minute. Shōkai can enable the game without ever becoming a data broker:
- **The circle is public.** The group publishes its membership: a signed list of the member places' principals, so any owner can see exactly who is in it.
- **The owner opts in.** Nothing is joined across places by default (one `audience` per receipt, per-place identities, §2.8). Stamps are collected across the circle only when the owner turns it on, with a passkey, for that circle, and the owner can turn it off.
- **No resale, no sharing outside the circle.** Every member signs, in its house rules (covered by its Shōkai host card's `house_digest`), that it will not sell or share circle data outside the circle. Breaking it is recorded misconduct (`post_seat_leakage`, severe, §9.3), with a notice.
- **The protocol carries the game, not the data.** Stamps stay with the owner's representative agent, which shows them when the owner chooses. No member keeps a cross-circle profile.

Uses: stamp rallies, riddles, business clubs, fan clubs, creators' networks (where Q4's multi-place receipts would return, with these protections).

---

*Copy check: "Shōkai visitor card" and "Shōkai host card" in full throughout; "representative agent", "host representative"; no banned words; wire identifiers (`RepresentativeCard`, `card_digest`, `signed_card`) quoted as code. Real names appear only in §1 and the D item, from the quoted post and its link.*


---

**Approval (Fri 2026-10-30, about 5:06 PM PT, the editor):** the editor reviewed this proposal and approved it as written, including my recommendations on the open questions ("We're all good here"). The adversarial (red-team) review is still deferred until the editor says it is time. Draft files only: nothing committed, pushed or published.

---

## Addendum (Fri 2026-10-30, 9:06 PM PT, from the editor): Mass-produced Shōkai visitor cards (Sybil resistance)
Pending the editor sign-off.

Anyone can create many passkeys and sign many valid Shōkai visitor cards. A valid signature proves who signed, not that the signer is trustworthy. The protocol therefore treats an unknown card as worth little by default:
1. **Fresh cards earn little.** A place SHOULD give cards with no history, no TrustReceipt and no introduction only the free tier, within the pool cap.
2. **Costly proof.** Trust requirements (first purchase, deposit, introduction) are the main defense, because each costs a bulk attacker real money or real reputation.
3. **Introducer accountability.** An introducer whose introduced cards misbehave loses standing, and a place MAY refuse further introductions from them.
4. **Door signals (SHOULD).** Rate limits per card, per introducer and per network origin; a card-age threshold for sensitive resources; and detection of bursts of new cards with similar timing, origin or introducer. These are recorded as `gate_probing` or `sybil_signal` findings.
5. **Future: account-backed proof.** A card MAY carry a privacy-preserving attestation that a verified account stands behind it, without revealing the person. This is not in 0.5.0.

### Addendum 2 (Fri 2026-10-30, 9:13 PM PT, from the editor): Door security levels, personhood stamps, farm detection
Pending the editor sign-off. Principle: make attacks expensive.
1. **Door security levels.** The owner picks a level in the door's settings, for example open (any card, free tier), standard (trust requirements), guarded (hardware passkey plus signals), or verified (a personhood stamp is required). The protocol is unchanged across levels.
2. **Personhood stamp (future, optional).** A trusted verifier checks once that a unique real human holds the card's passkey, then signs a stamp: "one person stands behind this card". The stamp carries no face or biometric data. The protocol never stores or transmits biometrics.
3. **Hardware-backed passkeys.** A place MAY require a passkey attested to live in a real device or security key, which raises the cost of minting cards in bulk.
4. **Owner-presence signals.** Under Return with care, a place MAY note cards whose owner never shows up: no approvals, no replies to findings, or instant and identical owner responses across many cards. These count as `sybil_signal` findings.

**APPROVED (Fri 2026-10-30, 9:57 PM PT, the editor):** both the Sybil-resistance addendum and Addendum 2 (door levels, personhood stamp, hardware passkeys, owner-presence signals) were approved as written.

**Amendment via P29 (approved Fri 2026-10-30, 10:55 PM PT):** §6.5 "keep a deposit only on a recorded finding" now applies to TrustReceipt (trust) deposits only. Booking deposits follow the place's signed `BookingTerms` (P29).
