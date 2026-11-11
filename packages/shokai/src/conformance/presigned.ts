// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Yu Sung Yeh
// Pre-signed passkey material for the official HTTP runner: a visitor card and mandates the owner
// already signed (for example on sign.kigenka.com), plus the representative's own key. The runner
// presents these as-is. It never mints a development stand-in owner, never re-signs a mandate, and
// never mutates a signature to look well-signed. Checks that need a fresh owner signature the
// runner cannot produce are reported SKIP with a reason.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createRepresentative, fromSigningPage, importRepresentativeKey,
  type Representative,
} from "../index.js";
import type { PasskeyOwner } from "../core/crypto.js";
import type { Signed, SignedCard, SignedMandate, CardRevocation } from "../core/shapes.js";

/** Roles a fixture or `--mandate <role>=<file>` may name. Unknown roles are refused (never silently ignored). */
export const MANDATE_ROLES = ["browse", "purchase", "c300", "c301", "ops1", "cap001", "under_two", "overcap"] as const;
export type MandateRole = typeof MANDATE_ROLES[number];

export const PRESIGNED_NO_OWNER_SIGN =
  "pre-signed passkey material is in use; the runner will not mint a development stand-in owner or re-sign a mandate";

export function skipNeedOwnerSign(what: string): string {
  return `${PRESIGNED_NO_OWNER_SIGN}: ${what}`;
}

export function skipNeedMandate(role: MandateRole, what: string): string {
  return `pre-signed passkey material is in use, and no mandate for role "${role}" was provided (${what}). The runner will not mint a development owner to sign one.`;
}

export function skipNeedProbe(what: string): string {
  return `pre-signed passkey material is in use, and ${what} was not provided. The runner will not mint a development owner to sign it.`;
}

export type SignedRevocation = Signed<CardRevocation>;

/** Extra owner-signed items the official HTTP runner can present without minting a development owner. */
export type PresignedProbes = {
  /** A mandate whose card_id is not the primary visitor card, signed by the same owner. */
  cross_card?: SignedMandate;
  /** A mandate whose counterparties leave out the door being tested, signed by the same owner. */
  cross_place?: SignedMandate;
  /** A distinct visitor card and the owner's signed revocation of it (delivered, then a later visit). */
  revoked?: { card: SignedCard; mandate: SignedMandate; revocation: SignedRevocation };
  /** A distinct visitor card, a seating mandate, and a revocation delivered while a seat is open. */
  revoked_seat?: { card: SignedCard; mandate: SignedMandate; revocation: SignedRevocation };
  /** A distinct visitor card and mandate whose only action is unlisted (x-conformance.other). */
  probing?: { card: SignedCard; mandate: SignedMandate };
  /** A visitor card carrying a top-level member a closed template does not list. */
  off_template?: SignedCard;
};

export type PresignedMaterial = {
  key: ReturnType<typeof importRepresentativeKey>;
  card: SignedCard;
  mandates: Partial<Record<MandateRole, SignedMandate>>;
  probes: PresignedProbes;
  ownerName: string;
  source: string;
};

export type PresignedLoad = {
  cardPath?: string;
  keyPath?: string;
  /** Repeated `--mandate <role>=<file>` entries. */
  mandates?: { role: string; path: string }[];
  /** A directory with visitor-card.json, visitor.key, optional manifest.json, mandate-<role>.json, and optional probe files. */
  fixturesDir?: string;
};

type Manifest = {
  card?: string;
  key?: string;
  mandates?: Record<string, string>;
  probes?: {
    cross_card?: string;
    cross_place?: string;
    revoked?: { card?: string; mandate?: string; revocation?: string };
    revoked_seat?: { card?: string; mandate?: string; revocation?: string };
    probing?: { card?: string; mandate?: string };
    off_template?: string;
  };
};

const isRole = (s: string): s is MandateRole => (MANDATE_ROLES as readonly string[]).includes(s);

function readJson(path: string): unknown {
  if (!existsSync(path)) throw Object.assign(new Error(`pre-signed file not found: ${path}`), { code: "SHOKAI_PRESIGNED_LOAD" });
  return JSON.parse(readFileSync(path, "utf8"));
}

function asCard(raw: unknown, path: string): SignedCard {
  const c = fromSigningPage(raw) as SignedCard;
  if (!c?.payload || (c.payload as { kind?: string }).kind !== "visitor" || !Array.isArray(c.signatures) || !c.payload_digest) {
    throw Object.assign(new Error(`not a signed Shōkai visitor card: ${path}`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  return c;
}

function asMandate(raw: unknown, path: string): SignedMandate {
  const m = fromSigningPage(raw) as SignedMandate;
  if (!m?.payload || !m.payload.mandate_id || !Array.isArray(m.signatures) || !m.payload_digest) {
    throw Object.assign(new Error(`not a signed Shōkai mandate: ${path}`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  return m;
}

function asRevocation(raw: unknown, path: string): SignedRevocation {
  const r = fromSigningPage(raw) as SignedRevocation;
  if (!r?.payload || !r.payload.card_id || !r.payload.principal_id || !r.payload.revoked_at || !Array.isArray(r.signatures) || !r.payload_digest) {
    throw Object.assign(new Error(`not a signed Shōkai card_revocation: ${path}`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  return r;
}

/** A PasskeyOwner stand-in whose only safe field is the card's principal id. Any signing use throws. */
export function refuseOwnerSign(principalId: string): PasskeyOwner {
  const fail = () => { throw Object.assign(new Error(PRESIGNED_NO_OWNER_SIGN), { code: "SHOKAI_PRESIGNED_NO_OWNER_SIGN" }); };
  return new Proxy({ kind: "passkey" as const, id: principalId, key_id: "presigned-no-owner", rpId: "" } as PasskeyOwner, {
    get(t, prop) {
      if (prop === "id" || prop === "kind" || prop === "key_id" || prop === "rpId") return (t as unknown as Record<string, unknown>)[prop as string];
      fail();
    },
  });
}

function addMandate(into: Partial<Record<MandateRole, SignedMandate>>, role: string, path: string) {
  if (!isRole(role)) {
    throw Object.assign(new Error(`unknown mandate role "${role}" (known: ${MANDATE_ROLES.join(", ")})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  if (into[role]) throw Object.assign(new Error(`mandate role "${role}" given more than once`), { code: "SHOKAI_PRESIGNED_LOAD" });
  into[role] = asMandate(readJson(path), path);
}

function bindCard(keyId: string, card: SignedCard, path: string) {
  if (keyId !== card.payload.representative_id) {
    throw Object.assign(new Error(`the representative key does not match the signed visitor card's representative_id (${path})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
}

function bindRevocation(card: SignedCard, revocation: SignedRevocation, path: string) {
  if (revocation.payload.card_id !== card.payload.card_id) {
    throw Object.assign(new Error(`revocation is not for this card (${path})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  if (revocation.payload.principal_id && card.payload.principal?.principal_id
      && revocation.payload.principal_id !== card.payload.principal.principal_id) {
    throw Object.assign(new Error(`revocation principal does not match the card (${path})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
}

function bindMandateToCard(mand: SignedMandate, card: SignedCard, keyId: string, path: string) {
  if (mand.payload.card_id !== card.payload.card_id) {
    throw Object.assign(new Error(`mandate is not bound to this visitor card (${path})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  if (mand.payload.representative_id !== keyId) {
    throw Object.assign(new Error(`mandate is not for this representative (${path})`), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
}

function maybeFile(dir: string, name: string | undefined): string | undefined {
  if (!name) return undefined;
  const p = join(dir, name);
  return existsSync(p) ? p : undefined;
}

function loadProbes(dir: string, manifest: Manifest | undefined, keyId: string, primaryCardId: string): PresignedProbes {
  const p = manifest?.probes ?? {};
  const probes: PresignedProbes = {};
  const crossCardPath = maybeFile(dir, p.cross_card ?? (existsSync(join(dir, "mandate-cross_card.json")) ? "mandate-cross_card.json" : undefined));
  const crossPlacePath = maybeFile(dir, p.cross_place ?? (existsSync(join(dir, "mandate-cross_place.json")) ? "mandate-cross_place.json" : undefined));
  if (crossCardPath) {
    const m = asMandate(readJson(crossCardPath), crossCardPath);
    if (m.payload.card_id === primaryCardId) {
      throw Object.assign(new Error(`probe "cross_card" must name a different card_id than the primary visitor card`), { code: "SHOKAI_PRESIGNED_LOAD" });
    }
    if (m.payload.representative_id !== keyId) {
      throw Object.assign(new Error(`probe "cross_card" is not for this representative`), { code: "SHOKAI_PRESIGNED_LOAD" });
    }
    probes.cross_card = m;
  }
  if (crossPlacePath) {
    const m = asMandate(readJson(crossPlacePath), crossPlacePath);
    if (m.payload.representative_id !== keyId) {
      throw Object.assign(new Error(`probe "cross_place" is not for this representative`), { code: "SHOKAI_PRESIGNED_LOAD" });
    }
    probes.cross_place = m;
  }
  const revokedCardPath = maybeFile(dir, p.revoked?.card ?? (existsSync(join(dir, "card-revoked.json")) ? "card-revoked.json" : undefined));
  const revokedMandPath = maybeFile(dir, p.revoked?.mandate ?? (existsSync(join(dir, "mandate-revoked.json")) ? "mandate-revoked.json" : undefined));
  const revokedRevPath = maybeFile(dir, p.revoked?.revocation ?? (existsSync(join(dir, "revocation-revoked.json")) ? "revocation-revoked.json" : undefined));
  if (revokedCardPath || revokedMandPath || revokedRevPath) {
    if (!revokedCardPath || !revokedMandPath || !revokedRevPath) throw Object.assign(new Error(`probe "revoked" needs a visitor card, a mandate bound to it, and its signed revocation`), { code: "SHOKAI_PRESIGNED_LOAD" });
    const card = asCard(readJson(revokedCardPath), revokedCardPath);
    const mandate = asMandate(readJson(revokedMandPath), revokedMandPath);
    const revocation = asRevocation(readJson(revokedRevPath), revokedRevPath);
    bindCard(keyId, card, revokedCardPath);
    bindMandateToCard(mandate, card, keyId, revokedMandPath);
    bindRevocation(card, revocation, revokedRevPath);
    probes.revoked = { card, mandate, revocation };
  }
  const seatCardPath = maybeFile(dir, p.revoked_seat?.card ?? (existsSync(join(dir, "card-revoked_seat.json")) ? "card-revoked_seat.json" : undefined));
  const seatMandPath = maybeFile(dir, p.revoked_seat?.mandate ?? (existsSync(join(dir, "mandate-revoked_seat.json")) ? "mandate-revoked_seat.json" : undefined));
  const seatRevPath = maybeFile(dir, p.revoked_seat?.revocation ?? (existsSync(join(dir, "revocation-revoked_seat.json")) ? "revocation-revoked_seat.json" : undefined));
  if (seatCardPath || seatMandPath || seatRevPath) {
    if (!seatCardPath || !seatMandPath || !seatRevPath) throw Object.assign(new Error(`probe "revoked_seat" needs a visitor card, a seating mandate, and its signed revocation`), { code: "SHOKAI_PRESIGNED_LOAD" });
    const card = asCard(readJson(seatCardPath), seatCardPath);
    const mandate = asMandate(readJson(seatMandPath), seatMandPath);
    const revocation = asRevocation(readJson(seatRevPath), seatRevPath);
    bindCard(keyId, card, seatCardPath);
    bindMandateToCard(mandate, card, keyId, seatMandPath);
    bindRevocation(card, revocation, seatRevPath);
    probes.revoked_seat = { card, mandate, revocation };
  }
  const probingCardPath = maybeFile(dir, p.probing?.card ?? (existsSync(join(dir, "card-probing.json")) ? "card-probing.json" : undefined));
  const probingMandPath = maybeFile(dir, p.probing?.mandate ?? (existsSync(join(dir, "mandate-probing.json")) ? "mandate-probing.json" : undefined));
  if (probingCardPath || probingMandPath) {
    if (!probingCardPath || !probingMandPath) throw Object.assign(new Error(`probe "probing" needs a visitor card and a mandate whose only action is unlisted (x-conformance.other)`), { code: "SHOKAI_PRESIGNED_LOAD" });
    const card = asCard(readJson(probingCardPath), probingCardPath);
    const mandate = asMandate(readJson(probingMandPath), probingMandPath);
    bindCard(keyId, card, probingCardPath);
    bindMandateToCard(mandate, card, keyId, probingMandPath);
    probes.probing = { card, mandate };
  }
  const offPath = maybeFile(dir, p.off_template ?? (existsSync(join(dir, "card-off_template.json")) ? "card-off_template.json" : undefined));
  if (offPath) {
    const card = asCard(readJson(offPath), offPath);
    bindCard(keyId, card, offPath);
    probes.off_template = card;
  }
  return probes;
}

/** Load a visitor card, representative key, and any named mandates. Never prints the key. */
export function loadPresigned(opts: PresignedLoad): PresignedMaterial {
  let cardPath = opts.cardPath, keyPath = opts.keyPath;
  const mandates: Partial<Record<MandateRole, SignedMandate>> = {};
  let source = "flags";
  let manifest: Manifest | undefined;
  let fixturesDir: string | undefined;
  if (opts.fixturesDir) {
    const dir = opts.fixturesDir;
    fixturesDir = dir;
    source = dir;
    const manifestPath = join(dir, "manifest.json");
    if (existsSync(manifestPath)) manifest = readJson(manifestPath) as Manifest;
    cardPath = cardPath ?? join(dir, manifest?.card ?? (existsSync(join(dir, "visitor-card.json")) ? "visitor-card.json" : "card.json"));
    keyPath = keyPath ?? join(dir, manifest?.key ?? "visitor.key");
    if (manifest?.mandates) for (const [role, file] of Object.entries(manifest.mandates)) addMandate(mandates, role, join(dir, file));
    else {
      for (const name of readdirSync(dir)) {
        const m = /^mandate-([a-z0-9_]+)\.json$/i.exec(name);
        if (m && isRole(m[1]!)) addMandate(mandates, m[1]!, join(dir, name));
      }
    }
  }
  for (const m of opts.mandates ?? []) addMandate(mandates, m.role, m.path);
  if (!cardPath || !keyPath) {
    throw Object.assign(new Error("pre-signed material needs a visitor card and the representative key (--card and --key, or --visitor-fixtures <dir>)"), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  const card = asCard(readJson(cardPath), cardPath);
  const key = importRepresentativeKey(readFileSync(keyPath, "utf8"));
  if (key.id !== card.payload.representative_id) {
    throw Object.assign(new Error("the representative key does not match the signed visitor card's representative_id"), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  for (const [role, mand] of Object.entries(mandates) as [MandateRole, SignedMandate][]) {
    if (mand.payload.card_id !== card.payload.card_id) {
      throw Object.assign(new Error(`mandate role "${role}" is not bound to this visitor card (card_id ${mand.payload.card_id})`), { code: "SHOKAI_PRESIGNED_LOAD" });
    }
    if (mand.payload.representative_id !== key.id) {
      throw Object.assign(new Error(`mandate role "${role}" is not for this representative`), { code: "SHOKAI_PRESIGNED_LOAD" });
    }
  }
  if (mandates.c300 && (mandates.c300.payload as { min_protocol?: unknown }).min_protocol !== "0.5") {
    throw Object.assign(new Error('mandate role "c300" must carry min_protocol the literal string "0.5" (not a wire tag); the runner will not rewrite it'), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  if (mandates.c301 && (mandates.c301.payload as { min_protocol?: unknown }).min_protocol !== "shokai/0.6") {
    throw Object.assign(new Error('mandate role "c301" must carry min_protocol "shokai/0.6"; the runner will not rewrite it'), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  const probes = fixturesDir ? loadProbes(fixturesDir, manifest, key.id, card.payload.card_id) : {};
  const ownerName = card.payload.principal?.display_name ?? "pre-signed visitor";
  return { key, card, mandates, probes, ownerName, source };
}

/** A representative that presents the pre-signed card and cannot sign as the owner. */
export function createPresignedRep(p: PresignedMaterial, opts: { purposes: string[]; actions: string[]; card?: SignedCard }): Representative {
  const card = opts.card ?? p.card;
  if (p.key.id !== card.payload.representative_id) {
    throw Object.assign(new Error("the representative key does not match the signed visitor card's representative_id"), { code: "SHOKAI_PRESIGNED_LOAD" });
  }
  return createRepresentative({
    ownerName: p.ownerName,
    key: p.key,
    card,
    purposes: opts.purposes as any,
    actions: opts.actions,
    owner: refuseOwnerSign(card.payload.principal.principal_id),
  });
}

/** Development-path representative, or the pre-signed one when material is present. */
export function visitorRep(presigned: PresignedMaterial | undefined, opts: { ownerName: string; purposes: string[]; actions: string[]; card?: SignedCard }): Representative {
  if (presigned) return createPresignedRep(presigned, { purposes: opts.purposes, actions: opts.actions, card: opts.card });
  return createRepresentative({ ownerName: opts.ownerName, purposes: opts.purposes as any, actions: opts.actions });
}
