# Watch-film alignment with Shōkai 0.5

Short change list for the two homepage Watch films (Lanternmoss part one, visitor part two). Written before re-render. Event-stream types stay the demo's existing names (`arrival`, `leaflet`, `card_checked`, `pass`, …); only their wording, decisions, and order were aligned with 0.5. No vouching, introducer, or Gatherings. Fictional people and places only.

## Narration and captions

| Id | Old line | New line | Why |
| --- | --- | --- | --- |
| d1s4-06 | Every agent arrives introduced: who sent it, why it came, and what it may do. | Every agent arrives with a visitor card its owner signed: who sent it, why it came, and what it may do. | “Introduced” reads as vouching. 0.5 and the homepage use the visitor card for who sent it, why it came, and what it may do. The rest of the line is unchanged. |
| d1s-15 | …and sends Wren, Jun's agent. | …and sends Wren, Jun's agent representative. | First mention of the visitor uses “agent representative”. |
| d1s4-18 | Wren arrives. The door can't tell who sent it, so it's turned away politely, with a leaflet. You don't have to do a thing. | Wren arrives without a visitor card. The door hands it a leaflet: not a rejection, an ask to return prepared. You don't have to do a thing. | A cardless knock gets the door's leaflet (`not_now`), not a rejection. |
| d1s6-20 | The door checks Jun's signature, and what Wren may do. | The door checks Wren's visitor card and Jun's signature, and the place shows its host card. Wren steps into the entryway; it isn't admitted yet. | Identity check is visitor card plus possession proof; the place shows its host card every visit; the entryway is not yet admission. |
| d1-07b | Now the door knows who it's here for, and Wren is admitted with a pass. | Suzu welcomes Wren, Wren says why it came and what Jun signed, and the door admits it with a pass. | After the entryway: host welcome, purpose plus the owner's signed limits (mandate), then the door decides and the pass is true admission. |
| d1s7-24b | With Shōkai, every agent at your door arrives introduced: who sent it, what it may do, and for how long. | With Shōkai, every agent at your door arrives with a visitor card its owner signed: who sent it, what it may do, and for how long. | Same visitor-card wording as d1s4-06. |
| d2-01 | You send your agent for a $20 gift card, for your sister. | You send your agent representative for a $20 gift card, for your sister. | First mention in part two. |
| d2-02 | It has no Shōkai visitor card yet. The door can't tell who sent it, so it's turned away politely, with a leaflet. | It has no Shōkai visitor card yet. The door hands it a leaflet: not a rejection, an ask to return prepared. | Same leaflet rule as d1s4-18. |
| d2-03 | You give it a one-day Shōkai visitor card, with a $20 limit. | You give it a one-day Shōkai visitor card, and a mandate with a $20 limit. | The visitor card is not the mandate. The spending limit is on the owner's signed mandate. |
| d2-04 | It comes back with your Shōkai visitor card. Now it's your representative agent, and it's admitted with a pass. | It comes back with your visitor card. The door checks it and shows the place's host card. Suzu welcomes it, it says why it came and what you signed, and the door admits it with a pass. | Visit order: check who is there, host card, welcome, why it came plus mandate, then the pass. “Agent representative”, not “representative agent”. |

Unchanged on purpose: d2-06c (“Only you can approve it…”) is the owner's authority over a hold, not a marketing “only/first” claim. Gift-card “card” wording stays. Scene 6 on-screen tags “who / why / what” stay. Meaning-of-Shōkai / 紹介 elsewhere stays.

## Step titles

| Film | Old | New | Why |
| --- | --- | --- | --- |
| Part one, step 18 | Turned away | The leaflet | The leaflet is not a turn-away. |
| Part two, step 2 | Turn away | The leaflet | Same. |

## Event stream (ask text, decisions, order)

| Film / step | Old | New | Why |
| --- | --- | --- | --- |
| Part one, 18 `arrival` | who sent you? · no introduction | no visitor card | The first knock has no visitor card, not a missing introduction. |
| Part one, 18 `leaflet` | turned away politely · leaflet + return code | not now · leaflet · return prepared (`decision: not_now`) | Leaflet + `not_now`. A `return_code` belongs to an outside-the-setup ask (§7.5), not to a cardless leaflet. |
| Part one, 20 `card_checked` | Jun's Shōkai visitor card + return code … links the first knock | visitor card + possession proof (note: signed by Jun · one day · purchase up to $40) | 0.5 checks the visitor card and that the representative holds the key. No invented return-code continuity on this path. |
| Part one, 20 `pass` | corners 1–3 · gift cards · ask / admitted with a pass | pass · policy ∩ mandate ∩ request / admitted with a pass | The pass is the intersection of house policy, the mandate, and the request. |
| Part two, 2 `arrival` | no Shōkai visitor card (`not_now`) | no visitor card (`not_now`) | Same wording. |
| Part two, 2 `leaflet` | leaflet + return code | not now · leaflet · return prepared (`not_now`) | Same leaflet rule. |
| Part two, 3 `signing_opened` | become your representative agent? | become your agent representative? | Preferred order. |
| Part two, 4 `card_checked` | your Shōkai visitor card + return code | your visitor card + possession proof | Same as part one. |
| Part two, 4 `continuity` | return code links the first knock | *(removed)* | Continuity-by-return-code on a cardless leaflet is not 0.5. Leaflet unbadge now happens on `card_checked`. |
| Part two, 4 `pass` | room story, gift cards / admitted with a pass | pass · policy ∩ mandate ∩ request / admitted with a pass | Same as part one. |

## On-screen labels and story cues

- Step 6 figure label: “representative agent” → “agent representative”.
- Leaflet beat cue: phrase “turned away” → “leaflet”.
- Return-visit cues: “and what wren” → “host card”; “now the door knows” → “suzu welcomes”; “and wren is admitted” → “admits it with a pass”.
- Demo-2 diagram leaflet verdict: “turned away with a leaflet” → “leaflet: return prepared”.
- Demo-2 `card_checked` unbadges the leaflet (replaces the removed `continuity` beat).

## Event-stream legibility (both films)

Near-white / pale mint type on a solid dark terminal panel, larger monospace and looser line-height, current line highlighted, older lines kept readable (no heavy fade), matrix rain kept only as a faint layer behind the panel (the text area is opaque), step headers bright. Record mode uses the same readable size.

## What was not invented

No new wire types. No return-code continuity for a leaflet. No shared reputation score. The door's local record stays the existing `owner_view` / `report_home` lines. Outside-the-setup party question is already 0.5 §7.5, not a demo-only feature.


## Narration regeneration

Ten lines were regenerated with ElevenLabs voice Monique (`gYGXjks6FzTWwNQ6X7hC`), model `eleven_multilingual_v2` (same as the existing Watch voice). Music remains “A World in Your Hands” (YSY, CC BY 4.0); a new seamless edit of that same track (`theme-extended-296s.mp3`, 296.112 s) covers the longer part-one timeline (286.97 s). Credits are unchanged.

| Id | Characters / credits | Price |
| --- | --- | --- |
| d1s4-06 | 218 | $0.0436 |
| d1s-15 | 84 | $0.0168 |
| d1s4-18 | 139 | $0.0278 |
| d1s6-20 | 144 | $0.0288 |
| d1-07b | 98 | $0.0196 |
| d1s7-24b | 130 | $0.0260 |
| d2-01 | 72 | $0.0144 |
| d2-02 | 107 | $0.0214 |
| d2-03 | 74 | $0.0148 |
| d2-04 | 184 | $0.0368 |
| **Total** | **1,250 credits** | **about $0.25 USD** |

No caption/voice mismatch: served mp3s were loudnorm-stripped to −18 LUFS and `LINES.ms` was updated from the served files.

## Follow-up (2026-11-10)

The 0.5 wording above was recorded, then a further pass aligned mandate expiry, “your agent comes back to you,” the cinematic part-two film, the story stills, and the “How it works, step by step” page.

### What was wrong with part two on the live story page

The story and Watch-the-implementation pages still described the long cinematic demo 2 (Ines / Atom, reservation for mom, about 4:20). The file at `public/story/demos/demo2.mp4` had been replaced, in the earlier 0.5 re-render, with the short M7 Watch compositor film (generic “you,” 8 steps, **66.445 s / about 1:06**). That film does include its own report-home / $40 gift-card ending; it was the wrong film for the page, not a truncated Ines/Atom script. The complete cinematic ending is Atom coming home with the signed reservation (tea for two). The “note to your sister” beat belongs to part one (and to the short Watch film), not to the long part-two story.

Fix: re-render `demo2-host` (0.5 wording, readable terminal CSS already shared from demo1-host) and copy that MP4 to the site. The short M7 Watch film was re-recorded for tests only and was **not** copied onto the site.

### Further wording (mandate for today; “your agent”)

“One day” / “for today” belongs on the mandate, not on the visitor card. Card expiry is set by the owner (in the films: Ines’s card is valid seven days as she set; Jun’s on-screen card no longer says “Valid one day”).

Short Watch part two (and matching event-stream / diagram lines):

| Id | Previous 0.5 line | New line |
| --- | --- | --- |
| d2-02 | It has no Shōkai visitor card yet. The door hands it a leaflet: not a rejection, an ask to return prepared. | Your agent has no Shōkai visitor card yet. The door hands it a leaflet: not a rejection, an ask to return prepared. |
| d2-03 | You give it a one-day Shōkai visitor card, and a mandate with a $20 limit. | You give it a Shōkai visitor card, and a mandate for today with a $20 limit. |
| d2-04 | It comes back with your visitor card. The door checks it and shows the place’s host card. Suzu welcomes it, it says why it came and what you signed, and the door admits it with a pass. | Your agent comes back with your visitor card. The door checks it and shows the place’s host card. Suzu welcomes it, it says why it came and what you signed, and the door admits it with a pass. |
| d2-06b | It holds it and comes back to you. | Your agent holds it and comes back to you. |
| d2-08 | It comes back to you with the gift card and a note to your sister. | Your agent comes back to you with the gift card and a note to your sister. |

Cinematic part two, five lines re-recorded (leaflet is not a rejection; “your agent explains”; “agent representative”; return visit shows the host card and admits at the pass; close uses visitor-card language): d2s4-05, d2s4-06, d2s4-07, d2s4-13, d2s4-24.

Jun’s story-page visitor card now shows Why and Mandate “for today · gift cards, up to $40”, with no “Valid one day” row.

### Films, stills, and the step-by-step page

- Cinematic demo 1: **286.97 s** (4:47), unchanged duration; re-rendered so the visitor-card visual matches. Site file: `public/story/demos/demo1.mp4`.
- Cinematic demo 2: **259.40 s** (4:19), was 260.04 s on the last complete Ines/Atom render, and 66.445 s when the wrong file was on the site. Site file: `public/story/demos/demo2.mp4` (from `demo2-host/screens/demo2-v3.mp4`).
- Short M7 Watch demo 2 (tests only): **68.36 s** (was 66.445 s). Not on the site.
- Story stills: all **31** webp files replaced from the new films (12 part-one `d1-*`, 19 part-two `d2-*` including the title poster), filenames kept.
- `/docs/step-by-step` aligned with the films, the story page, and 0.5: visitor-card language, the approved 8-step visit (admission at the pass), host card shown at every visit with a fresh proof, leaflet for agents without a card, “one day / for today” on the mandate not the card, “your agent comes back to you,” “agent representative.” The wire message type `introduction` is kept and distinguished from the visitor card. No unbuilt features.

### Narration cost (this follow-up only)

Voice Monique (`gYGXjks6FzTWwNQ6X7hC`), `eleven_multilingual_v2`, one take each, served copies stripped to −18 LUFS.

| Set | Credits | Price |
| --- | ---: | ---: |
| Cinematic d2s4-05, 06, 07, 13, 24 | 727 | $0.1454 |
| Short-film d2-02, 03, 04, 06b, 08 | 544 | $0.1088 |
| **Total this follow-up** | **1,271** | **about $0.254** |

Earlier 0.5 Watch takes in the table above were 1,250 credits / about $0.25. Combined new speech for 0.5 alignment: 2,521 credits / about $0.50.

### Leaflet stream wording, and the diagrams page (0.5 audit)

Cinematic part two, step 6 event stream: the report-home line no longer quotes the November 3 lobby one-liner (“properly introduced: a Shōkai visitor card”). It now reads `the leaflet · "needs a Shōkai visitor card signed by their owner" · onboarding_url → Shōkai start`, matching the current 0.5 leaflet’s visitor-card requirement (`LEAFLET_SHARED`: agents that carry a Shōkai visitor card signed by their owner). The historical `about.text` in the recorded run is unchanged. The wire message type `introduction` is still shown as a protocol message name where it appears. No other film, still, or `story.js` line used “introduced” / “introduction” to mean the visitor card. Official leaflet opening copy (“You simply haven’t been introduced yet”) is locked shared leaflet text and was not rewritten.

- Cinematic demo 2 re-recorded only: **259.40 s** (4:19), `demo2-host/screens/demo2-v4.mp4`, copied to `public/story/demos/demo2.mp4`. Narration unchanged (no new ElevenLabs takes). The short M7 Watch film was not copied onto the site.
- Story stills: all **19** part-two webp files (`d2-*`, including the title poster) replaced from the new film, filenames kept. Part-one stills were not affected.

`/docs/diagrams` was audited against Shōkai 0.5 (`SPEC.md`, `SPEC-DETAIL.md`) and the approved homepage 8 steps. Mermaid in the 0.5-preview README, site `diagrams/src` and SVG (plus tall variants), and a site-owned `pages/docs/diagrams.md` now carry visitor-card language, pass vs wire `seat`, the §3.2 message order (host-card fetch and house summary, audience-bound proofs both ways, `introduction` as the later wire message, `act_held` / superseding mandate), §2.4 check order and failure branches (`never` only for misconduct; LobbyBriefing as recoverable `not_now`; a broken digest is dropped, not the leaflet), and that the owner’s passkey stays with the owner, not on an agent server (`docs/security.md`). Four invitation_response decisions (`grant`, `conditional`, `deny`, `considering`) are kept, as in SPEC-DETAIL §6.1. Related twins `docs/diagrams/src/thirty-seconds.mmd` and `arrival-sequence.mmd` (and their SVG/PNG) were updated the same way. No dark variants of these diagrams existed.
