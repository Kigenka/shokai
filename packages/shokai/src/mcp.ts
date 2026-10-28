// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The Shōkai gate for MCP servers: put a Shōkai door in front of any MCP server (Streamable HTTP).
//   - The door's §11 addresses (<base>/places, …/entry, …/lobby, …/inbox) are served next to the MCP endpoint.
//   - A representative is seated at the door first (the ritual); each tools/call then carries a signed act for that seat in the
//     `Shokai-Act` header. The gate checks the signature, the seat, the tool, the arguments' digest, freshness and single use,
//     and the seat's limits (operations, spending caps) before the call reaches the MCP server.
//   - tools/list is filtered to the seat's tools when the caller names a seat (`Shokai-Seat`), for JSON responses.
//   - A caller with no seat gets a JSON-RPC error whose data says how to get one: not_now, with the door's address (never a bare refusal).
// The gate is an adapter (`GateAdapter.check(request, headers)`), so it also fits frameworks other than node:http.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Door, readBody, digestOf, type Visit } from "./index.js";
import { isTimestamp } from "./core/crypto.js";

export type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
export type JsonRpcError = { code: number; message: string; data?: unknown };
export type Headers = Record<string, string | string[] | undefined>;
export type GateVerdict = { allow: true; seatId?: string; tool?: string; act?: { from: string; msgId: string } } | { allow: false; error: JsonRpcError };
/** Anything that decides whether one JSON-RPC request may reach the MCP server. */
export interface GateAdapter { check(req: JsonRpcRequest, headers: Headers): GateVerdict; }

export const ACT_HEADER = "shokai-act";
export const SEAT_HEADER = "shokai-seat";
/**
 * JSON-RPC error code for every Shōkai refusal of a call (implementation-defined range): no seat, a tool outside the seat, a limit
 * passed, or the representative's own "not sent". The code only says "Shōkai refused this"; the message says why in words, and
 * `data.shokai` says it in fields: `refused_by` ("door", "gate" or "representative"), `reason_code`, and for a door's refusal of
 * a signed act its `act_decision`.
 */
export const SHOKAI_NOT_SEATED = -32040;
/** The same code under a name that says what it means. */
export const SHOKAI_REFUSED = SHOKAI_NOT_SEATED;
const fmtMoney = (m: any) => (m && typeof m === "object" && typeof m.value === "string" && typeof m.currency === "string" ? `${m.value} ${m.currency}` : null);
/**
 * A visitor-facing sentence for a door's act_decision (§7.2), from its fields and the seat the act named. Each reason gets its
 * own wording; "get a seat first" is only for an act with no live seat.
 */
export function actRefusalMessage(tool: string, decision: any, seat: { tool_allowlist?: string[]; limits?: any; expires_at?: string } | undefined, args: Record<string, unknown> = {}): string {
  const code = decision?.reason_code; const disp = decision?.disposition; const amt = fmtMoney(args.amount); const cap = seat?.limits?.max_amount;
  if (disp === "never") return `${tool}: the door won't take acts from this representative again (never)`;
  if (!seat) return `${tool}: no live seat for this act (it ended, was never granted, or isn't yours): get a seat first`;
  if (code === "REQUEST_INCOMPLETE") return args.amount === undefined
    ? `${tool} spends: state what it spends in arguments.amount as {value, currency}, e.g. {value: "6.00", currency: "${cap?.currency ?? "USD"}"}`
    : `${tool}: arguments.amount is not valid Money: value a plain decimal string, currency an ISO 4217 code`;
  if (code === "SEAT_SCOPE_EXCEEDED") {
    const allowed = seat.tool_allowlist ?? [];
    if (!allowed.includes(tool)) return `${tool} is not in your seat (it allows ${allowed.length ? allowed.join(", ") : "no tools"})`;
    if (disp === "not_a_fit") return `${tool}: this seat isn't live or isn't yours: get a seat first`;
    if (seat.expires_at && Date.parse(seat.expires_at) < Date.now()) return `${tool}: your seat has expired; get a new seat`;
    if (!cap && (amt || seat.limits?.max_operations === undefined)) return `${tool}: this seat allows no spending (no max_amount); a seat that spends needs a mandate with max_amount`;
    if (amt && cap && (args.amount as any).currency !== cap.currency) return `${tool}: ${amt} is not in your seat's currency (${cap.currency}); amounts count against the cap only in its currency`;
    if (amt) return `${tool}: ${amt} would pass what is left of your seat's or mandate's limit (cap ${fmtMoney(cap)}); more needs a new mandate`;
    return `${tool}: no operations left under your seat's or mandate's limits; more needs a new mandate`;
  }
  if (code === "RITUAL_ORDER") return `${tool}: this act doesn't fit a live visit of yours (RITUAL_ORDER): start again from a fresh greeting and get a seat`;
  return `${tool}: the door refused this act${code ? ` (${code})` : ""}`;
}
const one = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h);
const nowMs = () => Date.now();

export type GateOptions = {
  /** Methods that pass without a seat. Default: server/discover (MCP 2026-07-28), the earlier revisions' handshake and ping, notifications and listings. */
  open?: (method: string) => boolean;
  /** Seconds an act's sent_at may differ from now (default 300, as the spec's clock skew). */
  skewSeconds?: number;
  /**
   * v0.3.0-rc4 (§7.2, C194): when the MCP server did not carry out a call the door let through, the gate releases what the act
   * counted (one operation and its amount), so a failed call doesn't use up the owner's allowance. It can only see JSON responses
   * (use enableJsonResponse, as statelessMcp does); for SSE responses nothing is released and the act stays counted (fail safe).
   *   "rpc-or-tool-error" (default, as §7.2 C187/C194 describe the MCP binding): release when the server answers the call with a
   *     JSON-RPC error or a tool result with isError: true (the service refused the act), or answers 4xx/5xx with no result, or the
   *     MCP handler throws before answering.
   *   "rpc-error": release only for JSON-RPC errors, 4xx/5xx and throws: for tools that may act in part before reporting isError,
   *     so a representative can't spend again what was in fact spent.
   *   "never": keep every admitted act counted.
   */
  releaseOn?: "rpc-error" | "rpc-or-tool-error" | "never";
};
const DEFAULT_OPEN = (m: string) => m === "server/discover" || m === "initialize" || m === "ping" || m.startsWith("notifications/") || m === "tools/list" || m === "resources/list" || m === "prompts/list" || m === "resources/templates/list";

/** The reference gate: a Shōkai door decides every tools/call. */
export class ShokaiGate implements GateAdapter {
  private used = new Map<string, number>();
  constructor(readonly door: Door, readonly opts: GateOptions = {}) {}
  private refuse(message: string, extra: Record<string, unknown> = {}): GateVerdict {
    return { allow: false, error: { code: SHOKAI_NOT_SEATED, message, data: { shokai: { refused_by: "gate", decision: "deny", disposition: "not_now", door: this.door.base + "/places", entry: this.door.entry,
      how: "Visit the door (greeting, signed card, introduction, invitation_request within a mandate your owner signed); once seated, send each tools/call with a signed act in the Shokai-Act header.", ...extra } } } };
  }
  check(req: JsonRpcRequest, headers: Headers): GateVerdict {
    if ((this.opts.open ?? DEFAULT_OPEN)(req.method)) return { allow: true, seatId: one(headers[SEAT_HEADER]) };
    if (req.method !== "tools/call") return this.refuse(`${req.method} needs a seat at this door`, { reason_code: "CREDENTIAL_REQUIRED" });
    const raw = one(headers[ACT_HEADER]);
    if (!raw) return this.refuse("This MCP server is behind a Shōkai door: get a seat first, then send each tools/call with a signed act (Shokai-Act header)", { reason_code: "CREDENTIAL_REQUIRED", readiness: ["card", "owner_binding", "purpose"] });
    let act: any; try { act = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { return this.refuse("Shokai-Act is not base64url JSON", { reason_code: "REQUEST_INCOMPLETE" }); }
    const p = act?.payload;
    if (!p || p.type !== "act" || typeof p.from !== "string" || typeof p.msg_id !== "string") return this.refuse("Shokai-Act is not a signed act", { reason_code: "REQUEST_INCOMPLETE" });
    const name = req.params?.name; const args = req.params?.arguments ?? {};
    if (p.tool !== name) return this.refuse("the signed act names another tool", { reason_code: "SEAT_SCOPE_EXCEEDED" });
    let same = false; try { same = digestOf(p.arguments ?? {}) === digestOf(args); } catch { same = false; }
    if (!same) return this.refuse("the call's arguments are not the ones the act signed", { reason_code: "SEAT_SCOPE_EXCEEDED" });
    const skew = (this.opts.skewSeconds ?? 300) * 1000;
    if (!isTimestamp(p.sent_at) || Math.abs(Date.parse(p.sent_at) - nowMs()) > skew) return this.refuse("the act is stale or from the future", { reason_code: "RITUAL_ORDER" });
    const key = p.from + "|" + p.msg_id; if (this.used.has(key)) return this.refuse("the act was already used (single use)", { reason_code: "RITUAL_ORDER" });
    for (const [k, t] of this.used) if (t < nowMs() - 2 * skew) this.used.delete(k);
    const seat = typeof p.seat_id === "string" ? this.door.seat(p.seat_id) : undefined;
    const r = this.door.authorizeAct(act);
    if (!r.ok) return this.refuse(actRefusalMessage(String(name), r.decision, seat, args && typeof args === "object" ? args : {}),
      { refused_by: "door", disposition: r.decision?.disposition ?? "not_now", ...(r.decision?.reason_code ? { reason_code: r.decision.reason_code } : {}), act_decision: r.decision });
    this.used.set(key, nowMs());
    return { allow: true, seatId: p.seat_id, tool: name, act: { from: p.from, msgId: p.msg_id } };
  }
}

export type McpHttpHandler = (req: IncomingMessage, res: ServerResponse, parsedBody: unknown) => unknown | Promise<unknown>;
/**
 * A node:http request listener: the door's addresses, then the gated MCP endpoint (default "/mcp"), then 404.
 * `mcp` handles allowed requests, e.g. statelessMcp(() => buildServer()) or your own StreamableHTTPServerTransport.
 */
export function shokaiGate(door: Door, mcp: McpHttpHandler, opts: GateOptions & { path?: string; adapter?: GateAdapter; advertise?: boolean } = {}) {
  const gate = opts.adapter ?? new ShokaiGate(door, opts); const mcpPath = opts.path ?? "/mcp";
  // §11.3 (C179): the listing names the MCP endpoint (links rel "mcp-server", on the entry's origin). Added unless the place
  // already lists one or `advertise: false`; kept in step with the door's base URL, which may be set after the server listens.
  let mine: { rel: string; href: string } | undefined;
  const advertise = () => {
    if (opts.advertise === false) return;
    let href: string; try { href = new URL(door.base).origin + mcpPath; } catch { return; }
    const cfg = (door as any).host?.cfg; if (!cfg) return; const links: { rel: string; href: string }[] = (cfg.links ??= []);
    if (mine) { mine.href = href; return; }
    if (!links.some((l) => l.rel === "mcp-server")) { mine = { rel: "mcp-server", href }; links.push(mine); }
  };
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      advertise();
      if (await door.handleHttp(req, res)) return;
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (path !== mcpPath) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify(door.pointer())); return; }
      if (req.method !== "POST") return void (await mcp(req, res, undefined));
      const text = await readBody(req); let body: any;
      try { body = JSON.parse(text); } catch { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })); return; }
      const msgs: JsonRpcRequest[] = Array.isArray(body) ? body : [body];
      const errors: unknown[] = []; let seatFilter: string | undefined; let listing = false; const acts = new Map<string, { from: string; msgId: string }>();
      for (const m of msgs) {
        const v = gate.check(m, req.headers);
        if (!v.allow) errors.push({ jsonrpc: "2.0", id: m.id ?? null, error: v.error });
        else if (v.act && m.method === "tools/call") acts.set(JSON.stringify(m.id ?? null), v.act);
        else if (m.method === "tools/list" && v.seatId) { seatFilter = v.seatId; listing = true; }
      }
      if (errors.length) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(Array.isArray(body) ? errors : errors[0])); return; }
      if (listing && seatFilter) filterToolsList(res, door.seat(seatFilter)?.tool_allowlist ?? []);
      const releaseOn = opts.releaseOn ?? "rpc-or-tool-error";
      if (releaseOn !== "never" && acts.size) watchCallOutcome(res, acts, releaseOn, (a) => door.host.releaseAct(a.from, a.msgId));
      try { await mcp(req, res, body); }
      catch (e) { if (releaseOn !== "never" && !res.headersSent) for (const a of acts.values()) door.host.releaseAct(a.from, a.msgId); throw e; }
    } catch (e) {
      if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "gate error" } })); }
    }
  };
}

/**
 * Watches the JSON response to admitted tools/call requests (by JSON-RPC id) and releases an act the server did not carry out
 * (§7.2, C194). Passes every byte through unchanged; SSE and other non-JSON responses are not inspected (nothing is released).
 */
function watchCallOutcome(res: ServerResponse, acts: Map<string, { from: string; msgId: string }>, mode: "rpc-error" | "rpc-or-tool-error", release: (a: { from: string; msgId: string }) => void) {
  const chunks: Buffer[] = []; const write = res.write.bind(res); const end = res.end.bind(res); const writeHead = res.writeHead.bind(res);
  let ctype = "";
  (res as any).writeHead = (code: number, ...a: any[]) => {
    for (const h of a) if (h && typeof h === "object") { const e = Array.isArray(h) ? (Array.isArray(h[0]) ? h : h.reduce((acc: any[], x: any, i: number) => (i % 2 ? acc : [...acc, [x, h[i + 1]]]), [])) : Object.entries(h);
      const ct = e.find(([k]: [string]) => String(k).toLowerCase() === "content-type"); if (ct) ctype = String(ct[1]); }
    return writeHead(code, ...(a as [any]));
  };
  const isJson = () => (ctype || String(res.getHeader("content-type") ?? "")).includes("application/json");
  (res as any).write = (c: any, ...r: any[]) => { if (c && typeof c !== "function") chunks.push(Buffer.from(c)); return write(c, ...r); };
  (res as any).end = (c?: any, ...r: any[]) => {
    if (c && typeof c !== "function") chunks.push(Buffer.from(c));
    const out = end(c, ...r);
    try {
      if (isJson()) {
        const text = Buffer.concat(chunks).toString("utf8"); const j = text ? JSON.parse(text) : null;
        const answers: any[] = j == null ? [] : Array.isArray(j) ? j : [j];
        for (const [id, a] of acts) {
          const ans = answers.find((x) => x && JSON.stringify(x.id ?? null) === id);
          const notDone = ans ? (!!ans.error || (mode === "rpc-or-tool-error" && ans.result?.isError === true)) : res.statusCode >= 400;
          if (notDone) release(a);
        }
      } else if (res.statusCode >= 400) for (const a of acts.values()) release(a);
    } catch { /* unreadable: keep the acts counted (fail safe) */ }
    return out;
  };
}

/** Rewrites a JSON tools/list result to the seat's tools (SSE responses pass unchanged; use enableJsonResponse). */
function filterToolsList(res: ServerResponse, allowed: string[]) {
  const chunks: Buffer[] = []; const write = res.write.bind(res); const end = res.end.bind(res); const writeHead = res.writeHead.bind(res);
  let status = 200; let headers: Record<string, any> = {}; let json = true; let held = false;
  const norm = (h: any): Record<string, any> => (Array.isArray(h) ? (Array.isArray(h[0]) ? Object.fromEntries(h) : Object.fromEntries(h.reduce((a: any[], x: any, i: number) => (i % 2 ? a : [...a, [x, h[i + 1]]]), []))) : (h ?? {}));
  (res as any).writeHead = (code: number, ...a: any[]) => {
    const h = norm(a.find((x) => x && typeof x === "object"));
    const ct = String(Object.entries(h).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? res.getHeader("content-type") ?? "");
    json = ct.includes("application/json"); if (!json) return writeHead(code, ...(a as [any]));
    status = code; headers = h; held = true; return res;
  };
  (res as any).write = (c: any, ...r: any[]) => { if (!json) return write(c, ...r); chunks.push(Buffer.from(c)); return true; };
  (res as any).end = (c?: any, ...r: any[]) => {
    if (!json) return end(c, ...r);
    if (c && typeof c !== "function") chunks.push(Buffer.from(c));
    let out = Buffer.concat(chunks).toString("utf8");
    try { const j = JSON.parse(out); const fix = (x: any) => { if (x?.result?.tools) x.result.tools = x.result.tools.filter((t: any) => allowed.includes(t.name)); return x; };
      out = JSON.stringify(Array.isArray(j) ? j.map(fix) : fix(j)); } catch { /* not JSON: pass */ }
    const h = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== "content-length"));
    if (!res.headersSent) { res.removeHeader("content-length"); if (held) writeHead(status, h); }
    return end(out);
  };
}

/**
 * Stateless Streamable HTTP with the official MCP TypeScript SDK (@modelcontextprotocol/sdk, an optional peer dependency):
 * a fresh server and transport per request, JSON responses.
 */
export function statelessMcp(build: () => { connect(t: unknown): Promise<void>; close?(): Promise<void> }): McpHttpHandler {
  return async (req, res, body) => {
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const server = build(); const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close?.(); });
    await server.connect(transport); await transport.handleRequest(req as any, res, body);
  };
}

/**
 * Client side: a fetch for the MCP SDK's StreamableHTTPClientTransport that signs a Shōkai act for every tools/call
 * (and names the seat on every request), from a visit that is already seated.
 */
export function shokaiFetch(visit: Visit, base: typeof fetch = fetch): typeof fetch {
  return (async (input: any, init: RequestInit = {}) => {
    const headers = new Headers(init.headers ?? {}); let tool: string | null = null; let args: Record<string, unknown> = {};
    if (visit.seat) headers.set(SEAT_HEADER, visit.seat.seat_id);
    if (typeof init.body === "string") { try { const j = JSON.parse(init.body); const call = (Array.isArray(j) ? j : [j]).find((m: any) => m?.method === "tools/call");
      if (call && visit.seat) { tool = call.params?.name; args = call.params?.arguments ?? {};
        // §5.1 (C176): the representative doesn't attempt an act beyond what remains of its mandate, across all its visits.
        // Before that, the seat's tools (when visit.checkSeatLocally, the default): the door would refuse a tool outside the seat anyway.
        const pre = visit.beforeSend(tool!, args);
        if (pre) { visit.recordAct(tool!, false, args, true);
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id ?? null, error: { code: SHOKAI_NOT_SEATED, message: `not sent: ${pre.why}`,
            data: { shokai: { refused_by: "representative", by: pre.by, why: pre.why, mandate_id: visit.mandateSent?.payload.mandate_id } } } }), { status: 200, headers: { "content-type": "application/json" } }); }
        headers.set(ACT_HEADER, Buffer.from(JSON.stringify(visit.signAct(tool!, args))).toString("base64url")); } } catch { /* not JSON */ } }
    const r = await base(input, { ...init, headers });
    if (tool) {
      let ok = r.ok; let result: unknown;
      try { const text = await r.clone().text(); const js = jsonOrSse(text); const j: any = js.find((x: any) => x && (x.result !== undefined || x.error !== undefined)) ?? js[0];
        ok = ok && !!j && !j.error && !j.result?.isError; result = j?.result; } catch { /* unreadable */ }
      visit.recordAct(tool, ok, args);
      // §8.2 (C178): keep signed objects the tool returned (a visit stamp, a receipt) for the report home.
      if (ok && result !== undefined) visit.keepFrom(tool, result);
    }
    return r;
  }) as typeof fetch;
}
/** A JSON response body, or the JSON messages of an SSE body's data lines. */
function jsonOrSse(text: string): unknown[] {
  try { return [JSON.parse(text)]; } catch { /* SSE */ }
  return text.split(/\r?\n/).filter((l) => l.startsWith("data:")).flatMap((l) => { try { return [JSON.parse(l.slice(5).trim())]; } catch { return []; } });
}
