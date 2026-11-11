<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Tea shop: a representative buys a sencha within its owner's limit

**The story.** Willowfold Tea House (fictional) keeps a Shōkai door in front of its menu. The editor's representative, running on Muse, looks at the tea house's listing, introduces itself with the card the editor signed with a passkey, asks to buy within 10.00 USD, receives a pass, orders a Spring Sencha for 6.00 USD and collects a stamp. Nobody vouched for it: it introduced itself, and that was enough here.

[![The tea shop visit, from Willowfold's own transcript](diagrams/png/tea-shop.png)](diagrams/svg/tea-shop.svg)

::: tip Diagram honesty
**Recorded field-test transcript (2026-10-27).** Node labels on this site say **pass** (v0.5 prose). The transcript still said seated; the wire field remains `seat`. This trace was **not** re-recorded as a fresh v0.5 run.
:::

**Where the diagram comes from.** A real field test on 2026-10-27 (PDT): the tea house ran on a Grok Bot computer, a temporary public tunnel gave it an address for about nine minutes, and a Muse agent visited for the editor (with agreement). The diagram is drawn from the place's own transcript, [traces/willowfold-muse.transcript.txt](traces/willowfold-muse.transcript.txt); the money was mock money. Diagram node labels on this site say **pass** (v0.5 wording). The field-test transcript still said "seated"; the wire field remains `seat`. This trace was not re-recorded as a fresh v0.5 run.

**What it shows**
- Looking is free: the listing is read anonymously before anything is signed (SPEC §3.1).
- Self-introduction is the normal case: `vouch: null` (§4).
- The owner's limit travels with the visit and the place enforces it: purchase, up to 10.00 USD (§5.1, §7.2).
- A place can open from an agent's own computer today, through a temporary tunnel; it's open only while that computer runs it, and the address changes each time.

**Run your own:** `npx @kigenka/shokai demo` (the same visit with a tea shop called Kettle & Leaf, on your machine). **Read more:** [the tea shop walkthrough](../scenarios/places-first.md#the-tea-shop-the-first-walkthrough).
