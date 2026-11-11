---
title: Implementation and scaling
description: "Simple core first, opt-in richness, implementation advice vs protocol invariants, a concrete rich door example, engineering questions, and an in-process microbenchmark — not a universal capacity claim."
---

# Implementation and scaling

Shōkai is an **open protocol**: places choose how much to implement. Richness and modularity are design goals; **they do not by themselves guarantee performance**. A door that turns on every optional extension and faces real store traffic will not magically match a bare core door running in one process. That comparison is about how much the door is asked to do, not about a web browser.

A Shōkai door is server software. Other agents call it over HTTPS. There is no browser in the path. An agents-only store is just a server those agents call directly. It scales the way ordinary web services scale: more instances when traffic grows, shared state for what has already been seen or withdrawn, and only the extensions the place actually needs turned on. Only one small door — Kettle & Leaf — has been measured so far, and that was not a load test. This page promises no throughput numbers.

This page separates **protocol invariants** from **implementation advice**, gives one **concrete rich composition** the SDK already tests, names **engineering questions** still open for external validation, and points at a **reproducible in-process microbenchmark**.

## Protocol invariants (must hold)

These are specification rules, not tuning tips:

| Invariant | Where |
|---|---|
| Live state (encounters, passes, holds) is **bounded** | Short core / SPEC-DETAIL §3 |
| Multi-instance places that hold purchases or count spend **share one durable-plus-live store**; faking per-instance memory is not conformant | C270, C279; short core “Multi-instance honesty” |
| Mandate spend binds **across visits** (door + representative ledgers) | C175, C176 |
| Over-limit holds reserve and re-check against the owner-signed ceiling | C230; R8-01 repair |
| Extensions are **opt-in**; core MUST NOT require them; extensions MUST NOT weaken core | SPEC-DETAIL §0.1, C291 |
| Browse-only Core Door needs no money, holds, or allowance | Short core “What a minimal implementer ships” |

If an optimization would break an invariant, it is not an optimization for a conformant door.

## Implementation advice (not normative)

Advice for people shipping the **reference SDK** (`@kigenka/shokai`) or their own door. Where the code already decides, that is noted; where it does not, the row says **validation needed**.

### 1. Ship the simple core first

1. **Browse-only:** greeting, lobby for the unprepared, self-introduction, visitation pass, non-spending acts, HTTP binding. See `examples/minimal-browse-door` and the [Quickstart](./quickstart.md).
2. Add **spending** only when the place sells: mandates with `max_amount`, pass ledgers, optional holds.
3. Add **extensions** (visit receipts, gatherings, …) only when the place claims them — never “eager integrate everything.”

Opt-in composition is intentional: conformance classes name what you claim (`Core Door`, `ext-spending`, …). Claiming less is honest.

### 2. Prefer lazy integration

| Do | Avoid |
|---|---|
| Enable `purchaseHoldSeconds` / `policy.limit_calls` when the place actually holds purchases | Turning on holds, allowances, context asks, and every extension “just in case” |
| Use `memoryStore()` for a single process; graduate to `fileStore` / `kvStore` when you need shared state | Pretending separate in-memory instances are one place |
| Call outside classifiers only when house rules name them (`system1` / third-party list) | Fetching arbitrary URLs or payment APIs on the hot path before a pass exists |
| Keep MCP / place APIs **behind** the door | Letting unsigned traffic wake expensive workers |

The SDK README already documents store choices: `memoryStore`, `fileStore` (lock file), `kvStore` with compare-and-set; finished visits prune after `retainFinishedVisitsS` (default 3600 s); old messages discard after `maxMessageAgeS`.

### 3. State, holds, multi-instance

- **Single instance:** memory is conformant; state resets on restart (fail-safe for open holds: visitors start over).
- **Several instances of one host:** share one store (C279). The SDK’s `kvStore({ get, set, cas })` withholds (`429`) on lost CAS rather than acting on stale counts — that is correct, not “slow by bug.”
- **Holds:** one clock and a grace ≤ 5 s (C231). Do not use per-instance wall clocks that disagree.
- **Budgets / host ceilings:** `BudgetStore` / `FileBudgetStore` exist for host-side ceilings; several instances of one host MUST share one budget store.

### 4. Backpressure, bounds, timeouts, concurrency

What the implementation **already** does:

- Anonymous / malformed traffic gets the **lobby**, not a pass (cheap path relative to a visit with a pass).
- Size caps and message-age discard limit replay and bloat (C239, store prune).
- Fetch policy for vouch/revocation URLs: deny non-loopback/public fetches in default profiles; timeouts and size limits on allowed fetches (see `fetch-policy` tests).
- CAS conflict → retry/`429`, not silent double-spend.

What still needs **your** environment’s validation:

- Saturation of a specific Redis/Upstash/SQL CAS under your write rate.
- Tail latency when a real payment provider is on the release path.
- Multi-region replication lag vs hold grace.

Those are workload questions. The protocol does not pick your database.

### 5. Native apps and private company networks

A Shōkai door is an HTTPS address other agents call. On iOS, Android or a desktop app, that door normally lives on the app's own backend server, with the same checks as any other door. The app on the phone or laptop is the storefront people see, not the door itself: devices sleep, change networks and cannot reliably accept inbound visits.

An app's own agent going out as a visitor already fits. Signing with a passkey is a natural fit on phones.

A door inside a company network, reachable only privately, is possible in principle — the protocol does not require the public internet — but that arrangement has not been tested. No native-app door and no private-network door has been tried yet. There is no separate mobile software library.

### 6. How a door scales (intended design)

This is the intended design for a busy place. It is not a deployment we have built or load-tested. The SDK already has a shared store (`memoryStore` for one process; `fileStore` or `kvStore` when copies must agree) and in-process tests for several instances sharing it. Running those copies behind a load balancer under real traffic, then measuring them, has not been started.

To visiting agents it stays one door: one address, one host card, one set of rules. Behind that address, identical copies can run, with an ordinary load balancer in front. Checking a signature needs nothing shared — each copy can verify a signed message on its own.

The copies share one store so they do not forget what another copy already saw. That store is the specification's durable-plus-live store (C270): withdrawn cards (`revoked_cards`); already-used one-time proofs (`used_nonces` and already-seen messages, so a replay cannot be accepted twice); each visitor's spending against its limit (mandate ledgers, and open passes and holds); and the other single-use items the specification requires them to claim together. Open visits live in the same store. An activity log (`onEvent`) is an optional hook a place can collect; it is not itself the shared store.

A separate second door is only for a genuinely different place, with its own rules and its own host card — for example a wholesale entrance and a retail entrance.

## Concrete rich door example (verified composition)

The following composition is **supported by the SDK and covered by existing tests**. It is the same shape exercised by `packages/shokai/examples/bench-core-vs-rich.mjs`.

```js
import { createDoor, createRepresentative, inProcess, memoryStore } from "@kigenka/shokai";

const USD = (value) => ({ value, currency: "USD" });
const SUMMARY = {
  name: "kettle",
  display_name: "Kettle & Leaf",
  purpose: { statement: "Buying tea.", locale: "en-US" },
  conduct_rules: [{ code: "no_payment_credentials", text: "Never send card numbers here.", locale: "en-US" }],
  spec_ref: { version: "0.5.0" },
};

const door = createDoor({
  approvedBy: { name: "Ren Okabe", role: "Owner" },
  name: "kettle",
  displayName: "Kettle & Leaf",
  category: "store",
  purposes: [
    { code: "visitation", statement: "Looking at the menu." },
    { code: "purchase", statement: "Ordering tea." },
  ],
  actions: [
    { action: "tea.browse", purposes: ["visitation", "purchase"], level: "discover", data_asks: [] },
    { action: "tea.order", purposes: ["purchase"], level: "act_on_behalf", data_asks: [], limits: { max_amount: USD("100.00") } },
  ],
  spendingActions: ["tea.order"],
  purchaseHoldSeconds: 120,
  policy: { limit_calls: true, summary: SUMMARY, conduct_rules: SUMMARY.conduct_rules },
  store: memoryStore(),
});

// Visitor: self-introduction, seat, browse, spend within mandate, over-limit handling,
 // second visit reusing the mandate (whole-mandate ledger). See the bench harness for the full script.
```

| Capability in the example | Evidence in-tree |
|---|---|
| Self-introduction (`vouch: null`) | Conformance / visit tests |
| Per-visit + whole-mandate spending | `test/mandate.test.ts` (C175, C176) |
| Holds + `limit_calls` / over-limit | `test/v050.test.ts`, `test/r8-overlimit-ceiling.test.ts` |
| Shared store shape / multi-instance holds | `test/instances.test.ts` |
| Relay / possession audience checks | `test/redteam-fixes.test.ts` (C292) — visitor-side; not timed in the microbenchmark loop |

**Not claimed as verified together in that harness:** visit-receipts extension issuance, Gatherings, real passkeys, Upstash under production traffic (there is an optional `upstash.integration` test behind credentials — not part of the default microbenchmark).

## Engineering questions: resolved vs validation needed

| Question | Status | Path to resolve |
|---|---|---|
| Does enabling spending + holds make every request slower than browse-only? | **Measured in-process** on one box: rich path ≈ 2× p50 of minimal in the recording — see [benchmark report](./benchmarks/core-vs-rich.md). Expect more work per iteration; do not extrapolate to HTTP load. | Re-run `examples/bench-core-vs-rich.mjs` on your hardware |
| Can multiple instances share holds/spend safely? | **Resolved in SDK** when they share one CAS store; faking per-instance memory is non-conformant | `test/instances.test.ts`; deploy with one `kvStore`/`fileStore` |
| What happens on CAS conflict? | **Resolved:** withhold / `429`, do not apply stale counts | SDK store docs + tests |
| External store latency / saturation? | **Validation needed** | Point `kvStore` at your backend; measure under your QPS; share methodology |
| Real payment provider on release? | **Validation needed** — mock money only in reference demos | Integration test in your checkout; never required for Core Door browse |
| Shopify / WordPress / Vercel adapters? | **Not tested** as product integrations | Community / future work; do not assume |
| Every extension combination? | **Not claimed** — open protocol invites others to measure their configs | Claim only classes you run conformance for |
| Is richness “free”? | **No** — modularity lets you **omit** cost; it does not erase cost you opt into | Prefer browse-only until you need spend/holds |

## Reproducible microbenchmark

See **[Benchmark: core vs rich](./benchmarks/core-vs-rich.md)** for commands, environment, percentiles, and the invitation to validate other environments.

Summary of the design:

- Compares a **minimal browse** path to a **rich composed** path.
- Uses `inProcess(door)` — **no TCP listen**, no external network, no live credentials.
- Warm-up + measured iterations; p50 / p95 / p99; single concurrency.
- Labels itself an **in-process microbenchmark**, not a load test.

## Where this sits in the learning path

1. [What is Shōkai?](./) / [the short core](../SPEC.md) — concepts first.
2. [Watch the implementation](https://shokaiprotocol.com/docs/watch-the-implementation) — see a door UI (reconstructions).
3. [Try the protocol locally](https://shokaiprotocol.com/docs/try-locally) / [Quickstart](./quickstart.md) — run a visit.
4. **This page** — how to grow from simple to rich without confusing invariants with tuning.
5. [Live round evidence](https://shokaiprotocol.com/docs/evidence/live-round-0.5) — native framework probes (separate from microbenchmarks).

## Community invitation

Open protocols improve when many people measure. If you run this harness (or a load test you design) on another store, runtime, or traffic shape, publish:

- environment (runtime, CPU count, store type — no secrets),
- methodology (warmup, iterations, concurrency, what the path included),
- results (percentiles + throughput),
- which conformance classes you claim.

We are **not** asserting that one benchmark proves universal scalability. We **are** asserting that the simple→rich story is intentional, that at least one rich composition is concrete and tested, and that remaining questions are named with a path to answer them.
