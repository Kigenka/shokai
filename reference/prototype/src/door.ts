/**
 * v0.2.1 SPEC §3.1 "The door", and v0.2.3 §11 the minimal HTTP binding (S4 preview), simulated in-process (no network).
 * - GET  /places                  → 200 PlaceListing (every entry carries entry, lobby, onboarding, category, actions)
 * - POST /places/<name>/entry     → 200 ReplyEnvelope {protocol, messages[]}: a protocol message is delivered; ANYTHING else
 *                                   (plain prose, a malformed body) opens the lobby. Never a silent 404.
 * - GET  /places/<name>/lobby     → 200 ReplyEnvelope with the lobby, for a visitor with nothing at all
 * - POST /places/<name>/inbox     → 200 ReplyEnvelope: late (asynchronous) messages held for the poller; the body MUST be a
 *                                   signed `inbox_poll` whose `from` is the recipient (403 otherwise)
 * - anything else                 → 404 with a machine-readable DoorPointer body
 *
 * v0.2.4 (S3 round 3): GET <base>/ → 200 DoorPointer (the door root); POST <lobby> behaves exactly like POST <entry>; any
 * other path OR method → 404 DoorPointer. Listing entries, pointers and the lobby name the inbox. An inbox_poll signed by
 * its `from` gets 200 with that signer's own held messages (possibly none); 403 (body: an empty ReplyEnvelope) only for a
 * missing, bad or mismatched signature, a poll outside ±300 s, or a replayed poll msg_id. A peer_invitation answered later
 * gets a signed `held` notice in the same envelope. Late messages a place produced (pendingOut) are held per recipient.
 */
import type { ShokaiMessage, DoorPointer, PlaceListing, PlaceListingEntry, ReplyEnvelope } from "../../../protocol-shapes.js";
import { type Representative, type Wire, placeActions, SPEC_REF } from "./representative.js";
import { verifySigned, isRfc3339Seconds, CLOCK_SKEW_S } from "./crypto.js";

export type HttpRequest = { method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD"; path: string; contentType?: string; body?: unknown };
export type HttpResponse = { status: 200 | 403 | 404; contentType: "application/json"; body: ReplyEnvelope | PlaceListing | DoorPointer };

export class Door {
  /** v0.2.3 (§11.2): late messages held per recipient DID, in order, until polled (kept ≥ response_by + 7 days). */
  held = new Map<string, Wire[]>();
  /** v0.2.4 (§11.2): poll msg_ids already seen, per poller (replay → 403). */
  private seenPolls = new Map<string, Set<string>>();
  constructor(public base: string, public places: Representative[], private now: () => string) {
    for (const p of places) p.inboxUrl = `${base}/places/${this.slug(p)}/inbox`;
  }
  private slug(p: Representative): string { return p.profile?.slug ?? p.principal.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  entry(p: Representative): PlaceListingEntry {
    const s = this.slug(p);
    const purposes = p.profile?.purposes ?? [];
    return {
      name: s, display_name: p.principal.display_name, principal_id: p.principal.principal_id, representative_id: p.did,
      entry: `${this.base}/places/${s}/entry`, lobby: `${this.base}/places/${s}/lobby`, onboarding_url: p.profile!.onboarding_url,
      locales: Object.keys(p.phrases), purposes,
      seeking_ref: p.profile?.seeking ? { seeking_id: p.profile.seeking.payload.seeking_id, digest: p.profile.seeking.payload_digest } : undefined,
      category: p.profile?.category ?? "x-unspecified", actions: placeActions(p.profile!.policy, purposes.map((x) => x.code)), spec_ref: SPEC_REF,
      inbox: `${this.base}/places/${s}/inbox`,
      // v0.2.4 (Appendix B): a place running the conformance test profile says so (an x- extension member).
      ...(p.profile?.test_profile ? { "x-test-profile": "shokai-b/0.3" } : {}),
      ...(p.profile?.test_profile?.decider ? { "x-test-decider": true } : {}),
    } as PlaceListingEntry;
  }
  listing(): PlaceListing { return { type: "place_listing", protocol: "shokai/0.3", door: this.base, places: this.places.map((p) => this.entry(p)), published_at: this.now() }; }
  pointer(): DoorPointer {
    return { type: "door_pointer", protocol: "shokai/0.3", place_listing: `${this.base}/places`, start_with: "greeting", spec_ref: SPEC_REF,
      places: this.places.map((p) => { const e = this.entry(p); return { name: e.name, entry: e.entry, lobby: e.lobby, onboarding_url: e.onboarding_url, inbox: e.inbox }; }) };
  }
  static isWire(b: unknown): b is Wire {
    return !!b && typeof b === "object" && "payload" in b && "signatures" in b && typeof (b as Wire).payload?.type === "string";
  }
  /** v0.2.1 shape (kept for earlier scenarios): the messages or the listing / pointer, without HTTP status. */
  handle(method: "GET" | "POST", path: string, body?: unknown): (Wire | PlaceListing | DoorPointer)[] {
    const r = this.http({ method, path, body, contentType: Door.isWire(body) ? "application/json" : "text/plain" });
    const b = r.body;
    return "messages" in b ? b.messages : [b];
  }
  /** A place hands a late message (consideration outcome, extension, invitation, gathering item) to its door to hold. */
  hold(w: Wire): void { const to = (w.payload as { to?: string }).to; if (!to) return; this.held.set(to, [...(this.held.get(to) ?? []), w]); }
  /** v0.2.4: move a place's late messages into the held queues. */
  private drain(p: Representative): void { for (const w of p.pendingOut.splice(0)) this.hold(w); }
  /** POST at an entry or the lobby: a protocol message enters the ritual; anything else gets the lobby. */
  private post(place: Representative, body: unknown): Wire[] {
    const out = Door.isWire(body) ? place.receive(body) : place.receiveRaw(body);
    const late = place.pendingOut.length > 0;
    this.drain(place);
    // v0.2.4 (§11.2): a peer_invitation is answered later; acknowledge it with a signed `held` notice.
    if (Door.isWire(body) && body.payload.type === "peer_invitation" && out.length === 0 && (late || place.invitationsHome.some((i) => i.payload_digest === (body.payload as { invitation: { payload_digest: string } }).invitation.payload_digest)))
      out.push(place.heldNotice(body, place.inboxUrl!, (body.payload as { invitation: { payload: { answer_by: string } } }).invitation.payload.answer_by));
    return out;
  }

  http(req: HttpRequest): HttpResponse {
    const ok = (messages: Wire[]): HttpResponse => ({ status: 200, contentType: "application/json", body: { protocol: "shokai/0.3", messages } });
    const p = req.path.replace(this.base, "").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";
    if (req.method === "GET" && p === "/places") return { status: 200, contentType: "application/json", body: this.listing() };
    if (req.method === "GET" && p === "/") return { status: 200, contentType: "application/json", body: this.pointer() };
    const m = p.match(/^\/places\/([^/]+)\/(entry|lobby|inbox)$/);
    const place = m ? this.places.find((x) => this.slug(x) === m[1]) : undefined;
    if (place && (m![2] === "entry" || m![2] === "lobby") && req.method === "POST") return ok(this.post(place, req.body ?? null));
    if (place && m![2] === "inbox" && req.method === "POST") {
      const w = req.body;
      const poll = Door.isWire(w) && w.payload.type === "inbox_poll" ? (w.payload as Extract<ShokaiMessage, { type: "inbox_poll" }>) : undefined;
      const v = poll ? verifySigned(w as Wire, poll.from) : undefined;
      const fresh = !!poll && isRfc3339Seconds(poll.sent_at) && Math.abs(Date.parse(poll.sent_at) - Date.parse(this.now())) <= CLOCK_SKEW_S * 1000;
      const seen = poll ? (this.seenPolls.get(poll.from) ?? new Set<string>()) : new Set<string>();
      if (!poll || !v?.ok || (w as Wire).signatures[0]?.signer !== poll.from || !fresh || seen.has(poll.msg_id)) return { status: 403, contentType: "application/json", body: { protocol: "shokai/0.3", messages: [] } };
      seen.add(poll.msg_id); this.seenPolls.set(poll.from, seen);
      const all = this.held.get(poll.from) ?? [];
      const i = poll.since ? all.findIndex((x) => (x.payload as { msg_id?: string }).msg_id === poll.since) : -1;
      return ok(all.slice(i + 1));
    }
    return { status: 404, contentType: "application/json", body: this.pointer() };
  }
}
