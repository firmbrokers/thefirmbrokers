/* ===========================================================================
   THE MORNING CALL — one stock a trading day. Before the opening bell a hired
   broker calls it UP or DOWN by the close, staking $9TO5; at the 4 PM New York
   bell Chainlink's Robinhood feed decides, proved on-chain from the feed's own
   rounds. Wrong callers pay right callers, pari-mutuel.

   Registers window.__CALL = { page } and is mounted by call.html (and, later,
   by the street: level.js calls it guarded, like auction.js). Reads go through
   F.callBatch, writes through F.send / F.runCalls; everything the page needs is
   a view on the contract or on the feed itself — no indexer, no worker. The one
   log read is the streak board (Called, filtered by nothing, cached forward).

   Inert until config.js names the contract (CFG.call): the page then says the
   desk has not opened and does nothing else. The contract address is NEVER
   taken from the URL (anti-phishing rule, same as the token and the mint).
   =========================================================================== */
(function () {
  "use strict";
  const F = window.Firm;
  if (!F) return;
  const CFG = F.CFG;
  const { word, toBig } = F;

  const SEL = {
    call: "0x64a252f4", sponsor: "0x1375f191", settle: "0x255d823f", claim: "0x50618519", claimAll: "0x7b305ab6", poke: "0x32145f90", openNext: "0xf23fb1d7",
    roundView: "0xb7a0b212", roundCount: "0x127f0b3f", currentRound: "0x8a19c8bc", preview: "0xafb739ce", nextTradingDay: "0x0ab0c530",
    codeOf: "0x2cfc2716", // OfficePool.codeOf(address): the wallet's link code, shared with the pool page
    callView: "0x69c354d3", callsOf: "0x9731bf5f", claimable: "0x2d25091b", odds: "0xfb93e737", maxStake: "0xfc6216a6", record: "0x2c16cd8a", records: "0x9cc8525d",
    recentRounds: "0xf36ea453", dueForSettle: "0xc4ed128f", knobs: "0x48fe7e53", feedOf: "0x6bdb90a9",
    latestRoundData: "0xfeaf968c", getRoundData: "0x9a6fc8f5", decimals: "0x313ce567",
    isActive: "0x82afd23b", weightOf: "0x0767d178", ownerOf: "0x6352211e",
    allowance: "0xdd62ed3e", balanceOf: "0x70a08231", approve: "0x095ea7b3",
  };
  const OPEN = 1, SETTLED = 2, PUSHED = 3, VOIDED = 4;
  const BPS = 10000n;
  const ZERO = "0x0000000000000000000000000000000000000000";
  const TOPIC_CALLED = "0xc4645f3890a828ac0af05e6ad189b3bec7ef96fadb4435c16eda41c3c975a926"; // Called(uint32,uint256,address,bool,uint128)
  const BOARD_KEY = "firmbrokers.call.board.v1"; // the streak board's scan cache
  const WALLET_KEY = "firmbrokers.wallet.v1";
  const POLL_IDLE = 20000, POLL_HOT = 4000, HOT_WINDOW = 600;
  const TAPE_N = 12, SCAN_N = 40; // rounds on the tape · rounds scanned for your unclaimed calls
  const PINS = [[10, "LEGEND OF THE FLOOR"], [5, "ORACLE"], [3, "HOT HAND"]];

  // ---------------------------------------------------------------- helpers
  const w = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const big = (hex, i) => BigInt("0x" + w(hex, i));
  const sbig = (hex, i) => { const v = big(hex, i); return v >= 1n << 255n ? v - (1n << 256n) : v; };
  const num = (hex, i) => Number(big(hex, i));
  const addr = (hex, i) => "0x" + w(hex, i).slice(24);
  const okHex = (hex, words) => !!hex && hex.length >= 2 + 64 * words;
  const short = (a) => (a && a !== ZERO ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  // ---- the link (SHARE cab): the office pool's code registry, read here and
  // never written here — a name is picked once on the pool page. A visitor who
  // arrives through /call?ref=<code> is remembered under the pool page's own
  // key, so their first chip-in at the office pool credits the sender there.
  const REF_KEY = "firmbrokers.pool.ref.v1";
  const validCode = (s) => /^[a-z0-9]{3,20}$/.test(s);
  const fromBytes32 = (hex) => { let s = ""; const h = String(hex || "").replace(/^0x/, "").slice(0, 64); for (let i = 0; i < 64; i += 2) { const c = parseInt(h.slice(i, i + 2), 16); if (!c) break; s += String.fromCharCode(c); } return validCode(s) ? s : ""; };
  const pageLink = () => `${CFG.shareOrigin || location.origin}/call`; // the clean URL on the domain we want shared
  const refLink = (code) => `${pageLink()}?ref=${code}`;
  const poolLink = "/pool#link"; // where a name is picked (the office pool's GET MY LINK box)
  /// the post: the caller's own call when they made one, the day's call otherwise
  function postText(cur, mine, code) {
    const sym = cur ? "$" + cur.symbol : "$9TO5";
    const when = cur ? `${nyWeekday(cur.lockAt).toLowerCase()}'s call` : "the call";
    const lead = mine ? `i called ${mine.up ? "UP" : "DOWN"} on ${sym} at the morning call (@thefirmbrokers)` : `${when} is ${sym} at the morning call (@thefirmbrokers)`;
    return `${lead}: UP or DOWN before 9:30 NY, settled at the 4 PM bell on chainlink's feed.\n\n${refLink(code)} · code ${code}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  /// bytes8 symbol: left-aligned in its word
  const sym = (hex, i) => { let s = ""; const h = w(hex, i).slice(0, 16); for (let k = 0; k < 16; k += 2) { const c = parseInt(h.slice(k, k + 2), 16); if (!c) break; s += String.fromCharCode(c); } return s; };
  const bytes8 = (s) => { let h = ""; for (const ch of s) h += ch.charCodeAt(0).toString(16).padStart(2, "0"); return h.padEnd(64, "0"); };
  /// 1,234,567 → "1.23M", 12,345 → "12.3k", never scientific
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
    try { return (BigInt(i) * 10n ** 18n + BigInt(frac)) * mul; } catch (e) { return null; }
  }
  /// a feed price (8 decimals on the Robinhood feeds) → "$230.24"
  const px = (answer, dec) => { if (answer == null) return "—"; const d = dec == null ? 8 : dec; const n = Number(answer) / 10 ** d; return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const pct = (open, close) => { if (!open || close == null) return ""; const p = (Number(close - open) / Number(open)) * 100; return (p >= 0 ? "+" : "") + p.toFixed(2) + "%"; };
  const times = (paysBps) => (paysBps ? (Number(paysBps) / 10000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "×" : "—");
  const NY = { timeZone: "America/New_York" };
  const nyTime = (ts, withDate) => new Date(ts * 1000).toLocaleString("en-US", Object.assign({}, NY, { hour: "numeric", minute: "2-digit" }, withDate ? { month: "short", day: "numeric" } : {}));
  const nyClock = (ts) => new Date(ts * 1000).toLocaleString("en-US", Object.assign({}, NY, { hour: "numeric", minute: "2-digit", second: "2-digit" }));
  const nyDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", Object.assign({}, NY, { weekday: "short", month: "short", day: "numeric" }));
  const nyDay = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", Object.assign({}, NY, { year: "numeric", month: "2-digit", day: "2-digit" }));
  const nyWeekday = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", Object.assign({}, NY, { weekday: "long" })).toUpperCase();
  /// " · 21:00 your time" when the viewer is not on New York time
  const localTime = (ts, brief) => { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (!tz || tz === "America/New_York") return ""; return " · " + new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (brief ? " yours" : " your time"); } catch (e) { return ""; } };
  const countdown = (left) => { if (left <= 0) return "0:00"; const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60; return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const pinFor = (streak) => { for (const [n, name] of PINS) if (streak >= n) return name; return ""; };

  // ---------------------------------------------------------------- decoders
  /// Round: 17 statics + Knobs(5) = 22 flat words
  function decodeRound(hex, o = 0) {
    if (!okHex(hex, o + 22)) return null;
    return {
      symbol: sym(hex, o), feed: addr(hex, o + 1), lockAt: num(hex, o + 2), bellAt: num(hex, o + 3), state: num(hex, o + 4),
      decided: num(hex, o + 5) === 1, up: num(hex, o + 6) === 1, calls: num(hex, o + 7),
      upStake: big(hex, o + 8), downStake: big(hex, o + 9), sponsored: big(hex, o + 10), winPool: big(hex, o + 11), rake: big(hex, o + 12),
      open: sbig(hex, o + 13), close: sbig(hex, o + 14), openRound: big(hex, o + 15), closeRound: big(hex, o + 16),
      minStake: big(hex, o + 17), stakePerWeight: big(hex, o + 18), rakeBps: num(hex, o + 19), burnShareBps: num(hex, o + 20), deadbandBps: num(hex, o + 21),
    };
  }
  /// currentRound(): (uint32 day, bool exists, bytes8 symbol, uint64 lockAt, uint64 bellAt, Round r)
  function decodeCurrent(hex) {
    if (!okHex(hex, 27)) return null;
    return { day: num(hex, 0), exists: num(hex, 1) === 1, symbol: sym(hex, 2), lockAt: num(hex, 3), bellAt: num(hex, 4), r: decodeRound(hex, 5) };
  }
  const decodeCall = (hex, o = 0) => (okHex(hex, o + 4) ? { caller: addr(hex, o), stake: big(hex, o + 1), up: num(hex, o + 2) === 1, claimed: num(hex, o + 3) === 1 } : null);
  /// callsOf(): (uint256[] tokenIds, Call[] list)
  function decodeCallsOf(hex) {
    if (!okHex(hex, 2)) return [];
    const oa = num(hex, 0) / 32, ov = num(hex, 1) / 32;
    const n = num(hex, oa);
    const out = [];
    for (let i = 0; i < n; i++) out.push(Object.assign({ tokenId: big(hex, oa + 1 + i) }, decodeCall(hex, ov + 1 + i * 4)));
    return out;
  }
  const decodeRecord = (hex, o = 0) => (okHex(hex, o + 6) ? { streak: num(hex, o), best: num(hex, o + 1), wins: num(hex, o + 2), played: num(hex, o + 3), q0: num(hex, o + 4), q1: num(hex, o + 5) } : null);
  function decodeUintArray(hex) {
    if (!okHex(hex, 2)) return [];
    const off = num(hex, 0) / 32, n = num(hex, off);
    const out = [];
    for (let i = 0; i < n; i++) out.push(big(hex, off + 1 + i));
    return out;
  }
  /// a feed round: (roundId, answer, startedAt, updatedAt, answeredInRound); updatedAt 0 = absent
  function decodeFeedRound(hex) {
    if (!okHex(hex, 5)) return null;
    const at = num(hex, 3);
    if (!at) return null;
    return { rid: big(hex, 0), answer: sbig(hex, 1), at };
  }
  const decodePreview = (hex) => (okHex(hex, 3) ? { symbol: sym(hex, 0), lockAt: num(hex, 1), bellAt: num(hex, 2) } : null);

  // ---------------------------------------------------------------- state
  const S = {
    account: null, skew: 0, loaded: false, busy: false,
    cur: null, // the round taking calls: { day, exists, symbol, lockAt, bellAt, r }
    next: null, // the trading day after it: { day, symbol, lockAt, bellAt }
    odds: { up: 0n, down: 0n }, knobs: null, roundCount: 0,
    history: [], // recent rounds, newest first, each { day, ...Round }
    due: [], // days past their bell, unsettled
    live: null, // today's stock between the lock and the bell: the history round, plus the walk
    feed: null, // { addr, dec, latest: {rid, answer, at} }
    dec: {}, walks: {}, // feed decimals by address · walks by day
    balance: 0n, allowance: 0n,
    brokers: [], brokersOwned: 0, // [{ id, weight, max, active, call, record }]
    myCalls: {}, // day → callsOf(day, me)
    code: "", // the wallet's link code from the office pool's registry ("" = none picked yet)
    claimDays: [], claimTotal: 0n, // finished days with something of mine to collect
    side: null, sel: new Set(), selTouched: false,
    board: null, boardFor: -1, // the streak board: { ids, rows }, and the settle count it was built for
    pickWallet: null,
  };
  const CALL = () => CFG.call;
  const terms = () => (S.cur && S.cur.exists ? S.cur.r : S.knobs) || { minStake: 10000n * 10n ** 18n, stakePerWeight: 500n * 10n ** 18n, rakeBps: 1000, burnShareBps: 5000, deadbandBps: 5 };
  const now = () => Math.floor(Date.now() / 1000) - S.skew;
  const finished = (r) => r && (r.state === SETTLED || r.state === PUSHED || r.state === VOIDED);
  const pot = (r) => r.upStake + r.downStake + r.sponsored;
  /// what a call collects on a finished round (mirrors the contract's _payout)
  function payout(r, c) {
    if (r.state !== SETTLED) return c.stake;
    if (c.up !== r.up) return 0n;
    const winning = r.up ? r.upStake : r.downStake;
    return c.stake + (c.stake * r.winPool) / winning;
  }
  /// what the winning side paid, per unit staked
  const paid = (r) => { const winning = r.up ? r.upStake : r.downStake; return winning > 0n ? BPS + (r.winPool * BPS) / winning : 0n; };

  // ---------------------------------------------------------------- chain
  /// the chain's own clock, so a phone that is minutes off still counts down to the real lock
  async function chainNow() {
    try {
      const res = await fetch(CFG.rpcs[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }), signal: AbortSignal.timeout(8000) });
      const j = await res.json();
      const ts = j && j.result && Number(BigInt(j.result.timestamp));
      if (ts) S.skew = Math.floor(Date.now() / 1000) - ts;
    } catch (e) { /* the device clock, then */ }
  }
  async function load() {
    const P = CALL();
    await chainNow();
    const head = await F.callBatch([
      { to: P, data: SEL.currentRound }, { to: P, data: SEL.roundCount }, { to: P, data: SEL.dueForSettle },
      { to: P, data: SEL.recentRounds + word(SCAN_N) }, { to: P, data: SEL.knobs },
    ]);
    const cur = decodeCurrent(head[0]);
    if (!cur) throw new Error("currentRound did not decode");
    S.cur = cur;
    S.roundCount = num(head[1], 0);
    S.due = decodeUintArray(head[2]).map(Number);
    const recent = decodeUintArray(head[3]).map(Number).filter((d) => d !== cur.day);
    if (okHex(head[4], 5)) S.knobs = { minStake: big(head[4], 0), stakePerWeight: big(head[4], 1), rakeBps: num(head[4], 2), burnShareBps: num(head[4], 3), deadbandBps: num(head[4], 4) };

    const reqs = [{ to: P, data: SEL.nextTradingDay + word(cur.day) }];
    if (cur.exists) reqs.push({ to: P, data: SEL.odds + word(cur.day) });
    else reqs.push({ to: P, data: SEL.feedOf + bytes8(cur.symbol) });
    for (const d of recent) reqs.push({ to: P, data: SEL.roundView + word(d) });
    if (S.account) {
      reqs.push({ to: CFG.token, data: SEL.balanceOf + word(S.account) });
      reqs.push({ to: CFG.token, data: SEL.allowance + word(S.account) + word(P) });
      reqs.push({ to: P, data: SEL.callsOf + word(cur.day) + word(S.account) });
      for (const d of recent) reqs.push({ to: P, data: SEL.callsOf + word(d) + word(S.account) });
      // the wallet's link code lives in the office pool's registry (one code, every page)
      if (CFG.pool) reqs.push({ to: CFG.pool, data: SEL.codeOf + word(S.account) });
    }
    const res = await F.callBatch(reqs);
    let k = 0;
    const nextDay = num(res[k++], 0);
    let feedAddr = null;
    if (cur.exists) { const o = res[k++]; S.odds = okHex(o, 2) ? { up: big(o, 0), down: big(o, 1) } : { up: 0n, down: 0n }; feedAddr = cur.r.feed; }
    else { S.odds = { up: 0n, down: 0n }; const f = res[k++]; feedAddr = okHex(f, 1) ? addr(f, 0) : null; }
    S.history = [];
    for (const d of recent) { const r = decodeRound(res[k++]); if (r) S.history.push(Object.assign({ day: d }, r)); }
    S.myCalls = {};
    if (S.account) {
      S.balance = okHex(res[k], 1) ? big(res[k], 0) : 0n; k++;
      S.allowance = okHex(res[k], 1) ? big(res[k], 0) : 0n; k++;
      S.myCalls[cur.day] = decodeCallsOf(res[k++]);
      for (const d of recent) S.myCalls[d] = decodeCallsOf(res[k++]);
      if (CFG.pool) { const c = res[k++]; S.code = okHex(c, 1) ? fromBytes32(c) : ""; }
    }
    // the day after the one taking calls (the board names it after the lock)
    const t = now();
    S.live = S.history.find((h) => h.state === OPEN && h.lockAt <= t && t < h.bellAt) || null;
    // the second batch: tomorrow's preview, the feed's last print (today's stock if it is trading, else the one taking calls)
    const liveFeed = S.live ? S.live.feed : feedAddr;
    const reqs2 = [{ to: P, data: SEL.preview + word(nextDay) }];
    if (liveFeed) { reqs2.push({ to: liveFeed, data: SEL.latestRoundData }); if (S.dec[liveFeed] == null) reqs2.push({ to: liveFeed, data: SEL.decimals }); }
    const res2 = await F.callBatch(reqs2);
    const pv = decodePreview(res2[0]);
    S.next = pv ? Object.assign({ day: nextDay }, pv) : null;
    if (liveFeed) {
      const latest = decodeFeedRound(res2[1]);
      if (S.dec[liveFeed] == null && okHex(res2[2], 1)) S.dec[liveFeed] = num(res2[2], 0);
      S.feed = { addr: liveFeed, dec: S.dec[liveFeed] == null ? 8 : S.dec[liveFeed], latest };
    } else S.feed = null;
    // what is mine to collect, across the finished rounds scanned
    S.claimDays = []; S.claimTotal = 0n;
    if (S.account) {
      for (const h of S.history) {
        if (!finished(h)) continue;
        const mine = (S.myCalls[h.day] || []).filter((c) => !c.claimed);
        if (!mine.length) continue;
        const sum = mine.reduce((s, c) => s + payout(h, c), 0n);
        if (sum > 0n) { S.claimDays.push(h.day); S.claimTotal += sum; }
        else if (mine.length) S.claimDays.push(h.day); // losses: collected for nothing, so the day stops showing
      }
    }
    S.loaded = true;
  }

  /// Walk the feed back from its latest round to find the two prints that
  /// settle a day: OPEN = the FIRST print strictly after the lock, CLOSE = the
  /// LAST print at or before the bell. The keeper's algorithm; here it powers
  /// the live floor (provisional, before the bell) and RING THE BELL.
  async function walkFeed(feed, latest, lockAt, bellAt) {
    if (!latest) return null;
    const rounds = [latest];
    let rid = latest.rid, steps = 0, broke = false;
    while (rounds[rounds.length - 1].at > lockAt && steps < 400) {
      const n = 40;
      const reqs = [];
      for (let k = 1; k <= n; k++) reqs.push({ to: feed, data: SEL.getRoundData + word(rid - BigInt(k)) });
      const res = await F.callBatch(reqs);
      let stop = false;
      for (let k = 0; k < n; k++) {
        const r = decodeFeedRound(res[k]);
        if (!r) { stop = true; broke = true; break; } // the start of the feed's phase: cannot prove past it
        rounds.push(r);
        if (r.at <= lockAt) { stop = true; break; }
      }
      rid -= BigInt(n); steps += n;
      if (stop) break;
    }
    const asc = rounds.slice().reverse(); // oldest first
    const complete = asc[0].at <= lockAt && !broke;
    const open = asc.find((r) => r.at > lockAt) || null;
    const upTo = asc.filter((r) => r.at <= bellAt);
    const close = upTo.length ? upTo[upTo.length - 1] : null;
    return { open: open && open.at <= bellAt ? open : null, close, complete, last: latest };
  }
  /// the walk for a day, cached once the day's OPEN print is known (it never changes); the last print refreshes every poll
  async function walkFor(h) {
    const cached = S.walks[h.day];
    if (cached && cached.open && cached.done) return cached;
    if (!S.feed || !same(S.feed.addr, h.feed) || !S.feed.latest) return cached || null;
    const wk = await walkFeed(h.feed, S.feed.latest, h.lockAt, h.bellAt);
    if (!wk) return cached || null;
    wk.done = now() >= h.bellAt; // after the bell nothing changes
    S.walks[h.day] = wk;
    return wk;
  }

  /// the wallet's brokers, with what each can stake and whether it has called today
  async function loadBrokers() {
    S.brokers = [];
    if (!S.account || !S.cur) return;
    let ids = [];
    try { ids = await F.tokensOf(S.account); } catch (e) { return; }
    ids = ids.map((x) => BigInt(x));
    S.brokersOwned = ids.length;
    if (!ids.length) return;
    const P = CALL();
    const reqs = [];
    for (const id of ids) {
      reqs.push({ to: CFG.nft, data: SEL.isActive + word(id) });
      reqs.push({ to: CFG.nft, data: SEL.weightOf + word(id) });
      reqs.push({ to: P, data: SEL.callView + word(S.cur.day) + word(id) });
      reqs.push({ to: P, data: SEL.record + word(id) });
    }
    const res = await F.callBatch(reqs);
    const T = terms();
    const out = [];
    ids.forEach((id, i) => {
      const active = okHex(res[i * 4], 1) && big(res[i * 4], 0) === 1n;
      const weight = okHex(res[i * 4 + 1], 1) ? big(res[i * 4 + 1], 0) : 0n;
      const c = decodeCall(res[i * 4 + 2]);
      const rec = decodeRecord(res[i * 4 + 3]);
      out.push({ id, active, weight, max: weight * T.stakePerWeight, call: c && c.caller !== ZERO ? c : null, record: rec, blocked: !!(rec && rec.q0 && rec.q1) });
    });
    // hired first, then by weight; the desk offers the hired ones that have not called
    out.sort((a, b) => (b.active - a.active) || (b.weight > a.weight ? 1 : b.weight < a.weight ? -1 : 0) || Number(a.id - b.id));
    S.brokers = out;
    if (!S.selTouched) { S.sel = new Set(out.filter((b) => b.active && !b.call && !b.blocked).map((b) => b.id.toString())); }
    else for (const k of [...S.sel]) { const b = out.find((x) => x.id.toString() === k); if (!b || !b.active || b.call) S.sel.delete(k); }
  }

  /// THE BOARD: brokers that have ever called (Called logs, cached forward),
  /// and their live records. Rebuilt when a round settles, not every poll.
  async function loadBoard() {
    if (!CFG.callBlock) { S.board = { rows: [], live: [], best: [], note: "the board opens with the first settle" }; return; }
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(BOARD_KEY) || "null"); } catch (e) {}
    if (!cache || cache.v !== 1 || !same(cache.call, CALL())) cache = { v: 1, call: CALL(), to: CFG.callBlock - 1, ids: [] };
    const head = await F.blockNumber();
    if (head >= cache.to + 1) {
      const logs = await F.rpcLogsRange({ address: CALL(), topics: [TOPIC_CALLED] }, cache.to + 1, head);
      const seen = new Set(cache.ids);
      for (const l of logs || []) { const id = BigInt(l.topics[2]).toString(); if (!seen.has(id)) { seen.add(id); cache.ids.push(id); } }
      cache.to = head;
      try { localStorage.setItem(BOARD_KEY, JSON.stringify(cache)); } catch (e) {}
    }
    const ids = cache.ids.map((x) => BigInt(x));
    if (!ids.length) { S.board = { rows: [], live: [], best: [], note: "nobody has called yet" }; return; }
    const recs = await F.callBatch(ids.map((id) => ({ to: CALL(), data: SEL.record + word(id) })));
    const rows = ids.map((id, i) => Object.assign({ id }, decodeRecord(recs[i]) || { streak: 0, best: 0, wins: 0, played: 0 })).filter((r) => r.played > 0);
    const live = rows.filter((r) => r.streak > 0).sort((a, b) => b.streak - a.streak || b.wins - a.wins || Number(a.id - b.id)).slice(0, 20);
    const best = rows.filter((r) => r.best > 0).sort((a, b) => b.best - a.best || b.wins - a.wins || Number(a.id - b.id)).slice(0, 20);
    const top = [...new Map([...live, ...best].map((r) => [r.id.toString(), r])).values()];
    const owners = top.length ? await F.callBatch(top.map((r) => ({ to: CFG.nft, data: SEL.ownerOf + word(r.id) }))) : [];
    top.forEach((r, i) => { r.owner = okHex(owners[i], 1) ? addr(owners[i], 0) : null; });
    S.board = { rows, live, best, note: live.length || best.length ? "" : "no streak yet · call it right three days running for a HOT HAND pin" };
  }

  // ---------------------------------------------------------------- wallet
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
    if (p.on) p.on("accountsChanged", (a) => { S.account = a[0] || null; S.selTouched = false; refresh(); });
    await refresh();
  }

  async function tx(label, fn, after) {
    if (S.busy) return;
    S.busy = true;
    try {
      toast(label + "…");
      const hash = await fn();
      if (hash) { toast("sent, waiting for the block…"); await F.waitForTx(hash); }
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
    if (/BadAmount|0x749b5939/.test(m)) return "the stake is below the minimum, or above what that broker may stake";
    if (/BadBroker|0xef6303e2/.test(m)) return "that broker is not yours, or not hired";
    if (/AlreadyCalled|0xf05212a9/.test(m)) return "that broker has already called this day";
    if (/PreviousUnsettled|0xed0c1b27/.test(m)) return "that broker's last call has not been settled yet — ring the bell first";
    if (/WrongRound|0xe6121c8c/.test(m)) return "the calls for that day are closed — the board has moved to the next day";
    if (/NotYet|0x0d3f7776/.test(m)) return "the bell has not rung yet";
    if (/NotSettleable|0xb2f71223/.test(m)) return "that day is already settled";
    if (/BadProof|0x7ca55c77/.test(m)) return "those are not the two feed rounds that settle this day — try again in a moment";
    if (/NotFinished|0x52f0214c/.test(m)) return "that day is not settled yet";
    if (/NotYours|0x3715f556/.test(m)) return "that call is not yours";
    if (/NothingToClaim|0x969bf728/.test(m)) return "nothing to collect";
    if (/NoTradingDay|0x1620889c/.test(m)) return "no trading day ahead on the calendar";
    if (/TransferFailed|0x90b8ec18/.test(m)) return "the token transfer failed";
    if (/insufficient/i.test(m)) return "not enough ETH for gas";
    return m.length > 160 ? m.slice(0, 160) + "…" : m || "something went wrong";
  }

  // ---------------------------------------------------------------- actions
  /// an honest gas limit: estimate + 25%, else the ceiling
  async function gasFor(to, data, ceiling) {
    try {
      const est = await F.provider().request({ method: "eth_estimateGas", params: [{ from: S.account, to, data }] });
      const g = (BigInt(est) * 125n) / 100n;
      if (g > 60000n && g < ceiling * 2n) return g;
    } catch (e) { /* the ceiling stands */ }
    return ceiling;
  }
  async function ensureAllowance(total) {
    if (S.allowance >= total) return true;
    toast("first time: two confirmations — allow the desk to take $9TO5, then the call");
    let landed = false;
    await tx("allowing the desk to take $9TO5", () => F.send(CFG.token, SEL.approve + word(CALL()) + word((1n << 256n) - 1n), 0n, S.account), async () => { landed = true; });
    return landed;
  }
  async function callIt(amountWei) {
    const cur = S.cur;
    if (!cur) return;
    if (now() >= cur.lockAt) { refresh(); return toast("calls are closed — the next day is on the board", false); }
    if (!S.side) return toast("UP or DOWN?", false);
    const picked = S.brokers.filter((b) => S.sel.has(b.id.toString()) && b.active && !b.call && !b.blocked);
    if (!picked.length) return toast("pick a hired broker to call with", false);
    const T = terms();
    if (amountWei < T.minStake) return toast(`the minimum is ${fmt(T.minStake)} $9TO5 per broker`, false);
    const stakes = picked.map((b) => ({ b, stake: amountWei > b.max ? b.max : amountWei }));
    const total = stakes.reduce((s, x) => s + x.stake, 0n);
    if (total > S.balance) return toast(`that is ${fmt(total)} $9TO5 across ${picked.length} broker${picked.length === 1 ? "" : "s"} — more than you have`, false);
    const trimmed = stakes.filter((x) => x.stake < amountWei).length;
    if (!(await ensureAllowance(total))) return;
    const up = S.side === "up";
    const calls = stakes.map((x) => ({ to: CALL(), data: SEL.call + word(cur.day) + word(x.b.id) + word(up ? 1 : 0) + word(x.stake) }));
    const label = `calling ${cur.symbol} ${up ? "UP" : "DOWN"} with ${picked.length} broker${picked.length === 1 ? "" : "s"}`;
    const done = async () => { S.selTouched = false; toast(`your call is in${trimmed ? ` (${trimmed} stake${trimmed === 1 ? "" : "s"} trimmed to the broker's max)` : ""} · settled at the ${nyTime(cur.bellAt)} bell`, true); };
    if (calls.length === 1) {
      // the first call of a day creates the round: ~200k more than a later one
      const limit = await gasFor(calls[0].to, calls[0].data, cur.exists ? 320000n : 520000n);
      return tx(label, () => F.send(calls[0].to, calls[0].data, 0n, S.account, limit), done);
    }
    return tx(label, async () => {
      await F.runCalls(calls, S.account, (n, total, batched) => toast(`${label}: ${batched ? "confirm the batch" : `${n + 1} of ${total}`}…`));
      return null;
    }, done);
  }
  async function sponsor(amountWei) {
    const cur = S.cur;
    if (!cur || amountWei <= 0n) return toast("type an amount of $9TO5", false);
    if (amountWei > S.balance) return toast("that is more than you have", false);
    if (!(await ensureAllowance(amountWei))) return;
    const data = SEL.sponsor + word(cur.day) + word(amountWei);
    const limit = await gasFor(CALL(), data, cur.exists ? 200000n : 420000n);
    await tx(`adding ${fmt(amountWei)} to ${cur.symbol}'s prize`, () => F.send(CALL(), data, 0n, S.account, limit));
  }
  async function collect() {
    const days = S.claimDays.slice(0, 20);
    if (!days.length) return toast("nothing to collect", false);
    let data = SEL.claimAll + word(32) + word(days.length);
    for (const d of days) data += word(d);
    const n = days.reduce((s, d) => s + (S.myCalls[d] || []).length, 0);
    const limit = await gasFor(CALL(), data, BigInt(120000 + 45000 * n));
    await tx("collecting", () => F.send(CALL(), data, 0n, S.account, limit), async () => toast(`collected ${fmt(S.claimTotal)} $9TO5`, true));
  }
  /// the bell: the two feed rounds, straight into settle(). Anyone may.
  async function ringBell(day) {
    const h = S.history.find((x) => x.day === day);
    if (!h) return;
    toast("reading the feed…");
    const latestHex = (await F.callBatch([{ to: h.feed, data: SEL.latestRoundData }]))[0];
    const latest = decodeFeedRound(latestHex);
    const wk = latest ? await walkFeed(h.feed, latest, h.lockAt, h.bellAt) : null;
    if (!wk || !wk.close || !wk.complete) return toast("the feed's rounds could not be walked to the lock — the desk will look at this day", false);
    const openRound = wk.open ? wk.open.rid : 0n;
    if (wk.open && (wk.close.answer > wk.open.answer * 3n || wk.open.answer > wk.close.answer * 3n)) return toast("the feed changed scale across this day — the desk voids it and everyone is refunded", false);
    const data = SEL.settle + word(day) + word(openRound) + word(wk.close.rid);
    const limit = await gasFor(CALL(), data, 300000n);
    await tx("ringing the bell", () => F.send(CALL(), data, 0n, S.account, limit));
  }

  // ---------------------------------------------------------------- render
  let host = null, timer = null, ticker = null;
  function toast(msg, ok) {
    const t = document.getElementById("mc-toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast on" + (ok === true ? " ok" : ok === false ? " bad" : "");
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = "toast"; }, ok === undefined ? 30000 : 6000);
  }
  const explorer = (a) => `${CFG.explorer}/address/${a}`;
  const feedLink = (h) => `<a class="dim" href="${explorer(h.feed)}?tab=read_contract" rel="noopener" title="getRoundData(${h.openRound || "—"}) · getRoundData(${h.closeRound})">feed ↗</a>`;
  const resultWord = (h) => (h.state === SETTLED ? (h.up ? "UP" : "DOWN") : h.state === PUSHED ? (h.decided ? "PUSH · all wrong" : h.open === h.close ? "PUSH · no trade" : "PUSH · flat") : h.state === VOIDED ? "VOID" : now() >= h.bellAt ? "AT THE BELL" : now() >= h.lockAt ? "TRADING" : "OPEN");
  const resultCls = (h) => (h.state === SETTLED ? (h.up ? "grn" : "red") : "dim");
  const sideWord = (up) => (up ? `<span class="grn">UP</span>` : `<span class="red">DOWN</span>`);
  const youLine = (h) => {
    const mine = S.myCalls[h.day] || [];
    if (!mine.length) return "";
    const won = mine.reduce((s, c) => s + payout(h, c), 0n);
    const staked = mine.reduce((s, c) => s + c.stake, 0n);
    if (h.state === SETTLED) {
      const right = mine.filter((c) => c.up === h.up).length;
      return right ? `<b class="won">YOU called it${right < mine.length ? ` with ${right} of ${mine.length}` : ""}: ${fmt(won)} $9TO5</b>` : `<span class="dim">you called ${sideWord(mine[0].up)} with ${mine.length} · ${fmt(staked)} to the right side</span>`;
    }
    return `<span class="dim">you had ${fmt(staked)} on it · refunded</span>`;
  };

  function render() {
    if (!host) return;
    const active = document.activeElement;
    if (active && host.contains(active) && active.tagName === "INPUT" && active.type === "text") return;
    const keep = { amt: (host.querySelector("#mc-amt") || {}).value, sp: (host.querySelector("#mc-sp") || {}).value, spOpen: !!(host.querySelector("#mc-spd") || {}).open, tab: S.boardTab };

    const cur = S.cur, t = now();
    const T = terms();
    const dec = S.feed ? S.feed.dec : 8;
    const feedPx = (a) => px(a, dec);
    const open = !!cur && t < cur.lockAt;
    const left = cur ? cur.lockAt - t : 0;
    const r = cur && cur.exists ? cur.r : null;
    const todayNY = nyDay(t);
    const whose = cur ? (nyDay(cur.lockAt) === todayNY ? "TODAY'S CALL" : nyDay(cur.lockAt) === nyDay(t + 86400) ? "TOMORROW'S CALL" : `${nyWeekday(cur.lockAt)}'S CALL`) : "THE CALL";
    const mineToday = cur ? (S.myCalls[cur.day] || []) : [];
    const buyHref = CFG.token && CFG.buyUrl ? CFG.buyUrl + "token/" + CFG.token : null;

    // ---- the results banner: the last finished day with calls, until the next bell
    const last = S.history.find((h) => finished(h) && h.calls > 0);
    let banner = "";
    if (last) {
      const when = t - last.bellAt < 12 * 3600 ? "today" : nyDate(last.bellAt);
      const line = last.state === SETTLED
        ? `<b>$${esc(last.symbol)} ${sideWord(last.up)}</b> ${pct(last.open, last.close)} · ${feedPx(last.open)} → ${feedPx(last.close)} · ${last.up ? "UP" : "DOWN"} paid <b>${times(paid(last))}</b>`
        : last.state === PUSHED ? `<b>$${esc(last.symbol)}</b> no contest (${last.decided ? "everyone called it wrong" : last.open === last.close ? "the feed did not trade" : pct(last.open, last.close) + ", inside the deadband"}) · everyone refunded`
        : `<b>$${esc(last.symbol)}</b> voided · everyone refunded`;
      banner = `<div class="last">🔔 ${when}: ${line}${S.account && youLine(last) ? `<div class="mine">${youLine(last)}${S.claimTotal > 0n ? ` → <button class="chip" data-act="collect" type="button">COLLECT ${fmt(S.claimTotal)}</button>` : ""}</div>` : ""}</div>`;
    }

    // ---- the tape
    const items = [];
    for (const h of S.history.filter((x) => finished(x) && x.calls > 0).slice(0, 8)) {
      items.push(h.state === SETTLED ? `${nyDate(h.bellAt)} · $${esc(h.symbol)} <span class="${h.up ? "up" : "down"}">${h.up ? "UP" : "DOWN"} ${pct(h.open, h.close)}</span> · ${h.up ? "UP" : "DOWN"} paid ${times(paid(h))}` : `${nyDate(h.bellAt)} · $${esc(h.symbol)} <span class="gold">PUSH</span>`);
    }
    const tapeStr = items.join(" &nbsp;&nbsp;·&nbsp;&nbsp; ") + " &nbsp;&nbsp;·&nbsp;&nbsp; ";
    const half = tapeStr.repeat(Math.max(2, Math.ceil(2400 / Math.max(80, tapeStr.replace(/<[^>]+>/g, "").length * 11))));
    const tape = items.length > 1 ? `<div class="mc-ticker"><div class="tape">${half}${half}</div></div>` : "";

    // ---- the board: the day taking calls
    const upPays = S.odds.up, downPays = S.odds.down;
    const oddsLine = r && (r.upStake > 0n || r.downStake > 0n)
      ? `<span class="up">UP <b>${r.upStake > 0n ? "pays " + times(upPays) : "— nobody yet"}</b></span><span class="down">DOWN <b>${r.downStake > 0n ? "pays " + times(downPays) : "— nobody yet"}</b></span>`
      : `<span class="dim">no calls yet · the first call sets the odds</span>`;
    const potLine = r ? [`${r.calls} call${r.calls === 1 ? "" : "s"}`, `pot <b>${fmt(pot(r))}</b> $9TO5`, r.upStake > 0n || r.downStake > 0n ? `UP ${fmt(r.upStake)} / DOWN ${fmt(r.downStake)}` : "", r.sponsored > 0n ? `${fmt(r.sponsored)} sponsored` : ""].filter(Boolean).join(" · ") : (S.loaded ? "nobody has called yet — the first call opens the day" : "reading the chain…");
    const lockNY = cur ? nyTime(cur.lockAt) : "9:30 AM", bellNY = cur ? nyTime(cur.bellAt) : "4:00 PM";
    const myTodayLine = mineToday.length ? `<div><div class="lab">YOU</div><div class="hi">${mineToday.length} call${mineToday.length === 1 ? "" : "s"} · ${fmt(mineToday.reduce((s, c) => s + c.stake, 0n))} $9TO5</div><div class="fine">${[...new Set(mineToday.map((c) => (c.up ? "UP" : "DOWN")))].join(" and ")} · settled at the ${bellNY} bell</div></div>` : "";
    const board = `<div class="cab board"><div class="scr">${banner}<div class="hero">
      <div class="lab">${whose}</div>
      <div class="sym">${cur ? "$" + esc(cur.symbol) : "—"}<span class="date">${cur ? `${nyDate(cur.lockAt)} · calls close ${lockNY} NY · settled at the ${bellNY} bell` : ""}</span></div>
      <div class="odds">${oddsLine}</div>
      <div class="one">your broker calls it UP or DOWN by the close, staking $9TO5 · wrong callers pay right callers<span class="long"> · ${T.rakeBps / 100}% of the losing side is the house's, half of it burned</span></div>
      <div class="fine">${potLine}</div></div>
      <div class="row">
        <div><div class="lab">${open ? "CALLS CLOSE IN" : "CALLS CLOSED"}</div><div class="cd${open && left <= HOT_WINDOW ? " hot" : ""}">${countdown(left)}</div><div class="fine">${cur ? `<span class="long">${nyTime(cur.lockAt, true)} NY${localTime(cur.lockAt)} · the opening bell</span><span class="short">${nyTime(cur.lockAt)} NY${localTime(cur.lockAt, true)}</span>` : ""}</div></div>
        ${myTodayLine}
        ${S.next && !open ? `<div><div class="lab">THEN</div><div class="hi">$${esc(S.next.symbol)}</div><div class="fine">${nyDate(S.next.lockAt)}</div></div>` : S.next ? `<div><div class="lab">NEXT</div><div class="hi">$${esc(S.next.symbol)}</div><div class="fine">${nyDate(S.next.lockAt)} · calls open at ${lockNY}</div></div>` : ""}
      </div></div></div>`;

    // ---- the floor: today's stock trading between its lock and its bell
    let live = "";
    const L = S.live;
    if (L) {
      const wk = S.walks[L.day];
      const lastPx = S.feed && same(S.feed.addr, L.feed) && S.feed.latest ? S.feed.latest : null;
      const o = wk && wk.open ? wk.open : null;
      const band = o ? (o.answer * BigInt(L.deadbandBps)) / BPS : 0n;
      const dir = o && lastPx ? (lastPx.answer > o.answer + band ? "UP" : lastPx.answer < o.answer - band ? "DOWN" : "FLAT") : null;
      const total = L.upStake + L.downStake;
      const upShare = total > 0n ? Number((L.upStake * 1000n) / total) / 10 : 50;
      live = `<div class="cab live"><div class="scr"><div class="lab">ON THE FLOOR NOW · $${esc(L.symbol)}</div>
        <div class="px">${o ? `opened <b>${feedPx(o.answer)}</b> <span class="fine">${nyClock(o.at)}</span>` : `<span class="dim">waiting for the first print after ${nyTime(L.lockAt)}…</span>`}${lastPx ? ` → now <b>${feedPx(lastPx.answer)}</b> <span class="fine">Chainlink ${nyClock(lastPx.at)}</span>` : ""}</div>
        ${dir ? `<div class="mv ${dir === "UP" ? "grn" : dir === "DOWN" ? "red" : "dim"}">${pct(o.answer, lastPx.answer)} · ${dir} so far</div>` : ""}
        <div class="bar"><div class="u" style="width:${upShare}%"></div><div class="d" style="width:${100 - upShare}%"></div></div>
        <div class="legend"><span class="grn">UP ${fmt(L.upStake)}${total > 0n ? ` (${upShare}%)` : ""}</span><span class="red">DOWN ${fmt(L.downStake)}</span></div>
        <div class="fine">bell in <b class="cd2" data-at="${L.bellAt}">${countdown(L.bellAt - t)}</b> · ${L.calls} call${L.calls === 1 ? "" : "s"} · pot ${fmt(pot(L))} $9TO5${L.sponsored > 0n ? ` · ${fmt(L.sponsored)} sponsored` : ""} · the close is the last print at or before ${nyTime(L.bellAt)}; flat within ${(L.deadbandBps / 100).toFixed(2)}% = no contest${S.account && (S.myCalls[L.day] || []).length ? ` · <b>you called ${[...new Set((S.myCalls[L.day] || []).map((c) => (c.up ? "UP" : "DOWN")))].join(" and ")}</b>` : ""}</div>
      </div></div>`;
    }

    // ---- the bell: a day past its bell nobody has settled
    let bell = "";
    if (S.due.length) {
      const d = S.history.find((h) => h.day === S.due[0]);
      bell = `<div class="cab"><div class="scr"><div class="lab">THE BELL</div><div>${d ? `${nyDate(d.bellAt)}'s $${esc(d.symbol)}` : "a day"} is waiting to be settled.</div>
      <button class="go" data-act="bell" data-day="${S.due[0]}" ${S.account ? "" : "disabled"} style="margin-top:8px">RING THE BELL</button>
      <div class="fine">reads the two feed rounds and hands them to the contract, which checks them itself · anyone may${S.account ? "" : " · connect a wallet first"}</div></div></div>`;
    }

    // ---- the desk
    const eligible = S.brokers.filter((b) => b.active && !b.call && !b.blocked);
    const poor = S.account && S.balance < T.minStake;
    let deskBody;
    if (!S.account) {
      deskBody = S.pickWallet
        ? `<div class="lab">WHICH WALLET?</div>${S.pickWallet.map((x, i) => `<button class="go" data-act="wallet" data-i="${i}" type="button">CLOCK IN WITH ${esc(x.info.name).toUpperCase()}</button>`).join("")}<div class="fine">this browser has more than one wallet</div>`
        : `<button class="go" data-act="connect">CLOCK IN</button><div class="fine">connect a wallet on Robinhood Chain to call, collect, or ring the bell</div>`;
    } else {
      const chips = S.brokers.filter((b) => b.active).map((b) => {
        const on = S.sel.has(b.id.toString());
        if (b.call) return `<button class="chip done" type="button" disabled>#${b.id} <small>${b.call.up ? "UP" : "DOWN"} ${fmt(b.call.stake)}</small></button>`;
        if (b.blocked) return `<button class="chip done" type="button" disabled title="his last call is not settled yet">#${b.id} <small>waiting</small></button>`;
        return `<button class="chip${on ? " on" : ""}" data-act="brk" data-id="${b.id}" type="button">#${b.id} <small>max ${fmt(b.max)}${b.record && b.record.streak ? ` · ${b.record.streak}🔥` : ""}</small></button>`;
      }).join("");
      const brokerLine = S.brokers.some((b) => b.active)
        ? `<div class="brokers">${chips}</div><div class="fine">${eligible.length ? `${S.sel.size} of ${eligible.length} hired broker${eligible.length === 1 ? "" : "s"} picked · one call per broker per day · a promotion raises the max (${fmt(T.stakePerWeight)} per point of weight)` : "every hired broker of yours has called today"}</div>`
        : S.brokersOwned ? `<div class="fine">your brokers are not hired · hire one at the furnace to call</div>` : `<div class="fine">no broker in this wallet · <a href="/market">the market</a></div>`;
      const nSel = eligible.filter((b) => S.sel.has(b.id.toString())).length;
      deskBody = `
      ${poor ? `<div class="need">you need at least ${fmt(T.minStake)} $9TO5 to call${buyHref ? ` · <a href="${buyHref}" target="_blank" rel="noopener">get it on letscash →</a>` : ""}</div>` : ""}
      <div class="sides"><button class="side up${S.side === "up" ? " on" : ""}" data-act="side" data-side="up" type="button">▲ UP</button><button class="side down${S.side === "down" ? " on" : ""}" data-act="side" data-side="down" type="button">▼ DOWN</button></div>
      ${brokerLine}
      <div class="amt"><input type="text" inputmode="decimal" id="mc-amt" placeholder="${fmt(T.minStake) + " min · per broker"}"></div>
      <div class="presets"><button class="chip" data-act="min" type="button">MIN</button>${[25000, 50000, 100000].map((n) => `<button class="chip" data-act="preset" data-n="${n}" type="button">${n / 1e3}k</button>`).join("")}<button class="chip" data-act="max" type="button">MAX</button></div>
      <button class="go" data-act="call" ${open && !poor && nSel && S.side ? "" : "disabled"}>${!open ? "CALLS CLOSED — NEXT DAY AT THE OPENING BELL" : !S.side ? "PICK UP OR DOWN" : !nSel ? "PICK A BROKER" : `CALL $${esc(cur.symbol)} ${S.side.toUpperCase()}${nSel > 1 ? ` WITH ${nSel} BROKERS` : ""}`}</button>
      ${S.account && S.allowance < T.minStake && !poor ? `<div class="fine">two wallet prompts the first time: 1) allow $9TO5 · 2) the call</div>` : ""}
      <div class="fine">balance ${fmt(S.balance)} $9TO5 · ${short(S.account)}</div>
      ${mineToday.length ? `<div class="lab" style="margin-top:6px">YOUR CALLS · $${esc(cur.symbol)}</div><div class="mine">${mineToday.map((c) => `<div class="r"><span>#${c.tokenId} ${sideWord(c.up)}</span><span class="n">${fmt(c.stake)}</span></div>`).join("")}</div>` : ""}
      ${L && (S.myCalls[L.day] || []).length ? `<div class="lab" style="margin-top:6px">ON THE FLOOR · $${esc(L.symbol)}</div><div class="mine">${(S.myCalls[L.day] || []).map((c) => `<div class="r"><span>#${c.tokenId} ${sideWord(c.up)}</span><span class="n">${fmt(c.stake)}</span></div>`).join("")}</div>` : ""}
      <div class="lab" style="margin-top:6px">TO COLLECT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span><b>${fmt(S.claimTotal)}</b> $9TO5${S.claimDays.length ? ` · ${S.claimDays.length} day${S.claimDays.length === 1 ? "" : "s"}` : ""}</span><button class="chip" data-act="collect" ${S.claimDays.length ? "" : "disabled"}>COLLECT</button></div>
      <details id="mc-spd"><summary>add to ${cur ? "$" + esc(cur.symbol) + "'s" : "the"} prize</summary><div class="amt" style="margin-top:6px"><input type="text" inputmode="decimal" id="mc-sp" placeholder="$9TO5 for the right callers"><button class="chip" data-act="sponsor" ${open ? "" : "disabled"}>SPONSOR</button></div><div class="fine">paid to whoever calls it right, on top of the losers' money · rolls to the next day on a push</div></details>
`;
    }
    const desk = `<div class="cab"><div class="scr"><div class="lab">CALL IT</div><div class="desk">${deskBody}</div></div></div>`;

    // ---- the tape (history)
    const hist = `<div class="cab hist"><div class="scr"><div class="lab">THE TAPE</div>
      <div class="list">${S.history.length ? S.history.slice(0, TAPE_N).map((h) => {
        const res = resultWord(h);
        const mult = h.state === SETTLED ? ` · ${h.up ? "UP" : "DOWN"} paid <b>${times(paid(h))}</b>` : "";
        const prices = h.state === SETTLED || (h.state === PUSHED && h.open !== 0n) ? `${feedPx(h.open)} → ${feedPx(h.close)} ${h.state === SETTLED ? pct(h.open, h.close) : ""}` : "";
        return `<div class="r${(S.myCalls[h.day] || []).length ? " me" : ""}"><div class="line"><b>${nyDate(h.bellAt)}<span class="dim"> · $${esc(h.symbol)}</span></b><span class="res ${resultCls(h)}">${res}</span>${prices ? `<span>${prices}</span>` : ""}<span class="dim">${h.calls} call${h.calls === 1 ? "" : "s"} · pot ${fmt(pot(h))}${mult}</span>${finished(h) ? feedLink(h) : ""}</div>${S.account && youLine(h) ? `<div class="line">${youLine(h)}</div>` : ""}</div>`;
      }).join("") : `<div class="dim">${S.loaded ? "no day settled yet" : "loading…"}</div>`}</div></div></div>`;

    // ---- the streak board
    const B = S.board;
    const tab = S.boardTab || "live";
    const rowsB = B ? ((tab === "live" ? B.live : B.best) || []) : [];
    const streaks = `<div class="cab"><div class="scr"><div class="lab">STREAKS</div>
      <div class="tabs"><button class="chip${tab === "live" ? " on" : ""}" data-act="tab" data-tab="live" type="button">LIVE</button><button class="chip${tab === "best" ? " on" : ""}" data-act="tab" data-tab="best" type="button">BEST EVER</button></div>
      <div class="list">${!B ? `<div class="dim">reading the chain…</div>` : !rowsB.length ? `<div class="dim">${B.note || "no streak yet"}</div>` : rowsB.map((x, i) => `<div class="r${x.owner && same(x.owner, S.account) ? " me" : ""}"><span class="who">${i + 1}. broker <b>#${x.id}</b>${x.owner ? ` <a class="dim" href="${explorer(x.owner)}" rel="noopener">${same(x.owner, S.account) ? "you" : short(x.owner)}</a>` : ""}${pinFor(tab === "live" ? x.streak : x.best) ? `<span class="pin">${pinFor(tab === "live" ? x.streak : x.best)}</span>` : ""}</span><span class="n">${tab === "live" ? x.streak : x.best} in a row <span class="dim">· ${x.wins}/${x.played}</span></span></div>`).join("")}</div>
      <div class="fine" style="margin-top:8px">3 in a row = HOT HAND · 5 = ORACLE · 10 = LEGEND OF THE FLOOR · the streak lives on the broker and travels with him</div></div></div>`;

    const rules = `<div class="cab rules"><div class="lab">HOUSE RULES</div>
      <p><b>1.</b> One stock a trading day. Before its ${lockNY} New York opening bell, a hired broker calls it UP or DOWN, staking ${fmt(T.minStake)} to ${fmt(T.stakePerWeight)} × his weight in $9TO5. One call per broker per day. A call is final.</p>
      <p><b>2.</b> At the ${bellNY} bell Chainlink's Robinhood feed decides: the first print after the open against the last print at or before the bell, both proved on-chain from the feed's own rounds. Wrong callers pay right callers, pro-rata. ${T.rakeBps / 100}% of the losing side is the house's, half of it burned.</p>
      <p><b>3.</b> Flat day (within ${(T.deadbandBps / 100).toFixed(2)}%), one side empty, market holiday: no contest, everyone refunded. Call it right three days running and your broker wears a pin. Fine print: the <a href="/docs#call">handbook</a>.</p></div>`;

    // ---- the link: the wallet's pool code, on the call's own address (a holder
    // asked for a referral on the call, 2026-09-12: the call contract pays no
    // referral, so this is the share side — the link, the card, the post; the
    // 5% lands at the office pool when whoever arrives chips in there)
    const myCall = mineToday[0] || null;
    const share = !S.account ? "" : `<div class="cab share" id="link"><div class="scr"><div class="lab">${S.code ? "YOUR LINK" : "GET MY LINK"}</div>
      ${S.code ? `<div class="link"><code class="lnk">${esc(refLink(S.code))}</code><button class="chip" data-act="copylink" type="button">COPY LINK</button></div>
      ${window.__POOL_CARD ? `<button class="go" data-act="callcard" type="button" style="margin-top:8px">MAKE MY CARD · POST ON X</button>` : `<a class="chip" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:8px" href="https://x.com/intent/tweet?text=${encodeURIComponent(postText(cur, myCall, S.code))}" target="_blank" rel="noopener">POST ON X</a>`}
      <div class="fine">${myCall ? `the card says you called ${myCall.up ? "UP" : "DOWN"} on $${esc(cur.symbol)}` : "the card names the day's call"} · your code is the office pool's: whoever arrives through it and chips in there sends you 5%, for life</div>`
      : `<div class="fine">your link is the office pool's link, on this page's address. Pick a name once at the office pool and it works here too.</div>
      <a class="chip" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:8px" href="${poolLink}">PICK MY NAME AT THE OFFICE POOL ›</a>`}
    </div></div>`;
    host.innerHTML = tape + board + `<div class="cols"><div>${desk}${share}${live}</div><div>${hist}${streaks}</div></div>` + bell + rules;
    const a = host.querySelector("#mc-amt"), sp = host.querySelector("#mc-sp"), spd = host.querySelector("#mc-spd");
    if (a && keep.amt) a.value = keep.amt;
    if (sp && keep.sp) sp.value = keep.sp;
    if (spd && keep.spOpen) spd.open = true;
  }

  // ---------------------------------------------------------------- wiring
  let boardBusy = false;
  async function refresh() {
    try {
      await load();
      if (S.account) await loadBrokers();
      if (S.live) { try { await walkFor(S.live); } catch (e) { console.warn("morning call: feed walk failed: " + (e && e.message || e)); } }
    } catch (e) { console.warn("morning call: read failed, will retry: " + (e && e.stack || e)); }
    render();
    schedule();
    // the streak board, once per settle count (a settle changes it; a call does not)
    const settles = S.history.filter(finished).length;
    if (!boardBusy && (S.board == null || S.boardFor !== settles)) {
      boardBusy = true;
      loadBoard().then(() => { S.boardFor = settles; }).catch((e) => { console.warn("morning call: board scan failed: " + (e && e.message || e)); if (!S.board) S.board = { rows: [], live: [], best: [], note: "could not read the chain — it will retry" }; })
        .finally(() => { boardBusy = false; render(); });
    }
  }
  function schedule() {
    clearTimeout(timer);
    const t = now();
    const marks = [S.cur ? S.cur.lockAt : 0, S.live ? S.live.bellAt : 0].filter(Boolean);
    const hot = marks.some((m) => m - t > 0 && m - t <= HOT_WINDOW);
    timer = setTimeout(refresh, hot ? POLL_HOT : POLL_IDLE);
  }
  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const amt = () => document.getElementById("mc-amt");
    if (act === "connect") { toast("opening your wallet…"); return connect().catch((err) => toast(humanError(err), false)); }
    if (act === "wallet") { const wl = S.pickWallet && S.pickWallet[Number(b.dataset.i)]; if (wl) connect(wl).catch((err) => toast(humanError(err), false)); return; }
    if (act === "side") { S.side = b.dataset.side; render(); return; }
    if (act === "brk") { S.selTouched = true; const k = b.dataset.id; if (S.sel.has(k)) S.sel.delete(k); else S.sel.add(k); render(); return; }
    if (act === "min") { if (amt()) amt().value = fmt(terms().minStake, 0); return; }
    if (act === "max") {
      // the biggest stake every picked broker can take (each is trimmed to his own max on send)
      const picked = S.brokers.filter((x) => S.sel.has(x.id.toString()) && x.active && !x.call);
      const cap = picked.reduce((m, x) => (x.max > m ? x.max : m), 0n);
      const perBroker = picked.length ? S.balance / BigInt(picked.length) : S.balance;
      if (amt()) amt().value = fmt(cap > 0n && cap < perBroker ? cap : perBroker, 0);
      return;
    }
    if (act === "preset") { if (amt()) amt().value = Number(b.dataset.n).toLocaleString("en-US"); return; }
    if (act === "call") {
      const v = parseAmount(amt() && amt().value);
      if (v == null) return toast("type a stake in $9TO5, like 25,000 or 25k", false);
      return callIt(v);
    }
    if (act === "sponsor") { const i = document.getElementById("mc-sp"); const v = parseAmount(i && i.value); if (v == null) return toast("type an amount of $9TO5", false); return sponsor(v); }
    if (act === "collect") return collect();
    if (act === "copylink") { if (!S.code) return; const l = refLink(S.code); if (navigator.clipboard) navigator.clipboard.writeText(l).then(() => toast("link copied", true), () => toast(l)); else toast(l); return; }
    if (act === "callcard") {
      const cur = S.cur;
      const mine = cur ? (S.myCalls[cur.day] || [])[0] || null : null;
      const date = cur ? new Date(cur.lockAt * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : "";
      const r = cur && cur.exists ? cur.r : null;
      window.__POOL_CARD.open({
        kind: "call", slug: "morning-call", branch: "THE MORNING CALL", house: "FIRM BROKERS", mark: "/art/marks/hq.png", symbol: cur ? "$" + cur.symbol : "$9TO5",
        whose: cur ? `${nyWeekday(cur.lockAt).toUpperCase()}'S CALL` : "THE CALL", side: mine ? (mine.up ? "UP" : "DOWN") : "", stake: mine ? fmt(mine.stake) : "",
        pot: r ? fmt(pot(r)) : "", calls: r ? Number(r.calls) : 0, lock: cur ? nyTime(cur.lockAt) : "9:30 AM", bell: cur ? nyTime(cur.bellAt) : "4:00 PM", date,
        code: S.code, link: refLink(S.code), inToday: !!mine, postText: postText(cur, mine, S.code),
      });
      return;
    }
    if (act === "bell") return ringBell(Number(b.dataset.day));
    if (act === "tab") { S.boardTab = b.dataset.tab; render(); return; }
  }

  function page(mount) {
    host = mount;
    if (!CFG.call) {
      host.innerHTML = `<div class="cab"><div class="scr"><div class="lab">THE MORNING CALL</div><div>has not opened yet. When it does, this page is where the desk takes its view.</div></div></div>`;
      return;
    }
    host.addEventListener("click", onClick);
    // remember who sent you (the pool page's own key: the credit lands at the office pool)
    try { const c = (new URL(location.href).searchParams.get("ref") || "").toLowerCase(); if (validCode(c)) localStorage.setItem(REF_KEY, c); } catch (e) { /* private mode */ }
    render();
    refresh();
    clearInterval(ticker);
    ticker = setInterval(() => {
      const t = now();
      const cd = host.querySelector(".board .cd");
      if (cd && S.cur) { const left = S.cur.lockAt - t; cd.textContent = countdown(left); cd.classList.toggle("hot", left > 0 && left <= HOT_WINDOW); }
      const cd2 = host.querySelector(".cd2");
      if (cd2) cd2.textContent = countdown(Number(cd2.dataset.at) - t);
    }, 1000);
  }

  window.__CALL = { page, decodeRound, decodeCurrent, decodeCallsOf, decodeRecord, walkFeed, fmt, parseAmount, px, pct };
})();
