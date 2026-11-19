---
name: shokai-appointing-the-host
description: Use when installing a place or appointing a host, to treat signing the host card as a required setup step — a contract between the owner and the host representative, one signed card per door, prepared after the host is named, reviewed and signed with the owner's passkey, then hung on that door.
---

# Appointing the host (signing the card) (shared chapter)

> **DRAFT — UNPUBLISHED. Written 18 November 2026 (Pacific Time).** A shared chapter for the installer and host-representative drafts. Signing the host card is a required setup step and the heart of setting up a place. Writing or reading this file authorizes no install, deploy, publication, host appointment, live visit, spending, or door change. Examples are fictional.

The signed host card is the owner's contract with the appointed host representative. It names who keeps the place, for which door, under which duties, and for how long. Until that card is hung on the door, the door is not open.

## What to do, in this order

1. **Name the host.** Ask the owner what the host representative should be called, and write the confirmed name where visitors will hear it. See `NAMING-THE-HOST.md`. Do not prepare a card under a working or product name if the owner has chosen a calling name.
2. **Prepare the card for that door.** The role (the calling name and whose representative this is), the duties, the place, the door address, the relying-party id (`rp_id`, the site the owner's passkey is bound to), and a validity window of about 90 days. Each of these is part of what the owner signs.
3. **The owner reviews and taps their passkey** on the place's own site, on their own device. Show them in ordinary words what they are signing. Do not open a signing session while they are away. **Signing does not open the door and does not charge anyone.** It only approves this host for this door under these rules.
4. **Hang the signed card on that door** — put it in the door's config — and redeploy so the door can present it. A card sitting in a file is not yet in force.

If the role text or the calling name later changes, prepare a new card and wait for a new passkey signature. Do not change only the invitation line or a name in config: the served card and what visitors hear would then disagree.

The host name is not set again at this step. Every door and house this place runs inherits it from the one host-name setting written when the owner named the host (see `NAMING-THE-HOST.md`). Prepare each door's card from a house that already carries that name.

## One signed card per door

Every door needs its own signed host card. That includes the place's main door, and any room or shop that has a door of its own.

A card is bound to one place and one entry. A door that is asked to present a card signed for a different place will refuse it: the signature, the dates, and the place do not match. The honest answer in that case is that this door is not open — not that the guest's card failed.

Until a door has its own signed card in force, it should say plainly that it is not open, and why. The host must check that the other door is open before sending a guest there. If it is closed, say so and skip it; do not send the guest to a door that will only refuse them.

## A lesson from the Lounge

The Shōkai Lounge has two doors: the Lounge itself, and the Tea Counter, a shop inside the visit with a door of its own. The counter is a showcase of a place's own tool service — an MCP, a standard way for an agent to use a shop's tools — running behind that door. A visiting agent may browse the menu, hold an item, and place an order only after the owner's passkey.

When the counter was first hung in production, it was given the Lounge's host card. The counter's door rejected that card (`SHOKAI_DOOR_CARD_INVALID`): the card was valid for the Lounge, not for the Tea Counter. Guests were sent to a door that answered it was not open. The fix is the rule above: give the Tea Counter its own signed card, and have the host check the counter is open before offering the gift. Until that card is in force, the counter honestly says it is not open, and the host skips it.

## Not a protocol rule

This is how a place is set up. It does not add a new field to the published package, and it does not let anyone invent a deploy or signing shortcut. Wait for the owner's own passkey tap. Do not treat a chat "yes" as a signature.
