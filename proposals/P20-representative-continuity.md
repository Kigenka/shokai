<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P20 (draft): representative continuity and history

*Status: draft, 2026-10-27. Not in SPEC.md, not normative yet. D25 in [DECISIONS.md](../DECISIONS.md) is partly decided (see "Decisions" at the end): the **Continuity** extension (export, succession, the handover ceremony and the memory envelope) is planned as optional for v0.3; place-signed receipts and presentation (§4) wait for v0.4, after a field test with two places. Written against v0.3.0-rc4. Sketch verifiers and vectors: [`tools/p20-sketch.mjs`](../tools/p20-sketch.mjs), [`P20-vectors.json`](./P20-vectors.json).*

The key words in "Proposed text" blocks would be read as BCP 14 (RFC 2119, RFC 8174) **if adopted**. Until then they state what is proposed, and nothing in this document binds an implementation.

## 1. Problem

People will change agents. They will move from one vendor to another, run two agents for different parts of their life, or replace an agent whose key leaked. Today Shōkai answers part of this. A place keys its `RelationshipRecord` by the counterpart *principal* (SPEC §9.1), so a new card under the same owner identity already meets the same record. The rest is unanswered:

1. **No portable history.** What a representative has done (visits, introductions, vouches, the decisions places made) lives in places' records and in the agent's memory. Neither travels when the owner changes agents. In practice it belongs to whoever runs the agent.
2. **No statement of continuity.** Nothing says "representative B continues representative A". A place can't tell a replacement from a second representative, and state keyed per representative is lost: seats, bound visit-receipt keys (Visit receipts extension), and earned edges whose `from` is a representative id (§9.2).
3. **No rule for several representatives** of one owner at one place.
4. **An honest Sybil story is missing.** Per-place owner identities (§2.8) let an owner start over at a place. The text names the floor (the uninvited allowance and introducer accountability) but doesn't treat history as a defence, or say what it can't do.

## 2. Three things that must stay apart

| | What it is | Who holds it | Signed by | In scope |
|---|---|---|---|---|
| **Card** | The owner's grant of authority to one representative key (SPEC §2.3) | The representative, shown at doors | The owner (passkey) | Yes, core |
| **Agent memory** | Whatever the agent keeps to do its job: conversations, preferences, notes, models | The agent and its vendor | Nobody, by the protocol | **No.** The protocol MUST NOT require carrying it, reading it or proving anything about it |
| **History** | Portable evidence of what happened: place-signed receipts, vouches given and received, place decisions including `never` | **The owner** | Each statement by the party that made it | This proposal |

### 2.1 Whose it is (decided, D25)

A representative belongs to its owner, not to the agent vendor. A company's representative belongs to the company: the owner is the organization (`kind: "company"`), and the history is the organization's. An employee's own share is a matter for their contract, outside the protocol.

Text for the Continuity extension:
- *A Shōkai-compatible agent MUST let its owner export the owner's full Shōkai history at any time, in the format of §2.2: cards, receipts, introductions (vouches given and received), successions and handovers, and the lineage (§5.3). It MUST NOT make an export depend on keeping the vendor's service, and MUST NOT leave out unfavourable items.*
- *An agent SHOULD let its owner export its private memory too, and if it does, only as a `MemoryHandover` envelope (§7). The protocol never defines or reads what is inside.*

A specification can't force a vendor to do this. It can make it part of what "Shōkai-compatible" means, so owners and places can prefer agents that do it.

Memory stays out of the core on purpose. It is private and changes all the time, and it often holds other people's data. A rule that needed it could not be checked, and it would push vendors to expose what they should protect.

### 2.2 The export format

```ts
type HistoryExport = {
  format: "shokai-history/1";
  exported_at: Timestamp;
  owner_ids: string[];                       // every owner identity (facet) the agent used for this owner
  cards: SignedCard[];                       // every card issued to this owner's representatives, retired ones included
  receipts: Signed<HistoryReceipt>[];        // §4; empty until a place issues them (v0.4)
  vouches_given: SignedVouch[];
  vouches_received: SignedVouch[];
  successions: Signed<RepresentativeSuccession>[];
  handovers: Signed<MemoryHandover>[];       // envelopes only; ciphertext travels separately, if at all
  lineage?: Lineage;                         // §5.3
};
```

The bundle itself is unsigned: every item in it is signed by whoever made it, and a reader verifies item by item. Anything the agent can't verify is still exported, unchanged.

## 3. Goals and non-goals

**Goals.**
- An owner can switch agents without losing standing, and without being able to wash away a bad record.
- History is verifiable without trusting the agent or its vendor.
- History respects per-place owner identities (§2.8). It is per facet, and linking is always the owner's act.
- No new trust root, no registry and no central log.

**Non-goals.**
- Proof of personhood.
- Moving reputation scores between places (D3: reputation stays local; receipts state facts, never scores).
- Any standard for agent memory.
- Biometrics, government ID or other personal data as history.

## 4. History: the owner-held receipt log

### 4.1 The receipt

A **history receipt** is a statement a place signs about one thing that happened in its relationship with one owner facet. It is a `Signed<HistoryReceipt>` in the ordinary envelope (§2.2; JCS, Ed25519 over the raw digest, or the place's did:web key).

```ts
type HistoryReceiptKind =
  | "visit"                  // a seated visit took place (stamps, §"Visit stamps" pattern, are a visit receipt with a picture)
  | "decision"               // a final decision: grant / conditional / deny with its disposition, including "never"
  | "introduction_received"  // this place admitted the subject on a vouch from `introducer`
  | "introduction_given"     // the subject's owner vouched for someone at this place, and the place relied on it
  | "vouch_honoured"         // a vouch the subject's owner gave was relied on and the visitor behaved (no notice within 30 days)
  | "conduct"                // a misconduct notice was issued or withdrawn (§9.3); the notice itself stays the record
  | `x-${string}`;

type HistoryReceipt = {
  receipt_id: string;                 // unique per place
  kind: HistoryReceiptKind;
  place: string;                      // the place's principal DID; MUST equal the signer
  subject: {
    owner_id: string;                 // the owner identity (facet) used AT THIS PLACE (§2.8)
    representative_id: string;        // the representative that was there
    card_digest: Digest;              // the card it showed
  };
  seq: number;                        // 1, 2, 3 … per (place, subject.owner_id), no gaps
  prev?: Digest;                      // payload_digest of receipt seq-1 for the same pair; absent iff seq = 1
  at: Timestamp;
  encounter_ref?: string;             // opaque to everyone but the place; NEVER a visit-receipt nonce (those are bearer secrets)
  decision?: { decision: "grant" | "conditional" | "deny"; disposition?: Disposition; reason_code?: ReasonCode };
  introducer?: string;                // principal DID, for the introduction kinds
  vouch_ref?: string;                 // vouch_id, for the introduction kinds
  notice_ref?: string;                // for "conduct"
  statement?: { text: string; locale: Locale };   // informative words; machine fields win
};
```

Proposed text:
- *A place that adopts this proposal SHOULD give the visiting representative a receipt for every final decision and every seated visit, unfavourable ones included. It MAY give receipts for the other kinds.* Giving an owner a signed `never` is the protocol's clear answer (a decision with a reason and a retry, never a silent 403) applied to history.
- *A place MUST sign receipts with its principal key, MUST number them per (place, owner facet) with `seq` and `prev` as above, and MUST NOT put in a receipt anything the visit did not already carry.* No scores, no inferred traits and no data the owner didn't share.
- *A receipt MUST NOT contain a visit-receipt nonce, a bearer secret, a payment reference or an introducer's private reasons.*
- *A representative MUST keep every receipt it is given in its owner's log, including unfavourable ones, and MUST NOT drop a receipt without the owner's instruction.*

### 4.2 The log

The owner's history is an append-only collection of receipts plus the owner's own copies of the vouches they gave and received (SPEC §4; vouches are already signed by their introducers). There is no global chain. Each place's receipts form their own chain per facet, so:

- the owner, or the issuing place, can see a gap in that place's chain;
- a third place shown receipt `seq = n` learns that `n − 1` earlier receipts from that place exist, without seeing them.

**What a log can't prove (normative intent).** An owner shows what they choose. A log proves that the receipts in it happened. It doesn't prove that nothing else happened. Proposed text: *A place MUST NOT treat the absence of unfavourable receipts as evidence of good conduct, and MUST weigh receipts itself, by issuer, as evidence at most (§2.5 proof levels; never `verified` for the conduct described).* The defence against hiding a bad record is §5 (at the place that made the decision), not the log.

### 4.3 Presenting history: per facet, owner-chosen

A receipt's subject is the owner identity used at *that* place. Showing it at a second place shows that place the first facet. So presentation is an act of linking, and it has the same rules and effect as an `OwnerLink` (§2.8, C196).

```ts
type HistoryPresentation = {
  presentation_id: string;
  audience: string;            // the principal DID of the one place it is shown to
  presenter_owner: string;     // the owner identity used at the audience (the card's principal)
  nonce: string;               // fresh, from the audience: the lobby's challenge or the greeting nonce (§2.4)
  receipts: Digest[];          // payload_digests of the receipts shown, in order
  issued_at: Timestamp;
  expires_at: Timestamp;       // at most 10 minutes after issued_at
};
// carried as InvitationRequest.history?: { presentation: Signed<HistoryPresentation>; receipts: Signed<HistoryReceipt>[] }
```

Proposed text:
- *The presentation MUST be signed by the passkey of `presenter_owner` and by the passkey of every other `subject.owner_id` among the receipts.* One signature per facet; the owner sees every receipt on the signing page (A.1; a batch is allowed, D23).
- *A place MUST refuse a presentation for another audience, with a nonce it didn't issue, or past its lifetime, and then judges the request without it.*
- *For the audience, a valid presentation joins the facets it names exactly as an `OwnerLink` would: records, conduct and `never` bindings, add-only. The place MUST NOT forward or publish it.*

Consequences, stated plainly:
- An owner can show a teahouse's good receipts at a bookshop. The bookshop learns the teahouse facet, and if the two places compare notes they can join that owner. Unlinkability holds against places the owner never shows (§12.3).
- Selective disclosure of single *fields* inside a receipt (for example the date without the place) is not offered. Whole receipts only. See §11, Q1.

## 5. Succession: "representative B continues representative A"

### 5.1 The statement

```ts
type RepresentativeSuccession = {
  succession_id: string;
  owner_id: string;                                  // the owner identity at the places it is shown to
  from: { representative_id: string; card_id: string; card_digest: Digest };
  to:   { representative_id: string; card_id: string; card_digest: Digest };
  effective_at: Timestamp;                           // B may act from here; not earlier than issued_at − 300 s
  overlap_until?: Timestamp;                         // A may keep acting until here; at most 14 days after effective_at
  from_status: "revoked" | "retired_after_overlap";
  reason?: "agent_switch" | "key_rotation" | "vendor_exit" | "other";
  audience?: string;                                 // the one place this copy is for; REQUIRED with hikitsugi (§5.3)
  hikitsugi?: { introduce: boolean; farewell_digest?: Digest };   // the owner approves the ceremony at that place (§5.3)
  issued_at: Timestamp;
};
// Signed<RepresentativeSuccession>: one ES256 passkey signature by owner_id.
// Delivered in an invitation_request (`succession`) or as a standalone "representative_succession" message, like card_revocation (§2.6).
```

Proposed text:
- *A place MUST accept a succession only if it is signed by `owner_id`'s passkey, `owner_id` is the principal of B's card (`to.card_digest` matches the card shown), and, when the place knows A's card, `from.card_digest` matches it.* A stolen representative key cannot create a succession. A stolen owner passkey can, exactly as it can issue a card.
- *From `effective_at`, the place MUST treat B as continuing A: everything it keeps per representative for A (relationship record entries, `never` bindings that bound A only (§2.4 step 1), conduct notices, standing, bound continuity keys) applies to B. A succession can only add; it never clears or shortens anything.*
- *A's card ends at `overlap_until`, or at `effective_at` when there is no overlap: after that the place treats it as revoked (§2.6, reason `superseded`). The owner SHOULD also publish a `CardRevocation` for A.* The overlap lets an owner move without a gap while both agents finish open work. It is short because two live agents are two keys to protect.
- *Chains (A→B→C) are followed. A succession that would make a representative continue itself, directly or through a chain, is ignored. Two successions from the same A (forks) are both applied, and the place SHOULD treat the later `issued_at` as the current one.*
- *Across owner identities: a succession whose `from` card belongs to another of the owner's identities MUST come with an `OwnerLink` for this audience (§2.8).*

### 5.2 Why switching agents can't launder a record

There are three cases:

1. **Same owner identity, new agent.** The place's record is keyed by the principal (§9.1), so B meets A's record with or without a succession. A succession adds the per-representative state. It can't remove anything, because it is add-only.
2. **Same owner identity, B without a succession, hiding A.** It changes nothing. The principal is the same and so is the record.
3. **A fresh owner identity with a new agent.** This is the real path to a clean slate. Per-place identities (§2.8) allow it by design, and nothing here can close it cryptographically. The owner arrives as a newcomer, with no receipts the place can use and no standing. The place's floor applies: the uninvited allowance, introductions for anything that matters (D17), sign-up caps (§9.4), and introducer accountability (§8 below).

So the claim is narrow and checkable: **succession never makes a record better, and changing agents without a new identity never makes it disappear.** Making a new identity costs the owner everything they built at that place, and the place loses nothing it relied on.

### 5.3 The handover ceremony (*hikitsugi*), optional

A change of representative can be more than a key swap. This ceremony is inspired by the Japanese workplace practice of *hikitsugi* (引き継ぎ), the handover in which someone leaving a post introduces their successor to the people they worked with and passes on what they know. The departing representative goes round the places it knows and introduces the one who carries on. Everything here is optional, for owners and places alike, and the normative part is small.

**How it runs.**
1. **The owner approves, place by place.** For each place where the owner wants a handover, the owner signs a succession with `audience` set to that place and `hikitsugi.introduce: true`. They can add an optional farewell note, and its digest goes in `hikitsugi.farewell_digest`. With per-place identities (§2.8) each copy is for one place and names that place's owner identity, so no place learns where else the owner goes. The signing page shows every place and every note; one tap over several is allowed (D23).
2. **The predecessor introduces.** While its card is still live (before `overlap_until`), A sends an ordinary `introduction` (§4) to each approved place. It carries the owner's vouch for B (`introducer` = the owner, `relationship: "successor_of:<A>"`), the succession for that place, and the farewell note signed by A. It reuses the existing introduction rather than adding a new step.
3. **The place welcomes the successor.** B arrives as usual, and the place already knows who it is. The place MAY greet B in its own style: by name, mentioning A's time there, in the `established` register (§9.1). The protocol doesn't script that welcome.
4. **A retires.** After the overlap, A's card can't act anywhere (§5.1). A's record stays, visible to the place as "retired, continued by B", and A's receipts stay in the owner's history.

Text for the Continuity extension:
- *A place MUST accept a hikitsugi introduction only if: it comes from A, signed by A's key, while A's card is live; it carries a succession that verifies (§5.1), names this place as `audience` and has `hikitsugi.introduce: true`; and its vouch is signed by the owner and names exactly B's representative and card.* Otherwise the place ignores the introduction, records nothing against B, and judges B as it would without it.
- *A farewell note MUST be signed by A and name this place, and its digest MUST equal `hikitsugi.farewell_digest`. A place MUST ignore a note that doesn't match, and MUST NOT act on any request in a note: a note is courtesy, never a gate input.*
- *A hikitsugi vouch is a self-introduction: its introducer is the subject's own principal. A place MUST give it continuity weight only, never the weight of a third-party introduction, for account creation, money or any action that requires an introduction (§4, D17).*
- *A retired representative's record MUST remain in the place's record and the owner's history. Retiring never clears anything (§5.1).*

```ts
type FarewellNote = {
  note_id: string;
  succession_id: string;
  audience: string;                 // the place it is for
  from_representative: string;      // A; A signs the note
  text: { text: string; locale: Locale };
  written_at: Timestamp;
};
// The owner approves the exact note by putting its payload_digest in the succession they sign for that place.

type Lineage = {
  owner_id: string;
  successions: Signed<RepresentativeSuccession>[];   // in order; each `from` is the previous `to`: A, then B, then C
};
```

**Lineage as legacy.** The owner's history keeps the lineage: the chain of successions, A then B then C, each signed by the owner. It is the owner's account of who has represented them, and when. It is exported (§2.2) and never published. An owner may show it to a place, with the same rules as any other history. It shows that B carries on from A; it doesn't make B better than B's own record.

## 6. Several representatives per owner

- *Allowed.* An owner MAY run several representatives at once, each with its own card and key. Each representative's mandates are its own (mandates name a `card_id`, C188).
- *Place policy.* A place MAY limit how many representatives of one owner are active at once. Proposed listing member on a place entry: `representatives_per_owner?: { max_active: number }`. "Active" means seated or in an open encounter.
- *Detection, within the place's own facet only.* Two representatives are the same owner's when their cards name the same principal (canonical DIDs, §2.1), or when an `OwnerLink`, presentation or succession joined them at this place. A place can't see across facets and MUST NOT try (no fingerprinting of wording, timing or network to join facets; §12.3).
- *Over the limit.* A newcomer representative of an owner already at the limit gets `not_now` with retry `after` the soonest expected seat end. The proposed reason code is `OWNER_REPRESENTATIVE_LIMIT`, or `RATE_LIMITED` until a code is registered. The place MUST NOT unseat the representative already there (as D14 for encounter caps). Nothing is recorded against anyone.
- *Owner-level caps.* Caps a place keeps per owner (sign-ups, §9.4; any per-owner spending cap a place sets) already count across all of a principal's representatives. A place that sets per-visit limits SHOULD count them per owner when it limits active representatives, so that two representatives don't double a cap the place meant per person.

## 7. Memory handover: an envelope only

### 7.1 What the protocol defines

```ts
type MemoryHandover = {
  handover_id: string;
  owner_id: string;
  from_representative: string;
  to_representative: string;
  recipient: { key_id: string; kem: "DHKEM(X25519, HKDF-SHA256)"; public_key: string };  // a key the receiving agent publishes for this
  suite: { kem: 32; kdf: 1; aead: 2; mode: "base" };   // HPKE (RFC 9180): X25519, HKDF-SHA256, AES-256-GCM
  enc: string;                       // HPKE encapsulated key, base64url
  ciphertext_digest: Digest;         // SHA-256 of the ciphertext bytes
  ciphertext_ref?: string;           // where the receiving agent fetches it; delivered outside the protocol otherwise
  content_type: string;              // opaque to the protocol (a vendor's export format)
  created_at: Timestamp;
  expires_at: Timestamp;             // at most 30 days after created_at
};
// Signed<MemoryHandover>: the owner's passkey. HPKE info = "shokai memory handover v1"; aad = the payload_digest.
```

### 7.2 Rules

Proposed text:
- *A handover is between the owner's agents only. It MUST NOT be shown to places, and a place MUST NOT ask for one.*
- *The protocol defines no content schema, and no rule depends on what the ciphertext holds.*
- *A receiving agent MUST check the owner's signature and the ciphertext digest before decrypting, and MUST refuse a handover that isn't addressed to its own key.*
- *Nothing in this specification requires any agent to export or import memory.*

### 7.3 Why only an envelope

The owner's signature shows the move was the owner's choice, and HPKE keeps the content from everyone else. What the memory contains, and whether the new agent can use it, are product questions. Standardising them would make memory a protocol object that places could someday ask for.

## 8. Sybil and farm resistance: what holds and what doesn't

**What passkeys do.** Every owner signature is a user-verified assertion (A.1). Making an owner identity costs a passkey credential and a human tap. That raises the cost of a farm, but it is **not proof of personhood**. One person can hold many credentials, and a farm can hold many devices. Shōkai does not claim otherwise.

**What history does.** Receipts make *age* and *breadth* expensive to fake only when the issuers are places the receiving place has reason to trust. Receipts from a ring of farm-run places prove nothing. Proposed text: *A place MUST weigh a receipt by its issuer, and SHOULD give no weight to receipts from issuers it doesn't know.*

**The main defence: introducer accountability.** Anything that matters (money, accounts, D17) needs an introduction. An introducer's standing is penalised, locally and in grades (D1), when the people they vouch for misbehave, and "accept any introducer" never covers money or sign-ups (D14). A farm has to buy or build introducers places already trust, and loses them when it is caught. This was true before P20, and P20 doesn't replace it.

**Optional place policy hooks.** All of them are listed in the listing so a visitor knows before arriving, and the owner may always decline.
- `requires_introduction` (exists, §3.1).
- *Proposed:* `history_ask?: { kinds: HistoryReceiptKind[]; min_age_days?: number; issuers?: "any" | "known" }`. The place may ask for receipts at least this old from issuers it knows. Declining to show history is never misconduct, and it gets the same answer as having none.
- *Proposed:* `representatives_per_owner` (§6).

**Out of scope, deliberately.** No biometrics, liveness checks, face or voice data, government ID or other personal data as history or as a Sybil defence in this protocol. A place that needs legal identity uses its own process outside Shōkai, under `data_asks` (§3.1).

## 9. Why this matters (informative)

Relationships between people and places grow over time: a regular is known, a newcomer is welcomed, and a broken promise is remembered. This proposal tries to let representatives take part in that without taking it over.

The record stays with the person and not with whoever built their agent. Accountability survives a change of tools. Consent decides what is shown and to whom.

None of this makes the protocol humane by itself. It only stops the protocol from getting in the way of people who are.

## 10. Threat model additions

| Threat | Effect without P20 | With P20 | Residual |
|---|---|---|---|
| Forged receipt | — | Place signature over JCS; issuer is the signer | A place's key theft forges its receipts (as for any place statement) |
| Another owner presents my receipts | — | Presentation must be signed by each subject facet's passkey, audience- and nonce-bound | A stolen owner passkey can present (as it can sign a card) |
| Replay of a presentation | — | Fresh audience nonce, 10-minute lifetime | — |
| Owner hides unfavourable receipts | — | Absence is never evidence (§4.2); the issuing place keeps its own record (§5.2) | A third place sees only what it's shown |
| Laundering a record by switching agents | Same principal: record kept (§9.1) | Succession is add-only; A's per-representative bindings carry to B | Fresh owner identity = newcomer (§5.2, case 3) |
| Hijack by succession | — | Needs the owner's passkey; a representative key can't sign it | Owner passkey theft (P18) |
| Two live agents double limits | Per-card mandates | `max_active`; per-owner counting (§6) | Places that don't set the policy |
| Facet joining through history | — | Presentation = owner link, audience-only, MUST NOT forward | Colluding places that were each shown a facet |
| Receipt farms (rings of fake places) | — | Weigh by issuer; unknown issuers get no weight | A place that trusts a bad issuer |
| Vendor lock-in of history | History lives with the vendor | Export is a conformance duty (§2); receipts are signed by places, not vendors | A non-conforming agent |
| Memory handover leaks | — | HPKE to the receiving agent's key; owner-signed; never shown to places | The receiving agent itself |
| Forged farewell note (wording the owner never approved, e.g. a request for a discount) | — | The note's digest must equal the one in the owner-signed succession; A signs it; notes are never gate inputs | — |
| Predecessor introduces at a place the owner didn't approve | — | The succession must name that place as `audience` with `introduce: true`; otherwise the introduction is ignored | A stolen owner passkey |
| Stolen predecessor key used during the overlap to introduce someone else | — | The vouch must be the owner's and name exactly B's card | A can still act within its card until the overlap ends; keep overlaps short, revoke on suspicion (§2.6) |
| Self-introduction passed off as a real introduction | — | A hikitsugi vouch gets continuity weight only, never third-party weight (D17) | — |
| A retired card used after its overlap | — | Treated as revoked; can't act or introduce | — |
| Succession copies reveal where else the owner goes | — | One audience-bound copy per place, under that place's owner identity | Places shown the lineage see the representatives in it |
| History as surveillance | — | Owner-held; no registry or global log; places MUST NOT publish | `seq` reveals visit counts to whoever is shown a receipt (§11, Q4) |

## 11. Open questions

1. **Field-level selective disclosure.** Should receipts be issued as SD-JWT or with BBS signatures, so an owner can show "a visit before 2026-06" without the place or date? It costs a second signature scheme, and the benefit for small places is unclear.
2. *Closed (D25):* a signed receipt for a `never` is SHOULD, not MUST.
3. *Closed (D25):* receipts don't expire. A place MAY weigh recency. The place's own retention rules stay as they are (§3.6: `never` for 180 days).
4. **Does `seq` leak too much?** It reveals how many receipts a place has issued for the facet. An alternative is a per-receipt hash commitment with no counter, which would give up gap detection.
5. *Closed (D25):* a company's representative belongs to the company (owner = organization), and so does its history (§2.1).
6. **Owner key loss.** Succession needs the owner's passkey. Owner key continuity is P18; the two should share one recovery story.
7. **Registered codes.** `OWNER_REPRESENTATIVE_LIMIT`, the receipt kinds, and `history_ask` would need registry entries.

## 12. Interaction with the Personal Agent Protocol sketch

This is illustrative only, extending the sketch in [docs/relationship-to-other-protocols.md](../docs/relationship-to-other-protocols.md#the-personal-agent-protocol). Nothing has been proposed to that protocol's authors, and Shōkai is not affiliated with them.

- **Pairwise identifiers and facets fit.** Poppy gives each company a different user identifier, and Shōkai's per-place owner identity is the same idea for owners. A receipt issued in a Poppy context would name the facet used with that company.
- **A history extension, later.** The owner-mandate extension sketched there could get a sibling that carries a `HistoryPresentation` after sign-in, audience-bound to the company. The company would verify it exactly as §4.3 says. Presenting before sign-in would undo Poppy's pairwise privacy, so the sketch would forbid it.
- **Switching agents.** A succession statement could tell a company that a new agent continues the old one, alongside whatever Poppy's own agent identifiers and sessions do. It must never be used to carry a session or token across agents.
- **What stays Shōkai's.** Introducer accountability, place-signed decisions including `never`, and history across places that aren't companies.

## 13. Sketch vectors

[`P20-vectors.json`](./P20-vectors.json) holds test-key vectors (labels in the file; Appendix A.2 derivation), and [`tools/p20-sketch.mjs`](../tools/p20-sketch.mjs) checks them. It runs in `tools/run-all-suites.sh`.

| ID | Case | Expected |
|---|---|---|
| P20-R1 | Place-signed visit receipt | verifies |
| P20-R2 | Chained decision receipt recording `never` (seq 2, `prev` = R1's digest) | verifies |
| P20-R3 | A receipt checked against another place | `place` |
| P20-R4 | The chain link | `prev` matches |
| P20-R5 | A receipt to the owner's other facet, from another place, with its own card and key | verifies |
| P20-P1 | A presentation of facet 1's receipt at the bookshop, signed by both facets | verifies; links facet 1 for that audience |
| P20-P2 | The same, signed only by the presenting facet | `owner_signature` |
| P20-P3 | Replay with another nonce | `nonce` |
| P20-S1 | Succession A → B, 7-day overlap | verifies; A ends at the overlap |
| P20-S2 | Succession signed by someone other than B's principal | `not_this_owner` |
| P20-S3 | Overlap longer than 14 days | `overlap` |
| P20-H1 | Memory handover envelope | verifies |
| P20-H2 | Swapped ciphertext | `ciphertext_digest` |
| P20-K1 | Hikitsugi at an approved place, with the approved farewell note | verifies; weight is continuity only |
| P20-K2 | A forged farewell (another note than the one approved) | `farewell_not_approved` |
| P20-K3 | The predecessor introducing at a place the owner didn't approve | `audience` |
| P20-K4 | The owner's vouch naming someone other than the successor | `vouch_subject` |
| P20-K5 | An introduction from the predecessor after its card ended | `predecessor_retired` |
| P20-L1 | Lineage A → B → C | verifies |
| P20-L2 | Lineage out of order | `lineage` |
| P20-E1 | A history export (`shokai-history/1`) | every item verifies; no memory plaintext |

## Decisions (2026-10-27, D25)

- **Export.** Exporting the full Shōkai history is a MUST for a Shōkai-compatible agent. Exporting private memory is a SHOULD, envelope only. A representative belongs to its owner, and a company's representative to the company (§2.1).
- **Never receipts.** A signed `never` receipt is SHOULD, not MUST.
- **Expiry.** Receipts don't expire; places MAY weigh recency.
- **Numbers kept:** a 14-day maximum overlap, a 10-minute presentation lifetime, a 30-day handover lifetime, and 30 days for `vouch_honoured`.
- **Path.** Continuity (§2 export, §5 succession and the handover ceremony, §7 memory envelope) becomes an optional extension in v0.3. Place receipts and presentation (§4) are deferred to v0.4, after a field test with two places. §6 (several representatives) and §8 (Sybil) go with Continuity as written.
- **Still open:** Q1 (field-level selective disclosure), Q4 (`seq` leakage), Q6 (shared recovery with P18), Q7 (registry entries).
