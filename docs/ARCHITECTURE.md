# Architecture

## Components

### Cosmos Pay sandbox plugin

`plugin/sub-rosa/index.ts` runs in Cosmos Pay's isolated V8 plugin runtime. It
may import only `@/plugins/sdk`. It uses:

- `ctx.storage` for RFQ mappings scoped to the current plugin installation;
- `ctx.core.paymentIntents.get()` to prove a linked intent is visible to the
  calling tenant;
- no outbound HTTP (`egress: []`).

The stored record is versioned and contains public RFQ metadata, the Sub Rosa
round locator, merchant selection evidence, and an optional Cosmos Pay payment
intent ID. Each write rejects unknown fields so callers cannot accidentally
persist plaintext proposals or full receipts.

### Companion client

The companion code is outside the Cosmos Pay sandbox. It uses
`@sub-rosa/sdk@0.3.2` and the user's Stellar wallet/signing boundary to:

1. Canonicalize RFQ metadata and SHA-256 hash it into `itemRef`.
2. Create a contract-enforced `ReceiptOnly` sealed-proposal round.
3. Seal and submit provider proposals.
4. Open reveal from Drand, decrypt the held ciphertext and call `revealV2`.
5. Clear the round, export `CoreV2Receipt`, run `verifyReceiptV2`, serialize it
   canonically and compute its SHA-256 digest.
6. Record only non-confidential evidence in the plugin.

### Cosmos Pay settlement

The plugin never creates or mutates a payment intent. After the merchant has
selected a provider, it may link an already-existing Stellar payment intent.
The runtime lookup is tenant-filtered by Cosmos Pay. Settlement remains wholly
inside Cosmos Pay's existing flow.

## Stored mapping

```json
{
  "schemaVersion": 1,
  "id": "RFC-4122 UUID",
  "itemRef": "32-byte hex",
  "subRosa": {
    "network": "testnet",
    "contractId": "C...",
    "roundId": "42",
    "protocolVersion": "core-v2",
    "mode": "ReceiptOnly",
    "schemaRef": "32-byte hex",
    "itemRef": "32-byte hex",
    "revealRound": 123,
    "creatorAddress": "G...",
    "createTxHash": "32-byte hex"
  },
  "selection": {
    "selectedProviderAddress": "G...",
    "receiptHash": "SHA-256 of canonical receipt",
    "receiptUri": null,
    "receiptVersion": 2,
    "clientVerified": true,
    "openRevealTxHash": "32-byte hex",
    "revealTxHash": "32-byte hex",
    "clearTxHash": "32-byte hex"
  },
  "paymentIntentId": "pi_..."
}
```

`selectedProviderAddress` is explicitly an application-level selection.
`ReceiptOnly` receipts do not declare an economic winner.

## Trust boundaries and limitations

- The plugin trusts the companion's `clientVerified: true` assertion and stores
  a receipt hash; it cannot reproduce receipt verification in the sandbox.
- The optional `receiptUri` is a locator, not trusted content.
- Structural `G...`/`C...` checks in the plugin are not StrKey checksum checks.
- Storage updates are last-write-wins because the current Cosmos Pay plugin
  storage SDK has no compare-and-swap primitive.
