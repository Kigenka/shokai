// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Stable door keys for a place that must keep its identity across restarts: two Ed25519 keys (the door's representative and the
// place's principal) kept as PKCS#8 PEM files, mode 0600, in a directory you choose. Created on first start, loaded after that.
// Keep KEY_DIR off shared volumes and out of backups you don't control; never commit it. Losing it means a new identity.
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58btc(buf) {
  let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; out = "1" + out; }
  return out;
}
/** An Ed25519 signer in the SDK's shape, from a PKCS#8 PEM private key; its id is the key's did:key. */
export function signerFromPem(pem) {
  const priv = createPrivateKey(pem);
  const pubRaw = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(12);
  const id = "did:key:z" + base58btc(Buffer.concat([Buffer.from([0xed, 0x01]), pubRaw]));
  return { kind: "ed25519", id, key_id: id + "#" + id.slice(8), priv, pubRaw };
}
/** Loads rep.pem and principal.pem from dir, creating them (0600) the first time. */
export function loadOrCreateKeys(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const one = (name) => {
    const f = join(dir, name + ".pem");
    if (!existsSync(f)) { writeFileSync(f, generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 }); chmodSync(f, 0o600); }
    return signerFromPem(readFileSync(f, "utf8"));
  };
  return { rep: one("rep"), principal: one("principal") };
}
