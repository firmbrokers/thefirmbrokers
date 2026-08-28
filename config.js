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
  explorer: "https://robinhoodchain.blockscout.com",

  // ---- fill these at launch ----
  nft: "0x2d4dFF47ba18c89847facA0C968e073d8B70ABb4",        // EmployeeNFT — deployed 2026-08-27, block 47105759
  engine: "0x5a362FFdaB7ffA585D50f1a5c032288EF0029740",     // PayrollEngine
  vault: "0x5D792986F671b11e6C551F7C90591c61341d749e",      // PayVault
  token: "0x223E93B1beD7de244445dB2dea4c7900e8045Acc",      // $9TO5 — launched 2026-08-28 14:28Z, tx 0x2d4de33c…5b2b
  splitter: "0x4DCf83f40D43DB0484A06049E07326F3B17F338E",   // the letscash fee splitter (80% engine / 20% treasury, immutable)
  deployBlock: 48370000, // scan start = the token launch (2026-08-28 14:28Z). Every broker anyone owns was minted after this except our reserve #1; keeps the owned-broker scan inside the range every public RPC serves.

  // ---- the mint: on OpenSea (decided 2026-08-25) ----
  // Minting happens on OpenSea, not on this site. The HR desk and the street
  // wall show ONE link, this one, and nothing else on the site ever offers a
  // mint. Empty = the drop page does not exist yet: the desk says "opening
  // soon" and shows NO button. Fill it the moment the OpenSea page is live.
  // (Anti-phishing rule, same as the token: the site never links a mint page
  // that is not this exact URL.)
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

  // letscash pool page for buying $9TO5
  buyUrl: "https://www.letscash.fun/",
};
