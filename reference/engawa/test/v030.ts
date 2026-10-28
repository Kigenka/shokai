// v0.3.0-rc1 conformance checks (2026-10-26, D19): declared data asks up front (§3.1, from P17), and the visit receipt
// optional in the core types. Real crypto, fresh fictional keys only (Fernwood Outfitters, Harborlight Bank).
import { appendFileSync } from "node:fs"; // SHOKAI_CHECK_LOG lists each check for scripts/suite-split.mjs (no effect otherwise)
import { fernwood, harborlight, makeHost, newKeys } from "../src/places.js";
import { placeListing } from "../src/door.js";
import { Session, visitor, mandate, clockAt, NOW } from "./kit.js";

let pass = 0, fail = 0; let cur = "";
function scenario(name: string, f: () => void) { cur = name; try { f(); } catch (e) { check(false, "threw: " + (e as Error).stack); } }
function check(c: boolean, what: string) { if (process.env.SHOKAI_CHECK_LOG) appendFileSync(process.env.SHOKAI_CHECK_LOG, JSON.stringify({ suite: "v030", group: cur, what, ok: c }) + "\n"); if (c) pass++; else { fail++; console.log(`  FAIL [${cur}] ${what}`); } }

scenario("V030-D1 declared data asks: every listed action declares data_asks; the lobby repeats them (C172)", () => {
  const store = makeHost(fernwood); const bank = makeHost(harborlight);
  const listing = placeListing("http://127.0.0.1:0", [store, bank], "2026-10-26T22:00:00Z");
  const all = listing.places.flatMap((p) => p.actions ?? []);
  check(all.length > 0 && all.every((a) => Array.isArray(a.data_asks)), "every action in the listing carries a data_asks list (possibly empty)");
  const order = all.find((a) => a.action === "store.place_order");
  check(!!order && ["name", "address", "payment_method"].every((d) => order.data_asks!.includes(d as any)), "store.place_order declares name, address and payment_method");
  const browse = all.find((a) => a.action === "store.browse_catalog");
  check(!!browse && browse.data_asks!.length === 0, "browsing asks for nothing: data_asks is []");
  check(all.filter((a) => a.action.startsWith("bank.")).every((a) => a.needs === "considering" || a.data_asks!.includes("account")), "the bank's account actions declare `account`; its considering actions declare []");
  const out = new Session(store, null, "urn:shokai:anon:newcomer-d1").greet(false, { locales: ["en-US"] });
  const brief: any = out.find((m: any) => m.type === "lobby_briefing");
  check(!!brief && JSON.stringify(brief.actions) === JSON.stringify(store.placeActions()), "the lobby briefing lists the same actions, with the same data_asks, as the listing");
});

scenario("V030-R1 visit_receipt is optional in the core types; the reference still issues one (Visit receipts extension)", () => {
  const store = makeHost(fernwood);
  const brief = store.handle("Hello, can I come in?").map((o) => o.message.payload).find((m: any) => m.type === "lobby_briefing");
  check(!!brief && brief.visit_receipt?.handling === "bearer_secret", "the reference implements Visit receipts: its briefing carries a bearer receipt");
});

scenario("V030-F1 the front is open to look at: listing and lobby need nothing from the reader and keep nothing about it (C173, D20)", () => {
  const store = makeHost(fernwood); const bank = makeHost(harborlight);
  const listing = placeListing("http://127.0.0.1:0", [store, bank], "2026-10-26T22:00:00Z");
  check(listing.places.length === 2 && listing.places.every((p) => p.entry && p.lobby && p.actions.length > 0), "the listing is built from the places alone: no visitor input exists to ask for");
  const before = new Set(store.records.keys());
  const s1 = new Session(store, null, "urn:shokai:anon:looker-f1").greet(false, { locales: ["en-US"] });
  const s2 = store.handle("Just looking, thanks.").map((o) => o.message.payload);
  const briefed = [s1, s2].every((out: any[]) => out.some((m: any) => m.type === "lobby_briefing") && out.some((m: any) => m.type === "invitation_response" && m.decision === "deny" && m.disposition === "not_now"));
  check(briefed, "an unsigned greeting and plain prose both get the lobby briefing, then deny / not_now: no card, key or personal data asked for to look");
  const added = [...store.records.keys()].filter((k) => !before.has(k));
  check(added.every((k) => k.startsWith("lobby:")), "nothing is recorded against any principal; the only records are unbound one-time receipt records (Visit receipts extension), which link nothing unless echoed");
  check(![s1, s2].flat().some((m: any) => m.type === "seat" || m.seat), "a lobby visitor is never seated: anything personal waits for the door");
});

scenario("V030-F2 links from the front are hints: listed as configured, absent otherwise (D20, informative)", () => {
  const keys = newKeys(); const plain = makeHost(fernwood, keys);
  const linked = makeHost((k) => ({ ...fernwood(k), links: [{ rel: "mcp-server-card", href: "https://fernwood.example/.well-known/ai-catalog.json" }, { rel: "product-feed", href: "https://fernwood.example/feed.xml", media_type: "application/xml" }] }), keys);
  const lp = placeListing("http://127.0.0.1:0", [plain], "2026-10-26T22:00:00Z").places[0];
  const ll = placeListing("http://127.0.0.1:0", [linked], "2026-10-26T22:00:00Z").places[0];
  check(!("links" in lp), "a place without links publishes no links member (existing listings unchanged)");
  check(ll.links?.length === 2 && ll.links[0].rel === "mcp-server-card" && JSON.stringify({ ...ll, links: undefined }) === JSON.stringify(lp),
    "a place's links appear in its listing entry and change nothing else in it");
});

scenario("V030-A1 a spending act states its amount: arguments.amount, or it is refused as incomplete (C174)", () => {
  const clock = clockAt(NOW); const h = makeHost(fernwood, newKeys(), new Map(), clock.now);
  const USD = (value: string) => ({ value, currency: "USD" });
  const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ["store.browse_catalog", "store.place_order"] });
  const m = mandate(dana, "purchase", ["store.browse_catalog", "store.place_order"], { max_amount: USD("50.00") });
  const s = new Session(h, dana); s.ritual(null, m, { actions: ["store.browse_catalog", "store.place_order"], limits: { max_amount: USD("50.00") } });
  const seat = s.response()?.seat;
  check(s.response()?.decision === "grant" && seat?.limits?.max_amount?.value === "50.00", "seated for browsing and ordering, up to 50.00 USD");
  const act = (args: Record<string, unknown>, tool = "store.place_order") => s.send(s.msg("act", { seat_id: seat.seat_id, tool, arguments: args }))[0];
  const none = act({ sku: "tea-tin" });
  check(none?.type === "act_decision" && none.decision === "deny" && none.disposition === "not_now" && none.reason_code === "REQUEST_INCOMPLETE" && none.retry?.kind === "with_credential",
    "a spending action called without arguments.amount is refused not_now / REQUEST_INCOMPLETE (it would otherwise pass the cap uncounted)");
  check(act({ sku: "tea-tin", amount: USD("30.00") })?.type === "act_result", "the same act stating its amount (30.00 USD) goes through and counts against the cap");
  const over = act({ sku: "tea-tin", amount: USD("30.00") });
  check(over?.type === "act_decision" && over.reason_code === "SEAT_SCOPE_EXCEEDED", "the stated amounts are cumulative: 30.00 + 30.00 > 50.00 is refused");
  check(act({}, "store.browse_catalog")?.type === "act_result", "a non-spending action needs no amount");
});

scenario("V030-M1 a mandate's limits bind across every seat granted under it, not per seat (C175)", () => {
  const clock = clockAt(NOW); const h = makeHost(fernwood, newKeys(), new Map(), clock.now);
  const USD = (value: string) => ({ value, currency: "USD" });
  const dana = visitor("Dana", "person", { purposes: ["purchase"], actions: ["store.browse_catalog", "store.place_order"] });
  const m = mandate(dana, "purchase", ["store.browse_catalog", "store.place_order"], { max_amount: USD("10.00"), max_operations: 2 });
  const ask = { actions: ["store.browse_catalog", "store.place_order"], limits: { max_amount: USD("10.00") } };
  const visit = () => { const s = new Session(h, dana); s.ritual(null, m, ask); const seat = s.response()?.seat;
    return { seat, act: (args: Record<string, unknown>, tool = "store.place_order") => s.send(s.msg("act", { seat_id: seat.seat_id, tool, arguments: args }))[0] }; };
  const v1 = visit();
  check(v1.seat?.mandate_id === m.payload.mandate_id && v1.act({ sku: "sencha", amount: USD("6.00") })?.type === "act_result", "visit 1 under the mandate (10.00 USD): an order for 6.00 USD goes through");
  const v2 = visit();
  check(!!v2.seat && v2.seat.seat_id !== v1.seat.seat_id && v2.seat.mandate_id === m.payload.mandate_id, "visit 2 presents the same mandate and gets a new seat");
  const again = v2.act({ sku: "sencha", amount: USD("6.00") });
  check(again?.type === "act_decision" && again.disposition === "not_now" && again.reason_code === "SEAT_SCOPE_EXCEEDED" && again.retry?.kind === "with_credential",
    "the same 6.00 USD order in the new seat is refused: 6.00 + 6.00 passes the mandate's 10.00 USD, although the new seat has spent nothing");
  check(v2.act({ sku: "tin", amount: USD("4.00") })?.type === "act_result", "what remains of the mandate (4.00 USD) can still be spent in the new seat");
  check(v2.act({}, "store.browse_catalog")?.type === "act_decision", "the mandate's max_operations (2) counts the acts done in both seats: a 3rd act under it is refused, though this seat has done only one");
  const other = mandate(dana, "purchase", ["store.browse_catalog", "store.place_order"], { max_amount: USD("10.00"), max_operations: 3 });
  const s3 = new Session(h, dana); s3.ritual(null, other, ask); const seat3 = s3.response()?.seat;
  check(s3.send(s3.msg("act", { seat_id: seat3.seat_id, tool: "store.place_order", arguments: { sku: "sencha", amount: USD("6.00") } }))[0]?.type === "act_result",
    "a different mandate the owner signed has its own allowance");
});

scenario("V030-C1 an amount in another currency than the cap is outside the seat, not incomplete (C177)", () => {
  const clock = clockAt(NOW); const h = makeHost(fernwood, newKeys(), new Map(), clock.now);
  const money = (value: string, currency: string) => ({ value, currency });
  const eve = visitor("Eve", "person", { purposes: ["purchase"], actions: ["store.browse_catalog", "store.place_order"] });
  const m = mandate(eve, "purchase", ["store.browse_catalog", "store.place_order"], { max_amount: money("10.00", "USD") });
  const s = new Session(h, eve); s.ritual(null, m, { actions: ["store.browse_catalog", "store.place_order"], limits: { max_amount: money("10.00", "USD") } }); const seat = s.response()?.seat;
  const act = (args: Record<string, unknown>) => s.send(s.msg("act", { seat_id: seat.seat_id, tool: "store.place_order", arguments: args }))[0];
  const eur = act({ sku: "sencha", amount: money("3.00", "EUR") });
  check(eur?.type === "act_decision" && eur.disposition === "not_now" && eur.reason_code === "SEAT_SCOPE_EXCEEDED" && eur.retry?.kind === "with_credential",
    "3.00 EUR under a 10.00 USD cap is refused not_now / SEAT_SCOPE_EXCEEDED (an amount was stated; it is outside what the owner allowed), never REQUEST_INCOMPLETE");
  check(act({ sku: "sencha", amount: money("10.00", "USD") })?.type === "act_result", "the refused EUR act counted nothing: the whole 10.00 USD is still there");
});

console.log(`${pass} v0.3.0-rc2 checks passed, ${fail} failed`);
if (fail) process.exit(1);
