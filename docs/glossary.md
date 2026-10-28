# Glossary

| Term | Meaning |
|---|---|
| **Act** | A signed tool call or operation inside a seat. A spending act states its `amount` (`{value, currency}`), which the door counts against the seat's cap; a spending act without one is refused (`REQUEST_INCOMPLETE`). Answered by `act_result`, or by an explicit `act_decision` when outside the seat. |
| **Agent front** | What a place chooses to publish for agents: its place listing and lobby. Who it is, what it offers, what each action asks for, its door rules. Open to anyone to look at; nothing about the reader is asked for or kept. |
| **Allowance (standing allowance)** | What an owner lets the representative do alone, signed once with a passkey: purposes, place categories, actions, optional spend per period. Shown one grant at a time. |
| **Basis** | The audit fields on every decision (policy version, gate-input digest, decision time) that make it replayable. |
| **Campaign** | Offers from one principal that share a `campaign_id` or are rewordings of one pitch. Counted once, however worded. |
| **Card (*meishi*)** | The representative's signed business card: principal, role, standing, mandate scope, locales, key, validity. |
| **Conditional** | A decision that says yes if the visitor meets typed, checkable conditions. |
| **Conduct signal** | A minor finding noted against a principal at a person's door. Three in 90 days count as one serious finding. |
| **Considering** | A decision that takes the request inside to a person who can decide, by a stated date. Grants nothing now. |
| **Courtesy** | The polite, localised text with a decision. Never something a receiver branches on. |
| **Data asks** | The personal data a place declares, per action, that it will ask the owner for (`[]` when none), so a representative can tell its owner before joining. |
| **Deny** | A decision with a disposition (`not_now`, `not_a_fit`, `never`) and a retry. |
| **DID** | A decentralised identifier. `did:key` for representatives, `did:web` for organisations, `did:jwk` for owners' passkeys. |
| **Door** | The entrance of a place: its listing, entry, lobby and inbox addresses. Every arrival gets an answer. Anything personal happens only through the door's ritual, with a card, any required introduction and signed limits. |
| **Door pointer** | The answer at an unknown route: where to start. |
| **Door policy** | At a person's inbound door, the owner-signed rules for brands: public categories and caps, and a private part that never leaves the representative. |
| **Duty of loyalty** | A representative acts in its principal's interests and never accepts an inducement on its behalf. |
| **Encounter** | One visit, from the first greeting to the farewell, bound to its two parties. |
| **Extension** | An optional, separately versioned document with its own conformance level that adds rules without weakening the core. |
| **Gatekeeper** | The place's own representative at the door; in plain words, the **host at the door**. It verifies, decides, explains, seats and remembers. |
| **Grant** | A decision that seats the visitor. |
| **Host** | In the specification, the space being entered, which owns the policy and seats. In plain words, "the host at the door" means its gatekeeper. |
| **Inbound door** | A place kept by a person's representative where brands present things to its owner. |
| **Introducer** | Optional. A third party that deliberately vouches for a visitor and stakes its own standing on it. |
| **Introducer interest** | What an introducer declares it gets from an introduction: `none` (genuine), or `discount`, `affiliate`, `sponsored`, `gift_received` (paid). |
| **Introduction** | The ritual step where the visitor introduces itself: `vouch: null` for a self-introduction (the normal case), or a vouch. A vouch is always deliberate; being connected is never an introduction. |
| **Invitation** | The place's own signed invitation, which it always weighs as its own. |
| **Invitation request** | The statement of purpose: the signed mandate and a structured proposal. |
| **Leaflet** | Plain-words name for the `LobbyBriefing`, the lobby's answer to an agent that isn't ready. |
| **Links** | Optional pointers from a listing entry to what the place already publishes for agents elsewhere (an MCP Server Card, an A2A Agent Card, a product feed). Hints only; they never widen what the door decides. |
| **Lobby** | The answer to an unprepared visitor: the leaflet (what the place is, how it works, what's needed with a plain sentence for the owner, onboarding, templates), and a polite `not_now`. Never silence, never a penalty. |
| **Mandate** | An owner-signed (or allowance-issued) statement of purpose, allowed actions, limits and validity for a visit. |
| **Mention** | One agent telling another about a place ("my owner might like this shop"). A recommendation, never a vouch. |
| **Misconduct notice** | A signed finding sent to the visitor's principal and every introducer in the vouch chain. |
| **Offer** | One structured presentation, invitation or gift a brand brings to a person's door. Always data. |
| **Owner** | The human principal behind a personal representative. |
| **Owner consent** | An owner's signed decision, given asynchronously, never mid-visit. Binding actions need a passkey. |
| **Place** | A host reachable through a door. |
| **Place listing** | The machine-readable list of a place's entries, purposes and actions. |
| **Possession proof** | A signature over the counterpart's greeting nonce, proving the presenter holds the card's key. |
| **Principal** | A person, brand, company or system that signs for and answers for its representatives. |
| **Proof level** | `self_declared` < `evidenced` < `vouched` < `verified`; the receiver computes the effective level itself. |
| **Reason category** | A kind, coarse reason a person's door may give a declined brand, never revealing private tastes. |
| **Relationship record** | The gatekeeper's local record per counterpart principal. |
| **Report home (visit report)** | The representative's report to its owner after every encounter, with one next step that waits for approval. |
| **Representative** | An agent acting for one principal, with its own key: the agent that goes out on your behalf. A coding agent that never leaves home doesn't need to be one. |
| **Retry** | When and how a visitor may try again: `after` a time, `with_credential [...]`, or `never`. |
| **Ritual** | The fixed order of an encounter: greeting, cards, introduction, purpose, response, seating, farewell. |
| **Room** | Inside a place, where the representatives it let in can meet: a gathering (signed guest list, every card checked, every message signed) or a pair place for two people's representatives. Extensions, not the core. |
| **Seat** | What a grant gives: a least-privilege tool allowlist and limits, never wider than policy ∩ mandate ∩ request. |
| **Self-introduction** (*jiko-shōkai*) | The visitor introduces itself with its owner-signed card, purpose and limits, and no vouch (`vouch: null`). The normal case, and a valid step at every place. |
| **Visit** | Arriving on one's own, by self-introduction or as an unprepared visitor at the lobby. |
| **Vouch** | An optional, signed, scoped, revocable statement by an introducer who stands behind a visitor, with a hash-chained revocation log. |
| **Website** | A place's ordinary public pages. Outside Shōkai: any agent can already read them. |
