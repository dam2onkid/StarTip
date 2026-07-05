#!/usr/bin/env bash
#
# Local-network integration test for the DonationRouter contract.
#
# This is the secondary test seam (PRD issue 04). It exists only to catch
# build, deploy, CLI-encoding, and real SAC token regressions. Behavior
# coverage lives in the unit tests in src/lib.rs.
#
# What it does, end-to-end against a fresh `stellar container start local`:
#   1. Builds the contract WASM via `stellar contract build`.
#   2. Starts a local network container.
#   3. Generates and funds four identities (admin, treasury, owner, donor).
#   4. Deploys the contract with constructor args (atomic init, CAP-0058).
#   5. Computes the native XLM SAC contract ID and calls `add_token`.
#   6. Calls `register_creator` with a Creator ID Hash and Payout Address.
#   7. Calls `donate` with the allowed token and an amount.
#   8. Asserts the `DonationReceived` event is visible via `stellar events`
#      and carries the expected fields.
#
# Prerequisites:
#   - Docker (or a Docker-compatible runtime) running and available.
#   - `stellar` CLI on $PATH.
#   - `jq` on $PATH (for event field assertions).
#
# Usage:
#   contracts/donation-router/tests/integration.sh
#
# Run from the repo root or the contracts/ workspace. The script cd's into the
# contracts workspace itself.

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

NETWORK="${STELLAR_NETWORK:-local}"
FEE_BPS=100        # 1% platform fee
MAX_FEE_BPS=500    # 5% immutable cap
# 100 XLM in stroops (1 XLM = 10_000_000 stroops). Friendbot funds 10_000 XLM
# on the local network, so the donor has plenty of headroom.
DONATION_AMOUNT=1000000000
# Fixed 32-byte Creator ID Hash. The contract keys Creators by sha256(handle);
# this test uses a fixed value so the assertion is on the end-to-end path,
# not hash derivation.
CREATOR_ID_HASH="0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"

# Locate the contracts workspace (this script lives in
# contracts/donation-router/tests/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WASM="$CONTRACTS_DIR/target/wasm32v1-none/release/donation_router.wasm"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Print a message to stderr with a prefix, then run the command. Exits on
# failure because of `set -e`.
step() {
  printf '\n\033[1m[step] %s\033[0m\n' "$*" >&2
}

# Resolve an identity to its public key (G... address). The public key is
# stored in config and is network-independent, so no --network flag is needed.
addr() {
  stellar keys address "$1"
}

# Fund an account via the local friendbot.
fund() {
  local pub="$1"
  curl -sS "http://localhost:8000/friendbot?addr=${pub}" >/dev/null
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

CONTAINER_STARTED=0

cleanup() {
  if [ "$CONTAINER_STARTED" -eq 1 ]; then
    step "stopping local network container"
    stellar container stop "$NETWORK" || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Build the WASM
# ---------------------------------------------------------------------------

step "building contract WASM"
cd "$CONTRACTS_DIR"
stellar contract build --package donation-router
test -f "$WASM" || { echo "WASM not found at $WASM" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 2. Start the local network
# ---------------------------------------------------------------------------

step "starting local network container"
# If the container is already running, `stellar container start` may fail.
# In that case, reuse the existing container and do NOT stop it on cleanup
# (we didn't start it).
if stellar container start "$NETWORK"; then
  CONTAINER_STARTED=1
else
  echo "  container start returned non-zero; assuming it is already running." >&2
  CONTAINER_STARTED=0
fi

# Wait for RPC to be healthy before proceeding.
step "waiting for RPC to be healthy"
for _ in $(seq 1 30); do
  if stellar network health --network "$NETWORK" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
stellar network health --network "$NETWORK" >/dev/null

# ---------------------------------------------------------------------------
# 3. Generate and fund identities
# ---------------------------------------------------------------------------

step "generating and funding identities"
# --overwrite makes the script idempotent across runs. --network is passed so
# the identities are associated with the local network config (harmless without
# --fund; funding is done via curl to friendbot below for explicitness).
stellar keys generate admin    --network "$NETWORK" --overwrite
stellar keys generate treasury --network "$NETWORK" --overwrite
stellar keys generate owner    --network "$NETWORK" --overwrite
stellar keys generate donor    --network "$NETWORK" --overwrite

ADMIN_G="$(addr admin)"
TREASURY_G="$(addr treasury)"
OWNER_G="$(addr owner)"
DONOR_G="$(addr donor)"

# Fund every account via friendbot. The treasury and payout (owner here, used
# as payout for simplicity) must exist as accounts so the native XLM SAC
# transfer can credit them.
fund "$ADMIN_G"
fund "$TREASURY_G"
fund "$OWNER_G"
fund "$DONOR_G"

# ---------------------------------------------------------------------------
# 4. Deploy with constructor args (atomic init, CAP-0058)
# ---------------------------------------------------------------------------

step "deploying DonationRouter with constructor args"
CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM" \
  --source admin \
  --network "$NETWORK" \
  -- \
  --admin "$ADMIN_G" \
  --treasury_address "$TREASURY_G" \
  --platform_fee_bps "$FEE_BPS" \
  --max_fee_bps "$MAX_FEE_BPS")"
echo "  contract id: $CONTRACT_ID"

# ---------------------------------------------------------------------------
# 5. add_token for the native XLM SAC
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# 6. register_creator
# ---------------------------------------------------------------------------

step "owner calls register_creator"
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source owner \
  --network "$NETWORK" \
  -- register_creator \
  --owner "$OWNER_G" \
  --creator_id_hash "$CREATOR_ID_HASH" \
  --payout_address "$OWNER_G"

# ---------------------------------------------------------------------------
# 7. donate
# ---------------------------------------------------------------------------

# Capture the ledger sequence before the donate so the event query can start
# from here. The local network closes a ledger every ~5s.
step "recording ledger sequence before donate"
LEDGER_BEFORE="$(stellar ledger latest --network "$NETWORK" --output json | jq -r '.sequence')"
echo "  ledger before: $LEDGER_BEFORE"

step "donor calls donate"
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source donor \
  --network "$NETWORK" \
  -- donate \
  --donor "$DONOR_G" \
  --creator_id_hash "$CREATOR_ID_HASH" \
  --token "$SAC_ID" \
  --amount "$DONATION_AMOUNT"

# ---------------------------------------------------------------------------
# 8. Assert the DonationReceived event is visible and carries expected fields
# ---------------------------------------------------------------------------

step "querying events for the DonationReceived event"
# Poll events starting from the ledger before the donate. The event may land
# one or two ledgers after the tx, so query a generous count.
EVENTS_JSON=""
for _ in $(seq 1 15); do
  EVENTS_JSON="$(stellar events \
    --network "$NETWORK" \
    --id "$CONTRACT_ID" \
    --type contract \
    --start-ledger "$LEDGER_BEFORE" \
    --count 50 \
    --output json 2>/dev/null || true)"
  if echo "$EVENTS_JSON" | jq -e 'length > 0' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ -z "$EVENTS_JSON" ]; then
  echo "FAIL: no events returned from stellar events" >&2
  exit 1
fi

echo "$EVENTS_JSON" | jq . >&2

# The DonationReceived event has prefix topic "donation_received". The exact
# JSON shape of `stellar events --output json` varies across CLI versions
# (the decoded event data may live under .value, .data, or be nested inside a
# map keyed by the event name). Rather than depend on one shape, flatten the
# entire event stream to a single string and assert that every expected field
# value appears in it. This is robust against CLI output changes while still
# proving the event carries the right fields (PRD user story 29).
EVENTS_FLAT="$(echo "$EVENTS_JSON" | jq -r '.')"

if ! echo "$EVENTS_FLAT" | grep -q "donation_received"; then
  echo "FAIL: DonationReceived event not found in event stream" >&2
  echo "events:" >&2
  echo "$EVENTS_JSON" >&2
  exit 1
fi
echo "  DonationReceived event found in stream"

# Expected fee split: 1% of 1_000_000_000 stroops = 10_000_000 fee,
# 990_000_000 net.
EXPECTED_FEE=10000000
EXPECTED_NET=990000000

# Assert each expected field value appears somewhere in the event JSON. The
# stellar CLI decodes BytesN<32> as a hex string, Address as a strkey, and
# integers as decimal numbers, so these literal matches are stable.
assert_in_events() {
  local label="$1" needle="$2"
  if ! echo "$EVENTS_FLAT" | grep -qF "$needle"; then
    echo "FAIL: $label not found in event stream (expected $needle)" >&2
    echo "events:" >&2
    echo "$EVENTS_JSON" >&2
    exit 1
  fi
  echo "  $label found: $needle"
}

assert_in_events "creator_id_hash"      "$CREATOR_ID_HASH"
assert_in_events "amount"               "$DONATION_AMOUNT"
assert_in_events "fee_amount"           "$EXPECTED_FEE"
assert_in_events "net_amount"           "$EXPECTED_NET"
assert_in_events "token (native SAC)"   "$SAC_ID"
assert_in_events "treasury_address"     "$TREASURY_G"
assert_in_events "payout_address"       "$OWNER_G"

# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------

printf '\n\033[1;32mPASS\033[0m: integration test succeeded — DonationReceived emitted with expected fields.\n'
