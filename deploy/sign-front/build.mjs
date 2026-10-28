// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Builds site/: the https front for sign.kigenka.com (Vercel project kigenka-sign) in relay mode, for the rc4 reference signing page.
// Between sessions it serves only an inert page and the full test-stage notice at /about. During a session (api/_session.js written
// by the session script, never committed) it relays /p/<token>/* to the reference server (reference/signing-page/server.mjs, run with
// RP_ID=sign.kigenka.com NOTICE=test-stage RELAY_SECRET=…). Compared with the October 26 front it also relays /about and the one-tap
// batch routes (/api/batch/options, /api/batch/verify) of the rc4 page. It holds no keys and logs no bodies.
// Usage: node deploy/sign-front/build.mjs          (writes site/)
//        node deploy/sign-front/build.mjs --check  (exit 1 if site/ is out of date)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)), SRC = join(HERE, "..", "..", "reference", "signing-page", "public"), OUT = join(HERE, "site");
const RP_ID = "sign.kigenka.com", DAYS = 90;
const about = readFileSync(join(SRC, "about.html"), "utf8")
  .replace(/<!--notice-->([\s\S]*?)<!--\/notice-->/g, "$1").replaceAll("{{RP_ID}}", RP_ID).replaceAll("{{NOTICE_DAYS}}", String(DAYS))
  .replace('href="style.css"', 'href="/style.css"').replace('<p><a href="./">Back to signing</a></p>', '<p>Signing happens only in short, private sessions opened by a link sent to the owner.</p>');
if (about.includes("{{") || /<script/.test(about) || !about.includes(RP_ID)) throw new Error("sign-front: about page not filled in");
const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>No signing session is open</title><link rel="stylesheet" href="/style.css"></head>
<body><main><h1>No signing session is open</h1>
<p>This page is only used for short, private signing sessions. There is nothing here right now.</p>
<div class="notice"><p><strong>This signing page is an early, test-stage convenience.</strong> Shōkai is still a draft, and Kigenka runs this page while it's being tested. <a href="/about">About this page</a></p></div></main></body></html>
`;
const INERT_HTML = index.replace(/\n/g, "");
const relay = readFileSync(join(HERE, "relay.template.js"), "utf8").replace("__INERT__", JSON.stringify(INERT_HTML));
const headers = [["X-Robots-Tag", "noindex, nofollow, noarchive"], ["Cache-Control", "no-store"], ["Referrer-Policy", "no-referrer"], ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"], ["Strict-Transport-Security", "max-age=31536000"],
  ["Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"]];
const files = {
  "index.html": index, "about.html": about, "style.css": readFileSync(join(SRC, "style.css"), "utf8"), "robots.txt": "User-agent: *\nDisallow: /\n",
  "package.json": JSON.stringify({ name: "kigenka-sign", private: true, type: "module", engines: { node: "24.x" } }) + "\n",
  "vercel.json": JSON.stringify({ cleanUrls: true, rewrites: [{ source: "/p/:path(.*)", destination: "/api/relay?p=:path" }],
    headers: [{ source: "/(.*)", headers: headers.map(([key, value]) => ({ key, value })) }] }, null, 2) + "\n",
  "api/relay.js": relay,
  "api/_session.js": "// No signing session is open. The session script writes a session here (backend origin, token hash, relay secret, expiry)\n// only for a session the steward approved, in a copy of site/ that is never committed; closing it redeploys this file (null).\nexport const SESSION = null;\n",
};
if (process.argv.includes("--check")) {
  const stale = Object.entries(files).filter(([f, t]) => !existsSync(join(OUT, f)) || readFileSync(join(OUT, f), "utf8") !== t).map(([f]) => f);
  if (stale.length) { console.log("sign-front: site/ is out of date: " + stale.join(", ") + " (run node deploy/sign-front/build.mjs)"); process.exit(1); }
  console.log("sign-front: site/ matches the reference page ✓"); process.exit(0);
}
mkdirSync(join(OUT, "api"), { recursive: true });
for (const [f, t] of Object.entries(files)) writeFileSync(join(OUT, f), t);
console.log("sign-front: wrote " + Object.keys(files).join(", ") + " to deploy/sign-front/site/");
