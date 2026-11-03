#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COSMOS_PAY_DIR=$(bash "$ROOT_DIR/scripts/prepare-cosmos-pay.sh" | tail -n 1)

npm --prefix "$COSMOS_PAY_DIR" run plugins -- check sub-rosa
