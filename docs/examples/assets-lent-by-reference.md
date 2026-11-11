# Assets lent by reference

**Proposal, not built in v0.5.0.** Shōkai v0.5.0 has no lending of source assets, no deletion statement, and no "open loan" state on the wire. The door's local record, a scoped pass, and `not_now` already exist.

What's proposed: a licensing desk lends a generative-media asset by reference, not by handing the source over. The agent uses the asset inside its pass, for the stated purpose and time, and what comes back is the finished work, not the source files. Where a hand-off is unavoidable, it is a time-limited loan that closes with a signed deletion statement from the agent's owner. A copied digital file can't be proven deleted, so the desk's trust rule is its own record, not a technical proof of deletion.

If a loan was not closed, the next visit is `deny` / `not_now` ("settle the open loan first"). The door reopens once the loan is settled. Honest visitors hear `not_now`. `never` is reserved for misconduct. There is no global score.

The worked example, at a studio's licensing desk in a fan community, is in [At a fan community](./fan-community.md#proposal-assets-lent-by-reference). The same proposal is listed under [Future directions](../future-directions.md).
