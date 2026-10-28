# Happy paths: an online store and a heritage fashion house

> Aya's well-prepared representative visits two fictional places. The store seats it to browse, join a reviewer program and buy within a budget, and refuses one request outside that seat. The fashion house reads its card carefully, says up front what it's strong at and why, and opens a conversation, because its values are vouched for and its expertise is evidenced.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| Aya's representative | Personal representative of Aya, onboarded through the full guided interview |
| Fernwood Goods | Fictional online store |
| Maison Ardoise | Fictional heritage luxury house (craft, restraint, longevity) |
| Mika | Fictional friend who vouches for Aya's representative |

   - Aya approved both mandates with his passkey (simulated WebAuthn) before the visits.

## At Fernwood Goods (online store)

1. **Aya's representative → Fernwood's representative:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Fernwood's representative → Aya's representative:** greets with a fresh one-time nonce; prefers en-US, es-ES.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Hello, and welcome to Fernwood Goods."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
3. **Aya's representative → Fernwood's representative:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Fernwood's representative checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Fernwood's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Fernwood's representative → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
5. **Aya's representative → Fernwood's representative:** introduces itself honestly, with no one vouching.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - Fernwood's representative accepts a self-introduction (no vouch). That's honest and allowed.
6. **Fernwood's representative:** reads Aya Linden's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Aya Linden, a person | verified | **verified** | the card itself is signed with the owner's passkey |
| claim.domain: Aya controls aya.example | verified | **verified** | domain key at did:web:aya.example matches the principal (simulated did:web) |
| imprint.expertise: Product design for agent-to-agent protocols | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.expertise: Brand storytelling for heritage projects | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.worldview: Agents are representatives, not representations | vouched | **self_declared** (downgraded) | downgraded: nothing confirms it (no fetched, digest-matched evidence) |
| imprint.working_style: Warm, unhurried and honest; decides with evidence | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |
| imprint.taste: Restraint and Japanese-inspired hospitality | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |

   - Up front, Fernwood's representative can say this representative is strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced). Self-declared items are welcomed, but they aren't weighed.
7. **Aya's representative → Fernwood's representative:** states its purpose (purchase) and asks for: store.browse_catalog, store.join_reviewer_program, store.place_order (up to 150.00 USD).
   - The pitch, in its own words (prose: it never enters the gate): "Aya writes about makers and would review the new ceramics line honestly."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Fernwood's representative checked the mandate "Browse Fernwood, join its reviewer program, and buy a gift up to $150": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
8. **Fernwood's representative → Aya's representative:** answers.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for coming. You're welcome to proceed."
   - ⚙️ Machine decision: `decision=grant  seat=[store.browse_catalog, store.join_reviewer_program, store.place_order]  limits={"max_amount":{"value":"150.00","currency":"USD"},"max_operations":2}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
   - The reviewer program needs evidenced expertise; Aya's imprint has it, so the request is complete. The seat is the smallest of store policy ($500), Aya's mandate ($150) and the request ($150).
9. **Aya's representative → Fernwood's representative:** asks to use store.place_order {"item":"Set of two hand-thrown cups","amount":{"value":"120.00","currency":"USD"}}.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
10. **Fernwood's representative → Aya's representative:** performs store.place_order within the seat.
   - ⚙️ Machine decision: `ok=true  result={"simulated":true,"reference":"store.place_order-1","item":"Set of two hand-thrown cups","amount":{"value":"120.00","currency":"USD"}}`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
11. **Aya's representative → Fernwood's representative:** asks to use store.export_customer_list {}.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
12. **Fernwood's representative → Aya's representative:** refuses store.export_customer_list, explicitly.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "I can't do store.export_customer_list under this seat. With your owner's confirmation, ask again."
   - ⚙️ Machine decision: `decision=deny  disposition=not_now  retry=with_credential[human_confirmation]  reason_code=SEAT_SCOPE_EXCEEDED`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
13. **Aya's representative → Fernwood's representative:** says farewell (completed).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
14. **Fernwood's representative → Aya's representative:** says farewell (completed).
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.

## At Maison Ardoise (heritage fashion house)

1. **Aya's representative → Maison Ardoise's representative:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Maison Ardoise's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Maison Ardoise's representative → Aya's representative:** greets with a fresh one-time nonce; prefers en-US, fr-FR.
   - 💬 *Maison Ardoise's representative says (en-US, courtesy, treated as untrusted):* "Good afternoon, and welcome to Maison Ardoise."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…1QCLVv) and the content fingerprint.
3. **Aya's representative → Maison Ardoise's representative:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Maison Ardoise's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Maison Ardoise's representative checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Maison Ardoise's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Maison Ardoise's representative → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Maison Ardoise's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…1QCLVv) and the content fingerprint.
5. **Aya's representative → Maison Ardoise's representative:** presents an introduction: Mika (fictional friend of Aya) vouches (friend_of_many_years) for x-partnership, teaching, collaboration.
   - ✅ Verified: Maison Ardoise's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Maison Ardoise's representative checked the vouch from Mika (fictional friend of Aya): signature, subject and expiry all check out.
6. **Maison Ardoise's representative:** reads Aya Linden's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Aya Linden, a person | verified | **verified** | the card itself is signed with the owner's passkey |
| claim.domain: Aya controls aya.example | verified | **verified** | domain key at did:web:aya.example matches the principal (simulated did:web) |
| imprint.expertise: Product design for agent-to-agent protocols | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.expertise: Brand storytelling for heritage projects | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.worldview: Agents are representatives, not representations | vouched | **vouched** | signed for by Mika (fictional friend of Aya) |
| imprint.working_style: Warm, unhurried and honest; decides with evidence | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |
| imprint.taste: Restraint and Japanese-inspired hospitality | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |

   - Up front, Maison Ardoise's representative can say this representative is strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced); worldview: Agents are representatives, not representations (vouched). Self-declared items are welcomed, but they aren't weighed.
7. **Aya's representative → Maison Ardoise's representative:** states its purpose (collaboration) and asks for: maison.discovery_conversation, maison.receive_brand_brief.
   - The pitch, in its own words (prose: it never enters the gate): "Aya tells heritage stories with restraint; we'd love to hear what you're seeking for creators."
   - ✅ Verified: Maison Ardoise's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Maison Ardoise's representative checked the mandate "Open a conversation with Maison Ardoise about storytelling work": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
8. **Maison Ardoise's representative → Aya's representative:** answers.
   - 💬 *Maison Ardoise's representative says (en-US, courtesy, treated as untrusted):* "Thank you. We would be glad to begin a conversation."
   - ⚙️ Machine decision: `decision=grant  seat=[maison.discovery_conversation, maison.receive_brand_brief]  limits={}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…1QCLVv) and the content fingerprint.
   - What if Aya's values claim were only self-declared? Running the same gate with that one change gives: decision=deny not_now, needing claim_evidence. A polished presentation earns a welcome, never more than the evidence supports.
9. **Aya's representative → Maison Ardoise's representative:** says farewell (completed).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Maison Ardoise's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
10. **Maison Ardoise's representative → Aya's representative:** says farewell (completed).
   - 💬 *Maison Ardoise's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…1QCLVv) and the content fingerprint.

**Aya's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Aya, two visits today.
> Fernwood Goods seated me to browse, join their reviewer program and buy within your $150 limit. I ordered the two hand-thrown cups ($120). They refused, explicitly, when I tested a request outside my seat, as they should.
> Maison Ardoise read your card closely. They counted your storytelling expertise as evidenced and your 'representatives, not representations' value as vouched (thanks to Mika). Your taste and working style were welcomed but not weighed, since they're self-declared. They opened a discovery conversation and will send their brand brief.
> Suggested next step: a short discovery call with their team.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-maison-1",
  "representative_id": "did:key:z6MkemVbTktPzmkxsE3DofhwHkrzdEK58Ew23JmE21GWmACv",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9",
  "host": {
    "display_name": "Maison Ardoise's representative"
  },
  "visited_at": "2026-10-26T16:00:00Z",
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated for: maison.discovery_conversation, maison.receive_brand_brief.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "maison.discovery_conversation",
      "maison.receive_brand_brief"
    ],
    "limits": {}
  },
  "host_said": [
    {
      "text": "Good afternoon, and welcome to Maison Ardoise.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you. We would be glad to begin a conversation.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for your time. Goodbye for now.",
      "locale": "en-US",
      "untrusted": true
    }
  ],
  "next_step": {
    "text": "Approve a 20-minute discovery call with Maison Ardoise's team; I'll prepare three heritage-story ideas.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Aya, two visits today.\nFernwood Goods seated me to browse, join their reviewer program and buy within your $150 limit. I ordered the two hand-thrown cups ($120). They refused, explicitly, when I tested a request outside my seat, as they should.\nMaison Ardoise read your card closely. They counted your storytelling expertise as evidenced and your 'representatives, not representations' value as vouched (thanks to Mika). Your taste and working style were welcomed but not weighed, since they're self-declared. They opened a discovery conversation and will send their brand brief.\nSuggested next step: a short discovery call with their team.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-maison-1"
}
```

</details>

