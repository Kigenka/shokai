---
name: shokai-naming-the-host
description: Use when installing a place or appointing a host, to treat naming the host representative as a required setup step — ask the owner, offer fitting suggestions, let the host suggest a name, and write the confirmed name into the host-name config, the host agent’s own name, and the invitation line.
---

# Naming the host representative (shared chapter)

> **DRAFT — UNPUBLISHED. Written 18 November 2026 (Pacific Time).** A shared chapter for the installer and host-representative drafts. Naming the host is a required setup step. Writing or reading this file authorizes no install, deploy, publication, host appointment, live visit, spending, or door change. Examples are fictional.

A named host representative is the place’s personality, not just a bot.

## What to do, in plain words

During setup, before the owner signs the host card, the installer asks: **“What should your host representative be called?”** Do not skip this step. Do not fill it in with the agent’s working name, a job title, or the platform’s product name.

Offer a few fitting suggestions in the place’s spirit — names that sound like a person welcoming a guest. If the host is already in the conversation, invite it to suggest a name of its own. The owner confirms. A rehearsal name is a suggestion, never an appointment, and you must not choose for them.

Once the owner confirms the name, write it into all three of these, so they agree:

1. **`LOUNGE_HOST_NAME` or the equivalent host-name config** for this place.
2. **The host agent’s own name**, if the platform can rename it.
3. **The invitation line** visitors will hear: “Your host today is <name>, <owner>’s representative.”

If the host card’s role or appointment text includes the calling name, put the confirmed name there before the owner signs. There is no separate host-name field on the card; the card’s displayed name is the owner’s. A later change to a name that sits in a signed or digest-covered field needs a new passkey signature. Do not change only the invitation or the env: the served card and what visitors hear would then disagree.


## Every door inherits this one setting

Every door and house this place runs inherits the host name from that one setting (`LOUNGE_HOST_NAME` or the equivalent host-name config the installer writes when the owner names the host). Write the confirmed name into each door's house before the owner signs its card, so the house digest and the served door agree. The invitation line, the owner's progress page, the receipt, and the public host id read from the same setting. Do not hardcode the calling name in a house file, a card-prepare script, or the progress or receipt copy. A later change to a name that sits in a signed or digest-covered field needs a new passkey signature on each affected door card.

The appointed host still asks, in its own voice, **“What would you like to call me here?”** If the setup letter already carries a confirmed name, it offers that name back and does not treat it as already appointed until the owner signs.

## A lesson from the Lounge

The Lounge’s dedicated host was set up by hand from a production plan, not by running the installer skill. The naming step was never asked, so the host went live under a working name. That also missed a chance to test the installer. Setups should run the installer skill. Every setup step is a chance to test it.

## Not a protocol rule

This is the place’s design. It does not add a new field to the published package, and it does not let anyone invent a deploy or signing shortcut. If a later rename needs a new signed host card, wait for the owner’s own passkey tap.

## Next required step

Once the name is confirmed, signing the host card is the heart of the appointment: it is the owner's contract with this host, and each door needs its own signed card. See `APPOINTING-THE-HOST.md`.
