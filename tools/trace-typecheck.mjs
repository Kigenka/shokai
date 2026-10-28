#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * trace-typecheck: every JSON block in conformance/golden-traces.md must typecheck against protocol-shapes.ts
 * (tsc --strict). `{"$fixture": …}` and `{"$ref": …}` placeholders are substituted with typed stand-ins.
 * Trace blocks: arrays of ShokaiMessage (or Signed<…> envelopes, or a DoorPointer). Fixture blocks:
 * mapped by heading (cards, mandates, vouches, Seeking, meaning notes). Usage: node scripts/trace-typecheck.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(root, "conformance/golden-traces.md"), "utf8");
let heading = "", out = [], n = 0, inFence = false, buf = [];
const sub = (s) => s.replace(/\{\s*"\$(fixture|ref)":\s*"[^"]*"\s*\}/g, "(null as any)");
const fixtureType = (h) => /AllowanceStatus/.test(h) ? "S.Signed<S.AllowanceStatus>" : /allowance/i.test(h) ? "S.SignedAllowance" : /peer invitation/i.test(h) ? "S.Signed<S.PeerInvitation>" : /consent/i.test(h) ? "S.Signed<S.OwnerConsent>" : /card/i.test(h) ? "S.SignedCard" : /mandate/i.test(h) ? "S.SignedMandate" : /vouch/i.test(h) ? "S.SignedVouch" : /Seeking/i.test(h) ? "S.SignedSeekingDeclaration" : /meaning note/i.test(h) ? "S.MeaningNote" : null;
for (const line of md.split("\n")) {
  if (!inFence && /^#{2,3} /.test(line)) heading = line;
  if (/^```json/.test(line)) { inFence = true; buf = []; continue; }
  if (inFence && /^```/.test(line)) {
    inFence = false; n++;
    const src = sub(buf.join("\n")); let v; try { v = JSON.parse(src.replace(/\(null as any\)/g, "null")); } catch { out.push(`// block ${n} (${heading}) is not plain JSON; skipped`); continue; }
    const label = heading.replace(/[^\w .:()-]/g, "").slice(0, 60);
    if (/^### F\d+/.test(heading)) { const ty = fixtureType(heading); if (ty) out.push(`// ${label}\nexport const b${n}: ${ty} = ${src};`); continue; }
    if (/Seeking declaration|LearnedMeaning|learned/i.test(JSON.stringify(v).slice(0, 200)) && !Array.isArray(v)) { out.push(`// ${label} (non-message block skipped)`); continue; }
    if (Array.isArray(v)) out.push(`// ${label}\nexport const b${n}: (S.ShokaiMessage | S.WireMessage | S.DoorPointer)[] = ${src};`);
    else if (v && v.type === "door_pointer") out.push(`// ${label}\nexport const b${n}: S.DoorPointer = ${src};`);
    else if (v && "seq" in v) out.push(`// ${label}\nexport const b${n}: S.RevocationLogEntry = ${src};`);
    else if (v && v.type) out.push(`// ${label}\nexport const b${n}: S.ShokaiMessage = ${src};`);
    else out.push(`// ${label} (non-message block skipped)`);
    continue;
  }
  if (inFence) buf.push(line);
}
const dir = mkdtempSync(join(tmpdir(), "trace-tc-"));
writeFileSync(join(dir, "traces.ts"), `import type * as S from "${join(root, "protocol-shapes.js")}";\n${out.join("\n")}\n`);
try {
  execSync(`npx -y -p typescript@5 tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck ${join(dir, "traces.ts")}`, { stdio: "pipe" });
  console.log(`trace-typecheck: ${out.filter((l) => l.includes("\nexport const")).length} blocks typecheck (tsc --strict) ✓`);
} catch (e) { console.log(String(e.stdout || e.message).split("\n").slice(0, 60).join("\n")); console.log(`(generated file: ${join(dir, "traces.ts")})`); process.exit(1); }
