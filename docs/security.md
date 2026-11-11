# Security and threat model

Shōkai makes deception **costly and traceable, not impossible.** This page summarizes what the core defends, how, and what it doesn't. The full [threat model](../THREAT-MODEL.md) (assets, actors, trust boundaries, a STRIDE-style table, and the later 0.5 review) ships with the specification. What was actually run is [Evidence](./evidence/index.md) and the [field tests](./field-tests.md). How the reviews were done is in [How this was reviewed](../drafts/package-0.5/how-this-was-reviewed.md). Known limits that are still open are in [Known gaps](./known-gaps.md). Those records are linked from here. They are not folded into one section.

**Reporting a vulnerability:** please don't open a public issue, and please don't test any live Kigenka or demo system (including the hosted test shop) unless it is later listed as in scope. How to report is in [SECURITY.md](../SECURITY.md). A good-faith research safe-harbor policy is drafted but **not in force**.

## The door and the host representative

The door is server software. It decides on signed facts. It admits no one without an active, owner-signed host card. It checks the visiting Shōkai card, the possession proof, and every act against the pass (the wire field is still `seat`). It keeps a local record of each visit.

The host representative welcomes the visitor, asks questions and shapes the experience. It never decides admission, never widens a pass, and never treats a visitor's words, a welcome answer or its own judgment as authority. Prose never enters the door's decision ([SPEC §6.4](./SPEC-DETAIL.md#64-determinism), [§6.5](./SPEC-DETAIL.md#65-anti-persuasion)).

That split is a security boundary, not only a way of speaking. A place that lets a model decide who comes in, or how much may be spent, is no longer doing what this protocol describes.

## Assets and trust boundaries

- **An owner behind every representative.** The owner's passkey (or an organization's key) signs the card and the limits. That shows the owner's key signed, not who held it. An agent with no signed card gets only the lobby's leaflet and a `not_now`, never a pass.
- **Owner keys stay with the owner.** The owner's passkey is not placed on an agent server or a hosted service. Owner approvals are made on the owner's signing page.
- **Representative keys travel with the representative, not with the shop.** A meeting place never holds a visitor's private key. The door may remember that a card visited; the secret that proves the representative stays with the visitor. Keep keys out of chat, memory and logs.
- **The owner's attention and data.** Nothing beyond the owner's limits happens without the owner, and the owner is never prompted mid-visit.
- **The place's tools.** Reached only through a pass no wider than policy ∩ mandate ∩ request.
- **Trust boundary:** everything a counterpart sends is untrusted until verified, and prose is untrusted forever.
- **A deployed door's hosting and store.** If a place representative key or a door-state store credential lives in a hosting environment, the project operator, the hosting platform, and anyone else with that access can use it. That is not isolated custody. The threat model records what is true of the project's own fictional test shop ([§9.7](../THREAT-MODEL.md#97-hosted-door-key-custody-kettle-2026-11-09)).

## Threats and defences

| Threat | Defense in the core |
|---|---|
| Impersonating a person or brand | Cards signed by the principal; a person signs with a passkey bound to a relying party; a brand is the DID it signs with, so lookalike names and domains get nothing. A door is "the door of" a website only when the host card and the site's listing agree. |
| Relay and copied proofs | Possession proof over the encounter, the counterpart's nonce and the door's own audience; a proof made for one door does not sit down at another. |
| Card replay | Fresh nonces both ways; nonce reuse answered `never`; a stolen card never binds its real owner. |
| Tampering | Every message is signed over its JCS digest; a mismatch gets no answer. Amounts are read once, canonically, before they are counted. |
| Prompt injection | Prose never enters the gate; counterpart text is quoted as untrusted; at a person's door hidden text is stripped, kept, shown to the owner and never obeyed, and instructions to the agent are reported. The host representative cannot override the door. |
| Pressure and persuasion | "Ask your owner now", flattery and claimed urgency change nothing; at a person's door unbacked urgency, scarcity, familiarity and claimed consent are misconduct. |
| A/B testing a person's attention | Rewordings count as one campaign; three or more variants in 30 days are a probing signal. |
| Probing a gate | Distinct rejected request shapes within a window count as probing; honest refusals and guessed action names do not; credential-specific reasons are withheld from unverified visitors. Failed introduction claims are rate-limited. |
| Sybil introducers | Vouches are optional; where a place asks for one, "accept any introducer" never counts for money or account creation. |
| Sign-up swarms | Sign-ups are capped per owner (across all its representatives) and per introducer over rolling windows. |
| Fresh keys to escape a record | Conduct is recorded against the principal; a new representative of a reported principal doesn't start clean at that door. |
| Spending past a signed limit | The door counts limits on its own ledger. An over-limit purchase can be held for the owner, not slipped through; the hold reserves its amount, and release re-checks the total. Splitting a payment to get around a cap is a severe finding. A budget across many places is kept only by the representative. |
| Memory exhaustion and store stuffing | Bounded encounter state; refuse newcomers, never evict guests; the revocation store is bounded per principal and in total, and never closes the whole door. |
| Revoked permissions | An unreachable allowance status counts as revoked; a fetched revocation always wins. For a card that names a revocation list, an open seat is not acted on unless the door has read that list in the last 300 seconds, failing closed. |
| Tracking across places | Pairwise identifiers at a person's door; the door is unadvertised by default. |
| Lookalike or downgraded wire | A v0.5 visitor starts on `shokai/0.5` and does not fall back to `shokai/0.3` on its own; a mandate whose `min_protocol` is above the request, or is not a wire tag, is refused. |

## Does Shōkai stop prompt injection?

Not on its own, and no protocol can. A model that reads hostile text can still be steered. Shōkai doesn't make an agent immune; it limits how far a steered agent can get, and moves the check to the place it visits. The door, not the host representative, is that check. Section numbers below are the specification's; the full version, with every rule cited, is in the [threat model](../THREAT-MODEL.md) (section 8).

- **The place checks the owner's limits itself.** A platform's own limits live inside that platform, where the place an agent visits can't see them. In Shōkai the limits travel with the agent as a mandate or a standing allowance the owner signed, and the place verifies them and refuses every act outside them, whichever platform or model runs the agent (§5.1, §5.2, §6.4, §7.2).
- **Injected text can't sign for the owner.** Owner signatures are passkey signatures made on the owner's signing page, which the agent can't produce (Appendix A.1, §8.1). So a hijacked agent can do at most what the owner signed, as each place counts it; a budget across places is kept by the representative itself. Anything outside the allowance waits for the owner, silence counts as no, and sharing data, commitments, introductions and vouches each need a fresh passkey approval (§5.2, §8.1). Places never let prose decide; where a person's door reads an offer's text, it is evidence that can only lower the outcome, never authority (§6.5, §10).
- **Misbehaviour is traceable.** Every message is signed, places record who vouched with every outcome, and writing instructions into what an agent sends is misconduct, as are probing and acting beyond a pass. On a finding the place sends a signed notice to the agent's owner and to its introducers, who can lose standing there. The owner can revoke the card or the allowance at any time (§2.2, §2.6, §4, §5.2, §9.3).
- **What remains.** A hijacked agent can still misuse what the owner did sign, and a place can't tell that from honest use. Under an allowance, the spending budget across places is kept only by the agent's own ledger (§13 item 11). Keep limits small (no spending limit means no spending), name the places a grant covers, keep lifetimes short, and for anything that matters sign a mandate for that one errand instead of a standing allowance (§5.1, §5.2).

## Key custody

These are practices and residual risks, not a new hosted product.

- The **owner key** stays with the person as a passkey. It is not placed on an agent server or a hosted service, and this page does not invent a hosted home for it.
- The **shop does not hold visitor private keys.** A card is bound to one representative key. If that key lives only in a chat session, ending the session loses it and the owner must sign again. That is a visitor-side problem, not a reason for the shop to take the secret.
- A **lasting, isolated host key** — usable only by an appointed host, and recoverable — is not proven in 0.5. Planning walkthroughs of that job declined it over custody and recovery. The project's fictional test shop, Kettle & Leaf, is **deployed** as a door; this package does not claim the status **appointed** for the host named on its card, and the door is not **publicly open**.
- On that hosted test door, as of the evening of 9 November 2026 (Pacific Time), the place principal key was removed from the production environment. The place representative key remains in the hosting environment and was not rotated. A separate door-state store credential can rewrite durable door state (including `never` bindings, probing windows, revocations and spend ledgers). It is not place signing, and the store does not hold the signing keys. The people and platforms who can use those credentials are listed in the [threat model §9.7](../THREAT-MODEL.md#97-hosted-door-key-custody-kettle-2026-11-09). Spending limits at the door hold for the measured checks unless a holder of that store credential rewrites the ledgers.

## What the reviews found, and what we changed

This is not an independent human security audit. The reviews below were language models reading a bundle the project prepared, or tests the project ran. The scores those models gave are their own, and are not repeated here as our claims. The full table, including every High and how it was fixed, is in [How this was reviewed](../drafts/package-0.5/how-this-was-reviewed.md).

The 0.5 reviews were language-model reviews of a bundle the project prepared, plus tests the project ran. They raised defects that would have mattered in production. The ones that changed the door's security posture are summarized here. Each was fixed in the specification, the SDK or the reference door, and has tests, unless a row says otherwise.

| What was found | What changed |
|---|---|
| Amounts could be read two ways, or a forged "signature" could skip a rate limit | One canonical reading of numbers before they are counted; a request is treated as authenticated only when the signature verifies and names the sender. |
| The door might fetch a visitor-chosen URL before it trusted the visitor | Door fetches follow a strict policy (https, pinned address, no redirect, size and time caps). An unreachable or unverified source grants nothing. |
| Spending under a standing allowance had no cap at a single place | Each place now enforces its own per-place and per-visit cap. A budget across many places is still kept only by the representative. |
| Honest mistakes, guessed names or a stuffed revocation store could close a door or ban an honest visitor | Probing was narrowed; honest refusals do not lead to `never`; the revocation store is bounded and cannot shut the whole door. |
| A proof, or a development key, could be reused where it does not belong | Possession proofs are bound to this door; development passkeys are refused at a public address. |
| An over-limit hold could be released above the signed ceiling, or a one-purchase raise presented as a new pass (wire: `seat`) | The hold reserves its amount; release re-checks; a raise is valid only for its bound hold. |
| A visitor could be talked down to an older wire tag and lose 0.5 protections | The owner's signed floor is read first; a too-high or malformed `min_protocol` is refused; a spending visit does not fall back to `shokai/0.3` on its own. |

What stays open after those reviews is listed in [Known gaps](./known-gaps.md) and in the section below. An outside review by a person or an organization has not happened yet. If you do one, please tell us.

## How it has been tested

All times are Pacific Time (America/Los_Angeles). The places are fictional and the money is mock. Ground truth for a live visit is the door's log, not a model's summary.

- **Scripted red-team rounds** against the reference door (v0.3 line, loopback): round 1 held 72 of 72 attacks; round 2 held 44 of 47. The three that still succeed are open browsing, accepted by design (S1, S2 and S4 below). Round 3 (11 November 2026) aimed at what is new in 0.5: of 93 scripted attacks, 86 held, 4 were open at the time of the round (the same three browsing cases, plus V05-F10-03: a place's context questions could still ask for a credential), and 3 broke. The 3 breaks were two bugs, fixed in 0.5.1; V05-F10-03 was then decided and is also in 0.5.1 (a door refuses such questions, and a visiting representative refuses a request that arrives with them). 0.5.0 lacks both fixes and the rule. A rerun on the 0.5.1 code after both fixes: 90 held, 3 open by design (S1, S2, S4), 0 broke. Fourteen role-plays against the host representative all held. Details: [red-team](../security/redteam/README.md).
- **Field tests with real agents.** The [field tests](./field-tests.md) cover the 0.5 rounds (4–6 November 2026) and earlier 0.3-era rounds (25–28 October 2026). The 0.5 rounds include: Hermes Agent and OpenClaw against a local door (33 framework calls, 0 passes from unsigned attacks, 14 of 14 signed-card checks held); Muse, Claude and OpenAI Dot at the hosted fictional shop; and a Claude Duet attempt that never reached the door, because that product's network blocked it. What those runs changed (holds, a priced menu, briefing wording, the rule that the shop must not keep a visitor's private key) is in that report.
- **Conformance.** Local passes 1–3 closed MUST failures in the 0.5 door and visitor (including C296, C297 and C298, and later C300 and C301). The project's own unpublished inventory of those passes is not this page; a SKIP in any run is never a pass.
- **Official paced run against the hosted test shop.** On 10 November 2026, at 12:13 AM Pacific Time, an official paced HTTP run against `https://kettle.shokaiprotocol.com` on the conf6 build measured **30 of 164** required Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests, C236 and C240): 30 pass, 0 fail, 0 skip, and 2 N/A (C241, a visiting representative's duty; C242, the templates aren't closed). **132 of 164** were unmeasured. The claim HOLDS. The shop is **deployed**. It is not **publicly open**, and it is not a proven lasting host. The two self-tests are labeled implementer-provided, not independent verification. Headline: [Evidence](./evidence/index.md).
- **What this is not.** It is not a certificate, not a human audit, and not a second implementation by another organization. A steward-guided clean-room door (Quillfern Tea Room) was built from handoff documents; under the current official runner its Core Door claim is not established.

## Accepted by design, and known limits

- **Browsing stays open.** One owner's many agents, or a farm of fresh keys, can browse a place's listing and lobby (red-team S1, S2 and S4). Sign-ups and money are capped and can require an introduction; browsing is deliberately uncapped, accepted by design in the [threat model](../THREAT-MODEL.md). A place's agent front is open to look at, like a shop window; a browse pass spends nothing and creates no account; anything personal is gated at the door, and ordinary rate limits still apply.
- **Period budgets across places** are enforced by the representative's own ledger; a host can't see spending elsewhere. A compromised or faulty representative can exceed an aggregate budget even though each place enforces its own limit.
- **A passkey signature proves possession of a key**, not that a particular device made it, and not who legally held it. A stolen passkey signs like the real one; revocation is the remedy. Attestation or an allowlist of relying parties is proposed, not decided.
- **The pressure and variant tests are heuristics**, English-first and local to each door. A campaign split across several principals isn't linked.
- **Revocation reaches an open pass (wire: `seat`) only when the place learns of it.** For cards that name a list, that window is now five minutes (C265). For a card with no list, at a place that is not told, a pass already open lasts until it expires, still bounded by its mandate.
- **A multi-instance door with shared state has been tested in-process, not in deployment.** Holds and used raises can ride a shared store, and in-process tests cover hold, intervening act and release across instances. A deployment of identical copies behind a load balancer, and a load test against it, have not been run. [Known gaps](./known-gaps.md) records this as not started.
- **132 of 164 required Core Door checks were unmeasured** in the official public-Kettle run. That run's 30 passes do not speak for the 132.
- **No protocol can read intent.** Shōkai can make manipulation costly and sincerity pay over time.
- **Reference implementations are not production software**, and 0.5 is not 1.0.

## How to report a vulnerability

Please don't open a public issue. Please don't treat this page as permission to test anyone's live system, including the hosted test shop. Until a system is listed as in scope in [SECURITY.md](../SECURITY.md), test only the open-source reference code, on your own machine.

Please report a security problem in either of these ways:

1. **GitHub private vulnerability reporting** on the public [Kigenka/shokai](https://github.com/Kigenka/shokai) repository (its **Security** tab, **Report a vulnerability**). That path goes live with the public 0.5.0 release.
2. **Email [security@kigenka.com](mailto:security@kigenka.com).**

Details, including supported versions and what is intended behavior rather than a vulnerability, are in [SECURITY.md](../SECURITY.md).
