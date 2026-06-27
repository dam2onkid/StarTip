#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Vec,
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
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use std::panic::{catch_unwind, AssertUnwindSafe};

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
}
