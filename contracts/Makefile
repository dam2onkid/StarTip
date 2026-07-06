.PHONY: build test integration-test clean deploy

# Build the contract WASM via the Stellar CLI.
build:
	stellar contract build --package donation-router

# Run the unit test suite (soroban-sdk testutils, no network required).
test:
	cargo test

# Run the local-network integration test. Requires Docker.
integration-test:
	./donation-router/tests/integration.sh

# Remove build artifacts.
clean:
	cargo clean

# Deploy the contract to a Stellar network via the Stellar CLI.
# Defaults match the testnet deployment record (issue 07):
#   NETWORK=testnet, SOURCE=continuum-deployer, FEE_BPS=100, MAX_FEE_BPS=500,
#   ADMIN_G=TREASURY_G=GDOAROA7O4BFXS3CPXUNA4NQWZJIN3YN67BEZYZMYLI4STZEFI3BODO4.
# Override any of them on the command line or via the environment, e.g.
#   make deploy ADMIN_G=G... TREASURY_G=G...
#   NETWORK=pubnet SOURCE=my-identity make deploy
# Constructor args are passed atomically with the deploy (CAP-0058).
deploy: build
	NETWORK="$${NETWORK:-testnet}" && \
	SOURCE="$${SOURCE:-continuum-deployer}" && \
	ADMIN_G="$${ADMIN_G:-GDOAROA7O4BFXS3CPXUNA4NQWZJIN3YN67BEZYZMYLI4STZEFI3BODO4}" && \
	TREASURY_G="$${TREASURY_G:-GDOAROA7O4BFXS3CPXUNA4NQWZJIN3YN67BEZYZMYLI4STZEFI3BODO4}" && \
	FEE_BPS="$${FEE_BPS:-100}" && \
	MAX_FEE_BPS="$${MAX_FEE_BPS:-500}" && \
	stellar contract deploy \
	  --wasm target/wasm32v1-none/release/donation_router.wasm \
	  --network "$$NETWORK" \
	  --source "$$SOURCE" \
	  -- \
	  --admin "$$ADMIN_G" \
	  --treasury_address "$$TREASURY_G" \
	  --platform_fee_bps "$$FEE_BPS" \
	  --max_fee_bps "$$MAX_FEE_BPS"
