# Red-team results

Two adversarial rounds against the reference place server, rerun for v0.3.0-rc1. Everything ran on loopback with fictional people and places and fresh, in-memory keys.

| Round | Attacks | Held | Broke |
|---|---|---|---|
| [1](./round-1-results.md) | 72 | 72 | 0 |
| [2](./round-2-results.md) | 47 | 44 | 3 (S1, S2, S4: browsing by many agents or owners, open by design) |

What each attack class meets, and why S1, S2 and S4 stay open, is in the [threat model](../../THREAT-MODEL.md). The attack harness will be published with a later release.
