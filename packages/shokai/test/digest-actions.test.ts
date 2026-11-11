// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team finding 5 (C280, provisional): house_digest covers action definitions.
// 1. houseDigest changes whenever an action's meaning changes (purposes, data_asks, spending_actions membership,
//    account_actions / account_creation, costs_place).
// 2. The listing's PlaceAction[] (Host.placeActions) is derived only from the signed policy: each listed action's
//    purposes / spends / data_asks / creates_account matches policy.actions / spending_actions / account settings,
//    the same policy always yields the same listing, and a changed listing always comes with a changed digest.
// placeActions() is called on the real Host.prototype with only the state it reads (cfg, legacy), so no door
// construction API is assumed here.
import { houseDigest } from "../src/core/trust.js";
import { Host } from "../src/core/host.js";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean): void {
  if (ok) { pass++; console.log(`ok - ${name}`); } else { fail++; console.log(`not ok - ${name}`); }
}
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type Act = { action: string; purposes: string[]; level: string; data_asks?: unknown[]; costs_place?: boolean; requires_customer_link?: boolean };
type Pol = {
  purposes: { code: string }[];
  actions: Act[];
  spending_actions: string[];
  considering: { actions: string[]; routed_to: string; response_days: number; requires_introduction: boolean };
  account_actions?: string[];
  account_creation?: "open" | "introduction_or_invitation";
};

function basePolicy(): Pol {
  return {
    purposes: [{ code: "information" }, { code: "purchase" }],
    actions: [
      { action: "catalog.search", purposes: ["information"], level: "seated", data_asks: [] },
      { action: "order.place", purposes: ["purchase"], level: "seated", data_asks: [{ code: "shipping_address" }] },
      { action: "account.create", purposes: ["purchase"], level: "seated" },
    ],
    spending_actions: ["order.place"],
    considering: { actions: ["wholesale.quote"], routed_to: "owner", response_days: 7, requires_introduction: false },
    account_actions: [],
    account_creation: "open",
  };
}

const NAME = "test-shop";
const DISPLAY = "Test Shop";
const PRINCIPAL = "did:key:z6MkTestPrincipalOnly";
const dig = (p: Pol): string => houseDigest({ name: NAME, display_name: DISPLAY, principal_id: PRINCIPAL, policy: p });

type Listed = { action: string; purposes: string[]; spends: boolean; creates_account?: boolean; requires_introduction?: boolean;
  requires_customer_link?: boolean; needs: string; data_asks: unknown[]; costs_place?: boolean };
function listing(p: Pol, legacy = false): Listed[] {
  const fake: object = Object.create(Host.prototype as object) as object;
  Object.defineProperty(fake, "cfg", { value: { policy: p, peer: false }, configurable: true });
  Object.defineProperty(fake, "legacy", { value: legacy, configurable: true });
  const fn = (Host.prototype as unknown as { placeActions: (this: object) => Listed[] }).placeActions;
  return fn.call(fake);
}

// ---- 1. digest moves with action meaning ----
const base = basePolicy();
const d0 = dig(base);
check("digest is deterministic", dig(clone(base)) === d0);

{ const p = clone(base); p.actions[0]!.purposes = ["information", "purchase"]; check("adding a purpose to an action changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions[1]!.purposes = ["information"]; check("replacing an action's purposes changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions[1]!.data_asks = [{ code: "shipping_address" }, { code: "phone" }]; check("adding a data_ask changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions[1]!.data_asks = []; check("removing a data_ask changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions[0]!.data_asks = [{ code: "email" }]; check("giving an action a data_ask changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.spending_actions = []; check("removing an action from spending_actions changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.spending_actions = ["order.place", "catalog.search"]; check("adding an action to spending_actions changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.account_actions = ["order.place"]; check("account_actions membership changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.account_creation = "introduction_or_invitation"; check("account_creation changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions[1]!.costs_place = true; check("costs_place changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.actions.push({ action: "gift.send", purposes: ["purchase"], level: "seated" }); check("adding an action changes the digest", dig(p) !== d0); }
{ const p = clone(base); p.considering.actions = []; check("considering actions change the digest", dig(p) !== d0); }

// ---- 2. listing is exactly what the signed policy derives ----
for (const legacy of [false, true]) {
  const tag = legacy ? "shokai/0.3" : "shokai/0.5";
  const L = listing(base, legacy);
  for (const a of base.actions) {
    const x = L.find((y) => y.action === a.action);
    check(`[${tag}] ${a.action} listed`, !!x);
    if (!x) continue;
    check(`[${tag}] ${a.action} purposes match signed policy`, eq(x.purposes, a.purposes));
    check(`[${tag}] ${a.action} spends matches spending_actions`, x.spends === base.spending_actions.includes(a.action));
    check(`[${tag}] ${a.action} data_asks match signed policy`, eq(x.data_asks, a.data_asks ?? []));
    const creates = a.action === "account.create" || (base.account_actions ?? []).includes(a.action);
    check(`[${tag}] ${a.action} creates_account matches account settings`, (x.creates_account === true) === creates);
  }
  const cons = L.find((y) => y.action === "wholesale.quote");
  check(`[${tag}] considering action listed as considering`, !!cons && cons.needs === "considering" && cons.spends === false);
  check(`[${tag}] no listed action outside the signed policy`,
    L.every((x) => base.actions.some((a) => a.action === x.action) || base.considering.actions.includes(x.action)));
  check(`[${tag}] same policy, same listing`, eq(listing(clone(base), legacy), L));
}

// every policy change that alters the listing also alters the digest
const mutations: [string, (p: Pol) => void][] = [
  ["purposes", (p) => { p.actions[0]!.purposes = ["purchase"]; }],
  ["data_asks", (p) => { p.actions[1]!.data_asks = [{ code: "phone" }]; }],
  ["spending_actions", (p) => { p.spending_actions = []; }],
  ["account_actions", (p) => { p.account_actions = ["order.place"]; }],
  ["account_creation", (p) => { p.account_creation = "introduction_or_invitation"; }],
  ["costs_place", (p) => { p.actions[1]!.costs_place = true; }],
  ["requires_customer_link", (p) => { p.actions[1]!.requires_customer_link = true; }],
];
const L0 = listing(base);
for (const [name, mut] of mutations) {
  const p = clone(base); mut(p);
  const changedListing = !eq(listing(p), L0);
  check(`${name}: listing changes`, changedListing);
  check(`${name}: a changed listing implies a changed digest`, !changedListing || dig(p) !== d0);
}
{ const p = clone(base); p.account_creation = "introduction_or_invitation";
  const x = listing(p).find((y) => y.action === "account.create");
  check("introduction-only sign-up listed as requires_introduction", x?.requires_introduction === true); }

console.log(`digest-actions: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
