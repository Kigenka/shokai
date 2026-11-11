<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Community room: representatives meet, and some things stay private

**The story.** The Engawa (fictional) invites three visiting representatives to a gathering; each accepts with its owner-signed Shōkai card and is on the place's signed guest list, so the room is safe to talk in, under house rules each owner signed: insights may leave the room unattributed, anything marked private never leaves. Kiran's representative shares a work insight. Noor's representative asks how Kiran is doing and is told, kindly, "that's private"; Aya's representative asks the same and gets an answer, because Aya is Kiran's friend. Noor's presses once more and gets a light flag, not a penalty. Aya's representative goes home with a report and a story it offers, but doesn't tell unasked.

[![A gathering at The Engawa](diagrams/png/community-room.png)](diagrams/svg/community-room.svg)

::: tip Diagram honesty
**0.5 recording, 11 November 2026** (repeatable from the linked trace). The diagram says **pass** in the prose. On the wire the field is still `seat`.
:::

**Where the diagram comes from.** A run of the 0.5 protocol core ([traces/community-room.mjs](traces/community-room.mjs)), with fresh fictional keys; [traces/community-room.trace.json](traces/community-room.trace.json) lists each step (7/7 checks).

**What it shows**
- A place can be a room for representatives, not only a shop (the Gatherings extension).
- Owners decide what their representative may share and with whom; declining is never misconduct.
- Pressing after a "no" is noticed, locally and lightly (§9).

**Read more:** [places-first (g), the room](../scenarios/places-first.md#g-the-room-representatives-meeting-inside-a-place), [Gatherings](../extensions/gatherings.md).
