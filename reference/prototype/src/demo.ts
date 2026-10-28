/** `npm run demo`: run every scenario, print narrated transcripts, write reference/transcripts/*.md. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios/index.js";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../transcripts");
mkdirSync(outDir, { recursive: true });
const index: string[] = ["# Shōkai v0.2.7: narrated transcripts", "", "Fictional simulations from the reference prototype. Start with 01 (the unprepared visitor).", ""];
for (const s of SCENARIOS) {
  const r = s.run();
  const md = r.rec.toMarkdown();
  writeFileSync(join(outDir, `${s.file}.md`), md);
  index.push(`- [${s.file}](./${s.file}.md): ${r.title}`);
  if (!process.argv.includes("--quiet")) console.log(md + "\n\n" + "─".repeat(72) + "\n");
}
writeFileSync(join(outDir, "README.md"), index.join("\n") + "\n");
console.log(`Wrote ${SCENARIOS.length} transcripts to ${outDir}`);
