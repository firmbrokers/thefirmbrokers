// Firm Brokers contract layer. No library, no CDN: four-byte selectors are
// precomputed (cast sig, committed in the repo) and arguments are plain
// 32-byte words. Transport rules are inherited from the projects this
// descends from: the public node rate limits, refuses batches over ~50 and
// answers rate-limited reads with errors that must never be mistaken for
// zeros.
(function () {
  const CFG = window.FIRM_CFG;

  const SEL = {
    // nft
    totalMinted: "0xa2309ff8",
    totalSupply: "0x18160ddd",
    maxSupply: "0xd5abeb01",
    mintPriceWei: "0xcb2c9722",
    // seadrop: getPublicDrop(address nft) -> (uint80 mintPrice, uint48 start,
    // uint48 end, uint16 maxPerWallet, uint16 feeBps, bool restrictFeeRecipients)
    getPublicDrop: "0xbc6a629c",
    balanceOf: "0x70a08231",
    ownerOf: "0x6352211e",
    isActive: "0x82afd23b",
    weightOf: "0x0767d178",
    tierBurned: "0x78e6b4e1",
    artworkOf: "0x8cfd9b5b",
    parts: "0xc9eb4662",
    activate: "0xb260c42a",
    upgradeTier: "0x36f005aa",
    fuse: "0x5dbee749",
    ACTIVATE_BURN: "0x84a3609a",
    FUSE_BURN_TWO: "0xcf9df158",
    FUSE_BURN_THREE: "0x8a1dafe1",
    TIER_BURN: "0xf05a62d3",
    revealed: "0x51830227",
    token: "0xfc0c546a",
    // erc20
    allowance: "0xdd62ed3e",
    approve: "0x095ea7b3",
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
    // engine
    pendingEth: "0xccc73973",
    collectToWallet: "0x81236d16",
    setCollectMode: "0xed26f2e8",
    splitOf: "0xeb6e17b5",
    setSplit: "0xaca4894c",
    assetCount: "0xeafe7a74",
    assets: "0xcf35bdd0",
    tokenState: "0x9745cc3d",
    lastSettledRound: "0xfe51b955",
    sync: "0x4b7314e4",
    minSwap: "0x59cd9031",
    twapQuote: "0x6e3e495e",
    deliver: "0xd3dcde9a",
    harvest: "0x4641257d",
    owed: "0xdf18e047",
    potBuffer: "0x1e134423",
    totalWeight: "0x96c82e57",
    totalHarvested: "0x23dc1142",
    // vault
    balancesOf: "0x06693e89",
    claim: "0x379607f5",
    claimOne: "0x71c96fc0",
    vaultBalance: "0xb183b67f",
  };
  const TRANSFER_TOPIC =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const DEAD = "000000000000000000000000000000000000dEaD";

  // ------------------------------------------------------------ encoding
  function word(v) {
    let h;
    if (typeof v === "bigint") h = v.toString(16);
    else if (typeof v === "number") h = BigInt(v).toString(16);
    else h = String(v).replace(/^0x/, "");
    return h.padStart(64, "0");
  }
  const toBig = (hex) => (!hex || hex === "0x" ? 0n : BigInt(hex));
  const toAddr = (hex) => (hex && hex.length >= 42 ? "0x" + hex.slice(-40) : null);
  function decodeString(hex) {
    if (!hex || hex.length < 130) return "";
    const b = hex.slice(2);
    const len = Number(BigInt("0x" + b.slice(64, 128)));
    let out = "";
    for (let i = 0; i < len; i++) {
      out += String.fromCharCode(parseInt(b.slice(128 + i * 2, 130 + i * 2), 16));
    }
    return out;
  }

  // ------------------------------------------------------------ transport
  let rpcBase = null;
  // the endpoint that answered last time in this tab goes first, so a page
  // load does not start with a request the official RPC is going to refuse
  try { const m = sessionStorage.getItem("fb-rpc"); if (m && CFG.rpcs.includes(m)) rpcBase = m; } catch (e) { /* storage blocked */ }
  async function rpcPost(body) {
    const all = CFG.rpcs.filter((u, i, a) => u && a.indexOf(u) === i);
    const order = rpcBase ? [rpcBase, ...all.filter((u) => u !== rpcBase)] : all;
    let last;
    for (const url of order) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        rpcBase = url;
        try { sessionStorage.setItem("fb-rpc", url); } catch (e) { /* storage blocked */ }
        return j;
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("no rpc endpoint");
  }

  // EIP-6963: every installed wallet announces itself; the site lets the
  // visitor pick instead of taking whichever extension injected first.
  const discovered = new Map();
  window.addEventListener("eip6963:announceProvider", (e) => {
    try { if (e.detail?.info?.rdns) discovered.set(e.detail.info.rdns, e.detail); } catch (err) {}
  });
  try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) {}

  let chosenProvider = null;
  function provider() {
    if (chosenProvider) return chosenProvider;
    const eth = window.ethereum;
    if (!eth) return null;
    return eth.providers && eth.providers.length ? eth.providers[0] : eth;
  }
  function wallets() { return [...discovered.values()]; }
  function setProvider(p) { chosenProvider = p; }
  function hasChosen() { return !!chosenProvider; }

  async function call(to, data, noWallet) {
    if (!to) return null;
    const p = noWallet ? null : provider();
    if (p) {
      try {
        return await p.request({ method: "eth_call", params: [{ to, data }, "latest"] });
      } catch (e) {}
    }
    try {
      const j = await rpcPost({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] });
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      return null;
    }
  }

  const BATCH_MAX = 40;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function batchOnce(slice) {
    const body = slice.map((it, i) => ({
      jsonrpc: "2.0",
      id: i,
      method: "eth_call",
      params: [{ to: it.to, data: it.data }, "latest"],
    }));
    const j = await rpcPost(body);
    if (!Array.isArray(j)) throw new Error("not a batch response");
    const out = new Array(slice.length).fill(null);
    for (const res of j) {
      if (!res) continue;
      if (res.result !== undefined && res.result !== null) {
        out[Number(res.id)] = res.result;
        continue;
      }
      // A revert is an answer; anything else is a failure that must stay null.
      const msg = String((res.error && res.error.message) || "").toLowerCase();
      out[Number(res.id)] = msg.includes("revert") ? "0x" : null;
    }
    return out;
  }

  async function batchResolve(slice, depth) {
    depth = depth || 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await batchOnce(slice);
      } catch (e) {
        if (provider()) break;
        if (attempt < 2) await sleep(250 * (attempt + 1));
      }
    }
    if (provider()) {
      const out = [];
      for (const it of slice) out.push(await call(it.to, it.data));
      return out;
    }
    if (slice.length === 1 || depth > 3) {
      const out = [];
      for (const it of slice) out.push(await call(it.to, it.data));
      return out;
    }
    const mid = Math.ceil(slice.length / 2);
    return (await batchResolve(slice.slice(0, mid), depth + 1)).concat(
      await batchResolve(slice.slice(mid), depth + 1)
    );
  }

  async function callBatch(items) {
    if (!items.length) return [];
    const out = [];
    for (let i = 0; i < items.length; i += BATCH_MAX) {
      out.push(...(await batchResolve(items.slice(i, i + BATCH_MAX), 0)));
    }
    return out;
  }

  async function blockNumber() {
    const j = await rpcPost({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] });
    return Number(BigInt(j.result));
  }

  /// "Too many requests" and "range too large" are OPPOSITE instructions, and
  /// this file used to treat them identically: rpcLogs turned both into a plain
  /// Error and rpcLogsRange split the range on either. So the code's answer to
  /// being throttled was to make twice as many requests, then four times, then
  /// eight, to depth 12 -- up to 4,096 leaf ranges at five attempts each, and
  /// firmLedger started it three-wide through Promise.all.
  ///
  /// That, not any query being too big, is why the market card never rendered
  /// and the bank's headcount never appeared. Measured 2026-09-01 against a
  /// quiet RPC, each in ONE request: firmLedger's full-range Activated scan
  /// returns 4,046 logs in 2.1s, and market.js's 120,000-block engine scan
  /// returns 4 logs in 4.3s. Neither needs splitting at all. It also explains
  /// the intermittency -- on a quiet page the scans go through first time, and
  /// under contention one 429 starts a cascade that can never recover, because
  /// every level makes the next 429 likelier.
  /// THERE IS A THIRD ERROR CLASS and the split below handles it correctly by
  /// accident of being conservative, which is worth stating so nobody "tidies"
  /// it. "log query timed out" is neither a rate limit nor a range complaint --
  /// it means the query was too EXPENSIVE. It is not matched here, so it still
  /// bisects, and bisecting is exactly right for it: a smaller range is a
  /// cheaper query. Only a rate limit must never be split.
  const RATE_LIMITED = /\b429\b|too many requests|rate.?limit/i;
  const isRateLimited = (e) => !!(e && (e.rateLimited || RATE_LIMITED.test((e && e.message) || "")));

  async function rpcLogs(params, noWallet) {
    const p = provider();
    // the wallet's answer is only trusted when the wallet is actually ON this
    // chain — a MetaMask parked on another network answers getLogs from THAT
    // chain and the floor reads "0 of 0" (seen live 2026-08-28, mint day)
    if (!noWallet && p && p.request) {
      try {
        const cid = await p.request({ method: "eth_chainId" });
        if (typeof cid === "string" && cid.toLowerCase() === CFG.chainHex) {
          return await p.request({ method: "eth_getLogs", params: [params] });
        }
      } catch (e) {}
    }
    let last;
    // getLogs over our range is served ONLY by the primary RPC (public
    // fallbacks archive-gate it, seen 2026-08-28: publicnode -32602), so a
    // failed scan retries the primary with backoff instead of rotating into
    // an endpoint that can never answer. Single calls still rotate (rpcPost).
    const primary = CFG.rpcs[0];
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await fetch(primary, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [params] }),
        });
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        return j.result;
      } catch (e) {
        last = e;
        // a throttled request wants a LONGER wait and the SAME range; anything
        // else keeps the original backoff
        if (RATE_LIMITED.test((e && e.message) || "")) last.rateLimited = true;
        if (attempt < 4) await sleep((last.rateLimited ? 1200 : 500) * (attempt + 1));
      }
    }
    throw last;
  }

  async function rpcLogsRange(base, from, to, depth, noWallet) {
    depth = depth || 0;
    const params = Object.assign({}, base, {
      fromBlock: "0x" + from.toString(16),
      toBlock: to === "latest" ? "latest" : "0x" + to.toString(16),
    });
    try {
      return await rpcLogs(params, noWallet);
    } catch (e) {
      // NEVER split on a rate limit: splitting is what caused it. Everything
      // else keeps the old bisect, so only the pathological case changes.
      if (isRateLimited(e)) throw e;
      if (depth > 12) throw e;
      if (to === "latest") to = await blockNumber();
      if (to - from < 2) throw e;
      const mid = Math.floor((from + to) / 2);
      return (await rpcLogsRange(base, from, mid, depth + 1, noWallet)).concat(
        await rpcLogsRange(base, mid + 1, to, depth + 1, noWallet)
      );
    }
  }

  // ------------------------------------------------------------ reads
  let tokenAddr = CFG.token || null;
  async function launchToken() {
    if (tokenAddr) return tokenAddr;
    const a = toAddr(await call(CFG.nft, SEL.token));
    if (a && a !== "0x0000000000000000000000000000000000000000") tokenAddr = a;
    return tokenAddr;
  }

  async function stats() {
    const t = await launchToken();
    // The mint moved to OpenSea (2026-08-25). Nothing here sends a mint, and
    // the only mint facts the site still shows are the counter and the price:
    // the counter from the NFT, the price and the public window from SeaDrop's
    // public stage for this NFT. Every NFT read that a SeaDrop-shaped contract
    // might not answer (totalMinted, mintPriceWei) is optional and falls back,
    // so a missing selector can never take the whole HUD down with it.
    const reqs = [
      { to: CFG.nft, data: SEL.maxSupply },          // 0 required
      { to: CFG.nft, data: SEL.totalSupply },        // 1 required
      { to: CFG.engine, data: SEL.totalHarvested },  // 2 required
      { to: CFG.engine, data: SEL.totalWeight },     // 3 required
      { to: CFG.engine, data: SEL.potBuffer },       // 4 required
      { to: CFG.nft, data: SEL.totalMinted },        // 5 optional
      { to: CFG.nft, data: SEL.mintPriceWei },       // 6 optional
      { to: CFG.engine, data: SEL.lastSettledRound }, // 7 optional
      { to: CFG.engine, data: SEL.minSwap },          // 8 optional
      // ETH priced in USDG (6 dec): the engine's own TWAP for asset 11.
      // Reverts while the pool's window is thin — optional, callers fall back
      { to: CFG.engine, data: SEL.twapQuote + word(11) + word(10n ** 18n) }, // 9 optional
    ];
    const iBurn = t ? reqs.push({ to: t, data: SEL.balanceOf + word(DEAD) }) - 1 : -1;
    const iDrop = CFG.seaDrop ? reqs.push({ to: CFG.seaDrop, data: SEL.getPublicDrop + word(CFG.nft) }) - 1 : -1;
    const r = await callBatch(reqs);
    if (r.slice(0, 5).some((x) => x === null)) throw new Error("stats read failed");
    const drop = iDrop >= 0 ? publicDrop(r[iDrop]) : null;
    const nftPrice = r[6] !== null ? toBig(r[6]) : null;
    return {
      minted: Number(toBig(r[5] !== null ? r[5] : r[1])),
      maxSupply: Number(toBig(r[0])),
      liveSupply: Number(toBig(r[1])),
      // SeaDrop's stage price is the truth once the drop is configured; the
      // contract's own price (pre-pivot builds) next; null renders as "—"
      priceWei: drop && drop.price > 0n ? drop.price : nftPrice,
      // null = SeaDrop did not answer (not configured yet): the caller falls
      // back to config. false = configured and the window is not open now.
      publicOpen: drop ? drop.open : null,
      publicDrop: drop,
      totalHarvested: toBig(r[2]),
      totalWeight: toBig(r[3]),
      potBuffer: toBig(r[4]),
      burned: iBurn >= 0 && r[iBurn] !== null ? toBig(r[iBurn]) : null,
      lastSettled: r[7] !== null ? Number(toBig(r[7])) : null,
      minSwap: r[8] !== null ? toBig(r[8]) : null,
      usdPerEth: r[9] !== null ? toBig(r[9]) : null,
    };
  }

  /// SeaDrop.getPublicDrop(nft): six ABI words. An unconfigured NFT answers
  /// all zeros (start 0), which reads as "no public stage yet", not "open".
  function publicDrop(hex) {
    if (!hex || hex === "0x" || hex.length < 2 + 64 * 6) return null;
    const w = (i) => BigInt("0x" + hex.slice(2 + 64 * i, 2 + 64 * (i + 1)));
    const price = w(0), start = Number(w(1)), end = Number(w(2));
    const now = Math.floor(Date.now() / 1000);
    return {
      price, start, end,
      maxPerWallet: Number(w(3)), feeBps: Number(w(4)),
      open: start > 0 && now >= start && (end === 0 || now < end),
    };
  }

  // ------------------------------------------------ who owns what, read directly
  /// The owned-broker scan used to walk Transfer logs from deployBlock to
  /// latest. For a wallet with many brokers (the treasury: 90) that scan never
  /// returned — the floor read "0 of 0" for its owner, constantly. Ownership
  /// is a fixed table of at most maxSupply rows, so read it: ownerOf for every
  /// id through Multicall3.tryAggregate, 200 per call (0.27 s each on both
  /// RPCs; 500 per call hangs), three in flight, cached three minutes. A
  /// burned (merged) id reverts and is simply absent. The log scan survives
  /// below as the fallback for the day a batch fails.
  const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
  function encodeTryAggregate(calls) {
    const w = (v) => word(v);
    let offs = "", bodies = "", off = 0x20 * calls.length;
    for (const c of calls) {
      const d = c.data.startsWith("0x") ? c.data.slice(2) : c.data;
      const body = w(BigInt(c.to)) + w(0x40) + w(d.length / 2) + d + "0".repeat((64 - (d.length % 64)) % 64);
      offs += w(off); bodies += body; off += body.length / 2;
    }
    return "0xbce38bd7" + w(0) + w(0x40) + w(calls.length) + offs + bodies;
  }
  function decodeTryAggregate(hex) {
    const raw = hex.slice(2);
    const at = (i) => parseInt(raw.slice(i * 2, i * 2 + 64), 16);
    const arr = at(0); const n = at(arr);   // word 0 is the array's offset (0x20), the length sits there
    const out = [];
    for (let k = 0; k < n; k++) {
      const base = arr + 32 + at(arr + 32 + 32 * k);
      const ok = at(base) === 1; const ro = at(base + 32); const ln = at(base + ro);
      out.push({ ok, data: "0x" + raw.slice((base + ro + 32) * 2, (base + ro + 32 + ln) * 2) });
    }
    return out;
  }
  async function tryAggregate(calls) {
    const j = await rpcPost({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: MULTICALL3, data: encodeTryAggregate(calls) }, "latest"] });
    if (!j || typeof j.result !== "string" || j.result.length < 130) throw new Error(j && j.error ? j.error.message : "multicall: bad reply");
    return decodeTryAggregate(j.result);
  }
  let _owners = null;
  async function ownerTable() {
    if (_owners && _owners.complete && Date.now() - _owners.at < 180000) return _owners;
    let max = 5000;
    try { const m = await rpcPost({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CFG.nft, data: SEL.maxSupply }, "latest"] }); if (m && m.result) max = Number(BigInt(m.result)) || max; } catch (e) { /* 5000 stands */ }
    const byId = new Map();
    let complete = true, k = 0;
    const ranges = [];
    for (let a = 1; a <= max; a += 200) ranges.push([a, Math.min(max, a + 199)]);
    const worker = async () => {
      while (k < ranges.length) {
        const [a, b] = ranges[k++];
        try {
          const res = await tryAggregate(Array.from({ length: b - a + 1 }, (_, i) => ({ to: CFG.nft, data: SEL.ownerOf + word(a + i) })));
          res.forEach((r, i) => { if (r.ok && r.data.length >= 66) byId.set(a + i, ("0x" + r.data.slice(26, 66)).toLowerCase()); });
        } catch (e) { complete = false; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    _owners = { at: Date.now(), byId, complete };
    return _owners;
  }
  async function tokensOf(addr) {
    const me = addr.toLowerCase();
    try {
      const t = await ownerTable();
      if (t.complete) {
        const mine = [];
        for (const [id, o] of t.byId) if (o === me) mine.push(id);
        mine.sort((a, b) => a - b);
        return mine;
      }
    } catch (e) { /* the log scan below */ }
    return tokensOfByLogs(addr);
  }

  async function tokensOfByLogs(addr) {
    const padded = "0x" + word(addr);
    let got = await rpcLogsRange(
      { address: CFG.nft, topics: [TRANSFER_TOPIC, null, padded] },
      CFG.deployBlock,
      "latest"
    );
    // an empty scan is only believed if the chain agrees the wallet is empty.
    // A glitching wallet RPC returns [] without erroring; balanceOf is one
    // cheap read through OUR rpc, and a mismatch retries with the wallet
    // bypassed entirely.
    //
    // The third argument is load-bearing and was missing until 2026-09-01.
    // call() routes through the wallet's provider first and, unlike rpcLogs,
    // does NOT verify eth_chainId, so this check was asking the very wallet it
    // exists to catch: a glitching provider answered [] to the scan and 0 to
    // the balance, the mismatch never fired, and the floor read "0 of 0" for a
    // holder who owned a hired broker. Reported by a holder of #4817, and the
    // same symptom is recorded against rpcLogs from mint day -- that fix added
    // a chain check to rpcLogs and never reached call().
    if (!got.length) {
      const bal = toBig(await call(CFG.nft, SEL.balanceOf + word(addr), true));
      if (bal && bal > 0n) {
        got = await rpcLogsRange(
          { address: CFG.nft, topics: [TRANSFER_TOPIC, null, padded] },
          CFG.deployBlock,
          "latest",
          0,
          true
        );
      }
    }
    const ids = [];
    const seen = {};
    for (const g of got) {
      const id = Number(BigInt(g.topics[3]));
      if (!seen[id]) {
        seen[id] = true;
        ids.push(id);
      }
    }
    const raws = await callBatch(ids.map((id) => ({ to: CFG.nft, data: SEL.ownerOf + word(id) })));
    if (raws.some((r) => r === null)) throw new Error("ownership reads incomplete");
    const mine = ids.filter(
      (id, i) => raws[i] !== "0x" && toAddr(raws[i]) && toAddr(raws[i]).toLowerCase() === addr.toLowerCase()
    );
    mine.sort((a, b) => a - b);
    return mine;
  }

  let _assetMeta = null;
  async function assetMeta() {
    if (_assetMeta) return _assetMeta;
    const nRaw = await call(CFG.engine, SEL.assetCount);
    const n = Number(toBig(nRaw));
    if (!n) return null;
    const addrRaws = await callBatch(
      Array.from({ length: n }, (_, i) => ({ to: CFG.engine, data: SEL.assets + word(i) }))
    );
    if (addrRaws.some((a) => !a || a.length < 66)) return null;
    const tokens = addrRaws.map((raw) => toAddr("0x" + raw.slice(2, 66)));
    const probes = [];
    for (const t of tokens) {
      probes.push({ to: t, data: SEL.symbol });
      probes.push({ to: t, data: SEL.decimals });
    }
    const res = await callBatch(probes);
    const meta = {};
    for (let i = 0; i < n; i++) {
      const dRaw = res[i * 2 + 1];
      if (!dRaw || dRaw.length < 66) return null;
      meta[i] = {
        token: tokens[i],
        symbol: decodeString(res[i * 2]) || "?",
        decimals: Number(toBig(dRaw)),
      };
    }
    _assetMeta = meta;
    return meta;
  }

  async function brokerBundle(ids) {
    if (!ids.length) return [];
    const meta = (await assetMeta()) || {};
    const reqs = [];
    const plan = [];
    for (const id of ids) {
      for (const fn of ["isActive", "weightOf", "tierBurned", "artworkOf", "parts"]) {
        reqs.push({ to: CFG.nft, data: SEL[fn] + word(id) });
        plan.push([id, fn]);
      }
      reqs.push({ to: CFG.vault, data: SEL.balancesOf + word(id) });
      plan.push([id, "vault"]);
      reqs.push({ to: CFG.engine, data: SEL.pendingEth + word(id) });
      plan.push([id, "pending"]);
      reqs.push({ to: CFG.engine, data: SEL.collectToWallet + word(id) });
      plan.push([id, "collect"]);
      reqs.push({ to: CFG.engine, data: SEL.splitOf + word(id) });
      plan.push([id, "split"]);
      reqs.push({ to: CFG.engine, data: SEL.tokenState + word(id) });
      plan.push([id, "state"]);
    }
    reqs.push({ to: CFG.engine, data: SEL.potBuffer });
    plan.push([null, "pot"]);
    reqs.push({ to: CFG.engine, data: SEL.totalWeight });
    plan.push([null, "tw"]);

    const res = await callBatch(reqs);
    for (let q = 0; q < res.length; q++) {
      if (res[q] === null) throw new Error("broker reads incomplete");
    }
    let pot = 0n,
      totalW = 0n;
    const by = {};
    for (const id of ids)
      by[id] = { id, active: false, weight: 0, tierBurned: 0n, artwork: 0, parts: 1, holdings: [], pending: 0n, collect: false, split: [], liveNow: false, liveWeight: 0, liveFrom: 0 };
    res.forEach((hex, i) => {
      const [id, kind] = plan[i];
      if (id === null) {
        if (kind === "pot") pot = toBig(hex);
        else totalW = toBig(hex);
        return;
      }
      const t = by[id];
      if (kind === "isActive") t.active = toBig(hex) === 1n;
      else if (kind === "weightOf") t.weight = Number(toBig(hex));
      else if (kind === "tierBurned") t.tierBurned = toBig(hex);
      else if (kind === "artworkOf") t.artwork = Number(toBig(hex));
      else if (kind === "parts") t.parts = Number(toBig(hex)) || 1;
      else if (kind === "pending") t.pending = toBig(hex);
      else if (kind === "collect") t.collect = toBig(hex) === 1n;
      else if (kind === "split" && hex && hex.length >= 2 + 64 * 7) {
        const b = hex.slice(2);
        const count = Number(BigInt("0x" + b.slice(6 * 64, 7 * 64)));
        for (let si = 0; si < count; si++) {
          t.split.push({
            idx: Number(BigInt("0x" + b.slice(si * 64, (si + 1) * 64))),
            bps: Number(BigInt("0x" + b.slice((3 + si) * 64, (4 + si) * 64))),
          });
        }
      } else if (kind === "state" && hex && hex.length >= 2 + 64 * 5) {
        const b = hex.slice(2);
        t.liveWeight = Number(BigInt("0x" + b.slice(0, 64)));
        t.liveNow = BigInt("0x" + b.slice(192, 256)) === 1n;
        t.liveFrom = Number(BigInt("0x" + b.slice(256, 320)));
      } else if (kind === "vault" && hex && hex !== "0x") {
        try {
          const body = hex.slice(2);
          const off = Number(BigInt("0x" + body.slice(64, 128))) * 2;
          const len = Number(BigInt("0x" + body.slice(off, off + 64)));
          for (let k = 0; k < len; k++) {
            const amt = BigInt("0x" + body.slice(off + 64 + k * 64, off + 128 + k * 64));
            if (amt === 0n || !meta[k]) continue;
            t.holdings.push({ idx: k, symbol: meta[k].symbol, decimals: meta[k].decimals, amount: amt });
          }
        } catch (e) {}
      }
    });
    for (const id of ids) {
      const t = by[id];
      t.accruing = t.liveNow && totalW > 0n && pot > 0n ? (pot * BigInt(t.liveWeight)) / totalW : 0n;
      t.pendingTotal = t.pending + t.accruing;
    }
    return ids.map((id) => by[id]);
  }

  /// settled-but-undelivered pay for a list of ids, as [id, wei] pairs
  async function pendingOf(ids) {
    const raws = await callBatch(ids.map((id) => ({ to: CFG.engine, data: SEL.pendingEth + word(id) })));
    return ids.map((id, i) => [id, raws[i] ? toBig(raws[i]) : 0n]);
  }

  /// brokers whose small pay rolled instead of delivering lately — the padding
  /// pool that lets one holder's COLLECT PAY carry the whole batch over the
  /// engine's per-asset swap minimum. Recent range only; served by every rpc.
  const CREDIT_ROLLED_TOPIC = "0xc2cda032f63ebe7629abecffad35589c71515edfd5b2c2048e340b3033a536e4";
  const DELIVERED_TOPIC = "0x8110a247e3bf84088ca20c991ad431b68293ca3bdfe626df91b9744bf4d7b9ce";
  /// every Delivered event since launch, cached: the all-time ledger.
  /// Grows slowly (hundreds/hour at most), one bounded scan, shared cache.
  const ACTIVATED_TOPIC = "0x9e4bccd4fa5e19e8e1d222251970473cc66d2206fd78ce89fd263bd56e7bd28a";
  const DEACTIVATED_TOPIC = "0xed48e4e899b34abded07dd8f092a22585a3fdec7db6b83f3927af165bf04cb1e";
  /// one combined pass over the slow-moving ledgers: all-time deliveries per
  /// broker AND the live hired count (a token is hired iff its LAST
  /// Activated/Deactivated event is Activated — transfers deactivate through
  /// the hook, so no Transfer scan is needed). One cache, one TTL.
  let _ledgerCache = { at: 0, v: null };
  async function firmLedger() {
    if (_ledgerCache.v && Date.now() - _ledgerCache.at < 240_000) return _ledgerCache.v;
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const ZERO_WORD = "0x" + "0".repeat(64);
    // Serial, not Promise.all. Three concurrent full-range scans were the
    // Bank opening three-wide on a rate-limited endpoint, which is the worst
    // possible opening move. Each of these is one request when it is allowed
    // to be, so the happy path costs a few seconds and never stampedes.
    //
    // DO NOT MERGE THE FIRST TWO with an OR array in topics[0]. It looks like a
    // free saving -- three requests become two -- and it is measured to be
    // worse: over four runs the merged [Activated OR Deactivated] query failed
    // TWICE with "log query timed out" while the separate Activated scan
    // succeeded four times out of four. The wider topic filter is a more
    // expensive query, not a cheaper one. (Measured 2026-09-01; one earlier
    // single run of the merge SUCCEEDED, which is exactly the trap this whole
    // file taught us today -- one observation of a load-dependent backend
    // proves nothing.)
    //
    // WHY THIS IS STILL CLIENT-SIDE. The Bank's first visit costs ~30s, and
    // almost none of it is these queries: timed individually against a quiet
    // RPC they are 2.0s + 0.8s + 0.4s = 3.2s. The rest is this page queueing
    // behind its own room-entry reads. It is cached for 240s and the stat is
    // decorative -- it hides rather than lying when it fails -- so nobody is
    // blocked and tuning the backoff to shave it would trade a real safety
    // margin for a number no one is waiting on.
    //
    // The honest argument for precomputing this server-side is NOT that the
    // chain cannot serve it -- it serves all three in one request each. It is
    // that these scans move ~5,900 log entries across the wire to produce a
    // single integer. If that ever matters, that ratio is the reason.
    const act = await rpcLogsRange({ address: CFG.nft, topics: [ACTIVATED_TOPIC] }, CFG.deployBlock, "latest", 0, true);
    const deact = await rpcLogsRange({ address: CFG.nft, topics: [DEACTIVATED_TOPIC] }, CFG.deployBlock, "latest", 0, true);
    // fuse() burns the absorbed tokens WITHOUT a Deactivated event, so a
    // fused broker's last Activated/Deactivated event stays Activated and
    // the last-wins ledger would count him hired forever. A burn is
    // terminal, so burned ids are a hard exclusion, immune to ordering.
    // NB Transfer's tokenId is the THIRD indexed arg: topics[3].
    const burns = await rpcLogsRange({ address: CFG.nft, topics: [TRANSFER_TOPIC, null, ZERO_WORD] }, CFG.deployBlock, "latest", 0, true);
    const burned = new Set(burns.map((g) => Number(BigInt(g.topics[3]))));
    const last = {};
    const mark = (logs, on) => {
      for (const g of logs) {
        const id = Number(BigInt(g.topics[1]));
        const b2 = Number(BigInt(g.blockNumber));
        const li = Number(BigInt(g.logIndex));
        const cur = last[id];
        if (!cur || b2 > cur.b || (b2 === cur.b && li > cur.i)) last[id] = { b: b2, i: li, on };
      }
    };
    mark(act, true);
    mark(deact, false);
    let hired = 0;
    for (const id in last) if (last[id].on && !burned.has(Number(id))) hired++;
    const v = { hired };
    _ledgerCache = { at: Date.now(), v };
    return v;
  }
  /// all-time ETH value delivered to a set of broker ids. Asks the node for
  /// exactly these ids (Delivered's tokenId is indexed, and a topic slot takes
  /// a list), so the answer is a few hundred logs at most. The previous
  /// version pulled EVERY Delivered since launch and summed client-side; that
  /// ledger passed the rpc's 10,000-log cap on 2026-08-29 (13,413 and growing
  /// ~1k/h), so the one-shot query started bisecting into dozens of calls.
  /// Returns { eth, usd6, mixed }:
  ///   eth   — Σ ethIn, what the payroll put in, across every asset
  ///   usd6  — Σ out for USDG deliveries only, 6 decimals. USDG is a dollar,
  ///           so this is the DOLLARS ACTUALLY RECEIVED, frozen at the moment
  ///           of each payment. It can only ever rise.
  ///   mixed — true when any delivery was a stock, whose `out` is a share
  ///           count and cannot be summed into a dollar figure.
  ///
  /// Both come out of the same log scan; usd6 costs no extra call.
  ///
  /// Why this exists (2026-08-31): the holder line multiplied `eth` by the
  /// LIVE ETH price, so a holder's "earned all time" fell whenever ETH fell.
  /// One reported it as lost payments — his own numbers, 12.80 -> 12.54 ->
  /// 12.60, went back UP, which is the tell: a total of past payments can
  /// never move in either direction. Never price a historical total at spot.
  const USDG_ASSET = 11; // deliberately NOT USDG_IDX: that constant has been
  // both 11 and 11n across builds, and `11 === 11n` is false. A local Number
  // keeps this correct whichever build it is pasted into.
  /// The block at which `addr` most recently acquired each token.
  ///
  /// A total of what SOMEBODY earned is not a total of what YOU earned.
  /// Brokers change hands constantly -- there is a resale market and the
  /// auction house hands one to a new owner every single day -- and the
  /// previous owner already claimed everything delivered before the sale.
  /// The LAST transfer in wins, because a token can leave and come back.
  let _sinceFor = { addr: null, map: null };
  async function ownedSince(addr) {
    const key = String(addr).toLowerCase();
    if (_sinceFor.addr === key && _sinceFor.map) return _sinceFor.map;
    const logs = await rpcLogsRange(
      { address: CFG.nft, topics: [TRANSFER_TOPIC, null, "0x" + word(addr)] },
      CFG.deployBlock, "latest", 0, true
    );
    const map = {};
    for (const g of logs) {
      const id = Number(BigInt(g.topics[3]));
      const blk = Number(BigInt(g.blockNumber));
      if (!(id in map) || blk > map[id]) map[id] = blk;
    }
    _sinceFor = { addr: key, map };
    return map;
  }

  async function earnedAllTime(ids, owner) {
    // Without an owner this is the token's whole history, which is what it
    // used to be for everybody. Reported 2026-09-01 by a holder whose line
    // read "$30.88 received" while $1.42 had arrived: he had bought three
    // brokers second-hand and was being shown $29.46 the seller had already
    // claimed. The money was never missing; the number was.
    const since = owner ? await ownedSince(owner) : null;
    let eth = 0n, usd6 = 0n, mixed = false;
    for (let i = 0; i < ids.length; i += 100) {
      const topics = [DELIVERED_TOPIC, ids.slice(i, i + 100).map((id) => "0x" + BigInt(id).toString(16).padStart(64, "0"))];
      const logs = await rpcLogsRange({ address: CFG.engine, topics }, CFG.deployBlock, "latest", 0, true);
      for (const g of logs) {
        if (since) {
          const tid = Number(BigInt(g.topics[1]));
          const from = since[tid];
          // No transfer-in found: fall back to the whole history rather than
          // hiding real earnings. Reserve #1 was minted before deployBlock, so
          // the treasury's own token takes this path -- which is the right way
          // round to be wrong, and it affects one wallet.
          if (from !== undefined && Number(BigInt(g.blockNumber)) < from) continue;
        }
        eth += BigInt("0x" + g.data.slice(2, 66));
        // Delivered(uint256 indexed tokenId, uint8 indexed assetIdx, uint256 ethIn, uint256 out)
        if (Number(BigInt(g.topics[2])) === USDG_ASSET) usd6 += BigInt("0x" + g.data.slice(66, 130));
        else mixed = true;
      }
    }
    return { eth, usd6, mixed };
  }
  async function hiredCount() {
    return (await firmLedger()).hired;
  }

  let _rolledCache = { at: 0, ids: null };
  /// brokers that can pad a small holder's batch over the engine's per-asset
  /// swap floor: ids with settled-but-undelivered pay, highest first.
  ///
  /// Log-free on purpose. This used to scan ~4 hours of CreditRolled +
  /// Delivered events; once the floor got busy (23,025 rolls in that window on
  /// 2026-08-29) the query passed the rpc's 10,000-log cap, rpcLogsRange
  /// bisected it into dozens of calls, the public node answered 429, payPlan
  /// threw and the deliver was never sent — holders saw a harvest and no pay.
  /// Now: a rotating window of SAMPLE token ids read straight from the engine
  /// (pendingEth, 40 per batch, the same path brokerBundle uses). No logs, a
  /// bounded number of calls whatever the chain does. About a third of all
  /// brokers carry pending pay at any time, so a 600-id window yields ~200
  /// candidates; the batch needs a handful. Same name and return shape as
  /// before, so level.js's two callers are untouched. Cached 3 minutes; the
  /// window rotates with the cache so repeat clicks look at fresh brokers.
  const SAMPLE = 600;
  async function rolledIds(account) {
    if (_rolledCache.ids && Date.now() - _rolledCache.at < 180_000 && _rolledCache.for === (account || "")) return _rolledCache.ids;
    // call() may answer "0x" (a wallet parked on another chain answers the
    // eth_call with nothing) — that must not become max = 0 and an empty pool
    const raw = await call(CFG.nft, SEL.maxSupply);
    let max = raw && raw !== "0x" && raw.length >= 66 ? Number(toBig(raw)) : 5000;
    if (!(max > 0)) max = 5000;
    const n = Math.min(SAMPLE, max);
    // 0-based; rotates each cache window AND is salted per wallet: two holders
    // clicking in the same three minutes must not pad with the same brokers,
    // or whoever lands second finds them already paid and rolls (measured:
    // one id in all five plans built within ten minutes on 2026-08-29)
    let salt = 0;
    try { if (account) salt = Number(BigInt(account) % BigInt(max)); } catch (e) { salt = 0; }
    const start = (Math.floor(Date.now() / 180_000) * 97 + salt) % max;
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(1 + ((start + i) % max));
    const pend = await pendingOf(ids);
    const out = pend
      .filter(([, p]) => p > 0n)
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .map(([id]) => id);
    _rolledCache = { at: Date.now(), ids: out, for: account || "" };
    return out;
  }

  /// how each broker's pay is split ACROSS ASSETS, in bps: [id, {idx: bps}].
  /// splitOf returns (uint8[3] idx, uint16[3] bps, uint8 count); count 0 means
  /// never picked, which pays 100% into the default asset — USDG, index 11.
  ///
  /// 11 is safe to hardcode as the default: the engine's `_defaultIdx()` returns
  /// the FIRST non-stock asset, USDG holds that slot, and anything added later
  /// appends at 12/13 BEHIND it. The default cannot move.
  ///
  /// `deliver()` swaps PER ASSET, so a pot bound to one asset says nothing about
  /// whether another will pay. Reading only the USDG slice (as this did until
  /// 2026-08-30) makes a holder paid entirely in stocks or FRONG look like he is
  /// owed nothing at all.
  const USDG_IDX = 11;
  async function assetSharesOf(ids) {
    const raws = await callBatch(ids.map((id) => ({ to: CFG.engine, data: SEL.splitOf + word(id) })));
    return ids.map((id, i) => {
      const r = raws[i];
      if (!r || r.length < 2 + 64 * 7) return [id, { [USDG_IDX]: 10000 }];
      const wAt = (j) => BigInt("0x" + r.slice(2 + 64 * j, 2 + 64 * (j + 1)));
      const count = Number(wAt(6));
      if (count === 0) return [id, { [USDG_IDX]: 10000 }];
      const by = {};
      for (let j = 0; j < count && j < 3; j++) {
        const a = Number(wAt(j));
        by[a] = (by[a] || 0) + Number(wAt(3 + j));
      }
      return [id, by];
    });
  }

  /// the default-asset slice only, in bps. Kept for callers that genuinely mean
  /// "USDG"; anything deciding whether a click will PAY must use assetSharesOf.
  async function usdgShareOf(ids) {
    return (await assetSharesOf(ids)).map(([id, by]) => [id, by[USDG_IDX] || 0]);
  }

  /// trading fees a harvest would ACTUALLY pull into the pay pot right now.
  /// Simulated via eth_call of harvest() itself: distribute() runs inside the
  /// simulation, so fees still sitting in the hook are counted. (Reading
  /// splitter.owed(engine) was a chicken-and-egg — that slot is only written
  /// BY distribute, so with no keeper it stayed 0 and payday stalled; found
  /// live 2026-08-28 23:53Z.)
  async function owedEngine() {
    const r = await call(CFG.engine, SEL.harvest);
    return r && r !== "0x" ? toBig(r) : 0n;
  }

  async function tokenAllowance(owner) {
    const t = await launchToken();
    if (!t) return null;
    return toBig(await call(t, SEL.allowance + word(owner) + word(CFG.nft)));
  }

  async function tokenBalance(owner) {
    const t = await launchToken();
    if (!t) return null;
    return toBig(await call(t, SEL.balanceOf + word(owner)));
  }

  async function nftNumber(sel, arg) {
    return toBig(await call(CFG.nft, SEL[sel] + (arg === undefined ? "" : word(arg))));
  }

  // ------------------------------------------------------------ writes
  /// The fee the wallet SHOWS is gasLimit × maxFeePerGas, its ceiling, not
  /// the charge (gasUsed × the block's price, 3–10× lower on this chain).
  /// MetaMask's own maxFeePerGas guess on RHC runs 0.1–0.8 gwei against a
  /// 0.06–0.09 gwei effective price, so a batch that costs $0.30 was shown as
  /// $6, and a wallet holding less than the ceiling could not confirm at all.
  /// Suggesting the fee (1.25× the node's gas price, no tip — the sequencer
  /// takes none) makes the ceiling track the real price; a wallet that
  /// ignores dapp fees loses nothing. If the price read fails, send as before.
  /// Why 1.25× and not 2× (2026-09-02): 289 base-fee samples over 24h — the
  /// fee moves under 7% in 95% of 5-minute windows; the rare spike is 1.5–4×,
  /// which 2× did not cover either. A ceiling below the base fee is refused
  /// at submission (nothing is sent, nothing charged) and the click is simply
  /// repeated; the quote, which is what holders read as "the gas fee", is
  /// 37% lower for it.
  async function suggestedFees() {
    try {
      const j = await rpcPost({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] });
      const gp = toBig(j.result);
      if (gp <= 0n) return null;
      return { maxFeePerGas: "0x" + ((gp * 5n) / 4n).toString(16), maxPriorityFeePerGas: "0x0" };
    } catch (e) { return null; }
  }
  async function send(to, data, valueWei, from, gasLimit) {
    const p = provider();
    const tx = { from, to, data };
    if (valueWei && valueWei > 0n) tx.value = "0x" + valueWei.toString(16);
    if (gasLimit) tx.gas = "0x" + gasLimit.toString(16);
    const fees = await suggestedFees();
    if (fees) Object.assign(tx, fees);
    try {
      return await p.request({ method: "eth_sendTransaction", params: [tx] });
    } catch (e) {
      // a wallet that will not take EIP-1559 fields on this chain says so
      // (MetaMask: "…does not support EIP-1559"); retry once the old way.
      // A plain rejection is not that, and is never retried.
      const m = String(e?.message || e || "").toLowerCase();
      if (fees && /1559|maxfeepergas|maxpriorityfeepergas/.test(m) && !/reject|denied/.test(m)) {
        delete tx.maxFeePerGas; delete tx.maxPriorityFeePerGas;
        return await p.request({ method: "eth_sendTransaction", params: [tx] });
      }
      throw e;
    }
  }
  /// gas for a payroll delivery, from what it actually costs. Fitted over 376
  /// mainnet deliver receipts (2026-08-30 → 09-02): ≈203k + ≈42k per id at
  /// the usual one slot per id; the swaps on top run ≈100k (one hop) to
  /// ≈300k (two hops through a mid pool, plus the TWAP reads). The old
  /// budget charged 1.4M for "up to ~13 swaps" on every batch, and a batch
  /// swaps one asset per DISTINCT asset in its splits, usually one — so a
  /// holder collecting three USDG brokers was quoted 3.6M gas for a 330k
  /// charge. Now: 400k base + 50k per slot + 300k per distinct asset, which
  /// is 20%+ over the p90 of every measured batch shape. Slots and assets
  /// come from splitOf (count 0 = the default single USDG slot); if that read
  /// fails every id is budgeted as 3 slots of 3 assets, the old ceiling.
  async function deliverGas(ids) {
    let slots = 0;
    const assets = new Set();
    try {
      const raws = await callBatch(ids.map((id) => ({ to: CFG.engine, data: SEL.splitOf + word(id) })));
      for (const r of raws) {
        if (!(r && r.length >= 2 + 7 * 64)) { slots += 3; assets.add("a").add("b").add("c"); continue; }
        const wordAt = (k) => Number(toBig("0x" + r.slice(2 + k * 64, 2 + (k + 1) * 64)));
        const count = wordAt(6);
        if (count > 0) {
          slots += count;
          for (let k = 0; k < count && k < 3; k++) assets.add(wordAt(k));
        } else {
          slots += 1;
          assets.add("default");
        }
      }
    } catch (e) { slots = ids.length * 3; assets.clear(); assets.add("a").add("b").add("c"); }
    return 400_000 + 50_000 * slots + 300_000 * Math.max(1, assets.size);
  }

  // ------------------------------------------------------- many calls at once
  /// PayVault has one claim per token and the contracts are frozen, so clearing
  /// a whole roster is a LIST of calls however it is done. A wallet that speaks
  /// EIP-5792 takes the list behind a single confirmation; every other wallet
  /// gets them one at a time, which still works, it just prompts each time.
  ///
  /// Every step is wrapped so a wallet that answers the capability query oddly
  /// can never break claiming: anything unexpected falls through to the loop.
  /// Why the last batch attempt did or did not batch, in the wallet's words,
  /// so a room can show it instead of silently prompting N times.
  let batchNote = "";
  async function batchSupported(from) {
    const p = provider();
    if (!p || !from) { batchNote = "no wallet"; return false; }
    try {
      const caps = await p.request({ method: "wallet_getCapabilities", params: [from, [CFG.chainHex]] });
      const c = caps && (caps[CFG.chainHex] || caps[CFG.chainHex.toLowerCase()] || caps[String(parseInt(CFG.chainHex, 16))]);
      if (!c) { batchNote = "wallet reports no batch capability on this chain"; return false; }
      // the spec renamed this: atomicBatch.supported became atomic.status
      if (c.atomicBatch && c.atomicBatch.supported) { batchNote = ""; return true; }
      const s = c.atomic && c.atomic.status;
      if (s === "supported" || s === "ready") { batchNote = ""; return true; }
      batchNote = "wallet says batching is " + (s || "unsupported") + " for this account";
      return false;
    } catch (e) { batchNote = "wallet refused the capability query: " + String(e && e.message).slice(0, 80); return false; }
  }

  async function sendCalls(calls, from) {
    const p = provider();
    const res = await p.request({
      method: "wallet_sendCalls",
      params: [{
        version: "2.0.0", chainId: CFG.chainHex, from, atomicRequired: true,
        calls: calls.map((c) => ({ to: c.to, data: c.data })),
      }],
    });
    const id = typeof res === "string" ? res : res && res.id;
    if (!id) throw new Error("the wallet did not return a batch id");
    for (let i = 0; i < 120; i++) {
      const st = await p.request({ method: "wallet_getCallsStatus", params: [id] });
      const code = st && (st.status !== undefined ? st.status : st.statusCode);
      if (code === 200 || code === "CONFIRMED") return st;
      if (code === "PENDING" || code === 100 || code === undefined) { await sleep(2000); continue; }
      throw new Error("the batch did not go through");
    }
    throw new Error("still not confirmed — check your wallet");
  }

  /// Runs a list of {to,data}. `onStep(done, total, batched)` is called before
  /// each one so the room can say "3 of 8" instead of appearing to hang.
  async function runCalls(calls, from, onStep) {
    if (!calls.length) return { batched: false, done: 0 };
    if (calls.length > 1 && (await batchSupported(from))) {
      try {
        if (onStep) onStep(0, calls.length, true);
        await sendCalls(calls, from);
        return { batched: true, done: calls.length };
      } catch (e) {
        // a wallet that claimed the capability and then refused it must not
        // leave the roster unclaimed; the loop below is always available
        if (String(e && e.message).includes("not confirmed")) throw e;
        batchNote = "wallet refused the batch: " + String(e && (e.message || e)).slice(0, 100);
        console.warn("batch refused, falling back to one by one:", e);
        if (onStep) onStep(0, calls.length, false);
      }
    }
    let done = 0;
    for (const c of calls) {
      if (onStep) onStep(done, calls.length, false);
      const hash = await send(c.to, c.data, 0n, from);
      await waitForTx(hash);
      done++;
    }
    return { batched: false, done };
  }

  async function waitForTx(hash) {
    const p = provider();
    for (let i = 0; i < 120; i++) {
      try {
        const r = await p.request({ method: "eth_getTransactionReceipt", params: [hash] });
        if (r) {
          if (Number(r.status) !== 1) throw new Error("the transaction failed on chain");
          return r;
        }
      } catch (e) {
        if (String(e.message).includes("failed on chain")) throw e;
      }
      await sleep(2500);
    }
    throw new Error("still not confirmed — check your wallet");
  }

  const api = {
    CFG,
    SEL,
    word,
    toBig,
    provider,
    wallets,
    setProvider,
    hasChosen,
    call,
    callBatch,
    blockNumber,
    rpcLogsRange,
    TOPICS: { ACTIVATED: ACTIVATED_TOPIC, DEACTIVATED: DEACTIVATED_TOPIC, DELIVERED: DELIVERED_TOPIC },
    stats,
    tokensOf,
    assetMeta,
    brokerBundle,
    launchToken,
    tokenAllowance,
    tokenBalance,
    nftNumber,
    send,
    waitForTx,
    approveMax: async (from) =>
      send(await launchToken(), SEL.approve + word(CFG.nft) + word((1n << 256n) - 1n), 0n, from),
    activate: (id, from) => send(CFG.nft, SEL.activate + word(id), 0n, from),
    // seat waiting brokers on payroll (permissionless, corrective). Explicit
    // gas — same estimate trap family as harvest/deliver.
    sync: (ids, from) =>
      send(
        CFG.engine,
        SEL.sync + word(32) + word(ids.length) + ids.map((i) => word(i)).join(""),
        0n,
        from,
        600_000 + 120_000 * ids.length
      ),
    // one payroll delivery for a LIST of ids, holder-triggered. Explicit gas
    // (the estimate trap is real, see send()), sized per pay slot — see
    // deliverGas() for the fit.
    deliver: async (ids, from) =>
      send(
        CFG.engine,
        SEL.deliver + word(32) + word(ids.length) + ids.map((i) => word(i)).join(""),
        0n,
        from,
        await deliverGas(ids)
      ),
    pendingOf,
    rolledIds,
    usdgShareOf,
    assetSharesOf,
    owedEngine,
    earnedAllTime,
    hiredCount,
    // pull the fee pot in; fixed gas — harvest's estimate is the original trap.
    // 450k: 355 mainnet harvests used 170k median, 198k max (2026-09-02).
    harvest: (from) => send(CFG.engine, SEL.harvest, 0n, from, 450_000),
    upgradeTier: (id, tier, from) => send(CFG.nft, SEL.upgradeTier + word(id) + word(tier), 0n, from),
    fuse: (ids, from) =>
      send(CFG.nft, SEL.fuse + word(32) + word(ids.length) + ids.map((i) => word(i)).join(""), 0n, from),
    setSplit: (id, idxs, bpsList, from) => {
      const offIdx = 3 * 32;
      const offBps = offIdx + 32 + 32 * idxs.length;
      const data =
        SEL.setSplit +
        word(id) +
        word(offIdx) +
        word(offBps) +
        word(idxs.length) +
        idxs.map((v) => word(v)).join("") +
        word(bpsList.length) +
        bpsList.map((v) => word(v)).join("");
      return send(CFG.engine, data, 0n, from);
    },
    setCollectMode: (id, toWallet, from) =>
      send(CFG.engine, SEL.setCollectMode + word(id) + word(toWallet ? 1 : 0), 0n, from),
    claim: (id, from) => send(CFG.vault, SEL.claim + word(id), 0n, from),
    // the same three calls as data only, so a whole roster can go in one list
    claimCall: (id) => ({ to: CFG.vault, data: SEL.claim + word(id) }),
    // hiring a squad is a list of activate() calls, same shape as promoting
    activateCall: (id) => ({ to: CFG.nft, data: SEL.activate + word(id) }),
    collectCall: (id, toWallet) =>
      ({ to: CFG.engine, data: SEL.setCollectMode + word(id) + word(toWallet ? 1 : 0) }),
    // upgradeTier is per token as well, so promoting a squad is a list too. The
    // allowance has to be in place before the first one: the burn is a
    // transferFrom, and under a 5792 batch one failed pull takes the whole list
    // down with it.
    upgradeCall: (id, tier) => ({ to: CFG.nft, data: SEL.upgradeTier + word(id) + word(tier) }),
    runCalls,
    batchSupported,
    get batchNote() { return batchNote; },
  };
  window.Firm = api;
})();
