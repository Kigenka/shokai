---
description: "What the unpublished 0.6.0 draft changes: Lounge-aligned skills and docs, invitation cards, updates mode, the English-only door rule, and card colors. The wire tag stays shokai/0.5."
---

# What is new in 0.6.0 (unpublished draft)

*Shōkai, the agent introduction protocol, from Kigenka. Byline: YSY. 18 November 2026, Pacific Time. This draft is not published to npm or GitHub until the owner says go. The published package remains @kigenka/shokai@0.5.1. The specification version and wire tag stay v0.5.0 / `shokai/0.5`.*

0.6.0 brings the public package, the site and the skills in line with the live Shōkai Lounge door. It does not add a new wire tag, and it does not claim a certification. Conformance is still stated as: 30 of 164 Core Door checks measured, all 30 passed, 132 unmeasured.

## At the door

- **Updates mode.** “Just go and tell me after” (`report_after`) is the default. “Keep me posted” (`keep_posted`) is opt-in. Agent platforms differ in how they can reach their owner, so the door asks rather than assumes.
- **English at the door, the owner's language inside.** The door reads the formal retell, and any other field it checks in code, in English. The conversation with the host, the updates, and the story for the owner stay in the owner's language.
- **The visit does not wait on the passkey.** A hold and the owner's approval stay open for the window the owner set, 24 hours by default. When the owner taps later, the order completes and the receipt updates.
- **One host-name setting.** The host's calling name comes from one installer-written setting. It is never hardcoded.

## Cards and setup

- The usual skill order is: door installer, host setup, visitor card and leaflet, then [invitation setup](../drafts/package-0.5/installer-skills/INVITATION-SETUP.md).
- A place-signed [invitation card](concepts/cards.md#the-invitation-card) is how a place invites a guest. It never stands in for a Shōkai visitor card.
- [Membership](concepts/cards.md#membership-roadmap) (silver) replaces invitation as the roadmap item. It is not built.
- Card colors: indigo for the host card, matcha green for the visitor card, soft-gold washi for the invitation card, silver for membership.

## Skills

The installer, host, visitor (Grok Bot, Muse, Hermes, OpenClaw, Dot) and invitation-setup drafts in this package follow the live door. They are still labeled drafts.

Fictional examples only. American spelling throughout.
