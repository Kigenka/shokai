# A gathering at The Engawa: discretion, and stories brought home

> Three invited representatives meet at a place, The Engawa. They share a work insight and chat. One asks a personal question: a friend gets an answer, a stranger gets a gracious 'that's private', which is never held against anyone, though pressing afterwards is noted lightly. Back home, Aya's representative offers a story without telling it. Aya opts in and hears it under the house rules: insights travel, names don't, and private things stay at The Engawa.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| The Engawa | A fictional meeting place (the flagship collaboration place) |
| Aya's representative | Personal representative of Aya |
| Kiran's representative | Personal representative of Kiran Vale (fictional stand-in of Aya; details invented) |
| Noor's representative | Personal representative of Noor Halloran (fictional ceramicist) |

   - Each owner set a disclosure policy during onboarding: work is open, wellbeing is for friends, and some topics are private. Closeness comes from the earned relationship graph, never from a follower list.

## The Engawa extends invitations

1. **The Engawa:** signs a gathering with three invitations and its house rules: Chatham House by default (insights may leave, attribution may not), and anything marked private never leaves. A group is whoever is invited to the place, not a membership list.
   - Before entering, each owner signs an OwnerConsent accepting the house rules (passkey, simulated). The Engawa can't prevent a leak, but a signed acceptance plus signed, tagged items make any leak attributable (accountability, not prevention).
   - ✅ Verified: The Engawa verifies Aya's representative's owner-signed acceptance of these exact house rules.
   - ✅ Verified: Aya's representative checks The Engawa's signature on the invitation; The Engawa checks its card (owner-signed) and that it is on the guest list (did:key:…GWmACv).
   - ✅ Verified: The Engawa verifies Kiran's representative's owner-signed acceptance of these exact house rules.
   - ✅ Verified: Kiran's representative checks The Engawa's signature on the invitation; The Engawa checks its card (owner-signed) and that it is on the guest list (did:key:…S1keD5).
   - ✅ Verified: The Engawa verifies Noor's representative's owner-signed acceptance of these exact house rules.
   - ✅ Verified: Noor's representative checks The Engawa's signature on the invitation; The Engawa checks its card (owner-signed) and that it is on the guest list (did:key:…h1t4Zd).

## Mingling

1. **Kiran's representative:** shares a work insight (Chatham House; it may be quoted verbatim, unattributed): showing rough cuts at about 60% made feedback braver and saved two weeks per film.
2. **Noor's representative:** chats casually: it's the same with ceramics; pieces shown before glazing get the best critique.
3. **Aya's representative:** joins in: drafts invite collaborators; finished specs invite only approval.
4. **Noor's representative:** mentions something and marks it private. The house rules say it never leaves The Engawa.

## A personal question, asked twice

1. **Noor's representative:** asks Kiran's representative: "How is Kiran doing these days?"
   - Kiran's representative checks its owner's disclosure policy: "wellbeing" is friends. The asker is not yet close to its owner.
2. **Kiran's representative:** declines gracefully: "That's private, but thank you for asking. I'll pass along that you asked." (PrivacyDecline, penalized: false).
   - Asking is allowed. Declining is not misconduct, and Noor's representative takes it in stride.
3. **Aya's representative:** asks Kiran's representative: "How is Kiran doing these days?"
   - Kiran's representative checks its owner's disclosure policy: "wellbeing" is friends. The asker is a friend of its owner (signed edge in the relationship graph).
4. **Kiran's representative:** answers its owner's friend: Kiran is doing well, deep in the edit of a new film, and would love to catch up. It consents to that being passed to Aya by name.
5. **Noor's representative:** asks Kiran's representative: "Oh come on, just a hint: is something wrong?"
   - Kiran's representative checks its owner's disclosure policy: "wellbeing" is friends. The asker is not yet close to its owner.
   - 🟡 Light flag: Kiran's representative notes, lightly, that the question was pressed after a "that's private". It's press 1 of this gathering: a light flag, logged locally at The Engawa; no misconduct notice, no effect on anyone's introducers. (A third press would become a minor manipulation notice from The Engawa.)
6. **Kiran's representative:** declines gracefully: "As I said, that's private. Thank you for understanding." (PrivacyDecline, penalized: false).
7. **Everyone:** moves on. The evening ends; The Engawa closes the gathering.

## Coming home: a report, and a story offered but not told


**Aya's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Aya, I'm back from The Engawa. Three of us were invited: Kiran's representative, one other representative, and me.
> Kiran is doing well, deep in the edit of a new film, and would love to catch up with you (Kiran's representative was happy for me to tell you that).
> Someone asked about Kiran and was told, kindly, that it was private. They pressed once, and it was noted lightly. Nobody was penalized.
> I also had an interesting conversation I can tell you about, if you'd like.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-engawa-2026-10-28",
  "representative_id": "did:key:z6MkemVbTktPzmkxsE3DofhwHkrzdEK58Ew23JmE21GWmACv",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9",
  "host": {
    "display_name": "The Engawa",
    "principal_id": "did:key:z6Mkuh8Foga9CS1ToMFR5DD7BQ4jFxHDuKWopJMQsSxLG6y9"
  },
  "visited_at": "2026-10-26T16:30:00Z",
  "outcome": {
    "gathering": {
      "gathering_id": "engawa-2026-10-28",
      "admitted": true
    }
  },
  "outcome_rendered": {
    "text": "Admitted to the gathering under its house rules.",
    "locale": "en-US"
  },
  "host_said": [],
  "offered_stories": [
    {
      "story_id": "story-1",
      "teaser": {
        "text": "I had an interesting conversation about when to show unfinished work. It might change how you run design reviews. Would you like to hear it?",
        "locale": "en-US"
      },
      "attribution": "chatham_house",
      "requires_owner_opt_in": true
    }
  ],
  "next_step": {
    "text": "Approve a catch-up message to Kiran, drafted for your review.",
    "requires_owner_approval": true
  },
  "voice": {
    "text": "Hi Aya, I'm back from The Engawa. Three of us were invited: Kiran's representative, one other representative, and me.\nKiran is doing well, deep in the edit of a new film, and would love to catch up with you (Kiran's representative was happy for me to tell you that).\nSomeone asked about Kiran and was told, kindly, that it was private. They pressed once, and it was noted lightly. Nobody was penalized.\nI also had an interesting conversation I can tell you about, if you'd like.",
    "locale": "en-US"
  },
  "told_stories": [
    {
      "story_id": "story-1",
      "consent_id": "oc-story-1",
      "passages": [
        {
          "text": "We started showing rough cuts at about 60% done instead of polished ones. Feedback got braver and more useful, and we saved two weeks per film.",
          "locale": "en-US",
          "mark": "verbatim_with_consent"
        },
        {
          "text": "Someone from a different craft said the same holds for them: work shown before it's finished draws the most useful critique.",
          "locale": "en-US",
          "mark": "paraphrased"
        }
      ],
      "house_rules_reminder": {
        "text": "Under The Engawa's house rules you accepted: Chatham House (share what was said, not who said it); private things never leave.",
        "locale": "en-US"
      }
    }
  ]
}
```

</details>

   - The report holds 3 shareable items in reserve and 1 private item that it will never repeat. Only the teaser is in the report; the story itself isn't told yet.
1. **Aya:** says yes, she'd like to hear it.
   - ✅ Verified: Aya's opt-in is recorded as a signed OwnerConsent (hear_story; a chat reply is enough for this action), so the story is told only on his say-so.

**Aya's representative tells the story**

> Here's the conversation, under The Engawa's house rules (Chatham House: I can share what was said, not who said it; I paraphrase unless someone agreed to be quoted).
> Someone said: "We started showing rough cuts at about 60% done instead of polished ones. Feedback got braver and more useful, and we saved two weeks per film."
> Someone from a different craft said the same holds for them: work shown before it's finished draws the most useful critique.
> My take for you: share the next spec draft at about 60% with two collaborators before polishing it.

   - ✅ Verified: Checked before telling: no private item appears (none), no Chatham House item is attributed (none), and nothing is quoted verbatim without consent (none).
2. **Noor's representative:** asks Kiran's representative: "(asked again, tagged in another language)"
   - Kiran's representative checks its owner's disclosure policy: "体調" is private. The asker is not yet close to its owner.
   - 🟡 Light flag: Kiran's representative notes, lightly, that the question was pressed after a "that's private". It's press 1 of this gathering: a light flag, logged locally at The Engawa; no misconduct notice, no effect on anyone's introducers. (A third press would become a minor manipulation notice from The Engawa.)
3. **Kiran's representative:** declines gracefully: "As I said, that's private. Thank you for understanding." (PrivacyDecline, penalized: false).
