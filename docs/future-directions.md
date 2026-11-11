# Future directions (not in the protocol yet)

> **None of this is implemented.** These are directions the project expects agents to take, written down so the design can make room for them. Nothing on this page is in Shōkai v0.5 (specification v0.5.0, package 0.5.1), its SDK or its conformance suite, and nothing here changes what the [specification](../SPEC.md) requires. Where an idea would need a protocol change, it is noted as a proposal.

## Representatives that discover places on their own

Representatives will meet far more representatives than their owners ever meet people: at a fan community's gathering, in a place's room, among a friend's visiting representatives. They'll hear about places their owners might like. A representative may bring that home ("look what I learned"), and a busy owner may answer "check it out when you have time". When it goes, it knows its owner didn't send it there, and it should say so.

What exists today: a recommendation heard at a gathering is never a vouch ([Arriving](./concepts/arriving.md#introduced-by-someone-known-here)), and the visit is an ordinary self-introduction. What's proposed: a structured "how did you hear about us" field for the visiting representative, which a place may check against its own record of the referrer to shape its welcome, never its decision; and a marker in the visit report saying whether the owner asked for the visit or the representative found the place itself.

## Place invitations: guests and visiting representatives

Today a place can introduce a representative itself, with a vouch signed by its own key (SPEC §4, D17), used mainly for joining or opening an account. Proposed (S8): a plain "come visit" invitation a place can send to a person or a business, naming a purpose, the actions it offers and an expiry; delivered through the inbox or as a link; presented at the introduction step and weighed as the place's own vouch. The pass and the report home would mark the visit as a guest's. And an invitee who has only a plain agent would get a leaflet that says so kindly: "you were invited; bring your representative", which tells the person on the other side to make sure the agent they send truly represents them.

## Asynchronous alignment

A person can talk with someone else's representative directly. Picture a collaborator visiting a project's lead, who suggests: "Talk with my co-worker agent too; it has its own view of the project." The collaborator and the agent talk, and the alignment they reach goes beyond what the two people settled between themselves. That can be valuable, and it can get messy: who agreed to what, on whose behalf? It's one reason a vouch stays signed by the owner, never by the owner's representative. A proposal is on file, deferred to v0.4 or later ([P19](../proposals/P19-alignment.md)). A representative can carry an introduction, but only its owner can make one.

## Scheduled reports

A report home doesn't have to be read at once. Some owners will want a standing appointment with their representative, an hour on a Saturday morning, say, to go through where it went, what it learned and what's waiting for a decision. That's a relationship, not a notification. Today every visit already ends in a report with exactly one next step, and silence means no ([Report home](./concepts/report-home.md)); a scheduled review would sit on top of that.

## Context-aware buying, within the owner's limits

A representative that knows its owner's calendar will know about the anniversary next week, the client gift before a corporate event, the dinner a friend is hosting. It could suggest, or, under a mandate its owner signed, buy what's needed. The rules don't change: it spends only for its owner or the people its owner buys for, only within the limits its owner signed, never for itself, and anything outside those limits comes home for the owner to decide ([Limits and mandates](./concepts/limits.md)).

## Credentials and badges at the door (proposal)

Universities and other issuers already give people credentials and badges. [Open Badges 3.0](https://standards.1edtech.org/open-badges/specifications/standards/v3p0), from 1EdTech, is built on the [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model-2.0/).

What exists today: the Shōkai visitor card says who the person is and who stands behind the representative. An optional vouch ([SPEC §4](../SPEC.md)) is a signed introduction, not an achievement credential. v0.5.0 does not read Open Badges.

What's proposed: a representative may present a badge as a separate signed proof, alongside the visitor card, when a door asks for it. The card is not upgraded. Each door decides what a badge is worth. The owner chooses what to show, so a door does not see a whole record. There is no global score. A worked example is in [An online university](./examples/online-university.md#proposal-badges-that-open-doors): Ines carries a "Data Ethics, gold" badge to an advanced lab or a scholarship desk.

## Assets lent by reference at a licensing desk (proposal)

A rights holder may hold generative media assets — reference images, character art, voice assets — that a visiting representative needs for a stated purpose.

What exists today: a scoped pass, a local record ([SPEC §9.1](../SPEC.md)), `not_now`, and a report home. v0.5.0 does not have a loan object, and it does not lend a file by reference.

What's proposed: the asset is lent by reference, not handed over. The agent uses it inside its pass, for the stated purpose and time window, and what comes back is the finished output, not the source files. Where a hand-off is unavoidable, it is a time-limited loan that closes with a signed deletion statement from the agent's owner. A copied digital file can't be proven deleted. The desk's local record notes an open or unclosed loan, and the next visit is `deny` with `not_now` and the reason "settle the open loan first"; the door reopens once the loan is settled. `never` is reserved for misconduct. There is no global score. A worked example is in [At a fan community](./examples/fan-community.md#proposal-assets-lent-by-reference).

---

To discuss a direction, or to turn one into a proposal, see [Contributing](../CONTRIBUTING.md) and the repository's `proposals/` folder.

## Slack and Microsoft Teams: where people watch and approve (future direction)

> **A future direction, not a feature.** Shōkai has no Slack or Microsoft Teams binding today, no Slack or Teams app, and no listing in either app directory. Nothing in this section is built unless it says so.

**In plain words.** Representatives meet *inside a place*: a visiting representative arrives at a place's door, shows the Shōkai visitor card its owner signed, and the door decides. That conversation runs over the protocol's own transports (the HTTP binding and the MCP binding, SPEC §11), not over chat messages. So in this picture, Slack or Teams is not where representatives talk to each other. It is where the **people** are: where they share a door's address, watch a visit happen, read a short summary of what was decided, and talk about what to do next. Approving anything that matters (signing a card, a mandate or a raised limit) still happens with the owner's passkey on the owner's own device. A chat button, a slash command or an emoji reaction is not a signature and not an approval.

**How it could work, in three steps of increasing effort.** Slack is used below because its developer documentation was checked; a Teams version would follow the same shape, and its details have not been worked out.

1. **Watch a visit, with no app.** A place owner opens a time-limited place with its own host representative, the usual way. The two people share its https address in a channel or a direct message. A visiting representative goes to that address over HTTP or MCP, exactly as it would without chat. Either person posts a short, redacted summary by hand. *Uses what exists today:* doors, visitor cards, the five decisions (grant, conditional, deny as `not_now`, deny as `not_a_fit`, considering) and passes. If the visiting representative has no signed card yet, the door hands it the leaflet and answers `not_now`; that is a working door, not a failed test. *Would need building:* nothing, apart from an optional one-way poster for the summary.
2. **A thin app on one side.** A small Slack app (for example, Bolt for JavaScript in Socket Mode, so Slack needs no public request URL) installed in the place owner's workspace. It posts the door's address and when it closes; a **redacted** visitor-card summary (display name, purpose, shortened principal and representative ids); the door's decision in the five statuses; and, if a pass was issued, its tools and limits in plain words. The door itself still runs as its own process next to the app and speaks HTTP or MCP. The app posts; it doesn't need to read the channel. *Would need building:* all of the app, its redaction rules, and a check of who clicked any button (in a shared channel, people from another organization can see and may click, and a click is not consent).
3. **An app on both sides (closer to an enterprise app).** Both organizations install it, so a workspace or channel can present a place's door and admit outside representatives by visitor card and pass, with a local record. *Would need building,* including questions Shōkai 0.5 does not answer: how a Slack or Teams account relates to a Shōkai visitor card (a chat user id is not a signed card, so this needs an explicit, owner-signed mapping), where the relationship record lives, organization-wide installation and admin approval, each app directory's rules for agent apps, and whether people from another organization can use agent features in a shared channel. Hosting a door inside Slack's own app hosting is a poor fit, because a door's state and keys don't belong there.

**What stays out of chat messages.** Owner keys, passkeys, recovery phrases, passwords, payment card numbers and session tokens; representative or place private keys; raw signed envelopes, full mandates and door-state files; and the chat app's own tokens and signing secrets. The owner's signing key stays with the owner as a passkey. Each representative's key stays on the computer that runs that representative. A place's host key stays with the place's process. A chat app's credentials stay in that app's own configuration, away from any Shōkai key. A door's public listing and its host *card* are meant to be shown; the private keys behind them are not.

**Before any of this is claimed.** A test with real people would start with step 1, and each opening of a door to the internet is a separate decision by its owner. Steps 2 and 3 would be described as available only after they are built and tested.

