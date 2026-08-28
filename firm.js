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

  async function call(to, data) {
    if (!to) return null;
    const p = provider();
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

  async function rpcLogs(params) {
    const p = provider();
    if (p && p.request) {
      try {
        return await p.request({ method: "eth_getLogs", params: [params] });
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
        if (attempt < 4) await sleep(500 * (attempt + 1));
      }
    }
    throw last;
  }

  async function rpcLogsRange(base, from, to, depth) {
    depth = depth || 0;
    const params = Object.assign({}, base, {
      fromBlock: "0x" + from.toString(16),
      toBlock: to === "latest" ? "latest" : "0x" + to.toString(16),
    });
    try {
      return await rpcLogs(params);
    } catch (e) {
      if (depth > 12) throw e;
      if (to === "latest") to = await blockNumber();
      if (to - from < 2) throw e;
      const mid = Math.floor((from + to) / 2);
      return (await rpcLogsRange(base, from, mid, depth + 1)).concat(
        await rpcLogsRange(base, mid + 1, to, depth + 1)
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

  async function tokensOf(addr) {
    const padded = "0x" + word(addr);
    const got = await rpcLogsRange(
      { address: CFG.nft, topics: [TRANSFER_TOPIC, null, padded] },
      CFG.deployBlock,
      "latest"
    );
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
      by[id] = { id, active: false, weight: 0, tierBurned: 0n, artwork: 0, parts: 1, holdings: [], pending: 0n, collect: false, split: [], liveNow: false, liveWeight: 0 };
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
  async function send(to, data, valueWei, from) {
    const p = provider();
    const tx = { from, to, data };
    if (valueWei && valueWei > 0n) tx.value = "0x" + valueWei.toString(16);
    return await p.request({ method: "eth_sendTransaction", params: [tx] });
  }

  // ------------------------------------------------------- many calls at once
  /// PayVault has one claim per token and the contracts are frozen, so clearing
  /// a whole roster is a LIST of calls however it is done. A wallet that speaks
  /// EIP-5792 takes the list behind a single confirmation; every other wallet
  /// gets them one at a time, which still works, it just prompts each time.
  ///
  /// Every step is wrapped so a wallet that answers the capability query oddly
  /// can never break claiming: anything unexpected falls through to the loop.
  async function batchSupported(from) {
    const p = provider();
    if (!p || !from) return false;
    try {
      const caps = await p.request({ method: "wallet_getCapabilities", params: [from, [CFG.chainHex]] });
      const c = caps && (caps[CFG.chainHex] || caps[CFG.chainHex.toLowerCase()]);
      if (!c) return false;
      // the spec renamed this: atomicBatch.supported became atomic.status
      if (c.atomicBatch && c.atomicBatch.supported) return true;
      const s = c.atomic && c.atomic.status;
      return s === "supported" || s === "ready";
    } catch (e) { return false; }
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
    collectCall: (id, toWallet) =>
      ({ to: CFG.engine, data: SEL.setCollectMode + word(id) + word(toWallet ? 1 : 0) }),
    // upgradeTier is per token as well, so promoting a squad is a list too. The
    // allowance has to be in place before the first one: the burn is a
    // transferFrom, and under a 5792 batch one failed pull takes the whole list
    // down with it.
    upgradeCall: (id, tier) => ({ to: CFG.nft, data: SEL.upgradeTier + word(id) + word(tier) }),
    runCalls,
    batchSupported,
  };
  window.Firm = api;
})();
