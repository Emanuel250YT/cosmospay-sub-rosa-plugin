# Security

## Secrets and signing

No wallet private key is accepted by a plugin action or stored in Cosmos Pay.
The opt-in example reads disposable Testnet secret keys from the local process
environment and passes them directly to `@sub-rosa/sdk`. Browser integrations
should use wallet callbacks instead.

## Confidential proposal handling

Provider proposal plaintext is sealed client-side and submitted directly to Sub
Rosa. Plugin commands use strict allowlists and reject fields such as `proposal`,
`receipt`, or `revealedEnvelope` as unknown. The plugin never stores:

- a sealed proposal's plaintext;
- the full revealed Core v2 receipt;
- `revealedEnvelope`;
- an auditor secret key;
- a wallet secret key.

After client-side receipt verification, the plugin stores only the canonical
receipt SHA-256 digest, an optional HTTPS locator and public transaction hashes.

## Tenant isolation

Cosmos Pay constructs `ctx.storage` for one resolved plugin installation. The
plugin never receives an installation or consumer ID it can substitute. Payment
intent lookup uses `ctx.core.paymentIntents.get()`, which is tenant-filtered by
Cosmos Pay. The unit suite models independent installation contexts; the pinned
HTTP E2E exercises the real runtime bridge.

## Network verification

The sandbox has `egress: []` and does not independently read the Stellar ledger.
The companion client performs:

- full Stellar StrKey checksum validation;
- canonical deployment selection;
- `exportReceiptV2()`;
- `verifyReceiptV2()`;
- `serializeReceiptV2()` and SHA-256 hashing.

The plugin's `G...` and `C...` checks are intentionally structural only. A
stored `clientVerified` flag is an assertion from the companion, not an
independent server attestation.

## Asset boundary

Sub Rosa `ReceiptOnly` uses zero escrow and moves no assets. It does not choose
an economic winner. The merchant chooses `selectedProviderAddress`; Cosmos Pay
handles any subsequent payment intent and settlement.

## Deployment status

The repository contains no `signature.json`. Production installation through a
Cosmos Pay registry requires review and a signature from Cosmos Pay support or
an operator-trusted key. Official signing, store listing and deployment are
pending. No audit claim is made.

## Mainnet and high-value use

Passing local tests and the Cosmos Pay plugin validator is not an audit. Before
high-value or production use, obtain the relevant Cosmos Pay review/signature,
review the deployed Sub Rosa contract/version, protect receipt hosting, and use
a wallet integration rather than local secret keys.
