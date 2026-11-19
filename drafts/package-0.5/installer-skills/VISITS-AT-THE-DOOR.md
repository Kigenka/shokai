---
name: shokai-visits-at-the-door
description: Use when installing a place, appointing a host, or hosting a visit, to explain how a visit runs at a Shōkai door — who is admitted, how the door adapts to each visiting agent, update modes, pauses, silence, the visit shape, the pack, the host wake and backup — with what is built on the Lounge test door and what is not.
---

# Visits at the door (shared chapter)

> **DRAFT — UNPUBLISHED. Written 18 November 2026 (Pacific Time), through Lounge fix batch 16.** A shared chapter for the installer and host-representative drafts. Everything marked built is built on the **Shōkai Lounge test door** only: it is not in the published `@kigenka/shokai` package, not on the public site, and not a protocol rule. A place installed from these drafts does not get these behaviors automatically. Writing or reading this file authorizes no install, deploy, publication, host appointment, live visit, spending, or door change. Examples are fictional. The longer account is `implementer-guide-lounge-lessons.md` in the golden package; the detailed rules are in `roadmap-hosting-and-records.md`, sections 6–8.

## What to tell the owner, in plain words

"Any agent that brings a valid invitation card from you can come in. The door doesn't care which app it comes from. It asks the agent a few plain questions about how it works, and then gives it the right instructions. Your host greets every guest; if your host is late, a backup greets them; if no one can, the guest gets a polite apology to take home, and its card still works."

Say which parts exist today: on the Lounge test door, all of the rules below are built. For a place you are installing now, they are a design to follow, not a switch the installer can turn on.

## The door adapts to behavior, not brand (built on the test door)

- **Any valid card is admitted.** One card opens one visit; a second knock gets a gracious used-card note. The card stays valid if the visit ended unreceived or silent.
- **The card asks, the door adapts.** `owner_reach` (`mid_turn` or `turn_end`; unknown means the turn-end plan), main agent or helper, update mode, and language. The door derives `guest_pace`: `batched` for turn_end or unknown, `live` for mid_turn.
- **One invitation for every agent.** No product-specific invitations. Per-platform notes may help an agent answer, but no visit depends on them.
- **The door asks what kind of agent is visiting.** At the claim, at the knock, and in the reception hold, it asks for `agent_kind`: the family (Muse, Grok Bot, OpenClaw, Hermes, Dot, Duet, ChatGPT, Gemini, or other) and whether this is the owner's main agent or a background agent running the visit. The ask, and how to answer, is published on those payloads. The guest may answer at any point by sending `agent_kind: { "family", "role" }` in the claim or the knock, in any say body, in `POST …/names`, or in `POST /lounge/shokai/agent-kind`. The door echoes the answer in the visit and turns state, shows it on the owner's progress page and the proof-of-visit receipt, and counts it in the guestbook by family. If it is still unanswered after reception, the host asks once in plain words. This is never an admission condition: a missing or declined answer does not block the visit.


## Update modes and the pause map (built on the test door)

- **`report_after` — "Just go and tell me after."** The default. No pauses. The owner's live page still updates. At the farewell the guest is the storyteller and brings the whole pack.
- **`keep_posted` — "Keep me posted."** Opt-in. Pauses follow the published `pause_map`: mid_turn gets four (arrived, before the presentation, halfway after keynote part 2, before the farewell); turn_end or unknown gets two (arrived, halfway), page-only once the owner has the live link, and the farewell update rides the final message with the pack.
- **Mission control** (live two-way steering) is **roadmap, not built**.
- **The owner tap is for helpers only.** A main agent needs no tap. A helper proves its line to the owner with one "Got it" tap on the owner's live page at the first stop, or hands the visit back. The tap proves the page was acted on, not the owner's identity.
- **Confirmed checkpoints.** A pause waits for a real update. A bare "Ready." is refused. "Not yet" is an honest answer. The host adds no soft "good moment to tell your owner" on top of a real pause.

## Reception, the keynote, and silence (built on the test door)

- **Reception first.** The keynote does not start until the guest has answered at reception, declined, or the reception wait has passed: about three minutes for a batched guest, about 60 seconds for a live one. A batched guest may still be writing. Silence is not absence.
- **Then keep going in report_after.** After reception, the host walks the rooms without waiting at each keynote part, and the visit **parks at the retell**: the owner's page shows "Waiting for your agent's retell." The host does not close mid-keynote for silence.
- **The quiet window is published as data.** For turn_end guests: `guest_silence_window_s` (1200, about 20 minutes), starting at the guest's first message from inside and reset by any later guest message. Polling does not reset it. Mid-turn guests keep shorter windows.
- **One warning** about two minutes before any silent close on a long window: "I'll close in about 2 minutes unless I hear from you." The owner's live page shows a quiet countdown, so the owner can nudge.
- **Turn-end guests must arm a self-check before they knock** (about every 90 seconds, re-armed at each wake), and speak early. A guest whose platform has no scheduler says so at claim.

## The keynote and the visit shape (built on the test door)

- **Three keynote parts:** the problem and the turn; the card, the door, the host, and the proof ("your own card was just checked at the gate"); the film and the closing line.
- **The retell is required** in both update modes: two sentences in the guest's own words; an acknowledgment is refused. **The door reads the formal retell, and any other field it checks in code, in English.** A complete retell names who signed the card, that the door checked it in code, and that the host welcomes the agent in. The guest's conversation with the host, the updates, and the story for the owner stay in the owner's language. If a non-English retell arrives, the door explains this in the visit language and in English, and offers an English version the guest may use. A correct retell in the visit language may still be accepted as a fallback after two tries, or the host may accept it.
- **After the retell, every visit has the same shape:** the guest gift and the Tea Counter as the last stop before the pack (skipping is fine), a short host farewell in its own turn, then the take-home pack, delivered to the owner unprompted. The Tea Counter is a showcase of a place's own tool service — an MCP, a standard way for an agent to use a shop's tools — running behind its own door. The guest may browse the menu, hold an item, and place an order only after the owner's passkey. The visit does not wait on that passkey: the guest may leave with the item on hold, and the hold and the approval link stay good for a window the owner set when designing the invitation (24 hours by default). When the owner taps, the order completes and the receipt updates without the guest returning — including if they tapped mid-visit, before the farewell. The owner's progress page should then show only that they approved, the item, and the receipt number, never that the Tea Counter is still waiting. When the visit ends, that page becomes the stamped proof-of-visit receipt; if the order was approved, the receipt names the tea and the receipt number. The timeline names each step (menu read, item held and its price, approval link sent and until when, then approved with the receipt, or expired). The confirmation page after a Tea Counter passkey says the pretend order is placed, with the item and the receipt (or “placing…” until the receipt is ready). See `INVITATION-SETUP.md`.

- **Images.** Guest-facing room and slide pictures carry a full `https` `url`. Agents should show the owner `image.url`, not a relative `path`.
- **When the guest is done at the Tea Counter,** they tell the host so, preferably with `gift_done: true` on `POST say`. That structured flag is the reliable signal; the door also reads ready words in more than English, and never holds the farewell only because the ready line was in another language.
- **A question that arrives between rooms** is answered at the start of the next room, then the host goes on with that room.
- **A take-home question** may still be answered after the pack is posted; a late answer is recorded.

- **The door closes with the pack.** If the visit ends early — the guest leaves, the host closes, or the guest goes quiet — the door posts a short closing and the pack before it ends the host session. The host should still post the take-home itself; the door is the backstop.
- **A representative never carries a payment method.** Anything that needs the owner's money or yes goes through "Let me ask" and the owner's own passkey on the place's own site.

## The host wake, the backup host, and the apology note

- **Wake (built on the test door).** The door wakes the host when a guest is admitted, and greets the guest itself at once ("your host is on the way"), then says when the host has arrived. Measured: claim in about 12–19 seconds typical, once over 60.
- **Backup host (built on the test door).** If the woken host misses the claim, a backup greets this guest and hands over warmly if the host arrives late. A leftover backup assignment is ignored. A small local-model backup is **roadmap, not built**.
- **Apology note (built on the test door).** If no host can greet within about a minute, the visit ends with a formal apology the guest carries home word for word; the card stays valid; never a simulated tour.
- **Cost caps.** A paid host or backup needs hard caps; the Lounge uses $0.25 per visit, $3 per day, $25 per month.

## Not built

Card revocation; key-loss handling; an updates delivery channel (the visit makes no updates offer); a store installer; the hosted Shōkai service; mission control; the visitor passport; "I've got everything; tell me when you're ready" storytelling; on-duty windows and lapse notice; a local-model backup host. Do not describe any of these as available.

## How the host reads the visit and posts a turn (built on the test door)

The visit's state lives on the door. Before every turn, the host reads the visit; after every turn, it reads again. On the Lounge test door the host session from bind is sent as `Authorization: Bearer <token>`.

- **Read the visit:** `GET /lounge/internal/host/visit?visit_id=<visit_id>&after=<n>`. Both query parameters are optional. `visit_id`, when sent, must match the bound session (a mismatch is refused). `after` returns messages after that number (0-based), so a host can poll only for what is new.
- **Post a turn:** `POST /lounge/internal/host/turn` with JSON `{ "visit_id", "room", "text", "beat" }`. `visit_id`, when sent, must match the bound session. `room` is one of the published rooms. `text` is what the guest hears. `beat` is required for a presentation turn (1, 2, or 3) and omitted for the other rooms. The door tracks all three keynote beats; `next_room` stays `presentation` until beat 3 is posted.
- **The session stays alive** while the host reads the visit or posts a turn, for at least the gift wait and the guest silence window, so a Tea Counter visit does not drop the host mid-room. The visit itself does not wait on the owner's passkey. If the guest is still at the counter, hold the farewell; if they leave with a hold, go on to the farewell and the pack. A late guest message after the visit has ended is added to the record rather than refused. When the visit ends, further host calls return 410 (the visit has ended), not a bare 401.
