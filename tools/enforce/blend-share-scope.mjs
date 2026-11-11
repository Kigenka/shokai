// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Taste Blend share-plan scope filter (reference host guard).
// STRUCTURAL only: field names and signed share-plan scope. No content scanners.
// The host MUST NOT pass a visitor's private fields beyond the signed share plan.

/** Field names a Taste Blend share plan may authorize. Fictional taste topics only. */
export const TASTE_FIELD_NAMES = Object.freeze([
  "music.favorites", "music.recent", "music.why",
  "games.favorites", "games.recent", "games.why",
  "anime.favorites", "anime.recent", "anime.why",
  "food.favorites", "food.recent", "food.why", "food.diet",
  "reveal.first_name", "reveal.hello",
  "adult_confirmed",
]);

const TASTE_SET = new Set(TASTE_FIELD_NAMES);

/** Normalize a signed share plan into a Set of authorized field names. */
export function sharePlanFieldSet(plan) {
  const out = new Set();
  if (!plan || typeof plan !== "object") return out;
  const raw = plan.fields ?? plan.allowed_fields ?? plan.share ?? [];
  const list = Array.isArray(raw) ? raw : [];
  for (const item of list) {
    const name = typeof item === "string" ? item : item?.name;
    if (typeof name === "string" && TASTE_SET.has(name)) out.add(name);
  }
  return out;
}

/** True when the field name is authorized by the signed share plan. */
export function hostMayPass(sharePlan, fieldName) {
  if (typeof fieldName !== "string") return false;
  return sharePlanFieldSet(sharePlan).has(fieldName);
}

/**
 * Return only the entries whose keys are in the signed share plan.
 * Keys outside the plan are dropped (never forwarded).
 */
export function filterOutgoing(sharePlan, outgoing) {
  const allowed = sharePlanFieldSet(sharePlan);
  const src = outgoing && typeof outgoing === "object" ? outgoing : {};
  const kept = {};
  for (const [k, v] of Object.entries(src)) {
    if (allowed.has(k)) kept[k] = v;
  }
  return kept;
}

/** Field names present in outgoing that the share plan does not authorize. */
export function extrasBeyondPlan(sharePlan, outgoing) {
  const allowed = sharePlanFieldSet(sharePlan);
  const src = outgoing && typeof outgoing === "object" ? outgoing : {};
  return Object.keys(src).filter((k) => !allowed.has(k));
}

/** A host pass is allowed only when every outgoing field is in the plan. */
export function assertWithinSharePlan(sharePlan, outgoing) {
  const extras = extrasBeyondPlan(sharePlan, outgoing);
  return { ok: extras.length === 0, extras, forwarded: filterOutgoing(sharePlan, outgoing) };
}
