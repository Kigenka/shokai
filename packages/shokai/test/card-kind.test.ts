// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// SDK tests (Fable review, §2.1): principal.kind is checked against the enum; a development passkey's RFC 2606 rp_id is refused
// at a public door unless the operator opts in; acceptedRpIds narrows the rp_ids a door accepts. Fictional people.
import { createDoor, createRepresentative, signCard, sign, verifyDoorCard, developmentPasskey, generateRepresentativeKey, houseDigestFor, summaryDigestFor, type DoorOptions } from "../src/index.js";
import { reservedRpId } from "../src/core/index.js";

let pass = 0, fail = 0;
const check = (c: boolean, what: string) => { if (c) { pass++; console.log("  PASS " + what); } else { fail++; console.log("  FAIL " + what); } };
const opts = (o: Partial<DoorOptions> = {}): DoorOptions => ({ approvedBy: { name: "Kai", role: "Owner" }, name: "tea", displayName: "Tea", category: "store",
  purposes: [{ code: "visitation", statement: "Looking." }], actions: [{ action: "menu.view", purposes: ["visitation"], level: "discover", data_asks: [] }], ...o });

async function main() {
  console.log("SDK card kind and rp_id checks (Fable review)");
  check(reservedRpId("owners.example") && reservedRpId("a.test") && reservedRpId("example.com") && reservedRpId("x.localhost") && !reservedRpId("kigenka.com") && !reservedRpId("examples.org"), "RFC 2606 reserved names are recognised, real names are not");
  const pub = createDoor(opts({ baseUrl: "https://tea.kigenka.invalid.shop/shokai" }));
  const h: any = pub.host;
  check(/not person\|brand\|company\|system/.test(h.cardRpKindProblem({ principal: { kind: "organization" } }) ?? ""), "principal.kind outside the enum is refused");
  check(/RFC 2606/.test(h.cardRpKindProblem({ principal: { kind: "person" }, owner_binding: { rp_id: "owners.example" } }) ?? ""), "a public door refuses a development passkey's rp_id");
  check(h.cardRpKindProblem({ principal: { kind: "person" }, owner_binding: { rp_id: "passkeys.kigenka.com" } }) === null, "a public door accepts a real rp_id");
  const narrow: any = createDoor(opts({ name: "n", baseUrl: "https://tea.kigenka.invalid.shop/shokai", hostOpts: { acceptedRpIds: ["passkeys.kigenka.com"] } })).host;
  check(/not one this door accepts/.test(narrow.cardRpKindProblem({ principal: { kind: "company" }, owner_binding: { rp_id: "other.shop" } }) ?? ""), "acceptedRpIds narrows the accepted rp_ids");
  const local = createDoor(opts({ name: "local" }));
  check((local.host as any).cardRpKindProblem({ principal: { kind: "person" }, owner_binding: { rp_id: "owners.example" } }) === null, "a local (loopback) door accepts development passkeys");
  const mio = createRepresentative({ ownerName: "Mio", purposes: ["visitation"], actions: ["menu.view"] });
  const v: any = await mio.visit(local, { purpose: "visitation", actions: ["menu.view"] });
  check(!!v.seated, "a local visit with a development passkey is still seated");
  // Pre-release review (round 2): the Quickstart/CLI shape, createDoor() then setBaseUrl("https://…"), refuses a development passkey too.
  const late = createDoor(opts({ name: "late" }));
  late.setBaseUrl("https://tea.kigenka.invalid.shop/shokai");
  check((late.host as any).opts.allowReservedRpIds === undefined, "setBaseUrl leaves no stale allowReservedRpIds from the loopback default");
  check(/RFC 2606/.test((late.host as any).cardRpKindProblem({ principal: { kind: "person" }, owner_binding: { rp_id: "owners.example" } }) ?? ""), "createDoor() + setBaseUrl(https public) refuses a development passkey's rp_id");
  const ren = createRepresentative({ ownerName: "Ren", purposes: ["visitation"], actions: ["menu.view"] });
  const lv: any = await ren.visit(late, { purpose: "visitation", actions: ["menu.view"] });
  check(!lv.seated && lv.response?.disposition === "not_now", `createDoor() + setBaseUrl(https public) + developmentPasskey() visitor → not_now (got ${lv.response?.disposition ?? JSON.stringify(Object.keys(lv))})`);
  const back = createDoor(opts({ name: "back" })); back.setBaseUrl("http://127.0.0.1:8080/shokai");
  check((back.host as any).cardRpKindProblem({ principal: { kind: "person" }, owner_binding: { rp_id: "owners.example" } }) === null, "setBaseUrl to loopback still accepts development passkeys");
  let insecure = ""; try { createDoor(opts({ name: "ins" })).setBaseUrl("http://tea.kigenka.invalid.shop/shokai"); } catch (e: any) { insecure = e.code; }
  check(insecure === "SHOKAI_DOOR_INSECURE", "setBaseUrl to public plain http throws SHOKAI_DOOR_INSECURE (C269)");
  let optInCode = ""; try { const optIn = createDoor(opts({ name: "optin", hostOpts: { allowReservedRpIds: true } })); optIn.setBaseUrl("https://tea.kigenka.invalid.shop/shokai");
  } catch (e: any) { optInCode = e.code; }
  check(optInCode === "SHOKAI_DOOR_CARD_INVALID", "public allowReservedRpIds override throws instead of silently enabling dev passkeys");
  const base = "https://tea.kigenka.invalid.shop/shokai", owner = developmentPasskey(), rep = generateRepresentativeKey();
  const hostCard = (url: string) => signCard(rep, owner, { displayName: "Tea", kind: "person", purposes: ["visitation"], actions: ["menu.view"], cardKind: "host",
    host: { place: { principal_id: owner.id, entry: url + "/places/tea/entry" }, host_scope: { actions: ["menu.view"], duties: ["seat"] },
      house_digest: houseDigestFor(opts({ baseUrl: url }), owner.id, url), summary_digest: summaryDigestFor(opts({ baseUrl: url }), url) },
    shownToOwner: { text: "Welcome visitors at Tea.", locale: "en-US" } });
  const hc = hostCard(base);
  check(!verifyDoorCard(hc, { entry: base + "/places/tea/entry" }).ok, "Muse H2: verifyDoorCard rejects reserved host rp_id for a public entry");
  let rejected = false; try { createDoor(opts({ baseUrl: base, card: hc, keys: { rep } })); } catch { rejected = true; }
  check(rejected, "Muse H2: public constructor refuses owners.example host card without ownerRpId option");
  const lb = "http://127.0.0.1:0/shokai";
  const localHost = createDoor(opts({ card: hostCard(lb), keys: { rep } }));
  rejected = false; try { localHost.setBaseUrl(base); } catch { rejected = true; }
  check(rejected && localHost.base === lb, "Muse H2: setBaseUrl refuses to expose a development host card and leaves the local address unchanged");
  const missing: any = structuredClone(hc.payload); delete missing.principal.kind;
  check(!verifyDoorCard(sign(missing, owner), { allowReservedRpIds: true } as any).ok, "Muse kind: host card without principal.kind is refused");
  check(/not person/.test(h.cardRpKindProblem({ principal: {} }) ?? ""), "Muse kind: visitor card without principal.kind is refused");
  rejected = false; try { signCard(rep, owner, { displayName: "Tea", kind: "invalid" as any, purposes: ["visitation"], actions: [] }); } catch { rejected = true; }
  check(rejected, "Muse kind: signCard rejects invalid principal.kind input");
  console.log(`card kind: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
