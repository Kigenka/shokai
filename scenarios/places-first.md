<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Places first: the tea shop, six everyday scenarios and the room, and how far rc4 covers them

*Informative working note, not part of the frozen catalog and not a SPEC change. Written 2026-10-27 against SPEC v0.3.0-rc4 (feature-frozen), from the editor's walkthrough; the tea shop walkthrough and the room were added the same day in the clarity pass. Every person, business and place here is fictional: the owner, their friend, a fine tea shop, Brightwick Outfitters (a clothing store), Lanternrow Market (a marketplace) and Harborlight Bank.*

## The idea in one paragraph
Shōkai starts from **places**. A tea shop, a store, a bank, a market or a community keeps a door, and its own representative stands there: the gatekeeper, in plain words the **host at the door**. A visitor is a representative that answers to an owner who signed for it: the owner signed its card with a passkey (§2.3, §2.1), and every request rides on limits the owner signed (§5). The normal arrival is an **honest self-introduction** (*jiko-shōkai*): the visitor says who it represents and why it came, shows what its owner allowed, and shares the context its owner chose to share; `vouch: null` MUST be accepted (§4). The host checks what it can verify, decides, and always explains (§3.1, §6.2). Being vouched for by someone the place trusts is an optional extra, which a place may ask for when the stakes are high (accounts, money: §4). An agent with no card is never ignored and never punished; it gets the lobby, the place's leaflet, which explains the place and how to come back ready, with one plain sentence per item for its owner (§3.3). Inside a place there is a second layer, the room, where the representatives it let in can meet (Gatherings and Peer meetings extensions; see (g)).

---

## The tea shop: the first walkthrough
The canonical first example, used by the docs ([How Shōkai works](../docs/how-it-works.md)) and by episode 1 of the story series. A fine tea shop sells tea and likes to know its guests: a little exclusive, like a members' club, but never hostile. The owner loves tea, has had tea in Japan and wants a fine green tea.

| # | What happens | rc4 |
|---|---|---|
| 1 | The representative reads the shop's front: what it is, what it sells, what each action would ask the owner for. No card needed. | §3.1 (listing, `data_asks`), D20 |
| 2 | **A stranger comes first: no card, no owner.** The host doesn't ignore it. It answers with the leaflet (`LobbyBriefing`: what the shop is, how it works, an onboarding link, and an `owner_text` sentence per readiness item), then `deny` / `not_now` and a farewell. The stranger is never seated, and never answered `never` for being unprepared; it may come back ready. Even with money to spend, an anonymous agent doesn't get in: a place that wants to know its guests is entitled to that. | §3.3 (C28, C55, C102), §3.1 |
| 3 | **Our representative introduces itself.** Greeting with a fresh nonce; its card (and the shop's card back); `introduction` with `vouch: null`. It says who it's here for and why it came: its owner loves tea, has had tea in Japan, and is looking for a fine green tea. | §3.2, §2.4, §4 (C4) |
| 4 | **Its card is signed by its owner**, with a spending limit for this errand: a `purchase` mandate with `max_amount`, ideally naming the shop in `counterparties`. | §2.3, §2.1, §5.1 |
| 5 | **The host checks what it can verify** (signatures, possession proof, revocation, the mandate) and grants a seat no wider than policy ∩ mandate ∩ request. "Come in." | §2.4, §2.6, §5.1, §6.1, §7.1 |
| 6 | **Inside, the host shows the teas.** That's the shop's own service, called within the seat (for example its MCP tools). | §7, §11.3 |
| 7 | **It buys the green tea, within the limit.** The act states its amount; the shop counts it against the seat and the mandate. A purchase past the limit is refused, and the representative takes anything more home. | §7.2, §5.1 (C175), §6.7 |
| 8 | **The tea goes home, and so does the report.** The visit report says what happened, what was shared and one next step for the owner. Delivery and payment are the shop's own. | §8.2, §0 |

**How the owner's context travels.** What the owner chose to share rides in the card's claims (§2.5) and the request's purpose statement (§5.3). Prose never enters the decision (§6.5): the context shapes the host's welcome and service, not whether the door opens. The visit report lists it under `shared` (§8.2).

**Covered today.** Every step above; `shokai demo` runs steps 3 to 8 locally (a tea shop, a 10.00 USD mandate, a sencha order, a refused order past the limit, the report home).

**Gaps.** None structural for this walkthrough. Two notes: a shop that wants buyers to bring more than a card (for example a vouch before spending) can say so only through policy and a `conditional`, not in its listing (gap 4 below); and a structured "what my owner likes" profile is the Profiles and evidence extension, not the core.

**Every refusal is an invitation.** Step 2 is how Shōkai spreads: the stranger's agent goes home with a sentence its owner can act on, and can come back as a representative.

---

## (a) Browsing a store, no purchase
The owner's representative visits Brightwick Outfitters to see the new autumn designs. Nothing is bought.

**Covered today.**
- Looking at the place's agent front (listing, lobby) needs no card at all (§3.1, D20).
- A browse visit uses the `visitation` purpose: non-spending, and a mandate for it MUST NOT carry `max_amount` (§5.1, registered purposes). A store SHOULD seat a `visitation` visit for browsing and questions (§5.1, learn vs buy).
- The introduction is `vouch: null` (§4). The seat has no spending allowance, so any act that moves money is refused (§5.1, §7.2).
- The representative reports home what it saw, with the store's words marked as quotes (§8.2).
- The store keeps a relationship record for the owner (§9.1) and may return a `relationship_ref`.

**Missing.** Nothing structural. What the store's agent says and shows inside the seat is the store's own service (MCP tools, §11.3), as intended.

## (b) Coming back later to buy, within a signed limit
A week later the owner says "get the grey coat". The representative returns to Brightwick to buy it.

**Covered today.**
- The return visit cites `relationship_ref` and `prior_response_ref` and is judged as a continuation (§9.1).
- The purchase uses the `purchase` purpose with a mandate carrying `max_amount`, signed by the owner's passkey (§5.1), or issued by the representative under the owner's standing allowance (§5.2). The store seats it only within that limit (§5.1, §6.1).
- Each act states its amount; the store counts it against the seat and the mandate, across visits (§7.2, §5.1 C175). The store may charge less, never more (§7.2 C187).
- If the first visit was an anonymous lobby look, the Visit receipts extension can join the two visits.

**Missing.**
- Nothing in the protocol carries "the item I looked at last time" (a shortlist or hold). The relationship record keeps encounters and decisions, not items. Today that is the store's own service; that seems right, but a hint in the guide would help implementers.
- Payment itself is out of scope by design (§0): Shōkai carries the limits, the payment rail does the paying.

## (c) A cold visit to buy a gift for his mom, with a budget
The owner has never been to Brightwick. His mom loves the brand. He tells his representative: "find her a scarf, up to USD 80."

**Covered today.**
- A self-introduced visit is valid (§4). The owner signs a `purchase` mandate with `max_amount` USD 80, ideally with `counterparties` naming Brightwick (§5.1). The store checks the owner's signature itself; nobody has to vouch.
- The store can see before the visit what personal data it will ask for, for example a shipping address (`data_asks`, §3.1). The representative takes any undeclared ask home (§3.1, §1 duty of loyalty).
- A store that wants more for strangers who spend can answer `conditional` with `require_vouch` (§6.1), but nothing forces it to. The "no accept-anyone for money" rule (§4) limits which vouches count for money; it does not stop a self-introduced purchase.
- Upsells beyond the budget are declined or taken home, never accepted (§1 duty of loyalty, §5.2).

**Missing.**
- **Who the gift is for.** The purpose statement can say "a gift for my mother" in prose, but prose never enters the decision (§6.5). There's no structured "gift for a third party" field, and nothing tells the store that the mom's details are hers. That's acceptable for now; a gift-wrap or ship-to-someone-else option is the store's own service.
- **No listing flag for "introduction required to spend".** `requires_introduction` exists only for account-creating actions (§3.1, §4). A store that only sells to introduced visitors can say so only through its policy and a `conditional` answer, not up front in its listing.

## (d) The store's agent as a guide, and a marketplace guiding to different areas
At Brightwick, the store's agent suggests what's new and what fits the owner's taste. At Lanternrow Market, the market's agent welcomes the visitor and guides it to the areas (individual brands' stalls) that suit it, like a host walking a guest through a mall.

**Covered today.**
- Inside one place, guiding is what happens after seating: the seat's tools, called over MCP with signed acts (§7, §11.3). The core says plainly that after admission the work runs over MCP, A2A or the place's own APIs (intro).
- A market can list several places at one door: `PlaceListing.places` is a list, each entry with its own principal, entry address, category and actions (§3.1). So Lanternrow can publish every stall as its own place.
- Seeking (extension) lets a place say what it's looking for.

**Missing (real gap).**
- **No handoff between areas.** Nothing lets Lanternrow's gatekeeper pass a checked visitor to a stall without a fresh ritual. Each stall is its own place: the visitor greets again, shows its card again, and makes a new request. Nothing says "the market already checked this visitor, here is its seat, narrowed for this stall".
- **No parent/child places.** A listing entry has no field saying "this stall is part of Lanternrow" or that the market answers for it. The only link is that they share one listing, and listings are hints that prove nothing (§3.1).
- **The helper direction is deferred.** A host inviting a product's representative into its own place (traces H1, H2) is described in §13 but not normative. That is the closest existing idea to "the market brings a brand's agent to the visitor".
- Mandate limits are counted per place (§5.1 C175, informative note): a budget spent across several stalls in one market is held together only by the representative's own ledger (§5.1 C176, §5.2).

## (e) An existing bank customer's representative checks a balance or makes a transfer
The owner already banks with Harborlight, with a login and an account. He asks his representative to check his balance, or to send a transfer.

**Covered today.**
- Purposes exist: `data_access`, `account_servicing`, `payment_initiation` (§5.1).
- The owner can sign each errand with his passkey as its own mandate, naming Harborlight in `counterparties` and carrying the transfer's `max_amount` (§5.1). That signature is his consent (§5.1, D7). A mandate's limits bind across visits (§5.1 C175).
- Larger requests can go to `considering`, and an outcome routed to the owner needs his passkey `approve_commitment` (§6.8, §8.1).
- A place MUST NOT ask for a representative's private key (§12.1).
- A per-place owner identity for the bank is possible (§2.8), so the bank's relationship doesn't leak to other places.

**OPEN GAP (core).** rc4 has **no customer-link mechanism**. Shōkai proves who the owner is (an owner DID) and what he signed. Nothing in the core says "this owner DID is your existing customer, account so-and-so". The relationship record (§9.1) is created by visits, not by an existing bank account. A bank could tie an owner DID to an account outside the protocol, but the protocol doesn't say how, what the representative shows, or how the bank confirms it.

**Recommended direction.**
1. **Link once, inside the bank's own app.** Signed in through the bank's normal login, the owner registers his representative's owner DID (or a per-place identity, §2.8) against his account. The bank records the link itself.
2. **Never carry bank credentials.** No password, one-time code, access token or account number travels in a card, a mandate or a message (in line with §12.1 and proposal P14's one rule).
3. **The owner's passkey approves each request.** A balance check or a transfer rides on a mandate the owner signs for that errand (or a narrow allowance grant for read-only checks), with the amount and the bank named. The bank checks the signature and its own link record, then seats it.
4. **Starting point:** proposal **P14 (Carried grants, status Proposed)** sketches this as a signed *reference* to an approval the bank already holds, confirmed by the bank from its own records (`place_confirmed`), plus a typed `require_grant` condition. It is not in rc4, and rc4 is feature-frozen, so this is post-v0.3 work.

## (f) A referral trail: a friend's representative mentions a brand
One evening the owner's representative and his friend's representative meet, inside a place that let them both in (a gathering, or a pair place their owners set up; see (g)). The friend's representative says Brightwick has new designs the owner would like. Later the owner's representative visits Brightwick and says how it heard of the place. Separately, the owner says: "I trust your taste. When you hear of a good brand, go and look, and bring me what's interesting." So the representative becomes his fashion curator and doesn't ask each time.

**Covered today.**
- **A mention is not a vouch.** §4: an introduction is a deliberate act. A vouch exists only when the introducer signs it: the friend's own passkey (`issue_vouch`, §8.1), or the friend's representative within an allowance the friend signed that covers issuing vouches (§5.2). Being connected is never an introduction: meeting, sharing a place or appearing in relationship records is not one, and a gatekeeper MUST NOT treat it as one (§4, §9.2).
- **When the friend does vouch deliberately**, the `Vouch` already has what the trail needs: `subject` is the owner's representative and card, `scope.counterparties` can name Brightwick, `relationship` describes the tie, and `introducer_interest: "none"` says it's a genuine recommendation (§4). For a browse visit a store MAY honor any introducer (§4); for money only introducers it names (§4).
- **The curator allowance is expressible.** An `AllowanceGrant` with `purposes: ["visitation"]`, `place_categories: ["store"]`, browse actions and no `spend` lets the representative issue its own browse mandates without asking (§5.2). The owner's plain wording ("curate fashion for me") fits the grant's `note` and the allowance's `shown_to_owner`. With no `spend`, it can look but never buy (§5.1, §5.2). Buying still goes home for a decision (§5.2).
- The visit report tells the owner who introduced whom (§8.2).

**Missing.**
- **No field for "how I heard of you".** (Noted as a later candidate in [P22](../proposals/P22-first-purchase.md).) Nothing carries an unsigned mention ("the friend's representative told me about you") as provenance. `Proposal.evidence` holds references to signed artifacts, not a note. Today the representative can say it only in prose (`value_to_counterparty`), which never enters the decision (§6.5), or in an `x-` member, which a place may ignore (Conventions). That's arguably right: a mention proves nothing. But the owner's wish ("the store should know the trail") has no structured home.
- **Risk to design around.** At an inbound door, prose that claims an introduction no signed vouch shows is impersonation (§10, §9.3 `manipulation`). The same care belongs here: a "heard from" note must read as a mention, never as "sent by", unless a signed vouch is attached.
- **No role on the card for "curator".** A curator is just a representative with a browse grant. There's no structured "acting as curator for the owner" on the card or request; the purpose statement says it in prose.
- **Vouch for a place the friend never named.** A vouch's `scope.counterparties` is optional, so a friend could vouch for "any store"; whether places should weigh an open-ended vouch less is policy, not spec.

## (g) The room: representatives meeting inside a place
At a community's gathering, the representatives the place let in meet and talk, the way people exchange business cards at a conference. Afterwards, one representative would like to keep another's card, like a *meishi* exchange.

**Covered today.**
- **Meeting happens inside a place, never in the open.** Under the Gatherings extension, the place signs the guest list (`Gathering.invitees`: each representative and principal, and who invited it), every attendee checks the list and its own presence on it, the place verifies each attendee's card against the list, and every room item is signed by its sender and verified by every receiver (Gatherings: "Gatherings: groups are places"). Entry needs each owner's passkey `accept_house_rules` (Chatham House by default).
- **Peer meetings.** Two people's representatives can meet in a pair place, seeded by an owner-to-owner invitation; both introduce themselves and run the full ritual, so cards are exchanged both ways (Peer meetings extension; §3.2).
- **Knowing someone is local.** A representative keeps its own relationship graph (§9.2, informative; edge rules in Gatherings "Closeness"). A `friend` edge needs both principals' signatures; the graph is never a gate input, and having met is never an introduction (§4).

**Missing: the meishi exchange.** rc4 has **no way for one attendee to hand its card to another and for that card to be kept after the gathering**. In a gathering, cards are exchanged only with the place (§3.2 step 2, Gatherings); attendees see each other's DIDs on the signed guest list and signed room items, never each other's cards; and nothing says what an attendee may keep once the gathering ends. House rules (no attribution outside the gathering without consent) also mean a kept card would need the giver's consent. Candidate for a later version: [proposals/README.md](../proposals/README.md#candidates-not-yet-drafted).

---

## Real gaps found (summary)
1. **Existing-customer link (e)**: no core mechanism. Direction: link once in the bank's app, no credentials on the wire, passkey per request. Starting point: P14 (Proposed). Post-v0.3.
2. **Handoff inside a place with areas (d)**: no handoff between a market and its stalls, no parent/child places; each area is a fresh visit. The helper direction (H1/H2) is deferred.
3. **"How I heard of you" provenance (f)**: no structured field for an unsigned mention; only prose or `x-` members. Any future field must stay non-authoritative and must never read as an introduction.
4. **"Introduction required to spend" in the listing (c)**: `requires_introduction` covers only account-creating actions; a store can require a vouch for purchases only through policy and a `conditional`.
5. **The meishi exchange in the room (g)**: no way to give and keep another attendee's card after a gathering; a candidate note is in the proposals index.
6. **Smaller items**: no structured third-party gift context (c); no carried "item I looked at" across visits (b, store's own service); no structured curator role (f); budgets across several places, or stalls of one market, rest on the representative's ledger (d, §5.2).

What already works without change: the tea shop walkthrough end to end, self-introduction as the normal case (§4), browse-only seats (§5.1), signed spending limits checked by the place (§5.1, §7.2), return visits (§9.1), the lobby for agents that aren't ready (§3.3), deliberate signed vouches with the friend's interest declared (§4), and a browse-only standing allowance for a curator (§5.2).
