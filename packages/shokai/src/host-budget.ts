// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// §6.11 (provisional): the host budget. The owner signs ceilings (per visit, per day, per month, in plain dollars, tokens or calls)
// inside the house config; the door meters every host-representative model call against them with a price table the owner set
// (no live pricing), and checks BEFORE each call that the call can't pass a ceiling at its largest (prompt + max output). When it
// could, the model isn't called: the visitor gets a fixed courteous line and the owner a notice. Admission and every other code
// check never call a model, so they go on. Days and months reset at midnight in the owner's time zone.
import type * as S from "./core/shapes.js";
import { usdMicros } from "./core/v050.js";
import type { BudgetStore } from "./budget-store.js";

/** What a host model call used, as the model service reported it. */
export type ModelUsage = { input_tokens: number; output_tokens: number };
/** What the door checks before a call: the model, the prompt's tokens, and the most the call may write (pass it to the model as its max tokens). */
export type HostModelEstimate = { model: string; input_tokens: number; max_output_tokens: number };
/**
 * A cost meter: what a call with this usage costs, in millionths of a dollar, or null when it can't be priced (never called then,
 * under a dollar ceiling). The default is priceTableMeter over the owner's signed prices. A custom meter may only price higher.
 */
export type CostMeter = (model: string, usage: ModelUsage) => bigint | null;
export type BudgetScope = "per_visit" | "daily" | "monthly" | "newcomer";
/** The fixed lines a visitor gets when the next call could pass a ceiling. Code-written; the model never sees or changes them. */
export const HOST_BUDGET_LINES: Record<BudgetScope | "unpriced", string> = {
  per_visit: "That's all I can talk about on this visit. Thank you for coming, and please come back another time.",
  daily: "We're closed to agent visits for today. Please come back tomorrow.",
  monthly: "We're closed to agent visits for the rest of this month. Please come back next month.",
  // The newcomers' share closes with the day's own line: a visitor isn't told how the place sorts its visitors.
  newcomer: "We're closed to agent visits for today. Please come back tomorrow.",
  unpriced: "I can't talk right now. Please come back later.",
};
/** A notice for the place's owner (door.ownerNotices()). Machine fields plus the plain-English text the owner reads. */
export type HostBudgetNotice = { notice_id: string; at: string; kind: "alert" | "ceiling" | "unpriced"; scope: BudgetScope | "model"; period: string;
  used: { usd: string; tokens: number; calls: number }; ceiling?: S.HostBudgetCeiling; text: { text: string; locale: "en-US" } };

const MTOK = 1000000n;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
/** The default meter: tokens in and out times the owner's price per million tokens, rounded up to the next millionth of a dollar. */
export function priceTableMeter(prices: Record<string, S.HostModelPrice> = {}): CostMeter {
  return (model, u) => {
    const p = Object.prototype.hasOwnProperty.call(prices, model) ? prices[model] : undefined; if (!p) return null;
    const i = usdMicros(p.input_per_mtok), o = usdMicros(p.output_per_mtok); if (i === null || o === null) return null;
    return ceilDiv(BigInt(Math.max(0, Math.ceil(u.input_tokens))) * i + BigInt(Math.max(0, Math.ceil(u.output_tokens))) * o, MTOK);
  };
}
/** Plain dollars: "$1.00", "$0.004" (at least two decimals, never rounded down to $0.00). */
export function dollars(micros: bigint): string {
  const w = micros / MTOK, f = (micros % MTOK).toString().padStart(6, "0").replace(/0+$/, "");
  return `$${w}.${f.length < 2 ? f.padEnd(2, "0") : f}`;
}
/** The day ("2026-11-03") and month ("2026-11") of `at` in time zone `tz`. */
export function budgetPeriods(at: Date, tz: string): { day: string; month: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (k: string) => p.find((x) => x.type === k)!.value; return { day: `${g("year")}-${g("month")}-${g("day")}`, month: `${g("year")}-${g("month")}` };
}

type Used = { usd: bigint; tokens: number; calls: number };
const zero = (): Used => ({ usd: 0n, tokens: 0, calls: 0 });
const add = (a: Used, b: Used): Used => ({ usd: a.usd + b.usd, tokens: a.tokens + b.tokens, calls: a.calls + b.calls });
const sub = (a: Used, b: Used): Used => ({ usd: a.usd - b.usd, tokens: a.tokens - b.tokens, calls: a.calls - b.calls });
void sub;
const usedOut = (u: Used) => ({ usd: dollars(u.usd), tokens: u.tokens, calls: u.calls });
/** The ledger's JSON form, kept with the door's state (stateFile + ".host-budget.json", or the store), so a restart resets nothing. */
export type HostBudgetLedgerJson = { v: 1; day: string; month: string; daily: [string, number, number]; monthly: [string, number, number];
  visits: [string, [string, number, number]][]; notified: string[]; notices: HostBudgetNotice[];
  /** Today's use by newcomers (§6.11 newcomer share), and owners the door has a paid purchase from: [principal, the day]. */
  newcomers?: [string, number, number]; earned?: [string, string][]; marked?: string[] };
/** §6.11 (C273): paid purchases on this many separate days make an owner known for the newcomers' share. */
export const EARNED_MIN_DAYS = 2;
/** §6.11: the newcomers' share of a daily ceiling when the owner set none. */
export const DEFAULT_NEWCOMER_SHARE = 0.25;
/** A ceiling scaled down to a share (rounded down; never below one unit of what it limits). */
export function shareOf(c: S.HostBudgetCeiling, share: number): S.HostBudgetCeiling {
  const out: S.HostBudgetCeiling = {}; const m = usdMicros(c.usd);
  if (m !== null) { const x = BigInt(Math.max(1, Math.floor(Number(m) * share))); out.usd = dollars(x).slice(1); }
  if (c.tokens !== undefined) out.tokens = Math.max(1, Math.floor(c.tokens * share));
  if (c.calls !== undefined) out.calls = Math.max(1, Math.floor(c.calls * share));
  return out;
}
const uj = (u: Used): [string, number, number] => [u.usd.toString(), u.tokens, u.calls];
const ju = (x: unknown): Used => Array.isArray(x) && x.length === 3 ? { usd: BigInt(String(x[0])), tokens: Number(x[1]) || 0, calls: Number(x[2]) || 0 } : zero();

export type BudgetTicket = { id: number; seat_id: string; model: string; worst: Used; day: string; month: string; newcomer?: boolean };
export type BudgetCheck = { ok: true; ticket: BudgetTicket } | { ok: false; scope: BudgetScope | "unpriced"; text: string };
/** HostBudgetKeeper options. `store`: where the ledger survives a restart (absent: in memory only, as before). */
export type HostBudgetKeeperOptions = { store?: BudgetStore<unknown> };

/** Keeps one door's host budget: checks before a call, records after it, and writes the owner's notices. */
export class HostBudgetKeeper {
  private day = ""; private month = ""; private daily = zero(); private monthly = zero();
  private visits = new Map<string, Used>(); private notified = new Set<string>(); notices: HostBudgetNotice[] = [];
  private reserved = new Map<number, BudgetTicket>(); private next = 1;
  private newcomers = zero(); private earned = new Map<string, string[]>(); private marked = new Set<string>();
  private store: BudgetStore<unknown> | undefined;
  /** True while inside {@link commit}: nested persist() calls are no-ops (the outer update writes once). */
  private committing = false;
  constructor(private budget: () => S.HostBudget | undefined, private meter: CostMeter, private now: () => Date,
    private place: string, private onNotice: (n: HostBudgetNotice) => void = () => undefined, opts: HostBudgetKeeperOptions = {}) {
    this.store = opts.store;
    if (this.store) this.restore(this.store.load() as HostBudgetLedgerJson | undefined);
  }
  /**
   * Persist the ledger. Prefer {@link commit} for mutations when a shared FileBudgetStore is in use: that reloads under the
   * store's lock so two processes don't overwrite each other. Reservations in flight aren't saved (a call cut off by a restart
   * never settled).
   */
  persist() {
    if (this.committing || !this.store) return;
    this.store.save(this.toJSON());
  }
  /**
   * Apply a mutation under the store's update transaction when available (lock → reload → apply → write → unlock).
   * In-flight reservations stay in this process's memory across the reload. Without a store, just runs `fn`.
   */
  private commit(fn: () => void): void {
    if (!this.store) { fn(); return; }
    if (typeof this.store.update === "function") {
      this.store.update((cur) => {
        const reserved = this.reserved; const next = this.next;
        this.restore(cur as HostBudgetLedgerJson | undefined);
        this.reserved = reserved; this.next = next;
        this.committing = true;
        try { fn(); } finally { this.committing = false; }
        return this.toJSON();
      });
      return;
    }
    fn();
    this.store.save(this.toJSON());
  }
  get active(): S.HostBudget | undefined { return this.budget(); }
  /** Move to the current day and month in the owner's time zone; a new one starts at zero. */
  private roll(b: S.HostBudget) {
    const p = budgetPeriods(this.now(), b.time_zone);
    if (p.day !== this.day) { this.day = p.day; this.daily = zero(); this.newcomers = zero(); this.visits.clear(); }
    if (p.month !== this.month) { this.month = p.month; this.monthly = zero(); }
    if (this.notified.size > 64) for (const k of this.notified) if (!k.endsWith(":" + this.day) && !k.endsWith(":" + this.month)) this.notified.delete(k);
  }
  private inflight(scope: BudgetScope, seat_id: string): Used {
    let r = zero(); for (const t of this.reserved.values()) if ((scope !== "per_visit" || t.seat_id === seat_id) && (scope !== "newcomer" || t.newcomer)) r = add(r, t.worst); return r;
  }
  private usedFor(scope: BudgetScope, seat_id: string): Used {
    return scope === "daily" ? this.daily : scope === "monthly" ? this.monthly : scope === "newcomer" ? this.newcomers : this.visits.get(seat_id) ?? zero();
  }
  /** The newcomers' ceiling today: the daily ceiling times the share (absent = 0.25); none when the share is 1 or there's no daily ceiling. */
  newcomerCeiling(b = this.budget()): S.HostBudgetCeiling | undefined {
    if (!b?.daily) return undefined; const share = b.newcomer_share ?? DEFAULT_NEWCOMER_SHARE; return share >= 1 ? undefined : shareOf(b.daily, share);
  }
  /** §6.11 (C273): the place's owner marks this owner known (a regular customer): known at once. */
  mark(principal: string) { this.commit(() => { this.marked.add(principal); if (this.marked.size > 100000) this.marked.delete(this.marked.values().next().value!); }); }
  /** §6.11 (C273): remember a day on which this owner made a paid purchase at the place (the first EARNED_MIN_DAYS distinct days are kept). */
  earn(principal: string) {
    this.commit(() => {
      const b = this.budget(); if (b) this.roll(b); const day = this.day || budgetPeriods(this.now(), b?.time_zone ?? "UTC").day;
      const days = this.earned.get(principal) ?? []; if (days.includes(day) || days.length >= EARNED_MIN_DAYS) return;
      this.earned.set(principal, [...days, day].sort()); if (this.earned.size > 100000) this.earned.delete(this.earned.keys().next().value!);
    });
  }
  /** §6.11 (C273): known through purchases only with paid purchases on EARNED_MIN_DAYS (2) or more separate days, all before today. */
  hasEarned(principal: string): boolean { if (this.marked.has(principal)) return true; const b = this.budget(); if (b) this.roll(b); return (this.earned.get(principal) ?? []).filter((d) => d < this.day).length >= EARNED_MIN_DAYS; }
  private over(c: S.HostBudgetCeiling | undefined, u: Used): boolean {
    if (!c) return false; const m = usdMicros(c.usd);
    return (m !== null && u.usd > m) || (c.tokens !== undefined && u.tokens > c.tokens) || (c.calls !== undefined && u.calls > c.calls);
  }
  /** §6.11: may the host model be called for this pass now? Reserves the call at its largest until settle(). */
  check(seat_id: string, est: HostModelEstimate, newcomer = false): BudgetCheck {
    const b = this.budget(); if (!b) return { ok: false, scope: "unpriced", text: HOST_BUDGET_LINES.unpriced };
    this.roll(b);
    const tokens = Math.max(0, Math.ceil(est.input_tokens)) + Math.max(0, Math.ceil(est.max_output_tokens));
    const needsUsd = b.mode === "metered" && [b.per_visit, b.daily, b.monthly].some((c) => c?.usd !== undefined);
    const cost = this.meter(est.model, { input_tokens: est.input_tokens, output_tokens: est.max_output_tokens });
    if (needsUsd && cost === null) { this.notify("unpriced", "model", this.day, undefined); return { ok: false, scope: "unpriced", text: HOST_BUDGET_LINES.unpriced }; }
    const worst: Used = { usd: cost ?? 0n, tokens, calls: 1 };
    for (const scope of ["monthly", "daily", "newcomer", "per_visit"] as const) {
      const c = scope === "newcomer" ? (newcomer ? this.newcomerCeiling(b) : undefined) : b[scope]; if (!c) continue;
      if (this.over(c, add(add(this.usedFor(scope, seat_id), this.inflight(scope, seat_id)), worst))) {
        this.notify("ceiling", scope, scope === "monthly" ? this.month : this.day, c);   // the newcomers' share: once a day
        return { ok: false, scope, text: HOST_BUDGET_LINES[scope] };
      }
    }
    const t: BudgetTicket = { id: this.next++, seat_id, model: est.model, worst, day: this.day, month: this.month, ...(newcomer ? { newcomer: true } : {}) }; this.reserved.set(t.id, t);
    return { ok: true, ticket: t };
  }
  /**
   * §6.11: record what the call used (its reported usage, never less than the prompt the door checked). Without usage the call is
   * charged at its largest. A day or month that turned while it ran is charged to the period the call was checked in.
   */
  settle(t: BudgetTicket, usage?: ModelUsage) {
    if (!this.reserved.has(t.id)) return;
    this.commit(() => {
      if (!this.reserved.delete(t.id)) return; const b = this.budget(); if (!b) return;
      let u = t.worst;
      if (usage && Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens)) {
        const ui = { input_tokens: Math.max(usage.input_tokens, 0), output_tokens: Math.max(usage.output_tokens, 0) };
        const c = this.meter(t.model, ui);
        u = { usd: c ?? t.worst.usd, tokens: Math.ceil(ui.input_tokens) + Math.ceil(ui.output_tokens), calls: 1 };
      }
      this.roll(b);
      if (t.day === this.day) { this.daily = add(this.daily, u); this.visits.set(t.seat_id, add(this.visits.get(t.seat_id) ?? zero(), u)); if (t.newcomer) this.newcomers = add(this.newcomers, u); }
      if (t.month === this.month) this.monthly = add(this.monthly, u);
      const share = b.alert_at ?? 0.8;
      for (const scope of ["daily", "monthly"] as const) {
        const c = b[scope]; const used = scope === "daily" ? this.daily : this.monthly; const period = scope === "daily" ? this.day : this.month;
        if (c && this.reached(c, used, share)) this.notify(this.reached(c, used, 1) ? "ceiling" : "alert", scope, period, c);
        const n = b.alert_calls?.[scope]; if (n && used.calls >= n) this.notify("alert", scope, period, { calls: n }, "calls");
      }
    });
  }
  /** The model call didn't happen (it failed before the request was sent): free its reservation. */
  release(t: BudgetTicket) { this.reserved.delete(t.id); }
  private reached(c: S.HostBudgetCeiling, u: Used, share: number): boolean {
    const m = usdMicros(c.usd); const at = (x: number) => x * share;
    return (m !== null && Number(u.usd) >= at(Number(m))) || (c.tokens !== undefined && u.tokens >= at(c.tokens)) || (c.calls !== undefined && u.calls >= at(c.calls));
  }
  private notify(kind: HostBudgetNotice["kind"], scope: HostBudgetNotice["scope"], period: string, c: S.HostBudgetCeiling | undefined, tag = "") {
    const key = `${kind}:${scope}:${tag}:${period}`;
    // One alert and one ceiling notice per scope and period (a visit's ceiling: once a day), so a drain can't flood the owner either.
    let n: HostBudgetNotice | undefined;
    const apply = () => {
      if (this.notified.has(key)) return;
      this.notified.add(key);
      const b = this.budget(); const used = scope === "monthly" ? this.monthly : scope === "newcomer" ? this.newcomers : this.daily;
      n = { notice_id: `hbn-${period}-${this.notices.length + 1}`, at: this.now().toISOString().replace(/\.\d+Z$/, "Z"), kind, scope, period,
        used: usedOut(used), ...(c ? { ceiling: c } : {}), text: { text: noticeText(this.place, kind, scope, used, c, b, tag), locale: "en-US" } };
      this.notices.push(n); if (this.notices.length > 200) this.notices.splice(0, this.notices.length - 200);
    };
    if (this.committing) apply(); else this.commit(apply);
    if (n) this.onNotice(n);
  }
  /** What has been used now, in this day and month (the owner's view). */
  used(): { day: string; month: string; daily: ReturnType<typeof usedOut>; monthly: ReturnType<typeof usedOut> } {
    const b = this.budget(); if (b) this.roll(b);
    return { day: this.day, month: this.month, daily: usedOut(this.daily), monthly: usedOut(this.monthly) };
  }
  toJSON(): HostBudgetLedgerJson {
    return { v: 1, day: this.day, month: this.month, daily: uj(this.daily), monthly: uj(this.monthly), visits: [...this.visits].map(([k, u]) => [k, uj(u)]),
      notified: [...this.notified], notices: this.notices, newcomers: uj(this.newcomers), earned: [...this.earned].flatMap(([p, ds]) => ds.map((d) => [p, d] as [string, string])), marked: [...this.marked] };
  }
  restore(j: HostBudgetLedgerJson | undefined | null) {
    if (!j || j.v !== 1) return;
    this.day = String(j.day ?? ""); this.month = String(j.month ?? ""); this.daily = ju(j.daily); this.monthly = ju(j.monthly);
    this.visits = new Map((j.visits ?? []).map(([k, u]) => [k, ju(u)])); this.notified = new Set(j.notified ?? []); this.notices = Array.isArray(j.notices) ? j.notices : [];
    this.newcomers = ju(j.newcomers); this.earned = new Map();
    this.marked = new Set(Array.isArray(j.marked) ? j.marked.map(String) : []);
    for (const x of Array.isArray(j.earned) ? j.earned : []) if (Array.isArray(x) && x.length === 2) { const p = String(x[0]), d = String(x[1]); const ds = this.earned.get(p) ?? []; if (!ds.includes(d) && ds.length < EARNED_MIN_DAYS) this.earned.set(p, [...ds, d].sort()); }
  }
}

function noticeText(place: string, kind: HostBudgetNotice["kind"], scope: HostBudgetNotice["scope"], u: Used, c: S.HostBudgetCeiling | undefined, b: S.HostBudget | undefined, tag: string): string {
  const tz = b?.time_zone ?? "UTC";
  if (kind === "unpriced") return `${place}: your host representative's model has no price in your host budget, so the door won't call it. Visits and admissions go on. Add its price to your setup and sign it to turn conversations back on.`;
  const when = scope === "monthly" ? "this month's" : scope === "daily" || scope === "newcomer" ? "today's" : "a visit's";
  const of = c?.usd ? `${dollars(u.usd)} of ${when} ${dollars(usdMicros(c.usd)!)} host budget` : c?.tokens ? `${u.tokens.toLocaleString("en-US")} of ${when} ${c.tokens.toLocaleString("en-US")} tokens` : `${u.calls} of ${when} ${c?.calls ?? 0} host model calls`;
  if (scope === "newcomer") { const pct = Math.round((b?.newcomer_share ?? DEFAULT_NEWCOMER_SHARE) * 100); const day = b?.daily?.usd ? ` of today's ${dollars(usdMicros(b.daily.usd)!)}` : "";
    return `${place}: visitors you don't know yet have used their share of today's host budget (${of.replace(" of today's ", " of their ").replace(" host budget", "")}, ${pct}%${day}). New visitors get a polite closed line until midnight (${tz}); visitors you know still get conversations. (Told once a day.)`; }
  if (scope === "per_visit") return `${place}: a visit reached its ceiling, so your host representative ended that conversation with a polite line. Other visits go on. (Told once a day.)`;
  const until = scope === "monthly" ? `the 1st of next month (${tz})` : `midnight (${tz})`;
  if (tag === "calls") return `${place}: your host representative has made ${u.calls} model calls ${scope === "monthly" ? "this month" : "today"}. Your subscription covers the cost; this is only so you know.`;
  if (kind === "alert") return `${place}: your host representative has used ${of}. At the ceiling the door stops calling the model until ${until}; visits and admissions go on.`;
  return `${place}: your host representative is at ${when} ceiling (${of}; the next call could pass it). The door has stopped calling the model until ${until}. Visitors get a polite closed line; admissions and every other check go on. To raise the ceiling, sign a new setup.`;
}
