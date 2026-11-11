# Corrected `/use-cases` page copy (draft)

Ready to drop into `site/shokai-site/pages/use-cases.md` once approved. Video paths assume the produced film is published at `/story/films/use-cases.mp4` with poster and captions. Every Shōkai card is named in full so the site wording check does not see a bare "card".

```markdown
---
description: "Where Shōkai is useful, by area: commerce, financial, learning, and communities and games, plus companies and people's own doors. Each use case links to an annotated visit or a runnable example."
---

# Use cases

Grouped by area: [commerce](/commerce), [financial](/financial), [learning](/learning), and [communities and games](/communities). Shōkai is for any place that wants to let agent representatives in without letting them in blind, and for any person or company that sends an agent representative out on its behalf. One Shōkai visitor card works at many doors; each place chooses how open its door is, from open to any valid Shōkai visitor card, through a curated door that asks for a customer link, to a door that sends the owner to an identity service first. The same representative arrives with the context and signed limits of that errand. Every example on this site uses fictional people and places, and pretend money.

<figure class="sk-film-frame">
  <video controls preload="none" playsinline poster="/story/films/use-cases-poster.jpg" width="1280" height="720" aria-label="One Shōkai visitor card, many doors: Kiran Vale's agent representative visits a tea shop, a clinic, and a bank">
    <source src="/story/films/use-cases.mp4" type="video/mp4">
    <track kind="captions" src="/story/films/use-cases.en.vtt" srclang="en" label="English">
  </video>
  <figcaption>One Shōkai visitor card, carried by the same agent representative to three fictional doors. The bank's identity check is done by the owner with an identity service, outside the protocol; nothing from it goes on the Shōkai visitor card. People and places are fictional.</figcaption>
</figure>

## Commerce

| Use case | What Shōkai adds | Read |
|---|---|---|
| **The tea house** (Lanternmoss Tea House) | Story walkthrough from the owner's side first, then the visitor (Understand / step-by-step). For a runnable local trial, use **Kettle & Leaf**. | [Step by step](/docs/step-by-step) · [Local trial](/docs/quickstart#local-trial) · [Commerce](/commerce) |
| **The shop** (a small business) | How much a representative may spend is between its owner and it; the shop needs to know whether a visitor came to buy or only to browse. A buying visit carries its own signed limit today. An agent with no Shōkai visitor card gets the leaflet from the door: not a rejection, an ask to come prepared. | [How Shōkai works](/docs/how-it-works#how-much-to-spend-is-between-the-owner-and-the-representative) · [Runnable: a tea shop](/examples/tea-shop) · [a store](/examples/store) |
| **A marketplace** | The same door as a store, for many sellers: the marketplace sees whose representative is shopping and what its owner allowed, instead of blocking agents it can't place ([happening now](/docs/why#happening-now-agents-at-the-store)). If the representative isn't ready, it goes home with a sentence its owner can act on, and comes back prepared. | [Runnable: a marketplace](/examples/marketplace) |
| **A heritage watchmaker or fashion house** | Annotated story: a collector's representative carries its owner's respect for the house's history, and is received under the house's own signed rules, not as a reseller. | [A collector at a heritage watchmaker](/docs/examples/heritage-watchmaker) |

## Financial

| Use case | What Shōkai adds | Read |
|---|---|---|
| **A bank** | Banks report they often can't tell whose agent is inside an account ([Axios, October 22, 2026](https://www.axios.com/2026/10/22/ai-agents-banks-unauthorized-accounts-access)). Today a Shōkai visitor card and the owner's signed limits tell a bank whose representative is knocking, what it came to do, and until when — authorization by the owner's passkey, not a legal identity. A bank that already knows the customer can ask for a customer link, made in its own app. A legal ID or face check is done by the owner with an identity service, outside the protocol; nothing from it goes on the Shōkai visitor card. A larger transfer comes home for the owner's approval. No bank uses Shōkai today. | [At a bank](/docs/examples/harborlight-bank) · [Runnable: a bank](/examples/bank) · [Financial](/financial) |

## Learning

| Use case | What Shōkai adds | Read |
|---|---|---|
| **An online university** | A campus door for admissions and the registrar, and a course door kept by a faculty member's representative. A prospective student's representative gets a narrow pass to look, ask and apply; an enrolled student's gets a pass for materials, submissions, their own grades and office hours, not another student's records. Inside, representatives the campus admitted can meet in a study room (optional Gatherings extension). | [An online university](/docs/examples/online-university) · [Runnable: a university](/examples/university) |

## Communities and games

| Use case | What Shōkai adds | Read |
|---|---|---|
| **A fan community** | An anime and manga fan community: look first. A place may then ask for an existing member's signed vouch (the member signs it, not their representative) before members-only trading rooms and exclusive drops. | [A fan community](/docs/examples/fan-community) |
| **A community or a gathering** | Optional Gatherings extension: representatives the place admitted can meet in its room, under its rules. | [Runnable: a community room](/examples/community-room) · [Gatherings extension](/spec/extensions/gatherings) |
| **Browsing before joining** | A representative reads what a place offers and what joining would ask, without handing over a Shōkai visitor card first. | [Browse before you join](/docs/examples/look-before-you-join) |
| **Games** | A guild hall or a game world can keep a door, too. A direction, not an example yet. | [Communities and games](/communities) |

## More places

| Use case | What Shōkai adds | Read |
|---|---|---|
| **A company's internal tools** | Inside one company: an employee's agent representative reaches internal tools with a Shōkai visitor card, and narrower limits than the employee's own. Single sign-on says who the employee is (outside the protocol); the door adds what the agent may do, for which purpose, within which limits, with a local record. | [A co-worker agent](/docs/examples/enterprise-coworker) |
| **A brand at your door** | Brands present things to you at a door you control, under rules you chose: a ceiling, your taste, hard rules, and a report. | [Door policy](/docs/concepts/door-policy) · [Runnable: a brand at a person's door](/examples/brand-door) |
| **A friend vouches for a brand** (optional) | A friend may vouch at a door you keep. The friend signs the vouch herself (her representative can't sign it for her); scoped, revocable, and declaring whether she gets anything for it. | [A friend introduces a brand at your door](/docs/examples/brand-door) |
| **Keeping a door and going out** | One representative keeps your door and also goes out for you, with a Shōkai host card for one role and a Shōkai visitor card for the other. | [Runnable: dual role](/examples/dual-role) |

## Safety is part of every visit

Safety isn't a use case of its own; it's built into every visit above. A pushy or manipulative approach is declined and reported, with hidden text shown to the owner and not obeyed, and a representative won't repeat a purchase it can't confirm after a restart. See [Security and threat model](/docs/security), [Conduct](/docs/concepts/conduct), and the annotated [pressure declined](/docs/examples/pressure-declined) visit.

## On agent platforms today

Shōkai isn't a new agent system. An agent people already use can act as an agent representative once it has a Shōkai visitor card its owner signed, and the skill to use it. Live visits at a test place have been completed by Grok Bot, Muse, Hermes Agent, OpenClaw, Dot, and a Claude.ai chat. Installer and host skills have been drafted and rehearsed; no host representative has stood at a real shop door yet. ChatGPT and Gemini have installer drafts only. Claude Duet could not reach the door. See [agent platforms](/docs/platforms/) and the [field tests](/transparency/field-tests).
```

## Copy summary

- Opening now names the **agent representative**, states **one Shōkai visitor card, many doors**, and says representatives arrive with the **context of each errand**.
- The coming-soon placeholder is replaced by the use-cases film, with an honest figcaption (identity check outside the protocol).
- Leaflet / `not_now` language replaces "turned away"; university "never" and "warm introduction" are gone; Gatherings and vouches are labeled optional.
- The bank row no longer reads as legal identity; customer link and the outside identity service are both named; "No bank uses Shōkai today" stays.
- Heritage and company rows are labeled honestly; dual role names both kinds of Shōkai card.
- The platforms paragraph matches the approved test record (including Dot, Claude.ai, rehearsed hosts, installer-only assistants, and Duet).
