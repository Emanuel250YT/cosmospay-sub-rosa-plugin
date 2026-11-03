#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COSMOS_PAY_DIR=$(bash "$ROOT_DIR/scripts/prepare-cosmos-pay.sh" | tail -n 1)

cp \
  "$ROOT_DIR/test/cosmos-pay/sub-rosa-plugin.e2e-spec.ts" \
  "$COSMOS_PAY_DIR/test/sub-rosa-plugin.e2e-spec.ts"

DATABASE_URL=postgresql://x:x@127.0.0.1:5432/x \
  npm --prefix "$COSMOS_PAY_DIR" run db:generate
npm --prefix "$COSMOS_PAY_DIR" run test:e2e -- \
  --runInBand test/sub-rosa-plugin.e2e-spec.ts
