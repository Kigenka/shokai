# Bank: taking it inside, then an answer

> Aya's representative proposes an agent-access pilot to a fictional savings bank. The gatekeeper can't grant that itself, but it's eligible by policy, so it takes the idea inside to a human. A week later the human says yes, and the representative returns, is recognized, and is seated for an introductory call.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| Aya's representative | Personal representative of Aya |
| Harborlight's gatekeeper | Representative of Harborlight Savings & Trust (fictional bank) |
| Head of Digital Partnerships | A human inside the bank (fictional role) |
| Mika | Fictional friend who vouches |


## First visit: the proposal

1. **Aya's representative → Harborlight's gatekeeper:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Harborlight's gatekeeper → Aya's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Good afternoon. Welcome to Harborlight Savings & Trust."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
3. **Aya's representative → Harborlight's gatekeeper:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Harborlight's gatekeeper checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Harborlight's gatekeeper → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
5. **Aya's representative → Harborlight's gatekeeper:** presents an introduction: Mika (fictional friend of Aya) vouches (friend_of_many_years) for x-partnership, teaching, collaboration.
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the vouch from Mika (fictional friend of Aya): signature, subject and expiry all check out.
6. **Harborlight's gatekeeper:** reads Aya Linden's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Aya Linden, a person | verified | **verified** | the card itself is signed with the owner's passkey |
| claim.domain: Aya controls aya.example | verified | **verified** | domain key at did:web:aya.example matches the principal (simulated did:web) |
| imprint.expertise: Product design for agent-to-agent protocols | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.expertise: Brand storytelling for heritage projects | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.worldview: Agents are representatives, not representations | vouched | **vouched** | signed for by Mika (fictional friend of Aya) |
| imprint.working_style: Warm, unhurried and honest; decides with evidence | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |
| imprint.taste: Restraint and Japanese-inspired hospitality | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |

   - Up front, Harborlight's gatekeeper can say this representative is strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced); worldview: Agents are representatives, not representations (vouched). Self-declared items are welcomed, but they aren't weighed.
7. **Aya's representative → Harborlight's gatekeeper:** states its purpose (x-partnership) and asks for: bank.propose_agent_pilot.
   - The pitch, in its own words (prose: it never enters the gate): "A small pilot where verified, owner-bound representatives can ask product questions safely."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the mandate "Propose an Shōkai access pilot to Harborlight and attend an intro call": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
8. **Harborlight's gatekeeper → Aya's representative:** answers.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "I can't decide this myself. I'll take it to Head of Digital Partnerships, who decides, and reply within 14 days. Nothing is decided yet."
   - ⚙️ Machine decision: `decision=considering  routed_to=Head of Digital Partnerships  response_by=2026-11-09T16:00:00Z  ref=cons-bank-1  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
9. **Harborlight's gatekeeper → Aya's representative:** held
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
   - Why considering and not a no: proposing a pilot is outside the bank's standard policy, but it's on the policy's consideration list, and the visitor is verified, owner-bound and introduced. Eligibility is decided by policy alone; only the human inside will weigh the pitch.
10. **Aya's representative → Harborlight's gatekeeper:** says farewell (taken_inside).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
11. **Harborlight's gatekeeper → Aya's representative:** says farewell (taken_inside).
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.

## Inside the bank, a human decides

1. **Head of Digital Partnerships:** reads the proposal and the pitch (this is the proper place for persuasion) and approves an introductory call.
2. **Harborlight's gatekeeper → Aya's representative:** sends the outcome of consideration cons-bank-1, decided by Head of Digital Partnerships.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Good news: our team would like to go ahead. Please return to begin."
   - ⚙️ Machine decision: `decision=grant  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.

## Returning to be seated

1. **Aya's representative → Harborlight's gatekeeper:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Harborlight's gatekeeper → Aya's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Welcome back. It's good to see you again."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
3. **Aya's representative → Harborlight's gatekeeper:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Harborlight's gatekeeper checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Harborlight's gatekeeper → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
5. **Aya's representative → Harborlight's gatekeeper:** presents an introduction: Mika (fictional friend of Aya) vouches (friend_of_many_years) for x-partnership, teaching, collaboration.
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the vouch from Mika (fictional friend of Aya): signature, subject and expiry all check out.
6. **Aya's representative → Harborlight's gatekeeper:** states its purpose (x-partnership) and asks for: bank.pilot_intro_call. It refers to its earlier visit (bank-1-harborlights-3). It refers to consideration cons-bank-1.
   - The pitch, in its own words (prose: it never enters the gate): "Returning as invited."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Harborlight's gatekeeper checked the mandate "Propose an Shōkai access pilot to Harborlight and attend an intro call": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
7. **Harborlight's gatekeeper → Aya's representative:** answers.
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Welcome back. This time we can seat you. Thank you for returning prepared."
   - ⚙️ Machine decision: `decision=grant  seat=[bank.pilot_intro_call]  limits={}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.
8. **Aya's representative → Harborlight's gatekeeper:** says farewell (seated).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Harborlight's gatekeeper checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
9. **Harborlight's gatekeeper → Aya's representative:** says farewell (seated).
   - 💬 *Harborlight's gatekeeper says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…gaDW4q) and the content fingerprint.

**Aya's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Aya, good news from Harborlight.
> Last week their gatekeeper couldn't approve the pilot idea itself, but it was eligible, so they took it to their Head of Digital Partnerships.
> The answer came back yes to an introductory call. I went back, they recognized our earlier visit, and they seated me for exactly that call, nothing more.
> Suggested next step: pick a time for the call.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-bank-2",
  "representative_id": "did:key:z6MkemVbTktPzmkxsE3DofhwHkrzdEK58Ew23JmE21GWmACv",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9",
  "host": {
    "display_name": "Harborlight's gatekeeper"
  },
  "visited_at": "2026-11-01T17:00:00Z",
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated for: bank.pilot_intro_call.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "bank.pilot_intro_call"
    ],
    "limits": {}
  },
  "host_said": [
    {
      "text": "Welcome back. It's good to see you again.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Welcome back. This time we can seat you. Thank you for returning prepared.",
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
    "text": "Approve a time for the intro call with Harborlight's Head of Digital Partnerships.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Aya, good news from Harborlight.\nLast week their gatekeeper couldn't approve the pilot idea itself, but it was eligible, so they took it to their Head of Digital Partnerships.\nThe answer came back yes to an introductory call. I went back, they recognized our earlier visit, and they seated me for exactly that call, nothing more.\nSuggested next step: pick a time for the call.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-harborlight-1"
}
```

</details>

