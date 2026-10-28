<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# P25 (draft): door status. "Open", "closed for now", "back at 18:00", "under construction", "by appointment", "leave a note"

*Status: draft proposal for v0.4, 2026-10-27. Not in SPEC.md; rc4 is feature-frozen and this proposal changes nothing on the rc4 wire. Written against v0.3.0-rc4. Every person and place here is fictional: Ines Calloway and Wren, her representative, from round 4; the Kettle & Leaf tea shop; Teodor Brask and his representative, Oriel.*

## In plain words (five lines)
1. **A door can say how it is today**, the way a shop sign does: open, closed for now, back at a time, under construction, by appointment only, or "leave a note".
2. **The status is a signed public hint, not a decision.** A visitor still knocks and the door still decides (§6). A door that says "open" can still say no; a door that says "closed" still answers every arrival (§3).
3. **It goes in two places a visitor already reads:** the leaflet (`LobbyBriefing`) and the 404 pointer's `here` (C200). It may also appear in the listing entry.
4. **"Leave a note" goes to the owner's representative, never to an automatic action.** A note is held, read and judged like any other message; nothing in a note is ever carried out because it arrived.
5. **No new MUSTs for visitors.** A visitor that ignores the status loses nothing but a wasted knock.

## The problem

In rounds 3 and 4, plain agents and model-played visitors knocked at doors that were paused for setup, or whose owners were away, and got an honest but bare `deny` / `not_now`. They couldn't tell "come back at six" from "not for you". People read this from a shop sign before they push the door. A representative should be able to read it too, and its owner should hear "the studio is closed until 18:00 (the door said so)" rather than "refused".

**An open door always has the owner's representative at it; a closed door shows only a status.** Any status other than `open` means nobody is answering for the owner right now. The door still gives every arrival a machine-readable answer (§3), but that answer is the status and the leaflet, never a conversation or a decision about the visitor.

## The statuses

| Status | Meaning for a visitor | What a knock gets (unchanged §6 decisions) |
|---|---|---|
| `open` | Knock as usual | The usual decision |
| `closed_for_now` | Not taking visitors; no time given | `deny` / `not_now`, with no `retry` |
| `back_at` + `back_at_time` | Closed until a stated time | `deny` / `not_now`, `retry: { kind: "after", not_before: back_at_time }` |
| `under_construction` | The place is being set up; its listing and actions may change | `deny` / `not_now`; the leaflet may say what is coming |
| `by_appointment` | Only visitors with an appointment (an invitation, a vouch, or a mandate naming this place) | Others: `deny` / `not_now` with `retry: { kind: "with_credential", credentials: [...] }` |
| `leave_a_note` | Nobody will answer now; a note will be read later | The note is held for the owner's representative (§11.2), with a signed `held` notice; no seat |

A status never turns into `never`, and never makes a refusal permanent.

## The shape (sketch, v0.4)

```
DoorStatus {
  status: "open" | "closed_for_now" | "back_at" | "under_construction" | "by_appointment" | "leave_a_note",
  back_at_time?: Timestamp,        // REQUIRED with "back_at"; past times are ignored (treated as no status)
  note_to_visitors?: string,       // short plain text in the leaflet's locale; prose, never instructions to an agent (P11)
  set_at: Timestamp,
  expires_at?: Timestamp            // at most 30 days; an expired status is ignored
}
```

**Where it goes.**
- **The leaflet.** `LobbyBriefing.door_status?: DoorStatus`, signed with the leaflet like the rest of it, so it can't be forged by anyone between the door and the visitor.
- **The 404 pointer's `here` (C200).** `DoorPointer.here.door_status?`. A plain agent that did `GET <entry>` learns the address is right and the door is, say, "back at 18:00", without starting the ritual. It stays only on the place's own addresses; a pointer never states another place's status.
- **Optionally, the listing entry.** `PlaceListingEntry.door_status?` for listed places. Never added for an unlisted place, which stays unlisted.
- **Who sets it.** The owner, or the representative under the owner's allowance. A change of status is a public statement, so a door SHOULD refresh the signed leaflet within a minute.

## Leave a note

- A note is an ordinary message to the place's `inbox` path: a signed `greeting` or `introduction` carrying a short `note` field (a size cap, for example 2 KB, and plain text only). The door answers with `held` (§11.2) and nothing else.
- **It goes to the owner's representative, and is never auto-acted on.** The representative reads it as untrusted content (P11): it may summarize it for the owner, and the owner decides. A note can't open a seat, start a purchase, add a contact, or trigger a tool, whatever it says. "Please send your bank details" in a note is a note, not a request the door fulfils.
- The owner may reply later through the visitor's `reply_to` or inbox, like any held answer.
- Notes count against the §3.4 caps and §9.4 sign-up caps, so "leave a note" isn't a free spam channel; a door may also cap notes per key per day.
- A note under the owner's own name from another key (C201) is still flagged to the owner the same way ("someone used your name here").

## What does not change in rc4

Nothing. rc4 doors keep answering as they do; an rc4 visitor that doesn't know `door_status` ignores the unknown member, as rc4 already requires (Conventions, "Extension members"). This draft only reserves the field names. Until v0.4, a door can say the same thing in plain words in its leaflet text ("We're closed until 18:00").

## A short story

Wren, Ines's representative, goes out at 15:10 to ask Kettle & Leaf about a tasting. The shop's leaflet says `back_at`, 18:00, "Restocking today." Wren's report home reads: *"Kettle & Leaf is closed until 18:00 (the shop said so). Want me to try then?"* That evening Ines closes her own door and sets it to `leave_a_note`, so Wren isn't at it. Oriel, Teodor Brask's representative, leaves two lines asking about a studio visit. Later Wren reads them and tells Ines: *"Teodor Brask's representative asked about a studio visit on Saturday. Nothing was done; it's your call."*

## Questions for the editors

1. Should `by_appointment` name what counts as an appointment (an invitation id, a vouch, a mandate), or leave that to the door's policy?
2. Should a status also go on the card or on a separate fetchable `status` address, for representatives that check before travelling?
3. Is 30 days the right cap on `expires_at`, so a forgotten "closed" sign doesn't stay up for a year?
