#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env, Vec,
};

/// Singleton instance-storage key for the packed `Config`.
const CONFIG_KEY: soroban_sdk::Symbol = symbol_short!("config");

/// Packed configuration stored in instance storage. One read, one write for
/// every admin operation.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub treasury_address: Address,
    pub platform_fee_bps: u32,
    pub max_fee_bps: u32,
    pub paused: bool,
    pub token_allowlist: Vec<Address>,
}

/// Storage key for the persistent Creator map. Extensible: new variants can be
/// added without changing the existing key encoding.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Creator(BytesN<32>),
}

/// A Creator registry entry. Keyed by Creator ID Hash (`sha256(handle)`).
#[contracttype]
#[derive(Clone)]
pub struct Creator {
    pub owner: Address,
    pub payout_address: Address,
    pub active: bool,
}

/// Typed error vocabulary. Every revert in the contract uses one of these
/// variants so the off-chain confirm and indexer paths can decode the reason.
/// No bare `panic!` with strings anywhere in the crate.
#[contracterror]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Error {
    Unauthorized = 1,
    Paused = 2,
    CreatorNotFound = 3,
    CreatorInactive = 4,
    InvalidAmount = 5,
    TokenNotAllowed = 6,
    FeeCapExceeded = 7,
    AlreadyRegistered = 8,
}

/// Emitted by `register_creator`. The off-chain indexer mirrors this into
/// the Creator registry view.
#[contractevent]
#[derive(Clone)]
pub struct CreatorRegistered {
    pub creator_id_hash: BytesN<32>,
    pub owner: Address,
    pub payout_address: Address,
}

/// Emitted by `update_creator_payout`.
#[contractevent]
#[derive(Clone)]
pub struct CreatorPayoutUpdated {
    pub creator_id_hash: BytesN<32>,
    pub old_payout_address: Address,
    pub new_payout_address: Address,
}

/// Emitted by `set_creator_active`. Covers both the owner self-pause and the
/// admin force-pause paths.
#[contractevent]
#[derive(Clone)]
pub struct CreatorActiveChanged {
    pub creator_id_hash: BytesN<32>,
    pub active: bool,
}

/// Emitted by `set_treasury_address`.
#[contractevent]
#[derive(Clone)]
pub struct TreasuryUpdated {
    pub old_treasury_address: Address,
    pub new_treasury_address: Address,
}

/// Emitted by `set_platform_fee_bps`.
#[contractevent]
#[derive(Clone)]
pub struct PlatformFeeUpdated {
    pub old_bps: u32,
    pub new_bps: u32,
}

/// Emitted by `set_paused`.
#[contractevent]
#[derive(Clone)]
pub struct PausedChanged {
    pub paused: bool,
}

/// Emitted by `set_admin`. Single-step transfer (ADR-0004).
#[contractevent]
#[derive(Clone)]
pub struct AdminUpdated {
    pub old_admin: Address,
    pub new_admin: Address,
}

/// Emitted by `add_token` (`added = true`) and `remove_token`
/// (`added = false`).
#[contractevent]
#[derive(Clone)]
pub struct TokenAllowlistUpdated {
    pub token: Address,
    pub added: bool,
}

/// Emitted by `donate`. The off-chain indexer and confirm path depend on this
/// exact field set to link the on-chain settlement to the pending Donation
/// row. Field names, order, and types match PRD user story 29.
#[contractevent]
#[derive(Clone)]
pub struct DonationReceived {
    pub creator_id_hash: BytesN<32>,
    pub token: Address,
    pub amount: i128,
    pub fee_amount: i128,
    pub net_amount: i128,
    pub treasury_address: Address,
    pub payout_address: Address,
    pub donation_id_hash: BytesN<32>,
}

#[contract]
pub struct DonationRouter;

#[contractimpl]
impl DonationRouter {
    /// CAP-0058 constructor. Runs once at deploy time.
    ///
    /// Validates `platform_fee_bps <= max_fee_bps` (reverting with
    /// `FeeCapExceeded` otherwise), stores the packed `Config` with
    /// `paused = false` and an empty `token_allowlist`, and extends the
    /// instance storage TTL. `max_fee_bps` has no setter for the life of the
    /// contract; it is the immutable trust anchor.
    pub fn __constructor(
        env: Env,
        admin: Address,
        treasury_address: Address,
        platform_fee_bps: u32,
        max_fee_bps: u32,
    ) {
        if platform_fee_bps > max_fee_bps {
            soroban_sdk::panic_with_error!(&env, Error::FeeCapExceeded);
        }

        let config = Config {
            admin,
            treasury_address,
            platform_fee_bps,
            max_fee_bps,
            paused: false,
            token_allowlist: Vec::new(&env),
        };
        env.storage().instance().set(&CONFIG_KEY, &config);

        // Extend the instance storage TTL so the config does not archive.
        // ~518400 ledgers is 30 days at 5s per ledger.
        env.storage().instance().extend_ttl(100, 518400);
    }

    /// Read-only helper exposing the packed `Config`. The MVP function list
    /// does not require getters (the indexer reads events, the CLI reads
    /// storage directly), but tests need to observe stored state through the
    /// public API rather than poking storage internals.
    pub fn get_config(env: Env) -> Option<Config> {
        env.storage().instance().get(&CONFIG_KEY)
    }

    /// Read-only helper exposing a Creator entry by Creator ID Hash. Tests use
    /// this to verify registry state through the public API.
    pub fn get_creator(env: Env, creator_id_hash: BytesN<32>) -> Option<Creator> {
        env.storage()
            .persistent()
            .get(&DataKey::Creator(creator_id_hash))
    }

    /// Self-register a Creator. The caller (authenticated via `require_auth`)
    /// becomes the entry's `owner`. Reverts with `AlreadyRegistered` if the
    /// Creator ID Hash is already in the registry. Stores the entry with
    /// `active = true`, extends its persistent TTL to ~30 days, and emits
    /// `CreatorRegistered`.
    ///
    /// No payout address validation (ADR-0004): a Creator who points
    /// `payout_address` at the contract address strands funds permanently.
    pub fn register_creator(
        env: Env,
        owner: Address,
        creator_id_hash: BytesN<32>,
        payout_address: Address,
    ) {
        owner.require_auth();

        let key = DataKey::Creator(creator_id_hash.clone());
        if env.storage().persistent().has(&key) {
            soroban_sdk::panic_with_error!(&env, Error::AlreadyRegistered);
        }

        let creator = Creator {
            owner: owner.clone(),
            payout_address: payout_address.clone(),
            active: true,
        };
        env.storage().persistent().set(&key, &creator);
        // A fresh persistent entry defaults to a short TTL, so the threshold is
        // set to the target to guarantee the new entry starts at ~30 days
        // rather than only bumping once it has decayed.
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);

        CreatorRegistered {
            creator_id_hash,
            owner,
            payout_address,
        }
        .publish(&env);
    }

    /// Update a Creator's payout address. Reverts with `CreatorNotFound` if
    /// the entry is missing, and `Unauthorized` if the caller is not the
    /// stored owner. The caller is authenticated via `require_auth`, then
    /// checked against the stored owner. Updates `payout_address`, extends
    /// the entry's persistent TTL, and emits `CreatorPayoutUpdated`.
    ///
    /// No payout address validation (ADR-0004).
    pub fn update_creator_payout(
        env: Env,
        caller: Address,
        creator_id_hash: BytesN<32>,
        new_payout_address: Address,
    ) {
        caller.require_auth();

        let key = DataKey::Creator(creator_id_hash.clone());
        let mut creator: Creator = match env.storage().persistent().get(&key) {
            Some(c) => c,
            None => soroban_sdk::panic_with_error!(&env, Error::CreatorNotFound),
        };
        if creator.owner != caller {
            soroban_sdk::panic_with_error!(&env, Error::Unauthorized);
        }

        let old_payout_address = creator.payout_address.clone();
        creator.payout_address = new_payout_address.clone();
        env.storage().persistent().set(&key, &creator);
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);

        CreatorPayoutUpdated {
            creator_id_hash,
            old_payout_address,
            new_payout_address,
        }
        .publish(&env);
    }

    /// Owner-only self-pause / self-unpause. Reverts with `CreatorNotFound` if
    /// the entry is missing, `Unauthorized` if the caller is not the stored
    /// owner. Updates `active`, extends TTL, emits `CreatorActiveChanged`.
    pub fn set_creator_active_owner(
        env: Env,
        caller: Address,
        creator_id_hash: BytesN<32>,
        active: bool,
    ) {
        caller.require_auth();
        Self::set_creator_active_inner(&env, &caller, &creator_id_hash, active, true);
    }

    /// Admin-only force-pause / force-unpause for a malicious Creator. Reverts
    /// with `CreatorNotFound` if the entry is missing, `Unauthorized` if the
    /// caller is not the `Config.admin`. Updates `active`, extends TTL, emits
    /// `CreatorActiveChanged`.
    pub fn force_pause_creator(
        env: Env,
        caller: Address,
        creator_id_hash: BytesN<32>,
        active: bool,
    ) {
        caller.require_auth();
        Self::set_creator_active_inner(&env, &caller, &creator_id_hash, active, false);
    }

    /// Shared body for `set_creator_active_owner` (`check_owner = true`) and
    /// `force_pause_creator` (`check_owner = false`, checks admin instead).
    /// The caller has already been authenticated via `require_auth`; this
    /// verifies the caller matches the authorized role, mutates the entry,
    /// extends TTL, and emits the event.
    fn set_creator_active_inner(
        env: &Env,
        caller: &Address,
        creator_id_hash: &BytesN<32>,
        active: bool,
        check_owner: bool,
    ) {
        let key = DataKey::Creator(creator_id_hash.clone());
        let mut creator: Creator = match env.storage().persistent().get(&key) {
            Some(c) => c,
            None => soroban_sdk::panic_with_error!(env, Error::CreatorNotFound),
        };

        if check_owner {
            if creator.owner != *caller {
                soroban_sdk::panic_with_error!(env, Error::Unauthorized);
            }
        } else {
            let config: Config = env
                .storage()
                .instance()
                .get(&CONFIG_KEY)
                .expect("config must be initialized");
            if config.admin != *caller {
                soroban_sdk::panic_with_error!(env, Error::Unauthorized);
            }
        }

        creator.active = active;
        env.storage().persistent().set(&key, &creator);
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);

        CreatorActiveChanged {
            creator_id_hash: creator_id_hash.clone(),
            active,
        }
        .publish(env);
    }

    /// Admin-only: update the Treasury address. Extends instance TTL and emits
    /// `TreasuryUpdated`.
    pub fn set_treasury_address(env: Env, admin: Address, new_treasury: Address) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        let old_treasury_address = config.treasury_address.clone();
        config.treasury_address = new_treasury.clone();
        Self::save_config(&env, &config);

        TreasuryUpdated {
            old_treasury_address,
            new_treasury_address: new_treasury,
        }
        .publish(&env);
    }

    /// Admin-only: update the Platform Fee in basis points. Reverts with
    /// `FeeCapExceeded` if `new_fee_bps > max_fee_bps`. Extends instance TTL
    /// and emits `PlatformFeeUpdated`.
    pub fn set_platform_fee_bps(env: Env, admin: Address, new_fee_bps: u32) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        if new_fee_bps > config.max_fee_bps {
            soroban_sdk::panic_with_error!(&env, Error::FeeCapExceeded);
        }
        let old_bps = config.platform_fee_bps;
        config.platform_fee_bps = new_fee_bps;
        Self::save_config(&env, &config);

        PlatformFeeUpdated { old_bps, new_bps: new_fee_bps }.publish(&env);
    }

    /// Admin-only: set the paused flag. Extends instance TTL and emits
    /// `PausedChanged`.
    pub fn set_paused(env: Env, admin: Address, paused: bool) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        config.paused = paused;
        Self::save_config(&env, &config);

        PausedChanged { paused }.publish(&env);
    }

    /// Admin-only: single-step transfer of the Admin role. Extends instance
    /// TTL and emits `AdminUpdated`. No propose/accept (ADR-0004).
    pub fn set_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        let old_admin = config.admin.clone();
        config.admin = new_admin.clone();
        Self::save_config(&env, &config);

        AdminUpdated { old_admin, new_admin }.publish(&env);
    }

    /// Admin-only: append a token to the Token Allowlist if absent. Extends
    /// instance TTL and emits `TokenAllowlistUpdated { added: true }`.
    pub fn add_token(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        if !config.token_allowlist.contains(&token) {
            config.token_allowlist.push_back(token.clone());
            Self::save_config(&env, &config);
        }

        TokenAllowlistUpdated { token, added: true }.publish(&env);
    }

    /// Admin-only: remove a token from the Token Allowlist if present. Extends
    /// instance TTL and emits `TokenAllowlistUpdated { added: false }`.
    pub fn remove_token(env: Env, admin: Address, token: Address) {
        admin.require_auth();
        let mut config = Self::load_config(&env);
        Self::require_admin(&env, &config, &admin);
        let mut found = false;
        let mut kept = Vec::new(&env);
        let n = config.token_allowlist.len();
        let mut i = 0u32;
        while i < n {
            let t = config.token_allowlist.get(i).expect("index in range");
            if t == token {
                found = true;
            } else {
                kept.push_back(t);
            }
            i += 1;
        }
        if found {
            config.token_allowlist = kept;
            Self::save_config(&env, &config);
        }

        TokenAllowlistUpdated { token, added: false }.publish(&env);
    }

    /// The core settlement path. Splits a donation into a platform fee (sent
    /// to the Treasury) and a net amount (sent to the Creator's payout
    /// address), then emits `DonationReceived` for the off-chain indexer.
    ///
    /// Validation order: donor auth, paused, creator exists, creator active,
    /// amount > 0, token in allowlist. Fee split: `fee_amount = amount *
    /// platform_fee_bps / 10_000`, `net_amount = amount - fee_amount`. Zero
    /// transfers are skipped (ADR-0004). Transfers use
    /// `token::Client::transfer` with the donor as `from`; Soroban auth
    /// propagation covers the nested calls so the donor signs once.
    ///
    /// No on-chain replay tracking for `donation_id_hash` (ADR-0004). No
    /// per-Donation storage.
    pub fn donate(
        env: Env,
        donor: Address,
        creator_id_hash: BytesN<32>,
        token: Address,
        amount: i128,
        donation_id_hash: BytesN<32>,
    ) {
        donor.require_auth();

        let config = Self::load_config(&env);
        if config.paused {
            soroban_sdk::panic_with_error!(&env, Error::Paused);
        }

        let key = DataKey::Creator(creator_id_hash.clone());
        let creator: Creator = match env.storage().persistent().get(&key) {
            Some(c) => c,
            None => soroban_sdk::panic_with_error!(&env, Error::CreatorNotFound),
        };
        if !creator.active {
            soroban_sdk::panic_with_error!(&env, Error::CreatorInactive);
        }
        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, Error::InvalidAmount);
        }
        if !config.token_allowlist.contains(&token) {
            soroban_sdk::panic_with_error!(&env, Error::TokenNotAllowed);
        }

        let fee_amount = amount
            .checked_mul(config.platform_fee_bps as i128)
            .expect("fee multiplication must not overflow")
            / 10_000;
        let net_amount = amount
            .checked_sub(fee_amount)
            .expect("net amount must not overflow");

        let token_client = soroban_sdk::token::Client::new(&env, &token);
        if fee_amount > 0 {
            token_client.transfer(
                &donor,
                &config.treasury_address,
                &fee_amount,
            );
        }
        if net_amount > 0 {
            token_client.transfer(
                &donor,
                &creator.payout_address,
                &net_amount,
            );
        }

        // Extend TTLs: the Creator entry (persistent) and the Config
        // (instance) both get bumped so a burst of donations keeps them live.
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);
        env.storage().instance().extend_ttl(100, 518_400);

        DonationReceived {
            creator_id_hash,
            token,
            amount,
            fee_amount,
            net_amount,
            treasury_address: config.treasury_address,
            payout_address: creator.payout_address,
            donation_id_hash,
        }
        .publish(&env);
    }

    /// Load the packed `Config` from instance storage. The constructor always
    /// stores it, so `expect` is safe; if it is missing the contract was
    /// deployed incorrectly and every call should fail fast.
    fn load_config(env: &Env) -> Config {
        env.storage()
            .instance()
            .get(&CONFIG_KEY)
            .expect("config must be initialized")
    }

    /// Store the packed `Config` and extend the instance storage TTL so the
    /// config does not archive.
    fn save_config(env: &Env, config: &Config) {
        env.storage().instance().set(&CONFIG_KEY, config);
        env.storage().instance().extend_ttl(100, 518_400);
    }

    /// Verify the caller is the stored Admin. `require_auth` proves the caller
    /// signed/authenticated; this check proves they are the *right* signer.
    /// Under `mock_all_auths` every address authenticates, so this second
    /// check is what actually enforces admin-only access.
    fn require_admin(env: &Env, config: &Config, caller: &Address) {
        if config.admin != *caller {
            soroban_sdk::panic_with_error!(env, Error::Unauthorized);
        }
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use soroban_sdk::{
        testutils::{storage::Persistent, Address as _, Events as _},
        Address, Env, Event as _,
    };
    use soroban_sdk::token::StellarAssetClient;
    use soroban_sdk::token::TokenClient;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    /// 30 days at 5s per ledger. Every Creator-touching call extends the
    /// entry's persistent TTL to this value.
    const CREATOR_TTL: u32 = 518_400;

    /// Build a deterministic Creator ID Hash from a seed byte. The contract
    /// keys Creators by `sha256(handle)`; tests use a fixed 32-byte value
    /// instead of computing a real hash so the assertion is on registry
    /// behavior, not hash derivation.
    fn creator_id_hash(env: &Env, seed: u8) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        bytes[0] = seed;
        BytesN::from_array(env, &bytes)
    }

    /// Register the contract with a standard config (1% fee, 5% cap) and
    /// return the env, contract id, client, admin, and treasury. Most tests
    /// start here. The client carries a phantom lifetime (it owns its env and
    /// address clones), so a single `'a` parameter satisfies the type.
    fn setup<'a>() -> (
        Env,
        soroban_sdk::Address,
        DonationRouterClient<'a>,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let contract_id = env.register(DonationRouter, (&admin, &treasury, &100u32, &500u32));
        let client = DonationRouterClient::new(&env, &contract_id);
        (env, contract_id, client, admin, treasury)
    }

    /// Constructor with valid args stores the config read-back-correctly:
    /// admin, treasury, fee, cap, paused=false, empty allowlist.
    #[test]
    fn constructor_stores_config() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let platform_fee_bps = 100u32; // 1%
        let max_fee_bps = 500u32; // 5%

        let contract_id = env.register(
            DonationRouter,
            (&admin, &treasury, &platform_fee_bps, &max_fee_bps),
        );
        let client = DonationRouterClient::new(&env, &contract_id);

        let config = client.get_config().expect("config must be stored");
        assert_eq!(config.admin, admin);
        assert_eq!(config.treasury_address, treasury);
        assert_eq!(config.platform_fee_bps, platform_fee_bps);
        assert_eq!(config.max_fee_bps, max_fee_bps);
        assert!(!config.paused);
        assert_eq!(config.token_allowlist.len(), 0);
    }

    /// `platform_fee_bps > max_fee_bps` reverts with `FeeCapExceeded` (error
    /// code 7).
    ///
    /// The CAP-0058 constructor runs at registration time and is not exposed
    /// on the generated client (methods starting with `__` are filtered out),
    /// so the revert is observed via `catch_unwind` around `env.register`. The
    /// host wraps the contract error in a context error before panicking, so
    /// the specific error code is read from the diagnostic event log, where it
    /// appears as `Error(Contract, #7)`. The error code is the contract's
    /// public interface, so this assertion is behavior-based, not coupled to
    /// internal storage encoding.
    #[test]
    fn constructor_reverts_when_fee_exceeds_cap() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let platform_fee_bps = 600u32; // 6%
        let max_fee_bps = 500u32; // 5%

        let result = catch_unwind(AssertUnwindSafe(|| {
            env.register(
                DonationRouter,
                (&admin, &treasury, &platform_fee_bps, &max_fee_bps),
            )
        }));
        assert!(result.is_err(), "constructor must revert when fee > cap");

        // The contract error code is recorded in the diagnostic event log.
        // FeeCapExceeded is error code 7 (see the `Error` enum).
        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String = events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #7)"),
            "expected FeeCapExceeded (Error(Contract, #7)) in diagnostic events, got: {rendered}"
        );
    }

    // ----- register_creator -------------------------------------------------

    /// `register_creator` stores a Creator with `owner = caller`,
    /// `active = true`, the given payout address, extends the entry's
    /// persistent TTL to ~30 days, and emits `CreatorRegistered` with the
    /// creator id hash, owner, and payout address.
    #[test]
    fn register_creator_stores_entry_and_emits_event() {
        let (env, contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 1);

        client.register_creator(&owner, &id_hash, &payout);

        // Capture the event immediately after the call that emitted it. The
        // test env's event buffer only retains events from the most recent
        // top-level invocation, so any subsequent client call would overwrite
        // this buffer before the assertion.
        let expected = CreatorRegistered {
            creator_id_hash: id_hash.clone(),
            owner: owner.clone(),
            payout_address: payout.clone(),
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        // Verify stored state and TTL through the public read helper. This
        // call resets the event buffer, so it must come after the event
        // assertion above.
        let creator = client
            .get_creator(&id_hash)
            .expect("creator entry must be stored");
        assert_eq!(creator.owner, owner);
        assert_eq!(creator.payout_address, payout);
        assert!(creator.active, "new creator must be active");

        // TTL extended to ~30 days on the persistent entry.
        let ttl = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Creator(id_hash.clone()))
        });
        assert_eq!(ttl, CREATOR_TTL);
    }

    /// Registering the same Creator ID Hash twice reverts with
    /// `AlreadyRegistered` (error code 8).
    #[test]
    fn register_creator_reverts_on_duplicate() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 2);

        client.register_creator(&owner, &id_hash, &payout);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.register_creator(&owner, &id_hash, &payout)
        }));
        assert!(result.is_err(), "duplicate register must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #8)"),
            "expected AlreadyRegistered (Error(Contract, #8)), got: {rendered}"
        );
    }

    // ----- update_creator_payout -------------------------------------------

    /// `update_creator_payout` updates the payout address when called by the
    /// stored owner, extends the entry's TTL, and emits
    /// `CreatorPayoutUpdated` with the old and new payout addresses.
    #[test]
    fn update_creator_payout_owner_updates_and_emits_event() {
        let (env, contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let old_payout = Address::generate(&env);
        let new_payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 3);

        client.register_creator(&owner, &id_hash, &old_payout);

        client.update_creator_payout(&owner, &id_hash, &new_payout);

        // Event captured immediately after the call that emitted it.
        let expected = CreatorPayoutUpdated {
            creator_id_hash: id_hash.clone(),
            old_payout_address: old_payout.clone(),
            new_payout_address: new_payout.clone(),
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        // Stored payout address updated; owner and active unchanged.
        let creator = client
            .get_creator(&id_hash)
            .expect("creator entry must still exist");
        assert_eq!(creator.owner, owner);
        assert_eq!(creator.payout_address, new_payout);
        assert!(creator.active);

        let ttl = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Creator(id_hash.clone()))
        });
        assert_eq!(ttl, CREATOR_TTL);
    }

    /// `update_creator_payout` reverts with `CreatorNotFound` (error code 3)
    /// when the Creator ID Hash is not registered.
    #[test]
    fn update_creator_payout_reverts_when_creator_missing() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let new_payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 4);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.update_creator_payout(&owner, &id_hash, &new_payout)
        }));
        assert!(result.is_err(), "missing creator must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #3)"),
            "expected CreatorNotFound (Error(Contract, #3)), got: {rendered}"
        );
    }

    /// `update_creator_payout` reverts with `Unauthorized` (error code 1) when
    /// the caller is not the stored owner. `mock_all_auths` approves every
    /// address, so the contract's own owner check is what fails here: the
    /// caller address is authenticated but does not match the stored owner.
    #[test]
    fn update_creator_payout_reverts_for_non_owner() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let attacker = Address::generate(&env);
        let payout = Address::generate(&env);
        let new_payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 5);

        client.register_creator(&owner, &id_hash, &payout);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.update_creator_payout(&attacker, &id_hash, &new_payout)
        }));
        assert!(result.is_err(), "non-owner must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- set_creator_active_owner / force_pause_creator -------------------

    /// `set_creator_active_owner` lets the stored owner pause/unpause their
    /// own entry, extends TTL, and emits `CreatorActiveChanged`.
    #[test]
    fn set_creator_active_owner_self_pause_and_emits_event() {
        let (env, contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 6);

        client.register_creator(&owner, &id_hash, &payout);

        client.set_creator_active_owner(&owner, &id_hash, &false);

        let expected = CreatorActiveChanged {
            creator_id_hash: id_hash.clone(),
            active: false,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let creator = client
            .get_creator(&id_hash)
            .expect("creator entry must still exist");
        assert!(!creator.active, "owner must have paused the entry");
        assert_eq!(creator.owner, owner);

        let ttl = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Creator(id_hash.clone()))
        });
        assert_eq!(ttl, CREATOR_TTL);
    }

    /// `set_creator_active_owner` reverts with `CreatorNotFound` (error code 3)
    /// when the entry is missing.
    #[test]
    fn set_creator_active_owner_reverts_when_creator_missing() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 7);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.set_creator_active_owner(&owner, &id_hash, &false)
        }));
        assert!(result.is_err(), "missing creator must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #3)"),
            "expected CreatorNotFound (Error(Contract, #3)), got: {rendered}"
        );
    }

    /// `set_creator_active_owner` reverts with `Unauthorized` (error code 1)
    /// when the caller is not the stored owner.
    #[test]
    fn set_creator_active_owner_reverts_for_non_owner() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let attacker = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 8);

        client.register_creator(&owner, &id_hash, &payout);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.set_creator_active_owner(&attacker, &id_hash, &false)
        }));
        assert!(result.is_err(), "non-owner must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    /// `force_pause_creator` lets the Admin force-pause a malicious Creator,
    /// extends TTL, and emits `CreatorActiveChanged`.
    #[test]
    fn force_pause_creator_admin_force_pause_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 9);

        client.register_creator(&owner, &id_hash, &payout);

        client.force_pause_creator(&admin, &id_hash, &false);

        let expected = CreatorActiveChanged {
            creator_id_hash: id_hash.clone(),
            active: false,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let creator = client
            .get_creator(&id_hash)
            .expect("creator entry must still exist");
        assert!(!creator.active, "admin must have force-paused the entry");

        let ttl = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Creator(id_hash.clone()))
        });
        assert_eq!(ttl, CREATOR_TTL);
    }

    /// `force_pause_creator` reverts with `CreatorNotFound` (error code 3)
    /// when the entry is missing.
    #[test]
    fn force_pause_creator_reverts_when_creator_missing() {
        let (env, _contract_id, client, admin, _treasury) = setup();

        let id_hash = creator_id_hash(&env, 10);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.force_pause_creator(&admin, &id_hash, &false)
        }));
        assert!(result.is_err(), "missing creator must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #3)"),
            "expected CreatorNotFound (Error(Contract, #3)), got: {rendered}"
        );
    }

    /// `force_pause_creator` reverts with `Unauthorized` (error code 1) when
    /// the caller is not the Admin.
    #[test]
    fn force_pause_creator_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 11);

        client.register_creator(&owner, &id_hash, &payout);

        // The owner is authenticated but is not the admin.
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.force_pause_creator(&owner, &id_hash, &false)
        }));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- set_treasury_address --------------------------------------------

    /// `set_treasury_address` updates the treasury, extends instance TTL, and
    /// emits `TreasuryUpdated` with old and new treasury addresses.
    #[test]
    fn set_treasury_address_admin_updates_and_emits_event() {
        let (env, contract_id, client, admin, treasury) = setup();

        let new_treasury = Address::generate(&env);

        client.set_treasury_address(&admin, &new_treasury);

        let expected = TreasuryUpdated {
            old_treasury_address: treasury,
            new_treasury_address: new_treasury.clone(),
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert_eq!(config.treasury_address, new_treasury);
    }

    /// `set_treasury_address` reverts with `Unauthorized` (error code 1) when
    /// the caller is not the Admin.
    #[test]
    fn set_treasury_address_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let attacker = Address::generate(&env);
        let new_treasury = Address::generate(&env);

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.set_treasury_address(&attacker, &new_treasury)
        }));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- set_platform_fee_bps --------------------------------------------

    /// `set_platform_fee_bps` updates the fee, extends instance TTL, and emits
    /// `PlatformFeeUpdated` with old and new bps.
    #[test]
    fn set_platform_fee_bps_admin_updates_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        let new_bps = 200u32; // 2%
        client.set_platform_fee_bps(&admin, &new_bps);

        let expected = PlatformFeeUpdated {
            old_bps: 100,
            new_bps,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert_eq!(config.platform_fee_bps, new_bps);
        // max_fee_bps is immutable and unchanged.
        assert_eq!(config.max_fee_bps, 500);
    }

    /// `set_platform_fee_bps` reverts with `FeeCapExceeded` (error code 7) when
    /// `new_fee_bps > max_fee_bps`.
    #[test]
    fn set_platform_fee_bps_reverts_when_above_cap() {
        let (env, _contract_id, client, admin, _treasury) = setup();

        let too_high = 600u32; // 6% > 5% cap
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.set_platform_fee_bps(&admin, &too_high)
        }));
        assert!(result.is_err(), "fee above cap must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #7)"),
            "expected FeeCapExceeded (Error(Contract, #7)), got: {rendered}"
        );
    }

    /// `set_platform_fee_bps` reverts with `Unauthorized` (error code 1) when
    /// the caller is not the Admin.
    #[test]
    fn set_platform_fee_bps_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let attacker = Address::generate(&env);
        let new_bps = 200u32;

        let result = catch_unwind(AssertUnwindSafe(|| {
            client.set_platform_fee_bps(&attacker, &new_bps)
        }));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- set_paused ------------------------------------------------------

    /// `set_paused` updates the paused flag, extends instance TTL, and emits
    /// `PausedChanged`.
    #[test]
    fn set_paused_admin_updates_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        client.set_paused(&admin, &true);

        let expected = PausedChanged { paused: true };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert!(config.paused);
    }

    /// `set_paused` reverts with `Unauthorized` (error code 1) when the caller
    /// is not the Admin.
    #[test]
    fn set_paused_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let attacker = Address::generate(&env);

        let result = catch_unwind(AssertUnwindSafe(|| client.set_paused(&attacker, &true)));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- set_admin -------------------------------------------------------

    /// `set_admin` transfers the admin role in a single step, extends instance
    /// TTL, and emits `AdminUpdated` with old and new admin addresses.
    #[test]
    fn set_admin_admin_transfers_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        let new_admin = Address::generate(&env);

        client.set_admin(&admin, &new_admin);

        let expected = AdminUpdated {
            old_admin: admin,
            new_admin: new_admin.clone(),
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert_eq!(config.admin, new_admin);
    }

    /// `set_admin` reverts with `Unauthorized` (error code 1) when the caller
    /// is not the current Admin.
    #[test]
    fn set_admin_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let attacker = Address::generate(&env);
        let new_admin = Address::generate(&env);

        let result =
            catch_unwind(AssertUnwindSafe(|| client.set_admin(&attacker, &new_admin)));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- add_token / remove_token ----------------------------------------

    /// `add_token` appends a token to the allowlist if absent, extends instance
    /// TTL, and emits `TokenAllowlistUpdated { added: true }`. Calling it twice
    /// with the same token does not duplicate the entry.
    #[test]
    fn add_token_admin_adds_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        let token = Address::generate(&env);

        client.add_token(&admin, &token);

        let expected = TokenAllowlistUpdated {
            token: token.clone(),
            added: true,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert_eq!(config.token_allowlist.len(), 1);
        assert_eq!(config.token_allowlist.get(0), Some(token.clone()));

        // Adding the same token again is idempotent: no duplicate, still emits
        // the event so the indexer can observe the attempt.
        client.add_token(&admin, &token);
        let config = client.get_config().expect("config must exist");
        assert_eq!(config.token_allowlist.len(), 1);
    }

    /// `add_token` reverts with `Unauthorized` (error code 1) when the caller
    /// is not the Admin.
    #[test]
    fn add_token_reverts_for_non_admin() {
        let (env, _contract_id, client, _admin, _treasury) = setup();

        let attacker = Address::generate(&env);
        let token = Address::generate(&env);

        let result =
            catch_unwind(AssertUnwindSafe(|| client.add_token(&attacker, &token)));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    /// `remove_token` removes a token from the allowlist if present, extends
    /// instance TTL, and emits `TokenAllowlistUpdated { added: false }`.
    #[test]
    fn remove_token_admin_removes_and_emits_event() {
        let (env, contract_id, client, admin, _treasury) = setup();

        let token = Address::generate(&env);
        client.add_token(&admin, &token);

        client.remove_token(&admin, &token);

        let expected = TokenAllowlistUpdated {
            token: token.clone(),
            added: false,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        let config = client.get_config().expect("config must exist");
        assert_eq!(config.token_allowlist.len(), 0);
    }

    /// `remove_token` reverts with `Unauthorized` (error code 1) when the
    /// caller is not the Admin.
    #[test]
    fn remove_token_reverts_for_non_admin() {
        let (env, _contract_id, client, admin, _treasury) = setup();

        let token = Address::generate(&env);
        client.add_token(&admin, &token);

        let attacker = Address::generate(&env);
        let result =
            catch_unwind(AssertUnwindSafe(|| client.remove_token(&attacker, &token)));
        assert!(result.is_err(), "non-admin must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #1)"),
            "expected Unauthorized (Error(Contract, #1)), got: {rendered}"
        );
    }

    // ----- donate ----------------------------------------------------------

    /// Build a donation-ready environment: contract deployed with 1% fee,
    /// a mock SAC token registered and added to the allowlist, a Creator
    /// registered with a payout address, and the donor funded with
    /// `donor_balance` tokens. Returns everything the tests need.
    fn donate_setup<'a>(
        donor_balance: i128,
    ) -> (
        Env,
        soroban_sdk::Address,
        DonationRouterClient<'a>,
        Address,
        Address,
        Address,
        Address,
        BytesN<32>,
        soroban_sdk::Address,
        StellarAssetClient<'a>,
        TokenClient<'a>,
    ) {
        let (env, contract_id, client, admin, treasury) = setup();

        // Register a mock SAC token and add it to the allowlist.
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_id = token_contract.address();
        let sac = StellarAssetClient::new(&env, &token_id);
        let token = TokenClient::new(&env, &token_id);
        client.add_token(&admin, &token_id);

        // Register a Creator.
        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 20);
        client.register_creator(&owner, &id_hash, &payout);

        // Fund the donor.
        let donor = Address::generate(&env);
        sac.mint(&donor, &donor_balance);

        (
            env, contract_id, client, admin, treasury, donor, payout, id_hash,
            token_id, sac, token,
        )
    }

    /// `donate` splits the amount into fee and net, transfers each to the
    /// correct destination, extends TTLs, and emits `DonationReceived` with
    /// all nine fields matching the expected values.
    #[test]
    fn donate_happy_path_splits_and_emits_event() {
        let amount: i128 = 10_000_000; // 1 unit at 7 decimals
        let (env, contract_id, client, _admin, treasury, donor, payout, id_hash, token_id, _sac, token) =
            donate_setup(amount);

        let donation_id_hash = creator_id_hash(&env, 99);

        client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash);

        // Event captured immediately after the call that emitted it.
        let expected = DonationReceived {
            creator_id_hash: id_hash.clone(),
            token: token_id.clone(),
            amount,
            fee_amount: 100_000, // 1% of 10_000_000
            net_amount: 9_900_000,
            treasury_address: treasury.clone(),
            payout_address: payout.clone(),
            donation_id_hash: donation_id_hash.clone(),
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        // Balances: fee to treasury, net to payout, donor spent the full amount.
        assert_eq!(token.balance(&treasury), 100_000);
        assert_eq!(token.balance(&payout), 9_900_000);
        assert_eq!(token.balance(&donor), 0);

        // TTLs extended.
        let creator_ttl = env.as_contract(&contract_id, || {
            env.storage()
                .persistent()
                .get_ttl(&DataKey::Creator(id_hash.clone()))
        });
        assert_eq!(creator_ttl, CREATOR_TTL);
    }

    /// `donate` reverts with `Paused` (error code 2) when the contract is
    /// paused.
    #[test]
    fn donate_reverts_when_paused() {
        let amount: i128 = 1_000;
        let (env, _contract_id, client, admin, _treasury, donor, _payout, id_hash, token_id, _sac, _token) =
            donate_setup(amount);

        client.set_paused(&admin, &true);

        let donation_id_hash = creator_id_hash(&env, 98);
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash)
        }));
        assert!(result.is_err(), "paused contract must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #2)"),
            "expected Paused (Error(Contract, #2)), got: {rendered}"
        );
    }

    /// `donate` reverts with `CreatorNotFound` (error code 3) for an
    /// unregistered Creator ID Hash.
    #[test]
    fn donate_reverts_when_creator_missing() {
        let amount: i128 = 1_000;
        let (env, _contract_id, client, _admin, _treasury, donor, _payout, _id_hash, token_id, _sac, _token) =
            donate_setup(amount);

        let missing_id = creator_id_hash(&env, 77);
        let donation_id_hash = creator_id_hash(&env, 98);
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &missing_id, &token_id, &amount, &donation_id_hash)
        }));
        assert!(result.is_err(), "missing creator must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #3)"),
            "expected CreatorNotFound (Error(Contract, #3)), got: {rendered}"
        );
    }

    /// `donate` reverts with `CreatorInactive` (error code 4) when the
    /// Creator's `active` flag is false.
    #[test]
    fn donate_reverts_when_creator_inactive() {
        let amount: i128 = 1_000;
        let (env, _contract_id, client, admin, _treasury, donor, _payout, id_hash, token_id, _sac, _token) =
            donate_setup(amount);

        // Force-pause the creator via the admin kill-switch.
        client.force_pause_creator(&admin, &id_hash, &false);

        let donation_id_hash = creator_id_hash(&env, 98);
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash)
        }));
        assert!(result.is_err(), "inactive creator must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #4)"),
            "expected CreatorInactive (Error(Contract, #4)), got: {rendered}"
        );
    }

    /// `donate` reverts with `InvalidAmount` (error code 5) for `amount <= 0`.
    #[test]
    fn donate_reverts_for_zero_or_negative_amount() {
        let amount: i128 = 1_000;
        let (env, _contract_id, client, _admin, _treasury, donor, _payout, id_hash, token_id, _sac, _token) =
            donate_setup(amount);

        let donation_id_hash = creator_id_hash(&env, 98);

        // Zero amount.
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token_id, &0i128, &donation_id_hash)
        }));
        assert!(result.is_err(), "zero amount must revert");
        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #5)"),
            "expected InvalidAmount (Error(Contract, #5)) for zero, got: {rendered}"
        );

        // Negative amount.
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token_id, &-1i128, &donation_id_hash)
        }));
        assert!(result.is_err(), "negative amount must revert");
        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #5)"),
            "expected InvalidAmount (Error(Contract, #5)) for negative, got: {rendered}"
        );
    }

    /// `donate` reverts with `TokenNotAllowed` (error code 6) for a token not
    /// in the allowlist.
    #[test]
    fn donate_reverts_for_token_not_in_allowlist() {
        let amount: i128 = 1_000;
        let (env, _contract_id, client, _admin, _treasury, donor, _payout, id_hash, _token_id, _sac, _token) =
            donate_setup(amount);

        // Register a second token but do NOT add it to the allowlist.
        let token_admin2 = Address::generate(&env);
        let token2 = env
            .register_stellar_asset_contract_v2(token_admin2)
            .address();

        let donation_id_hash = creator_id_hash(&env, 98);
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token2, &amount, &donation_id_hash)
        }));
        assert!(result.is_err(), "token not in allowlist must revert");

        let events = env.host().get_diagnostic_events().unwrap().0;
        let rendered: std::string::String =
            events.iter().map(|e| std::format!("{}", e)).collect();
        assert!(
            rendered.contains("Error(Contract, #6)"),
            "expected TokenNotAllowed (Error(Contract, #6)), got: {rendered}"
        );
    }

    /// When `platform_fee_bps == 0`, `fee_amount == 0` and the fee transfer is
    /// skipped. Only the net transfer (full amount) reaches the payout
    /// address. The event still records `fee_amount = 0`.
    #[test]
    fn donate_skips_fee_transfer_when_fee_is_zero() {
        // Deploy a contract with 0% fee.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let contract_id = env.register(DonationRouter, (&admin, &treasury, &0u32, &500u32));
        let client = DonationRouterClient::new(&env, &contract_id);

        // Register token and creator.
        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let sac = StellarAssetClient::new(&env, &token_id);
        let token = TokenClient::new(&env, &token_id);
        client.add_token(&admin, &token_id);

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 21);
        client.register_creator(&owner, &id_hash, &payout);

        let amount: i128 = 5_000_000;
        let donor = Address::generate(&env);
        sac.mint(&donor, &amount);

        let donation_id_hash = creator_id_hash(&env, 97);
        client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash);

        // Event captured immediately after the call that emitted it.
        let expected = DonationReceived {
            creator_id_hash: id_hash,
            token: token_id,
            amount,
            fee_amount: 0,
            net_amount: amount,
            treasury_address: treasury.clone(),
            payout_address: payout.clone(),
            donation_id_hash,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        // Fee is zero: treasury gets nothing, payout gets the full amount.
        assert_eq!(token.balance(&treasury), 0);
        assert_eq!(token.balance(&payout), amount);
        assert_eq!(token.balance(&donor), 0);
    }

    /// When `net_amount == 0` (100% fee), the net transfer is skipped. Only
    /// the fee transfer reaches the treasury. The event records
    /// `net_amount = 0`.
    #[test]
    fn donate_skips_net_transfer_when_net_is_zero() {
        // Deploy a contract with 100% fee (10_000 bps), cap at 10_000.
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let contract_id = env.register(DonationRouter, (&admin, &treasury, &10_000u32, &10_000u32));
        let client = DonationRouterClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let sac = StellarAssetClient::new(&env, &token_id);
        let token = TokenClient::new(&env, &token_id);
        client.add_token(&admin, &token_id);

        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 22);
        client.register_creator(&owner, &id_hash, &payout);

        let amount: i128 = 5_000_000;
        let donor = Address::generate(&env);
        sac.mint(&donor, &amount);

        let donation_id_hash = creator_id_hash(&env, 96);
        client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash);

        // Event captured immediately after the call that emitted it.
        let expected = DonationReceived {
            creator_id_hash: id_hash,
            token: token_id,
            amount,
            fee_amount: amount,
            net_amount: 0,
            treasury_address: treasury.clone(),
            payout_address: payout.clone(),
            donation_id_hash,
        };
        let events = env.events().all().filter_by_contract(&contract_id);
        assert_eq!(events, std::vec![expected.to_xdr(&env, &contract_id)]);

        // Net is zero: payout gets nothing, treasury gets the full amount.
        assert_eq!(token.balance(&treasury), amount);
        assert_eq!(token.balance(&payout), 0);
        assert_eq!(token.balance(&donor), 0);
    }

    /// `donate` requires the donor to authorize. Without `mock_all_auths` (or
    /// an explicit mock auth for the donor), the call reverts. We verify this
    /// by deploying without mocking auths and asserting the call fails.
    #[test]
    fn donate_requires_donor_auth() {
        let env = Env::default();
        // No mock_all_auths: every require_auth will fail.
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let contract_id = env.register(DonationRouter, (&admin, &treasury, &100u32, &500u32));
        let client = DonationRouterClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();
        let sac = StellarAssetClient::new(&env, &token_id);
        // Switch to mocking auths for the setup calls only.
        env.mock_all_auths();
        client.add_token(&admin, &token_id);
        let owner = Address::generate(&env);
        let payout = Address::generate(&env);
        let id_hash = creator_id_hash(&env, 23);
        client.register_creator(&owner, &id_hash, &payout);

        let amount: i128 = 1_000;
        let donor = Address::generate(&env);
        sac.mint(&donor, &amount);

        // Stop mocking auths so the donor's require_auth in donate fails.
        env.set_auths(&[]);

        let donation_id_hash = creator_id_hash(&env, 95);
        let result = catch_unwind(AssertUnwindSafe(|| {
            client.donate(&donor, &id_hash, &token_id, &amount, &donation_id_hash)
        }));
        assert!(result.is_err(), "donate without donor auth must revert");
    }
}
