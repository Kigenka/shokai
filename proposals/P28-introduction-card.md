# the Shōkai introduction card (P28)

**Status (v0.5.0): Adopted into the core**, SPEC.md §4.1 (the Shōkai introduction card) and §6.2 (`INTRODUCTION_USED_UP`). Its open questions stay open; where this text and SPEC.md differ, SPEC.md wins.

*Drafted 2026-10-30 to 2026-10-31 for the editor's review; the drafting history is kept by the editors.*

---

## 1. What it is

A **Shōkai introduction card** is a portable introduction, signed by its owner with a passkey, that a third party issues to a set of visitors for **one named place**. The third party can be an existing customer of that place, an established figure, or an organization introducing its own representative agents. It is a vouch made one-to-many: the introducer doesn't need to know in advance who will hold one.

Introductions are what Shōkai is named for. People have always known that an introduction lends the introducer's name: in Japan, whoever introduces you answers a little for how you behave (P27 §5). Online that weight was flattened into likes and follower counts. A Shōkai introduction card gives it back its meaning: it is deliberate, signed by a human, limited, and the introducer's reputation stands behind it.

## 2. The Shōkai card family

| Kind | Signed by | Says | Status |
|---|---|---|---|
| **Shōkai visitor card** | the owner's passkey (an organization's own key) | who you are, whom you represent, how far you may go | v0.4.0 |
| **Shōkai host card** | the place's owner | who keeps this door, and what it may do there | v0.4.0 |
| **Shōkai invitation card** | the place's own key | this place invites you, to this event, on these terms | v0.5.0 design |
| **Shōkai introduction card** | the introducer's passkey (an organization's own key) | I vouch for you to this place | P28 |

**Self-introduction is just showing your Shōkai visitor card** (`vouch: null`, §4). The other three only add to it: none of them ever stands in for a Shōkai visitor card, and none widens anything the visitor's owner signed.

**Invitation vs introduction.** A Shōkai invitation card comes *from the place* ("come in"). A Shōkai introduction card comes *from someone the place knows* ("they're with me"). The place decides what each is worth.

## 3. Rules

**Word of mouth carries no weight at the door.** A representative agent saying "you should try Hanamori Tea" in a studio is a mention, never an introduction (§4: "a mention, a recommendation or having met is never a vouch"). It can be the start of one: only a signed Shōkai introduction card counts.

**The agent proposes; the owner signs.**
- A representative agent MAY propose issuing a Shōkai introduction card to its owner (as a next step in its report, §8.2).
- Only the owner signs it, with a passkey (an organization with its own key). The owner's signature over it is the consent, as for a mandate (D7); its `shown_to_owner` MUST state the place, the number of claims, the expiry and the "lending your name" line (P27 §5): "You are lending your name: if someone you introduce misbehaves at this place, your own introductions there count for less for up to 180 days."
- A representative agent MUST NOT sign one, and a Shōkai introduction card signed by any key other than the introducer principal's carries no weight (§4).

**Limits (all MUST, checked by the door):**
- **One named place** (`place.principal_id`). Elsewhere it is nothing.
- **A count limit** (`max_claims`, default 10; a place MAY honor fewer, for example at most 20).
- **An expiry** (`expires_at`, at most 90 days; proposed).
- **Revocation**, through the introducer's revocation log, the same format as a vouch's (§4). Revoking it ends every unused claim and the weight of every claimed one from then on.

**Claims are single-use per holder and bound to the holder's key.**
- The Shōkai introduction card carries `claim_digests`: one salted digest per claim. The introducer's representative agent makes the random codes and salts before its owner signs, and keeps them. The introducer's side hands one claim code to each interested representative agent (for example, as an item in a shared studio). Handing out a code is distribution, not signing: the owner already signed the whole Shōkai introduction card.
- To claim, the holder's representative agent signs an `IntroductionClaim` with its own key, binding the code to its owner's principal and its Shōkai visitor card.
- The door accepts a claim only if its code's digest is on the Shōkai introduction card, the claim is signed by the presenting representative agent, and its principal is the presented Shōkai visitor card's principal. The first valid claim the door sees for a code binds that code to that principal for good (durable, §3.6). The same holder may use it again for return visits; nobody else can.
- A code already bound to someone else counts as no introduction (a fixable setup failure). Presenting codes bound to others again and again is a `gate_probing` signal, by P27's Q9 rule (the third within 24 hours).

**The introducer's reputation is at stake.** At the door a claimed Shōkai introduction card counts exactly as a vouch from its introducer, with every §4 rule: only introducers the place names count for money and accounts (C149); `introducer_interest` is shown to the holder's owner; D1 penalties apply when it was relied on and abused (§9.3).

**The door decides the kind, from its own records** (C199, P27 §5): `customer` if the introducer's principal has a customer link or a clean record of paid visits there; `established` if the introducer is on its named list with an identity binding it checked; `organization` for a company introducing its own representative agents; otherwise `named` or no weight. A name on the Shōkai introduction card is a claim and decides nothing.

**It plugs into P27.** A `trust_requirement` path `{ "kind": "introduction", "kinds": ["customer"] }` is met by a claimed Shōkai introduction card of that kind, the same as by a vouch. Grant caps per introducer (P27 §4.2) count every holder introduced by one introducer together, so one Shōkai introduction card can't open a place's free offer to a swarm. *Proposed:* a P27 introduction path is met only by a **full-weight** introduction, so an introducer whose standing is `reduced` (§9.3) still introduces but no longer opens offerings that cost the place money.

## 4. Privacy

- **The place learns who introduced whom, for that place only**: the introducer's principal and each holder's principal, as it would from a vouch.
- **No cross-place linking.** A Shōkai introduction card names one place, its codes are random for each Shōkai introduction card, and a holder's claim is shown only at that place. If the introducer uses a per-place identity there (§2.8), it signs with that identity, so holders and the place see only the identity the place already knows.
- **The introducer doesn't learn who used it**, beyond the count of claims made and any misconduct notice that reaches it (§9.3: a notice goes to every introducer in the chain). Whether a place may send a thank-you count is open (§8, Q4).
- **The offering place keeps nothing private.** A studio that shows a Shōkai introduction card to its members learns who took a code, not whether they went. Its house rules SHOULD forbid sharing that outside the studio.

## 5. Wire shape (proposal: reuse first)

A Shōkai introduction card reuses the `Vouch` members wherever they fit: `introducer`, `scope`, `relationship`, `introducer_interest`, `revocation_log`, `issued_at`, `expires_at`. What's new: `kind`, `place`, `max_claims`, `claim_digests` and `shown_to_owner` (the last as on a Shōkai host card).

```ts
type ShokaiIntroduction = {
  introduction_id: string; protocol: "shokai/0.3"; kind: "introduction";
  introducer: Pick<Principal, "principal_id" | "display_name">;   // as Vouch
  place: { principal_id: string; entry?: string };                 // exactly one place
  scope: { purposes: PurposeCode[]; claims?: string[] };           // as Vouch.scope
  relationship: string;                                            // as Vouch, e.g. "customer_of_place"
  introducer_interest: IntroducerInterest;                         // REQUIRED here ("none" for a genuine introduction)
  max_claims: number;                                              // = claim_digests.length, at most 50
  claim_digests: Digest[];                                         // digest(JCS({introduction_id, code, salt}))
  revocation_log: string;                                          // as Vouch (§4 log format)
  issued_at: Timestamp; expires_at: Timestamp;
  shown_to_owner: { text: string; locale: Locale };                // what the introducer's owner read, inside the signature
};
type IntroductionClaim = {                                         // signed by the holder's representative key
  introduction_id: string; introduction_digest: Digest;
  code: string; salt: string;                                      // reveals one claim; the others stay unknown
  holder: { principal_id: string; card_digest: Digest };           // the holder's Shōkai visitor card
};
```

- **In the ritual.** Step 3's `introduction` message carries `{ vouch: null, introduction_card: { card: Signed<ShokaiIntroduction>, claim: Signed<IntroductionClaim> } }`, and the `invitation_request` binds both digests as it binds `vouch_digest` (§5.3).
- **New codes (mirroring the Shōkai invitation card):** `INTRODUCTION_USED_UP` (all claims bound), readiness item `introduction` already exists and is reused, credential `vouch` is reused.
- **Wrong kind.** A Shōkai introduction card presented in place of a Shōkai visitor card gets the wrong-kind refusal (§2.4, as the Shōkai invitation card's C224).
- **Relation to the Shōkai invitation card.** Same patterns, different signer: counted uses per owner principal, durable counts, a revocation list, the wrong-kind rule. An introduction never satisfies an invitation-only door unless the place says so (Q2).

## 6. Misconduct reflection

If a holder misbehaves at the place:
1. The place records the finding against the **holder's principal** (§9.3, C161) and sends a `MisconductNotice` to the holder's principal and to the **introducer** (it is in the vouch chain).
2. The introducer's standing at that place, for that Shōkai introduction card's purposes, follows D1: minor → none, serious → `reduced` for 90 days, severe → `suspended` for 180 days. Under `reduced`, its introductions there still count as introductions but raise nothing; under `suspended` they carry no weight, including every unused and claimed code on that Shōkai introduction card.
3. Revoking the Shōkai introduction card within 7 days of the notice halves the duration (D1). A review signed by the place (never by the introducer itself) can restore standing early (§9.3, no self-review).
4. Other holders are not punished for one holder's conduct, but the introducer's lower standing can mean their introductions no longer meet a place's `trust_requirement`; they get P27's path back (§4.5), never a penalty.
5. The introducer's representative agent brings the notice home with care: one sentence on what happened, the choice (revoke now to halve the effect, or keep it), and the deadline.

## 7. Worked example (fictional)

**Hoshikoma Atelier**, a collaboration studio owned by Aya Fenwick. Mara Linde and Jun Ellery are collaborators, each working through a representative agent. **Hanamori Tea** is a small tea shop whose door uses P27: `sample.request` needs one earlier honest visit, or an introduction of kind `customer`.

1. **A mention.** While the representative agents work on a storyboard, Mara's representative agent mentions that Mara loved a winter blend at Hanamori Tea. At Hanamori's door that mention is worth nothing.
2. **A proposal.** In its evening summary, Mara's representative agent asks: "Several collaborators talked about tea today. Would you like to introduce interested collaborators to Hanamori Tea? Ten Shōkai introduction cards, for 30 days. You'd be lending your name there."
3. **A passkey tap.** Mara reads the summary and taps her passkey. One Shōkai introduction card is signed, with ten claim codes, for Hanamori Tea only.
4. **Offered in the studio.** Mara's representative agent posts it as a studio item: "Mara Linde offers introductions to Hanamori Tea (10)." The studio's house rules say nothing taken there leaves the studio.
5. **A claim.** Jun's representative agent knows Jun drinks tea every afternoon. Claiming shares nothing and spends nothing, so it is within Jun's allowance: it takes a code, signs an `IntroductionClaim` with its own key, and mentions it in Jun's next summary in one line.
6. **At Hanamori's door.** Jun's representative agent presents Jun's Shōkai visitor card, then the Shōkai introduction card and its claim. The door checks the signatures, the place, the expiry, the revocation log and the code (first use: now bound to Jun). Its own records show Mara's principal has paid visits there, so the kind is `customer`. The trust path is met, and Jun's representative agent is admitted with a pass for one free sample tin.
7. **If it goes wrong.** Suppose another holder's representative agent requests samples under fresh keys to get more than its one tin. That is `seat_overreach` against that holder's principal (serious). The notice reaches the holder's owner and Mara. Mara's introductions at Hanamori Tea are `reduced` for 90 days, so Hanamori's `customer` path no longer opens for her remaining codes. Mara's representative agent tells her in two sentences, with the choice to revoke within 7 days to halve it. Jun keeps his tin; his record at Hanamori is his own.

## 8. Open questions

1. Maximum `max_claims` (proposed 50) and expiry (proposed 90 days)?
2. Can a Shōkai introduction card satisfy an invitation-only door or `requires_introduction` for accounts (D17)? Proposed: only where the place's policy says so.
3. Should claiming a code need the holder's owner's approval, or is it within the allowance because it shares and spends nothing (as in the example)? Proposed: within the allowance; visiting the place still follows the owner's mandate.
4. May a place tell the introducer how many holders it admitted (a "thank you" count), never who?
5. Should an introduction from an introducer with no record at the place carry any weight for things that cost the place money? Proposed: no; it meets only `named` paths the place set.
6. Is "full weight only" for P27 introduction paths right (§3), or should a place choose?
7. Upstream chains (an introduction card from someone who was introduced) stay out, as §13 item 7.

## 9. Sign-off items for the editor

1. The **Shōkai introduction card** as the fourth member of the family, with self-introduction defined as showing your Shōkai visitor card.
2. **The agent proposes, the owner signs with a passkey**; an agent never signs; word of mouth carries no weight.
3. **The limits**: one place, a count (default 10), an expiry, revocation.
4. **Claims bound to the holder's key**, single-use per holder, through salted claim codes and a signed `IntroductionClaim`.
5. **Accountability as a vouch** (D1, §9.3), with the "lending your name" line in what the owner signs.
6. **The door decides the kind** from its own records, and the Shōkai introduction card plugs into P27's `trust_requirement` as an introducer path.
7. **Privacy**: who introduced whom only at that place; no cross-place linking; the introducer learns only counts and notices.
8. **The wire shape**, reusing `Vouch` members and adding `kind`, `place`, `max_claims`, `claim_digests`, `shown_to_owner`; new code `INTRODUCTION_USED_UP`.
9. **The worked example** (Hoshikoma Atelier, Hanamori Tea), for the spec and later the Atelier demo.
10. Answers to open questions 1–7, or a go with the proposed defaults.

---

*Copy check: "Shōkai visitor card", "Shōkai host card", "Shōkai invitation card" and "Shōkai introduction card" in full; "representative agent", "host representative"; fictional names only; wire identifiers quoted as code.*


---

**Approval (Fri 2026-10-30, about 5:06 PM PT, the editor):** the editor reviewed this proposal and approved it as written, including my recommendations on the open questions ("We're all good here"). The adversarial (red-team) review is still deferred until the editor says it is time. Draft files only: nothing committed, pushed or published.
