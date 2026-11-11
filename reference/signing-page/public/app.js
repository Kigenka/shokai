const $ = (id) => document.getElementById(id);
const b64uToBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const bufToB64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const api = async (p, body) => { const r = await fetch("api/" + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const say = (t, cls) => { const s = $("status"); s.textContent = t; s.className = cls || ""; };
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const li = (t) => el("li", t);
// SIGNING.md §7: the page's own words, in the owner's language. The server says which ("en" or "ja", from owner_language) in
// /api/state; the item facts come from the server already in that language. Everything is set as text, never as markup.
const STR = {
  en: {
    writtenBy: (f) => "Written by " + f + ":", fingerprint: (d) => "Fingerprint: " + d + "…", detailsLabel: "Details", approve: "Approve with my passkey", decline: "Don't approve", foot: (rp) => "Passkey site: " + rp,
    allTitle: (n) => "Everything you're asked to sign in one tap (" + n + ")",
    ownTapNote: (n) => n + " more item" + (n > 1 ? "s" : "") + " that can spend money come" + (n > 1 ? "" : "s") + " next, each with its own tap.",
    signAll: (n) => "Approve all " + n + " with one passkey tap", doneOk: "✓ ", doneNo: "✗ not signed: ",
    waiting: "Waiting for your passkey…", created: "Passkey created ✓", signed: (t) => "Signed ✓ " + t, signedAll: (n) => "Signed ✓ " + n + " items with one tap",
    failReg: (m) => "That didn't work: " + m + ". You can try again.", failSign: (m) => "That didn't work: " + m + ". Nothing was signed. You can try again.",
    failAll: (m) => "That didn't work: " + m + ". Nothing was signed. You can try again, or go one by one.", fail: (m) => "That didn't work: " + m,
    skipped: (t) => "Skipped, not signed: " + t, loadFail: (m) => "Couldn't load: " + m,
    langWarning: "This page shows everything in English only. If you don't read English well, don't sign here: ask for a signing page in your language.",
    browserLang: /^en(-|$)/i,
  },
  ja: {
    title: "パスキーで署名 · Shōkai", h1: "パスキーで署名",
    lead: "あなたに代わって購入などの操作を行うAIエージェント（代理エージェント）から、下の申請の承認を求められています。このページは各申請の内容を、申請そのものから書き出しています。ほかの人が書いた文章は引用として表示します。思っていたとおりの内容である場合に限り、承認してください。このページからだれかに何かが送られることはありません。",
    nSum: "この署名ページは、試験段階の簡易版です。", n1: "Shōkaiはまだ草案の段階で、試験中はKigenkaがこのページを運営しています。",
    n2: "パスキーはお使いのスマートフォンやパソコンの中に保存されたままです。Kigenkaがパスキーを見ることはなく、あなたの代わりに署名することもできません。",
    n3: (rp, days) => "パスキーは、作成したウェブアドレス（ここでは " + rp + "）でしか使えません。このアドレスは今後も使い続ける予定です。万一変更が必要になった場合は、少なくとも" + days + "日前にお知らせします。今お持ちのパスキーで新しい鍵への移行に署名し、代理エージェントを知っている場所が引き続きそれを認識できるようにする仕組みは計画中です（提案 P24、v0.4 向け）が、まだありません。その仕組みができるまで、アドレスを移すことはありません。",
    n4: "どちらの場合も、これまでに署名したものはすべて有効なままです。",
    n5: "このページを使う必要はありません。ご自分の署名ページや、ご自分の鍵で署名することもできます。", aboutLink: "このページについて（英語）",
    s1h: "まず、パスキーを作成してください", s1p: "お使いのスマートフォンやパソコンが、このページのパスキーを保存するよう案内します。Face ID や指紋の情報は端末の外に出ません。このページが保管するのは公開鍵の部分です。",
    reg: "パスキーを作成する", allTitle0: "署名を求められている申請", oneByOne: "1件ずつ確認する",
    batchNote: "Face ID や指紋の1回の認証で、上に表示した申請をすべて承認します。それ以外のものは承認しません。申請ごとに別々の署名が付くため、各サイトが受け取るのは自分あての申請です。お金を使う可能性がある申請は、必ず1件ずつ個別に認証します。上の内容に誤りがある場合は、1件ずつ確認して、その申請を承認しないでください。",
    sign: "パスキーで承認する", decline: "承認しない", step2Note: "承認した申請にのみ署名します。承認しなかった申請には署名されません。", notPurchase: "この署名は、承認した範囲内で代理エージェントが行動できるようにするものです。制限内の購入は、追加の承認なしで進むことがあります。制限を超える場合は、持ち主の承認待ちになることがあります。署名は支払い・決済そのものではありません。", detailsLabel: "詳細", approve: "パスキーで承認する",
    doneH: "すべて完了しました", doneNote: "署名しました。パスキーはお手元に残ります。このページは試験段階です。アドレスが変わる場合は、事前にお知らせします。", close: "このページは閉じてかまいません。",
    writtenBy: (f) => f + "が書いた文章：", fingerprint: (d) => "確認用コード：" + d + "…", foot: (rp) => "パスキーのサイト：" + rp,
    allTitle: (n) => "1回の認証で署名する申請（" + n + "件）",
    ownTapNote: (n) => "お金を使う可能性がある申請があと" + n + "件あります。このあと1件ずつ個別に認証します。",
    signAll: (n) => n + "件すべてをパスキーの1回の認証で承認する", doneOk: "✓ ", doneNo: "✗ 承認しなかった申請（署名なし）：",
    waiting: "パスキーによる承認操作を待っています…", created: "パスキーを作成しました ✓", signed: (t) => "承認内容に署名しました ✓ " + t, signedAll: (n) => "1回の認証で" + n + "件の承認内容に署名しました ✓",
    failReg: (m) => "うまくいきませんでした：" + m + "。もう一度お試しください。", failSign: (m) => "うまくいきませんでした：" + m + "。何も署名されていません。もう一度お試しください。",
    failAll: (m) => "うまくいきませんでした：" + m + "。何も署名されていません。もう一度試すか、1件ずつ確認してください。", fail: (m) => "うまくいきませんでした：" + m,
    skipped: (t) => "承認しませんでした（署名なし）：" + t, loadFail: (m) => "読み込めませんでした：" + m,
    langWarning: "このページはすべて日本語で表示しています。日本語を十分に読めない場合は、ここで署名しないでください。お使いの言語の署名ページを依頼してください。",
    browserLang: /^ja(-|$)/i,
  },
};
let S = STR.en, langSet = false;
function setLanguage(st) {
  if (langSet) return; langSet = true;
  const lang = st.lang === "ja" ? "ja" : "en"; S = STR[lang]; document.documentElement.lang = lang;
  if (lang !== "en") {
    if (S.title) document.title = S.title;
    for (const e of document.querySelectorAll("[data-t]")) { const v = S[e.dataset.t]; if (typeof v === "string") e.textContent = v;
      else if (typeof v === "function") e.textContent = v(st.rp_id, st.notice?.days ?? 90); }
  }
  // When none of the browser's languages is the page's language, say so at the top instead of showing it silently, and tell
  // the owner not to sign what they can't read.
  if (!(navigator.languages?.length ? navigator.languages : [navigator.language || ""]).some((l) => S.browserLang.test(l))) {
    const w = el("p", S.langWarning, "quote"); w.id = "langWarning"; w.setAttribute("role", "alert"); document.querySelector("main")?.prepend(w);
  }
}
// An item as the page shows it (decision first): a one-purchase raise as its decision screen (the question with the amount,
// why, the figures, what it approves, the seller, the deadline and the signed text); any other item as its facts. Anything written
// by someone else is a marked quote. The technical identifiers and the fingerprint sit under a collapsed Details section: on the
// page, never hidden. Everything is set as text, never as markup.
const quote = (q) => { const b = el("blockquote", null, "quote"); b.append(el("p", S.writtenBy(q.from), "quote__from"), el("p", q.text, "quote__text")); return b; };
const ul = (xs, cls) => { const u = el("ul", null, cls); u.replaceChildren(...xs.map(li)); return u; };
const itemView = (p) => {
  const out = [], d = p.decision;
  if (d) {
    const tbl = el("table", null, "figures"); tbl.replaceChildren(...d.table.map(([k, v]) => { const tr = el("tr"); tr.append(el("th", k), el("td", v)); return tr; }));
    out.push(el("h3", d.headline, "headline"), el("p", d.why), el("h4", d.table_title), tbl, el("p", d.table_note, "small"), ul(d.scope, "scope"),
      el("h4", d.merchant_title), ul(d.merchant), el("p", d.warning, "warn"), el("h4", d.expiry_title), ul(d.expiry), el("h4", d.signed_title));
    const b = el("blockquote", null, "signed"); b.append(el("p", d.signed_text)); out.push(b);
  } else out.push(ul(p.main || p.facts, "facts"));
  for (const q of p.quoted || []) out.push(quote(q));
  const det = el("details", null, "details"); det.append(el("summary", p.details_label || S.detailsLabel), ul(p.details || [], "facts"), ...(p.detail_quoted || []).map(quote), el("p", S.fingerprint(p.digest_short), "small"));
  out.push(det);
  return out;
};
let current = null, pending = [], oneByOne = false, batchable = [];
async function refresh() {
  const st = await api("state"); setLanguage(st); current = st.current; pending = st.pending || [];
  $("foot").textContent = S.foot(st.rp_id);
  // Items that can spend money (own_tap) never join one tap: they come after, each with its own tap (SIGNING.md §3).
  batchable = pending.filter((p) => !p.own_tap);
  const batch = st.registered && !oneByOne && batchable.length >= 2 && batchable.length <= (st.max_batch || 16);
  $("step1").hidden = st.registered; $("stepAll").hidden = !batch; $("step2").hidden = batch || !st.registered || !st.current; $("done").hidden = !st.registered || !!st.current;
  if (batch) { $("allTitle").textContent = S.allTitle(batchable.length);
    $("allItems").replaceChildren(...batchable.map((p) => { const e = el("li"); e.replaceChildren(el("strong", p.title), ...itemView(p)); return e; }));
    const later = pending.length - batchable.length;
    $("ownTapNote").textContent = later ? S.ownTapNote(later) : "";
    $("signAll").textContent = S.signAll(batchable.length); $("signAll").disabled = false; }
  if (st.current) { $("title2").textContent = st.current.title; $("summary").replaceChildren(...itemView(st.current));
    $("sign").textContent = st.current.decision?.approve ?? S.approve; $("decline").textContent = st.current.decision?.decline ?? S.decline;
    $("sign").disabled = false; $("decline").disabled = false; }
  else if (st.registered) $("results").replaceChildren(...st.done.map((d) => li((d.decision === "approved" ? S.doneOk : S.doneNo) + d.title)));
  return st;
}
$("reg").onclick = async () => {
  try { $("reg").disabled = true; say(S.waiting);
    const o = await api("register/options", {});
    const cred = await navigator.credentials.create({ publicKey: { challenge: b64uToBuf(o.challenge), rp: o.rp, user: { ...o.user, id: b64uToBuf(o.user.id) },
      pubKeyCredParams: o.pubKeyCredParams, authenticatorSelection: o.authenticatorSelection, attestation: o.attestation, timeout: o.timeout } });
    await api("register/verify", { clientDataJSON: bufToB64u(cred.response.clientDataJSON), attestationObject: bufToB64u(cred.response.attestationObject) });
    await refresh(); say(S.created, "ok");
  } catch (e) { say(S.failReg(e.message), "err"); $("reg").disabled = false; }
};
$("sign").onclick = async () => {
  try { $("sign").disabled = true; $("decline").disabled = true; say(S.waiting);
    const o = await api("sign/options", {});
    const a = await navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: b64uToBuf(c.id) })), userVerification: o.userVerification, timeout: o.timeout } });
    const r = await api("sign/verify", { credentialId: bufToB64u(a.rawId), clientDataJSON: bufToB64u(a.response.clientDataJSON), authenticatorData: bufToB64u(a.response.authenticatorData), signature: bufToB64u(a.response.signature) });
    await refresh(); say(S.signed(r.title), "ok");
  } catch (e) { say(S.failSign(e.message), "err"); $("sign").disabled = false; $("decline").disabled = false; }
};
$("signAll").onclick = async () => {
  try { $("signAll").disabled = true; say(S.waiting);
    const o = await api("batch/options", { names: batchable.map((p) => p.name) });
    const a = await navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: b64uToBuf(c.id) })), userVerification: o.userVerification, timeout: o.timeout } });
    const r = await api("batch/verify", { credentialId: bufToB64u(a.rawId), clientDataJSON: bufToB64u(a.response.clientDataJSON), authenticatorData: bufToB64u(a.response.authenticatorData), signature: bufToB64u(a.response.signature) });
    await refresh(); say(S.signedAll(r.signed.length), "ok");
  } catch (e) { say(S.failAll(e.message), "err"); $("signAll").disabled = false; }
};
$("oneByOne").onclick = async () => { oneByOne = true; await refresh(); };
$("decline").onclick = async () => {
  try { if (!current) return; await api("decline", { name: current.name }); const t = current.title; await refresh(); say(S.skipped(t)); }
  catch (e) { say(S.fail(e.message), "err"); }
};
refresh().catch((e) => say(S.loadFail(e.message), "err"));
