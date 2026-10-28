// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// `shokai demo` (the one-command local demo): it runs, seats the visitor, refuses the overspend twice, and reports home quickly.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
console.log("SDK demo command (@kigenka/shokai)");
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const t0 = Date.now();
const r = spawnSync(process.execPath, [cli, "demo"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, timeout: 20000 });
const out = r.stdout ?? "";
check(r.status === 0, "exits 0");
check(/invitation_response grant/.test(out) && /seated; tools in the seat: menu\.view, order\.place/.test(out), "the visitor is seated for menu.view and order.place");
check(/refused by the representative itself/.test(out) && /refused by the door/.test(out), "the overspend is refused by the representative and, sent anyway, by the door");
check(/Spent 6\.00 USD of the 10\.00 USD allowed/.test(out), "the report home says what was spent of what was allowed");
check(/no global score, nothing on-chain/.test(out), "it says where conduct records live");
check(Date.now() - t0 < 10000, `under 10 s (${Date.now() - t0} ms)`);
const u = spawnSync(process.execPath, [cli], { encoding: "utf8" });
check(u.status === 0 && /shokai demo/.test(u.stdout), "no subcommand prints the usage");
console.log(`${pass} demo checks passed, ${fail} failed`); if (fail) { console.log(out, r.stderr); process.exit(1); }
