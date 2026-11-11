<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Known gaps — Shōkai 0.5 draft-release bar (2026-11-10)

This is the 0.5 draft-release known-gaps list, mapped to a four-part bar: (1) honest about status, (2) safe by default, (3) repeatable, (4) clearly labelled as a 0.5 draft. It is not a schedule, not a go to publish, and not a design of new infrastructure.

A first-version protocol can ship incomplete. People forgive gaps they were told about. They do not forgive a claim that turns out to be untrue. The items below stay on the open side of that line, written down so a 0.5 draft can be reviewed without pretending they are done.

The five statuses used in this package are project conventions, not specification keywords: **signed**, **appointed**, **deployed**, **validated**, **publicly open**. A reachable URL or `/healthz open=true` is not **publicly open**. A **SKIP** is never a pass.

## What 0.5 already treats as the minimum

1. **Honest about status.** Claims match the evidence. Every **validated** headline carries its measured/unmeasured counts and, for the official public-Kettle Core Door run, says 28 checks were observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240).
2. **Safe by default.** The owner key stays with the person as a passkey. Spending limits hold at the door for the measured checks unless a holder of the production door-state store write credential rewrites spend ledgers or revocations. Probing is shut out (`never` after three counted shapes), with the same caveat for a credential holder rewriting `never` bindings. The official public-Kettle run showed those door-side controls on deployment `dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq` / conf6 (candidate sha-256 `c68c75e7548cd591d7fe7e47cd897a1dea547db08c13eb1d177f14e631518c13`) for the 30 measured Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240)). The previous conf5 HOLD on `dpl_9H2iWykWyePEWHGQjp1v4PkTGms2` remains historical.
3. **Repeatable.** Someone else can run the in-repo suites and the official runner against a door they control and get the same kind of answer. How to do that is in [TESTING.md](./TESTING.md). The official public-Kettle PIN files live with the project's internal launch records and are not copied into this preview.
4. **Clearly labelled.** 0.5 is a draft. This file is the known-gaps list. How to report problems is in [SECURITY.md](./SECURITY.md).

<!-- public-validated-label: held pending YSY go; scoped to Core Door on conf6 -->
**Kettle status (project convention).** The fictional public test shop at `https://kettle.shokaiprotocol.com` is **deployed** on the conf6 candidate and **validated** for Core Door on conf6 (see this file): **30 of 164 measured, 28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240), 132 unmeasured**; 30 pass, 0 fail, 0 skip, 2 N/A (C241, C242). It is not **publicly open**, and it is not a proven lasting host. **validated** does not mean the 132 unmeasured checks passed.

## Stays on the 0.6 side (not required to call 0.5 an honest draft)

### Lasting hosts
A lasting, unattended conversational host is not proven in 0.5. Walkthroughs of that job declined it over key custody and recovery. Suzu is named on the hung Kettle host card; this package does not claim the status **appointed** for Suzu.

### Key rotation
The place principal key was removed from the hosted Kettle production environment but was not rotated. The representative key remains in that environment and was not rotated. A names-only listing of that project's environment-variable names (9 November 2026, late evening, Pacific Time) did not include the principal-key name in Production or in Preview. Preview does not serve the public alias. Whether any differently named Preview variable holds a principal key is unknown. No values are printed here. Rolling an earlier rollback candidate back into production would require putting a principal key back. These facts are disclosed, not mitigated.

### The 132 unmeasured Core Door items
The official public-Kettle run on conf6 (12:13 AM Pacific Time, 10 November 2026, America/Los_Angeles) measured **30 of 164** required Core Door checks (28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240); 30 pass, 0 fail, 0 skip, 2 N/A). **132 of 164** were unmeasured (not cited in that run; self-asserted or not URL-reachable). Among the unmeasured checks is whether notices that the spec would sign with the place principal key, and that the hosted Kettle door now signs with the representative key when no principal key is present, conform to §2. Extending coverage — more official HTTP rows, a Core Visitor harness, and fewer self-asserted checks — is 0.6 work.

### A second clean-room implementation
Quillfern Tea Room is a steward-guided model build from the handoff documents, not an outside organization and not a human audit. Under the current pinned official runner it fails C301; its Core Door claim is not established. A second implementation from a second organization, preferably in a second language, that interoperates on the vectors remains a 0.6 goal (also sketched in [ROADMAP-0.6.md](./ROADMAP-0.6.md)).

### A hosted door as a future design idea
Making it easier for a place owner to put a door online is a later product idea, not a design in this file. If that work happens, the owner key still stays with the person as a passkey. This note does not invent a hosted key home, a doorbell, a revoke URL, a monitoring service, or a visitor-isolation architecture.

### Multi-instance door with shared state, then load testing
**Status: not started.** The intended design (one address and host card in front; identical copies behind a load balancer; one shared durable-plus-live store) is written on the companion site's implementation-and-scaling page. The SDK already has that store shape and in-process instance tests. A multi-instance deployment of those copies, then a load test against it, has not been run.

## Other open items already on the record

- Review 9b mediums R9b-01..04 and Review 10 M1/M2 were closed locally on 9 November 2026 (late evening, Pacific Time): two-instance hold/intervening-act/release at `proposed` (R9b-01); binding `current` defined against the cap that binds, with a per-ledger release re-check and a cross-visit release vector (R9b-02); a seating choke point plus negative tests on the invitation, retry, and customer-link paths (R9b-03); exact `MANDATE_INVALID` / `not_now` / `with_credential [signed_mandate]` assertions (R9b-04); used-raise durability specified and already implemented on the persist-before-response path (M1); `mandateCurrent` required when `LimitRequest.mandate` is present (M2). See the Unreleased entry in [CHANGELOG.md](./CHANGELOG.md).
- H1(f) never defines the encounter / `in_reply_to` test that decides C301 PASS versus FAIL; the runner's `in_reply_to` arm is extra-textual. This file does not rewrite the H1(f) sentence.
- SKIP vs N/A for some precondition-false HTTP rows remains a runner/§0.1 tension.
- [ROADMAP-0.6.md](./ROADMAP-0.6.md) still lists protocol and editorial work from earlier reviews (holds reservation, C270 across instances, fetch safety, and the rest). Those items are not silently closed here.

## Presentation notes (not protocol gaps)

**Mio story film.** On the companion site preview, Mio’s film still shimmers a little from frame to frame (knit and edges shifting). That is the original 24 frames-per-second AI animation, not a camera shake and not a protocol defect. The current file stays: its burned-in line was corrected so the door no longer “stays quiet,” and a later smoothing candidate was not used.

Nothing here authorizes a publish, a deploy, a key rotation, or a new architecture.
