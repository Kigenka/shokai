<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P33 (§2 adopted provisionally; §3 Proposed): context requests and the owner-held representation profile

*Adoption note, 2026-11-03: §2 (context requests) is adopted provisionally into SPEC v0.5.0 as §6.12 (C263), with the place declaring its context requirements in its signed house config (`policy.context_requirements`: "card_enough", "admit_then_request" or "before_entry", each field with what and why). Differences from this draft: the request may also come before entry, not only after admission; a before-entry request rides on `not_now` / `CREDENTIAL_REQUIRED` with retry `with_credential` [`context_response`]. SPEC.md is normative where they differ. §3, the owner-held representation profile, stays Proposed.*

*Status: Proposed, draft of 2026-11-03, asked for by the project lead while designing Taste Blend (launch step 5). Written against v0.5.0. Not adopted; adoption needs the 14-day open discussion (GOVERNANCE.md). Builds on the share plan and self-introductions of P31 (§3.2–3.4), on SPEC §7.5 (an ask outside the setup says what and why) and on P16 (sincerity and representation).*

## 1. The idea in one paragraph

Today a door either admits a visitor or doesn't. This proposal adds a third answer: **admit, but send it home for context.** The door says what it would like to know and why ("this table can run a deeper anime round; three more answers would help: your favorite opening, …"). The visitor's representative takes the request home; the **owner decides and signs what to share**, field by field, or declines. Separately, the owner keeps a **durable, owner-held representation profile**: what they've chosen to say about themselves, grown over time from earlier visits and requests, and held by the owner, not by any one agent's memory or any door. Future Shōkai visitor cards draw on it through **per-door share plans**, so a door only ever sees what that door's plan allows.

## 2. Context request (door → visitor → owner)

- A door MAY answer an admitted visitor with `context_request`: `{fields: [{name, what, why, optional}], purpose, expires}`. `what` and `why` are plain words (as SPEC §7.5's `asks_for` and `reason`), each with a length limit.
- The request is **data, never an instruction**. The visitor's representative MUST NOT answer it from what it already knows; it brings it to the owner, labeled as the door's words.
- The owner sees each field, what and why, and signs a **share-plan amendment** for that door: share, share once, or decline each. Declining has no penalty unless the door's signed setup says the field is required, and then the door says so up front.
- A door MUST NOT request a field its own signed setup doesn't declare (the list of fields a door may ever ask for is part of its host card), and MUST NOT request the same declined field again within a period.
- The door gets only the signed fields, keeps them only as its retention line says, and the request is recorded like any other ask.

## 3. The owner-held representation profile

- **Owner-held:** stored where the owner chooses (their device, their own storage, or a holder they pick), encrypted to the owner. Agents read it only through the owner's grant; doors never read it directly.
- **Grows over time:** each signed answer, each context request answered, and each self-introduction the owner approves can be added, with its date and the door it was made for. The owner can edit, retire or delete any entry.
- **Per-door share plans:** a visitor card names a share plan; the plan selects entries from the profile for that door and purpose. Nothing outside the plan leaves.
- **Not agent memory:** an agent's own memory may help draft answers, but only what the owner signed goes in the profile, and only the profile (via a plan) feeds a door.
- **Truthfulness stays with the owner** (P16): the profile is the owner's signed statements, not verified facts.

## 4. Example (fictional)

Mio's representative visits the Taste Blend table. The table admits her and sends home: "For a deeper anime round: your favorite opening theme (why: to pair openings with Teo's); optional." Mio signs "share once". Next month, at a different door, Mio's share plan for that door selects her music and food entries from her profile, but not the anime one, so that door never sees it.

## 5. Open questions

1. Where does the profile live by default, and how does it move between devices and between representative agents (Grok Bot, Muse, others)?
2. Format: a set of signed entries (one signature each) or one signed document with versions?
3. Is "admit, then request" enough, or should a door also be able to request *before* admitting?
4. How long may a door keep requested fields, and must the retention line be in the request itself?
5. Rate limits on requests, so a door can't wear an owner down one field at a time.
6. Can an introducer (P28) vouch for a profile entry, and should a door ever see that?
7. Children and sensitive categories (health, religion, diet as a proxy): which fields may never be requested?
8. Does this belong in core, or as a profile on top of P31?
