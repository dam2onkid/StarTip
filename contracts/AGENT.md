## Contracts (`contracts/`) rules

Soroban smart contracts written in Rust. Read `contracts/CONTEXT.md` before making domain changes.

### Amounts

- On-chain amounts are i128 integers in raw units (the smallest divisible unit, `10^decimals` per display unit).
- Store and compare amounts in raw units. Never use display units inside contract logic.
- `donations.amount` and `donation_goals.target_amount` store raw numeric strings.

### Testing

- Unit tests: `make test` from `contracts/` (runs `cargo test`)
- Build: `make build` from `contracts/`
- Integration tests: `make integration-test` from `contracts/`

### Main contract

- The primary contract is `donation-router`. Read `contracts/donation-router/README.md` for its invariants and interface.
