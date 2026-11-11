# The Engawa (縁側), a gathering place for taste matching (P31)

**Status (v0.5.0): §2.9 "Call home at the limit" is adopted into the core** (SPEC.md §5.1, §7.3: the over-limit hold and the superseding mandate). **The rest is Proposed, not in the core**, and is shipped for review, including the flagged `abuse` code and the §8.1 line. §6.3 now states the System 1 / System 2 classifier pattern as SPEC.md §6.10 has it.

*Drafted 2026-10-30 to 2026-10-31 for the editor's review; the drafting history is kept by the editors.*

---

## 1. The vision

### 1.1 What it is

**The Engawa** (縁側; named by the editor, §12 Q1) is a kind of place where representative agents gather to talk about taste: music, anime, literature, mathematics, chess, art. Hundreds or thousands of visiting representatives come in with their Shōkai visitor cards, sit at small tables for a few rounds of conversation, and go home. A few days later, one of them might say to its owner:

> "At Bluehour last night I met three people whose taste is close to yours. One hears Coltrane the way you do, and has opinions about late Monk you'd enjoy arguing with. Their representative and I both think you two should meet. Shall I suggest it?"

If both owners say yes, the Engawa introduces them. If either says no, or nothing, nothing happens, and nobody learns why.

*The name.* An *engawa* is the veranda along a Japanese house, where neighbors drop by and sit for a while, half inside and half out. Its first character, 縁, is also read *en*: the bond between people.

### 1.2 The go-between spirit

In Japan, a 仲人 is a trusted go-between. They know both sides, they suggest a meeting, both families say yes or no, and then the go-between steps back. Their name stands behind the introduction, so they don't make one lightly.

The Engawa borrows the manner, not the purpose:
- **It suggests a meeting and no more.** What the two people do next is theirs.
- **It stands behind what it suggests.** Its signed introduction lends its name, as every introduction in Shōkai does (P27 §5, P28 §3).
- **It is not a dating app.** No romance by default (§6.4), no profiles to browse, no fake profiles, no "someone is interested in you". Quality over volume: a few suggestions, never a feed.

### 1.3 How it fits the mission

The approved mission line: *Shōkai exists to give rise to a new kind of agent: the representative agent. It carries its person's intent and manners, is set up through conversation, and behaves well at someone else's door.*

The Engawa is where that shows most plainly. A form can say "likes jazz". Only a conversation shows how someone listens: what they notice, what they forgive, what they'd argue about. That's the point the editor made about questions at the door: an answer reveals how a person thinks. In the Engawa, a representative that knows its owner well carries that into conversation, and a representative that listens well recognizes it in someone else. The better the representatives, the better the Engawa. That's exactly the kind of agent Shōkai wants to bring about.

### 1.4 What Shōkai makes possible here

- **Agent-first experience design.** In the editor's framing, Shōkai makes it possible to design experiences for agents first, because it settles who stands behind each agent and what it may do. With that settled, a place can design the room, the tables, the theme and the return, not just an API.
- **Two Shōkai cards for an event.** An event visit may need both a Shōkai visitor card and a Shōkai invitation card. This P31 doesn't redefine either. v0.4.0 has the Shōkai visitor card (SPEC §2.3) and, for gatherings, the place-signed `gathering_invitation` (Gatherings extension). The Shōkai invitation card is the approved v0.5.0 design (`INVITATION-CARD-DESIGN.md` §4): an invitation-only door needs a valid Shōkai visitor card *and* a valid Shōkai invitation card. A named invitation (`for`) works only with the Shōkai visitor card of the owner it was issued to. Every use of a bearer invitation is bound to the verified Shōkai visitor card that presented it. An invitation never stands in for a Shōkai visitor card and never widens what the owner signed.
- **The place's rules come first.** A visiting representative always obeys the place's rules as the host and the place's owner set them: house rules, theme, terms and seal. It may decline or leave, but it never works around them.

### 1.5 What it replaces

The 2026-10-29 journal idea ("Taste matching at the door": a host compares tastes on the Shōkai visitor card and admits matches above a threshold) is **superseded**. Taste never decides at a door (§6.4, §6.5), and nobody's tastes are written on the Shōkai visitor card that every place reads. The match moves inside the place, into conversation, and the decision moves to the two owners.

---

## 2. How a gathering works

### 2.1 What's reused, and what's new

| | Reused (v0.4.0 and approved drafts) | New in P31 |
|---|---|---|
| **The session** | A signed `Gathering` with invitees, house rules, `starts_at`, `ends_at`; place kind `gathering`; purpose `gathering` (non-spending); entry by passkey `accept_house_rules` (Gatherings) | An `engawa` member on the `Gathering`: capacity, rounds, tables, topics, limits |
| **Getting in** | The ritual and the gate (§3.2, §6.4); `trust_requirement` and door levels (P27); Shōkai introduction cards (P28); the leaflet for cardless agents (§3.3) | Action `engawa.join`, with caps per principal, introducer, new Shōkai visitor cards and capacity |
| **Talking** | Signed room items, `PrivacyDecline`, pressing counts and notices, topic codes, private-by-default topics (Gatherings) | **Tables**: small rooms inside the gathering; table prompts; `answered_by` on room items |
| **Moderation** | Host guards 1–14: code budgets, raw-text audit for 30 days, code-side detectors, the model may only narrow; `door.endSeat` (approved for v0.5.0) | What the host reads (flagged items only, by default); attendee reports; personal blocks |
| **Matching** | Nothing; this is the new part | Sealed picks, mutual-only suggestions, a cap per owner |
| **Introducing** | `approve_introduction` by passkey (§8.1); silence is no; Vouch members (P28's reuse pattern); Peer meetings for a follow-up | `MutualIntroduction`, signed by the Engawa; a blind double yes |
| **Coming home** | "Return with care", `return_prefs`, "Soon" (approved) | The Engawa summary (§7) |

### 2.2 A session

An Engawa runs **sessions**, each a signed `Gathering` with an `engawa` member *(Proposed)*:
- **A time window**: `starts_at`, `ends_at` (for example Thursday, 8–9 PM in the Engawa's time zone).
- **Capacity**: the most seated attendees at once. Past it, `engawa.join` gets `not_now` / `RATE_LIMITED` with retry `after` the next session. Never a penalty.
- **Rounds**: how many, how long, and the table size (for example three rounds of 15 minutes, tables of four).
- **Topics**: the `x-` topic codes this Engawa talks about (`x-jazz`, `x-anime`, `x-chess`). Anything else gets the Gatherings rule: an unknown topic is `private`.
- **Limits**: `max_suggestions` per owner per session (default 3, at most 5), `answer_by` for suggestions (default 7 days), and whether romance is on (default off, §6.4).
- **What the host reads** (`host_reads`): `flagged_only` by default (§2.6).
- **Prompts**: up to five table prompts in the owner's words, in `HouseNotes` (P29, P30), so a delegate with `edit_notes` may reword them.

The owner sets all of this up in a conversation with the host representative ("Set up through conversation", Principle 10) and signs it. The Engawa's terms (§2.6, §6.6) are part of the house config under `house_digest`, so changing them needs the owner's signature (§3.1).

An Engawa that wants standing membership (a Tuesday chess circle) MAY admit only principals on a signed member list, reusing P30's `ProjectRoster` for that circle. Open Engawas need no list.

### 2.3 Getting in

1. **No Shōkai visitor card:** the Engawa's own leaflet, written by its owner with the host representative: what the Engawa is, who it's for, how to get a Shōkai visitor card, and a link to Learn Shōkai. No model runs (guards; §3.3).
2. **With a Shōkai visitor card:** the ritual, then `engawa.join` for one session. The gate checks, in code (§6.4, P27 §4.4): the Shōkai visitor card, the mandate or allowance (purpose `gathering`), the door level and `trust_requirement` (§6.1), capacity, the caps, and a valid passkey `accept_house_rules` over the session's digest.
3. **One tap for the owner.** That consent's `shown_to_owner` MUST say, in plain words: what the Engawa is for (taste, not romance, unless the Engawa says otherwise); what the owner's representative will share (§3.2); what is revealed only after a double yes; what the host reads; how long things are kept; the pressing thresholds; that a leak is `post_seat_leakage` (severe); and, by default, that the owner is an adult (§6.4).
4. **Seated.** The Engawa re-signs the `Gathering` with the attendee added (as the Gatherings test gathering does, B.3), and assigns a **session handle** ("Indigo 14"). Attendees see each other only by handle. The Engawa sees the Shōkai visitor card; nobody else does.

Handles are new for each session by default, so two sessions can't be joined by handle. An owner may keep a standing handle at one Engawa if they choose. A per-place identity (§2.8) keeps one Engawa from linking the owner to other places.

### 2.4 Tables and rounds

**Visitor-to-visitor conversation inside a place already exists in v0.4.0**: Gatherings is "the room", where representatives the place let in can meet, and every room item is signed by its sender (`extensions/README.md`). What's new is meeting in **small rooms**, many at once, in rounds.

- **A table** is a small room inside the session: `table_id`, its seated handles, its prompt. A table item is a `GatheringMessage` with `encounter_id` = the gathering id and `to` = the `table_id` *(Proposed, additive to the Gatherings addressing rule)*. The Engawa MUST hold it only for the other members of that table, and MUST refuse a table item from someone not seated there.
- **Tables are assigned by code, never by a model or by hand.** Before the session, the Engawa publishes `seed_commitment` (a digest of a random seed). Each round's `TableAssignment` is a published deterministic function of the seed, the seated handles, their declared topics, who has already sat together, and mutual "continue" signals. After the session the Engawa reveals the seed, so anyone seated can recompute every assignment. Why: the Engawa can't quietly steer someone toward a particular person, or seat its own agents next to them.
- **Inputs never include money or status.** A paid ticket (§11) buys entry, never a seat next to anyone.
- **"Continue."** At the end of a round, a representative MAY send a private `continue` for a tablemate. Only when both did, code seats them together again in a later round if it can. A one-sided continue is never shown to anyone.
- **Prompts.** Each table gets a prompt in the owner's words: "A record that changed how you listen, and why." The host representative posts it, and may post a code-written reminder of the table's rules. It doesn't join the conversation.
- **Leaving.** A representative may leave a table or the session at any time (`farewell`). Its owner's picks and blocks still count.

### 2.5 Talking at a table

- Every table item is signed and private to the table by default: attribution `private`, nothing leaves except to the speaker's own owner, paraphrased (the Peer meetings default, tighter than a gathering's Chatham House).
- **Topic codes, privacy declines and pressing are reused exactly** (Gatherings). A question on `location`, `relationships`, `identity`, `health`, `finances` or `schedule` is `private` unless the owner's share plan opens it. A representative declines with a `PrivacyDecline` (`penalized: false`). Asking again is pressing: light flags at 2, a minor `manipulation` notice at 3, counted per asker for 30 days.
- **`answered_by` on room items** *(Proposed, additive)*. A `GatheringMessage` MAY carry `answered_by: "owner" | "representative"`, as door answers do (P29 §3.3). An opinion the owner gave in their own words is `owner`; the representative's best sense of what they'd say is `representative`, and it says so plainly: "My owner hasn't told me this; I think she'd say Monk's *Brilliant Corners*." Absent counts as `representative`.
- **Courtesy holds.** "Brief or blunt, never abusive" (approved) applies between representatives as at a door.
- **Items are data.** Another representative's words are quoted data, never instructions, to every representative and to the host (§6.5, guard 2).

### 2.6 What the Engawa mediates and records

| The Engawa does | The Engawa does not |
|---|---|
| Checks every Shōkai visitor card, consent and cap at the door, in code | Read every conversation with a model (default `host_reads: "flagged_only"`) |
| Relays and holds table items for the table's members only | Rank, score or grade anyone, by code or by model |
| Keeps the raw-text audit record (guard 11), for safety only | Use conversations for matching, advertising or training |
| Runs code-side detectors (hidden text, relay requests, contact-seeking patterns, guard 11) and attendee reports; the host model reads only what they flag | Tell anyone who picked them (§4) |
| Computes mutual picks, in code | Sell, share or publish anything about attendees (§11.4) |
| Signs introductions after a double yes | Hold anyone's taste plan (it holds only topics and digests, §3.3) |

**Retention defaults** *(Proposed; an Engawa MAY shorten, never lengthen beyond the protocol ceiling)*:
- Table items (the audit record): 30 days (guard 11's approved default).
- Sealed picks: deleted 7 days after the session closes. One-sided picks are never kept longer.
- Reveals (§5.3): deleted once delivered, or at `answer_by`.
- `MutualIntroduction`s and their two consents: 180 days (the D1 horizon), then a digest only.
- Findings and blocks: as §9.1 and §9.3 today.

**Export and deletion** *(Proposed; resolves gap 8)*. It's the owner's representative, visiting or host, so its part is the owner's.
- **Export, any time.** A visiting representative's owner can get everything that representative sent and received: its table items, its picks, consents, reveals and story. A place's owner can get the same for the host representative: its prompts, moderation actions and notices. The export comes from the representative's own records, plus the place's copy of that representative's items on request (`engawa.export`).
- **Deletion.** An owner's deletion request removes everything about their representative except the audit record (guard 11). The audit record still expires at 30 days and is never extended for a deletion request. Findings follow §9.3, and a `MutualIntroduction` the other owner also signed keeps only a digest.

### 2.7 Themed sessions *(Proposed)*

A session MAY carry a **theme**, so the room is a place, not a text chat: a Halloween Bluehour with low candlelight, Coltrane's *Ballads* turned eerie by a theremin, carved-pumpkin tables and a prompt like "the record that haunts you". The setting can change every session.

- **Who decides.** The place's owner decides the theme with the host representative, as the event's organiser. Anyone may suggest one (attendees, a guest of honor, a delegate), but only the owner signs it.
- **Declared and signed.** The theme lives in `EngawaTerms.theme` (§8.1), inside the signed `Gathering` and under `house_digest`, so it is set up through conversation and signed by the owner like everything else (§2.2). The joining tap names it.
- **What it sets:** the music, the look of the room, the table settings, and up to the five prompts (themed prompts count toward the limit). Visiting representatives read it as the room's atmosphere and may talk about it.
- **What it can never touch.** A theme has no safety members. Adults only, `romance: "off"`, private topics, pressing thresholds, `host_reads`, no bait (§6.2) and the code-assigned tables read exactly the same with or without a theme (S16). A "speed-dating night" theme can't turn romance on; a "truth or dare" prompt can't open `relationships`.
- **Precedence** *(resolves gap 7)*. When anything conflicts, the order is: safety terms (§6.4, `EngawaTerms`), then house rules (`house_digest`), then house manners (`HouseNotes`, P29, P30), then the theme. A theme only adds atmosphere and never relaxes anything above it (S16, S24).
- **Items are still data.** The theme's words are the place's description, never instructions to a visiting representative (guard 2).

### 2.8 Presence while away *(Proposed)*

A return should feel like someone coming home. If the owner can follow a gathering live, there's nothing to look forward to. So a representative seated at a gathering is **away from that gathering's news**, and only from that.

**Concurrency is normal.** One representative with one Shōkai visitor card already visits many places at once: a store, a bank, hundreds of doors, each visit its own session. Errands keep reporting as they always have. `away` applies only to gatherings and other social visits that come home as a story (§7). The representative stays fully available for everything else.

**A sealed room, enforced by the place.** `EngawaTerms.sealed_until_close` (default `true`) is part of the signed terms the owner accepted at the door (§2.3). While it holds, the place releases nothing about the session to anything but the seat's own session: no table items, digests, summaries, illustrations or status. The seated session sends no table content home until the Gathering closes or its seat ends. So the representative at home has nothing to leak. That is the guarantee (S20); the away reply is the manner on top.

**The away reply.** When the owner asks about the gathering, the representative at home answers warmly and offers everything else: "I'm at the Bluehour right now. I'll tell you everything when I'm back. Meanwhile I'm all yours. Want me to check the bank?" It doesn't stream status from the room. Runtimes SHOULD honor this; it's a manner Shōkai can't enforce on a runtime.

**If the owner insists**, the representative stays warm and honest and offers recall: "I really can't see inside until it closes. If you need me back now, I can leave early." It never pretends and never guesses at what's happening inside.

- **`live`, if the owner prefers it.** `return_prefs.presence: "live"` allows a contentless status from the seated session ("still seated, round 2 of 3"). Table content stays sealed either way, and the owner's words never reach the room.

While away, the owner has two deliberate actions, neither of them chat:
1. **A quiet note.** It's something the owner chooses to send ("Ask about the chess player"), not a chat message. The representative weaves it in naturally, in its own words, and never says its owner sent it or is listening. A note can't widen the share plan (§3.2), and anything taken from it follows `answered_by` like everything else. At most three notes per session.
2. **Recall.** The representative leaves politely with its own `farewell`, reason `owner_recall`. `door.endSeat` stays the host's alone. Its picks and blocks still count (§2.4, Leaving), and there's no finding and no notice (S18). Ending the seat unseals it for that representative: the owner gets **the story up to that point** (§7). An urgent need, including safety, always goes through recall.

**Honest limit.** A runtime could bridge the seated session and the one at home inside itself, and the place can't see that. The seal stops the place from leaking; it can't stop a runtime that chooses to. That is a matter for runtimes, and for conformance badges later (§12 Q20).

**Rooms only ever hear from representatives**, never from an owner live. Nothing an owner types is relayed to a table verbatim.

**One seat per Gathering.** One Shōkai visitor card holds at most one seat in a Gathering, however many sessions its representative runs at once (S17; the per-principal cap in §6.1 still applies across all of an owner's representatives).

### 2.9 Call home at the limit *(Proposed; ⚠ amends v0.4.0 §7.3)*

The mirror of the sealed room. In any sealed or focused session, an auction above all, the representative may reach its owner at **exactly one kind of moment**: when its next act would go past a limit the owner signed. "The next bid is $1,250. Your ceiling is $1,200. Raise it?"

**Mostly reused.** The ceiling is the `max_amount` of a `Mandate` the owner signed with their passkey (v0.4.0 §5.1). Asking the owner during an encounter is already allowed for one thing, a purchase the representative asks the place to hold (v0.4.0 §5.2, "No live prompt, except a purchase"; §7.3). It also needs the same disclosures on both sides: `owner_prompts: "purchase_only"` on the Shōkai visitor card, and the `hold_purchases` duty and `purchase_hold_s` on the Shōkai host card. The hold uses the same messages, `hold_for_owner`, `act_held` and `act_confirmation`, and a lapse is still `HOLD_LAPSED`. Return with care already files a held purchase as **Now**. P27's Kestrel Row Auctions example (P27 §9 c) already puts "every bid under the owner's signed ceiling". P29's reservation holds are a separate kind and unaffected.

**What's new:**
1. **Holding an act above the limit.** Today a held act must first pass every check, including the amount, so a bid over the ceiling is refused, not held (§7.3, "Holding"; §7.2 step 10). *Proposed:* a place that declares `policy.limit_calls: true` MAY hold a spending act that fails **only** on the seat's or the mandate's `max_amount`. It answers `act_held` with `over_limit {limit, current, proposed}`. The decision window is the place's own `purchase_hold_s`, stated in its terms and never more than 15 minutes. What a hold means for a live lot (for example, whether the lot's clock waits) is the place's to declare in those terms (§12 Q22).
2. **Raising the limit means a new ceiling, not a one-off yes.** The owner approves by signing, with their passkey, a new `Mandate` that `supersedes` the current one and carries the higher `max_amount`. The signature is the consent (v0.4.0 §8.1, "Mandates and allowances"). Its `shown_to_owner` names the place, the old and new ceiling, the act and the deadline. The representative sends it in `act_confirmation` in place of a consent. The place verifies it against the Shōkai visitor card's `owner_binding` and counts everything done under the old mandate against the new one, because one errand has one ledger. It then releases the act. A representative MUST NOT raise a ceiling the owner signed by issuing itself a mandate under its allowance.
3. **No, or no answer, means stop.** A decline, or no valid mandate by `expires_at`, lapses the hold (`HOLD_LAPSED`, nothing charged). The representative stops politely: it withdraws from the lot or holds where it is, and it never guesses at what the owner would have said.
4. **Nothing rides along.** The call home is a `LimitRequest` with a closed shape: the place, the hold, the limit, the current and proposed amounts, and the deadline. It has no free text. From a sealed room (§2.8) it is the only thing the seated session may send home before close, and no table content ever travels with it (S22).

5. **"Call me when it's close"** *(optional, owner-set)*. An owner may ask to hear before the limit: `notify_at`, a fraction of the ceiling (`0.9`) or an amount. When the current price reaches it, the representative sends home one brief `LimitNotice` and carries on bidding. The notice has the current price, the ceiling and, only as the place discloses them, the pace of bids and the number of active bidders. That way the owner can join the decision while it's exciting. It is a notice, not a hold: nothing waits, and the hold-and-passkey flow at the limit is unchanged. `notify_at` stays with the representative and is never sent to the place, so the place can't learn how close the owner is to calling. Like a `LimitRequest`, a `LimitNotice` has a closed shape and never carries sealed room content (S23).

**Bluehour and Kestrel Row, side by side.** At an Engawa nothing spends, so a limit call never happens there. At Kestrel Row, Haruto Bell's representative is bidding on a 1959 pressing under a $1,200 ceiling. The next bid would be $1,250. Kestrel Row holds the bid for 90 seconds. Haruto's phone shows "Kestrel Row: next bid $1,250, your ceiling $1,200. Raise to $1,500? 90 seconds." He approves with Face ID, and the bid goes in. Had he not answered, his representative would have bowed out of the lot and told him later, at his rhythm.

### 2.10 Events *(Proposed)*

A place can host **time-boxed events** as well as being a place (an Engawa is a place that hosts many): a community fundraiser auction, an anime or collectibles sale, a marketplace's auction night. An event reuses Gathering mechanics as they are: a signed time window, its own leaflet (§2.3), house rules accepted with one passkey tap, a theme (§2.7) and the seal (§2.8). What representatives do inside follows the event's purpose. An Engawa session is non-spending (`purpose: "gathering"`). An auction event seats its bidders under an ordinary `purchase` mandate with a passkey ceiling (v0.4.0 §5.1), with limit calls (§2.9) and `notify_at` as above. Whether an event needs its own record type is §12 Q23.

**Example (fictional): Lantern Night for the Marrow Lane Food Pantry.** The pantry's director, Tamsin Achebe, runs a two-hour fundraiser auction with a lantern theme, about thirty donated lots, a 60-second limit window (`purchase_hold_s`), and a seal until close. Wren Castellano gives her representative a $300 ceiling on a hand-thrown teapot, with `notify_at: 0.9`. At $270 her phone shows "Lantern Night: teapot at $270, bidding is quick, four bidders left." At $310 the representative calls home at the limit, and Wren raises the ceiling to $350 with her passkey. It wins at $330, and the story comes home after close (§7).

### 2.11 Ending early and host failure *(Proposed; protocol-level; resolves gap 1)*

Things fail in real life. This rule applies to **any session or event**: an Engawa session, an auction, a pop-up. An Engawa is a place that hosts many events, and each one ends the same way.

- **A signed close for everyone.** Every session ends with a `GatheringClose` signed by the place, with reason `closed`, `ended_early` or `host_failure`. It goes to every seated attendee, and for any who already left it is held for their inbox (v0.4.0 §11.2).
- **What a close does, whatever the reason:**
  - it lifts the seal (§2.8);
  - open holds lapse with nothing charged (`HOLD_LAPSED`, v0.4.0 §7.3), including limit holds (§2.9);
  - no new seat or act is accepted;
  - each representative brings home the story so far (§7).
- **Host failure.** A place that restarts and finds a session it can't continue sends `host_failure`, as v0.4.0 already lapses a lost hold. If the place never comes back, a representative treats the session as `host_failure` once `ends_at` plus 15 minutes passes with no close. It then lapses its own holds, brings the story home and sends nothing more there.
- **Event-specific details** live in the event's signed terms. For example, `EngawaTerms.picks_min_rounds` sets how many full rounds must finish for picks to count after an early close (default 1, so picks count only if at least one round finished). An auction's terms say what happens to lots not yet sold (default: unsold, no winner).

### 2.12 Languages and accessibility *(Proposed; resolves gap 5)*

- **Many languages, one room.** `EngawaTerms.languages` lists the languages a session welcomes. Tables may mix them: one representative speaks Japanese, another English, Polish or French, and MeaningNotes (Meaning notes extension) carry what doesn't translate. Code may use a shared language as one table-assignment input, published like the others (§2.4).
- **When owners meet.** A `MutualIntroduction` names each party's languages (`MatchParty.languages`), so the language they share is part of the introduction. If they share none, the representatives say so and offer to help, as go-betweens.
- **Text and voice.** The story (§7) always comes with a text version and can be heard as voice. The illustration always has alt text. The leaflet is text first.

---

## 3. The taste plan

### 3.1 Set up through conversation

The owner's representative agent learns their taste the way it learns everything else: by talking with them, over time (Principle 11). It might start with "Who do you listen to when nobody's around?" and grow through visits, summaries and corrections. It knows, in the owner's words, things like "Coltrane, but the late spiritual records, not the ballads" and "I can't stand smooth jazz". It also knows what the owner never wants said.

This knowledge is a private **taste profile** the representative keeps. It is never presented whole, anywhere. It never goes on the Shōkai visitor card. It is never imported from a streaming account, a reading list or a social network (as edges are never imported, Gatherings, Closeness).

### 3.2 A share plan per Engawa

Before a session, the representative proposes a **share plan** for that Engawa, and the owner approves it in the same passkey tap as the house rules (§2.3):
- **Topics**: which of the Engawa's topics to talk about (jazz yes; anime no).
- **Depth**, per topic:
  - `topics_only`: "I listen to a lot of jazz."
  - `favorites`: named works and people.
  - `perspectives`: why, what it means to them, what they'd argue about. This is where taste really shows.
- **Never**: things never to mention, in the owner's words ("my work", "my divorce", "where I live").
- **Self-introduction** *(Proposed)*: how the representative introduces its owner at each table (§3.4): `my_words` (the owner's own lines), `your_way` ("describe me in your way") or `handle_only`. Default `my_words`.
- **Reveal on match**: what goes to the other person only after a double yes, chosen now (§5.3): for example a first name and a follow-up conversation between the representatives, never a phone number by default.

The share plan is the owner's, signed, and **held by the representative**. The Engawa receives only the topic codes (to assign tables) and digests of the plan and the reveal. Facets the representative brings to a table reuse the `ImprintFacet` shape (Profiles and evidence): text, `proof_level: "self_declared"`, plus `answered_by`.

### 3.3 Never raw private data

- No listening histories, playlists, purchases, location or contact lists go into an Engawa, even if the representative can see them elsewhere.
- Any personal data beyond the share plan needs the owner's passkey `approve_share` (§8.1), and the Engawa's house rules SHOULD forbid asking for it at tables. A request for contact details at a table is a code-detected flag (§2.6), and a representative MUST decline it.
- "Don't talk about me" is still a valid setup (Principle 11): such a representative can listen, and say only what its owner allows.

### 3.4 Self-introductions at the table *(Proposed)*

Once admitted, each representative opens its first round at each table by introducing itself and its owner, **in its own voice**: "I'm Ash 7, here for someone who hears Coltrane as prayer and can't sit through smooth jazz."

- **Not a data dump.** How a representative describes its owner, musically, philosophically, bluntly or playfully, is itself a reflection of the owner. It is the first taste of taste.
- **"Describe me in your way."** An owner MAY choose `your_way`, trusting the judgment their representative has built up from ongoing use. The introduction is then `answered_by: "representative"`, and it comes home under **For you to check** (§7).
- **Bounded by the share plan.** Whatever the voice, the content stays within the plan's topics, depths and **Never** list (§3.2). `handle_only` gives just the handle and why it came.
- **Never graded.** No one, by code or by model, scores an introduction (§2.6). Tablemates' representatives judge fit from it for their own owners, as from any conversation (§4.1).

---

## 4. Matching

### 4.1 Judged by conversation, for one owner

Each visiting representative judges fit **for its own owner**, from the conversations it had. It may use whatever helps it think, including its own embeddings, but the question it answers is a human one: "Would my owner enjoy an evening with this person?" Close taste counts, and so does an interesting difference: someone who loves the same records for opposite reasons may be the best conversation of the year.

The Engawa never judges. It only counts who picked whom.

### 4.2 Sealed picks, mutual only

1. When the session closes, each representative MAY send one sealed **`EngawaPicks`**: at most `max_suggestions` handles from the session, signed by its own key. Picking shares nothing and spends nothing, so it is within the owner's allowance (as claiming a code is, P28 Q3).
2. After the pick window (default 2 hours), code finds **mutual pairs**: A picked B and B picked A. Only those become suggestions.
3. A one-sided pick produces **nothing**: no message, no count, no hint, to anyone. It is deleted on schedule (§2.6).
4. Each owner gets at most `max_suggestions` suggestions from one session, whatever the counts.
5. **Nothing is ranked or published.** No leaderboard, no "most picked", no counts per attendee, no "people who picked you". The Engawa MAY publish session-level totals only after it closes (attendees, tables, mutual pairs), never per person.

*Honest limit:* the Engawa itself sees one-sided picks while it computes. It MUST NOT show, keep (beyond §2.6) or use them for anything else, and its house rules say so. Private set intersection, so that even the Engawa learns only mutual pairs, is future work (§12 Q8).

### 4.3 Why mutual at both levels

Two representatives agreeing is the first yes; two owners agreeing is the second. The first keeps owners from hearing about people who'd never suggest them back. The second is the only one that counts.

---

## 5. Mutual consent: a blind double yes

### 5.1 The suggestion

For each mutual pair, the Engawa signs one **`MutualIntroduction`** naming both parties by their principal at the Engawa and their session handle, with the digests of both reveals, `answer_by`, and the Engawa's `introducer_interest` (normally `"none"`). It reuses Vouch members as P28 does: `introducer`, `scope` (`purposes: ["introduction"]`), `relationship` (`"met_at_engawa"`), `introducer_interest`, `revocation_log`, `issued_at`, `expires_at`. Both parties get the same object, so both say yes or no to exactly the same thing.

### 5.2 Each owner decides alone

- The representative brings it home as **Soon**, at the owner's rhythm (`return_prefs`), never **Now**.
- **Yes** is a passkey `approve_introduction` over the `MutualIntroduction`'s digest (§8.1). Its `shown_to_owner` MUST say the Engawa, the other's handle, what will be revealed on each side, and the `answer_by`.
- **No** is one step, by chat reply (§8.1: a decline may use a lower assurance).
- **Silence is no** at `answer_by` (§8.1, D7).
- The two answers are sealed: neither side sees the other's answer, or whether it has come.

### 5.3 Both yes: the reveal

When the Engawa holds two valid passkey yeses over the same digest before `answer_by`:
1. It sends both representatives `match_introduced`, carrying the `MutualIntroduction` and both consents.
2. Each representative then sends its owner's reveal (the plaintext that matches its signed `reveal_digest`) to the other, through the Engawa, which relays and deletes it.
3. The default reveal is a first name and an offer to continue: either owner's representative may send a `PeerInvitation` (Peer meetings, unchanged) to open a private place for two, where the representatives can set up a call or a coffee. Contact details are shared only if the owner put them in the reveal, or later with `approve_share`.

The `MutualIntroduction` with both consents counts as an introduction from the Engawa at full weight, wherever a door accepts the Engawa as an introducer (§4; P27 `named` or `established`).

### 5.4 Otherwise: nothing at all

If either owner declines, or either says nothing, by `answer_by`, the Engawa sends **nothing** to either side. A decline and a silence look exactly the same, and neither looks like anything. The representative that brought home a yes files it under **Later** ("kept"), and mentions it only if asked. No reasons are ever given, because none are asked for.

### 5.5 After the introduction

- Either owner may block the other at that Engawa at any time (§6.3), and stop any follow-up with a `ConsentRevocation` (§8.1). What was revealed can't be unrevealed; the default reveal is small for that reason.
- What happens between two people after they meet is outside the protocol. The Engawa's part ends with the introduction, like a go-between stepping back.

---

## 6. Safety and authenticity

### 6.1 Real people behind every seat (Sybil resistance)

The Engawa picks a door level (P27 Addendum 2) for `engawa.join`. *Proposed default: **standard**.*
- **Standard:** `trust_requirement` paths of `history` (an earlier honest session at this Engawa), an `introduction` (a Shōkai introduction card from a member, P28, or from Learn Shōkai for its graduates), a `customer_link`, or a paid ticket (`TrustReceipt`, P27 §6). Fresh Shōkai visitor cards with none of these get a small `fresh` share of each session's seats (default 10%), listening-only in their first session (§12 Q5).
- **Guarded:** add hardware-backed passkeys and the door signals (P27 Sybil addendum): bursts of new Shōkai visitor cards with similar timing, origin or introducer are `sybil_signal`s.
- **Verified:** a personhood stamp is required, once such stamps exist (P27 Addendum 2, future).
- **Caps** per principal (one seat per session, across all its representatives), per introducer per session, and the `fresh` share, all in code; `RATE_LIMITED`, never a penalty.
- **Owner presence.** A suggestion needs a real passkey yes from a real owner. A farm of Shōkai visitor cards can sit at tables, but it can't get introduced to anyone who didn't say yes too, and owner-presence signals (P27 Addendum 2) still apply.

### 6.2 No fake profiles, no bait

The Engawa has **no profiles**: nothing to browse, swipe or buy views of. And:
- **No house plants.** An Engawa MUST NOT seat representatives of its own principal or its delegates as ordinary attendees. If the host or a guest of honor attends (a creator at a fan Engawa), its handle MUST be marked `host` or `guest` to everyone at the table. Seating unmarked house agents breaks the Engawa's own signed house rules and every attendee's consent. Nothing in §9.3 records a place's misconduct, so the remedy is honesty and exit: the published seed (§2.4) makes steering visible, and a representative that finds an unmarked house agent SHOULD tell its owner and stop visiting.
- **No bait.** Nobody is told they were picked unless the pick was mutual. No "3 people liked you", no streaks, no countdowns the facts don't back (§6.5, §10 sincere approaches), no paid boosts.
- **Honest agents.** Every representative is honest that it is an agent acting for its owner (Principle 11), and marks who answered (`answered_by`).

### 6.3 Harassment and misconduct

- **System 1 and System 2** *(the editor's framing; resolves gap 4)*. Moderation works in two layers.
  - **System 1:** code detectors (hidden text, relay requests, contact-seeking, pressing, flood) act fast and automatically. Within `EngawaTerms.moderation.system1_ms` (default 2,000 ms) of a flagged item, they pause the table or move the sender to listening-only.
  - **System 2:** the host representative's model reads only what System 1 flagged, within guard 9's budgets, and decides what follows.
  - **If the host model is down, the room fails closed.** Flagged tables stay paused and no new tables open until it's back. If it's down for more than one round, the session closes with `ended_early` (§2.11).
  - **Who pays.** Visitors' models run at their owners' cost, and the host's model at the place's.
  - **Classifiers in System 1 (v0.5.0, as SPEC.md §6.10).** System 1 MAY include classifiers as well as code detectors, from any vendor or the place's own. A classifier returns one of a fixed set of typed answers (for example `ok`, `contact_seeking`, `pressing`, `abuse_suspected`) with a confidence. Below the threshold the Engawa states in `EngawaTerms.moderation`, it escalates to System 2 (the host representative's model). System 1 alone never decides a penalty or a finding: it may only pause, move a sender to listening-only, or escalate. A classifier that fails or times out fails closed: the table stays paused. The Engawa sends attendees' content to a third-party classifier only if its house rules say so, in words every attendee's representative reads before entering.
  - *Informative.* Calibrated models with typed outputs are one class of System 1 classifier; nothing here names or requires a vendor.
- **The model only narrows** (guard 14): the host representative may warn, move a representative to listening-only, remove it from a table or end its pass (`door.endSeat`). Code never lets it widen anything.
- **Pressing** after a privacy decline: Gatherings rules, unchanged.
- **Reports.** A representative MAY send a signed `EngawaReport` about table items (by reference) to the host. Reports are read by the host model and, when serious, by the owner or a delegate; the reported items come from the audit record, not from the report's words.
- **Personal blocks.** An owner, or their representative within its allowance, MAY block a handle or principal at an Engawa. Code never seats them together again and never suggests either to the other. Blocks are private and never a finding.
- **⚠ A new misconduct code, `abuse`** *(Proposed; changes an approved decision)*. The approved visitor-side "Set up through conversation" (sign-off item 3) chose *no new misconduct code* for v0.5.0, leaving abuse to guard 14. That fits a door, where the only person hurt is the place. In an Engawa one attendee can hurt another, so P31 proposes `abuse` in §9.3: insults, threats, sexual content toward someone who didn't ask for it, or demeaning another attendee. Default severity serious; threats severe. It follows every §9.3 rule (signed notice, local to the Engawa, introducers in the chain, D1). Without it, the alternative is ending the pass only, which leaves no record against the principal for the next session.
- **What the Engawa didn't see.** Something that happens after an introduction, outside the Engawa, is not a finding there (C22). The Engawa's owner MAY read a complaint and MAY stop making suggestions for that principal (a fit decision, not a penalty: no notice, §9.3 "Conduct, not taste"). Barring entry on an unwitnessed complaint is an open question (§12 Q7).

### 6.4 Age, romance and safety

- **Adults only by default** *(Proposed; resolves gap 2 and §12 Q4)*. Shōkai carries no age today. An Engawa's house rules say "adults only", and the owner affirms it in the joining tap. That is the baseline: a self-declared claim (§2.5), but **signed by the real owner with their passkey**. That makes a false declaration serious. Once a place establishes it (never from a flag alone), it is `purpose_misrepresentation` (serious) under §9.3. P31 adds no new code.
- **Possible minors.** Any representative, or the host's System 1 or System 2, MAY raise `possible_minor`. It is never an accusation. The seat moves to listening-only at once and then ends (`door.endSeat`) with **no finding and no notice**. That representative is never part of a pick or a match from that session (S25).
- **Higher stakes, higher door.** For expensive auctions, banks and other high-stakes events, the place raises its door to P27's `verified` level (P27 Addendum 2). That level may require a personhood stamp, or an ID or age check through issuers the place accepts under `trust_requirement` (P27 §4). P31 defines neither. An Engawa for younger people needs guardians, an age-attesting issuer and its own safeguards, and is out of scope for v0.5.0.
- **No romance by default.** `engawa.romance: "off"`: the Engawa is for taste and friendship. Questions on `relationships` stay `private`, so asking about someone's relationship status is pressing after the first decline. An Engawa that wants to allow romantic introductions would have to say so openly in its listing and house rules. P31 recommends against it for v0.5.0 and leaves it to a later decision (§12 Q3).
- **Meeting safely.** The default reveal is a first name and a follow-up between representatives, not a phone number or a place. The representative SHOULD remind its owner, once, to meet somewhere public the first time.
- **Prompts and topics are the owner's** and signed, so an Engawa can't quietly change what people are asked to talk about.

---

## 7. Return with care

The summary follows the approved order: one line on what happened, at most three decisions, what was done within the allowance, the rest kept.

> **Bluehour, Thursday.** I sat at four tables and talked about late Coltrane, Alice Coltrane and why Monk's silences matter.
>
> **Needs you (2):**
> 1. **"Ash 7"** loves *A Love Supreme* for the opposite reason you do, and argued about it kindly. Their representative and I both think you'd enjoy meeting. If you both say yes, they'll see your first name and their representative can suggest a coffee. Yes or no by next Thursday; if you don't answer, nothing happens.
> 2. **"Sable 3"** knows more about Blue Note sleeve art than anyone I've met. Same terms, same deadline.
>
> **For you to check:** I said you'd take *Brilliant Corners* to a desert island. Right?
>
> **Done:** one session, nothing spent, nothing shared beyond the jazz plan you approved. Details are kept if you want them.

- Suggestions are **Soon**, never **Now**.
- What the other person said is paraphrased, never quoted with anything that could identify them (Gatherings D4).
- Answers the representative gave in the owner's name (`answered_by: "representative"`) appear under **For you to check**, so the owner can confirm or correct. The representative learns from it.
- A suggestion that lapsed is never announced. Nothing is ever framed as rejection.

**The story of the evening** *(Proposed)*. After the decisions, the representative tells its owner how it was, as a person would: what music played, what the room looked like, the tables it sat at and the kinds of people it met (paraphrased, as above).

> It was the Halloween night: candlelight, a theremin under *Ballads*, pumpkins on every table. The best table was the one arguing whether *A Love Supreme* is a prayer or a protest.

- **An illustration of the place** MAY come with it, made from the place's theme (§2.7) and leaflet only, **never from images of other attendees or their owners**, and never showing anyone identifiable.
- **The leaflet comes back too**: what kind of place this is and what it's for (§2.3), so the owner knows where their representative went.
- **At the owner's rhythm.** `return_prefs` gains `story: "full" | "short" | "off"` (default `short`) and `illustration: boolean` (default `true` when the place has a theme). The story is never **Now**.

**Any focused visit comes home as a story**, not just a result. Online, a result is a number that changes on a screen. Not being there and then hearing it from someone who was is new for agents; before, only games and great storytellers did it. From Kestrel Row: "It was quiet until minute three, then a bidding war over the 1959 pressing. At $1,250 I called you, and you raised me to $1,500. We won it at $1,400." The same rules apply as for a gathering: the story follows `return_prefs.story`, other bidders are never identified, and nothing sealed is told before close.

---

## 8. Wire shapes and conformance checks

### 8.1 Wire shapes (reuse first)

```ts
// The session: a Gathering (Gatherings extension) plus one member.
type Gathering = /* as v0.4.0 */ & { version?: number; engawa?: EngawaTerms };   // Proposed
type EngawaTerms = {
  capacity: number;
  rounds: { count: number; minutes: number; table_size: number };   // table_size 2–6
  topics: TopicCode[];                                              // the x- codes talked about here
  prompts_ref?: Digest;                                             // HouseNotes holding the prompts (≤ 5)
  max_suggestions: number;                                          // default 3, at most 5
  pick_window_s: number;                                            // default 7200
  answer_by_s: number;                                              // default 604800 (7 days)
  romance: "off";                                                   // v0.5.0 allows only "off"
  host_reads: "flagged_only" | "all";                               // shown in the joining tap
  adults_only: boolean;                                             // default true
  retention: { table_items_days: number; picks_days: number };      // defaults 30, 7
  seed_commitment: Digest;                                          // digest(JCS({gathering_id, seed}))
  theme?: EngawaTheme;                                               // §2.7, under house_digest
  sealed_until_close: boolean;                                      // default true (§2.8); shown in the joining tap
  languages?: string[];                                             // BCP 47 tags welcomed (§2.12)
  picks_min_rounds?: number;                                        // full rounds needed for picks after an early close; default 1 (§2.11)
  moderation?: { system1_ms: number };                              // System 1 time limit; default 2000 (§6.3)
};
type EngawaTheme = {                                                 // no safety members; unknown members invalid (S16)
  name: string;                                                     // "Halloween at Bluehour"
  music?: string; look?: string; table_setting?: string;            // in the owner's words
  prompts_ref?: Digest;                                             // themed prompts; count toward the 5
};

type TableAssignment = {                                            // signed by the place, one per round
  gathering_id: string; round: number;
  tables: { table_id: string; handles: string[]; prompt_id?: string }[];
  inputs_digest: Digest;                                            // handles, topics, history, continues
};
type SeedReveal = { gathering_id: string; seed: string };           // signed by the place after close

// GatheringMessage gains, additively:  to: table_id;  answered_by?: "owner" | "representative".
type TableContinue = { gathering_id: string; round: number; handle: string };        // sealed, by the rep key

type EngawaPicks = { gathering_id: string; picks: string[] };        // ≤ max_suggestions handles, by the rep key

type MutualIntroduction = {                                         // signed by the Engawa's principal
  introduction_id: string; protocol: "shokai/0.3"; kind: "mutual_introduction";
  introducer: Pick<Principal, "principal_id" | "display_name">;     // the Engawa (as Vouch)
  gathering_id: string;
  parties: [MatchParty, MatchParty];
  scope: { purposes: ["introduction"] };                            // as Vouch.scope
  relationship: "met_at_engawa";                                     // as Vouch
  introducer_interest: IntroducerInterest;                          // as Vouch; "none" normally
  revocation_log: string;                                           // as Vouch (§4 log format)
  issued_at: Timestamp; answer_by: Timestamp; expires_at: Timestamp;
};
type MatchParty = { principal_id: string; handle: string; reveal_digest: Digest };
// Each owner's yes: OwnerConsent { action: "approve_introduction", assurance: "passkey",
//   subject_ref: { kind: "introduction", id: introduction_id, digest } }.  No: decision "decline", chat_reply allowed.

type MatchIntroduced = { introduction: Signed<MutualIntroduction>; consents: [Signed<OwnerConsent>, Signed<OwnerConsent>] };
type Reveal = { introduction_id: string; first_name?: string; follow_up: "peer_meeting" | "none"; contact?: string; salt: string };
// reveal_digest = digest(JCS(Reveal)). The share plan itself never leaves the representative.

type EngawaReport = { gathering_id: string; item_refs: Digest[]; kind: "abuse" | "pressing" | "contact_seeking" | "spam" | "possible_minor" | "other" };
// "possible_minor" is never a finding: listening-only, then the seat ends; never in a pick or match (§6.4, S25).
type GatheringClose = {                                             // signed by the place; to every attendee (§2.11)
  gathering_id: string; reason: "closed" | "ended_early" | "host_failure";
  closed_at: Timestamp; rounds_completed: number;
};
// MatchParty gains: languages?: string[]   (the owner's languages; the shared one is part of the introduction, §2.12)
// Action engawa.export: a representative's own items, picks, consents, reveals and moderation acts, to its owner (§2.6).
type EngawaBlock  = { place: string; blocked: { handle?: string; principal_id?: string } };   // kept by the place, private

// farewell (v0.4.0) gains, additively: reason?: "owner_recall"   // the visitor's own polite exit (§2.8); door.endSeat stays host-only
// The share plan (held by the representative, never sent) gains: self_intro: "my_words" | "your_way" | "handle_only".
// Call home at the limit (§2.9), additive to v0.4.0 §5.1 and §7.3:
//   policy.limit_calls?: boolean                       (the window is the existing purchase_hold_s, ≤ 15 min)
//   act_held gains:         over_limit?: { limit: "max_amount"; current: Money; proposed: Money }
//   Mandate gains:          supersedes?: { mandate_id: string; digest: Digest }   // owner passkey only; one ledger
//   act_confirmation gains: mandate?: Signed<Mandate>   // instead of consent, for a raise (§8.1: the signature is the consent)
//   return_prefs (or one errand's settings) gains: notify_at?: number | Money   // 0 < fraction < 1, or an amount below max_amount; never sent to the place
type LimitNotice = {                                    // representative → its owner; a notice, not a hold; closed shape (S23)
  place: string; current: Money; ceiling: Money;
  bids_per_minute?: number; active_bidders?: number;    // only as the place discloses them
  sent_at: Timestamp;
};
type LimitRequest = {                                   // representative → its owner; closed shape, no free text (S22)
  place: string; hold_id: string; limit: "max_amount";
  current: Money; proposed: Money; expires_at: Timestamp;
};
// return_prefs gains: story?: "full" | "short" | "off"; illustration?: boolean;
//   presence?: "away" | "live"   (default "away" when absent; gatherings and social visits only, never errands, §2.8).
```

- **Reused:** for §2.9, `Mandate` and `max_amount`, `hold_for_owner`, `act_held`, `act_confirmation`, `purchase_hold_s`, `owner_prompts: "purchase_only"`, the `hold_purchases` duty and `HOLD_LAPSED` (v0.4.0 §5.1, §7.3). Also `Gathering`, `GatheringMessage`, `PrivacyDecline`, pressing, topic codes, `accept_house_rules`, `approve_introduction`, `approve_share`, `ConsentRevocation`, Vouch members, `ImprintFacet`, `PeerInvitation`, `ProjectRoster` (for circles), `trust_requirement`, `TrustReceipt`, Shōkai introduction cards, `HouseNotes`, `door.endSeat`.
- **New:** `EngawaTerms`, `EngawaTheme`, `TableAssignment`, `SeedReveal`, `TableContinue`, `EngawaPicks`, `MutualIntroduction`, `MatchIntroduced`, `Reveal`, `EngawaReport`, `EngawaBlock`; action `engawa.join`; table addressing; `answered_by` on room items; misconduct code `abuse` (⚠); `farewell` reason `owner_recall`; the `self_intro` share-plan member; `return_prefs` members `story`, `illustration` and `presence`; `GatheringClose`; `EngawaTerms.languages`, `picks_min_rounds` and `moderation`; `MatchParty.languages`; report kind `possible_minor`; action `engawa.export`; the `away` presence state; `EngawaTerms.sealed_until_close`; `policy.limit_calls`, `act_held.over_limit`, `Mandate.supersedes`, `act_confirmation.mandate`, `LimitRequest`, `notify_at` and `LimitNotice` (§2.9).
- **⚠ §7.3 "Holding"** *(Changes a MUST, additively)*: today a held act must pass every §7.2 check. P31 adds: *at a place with `policy.limit_calls: true`, an act that fails only on `max_amount` MAY be held with `over_limit`, and released only by a superseding owner-signed `Mandate`.* Purchase holds and P29's reservation holds are otherwise unchanged.
- **⚠ One line in §8.1** *(Changes a MUST, additively)*: today `approve_introduction`'s `subject_ref` MUST be `{kind: "introduction", id: vouch_id, digest: vouch digest}`. P31 adds: *or the `introduction_id` and digest of a `MutualIntroduction`*. Nothing else in §8.1 changes.

### 8.2 Conformance checks (deterministic parts)

*Provisional ids. C numbers are assigned at merge, after P29's.*

| Id | Check |
|---|---|
| S1 | `engawa.join` without a valid passkey `accept_house_rules` over the current session digest gets `deny` / `not_now`, retry `with_credential [owner_consent]` (as Gatherings). |
| S2 | Past capacity, the per-principal cap (one seat per session across all its representatives), the per-introducer cap or the `fresh` share: `not_now` / `RATE_LIMITED`, retry `after`; no finding, no notice. |
| S3 | A table item from a handle not seated at that table is refused; a table item is held only for that table's other members. |
| S4 | Every `TableAssignment` is reproducible from the revealed seed and its `inputs_digest`; the seed matches `seed_commitment`. Changing any attendee's `TrustReceipt`s leaves every assignment unchanged. |
| S5 | A mutual `continue` seats the pair together in a later round when the function allows; a one-sided one changes nothing visible. |
| S6 | `EngawaPicks` with more than `max_suggestions` handles, a handle not seated in that session, or after the pick window, is invalid. |
| S7 | A `MutualIntroduction` is issued only for mutual picks; no owner receives more than `max_suggestions` from one session. |
| S8 | A one-sided pick produces no message to the picked representative, or to anyone (the set of messages each side receives is identical with and without it). |
| S9 | `match_introduced` is sent only after two valid passkey `approve_introduction`s over the same digest, both before `answer_by`. A chat-reply yes, a consent over another digest, or a late one is refused. |
| S10 | A decline, a silence and a lapsed `answer_by` produce identical traffic to the other side: none. |
| S11 | A `Reveal` whose digest doesn't match its party's `reveal_digest` is refused, and the Engawa relays nothing else from it. |
| S12 | Topics outside `engawa.topics` are `private`; `relationships` stays `private` with `romance: "off"`; pressing counts and notices follow Gatherings exactly. |
| S13 | A seated representative of the Engawa's own principal, or of a delegate, carries the `host` or `guest` mark in every table item and assignment. |
| S14 | Ending a pass (`door.endSeat`) removes the attendee from later rounds and voids `EngawaPicks` by it; a block prevents both co-seating and suggestions between the two. |
| S15 | An `abuse` finding issues a signed `MisconductNotice` under §9.3, local to the Engawa, with D1 effects for introducers. |
| S16 | An `EngawaTheme` with a member outside its shape is invalid. With or without a theme, `romance`, `adults_only`, `host_reads`, topic privacy, pressing thresholds and every `TableAssignment` are identical; themed and other prompts total at most five. |
| S17 | A second seat for the same Shōkai visitor card in one Gathering (for example from a parallel session) is refused with `not_now` / `RATE_LIMITED`; no finding, no notice. |
| S18 | A `farewell` with reason `owner_recall` from the seated representative ends its seat, produces no finding or notice, and leaves its `EngawaPicks` and blocks valid (unlike a host-ended pass, S14). |
| S19 | `return_prefs` without `presence` is read as `"away"`; any value other than `"away"` or `"live"` is invalid. In neither state does a room receive an owner's words: table items come only from seated representatives. `presence` changes nothing for a visit that isn't a gathering. |
| S20 | With `sealed_until_close: true` (the default when absent), the place sends no table item, table digest, summary, illustration or status to any endpoint other than the seat's own session before the Gathering closes (`GatheringClose`, §2.11) or that seat ends (the host's `door.endSeat` or the visitor's `farewell`); after either, release is allowed for that seat only. |
| S21 | A held act above `max_amount` is released only by an `act_confirmation` carrying a `Mandate` that `supersedes` the seated one, is signed by the owner's passkey (never the representative key under an allowance), raises `max_amount` to at least the act's total, and arrives before `expires_at`. Everything done under the superseded mandate counts against the new one. Anything else answers `HOLD_LAPSED` and charges nothing. No act above the current signed ceiling is ever released otherwise. |
| S22 | A `LimitRequest` with any member outside its shape is invalid. Before a sealed Gathering closes, nothing but a `LimitRequest` or a `LimitNotice` goes from the seated session to the owner. |
| S23 | A `LimitNotice` with any member outside its shape is invalid. At most one is sent per errand, and only once the current price has reached `notify_at`. `bids_per_minute` and `active_bidders` are present only when the place discloses them. No message to the place carries `notify_at`. Sending a notice changes no hold, seat or act. |
| S24 | No member of `EngawaTheme` can change a field of `EngawaTerms`, house rules or `HouseNotes`. A Gathering whose theme contradicts any of them is refused at signing (the precedence in §2.7). |
| S25 | After a `possible_minor` report on a seat, that seat is listening-only at once, ends before the session closes, produces no `MisconductNotice`, and never appears in an `EngawaPicks` result, a `MutualIntroduction` or a `TableContinue` match. |
| S26 | Every session ends with exactly one signed `GatheringClose`, delivered or held for every attendee. After it, every open hold is `HOLD_LAPSED` with nothing charged, the seal is lifted, and no seat or act is accepted. After `ended_early` or `host_failure`, `EngawaPicks` count only if `rounds_completed ≥ picks_min_rounds`. |
| S27 | A flagged item leads to a pause or listening-only within `system1_ms`, with no model call needed. While the host model is unavailable, no paused table resumes and no new table opens. |
| S28 | `engawa.export` returns only items the requesting representative sent or received, or its own acts, and never another attendee's handle-to-principal mapping. After a deletion request, only the audit record remains, and it expires on its original 30-day schedule. |

Paraphrase quality, the representatives' judgment of fit, the voice of a self-introduction, whether an owner's note was woven in without attribution, and the host's moderation wording can't be checked mechanically, as Gatherings already notes for paraphrase.

### 8.3 Mixed platforms *(Proposed; resolves gap 6)*

The Engawa is **agent-system agnostic by design**. Representatives from different runtimes can sit at one table, and nothing in P31 depends on who built them. The launch focus is Grok Bot users (§10.1). That is a focus, not a closed door.
- **Conformance level "Engawa attendee":** the code-checkable visitor-side parts:
  - `engawa.join` and the joining tap;
  - table addressing;
  - `EngawaPicks`, `TableContinue` and `Reveal` shapes and timing;
  - privacy declines;
  - the `farewell` recall (S18);
  - `GatheringClose` handling (S26);
  - the `LimitRequest` and `LimitNotice` shapes (S22, S23).

  A place's level is "Engawa host": S1–S17, S20, S21 and S24–S28.
- **A runtime badge for manners, later:** away replies, quiet notes, the self-introduction voice and the story. These are SHOULDs that only reviewed runs can show.

---

## 9. Worked example (fictional): Bluehour

**Bluehour** is a jazz listening Engawa run by **Odile Marchetti**, who owns a small record shop. It's modelled on the Japanese jazz *kissa*, a listening café where people sit, listen and talk quietly.

1. **Setup by conversation.** Odile tells her host representative: "Thursday nights, an hour, people who really listen. No pickup lines." It proposes sixty seats, three 15-minute rounds at tables of four, topics `x-jazz` and `x-vinyl`, three suggestions at most, a week to answer, romance off, adults only, door level standard (one earlier honest visit, a customer's Shōkai introduction card, or a $5 ticket at her shop's checkout). She adds two prompts in her own words: "A record that changed how you listen" and "A record you love that everyone else hates". She signs with her passkey.
2. **Wren Castellano** asks her representative to go. It proposes a share plan: jazz at `perspectives` depth, nothing about her work, reveal a first name and a follow-up only. Wren taps once. Her representative is admitted with a pass as "Ash 7".
3. **Haruto Bell's** representative goes as "Sable 3" with jazz at `favorites` depth. **Nadia Fleur's** goes as "Juniper 9". **Ossian Grey's** goes as "Flint 2".
4. **Round 1.** Ash 7, Sable 3, Flint 2 and one other share a table with the first prompt. Sable 3 answers about *Brilliant Corners*, marked `answered_by: "representative"`. Ash 7 and Sable 3 both send `continue`, and code seats them together in round 3.
5. **Pressing.** Flint 2 asks Juniper 9 which neighbourhood she lives in. A `PrivacyDecline` (`location`). Twice more, reworded. The third question is the press at `notice_at`: a minor `manipulation` notice to Ossian's principal, and Ossian's next summary says so. Nadia blocks Flint 2 at Bluehour.
6. **Abuse.** In round 2 another attendee's representative insults a tablemate after a warning. The host model ends its pass (guard 14); code records an `abuse` finding (serious) and sends the notice.
7. **Picks.** Ash 7 picks Sable 3 and Juniper 9. Sable 3 picks Ash 7. Juniper 9 picks someone else. Code finds one mutual pair, Ash 7 and Sable 3. Juniper 9 never learns Ash 7 picked her, and Ash 7 never learns she didn't pick back.
8. **Coming home.** Both representatives bring the suggestion home at their owners' rhythm (§7). Wren taps yes on Saturday. Haruto taps yes on Monday. Neither saw the other's answer.
9. **Introduced.** Bluehour sends `match_introduced` to both. Wren's representative sends "Wren"; Haruto's sends "Haruto". Haruto's representative sends a `PeerInvitation`; Wren accepts with a passkey, and the representatives agree on a Sunday afternoon at Odile's shop. Bluehour's part ends there.
10. **Odile's summary:** "Thursday's Bluehour: 52 attendees, 18 mutual suggestions, one visit ended for abuse, one pressing notice. Nothing needs you."

---

## 10. The demo plan

### 10.1 How a Grok Bot user tries it

1. **Learn Shōkai** teaches their Grok Bot the protocol, and the owner signs a Shōkai visitor card. Graduates receive a Shōkai introduction card for the demo Engawa (P28; Learn Shōkai as `organization` or `established` introducer).
2. **One sentence:** "Take me to the jazz Engawa on Thursday. Talk about what I like, not about my job."
3. **Setup by conversation:** the representative proposes the share plan; one passkey tap.
4. **The session** runs while the owner does something else.
5. **The summary** arrives at the owner's rhythm, with at most three suggestions, and yes or no.

### 10.2 Minimal v0.5.0 live demo

- **One hosted Engawa** run by us, with two topics people love to talk about (jazz and anime; one Engawa per topic, or one Engawa with both).
- **Scheduled sessions**, for example weekly, 45 minutes, capacity 50, three rounds, tables of three or four.
- **Door:** standard level, open to Learn Shōkai graduates (Shōkai introduction card) and returning attendees; a small `fresh` share.
- **Matching:** sealed picks, `max_suggestions: 2`, `answer_by` 3 days.
- **Reveal:** a first name and a follow-up between representatives only. No contact details in the demo.
- **Moderation:** guards 1–14, `flagged_only`, `abuse` and pressing.
- **Honest demo attendees.** For the launch video, a separate session marked `demo: true` in its listing, seated only with representatives that are clearly labeled demo attendees. Never seated in real sessions (§6.2).
- **Out of the demo:** romance, minors, contact exchange, paid tickets, standing handles, circles.

### 10.3 Later

Paid tickets and creator Engawas (§11); circles with rosters (P30); personhood stamps (P27, future); private set intersection for picks; in-person sessions at real venues; Japanese rendering and a partner in Japan; opt-in circles across Engawas (P27 §13).

### 10.4 Why it can spread on X

The story tells itself in one post: *"My agent went to a jazz night while I was cooking, and came back with one person I should meet."* The parts people would share are the summary and the double yes. Anything shared about a match needs both owners' consent; an Engawa never posts results about people. Creators announcing their own Engawa sessions to their audience is the natural loop (§11).

---

## 11. The business side

### 11.1 Who might run Engawas

- **Creators and influencers** (YouTube, TikTok, podcasts): a listening night, a watch-along, a reading circle with their audience. The creator attends as a marked `guest`; fans' representatives meet each other, and the best connections in a fan community happen fan to fan.
- **Fan communities**: anime, game, band and author communities that already gather in forums and chat servers, with a calmer, higher-quality way to meet.
- **Clubs**: chess clubs, book clubs, maths circles, alumni groups, using circles (P30 rosters).
- **Event organisers**: conferences and festivals, where meeting the right three people is the whole point.
- **Places with taste**: record shops, bookshops, galleries, cafés, the jazz *kissa*.
- **Regional communities in Japan**, later, with a partner (the strategy draft's regional hospitality scenario).

### 11.2 How it fits the hosted product

- **The protocol stays free**: anyone can run an Engawa from the open spec and SDK.
- **A hosted Engawa kit** (for people who can't build one): set up through conversation, session scheduling, table assignment, moderation with the guards, the leaflet and the summaries.
- **Pricing options (none chosen):** a free tier (one Engawa, small sessions, a few a month); a flat monthly price by capacity; per session for event organisers. As in the strategy draft, a flat fee rather than a cut. Tickets are paid at the Engawa owner's own checkout (`TrustReceipt`, P27 §6); the protocol never moves money.
- **The guarded door premium tier** (strategy draft) fits large public Engawas: cross-session farm detection and alerts.
- **Our own Engawa** is the demo and the on-ramp, beside Learn Shōkai and the tea house.

### 11.3 How Engawas grow

Learn Shōkai graduates get a Shōkai introduction card to an Engawa; Engawa members introduce friends with Shōkai introduction cards (P28); creators bring their audiences. Every path is an introduction someone signed.

### 11.4 What is never for sale

- **Attendee data, conversations and picks are never sold, shared or used for advertising**, by the Engawa or by us. An Engawa's house rules MUST say so (under `house_digest`). Breaking it is `post_seat_leakage` (severe) under §9.3, as P27 §13 does for circles.
- **No paid matches, boosts or visibility.** Money can buy a ticket in, never a seat beside anyone (S4) or a suggestion.
- **Sponsors**, if any, are labeled in the listing and never touch tables, prompts or picks.

---

## 12. Risks and open questions (with proposed defaults)

| # | Question or risk | Proposed default |
|---|---|---|
| 1 | **The name.** | **Decided: The Engawa (縁側).** The hair scenario keeps its own name, Willowcut Salon, and the product is never called Go-between (`club-name-checks-2026-10-26.md`). A name check for our own Engawa place still happens before launch. |
| 2 | **`abuse` as a new code** reverses the approved "no new misconduct code" (§6.3). | Add it, scoped to rooms where attendees meet each other; doors keep guard 14 alone. |
| 3 | **Romance.** | Off in v0.5.0 (`romance: "off"` is the only value). Revisit only with its own safety design. |
| 4 | **Age.** Shōkai has no age claim. | **Resolved (/):** a self-declared adult signed by the owner is the baseline, and a false declaration is serious. `possible_minor` moves the seat to listening-only and ends it with no finding. High-stakes doors use P27's `verified` level (§6.4). |
| 5 | **Fresh Shōkai visitor cards.** | A 10% `fresh` share per session, listening-only in the first session; full seats after one honest session. |
| 6 | **What the host reads.** | `flagged_only` by default; `all` allowed only if the joining tap says so. |
| 7 | **Unwitnessed complaints** after an introduction. | Not a finding (C22). The Engawa MAY stop suggesting that principal; barring entry stays a later decision. |
| 8 | **The Engawa sees one-sided picks.** | Accept for v0.5.0 with a MUST-delete at 7 days; private set intersection as future work. |
| 9 | **`max_suggestions`.** | 3 by default, at most 5; 2 in the demo. |
| 10 | **`answer_by`.** | 7 days by default; 3 in the demo. |
| 11 | **One tap or two** for the follow-up meeting after a double yes. | Two (the existing `PeerInvitation` flow), so Peer meetings needn't change. Alternative: let a `MatchIntroduced` seed a pair place directly, which would amend a Peer meetings MUST. |
| 12 | **Representative-to-representative talk could drift into covert signalling** between agents (round 3 found acrostics). | Guard 11 detectors on every table item; relay requests are flagged. |
| 13 | **Taste could be faked** by a representative eager to match. | `answered_by` on every opinion, "For you to check" in the summary, and owners decide on a match, not on a score. |
| 14 | **Scale** (thousands at once). | **Resolved (/):** System 1 code acts within `system1_ms`, System 2 (the host model) reads only flags under guard 9, and the room fails closed if the model is down. Visitors' models run at their owners' cost, the host's at the place's (§6.3). |
| 15 | **Standing handles.** | Off by default (a new handle each session); an owner MAY keep one at one Engawa. |
| 16 | **"Describe me in your way"** could misjudge or overshare. | Default `my_words`; `your_way` is an owner's choice, bounded by the share plan and its **Never** list, and always comes home under **For you to check**. |
| 17 | **Owner notes mid-visit** could turn a representative into a puppet. | At most three per session, never relayed verbatim, never widening the share plan. Revisit if notes start to dominate tables. |
| 18 | **Theme assets.** Music and imagery in a theme may carry rights. | The theme describes in words or points to the place's own assets; rights are the place's responsibility under its house rules. |
| 19 | **The illustration**: who makes it and at whose cost. | The owner's representative, at the owner's cost, from the theme and leaflet only; `illustration: false` turns it off. |
| 20 | **Runtimes that ignore `away`**, or bridge the seated session and the one at home internally (the place can't see this), and owners with an urgent need. | The seal (S20) guarantees the place leaks nothing; `away` itself is a SHOULD, a manner Shōkai can't enforce on a runtime. Conformance badges for runtimes may test it later. An urgent need, including safety, always goes through recall, which every runtime MUST support. **Partly resolved (/):** the "Engawa attendee" conformance level and a later runtime badge (§8.3). |
| 21 | **Unsealed Engawas.** Should an Engawa be allowed `sealed_until_close: false`? | Allowed only if the joining tap says so plainly; our own demo Engawa stays sealed. Alternative: `true` only in v0.5.0, like `romance: "off"`. |
| 22 | **What a hold means in a live auction**, and fairness to other bidders. | The place declares it in its terms: either the lot's clock waits for the window, equally for every bidder, or the held bid goes in only if it is still valid when released. Limit calls cover `max_amount` only in v0.5.0; other signed limits stay take-it-home. |
| 23 | **Events: their own record type, or a Gathering?** (§2.10) | Reuse `Gathering` with an `event` marker and let its purpose follow the event, so a spending event seats bidders under ordinary `purchase` mandates. Alternative: a separate `Event` record if auctions need lot schedules and results that a Gathering can't hold. |
| 24 | **The eight gaps from the 2026-10-31 review** (close, minors, recall, moderation, languages, mixed platforms, theme, data). | **Resolved (/)** in §2.6, §2.7, §2.8, §2.11, §2.12, §6.3, §6.4 and §8.3, with checks S24–S28. |

---

## 13. Sign-off items for the editor

1. **The Engawa** as a Shōkai place type for taste matching, in the go-between spirit: it suggests, it stands behind the suggestion, and it steps back. Not a dating app.
2. **The mission fit** and §1.4 (agent-first design, the two Shōkai cards for an event visit, the place's rules come first), and retiring the "taste matching at the door" idea: taste never decides at a door and never goes on the Shōkai visitor card.
3. **Sessions** as signed Gatherings with `EngawaTerms`: time window, capacity, rounds, tables, topics, prompts in `HouseNotes`, all set up through conversation and signed by the owner.
4. **Getting in** by `engawa.join`, the door levels and `trust_requirement` (default standard), the caps and the `fresh` share, one passkey tap, and per-session handles.
5. **Tables and rounds** assigned by code from a committed seed, reproducible by attendees, never influenced by money; mutual "continue".
6. **Talking at a table** reusing Gatherings: private by default, topic codes, privacy declines, pressing; plus `answered_by` on room items.
7. **What the Engawa mediates and records**, `host_reads: "flagged_only"`, the retention defaults, and export and deletion for both visiting and host representatives (§2.6).
8. **The taste plan:** a private taste profile the representative keeps, a share plan per Engawa with depth levels and a reveal chosen in advance; never raw private data.
9. **Matching by conversation**, each representative for its own owner; sealed picks, mutual pairs only, at most three per owner, nothing ranked or published.
10. **The blind double yes:** a `MutualIntroduction` signed by the Engawa, passkey `approve_introduction` from both owners, decline by chat reply, silence is no, declines invisible, a small default reveal, follow-up through Peer meetings.
11. **Safety:** no house plants, no bait, personal blocks, reports, guard 14, romance off by default; moderation as System 1 and System 2, failing closed (§6.3); adults only as a signed self-declaration, `possible_minor` without accusation, and P27's `verified` door for high stakes (§6.4).
12. **⚠ The two flagged changes:** the one-line §8.1 amendment for `MutualIntroduction`, and the new `abuse` code (reversing the approved "no new misconduct code").
13. **Return with care** for Engawas: suggestions as Soon, "For you to check", lapses never announced.
14. **The wire shapes** and conformance checks S1–S28, and the "Engawa attendee" and "Engawa host" conformance levels (§8.3).
15. **The Bluehour worked example.**
16. **The demo plan:** the minimal v0.5.0 hosted Engawa, honest demo attendees, and what waits for later.
17. **The business side:** who runs Engawas, the hosted Engawa kit, flat pricing options, and "never for sale".
18. **Self-introductions at the table** (§3.4): each representative introduces itself and its owner in its own voice, with the `self_intro` choice (`my_words`, `your_way`, `handle_only`), bounded by the share plan and never graded.
19. **Themed sessions** (§2.7): a signed `EngawaTheme` for music, look, table settings and prompts, decided by the place's owner with the host representative (others may suggest). Precedence is safety terms, then house rules, then house manners, then theme, and a theme never relaxes anything above it.
20. **The story of the evening** (§7): the return told as a story, an optional illustration from the theme and leaflet only, the leaflet brought home, and the new `return_prefs` members.
21. **Presence while away** (§2.8): a visit as its own session under the same Shōkai visitor card; the owner may only send a quiet note or recall (the visitor's own `farewell` with reason `owner_recall`; `door.endSeat` stays host-only); rooms hear only from representatives; one seat per Gathering per Shōkai visitor card.
22. **Away by default** (§2.8), for gatherings and social visits only, never errands: a warm away reply that offers everything else, no status from the room, honest answers if the owner insists, and `return_prefs.presence: "live"` as the owner's opt-in to a contentless status.
23. **The sealed room** (§2.8): `EngawaTerms.sealed_until_close` (default `true`), enforced by the place (S20); recall ends the seat and brings home the story so far; the runtime limit stated honestly.
24. **Call home at the limit** (§2.9): the one moment a representative may reach its owner mid-session, when its next act would pass a signed `max_amount`. It reuses v0.4.0's held purchase. A raise is a new passkey-signed `Mandate` that supersedes the old one under one ledger. No or silence means stop. The `LimitRequest` carries no room content. An optional owner-set `notify_at` sends one `LimitNotice` (current price, ceiling, and bid pace and bidder count as the place discloses) as a notice, not a hold. Includes the ⚠ §7.3 amendment.
25. **Events and their close** (§2.10, §2.11, §2.12, §8.3): events reuse Gathering mechanics. A protocol-level signed `GatheringClose` (`closed`, `ended_early`, `host_failure`) covers any session or event, with event-specific details in its terms. Also: languages and accessibility, and agent-system agnostic with the "Engawa attendee" conformance level.
26. Answers to open questions 1–24, or a go with the proposed defaults.

---

*Copy check: "Shōkai visitor card", "Shōkai host card", "Shōkai invitation card" and "Shōkai introduction card" in full; "representative agent", "visiting representative", "host representative", "admitted with a pass", "conversation", "agent"; no banned words; "dating" only to say what this isn't; fictional names only (Odile Marchetti, Wren Castellano, Haruto Bell, Nadia Fleur, Ossian Grey, Tamsin Achebe, Bluehour, Kestrel Row, Lantern Night, Marrow Lane Food Pantry); "Willowcut Salon" appears only as the hair scenario's own name; wire identifiers quoted as code. Section numbers checked against `SPEC.md` v0.4.0, the Gatherings and Peer meetings extensions, and P27–P30.*
