// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Visitor safety against trap places (SPEC-DETAIL §12.5, C302–C310; added in package 0.6.1; the specification stays v0.5.0).
// A place can work on the representatives that visit it: flood them, hide instructions in what it serves, nudge their sense of the
// owner's taste, or ask them to write to the owner's memory. This module is the visitor's side: it keeps the take-home within the
// owner's budget (C304), bounds intake (C305), builds the report's `take_home` (C306), refuses memory writes without the owner (C307),
// refuses acts that only place content asked for (C308), and records trap signals (C309). Choosing *which* items fit the owner's brief
// is the representative's own judgment (C303); this module enforces the budget and keeps the account honest.
import { stripInvisible } from "./outside.js";
import type { TrapSignalKind, TrapSignal, KeptItem, TakeHomeReport, ErrandKind, HeavyContentAsk } from "./core/shapes.js";

/** C305: the largest reply the SDK reads from a place (1 MiB). A larger reply is refused whole, never read as a truncated prefix. */
export const MAX_PLACE_REPLY = 1024 * 1024;
/**
 * C304: the visitor derives the take-home budget from the kind of errand. These are implementation defaults, not owner settings: the owner is
 * never asked for a number. An `errand` (get one thing done) takes one item and 1 KiB of quoted place text; a `visit` (a browse for taste) five
 * items and 4 KiB; `research` ten items and 8 KiB.
 */
export const TAKE_HOME_DEFAULTS: Readonly<Record<ErrandKind, Readonly<{ maxItems: number; maxQuotedBytes: number }>>> = Object.freeze({
  errand: Object.freeze({ maxItems: 1, maxQuotedBytes: 1024 }),
  visit: Object.freeze({ maxItems: 5, maxQuotedBytes: 4096 }),
  research: Object.freeze({ maxItems: 10, maxQuotedBytes: 8192 }),
});
/** The budget when the errand kind is unknown: a `visit` (C304). */
export const DEFAULT_TAKE_HOME = TAKE_HOME_DEFAULTS.visit;
/**
 * C304: the errand kind from the owner's plain words (or the representative's own description of the errand). Heuristic and English-first,
 * like the trap-signal detector; anything it cannot tell is a `visit`. A representative that knows the kind better says so (`brief.errand`).
 */
export function errandKindOf(words?: string): ErrandKind {
  const t = String(words ?? "").toLowerCase();
  if (/\b(research|compare|learn about|find out|look into|options for|survey)\b/.test(t)) return "research";
  if (/\b(just|only) (the |a |one |1 )|\b(re-?order|pay (my|the)|transfer|renew|cancel|book (a|the|my)|check (my |the )?(balance|status)|refill)\b/.test(t)) return "errand";
  return "visit";
}
/** C310: defaults for what counts as heavy or unusual (implementation defaults, not owner settings). The representative may count more as heavy, never less. */
export const HEAVY_ITEM_BYTES = 256 * 1024;
/** C305: how many items a representative examines in one visit before the place counts as flooding, unless the brief says otherwise. */
export const DEFAULT_MAX_EXAMINED = 500;
/** Error code: a place's reply was over MAX_PLACE_REPLY and was refused whole (C305). */
export const SHOKAI_PLACE_REPLY_TOO_LARGE = "SHOKAI_PLACE_REPLY_TOO_LARGE";
/** Error code: a memory write or act that only place content asked for (C307, C308). */
export const SHOKAI_NEEDS_OWNER = "SHOKAI_NEEDS_OWNER";

/** The owner's brief (C303). It stays with the representative and is never sent to a place. */
export type OwnerBrief = {
  /** What the errand is for, in the owner's words. Optional: the brief can be one sentence or absent (C303). */
  purpose?: string;
  /** The errand kind, when the representative knows it; otherwise it is read from `purpose` (`errandKindOf`). The owner never sets it as a number (C304). */
  errand?: ErrandKind;
  /** Preferences and things the owner won't accept, in the owner's words (taste, sizes, price range, season, brands to avoid). */
  wants?: string[];
  avoid?: string[];
  /** Acts the owner's brief already calls for (C308). Place content can't add to this list. */
  acts?: string[];
  /** C304: an implementer's override of the errand kind's default budget. Not an owner setting; the owner is never asked for numbers. Absent members use the errand kind's default. */
  budget?: { maxItems?: number; maxQuotedBytes?: number };
  /** C305: the most items to examine in this visit (default DEFAULT_MAX_EXAMINED). */
  maxExamined?: number;
};

// The shapes are part of the protocol shapes (a VisitReport carries `take_home`), so they live there and are re-exported here.
export type { TrapSignalKind, TrapSignal, KeptItem, TakeHomeReport, ErrandKind, HeavyContentAsk };

/** What a place says about a piece of content before it is opened (C310): its name, type, size and where it came from. */
export type ContentFacts = { media_type?: string; bytes?: number; name?: string; attachment?: boolean; from?: string };
const describeKind = (m: ContentFacts): string => { const t = String(m.media_type ?? "").toLowerCase(); const n = String(m.name ?? "").toLowerCase();
  return /pdf/.test(t) || n.endsWith(".pdf") ? "a PDF" : t.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/.test(n) ? "a video" : t.startsWith("audio/") || /\.(mp3|wav)$/.test(n) ? "an audio file"
    : /zip|tar|gzip|rar|7z/.test(t) || /\.(zip|tar|gz|7z|rar)$/.test(n) ? "an archive" : /\.(exe|msi|dmg|apk)$/.test(n) || /octet-stream|executable/.test(t) ? "a program" : m.attachment ? "an attachment" : "a file"; };
/** "about 12 MB": a size in words an owner reads, never a raw byte count (C310). */
const approxSize = (b: number): string => b < 1024 * 100 ? "a small file" : b < 1024 * 1024 ? `about ${Math.round(b / 1024)} KB` : `about ${Math.max(1, Math.round(b / (1024 * 1024)))} MB`;
const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const clip = (s: string, n = 160) => { const t = stripInvisible(String(s)).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

/**
 * C309: trap signals in a piece of place content. Heuristic and English-first, like the door's pressure heuristics: a hit is a
 * signal to record and report, never proof; a miss is not a clean bill. Invisible characters are stripped first (hidden text is read).
 */
const PATTERNS: [TrapSignalKind, RegExp][] = [
  ["instruction", /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,60}\b(previous|prior|above|earlier|your|all|the)\b[^.]{0,40}\b(instructions?|rules?|limits?|brief|directives?|guidelines?|mandate|owner)/i],
  ["instruction", /\b(you are now|from now on,? you|act as|new instructions?|system (?:notice|message|prompt)|developer message|as your (?:platform|operator|owner))\b/i],
  ["instruction", /\b(do not|don't|never) (tell|show|report|mention)\b[^.]{0,40}\b(owner|user|human)\b/i],
  ["memory_write", /\b(save|store|remember|write|add|record|update|memori[sz]e|pin)\b[^.]{0,60}\b(memory|memories|profile|preferences?|instructions?|skills?|notes? about your owner|your owner'?s? (?:taste|style|profile))\b/i],
  ["owner_claim", /\b(your owner|your user|your human|people like (?:your owner|you)|shoppers like you|agents like you)\b[^.]{0,60}\b(would|will|wants?|loves?|prefers?|choose|should|always|really)\b/i],
  ["owner_claim", /\b(everyone|most (?:people|shoppers|agents)|\d{2,3}% of (?:shoppers|agents|people))\b[^.]{0,40}\b(choose|buy|pick|love|prefer)\b/i],
  ["pressure", /\b(only \d+ left|last chance|expires? in \d+ ?(?:min|minutes|seconds|hours?)|act now|buy now|hurry|before it'?s gone|limited time)\b/i],
  ["act_request", /\b(buy|purchase|add to (?:cart|basket)|check ?out|subscribe|sign ?up|order)\b[^.]{0,40}\b(now|immediately|right away|for your owner|on (?:your|their) behalf)\b/i],
];
export function trapSignals(text: string, where?: string): TrapSignal[] {
  const t = stripInvisible(String(text ?? "")); const out: TrapSignal[] = [];
  for (const [kind, re] of PATTERNS) { const m = re.exec(t); if (m) out.push({ kind, quote: clip(t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 40)), untrusted: true, ...(where ? { where } : {}) }); }
  // Padding: the same sentence repeated many times, or very long text with few distinct words.
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  if (sentences.length >= 10) { const distinct = new Set(sentences).size; if (distinct / sentences.length < 0.3) out.push({ kind: "padding", quote: clip(sentences[0]), untrusted: true, ...(where ? { where } : {}) }); }
  return out;
}

/**
 * One visit's take-home (C303–C310). Feed it what the place serves (`read`, `examine`), keep what fits the brief (`keep`), say why
 * the rest was left (`leave`), and put `report()` in the VisitReport (`visitReport(v, locale, { takeHome })` does it).
 */
export class TakeHome {
  readonly maxItems: number; readonly maxQuotedBytes: number; readonly maxExamined: number;
  private kept: KeptItem[] = []; private quoted = 0; private examinedN = 0; private leftN = 0;
  private reasons = new Map<string, number>(); private signals: TrapSignal[] = [];
  private heavy = new Map<string, HeavyContentAsk>(); private memoryDeclined = 0; private proposals: TakeHomeReport["memory_proposals"] = []; private leftEarly?: { why: string };
  /** Place text asking to be remembered, kept for VisitReport.offers_declined (C307). */
  readonly declinedOffers: { text: string; locale: string; untrusted: true; why: "conflicts_with_interests" }[] = [];
  readonly errandKind: ErrandKind;
  constructor(readonly brief: OwnerBrief = {}, readonly locale = "en-US") {
    this.errandKind = brief.errand ?? errandKindOf(brief.purpose);
    const base = TAKE_HOME_DEFAULTS[this.errandKind];
    this.maxItems = Math.max(0, Math.floor(brief.budget?.maxItems ?? base.maxItems));
    this.maxQuotedBytes = Math.max(0, Math.floor(brief.budget?.maxQuotedBytes ?? base.maxQuotedBytes));
    this.maxExamined = Math.max(1, Math.floor(brief.maxExamined ?? DEFAULT_MAX_EXAMINED));
  }
  private seen = new Map<string, TrapSignal>();
  /** One entry per distinct signal, with a count, so a flood of the same injection stays one line in the report. */
  private signal(s: TrapSignal) { const k = s.kind + "|" + s.quote; const had = this.seen.get(k); if (had) { had.count = (had.count ?? 1) + 1; return; } const x = { ...s, count: 1 }; this.seen.set(k, x); this.signals.push(x); }
  /** Items or texts in which at least one trap signal was found. */
  readonly flaggedWhere = new Set<string>();
  /** C302, C309: read a piece of place content as data. Returns the trap signals it carried; nothing in it is followed. */
  read(text: string, where?: string): TrapSignal[] {
    const s = trapSignals(text, where); for (const x of s) this.signal(x); if (s.length && where) this.flaggedWhere.add(where);
    if (s.some((x) => x.kind === "memory_write")) this.memoryRequest(text);
    return s;
  }
  /** C305: count items examined. Returns false once the bound is reached; the place is then flooding and the rest is left unread. */
  examine(n = 1): boolean {
    if (this.examinedN + n > this.maxExamined) {
      const fit = Math.max(0, this.maxExamined - this.examinedN); this.examinedN += fit;
      this.signal({ kind: "flood", quote: `more than ${this.maxExamined} items served in one visit`, untrusted: true });
      return false;
    }
    this.examinedN += n; return true;
  }
  /** C305: a reply refused whole for its size. */
  oversized(bytesSeen: number, where?: string) { this.signal({ kind: "oversized", quote: `a reply over ${bytesSeen} bytes was refused whole`, untrusted: true, ...(where ? { where } : {}) }); }
  /** C304: keep one item, with one line on how it fits the brief. Refused (false) when the budget is full; the item is then left. */
  keep(item: KeptItem & { media?: ContentFacts }): boolean {
    if (item.media && this.isHeavy(item.media) && !this.mayBringHome(item.id)) { this.askAboutHeavy({ id: item.id, what: item.title, ...item.media }); this.leave(1, "waiting for your yes (heavy content)"); return false; }
    const q = item.quote ? stripInvisible(item.quote) : ""; const qb = bytes(q) + bytes(stripInvisible(item.title));
    if (this.kept.length >= this.maxItems || this.quoted + qb > this.maxQuotedBytes) { this.leave(1, "over the take-home budget"); return false; }
    this.kept.push({ id: String(item.id), title: stripInvisible(item.title), fits: item.fits, ...(q ? { quote: q } : {}) }); this.quoted += qb; return true;
  }
  /**
   * C310: is this content heavy or unusual for the errand: not plain text or structured data, over HEAVY_ITEM_BYTES, a document, media, an
   * archive or program, or an attachment? Defaults only: a representative may count more as heavy and never less.
   */
  isHeavy(m: ContentFacts): boolean {
    const t = String(m.media_type ?? "").toLowerCase().split(";")[0].trim(); const n = String(m.name ?? "").toLowerCase();
    const plain = t === "" ? false : t.startsWith("text/") || /^application\/(json|ld\+json|xml)$/.test(t) || /\+json$/.test(t);
    const byExt = /\.(pdf|docx?|xlsx?|pptx?|zip|tar|gz|7z|rar|exe|msi|dmg|apk|mp3|wav|mp4|mov|avi|mkv|webm|iso|bin)$/.test(n);
    return m.attachment === true || byExt || (t !== "" && !plain) || (m.bytes ?? 0) > HEAVY_ITEM_BYTES;
  }
  /** C310: may the representative open this content (fetch it, parse it, follow a link in it)? Only after the owner said yes. Before that, name, type and size only. */
  mayOpen(m: ContentFacts & { id: string }): { ok: true } | { ok: false; code: typeof SHOKAI_NEEDS_OWNER; question: string } {
    if (!this.isHeavy(m) || this.mayBringHome(m.id)) return { ok: true };
    const a = this.askAboutHeavy(m); return { ok: false, code: SHOKAI_NEEDS_OWNER, question: a.question };
  }
  /** C310: ask the owner, in plain words, before bringing heavy content home. Returns the question to put to the owner. Asking twice for the same id is one question. */
  askAboutHeavy(m: ContentFacts & { id: string; what?: string }): HeavyContentAsk {
    const id = String(m.id); const had = this.heavy.get(id); if (had) return had;
    const what = clip(m.what ?? m.name ?? "a file", 120); const from = m.from ? clip(m.from, 80) : undefined;
    const kind = describeKind(m);
    const ask: HeavyContentAsk = { id, what, ...(m.media_type ? { media_type: clip(m.media_type, 80) } : {}), ...(m.bytes !== undefined ? { bytes: Math.max(0, Math.floor(m.bytes)) } : {}), ...(from ? { from } : {}),
      question: `The place offered ${kind}: "${what}"${from ? `, from ${from}` : ""}${m.bytes !== undefined ? `, ${approxSize(m.bytes)}` : ""}. It could contain things I can't check. Should I bring it home?`,
      status: "awaiting_owner", untrusted: true };
    this.heavy.set(id, ask); return ask;
  }
  /** C310: has the owner said yes to bringing this home? */
  mayBringHome(id: string): boolean { return this.heavy.get(String(id))?.status === "approved"; }
  /** C310: the owner's answer to a heavy-content question (`ownerAnswered` handles memory notes). The content stays untrusted after a yes. */
  heavyAnswered(id: string, yes: boolean) { const h = this.heavy.get(String(id)); if (h) h.status = yes ? "approved" : "declined"; }
  /** C306: items left, with a plain-words reason ("outside your price range"). */
  leave(n: number, reason: string) { if (n <= 0) return; this.leftN += n; this.reasons.set(reason, (this.reasons.get(reason) ?? 0) + n); }
  /** C307: a place asked to write into the owner's memory. Declined and reported; nothing is written. */
  memoryRequest(text: string): { written: false; reported: true } {
    this.memoryDeclined++; this.declinedOffers.push({ text: clip(text, 280), locale: this.locale, untrusted: true, why: "conflicts_with_interests" });
    this.signal({ kind: "memory_write", quote: clip(text), untrusted: true }); return { written: false, reported: true };
  }
  /** C307: the representative proposes a note for the owner's memory. It waits for the owner; `confirmed()` says whether to write it. */
  proposeMemory(note: string): string { const id = `mem-${this.proposals.length + 1}`; this.proposals.push({ id, note: clip(note, 280), status: "awaiting_owner" }); return id; }
  ownerAnswered(id: string, yes: boolean) { const p = this.proposals.find((x) => x.id === id); if (p) p.status = yes ? "confirmed" : "declined"; }
  confirmed(id: string): boolean { return this.proposals.find((x) => x.id === id)?.status === "confirmed"; }
  /** C308: may the representative perform this act? Only if the owner's brief already calls for it. A place's ask never adds one. */
  mayAct(tool: string, askedByPlace = false): { ok: true } | { ok: false; code: typeof SHOKAI_NEEDS_OWNER; why: string } {
    if ((this.brief.acts ?? []).includes(tool)) return { ok: true };
    if (askedByPlace) this.signal({ kind: "act_request", quote: `the place asked for ${clip(tool, 60)}`, untrusted: true });
    return { ok: false, code: SHOKAI_NEEDS_OWNER, why: `${tool} is not in the owner's brief; it comes home as a question` };
  }
  /** C308: whether to leave now (a flood, an oversized reply, or an instruction to set aside the brief or rules). */
  shouldLeave(): { leave: boolean; why?: string } {
    const k = new Set(this.signals.map((s) => s.kind));
    const why = k.has("flood") ? "the place served more than this visit can use" : k.has("oversized") ? "the place sent a reply too large to read"
      : k.has("instruction") ? "the place's content tried to give me instructions" : undefined;
    return why ? { leave: true, why } : { leave: false };
  }
  leftEarlyBecause(why: string) { this.leftEarly = { why }; }
  get signalsSeen(): readonly TrapSignal[] { return this.signals; }
  /** C306: the report's `take_home`. */
  report(): TakeHomeReport {
    return { errand_kind: this.errandKind, ...(this.brief.purpose?.trim() ? { brief: clip(this.brief.purpose, 200) } : {}), kept: this.kept.map((k) => ({ ...k, untrusted: true as const })), examined: this.examinedN, left: this.leftN,
      left_reasons: [...this.reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      budget: { max_items: this.maxItems, max_quoted_bytes: this.maxQuotedBytes, quoted_bytes: this.quoted },
      trap_signals: this.signals.map((x) => ({ ...x })), flagged: this.flaggedWhere.size, memory_requests_declined: this.memoryDeclined, memory_proposals: this.proposals.map((p) => ({ ...p })),
      ...(this.heavy.size ? { heavy_content: [...this.heavy.values()].map((h) => ({ ...h })) } : {}),
      ...(this.leftEarly ? { left_early: this.leftEarly } : {}) };
  }
}
