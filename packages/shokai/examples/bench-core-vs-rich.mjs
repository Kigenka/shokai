#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
//
// In-process microbenchmark: minimal browse-only door path vs a rich composed door path.
// No HTTP listen, no external network, no live credentials. Deterministic development keys.
// This is NOT a load test or a production capacity estimate.
//
// Run from packages/shokai after `npm run build`:
//   node examples/bench-core-vs-rich.mjs
//   node examples/bench-core-vs-rich.mjs --json > ../../docs/benchmarks/core-vs-rich.results.json
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { createDoor, createRepresentative, inProcess, memoryStore } from "../dist/src/index.js";

const USD = (value) => ({ value, currency: "USD" });
const WARMUP = Number(process.env.SHOKAI_BENCH_WARMUP ?? 25);
const ITER = Number(process.env.SHOKAI_BENCH_ITERS ?? 200);
const jsonOut = process.argv.includes("--json");

const SUMMARY = {
  name: "kettle",
  display_name: "Kettle & Leaf",
  purpose: { statement: "Buying tea.", locale: "en-US" },
  conduct_rules: [{ code: "no_payment_credentials", text: "Never send card numbers here.", locale: "en-US" }],
  spec_ref: { version: "0.5.0" },
};

/** Browse-only Core Door shape: visitation + non-spending act. No money, no holds. */
function minimalDoor() {
  return createDoor({
    approvedBy: { name: "Ren Okabe", role: "Owner" },
    name: "kettle-browse",
    displayName: "Kettle & Leaf",
    category: "store",
    purposes: [{ code: "visitation", statement: "Looking at the menu." }],
    actions: [{ action: "tea.browse", purposes: ["visitation"], level: "discover", data_asks: [] }],
    store: memoryStore(),
  });
}

/**
 * Rich composed path using capabilities the SDK already tests together:
 * introductions (vouch: null self-intro), purchase purpose, per-visit seat + whole-mandate spending,
 * purchase holds + over-limit raises (limit_calls), shared memory store (multi-instance-ready shape).
 * Does not claim payment-provider latency, external KV CAS under contention, or Shopify/WordPress.
 */
function richDoor() {
  return createDoor({
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
}

async function runMinimalOnce() {
  const door = minimalDoor();
  const place = door.listing().places[0];
  const visitor = createRepresentative({
    ownerName: "Aya Linden",
    purposes: ["visitation"],
    actions: ["tea.browse"],
  });
  const visit = await visitor.visit(place, {
    purpose: "visitation",
    actions: ["tea.browse"],
    transport: inProcess(door),
  });
  if (!visit.seated) throw new Error("minimal: not seated");
  const act = await visit.act("tea.browse");
  if (act?.type === "act_decision" && act.decision === "deny") throw new Error("minimal: browse denied");
  await visit.farewell();
  return { seated: true, path: "minimal" };
}

async function runRichOnce() {
  const door = richDoor();
  const place = door.listing().places[0];
  const visitor = createRepresentative({
    ownerName: "Aya Linden",
    purposes: ["purchase", "visitation"],
    actions: ["tea.browse", "tea.order"],
  });
  // Visit 1: self-introduction (vouch: null is the SDK default), browse, spend within mandate, attempt over-limit hold.
  const v1 = await visitor.visit(place, {
    purpose: "purchase",
    actions: ["tea.browse", "tea.order"],
    limits: { max_amount: USD("30.00") },
    transport: inProcess(door),
  });
  if (!v1.seated) throw new Error("rich: not seated");
  await v1.act("tea.browse");
  const a20 = await v1.act("tea.order", { amount: USD("20.00"), payment_ref: "b-ok" });
  if (!a20 || a20.ok !== true) throw new Error("rich: in-limit order failed");
  // Over-limit act: with limit_calls the door should hold (act_held) rather than silently grant.
  const over = await v1.act("tea.order", { amount: USD("40.00"), payment_ref: "b-over", hold_for_owner: true });
  const held = over?.type === "act_held" || over?.over_limit || over?.decision === "held";
  const refused = over?.ok === false || over?.type === "act_decision";
  if (!held && !refused) throw new Error(`rich: unexpected over-limit shape ${JSON.stringify(over)?.slice(0, 120)}`);
  await v1.farewell();

  // Visit 2 under the same mandate (whole-mandate ledger): remaining room must be reduced.
  const v2 = await visitor.visit(place, {
    purpose: "purchase",
    actions: ["tea.browse", "tea.order"],
    limits: { max_amount: USD("30.00") },
    transport: inProcess(door),
  });
  if (!v2.seated) throw new Error("rich: visit 2 not seated");
  if (!v2.mandateReused) throw new Error("rich: mandate not reused across visits");
  const again = await v2.act("tea.order", { amount: USD("20.00"), payment_ref: "b-again" });
  // 20 already spent of 30; another 20 should be refused by representative or door.
  const blocked =
    again?.refused_by === "representative" ||
    again?.ok === false ||
    again?.type === "act_decision" ||
    again?.reason_code;
  if (!blocked) throw new Error(`rich: expected leftover-mandate refusal, got ${JSON.stringify(again)?.slice(0, 120)}`);
  await v2.farewell();
  return { seated: true, path: "rich", mandateReused: true, overLimitHandled: !!(held || refused) };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function measure(label, fn, { warmup, iters }) {
  for (let i = 0; i < warmup; i++) await fn();
  const samples = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const eld = monitorEventLoopDelay({ resolution: 1 });
  eld.enable();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) {
    const s = performance.now();
    await fn();
    samples.push(performance.now() - s);
  }
  const wall = performance.now() - t0;
  eld.disable();
  samples.sort((a, b) => a - b);
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    label,
    iterations: iters,
    warmup,
    latency_ms: {
      min: samples[0],
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      max: samples[samples.length - 1],
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    },
    throughput_ops_per_s: (iters / wall) * 1000,
    wall_ms: wall,
    heap_used_delta_bytes: heapAfter - heapBefore,
    event_loop_delay_ms: {
      mean: eld.mean / 1e6,
      max: eld.max / 1e6,
      p99: eld.percentile(99) / 1e6,
    },
  };
}

async function main() {
  // Correctness smoke (fail the harness if composition is broken — do not invent timings).
  await runMinimalOnce();
  await runRichOnce();

  const minimal = await measure("minimal_browse", runMinimalOnce, { warmup: WARMUP, iters: ITER });
  const rich = await measure("rich_composed", runRichOnce, { warmup: WARMUP, iters: ITER });

  const report = {
    kind: "in-process-microbenchmark",
    not: [
      "load test",
      "production capacity estimate",
      "proof that every configuration is optimal",
      "measurement of external store, payment provider, or public network latency",
    ],
    protocol: "shokai/0.5",
    package: "@kigenka/shokai",
    package_version: "0.5.0",
    measured_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      // cpus length only — no hostnames or secrets
      cpu_count: (await import("node:os")).cpus().length,
      total_mem_bytes: (await import("node:os")).totalmem(),
    },
    methodology: {
      warmup_iterations: WARMUP,
      measured_iterations: ITER,
      concurrency: 1,
      transport: "inProcess(door) — no TCP listen, no external network",
      timing: "performance.now() per full path iteration; percentiles from sorted samples",
      memory: "process.memoryUsage().heapUsed delta around the measured loop (indicative only)",
      event_loop: "monitorEventLoopDelay during measured loop",
    },
    paths: {
      minimal_browse: {
        description: "Browse-only door: visitation seat + tea.browse + farewell",
        capabilities: ["greeting", "self-introduction", "visitation seat", "non-spending act"],
      },
      rich_composed: {
        description:
          "Spending door with holds/limit_calls, dual visit under one mandate, over-limit handling, memoryStore",
        capabilities: [
          "self-introduction (vouch: null)",
          "purchase purpose",
          "per-visit seat spend",
          "whole-mandate ledger across visits",
          "purchaseHoldSeconds + policy.limit_calls",
          "over-limit hold or refuse",
          "memoryStore (shared-store shape for multi-instance)",
        ],
        verified_by_existing_tests: [
          "packages/shokai/test/v050.test.ts (holds / limit_calls)",
          "packages/shokai/test/mandate.test.ts (C175/C176 across visits)",
          "packages/shokai/test/instances.test.ts (shared store / holds)",
        ],
      },
    },
    results: { minimal, rich },
    ratio: {
      rich_over_minimal_p50_latency:
        minimal.latency_ms.p50 > 0 ? rich.latency_ms.p50 / minimal.latency_ms.p50 : null,
      rich_over_minimal_mean_latency:
        minimal.latency_ms.mean > 0 ? rich.latency_ms.mean / minimal.latency_ms.mean : null,
    },
    invitation:
      "Re-run on your store, runtime, and traffic shape. Share results with environment + methodology. One box does not generalize.",
  };

  if (jsonOut) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  const fmt = (n) => (typeof n === "number" ? n.toFixed(2) : String(n));
  console.log(`Shōkai in-process microbenchmark (not a load test)`);
  console.log(`Node ${report.environment.node} · ${report.environment.platform}/${report.environment.arch} · warmup ${WARMUP} · iters ${ITER} · concurrency 1`);
  console.log("");
  for (const r of [minimal, rich]) {
    console.log(`${r.label}: p50 ${fmt(r.latency_ms.p50)} ms · p95 ${fmt(r.latency_ms.p95)} ms · p99 ${fmt(r.latency_ms.p99)} ms · mean ${fmt(r.latency_ms.mean)} ms · ${fmt(r.throughput_ops_per_s)} ops/s`);
  }
  console.log(`ratio rich/minimal p50 latency: ${fmt(report.ratio.rich_over_minimal_p50_latency)}×`);
  console.log(`heap delta (indicative): minimal ${minimal.heap_used_delta_bytes} B · rich ${rich.heap_used_delta_bytes} B`);
  console.log("");
  console.log("Write machine-readable output with: node examples/bench-core-vs-rich.mjs --json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
