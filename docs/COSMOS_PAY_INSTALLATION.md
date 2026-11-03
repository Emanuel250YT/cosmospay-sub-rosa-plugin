# Cosmos Pay installation

## Unsigned development mode

Clone the pinned Cosmos Pay version and install its dependencies:

```bash
git clone https://github.com/CosmosPay/CosmosPay-Community-Server.git
cd CosmosPay-Community-Server
git checkout 323ca9c3b6ca2dcf966dae083e952436733e9ed2
npm ci
```

Copy this repository's `plugin/sub-rosa` folder to
`CosmosPay-Community-Server/plugins/sub-rosa`, then validate it:

```bash
npm run plugins -- check sub-rosa
```

Run Cosmos Pay in non-production unsigned development mode:

```bash
PLUGINS_ENABLED=sub-rosa \
PLUGINS_ALLOW_UNSIGNED=true \
npm run start:dev
```

Never enable `PLUGINS_ALLOW_UNSIGNED` in production; Cosmos Pay rejects that
configuration there.

Install the plugin for a tenant with a gateway-authenticated key holding
`plugins:write`:

```bash
curl -X PUT http://127.0.0.1:3000/v1/plugins/sub-rosa/installation \
  -H 'content-type: application/json' \
  -H "x-gateway-secret: $COSMOS_PAY_GATEWAY_SECRET" \
  -H "x-consumer-username: $COSMOS_PAY_CONSUMER_USERNAME" \
  -H 'x-consumer-role: user' \
  -H 'x-consumer-permissions: plugins:read,plugins:write' \
  -d '{"grantCapabilities":["payment_intents:read"]}'
```

## Automated compatibility

From this repository:

```bash
npm run check:cosmos
npm run test:e2e:cosmos
```

The scripts use `.cosmos-pay/pinned` by default. Set `COSMOS_PAY_DIR` to reuse a
different clone. Set `COSMOS_PAY_REF=main` for a non-pinned compatibility probe.

## Production/store installation

External registry publication requires exactly `plugin.json`, `index.ts` and a
valid `signature.json`. This project deliberately does not forge or generate an
official signature. Cosmos Pay or an authorized operator must review and sign
the final version before registry installation and production enablement.
