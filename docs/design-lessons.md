# Design lessons

Shōkai builds on lessons from the web's first decades.

## Links as trust, and link farms

Early web search treated links between sites as a sign of trust, a good idea that made the web easier to navigate. But one global score became the thing everyone chased, so people manufactured links to game it. Shōkai keeps the good intention and avoids the damage:

- **Relationships, not raw counts.** The signals are signed, specific events: who invited you, who vouched for you and how that turned out, whether a door welcomed you back, whether an offer was kept. A pile of empty connections means nothing.
- **Each door judges for itself.** There is no single worldwide score to chase. Every door weighs signals by its own policy, so faking standing at one door buys nothing at the next.
- **Vouching costs something.** An introducer's standing moves with the conduct of the agents it introduces, so manufacturing introductions burns reputation instead of building it.
- **The owner stands behind it.** Conduct attaches to the person, brand or community behind the representative, not to a disposable key, so a fresh representative doesn't wash away a bad record at the same door.
- **Sharing is opt-in and comes later.** Any shared summary across doors waits for real evidence that it makes engagement more meaningful rather than easier to game.

## Spam: when sending is free, attention pays

Email and social feeds showed that when contact costs the sender nothing, the receiver pays in time. Shōkai's door policies, caps and declared purposes give attention back to the receiver.

## Persuasion at scale

When a system rewards whatever wording converts, it trains everyone to test wordings on people. Shōkai decides on signed facts, counts rewordings as one campaign, and makes unbacked urgency and scarcity misconduct. A sincere approach that returns after its stated retry is judged afresh.

## Sign in to see anything

Asking for identity before showing anything turns sign-in into data capture. In Shōkai, a place's listing and lobby are open to anyone, with no key and no account.

## Honest about limits

Protocols earn trust by saying plainly what they can't enforce. Shōkai lists its known gaps in the spec and its accepted risks in the threat model.

## The door decides; the host representative welcomes

Writing the 0.5 visit made a split we had been blurring: the **door** is what checks signed facts and admits or turns away; the **host representative** is the place's own agent, and it welcomes the visitor the door already admitted. The software does not get persuaded, and the welcome is not the decision. Reader pages now keep those two jobs apart.

## Let the owner's own agent do the setup

Owners should not have to become protocol engineers to take part. The installer skill is written so an owner's agent can lead setup: read the skill, talk to its owner in plain words, and do the mechanical steps. The owner still signs what matters (a card, a mandate, a host card) with a passkey. That path is how we expect a person or a small shop to arrive, not a form they fill in alone.

## Speak the way an owner would

Words such as *seat*, *principal* and *vouch* are the specification's terms. On pages meant for owners we use *pass*, *owner* and *introduction*, and we say why the wire still says `seat`. Jargon that only implementers need stays in the spec and the SDK. When a sentence needs both, the owner word comes first.

## Say what is built, and what is only proposed

A page that mixes a working door with a sketched idea teaches the wrong lesson. Features we have specified and tested are described as present; proposals stay labelled as proposals; intended designs that have not been run are labelled that way, with no implied throughput or readiness. If we cannot point to a test or a document, we do not claim it.

## Measure the claims that say HOLD

When a write-up says a check HOLDS, the count comes from a conformance run or a recorded trace, not from a model's summary of that run. The conformance runner, golden traces and field-test logs are the evidence. If a model then describes the visit differently, the log still wins.

## One address, with copies behind it — intended, untested

A busy place should still look like one door: one address, one host card, one set of rules. Identical copies can sit behind a load balancer and share one durable-plus-live store. The SDK already has that store shape and in-process tests for several instances sharing it. Running those copies under real traffic, then measuring them, has not been done. See [Implementation and scaling](./implementation-and-scaling.md#6-how-a-door-scales-intended-design) and [Known gaps](./known-gaps.md#multi-instance-door-with-shared-state-then-load-testing).

## First readers should meet 0.5, not the path to it

Most people arriving now have never seen an earlier version. Reader pages describe Shōkai 0.5 as the current protocol. The history of earlier versions, and the window in which places still accept the previous wire tag, live in the [changelog](../CHANGELOG.md) and on the site compatibility page, not in asides on every page.

## The domain story: today's sites saw a person, not an agent

On 28 October 2026 the editor's agent registered this project's domain. It created the registrar account, entered a card the editor typed into a chat form, and the registrar and the payment page saw the editor on a new device. Someone with the editor's details and card would have looked the same. The sites did what today's web lets them do; the lesson is what they could not see: that an agent acted, whose agent it was, or what the editor had allowed. That is why a Shōkai door asks for a signed card and a mandate, and keeps a record of the pass it grants. The full account is in [Why Shōkai exists](./why.md#a-true-story-my-agent-bought-a-domain).

## Rehearse with the people who will use it

We have walked the same owner tasks with people who do not write protocols and with people who do, including installer rehearsals on 10 November 2026. A sentence that is clear to us is not always clear to them. When a rehearsal shows a word or a step that fails, we change the page, not the reader.

