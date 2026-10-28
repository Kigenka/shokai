# Examples

Five visits, each with a diagram and short, annotated message snippets. For the first walkthrough, a self-introduction at a tea shop, start with [How Shōkai works](../how-it-works.md). Most visits are self-introductions; only the last example adds a vouch. **These examples are non-normative**: the specification decides, and where an example and the spec disagree, the spec wins.

| Example | Shows |
|---|---|
| [A personal representative at a bank](./harborlight-bank.md) | A self-introduction, cards both ways, the standing allowance, a narrow seat, the duty of loyalty, taking a transfer home |
| [Look before you join](./look-before-you-join.md) | An anonymous visit, the open listing, and the lobby's leaflet with plain owner sentences |
| [An employee's co-worker agent](./enterprise-coworker.md) | A company vouch for a role, a Shōkai gate in front of internal MCP servers, an act outside the seat |
| [Pressure declined and reported](./pressure-declined.md) | Hidden text, false urgency and fake familiarity, a misconduct notice, local consequences |
| [A friend introduces a brand](./brand-door.md) | The optional extra: a deliberate vouch, paid vs genuine, at a person's own door, the ceiling on offers |
| [Proving who a representative is for](./identity-proofs.md) | A brand tied to its domain (v0.3.0), a person tied to their X account (P23 B2, v0.4 draft), and a fictional famous-person impostor rejected because the account never posted its key |

**About the names.** The places, brands and people in these stories (Harborlight Bank, Maison Ardoise, Corsavel, Brightwick Outfitters, Halvenstone Freight, Kiran Vale, Noor Halloran, Theo Marchetti, Mira Castellane) are fictional. Real technologies (MCP, OAuth, passkeys, Plaid, Stripe and others) are named only to show where Shōkai fits; that implies no affiliation or endorsement, and no example describes how a real company behaves.

**About the snippets.** Snippets are abridged: the signed envelope (`payload_digest`, `signatures`), most of the ritual header and some required members are left out, and keys and digests are shortened with `…`. Every real message travels signed, with `protocol: "shokai/0.3"`.

**All examples**, including the runnable ones and the narrated transcripts, are indexed in the repository's `examples/README.md`.
