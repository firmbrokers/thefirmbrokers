/* ===========================================================================
   CAMPAIGN PAGES — the shared chain layer for apply.html and campaign.html.

   Deliberately independent of firm.js: these are document pages in the
   handbook's style, not the game. Reads go through Multicall3 (one eth_call
   per page), the wallet is plain EIP-1193, and every number shown comes off
   the chain except the project's name and links, which come from the
   campaigns worker (CAMPAIGN_API) once it is deployed.

   Contract: src/Campaign.sol · registry: src/CampaignFactory.sol · spec:
   SPONSORED_CAMPAIGN_PLAN.md. Selectors below were produced with `cast sig`.
   =========================================================================== */
window.CP = (function () {
  "use strict";

  const CFG = window.FIRM_CFG || {};
  const RPCS = CFG.rpcs || ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com"];
  const CHAIN_HEX = CFG.chainHex || "0x1237";
  const FACTORY = CFG.campaignFactory || "";
  const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
  const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
  const CAMPAIGN_API = "https://firm-campaigns.firmbrokersrhchain.workers.dev"; // campaigns/worker, deployed 2026-09-02
  const DAY = 86400n;

  const SEL = {
    create: "0x0aba0599", isCampaign: "0xe2714e1b", all: "0x10c4e8b0", count: "0x06661abd", owner: "0x8da5cb5b",
    status: "0x200d2ed2", approved: "0x19d40b08", paused: "0x5c975abb", sponsor: "0x77c93662", token: "0xfc0c546a",
    pool: "0x16f0115b", fee: "0xddca3f43", startAt: "0xc7446565", distributionEnd: "0xefa90b54",
    requestedStart: "0x5c0c0b9c", days_: "0x81ef7339", delay: "0x6a42b8f8", buysPerDay: "0xeb4f259f",
    minHold: "0xd471ed75", minLiquidity: "0x252cf2d2", slippageBps: "0x578c71d9", totalWeight: "0x96c82e57",
    totalEthSpent: "0x92d3b886", totalFees: "0x13114a9d", totalTokensBought: "0xbaa9e531", totalClaimed: "0xd54ad2a1",
    optedCount: "0xcfe8bb61", rateX: "0x696c53c0", periodFinish: "0xebe2b12b", carry: "0xf02ec765",
    lastBuyAt: "0x27e39977", buysOn: "0x80fcbae8", summary: "0x8a331567",
    symbol: "0x95d89b41", name: "0x06fdde03", decimals: "0x313ce567", balanceOf: "0x70a08231",
    getPool: "0x1698ee82", liquidity: "0x1a686502", aggregate3: "0x82ad56cb",
  };

  // ---------------------------------------------------------------- abi
  const word = (v) => BigInt(v).toString(16).padStart(64, "0");
  const addrWord = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const u = (h, i) => (h && h.length >= 2 + 64 * (i + 1) ? BigInt("0x" + h.slice(2 + 64 * i, 2 + 64 * (i + 1))) : 0n);
  const addr = (h, i) => (h && h.length >= 2 + 64 * (i + 1) ? "0x" + h.slice(2 + 64 * i + 24, 2 + 64 * (i + 1)) : null);
  function str(h) {
    try {
      if (!h || h.length < 130) return "";
      const len = Number(BigInt("0x" + h.slice(66, 130)));
      const bytes = h.slice(130, 130 + len * 2);
      return decodeURIComponent(bytes.replace(/(..)/g, "%$1"));
    } catch (e) { return ""; }
  }
  function addrArray(h) {
    if (!h || h.length < 130) return [];
    const n = Number(BigInt("0x" + h.slice(66, 130)));
    const out = [];
    for (let i = 0; i < n; i++) out.push("0x" + h.slice(130 + i * 64 + 24, 130 + (i + 1) * 64));
    return out;
  }

  // ---------------------------------------------------------------- rpc
  let rpcIdx = 0;
  async function rpc(method, params) {
    let err;
    for (let i = 0; i < RPCS.length; i++) {
      const url = RPCS[(rpcIdx + i) % RPCS.length];
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message);
        rpcIdx = (rpcIdx + i) % RPCS.length;
        return j.result;
      } catch (e) { err = e; }
    }
    throw err || new Error("rpc unreachable");
  }
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);

  /// aggregate3 with allowFailure: one eth_call for any number of reads
  async function multicall(calls) {
    const out = [];
    for (let i = 0; i < calls.length; i += 60) {
      const part = calls.slice(i, i + 60);
      const heads = [];
      const bodies = [];
      let cur = 32 * part.length;
      for (const c of part) {
        const d = c.data.replace(/^0x/, "");
        const padded = d + "0".repeat((64 - (d.length % 64)) % 64);
        const body = addrWord(c.to) + word(1) + word(96) + word(d.length / 2) + padded;
        heads.push(word(cur));
        bodies.push(body);
        cur += body.length / 2;
      }
      const data = SEL.aggregate3 + word(32) + word(part.length) + heads.join("") + bodies.join("");
      const res = await call(MULTICALL, data);
      const h = res.slice(2);
      const arrOff = Number(BigInt("0x" + h.slice(0, 64))) * 2;
      const n = Number(BigInt("0x" + h.slice(arrOff, arrOff + 64)));
      const base = arrOff + 64;
      for (let k = 0; k < n; k++) {
        const o = Number(BigInt("0x" + h.slice(base + k * 64, base + (k + 1) * 64))) * 2 + base;
        const ok = BigInt("0x" + h.slice(o, o + 64)) === 1n;
        const bo = Number(BigInt("0x" + h.slice(o + 64, o + 128))) * 2 + o;
        const bl = Number(BigInt("0x" + h.slice(bo, bo + 64))) * 2;
        out.push(ok ? "0x" + h.slice(bo + 64, bo + 64 + bl) : null);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- reads
  async function campaigns() {
    if (!FACTORY) return [];
    return addrArray(await call(FACTORY, SEL.all));
  }

  const FIELDS = ["status", "approved", "paused", "sponsor", "token", "pool", "fee", "startAt", "distributionEnd", "requestedStart", "days_", "delay", "buysPerDay", "minHold", "minLiquidity", "slippageBps", "totalWeight", "totalEthSpent", "totalFees", "totalTokensBought", "totalClaimed", "optedCount", "rateX", "periodFinish", "carry", "lastBuyAt"];

  async function campaign(a) {
    const res = await multicall(FIELDS.map((f) => ({ to: a, data: SEL[f] })));
    const c = { address: a };
    FIELDS.forEach((f, i) => { c[f] = u(res[i], 0); });
    c.sponsor = addr(res[3], 0);
    c.token = addr(res[4], 0);
    c.pool = addr(res[5], 0);
    c.status = Number(c.status);
    c.approved = c.approved === 1n;
    c.paused = c.paused === 1n;
    const [sym, name, bal, buysToday] = await Promise.all([
      call(c.token, SEL.symbol).then(str).catch(() => "?"),
      call(c.token, SEL.name).then(str).catch(() => ""),
      rpc("eth_getBalance", [a, "latest"]).then((x) => BigInt(x)),
      c.approved && c.status === 2 ? call(a, SEL.buysOn + word((BigInt(Math.floor(Date.now() / 1000)) - c.startAt) / DAY)).then((x) => u(x, 0)) : Promise.resolve(0n),
    ]);
    c.symbol = cleanSymbol(sym);
    c.name = cleanText(name, 60);
    c.balance = bal;
    c.buysToday = buysToday;
    // derived, all exact from state
    const now = BigInt(Math.floor(Date.now() / 1000));
    c.deposited = c.totalEthSpent + c.totalFees + c.balance;
    c.remainder = c.periodFinish > now ? (c.rateX * (c.periodFinish - now)) / 10n ** 18n : 0n;
    c.streamed = c.totalTokensBought - c.remainder - c.carry;
    c.unclaimed = c.streamed - c.totalClaimed;
    c.lastUnlock = c.approved ? c.distributionEnd + DAY + c.delay : 0n;
    if (c.approved && c.status === 2) {
      const day = (now - c.startAt) / DAY;
      const windowLen = DAY / c.buysPerDay;
      c.windowsLeft = (c.days_ - day) * c.buysPerDay - c.buysToday;
      const earliest = c.startAt + day * DAY + c.buysToday * windowLen;
      const gap = c.lastBuyAt + windowLen / 2n;
      c.nextWindow = c.buysToday < c.buysPerDay ? (earliest > gap ? earliest : gap) : c.startAt + (day + 1n) * DAY;
      c.sliceNow = c.windowsLeft > 0n ? c.balance / c.windowsLeft : 0n;
    }
    return c;
  }

  async function summary(a, holder, ids) {
    const data = SEL.summary + addrWord(holder) + word(64) + word(ids.length) + ids.map((i) => word(i)).join("");
    const r = await call(a, data);
    return { earned: u(r, 0), unlocked: u(r, 1), claimable: u(r, 2) };
  }

  /// the WETH/token pools on the canonical factory, deepest first
  async function poolsFor(token) {
    const fees = [100, 500, 3000, 10000];
    const got = await multicall(fees.map((f) => ({ to: V3_FACTORY, data: SEL.getPool + addrWord(WETH) + addrWord(token) + word(f) })));
    const pools = fees.map((f, i) => ({ fee: f, pool: addr(got[i], 0) })).filter((p) => p.pool && !/^0x0{40}$/.test(p.pool));
    if (!pools.length) return [];
    const liq = await multicall(pools.map((p) => ({ to: p.pool, data: SEL.liquidity })));
    pools.forEach((p, i) => { p.liquidity = u(liq[i], 0); });
    return pools.sort((x, y) => (y.liquidity > x.liquidity ? 1 : y.liquidity < x.liquidity ? -1 : 0));
  }

  async function tokenInfo(token) {
    const [s, n, d] = await multicall([{ to: token, data: SEL.symbol }, { to: token, data: SEL.name }, { to: token, data: SEL.decimals }]);
    return { symbol: cleanSymbol(str(s)), name: cleanText(str(n), 60), decimals: Number(u(d, 0)), hasCode: !!s };
  }

  async function ethUsd() {
    try {
      const r = await fetch("https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/" + WETH, { headers: { accept: "application/json" } });
      const j = await r.json();
      const v = j && j.data && j.data.attributes && j.data.attributes.token_prices && j.data.attributes.token_prices[WETH.toLowerCase()];
      return v ? Number(v) : null;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- wallet
  let account = null;
  function provider() { return window.ethereum || null; }
  async function connect() {
    const p = provider();
    if (!p) throw new Error("no wallet in this browser");
    // ask for the account chooser every time: a site that is already
    // connected to one account otherwise never gets offered another one
    try { await p.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }); } catch (e) { /* older wallets: fall through */ }
    const accs = await p.request({ method: "eth_requestAccounts" });
    account = accs[0];
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if (e && e.code === 4902) {
        await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [RPCS[0]], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] });
      } else throw e;
    }
    return account;
  }
  async function send(tx) {
    const p = provider();
    const hash = await p.request({ method: "eth_sendTransaction", params: [{ from: account, ...tx }] });
    for (let i = 0; i < 120; i++) {
      const r = await rpc("eth_getTransactionReceipt", [hash]).catch(() => null);
      if (r) {
        if (Number(r.status) !== 1) throw new Error("the transaction failed on chain");
        return r;
      }
      await new Promise((res) => setTimeout(res, 2500));
    }
    throw new Error("still not confirmed; check your wallet");
  }

  /// factory.create(Choice) — sponsor = the caller
  function createData(ch) {
    return SEL.create + addrWord(ch.token) + addrWord(ch.pool) + word(0) + word(ch.slippageBps) + word(ch.minLiquidity) + word(ch.minHold) + word(ch.requestedStart) + word(ch.days) + word(ch.delay) + word(ch.buysPerDay);
  }

  // ---------------------------------------------------------------- format
  const STATUS = ["pending review", "approved · starts soon", "distributing", "releasing", "done"];
  function eth(wei, d) {
    const n = Number(wei) / 1e18;
    return n.toLocaleString("en-US", { maximumFractionDigits: d == null ? (n >= 1 ? 3 : 4) : d });
  }
  function units(v, dec) {
    const n = Number(v) / 10 ** (dec == null ? 18 : dec);
    return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : n >= 1 ? 2 : 4 });
  }
  function date(ts) {
    if (!ts) return "—";
    return new Date(Number(ts) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  function delayText(sec) {
    const s = Number(sec);
    if (s === 0) return "unlocks as it is earned";
    const d = Math.round(s / 86400);
    return `each hour's pay unlocks ${d} day${d === 1 ? "" : "s"} later`;
  }
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  /// Anything from the chain or the worker is untrusted text (a token's
  /// symbol() can return markup). Escape before innerHTML, and only accept a
  /// symbol that looks like one.
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cleanSymbol = (v) => (/^[A-Za-z0-9 _.$-]{1,16}$/.test(String(v || "")) ? String(v) : "?");
  const cleanText = (v, n) => String(v == null ? "" : v).replace(/[\x00-\x1f\x7f<>]/g, "").trim().slice(0, n || 80);
  const cleanUrl = (v) => (/^https:\/\/[A-Za-z0-9.-]+(\/[^\s"'<>]*)?$/.test(String(v || "")) ? String(v) : "");
  const cleanHandle = (v) => (String(v || "").replace(/^@/, "").match(/^[A-Za-z0-9_]{1,15}$/) || [""])[0];
  const explorer = (a) => "https://robinhoodchain.blockscout.com/address/" + a;

  return { CFG, FACTORY, WETH, CAMPAIGN_API, SEL, rpc, call, multicall, campaigns, campaign, summary, poolsFor, tokenInfo, ethUsd, connect, send, createData, get account() { return account; }, STATUS, eth, units, date, delayText, short, explorer, esc, cleanSymbol, cleanText, cleanUrl, cleanHandle, u, addr, str, word, addrWord, addrArray };
})();
