// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// One bounded byte-reader contract for every inbound HTTP body (§3.4 C239, §11.1, C284; pre-release review, round 2): count the
// bytes as they arrive, stop (and cancel the stream) past the limit, never hand on a truncated prefix, and decode UTF-8 fatally so
// invalid bytes are refused, never turned into U+FFFD. A byte-order mark is kept (strict JSON then refuses it).

/** Maximum request body a Shōkai binding reads (256 KiB). Larger bodies get HTTP 413 and are not processed. */
export const MAX_ADAPTER_BODY = 256 * 1024;

/** Thrown when a request body exceeds the binding's limit; bindings answer HTTP 413 and stop reading. */
export class ShokaiPayloadTooLargeError extends Error {
  readonly code = "SHOKAI_PAYLOAD_TOO_LARGE";
  constructor(limit = MAX_ADAPTER_BODY) {
    super(`Shōkai refuses a request body larger than ${limit} bytes (§11.1).`);
    this.name = "ShokaiPayloadTooLargeError";
  }
}
/** Thrown when a request body is not valid UTF-8 (C284); bindings answer HTTP 400 and process nothing. */
export class ShokaiInvalidUtf8Error extends Error {
  readonly code = "SHOKAI_INVALID_UTF8";
  constructor() { super("Shōkai refuses a request body that is not valid UTF-8 (C284)."); this.name = "ShokaiInvalidUtf8Error"; }
}

/** Decode bytes as UTF-8, fatally (C284). */
export function strictUtf8(b: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(b); } catch { throw new ShokaiInvalidUtf8Error(); }
}

const toBytes = (c: unknown): Uint8Array => typeof c === "string" ? Buffer.from(c, "utf8") : c instanceof Uint8Array ? c : Buffer.from(c as ArrayBuffer);

/** Read a Node stream / async iterable of chunks, at most `limit` bytes, then decode it strictly. */
export async function readBoundedIterable(it: AsyncIterable<unknown>, limit = MAX_ADAPTER_BODY): Promise<string> {
  const chunks: Uint8Array[] = []; let n = 0;
  for await (const c of it) { const b = toBytes(c); n += b.length; if (n > limit) throw new ShokaiPayloadTooLargeError(limit); chunks.push(b); }
  return strictUtf8(Buffer.concat(chunks));
}

/** Read a Web ReadableStream body, at most `limit` bytes (the stream is cancelled past it), then decode it strictly. */
export async function readBoundedStream(body: ReadableStream<Uint8Array> | null | undefined, limit = MAX_ADAPTER_BODY): Promise<string> {
  if (!body) return "";
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      n += value.length;
      if (n > limit) { try { await reader.cancel(); } catch { /* already closed */ } throw new ShokaiPayloadTooLargeError(limit); }
      chunks.push(value);
    }
  } finally { try { reader.releaseLock(); } catch { /* */ } }
  return strictUtf8(Buffer.concat(chunks));
}

/** A body already in memory (express.raw(), rawBody): the same limit and decoding. */
export function readBoundedBytes(b: Uint8Array, limit = MAX_ADAPTER_BODY): string {
  if (b.length > limit) throw new ShokaiPayloadTooLargeError(limit);
  return strictUtf8(b);
}
