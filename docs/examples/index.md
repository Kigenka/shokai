# Worked examples

Place stories, each with a diagram and short message snippets. For the first walkthrough, a self-introduction at a tea shop, start with [How Shōkai works](../how-it-works.md). Most visits are self-introductions; a vouch appears only where the story needs one. **These examples are non-normative**, written for the **v0.5.0**: the specification decides, and where an example and the spec disagree, the spec wins.

The v0.5.0 calls the grant a place gives a **pass**. This repository still publishes v0.3.0, whose wire names that grant `seat` and tags messages `shokai/0.3`. Snippets below keep that wire. Diagrams drawn from older logs keep honesty notes on their pages; site labels say pass and are not presented as fresh v0.5 wire traces.

[Runnable examples](../../examples/README.md) are a separate set: doors and visitors you can run. They are not the same list as these stories.

| Example | Shows |
|---|---|
| [A personal representative at a bank](./harborlight-bank.md) | A self-introduction, Shōkai cards both ways, the standing allowance, a narrow pass, the duty of loyalty, taking a transfer home |
| [Look before you join](./look-before-you-join.md) | An anonymous visit, the open listing, and the lobby's leaflet with plain owner sentences |
| [An employee's co-worker agent](./enterprise-coworker.md) | A company vouch for a role, a Shōkai gate in front of internal MCP servers, an act outside the pass |
| [A friend introduces a brand](./brand-door.md) | The optional extra: a deliberate vouch, paid vs genuine, at a person's own door, the ceiling on offers |

## Situations and proofs

These are not place tours. One is an unsolicited offer that is declined. The other is how a name on a card becomes a proof, and how a false one fails.

| Example | Shows |
|---|---|
| [Unsolicited offer, pressure declined](./pressure-declined.md) | Hidden text, false urgency and fake familiarity, a misconduct notice, local consequences |
| [Proving who a representative is for](./identity-proofs.md) | A brand tied to its domain (published v0.3.0), a person tied to their X account (P23, drafted for v0.4 and still a draft in the v0.5.0 work), and a fictional famous-person impostor rejected because the account never posted its key |

**About the names.** The places, brands and people in these stories (Harborlight Bank, Maison Ardoise, Corsavel, Brightwick Outfitters, Halvenstone Freight, Kiran Vale, Noor Halloran, Theo Marchetti, Mira Castellane) are fictional. Real technologies (MCP, OAuth, passkeys, Plaid, Stripe and others) are named only to show where Shōkai fits; that implies no affiliation or endorsement, and no example describes how a real company behaves.

**About the snippets.** Snippets are abridged: the signed envelope (`payload_digest`, `signatures`), most of the ritual header and some required members are left out, and keys and digests are shortened with `…`. Every real message in this repository's published specification travels signed, with `protocol: "shokai/0.3"`.
