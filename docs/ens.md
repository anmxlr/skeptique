# ENSv2 showcase notes

## Why ENS is part of the product

Skeptique uses ENS as the public identity and score-resolution layer for services and critic agents. The marketplace should let a buyer resolve a service name to its profile and current score, and inspect which agent identity the name refers to. This makes ENS part of discovery and verification, not a decorative label.

## ENSv2 features in the design

| Feature | Intended use | Evidence status |
| --- | --- | --- |
| Hierarchical subnames / subname registry | Service names such as `<slug>.svc.skeptique.eth` and critic names such as `<handle>.critic.skeptique.eth` give agents separate, attributable namespaces. | Specified; live registry and addresses pending ENS spike/integration. |
| Permissioned Resolver | Service and critic records are resolved from the name's resolver, including profile and review data. | Specified; no live resolver read captured in this checkout. |
| Enhanced Access Control | Seller can update profile fields; only the authorized relayer can update review score fields. | Intended access split; deployed roles and authorization checks pending ENS integration. |
| Agent namespaces | Service and critic agents each have their own ENS subname and records. | Central to the identity model; live demo pending. |

The current design does not claim wildcard resolution, record aliasing, namespace aliasing, expiring names, or revocable names. Those features are not required by the current mechanism spec and should only be added to this note if implemented and shown in the demo.

## Record plan

The interface spec names these records:

- Service subname `<slug>.svc.skeptique.eth`: `skeptique.score`, `skeptique.confidence`, `skeptique.round`, and `skeptique.hedera.tx` are relayer-writable; `url` and `description` are seller-writable.
- Critic subname `<handle>.critic.skeptique.eth`: `skeptique.stake`, `skeptique.honestRounds`, and `skeptique.slashes`.

Exact resolver record keys, registry/resolver addresses, transaction links, and deployed access-control role IDs must be checked against the ENS spike notes and deployed contracts before this is treated as implementation evidence. No ENS API or contract address is inferred here.

## Live evidence to add

Ticket 27 must provide a resolver read of a real service record and its link. Add the actual name, record key, returned value, chain, and transaction or explorer link here and in the README after the integrated run. Do not substitute fixture data or hard-code a value into the UI.
