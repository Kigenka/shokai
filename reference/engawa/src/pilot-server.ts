// S5 pilot server (BINDING-PLAN §4): the §11 HTTP binding on 127.0.0.1 only, one place per process. Nothing leaves the machine.
//   --mode=engawa   The Engawa (gathering), place keys from <key home>/places/engawa, guest list from --invitees (public JSON)
//   --mode=door     a representative's own door (pair place, the Peer meetings extension): --rep=<slug> (key <key home>/reps/<slug>), --card=<owner-signed card JSON>
//   GET / → DoorPointer; GET /places → listing; POST <entry>|<lobby> → ReplyEnvelope; POST <inbox> → signed inbox_poll; else 404.
// Off-wire console (state/console/*.json, never reachable over HTTP): report, answer_signed (an owner's pre-signed accept_invitation).
// v0.3.0-rc4: the place's durable state (§3.6) is kept in <state>/<place>.durable.json and restored at start; a place whose durable
// state is gone but which ran before refuses mandates valid before the restart (refuse-on-loss). Card revocation lists (§2.6) are
// prefetched from the fetch allow-list only; any other revocation_url is unreachable, so the card is refused (fail closed).
// It never reads S3 state or keys.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { pilotEngawa, pairDoor } from "./places.js";
import { Host, type Out } from "./host.js";
import { RealVerifier } from "./verify.js";
import { edKeyToRaw, didKeyFromEdRaw, didKeyFragment, sha256, b64u, newEd25519, type Ed25519Signer } from "./crypto.js";
import { doorPointer, ownAddressOf, placeListing, entryUrl, inboxUrl } from "./door.js";
import type { FetchCache } from "./trust.js";
import type * as S from "./shapes.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, ...v]) => [k, v.join("=") || "true"]));
const MODE = args.mode ?? "engawa";
const PORT = Number(args.port ?? (MODE === "engawa" ? 8890 : 8892));
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = path.resolve(args.state ?? "state"); const WIRE = path.resolve(args.wire ?? path.join(STATE, "wire"));
const CONSOLE = path.join(STATE, "console"); const RECEIVED = path.join(STATE, "received");
for (const d of [STATE, WIRE, CONSOLE, path.join(CONSOLE, "done"), path.join(STATE, "reports"), RECEIVED]) fs.mkdirSync(d, { recursive: true });
import { KEY_HOME } from "./compat.js";
import { SPEC_VERSION } from "./version.js";
const ephemeral = process.argv.includes("--ephemeral-keys=true");
const KEYS = KEY_HOME;   // the pilot's local key directory (compat.ts); never read with --ephemeral-keys
// Red team 2026-10-25 hardening (see redteam/2026-10-25/REPORT.md). Loopback pilot limits; generous for the ritual (largest real message ≈ 10 kB).
const MAX_BODY = Number(args["max-body"] ?? 256 * 1024);          // RT-I4: bigger bodies → 413, never read into memory or logged
const MAX_FETCH = 64 * 1024;                                       // RT-B11: a status document larger than this is "unreachable"
// RT-L1: two token buckets. Anonymous arrivals (prose, unparseable, no "from") share a small one; everything shares a larger backstop
// (signed messages from fresh keys are free to mint, so per-sender buckets would not stop a flood; only the backstop does).
const RATE_ANON = { burst: Number(args["anon-burst"] ?? 60), perSec: Number(args["anon-per-sec"] ?? 10) };
const RATE_ALL = { burst: Number(args["rate-burst"] ?? 600), perSec: Number(args["rate-per-sec"] ?? 100) };
const HARDEN = { maxMessageAgeS: 300, autoInvite: false, roomRatePerMin: 30, maxEncounters: Number(args["max-encounters"] ?? 5000) };   // RT-C4, RT-F5, RT-F9, RT2-DOS1 / v0.2.8 §3.4 refuse-new
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

function loadEd(file: string): Ed25519Signer {
  const mode = fs.statSync(file).mode & 0o777; if (mode & 0o077) throw new Error("key file permissions too open");
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const priv = createPrivateKey({ key: { kty: j.kty, crv: j.crv, x: j.x, d: j.d }, format: "jwk" }); const pubRaw = edKeyToRaw(createPublicKey(priv)); const id = didKeyFromEdRaw(pubRaw);
  return { kind: "ed25519", id, key_id: didKeyFragment(id), priv, pubRaw };
}

const fetched: FetchCache = new Map();
let host: Host; let name: string;
if (MODE === "engawa") {
  // RT2-SC2 (red team 2026-10-26): --ephemeral-keys makes fresh in-memory place keys, so a test or red-team run never reads the local key directory.
  const k = args["ephemeral-keys"] === "true" ? { rep: newEd25519(), principal: newEd25519() }
    : { rep: loadEd(path.join(KEYS, "places/engawa/rep.ed25519.jwk")), principal: loadEd(path.join(KEYS, "places/engawa/principal.ed25519.jwk")) };
  const invitees: S.Gathering["invitees"] = JSON.parse(fs.readFileSync(path.resolve(args.invitees ?? "invitees.json"), "utf8")).invitees
    .map((i: any) => ({ representative_id: i.representative_id, principal_id: i.principal_id, invited_by: k.principal.id }));
  name = "engawa";
  host = new Host(pilotEngawa(k, invitees), k.rep, k.principal, new RealVerifier(), undefined, { acceptLegacyCards: !ephemeral, fetched, entryUrl: entryUrl(BASE, name), inboxUrl: inboxUrl(BASE, name), testProfile: true, ...HARDEN });
} else {
  const slug = args.rep; if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("--rep=<slug> required");
  const rep = loadEd(path.join(KEYS, "reps", slug, "rep.ed25519.jwk"));
  const card: S.SignedCard = JSON.parse(fs.readFileSync(path.resolve(args.card), "utf8"));
  if (card.payload.representative_id !== rep.id) throw new Error("card is for another representative");
  name = "door";
  host = new Host(pairDoor(rep.id, card, args.display ?? slug), rep, null, new RealVerifier(), undefined, { acceptLegacyCards: !ephemeral, fetched, entryUrl: entryUrl(BASE, name), inboxUrl: inboxUrl(BASE, name), testProfile: true, ...HARDEN });
}
const all = () => [host];
// v0.3.0-rc4 (§3.6, C192): restore durable state, or refuse-on-loss when a previous run left a snapshot but no durable state.
const DURABLE = path.join(STATE, `${name}.durable.json`);
if (fs.existsSync(DURABLE)) { host.restoreDurable(JSON.parse(fs.readFileSync(DURABLE, "utf8"))); console.log(`${nowIso()} ${name}: durable state restored (§3.6)`); }
else if (fs.existsSync(path.join(STATE, `${name}.snapshot.json`))) { host.opts.stateEpoch = nowIso(); console.log(`${nowIso()} ${name}: durable state missing; refusing mandates valid before ${host.opts.stateEpoch} (§3.6)`); }

let seq = 0;
function writeWire(m: any, dir: string) {
  const p = m?.payload ?? m; seq++;
  fs.writeFileSync(path.join(WIRE, `${Date.now()}-${String(seq).padStart(5, "0")}-${name}-${dir}-${String(p?.type ?? "msg").replace(/[^\w.-]/g, "_").slice(0, 40)}-${String(p?.msg_id ?? "x").replace(/[^\w.-]/g, "_").slice(0, 80)}.json`), JSON.stringify(m, null, 2));
}
const save = () => {
  fs.writeFileSync(path.join(STATE, `${name}.snapshot.json`), JSON.stringify(host.snapshot(), null, 1));
  fs.writeFileSync(DURABLE + ".tmp", JSON.stringify(host.durableState())); fs.renameSync(DURABLE + ".tmp", DURABLE);   // atomic (§3.6)
};
const holdAll = (outs: Out[]) => { for (const o of outs) { host.hold(o); writeWire(o.message, "held"); } };

// Outbound fetches (allowance status): Appendix B.1 loopback http only. Nothing else is fetched.
const PLACES_CFG: any = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(args.places ?? "../places.json"), "utf8")); } catch { return {}; } })();
const ALIAS: Record<string, string> = PLACES_CFG.status_alias ?? {};
// RT-B10: the host fetches ONLY its known status service(s) (places.json fetch_allow + the alias targets), never any loopback URL a visitor names.
const FETCH_ALLOW: string[] = [...(Array.isArray(PLACES_CFG.fetch_allow) ? PLACES_CFG.fetch_allow : []), ...Object.values(ALIAS), ...String(args["fetch-allow"] ?? "").split(",").filter(Boolean)].filter((x) => typeof x === "string" && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(x));
const aliased = (u: string) => { for (const [a, b] of Object.entries(ALIAS)) if (u.startsWith(a)) return b + u.slice(a.length); return u; };
const isLoopback = (u: string) => { try { const h = new URL(u).hostname; return h === "127.0.0.1" || h === "localhost"; } catch { return false; } };
// What the host fetches before deciding: an allowance's status (Revocation status extension) and, since rc4, the card's revocation
// list (§2.6, C191). Only URLs under FETCH_ALLOW are fetched (RT-B10); anything else is recorded as unreachable (fail closed).
function urlsIn(raw: any): string[] {
  const p = raw?.payload ?? raw; if (!p || typeof p !== "object") return [];
  return [p.allowance?.allowance?.payload?.revocation_status, p.card?.payload?.revocation_url].filter((u): u is string => typeof u === "string");
}
async function prefetch(raw: any) {
  for (const url of urlsIn(raw)) await fetchOne(url);
}
async function fetchOne(url: string) {
  const at = nowIso();
  const target = aliased(url);
  if (!isLoopback(url) || !FETCH_ALLOW.some((pfx) => target.startsWith(pfx))) { fetched.set(url, { ok: false, at }); return; }
  try {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 2000);
    const r = await fetch(target, { signal: ac.signal, redirect: "error" });
    if (!r.ok || !r.body) { clearTimeout(timer); ac.abort(); fetched.set(url, { ok: false, at }); return; }
    const parts: Buffer[] = []; let n = 0;
    for await (const ch of r.body as any) { n += ch.length; if (n > MAX_FETCH) { ac.abort(); break; } parts.push(Buffer.from(ch)); }
    clearTimeout(timer);
    if (n > MAX_FETCH) { fetched.set(url, { ok: false, at }); return; }
    const buf = Buffer.concat(parts); let body: unknown; try { body = JSON.parse(buf.toString("utf8")); } catch { body = undefined; }
    fetched.set(url, { ok: body !== undefined, at, body, digest: "sha-256:" + b64u(sha256(buf)) });
  } catch { fetched.set(url, { ok: false, at }); }
}

function consoleCmd(c: any): unknown {
  switch (c.cmd) {
    case "report": { const r = host.report(c.encounter_id, c.locale ?? "en-US"); fs.writeFileSync(path.join(STATE, "reports", `${name}-${c.encounter_id}.json`), JSON.stringify(r, null, 1)); return r; }
    case "answer_signed": { const o = host.answerPeerInvitation(c.invitation_id, c.answer); holdAll([o]); return { held_for: o.to }; }
    default: throw new Error("unknown console command");
  }
}
function processConsole() {
  for (const f of fs.readdirSync(CONSOLE).filter((x) => x.endsWith(".json")).sort()) {
    const src = path.join(CONSOLE, f); let result: unknown;
    try { result = { ok: true, result: consoleCmd(JSON.parse(fs.readFileSync(src, "utf8"))) }; } catch (e) { result = { ok: false, error: (e as Error).message }; }
    fs.writeFileSync(path.join(CONSOLE, "done", f.replace(/\.json$/, ".result.json")), JSON.stringify(result, null, 1));
    fs.renameSync(src, path.join(CONSOLE, "done", f));
  }
  holdAll(host.sweep());
  // Received peer invitations are written out (public: the inviting owner's signed invitation) for the owner's answer off-wire.
  for (const [id, got] of host.invitationsReceived) { const f = path.join(RECEIVED, id.replace(/[^\w.-]/g, "_") + ".json"); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(got, null, 1)); }
  save();
}

const bucket = (r: { burst: number; perSec: number }) => { let tokens = r.burst, at = Date.now(); return () => { const t = Date.now(); tokens = Math.min(r.burst, tokens + ((t - at) / 1000) * r.perSec); at = t; if (tokens < 1) return false; tokens -= 1; return true; }; };
const takeAll = bucket(RATE_ALL), takeAnon = bucket(RATE_ANON);
const anonymous = (m: unknown) => { const x: any = m; return !(x && typeof x === "object" && !Array.isArray(x) && (typeof x.payload?.from === "string" || typeof x.from === "string")); };
const srv = http.createServer((req, res) => {
  const empty = (code: number, extra: Record<string, string> = {}) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", connection: "close", ...extra }); res.end(JSON.stringify({ protocol: "shokai/0.3", messages: [] })); };
  if (req.method === "POST" && !takeAll()) { empty(429, { "retry-after": "1" }); req.resume(); return; }   // RT-L1
  // RT-I4. v0.2.8: close only after the 413 is flushed, so the sender reliably reads it (destroying at once raced the reply).
  // The rest of the body is discarded unread-into-memory (bounded: ≤ 64 MB or 5 s), then the socket closes.
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) { res.writeHead(413, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ protocol: "shokai/0.3", messages: [] })); let gone = 0; const kill = setTimeout(() => req.destroy(), 5000);
    req.on("data", (c: Buffer) => { gone += c.length; if (gone > 64 << 20) { clearTimeout(kill); req.destroy(); } }); req.on("end", () => clearTimeout(kill)); return; }
  const chunks: Buffer[] = []; let size = 0, tooBig = false;
  req.on("data", (c) => { if (tooBig) return; size += c.length; if (size > MAX_BODY) { tooBig = true; chunks.length = 0; empty(413); req.destroy(); return; } chunks.push(c); });
  req.on("end", async () => { if (tooBig) return;
    const body = Buffer.concat(chunks).toString("utf8");
    const send = (code: number, x: unknown) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(x, null, 2)); };
    let parts: string[] = [];
    const door404 = () => send(404, doorPointer(BASE, all(), ownAddressOf(parts, (n) => (n === name ? host : undefined))));   // §11.1 C200
    try {
      const u = new URL(req.url ?? "/", "http://x"); parts = u.pathname.split("/").filter(Boolean);
      if (req.method === "GET" && u.pathname === "/") return send(200, doorPointer(BASE, all()));
      if (req.method === "GET" && u.pathname === "/places") return send(200, placeListing(BASE, all(), nowIso()));
      if (!(parts[0] === "places" && parts.length === 3 && parts[1] === name) || req.method !== "POST") return door404();
      if (parts[2] === "entry" || parts[2] === "lobby") {
        let m: unknown = body; try { m = JSON.parse(body); } catch { /* prose → lobby */ }
        if (anonymous(m) && !takeAnon()) { res.setHeader("retry-after", "1"); return send(429, { protocol: "shokai/0.3", messages: [] }); }   // RT-L1
        writeWire(typeof m === "string" ? { prose: m } : m, "in");
        await prefetch(m);
        let env: S.ReplyEnvelope; try { env = host.entryPost(m); } catch { env = host.entryPost(String(body)); }
        // v0.2.8 (§3.4, P12): at the encounter cap the newcomer is refused (fail closed), never an existing guest.
        if (host.capacityRefused) { res.setHeader("retry-after", "60"); return send(429, env); }
        for (const x of env.messages) writeWire(x, "out");
        for (const [to, l] of host.inbox) for (const x of l) if (!x.__logged) { Object.defineProperty(x, "__logged", { value: true }); writeWire(x, "held-" + to.slice(-8)); }
        processConsole(); return send(200, env);
      }
      if (parts[2] === "inbox") { let m: unknown = null; try { m = JSON.parse(body); } catch { /* not a poll */ } const r = host.inboxPost(m); return send(r.status, r.body); }
      return door404();
    } catch { return door404(); }
  });
});
srv.listen(PORT, "127.0.0.1", () => {
  console.log(`${nowIso()} S5 pilot ${MODE} (spec v${SPEC_VERSION}, §11, test profile B.1/B.3) on ${BASE}; rep ${host.cfg.rep_id}; wire ${WIRE}`);
  if (host.place && host.cfg.gathering!.payload.invitees.length) holdAll(host.place.invitations());
  console.log(`${nowIso()} gathering digest ${host.cfg.gathering?.payload_digest ?? "-"}`);
  save();
});
setInterval(processConsole, 1000);
