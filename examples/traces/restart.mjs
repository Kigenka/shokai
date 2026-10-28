// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// A place restarts mid-visit (loopback only). Starts the demo tea house (deploy/demo-place) as its own process with a state file and a
// key folder in a temp directory, seats a visitor, withdraws a second visitor's card, then kills ONLY that server by its exact PID
// mid-visit and starts it again. Checks: a clear "knock again", no repeated ids, the revoked card stays revoked, the visit completes.
// Usage: (cd packages/shokai && npm run build) && (cd deploy/demo-place && npm install the packed SDK) && node examples/traces/restart.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { createRepresentative, developmentPasskey, findPlace, signCardRevocation, cardRevocationMessage, visitReport, SHOKAI_PLACE_UNREACHABLE } from "../../packages/shokai/dist/src/index.js";

const HERE = new URL(".", import.meta.url).pathname; const DP = join(HERE, "../../deploy/demo-place");
const USD = (v) => ({ value: v, currency: "USD" });
const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const tmp = mkdtempSync(join(tmpdir(), "shokai-restart-")); const base = `http://127.0.0.1:${port}`;
const out = { place: "Kettle & Leaf (demo, fictional)", steps: [], checks: [] };
const T0 = Date.now(); const step = (who, what, result = "") => { out.steps.push({ t_ms: Date.now() - T0, who, what, result }); console.log(`[${((Date.now() - T0) / 1000).toFixed(2)}s] ${who}: ${what}${result ? " → " + result : ""}`); };
const check = (ok, what) => { out.checks.push({ ok: !!ok, what }); console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`); if (!ok) process.exitCode = 1; };
const start = () => spawn(process.execPath, ["server.mjs"], { cwd: DP, env: { ...process.env, PORT: String(port), DATA_DIR: join(tmp, "data"), KEY_DIR: join(tmp, "keys") }, stdio: ["ignore", "ignore", "inherit"] });
const ready = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(base + "/healthz")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); } throw new Error("the demo place didn't start"); };
const kinds = (v) => v.transcript.filter((m) => m.dir === "in").map((m) => m.message?.payload ?? m.message);
const ask = { purpose: "purchase", actions: ["menu.view", "order.place"], limits: { max_amount: USD("20.00") }, vouch: null };

let server = start(); await ready(); step("Kettle & Leaf", "opens on loopback (state file and keys in a temp folder)", `pid ${server.pid}`);
const place = await findPlace(base + "/shokai", "kettle-and-leaf");
const aya = createRepresentative({ ownerName: "Aya Linden", purposes: ["purchase"], actions: ["menu.view", "order.place"] });
const v1 = await aya.visit(place, ask); const o1 = await v1.act("order.place", { amount: USD("6.00") });
step("Aya's representative", "seated; orders tea for 6.00 of 20.00 USD", `${v1.seat?.seat_id}, ${o1?.result?.reference}`);
const boOwner = developmentPasskey();
const bo = createRepresentative({ ownerName: "Bo Brennan", owner: boOwner, purposes: ["purchase"], actions: ["menu.view", "order.place"] });
const vb = await bo.visit(place, ask);
await vb.send(vb.message("card_revocation", cardRevocationMessage(signCardRevocation(boOwner, bo.card, { reason: "withdrawn" }))));
const vbAfter = await vb.act("menu.view");
step("Bo's owner", "withdraws Bo's card during Bo's visit", `Bo's next act: ${vbAfter?.decision}/${vbAfter?.disposition}`);

const pid = server.pid; process.kill(pid, "SIGKILL"); await new Promise((r) => server.on("exit", r));
step("the computer", `the tea house's server stops abruptly (SIGKILL to its exact pid ${pid}; nothing else touched)`);
let err = null; try { await v1.act("menu.view"); } catch (e) { err = e; }
step("Aya's representative", "tries to act while the place is down", err ? `${err.code}: ${err.message.slice(0, 110)}…` : "no error");
check(err?.code === SHOKAI_PLACE_UNREACHABLE && v1.interrupted === "unreachable", "while it is down, the visitor gets a clear error and marks the visit interrupted");

server = start(); await ready(); step("Kettle & Leaf", "starts again from its state file, same keys", `pid ${server.pid}`);
const gone = await v1.act("menu.view");
step("Aya's representative", "acts on its old seat", `${gone?.decision}/${gone?.disposition}/${gone?.reason_code}: "${gone?.courtesy?.text}"`);
check(gone?.disposition === "not_a_fit" && /knock again/i.test(gone?.courtesy?.text ?? "") && v1.interrupted === "seat_gone", "the old seat gets a polite 'interrupted, please knock again' (not_a_fit, §3.6/§7.2)");
const v2 = await aya.visit(place, ask); const o2 = await v2.act("order.place", { amount: USD("6.00") }); const over = await v2.act("order.place", { amount: USD("9.00") });
await v2.farewell();
step("Aya's representative", "knocks again: seated, orders 6.00, then tries 9.00 (would pass 20.00)", `${v2.seat?.seat_id}, ${o2?.result?.reference}; then ${over?.decision ?? over?.type}`);
const ids = [...kinds(v1), ...kinds(v2)].map((p) => p.msg_id);
check(v2.seated && o2?.type === "act_result" && new Set(ids).size === ids.length, `the visit completes, and no door message id repeats across the restart (${ids.length} ids)`);
check(o1?.result?.reference !== o2?.result?.reference && v1.seat.seat_id !== v2.seat.seat_id && v1.encounterId !== v2.encounterId, "order references, seats and encounters differ before and after the restart");
check(over?.decision === "deny", "the mandate's ledger survived the restart (6 + 6 spent; 9 more refused)");
const vb2 = await bo.visit(place, ask);
step("Bo's representative", "knocks again with the withdrawn card", `${kinds(vb2).find((p) => p.type === "invitation_response")?.decision ?? "no answer"}`);
check(!vb2.seated, "Bo's withdrawn card stays withdrawn after the restart");
out.report_home = visitReport(v1).voice?.text; step("Aya's representative", "reports home about the first visit", out.report_home);
server.kill("SIGTERM"); await new Promise((r) => server.on("exit", r));
step("Kettle & Leaf", `stopped (exact pid ${server.pid}); the temp folder is removed`);
rmSync(tmp, { recursive: true, force: true });
// ids and keys are shortened in the saved trace; nothing secret is written
writeFileSync(join(HERE, "restart.trace.json"), JSON.stringify(out, (k, v) => typeof v === "string" ? v.replace(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{40,}/g, (d) => "did:key:…" + d.slice(-6)).replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:<port>") : v, 1) + "\n");
console.log(`${out.checks.filter((c) => c.ok).length}/${out.checks.length} restart checks passed`);
