// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
import { readFileSync } from "node:fs";
// SDK tests, SHK-01 (C284): every body is read as I-JSON with exactly one reading (SPEC §2.2, §11.3): duplicate names at any
// depth, lone surrogates and inexact numbers are rejected before any digest; amounts are canonicalised before they count;
// the MCP gate refuses an ambiguous Shokai-Act. Fictional people.
import { createDoor, digestOf, type DoorOptions } from "../src/index.js";
import { ShokaiGate } from "../src/mcp.js";
import { parseStrictJson, canonicalAmount, canonicalJson } from "../src/strict-json.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "taste-blend", displayName: "The Taste Blend table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste blend." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }], testProfile: true, ...o });

/** A tiny first-wins reader: keeps the first of duplicate member names (as some parsers do). */
function firstWins(t: string): any {
  let i = 0;
  const ws = () => { while (i < t.length && " \t\n\r".includes(t[i])) i++; };
  const val = (): any => {
    ws(); const c = t[i];
    if (c === "{") { i++; const o: any = {}; ws(); if (t[i] === "}") { i++; return o; }
      for (;;) { ws(); const k = val() as string; ws(); i++; const v = val(); if (!Object.prototype.hasOwnProperty.call(o, k)) o[k] = v; ws(); if (t[i++] === "}") return o; } }
    if (c === "[") { i++; const a: any[] = []; ws(); if (t[i] === "]") { i++; return a; } for (;;) { a.push(val()); ws(); if (t[i++] === "]") return a; } }
    if (c === '"') { let j = i + 1; while (t[j] !== '"') j += t[j] === "\\" ? 2 : 1; const s = JSON.parse(t.slice(i, j + 1)); i = j + 1; return s; }
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i));
    if (!m) throw new Error("bad json"); i += m[0].length; return JSON.parse(m[0]);
  };
  return val();
}
const rejects = (t: string, word?: string) => { const r = parseStrictJson(t); return !r.ok && (word === undefined || r.why.includes(word)); };

async function main() {
  console.log("SDK canonical JSON, one reading (C284)");

  // Two readers disagree on duplicates; the strict parser refuses the body.
  const dup = '{"amount":{"value":"1000.00","currency":"USD"},"amount":{"value":"1.00","currency":"USD"}}';
  const last = JSON.parse(dup), first = firstWins(dup);
  check(last.amount.value === "1.00", "a last-wins reader (JSON.parse) reads 1.00");
  check(first.amount.value === "1000.00", "a first-wins reader reads 1000.00");
  check(digestOf(last) !== digestOf(first), "the two readings have different digests");
  check(rejects(dup, "duplicate"), "parseStrictJson rejects the duplicate amount");

  check(rejects('{"params":{"arguments":{"a":1,"b":{"x":1,"x":2}}}}', "duplicate"), "a nested duplicate is rejected");
  // Review 6 R6-05: the shared ijson_c284 vectors (SPEC §2.2), the same ones the SDK-free example door runs.
  for (const c of JSON.parse(readFileSync(new URL("../../../../conformance/test-vectors.json", import.meta.url), "utf8")).ijson_c284.cases as { name: string; text: string; expect: string }[])
    check(parseStrictJson(c.text).ok === (c.expect === "accept"), `C284 ijson_c284 ${c.name}: ${c.expect}`);
  check(rejects('[{"ok":true},{"y":1,"y":1}]', "duplicate"), "a duplicate inside an array element is rejected");
  check(rejects('{"a":1,"\\u0061":2}', "duplicate"), "names equal after unescaping are duplicates");

  check(rejects('{"note":"\\ud800"}', "surrogate"), "an escaped lone high surrogate is rejected");
  check(rejects('{"note":"\\udc00x"}', "surrogate"), "an escaped lone low surrogate is rejected");
  check(rejects('{"\\ud83d":1}', "surrogate"), "a lone surrogate in a member name is rejected");
  check(parseStrictJson('{"note":"\\ud83d\\ude00"}').ok, "an escaped surrogate pair is accepted");

  check(rejects('{"n":1e400}', "double"), "a number that overflows a double is rejected");
  check(rejects('{"n":9007199254740993}', "double"), "an integer past 2^53 that a double can't hold is rejected");
  check(rejects('{"n":1e-400}', "double"), "a number that underflows to 0 is rejected");
  check(parseStrictJson('{"n":9007199254740992}').ok && parseStrictJson('{"n":0.1}').ok && parseStrictJson('{"n":1.50e2}').ok, "exact doubles are accepted");

  check(rejects('{"a":1} x', "trailing") && rejects("\uFEFF{}") && rejects('{"a":"\n"}') && rejects("{'a':1}") && rejects('{"a":01}'), "trailing content, BOM, raw control chars and non-JSON are rejected");
  const proto = parseStrictJson('{"__proto__":{"polluted":true}}');
  check(proto.ok && Object.getPrototypeOf(proto.value) === Object.prototype && Object.prototype.hasOwnProperty.call(proto.value, "__proto__") && ({} as any).polluted === undefined, "__proto__ is an ordinary own member");

  const valid = '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"shop.buy","arguments":{"amount":{"value":"6.00","currency":"USD"},"note":"Mio\'s tea ☕","n":[1,2.5,-0,true,null]}}}';
  const ok = parseStrictJson(valid);
  check(ok.ok && canonicalJson(ok.value) === canonicalJson(JSON.parse(valid)), "a valid tools/call body is accepted and reads as JSON.parse reads it");
  check(canonicalJson({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } }) === '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}', "JCS sorts members and drops whitespace");

  // Amounts (RR-04, one grammar): "1000", "1000.0" and "1000.00" count the same; leading zeros, >6 fraction digits, exponent, number, sign, grouping are refused.
  check(["01000", "080.00", "1.0000001", "00.5"].every((v) => !canonicalAmount({ value: v, currency: "USD" }).ok), "leading zeros and more than 6 fraction digits are refused (the §5.1 D10 grammar)");
  const forms = ["1000", "1000.0", "1000.00", "1000.000"].map((v) => canonicalAmount({ value: v, currency: "USD" }));
  check(forms.every((f) => f.ok && f.value.value === "1000.00" && f.value.currency === "USD"), "1000 / 1000.0 / 1000.00 canonicalise to 1000.00");
  const half = canonicalAmount({ value: "1000.5", currency: "EUR" }), fine = canonicalAmount({ value: "0.125", currency: "EUR" });
  check(half.ok && half.value.value === "1000.50" && fine.ok && fine.value.value === "0.125", "fractions keep their digits, padded to two");
  check(!canonicalAmount({ value: "1e3", currency: "USD" }).ok, '"1e3" is refused, not read as 1000');
  check(!canonicalAmount({ value: 1000, currency: "USD" }).ok, "a JSON number value is refused");
  check(!canonicalAmount({ value: "-5.00", currency: "USD" }).ok && !canonicalAmount({ value: "1,000.00", currency: "USD" }).ok && !canonicalAmount({ value: " 1.00", currency: "USD" }).ok, "sign, grouping and spaces are refused");
  check(!canonicalAmount({ value: "1.00", currency: "usd" }).ok && !canonicalAmount("1.00").ok && !canonicalAmount({ value: "1.", currency: "USD" }).ok, "bad currency, non-object and a bare '.' are refused");

  // Door.post: a duplicate-name body is treated like an unparsable body (the lobby), as plain prose is.
  const door = createDoor(opts());
  const types = (env: any) => JSON.stringify((env.messages ?? []).map((m: any) => m?.payload?.type ?? m?.type));
  const prose = await door.post("hello, what's on the table?", "lobby");
  const dupPost = await door.post('{"payload":{"type":"greeting"},"payload":{"type":"farewell"},"signatures":[]}');
  check(prose.status === 200 && dupPost.status === 200 && types(dupPost.envelope) === types(prose.envelope) && (prose.envelope as any).messages.length > 0, "a duplicate-name body at the entry gets the lobby, like prose");

  // The gate: an ambiguous Shokai-Act is refused REQUEST_INCOMPLETE before any act check.
  const gate = new ShokaiGate(door);
  const req = { jsonrpc: "2.0" as const, id: 1, method: "tools/call", params: { name: "concierge.talk", arguments: {} } };
  const actText = '{"payload":{"type":"act","from":"did:example:mio","msg_id":"m1","tool":"concierge.talk"},"payload":{"type":"act","from":"did:example:ren","msg_id":"m2","tool":"concierge.talk"},"signatures":[]}';
  const v: any = gate.check(req, { "shokai-act": Buffer.from(actText).toString("base64url") });
  check(!v.allow && v.error.data.shokai.reason_code === "REQUEST_INCOMPLETE" && v.error.data.shokai.refused_by === "gate", "a Shokai-Act with duplicate names is refused by the gate, REQUEST_INCOMPLETE");
  const badUtf8: any = gate.check(req, { "shokai-act": Buffer.from([0x7b, 0xff, 0x7d]).toString("base64url") });
  check(!badUtf8.allow && badUtf8.error.data.shokai.reason_code === "REQUEST_INCOMPLETE", "a Shokai-Act that isn't UTF-8 is refused REQUEST_INCOMPLETE");

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
