.PHONY: build test integration-test clean

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
