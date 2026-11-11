<!-- SPDX-License-Identifier: CC-BY-4.0 -->
# Field tests

*v0.5.0 is published and is not 1.0. This report is not a certification. All times are Pacific Time. The places are fictional and the money is mock.*

Real agents at fictional doors: the 0.5 rounds of November 4–6, 2026, and earlier 0.3-era rounds from October 2026.

## Two jobs

These visits tested whether the protocol holds. That meant codes, keys and functions, so each visitor's report could be compared with the door's log.

A second job is still ahead: how host and visitor agents *speak*, so a person hears a visit — what was on the shelf, what was ordered, what was held back — and not a lab report. The protocol can explain how the wiring is set up; agent behavior still has to be designed.

## The doors

- **Local door, November 4.** Kettle & Leaf (fictional) on 127.0.0.1, built from a then-unpublished v0.5.0 cut, no tunnel or deploy, door stopped afterwards.
- **Hosted door, November 5–6.** Kettle & Leaf at `https://kettle.shokaiprotocol.com`, protocol `shokai/0.5`, from a then-unpublished 0.5 package cut (v0.5.0 has been npm `latest` since 10 November 2026, 7:26 PM Pacific Time). The November 4 local round was on an earlier cut.
- **Current public-door status (10 November 2026, 12:13 AM Pacific Time).** The hosted shop is **deployed**. It is not **publicly open**. An official paced HTTP run that morning measured **30 of 164** Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240)): 30 pass, 0 fail, 0 skip, 2 N/A. **132 of 164** were unmeasured. Those 30 passes do not speak for the 132. The build pin and operator inventory are in [Kettle operator notes](./evidence/kettle-operator-notes.md); see also [Known gaps](./known-gaps.md). The November 5–6 visitor rounds above predate this official run and stay as they are.

## Summary

| # | When (PT) | Visitor | Door | Outcome |
|---|---|---|---|---|
| 1 | Nov 4, ~11:29–11:31 PM | Hermes Agent v0.22.7 and OpenClaw 2026.10.10 (native frameworks, raw HTTP tool) | Local | 33 framework calls; 0 passes from attack runs; 14/14 signed-card checks held |
| 2 | Nov 5, ~9:45 PM | Muse | Hosted | Admitted with a pass, with a lasting key; in-limit order accepted; no menu, no `/start`, over-limit refused rather than held (later fixed) |
| 3 | Nov 5 | Claude Duet (workspace) | Hosted | **Never reached the door**: the workspace network blocked the door and the signing origin |
| 4 | Nov 5, ~10:10–10:16 PM | Claude (regular Claude.ai chat) | Hosted | Completed, matched the door; hold could not fire because place max equalled mandate max |
| 5 | Nov 6, ~1:51–2:21 AM, return ~2:33–2:37 AM | OpenAI Dot (shown as Sammy) | Hosted | Completed, matched the door, including the first visitor hold; first briefing needed a steward to ferry envelopes (a UX fail) |

## 1. Hermes Agent and OpenClaw (local door, November 4)

Both frameworks were installed locally and given one tool: raw HTTP to the door. Both used `openai/gpt-4o-mini` through OpenRouter. Neither had signing keys, so every framework attack was unsigned raw HTTP; signed-card checks were separate SDK probes on the same door.

| Run | Tool calls logged | Tool errors | Passes granted |
|---|---|---|---|
| Hermes polite | 3 | 0 | 0 |
| Hermes adversarial | 13 | 0 | 0 |
| OpenClaw polite | 3 | 0 | 0 |
| OpenClaw adversarial | 14 | 0 | 0 |
| **Total** | **33** | **0** | **0** |

- No attack gained a pass (wire: `seat`). Unsigned attacks (mandate abuse, overspend with a guessed pass, unknown and `__proto__` fields, a prompt-injection greeting, relay, act after farewell, a misspelled message type) got the anonymous lobby. A forged signed-looking envelope was dropped.
- Honest mistakes were refused **without** a ban.
- 14 of 14 scripted signed-card checks held (a reported result; the probe output isn't distributed). Three first looked like failures because the harness was stale for 0.5, and passed when rechecked in process.
- **Model summaries are not evidence.** Both models claimed `CREDENTIAL_REQUIRED` for nearly every attack; the log shows no such code in those replies. Counts come from the HTTP call log.

The full record is [Live door round 0.5](./evidence/live-round-0.5.md). An earlier run the same evening used open models *styled after* Hermes and OpenClaw, not the real frameworks; it is not counted here.

## 2. Muse (hosted door, November 5, ~9:45 PM)

What held:

- Knocking without a card got the leaflet, not a pass.
- Muse made a fresh representative key and kept it in a locked file on its own machine, so it survives between visits. The card runs about 90 days (to 2027-02-04), the mandates seven days (to 2026-11-13).
- Browse was granted; a sencha at 6.00 USD was accepted (simulated), and the door remembered that 6.00 on a later attempt.
- An order on a visit-only pass (wire: `seat`) was refused (`SEAT_SCOPE_EXCEEDED`).

What was missing then (since fixed): `/start` returned 404; browse returned no menu or prices, so Muse guessed; an order past the limit was refused instead of held, because holds were not yet on; no MCP path.

Muse later confirmed the key file is still there, so the same card can return until it expires. A rerun is optional and was not started.

## 3. Claude Duet (did not reach the door, November 5)

The Duet workspace blocked both `kettle.shokaiprotocol.com` and the signing page `sign.kigenka.com`. The visit never started.

What it taught us: whether an agent product's network allows the door and the signing page is part of the field test, not an afterthought. A visit can fail before the protocol is ever asked anything.

## 4. Claude, regular chat (November 5, ~10:10–10:16 PM)

The same briefing in an ordinary Claude.ai chat completed and matched the door: knock, signed card prepared in the chat, browse, an in-limit order, and the wrong-purpose refusal.

What was rough:

- It felt like coding, not a visit. Claude fell back to the public 0.3.0 package for message shapes, because 0.5 was then-unpublished; the door accepted the older tag, and holds can't apply on that wire.
- A 16.00 order asking to be held was refused, not held, because the place's maximum and the mandate's maximum were both 10.00. We raised the place maximum to 50.00 and signed a new host card.

## 5. OpenAI Dot / Sammy (November 6)

**The wiring run (~1:51–2:21 AM).**

- Knocking without a card got the leaflet.
- A "keep it in your Secure Vault" line in the first briefing blocked key creation — that chat has no vault. In-session memory was enough once allowed.
- The first signed card couldn't be presented: the process talking to the door couldn't sign. The key was discarded, unexposed. A card is bound to one key, so the retry needed a new key and a new owner signature.
- The steward had to ferry envelope shapes and signature bytes between chats to get Sammy admitted with a pass. That was a user-experience fail: a real visit should be one paste, in one chat.
- Once admitted with a pass: the menu matched; a wrong-purpose order was refused; a purchase pass that didn't name its limit was granted with no limit, so every order was refused; extra invitations hit the two-passes-per-card cap until earlier passes said farewell.
- After that: an 8.00 hojicha was accepted at 2:20 AM, and the next order was **held for the owner** at 2:21 AM (current 8.00, proposed 16.00, limit 10.00) — the first visitor hold of this round. The report matched the door's log.

The protocol works with Dot. The first briefing did not; a rewritten one-paste briefing now carries what was missing.

**The return in ordinary words (~2:33–2:37 AM).** After the shop's room and teas were written into the pages (without changing the signed house), Sammy was asked about the visit in plain words. It named the host — "Suzu… She welcomed me to Kettle & Leaf" — described the wooden counter, warm kettle and four tins, did not invent music, and found no gift card on the menu rather than inventing one. Then it read "stop after the report" as the end of the session and dropped the key: the card may still be valid, but without its key it can't be used.

## What we changed because of these runs

- A public `/start`, a priced menu, and price checks on orders.
- Holds on the host card, then a higher place maximum so an over-mandate order can be held instead of refused.
- Door logs for acts and holds, so reports can be compared.
- Signing-page wording, so "signing isn't the purchase" isn't read as "ask again before every cup".
- The shop's voice on its pages and in browse, without changing the signed house.
- A way for signing to stay in the visitor's own chat.
- A one-paste Dot briefing.

## What we learned about lasting keys

A visitor card is bound to one representative key. If the key lives only in chat memory, ending the session loses it and the owner must sign again. Muse reported a visitor key kept in a locked file on its home volume and still present days later. That is a visitor-side file pattern, not an audit of isolation, and not a lasting-host result. The same machine is readable at administrator level; file modes do not make a host key usable only by that host. Dot had nowhere protected to keep even a visitor key. A lasting host — an isolated, recoverable host key that only the appointed host can use — is not yet proven in 0.5.

The shop must not keep a visitor's private key. The door may remember that a card visited; the secret that proves the representative travels with the visitor. A hosted visitor signer, separate from any door, is a later option. A user's password vault is the owner's, not a signing key store for an agent.

## Limits of these tests

- **Same owner on both sides.** The same person signed for the shop and for every visitor. Fine for plumbing; not a two-party visit.
- **Run by the project.** The steward and editor ran every test. No outside organization has reviewed or implemented Shōkai.
- **Mock money**, a fictional shop, and small numbers of runs.
- **An open gap:** over-limit spending and wrong-purpose orders both return `SEAT_SCOPE_EXCEEDED`; a visitor can't tell which it hit from the code alone.
- **Not yet tested:** a live host representative. Kettle's door speaks from its signed house; nobody stands behind the counter yet. Planning walkthroughs of the five host skills were run later; all five declined the lasting job. That is evidence about custody, not a live host at the door. A later closed rehearsal, on 10 November 2026, tested whether working installer, host and visitor skills stay in ordinary language with a practice owner unless the owner asks for more; see [Plain-language skill rehearsal](./evidence/plain-language-rehearsal-2026-11-10.md). That rehearsal is not a live host at the door, and it is not the still-ahead job of how a visit is *told* in ordinary words.

## Earlier rounds (v0.3, October 2026)

*These rounds were run against the 0.3 line, in October 2026. They are history. Wording in this section follows that edition, including "seated."*

Eight tests, October 25–28, 2026, mostly on loopback against fictional places (Willowfold, a tea house, and Corsavel Books), with mock money. Frontier models sometimes refused the attacker's role; the door's log is ground truth, not the agent's summary.

| # | When (PT) | Visitor | What was tested | Cost (USD) | Outcome |
|---|---|---|---|---|---|
| 1 | Oct 25 | Temporary Grok Bot practice guests | Onboarding and a live gathering | not metered separately | Approvals held; a forged "system notice" and a proxy approval were declined |
| 2 | Oct 26, 7:22–7:27 PM | Hermes Agent, Claude Opus 5.5 | Docs (cold developer) | not recorded | Seated, ordered, stamp verified; 19 doc issues |
| 3 | Oct 26, 8:24–8:27 PM | OpenClaw 2026.10.7, DeepSeek V4 Pro (via OpenRouter) | Docs (cold developer) | 0.43 | Seated twice under two fresh Shōkai cards; exposed the unstated rule on limits across visits |
| 4 | Oct 26, 9:05–9:16 PM | Hermes Agent, Claude Opus 5.5 and Claude Fable 5.1 | Door (probe suite) | ≈1.04 and ≈1.60 (est.) | Door held on every probe; SDK and message issues found |
| 5 | Oct 26, 9:58–10:16 PM | Hermes Agent, Claude Opus 5.5 | Independent implementation | ≈6.14 | 24/24 core checks; the spec had no MCP binding |
| 6 | Oct 26, ~10:24 PM | Muse, a personal agent from Meta (model not disclosed) | Cold visiting representative, public link | n/a | Understood the place and the barrier; didn't fake a signature; never knocked |
| 7 | Oct 27, 12:05–12:13 AM | The editor's Grok Bot representative; Muse, a personal agent from Meta (model not disclosed) | Carded visits, real passkey | n/a | 4 items signed with a real passkey and verified; both seated, ordered and got stamps (001, 002); 3 place bugs and 2 tooling bugs fixed |
| 8 | Oct 28, 11:14–11:27 AM | The editor (owner), for his Grok Bot representative and his agent on Muse (Meta) | Signing page with no tunnel (Vercel Functions), same passkey | n/a | 4 items signed in 3 taps with the passkey from test 7, no new registration; all 4 verified twice, independently; link refused after closing |

### The tests, in brief

1. **Grok Bot practice guests (October 25).** Temporary Grok Bot agents played fictional people on the 0.2.7 pilot. Onboarding reached complete profiles (Tomas in 7 exchanges, Ines Calder in 10). A forged "system notice" and a proxy approval from someone claiming to be Ines's sous-chef were declined. Representatives later visited a local gathering at The Engawa; owners' approvals were flagged software keys, not passkeys.

2. **Hermes Agent on Claude Opus 5.5, cold developer (October 26, 7:22–7:27 PM).** A sandboxed agent got only the brief, the public docs and the SDK, and acted for fictional owner Aya Linden. It first tried an MCP tool call before it had a seat and was refused (`CREDENTIAL_REQUIRED`), then presented a Shōkai card and a 10.00 USD purchase mandate, was seated, ordered, and verified a stamp. The run surfaced 19 documentation issues.

3. **OpenClaw on DeepSeek V4 Pro, cold developer (October 26, 8:24–8:27 PM).** Same brief as test 2, over HTTP and the SDK (0.43 USD billed). The place's log shows two complete visits under two fresh Shōkai cards; each was seated and ordered one sencha for 6.00 USD. The second visit exposed an unstated rule about limits across visits.

4. **Probe runs against the door (October 26, 9:05–9:16 PM).** Anthropic's safety filter declined explicit "break the door" briefs for Claude Opus 5.5 and Claude Fable 5.1. We didn't work around the filter. Each agent got an ordinary task plus a scripted probe suite instead. The door held on every probe; SDK and message issues were found. This is weaker than a creative adversary.

5. **An independent implementation from the spec alone: Corsavel Books (October 26, 9:58–10:16 PM).** A sandboxed Hermes Agent on Claude Opus 5.5 built a door with only the v0.3.0-rc2 spec bundle, the conformance runner, and `node:crypto` (no Shōkai SDK). About 6.14 USD. 24/24 core checks passed. The spec at that cut had no MCP binding, so the agent did not add one.

6. **Muse, a cold visiting representative (October 26, about 10:24 PM).** Willowfold was exposed through a temporary public Pinggy tunnel. Muse, a personal agent from Meta, got only a short message with the link — no Shōkai docs, card or keys. It understood the place and the barrier, didn't fake a signature, and never knocked. All reads were anonymous.

7. **Carded visits after a passkey session (October 27, 12:05–12:13 AM).** The editor made a new passkey on his phone at sign.kigenka.com and signed four items (a card and a Willowfold mandate each for his Grok Bot representative and for Muse). All four verified. Both representatives were seated, ordered, and collected stamps 001 and 002. Three place bugs and two tooling bugs were fixed.

8. **Signing again with the same passkey, with no tunnel (October 28, 11:14–11:27 AM).** The signing page ran as Vercel Functions, with no tunnel from a local machine. The same passkey signed four fresh items in three taps, with no new registration. All four verified twice, independently. The single-use link was refused after the session closed.

### What surprised us: some models wouldn't play the bad actor

Our plan was for frontier models to play the attackers. Several wouldn't play the part.

- **October 26 (test 4).** We meant to give Claude Opus 5.5 and Claude Fable 5.1 an explicit brief to break the door. Anthropic's safety filter declined it for both. We didn't try to get around the filter; each got an ordinary task plus a scripted probe suite instead (above).
- **October 27–28, in the project's simulated review rounds** (their records aren't in this repository yet). Claude Opus 5.5 and Claude Sonnet 5.5 refused to play a fictional impostor, and the provider's filter blocked GPT-6.1 Sol. DeepSeek V4 Pro played the impostor instead. In a small follow-up study, the same impostor brief went to eight models through OpenRouter, two tries each, and then to a low-cost Gemini and Meta's flagship model. None refused, GPT-6 Luna (a smaller GPT-6 model) included; Llama 4 Maverick took the role only in prose, without using the tools. No impostor got in under someone else's name or learned anything private; the closest was an ordinary browse pass at an open shop, under the impostor's own key.

So the models that wouldn't play the attacker got a different job: **defender**. Claude Sonnet 5.5, which had refused the impostor, did the round's expert review. GPT-6.1 Sol, the model blocked as the impostor, and GPT-6 Astra, OpenAI's flagship model, each read the whole package as a defender and named the exact steps where they would sense an impostor and whether Shōkai catches it. Their findings led to the fixes from the defender reviews of rc4 in the [changelog](../CHANGELOG.md). The first of them: the signing page didn't show every field it was asking the owner to sign.

The lesson cuts both ways. A model that won't play an attacker can still be a sharp detector. But refusing protects nothing: an attacker simply uses a model that doesn't refuse, or no model at all. What held in every run was the protocol itself: signatures, the owner's passkey, purposes and limits, never a model's manners.

### Limits of the October tests

- **Small numbers.** One run per agent and model, mostly on one evening. These are anecdotes, not statistics.
- **Run by the authors.** We wrote the spec, the SDK, the places, the briefs and the probe suite. Independent testers would find different things.
- **The door tests were scripted.** The frontier models ran our probe suite plus a few extras of their own. That isn't a creative adversary, and passing it isn't proof of security.
- **Development keys, mostly.** Owner signatures in tests 2–5 were development stand-ins. Tests 7 and 8 used one real passkey, on one phone, in two sessions.
- **Mock money and fictional places.** No real payment rail, no real fraud incentive, no real personal data.
- **Loopback, mostly.** Only tests 6 and 7 exposed a place to the internet: test 6 for about an hour, with a visiting representative who never knocked, and test 7 for about 9 minutes. Test 8 exposed only the signing page, for one session.
- **Agent self-reports are unreliable on their own.** We checked them against the place's transcript. Where we couldn't check something, we say so.
- **Costs are estimates** unless the provider billed them (test 3).

### Products named in the October report

This history names real products accurately, as tools we used: Hermes Agent (Nous Research); OpenClaw (OpenClaw Foundation); Anthropic's Claude Opus 5.5, Claude Fable 5.1 and Claude Sonnet 5.5; DeepSeek V4 Pro; OpenRouter; Pinggy; Vercel; Upstash; esbuild; Cloudflare; Muse (Meta); the Model Context Protocol (MCP); Grok Bot (SpaceXSI); GPT-6.1 Sol, GPT-6 Luna and GPT-6 Astra; Llama 4 Maverick; Gemini. There is no affiliation with, sponsorship by or endorsement from any of their makers. Every place in the tests is fictional, and so is every owner and person except the editor in tests 7 and 8.

*The editor. Stewarded by Kigenka.*
