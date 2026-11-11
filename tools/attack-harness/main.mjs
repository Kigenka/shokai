// One entry: node main.mjs [label] → results-<label>.json/.md. Exit 1 if a code-level attack broke.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { results, HERE, TARGET } from "./lib.mjs";
const label = process.argv[2] ?? "latest";
console.log(`Red team round 3 (Shōkai 0.5) against ${TARGET}`);
await import("./inproc-attacks.mjs");
await import("./http-attacks.mjs");
await import("./v05-door.mjs");
await import("./v05-visitor.mjs");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = ["| # | Area | Attack | Tried | Expected | Actual | Result | Severity | Defence |",
  "|---|---|---|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.id} | ${r.cat} | ${esc(r.title)} | ${esc(r.tried)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.held ? "held" : r.level === "spec" ? "accepted (known spec-level, see threat model)" : "**BROKE**"} | ${r.sev} | ${r.level} |`)].join("\n");
const OUT = process.env.RT_OUT ?? join(HERE, "results"); mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `results-${label}.json`), JSON.stringify(results, null, 1));
writeFileSync(join(OUT, `results-${label}.md`), md + "\n");
const broke = results.filter((r) => !r.held);
const codeBroke = broke.filter((r) => r.level === "code");
const specBroke = broke.filter((r) => r.level === "spec");
// Spec-level findings are accepted, known limits the threat model documents (THREAT-MODEL.md); only a code-level break fails the run.
console.log(`\n${results.length} attacks: ${results.length - broke.length} held, ${specBroke.length} accepted (known spec-level, see threat model: ${specBroke.map((r) => r.id).join(", ") || "none"}), ${codeBroke.length} broke (code-level: ${codeBroke.map((r) => r.id).join(", ") || "none"})`);
process.exitCode = codeBroke.length ? 1 : 0;
