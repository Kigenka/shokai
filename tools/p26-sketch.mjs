#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// P26 amendment A (draft, not normative): check proposals/P26-vectors.json against the SDK's bindToSite(), siteOrigin() and
// shokaiLinks(), and the limits the amendment states. No keys, no network. Needs packages/shokai built (npm run build there).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "packages/shokai/dist/src/discover.js");
if (!existsSync(dist)) { console.error("p26-sketch: build packages/shokai first"); process.exit(1); }
const D = await import(pathToFileURL(dist).href);
const V = JSON.parse(readFileSync(join(root, "proposals/P26-vectors.json"), "utf8"));
let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log("  FAIL " + what); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const c of V.bind_to_site) check(same(D.bindToSite(c.site, c.discovery, c.host_card), c.expect), `bindToSite: ${c.name}`);
for (const c of V.site_origin) check(D.siteOrigin(c.input) === c.expect, `siteOrigin(${JSON.stringify(c.input)})`);
for (const c of V.shokai_links) check(same(D.shokaiLinks(c.html), c.expect), `shokaiLinks: ${c.html.slice(0, 60)}`);
check(D.MAX_DISCOVERY_BYTES === V.limits.max_discovery_bytes && D.MAX_SHOKAI_LINKS === V.limits.max_shokai_links, "the SDK's limits are the amendment's");
console.log(`P26 amendment A sketch: ${pass} passed, ${fail} failed (${V.bind_to_site.length} binding, ${V.site_origin.length} origin, ${V.shokai_links.length} link vectors)`);
process.exit(fail ? 1 : 0);
