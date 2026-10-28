/**
 * In-memory transport for the simulation: delivers a signed message, lets the
 * receiver verify and reply, and narrates each step for the transcript.
 * A real deployment replaces this with MCP tool calls (see pilot/server-tools.md).
 */
import type { Representative, Wire } from "./representative.js";
import type { ShokaiMessage } from "../../../protocol-shapes.js";

export type Tamper = (w: Wire) => Wire;

function describe(m: ShokaiMessage, from: Representative): string {
  switch (m.type) {
    case "greeting": return `greets${m.nonce ? " with a fresh one-time nonce" : ""}; prefers ${m.locales.join(", ")}.`;
    case "lobby_briefing": return "welcomes the visitor into the lobby and introduces itself. No seat is granted here.";
    case "card_presentation": {
      const c = m.card.payload;
      const n = (c.claims?.length ?? 0), f = ["expertise", "worldview", "working_style", "taste"].reduce((a, g) => a + ((c.imprint as Record<string, unknown[]> | undefined)?.[g]?.length ?? 0), 0);
      return `presents its card (meishi), deliberately: "${c.role}" for ${c.principal.display_name}${c.owner_binding ? ", owner-bound by passkey" : ""}${n ? `, ${n} backed-up claims` : ""}${f ? `, a principal imprint with ${f} facets` : ""}.`;
    }
    case "card_receipt": return "receives the card with both hands, so to speak: acknowledged, not yet accepted.";
    case "introduction": return m.vouch ? `presents an introduction: ${m.vouch.payload.introducer.display_name} vouches (${m.vouch.payload.relationship}) for ${m.vouch.payload.scope.purposes.join(", ")}.` : "introduces itself honestly, with no one vouching.";
    case "invitation_request": return `states its purpose (${m.mandate?.payload.purpose.code}) and asks for: ${m.proposal.request.actions.join(", ")}${m.proposal.request.limits?.max_amount ? ` (up to ${m.proposal.request.limits.max_amount.value} ${m.proposal.request.limits.max_amount.currency})` : ""}${m.prior_response_ref ? `. It refers to its earlier visit (${m.prior_response_ref})` : ""}${m.consideration_ref ? `. It refers to consideration ${m.consideration_ref}` : ""}.`;
    case "invitation_response": return "answers.";
    case "consideration_outcome": return `sends the outcome of consideration ${m.consideration_ref}, decided by ${m.decided_by.kind === "role" ? m.decided_by.role : "the principal"}.`;
    case "act": return `asks to use ${m.tool} ${m.arguments ? JSON.stringify(m.arguments) : ""}.`;
    case "act_result": return `performs ${m.tool} within the seat.`;
    case "act_decision": return `refuses ${m.tool}, explicitly.`;
    case "lesson": return `teaches a signed lesson: "${m.lesson.payload.topic}".`;
    case "farewell": return `says farewell (${m.outcome}).`;
    default: return `${m.type}`;
  }
  void from;
}

function machine(m: ShokaiMessage): string | undefined {
  if (m.type === "invitation_response" || m.type === "consideration_outcome" || m.type === "act_decision") {
    const parts = [`decision=${m.decision}`];
    if (m.decision === "deny") parts.push(`disposition=${m.disposition}`, `retry=${m.retry.kind}${m.retry.kind === "with_credential" ? "[" + m.retry.credentials.join(",") + "]" : m.retry.kind === "after" ? " " + m.retry.not_before : ""}`);
    if (m.decision === "conditional") parts.push(`conditions=${m.conditions.map((c) => c.code + JSON.stringify(c.params)).join(";")}`);
    if (m.decision === "considering") parts.push(`routed_to=${m.routed_to.kind === "role" ? m.routed_to.role : "principal"}`, `response_by=${m.response_by}`, `ref=${m.consideration_ref}`);
    if (m.decision === "grant" && m.seat) parts.push(`seat=[${m.seat.tool_allowlist.join(", ")}]`, `limits=${JSON.stringify(m.seat.limits ?? {})}`);
    parts.push(`reason_code=${m.reason_code ?? "(none)"}`);
    return parts.join("  ");
  }
  if (m.type === "act_result") return `ok=${m.ok}  result=${JSON.stringify(m.result)}`;
  return undefined;
}

export class Exchange {
  /** Every message delivered in any exchange (v0.2.1 conformance: the wire envelope, C48). */
  static log: Wire[] = [];
  constructor(public a: Representative, public b: Representative) {}
  private other(r: Representative) { return r === this.a ? this.b : this.a; }

  /** Send from `from` to the other party; deliver replies back and forth until quiet. */
  send(from: Representative, w: Wire, tamper?: Tamper): void {
    const to = this.other(from);
    const m = w.payload;
    from.rec.say(from.name, describe(m, from), to.name);
    const courtesy = "courtesy" in m && m.courtesy ? m.courtesy : m.type === "lobby_briefing" ? m.about : undefined;
    if (courtesy) from.rec.courtesy(from.name, courtesy.locale, courtesy.text);
    if (m.type === "lobby_briefing") {
      from.rec.note(`How this place works: ${m.how_this_place_works.text}`);
      for (const i of m.seeking?.payload.items ?? []) from.rec.note(`Seeking (${i.status}): ${i.summary.text}`);
    }
    if (m.type === "invitation_request") from.rec.note(`The pitch, in its own words (prose: it never enters the gate): "${m.proposal.value_to_counterparty.text}"`);
    const mc = machine(m); if (mc) from.rec.machine(mc);
    if ((m.type === "invitation_response") && m.decision === "deny") {
      if (m.context_statement) from.rec.note(`Honest context: "${m.context_statement.text}"`);
      for (const r of m.readiness_requirements ?? []) from.rec.note(`Needed${r.required ? "" : " (optional)"}: **${r.code}**: ${r.detail.text}${r.how ? ` (start here: ${r.how.url})` : ""}`);
    }
    Exchange.log.push(w);
    const delivered = tamper ? tamper(w) : w;
    for (const reply of to.receive(delivered)) this.send(to, reply);
  }
}
