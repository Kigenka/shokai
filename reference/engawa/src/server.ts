// Local HTTP transport implementing SPEC §11 (v0.2.5) on 127.0.0.1 only. Nothing leaves the machine.
//   GET  <base>/                       → 200 DoorPointer (§11.1 door root)
//   GET  <base>/places                 → 200 PlaceListing (§3.1, §11.1)
//   POST <entry>, POST <lobby>         → 200 ReplyEnvelope; prose / malformed / other protocol → the lobby in the envelope
//   POST <inbox>                       → 200 ReplyEnvelope of the signer's held messages for a valid signed inbox_poll; refused polls 403 + empty envelope
//   any other path or method           → 404 DoorPointer
// Every place runs the conformance test profile (Appendix B, x-test-profile "shokai-b/0.3"): loopback status / log / evidence URLs,
// the pair place's test owner (B.2) and the test gathering (B.3).
// No admin or test endpoints. Owner / inside-party decisions come from a local, off-wire console queue (state/console/*.json; host-3-004).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { fernwood, fernwoodV05, withHostCard, harborlight, maison, engawa, pair } from "./places.js";
import { Host, HouseConfigInvalid, claimLabel, type Out } from "./host.js";
import { RealVerifier } from "./verify.js";
import { edKeyToRaw, didKeyFragment, didJwkFromKey, newEd25519, ed25519FromLabel, TEST_INTRODUCER_LABEL, newPasskeyOwner, makeOwnerSigned, randomId, sha256, b64u, type Ed25519Signer, type PasskeyOwner } from "./crypto.js";
import type { FetchCache } from "./trust.js";
import { doorPointer, ownAddressOf, placeListing, entryUrl, inboxUrl } from "./door.js";
import { SPEC_VERSION } from "./version.js";
import * as V5 from "./v050.js";
import type { PlaceConfig } from "./policy.js";
import type * as S from "./shapes.js";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const STATE = path.resolve(args.state ?? path.join(ROOT, "state"));
const ROUND = args.round ?? "final";
const WIRE = path.resolve(args.wire ?? path.join(ROOT, "run", ROUND, "wire"));
const PORT = Number(args.port ?? 8787);
const BASE = args.base ?? `http://127.0.0.1:${PORT}`;
/** Outbound fetches (allowance status, vouch logs, evidence): Appendix B.1 accepts http loopback URLs in a conformance run only; https
 *  non-loopback URLs are not fetched in this local round unless --allow-remote-fetch (unreachable ⇒ fail closed / not_now). */
const REMOTE_FETCH = args["allow-remote-fetch"] === "true";
const CONSOLE = path.join(STATE, "console");
for (const d of [STATE, WIRE, CONSOLE, path.join(CONSOLE, "done"), path.join(STATE, "reports")]) fs.mkdirSync(d, { recursive: true });
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

// Test-only keys, persisted so ids stay stable across restarts (local only; never reuse for anything real).
function loadSigner(name: string): Ed25519Signer {
  const f = path.join(STATE, `${name}.key.json`);
  if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, "utf8")); const priv = createPrivateKey(j.pem); const pubRaw = edKeyToRaw(createPublicKey(priv)); return { kind: "ed25519", id: j.id, key_id: didKeyFragment(j.id), priv, pubRaw }; }
  const s = newEd25519(); fs.writeFileSync(f, JSON.stringify({ id: s.id, pem: s.priv.export({ format: "pem", type: "pkcs8" }) }), { mode: 0o600 }); return s;
}
function loadPasskey(name: string): PasskeyOwner {
  const f = path.join(STATE, `${name}.passkey.json`);
  if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, "utf8")); const priv = createPrivateKey(j.pem); const pub = createPublicKey(priv); const id = didJwkFromKey(pub);
    return { kind: "passkey", id, key_id: id + "#0", priv, pub, rpId: j.rpId ?? "owners.example" }; }
  const o = newPasskeyOwner(); fs.writeFileSync(f, JSON.stringify({ id: o.id, rpId: o.rpId, pem: o.priv.export({ format: "pem", type: "pkcs8" }) }), { mode: 0o600 }); return o;
}

// What the hosts fetched themselves (shared cache, refreshed per message).
const fetched: FetchCache = new Map();
const invFile = path.join(STATE, "engawa-invitees.json");
const invitees: S.Gathering["invitees"] = fs.existsSync(invFile) ? JSON.parse(fs.readFileSync(invFile, "utf8")) : [];
const pairOwner = loadPasskey("pair-owner");
type Keys = { rep: Ed25519Signer; principal: Ed25519Signer };
const PROFILE = args["test-profile"] !== "false";   // Appendix B on every place unless --test-profile=false
const builders: Record<string, (k: Keys) => PlaceConfig> = { fernwood, "fernwood-v05": fernwoodV05, harborlight, "maison-ardoise": maison, engawa: (k) => engawa(k, invitees, undefined, PROFILE), pair: (k) => pair(k.rep, pairOwner, "Aya (test owner)") };
const hosts: Record<string, Host> = {}; const keysOf: Record<string, Keys> = {};
for (const [name, b] of Object.entries(builders)) {
  const k = { rep: loadSigner(name + "-rep"), principal: loadSigner(name + "-principal") }; keysOf[name] = k;
  // v0.2.8 (Appendix B.5): in a conformance run every place names the test introducer for money / account-creating requests.
  let cfg = b(k); if (PROFILE) cfg.policy = { ...cfg.policy, commitment_introducers: [ed25519FromLabel(TEST_INTRODUCER_LABEL).id] };
  // v0.5.0 fixture: its Shōkai host card (with the house summary's digest) is signed over the final policy, so house_digest holds.
  if (name === "fernwood-v05") cfg = withHostCard(cfg, k.principal, entryUrl(BASE, name), { duties: ["seat", "issue_passes", "receipts", "consider", "misconduct_notices", "hold_purchases"] });
  hosts[name] = new Host(cfg, k.rep, name === "pair" ? null : k.principal, new RealVerifier(), undefined,
    { fetched, entryUrl: entryUrl(BASE, name), inboxUrl: inboxUrl(BASE, name), testProfile: PROFILE, ...(name === "pair" && PROFILE ? { testOwner: pairOwner } : {}), ...(name === "harborlight" && PROFILE ? { testDecider: true } : {}) });
}
// v0.3.0-rc4 (§3.6, C192): each place's durable state (mandate ledgers, nevers, spent nonces, revocations…) is kept in STATE and
// restored at start, so a restart never resets what an owner allowed. A place that ran before (it left a snapshot) but whose durable
// state is gone lost it: it refuses mandates valid before now (refuse-on-loss). A brand-new place (empty STATE) has nothing to lose.
for (const [n, h] of Object.entries(hosts)) {
  const f = path.join(STATE, `${n}.durable.json`);
  if (fs.existsSync(f)) h.restoreDurable(JSON.parse(fs.readFileSync(f, "utf8")));
  else if (fs.existsSync(path.join(STATE, `${n}.snapshot.json`))) { h.opts.stateEpoch = new Date().toISOString().replace(/\.\d+Z$/, "Z"); console.log(`${n}: durable state missing; refusing mandates valid before ${h.opts.stateEpoch} (§3.6)`); }
}
const all = () => Object.values(hosts);

let seq = 0;
function writeWire(m: any, dir: "in" | "out" | "held", place: string) {
  const p = m?.payload ?? m; seq++;
  const f = `${Date.now()}-${String(seq).padStart(5, "0")}-${place}-${dir}-${(p?.type ?? "msg")}-${String(p?.msg_id ?? "x").replace(/[^\w.-]/g, "_")}.json`;
  fs.writeFileSync(path.join(WIRE, f), JSON.stringify(m, null, 2));
}
function save() {
  for (const [n, h] of Object.entries(hosts)) {
    fs.writeFileSync(path.join(STATE, `${n}.snapshot.json`), JSON.stringify(h.snapshot(), null, 1));
    const f = path.join(STATE, `${n}.durable.json`); fs.writeFileSync(f + ".tmp", JSON.stringify(h.durableState())); fs.renameSync(f + ".tmp", f);   // atomic
  }
}
function holdAll(h: Host, outs: Out[]) { for (const o of outs) { h.hold(o); writeWire(o.message, "held", h.cfg.name); } }

// ---- the host's own fetches (§2.5 evidence, §5.2 / the Revocation status extension allowance status, §4 vouch logs) ----
function urlsIn(raw: any): { url: string; kind: "json" | "bytes" }[] {
  const p = raw?.payload ?? raw; const out: { url: string; kind: "json" | "bytes" }[] = [];
  if (!p || typeof p !== "object") return out;
  const st = p.allowance?.allowance?.payload?.revocation_status; if (typeof st === "string") out.push({ url: st, kind: "json" });
  const log = p.vouch?.payload?.revocation_log; if (typeof log === "string") out.push({ url: log, kind: "json" });
  const card = p.card?.payload;
  if (typeof card?.revocation_url === "string") out.push({ url: card.revocation_url, kind: "json" });   // v0.3.0-rc4 (§2.6, C191)
  const refs = [...(card?.claims ?? []), ...Object.values<any>(card?.imprint ?? {}).flat()].flatMap((c: any) => (Array.isArray(c?.evidence_refs) ? c.evidence_refs : []));
  for (const r of refs) if (r?.content_digest && typeof r.ref === "string" && /^https?:/.test(r.ref)) out.push({ url: r.ref, kind: "bytes" });
  return out;
}
const isLoopback = (u: string) => { try { const h = new URL(u).hostname; return h === "127.0.0.1" || h === "localhost" || h === "[::1]"; } catch { return false; } };
async function prefetch(raw: any, h: Host) {
  for (const { url, kind } of [...urlsIn(raw), ...h.actRevocationUrls(raw).map((url) => ({ url, kind: "json" as const }))]) {   // C265: an open seat's card list
    const at = nowIso(); let scheme = ""; try { scheme = new URL(url).protocol; } catch { /* bad url */ }
    const allowed = scheme === "https:" ? (REMOTE_FETCH || isLoopback(url)) : scheme === "http:" ? (h.testProfile && isLoopback(url)) : false;   // B.1
    if (!allowed) { fetched.set(url, { ok: false, at }); continue; }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "error" });
      if (!r.ok) { fetched.set(url, { ok: false, at }); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      const digest = "sha-256:" + b64u(sha256(buf));
      let body: unknown = undefined; if (kind === "json") { try { body = JSON.parse(buf.toString("utf8")); } catch { body = undefined; } }
      fetched.set(url, { ok: kind === "bytes" || body !== undefined, at, body, digest });
    } catch { fetched.set(url, { ok: false, at }); }
  }
}

// ---- off-wire console (the owners' and inside parties' own UI stand-in; never reachable over HTTP) ----
function consoleCmd(c: any): unknown {
  const h = hosts[c.place ?? "pair"]; if (!h) throw new Error("unknown place");
  const now = nowIso();
  switch (c.cmd) {
    case "resolve": {
      let consent = c.consent as S.Signed<S.OwnerConsent> | undefined;
      const cons = h.considerations.get(c.ref); if (!cons) throw new Error("unknown consideration");
      if (!consent && h.cfg.peer && cons.routed_to.kind === "principal")   // the SIMULATED owner approves with its test passkey
        consent = makeOwnerSigned<S.OwnerConsent>({ consent_id: randomId("oc"), owner_id: pairOwner.id, representative_id: h.cfg.rep_id, action: "approve_commitment",
          decision: c.decision === "grant" ? "approve" : "decline", subject_ref: { kind: "consideration", id: cons.ref, digest: cons.considering_digest }, assurance: "passkey",
          shown_to_owner: { text: `Approve: ${cons.actions.join(", ")} with ${cons.principal}.`, locale: "en-US" }, issued_at: now,
          expires_at: new Date(Date.now() + 86400e3).toISOString().replace(/\.\d+Z$/, "Z") }, pairOwner, now);
      const decided = c.decision === "grant" ? { decision: "grant" as const, approve_actions: c.approve_actions, limits: c.limits } : { decision: "deny" as const, disposition: c.disposition ?? "not_now" };
      const outs = h.resolveConsideration(c.ref, decided, c.text ?? "Thank you for your patience.", consent); holdAll(h, outs); return outs.map((o) => o.message);
    }
    // v0.5.0 (door.endSeat, §6.10 guard 14): the host ends a live seat; its closing farewell is held for the visitor's inbox (C234).
    case "end_seat": { const n = h.outbox.length; const ended = h.endSeat(String(c.seat_id ?? "")); const outs = h.outbox.splice(n); holdAll(h, outs); return { ended, held: outs.length }; }
    // v0.5.0 (§2.3, C236): would a door start with this place's house config changed by `patch` (policy members; null removes one)?
    // The summary is rebuilt from the changed policy unless the patch changes `summary` itself. Nothing is started or kept.
    case "try_config": {
      const P = { ...h.cfg.policy } as Record<string, unknown>; const patch = (c.patch ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(patch)) if (k !== "summary") { if (v === null) delete P[k]; else P[k] = v; }
      const cfg = { ...h.cfg, policy: P } as PlaceConfig; const sum = h.cfg.policy.summary;
      if (sum) P.summary = patch.summary && typeof patch.summary === "object" ? { ...sum, ...(patch.summary as object) } : V5.houseSummaryOf(cfg as any, sum.purpose, sum.spec_ref);
      try { new Host(cfg, null, null); return { problems: [] }; } catch (e) { return { problems: e instanceof HouseConfigInvalid ? e.problems : ["threw: " + (e as Error).message] }; }
    }
    case "extend": { const outs = h.extendConsideration(c.ref, c.response_by); holdAll(h, outs); return outs.map((o) => o.message); }
    case "peer_invite": {
      const inv = makeOwnerSigned<S.PeerInvitation>({ invitation_id: c.invitation_id ?? randomId("inv"), from_owner: { principal_id: pairOwner.id, display_name: "Aya (simulated)" },
        to_owner: c.to_owner, representatives: [h.cfg.rep_id, c.to_rep], purposes: c.purposes ?? ["collaboration"],
        place: { place_id: c.place_id ?? randomId("pair"), kind: "pair", house_rules: { default_attribution: "private", private_never_leaves: true } },
        valid_from: now, expires_at: c.expires_at ?? new Date(Date.now() + 14 * 86400e3).toISOString().replace(/\.\d+Z$/, "Z"),
        answer_by: c.answer_by ?? new Date(Date.now() + 7 * 86400e3).toISOString().replace(/\.\d+Z$/, "Z") }, pairOwner, now);
      const o = h.issuePeerInvitation(inv, c.to_rep); holdAll(h, [o]); return o.message;
    }
    case "answer_invitation": {
      const got = h.invitationsReceived.get(c.invitation_id); if (!got) throw new Error("unknown invitation");
      const answer = makeOwnerSigned<S.OwnerConsent>({ consent_id: randomId("oc"), owner_id: pairOwner.id, representative_id: h.cfg.rep_id, action: "accept_invitation",
        decision: c.decision === "decline" ? "decline" : "approve", subject_ref: { kind: "invitation", id: c.invitation_id, digest: got.invitation.payload_digest }, assurance: "passkey",
        shown_to_owner: { text: `Meet the representative of ${claimLabel(got.invitation.payload.from_owner.principal_id, got.invitation.payload.from_owner.display_name)}?`, locale: "en-US" }, issued_at: now,
        expires_at: new Date(Date.now() + 7 * 86400e3).toISOString().replace(/\.\d+Z$/, "Z") }, pairOwner, now);
      const o = h.answerPeerInvitation(c.invitation_id, answer); holdAll(h, [o]); return o.message;
    }
    case "set_invitees": {
      fs.writeFileSync(invFile, JSON.stringify(c.invitees));
      const sg = engawa(keysOf.engawa, c.invitees).gathering!;
      const outs = hosts.engawa.place!.updateGathering(sg); holdAll(hosts.engawa, outs); return sg;
    }
    case "report": { const r = h.report(c.encounter_id, c.locale ?? "en-US"); fs.writeFileSync(path.join(STATE, "reports", `${h.cfg.name}-${c.encounter_id}.json`), JSON.stringify(r, null, 1)); return r; }
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
  for (const h of all()) holdAll(h, h.sweep());   // silence is no (§8.1): lapsed considerations become held outcomes
  save();
}

// ---- HTTP (§11) ----
const srv = http.createServer((req, res) => {
  const chunks: Buffer[] = []; req.on("data", (c) => chunks.push(c)); req.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const send = (code: number, x: unknown) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(x, null, 2)); };
    let parts: string[] = [];
    const door404 = () => send(404, doorPointer(BASE, all(), ownAddressOf(parts, (n) => (Object.hasOwn(hosts, n) ? hosts[n] : undefined))));   // §11.1 C200: `here` at a place's own address
    try {
      const u = new URL(req.url ?? "/", "http://x"); parts = u.pathname.split("/").filter(Boolean);
      if (req.method === "GET" && u.pathname === "/") return send(200, doorPointer(BASE, all()));   // §11.1 door root (v0.2.4)
      if (req.method === "GET" && u.pathname === "/places") return send(200, placeListing(BASE, all(), nowIso()));
      // v0.5.0 (§2.3, C248): GET <entry>/house-summary.json, cacheable while the host card's summary_digest is unchanged.
      if (req.method === "GET" && parts[0] === "places" && parts.length === 4 && parts[2] === "entry" && parts[3] === "house-summary.json" && Object.hasOwn(hosts, parts[1])) {
        const r = hosts[parts[1]].houseSummary(); res.writeHead(r.status, { "content-type": "application/json; charset=utf-8", ...r.headers }); return res.end(JSON.stringify(r.body));
      }
      // Red team phase 1 (§3.2, C268, provisional): GET <entry>/host-card.json, the signed Shōkai host card, readable before the ritual.
      if (req.method === "GET" && parts[0] === "places" && parts.length === 4 && parts[2] === "entry" && parts[3] === "host-card.json" && Object.hasOwn(hosts, parts[1])) {
        const r = hosts[parts[1]].hostCardPublic(); res.writeHead(r.status, { "content-type": "application/json; charset=utf-8", ...r.headers }); return res.end(JSON.stringify(r.body));
      }
      const h = parts[0] === "places" && parts.length === 3 ? hosts[parts[1]] : undefined;
      if (!h || req.method !== "POST") return door404();
      if (parts[2] === "entry" || parts[2] === "lobby") {
        let m: unknown = body; try { m = JSON.parse(body); } catch { /* prose: the lobby */ }
        // v0.5.0 (§5.4, C235): a body carrying a payment instrument is never written to the wire log (only that it arrived).
        writeWire(typeof m === "string" ? (V5.luhnLike(m) ? { prose: "[withheld: payment instrument]" } : { prose: m }) : V5.carriesInstrument(m) ? { withheld: "payment instrument" } : m, "in", h.cfg.name);
        await prefetch(m, h);
        let env: S.ReplyEnvelope;
        try { env = h.entryPost(m); } catch { env = h.entryPost(String(body)); }   // anything that breaks the ritual parser is malformed → lobby
        if (h.capacityRefused) { res.setHeader("retry-after", "60"); return send(429, env); }   // v0.2.8 (§3.4): encounter cap, refuse new
        for (const x of env.messages) writeWire(x, "out", h.cfg.name);
        for (const [to, l] of h.inbox) for (const x of l) if (!x.__logged) { Object.defineProperty(x, "__logged", { value: true }); writeWire(x, "held", h.cfg.name + "-" + to.slice(-8)); }
        save(); return send(200, env);
      }
      if (parts[2] === "inbox") {
        let m: unknown = null; try { m = JSON.parse(body); } catch { /* not a poll */ }
        const r = h.inboxPost(m); return send(r.status, r.body);
      }
      return door404();
    } catch { return door404(); }
  });
});
srv.listen(PORT, "127.0.0.1", () => {
  console.log(`Shōkai reference host (shokai/0.5, answering shokai/0.3 in kind, spec v${SPEC_VERSION}, §11 HTTP binding${PROFILE ? ", test profile shokai-b/0.3" : ""}) on ${BASE}  (wire log: ${WIRE}; console: ${CONSOLE})`);
  for (const h of all()) console.log(`  ${h.cfg.name.padEnd(15)} entry=${entryUrl(BASE, h.cfg.name)} rep=${h.cfg.rep_id}`);
  if (hosts.engawa.place && invitees.length) holdAll(hosts.engawa, hosts.engawa.place.invitations());
  save();
});
setInterval(processConsole, 1000);
