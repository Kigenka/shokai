#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Link and version check for the specification bundle (v0.3.0; the version comes from the SPEC.md header). Usage: node scripts/check-links-versions.mjs [bundle-dir ...]
//  1. Every relative link in the normative documents of a bundle (SPEC.md, extensions/, conformance/; in the SDK package's spec/, every
//     Markdown file) resolves to a file inside
//     that bundle (anchors ignored; http(s), mailto and site-absolute links are not checked): a reader who has only the bundle
//     must be able to follow every link the specification makes.
//  2. Every place that names the current specification version names the same one: SPEC.md's header, its spec_ref example,
//     the types, the golden traces, the extensions, the threat model, the changelog, the test vectors and, in a repository,
//     the reference's SPEC_VERSION and the SDK's package version (0.3.0-rcN as 0.3.0-rc.N).
// Bundles: packages/shokai/spec (always, when present) and the repository root when it ships LICENSE (the public tree).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bundles = args.length ? args.map((a) => resolve(a)) : [join(root, "packages/shokai/spec"), ...(existsSync(join(root, "LICENSE")) ? [root] : [])].filter(existsSync);
const errors = []; let links = 0, versions = 0;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "state", "keys", "packages", "site", "reference", "s5", "repo-export", "backups", "pilot", "research", "launch"]);
function mdFiles(dir, top) { const out = []; for (const n of readdirSync(dir)) { const p = join(dir, n); const st = statSync(p);
  if (st.isDirectory()) { if (top === dir ? SKIP_DIRS.has(n) : n === "node_modules") continue; out.push(...mdFiles(p, top)); } else if (n.endsWith(".md")) out.push(p); } return out; }
const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
for (const b of bundles) {
  // The package's bundle is read without the repository (in node_modules, on npmjs.com): every Markdown file in it must keep its links inside it.
  const files = b.endsWith(join("packages", "shokai", "spec")) ? mdFiles(b, null)
    : ["SPEC.md", "extensions", "conformance"].flatMap((f) => { const p = join(b, f); return !existsSync(p) ? [] : statSync(p).isDirectory() ? mdFiles(p, p) : [p]; });
  for (const f of files) {
    const text = readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const m of text.matchAll(LINK)) {
      const href = m[1]; if (/^(https?:|mailto:|#|\/)/.test(href)) continue; links++;
      const target = resolve(dirname(f), decodeURIComponent(href.split("#")[0]));
      const rel = relative(b, target);
      if (rel.startsWith("..") || rel.split(sep)[0] === "..") errors.push(`${relative(root, f)}: link ${href} leaves the bundle ${relative(root, b) || "."}`);
      else if (!existsSync(target)) errors.push(`${relative(root, f)}: link ${href} doesn't resolve in the bundle ${relative(root, b) || "."}`);
    }
  }
}
// ---- versions
const specPath = [join(root, "SPEC.md"), ...bundles.map((b) => join(b, "SPEC.md"))].find(existsSync);
const head = specPath ? readFileSync(specPath, "utf8").match(/\*\*Specification v(\d+\.\d+\.\d+(?:-rc\d+)?) \(core\)\.\*\*/) : null;
if (!head) errors.push("SPEC.md: no '**Specification vX (core).**' header");
const V = head?.[1]; const pkgV = V?.replace(/-rc(\d+)$/, "-rc.$1");
const need = (file, re, what) => { for (const base of [root, ...bundles]) { const p = join(base, file); if (!existsSync(p)) continue; versions++;
  if (!re.test(readFileSync(p, "utf8"))) errors.push(`${relative(root, p)}: ${what} doesn't name ${V}`); } };
const q = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
if (V) {
  need("SPEC.md", new RegExp(`\\{version: "${q(V)}", url\\}`), "the spec_ref example");
  need("protocol-shapes.ts", new RegExp(`matches specification v${q(V)}\\b`), "the types' header");
  need("conformance/golden-traces.md", new RegExp(`^# .*\\(specification v${q(V)}\\)`, "m"), "the golden traces' title");
  need("THREAT-MODEL.md", new RegExp(`^# .*\\(v${q(V)}\\)`, "m"), "the threat model's title");
  need("CHANGELOG.md", new RegExp(`^## v${q(V)}\\b`, "m"), "the changelog");
  need("conformance/test-vectors.json", new RegExp(`spec v${q(V)}\\b`), "the test vectors' note");
  need("extensions/README.md", new RegExp(`^# .*\\(v${q(V)}\\)`, "m"), "the extensions index");
  for (const base of new Set([root, ...bundles])) { const d = join(base, "extensions"); if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((f) => f.endsWith(".md") && f !== "README.md")) need(`extensions/${f}`, new RegExp(`version ${q(V)}, tied to the core \\[SPEC\\.md\\]\\([^)]*\\) v${q(V)}\\b`), "the extension header"); }
  need("s5/engawa/src/version.ts", new RegExp(`SPEC_VERSION = "${q(V)}"`), "SPEC_VERSION");
  need("reference/engawa/src/version.ts", new RegExp(`SPEC_VERSION = "${q(V)}"`), "SPEC_VERSION");
  need("packages/shokai/src/core/version.ts", new RegExp(`SPEC_VERSION = "${q(V)}"`), "the SDK's SPEC_VERSION");
  need("packages/shokai/package.json", new RegExp(`"version": "${q(pkgV)}"`), `the SDK package version (${pkgV})`);
  // no other current-version marker may name an older release candidate of this version
  for (const base of new Set([root, ...bundles])) for (const f of ["SPEC.md", "protocol-shapes.ts", "conformance/golden-traces.md"]) { const p = join(base, f); if (!existsSync(p)) continue;
    const t = readFileSync(p, "utf8"); const stale = [...t.matchAll(/"version": "(\d+\.\d+\.\d+(?:-rc\d+)?)"/g)].map((m) => m[1]).filter((x) => x !== V);
    if (stale.length) errors.push(`${relative(root, p)}: spec_ref versions other than ${V}: ${[...new Set(stale)].join(", ")}`); }
}
console.log(`check-links-versions: ${links} relative links in ${bundles.length} bundle(s), ${versions} version markers (current v${V ?? "?"})`);
if (errors.length) { console.log(`  ${errors.length} problem(s):\n` + errors.map((e) => "   - " + e).join("\n")); process.exit(1); }
console.log("  every link resolves inside its bundle, every version marker agrees ✓");
