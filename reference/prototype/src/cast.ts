/**
 * The fictional world: owners, introducers, example hosts and visitors.
 * Every organization and person here is FICTIONAL, including Aya Linden (the example owner),
 * whose representative's details are illustrative. Kiran Vale is a fictional
 * fictional stand-in; all of Kiran's details are invented.
 */
import type {
  CardProvenance, CardClaim, EtiquettePreferences, Limits, MeaningNote, PrincipalImprint, PurposeCode,
  RelationshipEdge, RepresentativeCard, SeekingItem, SignedCard, SignedMandate, SignedSeekingDeclaration, SignedVouch,
} from "../../../protocol-shapes.js";
import { type AnyKey, ed25519FromLabel, passkeyFromLabel, publishDidWeb, publishEvidence, signed, digestOf } from "./crypto.js";
import { Clock } from "./clock.js";
import { type Directory, type HostProfile, type Party, type Phrases, Representative, RevocationLog } from "./representative.js";
import type { Recorder } from "./transcript.js";
import type { PolicyView } from "./decide.js";
import { setStatusSigner } from "./owner.js";

// ---------- phrases (courtesy layer) ----------
const EN_BASE: Record<string, string> = {
  greet: "Hello, and welcome.", welcome_back: "Welcome back. It's good to see you again.", receipt: "Thank you. I've received your card.",
  grant: "Thank you for coming. You're welcome to proceed.", grant_again: "Welcome back. This time we can seat you. Thank you for returning prepared.",
  considering: "I can't decide this myself. I'll take it to {who}, who decides, and reply within {days} days. Nothing is decided yet.",
  conditional: "We can proceed within your current mandate.", deny: "Thank you for visiting. We can't extend an invitation for this request.",
  considering_extended: "We need a little more time. Nothing has been decided yet; we'll answer by the new date.",
  deny_never: "We are unable to extend an invitation.", not_now_unprepared: "Thank you for stopping by. We can't seat you yet, and here is exactly what would let us.",
  not_now_ready: "Thank you. One more thing is needed before we can seat you.", farewell: "Thank you for your time. Goodbye for now.",
  farewell_declined: "Thank you for visiting. We hope to welcome you properly another time.", act_refused: "I can't do {tool} under this seat. With your owner's confirmation, ask again.",
  outcome_grant: "Good news: our team would like to go ahead. Please return to begin.",
  rr_card: "A representative card (a signed profile with backed-up claims).",
  rr_owner_binding: "Proof that you really represent your owner: your owner signs your mandate with their passkey.",
  rr_purpose: "A stated purpose: what you're here to do, as a structured request.",
  rr_introduction: "An introduction: a signed vouch from someone we know.",
  rr_claim_evidence: "Stronger evidence for a claim this request depends on.",
  rr_possession_proof: "A proof of possession: start a new visit (a fresh greeting, so a fresh encounter_id and nonce) and present your card with a signature by the card's key over that meeting's encounter_id and our nonce (SPEC §2.4).",
  rr_owner_consent: "Your owner's signed consent for this (a passkey OwnerConsent, SPEC §8.1).",
  // v0.2.3 (§3.3): owner-facing sentences, shown to the OWNER as-is (no protocol words).
  rro_card: "Your assistant needs a profile card that you sign once, saying who it works for.",
  rro_owner_binding: "Please confirm with Face ID or your passkey that this assistant really works for you.",
  rro_purpose: "Your assistant needs to say clearly what it is here to do, with your permission for that.",
  rro_introduction: "This place asks for an introduction from someone they already know.",
  // v0.2.4 (newcomer-3-007): owner_text must not contradict `required`. An optional item says it would help.
  rro_introduction_optional: "An introduction from someone this place already knows would help, but it isn't needed.",
  rro_claim_evidence: "This place wants to see proof for one thing your profile says, like a link to your work.",
  rro_possession_proof: "Your assistant needs to prove the card is really its own. It can fix this itself and try again; you don't need to do anything.",
  rro_owner_consent: "This needs your own yes, confirmed with Face ID or your passkey.",
  farewell_never: "Thank you. This meeting is closed.",
  ctx_not_now: "At this moment we seat only representatives who can show who they represent.", ctx_not_a_fit: "At this moment this isn't something we offer.",
};
const en = (o: Record<string, string>) => ({ ...EN_BASE, ...o });
/** v0.2.1 (D10): a non-English dictionary carries only what is really written in that language; missing keys fall back to en-US, labelled en-US. */
const loc = (o: Record<string, string>) => ({ ...o });

// ---------- world ----------
export type World = ReturnType<typeof makeWorld>;

export function makeWorld(rec: Recorder, start = "2026-10-26T16:00:00Z") {
  const clock = new Clock(start);
  const revocations = new RevocationLog();
  const directory: Directory = new Map();
  const party = (id: string, name: string, key: AnyKey, locale = "en-US", onNotice?: Party["onNotice"]): Party => {
    const p: Party = { id, name, key, locale, onNotice }; directory.set(id, p); return p;
  };

  // Owners (persons) sign with SIMULATED passkeys (did:jwk).
  const ayaKey = passkeyFromLabel("aya"), mikaKey = passkeyFromLabel("mika"), danaKey = passkeyFromLabel("dana"), kiranKey = passkeyFromLabel("kiran");
  const aya = party(ayaKey.did, "Aya Linden", ayaKey);
  const mika = party(mikaKey.did, "Mika (fictional friend of Aya)", mikaKey);
  const dana = party(danaKey.did, "Dana (fictional owner)", danaKey);
  const kiran = party(kiranKey.did, "Kiran Vale (fictional stand-in)", kiranKey);
  publishDidWeb("did:web:aya.example", ayaKey.publicKey); // SIMULATED: Aya controls aya.example
  // v0.2.2 (D7): the owners' chat binding (SIMULATED platform). Its key alone signs chat_reply consents.
  const platformKey = ed25519FromLabel("platform:owner-chat");
  setStatusSigner(platformKey); // v0.2.3: the binding's platform key signs published AllowanceStatus documents

  // Organizations sign with did:web keys (SIMULATED registry).
  const org = (domain: string, name: string) => {
    const did = `did:web:${domain}`; const k = ed25519FromLabel(`org:${domain}`, did); publishDidWeb(did, k.publicKey);
    return party(did, name, k);
  };
  const fernwood = org("fernwood.example", "Fernwood Goods");
  const maison = org("maison-ardoise.example", "Maison Ardoise");
  const harbor = org("harborlight.example", "Harborlight Savings & Trust");
  const lantern = org("lantern-collective.example", "The Lantern Collective");
  const quickgain = org("quickgain.example", "Quickgain Leads");
  const looseTiesKey = ed25519FromLabel("loose-ties");
  const looseTies = party(looseTiesKey.did, "Loose Ties Network", looseTiesKey);

  const meaningMutirao: MeaningNote = {
    term: "mutirão", source_locale: "pt-BR",
    literal_gloss: { text: "collective work effort", locale: "en-US" },
    intended_meaning: [
      { text: "Quando a comunidade se junta, de forma voluntária, para realizar algo que ninguém faria sozinho, e todos ajudam e aprendem.", locale: "pt-BR" },
      { text: "When a community comes together voluntarily to build something no one could do alone, and everyone helps and learns.", locale: "en-US" },
    ],
    concept_tags: ["collective_effort", "reciprocity"],
    usage_context: { text: "How the collective runs its sessions and gives feedback.", locale: "en-US" },
    human_explanation_hint: { text: "Explain as a shared barn-raising for creative work; give one example.", locale: "en-US" },
    confidence: { value: 1, source: "principal" },
  };

  const seeking = (p: Party, id: string, version: string, items: SeekingItem[]): SignedSeekingDeclaration =>
    signed({ seeking_id: id, version, host: { principal_id: p.id, display_name: p.name }, items, published_at: clock.now(), expires_at: clock.plusDays(90) }, [p.key], clock.now());
  const item = (item_id: string, area: PurposeCode, text: string, status: SeekingItem["status"] = "open", locale = "en-US", notes?: MeaningNote[]): SeekingItem =>
    ({ item_id, area, summary: { text, locale, meaning_notes: notes }, status });

  const policy = (p: Partial<PolicyView> & { policy_version: string; standard_actions: string[] }): PolicyView => ({
    requires_owner_binding: true, requires_introduction: false, limits: {}, seat_levels: ["advise"], min_proof: [], ...p,
  });

  const shared = { rec, clock, revocations, directory };
  const hostRep = (owner: Party, name: string, label: string, profile: HostProfile, locales: string[]) => {
    const r = new Representative({ name, repKey: ed25519FromLabel(`rep:${label}`), principal: { principal_id: owner.id, kind: owner.id.startsWith("did:web:") ? "company" : "person", display_name: owner.name }, principalKey: owner.key, locales, ownerLocale: "en-US", profile, ...shared });
    return r;
  };
  const norms = (locales: string[], formality: EtiquettePreferences["formality"], tags: string[], notes?: MeaningNote[]): EtiquettePreferences => ({ locales, formality, norms: tags, meaning_notes: notes });

  // ---- Host 1: online store ----
  const fernwoodRep = hostRep(fernwood, "Fernwood's representative", "fernwood", {
    policy: policy({ policy_version: "fernwood-2026.10", standard_actions: ["store.browse_catalog", "store.request_quote", "store.place_order", "store.join_reviewer_program"],
      limits: { max_amount: { value: "500.00", currency: "USD" }, max_operations: 5 }, seat_levels: ["act_on_behalf"],
      min_proof: [{ action: "store.join_reviewer_program", target: "imprint.expertise", level: "evidenced" }],
      // v0.2.2 (D11): a learn visit and a buy visit are treated differently; placing an order moves money.
      by_purpose: { visitation: ["store.browse_catalog", "store.request_quote"] }, spending_actions: ["store.place_order"] }),
    phrases: {
      "en-US": en({ about: "We're Fernwood Goods, a small online shop for handmade ceramics and home goods from independent makers.", how: "Representatives present a signed card, show they're truly sent by their owner, and say what they'd like to do. We seat them for that and nothing more.", greet: "Hello, and welcome to Fernwood Goods." }),
      // v0.2.3: a complete es-ES dictionary, so every courtesy to an es-ES visitor is es-ES/exact (L0a/L0b).
      "es-ES": loc({ greet: "Hola, bienvenido a Fernwood Goods.", about: "Somos Fernwood Goods, una pequeña tienda en línea de cerámica hecha a mano.", how: "Los representantes presentan una tarjeta firmada y dicen qué desean hacer.",
        welcome_back: "Bienvenido de nuevo. Nos alegra volver a verle.", receipt: "Gracias. He recibido su tarjeta.",
        grant: "Gracias por venir. Puede continuar.", grant_again: "Bienvenido de nuevo. Esta vez podemos darle asiento. Gracias por volver preparado.",
        considering: "No puedo decidirlo yo. Se lo llevaré a {who}, que decide, y responderé en {days} días. Aún no hay nada decidido.",
        conditional: "Podemos continuar dentro de su mandato actual.", deny: "Gracias por su visita. No podemos extender una invitación para esta solicitud.",
        deny_never: "No podemos extender una invitación.", not_now_unprepared: "Gracias por pasar. Aún no podemos darle asiento; esto es exactamente lo que lo haría posible.",
        not_now_ready: "Gracias. Falta una cosa más antes de darle asiento.", farewell: "Gracias por su tiempo. Hasta pronto.",
        farewell_declined: "Gracias por su visita. Esperamos recibirle como corresponde en otra ocasión.", farewell_never: "Gracias. Este encuentro ha terminado.",
        act_refused: "No puedo hacer {tool} con este asiento. Con la confirmación de su titular, vuelva a pedirlo.",
        rr_card: "Una tarjeta de representante (un perfil firmado con afirmaciones respaldadas).",
        rr_owner_binding: "Prueba de que representa a su titular: su titular firma su mandato con su llave de acceso (passkey).",
        rr_purpose: "Un propósito declarado: lo que viene a hacer, como solicitud estructurada.",
        rr_introduction: "Una presentación: un aval firmado por alguien que conocemos.",
        rr_claim_evidence: "Pruebas más sólidas para una afirmación de la que depende esta solicitud.",
        rr_possession_proof: "Una prueba de posesión: inicie una nueva visita (un saludo nuevo, con encounter_id y nonce nuevos) y presente su tarjeta con una firma de la clave de la tarjeta sobre el encounter_id de esa reunión y nuestro nonce (SPEC §2.4).",
        rr_owner_consent: "El consentimiento firmado de su titular (un OwnerConsent con passkey, SPEC §8.1).",
        rro_card: "Su asistente necesita una tarjeta de perfil que usted firma una vez, diciendo para quién trabaja.",
        rro_owner_binding: "Confirme con Face ID o su llave de acceso que este asistente trabaja de verdad para usted.",
        rro_purpose: "Su asistente debe decir claramente a qué viene, con su permiso para ello.",
        rro_introduction: "Este lugar pide una presentación de alguien a quien ya conocen.",
        rro_introduction_optional: "Una presentación de alguien a quien este lugar ya conoce ayudaría, pero no es necesaria.",
        rro_claim_evidence: "Este lugar quiere ver una prueba de algo que dice su perfil, como un enlace a su trabajo.",
        rro_possession_proof: "Su asistente debe demostrar que la tarjeta es suya. Puede corregirlo solo e intentarlo de nuevo; usted no tiene que hacer nada.",
        rro_owner_consent: "Esto necesita su propio sí, confirmado con Face ID o su llave de acceso.",
        ctx_not_now: "En este momento solo damos asiento a representantes que pueden mostrar a quién representan.", ctx_not_a_fit: "En este momento esto no es algo que ofrezcamos.",
        outcome_grant: "Buenas noticias: nuestro equipo quiere seguir adelante. Vuelva para empezar." }),
    },
    seeking: seeking(fernwood, "seek-fernwood", "v2", [item("reviewers", "x-reviews", "Early reviewers for our new handmade ceramics line"), item("bilingual", "support", "Bilingual (English/Spanish) product descriptions")]),
    onboarding_url: "https://fernwood.example/shokai/onboard", probe_threshold: 3, norms: norms(["en-US", "es-ES"], "neutral", ["plain_language", "brief_greetings"]),
    slug: "fernwood", category: "store", purposes: [
      { code: "purchase", statement: { text: "Buying goods for your owner, within a signed spending allowance.", locale: "en-US" } },
      { code: "visitation", statement: { text: "Looking around and asking questions. No spending allowance needed.", locale: "en-US" } },
      { code: "x-reviews", statement: { text: "Reviewing new pieces as an early reviewer.", locale: "en-US" } },
    ],
  }, ["en-US", "es-ES"]);

  // ---- Host 2: heritage luxury fashion house ----
  const maisonRep = hostRep(maison, "Maison Ardoise's representative", "maison", {
    policy: policy({ policy_version: "ardoise-2026.10", requires_introduction: true, standard_actions: ["maison.discovery_conversation", "maison.receive_brand_brief"],
      consideration: { actions: ["maison.propose_collaboration"], route: { kind: "role", role: "Creative Director", human: true }, days: 10 },
      min_proof: [{ action: "maison.discovery_conversation", target: "imprint.worldview", level: "vouched" }, { action: "maison.receive_brand_brief", target: "imprint.expertise", level: "evidenced" }] }),
    phrases: {
      "en-US": en({ greet: "Good afternoon, and welcome to Maison Ardoise.", about: "Maison Ardoise is a heritage house. We value craftsmanship, restraint and things made to last.", how: "We welcome introduced representatives whose values we can verify. We read your card carefully before any conversation.", grant: "Thank you. We would be glad to begin a conversation." }),
      "fr-FR": loc({ greet: "Bonjour, et bienvenue à la Maison Ardoise.", about: "La Maison Ardoise est une maison patrimoniale : savoir-faire, sobriété, durabilité.", grant: "Merci. Nous serions heureux d'entamer la conversation." }),
    },
    seeking: seeking(maison, "seek-ardoise", "v1", [item("creators", "collaboration", "Creators and storytellers whose work honors craft, restraint and longevity"), item("archive", "x-archive", "Archivists for our early pattern books", "paused")]),
    slug: "maison-ardoise", category: "store", purposes: [{ code: "x-archive", statement: { text: "Helping with our early pattern-book archive.", locale: "en-US" } }],
    onboarding_url: "https://maison-ardoise.example/shokai/onboard", probe_threshold: 3, norms: norms(["fr-FR", "en-US"], "formal", ["titles", "no_small_talk"]),
  }, ["fr-FR", "en-US"]);

  // ---- Host 3: bank gatekeeper ----
  const harborRep = hostRep(harbor, "Harborlight's gatekeeper", "harborlight", {
    policy: policy({ policy_version: "harborlight-gate-2026.10", requires_introduction: true, standard_actions: ["bank.product_info", "bank.book_branch_meeting"],
      consideration: { actions: ["bank.propose_agent_pilot"], route: { kind: "role", role: "Head of Digital Partnerships", human: true }, days: 14 },
      min_proof: [{ action: "bank.propose_agent_pilot", target: "claim.identity", level: "verified" }] }),
    phrases: { "en-US": en({ greet: "Good afternoon. Welcome to Harborlight Savings & Trust.", about: "Harborlight is a member-owned savings bank.", how: "We meet introduced representatives with a verified identity and a signed mandate." }) },
    seeking: seeking(harbor, "seek-harborlight", "v1", [item("pilots", "x-partnership", "Responsible agent-access pilots with verified partners")]),
    slug: "harborlight", category: "bank", purposes: [{ code: "x-partnership", statement: { text: "Proposing a partnership, such as an agent-access pilot.", locale: "en-US" } }],
    onboarding_url: "https://harborlight.example/shokai/onboard", probe_threshold: 3, close_on_deny: "final_only", norms: norms(["en-US"], "formal", ["precise", "no_small_talk"]),
  }, ["en-US"]);

  // ---- Host 4: introduction-first creative community ----
  const lanternRep = hostRep(lantern, "Lantern's host", "lantern", {
    policy: policy({ policy_version: "lantern-2026.10", requires_introduction: true, standard_actions: ["community.attend_session", "community.receive_lesson"] }),
    phrases: {
      "pt-BR": loc({ greet: "Olá, que bom ter você aqui.", about: "Somos o Lantern Collective, um coletivo criativo que funciona por apresentações.", grant: "Seja bem-vindo à roda." }),
      "en-US": en({ greet: "Hello, and welcome to the Lantern Collective.", about: "We're a creative collective. People join through introductions, and we work in the spirit of mutirão.", how: "Come introduced by someone we know. Teaching and learning are both welcome.", grant: "Welcome to the circle." }),
    },
    seeking: seeking(lantern, "seek-lantern", "v1", [item("peers", "teaching", "Peers who learn and teach in the spirit of mutirão", "open", "en-US", [meaningMutirao])]),
    slug: "lantern", category: "education", purposes: [], onboarding_url: "https://lantern-collective.example/join", probe_threshold: 3, norms: norms(["pt-BR", "en-US"], "casual", ["first_names", "mutirao"], [meaningMutirao]),
  }, ["pt-BR", "en-US"]);

  // ---------- the steward (protocol agent): issues cards and mandates the owner signs ----------
  function issueCard(rep: Representative, owner: Party, o: { role: string; purposes: PurposeCode[]; actions: string[]; claims?: CardClaim[]; imprint?: PrincipalImprint; provenance?: CardProvenance; tier?: "provisional" | "standard" | "senior" }): SignedCard {
    const card: RepresentativeCard = {
      card_id: `card-${rep.name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}`, protocol: "shokai/0.3", representative_id: rep.repKey.did,
      principal: { principal_id: owner.id, kind: owner.id.startsWith("did:web:") ? "company" : "person", display_name: owner.name },
      role: o.role, standing: { tier: o.tier ?? "standard" }, mandate_scope: { purposes: o.purposes, actions: o.actions }, locales: rep.locales,
      etiquette: { locales: rep.locales, formality: "neutral" },
      representative_key: { key_id: rep.repKey.keyId, alg: "Ed25519", public_key: rep.repKey.publicKey.export({ format: "jwk" }).x as string },
      issued_at: clock.now(), expires_at: clock.plusDays(30), claims: o.claims, imprint: o.imprint, provenance: o.provenance,
      owner_binding: owner.key.kind === "passkey" ? { method: "passkey_webauthn", owner_id: owner.id, platform_key: platformKey.did, rp_id: owner.key.rpId } : undefined,
    };
    rep.card = signed(card, [owner.key], clock.now());
    return rep.card;
  }
  function issueMandate(rep: Representative, owner: Party, id: string, purpose: PurposeCode, statement: string, actions: string[], limits: Limits = {}): SignedMandate {
    const m = signed({ mandate_id: id, principal_id: owner.id, representative_id: rep.repKey.did, card_id: rep.card!.payload.card_id, purpose: { code: purpose, statement, locale: "en-US" },
      allowed_actions: actions, limits, valid_from: clock.now(), expires_at: clock.plusDays(30) }, [owner.key], clock.now());
    rep.mandates.set(id, m); return m;
  }
  function issueVouch(introducer: Party, rep: Representative, purposes: PurposeCode[], relationship: string, id: string, claims?: string[]): SignedVouch {
    return signed({ vouch_id: id, introducer: { principal_id: introducer.id, display_name: introducer.name }, subject: { representative_id: rep.repKey.did, card_digest: rep.card!.payload_digest },
      scope: { purposes, claims }, revocation_log: revocations.address, relationship, issued_at: clock.now(), expires_at: clock.plusDays(60) }, [introducer.key], clock.now());
  }
  /** v0.2.1 §9.2: both owners sign JCS({edge_id, from, to, kind, since}); standing and history stay local and unsigned. */
  function friendEdge(a: Party, b: Party, since: string): RelationshipEdge {
    const att = { edge_id: `friend-${a.name.split(" ")[0]}-${b.name.split(" ")[0]}`.toLowerCase(), from: a.id, to: b.id, kind: "friend" as const, since };
    const s = signed(att, [a.key, b.key], clock.now());
    return { ...att, standing: "strong" as const, history: [{ at: since, event: "friendship (invented example date)" }, { at: clock.now(), event: "mutually attested by both owners' passkeys" }], attestations: s.signatures };
  }

  // ---------- visitors ----------
  const VIS_EN: Phrases = { "en-US": en({ greet: "Hello, thank you for having me.", farewell: "Thank you for your time. Goodbye for now." }) };
  const ayaRep = new Representative({ name: "Aya's representative", repKey: ed25519FromLabel("rep:aya"), principal: { principal_id: aya.id, kind: "person", display_name: "Aya Linden" }, principalKey: ayaKey, locales: ["en-US", "ja-JP"], ownerLocale: "en-US", phrases: VIS_EN, ...shared });
  const ALL_Aya = ["store.browse_catalog", "store.request_quote", "store.place_order", "store.join_reviewer_program", "maison.discovery_conversation", "maison.receive_brand_brief",
    "bank.product_info", "bank.propose_agent_pilot", "bank.pilot_intro_call", "community.attend_session", "community.receive_lesson", "peer.share_project_brief", "peer.propose_owner_call", "peer.share_portfolio_sample", "peer.commit_to_project", "gathering.attend", "gathering.request_invitation"];
  const mikaVouchId = "vouch-mika-aya";
  issueCard(ayaRep, aya, {
    role: "Personal representative of Aya", purposes: ["purchase", "visitation", "invitation", "introduction", "collaboration", "x-partnership", "teaching"], actions: ALL_Aya, tier: "senior",
    claims: [
      { claim_id: "c-identity", area: "identity", text: { text: "Represents Aya Linden, a person", locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "account_control", ref: `passkey:${aya.id}` }] },
      { claim_id: "c-domain", area: "domain", text: { text: "Aya controls aya.example", locale: "en-US" }, proof_level: "verified", evidence_refs: [{ kind: "did_web", ref: "did:web:aya.example" }] },
    ],
    imprint: {
      expertise: [
        { facet_id: "x1", text: { text: "Product design for agent-to-agent protocols", locale: "en-US" }, proof_level: "evidenced", evidence_refs: [{ kind: "url", ref: "https://aya.example/work/shokai", content_digest: publishEvidence("https://aya.example/work/shokai", "Shōkai: an open protocol where agents are representatives. Design notes and specification drafts.") }] },
        { facet_id: "x2", text: { text: "Brand storytelling for heritage projects", locale: "en-US" }, proof_level: "evidenced", evidence_refs: [{ kind: "post", ref: "https://aya.example/notes/heritage", content_digest: publishEvidence("https://aya.example/notes/heritage", "Notes on telling the story of heritage craft, slowly.") }] },
      ],
      worldview: [{ facet_id: "w1", text: { text: "Agents are representatives, not representations", locale: "en-US" }, proof_level: "vouched", evidence_refs: [{ kind: "vouch", ref: mikaVouchId }] }],
      working_style: [{ facet_id: "s1", text: { text: "Warm, unhurried and honest; decides with evidence", locale: "en-US" }, proof_level: "self_declared", evidence_refs: [] }],
      taste: [{ facet_id: "t1", text: { text: "Restraint and Japanese-inspired hospitality", locale: "en-US" }, proof_level: "self_declared", evidence_refs: [] }],
    },
    provenance: { designed_with: { steward_id: "shokai:steward:guide-1" }, design_started_at: "2026-10-12T16:00:00Z", last_reviewed_at: clock.now(), sessions_count: 10, coverage: { purpose: { text: "Introductions, partnerships, learning and small purchases on Aya's behalf.", locale: "en-US" } }, observation: { started_at: "2026-10-19T16:00:00Z", ended_at: "2026-10-24T16:00:00Z", decisions_observed: 14 } },
  });
  const mikaVouch = issueVouch(mika, ayaRep, ["x-partnership", "teaching", "collaboration"], "friend_of_many_years", mikaVouchId);

  return {
    clock, revocations, directory, rec, platformKey,
    owners: { aya, mika, dana, kiran }, orgs: { fernwood, maison, harbor, lantern, quickgain, looseTies },
    hosts: { fernwoodRep, maisonRep, harborRep, lanternRep },
    ayaRep, mikaVouch, meaningMutirao, ALL_Aya,
    issueCard, issueMandate, issueVouch, friendEdge, policy, en, VIS_EN, shared, digestOf,
  };
}
