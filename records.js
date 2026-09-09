/* ===========================================================================
   THE RECORDS ROOM — hourly pay slips for a wallet's brokers.

   What a broker earned each hour, reconstructed from the chain itself:
     - RoundSettled(round, pot, totalWeight): the engine closes an hour by
       dividing the pot by the total weight. One event per settled hour.
     - Synced(tokenId, weight, liveFrom): a broker's weight and the round it
       applies from (hire, promotion, merge, deactivation).
     - Delivered(tokenId, asset, ethIn, out): a payday — credit turned into the
       asset and sent.
     - Transfer(from, to, tokenId) on the NFT: who held the broker when. A slip
       belongs to whoever held him that hour, a payday to whoever received it,
       so a sold broker keeps his hours on the seller's records and starts the
       buyer's where they end.
   A slip for hour H = pot_H × (your weight in H) / (total weight in H), the
   exact arithmetic the engine does when it settles, so the slips add up to the
   number on the PAYDAY machine.

   Registers window.__RECORDS = { page } and is mounted by records.html. Reads
   go through F.callBatch / F.rpcLogsRange; scans are cached in localStorage
   and continued forward from the last block, so a return visit is cheap.
   Read-only: this page never sends a transaction.
   =========================================================================== */
(function () {
  "use strict";
  const F = window.Firm;
  if (!F) return;
  const CFG = F.CFG;
  const { word, toBig } = F;

  const TOPIC = {
    SETTLED: "0x866f813a2289b14a1e94be9b6a7db4b5ad759df3fb1466245f650642f3cc7a56", // RoundSettled(uint256,uint256,uint256)
    SYNCED: "0x9aa1a56064c83c34d45ce0f34a60a04b6c6fd4bf28b61a19c16235ebedb30b19", // Synced(uint256,uint256,uint256)
    DELIVERED: "0x8110a247e3bf84088ca20c991ad431b68293ca3bdfe626df91b9744bf4d7b9ce", // Delivered(uint256,uint8,uint256,uint256)
    TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer(address,address,uint256)
  };
  const SEL = { twapQuote: "0x6e3e495e", pendingEth: "0xccc73973" };
  const KEY_ROUNDS = "firmbrokers.records.rounds.v1";
  const KEY_WALLET = "firmbrokers.records.wallet.v2."; // + address
  const KEY_META = "firmbrokers.records.assets.v1"; // the asset menu (symbols, decimals): full and closed, so a day's cache is safe
  const PAGE_BLOCKS = 1_500_000; // one getLogs per ~2 days of chain for id-filtered scans (measured 2026-09-07: 0.3–0.6 s a page; 3M+ blocks "log query timed out")
  const MIN_PAGE = 50_000;
  // the mint and the first hires (≈2.6 days of chain after deploy) are so dense that a
  // 1.5M-block id-filtered page there times out on the node (2.2–3.2 s each, every
  // first visit, 2026-09-07): those blocks are paged at half size from the start
  const DENSE_UNTIL = CFG.deployBlock + 2_250_000;
  const pageCap = (a) => (a < DENSE_UNTIL ? PAGE_BLOCKS / 2 : PAGE_BLOCKS);
  const GAP_MS = 300; // between getLogs: the official RPC 429s a burst, and its 429 carries a malformed CORS header so the browser only sees "Failed to fetch"
  const REQ_TIMEOUT = 30_000; // a stalled phone connection must not leave the page on "reading the chain…" for ever
  const ZERO = "0x0000000000000000000000000000000000000000";

  // ---------------------------------------------------------------- helpers
  const w = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const big = (hex, i) => BigInt("0x" + w(hex, i));
  const short = (a) => (a && a !== ZERO ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isAddr = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ""));
  const fmtEth = (wei, d) => { const n = Number(wei) / 1e18; const digits = d != null ? d : n >= 1 ? 4 : n >= 0.01 ? 5 : 6; return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }); };
  const fmtUsd = (wei) => (S.usdPerEth ? "$" + (Number(wei) / 1e18 * Number(S.usdPerEth) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
  const fmtUnits = (v, dec) => { const n = Number(v) / 10 ** dec; return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 }); };
  const ny = (ts, o) => new Date(ts * 1000).toLocaleString("en-US", Object.assign({ timeZone: "America/New_York" }, o));
  const hourLabel = (label) => ny(label * 3600, { hour: "numeric", minute: "2-digit" }); // the hour ENDING at the settle
  const dayLabel = (label) => ny(label * 3600, { weekday: "short", month: "short", day: "numeric" });
  const mult = (weight) => parseFloat((weight / 100).toFixed(2)) + "×";

  // ---------------------------------------------------------------- state
  const S = {
    account: null, view: null, ids: [], owned: [], rounds: [], syncs: {}, deliveries: [], transfers: {}, pending: 0n, usdPerEth: null, meta: null,
    days: 1, filterId: 0, loaded: false, loading: "", error: "", pickWallet: null,
  };

  // ---------------------------------------------------------------- chain
  /// Every getLogs of this page goes through one gate: one request in flight,
  /// GAP_MS apart. Measured live 2026-09-07 (first visit, a phone): three
  /// scans in parallel plus back-to-back pages made the official RPC answer
  /// 429 to most requests; the browser reports those as network failures
  /// (the 429 carries "Access-Control-Allow-Origin: *,*"), so the helper
  /// backed off blind, retried, and bisected — 90 to 197 requests and 35 to
  /// 78 s for four brokers. Paced single requests answer in 0.2–0.6 s.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let gateChain = Promise.resolve(), gateLast = 0;
  const gate = (fn) => {
    const run = gateChain.then(async () => {
      const wait = gateLast + GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      try { return await fn(); } finally { gateLast = Date.now(); }
    });
    gateChain = run.catch(() => {});
    return run;
  };
  /// one getLogs for [a, b] on the primary RPC (public fallbacks archive-gate
  /// getLogs), with this page's own policy, which firm.js's shared helper
  /// cannot have: "log query timed out" means the node found the range too
  /// EXPENSIVE, so it is thrown at once for the caller to halve (the shared
  /// helper retried the same range five times: 4 × 2.2 s watched live on the
  /// mint-era page); a network failure is almost always the RPC's 429 with its
  /// broken CORS header, so it waits longer and asks the SAME range again; a
  /// stalled connection is cut at REQ_TIMEOUT instead of hanging the page.
  const hex = (n) => "0x" + n.toString(16);
  const logsOnce = (base, a, b) => gate(async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [Object.assign({}, base, { fromBlock: hex(a), toBlock: hex(b) })] });
    // Phones share their carrier's address, so the official RPC's per-IP limit
    // is exhausted by other people's phones as much as by this one; the 429 is
    // invisible to the browser (its CORS header is malformed → "Load failed" on
    // Safari). Six tries, waits 1·2·3·5·8 s: a shared bucket refills in seconds,
    // and one range given up on means "could not read the chain" for the page.
    const WAITS = [0, 1000, 2000, 3000, 5000, 8000];
    let last = null;
    for (let attempt = 0; attempt < WAITS.length; attempt++) {
      if (attempt) await sleep(WAITS[attempt]);
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), REQ_TIMEOUT) : null;
      try {
        const r = await fetch(CFG.rpcs[0], { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctl ? ctl.signal : undefined });
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        if (j.error) {
          const e = new Error(j.error.message || "rpc error");
          if (/timed out|too large|too many results|exceed|limit/i.test(e.message)) { e.tooBig = true; throw e; }
          throw e;
        }
        return j.result || [];
      } catch (e) {
        last = e;
        if (e && e.tooBig) throw e;
      } finally { if (timer) clearTimeout(timer); }
    }
    throw last || new Error("no answer from the rpc");
  });
  /// every log in [from, to] for a filter. `whole`: try the range in ONE
  /// request first (RoundSettled since launch = 239 logs in 0.5 s; Transfers to
  /// one wallet in 0.25 s), then page. A page the node calls too expensive is
  /// halved at once (down to MIN_PAGE); after a page succeeds the size grows
  /// back, so one heavy stretch (the mint) does not slow the whole scan.
  /// The wallet's provider is never used (its chain may not be ours).
  async function scan(base, from, to, opts) {
    opts = opts || {};
    if (to < from) return [];
    if (opts.whole || to - from + 1 <= PAGE_BLOCKS) {
      try { return (await logsOnce(base, from, to)) || []; }
      catch (e) { if (to - from + 1 <= MIN_PAGE) throw e; /* page it */ }
    }
    const out = [];
    let page = PAGE_BLOCKS;
    for (let a = from; a <= to;) {
      page = Math.min(page, pageCap(a), to - a + 1);
      const b = Math.min(to, a + page - 1);
      try {
        const got = await logsOnce(base, a, b);
        for (const l of got || []) out.push(l);
        a = b + 1;
        page = Math.min(pageCap(a), page * 2);
        if (opts.progress) opts.progress(Math.min(1, (a - from) / (to - from + 1)));
      } catch (e) {
        if (page <= MIN_PAGE) throw e;
        page = Math.max(MIN_PAGE, Math.floor(page / 2));
      }
    }
    return out;
  }
  const progress = (label) => (f) => { S.loading = `${label} ${Math.round(f * 100)}%`; render(); };
  const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } };
  const writeCache = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };

  /// the settled hours, all of them since launch: ~24 events a day
  async function loadRounds(head) {
    let c = readCache(KEY_ROUNDS);
    if (!c || c.v !== 1) c = { v: 1, to: CFG.deployBlock - 1, rows: [] };
    if (head > c.to) {
      S.loading = "the settled hours…"; render();
      const logs = await scan({ address: CFG.engine, topics: [TOPIC.SETTLED] }, c.to + 1, head, { whole: true, progress: progress("the settled hours…") });
      for (const l of logs) c.rows.push([Number(BigInt(l.topics[1])), big(l.data, 0).toString(), big(l.data, 1).toString(), Number(BigInt(l.blockNumber))]);
      c.to = head;
      writeCache(KEY_ROUNDS, c);
    }
    const seen = new Set();
    S.rounds = c.rows.filter(([r]) => !seen.has(r) && seen.add(r)).map(([r, pot, tw, block]) => ({ r, pot: BigInt(pot), tw: BigInt(tw), block })).sort((x, y) => x.block - y.block);
  }

  /// every broker the viewed wallet ever held, who held each one when, their
  /// weight history and their paydays
  async function loadWallet(head) {
    const me = S.view.toLowerCase();
    const key = KEY_WALLET + me;
    let c = readCache(key);
    if (!c || c.v !== 2) c = null;
    // brokers ever received: the cache's set plus anything received since
    const ever = new Set(c ? c.ids : []);
    S.loading = "finding your brokers…"; render();
    const recv = await scan({ address: CFG.nft, topics: [TOPIC.TRANSFER, null, "0x" + word(me)] }, c ? c.to + 1 : CFG.deployBlock, head, { whole: true, progress: progress("finding your brokers…") });
    for (const l of recv) ever.add(Number(BigInt(l.topics[3])));
    const ids = [...ever].sort((a, b) => a - b);
    // a new broker needs his whole history: start the cache over (rare)
    if (!c || c.ids.join(",") !== ids.join(",")) c = { v: 2, ids, to: CFG.deployBlock - 1, transfers: [], syncs: [], deliveries: [] };
    if (ids.length && head > c.to) {
      const topicsOf = (g) => g.map((id) => "0x" + word(id));
      for (let i = 0; i < ids.length; i += 100) {
        const group = ids.slice(i, i + 100);
        // the group's two histories: the NFT's transfers, and the engine's
        // Synced AND Delivered in ONE filter (topic0 is an OR) — two paged
        // scans through the gate instead of three side by side (see the gate:
        // parallel requests were what got the page throttled, 2026-09-07)
        const tr = await scan({ address: CFG.nft, topics: [TOPIC.TRANSFER, null, null, topicsOf(group)] }, c.to + 1, head, { progress: progress("your brokers' history…") });
        const en = await scan({ address: CFG.engine, topics: [[TOPIC.SYNCED, TOPIC.DELIVERED], topicsOf(group)] }, c.to + 1, head, { progress: progress("your brokers' pay…") });
        const sy = en.filter((l) => l.topics[0] === TOPIC.SYNCED), dl = en.filter((l) => l.topics[0] === TOPIC.DELIVERED);
        for (const l of tr) c.transfers.push([Number(BigInt(l.topics[3])), "0x" + l.topics[1].slice(26).toLowerCase(), "0x" + l.topics[2].slice(26).toLowerCase(), Number(BigInt(l.blockNumber)), Number(BigInt(l.logIndex || 0))]);
        for (const l of sy) c.syncs.push([Number(BigInt(l.topics[1])), big(l.data, 0).toString(), Number(big(l.data, 1)), Number(BigInt(l.blockNumber)), Number(BigInt(l.logIndex || 0))]);
        for (const l of dl) c.deliveries.push([Number(BigInt(l.topics[1])), Number(BigInt(l.topics[2])), big(l.data, 0).toString(), big(l.data, 1).toString(), Number(BigInt(l.blockNumber)), l.transactionHash]);
      }
      c.to = head;
      writeCache(key, c);
    }
    S.ids = ids;
    S.transfers = {};
    const seenT = new Set();
    for (const [id, from, to, block, li] of c.transfers) {
      const k = `${id}:${block}:${li}`;
      if (seenT.has(k)) continue; seenT.add(k);
      (S.transfers[id] = S.transfers[id] || []).push({ from, to, block, li });
    }
    for (const id in S.transfers) S.transfers[id].sort((a, b) => a.block - b.block || a.li - b.li);
    S.owned = ids.filter((id) => ownerAt(id, Infinity) === me);
    S.syncs = {};
    const seenS = new Set();
    for (const [id, wgt, from, block, li] of c.syncs) {
      const k = `${id}:${block}:${li}:${wgt}:${from}`;
      if (seenS.has(k)) continue; seenS.add(k);
      (S.syncs[id] = S.syncs[id] || []).push({ w: Number(wgt), from, block, li });
    }
    for (const id in S.syncs) S.syncs[id].sort((a, b) => a.block - b.block || a.li - b.li);
    const seenD = new Set();
    S.deliveries = c.deliveries.filter(([id, asset, , , , tx]) => { const k = `${tx}:${id}:${asset}`; return !seenD.has(k) && seenD.add(k); }).map(([id, asset, ethIn, out, block, tx]) => ({ id, asset, ethIn: BigInt(ethIn), out: BigInt(out), block, tx }));
    // the authoritative "on the machine" number (the brokers held NOW) and the dollar rate, one batch
    const reqs = S.owned.map((id) => ({ to: CFG.engine, data: SEL.pendingEth + word(id) }));
    reqs.push({ to: CFG.engine, data: SEL.twapQuote + word(11) + word(10n ** 18n) });
    const res = await gate(() => F.callBatch(reqs)); // through the gate: right after the scans it was the request the limiter caught
    S.pending = 0n;
    for (let i = 0; i < S.owned.length; i++) S.pending += res[i] && res[i].length >= 66 ? big(res[i], 0) : 0n;
    const q = res[S.owned.length];
    S.usdPerEth = q && q.length >= 66 && big(q, 0) > 0n ? big(q, 0) : null;
    // the asset menu: three round trips through firm.js, and the menu is full and closed → cached a day
    const mc = readCache(KEY_META);
    if (mc && mc.v === 1 && Date.now() - mc.at < 86_400_000 && mc.meta) S.meta = mc.meta;
    else {
      try { S.meta = await gate(() => F.assetMeta()); if (S.meta) writeCache(KEY_META, { v: 1, at: Date.now(), meta: S.meta }); } catch (e) { S.meta = null; }
    }
  }

  /// who held a broker at a block: the last transfer at or before it
  function ownerAt(id, block) {
    const ts = S.transfers[id];
    if (!ts || !ts.length) return null;
    let o = null;
    for (const t of ts) { if (t.block <= block) o = t.to; else break; }
    return o;
  }

  // ---------------------------------------------------------------- the model
  /// A RoundSettled labelled R was emitted by the first transaction of round R
  /// and settles the pot that accrued BEFORE it (round R−1, or several rounds
  /// when no transaction touched the engine for a while). So a block lies in
  /// round R when it sits at or after R's settle and before the next one.
  function roundOfBlock(block) {
    const rs = S.rounds;
    if (!rs.length) return Math.floor(Date.now() / 3600000);
    let lo = 0, hi = rs.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rs[mid].block <= block) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans < 0 ? rs[0].r - 1 : rs[ans].r;
  }
  /// a broker's weight in the pot settled under label R. Each Synced event
  /// says from which settle it counts:
  ///   weight > 0, x = liveFrom or the change round  → settles labelled ≥ x+1
  ///   weight = 0 (deactivated in round D)          → settles labelled ≥ D+1
  /// (the engine banks the old weight first, so the settle that opened the
  /// round of the change still pays the old weight)
  function weightAt(id, R) {
    const evs = S.syncs[id];
    if (!evs) return 0;
    let best = null;
    for (const e of evs) {
      const fromLabel = e.w === 0 ? roundOfBlock(e.block) + 1 : e.from + 1;
      if (fromLabel <= R && (!best || fromLabel >= best.fromLabel)) best = { fromLabel, w: e.w };
    }
    return best ? best.w : 0;
  }
  const idsInView = () => (S.filterId ? S.ids.filter((id) => id === S.filterId) : S.ids);

  /// the slips, newest first: one per settled hour the wallet was live for,
  /// with paydays slotted into the hour they happened in
  function build() {
    const ids = idsInView();
    const me = S.view.toLowerCase();
    const slips = [];
    for (const rd of S.rounds) {
      let myW = 0;
      for (const id of ids) if (ownerAt(id, rd.block) === me) myW += weightAt(id, rd.r);
      if (myW === 0 || rd.tw === 0n) continue;
      const pay = ((rd.pot * 10n ** 18n) / rd.tw) * BigInt(myW) / 10n ** 18n;
      slips.push({ kind: "hour", r: rd.r, block: rd.block, pot: rd.pot, tw: rd.tw, myW, pay });
    }
    // paydays: one row per transaction, summed over the brokers in view
    const byTx = {};
    for (const d of S.deliveries) {
      if (!ids.includes(d.id) || ownerAt(d.id, d.block) !== me) continue;
      const t = byTx[d.tx] || (byTx[d.tx] = { kind: "payday", tx: d.tx, block: d.block, r: roundOfBlock(d.block), ethIn: 0n, out: {}, brokers: new Set() });
      t.ethIn += d.ethIn; t.out[d.asset] = (t.out[d.asset] || 0n) + d.out; t.brokers.add(d.id);
    }
    const rows = slips.concat(Object.values(byTx));
    // chronological: by block, a payday after the settle of its own round
    rows.sort((a, b) => a.block - b.block || (a.kind === "hour" ? -1 : 1));
    // running totals
    let allTime = 0n, sincePayday = 0n, lastPayday = null;
    for (const row of rows) {
      if (row.kind === "hour") { allTime += row.pay; sincePayday += row.pay; row.running = sincePayday; }
      else { row.before = sincePayday; sincePayday = 0n; lastPayday = row; }
    }
    return { rows: rows.reverse(), allTime, sincePayday, lastPayday };
  }

  // ---------------------------------------------------------------- wallet
  const WALLET_KEY = "firmbrokers.wallet.v1";
  async function connect(chosen) {
    const list = F.wallets();
    if (!F.hasChosen() || chosen) {
      let remembered = null;
      try { remembered = localStorage.getItem(WALLET_KEY); } catch (e) {}
      const saved = chosen || (remembered && list.find((x) => x.info.rdns === remembered));
      if (!saved && list.length > 1) { S.pickWallet = list; render(); return; }
      const pick = saved || list[0];
      if (!pick) return toast("no wallet in this browser — paste an address instead", false);
      F.setProvider(pick.provider);
      try { localStorage.setItem(WALLET_KEY, pick.info.rdns); } catch (e) {}
      S.pickWallet = null;
    }
    const p = F.provider();
    const accounts = await p.request({ method: "eth_requestAccounts" });
    S.account = accounts[0];
    if (p.on) p.on("accountsChanged", (a) => { S.account = a[0] || null; if (S.account) view(S.account); });
    await view(S.account);
  }

  // ---------------------------------------------------------------- render
  let host = null;
  function toast(msg, ok) {
    const t = document.getElementById("rr-toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast on" + (ok === true ? " ok" : ok === false ? " bad" : "");
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = "toast"; }, 6000);
  }
  function explorer(a) { return `${CFG.explorer}/address/${a}`; }
  function txLink(h) { return `${CFG.explorer}/tx/${h}`; }
  function outText(out) {
    const parts = [];
    for (const a in out) { const m = S.meta && S.meta[a]; parts.push(m ? `${fmtUnits(out[a], m.decimals)} ${esc(m.symbol)}` : `asset #${a}`); }
    return parts.join(" + ");
  }

  function render() {
    if (!host) return;
    const active = document.activeElement;
    if (active && host.contains(active) && active.tagName === "INPUT") return;
    let head = "";
    if (!S.view) {
      head = `<div class="cab"><div class="scr"><div class="lab">WHOSE RECORDS?</div>
        ${S.pickWallet ? `<div class="lab" style="margin-top:8px">WHICH WALLET?</div>${S.pickWallet.map((x, i) => `<button class="go" data-act="wallet" data-i="${i}" type="button">CLOCK IN WITH ${esc(x.info.name).toUpperCase()}</button>`).join("")}`
          : `<button class="go" data-act="connect" type="button">CLOCK IN</button>`}
        <div class="fine" style="margin-top:8px">or look up any wallet · nothing here sends a transaction</div>
        <div class="look"><input type="text" id="rr-addr" placeholder="0x…" autocapitalize="off" spellcheck="false"><button class="chip" data-act="lookup" type="button">LOOK UP</button></div>
        </div></div>`;
      host.innerHTML = head + intro();
      return;
    }
    const model = S.loaded ? build() : null;
    const n = idsInView().length;
    head = `<div class="cab"><div class="scr">
      <div class="lab">RECORDS FOR</div>
      <div class="who"><a href="${explorer(S.view)}" rel="noopener">${S.view === S.account ? "YOU · " : ""}${short(S.view)}</a> · ${S.owned.length} broker${S.owned.length === 1 ? "" : "s"}${S.ids.length > S.owned.length ? ` <span class="dim">· ${S.ids.length - S.owned.length} held before</span>` : ""}${S.loading ? ` · <span class="dim">${esc(S.loading)}</span>` : ""}</div>
      ${S.error ? `<div class="fine bad">${esc(S.error)} <button class="chip" data-act="retry" type="button">TRY AGAIN</button></div>` : ""}
      ${model ? `<div class="totals">
        <div><div class="lab">ON THE PAYDAY MACHINE NOW</div><div class="hi">${fmtEth(S.pending)} ETH</div><div class="fine">${fmtUsd(S.pending)}${fmtUsd(S.pending) ? " · " : ""}earned, not yet delivered</div></div>
        <div><div class="lab">SLIPS SINCE LAST PAYDAY</div><div class="hi">${fmtEth(model.sincePayday)} ETH</div><div class="fine">${model.lastPayday ? `last payday ${dayLabel(model.lastPayday.r)} ${hourLabel(model.lastPayday.r)}` : "no payday yet"}${S.ids.length > S.owned.length && model.sincePayday > S.pending ? " · part of it left with brokers since sold" : ""}</div></div>
        <div><div class="lab">EARNED ALL TIME</div><div class="hi">${fmtEth(model.allTime)} ETH</div><div class="fine">${fmtUsd(model.allTime)}${fmtUsd(model.allTime) ? " · " : ""}every hour on record</div></div>
      </div>` : ""}
      <div class="ctl">
        <span class="dim">show</span>
        ${[1, 7, 30, 0].map((d) => `<button class="chip${S.days === d ? " on" : ""}" data-act="days" data-d="${d}" type="button">${d === 0 ? "ALL" : d === 1 ? "24H" : d + "D"}</button>`).join("")}
        ${S.ids.length > 1 ? `<select id="rr-id" class="sel"><option value="0">all ${S.ids.length} brokers</option>${S.ids.map((id) => `<option value="${id}"${S.filterId === id ? " selected" : ""}>broker #${id}${S.owned.includes(id) ? "" : ownerAt(id, Infinity) === ZERO ? " · merged" : " · sold"}</option>`).join("")}</select>` : ""}
        <button class="chip" data-act="switch" type="button">ANOTHER WALLET</button>
      </div>
    </div></div>`;

    let body = "";
    if (!model) body = `<div class="cab"><div class="scr"><div class="fine">${S.loading || "reading the chain…"}</div></div></div>`;
    else if (!S.ids.length) body = `<div class="cab"><div class="scr"><div class="fine">this wallet has never held a broker.</div></div></div>`;
    else {
      const since = S.days ? Math.floor(Date.now() / 1000) - S.days * 86400 : 0;
      const rows = model.rows.filter((r) => (r.r + (r.kind === "hour" ? 0 : 1)) * 3600 >= since);
      let lastDay = "";
      const lines = [];
      for (const r of rows) {
        const day = dayLabel(r.r);
        if (day !== lastDay) { lines.push(`<div class="day">${day}</div>`); lastDay = day; }
        if (r.kind === "hour") {
          lines.push(`<div class="slip"><span class="t">${hourLabel(r.r)}</span><span class="pot dim">firm pot ${fmtEth(r.pot, 4)}</span><span class="wt dim">${mult(r.myW)} · ${(100 * r.myW / Number(r.tw)).toFixed(3)}%</span><span class="pay">${fmtEth(r.pay)} ETH${fmtUsd(r.pay) ? `<i>${fmtUsd(r.pay)}</i>` : ""}</span><span class="run dim">${fmtEth(r.running)}</span></div>`);
        } else {
          lines.push(`<div class="slip payday"><span class="t">${hourLabel(r.r)}</span><span class="pot">PAYDAY · ${r.brokers.size} broker${r.brokers.size === 1 ? "" : "s"}</span><span class="wt"><a href="${txLink(r.tx)}" rel="noopener">receipt ↗</a></span><span class="pay">${fmtEth(r.ethIn)} ETH → ${outText(r.out)}</span><span class="run">paid out</span></div>`);
        }
      }
      body = `<div class="cab"><div class="scr">
        <div class="lab">PAY SLIPS · ${n === S.ids.length ? "ALL BROKERS" : "BROKER #" + S.filterId} · ${S.days ? (S.days === 1 ? "LAST 24 HOURS" : "LAST " + S.days + " DAYS") : "ALL TIME"}</div>
        <div class="slip head"><span>hour ending</span><span>firm pot</span><span>your weight</span><span>your pay</span><span>since payday</span></div>
        ${lines.join("") || `<div class="fine">nothing in this window — ${S.days ? "widen it, or " : ""}the brokers were not on payroll yet</div>`}
      </div></div>`;
    }
    host.innerHTML = head + body + (S.loaded ? intro() : "");
    const sel = host.querySelector("#rr-id");
    if (sel) sel.addEventListener("change", () => { S.filterId = Number(sel.value); render(); });
  }
  const intro = () => `<div class="cab"><div class="scr rules"><div class="lab">HOW TO READ A SLIP</div>
    <p><b>Every hour</b> the engine closes the books: the fees that arrived are divided among every hired broker by weight. A slip is one hour: the firm's whole pot, your brokers' weight against everyone's, and your share of it. The slips add up to the number on the PAYDAY machine.</p>
    <p><b>PAYDAY</b> rows are deliveries: the hours since the last one, turned into the assets your brokers chose and sent. An hour with no fees writes no slip.</p>
    <p class="fine">Hours are New York time, labelled by the hour they close. Weights count from the settle after a hire or promotion. A broker you sold keeps his hours here for as long as he was yours, and his buyer's records start where yours end; pay he had earned but not yet been paid travels with him, so that last payday lands on the buyer's records.</p></div></div>`;

  // ---------------------------------------------------------------- wiring
  async function view(address) {
    if (!isAddr(address)) return toast("that is not an address", false);
    try { if (document.activeElement && host.contains(document.activeElement)) document.activeElement.blur(); } catch (e) {}
    S.view = address; S.loaded = false; S.error = ""; S.filterId = 0; S.loading = "reading the chain…";
    render();
    try {
      const head = await F.blockNumber();
      S.loading = "the settled hours…"; render();
      await loadRounds(head);
      S.loading = "your brokers' history…"; render();
      await loadWallet(head);
      S.loading = "";
      S.loaded = true;
    } catch (e) {
      S.loading = "";
      // "Load failed" (Safari) / "Failed to fetch" (Chrome) is the RPC's rate limit seen from a browser
      const m = String(e && e.message || e); const throttled = /load failed|failed to fetch|rate limit|429|too many/i.test(m);
      S.error = throttled ? "the chain's public node is busy right now (it limits each network's phones together) — wait a few seconds and try again" : "could not read the chain: " + m.slice(0, 120);
      console.warn("records: " + (e && e.stack || e));
    }
    render();
  }
  function onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "connect") { toast("opening your wallet…"); return connect().catch((err) => toast(String(err && err.message || err).slice(0, 120), false)); }
    if (act === "wallet") { const wl = S.pickWallet && S.pickWallet[Number(b.dataset.i)]; if (wl) connect(wl).catch((err) => toast(String(err && err.message || err).slice(0, 120), false)); return; }
    if (act === "lookup") { const i = document.getElementById("rr-addr"); return view(String(i && i.value || "").trim()); }
    if (act === "days") { S.days = Number(b.dataset.d); return render(); }
    if (act === "switch") { S.view = null; S.loaded = false; S.ids = []; return render(); }
    if (act === "retry") { const a = S.view; if (a) return view(a); }
  }

  function page(mount) {
    host = mount;
    if (!CFG.engine || !CFG.nft) {
      host.innerHTML = `<div class="cab"><div class="scr"><div class="lab">THE RECORDS ROOM</div><div>opens with the payroll.</div></div></div>`;
      return;
    }
    host.addEventListener("click", onClick);
    host.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target && e.target.id === "rr-addr") view(String(e.target.value || "").trim()); });
    render();
    let a = "";
    try { a = new URL(location.href).searchParams.get("a") || ""; } catch (e) {}
    if (isAddr(a)) view(a);
  }

  window.__RECORDS = { page, view };
})();
