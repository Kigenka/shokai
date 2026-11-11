# Future directions (not in the protocol yet)

> **None of this is implemented.** These are directions the project expects agents to take, written down so the design can make room for them. Nothing on this page is in Shōkai v0.3, its SDK or its conformance suite, and nothing here changes what the [specification](../SPEC.md) requires. Where an idea would need a protocol change, it is noted as a proposal.

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

---

To discuss a direction, or to turn one into a proposal, see [Contributing](../CONTRIBUTING.md) and the repository's `proposals/` folder.
