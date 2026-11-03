#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COSMOS_PAY_REF=${COSMOS_PAY_REF:-323ca9c3b6ca2dcf966dae083e952436733e9ed2}
COSMOS_PAY_DIR=${COSMOS_PAY_DIR:-"$ROOT_DIR/.cosmos-pay/pinned"}

if [[ ! -d "$COSMOS_PAY_DIR/.git" ]]; then
  mkdir -p "$(dirname "$COSMOS_PAY_DIR")"
  git clone https://github.com/CosmosPay/CosmosPay-Community-Server.git "$COSMOS_PAY_DIR"
fi

git -C "$COSMOS_PAY_DIR" fetch --quiet origin "$COSMOS_PAY_REF"
FETCHED_REF=$(git -C "$COSMOS_PAY_DIR" rev-parse FETCH_HEAD)
git -C "$COSMOS_PAY_DIR" checkout --quiet --detach "$FETCHED_REF"

if [[ ! -x "$COSMOS_PAY_DIR/node_modules/.bin/jest" ]]; then
  npm ci --prefix "$COSMOS_PAY_DIR"
fi

mkdir -p "$COSMOS_PAY_DIR/plugins/sub-rosa"
cp "$ROOT_DIR/plugin/sub-rosa/plugin.json" "$COSMOS_PAY_DIR/plugins/sub-rosa/plugin.json"
cp "$ROOT_DIR/plugin/sub-rosa/index.ts" "$COSMOS_PAY_DIR/plugins/sub-rosa/index.ts"

printf '%s\n' "$COSMOS_PAY_DIR"
