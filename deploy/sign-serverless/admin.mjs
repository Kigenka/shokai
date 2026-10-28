// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The steward's side of the serverless signing page. The admin secret is read from a 0600 file (SIGN_ADMIN_SECRET_FILE), never
// from the command line, and is never printed; the session token goes only into the link file (0600), never to the terminal.
//   node admin.mjs credential <owner-credential.json>           load the PUBLIC owner credential (once; --replace to overwrite)
//   node admin.mjs create <items.json> --link <file> [--ttl 30] open a session; writes the full link to <file>, prints id and expiry
//   node admin.mjs results <session_id> --out <dir>              save each decided item (signed/<name>.json) and decisions.json
//   node admin.mjs close <session_id>                            make the link inert at once
// SIGN_BASE: https://sign.kigenka.com by default (loopback http allowed for tests).
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
const BASE = process.env.SIGN_BASE ?? "https://sign.kigenka.com";
if (!/^https:\/\//.test(BASE) && !/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) { console.error("SIGN_BASE must be https (or loopback for tests)"); process.exit(2); }
const SF = process.env.SIGN_ADMIN_SECRET_FILE; if (!SF) { console.error("set SIGN_ADMIN_SECRET_FILE to a 0600 file holding the admin secret"); process.exit(2); }
if ((statSync(SF).mode & 0o077) !== 0) { console.error("the admin secret file must not be readable by others (chmod 600)"); process.exit(2); }
const SECRET = readFileSync(SF, "utf8").trim();
const [op, arg, ...rest] = process.argv.slice(2); const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const call = async (body) => { const r = await fetch(BASE + "/api/admin", { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` })); if (!r.ok) { console.error(`refused (HTTP ${r.status}): ${j.error ?? ""}${j.problems ? "\n  " + j.problems.join("\n  ") : ""}`); process.exit(1); } return j; };
if (op === "credential") { const j = await call({ op, credential: JSON.parse(readFileSync(arg, "utf8")), replace: rest.includes("--replace") }); console.log("owner credential stored for", j.owner_did.slice(0, 24) + "…"); }
else if (op === "create") {
  const link = flag("--link"); if (!link) { console.error("--link <file> is required (the link is written there, 0600)"); process.exit(2); }
  const j = await call({ op, items: JSON.parse(readFileSync(arg, "utf8")), ttl_min: Number(flag("--ttl") ?? 30) });
  writeFileSync(link, j.url + "\n", { mode: 0o600 });
  console.log(`session ${j.session_id}\nexpires ${j.expires_at}\nowner credential: ${j.owner_credential}\nlink written to ${link} (0600)`);
}
else if (op === "results") {
  const out = flag("--out"); if (!out) { console.error("--out <dir> is required"); process.exit(2); }
  const j = await call({ op, session_id: arg }); mkdirSync(join(out, "signed"), { recursive: true, mode: 0o700 });
  for (const it of j.items) if (it.signed) writeFileSync(join(out, "signed", it.name + ".json"), JSON.stringify(it.signed, null, 2) + "\n", { mode: 0o600 });
  writeFileSync(join(out, "decisions.json"), JSON.stringify({ session_id: j.session_id, owner_did: j.owner_did, rp_id: j.rp_id, open: j.open, items: j.items.map(({ signed, ...x }) => x) }, null, 2) + "\n", { mode: 0o600 });
  // Check every signed item with the reference crypto (SPEC Appendix A.1) against the owner DID and this rp_id before anyone uses it.
  const C = await import(new URL("../../reference/engawa/dist/src/crypto.js", import.meta.url)).catch(() => null);
  for (const it of j.items) { const s = it.signed?.signed; let v = "";
    if (s && C) { const ok = C.digestOf(s.payload) === s.payload_digest && s.payload_digest === it.digest && s.signatures.every((g) => g.signer === j.owner_did && C.checkSig(g, s.payload_digest, C.resolveDid(j.owner_did), j.rp_id).ok); v = ok ? "\tverifies (A.1)" : "\tDOES NOT VERIFY"; if (!ok) process.exitCode = 1; }
    console.log(`${it.decision?.decision ?? "waiting"}\t${it.name}\t${it.digest.slice(8, 20)}${v}`); }
}
else if (op === "close") { await call({ op, session_id: arg }); console.log("closed; the link is inert"); }
else { console.error("usage: admin.mjs credential|create|results|close …"); process.exit(2); }
