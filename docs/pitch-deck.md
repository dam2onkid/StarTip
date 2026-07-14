# StarTip - Pitch Deck Outline (Stellar Hackathon)

Format: slide-by-slide outline (title + bullets + speaker notes). Use this to build slides manually (Google Slides / PowerPoint / Keynote).

---

## Slide 1 - Title

**StarTip**
QR-based live tipping, settled on Stellar.

- Tagline: "Tip on the stream, settle on the blockchain - as fast as a QR scan, as transparent as on-chain."
- Logo + demo QR code (can be a QR pointing to a demo `/donate/[handle]` page)
- Team name / hackathon track

Speaker notes: Keep this short - let the QR code speak for itself so the audience immediately sees this is a real, usable product, not just a concept.

---

## Slide 2 - The Problem

**Tipping creators is still stuck in a 2010-era intermediary model**

- **Creators lose 20-30% in fees** on every tip processed through intermediaries (Streamlabs, PayPal, local payment gateways)
- **Slow payouts** - tip money doesn't reach the creator instantly, it waits days to weeks for the platform's payout cycle
- **Cross-border friction for fans** - FX fees, banking restrictions, and card limitations make international tipping expensive and hard
- Both sides - the **Donor** and the **Creator** - lose out, while the intermediary captures most of the value

Speaker notes: Frame this as a structural problem, not a flaw of one specific platform - holding funds and taking a cut is the default model everywhere. A concrete number helps (e.g. Twitch/Streamlabs ~5-8% + 3-5% payment processing fee + monthly payout cycle).

---

## Slide 3 - The Solution: Powered by Stellar

**StarTip is built on Soroban (Stellar) to remove the fund-holding middleman entirely**

Three technology pillars that create the competitive edge:

1. **Speed + Cost**
   - Near-instant settlement (seconds), no waiting for a payout cycle
   - Transaction fees of ~$0.00001 - thousands of times cheaper than traditional payment processing fees (2-5%)

2. **Self-custody + Trustless**
   - The **DonationRouter** Soroban contract automatically splits the fee and transfers funds the moment `donate()` is called - no one, not even StarTip, holds the money on behalf of the creator or donor
   - Every transaction emits a `DonationReceived` event on-chain - transparent and independently verifiable, no need to trust the platform

3. **Multi-asset via Stellar Asset Contract (SAC)**
   - Accepts XLM, USDC, and other allowlisted stablecoins/tokens through SAC
   - Creators aren't locked into a single asset, and fans can tip with whichever supported token they hold

Speaker notes: This is the most important slide for Stellar judges - explain *why Stellar/Soroban is the right choice*, not just "we use blockchain." Emphasize: (a) Soroban lets complex fee-splitting logic run cheaply and fast, (b) Soroban's auth propagation makes `donate()` a single transaction (no EVM-style approve/transfer_from) - a materially better UX, (c) SAC is the natural bridge between classic Stellar assets and smart contracts, enabling multi-asset support without building custom integrations for each token.

---

## Slide 4 - Service Overview

**From QR code to on-chain settlement - a seamless experience for both Creator and Donor**

- **QR donate + Overlay live alert**: Fans scan a QR code at `/donate/[handle]`, and the donation instantly appears on the creator's OBS overlay - complete with a Text-to-Speech reading of the message
- **Transparent on-chain settlement**: Every donation flows through DonationRouter, which automatically splits the Platform Fee and forwards the remainder to the creator's Payout Address, verifiable on-chain
- **Dashboard + Leaderboard**: Creators manage donations, moderate messages (show/hide), set donation goals, and view leaderboards (per-creator or global)
- **Self-service onboarding**: Creators claim a handle, link a wallet, and self-sign the `register_creator` transaction - no admin intervention, no one else ever holds the creator's keys

Speaker notes: If possible, run a live demo here: scan QR -> donate -> alert appears on the overlay within seconds. This is the "wow moment" of the pitch.

---

## Slide 5 - Roadmap

**Now -> Next**

**Now (current MVP)**
- Full donate flow: QR -> connect wallet -> `donate()` on DonationRouter
- Realtime overlay via Supabase, alerts + Text-to-Speech (edge-tts)
- Creator dashboard: moderation, donation goals, leaderboard
- Self-service onboarding: claim handle -> link wallet -> self-register on-chain

**Next**
- Expand the Token Allowlist: add more stablecoins/assets to widen reach for international fans
- Mobile-friendly donate flow and a companion app for creators
- Deeper creator analytics (donor retention, donation trends)
- Open an API so other streaming/creator platforms can integrate DonationRouter directly

Speaker notes: Keep the roadmap tight - avoid over-promising distant milestones (e.g. "Q4 2027"), as that invites pushback in Q&A. "Now" must be things that actually run and can be demoed; "Next" should be a logical next step, not a wishlist.

---

## Slide 6 - Target Market

**The entire creator economy - not just crypto-native users**

- Audience: streamers/creators on Twitch, TikTok Live, YouTube Live, and other livestreaming platforms worldwide
- StarTip lowers the barrier to entry: creators don't need to understand blockchain, just a wallet and a QR code - Stellar's `donate()` and settlement run silently underneath
- The creator economy is growing fast, with tips/donations a meaningful chunk of revenue for small-to-mid streamers, yet most of it remains locked behind high fees from centralized platforms
- StarTip is a platform-agnostic payment layer: it works independently of Twitch/YouTube/TikTok, with no dependency on their APIs or policies

Speaker notes: Emphasize "not just crypto-native" - this is a key differentiator versus other Web3-streaming projects that typically target only crypto-savvy communities. StarTip is betting that simple UX (QR + one-time wallet connect) can scale to mainstream streamers, with Stellar/Soroban as the invisible infrastructure, not a barrier.

---

## Slide 7 - Closing / Ask

- One-line recap: "StarTip turns every tip into a transparent, instant, near-zero-fee Stellar transaction."
- A call to action fitting the hackathon: demo link, GitHub repo, or a specific ask (mentor support, testnet grant, partner introduction)

Speaker notes: Close with a story, not a feature list - circle back to the Slide 2 personas (creator + donor) and how both now win.
