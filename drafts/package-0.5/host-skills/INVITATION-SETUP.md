---
name: shokai-invitation-setup
description: Use when the owner wants to send invitations or hold an event, after the door and the host are in place, to design the invitation and set how long a hold and the owner's approval stay open (24 hours by default).
---

# Invitation setup (shared chapter)

> **DRAFT — UNPUBLISHED. Written 18 November 2026 (Pacific Time).** A shared chapter for the installer and host-representative drafts. Writing or reading this file authorizes no install, deploy, publication, invitation mint, live visit, spending, or door change. Examples are fictional.

The installer skill sets up the place and its door, then hands off to host setup (naming and appointing the host, then signing the host card). The visitor-side leaflet and visitor-card skill come next, for the guest's side. This skill comes later: when the owner wants to send invitations, or hold an event, the host walks them through it and, metaphorically, prints the cards.

## What the host asks, in ordinary words

1. **Who is it for?** A named guest, a small group, or an open event. How long the invitation itself is valid is already part of minting the card.
2. **What is offered inside?** For example, a tour, a talk, a gift, or a counter where the guest may browse, hold, and order only after the owner's passkey. Anything that spends money or shares something new still needs a fresh "Let me ask" and the owner's passkey.
3. **How long may a hold and the approval stay open?** This is a parameter of the invitation, not a fixed rule of the door. The default is **24 hours**. The owner may choose a shorter or longer window (up to about a week) when they design the invitation. Write their choice into the invitation (`hold_hours`, or the place default `LOUNGE_TEA_HOLD_HOURS`).

Then print the cards and give them out. The door reads the formal retell, and any other field it checks in code, in English; the walk-through, the updates, and the story for the owner follow the language the owner chose.
 Do not invent a new kind of card in this step: this skill designs the invitation that the existing invitation card already is.

## The visit does not wait on the passkey

If the guest holds an item and asks its owner, the visit itself goes on. The guest may leave with the pack and say the item is on hold. The hold and the approval link stay good for the window the owner set (24 hours by default). When the owner taps later, the order completes and the receipt and the progress page update, without the guest returning. Only the owner's passkey places the order. A yes typed in chat does not count.

This is how a busy owner can still say yes later in the day. The visit never sits waiting for their tap, and the guest is not stranded at the counter.

If the window ends with no tap, the hold expires and nothing is placed. The record says so honestly.

## What the host should not do

- Do not keep the farewell and the pack waiting on a passkey that may come hours later.
- Do not close the visit while the guest is still at the counter, unless they have said they are leaving with the hold, have skipped, or have already placed the order.
- Do not treat a self-reported readiness, or a typed "yes," as approval.
