// Firm Brokers site configuration. Everything address-shaped lives here and
// ONLY here: fill in after the stage-1 deploy and the letscash launch.
window.FIRM_CFG = {
  chainHex: "0x1237", // Robinhood Chain 4663
  chainName: "Robinhood Chain",
  rpcs: [
    "https://rpc.mainnet.chain.robinhood.com",
    // fallback added 2026-08-28 15:4xZ: the official RPC intermittently sends a
    // DUPLICATE Access-Control-Allow-Origin header and browsers refuse the
    // response; publicnode serves recent-range reads with clean CORS (archive
    // ranges need a token there, which is why deployBlock moved to the launch).
    "https://robinhood-rpc.publicnode.com",
  ],
  // The Cash Cat building is built, tested and committed, but the street is
  // public and the partnership is not announced yet, so the zone stays OFF in
  // production until the user has shown it to the Cash Cat team. Flip to true
  // to open it. test/ui/harness.mjs forces it TRUE so the suite still covers
  // the building while it is held.
  cashcatLive: true, // flipped 2026-09-03: the first office opens
  // Where the BUY $CASHCAT plate by the first office's door sends people: the
  // token's own page on letscash, where it launched. ONE exact URL, the same
  // anti-phishing rule as the mint and the token: nothing else on the site ever
  // offers a CASHCAT buy. Empty = the plate is not built.
  cashcatBuyUrl: "https://www.letscash.fun/token/0x020bfC650A365f8BB26819deAAbF3E21291018b4",
  // THE OFFICE POOL (pool.html) — OfficePool, deployed 2026-09-05 16:22Z, block 55259924,
  // reusing the proven drand verifier 0xf17f…4e9. Empty = the page says it has not opened.
  pool: "0xba74bFbfa33296052c47149bb805C396ee608c2B",
  explorer: "https://robinhoodchain.blockscout.com",

  // ---- fill these at launch ----
  nft: "0x2d4dFF47ba18c89847facA0C968e073d8B70ABb4",        // EmployeeNFT — deployed 2026-08-27, block 47105759
  engine: "0x5a362FFdaB7ffA585D50f1a5c032288EF0029740",     // PayrollEngine
  vault: "0x5D792986F671b11e6C551F7C90591c61341d749e",      // PayVault
  // Reinvest401k — the 401(k): every paycheck into $9TO5. Zero until it is
  // deployed; the card and the broker-file row stay hidden until then.
  reinvest: "0x53fD07eFF0aA1cE0A1e15f4Ef436A2cBffcf75Ab",
  marketApi: "https://firm-market.firmbrokersrhchain.workers.dev", // firm-market worker base URL (market/README.md); empty = listings column off, level lookup still works
  token: "0x223E93B1beD7de244445dB2dea4c7900e8045Acc",      // $9TO5 — launched 2026-08-28 14:28Z, tx 0x2d4de33c…5b2b
  splitter: "0x4DCf83f40D43DB0484A06049E07326F3B17F338E",   // the letscash fee splitter (80% engine / 20% treasury, immutable)
  treasury: "0x30D9057f9D0439Cb772032D9DBf95c1c8A65E0ba",   // the treasury (launch.env TREASURY/TEAM); docs.html reads its $9TO5 balance for the public supply table
  deployBlock: 48370000, // scan start = the token launch (2026-08-28 14:28Z). Every broker anyone owns was minted after this except our reserve #1; keeps the owned-broker scan inside the range every public RPC serves.

  // ---- the mint: on OpenSea (decided 2026-08-25) ----
  // Minting happens on OpenSea, not on this site. The HR desk and the street
  // wall show ONE link, this one, and nothing else on the site ever offers a
  // mint. Empty = the drop page does not exist yet: the desk says "opening
  // soon" and shows NO button. Fill it the moment the OpenSea page is live.
  // (Anti-phishing rule, same as the token: the site never links a mint page
  // that is not this exact URL.)
  // ---- partner salary asset (PLAN 1) ----
  // The asset the paycheck editor promotes with a one-click "ALL <SYMBOL>"
  // button. Matched by SYMBOL against what the engine actually has registered,
  // so a wrong or unregistered value simply hides the button. Empty = off.
  featureAsset: "FRONG", // set to "FRONG" once addAsset has landed

  // ---- the auction (PLAN 2) ----
  // Empty = the building keeps its current content and no auction UI is built.
  auction: "0x86ca9F9a4733A60C180A512AbC5a7272DD795aec",      // AuctionHouse address
  bonusPool: "0x0D14533213C09E979d8DE000D40161189cb233a1",    // BonusPool address
  auctionToken: "0x223E93B1beD7de244445dB2dea4c7900e8045Acc", // the bid token ($9TO5). Symbol/decimals are read on-chain.
  // The bid token's dEaD balance at the moment the house was deployed, printed
  // by DeployFrongAuction. The room shows balanceOf(dEaD) MINUS this, so BURNED
  // is what this house burned and not what the token's whole history left
  // there. FRONG's is ~5.5e24; leaving this at 0 opens the room on a lie.
  burnBaseline: "305325000000000000000000000",
  hammerLocal: "5:00 PM New York",
  // Which decor the sale room builds. Comma-separated, any of:
  //   panel  wainscot + brass dado on the solid wall runs
  //   queue  crates stencilled with the real upcoming lot numbers, and a porter
  //   phones telephone bidding booths
  //   settle the settlement window
  decor: "panel,queue", // display only; the contract's endsAt is the truth

  mintUrl: "https://opensea.io/collection/thefirmbrokers",
  // When the PUBLIC round opens on OpenSea, unix seconds UTC. 0 = not yet.
  // Until then HR is gated on the whitelist form (listed wallets mint first);
  // from then on the guard steps aside, because everyone can mint. The site
  // also reads the public stage straight from SeaDrop once `nft` is set, so
  // this is the fallback for the window before the stage is configured.
  mintPublicAt: 1787937600, // Fri 2026-08-28 17:20 UTC — the public stage start published in Studio
  // When minting STARTS at all (the first stage, the team round), unix seconds
  // UTC. Until then the drop page exists but nothing can be minted, so the
  // street says "opens <when>" and the desk links the page without claiming
  // the mint is open. 0 = no schedule (the old behaviour: page exists = open).
  mintStartsAt: 1787929200, // Fri 2026-08-28 15:00 UTC — team round, first stage
  // OpenSea's SeaDrop 1.0 on Robinhood Chain (canonical, verified on-chain
  // 2026-08-24). Read-only here: getPublicDrop(nft) gives price + window.
  seaDrop: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",

  // art. images keyed by ARTWORK id (nft.artworkOf(tokenId))
  imageBase: "art/images", // swap for ipfs://CID after pinning
  sealedImage: "art/sealed.png",

  // ---- the whitelist application (the agent on the street) ----
  x: "thefirmbrokers", // X handle, no @. Renamed to @thefirmbrokers on
                    // 2026-08-18 (operator confirmed). History: @FirmBrokersRH
                    // (original) → @FirmBrokers (acquired 2026-08-17) → this.
                    // Both older handles are now STALE — never revert to
                    // either; the freed names could belong to anyone.
  xPinned: "https://x.com/thefirmbrokers/status/2089747897466093984", // the pinned launch post; falls back to the profile if emptied
  // Where applications go. Either a POST endpoint that takes JSON
  // (Formspree, a Cloudflare Worker, a Google Apps Script web app), or a form
  // link that gets opened with the answers prefilled. Leave both empty and the
  // agent says applications are not open yet rather than pretending to send.
  applyUrl: "https://firm-wl.firmbrokersrhchain.workers.dev",
  applyFormUrl: "",
  // ---- the whitelist is CLOSED (2026-08-27): applications are over ----
  // true = the security booth no longer offers the post-to-apply flow; it opens
  // THE LIST checker instead, HR's door stops asking for a form, the flat page
  // shows "check the list", and the handbook says the list is closed. The
  // Worker refuses /verify and /card too (env APPLY_CLOSED). false = the
  // campaign is open, the state before the cut. The list itself (site/wl.json)
  // carries the GTD hashes and, optionally, an `fcfs` tier.
  applyClosed: true,

  // ---- the v2 application: post on X to apply ----
  // The post every applicant sends (FINAL, user-approved 2026-08-24). {code}
  // is replaced with their personal code (FB-XXXXXX, derived from their
  // wallet); the card link is appended by X as the url. MUST keep "$9TO5" and
  // "{code}" — the Worker refuses posts without them (REQUIRED_TEXT in
  // wl/worker/worker.js is the other half). Deliberately NO supply number:
  // the count was undecided at the time, and posts are forever.
  applyPost: "i just applied at @thefirmbrokers. pixel brokers on robinhood chain, paid every hour in stocks.\n\napplication {code} \u00b7 $9TO5",

  // Cloudflare Turnstile on the application. The SITE key is public by design
  // — the secret half lives only in the Worker, which is what actually refuses
  // an unverified application. Empty string = no check at all and the booth
  // behaves exactly as it did before, so this is the off switch.
  //
  // ORDER MATTERS when turning it on: ship this key FIRST and let the 600s
  // edge cache expire, THEN make the Worker require a token. Doing it the
  // other way round rejects every real application in between.
  turnstileSiteKey: "0x4AAAAAAEWvDl5U8HWeyUVp",

  // ---- sponsored campaigns (SPONSORED_CAMPAIGN_PLAN.md) ----
  // The CampaignFactory. Empty = no campaign UI anywhere. Fill it after
  // script/DeployCampaign.s.sol --sig "factory()" has landed and is verified.
  campaignFactory: "0xAd7F5280630786a633B02Ba12B448DDc97cF0400", // deployed 2026-09-02 by the operator wallet; owner = operator

  // letscash pool page for buying $9TO5
  buyUrl: "https://www.letscash.fun/",
  // The token's chart on GeckoTerminal (CoinGecko's DEX screener): the 9TO5/WETH pool. docs.html shows it beside the buy link once the token exists.
  chartUrl: "https://www.geckoterminal.com/robinhood/pools/0xc9a1f9d07c0183133ea40e22ff583af74409670073e1dc75ee4e070f2dd114d9",
};
