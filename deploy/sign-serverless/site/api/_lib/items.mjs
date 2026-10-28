// Items for the reference signing page: a JSON file of payload templates the owner approves (one tap, or one by one).
// An allowance item also carries its `grants` (the page checks them against grant_digests and shows them).
// In any string, "$OWNER_DID", "$RP_ID", "$NOW", "$IN_7D" and "$IN_30D" are filled in when the owner's passkey exists
// (the owner DID is only known then), and the items are frozen so every digest is stable while the owner reads them.
import { digestOf } from "./webauthn.mjs";
import { describe } from "./describe.mjs";
export const iso = (t = Date.now()) => new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
const DAY = 86400e3;
export function checkItems(s) {
  const p = [];
  if (!s || typeof s.owner_display_name !== "string" || !s.owner_display_name) p.push("owner_display_name: a name for the passkey prompt");
  if (!Array.isArray(s?.items) || !s.items.length || s.items.length > 16) p.push("items: 1 to 16 items");
  for (const [i, it] of (s?.items ?? []).entries()) {
    if (!/^[a-z0-9-]{1,40}$/.test(it?.name ?? "")) p.push(`items[${i}].name: lowercase letters, digits and dashes`);
    if (typeof it?.title !== "string" || !Array.isArray(it?.summary) || !it.summary.length) p.push(`items[${i}]: a title and a plain-words summary (one line per fact)`);
    if (!it?.payload || typeof it.payload !== "object") p.push(`items[${i}].payload: the object the owner signs`);
  }
  if (new Set((s?.items ?? []).map((x) => x?.name)).size !== (s?.items ?? []).length) p.push("items: names must be unique");
  // Every item must be one the page can show in full from its machine fields (SIGNING.md §2 item 3), checked with stand-in values.
  if (!p.length) for (const it of buildItems(s, "did:jwk:check", "check.invalid")) p.push(...it.problems.map((x) => `${it.name}: ${x}`));
  return p;
}
export function buildItems(s, ownerDid, rpId, now = Date.now()) {
  const vars = { $OWNER_DID: ownerDid, $RP_ID: rpId, $NOW: iso(now), $IN_7D: iso(now + 7 * DAY), $IN_30D: iso(now + 30 * DAY) };
  const fill = (v) => typeof v === "string" ? v.replace(/\$(OWNER_DID|RP_ID|NOW|IN_7D|IN_30D)\b/g, (m) => vars[m]) : Array.isArray(v) ? v.map(fill)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  // The shown title and facts come from describe() (the payload's machine fields). The supplier's own title and summary are kept
  // only as quotes, marked on the page as written by whoever prepared the item.
  return s.items.map((it, i) => { const payload = fill(it.payload); const digest = digestOf(payload);
    const d = describe(payload, { ownerDid, grants: it.grants ? fill(it.grants) : undefined, private: it.private ? fill(it.private) : undefined });
    const quoted = [{ from: "whoever prepared this item (not checked by this page)", text: [it.title, ...fill(it.summary)].join("\n") }, ...d.quotes];
    return { name: it.name, title: `${i + 1} of ${s.items.length} · ${d.label}`, kind: d.kind, facts: d.facts, quoted, own_tap: d.own_tap, problems: d.problems,
      payload, digest, digest_short: digest.slice(8, 20) }; });
}
