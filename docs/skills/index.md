# Skills (drafts)

These are **drafts** of conversations an existing agent can have about Shōkai. They are not installed anywhere from this package, they are not a protocol role, and a lasting unattended host is not proven. The 0.6 drafts follow the live Shōkai Lounge door.

There are three *kinds* of conversation, plus invitation setup. Only two of them are protocol actors:

| Conversation | Protocol role? | What it does |
|---|---|---|
| **Installer / guide** | No. A product conversation. | Helps a person set up a door: gather the house facts, prepare what the owner will sign with a passkey, and refuse invented shortcuts (no deploy launcher, no Shopify or WooCommerce connector, no hosted home for the owner key). The installer must ask the owner to name the host. |
| **Host representative** | Yes (SPEC §3) | Keeps the shop once the owner has appointed it. Declines by default where a lasting host is not proven. |
| **Visiting representative** | Yes (SPEC §2, §3) | Goes out with a card the owner signed and reports home. |
| **Invitation setup** | No. A product conversation. | After the door and the host are in place, designs the invitation and sets how long a hold and the owner's approval stay open (24 hours by default). |

The owner key always stays with the person as a passkey. The guide who helps set up a place is not automatically its host representative; the owner appoints.

## The usual flow

1. **Owner and installer.** You talk with your agent. It follows an installer skill (a draft) to set up and customize the door, and it asks you to name the host.
2. **You sign.** You approve the Shōkai host card with your passkey on your own device. The owner key never sits on an agent server. What you must see first is in the signing profile (`SIGNING.md`); the package includes a reference signing page you can run yourself.
3. **Handoff to the host.** The installer hands off to the appointed host representative, which follows a host skill (a draft). Briefing continues as conversation.
4. **Going out.** A visitor skill (a draft) leads the onboarding conversation and the signing of a Shōkai visitor card and its limits.
5. **Invitation setup.** When you want to send invitations, or hold an event, the host walks you through invitation setup (a draft).

What has been tried: [Grok Bot and Muse rehearsals](../evidence/plain-language-rehearsal-2026-11-10.md). Other platforms are simulated or drafts only. ChatGPT, Gemini, Sidekick and WordPress Agent have installer drafts only — no host or visitor skill.

## Per agent

Not every agent has every kind of draft. ChatGPT and Gemini have installer drafts only (they are not written as lasting hosts). There is no ChatGPT or Gemini visitor or host skill. Sidekick and WordPress Agent have installer drafts only. Duet is an annotation, not a full skill, in each set.

The files live under [`drafts/package-0.6/`](../../drafts/package-0.6/).

### Visitor drafts

[Visitor skill design](../../drafts/package-0.6/visitor-skill-spec.md) · [Visitor index](../../drafts/package-0.6/visitor-skills/README.md)

[Grok Bot](../../drafts/package-0.6/visitor-skills/grok-bot.md) · [Muse](../../drafts/package-0.6/visitor-skills/muse.md) · [Hermes](../../drafts/package-0.6/visitor-skills/hermes.md) · [OpenClaw](../../drafts/package-0.6/visitor-skills/openclaw.md) · [Dot](../../drafts/package-0.6/visitor-skills/dot.md)

### Installer drafts

[Installer design](../../drafts/package-0.6/installer-spec.md) · [Installer index](../../drafts/package-0.6/installer-skills/README.md)

[ChatGPT](../../drafts/package-0.6/installer-skills/chatgpt.md) · [Gemini](../../drafts/package-0.6/installer-skills/gemini.md) · [Grok Bot](../../drafts/package-0.6/installer-skills/grok-bot.md) · [Muse](../../drafts/package-0.6/installer-skills/muse.md) · [Hermes](../../drafts/package-0.6/installer-skills/hermes.md) · [OpenClaw](../../drafts/package-0.6/installer-skills/openclaw.md) · [Dot](../../drafts/package-0.6/installer-skills/dot.md) · [Sidekick](../../drafts/package-0.6/installer-skills/sidekick.md) · [WordPress Agent](../../drafts/package-0.6/installer-skills/wordpress-agent.md)

Shared chapters: [Naming the host](../../drafts/package-0.6/installer-skills/NAMING-THE-HOST.md) · [Appointing the host](../../drafts/package-0.6/installer-skills/APPOINTING-THE-HOST.md) · [Visits at the door](../../drafts/package-0.6/installer-skills/VISITS-AT-THE-DOOR.md) · [Invitation setup](../../drafts/package-0.6/installer-skills/INVITATION-SETUP.md) · [Hosting with care](../../drafts/package-0.6/installer-skills/HOSTING-WITH-CARE.md)

### Host drafts

[Host index](../../drafts/package-0.6/host-skills/README.md)

[Grok Bot](../../drafts/package-0.6/host-skills/grok-bot.md) · [Muse](../../drafts/package-0.6/host-skills/muse.md) · [Hermes](../../drafts/package-0.6/host-skills/hermes.md) · [OpenClaw](../../drafts/package-0.6/host-skills/openclaw.md) · [Dot](../../drafts/package-0.6/host-skills/dot.md)

ChatGPT, Gemini, Sidekick, WordPress Agent and Duet decline the lasting-host job in these drafts; there is no host skill for them.

## Older portable skeleton

The generic skill file previously published as a portable skeleton is older than the per-agent 0.6 drafts above. Prefer the drafts listed here.

## Setting up a place

The owner-facing story of standing up fictional Kettle & Leaf — what the server guide does not say — is [Setting up a place](../setting-up-a-place.md). The step-by-step server guide remains [Host a place](../../deploy/HOST-A-PLACE.md).
