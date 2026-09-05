/* ===========================================================================
   THE OFFICE POOL — one pool a day in $9TO5, drawn at the closing bell.

   Registers window.__POOL = { page } and is mounted by pool.html (and, later,
   by the street: level.js will call it guarded, like auction.js). Reads go
   through F.callBatch, writes through F.send; everything the page needs is a
   view on the contract — no indexer, no worker, no logs.

   Inert until config.js names the contract (CFG.pool): the page then says the
   pool has not opened and does nothing else. The contract address is NEVER
   taken from the URL (anti-phishing rule, same as the token and the mint).
   =========================================================================== */
(function () {
  "use strict";
  const F = window.Firm;
  if (!F) return;
  const CFG = F.CFG;
  const { word, toBig } = F;

  const SEL = {
    deposit: "0xb927dab6", registerBrokers: "0xfb9a75f4", claimDividends: "0xccbba739", claimReferral: "0xe02f1ebd",
    setCode: "0xb9ef767f", draw: "0x23906963",
    roundView: "0xdb5b4737", currentRound: "0x8a19c8bc", playerView: "0xcaeacdb9", players: "0x1f5053a1",
    deposits: "0x0f430645", depositCount: "0xa537f3c9", recentRounds: "0xf36ea453", dueForDraw: "0xf0c0f269",
    roundsOf: "0x8820a363", claimableDividends: "0x062c1746", referralOwed: "0x994ec7c7", codeOf: "0x2cfc2716",
    codeOwner: "0x11ad2f34", referrer: "0x2cf003c2", roundCount: "0x127f0b3f", knobs: "0x48fe7e53", brokerUsed: "0xa314afcf",
    beaconDelay: "0x925e2416",
    allowance: "0xdd62ed3e", balanceOf: "0x70a08231", approve: "0x095ea7b3", isActive: "0x82afd23b",
    quoteBuy: "0x4beb394c", // Reinvest401k.quoteBuy(uint256): the pot in ETH, optional
  };
  const DEC = 18n;
  const REF_KEY = "firmbrokers.pool.ref.v1";
  const POLL_IDLE = 20000, POLL_HOT = 4000, HOT_WINDOW = 600;
  const DRAND = ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"];
  const ZERO = "0x0000000000000000000000000000000000000000";

  // ---------------------------------------------------------------- helpers
  const w = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const big = (hex, i) => BigInt("0x" + w(hex, i));
  const num = (hex, i) => Number(big(hex, i));
  const addr = (hex, i) => "0x" + w(hex, i).slice(24);
  const short = (a) => (a && a !== ZERO ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;" }[c]));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const bytes32 = (str) => { let h = ""; for (const ch of str) h += ch.charCodeAt(0).toString(16).padStart(2, "0"); return h.padEnd(64, "0"); };
  const fromBytes32 = (hex) => { let s = ""; for (let i = 0; i < 64; i += 2) { const c = parseInt(hex.slice(i, i + 2), 16); if (!c) break; s += String.fromCharCode(c); } return s; };
  const validCode = (s) => /^[a-z0-9]{3,20}$/.test(s);

  /// 1,234,567 → "1.23M", 12,345 → "12,345", never scientific
  function fmt(units, digits) {
    const n = Number(units) / 1e18;
    if (digits != null) return n.toLocaleString("en-US", { maximumFractionDigits: digits });
    if (n >= 1e6) return (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M";
    if (n >= 1e4) return (n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  /// "12,345" · "12.5k" · "1.2m" → wei, null if it is not a number
  function parseAmount(str) {
    let t = String(str || "").trim().toLowerCase().replace(/[\s,_]/g, "");
    let mul = 1n;
    if (t.endsWith("k")) { mul = 1000n; t = t.slice(0, -1); } else if (t.endsWith("m")) { mul = 1000000n; t = t.slice(0, -1); }
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const [i, f = ""] = t.split(".");
    const frac = (f + "0".repeat(18)).slice(0, 18);
    try { return (BigInt(i) * 10n ** DEC + BigInt(frac)) * mul; } catch (e) { return null; }
  }
  const nyTime = (ts, withDate) => new Date(ts * 1000).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }, withDate ? { month: "short", day: "numeric" } : {}));
  /// " · 21:00 your time" when the viewer is not on New York time
  const localTime = (ts, brief) => { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (!tz || tz === "America/New_York") return ""; return " · " + new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (brief ? " yours" : " your time"); } catch (e) { return ""; } };
  const ago = (ts) => { const s = Math.max(0, Math.floor(Date.now() / 1000) - ts); return s < 60 ? s + "s" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d"; };
  const countdown = (left) => { if (left <= 0) return "0:00"; const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60; return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };

  // ---------------------------------------------------------------- decoders
  /// Round is a struct of statics with a nested Knobs: 20 flat words.
  function decodeRound(hex) {
    if (!hex || hex.length < 2 + 64 * 20) return null;
    return {
      closesAt: num(hex, 0), beaconRound: num(hex, 1), state: num(hex, 2), playerCount: num(hex, 3),
      deposits: big(hex, 4), totalWeight: big(hex, 5), pot: big(hex, 6), seed: big(hex, 7), acc: big(hex, 8),
      refundWinner: addr(hex, 9), jackpotWinner: addr(hex, 10), refundPaid: big(hex, 11), jackpotPaid: big(hex, 12),
      rand: "0x" + w(hex, 13),
      minDeposit: big(hex, 14), divBps: num(hex, 15), refBps: num(hex, 16), houseBps: num(hex, 17), boostBps: num(hex, 18), boostCapBps: num(hex, 19),
    };
  }
  const decodePlayer = (hex, o = 0) => (!hex || hex.length < 2 + 64 * (o + 8)) ? null : {
    idx: num(hex, o), brokers: num(hex, o + 1), deposited: big(hex, o + 2), weight: big(hex, o + 3),
    divEarned: big(hex, o + 4), divClaimable: big(hex, o + 5), totalWeight: big(hex, o + 6), abandonClaimed: num(hex, o + 7) === 1,
  };
  function decodeUintArray(hex) {
    if (!hex || hex.length < 130) return [];
    const off = num(hex, 0) / 32, n = num(hex, off);
    const out = [];
    for (let i = 0; i < n; i++) out.push(big(hex, off + 1 + i));
    return out;
  }
  /// players(): (address[] addrs, PlayerView[] views)
  function decodePlayers(hex) {
    if (!hex || hex.length < 130) return [];
    const oa = num(hex, 0) / 32, ov = num(hex, 1) / 32;
    const n = num(hex, oa);
    const out = [];
    for (let i = 0; i < n; i++) out.push({ addr: addr(hex, oa + 1 + i), v: decodePlayer(hex, ov + 1 + i * 8) });
    return out;
  }
  /// deposits(): Deposit[] of (player, amount, at)
  function decodeDeposits(hex) {
    if (!hex || hex.length < 130) return [];
    const o = num(hex, 0) / 32, n = num(hex, o);
    const out = [];
    for (let i = 0; i < n; i++) out.push({ player: addr(hex, o + 1 + i * 3), amount: big(hex, o + 2 + i * 3), at: num(hex, o + 3 + i * 3) });
    return out;
  }

  // ---------------------------------------------------------------- state
  const S = {
    account: null, cur: null, curId: 0, closesAt: 0, delay: 300, skew: 0, count: 0,
    players: [], feed: [], history: [], due: [], me: null, claimable: 0n, refOwed: 0n, code: "", referrer: ZERO,
    knobs: null, refOwner: ZERO, potShown: 0n, seenDeposits: 0, balance: 0n, allowance: 0n, brokers: [], brokersOwned: 0, brokersEligible: 0, useBrokers: true, ethPer: null, loaded: false, busy: false,
  };

  // ---------------------------------------------------------------- chain
  async function load() {
    const P = CFG.pool;
    const head = await F.callBatch([
      { to: P, data: SEL.currentRound }, { to: P, data: SEL.roundCount }, { to: P, data: SEL.beaconDelay },
      { to: P, data: SEL.dueForDraw }, { to: P, data: SEL.recentRounds + word(8) }, { to: P, data: SEL.knobs },
      { to: P, data: SEL.codeOwner + bytes32(refCode() || "---") }, // does the link's code exist?
    ]);
    S.refOwner = head[6] && head[6].length >= 66 ? addr(head[6], 0) : ZERO;
    // the terms a round opening now would take (the board's rules before the first chip-in of a day)
    if (head[5] && head[5].length >= 2 + 64 * 6) S.knobs = { minDeposit: big(head[5], 0), divBps: num(head[5], 1), refBps: num(head[5], 2), houseBps: num(head[5], 3), boostBps: num(head[5], 4), boostCapBps: num(head[5], 5) };
    const cr = head[0];
    S.curId = num(cr, 0); S.closesAt = num(cr, 1); const open = num(cr, 2) === 1;
    // count down against the CHAIN's clock: a device that is off by minutes is the difference between chipping in and not
    if (cr.length >= 2 + 64 * 4) S.skew = Math.floor(Date.now() / 1000) - num(cr, 3);
    const roundCount = num(head[1], 0);
    S.delay = num(head[2], 0) || 300;
    S.due = decodeUintArray(head[3]).map(Number);
    const recent = decodeUintArray(head[4]).map(Number).filter((id) => id !== S.curId || !open);

    const reqs = [];
    if (open) {
      reqs.push({ to: P, data: SEL.roundView + word(S.curId) });
      reqs.push({ to: P, data: SEL.depositCount + word(S.curId) });
    }
    for (const id of recent) reqs.push({ to: P, data: SEL.roundView + word(id) });
    if (S.account) {
      reqs.push({ to: P, data: SEL.claimableDividends + word(S.account) });
      reqs.push({ to: P, data: SEL.referralOwed + word(S.account) });
      reqs.push({ to: P, data: SEL.codeOf + word(S.account) });
      reqs.push({ to: P, data: SEL.referrer + word(S.account) });
      reqs.push({ to: CFG.token, data: SEL.balanceOf + word(S.account) });
      reqs.push({ to: CFG.token, data: SEL.allowance + word(S.account) + word(P) });
      if (open) reqs.push({ to: P, data: SEL.playerView + word(S.curId) + word(S.account) });
    }
    if (CFG.reinvest) reqs.push({ to: CFG.reinvest, data: SEL.quoteBuy + word(10n ** 16n) });
    const res = reqs.length ? await F.callBatch(reqs) : [];
    let k = 0;
    if (open) {
      S.cur = decodeRound(res[k++]);
      S.count = num(res[k++], 0);
    } else { S.cur = null; S.count = 0; S.players = []; }
    S.history = [];
    for (const id of recent) { const r = decodeRound(res[k++]); if (r) S.history.push(Object.assign({ id }, r)); }
    if (S.account) {
      S.claimable = big(res[k++], 0); S.refOwed = big(res[k++], 0); S.code = fromBytes32(w(res[k++], 0)); S.referrer = addr(res[k++], 0);
      S.balance = big(res[k++], 0); S.allowance = big(res[k++], 0);
      S.me = open ? decodePlayer(res[k++]) : null;
    }
    if (CFG.reinvest) { const q = res[k++]; S.ethPer = q && q.length >= 66 && big(q, 0) > 0n ? Number(10n ** 16n) / Number(big(q, 0)) : null; }
    // every player (players are in join order; the board is top-10 by deposit,
    // so a page cannot be skipped) and the last 12 deposits, in one batch
    if (open && S.cur && S.cur.playerCount > 0) {
      const PAGE = 200, MAX = 4000;
      const n = Math.min(S.cur.playerCount, MAX);
      const pages = [];
      for (let from = 1; from <= n; from += PAGE) pages.push({ to: P, data: SEL.players + word(S.curId) + word(from) + word(PAGE) });
      const from = Math.max(0, S.count - 12);
      pages.push({ to: P, data: SEL.deposits + word(S.curId) + word(from) + word(12) });
      const d = await F.callBatch(pages);
      S.players = [];
      for (let i = 0; i < pages.length - 1; i++) S.players.push(...decodePlayers(d[i]));
      S.feed = decodeDeposits(d[pages.length - 1]).reverse();
    } else { S.players = []; S.feed = []; }
    S.roundCount = roundCount;
    S.loaded = true;
  }

  /// the wallet's hired brokers not yet used this round
  async function loadBrokers() {
    S.brokers = [];
    if (!S.account) return;
    // before the first chip-in of a day there is no round yet: nothing is used, every hired broker counts
    const roundId = S.cur ? S.curId : 0;
    let ids = [];
    try { ids = await F.tokensOf(S.account); } catch (e) { return; }
    ids = ids.map((x) => BigInt(x));
    S.brokersOwned = ids.length;
    if (!ids.length) return;
    const reqs = [];
    for (const id of ids) { reqs.push({ to: CFG.nft, data: SEL.isActive + word(id) }); if (roundId) reqs.push({ to: CFG.pool, data: SEL.brokerUsed + word(roundId) + word(id) }); }
    const res = await F.callBatch(reqs);
    const eligible = [];
    const per = roundId ? 2 : 1;
    ids.forEach((id, i) => { if (toBig(res[i * per]) === 1n && (!roundId || toBig(res[i * per + 1]) === 0n)) eligible.push(id); });
    S.brokersEligible = eligible.length;
    // only as many as the multiplier can use: past the cap they cost gas for nothing
    S.brokers = eligible.slice(0, maxUseful());
  }
  const terms = () => S.cur || S.knobs || { minDeposit: 10000n * 10n ** 18n, divBps: 2500, refBps: 500, houseBps: 1000, boostBps: 1000, boostCapBps: 20000 };
  const maxUseful = () => { const t = terms(); return Math.max(0, Math.ceil((t.boostCapBps - 10000) / t.boostBps)); };

  // ---------------------------------------------------------------- wallet
  const WALLET_KEY = "firmbrokers.wallet.v1";
  async function connect(chosen) {
    const list = F.wallets();
    if (!F.hasChosen() || chosen) {
      let remembered = null;
      try { remembered = localStorage.getItem(WALLET_KEY); } catch (e) {}
      const saved = chosen || (remembered && list.find((x) => x.info.rdns === remembered));
      if (!saved && list.length > 1) { S.pickWallet = list; render(); toast("this browser has more than one wallet — pick the one to clock in with"); return; }
      const pick = saved || list[0];
      if (!pick) return toast("no wallet in this browser. Open this page in your wallet app", false);
      F.setProvider(pick.provider);
      try { localStorage.setItem(WALLET_KEY, pick.info.rdns); } catch (e) {}
      S.pickWallet = null;
    }
    const p = F.provider();
    const accounts = await p.request({ method: "eth_requestAccounts" });
    S.account = accounts[0];
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CFG.chainHex }] }); }
    catch (e) {
      if (e && e.code === 4902) await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: CFG.chainHex, chainName: CFG.chainName, rpcUrls: [CFG.rpcs[0]], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
    if (p.on) p.on("accountsChanged", (a) => { S.account = a[0] || null; S.me = null; refresh(); });
    await refresh();
  }

  async function tx(label, fn, after) {
    if (S.busy) return;
    S.busy = true;
    try {
      toast(label + "…");
      const hash = await fn();
      toast("sent, waiting for the block…");
      await F.waitForTx(hash);
      toast(label + ": done", true);
      if (after) await after();
    } catch (e) {
      toast(humanError(e), false);
    } finally { S.busy = false; }
    await refresh();
  }
  function humanError(e) {
    const m = String(e?.shortMessage || e?.message || e || "");
    if (/reject|denied|cancel/i.test(m)) return "cancelled in the wallet";
    // wallets surface revert DATA more often than error names: match both
    if (/BadAmount|0x749b5939/.test(m)) return "below the minimum for this round, or not a whole amount";
    if (/BadBroker|0xef6303e2/.test(m)) return "one of those brokers is not yours, not hired, or already counted today";
    if (/RoundNotClosed|0x29e3b953/.test(m)) return "the bell has not rung yet";
    if (/RoundNotOpen|0x402bc007/.test(m)) return "that round is already settled";
    if (/NotAPlayer|0xabca3517/.test(m)) return "chip in first, then clock in brokers";
    if (/CodeTaken|0x6af0cefe/.test(m)) return "that name is taken, or you already have one";
    if (/BadCode|0x6c4ae96c/.test(m)) return "3 to 20 lowercase letters or digits";
    if (/NothingToClaim|0x969bf728/.test(m)) return "nothing to claim";
    if (/TooEarly|0x085de625/.test(m)) return "too early";
    if (/BadBeacon|0x50264bfe|bad beacon/i.test(m)) return "that is not the round's beacon";
    if (/TransferFailed|0x90b8ec18/.test(m)) return "the token transfer failed";
    if (/insufficient/i.test(m)) return "not enough ETH for gas";
    return m.length > 160 ? m.slice(0, 160) + "…" : m || "something went wrong";
  }

  // ---------------------------------------------------------------- actions
  function refCode() {
    let c = "";
    try { c = new URL(location.href).searchParams.get("ref") || localStorage.getItem(REF_KEY) || ""; } catch (e) {}
    c = String(c).toLowerCase();
    return validCode(c) ? c : "";
  }
  async function chipIn(amountWei) {
    const P = CFG.pool;
    const brokers = S.useBrokers ? S.brokers : [];
    const typed = (host.querySelector("#op-ref") || {}).value;
    const code = S.referrer === ZERO ? (typed && validCode(String(typed).trim().toLowerCase()) ? String(typed).trim().toLowerCase() : (S.refOwner !== ZERO ? refCode() : "")) : "";
    // deposit(uint128 amount, uint256[] brokerIds, bytes32 refCode)
    let data = SEL.deposit + word(amountWei) + word(96) + (code ? bytes32(code) : word(0)) + word(brokers.length);
    for (const id of brokers) data += word(id);
    if (S.allowance < amountWei) {
      // two confirmations the first time: the allowance, then the chip-in. Say so,
      // and go straight on to the chip-in once the allowance has landed — the
      // allowance re-read after the block can lag a beat, and a silent stop here
      // read as "nothing happened" (the treasury's first chip-in, 2026-09-05).
      toast("first time: two confirmations — allow the pool to take $9TO5, then the chip-in");
      let landed = false;
      await tx("allowing the pool to take $9TO5", () => F.send(CFG.token, SEL.approve + word(P) + word((1n << 256n) - 1n), 0n, S.account), async () => { landed = true; });
      if (!landed) return; // rejected or failed: the toast said so
    }
    // an honest limit: deposit() has no internal try/catch, so the estimate is
    // real; +25% margin. The wallet quotes limit × max fee, so a fixed 600k
    // read as dollars for a charge of cents. Fallback to the measured ceiling
    // (the first chip-in of a day opens the round: 473k, + 45k per broker).
    const fallback = BigInt(600000 + 45000 * brokers.length);
    let limit = fallback;
    try {
      const est = await F.provider().request({ method: "eth_estimateGas", params: [{ from: S.account, to: P, data }] });
      const g = (BigInt(est) * 125n) / 100n;
      if (g > 150000n && g < fallback * 2n) limit = g;
    } catch (e) { /* the wallet could not estimate: the ceiling stands */ }
    await tx("chipping in", () => F.send(P, data, 0n, S.account, limit), async () => { toast("you're in — see you at the bell", true); });
  }
  async function claimDividends() {
    const ids = decodeUintArray((await F.callBatch([{ to: CFG.pool, data: SEL.roundsOf + word(S.account) }]))[0]);
    if (!ids.length) return;
    // only the rounds with something to claim, newest first, at most 20 per transaction
    const views = await F.callBatch(ids.map((id) => ({ to: CFG.pool, data: SEL.playerView + word(id) + word(S.account) })));
    const pick = ids.filter((id, i) => { const v = decodePlayer(views[i]); return v && v.divClaimable > 0n; }).reverse().slice(0, 20);
    if (!pick.length) return toast("nothing to claim yet", false);
    let data = SEL.claimDividends + word(32) + word(pick.length);
    for (const id of pick) data += word(id);
    await tx("claiming dividends", () => F.send(CFG.pool, data, 0n, S.account, BigInt(120000 + 60000 * pick.length)));
  }
  const claimReferral = () => tx("claiming referral rewards", () => F.send(CFG.pool, SEL.claimReferral, 0n, S.account, 120000n));
  async function setCode(code) {
    code = String(code || "").trim().toLowerCase();
    if (!validCode(code)) return toast("3 to 20 letters or digits, lowercase", false);
    const taken = (await F.callBatch([{ to: CFG.pool, data: SEL.codeOwner + "0x".slice(0, 0) + bytes32(code) }]))[0];
    if (taken && addr(taken, 0) !== ZERO) return toast("that name is taken", false);
    await tx("setting your link", () => F.send(CFG.pool, SEL.setCode + bytes32(code), 0n, S.account, 120000n));
  }
  /// the bell: the beacon from drand, straight into draw(). Anyone may.
  async function ringBell(id) {
    const r = decodeRound((await F.callBatch([{ to: CFG.pool, data: SEL.roundView + word(id) }]))[0]);
    if (!r) return;
    let sig = null;
    if (r.playerCount > 0) {
      const CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
      outer: for (const base of DRAND) {
        for (const path of [`/v2/beacons/quicknet/rounds/${r.beaconRound}`, `/${CHAIN}/public/${r.beaconRound}`]) {
          try {
            const res = await fetch(base + path, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const j = await res.json();
            if (Number(j.round) === r.beaconRound && /^[0-9a-f]{96}$/i.test(j.signature)) { sig = j.signature.toLowerCase(); break outer; }
          } catch (e) { /* next */ }
        }
      }
      if (!sig) return toast("the beacon is not out yet — try again in a moment", false);
    }
    const sigHex = sig || "";
    const data = SEL.draw + word(id) + word(64) + word(sigHex.length / 2) + (sigHex ? sigHex.padEnd(128, "0") : "");
    await tx("ringing the bell", () => F.send(CFG.pool, data, 0n, S.account, 900000n));
  }

  // ---------------------------------------------------------------- render
  let host = null, timer = null, ticker = null;
  function toast(msg, ok) {
    const t = document.getElementById("op-toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast on" + (ok === true ? " ok" : ok === false ? " bad" : "");
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = "toast"; }, ok === undefined ? 30000 : 6000);
  }
  /// the jackpot rolls up to its new value rather than jumping
  function countUp(el) {
    if (!el) return;
    const target = BigInt(el.dataset.pot || "0");
    const from = S.potShown && S.potShown < target ? S.potShown : target;
    S.potShown = target;
    const num = el.querySelector(".num");
    if (!num || from === target) return;
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = from + (target - from) * BigInt(Math.round(e * 1000)) / 1000n;
      num.textContent = fmt(v);
      if (k < 1 && num.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function drandUrl(round) { return `https://api.drand.sh/v2/beacons/quicknet/rounds/${round}`; }
  /// the post is the same anti-phishing shape as the application post: the site's
  /// own page, nothing else linked
  const pageLink = () => `${location.origin}/pool`; // the clean URL, whichever way the visitor arrived
  function xIntent(code) {
    const link = `${pageLink()}?ref=${code}`;
    const textOf = (CFG.poolPost || "i'm in the office pool at @thefirmbrokers. chip in $9TO5 before the closing bell: one gets their money back, one takes the pot.\n\n{link} \u00b7 $9TO5").replace("{link}", link);
    return "https://x.com/intent/post?text=" + encodeURIComponent(textOf);
  }
  function explorer(a) { return `${CFG.explorer}/address/${a}`; }

  function render() {
    if (!host) return;
    // never wipe what someone is typing: skip this paint; the next poll paints.
    // (Only text fields. And NEVER re-render on blur: the blur fires on the
    // mouse-down of the button being clicked, and a re-render before the
    // mouse-up replaces that button, so the click never happens — "the
    // buttons need two clicks", 2026-09-05.)
    const active = document.activeElement;
    if (active && host.contains(active) && active.tagName === "INPUT" && active.type === "text") return;
    const keep = { amt: (host.querySelector("#op-amt") || {}).value, code: (host.querySelector("#op-code") || {}).value, ref: (host.querySelector("#op-ref") || {}).value, brk: (host.querySelector("#op-brk") || {}).checked, refOpen: !!(host.querySelector("#op-refwhy") || {}).open };

    const r = S.cur;
    const now = Math.floor(Date.now() / 1000) - S.skew;
    const left = S.closesAt - now;
    const me = S.me;
    const T = terms();
    const ethStr = (units) => (S.ethPer ? `≈ ${(Number(units) / 1e18 * S.ethPer).toLocaleString("en-US", { maximumFractionDigits: 3 })} ETH` : "");
    const myW = me ? me.weight : 0n;
    const tot = r ? r.totalWeight : 0n;
    const odds = myW > 0n && tot > 0n ? (Number(tot) / Number(myW)).toLocaleString("en-US", { maximumFractionDigits: 1 }) : null;
    const mult = 10000 + T.boostBps * (me ? me.brokers : S.brokers.length);
    const cap = T.boostCapBps;
    const multX = (n) => { const x = Math.min(10000 + T.boostBps * n, cap) / 10000; return (Number.isInteger(x) ? x : x.toFixed(1)) + "×"; };
    const bellNY = S.closesAt ? nyTime(S.closesAt) : "4:00 PM";
    const youWon = (a) => same(a, S.account);
    const buyHref = CFG.token && CFG.buyUrl ? CFG.buyUrl + "token/" + CFG.token : null;
    const codeKnown = !!refCode() && S.refOwner !== ZERO;
    const sender = S.referrer !== ZERO ? short(S.referrer) : codeKnown ? esc(refCode()) : "";
    const badCode = refCode() && !codeKnown && S.loaded ? `<div class="fine">link code '${esc(refCode())}' is not registered · their 5% would go to the jackpot</div>` : "";

    // ---- the results banner: from the draw until the next bell
    const last = S.history.find((h) => h.state === 2 && h.playerCount > 0 && now < h.closesAt + 86400 + 600);
    let banner = "";
    if (last) {
      const who = (a) => (youWon(a) ? `<b class="won">YOU</b>` : `<b>${short(a)}</b>`);
      banner = `<div class="last">🔔 ${now - last.closesAt < 12 * 3600 ? "today" : "yesterday"}: ${last.jackpotWinner !== ZERO ? `jackpot ${fmt(last.jackpotPaid)} → ${who(last.jackpotWinner)} · ` : ""}money back ${fmt(last.refundPaid)} → ${who(last.refundWinner)}`;
      if (S.account) {
        const mine = [];
        if (youWon(last.jackpotWinner)) mine.push(`<b class="won">YOU took the jackpot: ${fmt(last.jackpotPaid)} $9TO5</b>`);
        if (youWon(last.refundWinner)) mine.push(`<b class="won">YOU got your money back: ${fmt(last.refundPaid)} $9TO5</b>`);
        if (S.claimable > 0n) mine.push(`you have ${fmt(S.claimable)} in dividends to claim → <button class="chip" data-act="claimdiv" type="button">CLAIM</button>`);
        if (mine.length) banner += `<div class="mine">${mine.join(" · ")}</div>`;
      }
      banner += `</div>`;
    }

    const tickerItems = [];
    if (r) tickerItems.push(`<span class="up">TODAY'S JACKPOT ${fmt(r.pot)} $9TO5</span> · closes ${bellNY} NY`);
    for (const h of S.history.filter((x) => x.state === 2 && x.playerCount > 0).slice(0, 6)) {
      tickerItems.push(h.jackpotWinner !== ZERO ? `${nyTime(h.closesAt, true)} · jackpot <span class="up">${fmt(h.jackpotPaid)}</span> → ${short(h.jackpotWinner)}` : `${nyTime(h.closesAt, true)} · money back ${fmt(h.refundPaid)} → ${short(h.refundWinner)}`);
    }
    // the tape earns its place once there is history to roll; before the first
    // draw it would only repeat the hero above it
    const tape = tickerItems.join(" &nbsp;&nbsp;·&nbsp;&nbsp; ") + " &nbsp;&nbsp;·&nbsp;&nbsp; ";
    // two identical halves sliding exactly one half: seamless, full from the first frame
    const half = tape.repeat(Math.max(2, Math.ceil(2400 / Math.max(80, tape.replace(/<[^>]+>/g, "").length * 11))));
    const ticker = tickerItems.length > 1 ? `<div class="op-ticker"><div class="tape">${half}${half}</div></div>` : "";
    const board = `<div class="cab board"><div class="scr">${banner}<div class="hero">
      <div class="lab">${r ? "TODAY'S JACKPOT" : "THE JACKPOT"}</div>
      <div class="pot${left > 0 && left <= 600 ? " hot2" : left > 0 && left <= 3600 ? " hot1" : ""}" data-pot="${r ? r.pot.toString() : "0"}"><span class="num">${r ? fmt(S.potShown && S.potShown < r.pot ? S.potShown : r.pot) : "—"}</span>${r ? ` <span class="unit">$9TO5</span>` : ""}</div>
      <div class="one">chip in $9TO5 before the ${bellNY} <span class="long">New York</span><span class="short">NY</span> bell · one takes the jackpot, one gets their money back<span class="long"> · ${T.divBps / 100}% of every chip-in is paid out to everyone already in</span></div>
      <div class="fine">${r ? [`${r.playerCount} player${r.playerCount === 1 ? "" : "s"}`, `${fmt(r.deposits)}&nbsp;in`, r.seed > 0n ? `${fmt(r.seed)} seeded` : "", ethStr(r.pot)].filter(Boolean).join(" · ") : (S.loaded ? "nobody has chipped in yet today — the first one opens the pool" : "reading the chain…")}</div></div>
      <div class="row">
        <div><div class="lab">${left > 0 ? "CLOSES IN" : "CLOSED"}</div><div class="cd${left > 0 && left <= HOT_WINDOW ? " hot" : ""}">${countdown(left)}</div><div class="fine">${S.closesAt ? `<span class="long">${nyTime(S.closesAt, true)} NY${localTime(S.closesAt)} · draw 5 min after the bell</span><span class="short">${nyTime(S.closesAt)} NY${localTime(S.closesAt, true)} · draw +5 min</span>` : ""}</div></div>
        ${me && me.deposited > 0n ? `<div><div class="lab">YOU TODAY</div><div class="hi">${fmt(me.deposited)} $9TO5</div><div class="fine">${me.brokers} broker${me.brokers === 1 ? "" : "s"} counted · ${multX(me.brokers)}</div></div>
        <div><div class="lab">YOUR CHANCE AT THE JACKPOT</div><div class="hi">${odds ? "1 in " + odds : "—"}</div><div class="fine">${me.divEarned > 0n ? "earned " + fmt(me.divEarned) + " in dividends today" : ""}</div></div>` : ""}
      </div></div></div>`;

    // ---- the bell, for a closed pool nobody has drawn
    let bell = "";
    if (S.due.length) {
      const d = S.history.find((h) => h.id === S.due[0]);
      const when = d ? nyTime(d.closesAt, true) : "round " + S.due[0];
      bell = `<div class="cab"><div class="scr"><div class="lab">THE BELL</div><div>${d && now - d.closesAt < 86400 ? "yesterday's" : "a"} pool (${when}) is waiting for its draw.</div>
      <button class="go" data-act="bell" data-id="${S.due[0]}" ${S.account ? "" : "disabled"} style="margin-top:8px">RING THE BELL</button>
      <div class="fine">fetches the beacon and hands it to the contract · anyone may${S.account ? "" : " · connect a wallet first"}</div></div></div>`;
    }

    // ---- the desk
    const poor = S.account && S.balance < T.minDeposit;
    const firstTime = S.account && S.allowance < T.minDeposit;
    let deskBody;
    if (!S.account) {
      deskBody = S.pickWallet
        ? `<div class="lab">WHICH WALLET?</div>${S.pickWallet.map((x, i) => `<button class="go" data-act="wallet" data-i="${i}" type="button">CLOCK IN WITH ${esc(x.info.name).toUpperCase()}</button>`).join("")}<div class="fine">this browser has more than one wallet</div>`
        : `<button class="go" data-act="connect">CLOCK IN</button><div class="fine">connect a wallet on Robinhood Chain to chip in, claim, or ring the bell${sender ? ` · sent by <b>${sender}</b>` : ""}</div>${badCode}`;
    } else {
      const brokerLine = S.brokers.length
        ? `<label class="tog"><input type="checkbox" id="op-brk" ${S.useBrokers ? "checked" : ""}> count my ${S.brokersEligible > S.brokers.length ? `${S.brokers.length} of ${S.brokersEligible}` : S.brokers.length} hired broker${S.brokers.length === 1 ? "" : "s"} <span class="dim">(${multX(S.brokers.length)})</span></label>
           <div class="fine">each hired broker you count adds ${T.boostBps / 100}% to your chance today, up to ${cap / 10000}× (${maxUseful()} brokers)${S.brokersEligible > maxUseful() ? `; you have ${S.brokersEligible}, so ${maxUseful()} are counted` : ""}. Counting only tells the pool: your brokers stay in your wallet and keep earning. A broker counts once a day.</div>`
        : S.brokersOwned && !S.brokersEligible ? `<div class="fine">your brokers are not hired, or already counted today</div>`
        : `<div class="fine">no hired brokers to count · hiring one boosts your chance ${T.boostBps / 100}%</div>`;
      deskBody = `
      ${me && me.deposited > 0n ? `<div class="hi">you're in with ${fmt(me.deposited)} · ${multX(me.brokers)} · ${odds ? "1 in " + odds : "—"}</div>` : ""}
      ${poor ? `<div class="need">you need at least ${fmt(T.minDeposit)} $9TO5 to chip in${buyHref ? ` · <a href="${buyHref}" target="_blank" rel="noopener">get it on letscash →</a>` : ""}</div>` : ""}
      <div class="amt"><input type="text" inputmode="decimal" id="op-amt" placeholder="${fmt(T.minDeposit) + " min"}"></div>
      <div class="presets"><button class="chip" data-act="min" type="button">MIN</button>${[25000, 50000, 100000, 250000].map((n) => `<button class="chip" data-act="preset" data-n="${n}" type="button">${n / 1e3}k</button>`).join("")}<button class="chip" data-act="max" type="button">MAX</button></div>
      ${brokerLine}
      <button class="go" data-act="chip" ${left > 0 && !poor ? "" : "disabled"}>${left > 0 ? (me && me.deposited > 0n ? "CHIP IN MORE" : "CHIP IN") : "CLOSED — NEXT POOL AT THE BELL"}</button>
      ${firstTime && !poor ? `<div class="fine">two wallet prompts the first time: 1) allow $9TO5 · 2) chip in</div>` : ""}
      <div class="fine">balance ${fmt(S.balance)} $9TO5 · ${short(S.account)}${sender ? " · sent by <b>" + sender + "</b>" : ""}</div>${badCode}
      <div class="echo" id="op-echo"></div>
      <div class="lab" style="margin-top:6px">YOURS TO CLAIM</div>
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span>dividends <b>${fmt(S.claimable)}</b></span><button class="chip" data-act="claimdiv" ${S.claimable > 0n ? "" : "disabled"}>CLAIM</button>
        ${S.refOwed > 0n ? `<span>referrals <b>${fmt(S.refOwed)}</b></span><button class="chip" data-act="claimref">CLAIM</button>` : ""}
        ${S.claimable > 0n && S.refOwed > 0n ? `<button class="chip" data-act="claimall">CLAIM ALL</button>` : ""}
      </div>
      ${S.referrer === ZERO && !codeKnown && !(me && me.deposited > 0n) ? `<div class="amt" style="margin-top:8px"><span class="dim" style="align-self:center;white-space:nowrap">sent by:</span><input type="text" id="op-ref" placeholder="name · optional" value="" autocapitalize="off" spellcheck="false"></div>
      <details id="op-refwhy" ${keep.refOpen ? "open" : ""}><summary class="fine">what is this?</summary><div class="fine">if a player sent you, their name goes here (filled in when you arrive through their link). Fixed on your first chip-in; it pays them 5% of your chip-ins, never out of your share.</div></details>` : ""}`;
    }
    const desk = `<div class="cab"><div class="scr"><div class="lab">CHIP IN</div><div class="desk">${deskBody}</div></div></div>`;

    const ref = S.account ? `<div class="cab ref"><div class="scr"><div class="lab">YOUR LINK</div>
      ${S.code ? `<div class="link"><code>${esc(pageLink())}?ref=${esc(S.code)}</code><button class="chip" data-act="copy">COPY</button></div>
      ${window.__POOL_CARD ? `<button class="go" data-act="card" style="margin-top:8px">MAKE MY CARD · POST ON X</button>` : `<a class="chip" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:8px" href="${xIntent(S.code)}" target="_blank" rel="noopener">POST ON X</a>`}
      <div class="fine">5% of every chip-in from anyone who arrives through it, for life · never out of their share</div>`
      : `<div class="fine">pick a name once, then share your link or the name. Whoever arrives through it has you as their sender from their first chip-in on: 5% of every chip-in they ever make comes to you, claimable any time.</div><div class="set"><input type="text" id="op-code" maxlength="20" placeholder="yourname" autocapitalize="off" spellcheck="false"><button class="chip" data-act="setcode">SET</button></div>`}
    </div></div>` : "";

    const ranked = S.players.slice().sort((a, b) => (b.v.deposited > a.v.deposited ? 1 : -1)).slice(0, 10);
    const lead = `<div class="cab floor"><div class="scr"><div class="lab">TODAY'S BOARD</div>
      <div class="grid3 head"><span>player<span class="long"> · brokers counted</span></span><span>chipped in<span class="long"> · earned in dividends</span></span></div>
      <div class="list">${ranked.length ? ranked.map((p, i) =>
        `<div class="grid3${same(p.addr, S.account) ? " me" : ""}"><span class="who">${i + 1}. ${same(p.addr, S.account) ? "<b class='won'>YOU</b>" : `<a href="${explorer(p.addr)}" rel="noopener">${short(p.addr)}</a>`}${p.v.brokers ? ` <span class="dim brk" title="${p.v.brokers} brokers counted · ${multX(p.v.brokers)}">+${p.v.brokers} · ${multX(p.v.brokers)}</span>` : ""}</span><span class="n">${fmt(p.v.deposited)}<span class="dim sub"><span class="dot"> · </span>earned ${fmt(p.v.divEarned)}</span></span></div>`).join("")
        : `<div class="dim">${S.loaded ? "nobody yet" : "loading…"}</div>`}</div>
      <div class="lab" style="margin-top:14px">JUST NOW</div>
      <div class="list">${S.feed.length ? S.feed.map((d, i) => `<div class="r${same(d.player, S.account) ? " me" : ""}${S.seenDeposits && S.count - i > S.seenDeposits ? " new" : ""}"><span class="who">${same(d.player, S.account) ? "you" : short(d.player)} chipped in</span><span class="n">${fmt(d.amount)} <span class="dim">${ago(d.at)} ago</span></span></div>`).join("") : `<div class="dim">${S.loaded ? "quiet so far" : "loading…"}</div>`}</div></div></div>`;
    const feed = "";

    const hist = `<div class="cab hist"><div class="scr"><div class="lab">PAST POOLS</div>
      <div class="list">${S.history.length ? S.history.map((h) => {
        const st = h.state === 2 ? (h.playerCount === 0 ? "nobody came · carried" : "") : h.state === 3 ? "abandoned · refunds open" : "waiting for its draw";
        const name = (a) => (youWon(a) ? `<b class="won">YOU</b>` : `<a href="${explorer(a)}" rel="noopener">${short(a)}</a>`);
        const drawn = h.state === 2 && h.playerCount > 0;
        return `<div class="r${youWon(h.refundWinner) || youWon(h.jackpotWinner) ? " me" : ""}"><div class="line"><b>${nyTime(h.closesAt, true)}<span class="dim"> · ${h.playerCount} players</span></b>${drawn ? (h.jackpotWinner !== ZERO ? `<span>jackpot <b>${fmt(h.jackpotPaid)}</b> → ${name(h.jackpotWinner)}</span>` : `<span class="dim">the refund was the whole jackpot</span>`) : `<span>${fmt(h.pot)} $9TO5</span>`}${st ? `<span class="dim">${st}</span>` : ""}</div>
          ${drawn ? `<div class="line"><span>money back ${fmt(h.refundPaid)} → ${name(h.refundWinner)}</span><a class="dim" href="${drandUrl(h.beaconRound)}" rel="noopener">beacon ${h.beaconRound} ↗</a></div>` : ""}</div>`;
      }).join("") : `<div class="dim">${S.loaded ? "none yet" : "loading…"}</div>`}</div></div></div>`;

    const rules = `<div class="cab rules"><div class="lab">HOUSE RULES</div>
      <p><b>1.</b> Chip in $9TO5 before the ${bellNY} New York bell. <b>${T.divBps / 100}%</b> of every chip-in is paid out on the spot to everyone already in that day; <b>${T.refBps / 100}%</b> goes to whoever sent you.</p>
      <p><b>2.</b> Five minutes after the bell, drand's public beacon picks two players: one takes the jackpot, one gets their money back. Your chance is your chip-ins, up to <b>${cap / 10000}×</b> with hired brokers counted. A chip-in is final.</p>
      <p><b>3.</b> The contract checks the beacon itself; nobody at the firm can pick or delay it. Fine print: the <a href="/docs#pool">handbook</a>.</p></div>`;

    // the bell panel (a missed draw, rare) goes after the desk: on a phone it was pushing CHIP IN below the first screen
    host.innerHTML = ticker + board + `<div class="cols"><div>${desk}${ref}</div><div>${lead}${feed}</div></div>` + bell + hist + rules;
    countUp(host.querySelector(".board .pot"));
    S.seenDeposits = S.count;
    const a = host.querySelector("#op-amt"), c = host.querySelector("#op-code"), b = host.querySelector("#op-brk"), rf = host.querySelector("#op-ref");
    if (a && keep.amt) a.value = keep.amt;
    if (c && keep.code) c.value = keep.code;
    if (rf && keep.ref != null) rf.value = keep.ref;
    if (b && keep.brk != null) b.checked = keep.brk;
  }

  // ---------------------------------------------------------------- wiring
  async function refresh() {
    try {
      await load();
      if (S.account) await loadBrokers();
    } catch (e) { console.warn("office pool: read failed, will retry: " + (e && e.stack || e)); }
    render();
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    const left = S.closesAt - (Math.floor(Date.now() / 1000) - S.skew);
    timer = setTimeout(refresh, left > 0 && left <= HOT_WINDOW ? POLL_HOT : POLL_IDLE);
  }
  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const amt = () => document.getElementById("op-amt");
    if (act === "connect") { toast("opening your wallet…"); return connect().catch((err) => toast(humanError(err), false)); }
    if (act === "min") { if (amt()) amt().value = fmt(terms().minDeposit, 0); return; }
    if (act === "max") { if (amt()) amt().value = fmt(S.balance, 0); return; }
    if (act === "preset") { if (amt()) amt().value = Number(b.dataset.n).toLocaleString("en-US"); return; }
    if (act === "wallet") { const w = S.pickWallet && S.pickWallet[Number(b.dataset.i)]; if (w) connect(w).catch((err) => toast(humanError(err), false)); return; }
    if (act === "chip") {
      if (S.closesAt && Math.floor(Date.now() / 1000) - S.skew >= S.closesAt) { refresh(); return toast("closed — the next pool opens at the bell", false); }
      const v = parseAmount(amt() && amt().value);
      if (v == null) return toast("type an amount of $9TO5, like 25,000 or 25k", false);
      if (v < terms().minDeposit) return toast(`the minimum today is ${fmt(terms().minDeposit)} $9TO5`, false);
      if (v > S.balance) return toast("that is more than you have", false);
      const brk = document.getElementById("op-brk"); S.useBrokers = !brk || brk.checked;
      return chipIn(v);
    }
    if (act === "claimdiv") return claimDividends();
    if (act === "claimref") return claimReferral();
    if (act === "claimall") return (async () => { await claimDividends(); await claimReferral(); })();
    if (act === "setcode") { const i = document.getElementById("op-code"); return setCode(i && i.value); }
    if (act === "card") {
      const r = S.cur;
      const link = `${pageLink()}?ref=${S.code}`;
      const jackpot = r ? fmt(r.pot) : "today's";
      const postText = (CFG.poolPost || "i'm in today's office pool at @thefirmbrokers: {jackpot} $9TO5 jackpot, one takes it, one gets their money back. chip in before the closing bell.\n\n{link} \u00b7 $9TO5").replace("{jackpot}", jackpot).replace("{link}", link);
      window.__POOL_CARD.open({ code: S.code, link, jackpot, bell: S.closesAt ? nyTime(S.closesAt) : "4:00 PM", postText });
      return;
    }
    if (act === "copy") { const c = host.querySelector(".ref code"); if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => toast("copied", true)); return; }
    if (act === "bell") return ringBell(Number(b.dataset.id));
  }

  function page(mount) {
    host = mount;
    if (!CFG.pool) {
      host.innerHTML = `<div class="cab"><div class="scr"><div class="lab">THE OFFICE POOL</div><div>has not opened yet. When it does, this page is where it happens.</div></div></div>`;
      return;
    }
    // remember who sent you, for your first chip-in
    try { const c = new URL(location.href).searchParams.get("ref"); if (c && validCode(c.toLowerCase())) localStorage.setItem(REF_KEY, c.toLowerCase()); } catch (e) {}
    host.addEventListener("click", onClick);
    render();
    refresh();
    clearInterval(ticker);
    ticker = setInterval(() => { const cd = host.querySelector(".board .cd"); if (cd && S.closesAt) { const left = S.closesAt - (Math.floor(Date.now() / 1000) - S.skew); cd.textContent = countdown(left); cd.classList.toggle("hot", left > 0 && left <= HOT_WINDOW); } }, 1000);
  }

  window.__POOL = { page, decodeRound, decodePlayer, decodePlayers, decodeDeposits, parseAmount, fmt, bytes32, fromBytes32 };
})();
