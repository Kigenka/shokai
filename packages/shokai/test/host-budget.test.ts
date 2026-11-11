// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests, §6.11 (provisional): the host budget. The owner signs per-visit, daily and monthly ceilings into the house config; the
// door meters each host model call with the owner's price table and, before each call, refuses one that could pass a ceiling: no
// model call, a fixed courteous line for the visitor, a notice for the owner. In process; a stand-in "model" that only counts its
// calls (no AI, no network); a test clock; fictional people.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDoor, createRepresentative, developmentPasskey, generateRepresentativeKey, signCard, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor,
  priceTableMeter, dollars, shareOf, DEFAULT_NEWCOMER_SHARE, COSTLY_ACTION_CAPS, costlyCapsOf, budgetPeriods, HOST_BUDGET_LINES, type DoorOptions, type Door, type HostModelEstimate } from "../src/index.js";
import { entryUrl } from "../src/core/door.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const TZ = "America/Los_Angeles";
// These budget tests count one owner's visits (Ines), so the newcomers' share is off (1); the newcomer tests below use the default (0.25).
const BUDGET: S.HostBudget = { mode: "metered", time_zone: TZ, per_visit: { usd: "0.020" }, daily: { usd: "0.050" }, monthly: { usd: "1.00" }, alert_at: 0.8,
  prices: { "stand-in-host": { input_per_mtok: "1.00", output_per_mtok: "4.00" } }, newcomer_share: 1 };
const EST: HostModelEstimate = { model: "stand-in-host", input_tokens: 2000, max_output_tokens: 500 };   // at most $0.004 a call
let now = new Date("2026-11-03T18:00:00Z");   // 10:00 AM in Los Angeles
const tea = (o: Partial<DoorOptions> = {}, budget: S.HostBudget | null = BUDGET): DoorOptions => ({ approvedBy: { name: "Pia", role: "Owner" }, name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store",
  purposes: [{ code: "inquiry", statement: "Asking about today's teas." }],
  actions: [{ action: "menu.view", purposes: ["inquiry"], level: "discover", data_asks: [] }, { action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
  testProfile: true, hostBudgetClock: () => now, ...(budget ? { policy: { host_budget: budget } } : {}), ...o });
let modelCalls = 0;
const model = async (e: HostModelEstimate) => { modelCalls++; return { value: "Our Ember Persimmon is in season.", usage: { input_tokens: e.input_tokens, output_tokens: e.max_output_tokens } }; };
const ines = createRepresentative({ ownerName: "Ines", purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] });
async function seat(door: Door): Promise<string> {
  const v = await ines.visit(door, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } });
  if (!v.seat) throw new Error("not seated: " + JSON.stringify(v.transcript.map((m: any) => { const p = m.message?.payload ?? m.message; return [p?.type, p?.decision, p?.disposition, p?.reason_code]; })));
  return v.seat.seat_id; }
const refused = (o: Partial<DoorOptions>, b: unknown): string => { try { createDoor(tea(o, b as S.HostBudget)); return "started"; } catch (e) { return `${(e as any).code}:${((e as any).problems ?? []).join(",")}`; } };

async function main() {
  console.log("SDK host budget (§6.11, provisional)");
  // The meter: the owner's price table, rounded up; a model it doesn't list can't be priced.
  const m = priceTableMeter(BUDGET.prices);
  check(m("stand-in-host", { input_tokens: 2000, output_tokens: 500 }) === 4000n, "meter: 2,000 tokens in at $1.00/M + 500 out at $4.00/M = $0.004 (4,000 millionths)");
  check(m("stand-in-host", { input_tokens: 1, output_tokens: 0 }) === 1n && m("other-model", { input_tokens: 10, output_tokens: 10 }) === null, "meter: rounds up to the next millionth; an unlisted model has no price");
  check(dollars(4000n) === "$0.004" && dollars(1000000n) === "$1.00" && dollars(50000n) === "$0.05", "plain dollars: $0.004, $1.00, $0.05");
  // Days and months in the owner's time zone.
  check(budgetPeriods(new Date("2026-11-03T07:59:00Z"), TZ).day === "2026-11-02" && budgetPeriods(new Date("2026-11-03T08:00:00Z"), TZ).day === "2026-11-03", "periods: the day turns at midnight in Los Angeles (08:00 UTC in November)");
  check(budgetPeriods(new Date("2026-12-01T07:59:00Z"), TZ).month === "2026-11" && budgetPeriods(new Date("2026-12-01T08:00:00Z"), TZ).month === "2026-12", "periods: so does the month");
  // An invalid budget: the door won't start (§2.3), whatever it says.
  for (const [what, b] of [["metered with no daily ceiling", { ...BUDGET, daily: undefined }], ["a ceiling that isn't plain dollars", { ...BUDGET, daily: { usd: "-1" } }],
    ["an unknown time zone", { ...BUDGET, time_zone: "Mars/Olympus" }], ["a day's ceiling above the month's", { ...BUDGET, daily: { usd: "5.00" } }],
    ["dollar ceilings with no prices", { ...BUDGET, prices: undefined }], ["an alert at 150%", { ...BUDGET, alert_at: 1.5 }],
    ["subscription with a dollar ceiling", { mode: "subscription", time_zone: TZ, daily: { usd: "1.00" } }], ["an unknown member", { ...BUDGET, override: true }]] as const) {
    const r = refused({}, b); check(r.startsWith("SHOKAI_HOUSE_CONFIG_INVALID:") && r.includes("host_budget"), `refused to start: ${what} (${r})`);
  }
  check(refused({}, { mode: "subscription", time_zone: TZ }) === "started", "subscription with no ceilings at all: starts (a flat fee caps the cost)");

  // Enforcement. Each call is at most $0.004: a visit may have 5 ($0.020), a day 12 ($0.048).
  const door = createDoor(tea());
  check(!JSON.stringify(door.listing()).includes("host_budget") && !JSON.stringify(door.host.cfg.policy.summary ?? {}).includes("host_budget"), "the budget is never shown to visitors (not in the listing or the house summary)");
  const s1 = await seat(door); const out1: string[] = [];
  for (let i = 0; i < 6; i++) { const r = await door.hostTurn(s1, EST, model); out1.push(r.ok ? "ok" : r.scope); }
  check(out1.join(",") === "ok,ok,ok,ok,ok,per_visit" && modelCalls === 5, `one visit: 5 calls, the 6th would pass $0.020 and isn't made (${out1.join(",")}; model calls ${modelCalls})`);
  { const r = await door.hostTurn(s1, EST, model); check(!r.ok && r.text === HOST_BUDGET_LINES.per_visit, `the visitor gets the fixed line: "${!r.ok ? r.text : ""}"`); }
  check(door.ownerNotices().filter((n) => n.scope === "per_visit").length === 1, "the owner is told once a day that a visit reached its ceiling");
  const s2 = await seat(door); for (let i = 0; i < 5; i++) await door.hostTurn(s2, EST, model);
  { const a = door.ownerNotices().find((n) => n.kind === "alert" && n.scope === "daily");
    check(!!a && a.used.usd === "$0.04" && /\$0\.04 of today's \$0\.05 host budget/.test(a.text.text), `alert at 80%: "${a?.text.text}"`); }
  const s3 = await seat(door); const out3: string[] = [];
  for (let i = 0; i < 4; i++) { const r = await door.hostTurn(s3, EST, model); out3.push(r.ok ? "ok" : r.scope); }
  check(out3.join(",") === "ok,ok,daily,daily" && modelCalls === 12, `a third visit: 2 calls, then closed for today (${out3.join(",")}; model calls ${modelCalls}, $${(modelCalls * 0.004).toFixed(3)} of $0.050)`);
  { const r = await door.hostTurn(s3, EST, model); check(!r.ok && r.text === "We're closed to agent visits for today. Please come back tomorrow.", `the closed line: "${!r.ok ? r.text : ""}"`); }
  { const c = door.ownerNotices().filter((n) => n.kind === "ceiling" && n.scope === "daily");
    check(c.length === 1 && /stopped calling the model until midnight \(America\/Los_Angeles\)/.test(c[0].text.text), `one ceiling notice for the owner: "${c[0]?.text.text}"`); }
  // Admission needs no model call: a new visitor is still let in with a pass, and acts that need no model still work.
  { const v = await ines.visit(door, { purpose: "inquiry", actions: ["menu.view"], mandate: { fresh: true } });
    check(v.decision === "grant" && !!v.seat, "closed to model calls, the door still admits a new visitor with a pass");
    const r = await door.hostTurn(v.seat!.seat_id, EST, model); check(!r.ok && r.scope === "daily" && modelCalls === 12, "… whose conversation gets the closed line, with no model call"); }
  // Reset at the owner's midnight.
  now = new Date("2026-11-04T08:01:00Z");   // 00:01 on Nov 4 in Los Angeles
  { const s = await seat(door); const r = await door.hostTurn(s, EST, model); const u = door.hostBudgetUsed();
    check(r.ok && u.day === "2026-11-04" && u.daily.calls === 1 && u.monthly.calls === 13, `a new day in Los Angeles: open again (today ${u.daily.calls} call, this month ${u.monthly.calls})`); }
  now = new Date("2026-12-01T08:01:00Z");
  { const s = await seat(door); await door.hostTurn(s, EST, model); const u = door.hostBudgetUsed();
    check(u.month === "2026-12" && u.monthly.calls === 1, `a new month: the monthly ceiling starts again (${u.month}: ${u.monthly.calls} call)`); }
  // The month's ceiling closes the door for the month, with its own line.
  { const d = createDoor(tea({}, { ...BUDGET, per_visit: undefined, daily: { calls: 3 }, monthly: { calls: 3 }, prices: undefined, newcomer_share: 1 })); const s = await seat(d); const o: string[] = [];
    for (let i = 0; i < 4; i++) { const r = await d.hostTurn(s, EST, model); o.push(r.ok ? "ok" : r.scope); }
    const r = await d.hostTurn(s, EST, model);
    check(o.join(",") === "ok,ok,ok,monthly" && !r.ok && r.text === HOST_BUDGET_LINES.monthly, `a monthly ceiling of 3 calls: the 4th is refused, "${!r.ok ? r.text : ""}"`); }
  // A model the owner didn't price is never called under a dollar ceiling; the owner is told.
  { const d = createDoor(tea()); const s = await seat(d); const before = modelCalls;
    const r = await d.hostTurn(s, { ...EST, model: "other-model" }, model);
    check(!r.ok && r.scope === "unpriced" && modelCalls === before && d.ownerNotices().some((n) => n.kind === "unpriced"), "an unpriced model: not called, the owner told"); }
  // Reported usage counts; a call that fails counts at its largest; parallel calls can't overrun (each is reserved first).
  { const d = createDoor(tea()); const s = await seat(d);
    await d.hostTurn(s, EST, async () => ({ value: "", usage: { input_tokens: 1000, output_tokens: 100 } }));
    check(d.hostBudgetUsed().daily.usd === "$0.0014", `usage the model service reported: 1,000 in + 100 out = ${d.hostBudgetUsed().daily.usd}`);
    let threw = false; try { await d.hostTurn(s, EST, async () => { throw new Error("timeout"); }); } catch { threw = true; }
    check(threw && d.hostBudgetUsed().daily.usd === "$0.0054", `a call that failed counts at its largest: ${d.hostBudgetUsed().daily.usd}`);
    const p = await seat(d); let n = 0;
    const rs = await Promise.all(Array.from({ length: 20 }, () => d.hostTurn(p, EST, async (e) => { n++; await new Promise((r) => setTimeout(r, 20)); return { value: "", usage: { input_tokens: e.input_tokens, output_tokens: e.max_output_tokens } }; })));
    check(n === 5 && rs.filter((r) => r.ok).length === 5, `20 calls at once on one pass: ${n} made (the visit's $0.020)`); }
  // No signed budget, no model call; a pass that isn't live, none either.
  { const d = createDoor(tea({}, null)); const s = await seat(d); const before = modelCalls;
    const r = await d.hostTurn(s, EST, model); check(!r.ok && r.scope === "no_budget" && modelCalls === before, "a door with no signed host budget makes no host model call");
    const r2 = await door.hostTurn("seat-nobody", EST, model); check(!r2.ok && r2.scope === "no_pass", "nor for a pass that doesn't exist"); }
  // A restart resets nothing: the ledger is kept with the door's state.
  { const dir = mkdtempSync(join(tmpdir(), "shokai-hb-")); try {
      now = new Date("2026-11-05T18:00:00Z"); const keys = { rep: generateRepresentativeKey(), principal: generateRepresentativeKey() };
      const a = createDoor(tea({ stateFile: join(dir, "state.json"), keys })); const s = await seat(a); for (let i = 0; i < 3; i++) await a.hostTurn(s, EST, model);
      const b = createDoor(tea({ stateFile: join(dir, "state.json"), keys }));
      check(b.hostBudgetUsed().daily.calls === 3 && b.hostBudgetUsed().daily.usd === "$0.012", `after a restart the day's use is still counted (${b.hostBudgetUsed().daily.calls} calls, ${b.hostBudgetUsed().daily.usd})`);
    } finally { rmSync(dir, { recursive: true, force: true }); } }
  // A changed ceiling without the owner's new signature: the door won't start (the budget is inside house_digest, §2.3).
  { const base = "http://127.0.0.1:5199/shokai"; const pia = developmentPasskey(); const rep = generateRepresentativeKey(); const opts = tea({ baseUrl: base, approvedBy: undefined });
    const P = houseConfigFor(opts).policy;
    const card = signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: ["inquiry"], actions: opts.actions.map((a) => a.action), cardKind: "host", validDays: 30,
      host: { place: { principal_id: pia.id, entry: entryUrl(base, opts.name) }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(opts, pia.id, base), summary_digest: summaryDigestFor(opts, base) },
      shownToOwner: { text: "Suzu may welcome agents at Lanternmoss Tea House; its model may cost at most $0.05 a day and $1.00 a month.", locale: "en-US" } });
    const start = (b: S.HostBudget | null) => { try { createDoor({ ...tea({ baseUrl: base, approvedBy: undefined }, b), card, keys: { rep } }); return "started"; } catch (e) { return (e as any).code; } };
    check(start(BUDGET) === "started", "control: the budget exactly as Pia signed it, the door starts");
    check(start({ ...BUDGET, daily: { usd: "0.500" } }) === "SHOKAI_HOUSE_CHANGED", "the daily ceiling raised to $0.50 with Pia's old Shōkai host card: refused (SHOKAI_HOUSE_CHANGED)");
    check(start(null) === "SHOKAI_HOUSE_CHANGED", "the budget removed: refused too"); }
  // Subscription mode: the meter counts calls for the owner's alerts; ceilings are optional, and one that is set is enforced.
  { const d = createDoor(tea({}, { mode: "subscription", time_zone: TZ, alert_calls: { daily: 3 } })); const s = await seat(d); const o: string[] = [];
    for (let i = 0; i < 6; i++) { const r = await d.hostTurn(s, EST, model); o.push(r.ok ? "ok" : r.scope); }
    const a = d.ownerNotices().filter((n) => n.kind === "alert");
    check(o.every((x) => x === "ok") && a.length === 1 && /3 model calls today\. Your subscription covers the cost/.test(a[0].text.text), `subscription, no ceilings: never closed, one alert at 3 calls ("${a[0]?.text.text}")`);
    const d2 = createDoor(tea({}, { mode: "subscription", time_zone: TZ, daily: { calls: 2 }, newcomer_share: 1 })); const s2 = await seat(d2); const o2: string[] = [];
    for (let i = 0; i < 3; i++) { const r = await d2.hostTurn(s2, EST, model); o2.push(r.ok ? "ok" : r.scope); }
    check(o2.join(",") === "ok,ok,daily", `subscription with a ceiling of 2 calls a day: enforced (${o2.join(",")})`); }
  // The newcomers' share (default 0.25 of the day): fresh Shōkai visitor cards cost nothing to make, so many new owners together
  // can't use more than a quarter of today's budget, while a visitor the place knows still gets a conversation.
  check(DEFAULT_NEWCOMER_SHARE === 0.25 && shareOf({ usd: "1.00", calls: 10 }, 0.25).usd === "0.25" && shareOf({ usd: "1.00", calls: 10 }, 0.25).calls === 2, "the newcomers' share of $1.00 and 10 calls a day: $0.25 and 2 calls");
  for (const [what, b] of [["a newcomer share of 0", { ...BUDGET, newcomer_share: 0 }], ["a newcomer share of 150%", { ...BUDGET, newcomer_share: 1.5 }],
    ["known visitors that aren't a list", { ...BUDGET, known_visitors: "everyone" }]] as const) {
    const r = refused({}, b); check(r.startsWith("SHOKAI_HOUSE_INVALID") || r.includes("host_budget:"), `refuses to start: ${what} (${r})`); }
  { now = new Date("2026-11-10T18:00:00Z");
    const mika = createRepresentative({ ownerName: "Mika", purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] });
    const { newcomer_share: _n, ...DEF } = BUDGET; const d = createDoor(tea({}, { ...DEF, known_visitors: [mika.owner.id] }));
    const fresh: string[] = []; let calls = 0;
    for (let i = 0; i < 12; i++) {   // twelve owners with brand-new Shōkai visitor cards, two visits each, as many calls as they can
      const v = createRepresentative({ ownerName: `Visitor ${i + 1}`, purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] });
      for (let k = 0; k < 2; k++) { const p = await v.visit(d, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } });
        if (!p.seat) { fresh.push("not seated"); continue; }
        for (let j = 0; j < 3; j++) { const r = await d.hostTurn(p.seat.seat_id, EST, async (e) => { calls++; return { value: "", usage: { input_tokens: e.input_tokens, output_tokens: e.max_output_tokens } }; }); fresh.push(r.ok ? "ok" : r.scope); } } }
    const used = d.hostBudgetUsed().daily;
    check(calls === 3 && used.usd === "$0.012" && fresh.filter((x) => x === "newcomer").length === fresh.length - 3,
      `24 visits by 12 fresh owners: ${calls} model calls in all (${used.usd} of the newcomers' $0.0125, a quarter of $0.05)`);
    const closed = await d.hostTurn((await seat(d)), EST, model);
    check(!closed.ok && closed.text === "We're closed to agent visits for today. Please come back tomorrow.", `a newcomer then gets the day's polite line, the same words as a closed day: "${!closed.ok ? closed.text : ""}"`);
    const ms = await mika.visit(d, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } }); const mo: string[] = [];
    for (let j = 0; j < 6; j++) { const r = await d.hostTurn(ms.seat!.seat_id, EST, model); mo.push(r.ok ? "ok" : r.scope); }
    check(mo.join(",") === "ok,ok,ok,ok,ok,per_visit", `Mika, whom Pia listed as known, still gets in and talks: ${mo.join(",")} (her visit's own $0.020 ceiling)`);
    const nn = d.ownerNotices().filter((n) => n.scope === "newcomer");
    check(nn.length === 1 && /visitors you know still get conversations/.test(nn[0].text.text), `Pia is told once: "${nn[0]?.text.text}"`);
    // C273: paid purchases count only on 2 or more separate earlier days; the place's owner marking someone known counts at once.
    d.budget.earn(ines.owner.id);
    const today = await d.hostTurn(await seat(d), EST, model);
    check(!today.ok && today.scope === "newcomer", "a paid purchase today: Ines is still a newcomer today");
    check(!d.budget.hasEarned(ines.owner.id), "one purchase day isn't enough");
    d.hostBudgetRemember(mika.owner.id); check(d.budget.hasEarned(mika.owner.id), "the place's owner marks Mika known: known at once");
    now = new Date("2026-11-11T18:00:00Z");
    for (let i = 0; i < 4; i++) { const v = createRepresentative({ ownerName: `Visitor ${i + 20}`, purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] });
      const p = await v.visit(d, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } }); for (let j = 0; j < 2; j++) await d.hostTurn(p.seat!.seat_id, EST, model); }
    const next = await d.hostTurn(await seat(d), EST, model);
    check(!next.ok && next.scope === "newcomer", `the next day, one earlier purchase day: Ines is still a newcomer (C273)`);
    d.budget.earn(ines.owner.id); d.budget.earn(ines.owner.id);
    check(!d.budget.hasEarned(ines.owner.id), "a second purchase today: not yet (both days must be before today)");
    now = new Date("2026-11-12T18:00:00Z");
    check(d.budget.hasEarned(ines.owner.id), "paid purchases on 2 separate earlier days: Ines is known");
    const j = d.budget.toJSON(); check((j.earned ?? []).length === 2 && (j.marked ?? []).length === 1, "the purchase days and the owner's marks are kept with the door's state"); }
  { // §7.7 (C274): default caps on costly actions, carried by the SDK; lowered freely, raised only explicitly.
    check(costlyCapsOf(undefined).per_seat === 20 && costlyCapsOf(undefined).per_owner_day === 100 && COSTLY_ACTION_CAPS.per_seat === 20, "defaults: 20 per seat, 100 per owner a day");
    check(refused({ costlyActionCaps: { per_seat: 50 } }, BUDGET) === "SHOKAI_COSTLY_CAPS_INVALID:", "raising a cap without raise: true refuses to start");
    check(refused({ costlyActionCaps: { per_seat: 50, raise: true } }, BUDGET) === "started" && refused({ costlyActionCaps: { per_owner_day: 10 } }, BUDGET) === "started", "lowering is free; raising needs raise: true");
    const d2 = createDoor(tea({ costlyActionCaps: { per_seat: 2, per_owner_day: 3 } }, BUDGET)); const s1 = await seat(d2);
    const t = [await d2.hostTurn(s1, EST, model), await d2.hostTurn(s1, EST, model), await d2.hostTurn(s1, EST, model)];
    check(t[0].ok && t[1].ok && !t[2].ok && t[2].scope === "per_visit", `a host-model call is a costly action: the seat's cap of 2 closes the third (${t.map((x) => x.ok ? "ok" : x.scope).join(",")})`);
    const s2 = await seat(d2); const u = [await d2.hostTurn(s2, EST, model), await d2.hostTurn(s2, EST, model)];
    check(u[0].ok && !u[1].ok && u[1].scope === "daily", `the owner's cap of 3 a day spans seats (${u.map((x) => x.ok ? "ok" : x.scope).join(",")})`); }
  console.log(`\nhost-budget: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
