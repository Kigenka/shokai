// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team 4d (C279, narrowed): two FileBudgetStore handles on one path share one ledger; concurrent writers don't lose updates.
// Note: visitor double-spend / single-use-act races are fileStore (store.ts, C270), not FileBudgetStore.
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import { FileBudgetStore, HostBudgetKeeper, priceTableMeter } from "../src/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };

async function main() {
  console.log("Shared host-budget store (C279)");
  const dir = mkdtempSync(join(tmpdir(), "shokai-b279-"));
  const file = join(dir, "budget.json");
  const a = new FileBudgetStore<{ spent: number }>(file);
  a.save({ spent: 3 });
  const b = new FileBudgetStore<{ spent: number }>(file);
  check(b.load()?.spent === 3, "two FileBudgetStore handles on one path see one ledger");
  b.save({ spent: 7 });
  check(a.load()?.spent === 7, "writes from either handle update the shared file");

  // Concurrent update(mutator): two handles each increment N times; final spent must be 2N (no lost updates).
  const N = 40;
  const c1 = new FileBudgetStore<{ spent: number }>(file);
  const c2 = new FileBudgetStore<{ spent: number }>(file);
  c1.save({ spent: 0 });
  const bump = (s: FileBudgetStore<{ spent: number }>) => {
    for (let i = 0; i < N; i++) s.update!((cur) => ({ spent: (cur?.spent ?? 0) + 1 }));
  };
  await Promise.all([
    new Promise<void>((r) => { bump(c1); r(); }),
    new Promise<void>((r) => { bump(c2); r(); }),
  ]);
  check(c1.load()?.spent === 2 * N, `two concurrent FileBudgetStore updaters: spent is ${2 * N} (got ${c1.load()?.spent})`);

  // HostBudgetKeeper: two keepers on one FileBudgetStore each settle one call; daily.calls must be 2.
  const budgetFile = join(dir, "keeper.json");
  const budget = { mode: "subscription", time_zone: "UTC", daily: { calls: 100 } } as any;
  const fixedNow = () => new Date("2026-11-03T12:00:00Z");
  const store = new FileBudgetStore(budgetFile);
  const k1 = new HostBudgetKeeper(() => budget, priceTableMeter({}), fixedNow, "Kettle", () => undefined, { store });
  const k2 = new HostBudgetKeeper(() => budget, priceTableMeter({}), fixedNow, "Kettle", () => undefined, { store });
  const est = { model: "host-model", input_tokens: 10, max_output_tokens: 10 };
  const t1 = k1.check("seat-a", est); const t2 = k2.check("seat-b", est);
  check(t1.ok && t2.ok, "two keepers each reserve one host-model call");
  if (t1.ok) k1.settle(t1.ticket, { input_tokens: 5, output_tokens: 5 });
  if (t2.ok) k2.settle(t2.ticket, { input_tokens: 5, output_tokens: 5 });
  const k3 = new HostBudgetKeeper(() => budget, priceTableMeter({}), fixedNow, "Kettle", () => undefined, { store: new FileBudgetStore(budgetFile) });
  check(k3.used().daily.calls === 2, `two keepers settling on one FileBudgetStore leave daily.calls=2 (got ${k3.used().daily.calls})`);

  rmSync(dir, { recursive: true, force: true });
  console.log(`budget-shared: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
