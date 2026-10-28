const $ = (id) => document.getElementById(id);
const b64uToBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const bufToB64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const api = async (p, body) => { const r = await fetch("api/" + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
const say = (t, cls) => { const s = $("status"); s.textContent = t; s.className = cls || ""; };
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const li = (t) => el("li", t);
// An item as the page shows it: the facts (built by the server from the item's machine fields) first; then anything written by
// someone else, each marked as a quote with who wrote it. Everything is set as text, never as markup.
const itemView = (p) => {
  const out = [el("ul", null, "facts")]; out[0].replaceChildren(...p.facts.map(li));
  for (const q of p.quoted || []) { const b = el("blockquote", null, "quote"); b.append(el("p", "Written by " + q.from + ":", "quote__from"), el("p", q.text, "quote__text")); out.push(b); }
  out.push(el("p", "Fingerprint: " + p.digest_short + "…", "small"));
  return out;
};
let current = null, pending = [], oneByOne = false, batchable = [];
async function refresh() {
  const st = await api("state"); current = st.current; pending = st.pending || [];
  $("foot").textContent = "Passkey site: " + st.rp_id;
  // Items that can spend money (own_tap) never join one tap: they come after, each with its own tap (SIGNING.md §3).
  batchable = pending.filter((p) => !p.own_tap);
  const batch = st.registered && !oneByOne && batchable.length >= 2 && batchable.length <= (st.max_batch || 16);
  $("step1").hidden = st.registered; $("stepAll").hidden = !batch; $("step2").hidden = batch || !st.registered || !st.current; $("done").hidden = !st.registered || !!st.current;
  if (batch) { $("allTitle").textContent = "Everything you're asked to sign in one tap (" + batchable.length + ")";
    $("allItems").replaceChildren(...batchable.map((p) => { const e = el("li"); e.replaceChildren(el("strong", p.title), ...itemView(p)); return e; }));
    const later = pending.length - batchable.length;
    $("ownTapNote").textContent = later ? later + " more item" + (later > 1 ? "s" : "") + " that can spend money come" + (later > 1 ? "" : "s") + " next, each with its own tap." : "";
    $("signAll").textContent = "Approve all " + batchable.length + " with one passkey tap"; $("signAll").disabled = false; }
  if (st.current) { $("title2").textContent = st.current.title; $("summary").replaceChildren(...itemView(st.current));
    $("sign").disabled = false; $("decline").disabled = false; }
  else if (st.registered) $("results").replaceChildren(...st.done.map((d) => li((d.decision === "approved" ? "✓ " : "✗ not signed: ") + d.title)));
  return st;
}
$("reg").onclick = async () => {
  try { $("reg").disabled = true; say("Waiting for your passkey…");
    const o = await api("register/options", {});
    const cred = await navigator.credentials.create({ publicKey: { challenge: b64uToBuf(o.challenge), rp: o.rp, user: { ...o.user, id: b64uToBuf(o.user.id) },
      pubKeyCredParams: o.pubKeyCredParams, authenticatorSelection: o.authenticatorSelection, attestation: o.attestation, timeout: o.timeout } });
    await api("register/verify", { clientDataJSON: bufToB64u(cred.response.clientDataJSON), attestationObject: bufToB64u(cred.response.attestationObject) });
    await refresh(); say("Passkey created ✓", "ok");
  } catch (e) { say("That didn't work: " + e.message + ". You can try again.", "err"); $("reg").disabled = false; }
};
$("sign").onclick = async () => {
  try { $("sign").disabled = true; $("decline").disabled = true; say("Waiting for your passkey…");
    const o = await api("sign/options", {});
    const a = await navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: b64uToBuf(c.id) })), userVerification: o.userVerification, timeout: o.timeout } });
    const r = await api("sign/verify", { credentialId: bufToB64u(a.rawId), clientDataJSON: bufToB64u(a.response.clientDataJSON), authenticatorData: bufToB64u(a.response.authenticatorData), signature: bufToB64u(a.response.signature) });
    await refresh(); say("Signed ✓ " + r.title, "ok");
  } catch (e) { say("That didn't work: " + e.message + ". Nothing was signed. You can try again.", "err"); $("sign").disabled = false; $("decline").disabled = false; }
};
$("signAll").onclick = async () => {
  try { $("signAll").disabled = true; say("Waiting for your passkey…");
    const o = await api("batch/options", { names: batchable.map((p) => p.name) });
    const a = await navigator.credentials.get({ publicKey: { challenge: b64uToBuf(o.challenge), rpId: o.rpId, allowCredentials: o.allowCredentials.map((c) => ({ type: c.type, id: b64uToBuf(c.id) })), userVerification: o.userVerification, timeout: o.timeout } });
    const r = await api("batch/verify", { credentialId: bufToB64u(a.rawId), clientDataJSON: bufToB64u(a.response.clientDataJSON), authenticatorData: bufToB64u(a.response.authenticatorData), signature: bufToB64u(a.response.signature) });
    await refresh(); say("Signed ✓ " + r.signed.length + " items with one tap", "ok");
  } catch (e) { say("That didn't work: " + e.message + ". Nothing was signed. You can try again, or go one by one.", "err"); $("signAll").disabled = false; }
};
$("oneByOne").onclick = async () => { oneByOne = true; await refresh(); };
$("decline").onclick = async () => {
  try { if (!current) return; await api("decline", { name: current.name }); const t = current.title; await refresh(); say("Skipped, not signed: " + t); }
  catch (e) { say("That didn't work: " + e.message, "err"); }
};
refresh().catch((e) => say("Couldn't load: " + e.message, "err"));
