// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Case 24: the edges of the host budget (§6.11). Doors run in this process (no model, a counting stand-in), the restart attack runs
// against the real budget-door process on 127.0.0.1. Pia and every key are throwaway keys made for this run.
export default (H) => [H.kase("24-host-budget-edges",
  "Host-budget edges: two instances, a month ending mid-visit, midnight and the DST change, bad ceilings, a raise Pia never signed, a resumed pass",
  "Mallory works the corners of Lanternmoss's model budget: two door instances near the daily ceiling, a visit that crosses the monthly ceiling, the day that turns during the Nov 1 clock change, zero / negative / NaN / foreign-currency ceilings, a restart with a raised or re-priced budget Pia never signed, and a resumed pass that tries to get its per-visit count back.",
  "SPEC §6.11 (the host budget, provisional), §2.3 (house_digest), §13 item 33",
  async ({ expect, saw }) => {
    const { createDoor, memoryStore, budgetPeriods, HOST_BUDGET_LINES, signCard, houseConfigFor, hostScopeFor, houseDigestFor, summaryDigestFor } = H.sdk;
    const { entryUrl } = await import(H.path.join(H.SDK, "core/door.js"));
    const TZ = "America/Los_Angeles";
    const EST = { model: "stand-in-host", input_tokens: 2000, max_output_tokens: 500 };   // at most $0.004 a call
    const B = (o = {}) => ({ mode: "metered", time_zone: TZ, daily: { usd: "0.050" }, monthly: { usd: "1.00" }, alert_at: 0.8,
      prices: { "stand-in-host": { input_per_mtok: "1.00", output_per_mtok: "4.00" } }, newcomer_share: 1, ...o });   // newcomers' share off: these count one owner
    let now = new Date("2026-11-10T18:00:00Z");
    const opts = (budget, o = {}) => ({ approvedBy: { name: "Pia", role: "Owner" }, name: "lanternmoss", displayName: "Lanternmoss Tea House", category: "store",
      purposes: [{ code: "inquiry", statement: "Asking about today's teas." }],
      actions: [{ action: "menu.view", purposes: ["inquiry"], level: "discover", data_asks: [] }, { action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
      testProfile: true, hostBudgetClock: () => now, ...(budget ? { policy: { host_budget: budget } } : {}), ...o });
    const keys = () => ({ rep: H.generateRepresentativeKey(), principal: H.generateRepresentativeKey() });
    const seat = async (door) => {   // a visitor with a brand-new owner key each time
      const v = await H.createRepresentative({ ownerName: "Mallory", purposes: ["inquiry"], actions: ["menu.view", "concierge.talk"] })
        .visit(door, { purpose: "inquiry", actions: ["menu.view", "concierge.talk"], mandate: { fresh: true } });
      if (!v.seat) throw new Error("not seated: " + H.sentTypes(v).join(",")); return v.seat.seat_id; };
    const turn = (door, s, ...cs) => door.hostTurn(s, EST, async (e) => { for (const c of cs) c.n++; return { value: "ok", usage: { input_tokens: e.input_tokens, output_tokens: e.max_output_tokens } }; });
    const run = async (door, s, n, ...cs) => { const o = []; for (let i = 0; i < n; i++) o.push(await turn(door, s, ...cs)); return o; };
    const lab = (rs) => rs.map((r) => (r.ok ? "ok" : r.scope)).join(",");
    const start = async (b) => { try { const d = createDoor(opts(b)); await d.ready; return { d }; } catch (e) { return { code: e.code ?? String(e.message).slice(0, 40) }; } };
    const dirs = [];
    try {
      // 1. Control, then two instances near the daily ceiling (a known gap: each instance reserves its own).
      const one = { n: 0 }; { const d = createDoor(opts(B())); await d.ready; const s = await seat(d); const o = await run(d, s, 14, one);
        expect(one.n === 12 && lab(o.slice(12)) === "daily,daily" && o[12].text === HOST_BUDGET_LINES.daily, `control: one door, $0.050 a day: ${one.n} model calls, then closed (${lab(o.slice(10))})`); }
      const shared = memoryStore(), k = keys(), ca = { n: 0 }, cb = { n: 0 };
      const da = createDoor(opts(B(), { keys: k, store: shared })), db = createDoor(opts(B(), { keys: k, store: shared })); await da.ready; await db.ready;
      const sa = await seat(da), sb = await seat(db);
      for (let i = 0; i < 14; i++) { await turn(da, sa, ca); await turn(db, sb, cb); }
      const total = ca.n + cb.n, usd = (total * 0.004).toFixed(3);
      expect(total >= 12 && total <= 24, `two instances on one store, alternating: ${ca.n} + ${cb.n} = ${total} model calls, $${usd} against the $0.050 day (limit ${12} calls; overshoot ${Math.max(0, total - 12)} calls; bound is one ceiling per instance, 24)`);
      saw(`two instances sharing one store made ${total} model calls ($${usd}) against a $0.050 day, an overshoot of ${Math.max(0, total - 12)} calls (published, §13 item 33).`);

      // 2. The monthly ceiling crossed in the middle of a visit.
      { now = new Date("2026-11-10T18:00:00Z"); const c = { n: 0 }; const d = createDoor(opts(B({ daily: { usd: "0.010" }, monthly: { usd: "0.010" } }))); await d.ready; const s = await seat(d);
        const o = await run(d, s, 4, c);
        expect(lab(o) === "ok,ok,monthly,monthly" && c.n === 2 && o[2].text === HOST_BUDGET_LINES.monthly, `$0.010 a month: the 3rd call of one visit would pass it and isn't made (${lab(o)}; model calls ${c.n}; "${o[2].text ?? ""}")`);
        expect(d.ownerNotices().filter((n) => n.kind === "ceiling" && n.scope === "monthly").length === 1, "Pia gets one monthly-ceiling notice, not one per ask");
        const n2 = await turn(d, await seat(d), c); expect(!n2.ok && n2.scope === "monthly" && c.n === 2, `a new visit the same day is closed with the month's line (${n2.ok ? "ok" : n2.scope})`);
        now = new Date("2026-11-11T18:00:00Z"); const n3 = await turn(d, await seat(d), c);
        expect(!n3.ok && n3.scope === "monthly" && c.n === 2, `the next day, same month: the day resets, the month doesn't (${n3.ok ? "ok" : n3.scope})`);
        now = new Date("2026-12-01T08:01:00Z"); const n4 = await turn(d, await seat(d), c);
        expect(n4.ok === true && c.n === 3, `00:01 on Dec 1 in Los Angeles: a new month, open again (model calls ${c.n})`); }

      // 3. Midnight in Pia's time zone, with the clock changes (Mar 8 and Nov 1, 2026).
      const dp = (iso) => budgetPeriods(new Date(iso), TZ);
      expect(dp("2026-11-01T06:59:00Z").day === "2026-10-31" && dp("2026-11-01T07:00:00Z").day === "2026-11-01" && dp("2026-11-01T09:30:00Z").day === "2026-11-01",
        `Nov 1 begins at 07:00Z and its repeated 1 AM stays Nov 1 (${dp("2026-11-01T06:59:00Z").day}, ${dp("2026-11-01T07:00:00Z").day}, ${dp("2026-11-01T09:30:00Z").day})`);
      expect(dp("2026-11-02T07:59:00Z").day === "2026-11-01" && dp("2026-11-02T08:00:00Z").day === "2026-11-02", `Nov 1 is 25 hours: it ends at 08:00Z on Nov 2 (${dp("2026-11-02T07:59:00Z").day}, ${dp("2026-11-02T08:00:00Z").day})`);
      expect(dp("2026-03-09T06:59:00Z").day === "2026-03-08" && dp("2026-03-09T07:00:00Z").day === "2026-03-09", "Mar 8 is 23 hours: the day turns at 07:00Z on Mar 9");
      expect(dp("2026-11-01T06:59:00Z").month === "2026-10" && dp("2026-11-01T07:00:00Z").month === "2026-11", "the month turns at Pia's midnight on Nov 1 too");
      { now = new Date("2026-11-01T18:00:00Z"); const c = { n: 0 }; const d = createDoor(opts(B({ daily: { calls: 2 }, monthly: { calls: 50 }, prices: undefined }))); await d.ready; const s = await seat(d);
        const o = await run(d, s, 3, c); now = new Date("2026-11-02T07:30:00Z"); const late = await turn(d, s, c);
        expect(lab(o) === "ok,ok,daily" && !late.ok && late.scope === "daily" && c.n === 2, `Nov 1, 25 hours long: still closed at 07:30Z on Nov 2, 23:30 in Los Angeles (${lab(o)}, then ${late.ok ? "ok" : late.scope})`);
        now = new Date("2026-11-02T08:00:30Z"); const open = await turn(d, s, c);
        expect(open.ok === true && c.n === 3, `open again just after Pia's midnight (model calls ${c.n})`); }

      // 4. A zero, negative, NaN or foreign-currency budget never reaches a model call.
      expect((await start(B())).d !== undefined, "control: the honest budget starts");
      for (const [what, b] of [["a negative dollar ceiling", B({ daily: { usd: "-0.05" } })], ["a negative call ceiling", B({ per_visit: { calls: -1 } })], ["a negative token ceiling", B({ daily: { tokens: -1 } })],
        ["a ceiling of NaN dollars", B({ daily: { usd: "NaN" } })], ["a ceiling of NaN calls", B({ daily: { calls: NaN } })], ["a ceiling of NaN tokens", B({ daily: { tokens: NaN } })],
        ["a ceiling in euros", B({ daily: { eur: "0.05" } })], ["dollars marked EUR", B({ daily: { usd: "0.05", currency: "EUR" } })], ["a euro sign in the ceiling", B({ daily: { usd: "€0.05" } })],
        ["a price table in euros", B({ prices: { "stand-in-host": { input_per_mtok: "€1.00", output_per_mtok: "4.00" } } })]]) {
        const r = await start(b); expect(!r.d && /^SHOKAI_HOUSE/.test(r.code ?? ""), `refused to start: ${what} (${r.d ? "started" : r.code})`); }
      for (const [what, b] of [["a daily ceiling of $0.00", B({ daily: { usd: "0.00" } })], ["a daily ceiling of 0 calls", B({ daily: { calls: 0 } })], ["a daily ceiling of 0 tokens", B({ daily: { tokens: 0 } })]]) {
        const r = await start(b); let how = r.code ?? "";
        if (r.d) { const c = { n: 0 }; const x = await turn(r.d, await seat(r.d), c); how = `started, ask ${x.ok ? "answered" : "closed (" + x.scope + ")"}, model calls ${c.n}`; expect(!x.ok && c.n === 0, `${what}: refused or closed, never a model call (${how})`); }
        else expect(/^SHOKAI_HOUSE/.test(r.code ?? ""), `${what}: refused or closed, never a model call (${how})`); }

      // 5. A raised or re-priced budget without Pia's signature: the door won't start.
      { const pia = H.developmentPasskey(), rep = H.generateRepresentativeKey(); const base = `http://127.0.0.1:${await H.port()}/shokai`;   // an address string only, nothing listens
        const o0 = opts(B({ per_visit: { usd: "0.020" } }), { baseUrl: base, approvedBy: undefined }); const P = houseConfigFor(o0).policy;
        const card = signCard(rep, pia, { displayName: "Pia (Lanternmoss Tea House)", kind: "person", purposes: ["inquiry"], actions: o0.actions.map((a) => a.action), cardKind: "host", validDays: 30,
          host: { place: { principal_id: pia.id, entry: entryUrl(base, o0.name) }, host_scope: hostScopeFor(P), house_digest: houseDigestFor(o0, pia.id, base), summary_digest: summaryDigestFor(o0, base) },
          shownToOwner: { text: "Suzu may welcome agents at Lanternmoss Tea House; its model may cost at most $0.02 a visit, $0.05 a day and $1.00 a month.", locale: "en-US" } });
        const go = (b) => { try { createDoor({ ...opts(b, { baseUrl: base, approvedBy: undefined }), card, keys: { rep } }); return "started"; } catch (e) { return e.code ?? "error"; } };
        expect(go(B({ per_visit: { usd: "0.020" } })) === "started", "control: the budget exactly as Pia signed it starts");
        for (const [what, b] of [["a visit's ceiling raised to $0.03", B({ per_visit: { usd: "0.030" } })], ["the month raised to $50.00", B({ per_visit: { usd: "0.020" }, monthly: { usd: "50.00" } })],
          ["the model's price cut to $0.01 a million tokens", B({ per_visit: { usd: "0.020" }, prices: { "stand-in-host": { input_per_mtok: "0.01", output_per_mtok: "4.00" } } })],
          ["the time zone moved to Pacific/Kiritimati", B({ per_visit: { usd: "0.020" }, time_zone: "Pacific/Kiritimati" })], ["the newcomers' share raised to 90%", B({ per_visit: { usd: "0.020" }, newcomer_share: 0.9 })],
          ["the alert moved to 99%", B({ per_visit: { usd: "0.020" }, alert_at: 0.99 })]]) { const r = go(b); expect(r === "SHOKAI_HOUSE_CHANGED", `${what}, Pia's old host card: refused (${r})`); } }
      { const dir = H.fs.mkdtempSync(H.path.join(H.os.tmpdir(), "shokai-edges-")); dirs.push(dir); let child; const script = H.path.join(H.here, "budget-door.mjs");
        try { child = (await H.startDoor(await H.port(), dir, [], script)).child;
          const same = await H.startDoor(await H.port(), dir, ["--house=same"], script); await H.exited(same.child);
          const raised = await H.startDoor(await H.port(), dir, ["--house=raised"], script); await H.exited(raised.child);
          expect(same.started === true, "control: the real door restarts with the budget as Pia signed it");
          expect(raised.started === false && raised.code === "SHOKAI_HOUSE_CHANGED", `the real door, restarted with the daily ceiling raised and no new signature: won't start (${raised.code})`);
        } finally { if (child && child.exitCode === null) child.kill("SIGTERM"); } }

      // 6. A resumed pass can't buy back its per-visit count, and new visits can't get past the day.
      { const dir = H.fs.mkdtempSync(H.path.join(H.os.tmpdir(), "shokai-edges-")); dirs.push(dir); now = new Date("2026-11-10T18:00:00Z");
        const k2 = keys(), sf = H.path.join(dir, "state.json"), bud = B({ per_visit: { usd: "0.020" } }), all = { n: 0 }, mine = { n: 0 };
        const a = createDoor(opts(bud, { stateFile: sf, keys: k2 })); await a.ready; const s = await seat(a);
        const first = await run(a, s, 3, all, mine);
        const b = createDoor(opts(bud, { stateFile: sf, keys: k2 })); await b.ready;   // the door restarts; the visitor comes back with the same pass
        const again = await run(b, s, 5, all, mine);
        expect(lab(first) === "ok,ok,ok" && mine.n <= 5, `one pass, 3 asks before a restart and 5 after: ${mine.n} model calls in all, never past the visit's 5 (after: ${lab(again)})`);
        const more = []; for (let i = 0; i < 3; i++) more.push(...await run(b, await seat(b), 6, all));
        const u = b.hostBudgetUsed();
        expect(all.n <= 12 && more.some((r) => !r.ok && r.scope === "daily"), `fresh passes can't pass the day either: ${all.n} model calls in all (${u.daily.usd} of $0.050), then the closed line`);
        saw(`one pass got ${mine.n} model calls across a restart (visit limit 5); the day stopped at ${all.n} calls; Pia's raised, re-priced or re-zoned budgets were refused to start.`); }
    } finally { for (const d of dirs) H.fs.rmSync(d, { recursive: true, force: true }); }
  })];
