# Cosmos Pay × Sub Rosa Plugin

An external [Cosmos Pay](https://github.com/CosmosPay/CosmosPay-Community-Server)
sandbox plugin that connects tenant-scoped private RFQs to client-signed
[Sub Rosa](https://github.com/karagozemin/Sub-Rosa) `ReceiptOnly` sealed-proposal
rounds on Stellar.

> **Status:** External Cosmos Pay plugin implementation, validated against the
> Cosmos Pay plugin runtime; official signing, store listing, and deployment
> pending.

This repository is not an official, deployed, audited, or production Cosmos Pay
integration. It contains no Cosmos Pay signature and does not modify Cosmos Pay
core.

## Flow

```text
Cosmos Pay merchant creates RFQ metadata
  → companion client hashes canonical RFQ into a 32-byte itemRef
  → merchant wallet creates a Sub Rosa ReceiptOnly round
  → provider wallets submit sealed proposals directly to Sub Rosa
  → normal Drand/open/reveal/clear lifecycle runs on Stellar
  → companion client exports and verifies the Core v2 receipt
  → merchant chooses a provider off-chain
  → plugin records only receipt hash + public transaction evidence
  → an existing tenant-owned Cosmos Pay payment intent may be linked
  → Cosmos Pay handles payment and settlement
```

`ReceiptOnly` moves no assets and declares no economic winner. The
`selectedProviderAddress` stored by this plugin is the merchant's business
decision, not an on-chain Sub Rosa winner.

## What is included

- `plugin/sub-rosa`: real Cosmos Pay `plugin.json` and sandboxed `index.ts`.
- `src`: companion client helpers and the Cosmos Pay HTTP client.
- `examples/private-rfq-client`: opt-in live Stellar Testnet lifecycle using
  `@sub-rosa/sdk@0.3.2`.
- `test/unit`: RFQ, validation, evidence and tenant-boundary tests.
- `test/cosmos-pay`: HTTP E2E loaded by the pinned Cosmos Pay application.
- `scripts`: pinned plugin check and E2E runners.

The plugin requests only `payment_intents:read` and declares `egress: []`.
It cannot sign Stellar transactions, read Stellar chain state, move funds, or
create payment intents. Its storage is the Cosmos Pay runtime's per-installation
tenant storage.

## Actions

Commands:

- `create-rfq`
- `attach-sub-rosa-round`
- `record-result`
- `attach-payment-intent`

Queries:

- `get-rfq`
- `list-rfqs`

All action requests use the Cosmos Pay envelope `{ "input": { ... } }` and
responses use `{ "plugin", "action", "output" }`.

## Local development

Requirements: Node.js 24.15 or newer, npm and Git.

```bash
npm install
npm run verify
npm run check:cosmos
npm run test:e2e:cosmos
```

The last two commands clone and pin Cosmos Pay to `v1.9.0` commit
`323ca9c3b6ca2dcf966dae083e952436733e9ed2`, copy the unsigned plugin into its
`plugins/sub-rosa` folder, and use Cosmos Pay's real plugin validator/runtime.
Override the clone directory with `COSMOS_PAY_DIR=/path/to/clone`.

For a manual Cosmos Pay development server, follow
[docs/COSMOS_PAY_INSTALLATION.md](docs/COSMOS_PAY_INSTALLATION.md).

## Live Testnet example

The live example submits real Stellar Testnet transactions. Fund two disposable
Testnet accounts, copy `.env.example` to `.env`, export the variables in your
shell, enable/install the plugin in a development Cosmos Pay instance, then run:

```bash
npm run test:live
```

Secrets are read only by the local companion script. They are never sent to or
stored by Cosmos Pay. CI never runs this opt-in script.

## Security boundaries

- Wallet signing and Sub Rosa cryptography happen client-side.
- No wallet private key, proposal plaintext, full receipt, or revealed envelope
  is stored by the plugin.
- The plugin records the SHA-256 hash of canonical `serializeReceiptV2()` output,
  not the receipt itself.
- The companion client performs checksum-valid StrKey checks and
  `verifyReceiptV2()`; the sandbox plugin only performs structural validation.
- With `egress: []`, the plugin does not independently verify Stellar state.
- Cosmos Pay remains responsible for payment-intent settlement.

See [docs/SECURITY.md](docs/SECURITY.md) for the complete model.

## License

MIT
