// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * v0.5.0 (§6.10, C250): run a System 1 classifier for a door, vendor-neutrally. The decision rules are the pure core
 * (core/system1.ts); this adds the only impure parts: the call itself, its timeout, and the third-party gate.
 *
 * - A third-party classifier is never called unless its `name` names an entry of the house rules' `policy.third_party_classifiers`
 *   (pass it as `thirdPartyClassifiers`; absent or empty = none), and never for a visitor answered under shokai/0.3; the
 *   decision is then the place's fail-closed action and nothing leaves the place.
 * - A classifier that throws, answers outside its fixed set, or doesn't answer within `timeoutMs` fails closed (pause or narrow).
 * - The result is one of proceed, pause, narrow or escalate: never a finding or a penalty (§9.3). Escalate hands the input to
 *   System 2 (the host representative's model, within its per-visit budget).
 */
import { system1Decision, system1MayCall, system1PolicyProblem, type System1Classifier, type System1Decision, type System1Input, type System1Policy } from "./core/system1.js";
export * from "./core/system1.js";

export type RunSystem1Options = {
  /** The house rules' `policy.third_party_classifiers` (§2.3, §6.10): the named outside classifiers (ThirdPartyClassifier entries) visitor content may go to. Default none. */
  thirdPartyClassifiers?: readonly { name: string }[];
  /** The wire tag the visitor is answered under; under "shokai/0.3" no third-party classifier is called (§11.1). */
  visitorTag?: string;
  /** How long to wait for an answer before failing closed (default 1500 ms). */
  timeoutMs?: number;
};
/** Classify one input and decide; never throws. `called` says whether the classifier was asked at all. */
/** @internal Exported from the root entry for the reference and tests; not part of the supported API (may change before 1.0, moves under ./core in 0.6). */
export async function runSystem1<L extends string>(c: System1Classifier<L>, input: System1Input, policy: System1Policy<L>, o: RunSystem1Options = {}):
  Promise<System1Decision<L> & { called: boolean }> {
  if (system1PolicyProblem(policy, c.labels)) return { ...system1Decision<L>("error", policy, c.labels), called: false };
  if (!system1MayCall(c, o.thirdPartyClassifiers, o.visitorTag)) return { action: policy.failClosed, failed: "third_party_not_allowed", called: false };
  const ms = Math.max(1, o.timeoutMs ?? 1500); let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), ms); });
  try {
    const raw = await Promise.race([Promise.resolve().then(() => c.classify({ text: String(input.text), ...(input.kind ? { kind: input.kind } : {}) })), timeout]);
    if (raw === "timeout") return { action: policy.failClosed, failed: "timeout", called: true };
    const d = system1Decision<L>({ ...(raw as { label: L; confidence: number }), escalate: false }, policy, c.labels);
    return { ...d, called: true };
  } catch { return { action: policy.failClosed, failed: "error", called: true }; }
  finally { if (timer) clearTimeout(timer); }
}
