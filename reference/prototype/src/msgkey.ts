/**
 * v0.2.7 (SPEC §2.2 "Message ids"): a msg_id is unique per sender only. Receivers key replay detection,
 * de-duplication and in_reply_to resolution on the pair (from, msg_id), never on msg_id alone.
 */
export type Header = { from?: string; msg_id?: string; to?: string; in_reply_to?: string; type?: string; sent_at?: string };

export const msgKey = (from: string | undefined, msg_id: string | undefined): string => `${from ?? "?"}\u0000${msg_id ?? "?"}`;

/** Remembers (from, msg_id) → payload digest. `check` says whether a message is new, an exact redelivery, or an id reused with other content. */
export class SeenMessages {
  private seen = new Map<string, string>();
  check(h: Header, digest: string): "new" | "duplicate" | "reused_id" {
    const k = msgKey(h.from, h.msg_id); const d = this.seen.get(k);
    if (d === undefined) { this.seen.set(k, digest); return "new"; }
    return d === digest ? "duplicate" : "reused_id";
  }
  has(from: string, msg_id: string): boolean { return this.seen.has(msgKey(from, msg_id)); }
}

/**
 * Direct reply: `in_reply_to` refers to the msg_id of a message whose `from` is the reply's `to`
 * (the reply answers what its recipient sent). Returns that message, or undefined.
 */
export function resolveReply<T extends Header>(log: T[], reply: Header): T | undefined {
  if (!reply.in_reply_to) return undefined;
  for (let i = log.length - 1; i >= 0; i--) { const m = log[i]; if (m.msg_id === reply.in_reply_to && m.from === reply.to) return m; }
  return undefined;
}

/**
 * Room reply (a reply addressed to a gathering, not to a party): `in_reply_to` names the original sender's msg_id, but the
 * reply does not name that sender. Resolve to the MOST RECENT room item with that msg_id from an attendee other than the
 * replier (host-final2-001); never to the first item ever seen with that id.
 */
export function resolveRoomReply<T extends Header>(roomItems: T[], reply: Header): T | undefined {
  if (!reply.in_reply_to) return undefined;
  for (let i = roomItems.length - 1; i >= 0; i--) { const m = roomItems[i]; if (m.msg_id === reply.in_reply_to && m.from !== reply.from) return m; }
  return undefined;
}
