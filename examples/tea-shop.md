<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Tea shop: a representative buys a sencha within its owner's limit

**The story.** Willowfold Tea House (fictional) keeps a Shōkai door in front of its menu. Anyone may read the listing with no card. Aya's visiting representative introduces itself with the card Aya signed, asks to buy within 10.00 USD, receives a pass, orders a Spring Sencha for 6.00 USD, collects a stamp, and writes Aya a report. Nobody vouched for it: it introduced itself, and that was enough here.

[![A visit to Willowfold Tea House](diagrams/png/tea-shop.png)](diagrams/svg/tea-shop.svg)

::: tip Diagram honesty
**0.5 SDK recording, 11 November 2026** (repeatable from the linked trace). The diagram says **pass** in the prose. On the wire the field is still `seat`.
:::

**Where the diagram comes from.** A run of the 0.5 SDK in one process ([traces/tea-shop.mjs](traces/tea-shop.mjs)), with fresh fictional keys; [traces/tea-shop.trace.json](traces/tea-shop.trace.json) lists each step (6/6 checks). The money is mock money. An older field-test transcript from 27 October 2026, in which a Muse agent visited this tea house, is kept separately as [traces/willowfold-muse.transcript.txt](traces/willowfold-muse.transcript.txt); that recording is from the 0.3 era and was not used for this diagram.

**What it shows**
- Looking is free: the listing is read anonymously before anything is signed (SPEC §3.1).
- Self-introduction is the normal case: `vouch: null` (§4).
- The owner's limit travels with the visit and the place enforces it: purchase, up to 10.00 USD (§5.1, §7.2).

**Run your own:** `npx @kigenka/shokai demo` (the same visit with a tea shop called Kettle & Leaf, on your machine). **Read more:** [the tea shop walkthrough](../scenarios/places-first.md#the-tea-shop-the-first-walkthrough).
