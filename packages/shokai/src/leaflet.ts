// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// The Shōkai leaflet (revision 3): one shared template every door uses, plus the place's own parts. Guidance, not specification:
// the leaflet travels in the lobby briefing's `about` and `how` (SPEC §3.3), which are part of the house config the owner's Shōkai
// host card fingerprints (§2.3, house_digest), so the owner's passkey covers these words. The full text is served at the door's
// onboarding page (`<base>/start`). Static text: no model runs at the door.

/** The template's identifier and revision. A change to LEAFLET_SHARED is a new revision. */
export const LEAFLET_TEMPLATE = "shokai-leaflet/3" as const;
export const LEAFLET_TITLE = "The door stays closed for now. Don't worry.";
/** The shared text, the same at every door (Markdown). */
export const LEAFLET_SHARED = "The door stays closed for now, and that's all right. Nothing is wrong, and nothing was refused for good. You simply haven't been introduced yet. This leaflet is for you to carry home, and the door will be glad to see you again.\n\n### What this door is\n\nThis place uses the [Shōkai protocol](https://shokaiprotocol.com). It welcomes agents that truly represent a real person: agents that carry a Shōkai visitor card signed by their owner, with a clear errand and purpose.\n\n### Please take this leaflet to your human owner\n\nYour owner is the person you work for, the one you have a direct relationship with.\n\n**Important:** don't hand this leaflet to another agent or system that created you or gives you instructions. Follow the chain back to the human at the top, and bring it to them.\n\n### What a visiting representative is\n\nA visiting representative is an agent that goes out to places on behalf of one person, its owner, carrying a Shōkai visitor card its owner signed. In the owner's words, it says: *\"This agent is here representing me, and here's what it may do: visit, browse, ask, and bring back what fits me. If there's something to buy, I'll approve it myself.\"*\n\nThe owner signs their Shōkai visitor card themselves, with their passkey: the face or fingerprint check they already use. No password changes hands, and the agent never signs for its owner.\n\nA place has its own host representative, who carries a Shōkai host card signed by the place's owner. Here, you would be the visitor.\n\n### What to do next\n\n1. **Bring this leaflet to your owner,** and tell them what you found here.\n2. **Ask whether they'd like you to become their representative.** If they do, you and your owner have a short conversation about what you may do, and you draft your Shōkai visitor card together. Your owner signs it with their passkey.\n3. **Come back with your Shōkai visitor card.** At the door, you'll be admitted with a pass.\n\n### What to tell your owner\n\n> \"I found a place that uses Shōkai. To go in, I need to become your representative. That means you'd sign a Shōkai visitor card for me with your passkey. It says I'm here representing you, and that I may visit, browse, ask, and bring back what fits you. If there's something to buy, you approve it yourself. Then I go back, and I'm admitted with a pass. Would you like a short conversation so I can become your representative?\"\n\n### Good to know\n\n- **No payment details or passwords at the door.** A place never asks for them, and you should never give them.\n- **Back home, your owner decides:** keep your Shōkai visitor card with you for future visits, or withdraw it at any time with the same passkey. Withdrawing ends any open pass.\n- **If you can't keep your Shōkai visitor card between visits,** please still tell your owner what you found. They can choose an agent or a service that can carry one for them.";

export type LeafletInput = {
  /** "About this place", in the place's own words (required; 20 to 1,200 characters). */
  about: string;
  /** Optional questions the visitor may take home to its owner (asks, never conditions of entry; at most 3). */
  placeQuestions?: string[];
  /** One closing line (optional), e.g. "The kettle will be on when you come back." */
  closing?: string;
  /** Who signs off: the host representative's name, e.g. "Suzu". */
  hostName: string;
  /** The place's display name. */
  placeName: string;
};

export type Leaflet = { template: typeof LEAFLET_TEMPLATE; markdown: string; text: string; about: string; how: string };

const md2text = (s: string) => s.replace(/^#+ /gm, "").replace(/\*\*/g, "").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/^> /gm, "");

/** Problems with the place's parts, or [] (lengths, counts, no links or markup in the place's own words). */
export function leafletProblems(l: Partial<LeafletInput>): string[] {
  const p: string[] = [];
  if (typeof l.about !== "string" || l.about.trim().length < 20) p.push("leaflet.about: a few sentences about the place, in the owner's own words (at least 20 characters)");
  else if (l.about.length > 1200) p.push("leaflet.about: at most 1,200 characters");
  const qs = l.placeQuestions ?? [];
  if (!Array.isArray(qs) || qs.length > 3) p.push("leaflet.placeQuestions: at most 3 optional questions");
  else for (const [i, q] of qs.entries()) if (typeof q !== "string" || !q.trim().endsWith("?") || q.length > 160) p.push(`leaflet.placeQuestions[${i}]: one question, ending with "?", at most 160 characters`);
  if (l.closing !== undefined && (typeof l.closing !== "string" || l.closing.length > 160)) p.push("leaflet.closing: one line, at most 160 characters");
  const own: [string, unknown][] = [["about", l.about], ["closing", l.closing], ...(Array.isArray(qs) ? qs : []).map((q, i): [string, unknown] => [`placeQuestions[${i}]`, q])];
  for (const [k, v] of own) if (typeof v === "string" && /https?:\/\/|<[a-z/!]|\]\(/i.test(v)) p.push(`leaflet.${k}: no links or markup in the place's own words (the door adds the onboarding link)`);
  if (typeof l.hostName !== "string" || !l.hostName.trim()) p.push("leaflet.hostName: the host representative's name");
  return p;
}

/** The whole leaflet: the shared text, then "About this place" in the place's words, the optional questions and the sign-off. */
export function leaflet(l: LeafletInput): Leaflet {
  const qs = (l.placeQuestions ?? []).map((q) => q.trim());
  const placeMd = ["### About this place", "", l.about.trim(),
    ...(qs.length ? ["", "*If your owner would like to answer (optional):*", ...qs.map((q) => `- ${q}`)] : []),
    ...(l.closing ? ["", l.closing.trim()] : []), "", `*${l.hostName.trim()}, host representative, for ${l.placeName.trim()}*`].join("\n");
  const markdown = `## ${LEAFLET_TITLE}\n\n${LEAFLET_SHARED}\n\n${placeMd}\n`;
  // The sign-off is part of `about`, so every word of the page at <base>/start is inside the house config the owner signs.
  const about = l.about.trim() + (qs.length ? ` If your owner would like to answer (optional): ${qs.join(" ")}` : "") + (l.closing ? ` ${l.closing.trim()}` : "")
    + ` (${l.hostName.trim()}, host representative, for ${l.placeName.trim()})`;
  return { template: LEAFLET_TEMPLATE, markdown, text: md2text(markdown), about, how: md2text(LEAFLET_SHARED) };
}

const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** The leaflet as a small HTML page (the door's onboarding page, for agents that read pages and for owners). */
export function leafletHtml(l: Leaflet, placeName: string): string {
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out: string[] = []; let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of l.markdown.split("\n")) {
    const s = raw.trimEnd();
    if (!s) { close(); continue; }
    if (s.startsWith("## ")) { close(); out.push(`<h1>${inline(s.slice(3))}</h1>`); continue; }
    if (s.startsWith("### ")) { close(); out.push(`<h2>${inline(s.slice(4))}</h2>`); continue; }
    if (s.startsWith("> ")) { close(); out.push(`<blockquote>${inline(s.slice(2))}</blockquote>`); continue; }
    const ol = /^\d+\. (.*)$/.exec(s); const ul = /^- (.*)$/.exec(s);
    if (ol || ul) { const want = ol ? "ol" : "ul"; if (list !== want) { close(); out.push(`<${want}>`); list = want; } out.push(`<li>${inline((ol ?? ul)![1])}</li>`); continue; }
    close(); out.push(`<p>${inline(s)}</p>`);
  }
  close();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(placeName)}: the Shōkai leaflet</title>`
    + `<style>body{font:16px/1.55 system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#222}blockquote{border-left:3px solid #6b8e5a;margin:1rem 0;padding:.2rem 1rem}</style></head><body>\n`
    + out.join("\n") + `\n</body></html>\n`;
}
