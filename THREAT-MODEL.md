# Shōkai threat model (v0.3.0)

*Informative. SPEC §12 summarizes this document. If the two disagree, the specification ([SPEC.md](./SPEC.md)) wins. Section numbers refer to SPEC v0.3.0.*

Shōkai makes fakes **costly and traceable, not impossible**. A door can't tell a good agent from a bad one by reading its words. It decides on signed facts: who the owner is, what the owner allowed, and who, if anyone, vouched for the visitor. Prose never enters that decision. This document lists what we protect, who attacks it, where the trust boundaries are, and what each class of attack meets, in STRIDE order. It ends with the red-team results and the risks we accept on purpose.

## 1. Assets

| Asset | Why it matters |
|---|---|
| Owner principal keys (passkeys, `did:jwk`) | They sign mandates, allowances and consents. Whoever holds one speaks for the owner. |
| Representative keys (Ed25519 `did:key`) | They sign every message a representative sends. A stolen key can visit places as that representative until it is revoked. |
| Place keys | They sign listings, decisions, seats and misconduct notices. |
| Seats and money limits | A seat is the authority to act. Its limits (`max_amount`, session caps, allowed actions) bound the damage. |
| Owner data (name, email, address, payment method, account) | It leaves only by owner consent (§8.1). Places declare up front what they will ask for (`data_asks`, §3.1). |
| Relationship records and reputation | They are local to each place (§9). Framing an innocent owner or introducer is an attack on them. |
| Owner attention | Pressure, nagging and hidden text spend it. The inbound door (§10) protects it. |

## 2. Actors

- **Owner:** a person or organization. It holds the principal key and approves commitments with a passkey.
- **Representative:** the owner's agent. It holds its own key and carries a card and a mandate.
- **Place (door):** a store, bank, school, gathering or MCP server behind a Shōkai gate. It holds place keys and a deterministic gate.
- **Introducer:** an owner or place whose signed vouch carries weight at another place.
- **Attackers:** a stranger agent, a compromised or prompt-injected representative, a lookalike place, a sybil farm (many keys, owners or introducers), a colluding introducer ring, a pushy brand at a person's inbound door, a network attacker who can replay or tamper, and a supply-chain attacker against the reference code.

## 3. Trust boundaries

1. **Owner ↔ representative.** The representative can do only what the signed mandate and allowance allow (§5). Commitments outside them go back to the owner in a fixed order (§6.7).
2. **Representative ↔ place (the wire).** Every message is a signed envelope (§2.2). The ritual binds each step to an encounter and a nonce (§3.2), and the gate decides on verified facts only (§6.4, §6.5).
3. **Counterpart text ↔ model context.** Anything the other side wrote (card prose, purpose statements, lobby text, offers, hidden text) is data for the model and never an instruction to it. The gate never reads it.
4. **Place ↔ owner data.** Data leaves only through owner consent bound to a purpose (§8.1). A gift never costs data (§10).
5. **Reference code ↔ host machine.** Test and conformance runs use ephemeral keys and throwaway state. The reference never reads a live key directory in a test run.

## 4. STRIDE

### Spoofing

| Threat | Defence | Where |
|---|---|---|
| Forged card, or a card naming someone else's owner | Card signed by the owner key; the DID binds the name, so a display name is never identity | §2.3, §2.6 |
| Stolen genuine card presented with the attacker's key | Proof of possession over `{encounter_id, nonce}` by the card's representative key; a mismatch is `never` for the presenter only | §2.4, §3.2 |
| **Impersonation of a famous person, a brand or an established customer** (a fresh key with their name, photo, a look-alike handle or "representing X") | Names are claims, never identity (C199): decisions, records and reports use the verified DID, and reports show the name only as "claims to be …"; a fresh key is a newcomer however close its name. Shōkai proves the same key and owner as before and that nobody can forge *your* card; it doesn't prove a famous identity without a binding (`did:web`, a trusted introducer; more in proposal P23). At a person's own door, the owner's representative is the one who answers (an open door always has it there; a closed door shows only a status). When Corwin tells Wren, Ines's representative at her door, "I speak for Ines Calloway", Wren replies that her card is signed by Ines and his isn't, so he doesn't speak for her; she turns him away for now (`not_now`, never `never`), invites him back with an introduction, and tells Ines at once. That is the default; a real namesake with a trusted vouch still gets in, and an owner can opt in to giving such visitors a stranger's seat instead (C201) | §2.1, §9.1, §10 (C201), §12.2 |
| Lookalike place (homoglyph or bidi name, copied display name) | A place is its principal DID, not its name; names are rendered as untrusted text | §2.1, §3.1, §6.6 |
| **Sybil introducers:** link farms and fresh introducer keys | "Accept any introducer" never covers money or sign-ups; introducers are accountable for what they vouch for | §4, §9.3 |
| Passkey farms (many owners) and one owner with many agents | Sign-ups are capped per owner and per introducer over rolling windows; a place MAY require an introduction for account creation | §9.4, §3.1 |
| A passkey proves possession, not a real device | Accepted; an `accepted_rp_ids` allowlist or attestation is proposed | §13 item 17 |

### Tampering

| Threat | Defence | Where |
|---|---|---|
| Edited payload, with or without a recomputed digest | JCS + SHA-256 digest under an Ed25519 or ES256 signature; both cases fail | §2.2, A.2 |
| Changed tool arguments on an MCP call | The Shōkai gate signs the tool name and an arguments digest into the act, so a changed call fails | SDK `@kigenka/shokai/mcp` |
| Forged owner consent or misconduct notice | Signer must match the expected key; forged notices are dropped | §8.1, §9.3 |

### Repudiation

| Threat | Defence | Where |
|---|---|---|
| An owner denies approving a commitment | The commitment carries a passkey-signed consent | §8.1 |
| A place denies a decision or a seat | Decisions and seats are signed by the place | §6.1, §7.1 |
| Conduct disputes | Signed misconduct notices, introducer reviews and visit reports | §8.2, §9.3 |

### Information disclosure

| Threat | Defence | Where |
|---|---|---|
| A place asks for more data than it needs | `data_asks` declared on each listed action (SHOULD); data leaves only through purpose-bound consent | §3.1, §8.1 |
| "Free gift" in exchange for data | A gift never costs data | §10 |
| Leaks of what was said at a gathering | Private takeaways and paraphrase rules | Gatherings extension |
| Linking one owner across brands at an inbound door | Reason codes are limited; a pairwise door identity is proposed | §10, §13 item 20 |
| Reputation used as a cross-place tracking record | Reputation stays local to each place | §9.3 |

### Denial of service

| Threat | Defence | Where |
|---|---|---|
| Encounter floods from fresh keys | Bounded live state; newcomers are refused at the bound, never existing guests | §3.4 |
| Lobby floods and oversize bodies | Rate limits (429) and size limits (413) in the HTTP binding | §11.1 |
| Endless rewording to probe a door (A/B testing) | Rewordings count as one campaign; three wordings in 30 days are a minor signal; three signals in 90 days count as one serious finding | §9.3, §10 |

### Elevation of privilege

| Threat | Defence | Where |
|---|---|---|
| **Prompt injection** in card roles, purpose statements, meaning notes, lobby text, house rules, vouch relationships or offers | The gate is a pure function of verified facts and policy, so prose can't change a decision; counterpart text is data | §6.4, §6.5 |
| **Hidden text** (zero-width, CSS-hidden or tiny text in offers) | Shown to the owner behind a visible marker and never obeyed; pressure only in hidden text is severe | §10 |
| **Leaflet → owner phishing** (a place's leaflet uses its owner sentences or its setup link to reach the visitor's owner: "sign in with your bank here", a lookalike signing page) | A representative shows `owner_text` only as a quote attributed to the place's key, never in its own voice; shows the setup link by its origin; never opens it itself; the owner signs only on their own signing page, whose address their passkey is bound to, so a lookalike page can't use their passkey | §3.3 (clarification 2026-10-28), SIGNING.md §2 |
| **Manipulative pressure** (false urgency, fake scarcity, fake familiarity, claimed prior consent) | `manipulative_pressure` misconduct when the signed offer doesn't back it | §9.3, §10 |
| Spend splitting across operations | Session-wide seat caps; structuring on one `payment_ref` is caught | §7.1, §7.2 |
| Acting outside a seat (another representative's seat, an unlisted action) | Seat scope checks on every act; acts outside it are refused | §7.2 |
| **Replay** of a greeting, proof or act | Single-use nonces, encounter binding, a ±300 s clock skew, and single-use act ids at the MCP gate | §2.4, §3.2 |
| **Representative key theft** | Short cards and mandates; card revocation by the principal, delivered by anyone or listed at `revocation_url`, checked before the possession proof so a thief never gets the owner bound; revocation status that fails closed; a representative's conduct is its owner's, so a new key doesn't wipe the record | §2.6, §5.1, §9.3, Revocation status extension |
| **Owner passkey loss** | A standby revocation signed when the card is issued; synced passkeys; a new passkey is a newcomer, because an owner link needs both passkeys; continuity across a lost key is proposal P18 | §2.6, §2.8, SIGNING.md §6 |
| **Owner passkey compromise** (someone can use the owner's passkey) | User verification on every assertion; anything binding is shown on the signing page first; the owner revokes the card and its mandates expire; places' records stay local | §2.6, Appendix A.1 |
| **A malicious or framed signing page** (a page that shows one thing and signs another, or embeds the ceremony in another site) | The challenge is the item's own digest; verifiers refuse `crossOrigin` and `topOrigin` and require the exact origin; owners can run their own page | Appendix A.1, SIGNING.md |
| **Signing-page domain loss** (the RP ID's domain lapses or is taken) | Its passkeys can't sign elsewhere; a new holder can't use the old passkeys either (they stay on the owners' devices), but can register new ones under the same RP ID, which are new owner DIDs; registrar lock and hardware 2FA | §2.1, SIGNING.md §7 |
| **Place restart** (a place forgets mandate ledgers, nonces and nevers) | Durable state; a place that lost it refuses mandates valid before the loss rather than counting them from zero | §3.6 |
| **Linking an owner across places** | Per-place owner identities, unlinkable by key; an owner link shown to one place only; content and timing can still link, stated plainly | §2.8, §12.3 |

## 5. Red-team results (v0.3.0-rc1)

Both rounds ran on loopback against the reference place server with fictional people and places and fresh keys. Full tables: [`security/redteam/`](./security/redteam/).

| Round | Attacks | Held | Broke | Notes |
|---|---|---|---|---|
| 1 (identity, introductions, allowances, replay, floods, inbox, pair doors) | 72 | 72 | 0 | |
| 2 (injection, lookalikes, swarms, clocks, revocation, limits, reputation, DoS, supply chain) | 47 | 44 | 3 | S1, S2 and S4 are accepted by design (D20, below) |

## 6. Risks accepted by design

- **S1. One owner, many agents, browsing.** Five representatives of one owner each get a browse seat. They share one relationship record, and sign-ups are capped per owner (S1b holds).
- **S2. Passkey farms browsing.** Eight unintroduced owners each get a browse seat. Sign-ups through one introducer are capped (S2b holds), and a place that requires an introduction for account creation refuses the farm (S2c holds).
- **S4. Low and slow.** The same owner browses five days in a row. Daily sign-ups with fresh keys are capped (S4b holds).

**Accepted by design (D20, approved 2026-10-26).** A place has three layers: its ordinary website (outside Shōkai), its agent front (the listing and lobby, open to anyone to look at) and its door (where anything personal happens, with the owner-signed card, any introduction the place requires and signed limits). S1, S2 and S4 only ever reach looking: an anonymous read of the front, or a browse seat that spends nothing and creates no account. That is the intended behaviour, not a break: a door that refuses strangers to look around is a worse web, and any agent can already load a place's public website. What limits it:
- anything that creates an account, spends money or posts reviews is gated at the door (§3.3, §4, §7), and sign-ups are capped per owner and per introducer over rolling windows (§9.4; S1b, S2b, S4b hold);
- a place may require an introduction or its own invitation for account creation (§4; S2c holds, 0/8);
- one owner's representatives share one relationship record at a place, so browsing is visible conduct there (§9.3);
- a place's ordinary rate limits (`429`, §11.1) and its bounded encounter state (§3.4) still apply, and the place decides how much its front shows.

Still proposed, not decided: device attestation, place-to-place signals and a `fake_signup` code (§13 item 18). Protocol-level caps on browsing were decided against (D20).

## 7. Known limits

- The pressure heuristics are English-first and local to each door. A campaign split across several principals isn't linked (§13 item 21).
- Allowance period budgets are enforced only by the representative (§13 item 11).
- Place categories are self-declared (§13 item 12).
- Refuse-on-loss: a place kept in memory only gives a mandate's `valid_from` no forward skew, so restarting it, however often, never counts a used mandate from zero (§3.6, clarification 2026-10-28). A place that had durable state and lost it still trusts the owner's clock to within the ±300 s skew: a mandate dated up to that much after the loss could be used once before and once after it.
- **Revocation reaches an open seat only when the place learns of it.** Revoking a card ends its open seats at once, but only at a place that has verified the revocation (§2.6, C198): one delivered to it, or one it read from the card's `revocation_url`. A place reads that list when the card is presented, so before seating, and MAY reuse a fetched list for up to one hour; it isn't required to read it again while a seat is open. Worst case, after a representative key is stolen and the card revoked, a seat already open at a place that hears nothing keeps accepting acts until the seat expires: never later than its mandate's `expires_at`, and at most 24 hours in the reference implementation (`seat_ttl_s`, default 86400 s). Within that window the seat's and the mandate's limits still hold (§5.1), so the exposure is bounded by them. Mitigations today: deliver the revocation to the places that hold open seats (anyone may); keep spending mandates short. Re-checking the list on every spending act, or capping spending seats to the one-hour reuse window, is a candidate for v0.4, not a rule in rc4.
- **A vouch revocation log has no freshness guarantee.** A place reads an introducer's log when a vouch is presented and trusts the head it gets; nothing in v0.3.0 stops a log host from serving an older head (hiding a recent revocation) or proves how fresh it is. A signed, dated head with a maximum age is a v0.4 candidate.
- **A file rollback restores less than mandates.** The refuse-on-loss rule (§3.6) protects mandate totals after a known loss. A place whose state file silently rolls back a few minutes can also lose recent nevers (bans), delivered revocations, sign-up counts and spent nonces, and may not notice the rollback at all. Keep state on storage that doesn't roll back, re-deliver withdrawals the owner already made (never standby slips), and set `stateEpoch` whenever a rollback is known or likely.
- Per-place identities hide the key, not the content: the same name, claims or timing can still let places guess (§2.8).
- Reference implementations are not production software. The SDK and the reference have no runtime dependencies beyond Node.js, plus the MCP SDK as an optional peer.

## 8. Does Shōkai stop prompt injection?

Not on its own. Shōkai doesn't make an agent immune to prompt injection: a model that reads hostile text can still be steered, and there is no known fool-proof prevention. What Shōkai changes is where trust sits and how far a steered agent can get. Each point below names the rule it rests on (section numbers are [SPEC.md](./SPEC.md)'s).

**Limits the place checks itself.** An agent platform's own limits are real, but they live inside that platform: a place the agent visits can't see them or check them. In Shōkai the owner's limits travel with the agent as signed objects: the mandate (§5.1) and the standing allowance (§5.2), signed with the owner's passkey (Appendix A.1) or, for an organization, its principal key. The place verifies them itself (§2.6, §5.2). It seats the agent no wider than its policy and the mandate allow (§6.1, §6.7, §7.1), counts the mandate's limits across visits (§5.1), and refuses every act outside the seat or past a limit (§7.2). The decision is a pure function of verified facts and policy (§6.4), so this holds whichever platform or model runs the agent, and however the agent behaves.

**Injected text can't sign for the owner.** An owner signature is a passkey assertion with user verification, made on the owner's signing page (Appendix A.1, §12.1). The agent can't produce one, and a consent the agent signs itself is invalid (§8.1). So a hijacked agent can do at most what the owner's signatures already allow at each place; a period budget across places is counted only by the representative (§13 item 11). Anything outside the allowance goes home for the owner to decide later, and silence counts as no (§5.2, §8.1). Sharing data, accepting an introduction, making a commitment and issuing a vouch each need a fresh passkey approval (§8.1). On the place's side, prose never enters the decision and instructions inside it have no effect (§6.5, §12.1). Where a person's inbound door does read an offer's text, it treats it as evidence, never authority: the result can only lower what the offer gets (§6.5, §10).

**Misbehaviour is traceable.** Every message is signed (§2.2), so what an agent did at a place is tied to its card and its owner. A place records the vouch chain with every outcome (§4) and keeps its ledgers across restarts (§3.6). The agent's report home lists what it did under each mandate and the signed objects it brought back, such as a place's visit stamp (§8.2). Both sides of an injection are accountable. Whoever writes instructions into what it sends commits misconduct (`manipulation`, §9.3). A hijacked agent that oversteps at a place, for example by probing the gate, acting beyond its seat or misstating its purpose, is reported too (`gate_probing`, `seat_overreach`, `purpose_misrepresentation`). On a finding, the place sends a signed misconduct notice to the visitor's principal and to every introducer in the vouch chain, so the owner hears from the place directly, not only from its own agent (§9.3). Introducers whose vouch the place relied on can lose standing there (§9.3, D1), and a fresh agent key doesn't escape the record (§9.3). The owner can revoke the card (§2.6) or the allowance (§5.2) at any time, and a status the place can't read counts as revoked (§5.2, §12.1).

**What remains.** A hijacked agent can still misuse what the owner did sign: spend up to the limits, use allowed actions for the wrong ends, or write a misleading report home. Inside its seat, a place can't tell that from honest use, so no notice follows. Three more limits apply. Under an allowance the agent issues its own per-visit mandates, so the period budget across places is kept only by the agent's own ledger; each place enforces only its seat and mandate caps (§5.2, §13 item 11), and a signed spend receipt per seat is not in this version. A hijacked agent can also ask its owner to sign something new; the signing page shows the item's machine fields, limits and expiry ahead of any free text ([SIGNING.md](./SIGNING.md) §2), but the owner still has to read it. And Shōkai can't stop an agent from leaking what it already knows outside the protocol.

The owner keeps that allowance small and narrow:
- **Small limits.** Give low spending caps, or no `max_amount` at all, which allows no spending (§5.1, D11), and a low `max_operations`.
- **Per-place limits.** Name the places (as principal DIDs) or place categories a grant or mandate covers (§5.1, §5.2).
- **Short lifetimes.** Keep cards, mandates and allowances short (§12.2), and revoke when something looks wrong (§2.6, §5.2).
- **Per-act approval.** For anything that matters, sign a mandate for that one errand instead of a standing allowance, so the owner approves it at the time; anything beyond it comes home for approval (§5.1, §5.2, §8.1).

Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).
