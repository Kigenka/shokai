// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * v0.5.0 (§6.10, C250; §9.5, C253): System 1 classifiers in front of the host representative's model. Vendor-neutral and pure:
 * no model, no network, no clock. A classifier is anything that returns one of a fixed set of typed labels with a confidence (a
 * calibrated small model, a code detector, a rules table). These helpers turn its answer into what the place may do:
 *
 * - The answer must be one of the classifier's fixed labels with a confidence in [0, 1]; anything else is a failure.
 * - Below the place's stated threshold, System 1 escalates to System 2 (the model, within guard 9's budget).
 * - System 1 alone never decides a finding or a penalty (§9.3): its only outcomes are proceed, pause, narrow and escalate.
 * - A failure or a timeout fails closed: pause or narrow, never proceed and never widen.
 * - Visitor content goes to a third-party classifier only when the house rules say so (§2.3); otherwise it isn't called at all.
 */
import type * as S from "./shapes.js";

/** What System 1 may do. There is deliberately no "finding", "penalty" or "widen". */
export type System1Action = "proceed" | "pause" | "narrow" | "escalate";
export const SYSTEM1_ACTIONS: readonly System1Action[] = ["proceed", "pause", "narrow", "escalate"];
/** Outcomes System 1 never decides alone (§6.10, §9.3), and never "widen" (guard 14: code only narrows). */
export const SYSTEM1_NEVER = ["finding", "penalty", "widen"] as const;
export type FailClosed = "pause" | "narrow";

/** A System 1 classifier, described vendor-neutrally. `runs` says where the visitor's content goes. */
export interface System1Classifier<L extends string = string> {
  /** A name for audit records (never sent to a visitor). */
  readonly name: string;
  /** The fixed set of typed answers it may return. */
  readonly labels: readonly L[];
  /** "in_house": the host's own code or model. "third_party": the visitor's content leaves the place (§6.10: only when `name` is in policy.third_party_classifiers). */
  readonly runs: "in_house" | "third_party";
  /** Its raw answer: a label and a confidence. May throw or never settle; the runner fails closed. */
  classify(input: System1Input): { label: string; confidence: number } | Promise<{ label: string; confidence: number }>;
}
/** What a classifier reads: the visitor's words as quoted data (guard 2), and what kind of content it is. */
export type System1Input = { text: string; kind?: "visitor_text" | "proposal" | "courtesy" | `x-${string}` };

/**
 * The place's stated System 1 policy. `threshold` is the calibrated confidence below which System 2 decides. `benign` labels
 * proceed; every other label maps to pause, narrow or escalate (default escalate). `failClosed` is what a failure does.
 */
export type System1Policy<L extends string = string> = {
  threshold: number;
  benign: readonly L[];
  onLabel?: Partial<Record<L, Exclude<System1Action, "proceed">>>;
  failClosed: FailClosed;
};

/** Why a policy can't be used (null when it can). A threshold is a calibrated probability in (0, 1]. */
export function system1PolicyProblem<L extends string>(p: System1Policy<L>, labels: readonly L[]): string | null {
  if (!p || typeof p !== "object") return "no policy";
  if (typeof p.threshold !== "number" || !Number.isFinite(p.threshold) || p.threshold <= 0 || p.threshold > 1) return "threshold must be in (0, 1]";
  if (p.failClosed !== "pause" && p.failClosed !== "narrow") return "failClosed must be pause or narrow";
  if (!Array.isArray(p.benign) || p.benign.some((l) => !labels.includes(l))) return "benign names a label outside the fixed set";
  for (const [l, a] of Object.entries(p.onLabel ?? {})) {
    if (!labels.includes(l as L)) return `onLabel names ${l}, outside the fixed set`;
    if (a !== "pause" && a !== "narrow" && a !== "escalate") return `onLabel.${l} must be pause, narrow or escalate`;
  }
  return null;
}

/**
 * A raw answer checked against the classifier's fixed set and turned into a ClassifierAnswer (escalate = confidence below the
 * threshold). Null when the answer is not one of the typed answers or its confidence is not in [0, 1]: that is a failure.
 */
export function classifierAnswerOf<L extends string>(raw: unknown, labels: readonly L[], threshold: number): S.ClassifierAnswer<L> | null {
  if (!raw || typeof raw !== "object") return null;
  const { label, confidence } = raw as { label?: unknown; confidence?: unknown };
  if (typeof label !== "string" || !labels.includes(label as L)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  return { label: label as L, confidence, escalate: confidence < threshold };
}

export type System1Failure = "timeout" | "error" | "invalid_answer" | "third_party_not_allowed" | "bad_policy";
/** The decision for one classified input: one of System 1's actions, never a finding or a penalty. */
export type System1Decision<L extends string = string> =
  | { action: System1Action; answer: S.ClassifierAnswer<L>; failed?: undefined }
  | { action: FailClosed; answer?: undefined; failed: System1Failure };

/** What the place does with an answer (or a failure). Pure; the same inputs always give the same decision. */
export function system1Decision<L extends string>(answer: S.ClassifierAnswer<L> | System1Failure, p: System1Policy<L>, labels: readonly L[]): System1Decision<L> {
  if (system1PolicyProblem(p, labels)) return { action: p && p.failClosed === "narrow" ? "narrow" : "pause", failed: "bad_policy" };
  if (typeof answer === "string") return { action: p.failClosed, failed: answer };
  const checked = classifierAnswerOf(answer, labels, p.threshold);
  if (!checked) return { action: p.failClosed, failed: "invalid_answer" };
  if (checked.escalate) return { action: "escalate", answer: checked };   // below the stated threshold: System 2 decides
  if (p.benign.includes(checked.label)) return { action: "proceed", answer: checked };
  const a = p.onLabel?.[checked.label] ?? "escalate";
  return { action: a === "pause" || a === "narrow" ? a : "escalate", answer: checked };
}

/**
 * Whether visitor content may go to this classifier (§6.10): an in-house one always; a third-party one only when its `name` names an entry of
 * the house rules' `policy.third_party_classifiers` (absent or empty = none), and never for a visitor answered under shokai/0.3,
 * who couldn't be shown the list.
 */
export const system1MayCall = (c: Pick<System1Classifier, "runs" | "name">, thirdPartyClassifiers: readonly Pick<S.ThirdPartyClassifier, "name">[] | null | undefined, visitorTag?: string) =>
  c.runs === "in_house" || (visitorTag !== "shokai/0.3" && Array.isArray(thirdPartyClassifiers) && c.name !== "*" && thirdPartyClassifiers.some((e) => e?.name === c.name));

/** True when an action is one System 1 may take alone (never a finding, a penalty or a widening). */
export const system1MayDecide = (a: unknown): a is System1Action => typeof a === "string" && (SYSTEM1_ACTIONS as readonly string[]).includes(a);
