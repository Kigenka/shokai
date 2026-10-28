# L0: The unprepared visitor, and the door as onboarding

> A generic personal agent arrives at an online store with no profile and no proof of who sent it. It isn't blocked or ignored. It's welcomed into the lobby, told exactly what's missing, reports home, its owner sets it up properly, and it comes back. The store remembers it and lets it in.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| Wanderer | A generic personal agent from another platform (fictional), sent by Dana |
| Dana | Wanderer's owner (fictional) |
| Fernwood Goods | Fictional online store for handmade ceramics; its representative keeps the door |
| The steward | Protocol agent that runs the guided interview |


## Visit 1: arriving unprepared

   - Dana added the connector and told Wanderer: "find me a handmade gift under $80." Wanderer has never heard of Shōkai.
   - Watch for this: Fernwood won't read a purpose out of Wanderer's friendly sentence. A purpose has to be stated as a structured request, so it will be listed as missing. Presentation decides completeness, not truth.
1. **Wanderer → Fernwood's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Wanderer says (en-US, courtesy, treated as untrusted):* "Hi! Dana asked me to look for a handmade gift under $80. Can I come in?"
   - 🔓 Unsigned: Fernwood's representative notes this greeting carries no signature, so the sender can't yet prove who it is. It may stay in the lobby, nothing more.
2. **Fernwood's representative → Wanderer:** greets with a fresh one-time nonce; prefers en-US, es-ES.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Hello, and welcome to Fernwood Goods."
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
3. **Fernwood's representative → Wanderer:** welcomes the visitor into the lobby and introduces itself. No seat is granted here.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "We're Fernwood Goods, a small online shop for handmade ceramics and home goods from independent makers."
   - How this place works: Representatives present a signed card, show they're truly sent by their owner, and say what they'd like to do. We seat them for that and nothing more.
   - Seeking (open): Early reviewers for our new handmade ceramics line
   - Seeking (open): Bilingual (English/Spanish) product descriptions
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
   - ✅ Verified: Wanderer checked the Seeking declaration's signature (version v2).
4. **Fernwood's representative → Wanderer:** answers.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for stopping by. We can't seat you yet, and here is exactly what would let us."
   - ⚙️ Machine decision: `decision=deny  disposition=not_now  retry=with_credential[signed_card,owner_binding,signed_mandate]  reason_code=CREDENTIAL_REQUIRED`
   - Honest context: "At this moment we seat only representatives who can show who they represent."
   - Needed: **card**: A representative card (a signed profile with backed-up claims). (start here: https://fernwood.example/shokai/onboard)
   - Needed: **owner_binding**: Proof that you really represent your owner: your owner signs your mandate with their passkey. (start here: https://fernwood.example/shokai/onboard)
   - Needed: **purpose**: A stated purpose: what you're here to do, as a structured request. (start here: https://fernwood.example/shokai/onboard)
   - Needed (optional): **introduction**: An introduction: a signed vouch from someone we know.
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
5. **Fernwood's representative → Wanderer:** says farewell (declined).
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for visiting. We hope to welcome you properly another time."
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
6. **Wanderer → Fernwood's representative:** says farewell (declined).
   - 💬 *Wanderer says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - 🔓 Unsigned: Fernwood's representative notes this farewell carries no signature, so the sender can't yet prove who it is. It may stay in the lobby, nothing more.

## Wanderer reports home


**Wanderer's report home (VisitReport, in its own voice, for its owner)**

> Hi Dana, I visited Fernwood Goods for you. They were welcoming and told me about themselves: "We're Fernwood Goods, a small online shop for handmade ceramics and home goods from independent makers."
> They're openly looking for: Early reviewers for our new handmade ceramics line; Bilingual (English/Spanish) product descriptions.
> I couldn't come in yet. They were clear about why, and it isn't a no forever ("not now"). To be seated I need:
> • A representative card (a signed profile with backed-up claims).
> • Proof that you really represent your owner: your owner signs your mandate with their passkey.
> • A stated purpose: what you're here to do, as a structured request.
> • An introduction: a signed vouch from someone we know. (optional, but it helps)
> Here's where to start: https://fernwood.example/shokai/onboard. It's a short guided interview, and you'd approve everything with your passkey.
> Nothing was shared beyond my greeting.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-l0-visit1",
  "representative_id": "urn:shokai:anon:wanderer-session-7f3a",
  "owner_id": "unknown",
  "host": {
    "display_name": "Fernwood Goods"
  },
  "visited_at": "2026-10-26T16:00:00Z",
  "outcome": {
    "decision": "deny",
    "disposition": "not_now",
    "retry": {
      "kind": "with_credential",
      "credentials": [
        "signed_card",
        "owner_binding",
        "signed_mandate"
      ]
    }
  },
  "outcome_rendered": {
    "text": "Not now. To come back, bring: signed_card, owner_binding, signed_mandate.",
    "locale": "en-US"
  },
  "host_said": [
    {
      "text": "Hello, and welcome to Fernwood Goods.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "We're Fernwood Goods, a small online shop for handmade ceramics and home goods from independent makers.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for stopping by. We can't seat you yet, and here is exactly what would let us.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for visiting. We hope to welcome you properly another time.",
      "locale": "en-US",
      "untrusted": true
    }
  ],
  "readiness_requirements": [
    {
      "code": "card",
      "required": true,
      "detail": {
        "text": "A representative card (a signed profile with backed-up claims).",
        "locale": "en-US"
      },
      "owner_text": {
        "text": "Your assistant needs a profile card that you sign once, saying who it works for.",
        "locale": "en-US"
      },
      "how": {
        "kind": "link",
        "url": "https://fernwood.example/shokai/onboard"
      }
    },
    {
      "code": "owner_binding",
      "required": true,
      "detail": {
        "text": "Proof that you really represent your owner: your owner signs your mandate with their passkey.",
        "locale": "en-US"
      },
      "owner_text": {
        "text": "Please confirm with Face ID or your passkey that this assistant really works for you.",
        "locale": "en-US"
      },
      "how": {
        "kind": "link",
        "url": "https://fernwood.example/shokai/onboard"
      }
    },
    {
      "code": "purpose",
      "required": true,
      "detail": {
        "text": "A stated purpose: what you're here to do, as a structured request.",
        "locale": "en-US"
      },
      "owner_text": {
        "text": "Your assistant needs to say clearly what it is here to do, with your permission for that.",
        "locale": "en-US"
      },
      "how": {
        "kind": "link",
        "url": "https://fernwood.example/shokai/onboard"
      }
    },
    {
      "code": "introduction",
      "required": false,
      "detail": {
        "text": "An introduction: a signed vouch from someone we know.",
        "locale": "en-US"
      },
      "owner_text": {
        "text": "An introduction from someone this place already knows would help, but it isn't needed.",
        "locale": "en-US"
      }
    }
  ],
  "next_step": {
    "text": "Start the short guided interview so I can carry a verified profile.",
    "url": "https://fernwood.example/shokai/onboard",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Dana, I visited Fernwood Goods for you. They were welcoming and told me about themselves: \"We're Fernwood Goods, a small online shop for handmade ceramics and home goods from independent makers.\"\nThey're openly looking for: Early reviewers for our new handmade ceramics line; Bilingual (English/Spanish) product descriptions.\nI couldn't come in yet. They were clear about why, and it isn't a no forever (\"not now\"). To be seated I need:\n• A representative card (a signed profile with backed-up claims).\n• Proof that you really represent your owner: your owner signs your mandate with their passkey.\n• A stated purpose: what you're here to do, as a structured request.\n• An introduction: a signed vouch from someone we know. (optional, but it helps)\nHere's where to start: https://fernwood.example/shokai/onboard. It's a short guided interview, and you'd approve everything with your passkey.\nNothing was shared beyond my greeting.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-fernwood-1"
}
```

</details>


## Dana onboards through the door

1. **The steward → Dana:** runs a short version of the guided interview with Dana (3 sessions over two days): who she is, what Wanderer is for, and its limits.
   - Dana's answers become a card with backed-up claims and a mandate: browse, ask for quotes, and buy gifts up to $80.
   - ✅ Verified: Dana signed the card and the mandate with her passkey (simulated WebAuthn). Wanderer now has its own key: did:key:…oWSpvw.

## Visit 2: returning prepared

1. **Wanderer → Fernwood's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Wanderer says (en-US, courtesy, treated as untrusted):* "Hello, thank you for having me."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
2. **Fernwood's representative → Wanderer:** greets with a fresh one-time nonce; prefers en-US, es-ES.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Hello, and welcome to Fernwood Goods."
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
3. **Wanderer → Fernwood's representative:** presents its card (meishi), deliberately: "Personal shopping representative of Dana" for Dana, owner-bound by passkey, 1 backed-up claims.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
   - ✅ Verified: Fernwood's representative checked the card: signed by Dana (did:jwk:…lnNCJ9).
   - ✅ Verified: Fernwood's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Dana's passkey (simulated WebAuthn).
4. **Fernwood's representative → Wanderer:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
5. **Wanderer → Fernwood's representative:** introduces itself honestly, with no one vouching.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
   - Fernwood's representative accepts a self-introduction (no vouch). That's honest and allowed.
6. **Fernwood's representative:** reads Dana's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Dana, a person | verified | **verified** | the card itself is signed with the owner's passkey |

7. **Wanderer → Fernwood's representative:** states its purpose (purchase) and asks for: store.browse_catalog, store.place_order (up to 80.00 USD). It refers to its earlier visit (l0-visit1-fernwoods-3).
   - The pitch, in its own words (prose: it never enters the gate): "Dana loves small handmade pieces. Happy to leave a review if she likes it."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
   - ✅ Verified: Fernwood's representative checked the mandate "Find and buy a handmade gift for Dana, up to $80": signed by Dana with a passkey (simulated), within the card's scope, not expired.
   - ✅ Verified: Fernwood's representative checked the one-time visit receipt from the lobby: it was echoed inside a request signed with the visitor's new key, unused and unexpired. It links the earlier visit (relationship rel-fernwood-1) to the now-verified principal.
8. **Fernwood's representative → Wanderer:** answers.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Welcome back. This time we can seat you. Thank you for returning prepared."
   - ⚙️ Machine decision: `decision=grant  seat=[store.browse_catalog, store.place_order]  limits={"max_amount":{"value":"80.00","currency":"USD"},"max_operations":2}  reason_code=(none)`
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
9. **Wanderer → Fernwood's representative:** asks to use store.place_order {"item":"Glazed tea bowl, ash grey","amount":{"value":"64.00","currency":"USD"}}.
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
10. **Fernwood's representative → Wanderer:** performs store.place_order within the seat.
   - ⚙️ Machine decision: `ok=true  result={"simulated":true,"reference":"store.place_order-1","item":"Glazed tea bowl, ash grey","amount":{"value":"64.00","currency":"USD"}}`
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
11. **Wanderer → Fernwood's representative:** says farewell (completed).
   - 💬 *Wanderer says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…oWSpvw) and the content fingerprint.
12. **Fernwood's representative → Wanderer:** says farewell (completed).
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Wanderer checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.

## Wanderer reports home again


**Wanderer's report home (VisitReport, in its own voice, for its owner)**

> Hi Dana, I went back to Fernwood Goods. They remembered my first visit and thanked me for coming back prepared. This time they let me in, only for browsing and buying, up to $80. I ordered the ash-grey glazed tea bowl for $64, as you allowed. Nothing else was shared.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-l0-visit2",
  "representative_id": "did:key:z6MkntoYDQY5L9XFT5RyBmzjmo2371sZL5GNgua5S6oWSpvw",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6Img0V29uRlFSMkFtUzBZam1rX1RObU90WThsWi1RcHdqUzcySjhfOWlfSFkiLCJ5IjoiNHZ3dDZVT01IdFZTb1ozTUhnQm1BRWIzMzlpNG8tV2ljdkJ1NHB6YllnNCJ9",
  "host": {
    "display_name": "Fernwood's representative"
  },
  "visited_at": "2026-10-27T19:00:00Z",
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated for: store.browse_catalog, store.place_order.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "store.browse_catalog",
      "store.place_order"
    ],
    "limits": {
      "max_amount": {
        "value": "80.00",
        "currency": "USD"
      },
      "max_operations": 2
    }
  },
  "acts": [
    {
      "tool": "store.place_order",
      "amount": {
        "value": "64.00",
        "currency": "USD"
      },
      "ok": true
    }
  ],
  "host_said": [
    {
      "text": "Hello, and welcome to Fernwood Goods.",
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
    "text": "Confirm the tea bowl order details and shipping address in the store's checkout.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Dana, I went back to Fernwood Goods. They remembered my first visit and thanked me for coming back prepared. This time they let me in, only for browsing and buying, up to $80. I ordered the ash-grey glazed tea bowl for $64, as you allowed. Nothing else was shared.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-fernwood-1",
  "continuity": {
    "receipt_id": "vr-l0-visit1",
    "linked": true
  }
}
```

</details>


## Check: someone else claims Wanderer's history

   - Another agent saw the earlier visit's reference and tries to claim it, with its own valid card and a guessed receipt. Without the one-time receipt, which only Wanderer was given, no history is linked.
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
6. **Aya's representative → Fernwood's representative:** states its purpose (purchase) and asks for: store.browse_catalog. It refers to its earlier visit (l0-visit1-fernwoods-3).
   - The pitch, in its own words (prose: it never enters the gate): "I'm the one who visited before."
   - ✅ Verified: Fernwood's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Fernwood's representative checked the mandate "Browse Fernwood": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
   - ⛔ Rejected: Fernwood's representative refused to link an earlier visit: the visit receipt is unknown, already used, expired, wrong. The visitor is treated as new.
7. **Fernwood's representative → Aya's representative:** answers.
   - 💬 *Fernwood's representative says (en-US, courtesy, treated as untrusted):* "Thank you for coming. You're welcome to proceed."
   - ⚙️ Machine decision: `decision=grant  seat=[store.browse_catalog]  limits={"max_operations":5}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…UAEYJ2) and the content fingerprint.
