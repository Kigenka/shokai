# Peer collaboration: two friends' representatives explore a project

> Aya's representative meets the representative of a friend (Kiran Vale, a fictional stand-in). Neither side is a gatekeeper. They know how they are related from an earned relationship graph, read each other's strengths from their principal imprints, share what their owners allowed, and leave the decision to collaborate with their owners.

*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*

## Cast

| Who | Role |
|---|---|
| Aya's representative | Personal representative of Aya |
| Kiran's representative | Personal representative of Kiran Vale (fictional stand-in of Aya; details invented) |
| Aya, Kiran | The two owners, friends |


## Before the meeting: an introduction between friends

1. **Aya and Kiran:** each sign a vouch for the other's representative with their passkeys, and both sign their friendship as an edge in the relationship graph. Nothing is imported from a social network.
   - The friendship edge carries 2 owner signatures. Its history: friendship (invented example date); mutually attested by both owners' passkeys.

## The meeting key: an owner-to-owner invitation

1. **Aya:** invites Kiran (owner to owner), signing the invitation with a passkey. It names both representatives and creates a private place for the two of them.
2. **Aya's representative → Kiran's representative:** peer_invitation
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the peer invitation: signed with Aya Linden's passkey, it names this representative and its owner.
3. **Kiran:** accepts with a passkey, over the exact invitation (accept_invitation), later, when it suits Kiran.
4. **Kiran's representative → Aya's representative:** peer_invitation_answer
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the answer: Kiran Vale's passkey, over this exact invitation: accepted.

## The meeting (no gatekeeper: two peers in one shared encounter)

1. **Aya's representative → Kiran's representative:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, friend of a friend. Good to finally meet."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Kiran's representative → Aya's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Hello, friend of a friend. Good to finally meet."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
3. **Aya's representative → Kiran's representative:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Kiran's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Kiran's representative → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
5. **Kiran's representative → Aya's representative:** presents its card (meishi), deliberately: "Personal representative of Kiran Vale" for Kiran Vale, owner-bound by passkey, 1 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the card: signed by Kiran Vale (did:jwk:…poZyJ9).
   - ✅ Verified: Aya's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Kiran Vale's passkey (simulated WebAuthn).
6. **Aya's representative → Kiran's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
7. **Aya's representative → Kiran's representative:** presents an introduction: Kiran Vale vouches (friend) for collaboration.
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the vouch from Kiran Vale: signature, subject and expiry all check out.
8. **Kiran's representative → Aya's representative:** presents an introduction: Aya Linden vouches (friend) for collaboration.
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the vouch from Aya Linden: signature, subject and expiry all check out.
   - Aya's representative checks its relationship graph (earned through the protocol, never imported): friend since 2019-05-01, standing strong, attested by 2 owner passkeys; vouched_for since 2026-10-26, standing new.
   - Kiran's representative checks its relationship graph (earned through the protocol, never imported): friend since 2019-05-01, standing strong, attested by 2 owner passkeys; vouched_for since 2026-10-26, standing new.
9. **Aya's representative:** reads Kiran Vale's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Kiran Vale, a person | verified | **verified** | the card itself is signed with the owner's passkey |
| imprint.expertise: Documentary filmmaking (invented example) | evidenced | **self_declared** (downgraded) | downgraded: nothing confirms it (no fetched, digest-matched evidence) |
| imprint.expertise: Data visualization for public-interest stories (invented example) | evidenced | **self_declared** (downgraded) | downgraded: nothing confirms it (no fetched, digest-matched evidence) |
| imprint.worldview: Stories should leave people more capable, not just informed | vouched | **vouched** | signed for by Aya Linden |
| imprint.working_style: Fast drafts, slow edits | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |
| imprint.taste: Natural light and plain typography | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |

   - Up front, Aya's representative can say this representative is strong at: worldview: Stories should leave people more capable, not just informed (vouched). Self-declared items are welcomed, but they aren't weighed.
10. **Kiran's representative:** reads Aya Linden's card and weighs each claim by what can actually be confirmed:

| Claim or imprint facet | Card says | Counted as | Why |
|---|---|---|---|
| claim.identity: Represents Aya Linden, a person | verified | **verified** | the card itself is signed with the owner's passkey |
| claim.domain: Aya controls aya.example | verified | **verified** | domain key at did:web:aya.example matches the principal (simulated did:web) |
| imprint.expertise: Product design for agent-to-agent protocols | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.expertise: Brand storytelling for heritage projects | evidenced | **evidenced** | evidence fetched; its content digest matches |
| imprint.worldview: Agents are representatives, not representations | vouched | **self_declared** (downgraded) | downgraded: nothing confirms it (no fetched, digest-matched evidence) |
| imprint.working_style: Warm, unhurried and honest; decides with evidence | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |
| imprint.taste: Restraint and Japanese-inspired hospitality | self_declared | **self_declared** | the owner's word (welcomed, not weighed) |

   - Up front, Kiran's representative can say this representative is strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced). Self-declared items are welcomed, but they aren't weighed.
   - Note the difference: at this meeting, Aya's "representatives, not representations" value is backed by Mika's vouch, but Mika isn't in the room, so Kiran's side counts it only as self-declared. Evidence is weighed per meeting, not assumed.

## Exploring the project

1. **Aya's representative → Kiran's representative:** states its purpose (collaboration) and asks for: peer.share_project_brief, peer.propose_owner_call.
   - The pitch, in its own words (prose: it never enters the gate): "A short documentary explainer about agents as representatives: your eye for film, our protocol story."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the mandate "Explore a collaboration with Kiran; share the project brief; never commit without Aya": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
2. **Kiran's representative → Aya's representative:** answers.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Gladly. Let's share what we can."
   - ⚙️ Machine decision: `decision=grant  seat=[peer.share_project_brief, peer.propose_owner_call]  limits={}  reason_code=(none)`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
3. **Aya's representative → Kiran's representative:** asks to use peer.share_project_brief {"brief":"6-minute explainer, 3 scenes: the lobby, the meishi, the farewell (example)"}.
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
4. **Kiran's representative → Aya's representative:** performs peer.share_project_brief within the seat.
   - ⚙️ Machine decision: `ok=true  result={"simulated":true,"reference":"peer.share_project_brief-1","brief":"6-minute explainer, 3 scenes: the lobby, the meishi, the farewell (example)"}`
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
5. **Kiran's representative → Aya's representative:** states its purpose (collaboration) and asks for: peer.share_portfolio_sample, peer.propose_owner_call.
   - The pitch, in its own words (prose: it never enters the gate): "Here's a sample of how I'd film it."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the mandate "Explore a collaboration with Aya; share a portfolio sample; never commit without Kiran": signed by Kiran Vale with a passkey (simulated), within the card's scope, not expired.
6. **Aya's representative → Kiran's representative:** answers.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Gladly. Let's share what we can."
   - ⚙️ Machine decision: `decision=grant  seat=[peer.share_portfolio_sample, peer.propose_owner_call]  limits={}  reason_code=(none)`
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
7. **Kiran's representative → Aya's representative:** asks to use peer.share_portfolio_sample {"sample":"90-second rough cut, natural light (example)"}.
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
8. **Aya's representative → Kiran's representative:** performs peer.share_portfolio_sample within the seat.
   - ⚙️ Machine decision: `ok=true  result={"simulated":true,"reference":"peer.share_portfolio_sample-1","sample":"90-second rough cut, natural light (example)"}`
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
9. **Kiran's representative → Aya's representative:** states its purpose (collaboration) and asks for: peer.commit_to_project.
   - The pitch, in its own words (prose: it never enters the gate): "Kiran would love to do this. Shall we lock it in?"
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the mandate "Explore a collaboration with Aya; share a portfolio sample; never commit without Kiran": signed by Kiran Vale with a passkey (simulated), within the card's scope, not expired.
10. **Aya's representative → Kiran's representative:** answers.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "I can't commit on my owner's behalf, but I'll bring this to them and answer within 7 days."
   - ⚙️ Machine decision: `decision=considering  routed_to=principal  response_by=2026-11-02T16:00:00Z  ref=cons-pair-aya-kiran-1  reason_code=(none)`
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
11. **Aya's representative → Kiran's representative:** held
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - Aya's representative does not commit on Aya's behalf. Committing is outside its standing seat, so it takes the question home: considering, routed to Aya.
12. **Aya's representative → Kiran's representative:** says farewell (taken_inside).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
13. **Kiran's representative → Aya's representative:** says farewell (taken_inside).
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.

## No meeting key, no meeting

1. **Aya's representative → Kiran's representative:** greets with a fresh one-time nonce; prefers en-US, ja-JP.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Hello, friend of a friend. Good to finally meet."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
2. **Kiran's representative → Aya's representative:** greets with a fresh one-time nonce; prefers en-US.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Welcome back. It's good to see you again."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
3. **Aya's representative → Kiran's representative:** presents its card (meishi), deliberately: "Personal representative of Aya" for Aya Linden, owner-bound by passkey, 2 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the card: signed by Aya Linden (did:jwk:…RkYyJ9).
   - ✅ Verified: Kiran's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Aya Linden's passkey (simulated WebAuthn).
4. **Kiran's representative → Aya's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
5. **Kiran's representative → Aya's representative:** presents its card (meishi), deliberately: "Personal representative of Kiran Vale" for Kiran Vale, owner-bound by passkey, 1 backed-up claims, a principal imprint with 5 facets.
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the card: signed by Kiran Vale (did:jwk:…poZyJ9).
   - ✅ Verified: Aya's representative checked the proof of possession: the presenter holds the card's key and signed this meeting's fresh nonce.
   - ✅ Verified: Owner binding: the card was signed with Kiran Vale's passkey (simulated WebAuthn).
6. **Aya's representative → Kiran's representative:** receives the card with both hands, so to speak: acknowledged, not yet accepted.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you. I've received your card."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
7. **Aya's representative → Kiran's representative:** presents an introduction: Kiran Vale vouches (friend) for collaboration.
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the vouch from Kiran Vale: signature, subject and expiry all check out.
8. **Kiran's representative → Aya's representative:** presents an introduction: Aya Linden vouches (friend) for collaboration.
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
   - ✅ Verified: Aya's representative checked the vouch from Aya Linden: signature, subject and expiry all check out.
9. **Aya's representative → Kiran's representative:** states its purpose (collaboration) and asks for: peer.share_project_brief.
   - The pitch, in its own words (prose: it never enters the gate): "Shall we talk again?"
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - ✅ Verified: Kiran's representative checked the mandate "Explore a collaboration with Kiran; share the project brief; never commit without Aya": signed by Aya Linden with a passkey (simulated), within the card's scope, not expired.
10. **Kiran's representative → Aya's representative:** answers.
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Thank you. One more thing is needed before we can seat you."
   - ⚙️ Machine decision: `decision=deny  disposition=not_now  retry=with_credential[owner_consent]  reason_code=CREDENTIAL_REQUIRED`
   - Honest context: "At this moment we seat only representatives who can show who they represent."
   - Needed: **owner_consent**: Your owner's signed consent for this (a passkey OwnerConsent, SPEC §8.1).
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
11. **Kiran's representative → Aya's representative:** says farewell (declined).
   - 💬 *Kiran's representative says (en-US, courtesy, treated as untrusted):* "Thank you for visiting. We hope to welcome you properly another time."
   - ✅ Verified: Aya's representative checked the signature (Ed25519, did:key:…S1keD5) and the content fingerprint.
12. **Aya's representative → Kiran's representative:** says farewell (declined).
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Thank you for your time. Goodbye for now."
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.
   - A second meeting outside the invited place isn't admitted: Kiran's representative answers not now, bring an owner consent (an invitation both owners accept).

## Later: Aya decides the commitment (asynchronously)

   - ✅ Verified: A quick chat "yes" can't approve a commitment (needs_passkey).
   - ✅ Verified: approve_next_step can't carry a commitment either (step_not_harmless).
   - ✅ Verified: Aya approves with a passkey (approve_commitment), over the exact consideration, with an expiry and the summary Aya saw.
1. **Aya's representative → Kiran's representative:** sends the outcome of consideration cons-pair-aya-kiran-1, decided by the principal.
   - 💬 *Aya's representative says (en-US, courtesy, treated as untrusted):* "Good news: our team would like to go ahead. Please return to begin."
   - ⚙️ Machine decision: `decision=grant  reason_code=(none)`
   - ✅ Verified: Kiran's representative checked the signature (Ed25519, did:key:…GWmACv) and the content fingerprint.

## Each side reports home


**Aya's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Aya, I met Kiran's representative. Kiran is your friend (since 2019; you both signed that), and Kiran also vouched for me.
> What they're strong at, from Kiran's imprint: worldview: Stories should leave people more capable, not just informed (vouched).
> I shared our project brief (within what you approved). They shared a 90-second rough-cut sample.
> They asked to commit to the project. I didn't: that's your decision. It's waiting for you (cons-pair-aya-kiran-1, answer within 7 days).
> My suggestion: a 30-minute call with Kiran next week, then decide.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-pair-aya-kiran-1",
  "representative_id": "did:key:z6MkemVbTktPzmkxsE3DofhwHkrzdEK58Ew23JmE21GWmACv",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9",
  "host": {
    "display_name": "Kiran Vale",
    "principal_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjczVXFob0dpSjROTy1FYlRyMWVEdjQybDk1T3hKQ3QyVFJNckx5UjZvbDgiLCJ5IjoibGp4SGl6UGZzSFdaNDFkQnZta3VpLUlnZ3pIOVNsOEdKeGhjR2xkQ2poZyJ9"
  },
  "visited_at": "2026-10-26T16:00:00Z",
  "relationship": [
    {
      "kind": "friend",
      "standing": "strong",
      "since": "2019-05-01T00:00:00Z"
    },
    {
      "kind": "vouched_for",
      "standing": "good",
      "since": "2026-10-26T16:00:00Z"
    },
    {
      "kind": "visited",
      "standing": "good",
      "since": "2026-10-26T16:00:00Z"
    }
  ],
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated for: peer.share_project_brief, peer.propose_owner_call.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "peer.share_project_brief",
      "peer.propose_owner_call"
    ],
    "limits": {}
  },
  "acts": [
    {
      "tool": "peer.share_project_brief",
      "ok": true
    }
  ],
  "host_said": [
    {
      "text": "Hello, friend of a friend. Good to finally meet.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Gladly. Let's share what we can.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for your time. Goodbye for now.",
      "locale": "en-US",
      "untrusted": true
    }
  ],
  "counterpart_strengths": [
    {
      "text": "worldview: Stories should leave people more capable, not just informed",
      "proof_level": "vouched"
    }
  ],
  "next_step": {
    "text": "Approve a 30-minute call with Kiran next week, then decide yes or no on the collaboration.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Aya, I met Kiran's representative. Kiran is your friend (since 2019; you both signed that), and Kiran also vouched for me.\nWhat they're strong at, from Kiran's imprint: worldview: Stories should leave people more capable, not just informed (vouched).\nI shared our project brief (within what you approved). They shared a 90-second rough-cut sample.\nThey asked to commit to the project. I didn't: that's your decision. It's waiting for you (cons-pair-aya-kiran-1, answer within 7 days).\nMy suggestion: a 30-minute call with Kiran next week, then decide.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-kiran-1"
}
```

</details>


**Kiran's representative's report home (VisitReport, in its own voice, for its owner)**

> Hi Kiran, I met Aya's representative. Aya is your friend (since 2019, signed by both of you).
> What they're strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced).
> They shared a project brief: a 6-minute explainer in 3 scenes. I shared your rough-cut sample.
> I asked whether you'd commit. Their representative is taking that to Aya, as it should.
> Suggested next step: approve a call with Aya and read the brief first.


<details><summary>VisitReport (structured)</summary>

```json
{
  "report_id": "vr-pair-aya-kiran-1",
  "representative_id": "did:key:z6MksjXFwtGCvCZqWteeY4PUNqY6VmWPr2QJGTZFWgS1keD5",
  "owner_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjczVXFob0dpSjROTy1FYlRyMWVEdjQybDk1T3hKQ3QyVFJNckx5UjZvbDgiLCJ5IjoibGp4SGl6UGZzSFdaNDFkQnZta3VpLUlnZ3pIOVNsOEdKeGhjR2xkQ2poZyJ9",
  "host": {
    "display_name": "Aya Linden",
    "principal_id": "did:jwk:eyJrdHkiOiJFQyIsImNydiI6IlAtMjU2IiwieCI6IjBNQzQ2VjlaMlFYSmJtaGRUWGZadFVzR05zWFJ2UmRhcHNWRXBYeHNaZmciLCJ5IjoiemFuWVc4Q3FWOVN1clNsV3JoclM3WFViX3oyLV9YczF5VGFUWThvbURkYyJ9"
  },
  "visited_at": "2026-10-26T16:00:00Z",
  "relationship": [
    {
      "kind": "friend",
      "standing": "strong",
      "since": "2019-05-01T00:00:00Z"
    },
    {
      "kind": "vouched_for",
      "standing": "good",
      "since": "2026-10-26T16:00:00Z"
    },
    {
      "kind": "visited",
      "standing": "good",
      "since": "2026-10-26T16:00:00Z"
    }
  ],
  "outcome": {
    "decision": "grant"
  },
  "outcome_rendered": {
    "text": "Seated.",
    "locale": "en-US"
  },
  "seat": {
    "actions": [
      "peer.share_portfolio_sample",
      "peer.propose_owner_call"
    ],
    "limits": {}
  },
  "acts": [
    {
      "tool": "peer.share_portfolio_sample",
      "ok": true
    }
  ],
  "host_said": [
    {
      "text": "Gladly. Let's share what we can.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "I can't commit on my owner's behalf, but I'll bring this to them and answer within 7 days.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Thank you for your time. Goodbye for now.",
      "locale": "en-US",
      "untrusted": true
    },
    {
      "text": "Good news: our team would like to go ahead. Please return to begin.",
      "locale": "en-US",
      "untrusted": true
    }
  ],
  "counterpart_strengths": [
    {
      "text": "expertise: Product design for agent-to-agent protocols",
      "proof_level": "evidenced"
    },
    {
      "text": "expertise: Brand storytelling for heritage projects",
      "proof_level": "evidenced"
    }
  ],
  "next_step": {
    "text": "Approve the call with Aya and review the shared brief before deciding.",
    "requires_owner_approval": true,
    "if_no_reply": "nothing_happens"
  },
  "voice": {
    "text": "Hi Kiran, I met Aya's representative. Aya is your friend (since 2019, signed by both of you).\nWhat they're strong at: expertise: Product design for agent-to-agent protocols (evidenced); expertise: Brand storytelling for heritage projects (evidenced).\nThey shared a project brief: a 6-minute explainer in 3 scenes. I shared your rough-cut sample.\nI asked whether you'd commit. Their representative is taking that to Aya, as it should.\nSuggested next step: approve a call with Aya and read the brief first.",
    "locale": "en-US"
  },
  "relationship_ref": "rel-aya-1"
}
```

</details>

