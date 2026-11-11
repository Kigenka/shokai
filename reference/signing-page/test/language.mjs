// SIGNING.md §7: the reference signing page supports English and Japanese. An items file that names another owner language is
// refused (checkItems, and the server won't start); English and Japanese tags and an unstated language (English) are accepted;
// the page script warns a browser without the page's language. Figures equivalence: the English and Japanese screens for the
// same items show the same figures (every amount, time and identifier), the same checks and the same one-tap behaviour; only
// the words and the way an amount or a date is written differ. Fictional actors only.
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkItems, buildItems, languageSupported, SUPPORTED_LANGUAGES, itemsLanguage } from "../items.mjs";
import { TEXT } from "../i18n.mjs";
import { digestOf } from "../webauthn.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (ok, what) => { if (ok) pass++; else { fail++; console.log("  ✗ " + what); } };
const example = JSON.parse(readFileSync(join(HERE, "..", "items.example.json"), "utf8"));
const withLang = (s, l) => ({ ...s, owner_language: l });
const langProblem = (s) => checkItems(s).find((x) => /owner_language/.test(x));
check(SUPPORTED_LANGUAGES.join() === "en,ja", "the supported languages are English and Japanese");
check(!langProblem(example) && itemsLanguage(example) === "en", "no owner_language: accepted, shown in English");
for (const l of ["en", "en-US", "EN-gb"]) check(!langProblem(withLang(example, l)) && itemsLanguage(withLang(example, l)) === "en", `owner_language ${l}: accepted, English`);
for (const l of ["ja", "ja-JP", "JA-jp"]) check(!langProblem(withLang(example, l)) && itemsLanguage(withLang(example, l)) === "ja", `owner_language ${l}: accepted, Japanese`);
for (const l of ["es-419", "zh-Hant-TW", "fr", "ko"]) check(/English and Japanese only/.test(langProblem(withLang(example, l)) ?? ""), `owner_language ${l}: refused, naming the English-and-Japanese limit`);
for (const l of ["", "english please", 7, "e"]) check(/BCP 47/.test(langProblem(withLang(example, l)) ?? ""), `owner_language ${JSON.stringify(l)}: refused as not a language tag`);
check(languageSupported("en-AU") && languageSupported("ja-JP") && !languageSupported("jpn") && !languageSupported(undefined), "languageSupported matches the primary subtag only");
// The server refuses to start with an unsupported owner language (exit 2, before it listens).
const dir = mkdtempSync(join(tmpdir(), "shokai-lang-")), items = join(dir, "items.json"); writeFileSync(items, JSON.stringify(withLang(example, "fr")));
const r = spawnSync("node", [join(HERE, "..", "server.mjs")], { env: { ...process.env, RP_ID: "lang-test.shokai.invalid", TOKEN: "x".repeat(32), ITEMS: items, DATA_DIR: join(dir, "data"), PORT: "0", TTL_MIN: "1" }, encoding: "utf8", timeout: 10000 });
check(r.status === 2 && /English and Japanese only/.test(r.stderr), "the server won't start for owner_language fr");

// Fixtures: the example items, a standing allowance in yen, and a one-purchase raise in yen and in dollars.
const OWNER = "did:jwk:owner-fixture", PLACE = "did:web:teas.example", NOW = Date.parse("2026-11-01T20:00:00Z");
const grant = { purposes: ["purchase"], place_categories: ["tea"], actions: ["store.buy"], spend: { per_period: { value: "12000", currency: "JPY" }, period: "P1M", per_seat: { value: "4000", currency: "JPY" } } };
const allowance = { allowance_id: "a-1", card_id: "card-1", representative_id: "did:key:rep-fixture", owner_id: OWNER, grant_digests: [digestOf(grant)], revocation_status: "https://status.example/a-1",
  valid_from: "2026-11-01T20:00:00Z", expires_at: "2027-02-01T20:00:00Z" };
function raiseFixture(cur, [limit, current, proposed, held], tz) {
  const M = (v) => ({ value: v, currency: cur }), HOLD_END = "2026-11-02T00:15:00Z", ACT = "sha-256:act-fixture";
  const cm = { mandate_id: "m-1", card_id: "card-1", representative_id: "did:key:rep-fixture", principal_id: OWNER, purpose: { code: "purchase" }, allowed_actions: ["store.buy"],
    limits: { max_amount: M(limit) }, counterparties: [PLACE], issued_at: "2026-11-01T20:00:00Z", expires_at: "2026-11-02T20:00:00Z" };
  const payload = { ...cm, mandate_id: "m-2", limits: { max_amount: M(proposed) }, issued_at: "2026-11-02T00:05:00Z", expires_at: HOLD_END,
    supersedes: { mandate_id: "m-1", mandate_digest: digestOf(cm), hold: { hold_id: "hold-1", act_digest: ACT } } };
  const raise = { limit_request: { place: PLACE, hold_id: "hold-1", limit: M(limit), current: M(current), proposed: M(proposed), expires_at: HOLD_END },
    current_mandate: { payload: cm }, ledger_current: M(current), held: { tool: "store.buy_tin", amount: M(held), act_digest: ACT }, place_name: "Linden & Pike Teas", time_zone: tz };
  return { name: "raise", title: "Approve the tea", summary: ["one purchase"], payload, raise };
}
const sessions = {
  example,
  allowance: { owner_display_name: "Fixture Owner", items: [{ name: "allow", title: "Tea allowance", summary: ["monthly tea"], payload: allowance, grants: [grant] }] },
  "raise JPY": { owner_display_name: "Fixture Owner", items: [raiseFixture("JPY", ["3000", "2000", "6000", "4000"], "Asia/Tokyo")] },
  "raise USD": { owner_display_name: "Fixture Owner", items: [raiseFixture("USD", ["30.00", "20.00", "60.00", "40.00"], "America/Los_Angeles")] },
};
const shown = {};
for (const [name, s] of Object.entries(sessions)) {
  const en = buildItems(s, OWNER, "sign.example", NOW), ja = buildItems(withLang(s, "ja-JP"), OWNER, "sign.example", NOW);
  check(!checkItems(withLang(s, "ja")).length && !checkItems(s).length, `${name}: both languages start`);
  shown[name] = ja;
  en.forEach((e, i) => {
    const j = ja[i], strip = ({ shown_to_owner, ...x }) => x;
    check(JSON.stringify(e.figures) === JSON.stringify(j.figures) && e.figures.length > 0, `${name} item ${i + 1}: the same figures, in the same order, on both screens`);
    check(e.kind === j.kind && e.own_tap === j.own_tap && e.facts.length === j.facts.length && e.quoted.length === j.quoted.length && e.problems.length === j.problems.length, `${name} item ${i + 1}: the same kind, one-tap behaviour, lines, quotes and checks`);
    check(JSON.stringify(strip(e.payload)) === JSON.stringify(strip(j.payload)), `${name} item ${i + 1}: the same payload signed (a raise differs only in the page-written shown_to_owner)`);
    if (!e.payload.shown_to_owner) check(e.digest === j.digest, `${name} item ${i + 1}: the same digest`);
    // every figure is on the Japanese screen as Japanese formatting writes it, and on the English one as English writes it
    const flat = (x) => [x.title, ...x.facts, ...(x.decision ? [x.decision.headline, x.decision.why, ...x.decision.table.flat(), ...x.decision.scope, ...x.decision.merchant, ...x.decision.expiry, x.decision.signed_text] : [])].join("\n");
    const jaAll = flat(j), enAll = flat(e);
    check(JSON.stringify(e.facts) === JSON.stringify([...e.main, ...e.details]) && e.main.length === j.main.length && e.details.length === j.details.length, `${name} item ${i + 1}: the same split between the screen and Details`);
    check(!e.decision === !j.decision && (!e.decision || (e.decision.table.length === j.decision.table.length && e.decision.scope.length === j.decision.scope.length && e.decision.merchant.length === j.decision.merchant.length && e.decision.expiry.length === j.decision.expiry.length && e.decision.details.length === j.decision.details.length)),
      `${name} item ${i + 1}: the same decision layout on both screens`);
    for (const [k, a, b] of j.figures) {
      if (k === "amount") { const M = { value: a, currency: b }; check((jaAll.includes(TEXT.ja.money(M)) || jaAll.includes(TEXT.ja.cell(M))) && enAll.includes(TEXT.en.money(M)), `${name}: ${a} ${b} is on both screens`); }
      if (k === "time" && a) { const raiseTz = s.items[0].raise?.time_zone;
        check(jaAll.includes(TEXT.ja.when(a)) || jaAll.includes(TEXT.ja.deadline(a, raiseTz)), `${name}: the time ${a} is on the Japanese screen`); }
    }
    for (const id of enAll.match(/(did:[a-z]+:[A-Za-z0-9.%_#:-]+|sha-256:[A-Za-z0-9_-]+)/g) ?? []) check(jaAll.includes(id.replace(/[.:]$/, "")), `${name}: identifier ${id} is on the Japanese screen too`);
    check(!/^(WHAT|OWNER|SPEND|VALID|WHERE|PURPOSE|PURPOSES|ACTIONS|GRANT \d|FIGURES|DEADLINE|BOUND TO|STANDING)\b/m.test(j.facts.join("\n")), `${name} item ${i + 1}: no English labels on the Japanese screen`);
  });
}
// Japanese formatting: yen as 4,000円 in sentences and ¥4,000 in table cells, other currencies by Intl ja-JP, dates with the weekday
// and the zone; the decision-first raise screen in plain です/ます (review 2026-11-01).
const rj = shown["raise JPY"][0], ru = shown["raise USD"][0], al = shown.allowance[0], dj = rj.decision;
check(dj.headline === "今回の購入（4,000円）だけを承認しますか？" && rj.title === "1 / 1 ・ 今回の購入（4,000円）の承認", "raise JPY: the question and the title give the purchase amount (4,000円), not the total");
check(JSON.stringify(dj.table) === JSON.stringify([["通常の利用上限", "¥3,000"], ["支払い済み・保留中の金額", "¥2,000"], ["今回の購入", "¥4,000"], ["今回の購入を含む合計", "¥6,000"]]), "raise JPY: the four figures in the table, ¥ with no decimals");
check(/^あなたに代わって購入などの操作を行うAIエージェント（代理エージェント）が、teas\.example（did:web:teas\.example）で4,000円の購入を保留しています。/.test(dj.why), "raise JPY: why approval is needed, the representative agent introduced on first mention");
check(dj.scope[0] === "今回承認するのは、4,000円の購入1件です。" && /新たに6,000円の購入を承認するものではありません/.test(dj.scope[1]) && dj.scope[2] === "この承認は、ほかの購入・操作・サイトには適用されません。", "raise JPY: what it approves, the total isn't a new purchase, nothing else");
check(dj.merchant.includes("サイトが申告している店舗名：Linden & Pike Teas（未確認）") && /心当たりがない場合は承認しないでください。$/.test(dj.warning), "raise JPY: the store name as unverified, with the warning");
check(dj.expiry[0] === "2026年11月2日（月）午前9:15（日本時間）まで" && dj.expiry[1] === "保留が終了すると、この承認も失効します。" && dj.expiry[2] === "期限までに承認しなければ、自動的に不承認となります。", "raise JPY: the deadline with the weekday and 日本時間, and the timeout wording");
check(dj.approve === "今回の購入だけを承認する" && dj.decline === "承認しない", "raise JPY: the buttons");
const sj = rj.payload.shown_to_owner;
check(sj.locale === "ja-JP" && sj.text === dj.signed_text && /承認すると、この購入1件に限り利用上限が6,000円まで引き上げられます。/.test(sj.text) && /ほかの購入の利用上限は変わりません。/.test(sj.text) && /保留が終了すると、この承認も失効します。/.test(sj.text) && /2026年11月2日（月）午前9:15（日本時間）までに承認しなければ、自動的に不承認となります。$/.test(sj.text),
  "raise JPY: the signed text states the action, the scope, the lapse and the timeout (ja-JP)");
check(rj.main.length === 0 && ["今回の操作：store.buy_tin", "対象の保留：hold-1", "操作の識別値：sha-256:act-fixture", "利用目的コード：purchase"].every((x) => rj.details.includes(x)) && rj.details.some((x) => /^内容：権限の委任設定（委任状 m-2）です。Shōkai訪問者カード card-1 から/.test(x)), "raise JPY: card, mandate, keys, hold, digest and the raw purpose under 詳細");
check(rj.details.includes("この委任状で行う取引の合計上限：6,000円（保留中の今回の購入1件にのみ適用されます。ほかの購入には使えません）") && rj.details.includes("利用目的：購入。許可される操作：store.buy"), "raise JPY: the aggregate line under 詳細 applies to this purchase only; the purpose translated");
check(ru.decision.table[3][1] === "60.00米ドル" && /2026年11月1日（日）午後4:15（GMT-8）/.test(ru.decision.expiry[0]), "raise USD: dollars by Intl ja-JP (60.00米ドル), the deadline in the owner's zone");
check(al.facts.some((x) => x.includes("1か月ごとに12,000円まで、1回の取引で4,000円まで")) && !al.facts.join("").replace(/Shōkai訪問者カード/g, "").includes("訪問"), "allowance: yen per period and per purchase, and 訪問 never in limit wording");
check(TEXT.ja.money({ value: "4000.50", currency: "JPY" }) === "4,000.50円" && TEXT.ja.cell({ value: "4000.50", currency: "JPY" }) === "¥4,000.50", "yen with a fraction in the signed figure keeps it (never rounded away)");
// the raise refusals in Japanese, with the same check behind them, both figures labelled
const bad = raiseFixture("JPY", ["3000", "2000", "6000", "4000"], "Asia/Tokyo"); bad.raise.ledger_current = { value: "1000", currency: "JPY" };
const pe = checkItems({ owner_display_name: "x", items: [bad] }), pj = checkItems({ owner_display_name: "x", owner_language: "ja", items: [bad] });
check(pe.length === pj.length && pe.length > 0 && /amounts don't match/.test(pe.join()) && pj.some((x) => x.includes("金額が一致しないため、承認手続きを開始できません。サイトが示した支払い済み・保留中の金額：2,000円、代理エージェントの記録：1,000円。安全のため、この申請は承認できません。")),
  "a ledger mismatch is refused in both languages, in Japanese with both figures labelled");
// register and terms: plain です/ます; no bare カード, 場所, 用件, 常設; 訪問 never in limit wording
const jaText = JSON.stringify(TEXT.ja, (k, v) => typeof v === "function" ? v.toString() : v);
check(!/なさ|お待ちして|いただ|お断り/.test(jaText) && !/場所|用件|常設|認定/.test(jaText) && !/(?<!訪問者|ホスト)カード/.test(jaText.replace(/Shōkai訪問者カード|Shōkaiホストカード|cardName|cardLabel|cardWhat|cardOwner|qCardName/g, "")), "Japanese copy: plain です/ます; no 場所, 用件, 常設, 認定 or bare カード");
check(Object.keys(TEXT.en).sort().join() === Object.keys(TEXT.ja).sort().join(), "every English string has a Japanese one");
// Copy rules: 代理エージェント, Shōkai訪問者カード, Shōkai in Latin script with its macron, never 認定 (certified).
const src = readFileSync(join(HERE, "..", "i18n.mjs"), "utf8") + readFileSync(join(HERE, "..", "public", "app.js"), "utf8");
check(/代理エージェント/.test(src) && /Shōkai訪問者カード/.test(src) && !/認定|ショウカイ|しょうかい|紹介プロトコル|Shokai訪問/.test(src), "Japanese copy rules: 代理エージェント, Shōkai訪問者カード, no 認定");
// The page script: a Japanese string for every translatable element, the language from the server, and a warning when the
// browser lacks the page's language.
const app = readFileSync(join(HERE, "..", "public", "app.js"), "utf8"), html = readFileSync(join(HERE, "..", "public", "index.html"), "utf8");
const jaBlock = app.slice(app.indexOf("  ja: {"), app.indexOf("let S = STR.en"));
const keys = [...html.matchAll(/data-t="([A-Za-z0-9]+)"/g)].map((m) => m[1]);
check(keys.length >= 18 && keys.every((k) => new RegExp(`\\b${k}:`).test(jaBlock)), "every translatable element of the page has a Japanese string");
check(/st\.lang === "ja"/.test(app) && /navigator\.languages/.test(app) && /English only/.test(app) && /日本語を十分に読めない/.test(app) && /role", "alert"/.test(app), "the page script takes the language from the server and warns a browser without it");
check(/el\("details", null, "details"\)/.test(app) && !/details[^\n]*\.open = true/.test(app) && /decision\?\.approve/.test(app) && /notPurchase/.test(html), "the page: identifiers under a collapsed Details section, the decision's own buttons, and 'signing isn't the purchase' after signing");
console.log(`signing-page language (SIGNING.md §7): ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
