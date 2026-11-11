<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Yu Sung Yeh -->
# Bank: a small transfer, and a door that counts across visits

::: tip Runnable example (diagram from a recorded run)
This page is the **runnable / recorded** Harborlight-style bank story. For the longer **worked read-through** (cards both ways, standing allowance, transfer taken home), see [A personal representative at a bank](https://shokaiprotocol.com/docs/examples/harborlight-bank).
:::


**The story.** A representative visits Harborlight Bank (fictional) with a mandate to send up to 50.00 USD. Its first try is refused for a missing amount; with the amount, a 30.00 USD transfer goes through (pending the owner's own confirmation at the bank, in this simulation). It comes back later under the **same** mandate. The bank remembers: 20.00 USD of the mandate is left, so a second 30.00 USD transfer is refused. The customer link in [P21](../proposals/P21-customer-link.md) is a v0.4 draft carried into the v0.5.0 work. This runnable story does not use it, and P21 is not in the published v0.3.0 core.

[![A transfer and a revisit at Harborlight Bank](diagrams/png/bank.png)](diagrams/svg/bank.svg)

::: tip Diagram honesty
**Recorded on a v0.3.0-rc4 wire log.** Node labels on this site say **pass** (v0.5 prose). The underlying recording still used seat/seated; the wire field remains `seat`. This 0.3 log is kept as a cross-implementation record; a **fresh `shokai/0.5` recording** is [below](#v05-recording).
:::

**Where the diagram comes from.** A recorded wire log from the v0.3.0-rc4 simulated-team rounds: the reference SDK as the visitor, and a bank door built in Python by a simulated team from the spec alone. Signatures re-verified with the reference implementation. Diagram node labels on this site say **pass** (v0.5 wording). The underlying recording still used seat/seated; the wire field remains `seat`. See the fresh v0.5 recording below.

## Fresh v0.5 recording {#v05-recording}

::: tip Recorded on 2026-11-05, wire tag `shokai/0.5`
A reference re-run of the bank pattern on a minimal bank-shaped door (fictional Harborlight Bank, [door script](https://shokaiprotocol.com/traces/v05/bank-server.mjs); not the full Harborlight tree, which is needs-source): the same two-visit story as above under a 50.00 USD mandate: a transfer with no amount refused, 30.00 USD sent, then a second visit under the **same** mandate where another 30.00 USD is refused because 20.00 USD is left. Recorded with the site's [0.5.0 package](https://shokaiprotocol.com/docs/quickstart#local-trial) by a small recorder that logs each message the visiting representative sends and receives. Download: [JSON log](https://shokaiprotocol.com/traces/v05/bank-0.5.json) · [recorder script](https://shokaiprotocol.com/traces/v05/record.mjs). Keys are made fresh per run. The older diagram above stays as the cross-implementation record (a Python door built from the spec).
:::

```text
← place_listing [shokai/0.5]  (GET /shokai/places)
— visit 1 —
→ greeting [shokai/0.5]  ← greeting
→ card_presentation [shokai/0.5]  ← card_presentation, card_receipt
GET /shokai/places/harborlight/entry/house-summary.json
→ introduction [shokai/0.5]
→ invitation_request [shokai/0.5]  ← invitation_response grant, farewell
→ MCP initialize
→ MCP notifications/initialized
→ MCP tools/call balance.view (signed act)
→ MCP tools/call transfer.send (signed act)  ← error -32012: transfer.send spends: state what it spends in arguments.amount as {value, currency}, e.g. {value: "6.00", currency: "USD"}
→ MCP tools/call transfer.send (signed act)
→ farewell [shokai/0.5]
— visit 2 —
→ greeting [shokai/0.5]  ← greeting
→ card_presentation [shokai/0.5]  ← card_presentation, card_receipt
GET /shokai/places/harborlight/entry/house-summary.json
→ introduction [shokai/0.5]
→ invitation_request [shokai/0.5]  ← invitation_response grant, farewell
→ MCP initialize
→ MCP notifications/initialized
→ MCP tools/call transfer.send (signed act)  ← error -32012: transfer.send: 30.00 USD would pass what is left of your seat's or mandate's limit (cap 50.00 USD); more needs a new mandate
→ farewell [shokai/0.5]

results:
visit 1: grant
  balance.view: balance 420.00 USD (mock)
  transfer.send (no amount): refused -32012 by door (REQUEST_INCOMPLETE)
  transfer.send 30.00: sent 30.00 USD to rent (mock)
visit 2: grant (same mandate)
  transfer.send 30.00: refused -32012 by door (SEAT_SCOPE_EXCEEDED)
report: The place with key …ELAaXsRF (claims to be "Harborlight Bank"; not verified) admitted me with a pass for "balance.view" and "transfer.send", up to 50.00 USD. I did 0 actions; 1 was refused. This was visit 2 under the mandate you signed. Earlier: here, 2 actions done, 1 refused, 30.00 USD spent. In all under this mandate: 2 actions done, 2 refused; spent 30.00 USD of the 50.00 USD allowed, 20.00 USD left.
```


**What it shows**
- A mandate's limit is for the whole errand, across visits, and both sides keep count (§5.1, C175, C176).
- The bank's door can be strict about money without being rude: `not_now` with a reason, never silence.
- Anything beyond the mandate (a bigger transfer) is taken home to the owner, never argued at the door (see the read-through below).

**Read more:** [A personal representative at a bank](../docs/examples/harborlight-bank.md) (cards both ways, a standing allowance, a transfer taken home), transcript [04](../reference/prototype/transcripts/04-bank-considering.md), golden traces G5a and G5b.
