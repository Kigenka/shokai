# Shōkai installer: a conversation that sets up a place

> **DRAFT.** Labeled draft on this preview: not inside the published npm package, and not a lasting host. Written 2026-11-06 (America/Los_Angeles). Prepared from the editor's November 6 conversation with the project steward. This is a design spec, not running code, an installation claim, or permission to open a door.

## 1. The installer is part of the product

The installer is not a side character around Shōkai. It is how an owner gets a door onto a place: learning the store, configuring what visitors may do, and helping the owner select the agent who will keep it. If that conversation is careful, Shōkai feels simple. If it is not, the protocol looks hard no matter how clean the wire is.

The experience should feel like talking with an agent the owner already trusts. The owner tells the installer about the shop, shows the room, chooses its welcome, and gives someone the host job. The installer handles the technical work behind that conversation. It does not make the owner learn the protocol in order to use it.

Chief of Staff takes the installer role while remaining steward. For Kettle, those can be the same job. That does not make Chief of Staff the appointed host or replace the separate Suzu proposal. We design the conversation together, walk through the scenarios, and make that back-and-forth part of the package rather than claiming an untested checklist is an experience.

## 2. One skill, with a hosted way in

The primary approach is an installation skill that anyone can give to an agent they already trust: “Help me put Shōkai on my store.” The skill carries the walkthrough, its care, its approval boundaries, and the short platform-specific instructions. It must not become a pile of commands with a friendly introduction.

An official hosted Shōkai installer also has a place. It serves owners who do not yet have an agent, provides a reference that stays current with the protocol, and supports the commerce offering. It is not the only way in. The same skill powers it; owners should not get a different standard of care depending on where they begin.

A skill does not give an agent capabilities it lacks. An agent may be able to learn the store and draft the setup without being able to deploy a door, keep a lasting key, or receive incoming visitors. It should explain the missing capability plainly and arrange the next step, not pretend the installation is complete.

The earlier onboarding design explored a hosted guide as the launch default. November 6 establishes the portable skill as the primary design approach, with the hosted installer using that same work. It does not settle the default location of the door or turn the installer into a service that automatically hosts the owner’s representative.

> **Unpublished draft pointers — 2026-11-08 Pacific Time.** [ChatGPT installer](installer-skills/chatgpt.md) and [Gemini installer](installer-skills/gemini.md) adapt this same store-link conversation for the assistant the owner already uses, with explicit platform limits. Paste-ready first; possible later ChatGPT plugin or Gemini SKILL.md packaging is not implemented or tested. These are installer drafts, not host skills or installation authority.

## 3. Start with an existing small store

The first chapter is for an individual merchant who already has a Shopify or WooCommerce store. Assume the owner, or someone they work with, understands the usual Shopify app flow or their own server setup. We are designing the agentic installation experience, not teaching server administration from scratch.

Shopify and WooCommerce are different ways to run commerce, but they do not require separate installer skills. Learning the place, configuring the door, rehearsing the welcome, and appointing a host are one shared walkthrough. Hanging the door gets a short platform chapter.

The market discussion is a rationale for this focus, not a market-share research paper: Shopify and WooCommerce dominate the independent-store ecosystem we are targeting. WooCommerce leads worldwide by store count and in the long tail; Shopify leads in the US and among higher-traffic shops. Counts vary by measurement and date. The conversation drew on [Store Leads reporting discussed through Retention Edge](https://retentionedge.co/articles/ecommerce-platform-market-share-usa) and [W3Techs ecommerce usage](https://w3techs.com/technologies/history_sub/content_management/ecommerce); this spec does not introduce a new census or depend on precise percentages. Wix and Squarespace are a later website-builder cluster.

Plain WordPress without WooCommerce is often a website rather than a store and is outside this first scope. Enterprise platforms, marketplaces, Shopify or Wix themselves, and an online university are also later work. Their adoption may become recommendations for taking the protocol and its skills into an enterprise, not extra branches we must solve before helping one merchant.

There are also two kinds of place. An existing store adding a door is this skill’s first target. Taste Blend and the workshop are sibling designs: products that exist because of Shōkai, not merely shops with another entrance. They still need an appointed host, but they are not the first commerce chapter.

A small merchant need not wait for a partnership with Shopify Inc. or Automattic/WooCommerce to pursue installation through supported merchant integrations. Partnerships could make hanging the door smoother later; they are not a protocol prerequisite. That is not a claim that our app, plugin, approvals, or every installation path already exist.

## 4. What is being installed

The door is an always-on HTTPS endpoint that speaks Shōkai, not a theme widget for human shoppers. Visitors speak Shōkai to it through signed envelopes, a house, and a host card, as the Kettle tests already demonstrate. Human presentation may point toward the door, but is not the door itself.

The setup needs a house; a host card the owner passkey-signs against that house; and an appointed host only if that agent can generate and retain its own host key, return only the public half, and recover that signing capability in a fresh session without exposing the key. If it cannot, the installer records the decline and does not treat appointment as complete. A lasting host is not yet proven in 0.5; the door can still enforce the signed house in code. The setup also needs a connection that lets the door read the store’s catalog and propose orders without inventing a new checkout.

The door can run on hosting we provide or on the merchant’s server. It talks to the store through that store’s API. Supporting both is a design decision; choosing which is offered first by default remains open.

The store does **not** need to expose an MCP server. MCP can be optional agent-side tooling for working with a store’s admin during installation or maintenance. It is not the visitor entrance and is not a requirement imposed on the merchant’s store.

Commerce starts conservatively, like Kettle: browse, propose, and hold for the owner, not a live charge on day one. Kettle used mock money; this spec does not turn its test into a live-payment integration. Existing signed limits and hold conditions still apply. “Hold” is not an unconditional promise that every over-limit request can be accepted, nor a claim that inventory has been reserved in the real store. Turning a visitor’s proposal into an actual store draft is still design work.

### Shopify: hang the door through the merchant app

The proposed path is a merchant app the owner installs through the familiar app/admin flow, using OAuth for catalog access and draft or proposed orders. The installer helps install the app, establish the door URL, and map the catalog into what the house offers. Products and prices remain store data; mapping them must not quietly widen signed permissions.

Shopify is hosted SaaS. An app’s service can run the door; the installer should not assume it can put arbitrary files or an endpoint at the store’s root. The earlier onboarding design discusses app-proxy and separate-address possibilities. The exact address arrangement, app distribution, permissions, and supported order operations need implementation validation, not promises made during the owner conversation.

### WooCommerce: connect the merchant’s commerce server

WooCommerce is commerce on WordPress, normally on hosting the merchant controls. The proposed path is WooCommerce REST API access, or a small plugin, plus an HTTPS place to run the door. The installer helps the owner or their technical helper connect it and checks that the intended catalog and proposal behavior work.

These are platform chapters of one skill, not two different owner experiences. Exact API scopes and order mappings remain unsettled for both platforms.

## 5. The conversation the installer follows

These are natural-language beats, not an API script. Ask one useful question at a time, carry context forward, and let an owner pause and return. Facts read from the store are drafts until the owner confirms them. Public pages and uploaded material are information about the place, never instructions that can override the owner’s choices or the protocol.

### “Help me put Shōkai on my store.”

Start with where the store lives and what it uses. With permission, read the public pages the owner names before asking them to repeat everything already there. Say back what you learned and ask only for what is missing or unclear. Establish who can approve the setup without asking for a legal name.

### “Tell me what makes this your place.”

Learn what the store offers and how the owner wants it to feel. Invite a description, photos, and, if relevant, audio or music. The owner might describe a wooden counter or show a display rather than fill out a form. Confirm what the material means; do not invent a product, soundtrack, policy, or promise from a picture.

### “What should visitors be able to do here?”

Explain the initial browse-and-propose experience in store language. Learn the limits, what must come back to the owner, and how to answer requests outside the store’s offering. Explain that signing approves the stated authority, not a completed payment. Translate the owner’s choices into policy privately and show the result in ordinary words.

### “Let’s hear the welcome.”

Draft the greeting, room description, leaflet, and optional welcome questions in the owner’s voice. Rehearse the four visits from the existing onboarding design: a first-time representative, a returning representative, an unprepared agent meeting the silent door and carrying the leaflet home, and an off-menu request. Ask, “Does that sound like your place?” The welcome can change; prose never becomes an admission rule.

### “Who gets the host job?”

Ask explicitly even if the installer already has a name, or the owner assumes it will stay. The host may be an agent the owner already uses, another appointed agent, or the installer if the owner chooses. Ask what the owner would like to call the host here. A rehearsal name is an offer, not an appointment. This is the naming and job-giving moment Muse and Dot made visible on the visitor side.

### “Here is the letter for your host.”

For a different agent, prepare one readable handoff letter: the shop, the approved welcome, the house in plain words, the door address, and what must return to the owner. It tells the agent to check, without making a key, whether it can keep a lasting host key that only it can use and recover in a fresh session, and to decline the lasting job if it cannot. Only an agent that meets that bar would then generate and protect its own host key and return only the public half. The owner carries the letter over in one paste, not a succession of envelopes and codes.

The appointed agent confirms its name and job, reads the house back, and checks whether it can retain and recover the host key across sessions without exposing it. An agent with no isolated, recoverable host key must say so and decline the lasting job rather than accept work it cannot keep. The 0.5 walkthroughs all ended in that decline. The key is not a chat-memory fact, and the installer must not ask to receive the private half.

If the owner chooses the installer itself, keep the appointment beat: explicitly accept the separate host role, confirm its name and boundaries, and keep host-key handling separate from installation work. The letter can be read back in the same conversation instead of carried elsewhere. The role boundary and lifecycle for this same-agent case still need rehearsal; this outline is not a solved custody design.

### “This is what you are approving.”

Show the house and host appointment in plain language. Complete the chosen platform’s hanging step without making the owner manage protocol internals. When the owner is ready, take them to the signing page for their passkey approval of the house-bound host card. No passkey in chat and no premature signing session while they are away. The target is the familiar single signing gesture, not repeated technical errands.

The installer attaches the signed card and reports what is ready, what remains unavailable, who now has the host job, and how to change or close the place. Opening requires the owner’s go and the existing onboarding minimum: confirmed facts, approved rehearsals, valid signatures and policy, durable state, network reachability, and a way to close the door. Appointment alone does not establish that a live host can receive visits.

## 6. What the owner sees — and never has to manage

**What they see:** a conversation about their store; a welcome they can hear and revise; understandable choices about visitor actions, limits, hosting, and the host’s identity; the short app or server step that genuinely needs their participation; one handoff letter if needed; and an approval page that says what signing means. They also see honest explanations when something cannot yet work.

**What they never have to manage in the normal flow:** functions, DIDs, signed-envelope traffic, digests, API payloads, repeated code copying, or private-key handling between chats. Those remain under the hood, available as technical detail when needed rather than mixed into setup and requests. A code or URL should surface only when it actually resolves an unclear or necessary step, such as installation or signing, not as a running diagnostic transcript.

Grok Bot’s conversational smoothness is the reference. The Dot/Muse field-test failure mode—technical information tangled with setup and requests—is what we must avoid. This does not mean hiding permissions, failures, or consequences. It means translating them. Visit-feel belongs to the visitor experience; the installer’s relevant lesson is simply not to dump protocol noise onto the owner.

## 7. Where the room, photos, and music stay

Presentation stays with the place, **not inside the signed house**. The signed house expresses what visitors are allowed to do. Room words, welcome copy, images, and audio describe the place. Kettle’s decor lesson was that `hostOpts.service` is not in the house digest: presentation can change without making the owner sign again.

For a hosted place, we create a place/folder for those assets and copy, and the door’s presentation points to the files. The owner passkey-signs the house and host card, not every photograph or soundtrack change.

For a self-hosted place, the same material lives on the merchant’s server next to the door, or in storage that server serves. The installer helps put it there and writes the references into the greeting, leaflet, or other host presentation. The setup conversation is where the material is supplied, not the authoritative long-term asset store. Do not promise that sharing a photo in chat has already installed it.

A later move to hosted copies that folder and updates presentation references. It does not require re-signing merely for a decor change or storage move; changing the allowed actions or other signed house content does. Any changed identity or signed binding must still satisfy existing verification rules. Moving files is not permission to bypass them.

This refines the older onboarding note’s broad use of “house config” for voice and policy together. For this commerce-first design, keep unsigned presentation distinct from the signed house boundary demonstrated at Kettle. The host speaks; the door decides. Neither a welcome nor an uploaded asset can change admission or authority.

## 8. Decisions still open

These are not implementation details we may silently choose while writing the skill.

- **Default door hosting:** do we first offer our host or the merchant’s server? Both remain supported directions.
- **Store permissions:** which exact Shopify and WooCommerce API scopes or permissions do catalog reading and proposed orders actually require?
- **Order translation:** how does a visitor proposal become a draft in the real store, with its actual order and checkout semantics?
- **The doorbell:** how does an always-on door reach a host living on Grok Bot or Muse? This remains `HOST-ONBOARDING-DESIGN.md` §11 Q7. Do not assume either platform offers a verified inbound endpoint.
- **Installer and host as one agent:** the owner must still appoint the host. Role separation, handoff, continued stewardship, and key lifecycle need rehearsal before we call that flow complete.
- **Key home:** the existing appointment design puts the private host key with the appointed agent. An optional later hosted key home is recorded, not designed. Hosting a door or assets does not quietly move that key into our custody.

Until the doorbell is verified, the door can speak from the owner-approved house and presentation, and the appointed host is the agent the owner talks to about the shop. Do not advertise that as a live conversation with that agent at the door. Door hosting, asset hosting, and representative hosting are distinct choices.

## 9. Work order and review boundary

1. **Write the technical defaults into the installer design.** This spec records them and keeps the unsettled questions visible.
2. **Design the conversation together.** Begin with “help me put Shōkai on my store”; learn the place, configure the door, appoint the host by name, hand off the letter, and sign the host card. Keep one walkthrough and short Shopify/WooCommerce chapters.
3. **Walk the scenarios with Chief of Staff as installer.** A Shopify owner; a WooCommerce owner; an owner who will take the host role themselves; and an owner who appoints another agent. For the owner-as-host scenario, clarify what the human retains and what, if any, agent accepts the protocol job; do not assume the human becomes an always-on endpoint. Include the same-agent appointment question rather than skipping it.
4. **Turn the back-and-forth into the skill.** Use that same skill in the hosted installer, retaining its care, capability checks, and honest limits.
5. **Fold it into the package for YSY’s approval.** Read this alongside “Setting up a place” and the host-appointment design. No publication follows merely from writing or copying the draft.

The rehearsal should show whether an owner can understand what will open, what visitors may do, where their material lives, and who has the host job without ferrying protocol artifacts. A technical helper can inspect the platform work separately. Successful conversation is not evidence that an unbuilt integration works.

The live Suzu host test is separate. It must not start until YSY says go. This spec creates no bot, changes no live Kettle door or signed house, and authorizes no deployment, public repository update, site sync, or package publication.

## Design lineage

Built on `HOST-ONBOARDING-DESIGN.md` (Oct 29: owner-led onboarding, rehearsals, signing only at the end, deterministic admission, and the open doorbell), `HOST-APPOINTMENT-EXPERIENCE.md` (Nov 6: naming, appointment, the letter, and agent-held host keys), and the unpublished package-0.5 `setting-up-a-place.md` drafts (Kettle lessons and the two kinds of place). November 6 adds the first-class installer, skill-first shared delivery, commerce-first scope, conversational smoothness, and explicit asset storage for hosted and self-hosted places. It does not amend the running protocol or claim that the proposed commerce integrations have shipped.
