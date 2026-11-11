#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Link and version check for the specification bundle (the version comes from the SPEC.md header). Usage: node scripts/check-links-versions.mjs [bundle-dir ...]
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
// ---- current-state prose, agent feeds, manifest, badges and release commands (review M7). Labelled history and the
// intentional shokai/0.3 compatibility path are allowed; an unlabelled "current" claim naming an older state is not.
if (V) {
  const wire = "shokai/" + V.split(".").slice(0, 2).join(".").replace(/^0\.(\d+)$/, "0.$1");
  const rd = (p) => existsSync(p) ? readFileSync(p, "utf8") : null;
  const must = (p, re, what) => { const t = rd(p); if (t === null) return; versions++; if (!re.test(t)) errors.push(`${relative(root, p) || p}: ${what}`); };
  const mustNot = (p, re, what) => { const t = rd(p); if (t === null) return; versions++; const m = t.match(re); if (m) errors.push(`${relative(root, p) || p}: ${what} ("${m[0].slice(0, 80)}")`); };
  const man = join(root, "packages/shokai/agent-install/v1/install-manifest.json");
  if (existsSync(man)) { versions++; const j = JSON.parse(readFileSync(man, "utf8"));
    if (j.spec?.version !== V || j.spec?.wire !== wire) errors.push(`install-manifest.json: spec ${j.spec?.version}/${j.spec?.wire}, want ${V}/${wire}`);
    if (j.steps?.[0]?.id !== "install") errors.push("install-manifest.json: the first step must install the scoped package");
    for (const st of j.steps ?? []) if (/^npx (?!--no-install )shokai/.test(st.run ?? "")) errors.push(`install-manifest.json: step ${st.id} runs unscoped npx (${st.run})`); }
  const guide = join(root, "packages/shokai/agent-install/v1/AGENT-INSTALL.md");
  must(guide, new RegExp(`spec v${q(V)}\\b`), `doesn't name spec v${V}`);
  mustNot(guide, /(^|[^-\w])npx shokai\b/m, "runs unscoped `npx shokai` (install @kigenka/shokai first, then npx --no-install)");
  for (const f of ["README.md", "packages/shokai/README.md", "QUICKSTART.md", "RELEASING.md"]) mustNot(join(root, f), /(^|[\s(`])npx shokai(-conformance)? /m, "runs unscoped `npx shokai` (use npx --no-install after installing the scoped package)");
  const engines = JSON.parse(readFileSync(join(root, "packages/shokai/package.json"), "utf8")).engines?.node?.match(/(\d+)/)?.[1];
  if (engines) must(join(root, "README.md"), new RegExp(`badge/node-%3E%3D${engines}-`), `Node badge doesn't say >=${engines} (engines)`);
  const pubTag = JSON.parse(readFileSync(join(root, "packages/shokai/package.json"), "utf8")).publishConfig?.tag;
  if (pubTag) mustNot(join(root, "RELEASING.md"), new RegExp(`tag: (?!${pubTag}\\b)\\w+ \\}`), `publishConfig tag in prose isn't ${pubTag}`);
  must(join(root, ".github/workflows/release.yml"), /release-status\.json'\)\.dist_tag/, "release workflow doesn't take its dist-tag from release/release-status.json");
  must(join(root, ".github/workflows/release.yml"), /check-links-versions\.mjs/, "release workflow doesn't run the links/versions/status check");
  mustNot(join(root, "RELEASING.md"), /npx @kigenka\/shokai@0\.3\.0 --version/, "post-publish check verifies 0.3.0, not the release");
  must(join(root, "schema/README.md"), new RegExp(`v${q(V)}/schema\\.json`), `doesn't list the v${V} schema`);
  mustNot(join(root, "docs/architecture.md"), /ritual header \(`protocol: "shokai\/0\.3"`/, "teaches shokai/0.3 as the current header without a legacy label");
  mustNot(join(root, "docs/roadmap.md"), /Shōkai is at \*\*v0\.3\.0\*\*/, "calls the project v0.3.0");
  mustNot(join(root, "docs/index.md"), /Status: \*\*v0\.3\.0\*\*/, "calls the project v0.3.0");
  // The site's agent feeds, when the site sits next to this tree (repo-export/…, site/shokai-site).
  for (const site of [join(root, "../../site/shokai-site/public"), process.env.SHOKAI_SITE_PUBLIC].filter((d) => d && existsSync(d))) {
    for (const f of ["llms.txt", "START-HERE-FOR-AGENTS.md"]) {
      mustNot(join(site, f), /not generated yet|(aren't|not) written yet|JSON Schema \(v0\.4\.0/, "says a v0.5.0 artefact is missing");
      mustNot(join(site, f), /`npx (@kigenka\/shokai|shokai) /, "runs npx before installing the scoped package");
      must(join(site, f), new RegExp(`v${q(V)}`), `doesn't name v${V}`); } }
}
// ---- the package's NOTICE is the repository's
{ const a = join(root, "NOTICE"), b = join(root, "packages/shokai/NOTICE"); if (existsSync(a) && existsSync(b)) { versions++; if (readFileSync(a, "utf8") !== readFileSync(b, "utf8")) errors.push("packages/shokai/NOTICE differs from NOTICE (copy it)"); } }
// ---- Pre-release review: release/release-status.json is the one source of truth for publish-day facts; everything else must agree.
const statusPath = join(root, "release/release-status.json");
if (V && existsSync(statusPath)) {
  const st = JSON.parse(readFileSync(statusPath, "utf8")); versions++;
  const rd = (p) => existsSync(p) ? readFileSync(p, "utf8") : null;
  const wire = "shokai/" + V.split(".").slice(0, 2).join(".");
  if (st.version !== V) errors.push(`release-status.json: version ${st.version}, SPEC.md says ${V}`);
  if (st.wire !== wire) errors.push(`release-status.json: wire ${st.wire}, want ${wire}`);
  if (!["unpublished", "published"].includes(st.npm_status)) errors.push(`release-status.json: npm_status must be unpublished|published, not ${st.npm_status}`);
  const pkgTag = JSON.parse(readFileSync(join(root, "packages/shokai/package.json"), "utf8")).publishConfig?.tag;
  if (pkgTag && pkgTag !== st.dist_tag) errors.push(`release-status.json: dist_tag ${st.dist_tag} but publishConfig.tag ${pkgTag}`);
  const side = rd(join(root, "release", st.tarball.replace(/\.tgz$/, ".sha256")));
  if (!side || side.split(/\s+/)[0] !== st.sha256) errors.push(`release-status.json: sha256 ${String(st.sha256).slice(0, 12)}… doesn't match release/${st.tarball.replace(/\.tgz$/, ".sha256")}`);
  const tgz = join(root, "release", st.tarball);
  if (existsSync(tgz)) { const { createHash } = await import("node:crypto"); const got = createHash("sha256").update(readFileSync(tgz)).digest("hex");
    if (got !== st.sha256) errors.push(`release/${st.tarball}: sha256 ${got.slice(0, 12)}… isn't release-status.json's ${String(st.sha256).slice(0, 12)}…`); }
  // the CHANGELOG has exactly one entry for this version and an Unreleased stub
  const cl = rd(join(root, "CHANGELOG.md")); if (cl) { versions++;
    const heads = cl.match(new RegExp(`^## v${q(V)}\\b.*$`, "gm")) ?? [];
    if (heads.length !== 1) errors.push(`CHANGELOG.md: ${heads.length} '## v${V}' headings, want exactly one`);
    if (!/^## Unreleased\b/m.test(cl)) errors.push("CHANGELOG.md: no '## Unreleased' stub (the PR template asks for entries there)"); }
  // npm-status prose: true for the current state only
  // Pre-release review (round 2): every repository Markdown file (the history files aside), not a short list, plus the package's own docs.
  const HISTORY = new Set(["CHANGELOG.md", "docs/review-history.md"].map((f) => join(root, f)));
  const prose = [...mdFiles(root, root).filter((f) => !f.includes(`${sep}spec${sep}`) && !HISTORY.has(f)),
    ...["packages/shokai/README.md", "packages/shokai/agent-install/v1/AGENT-INSTALL.md"].map((f) => join(root, f))];
  const site = [join(root, "../../site/shokai-site/pages"), join(root, "../../site/shokai-site/config.mjs"), process.env.SHOKAI_SITE_PAGES].filter((d) => d && existsSync(d));
  const walk = (d) => statSync(d).isDirectory() ? readdirSync(d).flatMap((n) => n === "node_modules" ? [] : walk(join(d, n))) : /\.(md|mjs|vue|html)$/.test(d) ? [d] : [];
  const files = [...prose, ...site.flatMap(walk)];
  const wrong = st.npm_status === "unpublished"
    ? /is published under the `next` tag|(?<!once |until |before )0\.5\.0 is (now )?on npm|until `?@kigenka\/shokai`? is on npm/i
    : /npm 0\.5\.0: pending|0\.5\.0[^.\n]{0,40}not (yet )?(on npm|published)|until 0\.5 is on npm/;
  // Commands that only work once published must say so on their line; bare `npx shokai` may fetch an unrelated package; the conformance runner is pinned.
  const unpublishedOk = /\b(once|until|after|before|when|public path|publish)\b/i;   // a line naming @next must say it is for later
  const presentNext = /(0\.5\.0 is (on|under) the `?next`? (dist-)?tag)/i;
  const bareNpx = /`?npx shokai (demo|visit|conformance|detect|house|init|host-card|--version)\b/;
  const unpinnedRunner = /npx -p @kigenka\/shokai shokai-conformance/;
  for (const f of [...new Set(files)]) { const t = rd(f); if (t === null) continue; versions++; const m = t.match(wrong);
    if (m) errors.push(`${relative(root, f)}: says "${m[0]}" but release-status.json npm_status is ${st.npm_status}`);
    for (const [re, why] of [[bareNpx, "bare `npx shokai …` (use npx --no-install shokai …)"], [unpinnedRunner, "unpinned conformance runner (pin @kigenka/shokai@<version>)"]]) {
      const x = t.match(re); if (x) errors.push(`${relative(root, f)}: ${why}: "${x[0].trim()}"`); }
    if (st.npm_status === "unpublished") { const x = t.match(presentNext) ?? t.split("\n").find((l) => /@kigenka\/shokai@next/.test(l) && !unpublishedOk.test(l));
      if (x) errors.push(`${relative(root, f)}: presents @next as available today: "${String(Array.isArray(x) ? x[0] : x).trim().slice(0, 120)}"`); } }
  // site-root-relative links in repository Markdown 404 on GitHub and inside node_modules
  const repoMd = mdFiles(root, root).filter((f) => !f.includes(`${sep}spec${sep}`));
  for (const f of repoMd) { const t = readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const m of t.matchAll(LINK)) if (m[1].startsWith("/")) { links++; errors.push(`${relative(root, f)}: site-root link ${m[1]} (404 on GitHub; use https://shokaiprotocol.com… or a repo-relative path)`); } }
  // the site's displayed digest is the status file's
  // Pre-release review (round 2): no silent skip. Without site inputs the check says so; SHOKAI_REQUIRE_SITE=1 makes that a failure.
  const siteDists = [join(root, "../../site/shokai-site/dist"), process.env.SHOKAI_SITE_DIST].filter((d) => d && existsSync(d));
  if (!siteDists.length || !site.length) { console.log(`  site checks: SKIPPED (no ${!siteDists.length ? "site dist" : "site pages"}; set SHOKAI_SITE_DIST / SHOKAI_SITE_PAGES)`);
    if (process.env.SHOKAI_REQUIRE_SITE === "1") errors.push("SHOKAI_REQUIRE_SITE=1 but the site's pages or dist are not available"); }
  for (const site of siteDists) {
    const htmlFiles = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith(".html") ? [p] : []; });
    for (const page of htmlFiles(site)) for (const m of readFileSync(page, "utf8").matchAll(/\/kigenka-shokai-[\w.-]+\.tgz\b/g)) {
      links++; if (!existsSync(join(site, m[0]))) errors.push(`${relative(root, page)}: tarball download ${m[0]} is missing from the built site`);
    }
    for (const f of ["visiting-back.svg", "host-back.svg"]) {
      const art = resolve(site, "../theme/cardart", f);
      if (existsSync(art)) { versions++; if (/shokai\/0\.3\b/.test(readFileSync(art, "utf8"))) errors.push(`${art}: current card SVG text/desc still prints shokai/0.3`); }
    }

    for (const page of ["docs/quickstart.html", "releases/index.html"]) { const t = rd(join(site, page)); if (t === null) continue; versions++;
      if (!t.includes(st.sha256)) errors.push(`site ${page}: doesn't display release-status.json's sha256 ${st.sha256.slice(0, 12)}…`); }
    // one SDK test total, release-status.json's, on every page that shows one
    if (st.sdk_tests?.passed) for (const page of ["index.html", "releases/index.html", "transparency/index.html", "docs/watch-the-implementation.html", "docs/evidence/live-round-0.5.html"]) {
      const t = rd(join(site, page)); if (t === null) continue; versions++; const want = `${st.sdk_tests.passed} / ${st.sdk_tests.passed}`;
      if (!t.includes(want)) errors.push(`site ${page}: doesn't display release-status.json's SDK total ${want}`); } }
}
console.log(`check-links-versions: ${links} relative links in ${bundles.length} bundle(s), ${versions} version markers (current v${V ?? "?"})`);
if (errors.length) { console.log(`  ${errors.length} problem(s):\n` + errors.map((e) => "   - " + e).join("\n")); process.exit(1); }
console.log("  every link resolves inside its bundle, every version marker agrees ✓");
