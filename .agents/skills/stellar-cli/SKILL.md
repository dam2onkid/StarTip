---
name: stellar-cli
description: The `stellar` command-line tool — keys, networks, contract build/deploy/invoke, the transaction pipeline, XDR/strkey, events, and ledger reads. Use when the user wants to run `stellar ...` commands, deploy or invoke Soroban contracts from the shell, build/sign/send transactions via the CLI, manage CLI identities or networks, start a local network container, or decode/encode XDR and strkeys. Also use when another skill needs the CLI invocation syntax for a Stellar workflow.
user-invocable: true
argument-hint: "[stellar-cli task]"
---

# Stellar CLI (`stellar`)

The `stellar` binary is the single entry point for Stellar from the shell: identities, networks, contracts, transactions, XDR, and ledger reads. It is a thin, composable wrapper over RPC — every networked command talks to a Stellar RPC endpoint.

## When to use this skill
- Running any `stellar ...` command, or translating a Stellar intent into the right subcommand
- Building, deploying, uploading, or invoking Soroban contracts from the shell
- Building, signing, simulating, or sending transactions via the `stellar tx` pipeline
- Managing CLI identities (`stellar keys`) or networks (`stellar network`), or starting a local network (`stellar container`)
- Reading ledger entries, events, or contract storage from the CLI
- Decoding/encoding XDR (`stellar xdr`) or strkeys (`stellar strkey`)
- Generating client bindings, inspecting contract WASM, or computing contract/asset IDs

## Related skills
- Writing the Rust contracts that `stellar contract build` compiles → `../soroban/SKILL.md`
- Reading chain data via the RPC/Horizon APIs directly (instead of the CLI) → `../data/SKILL.md`
- Classic assets, trustlines, and the Stellar Asset Contract → `../assets/SKILL.md`
- Frontend/wallets that call contracts → `../dapp/SKILL.md`
- SEP/CAP standards (e.g. SEP-53 messages) → `../standards/SKILL.md`

---

## Mental model

Three concepts collapse most of the CLI's surface area. Internalize them and the dozens of subcommands reduce to a few patterns.

### 1. Identities (`--source`, `--sign-with-key`)

An **identity** is a named keypair stored by the CLI (`stellar keys generate alice`). Anywhere a command takes a key, it accepts one of four forms — the CLI resolves them identically:

- an identity name: `--source alice`
- a public key: `--source GDKW...` (signing will fail; public keys can't sign)
- a secret key: `--source SC36...`
- a seed phrase: `--source "kite urban ..."` (24 words; `--hd-path` picks the derived key, default `0` → path `m/44'/148'/0`)

`--source`/`-s` (alias `source`) sets the transaction source account **and** signs unless `--build-only` is given. `--sign-with-key` signs an already-built envelope without being the source. Set a default identity once with `stellar keys use alice` to skip `--source` everywhere.

### 2. Networks (`--network`/`-n`)

A **network** is a named RPC endpoint + passphrase stored in config (`stellar network add`). Built-ins `testnet`, `futurenet`, and `local` are available out of the box; mainnet requires adding a provider RPC URL. `-n <name>` selects one. Set a default with `stellar network use testnet`. Anywhere you see **RPC Options** below, `-n`/`--rpc-url`/`--network-passphrase` are interchangeable ways to pick the target.

### 3. The slop (`--`)

`stellar contract invoke` generates an **implicit CLI** on-the-fly from the contract's schema, embedded in every Soroban WASM. Everything after the `--` double dash (the "slop") is parsed as that implicit CLI: the function name becomes a subcommand, and its arguments become `--arg-name value` flags.

```
stellar contract invoke --id CCR6... --source alice --network testnet -- hello --to world
#                                                            slop ^^^^^^^^^^^^^^^^^^
```

Discover a contract's CLI surface with `-- --help`. This is the canonical way to learn any contract's functions and argument names without reading its source.

---

## Shared option groups

These three groups repeat verbatim across every networked command. They are defined once here and referenced by name below — don't re-read them per command.

**RPC Options** — pick the network and tune simulation:
- `--rpc-url <URL>`, `--rpc-header <H>` (repeatable, e.g. `X-API-Key: abc123`), `--network-passphrase <P>`, `-n`/`--network <NAME>`
- `--resource-fee <STROOPS>` — overrides the simulated resource fee (1 stroop = 0.0000001 XLM)
- `--instruction-leeway <N>` — extra instructions budgeted for simulation (replaces deprecated `--instructions`)
- `--cost` — print execution cost to stderr
- `--auth-mode <enforce|root|non-root>` — authorization mode for `InvokeHostFunction` simulation. `enforce` validates auth entries already on the tx; `root`/`non-root` record them.

**Signing Options** — how the envelope gets signatures:
- `--sign-with-key <identity|SC..|seed-phrase>`, `--hd-path <N>` (default `0`)
- `--sign-with-lab` (lab.stellar.org), `--sign-with-ledger` (hardware wallet)
- `--auto-sign` — skip approval prompts for non-root Soroban auth entries

**Transaction Options** — envelope shape:
- `-s`/`--source-account <...>` (alias `source`) — source + signer (unless `--build-only`)
- `--inclusion-fee <STROOPS>` — max fee for inclusion (default 100; replaces deprecated `--fee`)
- `--build-only` — write the base64 XDR envelope to stdout, don't sign or send

Every networked command (deploy, invoke, upload, extend, restore, asset deploy, tx sign/simulate/send, etc.) accepts these groups, so the workflows below omit them except where a flag matters.

---

## Environment variables

Every flag has a `STELLAR_`-prefixed env var (legacy `SOROBAN_` aliases still work), so you can set a network and identity once per shell. `stellar env` prints the active set (`--reveal` shows secrets); `stellar env STELLAR_NETWORK` prints one value.

| Variable | Replaces |
|---|---|
| `STELLAR_NETWORK` | `--network` |
| `STELLAR_RPC_URL` | `--rpc-url` |
| `STELLAR_RPC_HEADERS` | `--rpc-header` (concealed in `env`) |
| `STELLAR_NETWORK_PASSPHRASE` | `--network-passphrase` |
| `STELLAR_ACCOUNT` | `--source-account` |
| `STELLAR_OPERATION_SOURCE_ACCOUNT` | `--operation-source-account` |
| `STELLAR_CONTRACT_ID` | `--id` |
| `STELLAR_INCLUSION_FEE` | `--inclusion-fee` |
| `STELLAR_SECRET_KEY` | a raw secret key (concealed) |
| `STELLAR_SIGN_WITH_KEY` | `--sign-with-key` (concealed) |
| `STELLAR_SIGN_WITH_LAB` / `STELLAR_SIGN_WITH_LEDGER` | the matching sign flags |
| `STELLAR_SEND` | `--send` (`default`/`no`/`yes`) |
| `STELLAR_NO_CACHE` | `--no-cache` |
| `STELLAR_ARCHIVE_URL` | `--archive-url` (snapshot) |
| `STELLAR_CONFIG_HOME` / `STELLAR_DATA_HOME` | config/data directory |

Global flags: `--config-dir`, `-q`/`--quiet`, `-v`/`--verbose`, `--very-verbose`/`-vv`, `--no-cache`, `-f`/`--filter-logs` (or `RUST_LOG`).

---

## Workflows

### Setup: identities, networks, local net

```bash
# Create an identity (24-word seed phrase, stored in config or OS keychain)
stellar keys generate alice --network testnet --fund          # generates + funds on testnet
stellar keys generate alice --secure-store                     # store in OS keychain instead
stellar keys add bob --public-key GABC...                      # add a watch-only identity
stellar keys add hw --ledger                                    # import from a Ledger device

stellar keys ls                                                 # list identities
stellar keys public-key alice                                   # resolve identity -> address (alias: address)
stellar keys use alice                                          # set default --source for all commands
stellar keys secret alice --phrase                              # export seed phrase (use with care)

# Networks
stellar network ls -l                                           # list configured networks (long form)
stellar network add mainnet --rpc-url https://... --network-passphrase "Public Global Stellar Network ; September 2015"
stellar network use testnet                                     # set default --network
stellar network health                                          # RPC health check
stellar network info                                             # RPC info / latest ledger
stellar network settings                                         # network config settings (JSON/XDR)

# Local network in a container (needs Docker)
stellar container start local                                   # quickstart: node + RPC + Horizon + friendbot
stellar container start testnet                                 # run a testnet-following container
stellar container stop
stellar container logs
```

The local container exposes RPC at `http://localhost:8000/soroban/rpc` and friendbot at `http://localhost:8000/friendbot`. The `local` network name points there by default.

### Contract lifecycle

```bash
# Scaffold
stellar contract init ./myproj --name mycontract                # creates a Cargo workspace + sample contract

# Build (compiles cdylib crates to wasm32, optimized by default)
stellar contract build                                          # in a workspace, builds all cdylib crates
stellar contract build --package mycontract --profile release
stellar contract build --print-commands-only                    # show cargo cmds without running
stellar contract build --optimize=false                         # skip optimization (needs additional-libs feature)

# Inspect a built/deployed contract
stellar contract info interface --wasm target/wasm32v1-none/release/mycontract.wasm --output json
stellar contract info meta --wasm ...                           # developer key/value meta
stellar contract info env-meta --wasm ...                       # env compatibility meta
stellar contract info build --wasm ...                          # build info + attestation if source_repo meta set
stellar contract info hash --wasm ...                           # SHA-256 of the WASM

# Deploy (creates a contract instance from wasm or an already-uploaded wasm hash)
stellar contract deploy --wasm target/.../mycontract.wasm --source alice --network testnet --alias mycontract
stellar contract deploy --wasm-hash <HASH> --source alice --network testnet --alias mycontract
# With constructor args (passed via the slop to __constructor):
stellar contract deploy --wasm ... --source alice -- --arg1 val1

# Upload wasm without instantiating (then deploy by hash later)
stellar contract upload --wasm ... --source alice --network testnet

# Invoke — the primary interaction primitive
stellar contract invoke --id mycontract --source alice --network testnet -- increment
stellar contract invoke --id CCR6... --source alice --network testnet -- --help   # discover the contract CLI
# Read-only calls without submitting a tx (--send belongs to invoke, before the --):
stellar contract invoke --id mycontract --network testnet --send no -- get_count
```

`--send` controls submission: `default` (send only if the sim shows writes/events/auth), `no` (simulate only, never sign), `yes` (always send). `--send no` replaces the deprecated `--is-view`. Always put `--send` before the `--` slop — anything after `--` goes to the contract's implicit CLI.

**Aliases** map human names to contract IDs in config:
```bash
stellar contract alias add mycontract --id CCR6... --overwrite
stellar contract alias ls
stellar contract alias show mycontract
stellar contract alias remove mycontract
```

**Storage, TTL, and eviction** — Soroban ledger entries have a time-to-live and can be evicted:
```bash
stellar contract read --id mycontract --key Counter --output json      # read a storage entry
stellar contract read --id mycontract --key-xdr <BASE64> --durability temporary
stellar contract extend --id mycontract --ledgers-to-extend 1000 --source alice   # bump TTL
stellar contract extend --id mycontract --key Counter --ledgers-to-extend 1000 --source alice
stellar contract restore --id mycontract --key Counter --source alice             # restore evicted entry
```

**Asset contracts (SAC)** — wrap a classic asset as a Soroban contract:
```bash
stellar contract id asset --asset "USDC:G..." --network testnet      # compute the SAC contract ID
stellar contract asset deploy --asset "USDC:G..." --source alice --network testnet --alias usdc
```

**Bindings** — generate client code from a contract's schema:
```bash
stellar contract bindings rust --wasm target/.../mycontract.wasm
stellar contract bindings typescript --contract-id mycontract --output-dir ./ts-client --network testnet
# python / java / flutter / swift / php also exist (see stellar contract bindings --help)
```

**Fetch** a deployed contract's wasm: `stellar contract fetch --id <ID> -o out.wasm`.

### Transaction pipeline

`stellar tx` is a **Unix-pipe toolkit** over transaction envelopes (base64 XDR on stdin/stdout). Build an envelope in one command, pipe it into the next. This is how you construct multi-operation transactions and offline-signing flows.

```bash
# Build a single-op tx (no submission; --build-only emits XDR)
stellar tx new payment --source alice --destination GBXY... --amount 100 --build-only > tx.xdr

# Chain more operations onto an existing envelope
stellar tx operation add payment --source alice --destination GBZZ... --amount 50 tx.xdr > tx2.xdr
# (alias: stellar tx op add ...)

# Inspect / edit
stellar tx decode tx.xdr --output json-formatted
stellar tx edit < tx.xdr > edited.xdr          # opens $STELLAR_EDITOR / $EDITOR / $VISUAL
stellar tx hash tx.xdr

# Sign (append signatures without sending)
stellar tx sign --sign-with-key bob tx.xdr > signed.xdr

# Simulate (for Soroban InvokeHostFunction ops)
stellar tx simulate --source alice signed.xdr

# Send
stellar tx send signed.xdr

# Fetch a submitted tx by hash
stellar tx fetch --hash <HASH>                       # envelope (default)
stellar tx fetch result --hash <HASH>                # result
stellar tx fetch meta --hash <HASH>                  # metadata
stellar tx fetch fee --hash <HASH>                   # fee breakdown
stellar tx fetch events --hash <HASH>                # events
```

`stellar tx new <OP>` and `stellar tx op add <OP>` share the same operation set (~22 classic operations). Each operation has its own `--help` with specific flags. The full operation catalog with required arguments is in [references/operations.md](references/operations.md). Common ones:

- `payment` — `--destination`, `--amount`, `--asset` (default native)
- `create-account` — `--destination`, `--starting-balance`
- `change-trust` — `--line <ASSET>`, `--limit` (0 removes)
- `manage-data` — `--data-name`, `--data-value`
- `set-options` — flags, signers, home domain
- `bump-sequence` — `--bump-to`
- `account-merge`, `create-claimable-balance`, `claim-claimable-balance`, `clawback`, `set-trustline-flags`, `manage-sell-offer`, `manage-buy-offer`, `path-payment-strict-send/receive`, `liquidity-pool-deposit/withdraw`, `begin/end-sponsoring-future-reserves`, `revoke-sponsorship`, `create-passive-sell-offer`

`stellar tx update sequence-number next` fetches the source account's current sequence number and increments it on the envelope (useful for pre-built/offline envelopes).

### Reading chain data from the CLI

For ad-hoc reads the CLI wraps the same RPC methods covered in `../data/SKILL.md`:

```bash
stellar ledger latest                                    # latest ledger seq + info
stellar ledger fetch 12345 --limit 5 --output json       # fetch ledger range
stellar ledger entry fetch account --account alice       # account entry
stellar ledger entry fetch contract-data --contract mycontract --key Counter
stellar ledger entry fetch trustline --account alice --asset "USDC:G..."
stellar ledger entry fetch claimable-balance --id <ID>
stellar ledger entry fetch liquidity-pool --id <ID>
stellar ledger entry fetch contract-code --wasm-hash <HASH>
stellar ledger entry fetch data --account alice --data-name key
stellar ledger entry fetch offer --account alice --offer 123
```

All `ledger entry fetch` commands take `--output json|json-formatted|xdr`.

### Events

```bash
stellar events --network testnet --start-ledger 12345 --count 50
stellar events --id CCR6... --topic "AAAABQAAAAdDT1VOVEVSAA==,*" --type contract
# --output pretty|plain|json|raw ; --type all|contract|system
# --topic segments are base64 XDR ScVals; * is a single-segment wildcard, ** is multi-segment
```

### XDR & strkey tooling

```bash
# XDR
stellar xdr decode --type TransactionEnvelope --input single-base64 tx.xdr --output json-formatted
stellar xdr encode --type ScVal --input json '{"symbol":"hello"}'   # -> base64 XDR
stellar xdr guess tx.xdr                  # list types the bytes could decode as
stellar xdr types list                    # list all known XDR types
stellar xdr types schema --type AccountEntry
stellar xdr compare --type ScVal left.xdr right.xdr   # -1/0/1
stellar xdr generate default --type AccountEntry      # default-constructed value

# strkey (the G.../S.../C.../M... string encodings)
stellar strkey decode GABC...               # -> JSON
stellar strkey encode '{"public_key_ed25519":"..."}'
stellar strkey zero contract               # zero-value strkey of a given type
```

`stellar xdr` takes a channel arg (`+curr` default, `+next` for the next protocol version's XDR).

### Messages (SEP-53)

```bash
stellar message sign "Hello, World!" --sign-with-key alice
stellar message verify "Hello, World!" --signature <BASE64_SIG> --public-key GABC...
# --base64 treats the message as base64-encoded binary
# The "Stellar Signed Message:\n" prefix is added automatically; don't include it yourself
```

### Fees

```bash
stellar fees stats --network testnet --output json       # current network fee stats
stellar fees use --fee-metric p90                        # default inclusion fee = network p90
stellar fees use --amount 200                            # default inclusion fee = 200 stroops
stellar fees unset
# stellar fee-stats is deprecated; use `fees stats`
```

### Diagnostics & housekeeping

```bash
stellar doctor                  # diagnose CLI/network issues
stellar env --reveal            # print active env vars (secrets hidden unless --reveal)
stellar config dir              # show config directory
stellar config migrate          # migrate local config to global dir
stellar cache path              # cache location (txs, specs)
stellar cache clean             # delete cache
stellar cache actionlog ls      # list cached actions (experimental)
stellar completion --shell zsh  # shell completions
stellar version
```

---

## Command index

Top-level `stellar` subcommands:

| Command | Purpose |
|---|---|
| `keys` | Create/manage identities (generate, add, fund, ls, rm, secret, use, unset, public-key) |
| `network` | Configure networks (add, rm, ls, use, unset, health, info, settings, root-account) |
| `container` | Local Docker networks (start, stop, logs) |
| `contract` | Smart-contract toolkit (see below) |
| `tx` | Transaction pipeline (new, operation, sign, simulate, send, fetch, decode, encode, edit, hash, update) |
| `events` | Stream contract events |
| `ledger` | Ledger reads (latest, fetch, entry fetch ...) |
| `xdr` | Decode/encode/compare/generate XDR; type schemas |
| `strkey` | Decode/encode strkeys |
| `message` | SEP-53 sign/verify |
| `fees` | Fee stats + default fee config (stats, use, unset) |
| `snapshot` | Create/merge ledger snapshots from a history archive |
| `config` | CLI config (dir, migrate) |
| `cache` | Cache (clean, path, actionlog) |
| `env` | Print active env vars |
| `doctor` | Diagnose CLI/network issues |
| `completion` | Shell completions |
| `plugin` | Search/list CLI plugins |
| `version` | Version info |

`stellar contract` subcommands: `init`, `build`, `deploy`, `upload`, `fetch`, `invoke`, `read`, `extend`, `restore`, `id` (asset/wasm), `asset` (id/deploy), `alias` (add/remove/show/ls), `bindings` (rust/typescript/python/java/flutter/swift/php), `info` (interface/meta/env-meta/build/hash). Deprecated aliases: `install`→`upload`, `inspect`→`info`, `optimize`→`build --optimize`.

---

## Pointers

- **Full per-command reference**: every flag of every subcommand is in `stellar <cmd> --help`, and the complete rendered manual lives at https://raw.githubusercontent.com/stellar/stellar-cli/refs/heads/main/FULL_HELP_DOCS.md — consult it when you need a flag not summarized here.
- **Classic operation arguments**: [references/operations.md](references/operations.md) lists each `tx new`/`tx op add` operation and its required flags.
- **Contract code & testing**: the contracts that this CLI builds are written per `../soroban/SKILL.md`.
- **RPC method semantics** behind `ledger`/`events`/`simulate`: `../data/SKILL.md`.
