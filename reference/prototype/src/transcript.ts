/**
 * Narrated transcript recorder. Produces Markdown readable by non-engineers:
 * narration first, machine facts second, courtesy always labeled untrusted.
 */
export type Line =
  | { kind: "h2"; text: string }
  | { kind: "say"; who: string; to?: string; text: string }
  | { kind: "note"; text: string }
  | { kind: "verify"; ok: boolean; text: string }
  | { kind: "unsigned"; text: string }
  | { kind: "courtesy"; who: string; locale: string; text: string }
  | { kind: "machine"; text: string }
  | { kind: "quote"; title: string; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "json"; title: string; obj: unknown };

export class Recorder {
  lines: Line[] = [];
  step = 0;
  constructor(public title: string, public summary: string, public cast: string[][]) {}
  h2(text: string) { this.lines.push({ kind: "h2", text }); }
  say(who: string, text: string, to?: string) { this.step++; this.lines.push({ kind: "say", who, to, text }); }
  note(text: string) { this.lines.push({ kind: "note", text }); }
  verify(ok: boolean, text: string) { this.lines.push({ kind: "verify", ok, text }); }
  unsigned(text: string) { this.lines.push({ kind: "unsigned", text }); }
  courtesy(who: string, locale: string, text: string) { this.lines.push({ kind: "courtesy", who, locale, text }); }
  machine(text: string) { this.lines.push({ kind: "machine", text }); }
  quote(title: string, text: string) { this.lines.push({ kind: "quote", title, text }); }
  table(header: string[], rows: string[][]) { this.lines.push({ kind: "table", header, rows }); }
  json(title: string, obj: unknown) { this.lines.push({ kind: "json", title, obj }); }

  toMarkdown(): string {
    const out: string[] = [];
    out.push(`# ${this.title}`, "", `> ${this.summary}`, "");
    out.push("*Fictional simulation from the Shōkai v0.2.2 reference prototype. Every message is signed and verified. Passkeys and did:web are simulated locally.*", "");
    out.push("## Cast", "", "| Who | Role |", "|---|---|", ...this.cast.map((r) => `| ${r[0]} | ${r[1]} |`), "");
    let n = 0;
    for (const l of this.lines) {
      switch (l.kind) {
        case "h2": out.push("", `## ${l.text}`, ""); n = 0; break;
        case "say": n++; out.push(`${n}. **${l.who}${l.to ? " → " + l.to : ""}:** ${l.text}`); break;
        case "note": out.push(`   - ${l.text}`); break;
        case "verify": out.push(`   - ${l.ok ? "✅ Verified" : "⛔ Rejected"}: ${l.text}`); break;
        case "unsigned": out.push(`   - 🔓 Unsigned: ${l.text}`); break;
        case "courtesy": out.push(`   - 💬 *${l.who} says (${l.locale}, courtesy, treated as untrusted):* "${l.text}"`); break;
        case "machine": out.push(`   - ⚙️ Machine decision: \`${l.text}\``); break;
        case "quote": out.push("", `**${l.title}**`, "", ...l.text.split("\n").map((s) => `> ${s}`), ""); break;
        case "json": out.push("", `<details><summary>${l.title}</summary>`, "", "```json", JSON.stringify(l.obj, null, 2), "```", "", "</details>", ""); break;
        case "table": out.push("", `| ${l.header.join(" | ")} |`, `|${l.header.map(() => "---").join("|")}|`, ...l.rows.map((r) => `| ${r.join(" | ")} |`), ""); break;
      }
    }
    return out.join("\n") + "\n";
  }
}
