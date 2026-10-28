// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// sign.kigenka.com relay (template: build.mjs fills in the inert page). With no open session (SESSION = null, expired, or a wrong token) it answers the inert page.
// During a session it forwards ONLY the signing page's own paths to the box's session tunnel. It holds no keys and logs no
// bodies: only public keys and signed objects ever pass through; the passkey's private half never leaves YSY's phone.
import { createHash, timingSafeEqual } from "node:crypto";
import { SESSION } from "./_session.js";

const SEC = { "X-Robots-Tag": "noindex, nofollow, noarchive", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const INERT = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><meta name=\"robots\" content=\"noindex, nofollow\"><meta name=\"referrer\" content=\"no-referrer\"><title>No signing session is open</title><link rel=\"stylesheet\" href=\"/style.css\"></head><body><main><h1>No signing session is open</h1><p>This page is only used for short, private signing sessions. There is nothing here right now.</p><div class=\"notice\"><p><strong>This signing page is an early, test-stage convenience.</strong> Shōkai is still a draft, and Kigenka runs this page while it's being tested. <a href=\"/about\">About this page</a></p></div></main></body></html>";
// The rc4 reference page's own paths only (reference/signing-page/server.mjs): its static files, /about (NOTICE=test-stage) and its API.
const ALLOWED = new Set(["", "/", "/app.js", "/style.css", "/about", "/api/state", "/api/register/options", "/api/register/verify", "/api/batch/options", "/api/batch/verify", "/api/sign/options", "/api/sign/verify", "/api/decline"]);
const sha = (s) => createHash("sha256").update(s).digest();

export function route(rawUrl, session = SESSION, now = Date.now()) {
  const p = new URL(rawUrl, "http://x").searchParams.get("p") ?? "";
  const segs = p.split("/").filter((x, i) => i === 0 || x !== "");
  const token = segs[0] ?? "", sub = p.slice(token.length);
  const meta = { segments: segs.length };
  if (!session || !session.backend_origin || !session.token_sha256 || !(Date.parse(session.expires_at) > now)) return { inert: true, ...meta };
  if (token.length < 24 || !timingSafeEqual(sha(token), Buffer.from(session.token_sha256, "hex"))) return { inert: true, ...meta };
  if (!ALLOWED.has(sub)) return { inert: true, ...meta };
  return { inert: false, target: `${session.backend_origin}/p/${token}${sub}`, ...meta };
}
const readRaw = (req) => new Promise((ok, bad) => { if (req.body !== undefined) return ok(typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body));
  let d = ""; req.on("data", (c) => { d += c; if (d.length > 100_000) { req.destroy(); bad(new Error("too large")); } }); req.on("end", () => ok(d)); req.on("error", bad); });

export async function relay(req, res, session = SESSION) {
  const r = route(req.url, session);
  const inert = () => { res.writeHead(404, { ...SEC, "Content-Type": "text/html; charset=utf-8", "X-Relay-Segments": String(r.segments) }); res.end(INERT); };
  if (r.inert || !["GET", "POST"].includes(req.method)) return inert();
  try {
    const body = req.method === "POST" ? await readRaw(req) : undefined;
    const up = await fetch(r.target, { method: req.method, body, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", "User-Agent": "kigenka-sign-relay/1", "X-Pinggy-No-Screen": "1", "X-Sign-Relay": session.relay_secret } });
    const buf = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { ...SEC, "Content-Type": up.headers.get("content-type") ?? "application/octet-stream",
      ...(up.headers.get("content-security-policy") ? { "Content-Security-Policy": up.headers.get("content-security-policy") } : {}) });
    res.end(buf);
  } catch { res.writeHead(502, { ...SEC, "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "The signing session isn't reachable right now. Nothing was signed." })); }
}
export default function handler(req, res) { return relay(req, res); }
