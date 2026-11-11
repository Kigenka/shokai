// Items for the reference signing page: a JSON file of payload templates the owner approves (one tap, or one by one).
// An allowance item also carries its `grants` (the page checks them against grant_digests and shows them).
// In any string, "$OWNER_DID", "$RP_ID", "$NOW", "$IN_7D", "$IN_30D", "$IN_90D", "$IN_180D" and "$IN_365D" are filled in when the
// owner's passkey exists (the owner DID is only known then), and the items are frozen so every digest is stable while the owner
// reads them. v0.4.0: a Shōkai host card item carries its `house` ({name, display_name, policy}); "$HOUSE_DIGEST" is filled in
// with the digest of that house config and the owner's DID (SPEC §2.3), and the page shows the house rules and the leaflet.
import { digestOf } from "./webauthn.mjs";
import { describe } from "./describe.mjs";
import { raiseProblems, raiseText } from "./raise.mjs";
import { SUPPORTED_LANGUAGES, languageSupported, langOf, textFor } from "./i18n.mjs";
export { SUPPORTED_LANGUAGES, languageSupported, langOf };
export const iso = (t = Date.now()) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const DAY = 86400e3;
// SIGNING.md §7: this reference page words every item in English or Japanese (i18n.mjs), so it supports owners who read one of
// those and no one else. An items file may name the owner's language (`owner_language`, a BCP 47 tag such as "en-US", "ja" or
// "ja-JP"; English when absent); for any other language the page refuses to start, rather than show an owner words in a language
// they didn't ask for (§2 item 3).
/** The page's language for an items file: "en" or "ja" (call after checkItems). */
export const itemsLanguage = (s) => langOf(s?.owner_language) ?? "en";
export function checkItems(s) {
  const p = [];
  if (s?.owner_language !== undefined) {
    if (typeof s.owner_language !== "string" || !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(s.owner_language)) p.push("owner_language: a BCP 47 language tag, such as \"en-US\"");
    else if (!languageSupported(s.owner_language)) p.push(`owner_language "${s.owner_language}": this reference page shows items in English and Japanese only (SIGNING.md §7), so it can't show them in the owner's language (§2 item 3) and won't start; use a signing page that supports that language`);
  }
  if (!s || typeof s.owner_display_name !== "string" || !s.owner_display_name) p.push("owner_display_name: a name for the passkey prompt");
  if (!Array.isArray(s?.items) || !s.items.length || s.items.length > 16) p.push("items: 1 to 16 items");
  for (const [i, it] of (s?.items ?? []).entries()) {
    if (!/^[a-z0-9-]{1,40}$/.test(it?.name ?? "")) p.push(`items[${i}].name: lowercase letters, digits and dashes`);
    if (typeof it?.title !== "string" || !Array.isArray(it?.summary) || !it.summary.length) p.push(`items[${i}]: a title and a plain-words summary (one line per fact)`);
    if (!it?.payload || typeof it.payload !== "object") p.push(`items[${i}].payload: the object the owner signs`);
    if (it?.house !== undefined && (typeof it.house?.name !== "string" || typeof it.house?.display_name !== "string" || !it.house?.policy || typeof it.house.policy !== "object"))
      p.push(`items[${i}].house: a Shōkai host card's house config is { name, display_name, policy }`);
    if (it?.raise !== undefined && (!it.raise || typeof it.raise !== "object" || !it.raise.limit_request || !it.raise.current_mandate || !it.raise.held))
      p.push(`items[${i}].raise: a one-purchase raise carries { limit_request, current_mandate, ledger_current, held } (SIGNING.md §8)`);
  }
  if (new Set((s?.items ?? []).map((x) => x?.name)).size !== (s?.items ?? []).length) p.push("items: names must be unique");
  // Every item must be one the page can show in full from its machine fields (SIGNING.md §2 item 3), checked with stand-in values.
  if (!p.length) for (const it of buildItems(s, "did:jwk:check", "check.invalid")) p.push(...it.problems.map((x) => `${it.name}: ${x}`));
  return p;
}
export function buildItems(s, ownerDid, rpId, now = Date.now()) {
  const base = { $OWNER_DID: ownerDid, $RP_ID: rpId, $NOW: iso(now), $IN_7D: iso(now + 7 * DAY), $IN_30D: iso(now + 30 * DAY),
    $IN_90D: iso(now + 90 * DAY), $IN_180D: iso(now + 180 * DAY), $IN_365D: iso(now + 365 * DAY) };
  const filler = (vars) => { const fill = (v) => typeof v === "string" ? v.replace(/\$(OWNER_DID|RP_ID|NOW|IN_7D|IN_30D|IN_90D|IN_180D|IN_365D|HOUSE_DIGEST)\b/g, (m) => vars[m] ?? m) : Array.isArray(v) ? v.map(fill)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v; return fill; };
  const fill = filler(base);
  // The shown title and facts come from describe() (the payload's machine fields). The supplier's own title and summary are kept
  // only as quotes, marked on the page as written by whoever prepared the item.
  const lang = itemsLanguage(s), t = textFor(lang);
  return s.items.map((it, i) => {
    // v0.4.0 (§2.3): the house digest = digest(JCS({name, display_name, principal_id, policy})), the owner's DID as principal_id.
    const house = it.house ? fill(it.house) : undefined;
    const houseDigest = house ? digestOf({ name: house.name, display_name: house.display_name, principal_id: ownerDid, policy: house.policy }) : undefined;
    let payload = filler({ ...base, ...(houseDigest ? { $HOUSE_DIGEST: houseDigest } : {}) })(it.payload);
    // SIGNING.md §8 item 7: a raise's shown_to_owner is written by this page from what it shows, so the signed text is what the owner read.
    const raise = it.raise ? fill(it.raise) : undefined;
    if (raise && payload.shown_to_owner === undefined && !raiseProblems(payload, raise, lang).length) payload = { ...payload, shown_to_owner: { text: raiseText(payload, raise, lang), locale: lang === "ja" ? "ja-JP" : "en-US" } };
    const digest = digestOf(payload);
    const d = describe(payload, { ownerDid, grants: it.grants ? fill(it.grants) : undefined, private: it.private ? fill(it.private) : undefined, house, houseDigest, raise, lang });
    // a raise (decision first): the supplier's own words go under Details, beside the identifiers
    const supplier = { from: t.fromSupplier, text: [it.title, ...fill(it.summary)].join("\n") };
    const quoted = d.decision ? d.quotes : [supplier, ...d.quotes], detail_quoted = d.decision ? [supplier] : [];
    // Non-spend mandates: show a steward/visitor-supplied title when present (e.g. "Visitation at Kettle & Leaf (browse only)").
    // Spend items and cards keep the page-derived label so amounts and card facts cannot be replaced by supplier copy.
    const supplierTitle = typeof it.title === "string" ? it.title.trim() : "";
    const useSupplierTitle = d.kind === "mandate" && !d.own_tap && supplierTitle.length > 0 && supplierTitle.length <= 120;
    const shownLabel = useSupplierTitle ? supplierTitle : d.label;
    return { name: it.name, title: t.itemTitle(i + 1, s.items.length, shownLabel), kind: d.kind, facts: d.facts, main: d.main, details: d.details, decision: d.decision, details_label: t.details,
      quoted, detail_quoted, own_tap: d.own_tap, problems: d.problems, figures: d.figures,
      payload, digest, digest_short: digest.slice(8, 20) }; });
}
