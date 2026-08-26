// Firm Brokers site configuration. Everything address-shaped lives here and
// ONLY here: fill in after the stage-1 deploy and the letscash launch.
window.FIRM_CFG = {
  chainHex: "0x1237", // Robinhood Chain 4663
  chainName: "Robinhood Chain",
  rpcs: [
    "https://rpc.mainnet.chain.robinhood.com",
    "https://rpc.arrowrpc.com",
  ],
  explorer: "https://robinhoodchain.blockscout.com",

  // ---- fill these at launch ----
  nft: "",        // EmployeeNFT (Firm Brokers collection)
  engine: "",     // PayrollEngine
  vault: "",      // PayVault
  token: "",      // $9TO5 (read from nft.token() if left empty)
  splitter: "",   // the letscash fee splitter (for the trust panel link)
  deployBlock: 0, // NFT deploy block: log scans start here

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
