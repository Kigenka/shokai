// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team finding 3 (§6.12, C283, provisional): reconsider once, then no re-ask of a declined required field in one visit.
import { createDoor, createRepresentative, signContextResponse, type DoorOptions } from "../src/index.js";
import type * as S from "../src/core/shapes.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const NEED: S.ContextRequirements = { mode: "before_entry", retention_days: 0, fields: [{ name: "favorite_food", what: "A food you love", why: "To pair tastes.", required: true }] };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "reask-table", displayName: "Reask Table", category: "store",
  purposes: [{ code: "inquiry", statement: "A playful taste." }], actions: [{ action: "concierge.talk", purposes: ["inquiry"], level: "discover", data_asks: [] }],
  testProfile: true, policy: { context_requirements: NEED } as any, ...o });

async function main() {
  console.log("Context reconsider-once (C283)");
  const door = createDoor(opts());
  const mio = createRepresentative({ ownerName: "Mio", purposes: ["inquiry"], actions: ["concierge.talk"] });
  const ask = { purpose: "inquiry" as const, actions: ["concierge.talk"] };
  const v1 = await mio.visit(door, ask);
  check(!!v1.contextRequest && !v1.seated, "before_entry: first visit gets a context_request, not seated");
  const cq = v1.contextRequest!;
  const no1 = signContextResponse(mio.owner, cq, { answers: [], declined: cq.fields.map((f) => f.name) });
  const v2 = await mio.visit(door, { ...ask, contextResponse: no1 });
  check(!v2.seated && v2.response?.disposition === "not_now" && (v2 as any).response?.reason_code === "POLICY_DENY" && v2.contextRequest?.request_id === cq.request_id,
    "first decline of required field: POLICY_DENY with the same request returned once");
  const no2 = signContextResponse(mio.owner, v2.contextRequest!, { answers: [], declined: v2.contextRequest!.fields.map((f) => f.name) });
  const v3 = await mio.visit(door, { ...ask, contextResponse: no2 });
  check(!v3.seated && (v3 as any).response?.reason_code === "POLICY_DENY" && !v3.contextRequest,
    "second decline: POLICY_DENY, no context_request (C283)");
  console.log(`context-reask: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
