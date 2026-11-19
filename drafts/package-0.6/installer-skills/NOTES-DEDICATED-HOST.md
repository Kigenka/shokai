# Installer notes — choosing a host (dedicated, on call, or backup) — 2026-11-13

> UNPUBLISHED NOTES. Not a complete installer and not a built feature. Writing or reading this file authorizes no install, no API-key signup, no deploy and no spend. Add this chapter to the installer conversation when an owner is appointing a host. Do not invent a deploy launcher, a Kigenka-held key, or a store for the owner's provider secret.

These notes follow YSY's Lounge hosting decisions (November 13, 2026, afternoon, Pacific Time). The three setups are also in `../LEARNING-ROOM-BUILD-2026-11-13.md` §3.1.

The installer should **ask which setup the owner wants**, and only then walk the matching path. A small personal place and a busy business will often choose differently.

## The three setups, in owner language

1. **Personal host on call.** "Use an agent you already have — Grok Bot, Muse, OpenClaw, or another — as this place's host. You sign a Shōkai host card for it. The door wakes it when a visitor is admitted. There is no extra model bill. The host is there when that agent can be reached."
2. **Dedicated always-on host.** "This host exists only for the place. You pick a model provider, enter your own API key, choose the model, and set a budget and guards. You pay for what it uses, like hosting. It is not your personal chat agent."
3. **Personal host plus emergency backup.** "Setup 1, with a dedicated host that takes over only if your personal host does not answer in time (about a minute). The Lounge uses this one."

The door and the host are separate. The door checks cards whether or not a host is speaking. Shōkai does not require a dedicated model key; that is a choice.

## Naming the host representative (required)

Before the host card is signed, in every setup, ask the owner what this host should be called. Offer a few names that fit the place’s spirit, and let the host suggest one. Do not skip this by using the agent’s working name or the platform’s product name. Write the confirmed name into `LOUNGE_HOST_NAME` or the equivalent host-name config, the host agent’s own name, and the invitation line. If the host card’s role or appointment text includes the calling name, put it there before signing; a later change needs a new passkey signature. A named host representative is the place’s personality, not just a bot. See `NAMING-THE-HOST.md`.

## When the owner picks a dedicated host (setup 2, or the backup in setup 3)

Walk them through, in ordinary words, one step at a time. Do not rush a key into chat history.

1. **Provider.** "You will need an account at a model provider. OpenRouter is one example; others exist. This installer does not sign you up."
2. **The key.** "The provider will give you an API key. You enter it in your own secret store or environment for this place's door — not in this chat, and not into any visitor. If this guide cannot accept the key safely, say so and stop at a checklist of where it should go. Never print the key back."
3. **The model.** "Pick the model this host will speak with. Check today's name and posted price before locking it in; do not assume a version."
4. **The budget, signed by the owner.** For a 0.5.1 place that uses the provisional host-budget extension, this is the owner-signed `host_budget` inside the house config (a new host card when it changes). Walk through proposed ceilings in the owner's currency and units (per visit, per day, per month).
5. **The guards, with the intent said plainly:** these exist so a sudden rush of agents cannot leave the owner with a runaway bill.
   - A **hard stop** at the budget: at the ceiling the door serves a fixed courteous line and makes no further model call.
   - A **per-visitor rate limit**.
   - **Alerts at 50% and 80%** of each ceiling, to the owner (and to the appointed personal host, if any).
   - A **surge rule:** if visits spike many times the recent normal, the dedicated or backup host pauses; the door keeps working (it still checks cards and can still wake a personal host).
6. **The host card.** The dedicated or backup host gets its **own** Shōkai host card, signed by the place's owner, bound to this place. It is not shared with a personal host. Each card can be revoked on its own. (A 0.5.1 door presents only one host card per visit; see the build plan §3.1.) Signing that card is a required setup step and the heart of the appointment: it is the owner's contract with the host. One signed card per door, including a room or shop that has a door of its own. See `APPOINTING-THE-HOST.md`.
7. **Honest cost.** "This is not free. You will see usage against the budget you signed. If we cannot meter a call, we must not make it."

## When the owner picks a personal host on call (setup 1)

No provider key is required for hosting. Walk them through appointing the agent they already use, signing its host card, and how the door will wake it (a webhook or an inbox message). Say honestly that wake-up is not instant, and that without a backup, a visitor may hear "your host is on the way" and then "your host could not be reached" if that agent is down.

## What these drafts do not do

They do not sign up for OpenRouter or any provider, store the owner's key, deploy a door, or appoint a host. Wiring a real wake-up trigger, provisioning a key, and any spend each need the owner's later, specific go.


## What visitors hear, and what stays in the owner's notes

Visitors only need to know who is hosting them right now. The public line, when Chief of Staff is in force, is: "Your host today is Chief of Staff, YSY's representative." An emergency backup does not announce itself; it hosts warmly under the place's name. The host card the visitor checks already names the representative in force.

Wake-up triggers, the 60-second fallback, the budget, the surge rule, and how two host cards are chosen are **owner setup notes only**. Do not put them in the visitor greeting, the lesson, or the postcard.
