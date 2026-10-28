// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Builds site/: a static, signing-disabled PREVIEW of the reference signing page with its test-stage notice, for the separate
// Vercel project in deploy/SIGNING-PAGE-PLAN.md ("Preview deployment"). No script, no API, and the browser's passkey feature is
// switched off by Permissions-Policy, so nothing can be signed and no passkey can be made on the preview's address.
// Usage: node deploy/sign-preview/build.mjs          (writes site/)
//        node deploy/sign-preview/build.mjs --check  (exit 1 if site/ is out of date with the reference page)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)), SRC = join(HERE, "..", "..", "reference", "signing-page", "public"), OUT = join(HERE, "site");
const RP_ID = "sign.kigenka.com", DAYS = 90;   // the intended production address, shown in the notice text only
const BANNER = `<p class="preview" role="note"><strong>Preview only. Signing is turned off here.</strong> This copy shows how the signing page will look at ${RP_ID}. Please don't create a passkey on this address: a passkey works only on the address it was made on, so one made here could never sign at the real one. This preview has no script, and the browser's passkey feature is switched off.</p>`;
const render = (html) => {
  let t = html.replace(/<!--notice-->([\s\S]*?)<!--\/notice-->/g, "$1").replaceAll("{{RP_ID}}", RP_ID).replaceAll("{{NOTICE_DAYS}}", String(DAYS));
  t = t.replace('<script src="app.js"></script>', "").replace(/<main( class="[^"]*")?>/, (m) => m + "\n" + BANNER);
  t = t.replace('<button id="reg" class="big">', '<button id="reg" class="big" disabled>');
  for (const id of ["signAll", "oneByOne", "sign", "decline"]) t = t.replace(`<button id="${id}" `, `<button id="${id}" disabled `);
  if (t.includes("{{") || /<script/.test(t)) throw new Error("preview build: placeholder or script left");
  return t;
};
const PREVIEW_CSS = ".preview{margin:0 0 18px;padding:12px 16px;border:2px dashed #a3271f;border-radius:12px;background:#fff;color:#a3271f;font-size:16px}\n";
const headers = [
  ["Content-Security-Policy", "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"],
  ["X-Frame-Options", "DENY"], ["Referrer-Policy", "no-referrer"], ["X-Robots-Tag", "noindex, nofollow"], ["Cache-Control", "no-store"],
  ["X-Content-Type-Options", "nosniff"], ["Strict-Transport-Security", "max-age=63072000"],
  ["Permissions-Policy", "publickey-credentials-create=(), publickey-credentials-get=(), camera=(), microphone=(), geolocation=()"],
];
const files = {
  "index.html": render(readFileSync(join(SRC, "index.html"), "utf8")),
  "about.html": render(readFileSync(join(SRC, "about.html"), "utf8")),
  "style.css": readFileSync(join(SRC, "style.css"), "utf8") + PREVIEW_CSS,
  "robots.txt": "User-agent: *\nDisallow: /\n",
  "vercel.json": JSON.stringify({ $schema: "https://openapi.vercel.sh/vercel.json", cleanUrls: true, trailingSlash: false,
    headers: [{ source: "/(.*)", headers: headers.map(([key, value]) => ({ key, value })) }] }, null, 2) + "\n",
};
if (process.argv.includes("--check")) {
  const stale = Object.entries(files).filter(([f, c]) => !existsSync(join(OUT, f)) || readFileSync(join(OUT, f), "utf8") !== c).map(([f]) => f);
  console.log(stale.length ? `sign-preview: out of date: ${stale.join(", ")} (run node deploy/sign-preview/build.mjs)` : "sign-preview: site/ matches the reference page ✓");
  process.exit(stale.length ? 1 : 0);
}
mkdirSync(OUT, { recursive: true });
for (const [f, c] of Object.entries(files)) writeFileSync(join(OUT, f), c);
console.log("sign-preview: wrote", Object.keys(files).join(", "), "to", "deploy/sign-preview/site/");
