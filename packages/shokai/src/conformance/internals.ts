// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// What the runner borrows from the SDK (kept in one place so the runner reads like a black-box client).
export { createRepresentative, verifySigned, digestOf, Visit, httpTransport, PROTOCOL, SPEC_VERSION, type Representative } from "../index.js";
import { makeSigned } from "../core/crypto.js";
import type { Representative } from "../index.js";
export const makeSignedRaw = (m: any, rep: Representative) => makeSigned(m, rep.key, m.sent_at ?? new Date().toISOString().replace(/\.\d+Z$/, "Z")) as any;
import { sign } from "../index.js";
/** Sign any payload as the representative's owner or key (for crafted test artifacts). */
export const signRaw = (payload: any, signer: any) => sign(payload, signer) as any;
