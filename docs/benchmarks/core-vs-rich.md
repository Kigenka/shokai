# Benchmark: core browse path vs rich composed path

**Kind:** in-process microbenchmark — **not** a load test, **not** a production capacity estimate, and **not** proof that every configuration is optimal.

Machine-readable twin: [`core-vs-rich.results.json`](./core-vs-rich.results.json).

## Exact commands

From the v0.5.0 source tree (public npm is still 0.3.0 — do not use bare `npx @kigenka/shokai` for this):

```bash
cd packages/shokai
npm install
npm run build
node examples/bench-core-vs-rich.mjs
node examples/bench-core-vs-rich.mjs --json > ../../docs/benchmarks/core-vs-rich.results.json
```

Optional knobs: `SHOKAI_BENCH_WARMUP` (default 25), `SHOKAI_BENCH_ITERS` (default 200).

## Environment (this recording)

| Field | Value |
|---|---|
| Measured at (UTC) | 2026-11-05T19:25:37.284Z |
| Node | v24.22.1 |
| Platform | linux/x64 |
| CPU count | 8 |
| Total memory (bytes) | 16779640832 |
| Concurrency | 1 |
| Transport | `inProcess(door) — no TCP listen, no external network` |
| Warm-up / measured iterations | 25 / 200 |

## Paths compared

**Minimal (browse-only).** Greeting → self-introduction → visitation pass → `tea.browse` → farewell. No spending, no holds.

**Rich (composed).** Capabilities exercised in one scripted path, each already covered by SDK tests:

- self-introduction (`vouch: null`)
- purchase purpose with `tea.browse` + `tea.order`
- per-visit pass spend and whole-mandate ledger across a second visit (C175 / C176)
- `purchaseHoldSeconds` + `policy.limit_calls` (over-limit hold or refuse)
- `memoryStore()` (shared-store shape used for multi-instance honesty)

Not included (and not claimed): external KV/CAS under multi-writer load, real payment-provider latency, Shopify/WordPress/Vercel integration, public HTTP listeners.

## Results (this box)

| Path | p50 (ms) | p95 (ms) | p99 (ms) | mean (ms) | throughput (ops/s) |
|---|---:|---:|---:|---:|---:|
| minimal_browse | 5.83 | 6.86 | 7.04 | 5.92 | 168.83 |
| rich_composed | 12.18 | 15.05 | 19.88 | 12.59 | 79.40 |

**Ratio (rich / minimal) p50 latency:** 2.09× on this recording.

Heap deltas and event-loop delay samples are in the JSON (indicative only; GC noise is expected).

## How to read this

- Richness costs wall time on this path (~2.09× p50 here) because the rich iteration does more protocol work (two visits, spend, over-limit handling), not because the protocol “doesn’t scale.”
- Absolute milliseconds are for **this** Node build and machine. Re-run elsewhere before comparing.
- Invite: run the same harness against your store (`kvStore` / file / memory), runtime, and traffic shape; publish environment + methodology with your numbers.

See also: [Implementation and scaling](../implementation-and-scaling.md).
