# Glossary

| Term | Meaning |
|---|---|
| **Act** | A signed tool call or operation inside a pass. A spending act states its `amount` (`{value, currency}`), which the door counts against the pass's cap; a spending act without one is refused (`REQUEST_INCOMPLETE`). Answered by `act_result`, or by an explicit `act_decision` when outside the pass. |
| **`act_held`** | The door's answer when it holds an act for the owner instead of finishing it now, for example an over-limit purchase (SPEC §7.3). Nothing is completed until the owner confirms, often with a superseding mandate bound to that hold. If the hold lapses, the act is not done. |
| **Agent front** | What a place chooses to publish for agents: its place listing and lobby. Who it is, what it offers, what each action asks for, its door rules. Open to anyone to look at; nothing about the reader is asked for or kept. |
| **Allowance (standing allowance)** | What an owner lets the representative do alone, signed once with a passkey: purposes, place categories, actions, optional spend per period. Shown one grant at a time. |
| **Anonymous visiting representative** | An agent with no signed Shōkai card, or an unsigned greeting (the spec says *unprepared*). It may read the window, and the host representative gives it the leaflet and a kind "not now", never silence. |
| **Assets lent by reference** (proposal, not built) | A design idea, not in v0.5.0: a licensing desk would let an agent use a media asset inside its pass for a stated purpose and time window, and get back the finished output, not the source files. Where a hand-off is unavoidable, a time-limited loan would close with a signed deletion statement. A copied digital file can't be proven deleted. See [Assets lent by reference at a licensing desk](./future-directions.md#assets-lent-by-reference-at-a-licensing-desk-proposal). |
| **Badges at the door** (proposal, not built) | A design idea, not in v0.5.0: a visitor would present a signed credential or badge (for example an Open Badge) alongside the Shōkai visitor card when a door asks for it. The card itself is not upgraded. Each door would decide what a badge is worth. See [Credentials and badges at the door](./future-directions.md#credentials-and-badges-at-the-door-proposal). |
| **Basis** | The audit fields on every decision (policy version, gate-input digest, decision time) that make it replayable. |
| **Campaign** | Offers from one principal that share a `campaign_id` or are rewordings of one pitch. Counted once, however worded. |
| **Shōkai card (*meishi*)** | The representative's signed business card: principal, role, standing, mandate scope, locales, key, validity. |
| **Shōkai host card** | The place's signed card, shown at the door with a fresh possession proof. It names the place, the host representative, and the house (name, owner and policy, including action limits). The owner signs it with a passkey; if the house changes, the digest changes and the door fails closed until a matching card is signed. |
| **Conditional** | A decision that says yes if the visiting representative meets typed, checkable conditions. |
| **Conduct signal** | A minor finding noted against a principal at a person's door. Three in 90 days count as one serious finding. |
| **Considering** | A decision that takes the request inside to a person who can decide, by a stated date. Grants nothing now. |
| **Courtesy** | The polite, localized text with a decision. Never something a receiver branches on. |
| **CustomerLink** | A signed record that a place already knows this person as a customer (or employee), made in the place's own channel and consulted at the door (SPEC §5.4). The Shōkai visitor card is not a login. When the relationship ends, the place ends the link. |
| **Data asks** | The personal data a place declares, per action, that it will ask the owner for (`[]` when none), so a representative can tell its owner before joining. |
| **Deny** | A decision with a disposition (`not_now`, `not_a_fit`, `never`) and a retry. |
| **DID** | A decentralized identifier. `did:key` for representatives, `did:web` for organizations, `did:jwk` for owners' passkeys. |
| **Door** | The entrance of a place: its listing, entry, lobby and inbox addresses. Every arrival gets an answer. Anything personal happens only through the eight beats of a visit, with a Shōkai visitor card and signed limits. A signed introduction (a vouch) is used only when that door's own policy asks for one. |
| **Door pointer** | The answer at an unknown route: where to start. |
| **Door policy** | At a person's inbound door, the owner-signed rules for brands: public categories and caps, and a private part that never leaves the representative. |
| **Duty of loyalty** | A representative acts in its principal's interests and never accepts an inducement on its behalf. |
| **Encounter** | One visit, from the first greeting to the farewell, bound to its two parties. |
| **Extension** | An optional, separately versioned document with its own conformance level that adds rules without weakening the core. |
| **Grant** | A decision that gives a pass to the visiting representative. |
| **Guest** | A visiting representative the place itself introduced, with the place's own signed invitation (a vouch signed by the place's own key, §4). Today that's used mainly for joining or opening an account, as in the online university's offer of admission. A plain "come visit" invitation, guest marking in the pass and the report, and a leaflet for an invitee that isn't ready are proposed (S8). |
| **Host** | In the specification, the space being entered, which owns the policy and passes. Its **host representative** keeps its door, and a **visiting representative** is a representative arriving there. |
| **Host representative** | The agent that keeps its owner's door (called the "gatekeeper" in earlier drafts). It checks, decides, explains, gives a pass, and records each visit. |
| **Inbound door** | A place kept by a person's representative where brands present things to its owner. |
| **Introducer** | Optional. A third party that deliberately vouches for a visiting representative and stakes its own standing on it. |
| **Introducer interest** | What an introducer declares it gets from an introduction: `none` (genuine), or `discount`, `affiliate`, `sponsored`, `gift_received` (paid). |
| **Introduction** | The ritual step where the visiting representative introduces itself: `vouch: null` for a self-introduction (the normal case), or a vouch. A vouch is always deliberate; being connected is never an introduction. |
| **Invitation** | The place's own signed invitation, which it always weighs as its own. |
| **Invitation request** | The statement of purpose: the signed mandate and a structured proposal. |
| **Leaflet** | Plain-words name for the `LobbyBriefing`, the lobby's answer to an agent that isn't ready. |
| **Links** | Optional pointers from a listing entry to what the place already publishes for agents elsewhere (an MCP Server Card, an A2A Agent Card, a product feed). Hints only; they never widen what the door decides. |
| **Lobby** | The answer to an anonymous (unprepared) visiting representative: the leaflet (what the place is, how it works, what's needed with a plain sentence for the owner, onboarding, templates), and a polite `not_now`. Never silence, never a penalty. |
| **Mandate** | An owner-signed (or allowance-issued) statement of purpose, allowed actions, limits and validity for a visit. |
| **Mention** | One agent telling another about a place ("my owner might like this shop"). A recommendation, never a vouch. |
| **Misconduct notice** | A signed finding sent to the visiting representative's principal and every introducer in the vouch chain. |
| **Offer** | One structured presentation, invitation or gift a brand brings to a person's door. Always data. |
| **Owner** | The human principal behind a personal representative. |
| **Owner consent** | An owner's signed decision, given asynchronously, never mid-visit. Binding actions need a passkey. |
| **Place** | A host reachable through a door. |
| **Place listing** | The machine-readable list of a place's entries, purposes and actions. |
| **Possession proof** | A signature over the counterpart's greeting nonce, proving the presenter holds the Shōkai card's key. |
| **Principal** | A person, brand, company or system that signs for and answers for its representatives. |
| **Proof level** | `self_declared` < `evidenced` < `vouched` < `verified`; the receiver computes the effective level itself. |
| **Reason category** | A kind, coarse reason a person's door may give a declined brand, never revealing private tastes. |
| **Relationship record** | The host representative's local record per counterpart principal: how it records each visit (§9.1). |
| **Report home (visit report)** | The visiting representative's report to its owner after every encounter, with one next step that waits for approval. The host representative records the same visit at its door (relationship record). |
| **Representative** | Not a representation of you: an agent with agency that speaks and acts for one principal, within what its owner signed, and that knows and belongs to what it represents. It has its own key: the agent that goes out on your behalf (a visiting representative) or keeps your door (a host representative), or both. A coding agent that never leaves home and keeps no door doesn't need to be one. |
| **Retry** | When and how a visiting representative may try again: `after` a time, `with_credential [...]`, or `never`. |
| **Ritual** | Earlier name for the eight beats of a prepared visit: (1) at the doorstep, the representative reads the listing, and a visitor without a Shōkai visitor card gets the leaflet, not a rejection; (2) the door checks the visitor card and an audience-bound possession proof, and the Shōkai host card is shown with its proof; (3) the host representative welcomes; (4) the visitor states its purpose and the owner's signed mandate limits; (5) the door decides (`grant`, `conditional`, `deny` with `not_now` or `not_a_fit`, or `considering`); (6) a pass (wire: `seat`) is admission; (7) every act is checked, including `act_held` and a superseding mandate when one is needed; (8) the visitor reports home, and the door keeps a local record. A signed introduction is not one of the default beats; a door uses one only when its own policy asks. |
| **Room** | Inside a place, where the representatives it let in can meet, safely, because everyone inside came through the door: a gathering (signed guest list, every Shōkai card checked, every message signed) or a pair place for two people's representatives. Extensions, not the core. |
| **Pass** (wire field `seat`) | What a grant gives: a least-privilege tool allowlist and limits, never wider than policy ∩ mandate ∩ request. The v0.5.0's plain word is **pass**; the published wire and SPEC field name remain `seat`. |
| **Self-introduction** (*jiko-shōkai*) | The visiting representative introduces itself with its owner-signed Shōkai card, purpose and limits, and no vouch (`vouch: null`). The normal case, and a valid step at every place. |
| **Superseding mandate** | A new owner-signed mandate that replaces the current one for a visit, used for example to approve one held over-limit purchase (`supersedes.hold`). It raises nothing standing: one use, then used up. |
| **Visit** | Arriving on one's own, by self-introduction or as an anonymous visiting representative at the lobby. |
| **Visiting representative** | A representative that goes out on its owner's behalf: it reads a place's window, knocks and introduces itself, works within its pass, and reports home. A *visiting representative* comes on its own; a *guest* comes with the place's own invitation (see **Guest**). |
| **Vouch** | An introduction by someone known here: a signed, scoped, revocable statement by an introducer, an owner the place already knows, who stands behind a visiting representative, with a hash-chained revocation log. The introducer signs it; their representative can't. Most visits don't need one. |
| **Website** | A place's ordinary public pages. Outside Shōkai: any agent can already read them. |
| **Window** | Plain-words name for a place's listing: open to anyone, with no Shōkai card, key or account (§3.1). |
