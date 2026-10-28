# Security and threat model

Shōkai makes deception **costly and traceable, not impossible.** This page summarises what the core defends, how, and what it doesn't. The full [threat model](../THREAT-MODEL.md) (assets, actors, trust boundaries, a STRIDE-style table mapping every red-team item to its rule and test) ships with the specification.

**Reporting a vulnerability:** please don't open a public issue. Use GitHub private vulnerability reporting on the repository (its **Security** tab, **Report a vulnerability**), or email security@kigenka.com. Details are in [SECURITY.md](../SECURITY.md).

## Assets and trust boundaries

- **An owner behind every representative.** The owner's passkey (or an organization's key) signs the card and the limits. That shows the owner's key signed, not who held it; an agent with no signed card gets only the lobby's leaflet and a `not_now`, never a seat.
- **Owner keys** (passkeys) and **representative keys** never leave their holders. A meeting place never holds representative private keys. Keep keys out of chat, memory and logs.
- **The owner's attention and data.** Nothing beyond the owner's limits happens without the owner, and the owner is never prompted mid-visit.
- **The place's tools.** Reached only through a seat no wider than policy ∩ mandate ∩ request.
- **Trust boundary:** everything a counterpart sends is untrusted until verified, and prose is untrusted forever.

## Threats and defences

| Threat | Defence in the core |
|---|---|
| Impersonating a person or brand | Cards signed by the principal; a person signs with a passkey bound to a relying party; a brand is the DID it signs with, so lookalike names and domains get nothing |
| Card replay and copied proofs | Fresh nonces both ways; possession proof over the counterpart's nonce; nonce reuse answered `never`; a stolen card never binds its real owner |
| Tampering | Every message is signed over its JCS digest; a mismatch gets no answer |
| Prompt injection | Prose never enters the gate; counterpart text is quoted as untrusted; at a person's door hidden text is stripped, kept, shown to the owner and never obeyed, and instructions to the agent are reported |
| Pressure and persuasion | "Ask your owner now", flattery and claimed urgency change nothing; at a person's door unbacked urgency, scarcity, familiarity and claimed consent are misconduct |
| A/B testing a person's attention | Rewordings count as one campaign; three or more variants in 30 days are a probing signal |
| Probing a gate | Distinct rejected request shapes within a window count as probing; credential-specific reasons are withheld from unverified visitors |
| Sybil introducers | Vouches are optional; where a place asks for one, "accept any introducer" never counts for money or account creation |
| Sign-up swarms | Sign-ups are capped per owner (across all its representatives) and per introducer over rolling windows |
| Fresh keys to escape a record | Conduct is recorded against the principal; a new representative of a reported principal doesn't start clean at that door |
| Structuring payments | Seat limits apply cumulatively; a session-wide cap holds even under per-operation limits; splitting is a severe finding |
| Memory exhaustion | Bounded encounter state; refuse newcomers, never evict guests |
| Revoked permissions | An unreachable allowance status counts as revoked; a fetched revocation always wins |
| Tracking across places | Pairwise identifiers at a person's door; the door is unadvertised by default |

## Does Shōkai stop prompt injection?

Not on its own, and no protocol can. A model that reads hostile text can still be steered. Shōkai doesn't make an agent immune; it limits how far a steered agent can get, and moves the check to the place it visits. Section numbers below are the specification's; the full version, with every rule cited, is in the [threat model](../THREAT-MODEL.md) (section 8).

- **The place checks the owner's limits itself.** A platform's own limits live inside that platform, where the place an agent visits can't see them. In Shōkai the limits travel with the agent as a mandate or a standing allowance the owner signed, and the place verifies them and refuses every act outside them, whichever platform or model runs the agent (§5.1, §5.2, §6.4, §7.2).
- **Injected text can't sign for the owner.** Owner signatures are passkey signatures made on the owner's signing page, which the agent can't produce (Appendix A.1, §8.1). So a hijacked agent can do at most what the owner signed, as each place counts it; a budget across places is kept by the representative itself. Anything outside the allowance waits for the owner, silence counts as no, and sharing data, commitments, introductions and vouches each need a fresh passkey approval (§5.2, §8.1). Places never let prose decide; where a person's door reads an offer's text, it is evidence that can only lower the outcome, never authority (§6.5, §10).
- **Misbehaviour is traceable.** Every message is signed, places record who vouched with every outcome, and writing instructions into what an agent sends is misconduct, as are probing and acting beyond a seat. On a finding the place sends a signed notice to the agent's owner and to its introducers, who can lose standing there. The owner can revoke the card or the allowance at any time (§2.2, §2.6, §4, §5.2, §9.3).
- **What remains.** A hijacked agent can still misuse what the owner did sign, and a place can't tell that from honest use. Under an allowance, the spending budget across places is kept only by the agent's own ledger (§13 item 11). Keep limits small (no spending limit means no spending), name the places a grant covers, keep lifetimes short, and for anything that matters sign a mandate for that one errand instead of a standing allowance (§5.1, §5.2).

## Accepted by design, and known limits

- **Browsing stays open.** One owner's many agents, or a farm of fresh keys, can browse a place's listing and lobby. Sign-ups and money are capped and can require an introduction; browsing is deliberately uncapped, accepted by design in the [threat model](../THREAT-MODEL.md). A place's agent front is open to look at, like a shop window; a browse seat spends nothing and creates no account; anything personal is gated at the door, and ordinary rate limits still apply.
- **Period budgets across places** are enforced by the representative's own ledger; a host can't see spending elsewhere.
- **A passkey signature proves possession of a key**, not that a particular device made it. Attestation or an allowlist of relying parties is proposed.
- **The pressure and variant tests are heuristics**, English-first and local to each door. A campaign split across several principals isn't linked.
- **No protocol can read intent.** Shōkai can make manipulation costly and sincerity pay over time.

## How it has been tested

As of the v0.3 core draft, inside the project: a clean-room implementation by a sandboxed agent that saw only the spec, two adversarial red-team rounds (round 1: 72 of 72 attacks held; round 2: 44 of 47 held, with the three remaining items being open browsing, accepted by design above), and the conformance suites. Independent implementations and outside review are still needed, and are on the [roadmap](./roadmap.md).
