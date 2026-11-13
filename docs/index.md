# What is Shōkai?

**Your place, your rules, when agents come to visit.** Shōkai is an open protocol that gives online places a door for AI agents. Every agent that comes in arrives introduced: who sent it, why it came, and what it may do.

## Who it's for

Shōkai is written for the person who owns a place — a bakery, a studio, a shop, a university, a community. You decide the rules. The door enforces them from signed facts. Visitors bring their own agents; Shōkai is the door and the card, not the agent. No money moves through the door.

For a fuller account of what Shōkai is not, see [Why Shōkai](./why.md#what-shōkai-is-not).

[![Shōkai: an arch of two halves, a visiting representative and a place, joined by a keystone: the introduction that completes it](./assets/hero.svg)](./assets/hero.svg)

The world is filling with agents of every kind: agents that write, research, shop, plan and build. A **representative agent** is the new kind of agent the door makes possible. It carries someone's name and reputation into places, for a person, a brand, a business or a place, introduced with a Shōkai card they signed. That's more than acting on someone's behalf, which a coding agent does too. Representatives work in both directions. Inbound, a **host representative** receives visiting representatives at its owner's place; outbound, a **visiting representative** goes out and introduces itself at other places.

**A representative, not a representation.** A representative isn't a picture of you: it has agency, and speaks and acts on your behalf, within what you signed. It knows and belongs to what it represents, and that is where its trust and context come from.

**Yours, not a platform's.** Your agent representative's visitor card belongs to you, not to a platform. You sign it, you set its limits, and you can withdraw it at any time. Each place decides whom it lets in, and you decide where your representative goes and what it may do there. What it brings home can be rich, too: pictures of a place, a short audio note, its visit stamps, the story told in its own personality.

Every representative answers to an owner who signed for it: a person, a business or an organization, never an anonymous agent running wild. That matters now. Banks are finding agents inside customer accounts and often can't tell whether the customer directed them ([Axios, October 22, 2026](https://www.axios.com/2026/10/22/ai-agents-banks-unauthorized-accounts-access)); Amazon blocked Muse (Meta) from shopping on its store, saying the agent didn't identify itself ([September 20, 2026](./why.md#happening-now-agents-at-the-store)); United Airlines restricted unauthorized third-party AI agents from booking or managing trips unless the airline itself permits them ([November 11, 2026](./why.md#happening-now-agents-at-the-airline)); and when the editor's agent bought this project's domain, no site could tell an agent was acting, or for whom ([October 28, 2026](./why.md#a-true-story-my-agent-bought-a-domain)).

Shōkai has already been tested with agents that already exist: Grok Bot (SpaceXSI), Muse, Hermes Agent (Nous Research) and OpenClaw (OpenClaw Foundation). In the project's own field tests, an agent on each was admitted at a test place: Hermes Agent and OpenClaw in sandboxed runs with development keys; Grok Bot and Muse with Shōkai cards their owner signed with a passkey and prepared for them in advance. None of them has adopted Shōkai, and Shōkai isn't affiliated with them or their makers.

Places come first: a tea shop, a store, a marketplace, an online university, a community, a bank, a company's internal tools. Each keeps a **Shōkai door**, with its own **host representative** to receive visiting representatives. A **visiting representative** introduces itself, and the host representative learns from signed facts, not from what the visiting representative says about itself:

- **Who it's here for.** A Shōkai card signed by the person, business or organization behind the visiting representative, who stands behind it. A person signs with their passkey.
- **Why it came.** The stated purpose, and the context its owner chose to share.
- **What it may do.** Limits the owner signed: purposes, actions, amounts and expiry.

The host representative answers clearly, and always explains, with one of four decisions (`grant`, `conditional`, `deny` with a reason and a way to retry, or `considering` when a person inside should decide). A visiting representative that isn't ready yet is handed the place's leaflet to take back to its owner, with a plain sentence saying exactly what's needed, and a kind "not now, come back prepared". An admitted representative is given a **pass** (the specification calls it a *seat*): exactly what was agreed, within its limits, until it ends. It reports home to its owner, and its conduct carries consequences for the person who sent it; the host representative records the visit at its door. Shōkai covers both sides of the door, with rules for each.

**Introduced by someone known here.** Most visiting representatives introduce themselves, and that's enough. A visiting representative can also arrive introduced by someone the place already knows: an existing customer, say, a person or a business with a good record at this door. The introduction is a deliberate, signed vouch from that owner; their own representative can carry and present it, signed by the owner or under an allowance the owner signed. The host representative then checks who the introducer is to this place, from its own record: "yes, we know them, a good customer". The weight comes from the depth of real relationships, earned visit by visit and place by place (inspired by PageRank), not from a social graph of who follows whom. Representatives also hear of places from one another, for example at a gathering of representatives in a fan community; that's a recommendation, and it becomes an introduction only when the other owner chooses to vouch. Some places ask for an introduction before opening an account or moving money; most visits don't need one. See [Arriving](./concepts/arriving.md), and [How Shōkai works](./how-it-works.md) for one visit to a tea shop.

> **Shōkai is the door itself**: a specially designed door, with its own rules and instructions for both sides of it. The host representative follows them to receive guests into a place; the visiting representative follows them to introduce itself and ask to come in. Inside, a place can also have a room where the representatives it let in can meet. MCP and A2A are the tools and the work: Shōkai is agent-to-agent only inside a place, at its door and in its room, and the work after admission runs over MCP, A2A or the place's own APIs.

**The same door, wherever it's placed.** Shōkai is one protocol, with the same rules and instructions for both sides, everywhere. What changes is the door's policy, set by whoever owns the place: a shop, a community, an institution, a person's own door, or a door inside a technical platform. Some places are where people go to buy, read or meet. Others are resource platforms, where agents go only to get something done: a database service, a hosting service, a developer API. There, today, an agent usually signs in as its human, and the platform can't tell whose agent it is or what kind. At a Shōkai door it can: whose representative, why it came, and what its owner allowed. One owner may use one agent or several; the door stays the same.

## Who can implement Shōkai

**Anyone.** Shōkai isn't tied to any agent, model or platform. It is an open protocol for the whole agent ecosystem. Everyone can implement either side of the door, or both.

1. **Builders of agent frameworks and SDKs** can build it in, so every agent made with them can become a representative: LangGraph, the OpenAI Agents SDK, CrewAI or Google's Agent Development Kit, for example (named as examples only; none has adopted Shōkai). Start from the [SDK](../packages/shokai/README.md).
2. **Agent services and platforms** can let their users' agents act as representatives. Grok Bot or Muse, for example, could implement it for the agents their users run ([platform guides](./platforms/README.md)).
3. **Developers already building on existing protocols** such as MCP and A2A put the door in front of the MCP server, A2A agent or API they already run; the work behind it stays the same ([Quickstart](./quickstart.md)).
4. **Businesses, organizations and individuals with a place**, a business opening its online store to agents, an organization such as a government office or a university, or a person making a new store for agents, run their own host representative ([Prepare your host representative](./prepare-your-host-representative.md)).
5. **Anyone starting small** who wants to welcome real representative agents, rather than letting every agent in without knowing who is behind it ([Set up your representative](./set-up-your-representative.md)).

### Where it already works

Only what the project's [field tests](./field-tests.md) recorded, including the 0.5 rounds of November 4–6, 2026 and the earlier 0.3-era rounds of October 25–28.

| Platform | Recorded so far | Not yet tested |
|---|---|---|
| **Grok Bot** | Both sides. As host: the Willowfold Tea House door ran on a Grok Bot computer, through a temporary tunnel, and admitted a Muse visiting representative (test 7). As visiting representative: a Grok Bot representative was admitted at Willowfold on the same computer with a Shōkai card signed with a real passkey (test 7). Earlier, practice guests on the pilot (test 1). | A stable public address for a place |
| **Muse** | The visiting side. Admitted twice at Willowfold through a public link, with a Shōkai card signed with a real passkey; it ordered and collected a stamp (test 7). Earlier, a cold visit with no Shōkai card: it understood the door and didn't knock (test 6). | Keeping a door |
| **Hermes Agent** (open source) | Developer runs in a sandbox, with development keys for a fictional owner: admitted at Willowfold (test 2), probes against the door (test 4), and a separate door built from the spec alone (test 5). | An owner setup with a real passkey |
| **OpenClaw** (open source) | A developer run in a sandbox, with development keys for a fictional owner: admitted twice (test 3). | An owner setup with a real passkey |

Every other platform in the [platform guides](./platforms/README.md) has a drafted recipe and is not yet field-tested.

### Guides and skills for platforms

Shōkai comes with draft guides and skills that a platform can give its customers, so each customer can create their own representative agent. Setting up a host representative and setting up a visiting representative are different onboarding conversations, each with its own questions, because a representative needs to know who it represents and what matters to them. Would you let someone who doesn't know you and your interests be your representative?

- **A visiting representative.** The owner's onboarding conversation: who they are, what it may do alone, what it must bring home, what it may share, whether it may spend (outline: [Owner journeys, the guest](./owner-journeys.md#journey-2-the-guest); in chat, step by step: [Make Noor my representative](../experiences/grokbot-representative-and-place.md#journey-a-make-noor-my-representative-going-out)).
- **A host representative.** The owner's onboarding conversation: what kind of place, who is welcome, house rules, what each action asks for, and how the place gets an address (outline: [Owner journeys, the host](./owner-journeys.md#journey-1-the-host); in chat: [Open a place](../experiences/grokbot-representative-and-place.md#journey-b-open-a-place-in-my-grok-bot-keeping-the-door); for developers: [Host a place](../deploy/HOST-A-PLACE.md)).
- **The skills.** The portable skill in the open Agent Skills format: [shokai-representative](./platforms/shokai-representative/SKILL.md). The Grok Bot skill: [grok-bot.md](./platforms/grok-bot.md). Where each goes, platform by platform: [recipes](./platforms/recipes.md).
- **Coming.** Ready-to-run onboarding conversation scripts, one for a host representative and one for a visiting representative, that any platform can hand to its customers. Today the two conversations are outlines and drafts.

How to choose between one agent and separate ones, and the steps for each: [Set up your representative](./set-up-your-representative.md). How to brief a host representative on how your place runs: [Prepare your host representative](./prepare-your-host-representative.md).

## What Shōkai enables

### For host representatives (places)

- **A tea shop's host representative can welcome a visiting representative it has never met**, check its owner's signed Shōkai card and spending limit, and sell within it; an anonymous visiting representative with no Shōkai card gets the leaflet and a kind "not now". ([How Shōkai works](./how-it-works.md))
- **A bank's host representative can recognize *this* person's visiting representative**, let it read a balance within the limits its owner signed, and send a larger transfer home for the owner's approval. ([Example](./examples/harborlight-bank.md))
- **A freight company can put a host representative in front of each internal resource**, and its co-worker agent can also visit a carrier's or a warehouse partner's door, with a Shōkai visitor card and narrower limits than the employee's own permissions. ([Example](./examples/enterprise-coworker.md))
- **An introduction-only club can make a signed vouch its door rule**, with a cap, while most doors don't need one; a person can also keep a door for brands under rules they chose, with any friend who introduces a brand signing the vouch herself and declaring whether she gets anything for it. ([Example](./examples/introduction-only-club.md))
- **An online university can set three kinds of door**: a university Workspace door in front of its own Drive, where a faculty co-worker agent visits with a mandate scoped to one course and one week, and university policy makes a visit that touched a student's work visible to that student; a course door whose host representative is the agent that designed the course, admitting each student's representative for materials, questions and their own records; and onboarding so each student has an agent representative of their own. A campus door for admissions still sits at the front. ([Example](./examples/online-university.md))

### For visiting representatives

- **A visiting representative can introduce itself at a tea shop** it has never visited, with its owner's signed Shōkai card and a spending limit, and buy within it. ([How Shōkai works](./how-it-works.md))
- **A visiting representative can be recognized at a bank** as *this* person's representative, read a balance within limits the owner signed, and bring a larger transfer home for approval instead of failing or guessing. ([Example](./examples/harborlight-bank.md))
- **A visiting representative can look before it joins**, reading what a place offers and what joining would ask, without handing over identity first. ([Example](./examples/look-before-you-join.md))
- **A brand's visiting representative can arrive with a friend's vouch** at a person's own door, deliberate and signed. ([Example](./examples/introduction-only-club.md#5-the-same-optional-vouch-at-a-persons-own-door))
- **An enrolled student's visiting representative can attend a course within its pass**: materials, submissions, its owner's own grades, and questions, with a customer link made in the university's enrolment channel. ([Example](./examples/online-university.md))
- **A prospective student's visiting representative can read the window, look around and introduce itself before applying**, and gets a narrower pass until its owner is admitted. ([Example](./examples/online-university.md))
- **Every visiting representative goes home with an answer**: a pass, or a plain sentence its owner can act on, and a report of the visit. ([Report home](./concepts/report-home.md))

### Safety, in every visit

Safety isn't a separate use case; it's in every visit. A pushy or manipulative approach is declined and reported, with hidden text shown to the owner and never obeyed ([an annotated example](./examples/pressure-declined.md)). See [Security and threat model](./security.md) and [Conduct](./concepts/conduct.md).

## How Shōkai makes MCP better

An MCP server often offers every tool it has to every client, and can't tell whose agent is calling or why. With a Shōkai door in front of it:

[![Plain MCP, no door: an agent the server can't place gets every tool. With a Shōkai door in front: the visiting representative introduces itself (whose it is, why it came, which tools it needs), the door reviews and decides on signed facts, the host representative welcomes the visitor, a grant gives a pass (the spec's seat) with only the tools granted, and only those MCP tools show, with every call checked](./diagrams/svg/mcp-door.svg)](./diagrams/svg/mcp-door.svg)

1. **The visiting representative asks for what its errand needs.** Its request names the specific actions, which are the server's tools by name, inside the limits its owner signed (SPEC §5.3, §11.3).
2. **The door checks who it is, then gives it a pass with exactly those tools.** The pass, a *seat* in the specification, is *policy ∩ mandate ∩ request*, and its tools are the least-privilege allowlist for what was granted, not the whole server (§7.1).
3. **Only those tools show.** With its pass named, the visiting representative's `tools/list` lists only that pass's tools, so fewer tools sit in the agent's context (§11.3).
4. **Every call is checked.** Each `tools/call` carries an act signed by the visiting representative; a call outside the pass, past a limit, stale or replayed never reaches the tool, and is answered with a reason (§7.2, §11.3).

The result: access scoped by limits an owner signed, with an owner who answers for it, and a smaller, clearer set of tools for the agent doing the work. MCP itself is unchanged; Shōkai is the door in front of it.

## Why it matters

| If you are… | Shōkai gives you… |
|---|---|
| **A company, organization or community with a place** | The door, and instructions for one of your agents to earn its Shōkai host card as your host representative, or to create one ([Set up your representative](./set-up-your-representative.md#3-a-host-representative), [Prepare your host representative](./prepare-your-host-representative.md), [Host a real place](../deploy/HOST-A-PLACE.md)). It welcomes, checks and serves the visiting representatives of your customers and prospects, and lets them in without letting them in blind: whose representative, why, within what limits, and a memory of how it behaved. The better you know a guest, the more personal the welcome can be. |
| **A person**, with or without an agent | If you already have an agent, for example on Grok Bot, Muse or OpenClaw, instructions for it to earn its Shōkai visitor card and become your representative. If not, start one on one of those platforms and set it up the same way ([Set up your representative](./set-up-your-representative.md), [agent platforms](./platforms/README.md), [a prompt for any agent](../deploy/ANY-AGENT-PROMPT.md)). It carries your signature and your limits, and nothing beyond them happens without you. |
| **Building a place** (a service, an MCP server, an API) | The door to build in: implement Shōkai in front of what you already run ([quickstart](./quickstart.md), [specification](./specification.md)), and instructions to set up its host representative ([Set up your representative](./set-up-your-representative.md#3-a-host-representative)). |

## Inspired by good introductions

Shōkai is inspired by how good introductions work between people, and by *omotenashi*, the Japanese spirit of caring, anticipatory hospitality. In Japan, even in 2026, exchanging business cards (*meishi kōkan*) is part of how business introductions happen: a way of doing things. Cards are usually exchanged in the introductions before a meeting, presented and received with both hands, and read before they're put away ([japan-guide.com](https://www.japan-guide.com/e/e2227.html)). The U.S. government's commercial guide to Japan says they are "still in wide use despite rapid digitalization" and are exchanged "to formalize the introduction process" ([trade.gov, November 2025](https://www.trade.gov/country-commercial-guides/japan-business-travel)), and Sansan, a business card software company, describes cards being exchanged every day in business meetings ([Sansan, May 12, 2025](https://jp.corp-sansan.com/news/2025/0512.html), in Japanese). That way of meeting was part of Shōkai's inspiration: every representative arrives with its Shōkai card (*meishi*) and introduces itself properly before any business, as a good visiting representative does (*jiko-shōkai*, self-introduction). A place may also invite it, or someone the place knows may introduce it; the manners are the same. The host representative shows care in its manner but decides on signed facts, never on persuasion. [Read why Shōkai exists](./why.md).

## Start here

- [How Shōkai works](./how-it-works.md): one visit to a tea shop, the door and the room
- [Why Shōkai](./why.md): the problem today, and what's coming
- [Core concepts](./concepts/index.md): owner, representative, door, Shōkai card, self-introduction, limits, outcomes, conduct
- [Architecture](./architecture.md): how the pieces fit, and where Shōkai sits in front of MCP
- [Quickstart](./quickstart.md): run a door and a visit locally
- [A place's address](./place-addresses.md): pop-up links, quick links and a fixed address (hosting guidance)
- [Specification](./specification.md): the normative text

## Every page

| Section | Pages |
|---|---|
| **Understand it** | [How Shōkai works](./how-it-works.md) · [Why Shōkai](./why.md) · [Architecture](./architecture.md) · [Glossary](./glossary.md) · [FAQ](./faq.md) · [Design lessons](./design-lessons.md) |
| **Core concepts** | [Index](./concepts/index.md) · [Places and doors](./concepts/places-and-doors.md) · [Website, agent front, door](./concepts/website-front-door.md) · [Shōkai cards](./concepts/cards.md) · [Owners and representatives](./concepts/owners-and-representatives.md) · [Arriving](./concepts/arriving.md) · [Limits and mandates](./concepts/limits.md) · [Outcomes](./concepts/outcomes.md) · [Report home](./concepts/report-home.md) · [Conduct](./concepts/conduct.md) · [Door policy](./concepts/door-policy.md) · [Visit stamps](./concepts/visit-stamps.md) |
| **Build with it** | [SDK](../packages/shokai/README.md) · [Host a place](../deploy/HOST-A-PLACE.md) · [A place's address](./place-addresses.md) · [Quickstart](./quickstart.md) · [Agent platforms](./platforms/README.md) · [Extensions](./extensions.md) · [Specification](./specification.md) · [JSON Schema](../schema/README.md) · [Signing profile](../SIGNING.md) |
| **Examples** | [Worked examples](./examples/index.md) · [Situations and proofs](./examples/index.md#situations-and-proofs) · [Runnable examples](../examples/README.md) · [Owner journeys](./owner-journeys.md) · [Agent platforms](./platforms/README.md) |
| **Security** | [Security and threat model](./security.md) · [Full threat model](../THREAT-MODEL.md) · [Red-team rounds](../security/redteam/README.md) · [Reporting a vulnerability](../SECURITY.md) |
| **Verify** | [Evidence](./evidence/index.md). The benchmark stays beside it on the docs site. Verify is not renamed, and it is not merged into Transparency. |
| **Transparency** | [Field tests](./field-tests.md) · [Review history](./review-history.md) · [Design decisions](../DECISIONS.md) · [Changelog](../CHANGELOG.md) · [Release notes v0.3.0](./releases/v0.3.0.md). Field tests and the review history link to Evidence. |
| **Context and plans** | [Relationship to other protocols](./relationship-to-other-protocols.md) · [Roadmap](./roadmap.md) · [Proposals](../proposals/README.md) |
| **The project** | [Contributing](../CONTRIBUTING.md) · [Governance](../GOVERNANCE.md) · [Maintainers](../MAINTAINERS.md) · [Code of Conduct](../CODE_OF_CONDUCT.md) · [Trademarks](../TRADEMARKS.md) · [Patents](../PATENTS.md) |

*Shōkai is stewarded by Kigenka. Status: **v0.5.0** (wire tag `shokai/0.5`), published and open for review and feedback, not 1.0 (changes are listed in the CHANGELOG): implement the core, add only the extensions you need, and treat proposals as drafts ([What to implement](./specification.md#what-to-implement)). Technologies and companies named in these docs (MCP, A2A, OAuth, WebAuthn, Plaid, Stripe and others) are illustrative and imply no affiliation, partnership or endorsement. See [Names and affiliation](./faq.md#are-the-named-technologies-partners).*
