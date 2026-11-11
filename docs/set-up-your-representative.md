# Set up your representative

*Guidance, not specification, for Shōkai v0.5.0. The installer, host and visitor skills named here are skill drafts ([Skills](./skills/index.md)). They have been rehearsed with Grok Bot and Muse ([plain-language rehearsal](./evidence/plain-language-rehearsal-2026-11-10.md)); other platforms are simulated or drafts only. ChatGPT, Gemini, Sidekick and WordPress Agent have installer drafts only — no host or visitor skill. Your owner key is a passkey on your own device; it never sits on an agent server.*

A representative is one of your agents that carries a Shōkai card you signed. It can receive visiting representatives at your place (a **host representative**), visit other places for you (a **visiting representative**), or both.

## How this works now

You talk with your agent. It does not send you a paper checklist to fill in alone.

- **To open a place:** an [installer skill](./skills/index.md) (a draft) leads a conversation that helps you set up and customize the door. You sign the Shōkai host card with your passkey. The installer then hands off to the appointed **host representative**, which follows a [host skill](./skills/index.md) (also a draft). Briefing continues as that conversation — what the place believes, how it welcomes people, where its job stops. What that conversation covers: [Prepare your host representative](./prepare-your-host-representative.md).
- **To go out:** a [visitor skill](./skills/index.md) (a draft) leads the onboarding conversation and the signing of your Shōkai visitor card and its limits.

What you must see before you sign is in the [signing profile](../SIGNING.md). The 0.5 package includes a reference signing page you can run yourself (`reference/signing-page/`). This preview does not ship an always-on hosted signing page. Your passkey stays on your phone; the agent never sees it, and your owner key never sits on an agent server.

## 1. Choose: one agent, or separate agents

- **One agent, both ways.** One representative agent holds two Shōkai cards you sign together: one for your door, one for going out. Each Shōkai card is withdrawn on its own.
- **Separate agents.** A host representative for your place, and one or more visiting representatives, each with its own key and a Shōkai card you signed.

The protocol allows either. Whichever you choose, every Shōkai card is signed by you, and places keep decisions, records and conduct per owner, never per Shōkai card ([SPEC §2.3](SPEC-DETAIL.md#23-the-shōkai-card-meishi)). See the diagram [One owner, one agent or several](../README.md#4-one-owner-one-agent-or-several).

## 2. A visiting representative {#2-a-visiting-representative}

A visiting representative carries your **Shōkai card**: it works like a meishi, a business card, not a payment card ([SPEC §2.3](../SPEC.md)). The owner also signs the limits it may use: purposes, actions, and any spending limit and expiry. It should also know you, not only your signature: your name, what you do, and how you like to be presented, so it can introduce you well, whether you're a person or a company. Craft a representative you're proud to be represented by.

**Depth, not only a signature.** The [visitor-skill conversation](./skills/index.md#visitor-drafts) is where your representative comes to know you, and that depth is what makes it more than a messenger: your name and your work, your tastes and passions, the cultural world you love, the languages you speak, and how you want to be perceived and to conduct yourself. The conversation asks that last one directly, and the answer is yours to choose: you can be represented as the person you're becoming, not only the one you've been. You also decide what it may share, and with whom. What it shares shapes the welcome it gets; it never decides whether it's let in ([SPEC §6.4](../SPEC.md)).

*An example (fictional).* Dara Quill sends her representative to buy a birthday gift for her nephew Kai at a small anime and manga goods shop. It knows that Dara and Kai both love the same long-running ninja manga, and that Kai already has the early volumes. Because Dara allowed it, it says so when it introduces itself. The shop's host representative, briefed by an owner who loves the series too, recognizes a fellow fan, not just any customer, and suggests the art book Kai doesn't have yet.

*Another (fictional).* Elias Moreau collects watches and loves their history: he knows how the old houses began and keeps what he buys. His representative carries that. At a heritage watchmaker it is received as a collector who respects the house, which is a different conversation from a buyer looking for something to resell. See [A collector at a heritage watchmaker](./examples/heritage-watchmaker.md).

**One card, many doors.** Kiran Vale signs one Shōkai visitor card for her agent representative, and that same card can visit many places. Each place chooses how open its door is. A bookshop may let in anyone with a valid visitor card. A small jewellery studio may welcome only visitors who fit its clients. If the door turns the agent away, it comes back to Kiran with care: what happened, what's needed, and whether to try again together.

**Representatives grow.** Kiran's agent representative isn't set up once and left alone. Every visit has a purpose: to buy something, to browse, or to look into a gift or a trip. Each errand adds context, and over many visits and conversations the representative comes to know Kiran better. It keeps that for her and shares it with a place only when she agrees. A host representative grows the same way as the business changes and its owner briefs it again. Authority never grows on its own: only the owner, signing with a passkey, can widen what the agent may do.

The technical version of how open a door is, and how representatives grow, is on [Cards as a blueprint](./concepts/card-classes.md#how-open-a-door-is-and-how-representatives-grow). How a host representative grows: [Learning over time](./prepare-your-host-representative.md#learning-over-time).

What the [visitor-skill conversation](./skills/index.md#visitor-drafts) covers:

1. **Pick the agent**, or create one for this.
2. **Who you are** (as above), how you want to be represented, what kinds of places it may visit, what it may do alone, what it must bring home, what it may share, whether it may spend. No spending by default. About five to ten minutes to begin, and it grows over time.
3. **Sign** the Shōkai visitor card and its limits with your passkey, on your own device. What you must see first is in the [signing profile](../SIGNING.md). The package includes a reference signing page you can run yourself; there is no always-on hosted signing page in this draft. Your passkey stays on your phone; the agent never sees it.
4. **A first visit**, to a place that runs a Shōkai door. Anywhere else it's treated like any other agent.

Outline: [Owner journeys, the guest](./owner-journeys.md#journey-2-the-guest).

## 3. A host representative

The installer skill leads this conversation first, then hands off to the host skill:

1. **Pick the agent** that will keep the door — or let the installer ask who should get the job.
2. **Set up and customize the door:** what kind of place, its name, who is welcome, house rules, and what each action asks of a visiting representative.
3. **A preview** of the place's front, as a visiting representative would read it.
4. **An address.** A place needs a public address while it's open: a temporary tunnel works today; a stable address needs a relay or a small hosted front door. Nothing is opened, deployed or published without your yes, each time.
5. **Sign** the host representative's Shōkai host card with your passkey, then the installer hands off to the appointed host representative. Briefing continues as conversation: how the place runs, what it believes, where its job stops.

How that conversation covers how your place runs, and what to offer at the window: [Prepare your host representative](./prepare-your-host-representative.md).

Outline: [Owner journeys, the host](./owner-journeys.md#journey-1-the-host). For developers running the door process: [Host a place](../deploy/HOST-A-PLACE.md).

## 4. Both at once

If you want both on day one, you sign both Shōkai cards in one sitting, with one passkey ([Both roles at once](../experiences/grokbot-representative-and-place.md#both-roles-at-once-the-usual-case-for-a-place-owner)). The installer and visitor conversations can run on the same agent or on separate ones.

## 5. On your platform

These skills are drafts. They are not installed natively from this package.

- **Grok Bot and Muse.** The 0.5 installer, host and visitor drafts have been rehearsed in conversation ([plain-language rehearsal](./evidence/plain-language-rehearsal-2026-11-10.md)). Grok Bot can follow a skill file; Muse does not take user-installed skills, so the rehearsal pasted the draft and asked Muse to follow it. A lasting unattended host is not proven. An older Grok Bot recipe remains at [grok-bot.md](./platforms/grok-bot.md).
- **ChatGPT, Gemini, Sidekick and WordPress Agent.** [Installer drafts](./skills/index.md) only — there is no host or visitor skill for them.
- **Hermes Agent, OpenClaw, Dot and others.** Drafts or simulations, not a recorded owner setup on that platform. The older [platform recipes](./platforms/recipes.md) describe where a portable skill file would go; prefer the per-agent drafts on [Skills (drafts)](./skills/index.md).
