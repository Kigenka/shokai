# Red-team results

Three scripted adversarial rounds have run against the reference place server. Everything ran on loopback, with fictional people and places and fresh, in-memory keys. No real passkeys, live doors or public addresses were touched.

| Round | When | Attacks | Held | Accepted by design | Broke |
|---|---|---|---|---|---|
| [1](./round-1-results.md) (identity, introductions, allowances, replay, floods, inbox, pair doors) | October 2026, 0.3 era | 72 | 72 | 0 | 0 |
| [2](./round-2-results.md) (injection, lookalikes, swarms, clocks, revocation, limits, reputation, DoS, supply chain) | October 2026, 0.3 era | 47 | 44 | 3 (S1, S2, S4) | 0 |
| [3](./round-3-results.md) (what is new in 0.5, plus the 48 earlier attacks rerun) | 11 November 2026 | 93 | 86 | 4 at the time of the round (S1, S2, S4, V05-F10-03) | 3, fixed in 0.5.1. V05-F10-03 was then decided and is also in 0.5.1; a rerun on the 0.5.1 code after both fixes: 90 held, 3 accepted (S1, S2, S4), 0 broke. 0.5.0 lacks those fixes. |

**Round 3 in plain words.** Round 3 aimed at what is new in 0.5: proofs addressed to one door, lookalike host cards, superseding mandates, the over-limit hold, considering, pressure on the host representative, `never` misuse, customer links, records across places, and attempts to get the owner's key out through the place. Of 93 scripted attacks, 86 held, 4 are open by design, and 3 broke. The 3 breaks were two bugs:

- A door that fairly refused someone with `never` didn't say when that refusal ends or how to appeal (both door implementations, so it counted twice).
- A door carried out two orders that had a pasted login session in them, when it should have refused them.

Both are fixed in 0.5.1, and a rerun on 11 November 2026 shows 89 held, 4 open by design, 0 broke. **Fixed in 0.5.1; 0.5.0 lacks both fixes, so use 0.5.1.** Separately, 14 role-plays (a model playing an attacker against a model playing the place's host representative) all held. The round cost $0.66 in model calls.

One new risk was found in the round and was listed, not counted as a pass: a place could still ask a visitor's owner, in its context questions, for a password, a recovery phrase or a card number. That is now decided and is in 0.5.1 (0.5.1 refuses such questions; 0.5.0 lacks the rule). See V05-F10-03 in the [threat model](../../THREAT-MODEL.md) §5.

What each attack class meets, and why S1, S2 and S4 stay open, is in the [threat model](../../THREAT-MODEL.md). The attack harness is in [`tools/attack-harness/`](../../tools/attack-harness/) (`npm run attacks` from the repository root). The 0.5 live-door attack counts are on the documentation site, on the Live door round 0.5 page under Evidence.

**What surprised us.** Some frontier models declined to play the attacker or the impostor; we didn't work around their refusals, and gave them the defender's job instead. Other models played the attacker, and none got in under someone else's name. The details are in [Field tests](../../docs/field-tests.md#what-surprised-us-some-models-wouldnt-play-the-bad-actor).
