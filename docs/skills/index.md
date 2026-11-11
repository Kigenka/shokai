# Skills (drafts)

These are **unpublished drafts** of conversations an existing agent can have about Shōkai. They are not installed anywhere from this package, they are not a protocol role, and a lasting unattended host is not proven.

There are three *kinds* of conversation. Only two of them are protocol actors:

| Conversation | Protocol role? | What it does |
|---|---|---|
| **Installer / guide** | No. A product conversation. | Helps a person set up a door: gather the house facts, prepare what the owner will sign with a passkey, and refuse invented shortcuts (no deploy launcher, no Shopify or WooCommerce connector, no hosted home for the owner key). |
| **Host representative** | Yes (SPEC §3) | Keeps the shop once the owner has appointed it. Declines by default where a lasting host is not proven. |
| **Visiting representative** | Yes (SPEC §2, §3) | Goes out with a card the owner signed and reports home. |

The owner key always stays with the person as a passkey. The guide who helps set up a place is not automatically its host representative; the owner appoints.

## The usual flow

1. **Owner and installer.** You talk with your agent. It follows an installer skill (a draft) to set up and customize the door.
2. **You sign.** You approve the Shōkai host card with your passkey on your own device. The owner key never sits on an agent server. What you must see first is in the signing profile (`SIGNING.md`); the package includes a reference signing page you can run yourself. This preview does not ship an always-on hosted signing page.
3. **Handoff to the host.** The installer hands off to the appointed host representative, which follows a host skill (a draft). Briefing continues as conversation.
4. **Going out.** A visitor skill (a draft) leads the onboarding conversation and the signing of a Shōkai visitor card and its limits.

What has been tried: [Grok Bot and Muse rehearsals](../evidence/plain-language-rehearsal-2026-11-10.md). Other platforms are simulated or drafts only. ChatGPT, Gemini, Sidekick and WordPress Agent have installer drafts only — no host or visitor skill.


## Per agent

Not every agent has every kind of draft. ChatGPT and Gemini have installer drafts only (they are not written as lasting hosts). There is no ChatGPT or Gemini visitor or host skill. Sidekick and WordPress Agent have installer drafts only. Duet is an annotation, not a full skill, in each set.

### Visitor drafts

[Visitor skill design](./visitor-skill-spec.md) · [Visitor index](./visitor/index.md)

[Grok Bot](./visitor/grok-bot.md) · [Muse](./visitor/muse.md) · [Hermes](./visitor/hermes.md) · [OpenClaw](./visitor/openclaw.md) · [Dot](./visitor/dot.md)

### Installer drafts

[Installer design](./installer-spec.md) · [Installer index](./installer/index.md)

[ChatGPT](./installer/chatgpt.md) · [Gemini](./installer/gemini.md) · [Grok Bot](./installer/grok-bot.md) · [Muse](./installer/muse.md) · [Hermes](./installer/hermes.md) · [OpenClaw](./installer/openclaw.md) · [Dot](./installer/dot.md) · [Sidekick](./installer/sidekick.md) · [WordPress Agent](./installer/wordpress-agent.md)

### Host drafts

[Host index](./host/index.md)

[Grok Bot](./host/grok-bot.md) · [Muse](./host/muse.md) · [Hermes](./host/hermes.md) · [OpenClaw](./host/openclaw.md) · [Dot](./host/dot.md)

ChatGPT, Gemini, Sidekick, WordPress Agent and Duet decline the lasting-host job in these drafts; there is no host skill for them.

## Older portable skeleton

The generic skill file previously published as a portable skeleton is older than the per-agent 0.5 drafts above. Prefer the drafts listed here.

## Setting up a place

The owner-facing story of standing up fictional Kettle & Leaf — what the server guide does not say — is [Setting up a place](../setting-up-a-place.md). The step-by-step server guide remains [Host a place](../../deploy/HOST-A-PLACE.md).
