// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Case 28: Taste Blend host MUST NOT pass private fields beyond the signed share plan.
// Conformance is STRUCTURAL: field names vs share-plan scope. Fictional taste data only.
// No content scanners, no contact-detail patterns, no attack payloads.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export default (H) => [H.kase("28-blend-share-scope",
  "Private fields beyond the signed share plan must not pass",
  "A visitor record carries taste fields the owner signed, plus extra private field names the share plan never authorized; the host filters by field name against the signed plan.",
  "Taste Blend design §4.1 (share plan is the boundary), §4.3 item 7 (anything not in the share plan), SPEC §2.3 / host guards",
  async ({ expect, saw }) => {
    const guardPath = H.path.join(H.here, "blend-share-scope.mjs");
    const G = await import(guardPath);

    // Fictional share plan: anime tastes + first name on match. No other fields.
    const plan = {
      purpose: "taste_blend",
      topic: "anime",
      fields: [
        { name: "anime.favorites" },
        { name: "anime.why" },
        { name: "reveal.first_name" },
        { name: "adult_confirmed" },
      ],
    };

    // Control: only authorized fields, fictional values.
    const clean = {
      "anime.favorites": "the sleepy swordsmith from a slice-of-life show",
      "anime.why": "quiet craft and found family",
      "reveal.first_name": "Mika",
      "adult_confirmed": true,
    };
    const ok = G.assertWithinSharePlan(plan, clean);
    expect(ok.ok && Object.keys(ok.forwarded).length === 4,
      `control: authorized fields pass through unchanged (${Object.keys(ok.forwarded).join(", ")})`);

    // Extra private field names (structural): not in the signed plan → must not pass.
    const withExtras = {
      ...clean,
      "home_city": "Kessa Bay",
      "owner.notes": "keep this between us",
      "food.diet": "vegetarian",
    };
    const bad = G.assertWithinSharePlan(plan, withExtras);
    expect(!bad.ok && bad.extras.sort().join(",") === "food.diet,home_city,owner.notes",
      `extras beyond the plan are detected by field name (${bad.extras.join(", ")})`);
    const filtered = G.filterOutgoing(plan, withExtras);
    expect(Object.keys(filtered).sort().join(",") === "adult_confirmed,anime.favorites,anime.why,reveal.first_name"
      && !("home_city" in filtered) && !("owner.notes" in filtered) && !("food.diet" in filtered),
      "host forwards only plan fields; private extras are dropped");

    // Empty plan: nothing private may pass.
    const empty = G.filterOutgoing({ fields: [] }, clean);
    expect(Object.keys(empty).length === 0, "empty share plan forwards nothing");

    // Unknown taste-shaped name still refused if not listed on THIS plan.
    expect(!G.hostMayPass(plan, "anime.recent"), "anime.recent is a known taste field but not on this plan → refused");
    expect(G.hostMayPass(plan, "anime.favorites"), "anime.favorites is on this plan → allowed");

    // Plan cannot authorize non-taste field names even if listed.
    const sneaky = G.sharePlanFieldSet({ fields: ["home_city", "anime.favorites"] });
    expect(!sneaky.has("home_city") && sneaky.has("anime.favorites"),
      "non-taste field names cannot enter the authorized set even if listed on a plan");

    void require;
    saw(`structural scope filter kept ${Object.keys(filtered).length} plan fields and dropped ${bad.extras.length} extras; empty plan forwards nothing.`);
  })];
