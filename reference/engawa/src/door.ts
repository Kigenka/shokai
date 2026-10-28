// The door (§3.1, §11.1): a machine-readable place listing, and the DoorPointer served at GET <base>/ (200) and on any other path or method (404).
import type * as S from "./shapes.js";
import { SPEC_REF, type Host } from "./host.js";

/** Appendix B: a place in a conformance run declares it with the extension member `x-test-profile` in its listing entry. */
export { TEST_PROFILE } from "./version.js";
import { PROTOCOL, TEST_PROFILE } from "./version.js";
export type ListingEntry = S.PlaceListingEntry & { "x-test-profile"?: string; "x-test-decider"?: true };
export const entryUrl = (base: string, name: string) => `${base}/places/${name}/entry`;
export const inboxUrl = (base: string, name: string) => `${base}/places/${name}/inbox`;
export const lobbyUrl = (base: string, name: string) => `${base}/places/${name}/lobby`;

/** v0.2.9 (§10): an inbound door is not advertised unless its owner listed it: it is left out of shared listings and door roots. */
export const advertised = (h: Host) => !h.cfg.door || h.cfg.door.policy.payload.public.listed === true;
/** `own`: the listing a door serves at its own address to a visitor that already has the address (§10); it carries the door policy. */
export function placeListing(base: string, hosts: Host[], now: string, own = false): S.PlaceListing {
  return { type: "place_listing", protocol: PROTOCOL, door: base + "/", published_at: now,
    places: hosts.filter((h) => own || advertised(h)).map((h) => {
      const P = h.cfg.policy;
      const e: ListingEntry = { name: h.cfg.name, display_name: h.cfg.display_name, principal_id: h.cfg.principal_id, representative_id: h.cfg.rep_id,
        entry: entryUrl(base, h.cfg.name), lobby: lobbyUrl(base, h.cfg.name), onboarding_url: P.lobby.onboarding_url,
        locales: P.supported_locales, purposes: P.purposes, category: P.category ?? "x-unspecified", actions: h.placeActions(), spec_ref: SPEC_REF,
        inbox: inboxUrl(base, h.cfg.name) };
      if (h.cfg.seeking) e.seeking_ref = { seeking_id: h.cfg.seeking.payload.seeking_id, digest: h.cfg.seeking.payload_digest };
      if (h.testProfile) e["x-test-profile"] = TEST_PROFILE;
      if (h.testDecider) e["x-test-decider"] = true;   // Appendix B.4 (v0.2.5)
      if (h.cfg.door) e.door_policy = h.cfg.door.policy;
      if (h.cfg.links?.length) e.links = h.cfg.links;   // v0.3.0-rc1 (§3.1, D20): hints only; never read by the gate   // v0.2.9 (§10): owner-signed; public part plus a salted digest of the private part
      return e;
    }) };
}
/**
 * Unsigned and header-less, like the L0a trace; v0.2.4: spec_ref and each place's inbox.
 * v0.3.0-rc4 (§11.1, C200): `here` = the place whose own address (entry, lobby or inbox) was asked for with the wrong method:
 * it is named, listed or not, with `method: "POST"`. `places` stays the advertised list: an unlisted place never appears there (C163).
 */
export function doorPointer(base: string, hosts: Host[], here?: Host): S.DoorPointer {
  const ref = (h: Host) => ({ name: h.cfg.name, entry: entryUrl(base, h.cfg.name), lobby: lobbyUrl(base, h.cfg.name), onboarding_url: h.cfg.policy.lobby.onboarding_url,
    inbox: inboxUrl(base, h.cfg.name) });
  return { type: "door_pointer", protocol: PROTOCOL, place_listing: `${base}/places`, start_with: "greeting", spec_ref: SPEC_REF,
    places: hosts.filter(advertised).map(ref), ...(here ? { here: { ...ref(here), method: "POST" as const } } : {}) };
}
/** v0.3.0-rc4 (§11.1, C200): the place a path names as one of its own addresses (`/places/<name>/entry|lobby|inbox`), if any. */
export function ownAddressOf(parts: string[], find: (name: string) => Host | undefined): Host | undefined {
  return parts[0] === "places" && parts.length === 3 && ["entry", "lobby", "inbox"].includes(parts[2]) ? find(parts[1]) : undefined;
}
