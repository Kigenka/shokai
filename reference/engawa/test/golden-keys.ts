// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Test keys for the hand-written golden traces (G1–G5, M1, L1, H1–H2; fixtures F1–F12), v0.3.0-rc4.
// Each fictional party's key is the Appendix A.2 label key for "golden-trace:" + the party's old placeholder name, so anyone can
// re-derive it. These are PUBLIC TEST KEYS: never use them for anything real.
import { ed25519FromLabel, makeSigned, type Ed25519Signer } from "../src/crypto.js";
import type * as S from "../src/shapes.js";

export const GOLDEN_LABEL_PREFIX = "golden-trace:";
const cache = new Map<string, Ed25519Signer>();
/** The test key for a party, by its old placeholder name (e.g. "shokai:principal:examplebank"). */
export function goldenKey(name: string): Ed25519Signer {
  let k = cache.get(name); if (!k) { k = ed25519FromLabel(GOLDEN_LABEL_PREFIX + name); cache.set(name, k); } return k;
}
/** The party's DID (did:key) for its old placeholder name. */
export const GID = (name: string): string => goldenKey(name).id;
/** The parties the regenerated traces name, by old placeholder name. */
export const GOLDEN_PARTIES = [
  "shokai:principal:examplebank", "shokai:rep:examplebank/gate-1",
  "shokai:principal:acme-payroll", "shokai:rep:acme-payroll/ops-7",
  "shokai:principal:example-accounting",
  "shokai:principal:lumen-language", "shokai:rep:lumen-language/liaison-2",
  "shokai:rep:unknown/x1", "shokai:rep:unknown/x2",
  "shokai:principal:hoshikawa-ryokan", "shokai:rep:hoshikawa-ryokan/frontdesk",
  "shokai:principal:northgate-travel", "shokai:rep:northgate-travel/partner-desk",
  "shokai:principal:studio-host", "shokai:rep:studio-host/assistant", "shokai:rep:studio-host/reelhouse-coach",
] as const;
/** ExampleBank's Seeking declaration as G4a (v1, paused) and G4b (v2, open) see it; signed by ExampleBank's test key. */
export function goldenSeeking(status: "open" | "paused", version: string): S.SignedSeekingDeclaration {
  const p = { seeking_id: "seek-examplebank", version, host: { principal_id: GID("shokai:principal:examplebank"), display_name: "ExampleBank" },
    items: [{ item_id: "support-ja", area: "support", summary: { text: "Japanese-language support partners", locale: "en-US" }, status }],
    published_at: "2026-10-01T00:00:00Z", expires_at: "2027-12-31T00:00:00Z" };
  return makeSigned(p, goldenKey("shokai:principal:examplebank"), "2026-10-20T09:00:00Z") as unknown as S.SignedSeekingDeclaration;
}
