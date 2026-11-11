// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// v0.4.0: one line in front of your endpoint. Every adapter calls door.respond(), so Express, Hono, Next and plain node:http doors
// answer alike (§11.1). Hono, Bun, Deno and Workers take door.fetch directly. No framework is a dependency of this package.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Door } from "./index.js";

type Req = IncomingMessage & { originalUrl?: string; body?: unknown; rawBody?: unknown; destroy?: (err?: Error) => void };
/** Thrown (and passed to `next(err)`) when a body parser consumed the request and the original bytes were not kept. */
export class ShokaiRawBodyError extends Error {
  readonly code = "SHOKAI_RAW_BODY_UNAVAILABLE";
  constructor() {
    super("Shōkai needs the original request bytes (§11.1, C284: duplicate members and numeric forms must be checked before any digest or signature). " +
      "Mount app.use(shokaiDoor(door)) BEFORE express.json(), or keep the raw bytes: app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })).");
    this.name = "ShokaiRawBodyError";
  }
}
import { MAX_ADAPTER_BODY, ShokaiPayloadTooLargeError, readBoundedIterable, readBoundedBytes } from "./bounded-read.js";
export { MAX_ADAPTER_BODY, ShokaiPayloadTooLargeError };
/**
 * Express (4 or 5) or Connect middleware: `app.use(shokaiDoor(door))`, before your own routes and before any JSON body parser.
 * Answers the door's paths and GET /.well-known/shokai; passes everything else on. Mount it at the app root (the door knows its own
 * base path). The door validates the ORIGINAL request bytes (C284). If a parser such as express.json() ran first, it must keep them
 * in `req.rawBody` (express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })); a parsed-only body is refused with
 * {@link ShokaiRawBodyError} rather than re-serialised, because re-serialising hides duplicate members and numeric forms.
 */
export function shokaiDoor(door: Door, o: { wellKnown?: boolean } = {}) {
  return async (req: Req, res: ServerResponse, next: (e?: unknown) => void) => {
    try {
      const path = new URL(req.originalUrl ?? req.url ?? "/", "http://x").pathname;
      // §11.1 (C278): the client address for the anonymous rate limit.
      const clientAddress = door.clientAddressOf((h) => { const v = req.headers[h]; return Array.isArray(v) ? v[0] : v; }, req.socket?.remoteAddress);
      const r = await door.respond(req.method ?? "GET", path, async () => bodyText(req), { wellKnown: o.wellKnown ?? true, clientAddress });
      if (!r) return next();
      res.writeHead(r.status, r.headers); res.end(req.method === "HEAD" ? undefined : r.body);
      if (r.status === 413) { try { req.resume(); } catch { /* */ } }   // drop the rest of an oversized body after the answer
    } catch (e) {
      if (e instanceof ShokaiPayloadTooLargeError) {
        if (!res.headersSent) { res.writeHead(413, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ error: "payload_too_large", code: e.code })); }
        // Drain / drop the rest of the request after the 413 is on the wire (destroying first aborted the client).
        try { req.resume(); } catch { /* */ }
        try { req.destroy?.(); } catch { /* */ }
        return;
      }
      next(e);
    }
  };
}
async function bodyText(req: Req): Promise<string> {
  const raw = req.rawBody;
  if (typeof raw === "string") return raw;
  if (raw instanceof Uint8Array) return readBoundedBytes(raw);   // fatal UTF-8 (C284), bounded
  const b = req.body;
  if (typeof b === "string") return b;                                       // express.text()
  if (b instanceof Uint8Array) return readBoundedBytes(b);                   // express.raw()
  const parsed = (req as any)._body === true || (req as any).readableEnded === true;   // body-parser sets _body once it has read the stream
  if (b !== undefined && b !== null && typeof b === "object" && (parsed || Object.keys(b as object).length)) throw new ShokaiRawBodyError(); // never re-serialise (C284)
  if ((req as any).readableEnded) return "";
  return readBoundedIterable(req as AsyncIterable<unknown>);   // bounded, fatal UTF-8; respond() answers 413 / 400
}
/**
 * Next.js (App Router) route handlers: in `app/shokai/[[...path]]/route.ts` write
 * `export const { GET, POST } = nextDoor(door);` (and serve /.well-known/shokai from `public/`, which `shokai init` writes).
 */
export function nextDoor(door: Door) {
  const h = (req: Request) => door.fetch(req);
  return { GET: h, POST: h, HEAD: h };
}
