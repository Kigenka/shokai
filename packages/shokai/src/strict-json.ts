// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// One reading of every body (SPEC §2.2, §11.3, C284): an I-JSON (RFC 7493) parser that rejects duplicate member names at any
// depth, lone surrogates and numbers that aren't exactly the double JCS would write, so the digest, the budget and the tool all
// read the same value. Also JCS (RFC 8785) re-serialisation and canonical Money amounts.

export type StrictJsonResult = { ok: true; value: unknown } | { ok: false; why: string };
export type Money = { value: string; currency: string };

const MAX_DEPTH = 512;
const ESC = new Map<string, string>([['"', '"'], ["\\", "\\"], ["/", "/"], ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"], ["t", "\t"]]);
class StrictJsonError extends Error {}
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** The exact decimal value of a JSON number token, as a comparable key ("<sign><digits>e<exp>", or "0"). */
function decimalKey(s: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  if (!m) return "NaN:" + s;
  const frac = m[3] ?? "";
  const digits = (m[2] + frac).replace(/^0+/, "");
  if (!digits) return "0";
  const t = digits.replace(/0+$/, "");
  const exp = Number(m[4] ?? 0) - frac.length + (digits.length - t.length);
  return m[1] + t + "e" + exp;
}

/** Parses `text` as I-JSON with exactly one reading, or says why it can't. Never throws for bad input. */
export function parseStrictJson(text: string): StrictJsonResult {
  if (typeof text !== "string") return { ok: false, why: "not a string" };
  let i = 0;
  const n = text.length;
  function bad(why: string): never { throw new StrictJsonError(`${why} (at ${i})`); }
  function ws() { for (;;) { const c = text.charCodeAt(i); if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++; else return; } }
  function lit(word: string, v: unknown): unknown { if (text.startsWith(word, i)) { i += word.length; return v; } return bad("invalid literal"); }
  function str(): string {
    i++; let out = ""; let run = i;
    for (;;) {
      if (i >= n) return bad("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) { out += text.slice(run, i); i++; break; }
      if (c < 0x20) return bad("control character in a string");
      if (c !== 0x5c) { i++; continue; }
      out += text.slice(run, i);
      const e = text[i + 1];
      if (e === "u") {
        const h = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) return bad("bad \\u escape");
        out += String.fromCharCode(parseInt(h, 16)); i += 6;
      } else {
        const r = e === undefined ? undefined : ESC.get(e);
        if (r === undefined) return bad("bad escape");
        out += r; i += 2;
      }
      run = i;
    }
    for (let j = 0; j < out.length; j++) {
      const c = out.charCodeAt(j);
      if (c >= 0xd800 && c <= 0xdbff) { const d = out.charCodeAt(j + 1); if (d >= 0xdc00 && d <= 0xdfff) { j++; continue; } return bad("lone surrogate in a string"); }
      if (c >= 0xdc00 && c <= 0xdfff) return bad("lone surrogate in a string");
    }
    return out;
  }
  function num(): number {
    const s = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") i++;
    else if (isDigit(text[i])) { while (isDigit(text[i])) i++; }
    else return bad("bad number");
    if (text[i] === ".") { i++; if (!isDigit(text[i])) return bad("bad number"); while (isDigit(text[i])) i++; }
    if (text[i] === "e" || text[i] === "E") { i++; if (text[i] === "+" || text[i] === "-") i++; if (!isDigit(text[i])) return bad("bad number"); while (isDigit(text[i])) i++; }
    const tok = text.slice(s, i); const v = Number(tok);
    if (!Number.isFinite(v) || decimalKey(tok) !== decimalKey(String(v))) { i = s; return bad(`number ${tok.slice(0, 40)} isn't exactly an IEEE-754 double`); }
    return v;
  }
  function val(depth: number): unknown {
    if (depth > MAX_DEPTH) return bad("nested too deeply");
    ws();
    const c = text[i];
    if (c === "{") {
      i++; const o: Record<string, unknown> = {}; const seen = new Set<string>(); ws();
      if (text[i] === "}") { i++; return o; }
      for (;;) {
        ws();
        if (text[i] !== '"') return bad("expected a member name");
        const at = i; const k = str();
        if (seen.has(k)) { i = at; return bad(`duplicate member name ${JSON.stringify(k.slice(0, 64))}`); }
        seen.add(k);
        ws(); if (text[i] !== ":") return bad("expected ':'"); i++;
        Object.defineProperty(o, k, { value: val(depth + 1), enumerable: true, writable: true, configurable: true });
        ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "}") { i++; return o; }
        return bad("expected ',' or '}'");
      }
    }
    if (c === "[") {
      i++; const a: unknown[] = []; ws();
      if (text[i] === "]") { i++; return a; }
      for (;;) {
        a.push(val(depth + 1)); ws();
        if (text[i] === ",") { i++; continue; }
        if (text[i] === "]") { i++; return a; }
        return bad("expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true", true);
    if (c === "f") return lit("false", false);
    if (c === "n") return lit("null", null);
    if (c === "-" || isDigit(c)) return num();
    return bad(i >= n ? "unexpected end" : "unexpected character");
  }
  try {
    const value = val(0); ws();
    if (i < n) bad("trailing content");
    return { ok: true, value };
  } catch (e) {
    if (e instanceof StrictJsonError) return { ok: false, why: e.message };
    return { ok: false, why: "unreadable" };
  }
}

/** JCS (RFC 8785) serialisation of a JSON value. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new TypeError("JCS: non-finite number"); return JSON.stringify(v); }
  if (Array.isArray(v)) return "[" + v.map((x) => canonicalJson(x === undefined ? null : x)).join(",") + "]";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
  }
  throw new TypeError("JCS: not a JSON value");
}

/**
 * The canonical form of a Money amount (§2.2, C284; RR-04: one grammar, §5.1 D10): value `0` or a digit 1–9 then digits,
 * optionally `.` and 1 to 6 digits; currency three uppercase letters. The canonical form (trailing fraction zeros dropped, padded
 * to two digits: "1000.0" → "1000.00") is for comparison and counting only. "01000", "1e3", a JSON number, a sign or grouping is refused.
 */
export function canonicalAmount(m: unknown): { ok: true; value: Money } | { ok: false; why: string } {
  if (!m || typeof m !== "object" || Array.isArray(m)) return { ok: false, why: "not Money: expected {value, currency}" };
  const { value, currency } = m as { value?: unknown; currency?: unknown };
  if (typeof value !== "string") return { ok: false, why: "value must be a decimal string" };
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) return { ok: false, why: "value must be a strict decimal (no leading zeros, at most 6 fraction digits; §5.1 D10)" };
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return { ok: false, why: "currency must be an ISO 4217 code" };
  const [intRaw, fracRaw = ""] = value.split(".");
  const int = intRaw;
  let frac = fracRaw.replace(/0+$/, "");
  while (frac.length < 2) frac += "0";
  return { ok: true, value: { value: int + "." + frac, currency } };
}
