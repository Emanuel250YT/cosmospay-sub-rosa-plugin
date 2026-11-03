# SCF #46 evidence

## Accurate status

> External Cosmos Pay plugin implementation, validated against the Cosmos Pay
> plugin runtime; official signing, store listing, and deployment pending.

## Verifiable implementation

- Repository URL: add after publication.
- Evidence commit SHA: add after publication.
- Plugin slug/version: `sub-rosa@0.1.0`.
- Cosmos Pay compatibility target: `v1.9.0`, commit
  `323ca9c3b6ca2dcf966dae083e952436733e9ed2`.
- Sub Rosa SDK: `@sub-rosa/sdk@0.3.2`.
- Permission surface: `payment_intents:read`; `egress: []`.
- Test commands: `npm run verify`, `npm run check:cosmos`,
  `npm run test:e2e:cosmos`.
- CI run URL: add after publication.
- Optional Testnet evidence/transaction URLs: add after running the opt-in live
  flow.

## Integration architecture

The external Cosmos Pay plugin maps a tenant's RFQ to a client-signed Sub Rosa
`ReceiptOnly` sealed-proposal round. Providers submit sealed proposals on
Stellar; the companion client executes reveal, verifies and hashes the canonical
receipt; the merchant records its selected provider; and the plugin may link an
existing tenant-owned Cosmos Pay payment intent. Cosmos Pay remains the payment
and settlement system.

## Completed in this repository

- Sandboxed plugin with strict input validation and versioned tenant storage.
- Full round locator and non-confidential receipt/transaction evidence mapping.
- Tenant-visible payment intent verification through the Cosmos Pay core API.
- Companion client using current public Sub Rosa SDK methods.
- Unit tests, pinned plugin validation, real Cosmos Pay HTTP runtime E2E and an
  opt-in live Stellar Testnet script.
- Architecture, security and installation documentation.

## Not completed / not claimed

- No Cosmos Pay support signature.
- No official-store listing.
- No Cosmos Pay-operated production deployment.
- No independent audit of this plugin.
- No claim that the sandbox itself verifies Stellar chain state.
- No claim that `ReceiptOnly` selects an on-chain winner or settles assets.
