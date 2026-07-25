# Use signed declarative Effect Packs

The initial Live Event Platform accepts only first-party Effect Packs whose manifest and assets are signed and conform to a supported declarative schema. Packs cannot execute arbitrary JavaScript, Rust, or native code in the Live Event Client, preventing an extensibility mechanism from becoming a supply-chain and local-machine execution boundary before a real sandbox and permission model exist.
