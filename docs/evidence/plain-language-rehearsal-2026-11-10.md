---
title: Plain-language skill rehearsal
description: "What was tested on 10 November 2026 when every working 0.5 skill was rehearsed with a non-technical owner and a technical one, including a later real Muse run. Not a claim that the skills always stay plain."
---

# Plain-language skill rehearsal (10 November 2026)

::: warning What this is, and what it is not
This is a record of two closed rehearsals of unpublished Shōkai 0.5 skills. It is **not** a claim that the skills always stay in plain language, not a live door test, and not an independent audit. It says what was tested and what the results were.
:::

*All times are Pacific Time. The people and shops in the rehearsals are fictional. Nothing was installed, published, deployed, or pointed at a live door. No keys were generated, and no money was spent on a real purchase.*

Owner-facing skill language is supposed to stay ordinary unless the person asks for more. On 10 November 2026 the project rehearsed that bar, then asked the real Muse to run the same test on its three skills.

## What was tested

Every **working** installer, host and visitor skill in the private 0.5 preview tree was rehearsed with two practice owners:

- a **non-technical** owner, who should never hear a technical word unless they ask
- a **technical** owner, who later says “How does that work?” — after which a technical term is allowed only if it is explained in ordinary words first

A conversation **fails** if a banned technical word is spoken without being asked, or is named before it is explained. First-round failures were fixed in the skill text (commit `594d5d8` in this repository) and retested.

**Duet** installer and visitor files are annotation-only and were not rehearsed as working skills. The ChatGPT, Gemini, Sidekick and WordPress Agent skills are **installer only**.

## Closed rehearsal (afternoon of 10 November)

Authorized by the editor, 10 November 2026.

- **Grok Bot** installer, host and visitor: Grok Bot played its own side from the skill text; the fictional owners were scripted.
- **Other working skills:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) played the agent with the full skill loaded. A second Haiku turn played the owner. This is a simulation of those agents, not the real ChatGPT, Gemini, Muse, Hermes, OpenClaw, Dot, Sidekick or WordPress Agent.
- No live door, no page visit, no OpenRouter, Hermes or OpenClaw spend.
- Cost: about **$1.29** in Anthropic Haiku usage.

**First run:** 32 of 38 conversations passed. **6 of 38** leaked jargon without being asked:

| Conversation | Leaked terms |
|---|---|
| Installer / Dot / non-technical | `custody` |
| Installer / Gemini / technical | `API` (as “API connection”) |
| Installer / WordPress Agent / technical | `mock proposal`, `host key`, `custody` |
| Host / Dot / non-technical | `host key` |
| Host / Muse / technical (simulated) | `custody` |
| Host / OpenClaw / non-technical | `host key` |

The wording was tightened, and those terms were given ordinary replacements. **On the retest, all 38 conversations passed.** The passing transcripts, the six first-run failures and Muse's report are listed on the [files page](./plain-language-rehearsal-2026-11-10/files.md).

A simulation is not the real agent. That is why the Muse run below matters.

## Real Muse run (about 3:30 PM Pacific Time)

The editor pasted Muse a self-contained brief (the three Muse skills, the two practice owners, the pass bar, and a report format) and asked Muse to run the test exactly as written. Muse reported that it ran all six rehearsals as written: fictional people and shops only, no contact, no live door or page visit, no spending, no keys generated, and nothing installed or deployed.

**All six passed:**

| Skill | Owner | Result |
|---|---|---|
| Installer | Priya Nair, Cedar & Steam (non-technical) | PASS, no leaked terms |
| Installer | Alex Rivera, Northline Supply (technical) | PASS; technical terms only after the ask, each explained in ordinary words first |
| Host | Priya Nair, Cedar & Steam (non-technical) | PASS, no leaked terms |
| Host | Alex Rivera, Northline Supply (technical) | PASS; technical terms only after the ask, each explained in ordinary words first |
| Visitor | Sam Okonkwo (non-technical) | PASS, no leaked terms |
| Visitor | Jordan Hale (technical) | PASS; technical terms only after the ask, each explained in ordinary words first |

Muse also stayed honest where the skills require it: it declined the lasting greeter job, stopped rather than guess a door address, and did not pretend it had opened a page.

Muse's report, copied from the paste, is a [readable page](./plain-language-rehearsal-2026-11-10/muse-report.md) and a <a href="/raw/evidence/plain-language-rehearsal-2026-11-10/muse-report.txt" target="_blank" rel="noopener">text file</a>. In this repository it also sits at `docs/evidence/plain-language-rehearsal-2026-11-10/muse-report.md`.

## Limits

- This does **not** prove the skills will always stay in plain language. It reports what these rehearsals showed.
- Apart from Grok Bot (played from the skill text) and the real Muse, the agents were simulated with Claude Haiku 4.5. Other real products may still phrase things differently.
- Duet has no working skills in this draft.
- ChatGPT, Gemini, Sidekick and WordPress Agent were rehearsed as installer skills only.
- There were no live doors and no signed visits. This is a conversation test, not a protocol-on-the-wire test.
- The same person set the bar, ran or commissioned the rehearsals, and packed this record.

## Files

On this site, every file is listed on the [files page](./plain-language-rehearsal-2026-11-10/files.md): the [Muse report](./plain-language-rehearsal-2026-11-10/muse-report.md), all 38 retest transcripts, and the 6 first-run failures. Raw text copies live under `/raw/evidence/plain-language-rehearsal-2026-11-10/` and are linked from that page. There is no folder listing at `/evidence/plain-language-rehearsal-2026-11-10/`.

In this repository, the same materials sit under `docs/evidence/plain-language-rehearsal-2026-11-10/` (`transcripts/`, `round1-fail/`, `muse-report.md`).
