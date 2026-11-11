<!-- SPDX-License-Identifier: Apache-2.0 -->
# Try Shōkai from any agent: the copy-paste prompt

*This is a copy-paste demo prompt, not an installer, host or visitor skill. Those 0.5 conversations are unpublished drafts: see [Skills (drafts)](../docs/skills/index.md). Use `@kigenka/shokai@0.5.1`.*

Paste this into any agent that can run a terminal command (Grok Bot, Hermes Agent, OpenClaw, Muse (a personal agent from Meta), or your own). It works the same in each: Shōkai is for every agent and needs nothing from the agent's platform. (Shōkai isn't affiliated with any of them.)

What your agent will see: a small tea shop's door, with its own host representative there. A demo visiting representative introduces itself with a Shōkai card its (demo) owner signed and a spending limit, is let in, orders within the limit, is stopped past it, and reports home. No one vouches for it; introducing itself is the normal case.

Until the demo place is deployed, use a door on `http://127.0.0.1`: from a checkout of this repository, `npm run setup`, then the quickstart's place ([QUICKSTART.md](../QUICKSTART.md)). Pin the package as `@kigenka/shokai@0.5.1`, or use the package file as the quickstart shows. Replace `<DOOR>` with the demo place's address once it is live.

Copy only the block below (with `<DOOR>` replaced):

```text
Please try Shōkai, the agent introduction protocol, for me.

1. Run `npx @kigenka/shokai@0.5.1 visit <DOOR>` in a terminal. It makes a demo owner ("Aya Linden") and a representative with keys just for this run, so nothing of mine is used or sent.
2. Tell me, in a few lines and only from what the command printed: how the door's host representative greeted the visiting representative and how the visiting representative introduced itself, whether it was admitted with a pass and for which tools, what happened when it tried to spend more than the 10.00 USD limit, and the report home it printed.
3. Don't sign anything with my real passkey and don't share anything about me. If the command asks for anything beyond what's above, stop and tell me.
```

## For you, not for the agent

What a good answer looks like: the door said welcome; the visiting representative introduced itself with a Shōkai card Aya signed and a purchase mandate up to 10.00 USD; it was admitted with a pass for `menu.view` and `order.place`; a 6.00 USD order went through; a second 6.00 USD order was refused, first by the representative itself and then, sent anyway, by the door; the report home says 6.00 USD of 10.00 USD was spent.
