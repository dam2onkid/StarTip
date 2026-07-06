#!/usr/bin/env bash
#
# Worker integration test for the verify-centric donate flow (ADR-0005 +
# ADR-0006). End-to-end against testnet + Supabase:
#
#   1. Deploy a fresh DonationRouter contract instance on testnet (or reuse
#      the contract id from $DONATION_ROUTER_CONTRACT_ID when provided).
#   2. Initialize config via __constructor and add_token for the native XLM SAC.
#   3. Register a test creator (fixed 32-byte creator_id_hash).
#   4. Submit a real donate() tx via the stellar CLI (4 args, no
#      donation_id_hash per ADR-0005).
#   5. Capture the tx hash.
#   6. Start the worker (if WORKER_URL is not already reachable).
#   7. POST /verify with the tx hash + off-chain content (message, donor_name).
#   8. Assert the response is 200 { status: "confirmed" }.
#   9. Query Supabase: assert the donations row exists with the tx_hash,
#      status = confirmed, and message/donor_name match the verify body.
#  10. Stop the worker (only if this script started it).
#
# Prerequisites:
#   - `stellar` CLI on $PATH, configured with a testnet identity (admin,
#     owner, donor). The script generates them with --overwrite if missing.
#   - `jq` on $PATH (for JSON assertions).
#   - `curl` on $PATH.
#   - A reachable Supabase project (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
#     with the donations table migrated per ADR-0005 (no donation_id_hash).
#   - The worker built (`pnpm --filter @startip/worker build`) OR `tsx`
#     available for `pnpm --filter @startip/worker dev`.
#
# Environment:
#   STELLAR_NETWORK               (default: testnet)
#   WORKER_URL                    (default: http://localhost:3101)
#   WORKER_SECRET                 (required)
#   SUPABASE_URL                  (required)
#   SUPABASE_SERVICE_ROLE_KEY     (required)
#   DONATION_ROUTER_CONTRACT_ID   (optional; if unset, a fresh contract is
#                                  deployed)
#   SKIP_INTEGRATION=1            skip entirely (for CI that cannot reach
#                                  testnet)
#
# Usage:
#   bash apps/worker/tests/integration.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Skip gate
# ---------------------------------------------------------------------------

if [ "${SKIP_INTEGRATION:-0}" = "1" ]; then
  echo "SKIP_INTEGRATION=1 set; skipping worker integration test." >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Config + required env
# ---------------------------------------------------------------------------

NETWORK="${STELLAR_NETWORK:-testnet}"
WORKER_URL="${WORKER_URL:-http://localhost:3101}"
FEE_BPS=100
MAX_FEE_BPS=500
# 1 XLM in stroops. Friendbot (testnet) funds 10_000 XLM.
DONATION_AMOUNT=10000000
# Fixed 32-byte Creator ID Hash. The contract keys creators by
# sha256(handle); this test uses a fixed value so the assertion is on the
# end-to-end verify path, not hash derivation.
CREATOR_ID_HASH="0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
DONOR_NAME="Integration Tester"
MESSAGE="verify-centric integration test"

required_vars=(
  WORKER_SECRET
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
)
for v in "${required_vars[@]}"; do
  if [ -z "${!v:-}" ]; then
    echo "FAIL: $v is required (set it in the environment)" >&2
    exit 1
  fi
done

# Locate the repo root (this script lives in apps/worker/tests/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WASM="$REPO_ROOT/contracts/target/wasm32v1-none/release/donation_router.wasm"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

step() {
  printf '\n\033[1m[step] %s\033[0m\n' "$*" >&2
}

addr() {
  stellar keys address "$1"
}

fund() {
  local pub="$1"
  # testnet friendbot is hosted by SDF; the local network container exposes
  # its own friendbot on the RPC port. mainnet has no friendbot (accounts
  # must be funded externally).
  case "$NETWORK" in
    testnet)
      curl -sS "https://friendbot.stellar.org?addr=${pub}" >/dev/null
      ;;
    local)
      curl -sS "http://localhost:8000/friendbot?addr=${pub}" >/dev/null
      ;;
    *)
      echo "  (skipping friendbot fund for $NETWORK; ensure $pub is funded)" >&2
      ;;
  esac
}

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $label: expected '$expected', got '$actual'" >&2
    exit 1
  fi
  echo "  $label: $actual"
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

WORKER_PID=""
CONTRACT_DEPLOYED=0

cleanup() {
  if [ -n "$WORKER_PID" ]; then
    step "stopping worker (pid $WORKER_PID)"
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Contract: deploy a fresh instance OR reuse the configured id
# ---------------------------------------------------------------------------

if [ -n "${DONATION_ROUTER_CONTRACT_ID:-}" ]; then
  CONTRACT_ID="$DONATION_ROUTER_CONTRACT_ID"
  step "reusing configured contract id: $CONTRACT_ID"
else
  step "building contract WASM"
  cd "$REPO_ROOT/contracts"
  stellar contract build --package donation-router
  test -f "$WASM" || { echo "FAIL: WASM not found at $WASM" >&2; exit 1; }

  step "generating and funding identities"
  stellar keys generate admin    --network "$NETWORK" --overwrite
  stellar keys generate owner    --network "$NETWORK" --overwrite
  stellar keys generate donor    --network "$NETWORK" --overwrite

  ADMIN_G="$(addr admin)"
  OWNER_G="$(addr owner)"
  DONOR_G="$(addr donor)"

  fund "$ADMIN_G"
  fund "$OWNER_G"
  fund "$DONOR_G"

  step "deploying DonationRouter with constructor args"
  CONTRACT_ID="$(stellar contract deploy \
    --wasm "$WASM" \
    --source admin \
    --network "$NETWORK" \
    -- \
    --admin "$ADMIN_G" \
    --treasury_address "$ADMIN_G" \
    --platform_fee_bps "$FEE_BPS" \
    --max_fee_bps "$MAX_FEE_BPS")"
  echo "  contract id: $CONTRACT_ID"
  CONTRACT_DEPLOYED=1
fi

# ---------------------------------------------------------------------------
# 2. add_token for the native XLM SAC (only when we deployed; a reused
#    contract is expected to be seeded already)
# ---------------------------------------------------------------------------

if [ "$CONTRACT_DEPLOYED" -eq 1 ]; then
  step "computing native XLM SAC contract id"
  SAC_ID="$(stellar contract id asset --asset native --network "$NETWORK")"
  echo "  native SAC id: $SAC_ID"

  step "admin calls add_token for the native XLM SAC"
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source admin \
    --network "$NETWORK" \
    -- add_token \
    --admin "$ADMIN_G" \
    --token "$SAC_ID"
fi

# ---------------------------------------------------------------------------
# 3. Register a test creator (only when we deployed; a reused contract is
#    expected to have a creator registered for CREATOR_ID_HASH)
# ---------------------------------------------------------------------------

if [ "$CONTRACT_DEPLOYED" -eq 1 ]; then
  step "owner calls register_creator"
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source owner \
    --network "$NETWORK" \
    -- register_creator \
    --owner "$OWNER_G" \
    --creator_id_hash "$CREATOR_ID_HASH" \
    --payout_address "$OWNER_G"
fi

# ---------------------------------------------------------------------------
# 4. Submit a real donate() tx via the stellar CLI (4 args, ADR-0005)
# ---------------------------------------------------------------------------

# When reusing a contract, generate a fresh donor so the tx hash is unique
# per run (a reused donor would need a sequence bump and risks NOT_FOUND
# ambiguity with prior runs).
if [ "$CONTRACT_DEPLOYED" -eq 0 ]; then
  step "generating and funding a fresh donor for this run"
  stellar keys generate donor --network "$NETWORK" --overwrite
  DONOR_G="$(addr donor)"
  fund "$DONOR_G"
fi

step "donor calls donate (4 args: donor, creator_id_hash, token, amount)"
# `stellar contract invoke` does not have a JSON output mode. It logs the
# transaction hash to stderr when it submits, so capture combined stdout +
# stderr and extract the hash with a regex. The hash is a 64-char hex
# string; the CLI prints it in a line like
#   INFO ...: submitted: hash=abc123...
# We grep for the first 64-char hex token in the combined stream.
SAC_ID="$(stellar contract id asset --asset native --network "$NETWORK")"

DONATE_OUT="$(stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source donor \
  --network "$NETWORK" \
  -- donate \
  --donor "$DONOR_G" \
  --creator_id_hash "$CREATOR_ID_HASH" \
  --token "$SAC_ID" \
  --amount "$DONATION_AMOUNT" 2>&1)"

echo "$DONATE_OUT" >&2

# Extract the first 64-char lowercase hex string from the combined output.
# This matches the tx hash logged by the CLI on submit.
TX_HASH="$(echo "$DONATE_OUT" | grep -oE '[0-9a-f]{64}' | head -n1 || true)"
if [ -z "$TX_HASH" ]; then
  echo "FAIL: could not extract tx hash from invoke output" >&2
  echo "$DONATE_OUT" >&2
  exit 1
fi
echo "  tx hash: $TX_HASH"

# ---------------------------------------------------------------------------
# 5. Start the worker (if WORKER_URL is not already reachable)
# ---------------------------------------------------------------------------

step "checking worker at $WORKER_URL"
WORKER_UP=0
if curl -sS -o /dev/null -w "%{http_code}" "$WORKER_URL/verify" -X POST \
    -H "authorization: Bearer $WORKER_SECRET" \
    -H "content-type: application/json" \
    -d '{}' 2>/dev/null | grep -qE '^(400|401)$'; then
  WORKER_UP=1
  echo "  worker already running"
fi

if [ "$WORKER_UP" -eq 0 ]; then
  step "starting worker from repo root"
  # Propagate the contract id + secret + Supabase env to the worker process.
  # The worker reads process.env directly (env.ts -> zod parse), so every
  # required var must be exported here.
  export DONATION_ROUTER_CONTRACT_ID="$CONTRACT_ID"
  export WORKER_SECRET
  export SUPABASE_URL
  export SUPABASE_SERVICE_ROLE_KEY
  case "$NETWORK" in
    testnet)
      export STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
      export STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
      ;;
    mainnet)
      export STELLAR_RPC_URL="https://soroban.stellar.org"
      export STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
      ;;
    *)
      # local + custom: rely on STELLAR_RPC_URL / STELLAR_NETWORK_PASSPHRASE
      # already being in the environment.
      ;;
  esac
  cd "$REPO_ROOT"
  pnpm --filter @startip/worker dev >"$SCRIPT_DIR/worker-integration.log" 2>&1 &
  WORKER_PID=$!
  echo "  worker pid: $WORKER_PID (log: $SCRIPT_DIR/worker-integration.log)"

  # Wait for the worker to come up (poll the verify endpoint).
  for _ in $(seq 1 30); do
    if curl -sS -o /dev/null -w "%{http_code}" "$WORKER_URL/verify" -X POST \
        -H "authorization: Bearer $WORKER_SECRET" \
        -H "content-type: application/json" \
        -d '{}' 2>/dev/null | grep -qE '^(400|401)$'; then
      WORKER_UP=1
      break
    fi
    sleep 1
  done
  if [ "$WORKER_UP" -eq 0 ]; then
    echo "FAIL: worker did not come up at $WORKER_URL" >&2
    cat "$SCRIPT_DIR/worker-integration.log" >&2 || true
    exit 1
  fi
  echo "  worker is up"
fi

# ---------------------------------------------------------------------------
# 6. POST /verify with the tx hash + off-chain content
# ---------------------------------------------------------------------------

step "POSTing /verify with tx_hash + message + donor_name"
VERIFY_BODY="$(jq -nc \
  --arg tx_hash "$TX_HASH" \
  --arg message "$MESSAGE" \
  --arg donor_name "$DONOR_NAME" \
  '{tx_hash: $tx_hash, message: $message, donor_name: $donor_name}')"

VERIFY_RES="$(curl -sS -w '\n%{http_code}' \
  "$WORKER_URL/verify" \
  -X POST \
  -H "authorization: Bearer $WORKER_SECRET" \
  -H "content-type: application/json" \
  -d "$VERIFY_BODY")"

VERIFY_STATUS="$(echo "$VERIFY_RES" | tail -n1)"
VERIFY_JSON="$(echo "$VERIFY_RES" | sed '$d')"
echo "  verify status: $VERIFY_STATUS"
echo "  verify body:   $VERIFY_JSON" >&2

# ---------------------------------------------------------------------------
# 7. Assert the response is 200 { status: "confirmed" }
# ---------------------------------------------------------------------------

assert_eq "verify http status" "$VERIFY_STATUS" "200"
VERIFY_STATUS_FIELD="$(echo "$VERIFY_JSON" | jq -r '.status // empty')"
assert_eq "verify body status" "$VERIFY_STATUS_FIELD" "confirmed"

# ---------------------------------------------------------------------------
# 8. Query Supabase: assert the donations row exists with tx_hash,
#    status = confirmed, and message/donor_name match
# ---------------------------------------------------------------------------

step "querying Supabase for the confirmed donations row"
# PostgREST select with eq filters on tx_hash. The service role bypasses RLS
# and can read private columns (tx_hash, message, donor_name, status).
SUPABASE_QUERY_URL="${SUPABASE_URL}/rest/v1/donations?select=status,message,donor_name&tx_hash=eq.${TX_HASH}"
SUPABASE_RES="$(curl -sS \
  "$SUPABASE_QUERY_URL" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")"

echo "  supabase row: $SUPABASE_RES" >&2

ROW_STATUS="$(echo "$SUPABASE_RES" | jq -r '.[0].status // empty')"
ROW_MESSAGE="$(echo "$SUPABASE_RES" | jq -r '.[0].message // empty')"
ROW_DONOR_NAME="$(echo "$SUPABASE_RES" | jq -r '.[0].donor_name // empty')"

assert_eq "donations.status"     "$ROW_STATUS"     "confirmed"
assert_eq "donations.message"    "$ROW_MESSAGE"    "$MESSAGE"
assert_eq "donations.donor_name" "$ROW_DONOR_NAME" "$DONOR_NAME"

# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------

printf '\n\033[1;32mPASS\033[0m: worker integration test succeeded — donate -> verify -> confirmed row in Supabase.\n'
