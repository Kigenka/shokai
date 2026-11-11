// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
/**
 * SIGNING.md §7: the languages this reference signing page words items in, English ("en") and Japanese ("ja"), and how each
 * shows amounts and times. Only the words differ by language: every figure, identifier and check is the same (test/language.mjs).
 * Japanese: yen with ¥ and no decimals (decimals only when the signed figure has them), other currencies by
 * Intl.NumberFormat("ja-JP") with the currency's name, and times as 2026年11月2日 9:15 JST, the zone always shown.
 */
export const SUPPORTED_LANGUAGES = ["en", "ja"];
/** "en", "ja" or null for a BCP 47 tag (primary subtag only: "ja-JP" is "ja"). */
export const langOf = (tag) => { if (typeof tag !== "string") return null; const p = tag.toLowerCase().split("-")[0]; return SUPPORTED_LANGUAGES.includes(p) ? p : null; };
export const languageSupported = (tag) => langOf(tag) !== null;

const isMoney = (m) => m && typeof m === "object" && typeof m.value === "string" && typeof m.currency === "string";
const enMoney = (m) => `${m.value} ${m.currency}`;
/** Japanese amounts: `cell` for compact table cells (¥4,000), otherwise for sentences (4,000円). Never rounded: a fraction in
 *  the signed figure is kept. Other currencies by Intl.NumberFormat("ja-JP") with the currency's name (60.00米ドル). */
function jaMoney(m, cell) {
  if (!/^\d+(\.\d+)?$/.test(m.value)) return enMoney(m);
  const [w, f = ""] = m.value.split("."), dp = /[1-9]/.test(f) ? f.length : (m.currency === "JPY" ? 0 : f.length);
  const group = (s) => new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(s);
  if (m.currency === "JPY") { const n = `${group(w)}${dp ? "." + f : ""}`; return cell ? `¥${n}` : `${n}円`; }
  try { return new Intl.NumberFormat("ja-JP", { style: "currency", currency: m.currency, currencyDisplay: "name", minimumFractionDigits: dp, maximumFractionDigits: dp }).format(m.value); }
  catch { return enMoney(m); }
}
const enWhen = (t) => typeof t === "string" ? t.replace("T", " ").replace(/:\d\dZ$/, " UTC").replace(/Z$/, " UTC") : "not stated";
const zoneOk = (z) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };
const enDate = (t, tz) => {
  const d = new Date(t); if (typeof t !== "string" || isNaN(d)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: zoneOk(tz || "UTC") ? (tz || "UTC") : "UTC", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
};
/** 2026年11月2日（月）午前9:15（日本時間）: the weekday, and the zone always (日本時間 for Asia/Tokyo). */
const jaDate = (t, tz) => {
  const d = new Date(t); if (typeof t !== "string" || isNaN(d)) return null;
  const zone = zoneOk(tz || "Asia/Tokyo") ? (tz || "Asia/Tokyo") : "UTC";
  const P = Object.fromEntries(new Intl.DateTimeFormat("ja-JP", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" })
    .formatToParts(d).map((p) => [p.type, p.value]));
  return `${P.year}年${P.month}月${P.day}日（${P.weekday}）${P.dayPeriod ?? ""}${P.hour}:${P.minute}（${zone === "Asia/Tokyo" ? "日本時間" : P.timeZoneName}）`;
};
const JA_PURPOSES = { purchase: "購入", visitation: "閲覧・比較", inquiry: "問い合わせ", account_servicing: "アカウントの手続き", payment_initiation: "支払いの開始", data_access: "データの利用",
  creative_assist: "制作の手伝い", support: "サポート", teaching: "教える・教わる", collaboration: "共同作業", invitation: "招待", introduction: "紹介", gathering: "集まりへの参加" };
const EMM = "The amounts don't match, so approval can't start. ", ESAFE = "For your safety, this request can't be approved.";
const MM = "金額が一致しないため、承認手続きを開始できません。", SAFE = "安全のため、この申請は承認できません。";
const L = (a) => Array.isArray(a) && a.length ? a.map(String) : null;

export const TEXT = {
  en: {
    lang: "en",
    money: (m) => isMoney(m) ? enMoney(m) : "(missing)", cell: (m) => isMoney(m) ? enMoney(m) : "(missing)",
    when: (t) => enWhen(t),
    deadline: (t, tz) => enDate(t, tz) ?? "(no valid deadline)",
    list: (a) => L(a)?.join(", ") ?? "none",
    purpose: (c) => c, purposeCode: (c) => `PURPOSE CODE: ${c ?? "not stated"}.`,
    and: " and ", notStated: "not stated", you: "you (this passkey)", notYours: ". WARNING: not this passkey's key",
    itemTitle: (i, n, label) => `${i} of ${n} · ${label}`,
    fromSupplier: "whoever prepared this item (not checked by this page)",
    details: "Details",
    // cards
    cardLabel: "A card for your representative",
    cardName: (k) => k === "host" ? "Shōkai host card" : "Shōkai visitor card",
    cardWhat: (cid, proto, rid) => `WHAT: a card (${cid}, format ${proto ?? "not stated"}) that lets this key act as your representative: ${rid}.`,
    repKey: (k, alg, pub) => `REPRESENTATIVE KEY: ${k} (${alg ?? "algorithm not stated"}, public key ${pub ?? "not stated"}).`,
    keyMismatch: "WARNING: the card's representative_id and its key don't match.",
    purposes: (l) => `PURPOSES: ${l}.`, actions: (l) => `ACTIONS: ${l}.`,
    cardOwner: (who, kind) => `OWNER: ${who} (${kind ?? "kind not stated"}).`,
    boundTo: (rp, method, who) => `BOUND TO: your passkey on ${rp ?? "no stated site"}, method ${method ?? "not stated"}, owner ${who}.`,
    chatKey: (k) => `CHAT KEY: ${k}. This key alone can sign "you replied yes in chat" approvals for this card (SPEC §8.1). Sign only if it's the key of the chat app you use.`,
    valid: (a, b) => `VALID: ${a} until ${b}.`,
    withdrawals: (u) => `WITHDRAWALS: places can check ${u}.`,
    standing: (tier, l) => `STANDING: ${tier ?? "not stated"}. LANGUAGES: ${l}.`,
    qCardName: "the name on the card (a claim; nobody checked it)", qRole: "the role written on the card",
    visitorKind: "KIND: a Shōkai visitor card (your representative goes out to places for you).",
    // mandates
    mandateSpend: (max) => `Permission to spend up to ${max}`, mandateNoSpend: "Permission to act (no spending)",
    mandateBrowseOnly: "Visitation (browse only, no spending)",
    raiseRefused: "A held purchase this page can't offer (the amounts don't match)",
    raiseLabel: (act) => `Approve one held purchase (${act})`,
    supersedes: (mid, d) => `SUPERSEDES: mandate ${mid} (${d}).`,
    mandateWhat: (mid, cid, rid) => `WHAT: a mandate (${mid}) for card ${cid}, for the representative key ${rid}.`,
    owner: (who) => `OWNER: ${who}.`,
    otherOwner: "WARNING: the mandate names another owner key, not this passkey's.",
    purposeActions: (c, l) => `PURPOSE: ${c ?? "not stated"}. ACTIONS: ${l}.`,
    spendNone: "SPEND: nothing (no max_amount, so no spending is allowed).",
    spendPerOp: (max, s) => `SPEND: up to ${max} per action, and at most ${s} in one visit.`,
    spendTotal: (max) => `SPEND: at most ${max} in total, across every visit under this mandate.`,
    maxOps: (n) => `at most ${n} actions`, ratePerHour: (n) => `at most ${n} an hour`, maxSession: (n) => `visits of at most ${n} s`, dataShared: (l) => `data shared: ${l}`,
    otherLimits: (xs) => `OTHER LIMITS: ${xs.join("; ")}.`,
    whereOnly: (l) => `WHERE: only at ${l}.`, whereAny: "WHERE: ANY place. No place is named, so it can be used anywhere that accepts it.",
    issued: (t) => `ISSUED: ${t}.`, underAllowance: (a) => `UNDER ALLOWANCE: ${a}.`,
    qPurpose: "the purpose statement in the mandate",
    // allowances
    allowanceLabel: "A standing allowance (your representative acts on its own inside it)",
    allowanceWhat: (aid, cid, rid) => `WHAT: a standing allowance (${aid}) for card ${cid}: inside it the representative key ${rid} acts without asking you.`,
    grant: (i, p, c, a) => `GRANT ${i}: purposes ${p}; places of kind ${c}; actions ${a}.`,
    period: (p) => ({ P1D: "day", P7D: "week", P1M: "month" })[p] ?? p,
    grantSpend: (i, per, period, seat) => `GRANT ${i} SPEND: up to ${per} each ${period}${seat ? `, at most ${seat} in one visit` : ""}. Your representative keeps this period total across places; each place checks only its own visit.`,
    grantNoSpend: (i) => `GRANT ${i} SPEND: nothing.`,
    grantWhereOnly: (i, l) => `GRANT ${i} WHERE: only at ${l}.`, grantWhereAny: (i) => `GRANT ${i} WHERE: any place of those kinds.`,
    qGrantNote: (i) => `your note on grant ${i}`,
    allowanceValid: (a, b, u) => `VALID: ${a} until ${b}. Places check for a withdrawal at ${u ?? "(not stated)"}.`,
    qAllowance: "the allowance's shown_to_owner text",
    // door policies
    doorLabel: "The rules for your own door",
    doorWhat: (rid, pid) => `WHAT: the rules the key ${rid} follows when it keeps your door (policy ${pid}).`,
    whoMay: (c, intro, n, paid) => `WHO MAY PRESENT: ${c}; introductions ${intro ?? "not stated"}; up to ${n ?? "?"} uninvited brands a month; paid introductions ${paid ?? "not stated"}.`,
    trusted: (l) => `TRUSTED INTRODUCERS: ${l}.`,
    listed: (y, own) => `LISTED PUBLICLY: ${y ? "yes" : "no"}. VISITORS USING YOUR OWN NAME: ${own ?? "refuse (default)"}.`,
    privatePart: (d) => `PRIVATE PART (seen only by your representative, never by brands; signed as ${d}): listed below as private.*.`,
    validIssued: (a, b, i) => `VALID: ${a} until ${b}${i ? `, issued ${i}` : ""}.`,
    qPolicy: "the policy's shown_to_owner text",
    // owner links and withdrawals
    linkLabel: "Telling one place that two of your identities are you",
    linkWhat: (lid, aud, owners) => `WHAT: link ${lid} tells ${aud} (only that place) that ${owners} are the same person.`,
    qLink: "the link's purpose text",
    revStandbyLabel: "A standby withdrawal of a card (kept for later)", revLabel: "Withdrawing a card",
    revWhat: (cid, dig, who) => `WHAT: withdraws card ${cid}${dig ? ` (${dig})` : ""} of the owner ${who}. Every open visit under it ends where it is delivered.`,
    revStandby: (t) => `STANDBY: nothing happens now; anyone holding this slip can deliver it later, so keep it safe. Dated ${t}.`, revNow: (t) => `NOW: dated ${t}.`,
    reason: (r) => `REASON: ${r}.`,
    unknownLabel: "An item of a kind this page doesn't recognize",
    unknownWhat: "WHAT: this page doesn't recognize this kind of item. Every field is listed below as it is; sign only if you understand all of it.",
    mixedLabel: "An item this page won't sign (mixed kinds)", mixedWhat: "WHAT: this item carries fields of more than one kind of item; the page won't sign it.",
    // the listing of every other field
    empty: "(empty)", textBelow: "(text, shown below as a quote)", qField: (p) => `the item's field ${p}`,
    amounts: (xs) => `AMOUNTS IN THIS ITEM: ${xs.map(([w, m]) => `${m} (${w || "the item"})`).join("; ")}.`,
    // host cards
    hostLabel: "The Shōkai host card for your door",
    hostKind: "KIND: a Shōkai host card. This key becomes the host representative that keeps your door: it welcomes visiting representatives and admits them with a pass.",
    hostPlace: (entry, who) => `PLACE: the door at ${entry ?? "(not stated)"}, for ${who}.`,
    listing: (d) => `LISTING: ${d}.`, serves: (a, d) => `SERVES: ${a}. DUTIES: ${d}.`,
    orgApproval: (n, r, aid, t) => `APPROVED FOR THE ORGANIZATION BY: ${n ?? "?"} (${r ?? "?"})${aid ? `, ${aid}` : ""}, ${t}.`, approvalRecord: (r) => `APPROVAL RECORD: ${r}.`,
    qHostSummary: "the summary written on the Shōkai host card",
    house: (d) => `HOUSE: ${d}, checked: it is the digest of the house config below with you as its owner. Your signature covers every rule and every word of the leaflet.`,
    houseFor: (l) => `HOUSE RULES: visiting representatives may come for ${l}.`,
    houseAction: (a, level, purposes, cap, asks) => `HOUSE RULES: ${a}: ${level}, for ${purposes}${cap !== undefined ? `, spends up to ${cap ?? "(no cap stated)"} per pass` : ""}${asks ? `, asks for ${asks}` : ""}.`,
    houseIntro: (req, who, hold, ttl) => `HOUSE RULES: introductions ${req ? `required for ${req}` : "welcome, never required"}; introducers counted: ${who}${hold ? `; purchases held up to ${hold} s for the visitor's owner` : ""}${ttl ? `; passes last at most ${ttl} s` : ""}.`,
    anyone: "anyone",
    leaflet: (u) => `LEAFLET: agents without a Shōkai visitor card receive the text quoted below, and the page ${u}.`,
    qAbout: (loc) => `the leaflet: About this place (${loc}), written for your place`, qHow: (loc) => `the leaflet: the shared Shōkai text (${loc})`,
    qHouseField: (p) => `the house config's field ${p}`, quotedBelow: " (text, quoted below)",
    // the one-purchase raise (SIGNING.md §8)
    raiseNoContext: "a one-purchase raise (a mandate with supersedes.hold) must carry its `raise` context (the LimitRequest, the current mandate, the ledger figure and the held act); otherwise the page can't check the place's figures",
    raiseNoMandate: "raise.current_mandate.payload: the mandate the owner signed is missing",
    raiseMissing: `${EMM}A figure is missing or not an amount. ${ESAFE}`,
    raiseCurrency: `${EMM}They are not all in the mandate's currency. ${ESAFE}`,
    raiseLimit: (a, b) => `${EMM}The site's limit: ${a}; the limit you signed: ${b}. ${ESAFE}`,
    raiseCurrent: (a, b) => `${EMM}The site's figure for already paid or held: ${a}; your representative agent's record: ${b}. ${ESAFE}`,
    raiseAct: (a, b) => `${EMM}The site's figure for this purchase (total minus already paid or held): ${a}; the held purchase: ${b}. ${ESAFE}`,
    raiseNotAbove: (a, b) => `${EMM}The site's total: ${a}; your limit: ${b}. The total isn't above your limit, so there is nothing to raise. ${ESAFE}`,
    raiseMax: (a, b) => `the mandate's max_amount (${a}) isn't the proposed total (${b}); the page offers exactly that, never more`,
    raiseExpiry: (a, b) => `the mandate's expires_at (${a ?? "missing"}) is later than the hold's (${b ?? "missing"})`,
    raiseHoldId: (a, b) => `supersedes.hold.hold_id (${a ?? "missing"}) isn't the held purchase's (${b ?? "missing"})`,
    raiseActDigest: "supersedes.hold.act_digest isn't the digest of the held act",
    raiseSupersedes: "supersedes doesn't name the mandate you signed (its id and digest)",
    raiseSame: "the raise isn't for the same Shōkai visitor card, representative agent and owner as the mandate you signed",
    raiseAllowance: "a one-purchase raise is signed by you alone; it never sits under an allowance",
    raisePlace: "the raise names a site other than the one holding the purchase",
    raiseShown: "shown_to_owner isn't the text this page shows; leave it out and the page writes it (SIGNING.md §8 item 7)",
    raiseText: (place, tool, amt, limit, current, total, dl) => `${place} is holding one purchase (${tool}, ${amt}). Your limit for this request is ${limit}, and ${current} is already paid or held. `
      + `With this purchase the total is ${total}, so approving raises your limit to ${total} for this one purchase only. Other purchases, at this site or any other, keep their limits. `
      + `This approval lapses when the hold ends. If you don't approve by ${dl}, it is automatically declined.`,
    raiseHeadline: (act) => `Approve this purchase (${act}) only?`,
    raiseWhy: (place, act) => `Your representative agent (the AI agent that buys and acts for you) is holding a purchase of ${act} at ${place}. It is above the limit you set, so it needs your approval.`,
    raiseTableTitle: "The purchase and your limit", raiseRows: ["Your normal limit", "Already paid or held", "This purchase", "Total including this purchase"],
    raiseTableNote: "These amounts were checked against your mandate, your representative agent's record and the held purchase.",
    raiseScope: (act, total) => [`You are approving this one purchase of ${act}.`, `The total of ${total} includes what was already used; it is not a new purchase of ${total}.`, "This approval doesn't apply to any other purchase, action or site."],
    raiseMerchantTitle: "Seller", raiseSite: (place) => `Site: ${place}`, raiseStoreName: (n) => `Store name the site gives: ${n} (not verified)`,
    raiseWarning: "The store name hasn't been verified. If you don't recognize it, don't approve.",
    raiseExpiryTitle: "Approval deadline", raiseExpiryLine: (dl) => `By ${dl}`, raiseExpiryNotes: ["This approval lapses when the hold ends.", "If you don't approve by the deadline, it is automatically declined."],
    raiseSignedTitle: "What you sign with your passkey", raiseApprove: "Approve this purchase only", raiseDecline: "Don't approve",
    raiseAggregate: (max) => `SPEND: at most ${max} in total under this mandate, for the one held purchase only; it can't be used for any other purchase.`,
    raiseTool: (tool) => `THIS ACTION: ${tool}.`, raiseHold: (h) => `HOLD: ${h}.`, raiseActId: (a) => `ACT DIGEST: ${a}.`,
  },
  ja: {
    lang: "ja",
    money: (m) => isMoney(m) ? jaMoney(m, false) : "（金額なし）", cell: (m) => isMoney(m) ? jaMoney(m, true) : "（金額なし）",
    when: (t, tz) => jaDate(t, tz || "Asia/Tokyo") ?? (typeof t === "string" ? t : "記載なし"),
    deadline: (t, tz) => jaDate(t, tz) ?? "（有効な期限がありません）",
    list: (a) => L(a)?.join("、") ?? "なし",
    purpose: (c) => JA_PURPOSES[c] ?? c, purposeCode: (c) => `利用目的コード：${c ?? "記載なし"}`,
    and: "と", notStated: "記載なし", you: "あなた（このパスキー）", notYours: "。注意：このパスキーの鍵ではありません",
    itemTitle: (i, n, label) => `${i} / ${n} ・ ${label}`,
    fromSupplier: "申請を作成した人（記載者・内容は未確認）",
    details: "詳細",
    cardLabel: "代理エージェントのShōkai訪問者カード",
    cardWhat: (cid, proto, rid, name) => `内容：この鍵を、あなたに代わって購入などの操作を行うAIエージェント（代理エージェント）として登録する${name}です（${cid}、形式 ${proto ?? "記載なし"}）。代理エージェント：${rid}`,
    cardName: (k) => k === "host" ? "Shōkaiホストカード" : "Shōkai訪問者カード",
    repKey: (k, alg, pub) => `代理エージェントの鍵：${k}（${alg ?? "方式の記載なし"}、公開鍵 ${pub ?? "記載なし"}）`,
    keyMismatch: "注意：Shōkai訪問者カードの representative_id と鍵が一致しません。",
    purposes: (l) => `利用目的：${l}`, actions: (l) => `許可される操作：${l}`,
    cardOwner: (who, kind) => `権限の所有者：${who}（${kind ?? "種別の記載なし"}）`,
    boundTo: (rp, method, who) => `結び付け：${rp ?? "サイトの記載なし"} のパスキー（方式 ${method ?? "記載なし"}）、所有者 ${who}`,
    chatKey: (k) => `チャットの鍵：${k}。この鍵だけで、このShōkai訪問者カードについて「チャットで『はい』と答えた」という承認に署名できます（SPEC §8.1）。お使いのチャットアプリの鍵である場合に限り、署名してください。`,
    valid: (a, b) => `有効期間：${a}〜${b}`,
    withdrawals: (u) => `取り消しの確認先：各サイトは ${u} で確認できます。`,
    standing: (tier, l) => `立場：${tier ?? "記載なし"}。言語：${l}`,
    qCardName: "Shōkai訪問者カードに書かれた名前（自己申告・未確認）", qRole: "Shōkai訪問者カードに書かれた役割",
    visitorKind: "種類：Shōkai訪問者カード（代理エージェントが、あなたに代わって各サイトを利用します）。",
    mandateSpend: (max) => `${max}まで支払える権限の委任設定（委任状）`, mandateNoSpend: "操作の権限の委任設定（委任状・支払いなし）",
    mandateBrowseOnly: "閲覧のみの委任設定（委任状・支払いなし）",
    raiseRefused: "承認手続きを開始できない購入（金額が一致しません）",
    raiseLabel: (act) => `今回の購入（${act}）の承認`,
    supersedes: (mid, d) => `置き換える委任状：${mid}（${d}）`,
    mandateWhat: (mid, cid, rid) => `内容：権限の委任設定（委任状 ${mid}）です。Shōkai訪問者カード ${cid} から、代理エージェントの鍵 ${rid} に付与します。`,
    owner: (who) => `権限の所有者：${who}`,
    otherOwner: "注意：この委任状には、このパスキーではない別の所有者の鍵が書かれています。",
    purposeActions: (c, l) => `利用目的：${c ?? "記載なし"}。許可される操作：${l}`,
    spendNone: "支払い：なし（max_amount がないため、支払いはできません）。",
    spendPerOp: (max, s) => `支払い：1回の操作につき${max}まで、1回の取引で${s}まで。`,
    spendTotal: (max) => `支払い：この委任状で行うすべての取引の合計で${max}まで。`,
    maxOps: (n) => `操作は${n}回まで`, ratePerHour: (n) => `1時間に${n}回まで`, maxSession: (n) => `1回の利用は${n}秒まで`, dataShared: (l) => `共有するデータ：${l}`,
    otherLimits: (xs) => `その他の制限：${xs.join("、")}`,
    whereOnly: (l) => `利用できるサイト：${l}`, whereAny: "利用できるサイト：指定なし。サイトが指定されていないため、受け入れるサイトであればどこでも使えます。",
    issued: (t) => `発行日時：${t}`, underAllowance: (a) => `継続利用枠の範囲内：${a}`,
    qPurpose: "委任状に書かれた目的の説明",
    allowanceLabel: "継続利用枠（この範囲内では、代理エージェントがあなたに確認せずに操作します）",
    allowanceWhat: (aid, cid, rid) => `内容：Shōkai訪問者カード ${cid} の継続利用枠（${aid}）です。この範囲内では、代理エージェントの鍵 ${rid} があなたに確認せずに操作します。`,
    grant: (i, p, c, a) => `許可 ${i}：利用目的 ${p}、サイトの種類 ${c}、許可される操作 ${a}`,
    period: (p) => ({ P1D: "1日", P7D: "1週間", P1M: "1か月" })[p] ?? p,
    grantSpend: (i, per, period, seat) => `許可 ${i} の支払い：${period}ごとに${per}まで${seat ? `、1回の取引で${seat}まで` : ""}。期間ごとの合計は代理エージェントがサイトをまたいで管理し、各サイトが確認するのはそのサイトでの取引です。`,
    grantNoSpend: (i) => `許可 ${i} の支払い：なし`,
    grantWhereOnly: (i, l) => `許可 ${i} の利用できるサイト：${l}`, grantWhereAny: (i) => `許可 ${i} の利用できるサイト：上記の種類のサイトであればどこでも`,
    qGrantNote: (i) => `許可 ${i} についてのあなたのメモ`,
    allowanceValid: (a, b, u) => `有効期間：${a}〜${b}。各サイトは ${u ?? "（記載なし）"} で取り消しを確認します。`,
    qAllowance: "継続利用枠の shown_to_owner の文章",
    doorLabel: "あなたの入口のルール",
    doorWhat: (rid, pid) => `内容：鍵 ${rid} があなたの入口を管理するときに従うルール（ポリシー ${pid}）です。`,
    whoMay: (c, intro, n, paid) => `受け付ける相手：${c}。紹介：${intro ?? "記載なし"}。招待のないブランド：月${n ?? "?"}件まで。有料の紹介：${paid ?? "記載なし"}`,
    trusted: (l) => `信頼する紹介者：${l}`,
    listed: (y, own) => `一般に公開：${y ? "する" : "しない"}。あなたの名前を名乗る相手：${own ?? "断る（初期設定）"}`,
    privatePart: (d) => `非公開の部分（代理エージェントが参照し、ブランドには見せません。${d} として署名）：下の private.* に表示しています。`,
    validIssued: (a, b, i) => `有効期間：${a}〜${b}${i ? `、発行日時 ${i}` : ""}`,
    qPolicy: "ポリシーの shown_to_owner の文章",
    linkLabel: "あなたの2つの身元が同じ本人であることを、1つのサイトに伝える",
    linkWhat: (lid, aud, owners) => `内容：リンク ${lid} は、${aud}（このサイトに限ります）に、${owners} が同じ人物であることを伝えます。`,
    qLink: "リンクの目的の説明",
    revStandbyLabel: "Shōkai訪問者カードの取り消し（予備として保管）", revLabel: "Shōkai訪問者カードの取り消し",
    revWhat: (cid, dig, who) => `内容：所有者 ${who} のShōkai訪問者カード ${cid}${dig ? `（${dig}）` : ""} を取り消します。届けたサイトでは、このShōkai訪問者カードによる利用はすべて終了します。`,
    revStandby: (t) => `予備：今は何も起きません。この控えを持っている人はだれでも後で届けられるため、大切に保管してください。日付：${t}`, revNow: (t) => `すぐに有効：日付 ${t}`,
    reason: (r) => `理由：${r}`,
    unknownLabel: "このページでは種類を判別できない項目",
    unknownWhat: "内容：このページではこの種類の項目を判別できません。下にすべての項目をそのまま表示しています。すべて理解できる場合に限り、署名してください。",
    mixedLabel: "このページでは署名できない項目（種類が混在）", mixedWhat: "内容：この項目には複数の種類の項目が混ざっているため、このページでは署名できません。",
    empty: "（空）", textBelow: "（文章。下に引用として表示）", qField: (p) => `項目のフィールド ${p}`,
    amounts: (xs) => `この項目に含まれる金額：${xs.map(([w, m]) => `${m}（${w || "項目"}）`).join("、")}`,
    hostLabel: "あなたの入口のShōkaiホストカード",
    hostKind: "種類：Shōkaiホストカードです。この鍵が、あなたの入口を管理するホスト側の代理エージェントになります。訪れた代理エージェントを迎え、パスを渡して受け入れます。",
    hostPlace: (entry, who) => `入口：${entry ?? "（記載なし）"}。所有者：${who}`,
    listing: (d) => `掲載情報：${d}`, serves: (a, d) => `提供する操作：${a}。務め：${d}`,
    orgApproval: (n, r, aid, t) => `組織としての承認者：${n ?? "?"}（${r ?? "?"}）${aid ? `、${aid}` : ""}、${t}`, approvalRecord: (r) => `承認の記録：${r}`,
    qHostSummary: "Shōkaiホストカードに書かれた要約",
    house: (d) => `ハウス設定：${d}。確認済み：あなたを所有者とする下のハウス設定のダイジェストです。あなたの署名は、すべてのルールと案内文のすべての言葉に及びます。`,
    houseFor: (l) => `ハウスのルール：訪れる代理エージェントの利用目的：${l}`,
    houseAction: (a, level, purposes, cap, asks) => `ハウスのルール：${a}：${level}、利用目的 ${purposes}${cap !== undefined ? `、1つのパスにつき${cap ?? "（上限の記載なし）"}まで支払い` : ""}${asks ? `、${asks} の提供を求めます` : ""}`,
    houseIntro: (req, who, hold, ttl) => `ハウスのルール：紹介は${req ? `${req} に必要です` : "歓迎しますが、必須ではありません"}。数に入れる紹介者：${who}${hold ? `。購入は相手の所有者の承認のために最大${hold}秒保留します` : ""}${ttl ? `。パスの有効時間は最長${ttl}秒です` : ""}`,
    anyone: "だれでも",
    leaflet: (u) => `案内文：Shōkai訪問者カードを持たないエージェントには、下に引用した文章とページ ${u} が届きます。`,
    qAbout: (loc) => `案内文：このサイトについて（${loc}）。あなたのために書かれたもの`, qHow: (loc) => `案内文：Shōkai共通の文章（${loc}）`,
    qHouseField: (p) => `ハウス設定のフィールド ${p}`, quotedBelow: "（文章。下に引用）",
    raiseNoContext: "1回限りの利用上限の引き上げ（supersedes.hold のある委任状）には `raise` の情報（LimitRequest、現在の委任状、記録上の金額、保留中の操作）が必要です。ないと、このページでは金額を確認できません",
    raiseNoMandate: "raise.current_mandate.payload：所有者が署名した委任状がありません",
    raiseMissing: `${MM}金額が記載されていないか、金額の形式ではありません。${SAFE}`,
    raiseCurrency: `${MM}すべての金額が委任状と同じ通貨ではありません。${SAFE}`,
    raiseLimit: (a, b) => `${MM}サイトが示した利用上限：${a}、あなたが署名した利用上限：${b}。${SAFE}`,
    raiseCurrent: (a, b) => `${MM}サイトが示した支払い済み・保留中の金額：${a}、代理エージェントの記録：${b}。${SAFE}`,
    raiseAct: (a, b) => `${MM}サイトが示した今回の購入額（合計からの差額）：${a}、保留中の購入の金額：${b}。${SAFE}`,
    raiseNotAbove: (a, b) => `${MM}サイトが示した合計：${a}、あなたの利用上限：${b}。合計が利用上限を超えていないため、引き上げる必要がありません。${SAFE}`,
    raiseMax: (a, b) => `委任状の max_amount（${a}）が、サイトが示した合計（${b}）と異なります。このページが示すのはその金額ちょうどで、それを超えることはありません`,
    raiseExpiry: (a, b) => `委任状の expires_at（${a ?? "なし"}）が保留の期限（${b ?? "なし"}）より後になっています`,
    raiseHoldId: (a, b) => `supersedes.hold.hold_id（${a ?? "なし"}）が保留中の購入のもの（${b ?? "なし"}）と異なります`,
    raiseActDigest: "supersedes.hold.act_digest が保留中の操作のダイジェストではありません",
    raiseSupersedes: "supersedes が、あなたが署名した委任状（ID とダイジェスト）を指していません",
    raiseSame: "この引き上げは、あなたが署名した委任状と同じShōkai訪問者カード・代理エージェント・所有者のためのものではありません",
    raiseAllowance: "1回限りの利用上限の引き上げは、あなた自身の署名で行うもので、継続利用枠の範囲には入りません",
    raisePlace: "この引き上げには、購入を保留しているサイトとは別のサイトが書かれています",
    raiseShown: "shown_to_owner がこのページの表示する文章と異なります。省略すると、このページが書き入れます（SIGNING.md §8 第7項）",
    raiseText: (place, tool, amt, limit, current, total, dl) => `${place}で、購入1件（${tool}、${amt}）が保留中です。この依頼であなたが許可した利用上限は${limit}で、すでに${current}が支払い済みまたは保留中です。`
      + `この購入を含めると合計${total}になるため、承認すると、この購入1件に限り利用上限が${total}まで引き上げられます。このサイトでも他のサイトでも、ほかの購入の利用上限は変わりません。`
      + `保留が終了すると、この承認も失効します。${dl}までに承認しなければ、自動的に不承認となります。`,
    // the decision-first raise screen (SIGNING.md §8)
    raiseHeadline: (act) => `今回の購入（${act}）だけを承認しますか？`,
    raiseWhy: (place, act) => `あなたに代わって購入などの操作を行うAIエージェント（代理エージェント）が、${place}で${act}の購入を保留しています。設定された利用上限を超えるため、あなたの承認が必要です。`,
    raiseTableTitle: "購入金額と利用上限", raiseRows: ["通常の利用上限", "支払い済み・保留中の金額", "今回の購入", "今回の購入を含む合計"],
    raiseTableNote: "金額は、権限の委任設定（委任状）、代理エージェントの記録、保留中の購入情報と照合済みです。",
    raiseScope: (act, total) => [`今回承認するのは、${act}の購入1件です。`, `合計の${total}は、これまでの利用額を含む金額です。新たに${total}の購入を承認するものではありません。`, "この承認は、ほかの購入・操作・サイトには適用されません。"],
    raiseMerchantTitle: "購入先", raiseSite: (place) => `接続先のサイト：${place}`, raiseStoreName: (n) => `サイトが申告している店舗名：${n}（未確認）`,
    raiseWarning: "店舗名が正しいかどうかは確認できていません。心当たりがない場合は承認しないでください。",
    raiseExpiryTitle: "承認の期限", raiseExpiryLine: (dl) => `${dl}まで`, raiseExpiryNotes: ["保留が終了すると、この承認も失効します。", "期限までに承認しなければ、自動的に不承認となります。"],
    raiseSignedTitle: "パスキーで署名する承認内容", raiseApprove: "今回の購入だけを承認する", raiseDecline: "承認しない",
    raiseAggregate: (max) => `この委任状で行う取引の合計上限：${max}（保留中の今回の購入1件にのみ適用されます。ほかの購入には使えません）`,
    raiseTool: (tool) => `今回の操作：${tool}`, raiseHold: (h) => `対象の保留：${h}`, raiseActId: (a) => `操作の識別値：${a}`,
  }
};
export const textFor = (lang) => TEXT[lang] ?? TEXT.en;
