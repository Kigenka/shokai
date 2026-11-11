// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Red team H4 (C277, provisional): black-box checks for SPEC §3.1.1 (site binding) and §6.11 (host budget), in the style of the
// C268 / C267 checks in v050.ts. Each skips (never passes) when the door gives it nothing to check, and fails on a clear violation.
import { add, na, msgs, pay, type Ctx } from "./runner.js";

const L = "v050" as const;
/** The fetch the checks use (a test passes a stub). */
export type Fetcher = (url: string, init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;
export type V050H4Opts = { fetcher?: Fetcher };
/** §3.1.1: a serialized WHATWG origin, https, host lowercase ASCII, default port omitted, no path, query, fragment or user info. */
const isOrigin = (s: unknown): s is string => { if (typeof s !== "string") return false; try { const u = new URL(s); return u.protocol === "https:" && u.origin === s; } catch { return false; } };
const originOf = (s: string) => { try { return new URL(s).origin; } catch { return undefined; } };
/** The first member named in `keys` anywhere in `x` (its path), or undefined. */
function findKey(x: unknown, keys: string[], path = "", depth = 0): string | undefined {
  if (!x || typeof x !== "object" || depth > 12) return undefined;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (keys.includes(k)) return p;
    const hit = findKey(v, keys, p, depth + 1); if (hit) return hit;
  }
  return undefined;
}

/** §3.1.1 v050.site_binding and §6.11 v050.host_budget_declared for the place in ctx (only when it states spec_ref 0.5.0). */
export async function v050H4Checks(ctx: Ctx, o: V050H4Opts = {}) {
  const place = ctx.place; if (!place) return;
  const f: Fetcher = o.fetcher ?? ((u, i) => fetch(u, i));
  const T1 = "a Shōkai host card naming place.site names it as an https origin, and that site's own /.well-known/shokai lists this entry exactly once (with the card's principal_id for a door on another origin)";
  const T2 = "the host budget (policy.host_budget, known_visitors) is never shown to a visitor: not in the listing, the house summary or the lobby briefing";
  const R1 = "§3.1.1, C257, C277", R2 = "§6.11, C277";
  if (place.spec_ref?.version !== "0.5.0") {
    add(ctx, { id: "v050.site_binding", level: L, ref: R1, title: T1, ok: "skip", detail: `spec_ref ${place.spec_ref?.version}` });
    add(ctx, { id: "v050.host_budget_declared", level: L, ref: R2, title: T2, ok: "skip", detail: `spec_ref ${place.spec_ref?.version}` });
    return;
  }
  const entry = String(place.entry ?? "").replace(/\/$/, "");
  const json = async (url: string, site = false): Promise<{ status: number; body: any; why?: string }> => {
    const r = await f(url, { redirect: site ? "manual" : "follow", signal: AbortSignal.timeout(site ? 5000 : 10000) });
    const body: any = await r.json().catch(() => null); return { status: r.status, body };
  };

  // (a) §3.1.1, C257: the site on the Shōkai host card, and the site's own word.
  const s = (ok: boolean | "skip" | ReturnType<typeof na>, detail: string) => add(ctx, { id: "v050.site_binding", level: L, ref: R1, title: T1, ok, detail });
  const hc = await json(entry + "/host-card.json").catch(() => null);
  const signed = !!hc && hc.status === 200 && Array.isArray(hc.body?.signatures) && hc.body.signatures.length > 0 && !!hc.body.payload;
  const cp: any = signed ? hc!.body.payload : undefined;
  const site: unknown = cp?.place?.site;
  if (!cp) s("skip", hc ? `no signed host card at <entry>/host-card.json (HTTP ${hc.status}); v050.host_card_served covers it` : "could not fetch <entry>/host-card.json");
  else if (site === undefined) s(na("class"), "ext-site-binding (provisional) not offered: the Shōkai host card names no place.site");
  else if (!isOrigin(site)) s(false, `place.site ${JSON.stringify(site)} isn't a serialized https origin (it names no site)`);
  else {
    const res: { status: number; body: any; why?: string } = await json(site + "/.well-known/shokai", true).catch((e: any) => ({ status: 0, body: null, why: String(e?.message ?? e) }));
    const items: any[] | undefined = res.status === 200 && res.body?.type === "door_pointer" && Array.isArray(res.body.places) ? res.body.places : undefined;
    if (!items) s("skip", res.status === 0 ? `could not read ${site}/.well-known/shokai (${res.why})` : `${site}/.well-known/shokai gave no DoorPointer with place items (HTTP ${res.status}); the app-proxy path isn't checked`);
    else {
      const hits = items.filter((x) => x?.entry === place.entry);
      const pid = cp.place?.principal_id; const cross = originOf(String(place.entry)) !== site;
      const problems = [
        hits.length !== 1 && `the site lists this entry ${hits.length} time(s), not exactly once`,
        pid !== place.principal_id && "the card's place.principal_id isn't the listed principal",
        hits.length === 1 && cross && hits[0]?.principal_id !== pid && `the door is on another origin and the site's item ${hits[0]?.principal_id ? "names another principal_id" : "carries no principal_id"}`,
      ].filter(Boolean);
      s(problems.length === 0, problems.join("; ") || `bound: ${site} lists ${place.entry} once${cross ? " with the card's principal_id" : ""}`);
    }
  }

  // (b) §6.11: the budget is never on the wire and never in the house summary.
  const sum = await json(entry + "/house-summary.json").catch(() => null);
  const lob: any = await f(String(place.entry), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify("Hello, what are the house rules?"), signal: AbortSignal.timeout(10000) })
    .then(async (r) => await r.json().catch(() => null)).catch(() => null);
  const brief = msgs(lob).map(pay).find((m: any) => m?.type === "lobby_briefing");
  const sources: [string, unknown][] = ([["the listing entry", place], ["the place listing", ctx.listing], ["the house summary", sum?.status === 200 ? sum.body : undefined], ["the lobby briefing", brief]] as [string, unknown][])
    .filter(([, v]) => !!v && typeof v === "object");
  const leaks = sources.map(([n, v]) => { const k = findKey(v, ["host_budget", "known_visitors"]); return k ? `${n} carries ${k}` : ""; }).filter(Boolean);
  const looked = sources.filter(([n]) => n === "the house summary" || n === "the lobby briefing").map(([n]) => n);
  add(ctx, { id: "v050.host_budget_declared", level: L, ref: R2, title: T2,
    ok: leaks.length ? false : looked.length ? true : "skip",
    detail: leaks.join("; ") || (looked.length ? `${looked.join(" and ")} carry no host budget` : "no house summary or lobby briefing to look at") });
}
