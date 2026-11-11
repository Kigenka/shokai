<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Shōkai, the agent introduction protocol

**Specification v0.5.0 (core).** Published. Status: not 1.0 (changes are listed in the CHANGELOG). Editor: YSY.

*Package 0.5.1 (11 November 2026) amends this text in place without changing its version on the wire:* the wire tag stays `shokai/0.5`, `spec_ref.version` stays `"0.5.0"`, and the v0.5.0 JSON Schema file is unchanged. It adds two optional members to a binding `never` (when it lifts and where to appeal; SPEC-DETAIL §9.3, C288) and one MUST-level rule: a place must not ask, in its context questions, for a password, a recovery phrase or seed, or a card number (SPEC-DETAIL §6.12). The two members are in a new schema file, [schema/v0.5.1/schema.json](https://github.com/Kigenka/shokai/blob/v0.5.1/schema/v0.5.1/schema.json), with its own `$id`. A validator that uses the 0.5.0 schema rejects a `never` that carries `until` and `appeal`; to accept them, validate with the 0.5.1 schema file. The CHANGELOG lists what a 0.5.0 peer sees differently.

**How to read this.** In plain words the grant a place gives is a **pass**; the published wire field and the SPEC field remain `seat`. This file is the short core: a staged human read of what Shōkai is and how a visit works (~15 minutes). The full normative text — every MUST, every check id, every edge case — lives in [`docs/SPEC-DETAIL.md`](./docs/SPEC-DETAIL.md). **Which document wins:** the tagged release in the GitHub repository (`github.com/Kigenka/shokai`, tag `v0.5.0`) is canonical, and within it `docs/SPEC-DETAIL.md` is the normative text; the site and the npm package mirror it, and § numbers in every Shōkai document refer to it. Agents and implementers use the detail; people start here. Requirement ids (`C…`, `SC-…`, `G…`, `D…`) are stable across both. Wire tag: `shokai/0.5` (places still accept `shokai/0.3` for 90 days after release). History: [CHANGELOG.md](./CHANGELOG.md). Extensions: [extensions/README.md](./extensions/README.md). Shapes: [schema.json](https://github.com/Kigenka/shokai/blob/v0.5.1/schema/v0.5.0/schema.json).

*© 2026 Yu Sung Yeh. Licensed under the [Apache License 2.0](./LICENSE). Patent commitment (draft): [PATENTS.md](./PATENTS.md). Names and logo: [TRADEMARKS.md](./TRADEMARKS.md).*

---

## What it is

Shōkai (紹介, “introduction”) is an open protocol that gives online places a door for agents. Technically, it is a signed introduction layer: before any work begins, the place's door checks who sent the agent, why it came, and what its owner allows, all from signed facts.

A place (a tea shop, a store, a marketplace, a community, a bank, another person's agent — online places of any size) keeps a **door**. Its own agent — the **host representative** — stands there. A visiting **agent representative** (an agent acting for a person or organization) arrives and introduces itself: it proves who it is here for (its principal, bound by a signature), states why it came, and shows the limits its owner signed. The **door** decides whether to admit it, on signed facts; the **host representative** welcomes the visitor the door admitted. The visitor's conduct counts against its owner. A card proves authorization by the key bound to it (a passkey or key the owner controls); it doesn't by itself prove a legal identity or that a human took part: that needs other evidence or the place's own policy (§2, SECURITY.md).

This protocol defines that self-introduction, what the visitor asks, how the place answers (always machine-readable; with a lobby briefing when the visitor isn’t ready), how the visitor acts within signed limits, how it reports home, and how conduct has consequences. Agent-to-agent exchange happens only **inside** a place, at its door. Work after admission runs over MCP, A2A, or the place's own APIs.

The core story in five verbs: **arrive → introduce → ask → answer → act within limits**, then **report home**.

| Step | What happens | Detail |
|---|---|---|
| Who’s who | Roles; identity, cards, claims, keys | §1–§2 |
| Arrive | Listing and lobby are open to look at; anything personal happens at the door | §3 |
| Introduce | Card + optional vouch; `vouch: null` is a valid step every place accepts | §4 |
| Ask | Signed request inside a mandate (or allowance) | §5 |
| Answer | Machine-readable decision; lobby when not ready | §6 |
| Act | Passes and acts (wire field `seat`), spending holds, over-limit raises | §7 |
| Report | Owner consent where needed; visit report home | §8 |
| Conduct | Misconduct, records, consequences | §9 |
| Bindings | HTTP ritual; MCP after the pass | §11 |

---

## Roles (short)

- **Owner / principal** — the person or organization the visit is for. Signs cards and mandates with a passkey.
- **Visiting representative** — the agent at someone else’s door, carrying signed limits, loyal to its owner.
- **Host representative** — the place’s agent at the door. Loyal to the place’s owner.
- **Place / door** — the entrance. One public address; may run as several instances behind it.

Loyalty is to the owner who signed, never to the counterparty. Detail: [SPEC-DETAIL §1](./docs/SPEC-DETAIL.md).

---

## Identity in one page

Everything that matters is **signed**.

1. **Shōkai visitor card** — the owner’s passkey binds a representative key to a principal, purposes, and actions. Shown to the owner when signed.
2. **Shōkai host card** — the place’s owner binds the host representative to the place, its house digest, and duties (seat, hold purchases, …).
3. **Mandate** — per-errand (or continuing) limits: purpose, actions, `max_amount`, expiry. The representative’s ledger counts against it across visits (C175).
4. **Possession proof** — proves the representative key is live for *this* door and encounter (audience-bound under `shokai/0.5`).
5. **Envelope** — every message is a signed envelope; digests use JCS.

Names on the wire are claims, not proof of identity. Detail: [SPEC-DETAIL §2](./docs/SPEC-DETAIL.md), [SIGNING.md](./SIGNING.md).

---

## A visit, end to end

### 1. Arrive

The visitor sends a **greeting**. The door answers with a host nonce and its card (or a pointer). An unprepared visitor is never ignored: it gets a **LobbyBriefing** — one plain sentence per missing item for its owner — and a recoverable `not_now`. Live state (encounters, seats, holds) is bounded. Detail: §3.

### 2. Introduce

The visitor presents its card, a possession proof, and usually `vouch: null`. A vouch is optional and deliberate — typically before account opening or money. Detail: §4.

### 3. Ask

An **invitation_request** names purpose and actions inside a mandate (or under a standing allowance). Mandates under an allowance never exceed the grant. Detail: §5.

### 4. Answer

The place returns a machine-readable decision: admit with a **seat** (pass), deny, `not_now` with a reason and retry hint, or take it inside for consideration. Eloquence never decides; signed claims plus policy do. Detail: §6.

### 5. Act within limits

Inside a seat the visitor sends **acts**. Spending acts carry `amount`. The door counts against the **seat** ceiling and the **mandate** ceiling. Two concurrent uses of a single-use item: at most one succeeds, across every instance of the place (C270).

**Holding a purchase.** When the policy says so, a purchase can be held while the visitor asks its owner live. Nothing is charged until release; decline or silence releases the reservation.

**Holding above the limit (over-limit).** With `policy.limit_calls`, a spending act that fails only on amount may be held instead of refused. The door answers `act_held` with `over_limit { limit, current, proposed, seat, mandate }`:

- `limit` / `current` / `proposed` — the **binding** ceiling (the lower of seat and mandate), what already counts against it (including open holds), and that plus this act;
- `seat` / `mandate` — **both** per-visit and whole-mandate ceilings and currents, so the owner always sees both totals.

The owner approves with a **superseding mandate** bound to that hold (`supersedes.hold`). It raises nothing standing: one purchase, then used up. At release the door re-checks reserved totals against the signed ceiling (R8-01). An `approve_purchase` consent cannot raise a limit.

**Multi-instance honesty.** A place that holds purchases or counts spending and runs more than one instance **must share one durable-plus-live store** among those instances (seats, holds, mandate ledgers, used raises). A single-instance deployment is conformant without a shared store. Faking distribution — each instance with its own memory of holds — is not. Detail: §7, C230, C270.

### 6. Report home

The representative brings home only what needs the owner: decision, spend, holds, mismatches. Setup of cards and mandates happens through conversation; the owner signs what they read. Detail: §8.

---


---

## The door and the ritual (a little more)

A place publishes an **entry URL**. Looking is free: the listing and the lobby. Personal data and commitments happen only after introduction.

Typical message order under HTTP:

1. `greeting` → host nonce + host card (or pointer)
2. `introduction` (card, possession proof, optional vouch)
3. `invitation_request` (purpose, actions, mandate)
4. Decision: `invitation` + `seat_grant`, or `deny` / `not_now` / considering
5. Zero or more `act` / `act_result` (or `act_held` → `act_confirmation`)
6. `farewell`

Every answer that refuses says **why** in a `reason_code` and, when useful, how to retry (`after`, `with_credential`, …). The visitor never has to guess. Unknown decision values fail closed. Extension members are ignored unless listed in `crit` (must-understand).

**Clock and freshness.** Messages carry `sent_at`. Places bound skew; nonces and encounter ids are large and single-use. Detail: §2.2, §3.2, §6.

---

## Mandates, allowances, and ledgers

A **mandate** is what the owner signed for this errand (or a continuing mandate reused across visits). The representative keeps a **ledger** of operations and spend under each mandate id (C175, C176) and checks remaining room **before** sending an act. The door keeps its own matching ledger and is authoritative at the door.

A **standing allowance** lets the representative mint per-visit mandates under a grant, never above the grant’s ceilings, never for a place category the grant forbids. Over-limit holds are never used under an allowance: the place’s grant ledger caps spend, and a release cannot pass it.

When seat `max_amount` and mandate `max_amount` differ, the **lower** one binds for the visit. That is why over-limit figures carry both `seat` and `mandate` totals: the owner sees the visit and the whole errand together, including amounts still reserved by open holds.

---

## Decisions without persuasion

The place’s decision rests on:

- signed cards, proofs, mandates, and (when required) vouches or receipts;
- the place’s published policy (purposes, actions, limits, hold times, trust paths);
- counters the place already keeps (grant uses, probing, sign-up caps) where those are decision inputs.

It does **not** rest on the visitor’s wording. Anti-persuasion and determinism rules live in §6.4–§6.8 of the detail. A refusal always names an honest way in when one exists (another credential, wait until, come back with an introduction).

---

## Conduct and records

Places may keep relationship records: who visited, under what card, with what outcome. Misconduct (nonce reuse, seat overreach, forged proofs) can close the door for a key or a principal for a stated period — or forever for severe cases. Probe attempts outside the card’s scope count toward probing; setup failures (unsupported critical members) do not. Detail: §9.

The **inbound door** (§10) is the other direction: someone else’s agent knocking on the owner’s own representative. No data is given away for a gift; door-gifts are an extension.

---

## What a minimal implementer ships

**Browse-only Core Door.** Greeting, introduction, visitation seat, non-spending acts, lobby for the unprepared, HTTP binding. No money, no purchase holds, no allowance. The Node and Python minimal browse-door examples in `examples/` show the shape.

**Spending Core Door.** Everything above, plus mandates with `max_amount`, seat spend ledgers, optional purchase holds and over-limit raises, and — if more than one instance serves the place — one shared store for durable and live state.

**Core Visitor.** Card and mandate construction, possession proofs, local seat and mandate checks before acting, figure checks on `LimitRequest` before asking the owner, visit report home.

---

## Privacy posture (short)

Carry the least that does the job. Owner-facing records use verified place identifiers, not marketing names. Visit reports summarize; raw transcripts stay with the representative unless the owner asks. Retention defaults are stated in the house summary. Door-side analytics that a place owner might want later (arrivals, decisions, refusal reasons, spend and holds) are a 0.6 proposal — privacy-minimal, no visitor free text by default — see `ROADMAP-0.6.md` (the detailed analytics proposal is not shipped in this preview).



---

## Worked example (informative): tea for USD 40 under a USD 30 mandate

Fictional people only. Mika owns Kettle & Leaf. Aya’s representative Ren visits to buy tea.

1. Ren greets; the door returns a nonce and Mika’s host card.
2. Ren introduces Aya’s visitor card with a possession proof for this door; `vouch: null`.
3. Ren presents a mandate Aya signed: purpose `purchase`, action `tea.order`, `max_amount` USD 30.00.
4. The door seats Ren. Ren orders USD 20.00 — within limit; `act_result` ok. Seat spent 20; mandate spent 20.
5. Ren tries USD 40.00 with `hold_for_owner: true`. The door holds it over the limit:

   - binding: limit 30.00, current 20.00, proposed 60.00  
   - seat: limit 30.00, current 20.00  
   - mandate: limit 30.00, current 20.00  

6. Ren takes a `LimitRequest` home. Aya’s signing page checks the figures against Ren’s ledger. Aya signs a superseding mandate with `max_amount` 60.00 bound to that hold.
7. Ren confirms; the door re-checks reserved totals, releases the act, burns the raise. Seat spent is 60 against a signed seat limit of 30 — further spend in this seat needs another approval (or is refused).
8. Ren bids farewell and reports home: one purchase above the standing limit, owner-approved once.

If a second instance of the door had answered step 5, step 6’s intervening browse still works, but an intervening USD 10 spend is refused — the hold’s reservation lives in the shared store. Replaying the same raise after release is refused: used raises are durable.

---

## Glossary (short)

| Term | Meaning |
|---|---|
| Door | The place’s entrance for agents |
| Seat / pass | What admission grants; scopes tools and limits for the visit |
| Mandate | Owner-signed limits for an errand |
| Hold | A purchase waiting on the owner; amount reserved, not charged |
| Over-limit hold | A hold because the act exceeds the signed ceiling; needs a superseding mandate |
| Lobby briefing | Kind guidance for an unprepared visitor, for its owner |
| House digest | Digest of the place’s policy the host card binds |
| Summary digest | Digest of the short house summary served to visitors |
| Crit | Must-understand member list on a signed artefact |

---

## Stability promise for this release

- **Version named on the door.** Every door pointer, listing entry and lobby names the specification it implements: `spec_ref: {version: "0.5.0", url}`.
- **Wire tag** `shokai/0.5` is the 0.5.0 dialect; `shokai/0.3` remains accepted during the transition window.
- **Check ids** (including gaps) do not renumber; new rules get new ids.
- **Section numbers** in the detail document are stable for 0.5.x clarifications.
- **This short core** may grow clearer wording without moving normative force out of the detail.

When in doubt, implement the detail, test against the golden traces and the conformance runner, and keep the short core as the map you hand a new colleague.


<!-- check-summary -->Check range: C1…C301; 286 distinct checks (gaps retained).<!-- /check-summary -->

## Conformance classes (what “core” means)

| Class | Who | Roughly |
|---|---|---|
| **Core Door** | Every place | Door, ritual, lobby, decisions, seats, acts, HTTP binding |
| **Core Visitor** | Every visiting representative | Cards, mandates, checks before signing, ledger, report |
| **Extensions** | Opt-in | Gatherings, Peer meetings, Visit receipts, … — see [extensions/](./extensions/README.md) |

A claim names the class plus any extensions. Appendix F in the detail document maps every check. Browse-only places need no spending or purchase holds. Detail: [SPEC-DETAIL §0.1](./docs/SPEC-DETAIL.md), [conformance/homes.json](./conformance/homes.json).

---

## Bindings

- **HTTP (§11.1)** — one signed message per `POST` to the place’s entry; `ReplyEnvelope` back. Poll for late answers.
- **MCP (§11.3)** — after seating, the visitor calls seat tools on the place’s MCP server with the seat and a single-use signed act.

---

## Security in three lines

1. Decisions depend on signed artefacts and policy, never on persuasive wording.
2. Single-use items are claimed atomically with the decision they allow (C270).
3. Owner-facing text uses verified identifiers, never display names alone (C199). Full threat model: [THREAT-MODEL.md](./THREAT-MODEL.md). Detail: §12.

---

## Where the rest lives

| Need | Go to |
|---|---|
| Every MUST / check / edge case | [docs/SPEC-DETAIL.md](./docs/SPEC-DETAIL.md) |
| Message shapes | [schema/v0.5.1/schema.json](https://github.com/Kigenka/shokai/blob/v0.5.1/schema/v0.5.1/schema.json) (package 0.5.1; the released [v0.5.0 file](https://github.com/Kigenka/shokai/blob/v0.5.1/schema/v0.5.0/schema.json) is unchanged), [protocol-shapes.ts](./protocol-shapes.ts) |
| Golden traces & checklist | [conformance/golden-traces.md](./conformance/golden-traces.md) |
| Passkey signing UX | [SIGNING.md](./SIGNING.md) |
| Optional features | [extensions/README.md](./extensions/README.md) |
| Design decisions | [DECISIONS.md](./DECISIONS.md) |
| What changed | [CHANGELOG.md](./CHANGELOG.md) |

**Staged learning.** Read this file once. Skim the core story table in the detail. Dive into §2, §3, §5 and §7 when implementing. Let an agent hold the detail open while you work through a visit.

---

## Conventions (pointer)

RFC 2119 keywords in all capitals bind only in [docs/SPEC-DETAIL.md](./docs/SPEC-DETAIL.md) and the extension documents. This short core is informative except where it restates a rule with a check id; the detail wins on any tension. Traceability tags (`[C…]`, `[SC-…]`, …) are enforced by `node tools/trace-lint.mjs` over the detail and the extensions.

