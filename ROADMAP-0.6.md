# Shōkai 0.6 roadmap: findings deferred from 0.5.0

These findings from expert review 4 and its fix checks are left for 0.6. Each entry says why it can wait: none of them weakens a signature, a binding or a refusal in 0.5.0. Most cost interoperability effort or editorial work out of proportion to a fix release.

Fixed in 0.5.0, and not listed here: R4-01 to R4-11, R4-14, R4-15 (exempted from C288 because the refusal binds nothing) and R4-19.

| Finding | What 0.6 should do | Why it can wait |
|---|---|---|
| R4-12 `shop` preset over-scoped; `booking` inherits spending checks | Split `ext-institutions` into `ext-credential-scan` (shops) and `ext-customer-link` (banks). Make `shop` = Core Door + `ext-spending` + `ext-credential-scan`, and require `ext-host-guards` only when a host model is declared. | Presets add no wire behavior, so a preset can be redefined without touching any message. 0.5.0 `applicability` already makes the spending checks N/A for a door without a spending action, so `booking` and `shop` can be claimed. |
| R4-13 Normative-language hygiene | Subject every MUST to a protocol role, and move SDK, signing-page and owner-UI duties to implementer guidance or SIGNING.md. Remove duplicates (the C279 and C293 restatements), move dated provenance into the CHANGELOG, and add a lint for MUSTs without a role. | Editorial: it changes no wire behavior, and doing it now would churn every check tag days before release. |
| R4-16 No normative state-transition table | Publish Appendix G (message type × encounter state), generated from the reference and checked by the fuzzer. | The prose rules cover the cells that matter for security (out-of-order means deny or the lobby, §3.2). The table is an aid to implementers. |
| R4-17 Revocation freshness windows read inconsistently | Give one freshness parameter per source, stated once in a table (seating list, per-act re-check, vouch-log head). | The windows are coherent: 1 hour at seating, 300 s per act (C265), head max age (C271). The finding is about readability. |
| R4-18 Payment-instrument scan false positives | Stop joining across array elements, and scan header ids only for format. Add a fixed readiness item ("a number that looks like a card number"). | The scan fails safe: it refuses, never leaks. It belongs to `ext-institutions`, not the core. |
| R4-20 Operator- and vendor-specific text in the core | Move the Shopify app-proxy path, sign.kigenka.com and the cost examples into informative annexes, and generalise the MCP revision pin. | Informative in effect, and it changes no conformance result. |

Residue from the fix checks, also for 0.6:

- **G2b under shokai/0.5.** Re-record the copied-proof trace byte-exact, like G1-v05. The copy refusal itself is covered by the example door's check and by attack R9.
- **Spending-only checks.** Move them from Core Door into `ext-spending`. For now `applicability` marks them N/A for a non-spending door.
- **The SDK as a door.** Run `--claim "Core Door"` against an SDK-built door, not only the reference host. verify already runs `--claim shop` against the reference.
- **Preconditions.** Derive them from the signed host card and house summary rather than the unsigned listing.
- **Reference restarts.** Persist the bookkeeping for unseen-card revocations. The revocations themselves persist; only the bound's ordering is lost on a restart.
- **Re-signed greetings.** Treat a greeting resent with the same nonce but a new `sent_at` (an HTTP retry that re-signs) as a redelivery. Today it is answered `never`, which binds nothing.
- **Multi-instance door with shared state, then load testing.** Status: not started. Operational, not a protocol change: run identical door copies behind a load balancer on one shared durable-plus-live store, then measure them. The store shape and in-process instance tests already exist.
