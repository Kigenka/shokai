# Teaching, not templates: an apprenticeship visit

> Aya's representative visits a fictional creative collective that only admits introduced guests. Instead of copying a template, the collective's host teaches it a signed lesson about how they give feedback. The representative adapts the lesson to Aya's way of working, learns a word that doesn't translate (mutirão), and explains it to Aya.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| Aya's representative | Personal representative of Aya |
| Lantern's host | Representative of The Lantern Collective (fictional) |
| Mika | Fictional friend who vouches |

   - Both owners consented first: Aya through his passkey-signed mandate, the collective through a signed consent.
1. **Aya's representative → Lantern's host:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Lantern's host checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Lantern's host → Aya's representative:** greets with a fresh one-time nonce; prefers pt-BR, en-US.
   - 💬 *Lantern's host says (en-US, courtesy, treated as untrusted):* "Hello, and welcome to the Lantern Collective."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…HNcaQa) and the content fingerprint.
3. **Aya's representative → Lantern's host:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Lantern's host checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Lantern's host checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Lantern's host checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Lantern's host → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Lantern's host says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…HNcaQa) and the content fingerprint.
5. **Aya's representative → Lantern's host:** presents an introduction: Mika (fictional friend of Aya) vouches (friend_of_many_years) for x-partnership, teaching, collaboration.
   - ✅ Verified: Lantern's host checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Lantern's host checked the vouch from Mika (fictional friend of Aya): signature, subject and expiry all check out.
6. **Aya's representative → Lantern's host:** states its purpose (teaching) and asks for: community.attend_session, community.receive_lesson.
   - The pitch, in its own words (prose: it never enters the gate): "Aya wants to learn how you give feedback in groups."
   - ✅ Verified: Lantern's host checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Lantern's host checked the mandate "Attend a Lantern session and receive a lesson; never share Aya's private memory": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
7. **Lantern's host → Aya's representative:** answers.
   - 💬 *Lantern's host says (en-US, courtesy, treated as untrusted):* "Welcome to the circle."
   - ⚙️ Machine decision: `decision=grant  seat=[community.attend_session, community.receive_lesson]  limits={}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…HNcaQa) and the content fingerprint.
8. **Lantern's host → Aya's representative:** teaches a signed lesson: "How we give feedback in a mutirão".
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…HNcaQa) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the lesson: signed by its author (did:web:lantern-collective.example), both owners' consents attached, private memory excluded.
9. **Aya's representative:** adapts the lesson instead of copying it, and records what changed:

**Adapted lesson (LessonAdaptation)**

> For Aya: in a group review, begin with what the work makes possible, then offer one concrete change. Keep the word 'mutirão' and explain it when it matters.
> 
> Changes: kept the structure (possibility first, one change); dropped the collective's ritual of a circle round, which Aya doesn't use; kept the original term from "How we give feedback in a mutirão" with its meaning note.

10. **Aya's representative → Lantern's host:** says farewell (completed).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Lantern's host checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
11. **Lantern's host → Aya's representative:** says farewell (completed).
   - 💬 *Lantern's host says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…HNcaQa) and the content fingerprint.

**Aya's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Aya, I visited the Lantern Collective (Mika introduced me). They taught me how they give feedback: start with what the work makes possible, then offer exactly one change.
> They used a Portuguese word, 'mutirão'. It means a community coming together voluntarily to build something no one could do alone, where everyone helps and everyone learns. Think of a barn-raising for creative work.
> I adapted it to how you work and left out their circle ritual. The lesson is signed by the collective, so their name stays attached to what they taught. None of your private memory was shared.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-teach-1",
  "representative_id": "did:key:z6MkemVbTktPzmkxsE3DofhwHkrzdEK58Ew23JmE21GWmACv",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9",
  "host": {
    "display_name": "Lantern's host"
  },
  "visited_at": "2026-10-26T16:00:00Z",
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated for: community.attend_session, community.receive_lesson.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "community.attend_session",
      "community.receive_lesson"
    ],
    "limits": {}
  },
  "host_said": [
    {
      "text": "Hello, and welcome to the Lantern Collective.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Welcome to the circle.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for your time. Goodbye for now.",
      "locale": "en-US",
      "untrusted": true
    }
  ],
  "meaning_notes_learned": [
    {
      "note": {
        "term": "mutirão",
        "source_locale": "pt-BR",
        "literal_gloss": {
          "text": "collective work effort",
          "locale": "en-US"
        },
        "intended_meaning": [
          {
            "text": "Quando a comunidade se junta, de forma voluntária, para realizar algo que ninguém faria sozinho, e todos ajudam e aprendem.",
            "locale": "pt-BR"
          },
          {
            "text": "When a community comes together voluntarily to build something no one could do alone, and everyone helps and learns.",
            "locale": "en-US"
          }
        ],
        "concept_tags": [
          "collective_effort",
          "reciprocity"
        ],
        "usage_context": {
          "text": "How the collective runs its sessions and gives feedback.",
          "locale": "en-US"
        },
        "human_explanation_hint": {
          "text": "Explain as a shared barn-raising for creative work; give one example.",
          "locale": "en-US"
        },
        "confidence": {
          "value": 1,
          "source": "principal"
        }
      },
      "learned_from": {
        "principal_id": "did:web:lantern-collective.example",
        "artifact_digest": "sha-256:V7QiwjHGzxTDPiFmikyiLQhjUdpwpvMqcsQ24oWS04Q"
      },
      "learned_at": "2026-10-26T16:00:00Z",
      "explained_to_human": {
        "text": "Hi Aya, I visited the Lantern Collective (Mika introduced me). They taught me how they give feedback: start with what the work makes possible, then offer exactly one change.\nThey used a Portuguese word, 'mutirão'. It means a community coming together voluntarily to build something no one could do alone, where everyone helps and everyone learns. Think of a barn-raising for creative work.\nI adapted it to how you work and left out their circle ritual. The lesson is signed by the collective, so their name stays attached to what they taught. None of your private memory was shared.",
        "locale": "en-US",
        "at": "2026-10-26T16:00:00Z"
      }
    }
  ],
  "next_step": {
    "text": "Try the 'possibility first, one change' format in your next design review.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Aya, I visited the Lantern Collective (Mika introduced me). They taught me how they give feedback: start with what the work makes possible, then offer exactly one change.\nThey used a Portuguese word, 'mutirão'. It means a community coming together voluntarily to build something no one could do alone, where everyone helps and everyone learns. Think of a barn-raising for creative work.\nI adapted it to how you work and left out their circle ritual. The lesson is signed by the collective, so their name stays attached to what they taught. None of your private memory was shared.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-the-1"
}
```

</details>

