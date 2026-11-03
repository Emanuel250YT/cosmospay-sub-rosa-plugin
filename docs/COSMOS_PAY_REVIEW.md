# Cosmos Pay review (2026-11-03)

Cosmos Pay support reviewed `plugin/sub-rosa` 0.1.0 and this companion client
before shipping the plugin preinstalled in the Community Server
(`plugins/sub-rosa/`, to be signed by the support key; see
https://github.com/CosmosPay/CosmosPay-Community-Server/pull/141). The plugin
that ships is **0.2.0**, hardened as below; this repository should take it over
once the Community Server release that carries it is out.

## Plugin findings, fixed in 0.2.0

| # | Finding | Fix in 0.2.0 |
| - | ------- | ------------ |
| 1 | `create-rfq` stored whatever `itemRef` the caller sent; nothing bound the on-chain round to the RFQ's title, description and deadlines | `itemRef` is recomputed in the sandbox as the SHA-256 of the canonical RFQ JSON (the same bytes as `canonicalRfqItemRef`) and refused on mismatch |
| 2 | Any structurally valid `C...` contract was accepted as the Sub Rosa round, so a look-alike contract could produce a receipt of its own making | the contract is pinned per network and protocol to the deployments `@sub-rosa/sdk` 0.3.2 publishes; reveal-policy v3 on mainnet (no reviewed deployment) is refused |
| 3 | Every write was a read then `put` (last write wins): two concurrent `record-result` calls could both answer 200 while one selection silently replaced the other | every write is `ctx.storage.compareAndSet` (new in the Community Server), so the second writer is refused |
| 4 | `attach-payment-intent` linked any Stellar intent of the tenant, including one that pays someone else, or a failed one | the intent must pay `selectedProviderAddress` (its `destination`) and be `PENDING`, `SUBMITTED` or `SUCCEEDED` |
| 5 | A result could be recorded before the commit phase closed | refused before `commitDeadline` |
| 6 | `receiptVersion` was not tied to the round's protocol; the same hash could be reported for several steps | the version must be 2 for `core-v2`, 3 for `reveal-policy-v3`; the step transactions must differ |
| 7 | `receiptUri` accepted `user@` and non-ASCII hosts; titles and notes accepted control and bidirectional characters (stored text later shown to people) | printable-ASCII https URLs without userinfo; control, bidirectional and zero-width characters refused |
| 8 | Deadlines in milliseconds or in the past were accepted | Unix seconds only, and `commitDeadline` in the future at creation |

## Companion client finding, fixed on this branch

`CosmosPaySubRosaClient` authenticated with `x-gateway-secret` plus
`x-consumer-*` headers. That secret is the gateway's trust boundary: whoever holds
it can act as **any** consumer with **any** permissions, and the example read it
from `.env` for any `COSMOS_PAY_URL`. The client now:

- takes `apiKey` (sent to the gateway as `Authorization: Bearer` and `apikey`),
  the only mode for a server that is not on this machine;
- accepts `gatewaySecret` only for a loopback `baseUrl` (`localhost`, `127.0.0.1`,
  `[::1]`), and refuses plain `http:` anywhere else;
- does not follow redirects (they would carry the credentials along) and reports a
  non-JSON error body instead of throwing a parse error.

## To sync after the Community Server release

1. Copy `plugins/sub-rosa/plugin.json` and `index.ts` from the Community Server into
   `plugin/sub-rosa/` (do not edit them: the signature covers both files).
2. Add `compareAndSet` to `test/support/cosmos-pay-sdk.ts` and update
   `test/unit/plugin.test.ts`: inputs need a real `itemRef`
   (`canonicalRfqItemRef`), the pinned contract ids, a future `commitDeadline`,
   and an intent whose `destination` is the selected provider.
3. Bump `COSMOS_PAY_REF` in `scripts/prepare-cosmos-pay.sh` to the release that
   ships `compareAndSet`; v1.9.0 does not have it.
