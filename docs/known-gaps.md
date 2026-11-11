# Known gaps (0.5 draft)

This is a reviewer-facing trim of the 0.5 draft-release known-gaps list. It is not a schedule, not a go to publish, and not a design of new infrastructure. A first-version protocol can ship incomplete. People forgive gaps they were told about. They do not forgive a claim that turns out to be untrue.

The five statuses used in this package are project conventions, not specification keywords: **signed**, **appointed**, **deployed**, **validated**, **publicly open**. A reachable URL or `/healthz open=true` is not **publicly open**. A **SKIP** is never a pass.

<!-- public-validated-label: held pending YSY go; scoped to Core Door on conf6 -->
**Kettle status (project convention).** The fictional public test shop at `https://kettle.shokaiprotocol.com` is **deployed** on the conf6 candidate (`dpl_HZnEpMHpMtQEvRjeD29KiWUqvxaq`, sha-256 `c68c75e7548cd591d7fe7e47cd897a1dea547db08c13eb1d177f14e631518c13`) and **validated for Core Door on conf6 (project convention; see KNOWN-GAPS)**: **30 of 164 measured, 28 observed over HTTP plus 2 implementer-provided in-process self-tests (C236, C240), 132 unmeasured**; 30 pass, 0 fail, 0 skip, 2 N/A (C241, a visiting representative's duty; C242, the templates aren't closed). It is not **publicly open**, and it is not a proven lasting host. **validated** does not mean the 132 unmeasured checks passed. Conf5 is historical.

## What stays on the 0.6 side

These are not required to call 0.5 an honest draft.

### Lasting hosts

A lasting, unattended conversational host is not proven in 0.5. Walkthroughs of that job declined it over key custody and recovery. Suzu is named on the hung Kettle host card; this package does not claim the status **appointed** for Suzu.

### Key rotation

The owner key stays with the person as a passkey and was never placed on an agent server. Place keys used by the hosted test door have disclosure notes in the longer operator list; rotation of those place keys is 0.6 work. No secret values are printed here.

### The 132 unmeasured Core Door items

The official public-Kettle run on conf6 (12:13 AM Pacific Time, 10 November 2026, America/Los_Angeles) measured **30 of 164** required Core Door checks. **132 of 164** were unmeasured (not cited in that run; self-asserted or not URL-reachable). Extending coverage — more official HTTP rows, a Core Visitor harness, and fewer self-asserted checks — is 0.6 work.

### A second implementation

Quillfern Tea Room is a steward-guided model build from handoff documents, not an outside organization and not a human audit. Under the current pinned official runner it does not establish a Core Door claim. A second implementation from a second organization, preferably in a second language, that interoperates on the vectors remains a 0.6 goal.

### Invitation cards, a new-card-class recipe, and a registry

0.5 specifies visitor, host and introduction cards, and fail-closed rules for unknown kinds. It does not specify invitation cards, a developer recipe for minting a new card class, or a public registry of card kinds. See [Cards as a blueprint](./concepts/card-classes.md).

### A hosted door as a future design idea

Making it easier for a place owner to put a door online is a later product idea. If that work happens, the owner key still stays with the person as a passkey. This note does not invent a hosted key home, a doorbell, a revoke URL, a monitoring service, or a visitor-isolation architecture.

### Multi-instance door with shared state, then load testing

**Status: not started.** The intended design is on [Implementation and scaling](./implementation-and-scaling.md#6-how-a-door-scales-intended-design): one address and one host card in front, identical copies behind a load balancer, sharing one durable-plus-live store. The SDK already has that store shape and in-process instance tests. A multi-instance deployment of those copies, then a load test against it, has not been run. This page promises no throughput numbers.

## Other open items already on the record

Open known gaps H1(f) (encounter / `in_reply_to`) and how SKIP vs N/A is reported remain on the operator list. The official HTTP runner's PIN files live with the project's internal launch records and are not copied onto this page.

How to report problems is in [SECURITY.md](../SECURITY.md). The longer local list this page was trimmed from is `KNOWN-GAPS-0.5.md` in the preview package.
