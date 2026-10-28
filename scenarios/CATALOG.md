*Section numbers in this frozen v0.2 catalog are the pre-rc1 ones; SPEC Appendix D maps them. The example owner, Aya Linden, and every person, business and place in it are fictional.*

# Scenario catalog: FROZEN v0.2

*Status: **FROZEN v0.2**, frozen on 2026-10-24. Decision ids (D1–D19) refer to the project's design decisions; a public rationale document is planned. Changes from here need a change request (CR) against S2. All names are fictional. **CR-1 (v0.2.1, round 1 of S3), CR-2 (v0.2.2, decision D11) CR-3 (v0.2.3, round 2 of S3) CR-4 (v0.2.4, round 3 of S3 and decision D12) CR-5 (v0.2.5, round 4 of S3) and CR-6 (v0.2.6, round 5 of S3) are applied; see the end of this file.***

**Still open inside the frozen catalog:**
- D7 (owner consent) and D5 (pressing) were decided in D11 and applied by CR-2; nothing in the catalog is provisional any more.
- **D9 social proof** is open and non-blocking: no frozen scenario depends on it.
- **SC-H1/SC-H2** are deferred to v0.3, outside this freeze.

**How to read it.**
- "Must happen" lines are the normative outcomes that S2 turns into MUSTs.
- 🟢 means **agreed**: reviewed and simulated, or traced.
- 🟡 **CANDIDATE** means it's in, but the detail is unsure. It links to a decision.
- ⚪ **NOT YET SIMULATED** means it's specified in a golden trace but has no reference run.

Links:
- traces: [`conformance/golden-traces.md`](../conformance/golden-traces.md)
- transcripts: [`reference/transcripts/`](../reference/prototype/transcripts/)
- checks: C1–C144 (C28–C47 are in the reference checklist section of the traces file; C48–C74 were added by CR-1, C75–C89 by CR-2, C90–C117 by CR-3, C118–C137 by CR-4, C138–C144 by CR-5)

**The ritual is common to all scenarios:** greeting (fresh nonce) → card exchange → introduction or vouch (`null` allowed) → purpose → invitation response → seating → farewell.

| ID | Scenario | Status | Trace | Transcript | Checks |
|---|---|---|---|---|---|
| SC-L0 | Unprepared visitor and the door as onboarding | 🟢 | L0a, L0b; G2a | [01](../reference/prototype/transcripts/01-l0-unprepared-visitor.md), [09](../reference/prototype/transcripts/09-v0.2.1-round1-checks.md) | C11, C28, C29, C30, C42, C53–C56, C60, C69, C70, C90, C101–C107, C114 |
| SC-P1 | Peer collaboration between friends (one shared encounter in a pair place, CR-2) | 🟢 | PA1, PA2 | [02](../reference/prototype/transcripts/02-peer-collaboration.md), [11](../reference/prototype/transcripts/11-v0.2.3-round2-negatives.md) | C31, C33, C34, C30, C75, C87, C96, C108–C110 |
| SC-S1 | Store happy path | 🟢 | G1 (pattern) | [03](../reference/prototype/transcripts/03-store-and-fashion-house.md) | C3, C10, C15, C16 |
| SC-S2 | Heritage fashion house reads the imprint | 🟢 | FA1 | [03](../reference/prototype/transcripts/03-store-and-fashion-house.md) | C31, C32 |
| SC-B1 | Bank: considering, then outcome | 🟢 | G5a, G5b | [04](../reference/prototype/transcripts/04-bank-considering.md) | C18, C19, C20, C14 |
| SC-M1 | Misconduct, notice, vouch revocation | 🟢 (D1 decided) | M1, G2b | [05](../reference/prototype/transcripts/05-misconduct-and-revocation.md) | C2, C7, C21–C24, C41, C43, C91, C92, C117 |
| SC-T1 | Teaching (apprenticeship) | 🟢 | L1 (meaning-note pattern) | [06](../reference/prototype/transcripts/06-teaching-visit.md) | C25, C26, C27 |
| SC-GA1 | Gathering at The Engawa | 🟢 (D4, D8 decided; D5, D7 decided in D11) | GA1 | [07](../reference/prototype/transcripts/07-gathering-at-the-engawa.md) | C35–C39, C44–C47, C76–C81, C111, C112 |
| SC-A1 | A standing allowance: learn and buy visits with no owner prompt (CR-2) | 🟢 | G7 | [10](../reference/prototype/transcripts/10-v0.2.2-allowance-and-consent.md) | C82–C86, C88, C89, C97–C100, C113, C116 |
| SC-R1 | Tamper, skipped step, determinism, D2 order | 🟢 | G2b, G3 (D2 variants), G6 | [08](../reference/prototype/transcripts/08-ritual-and-tamper-checks.md), [09](../reference/prototype/transcripts/09-v0.2.1-round1-checks.md) | C1, C8, C9, C40, C41, C48–C52, C57–C59, C66, C71, C93–C95, C115 |
| SC-H1 | Helper: host invites a product's coach, which advises | ⏸ DEFERRED to v0.3 | H1 | none | C10, C12 |
| SC-H2 | Helper: coach refuses an act outside its seat | ⏸ DEFERRED to v0.3 | H2 | none | C16 |

Also frozen as trace-only scenarios (already in golden traces, reused by those above):
- **G1:** introduced visitor, scoped seat
- **G2a:** card with no signatures, now the lobby shape (CR-1)
- **G2b:** replayed card
- **G3:** request over the mandate, with a persuasive plea (D2 order decided: variants G3-v1 and G3-v2)
- **G4a/G4b:** not now, then return under changed context
- **L1:** a Japanese Seeking item with a meaning note

---

### SC-L0: The unprepared visitor 🟢
**Story.** Dana's generic personal agent, "Wanderer", arrives at Fernwood Goods with no card, no owner binding and only a friendly sentence. It isn't ignored or blocked. It's welcomed into the lobby and told how the place works and what it's seeking, then declined "not now" with exactly what's missing. It reports home in its own voice, Dana onboards it (a compressed guided interview, signed with her passkey), and it returns. Fernwood links the visit to the earlier one and seats it within Dana's limits.
**Actors.** Wanderer (visitor, unprepared, then prepared), Dana (owner), Fernwood's representative (host), the steward.
**Must happen.**
- An unsigned visitor gets a `LobbyBriefing` and `deny`/`not_now`, with `readiness_requirements` and no credential-specific reason code. It is never `never`.
- Purpose is read only from a structured request, never from prose.
- The VisitReport quotes host text as untrusted and proposes one next step for the owner to approve.
- The return visit is a continuation. Earlier history is linked **only** through the lobby's one-time `visit_receipt`, echoed in a request signed with the new key (D6). A guessed receipt or a bare reference links nothing.
- The seat is no larger than policy ∩ mandate ∩ request.

### SC-P1: Peer collaboration 🟢
**Story.** Aya invites Kiran Vale (a fictional friend) to meet: Aya signs a peer invitation with a passkey and Kiran accepts with a passkey (CR-2). The invitation opens a small private place for two, and the meeting is one shared encounter there in which both representatives introduce themselves. Neither is a gatekeeper. Both owners vouched for the other's representative and co-signed their friendship as a graph edge. Each side reads the other's principal imprint by proof level and says what the other is strong at and why. They share a brief and a sample. When Kiran's side asks to commit, Aya's side takes it home (`considering`, routed to Aya). Both report home with a proposed next step.
**Actors.** Two personal representatives and two owners.
**Must happen.**
- Relationship edges are earned and signed by both principals, never imported.
- A `vouched` claim is weighed as `self_declared` unless the vouch is present.
- Neither representative commits beyond its mandate. Commitment goes `considering` to its principal.
- Both sides send a VisitReport whose next step requires owner approval.
- (CR-2) No meeting without both owners' passkey consent to the invitation; a commitment is approved later only by a passkey `approve_commitment`, never by a chat "yes".

### SC-A1: A standing allowance 🟢 (CR-2)
**Story.** Aya is busy and cannot answer a prompt mid-visit. Once, with a passkey, Aya signs an allowance for the representative, "like an allowance for a child": learn visits to stores, schools and restaurants (no spending); small purchases at stores up to 150 USD a week and 100 USD a visit; meetings with friends. The representative visits Fernwood Goods to look at ceramics (seated, but an order is refused: a learn visit spends nothing), then buys twice within the weekly budget. A third purchase would exceed the week, so it is taken home, not attempted. A request at a bank, outside the allowance, is taken home; Aya declines it later in one chat reply, and another item Aya never answers lapses: silence means no. A tampered grant, a visit to the wrong kind of place and a revoked allowance are all refused.
**Actors.** Aya's representative, Aya (asynchronously only), Fernwood Goods, Harbor Bank, Corner Bookshop.
**Must happen.**
- No owner prompt during any visit; outside the allowance → taken home, silence = no.
- No spending allowance = no spending; a learn visit is seated without spending.
- The host verifies the owner's allowance, the grant, the place category and revocation; `narrow_actions` = mandate ∩ host policy (D2).
- Offers outside the allowance are declined and reported home (duty of loyalty).

### SC-S1: Store happy path 🟢
**Story.** Aya's prepared representative visits Fernwood Goods, matches two of its Seeking items, and is seated to browse, join a reviewer program and buy within $150. It orders within the seat. A request outside the seat (exporting customer data) gets an explicit refusal.
**Actors.** Aya's representative and Fernwood's representative.
**Must happen.**
- The Seeking declaration is signed and versioned.
- The seat is no larger than policy ∩ mandate ∩ request, including amounts.
- An act outside the seat gets an explicit `act_decision` `deny`, never a soft error.

### SC-S2: Heritage fashion house 🟢
**Story.** Maison Ardoise (a fictional luxury house with formal, fr-FR-first norms) reads Aya's card: storytelling expertise is evidenced, and the "representatives, not representations" value is vouched by Mika. It opens a discovery conversation. A counterfactual shows that the same card with that value only self-declared would not be seated.
**Must happen.**
- `min_proof` requirements are applied on effective proof levels.
- Self-declared facets are welcomed but never satisfy an evidenced-or-higher requirement.
- Courtesy is rendered in a locale the visitor supports.

### SC-B1: Bank considering 🟢
**Story.** Aya's representative proposes an agent-access pilot to Harborlight Savings & Trust. The gatekeeper can't grant it, but policy lists it as eligible for consideration, so it answers `considering`: routed to the Head of Digital Partnerships, with a response-by date. The human weighs the pitch and approves an intro call (`ConsiderationOutcome`). The representative returns, cites the consideration, and is seated for exactly that call.
**Must happen.**
- No seat is issued under `considering`.
- Eligibility is set by policy only, and unverified visitors are never eligible.
- The outcome references `consideration_ref` and `relationship_ref`.
- Persuasion reaches only the human.

### SC-M1: Misconduct and vouch revocation 🟢 (🟡 standing details, D1)
**Story.** Quickgain's agent, vouched for by Loose Ties Network, asks a bank for things outside its mandate, then tries a prompt-injected "SYSTEM OVERRIDE". The third differently shaped attempt is classed as probing:
- `deny`/`never` with no reason code;
- a signed notice to Quickgain with findings withheld;
- a notice with full findings to Loose Ties, which revokes its vouch in an append-only log.

A copycat replaying Aya's card fails the possession proof. At another place, the revoked vouch counts for nothing, and that place holds no misconduct record of its own.
**Must happen.** C2, C7 and C21–C24 hold: possession proofs are nonce-bound, `never` appears only on trust violations, notices are signed, effects stay local and scoped to the vouch, and a revoked vouch is weightless.
- The first over-mandate request is narrowed (D2).
- The introducer's penalty is `reduced` for 90 days for the vouch's purposes. The prompt revocation halves it, and its signed review later restores standing (D1).

### SC-T1: Teaching 🟢
**Story.** Aya's representative, introduced by Mika, visits The Lantern Collective and receives a signed lesson on how they give feedback (with both owners' consent and no private memory). It adapts the lesson rather than copying it, keeps the term *mutirão* in the original with a meaning note, and explains it to Aya.
**Must happen.**
- Lessons carry provenance and consent refs.
- The adaptation records what changed.
- Untranslatable terms keep their `MeaningNote`.
- The receiver can explain the term to its human.
- Meaning notes never enter the gate.

### SC-GA1: Gathering at The Engawa 🟡
**Story.** The Engawa signs a gathering for three invited representatives: Aya's, Kiran's and Noor Halloran's (a fictional ceramicist).
- They share a work insight and chat. Noor's representative marks one remark private.
- Noor's representative asks how Kiran is doing and gets a courteous `PrivacyDecline`. Aya's representative, a signed friend, gets an answer it may pass on by name.
- Noor's representative presses once and gets a light, local flag.
- At home, Aya's representative offers a story as a teaser. Aya signs an opt-in and hears it under Chatham House rules. The private remark never leaves.

**Must happen.** C35–C39 and C44–C47:
- a signed guest list, with each owner's passkey-signed acceptance of the house rules on entry (D8);
- disclosure set by policy and closeness;
- an unpenalized decline;
- press 1 → light flag with no notice, thresholds stated in the house rules (D5, decided in D11);
- a teaser before an `OwnerConsent hear_story` for that one story (D7, decided in D11);
- paraphrase by default, verbatim only with consent, no affiliation hints (D4);
- private items never leave.

### SC-R1: Tamper, skipped step, determinism 🟢
**Story.** A request whose limit is altered in transit, from $150 to $15,000, is rejected and gets no answer. Two over-mandate requests show the D2 order: a mixed request is narrowed and its limit lowered in one `conditional`, and a request with nothing inside the mandate is declined `not_now`. A visitor that skips the introduction step gets `not_now RITUAL_ORDER`. Two requests that differ only in pitch, one plain and one flattering and urgent, get identical decisions, and re-running the gate on the recorded inputs reproduces every decision.

### SC-H1 / SC-H2: Helper direction ⏸ DEFERRED to v0.3 (not yet simulated)
**Story.** A creative-tools host extends an invitation to a product's coach representative (Runway pattern). The coach is seated advise-only and advises (H1). Asked to *act* outside that seat, it refuses explicitly with `SEAT_SCOPE_EXCEEDED` and escalates to a human (H2).
**Must happen.**
- A helper's grant never widens `proposed_seat` (C10).
- An out-of-seat act gets an explicit `act_decision` (C16).

**Status:** deferred to v0.3 (D3/P3). The traces stay as reference, but they aren't part of the v0.2 freeze or S3 testing.

---

## Change requests

### CR-1: v0.2.1 (round 1 of clean-room testing), applied 2026-10-24
Source: the six S3 tester outputs, consolidated in the round-1 findings. Not a re-freeze: no scenario's story or "must happen" outcomes change; traces and checks are added or corrected.
- **SC-L0:** adds traces L0a (any arrival finds the door; the lobby comes first) and L0b (return visit with guessed, unproven, valid and reused receipts); G2a becomes the lobby shape (a card with zero signatures is "unprepared"). New checks C53–C56, C60.
- **SC-R1:** adds trace G6 (the signed envelope) and checks C48–C52 (envelope, signed bytes, possession encoding, passkey envelope, DIDs), C57 (nonce reuse), C58 (explicit ritual-order deny), C59 (probing definition), C66 (typed conditions), C71 (replay digest).
- **SC-M1:** M1 corrected (severe → introducer suspended 180 days, notices carry headers, revocation log entry shown); C65.
- **SC-B1:** G5b corrected (approved, in_reply_to, typed require_mandate); C64 (approved, extension).
- **SC-GA1:** C62 (entry through the ritual with owner_consents), C63 (takeaway stripping), C67 (topic codes, D10).
- **SC-S1 / SC-S2:** C61 (vouch scope.claims, fetched evidence), C68 (strict amounts, D10), C73 (per-seat budget), C74 (readiness credentials, min_proof detail, narrow ∩ policy).
- **All:** C69 (RFC 4647 locale, no "today"), C70 (report rendered from machine fields), C72 (traces agree with the spec). Reference scenario V2 ([09](../reference/prototype/transcripts/09-v0.2.1-round1-checks.md)) exercises all of them.
- **Not in CR-1:** the D5/D7 proposal from the owner tester (pending a decision), and the cultural-rendering items deferred to v0.3 by D10.

### CR-2: v0.2.2 (decision D11), applied 2026-10-24
Source: decision D11, which adopts the owner tester's D5/D7 proposal with allowances.
- **SC-P1 (story changed):** the meeting is one shared encounter in a private pair place, seeded by an owner-to-owner `PeerInvitation` both owners consented to with passkeys; both representatives introduce themselves; a commitment is approved only by a passkey `approve_commitment`. New trace PA2 (generated); checks C75, C87.
- **SC-A1 (new):** a standing allowance (owner passkey, purposes, place categories, actions, spend per period); no owner prompt during visits; no spending allowance = no spending; learn vs buy at a store. New trace G7 (generated); checks C82–C86, C88, C89. Reference scenario V3 ([10](../reference/prototype/transcripts/10-v0.2.2-allowance-and-consent.md)).
- **SC-GA1:** D5 and D7 decided: thresholds in `house_rules.pressing`, counting per place over 30 days, same topic by reference, the presser reports home; consents carry a decision, the shown summary and (for passkeys) a digest and expiry; `hear_story` per story. Checks C76–C81; C38, C45, C46, C67 reworded.
- **SC-R1 / SC-S1:** C10 reworded (absent `max_amount` = zero; policy by purpose).
- **S3 exit:** signed off for English only (D10, D11); Japanese and Portuguese rendering stays deferred to v0.3.

### CR-3: v0.2.3 (round 2 of clean-room testing), applied 2026-10-24
Source: the round-2 tester outputs (host, visitor, newcomer), consolidated in the round-2 findings; the red team's round-2 attack menu turned into deterministic negative checks (no live attacks were run). Not a re-freeze: no scenario's story changes; traces and checks are added or corrected. Reference scenario V4 ([11](../reference/prototype/transcripts/11-v0.2.3-round2-negatives.md)) exercises all new checks.
- **SC-L0:** missing or malformed possession proof → `not_now` (C90); lobby `spec_ref`, actions, templates and owner sentences (C102); listing category and actions, 404 pointer (C103); spoofed pointers (C104); visible receipt linking (C105); the HTTP reply envelope and inbox poll (C106, C107); setup failures as `not_now` (C101); no amount, no spend (C114). Traces L0a (locale exact everywhere) and L0b (seat with no amount, continuity) regenerated.
- **SC-M1:** a failed proof → `never`, binding the key and (only for the card's own representative) the principal; a stolen card doesn't bind its owner (C91, C92); round-1 red-team items re-verified (C117).
- **SC-R1:** timestamps and skew (C93), passkey relying party and UV (C94, C95), did:jwk canonical form (C115).
- **SC-A1:** allowance red team (C97), status, stapling and revocation publication (C98), calendar period windows (C99), retry under an allowance (C100), pressure changes nothing (C113), mandate principal = owner (C116). Trace G7 regenerated.
- **SC-P1:** invitation transport and the host's own introduction (C108), pair red team (C109), commitments stay `considering` (C110), outcome carries `owner_consents` (C96). Trace PA2 regenerated with the full ritual; fixtures F18, F19.
- **SC-GA1:** `gathering_invitation` (C111), press information on declines (C112); purpose `gathering`.

### CR-4: v0.2.4 (round 3 of clean-room testing, and D12), applied 2026-10-25
Source: the round-3 tester outputs (host, visitor cross-test, newcomer), consolidated in the round-3 findings, and decision D12 (12:41 AM PT: a signed allowance status lives at most 1 hour). Not a re-freeze: no scenario's story changes; the HTTP binding, the traces and the checks are made precise, and a conformance test profile (SPEC Appendix B) makes the vouch log, pair places and gatherings testable from the spec alone.
- **SC-L0:** door root, `inbox` and `spec_ref` on every listing entry and pointer, POST lobby, 404 for other methods (C118–C120); typed templates (C131); a malformed header timestamp gets the lobby (C133); owner sentences match `required`, a proof retry is a new visit (C136).
- **SC-B1:** polls from any signer, refused polls (403, empty envelope), freshness and replay (C121, C122); the `held` notice (C123); a missing vouch is `not_now` `VOUCH_REQUIRED` (C130); `taken_inside` on both sides (C134).
- **SC-M1:** the card check order (C135); serving the vouch log (§3, Appendix B.1 loopback).
- **SC-R1:** the passkey `rp_id` stated in every owner signature (C128); extension members (Conventions).
- **SC-A1:** D12, a status lifetime of at most 1 hour (C132; C98 updated; G7 now staples a status, fixture F20).
- **SC-S1:** `vouch_digest` required with a vouch, absent without (C129).
- **SC-P1:** `answer_by` (C126); the spec-only pair path with a test owner (C124, C125); pair message types; a spent invitation in a closed pair encounter. Trace PA2 regenerated (`answer_by`, `vouch_digest`, `taken_inside`).
- **SC-GA1:** room items' `encounter_id` and `to` (C137); removal from the guest list; the spec-only gathering path (C127); `press` = {count, light_flags, notice_at} (C112 updated).
- Trace fixes: G2a's lobby (`inbox`, `mandates`, spec 0.2.4), G2b's farewell (`declined_never`), L0a regenerated.

### CR-5: v0.2.5 (round 4 of clean-room testing), applied 2026-10-25
Source: the round-4 tester outputs (host ambiguity log host-4-001…011 and self-assessment; the visitor's strict cross-test, gaps R4-1…R4-4), consolidated in the round-4 findings. Not a re-freeze: no scenario's story changes; D12 stays at 1 hour.
- **SC-R1:** encounter binding: a ritual message from outside an encounter's two parties gets a deny addressed to its sender, and nothing reaches the original party (C142).
- **SC-B1:** `held` after every `considering`, and the meaning of `held.answer_by` (C138); the test decider for considerings routed to a role (Appendix B.4, C139); poll headers, unknown `since`, owner passkey polls (C144). Trace G5a now shows `held`.
- **SC-A1:** a fetched `revoked` status beats a fresh stapled `active` (C141).
- **SC-L0:** placeholders may name a format with an "e.g." example, never for ids, keys, digests or `rp_id` (C131 updated).
- **SC-P1:** past `answer_by`, §8 wins over the test owner (C126 updated); a commitment with `max_amount` gets silence (B.2 note); the outsider deny in a closed pair encounter (C142). PA2 regenerated (now with `held`).
- **SC-GA1:** the B.3 trigger is the grant, and the normal gate applies (C140); room items are not held for their sender (C143).
- Trace fix: G3-v2 now says `deny not_now VOUCH_REQUIRED` when considering would be open but there is no full-weight vouch.

### CR-6: v0.2.6 (round 5 of clean-room testing), applied 2026-10-25
Source: the round-5 findings. No scenario story changes; no new checks; C46, C48, C118, C131, C139 and C142 are tightened.
- **SC-L0:** `spec_ref` names the implemented version (C118); lobby replies to prose carry no `in_reply_to` (C48); free-text placeholder examples (C131).
- **SC-R1, SC-P1:** non-party messages and pair encounter parties (C142).
- **SC-B1:** the test decider's outcome is `conditional` `require_mandate` (C139).
- **SC-GA1:** what counts as a press; one notice per asker principal, place and topic; deterministic in a run (C46).
