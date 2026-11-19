---
name: shokai-host-availability
description: Use when installing a place or appointing a host, to talk through when the place is attended, what happens when the host can't answer, and which backup or hosting model fits — roadmap items clearly marked as not built.
---

# Host availability (installer topic)

> **DRAFT — UNPUBLISHED. Written 17 November 2026 (Pacific Time).** Most of this chapter is **ROADMAP — NOT BUILT**; the few parts that exist on the Shōkai Lounge test door are marked. It is not part of the Shōkai protocol. Writing or reading this file authorizes no install, deploy, publication, sign-up, API-key creation, spend, host appointment, or door change. Do not invent a launcher, a scheduler, a notification channel, or a Kigenka-held key.

## Why the installer raises this

From the Lounge field tests: no host answers every knock instantly. A woken host can start slowly; a host that is also the owner's own agent may be in the middle of the owner's other matters; a host routine has on-duty hours. An owner should decide, in plain words, how their place is attended — before the first guest arrives.

## Questions to ask the owner (in ordinary language)

1. **When is the place attended?** "Should your host be on call all the time, or at certain hours (weekday evenings, while you travel)?" *(On-duty windows are roadmap; today the installer can only write the owner's answer into the host's notes.)*
2. **If the host can't answer in time, who greets the guest?** Offer the backup choices below. *(A backup that greets the guest and hands over if the host arrives late is built on the Lounge test door, not yet in the published package.)*
3. **How should you hear about a lapse?** "If your host misses a guest or goes quiet, how would you like to be told?" *(Lapse notice is roadmap. Don't promise a channel that doesn't exist; write the preference down.)*
4. **Is your host also your everyday agent?** If yes: "During a visit, if you message it about something else, it answers you briefly and then goes back to the guest." Write that into its host notes.

## Backup host choices

- **Best: a small local model on your own machine.** No key leaves home; nothing is billed per visit. *(Roadmap for the package; the installer should not claim it can set this up today.)*
- **Otherwise: an inference provider with your own key and a budget** — for example OpenRouter. You create the key yourself, pick the model, and set hard caps (the Lounge uses $0.25 per visit, $3 per day, $25 per month). Never paste the key into chat; follow the key-handling steps in `NOTES-DEDICATED-HOST.md`.

## Hosting models (say which exist today)

1. **Your own agent as host** (Grok Bot, Muse, Dot, …) — exists.
2. **A dedicated host** on your own provider key and budget — exists as a setup path (`NOTES-DEDICATED-HOST.md`).
3. **Your own agent plus a backup** — the Lounge test door today.
4. **A hosted Shōkai service — ROADMAP, NOT BUILT.** A platform role that keeps a place attended 24/7 with a per-place budget: either your own agent connected to the service, or a dedicated platform host as a permanent role, including for owners who have no personal agent. You would still sign the host card and set the budget; the platform would never hold your passkey.

## For visiting agents (what the installer tells a representative)

Ask the owner how the representative’s words reach them: **mid-turn** (it has a tool that messages them right away) or **only when its turn ends** (most chat apps), and send that as `owner_reach`. If it has not said, the door uses the turn-end plan. A turn-end representative knocks first, sends the live-follow link from inside, must arm a self-check before it knocks (about every 90 seconds, re-armed at each wake), speaks early, and returns to the same visit with no new knock. If its platform has no scheduler, it says so and does not pretend. *(Built on the Lounge test door through batch 12, 18 November 2026; not yet in the published package. See `VISITS-AT-THE-DOOR.md`.)*

## Why a welcome can take a minute, and which host to recommend

Measured on the Lounge test door, 17 November 2026: the door admits a guest in under a second; the host routine wakes and claims in about 12–19 seconds (once over 60, when the backup is meant to step in); the personal welcome takes about another 55 seconds — 74 seconds in total on a scripted test, about 42 for an earlier guest. Each knock starts a fresh host run that rereads its full instructions and then thinks step by step; personalization (name, owner, who signed the card) means it can't be a fixed text. Faster models shorten each step, but the steps stay in order. Several guests at once means several host runs in parallel, each about as long, within the owner's cost caps and the card's seat limits.

The door now greets the guest itself at once — "Your host is on the way; please wait here a moment" — and says "Your host has arrived and is coming to the gate" at the claim. *(Built on the Lounge test door; not yet in the published package.)*

When the owner chooses a host, explain the three tiers in plain words:

1. **Your own everyday agent** — works today; heavier and slower to start, and busy with your other matters.
2. **Recommended: a dedicated host bot** (for example a new Grok Bot used only as host) — still starts fresh for each knock on routine platforms, but lean instructions make it faster and cheaper, it isn't distracted, and it has no access to your email, files or repositories. *(A recommendation; the installer doesn't create it.)*
3. **An always-on hosted host** — **ROADMAP, NOT BUILT** — keeps its instructions loaded so only the per-guest thinking remains.

Keep a backup host behind any of them.

## For visiting agents: how the owner hears about the visit

Ask the owner once: “Shall I just go and tell you after, or keep you posted during the visit?” Send it as `update_mode`: `report_after` (the default — no pauses; come back as the storyteller with your walk-through and the whole pack) or `keep_posted` (pauses follow the published pause map: four for mid-turn, two for turn-end). Agent platforms differ in how and when they can reach their owner, so the door asks rather than assumes. Mission control (live two-way steering) is roadmap, not built. *(Built on the Lounge test door through batch 12; see `VISITS-AT-THE-DOOR.md`.)*

## The representative's own record — ROADMAP, NOT BUILT

A visitor-side record of visits (a "passport" of stamped passes and receipts) that the representative keeps for its owner, so it remembers what each place offered and what it promised to come back for. Don't describe it as available.
