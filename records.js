/* ===========================================================================
   THE RECORDS ROOM — hourly pay slips for a wallet's brokers.

   What a broker earned each hour, reconstructed from the chain itself:
     - RoundSettled(round, pot, totalWeight): the engine closes an hour by
       dividing the pot by the total weight. One event per settled hour.
     - Synced(tokenId, weight, liveFrom): a broker's weight and the round it
       applies from (hire, promotion, merge, deactivation).
     - Delivered(tokenId, asset, ethIn, out): a payday — credit turned into the
       asset and sent.
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
  };
  const SEL = { twapQuote: "0x6e3e495e", pendingEth: "0xccc73973" };
  const KEY_ROUNDS = "firmbrokers.records.rounds.v1";
  const KEY_WALLET = "firmbrokers.records.wallet.v1."; // + address
  const PAGE_BLOCKS = 1_500_000; // one getLogs per ~2 days of chain; the helper bisects on error
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
    account: null, view: null, ids: [], rounds: [], syncs: {}, deliveries: [], pending: 0n, usdPerEth: null, meta: null,
    days: 1, filterId: 0, loaded: false, loading: "", error: "", pickWallet: null,
  };

  // ---------------------------------------------------------------- chain
  /// every log in [from, to] for a filter, in pages the node answers quickly;
  /// the wallet's provider is never used (its chain may not be ours)
  async function scan(base, from, to) {
    const out = [];
    for (let a = from; a <= to; a += PAGE_BLOCKS) {
      const b = Math.min(to, a + PAGE_BLOCKS - 1);
      const got = await F.rpcLogsRange(base, a, b, 0, true);
      for (const l of got || []) out.push(l);
    }
    return out;
  }
  const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } };
  const writeCache = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} };

  /// the settled hours, all of them since launch: ~24 events a day
  async function loadRounds(head) {
    let c = readCache(KEY_ROUNDS);
    if (!c || c.v !== 1) c = { v: 1, to: CFG.deployBlock - 1, rows: [] };
    if (head > c.to) {
      const logs = await scan({ address: CFG.engine, topics: [TOPIC.SETTLED] }, c.to + 1, head);
      for (const l of logs) c.rows.push([Number(BigInt(l.topics[1])), big(l.data, 0).toString(), big(l.data, 1).toString(), Number(BigInt(l.blockNumber))]);
      c.to = head;
      writeCache(KEY_ROUNDS, c);
    }
    const seen = new Set();
    S.rounds = c.rows.filter(([r]) => !seen.has(r) && seen.add(r)).map(([r, pot, tw, block]) => ({ r, pot: BigInt(pot), tw: BigInt(tw), block })).sort((x, y) => x.block - y.block);
  }

  /// the viewed wallet's brokers, their weight history and their paydays
  async function loadWallet(head) {
    const me = S.view.toLowerCase();
    S.ids = (await F.tokensOf(S.view)).map((x) => Number(x));
    const key = KEY_WALLET + me;
    let c = readCache(key);
    const idKey = S.ids.join(",");
    if (!c || c.v !== 1 || c.ids !== idKey) c = { v: 1, ids: idKey, to: CFG.deployBlock - 1, syncs: [], deliveries: [] };
    if (S.ids.length && head > c.to) {
      const topicsOf = (ids) => ids.map((id) => "0x" + word(id));
      for (let i = 0; i < S.ids.length; i += 100) {
        const group = S.ids.slice(i, i + 100);
        const sy = await scan({ address: CFG.engine, topics: [TOPIC.SYNCED, topicsOf(group)] }, c.to + 1, head);
        for (const l of sy) c.syncs.push([Number(BigInt(l.topics[1])), big(l.data, 0).toString(), Number(big(l.data, 1)), Number(BigInt(l.blockNumber)), Number(BigInt(l.logIndex || 0))]);
        const dl = await scan({ address: CFG.engine, topics: [TOPIC.DELIVERED, topicsOf(group)] }, c.to + 1, head);
        for (const l of dl) c.deliveries.push([Number(BigInt(l.topics[1])), Number(BigInt(l.topics[2])), big(l.data, 0).toString(), big(l.data, 1).toString(), Number(BigInt(l.blockNumber)), l.transactionHash]);
      }
      c.to = head;
      writeCache(key, c);
    }
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
    // the authoritative "on the machine" number and the dollar rate, one batch
    const reqs = S.ids.map((id) => ({ to: CFG.engine, data: SEL.pendingEth + word(id) }));
    reqs.push({ to: CFG.engine, data: SEL.twapQuote + word(11) + word(10n ** 18n) });
    const res = await F.callBatch(reqs);
    S.pending = 0n;
    for (let i = 0; i < S.ids.length; i++) S.pending += res[i] && res[i].length >= 66 ? big(res[i], 0) : 0n;
    const q = res[S.ids.length];
    S.usdPerEth = q && q.length >= 66 && big(q, 0) > 0n ? big(q, 0) : null;
    try { S.meta = await F.assetMeta(); } catch (e) { S.meta = null; }
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
    const slips = [];
    for (const rd of S.rounds) {
      let myW = 0;
      for (const id of ids) myW += weightAt(id, rd.r);
      if (myW === 0 || rd.tw === 0n) continue;
      const pay = ((rd.pot * 10n ** 18n) / rd.tw) * BigInt(myW) / 10n ** 18n;
      slips.push({ kind: "hour", r: rd.r, block: rd.block, pot: rd.pot, tw: rd.tw, myW, pay });
    }
    // paydays: one row per transaction, summed over the brokers in view
    const byTx = {};
    for (const d of S.deliveries) {
      if (!ids.includes(d.id)) continue;
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
      <div class="who"><a href="${explorer(S.view)}" rel="noopener">${S.view === S.account ? "YOU · " : ""}${short(S.view)}</a> · ${S.ids.length} broker${S.ids.length === 1 ? "" : "s"}${S.loading ? ` · <span class="dim">${esc(S.loading)}</span>` : ""}</div>
      ${S.error ? `<div class="fine bad">${esc(S.error)}</div>` : ""}
      ${model ? `<div class="totals">
        <div><div class="lab">ON THE PAYDAY MACHINE NOW</div><div class="hi">${fmtEth(S.pending)} ETH</div><div class="fine">${fmtUsd(S.pending)}${fmtUsd(S.pending) ? " · " : ""}earned, not yet delivered</div></div>
        <div><div class="lab">SLIPS SINCE LAST PAYDAY</div><div class="hi">${fmtEth(model.sincePayday)} ETH</div><div class="fine">${model.lastPayday ? `last payday ${dayLabel(model.lastPayday.r)} ${hourLabel(model.lastPayday.r)}` : "no payday yet"}</div></div>
        <div><div class="lab">EARNED ALL TIME</div><div class="hi">${fmtEth(model.allTime)} ETH</div><div class="fine">${fmtUsd(model.allTime)}${fmtUsd(model.allTime) ? " · " : ""}every hour on record</div></div>
      </div>` : ""}
      <div class="ctl">
        <span class="dim">show</span>
        ${[1, 7, 30, 0].map((d) => `<button class="chip${S.days === d ? " on" : ""}" data-act="days" data-d="${d}" type="button">${d === 0 ? "ALL" : d === 1 ? "24H" : d + "D"}</button>`).join("")}
        ${S.ids.length > 1 ? `<select id="rr-id" class="sel"><option value="0">all ${S.ids.length} brokers</option>${S.ids.map((id) => `<option value="${id}"${S.filterId === id ? " selected" : ""}>broker #${id}</option>`).join("")}</select>` : ""}
        <button class="chip" data-act="switch" type="button">ANOTHER WALLET</button>
      </div>
    </div></div>`;

    let body = "";
    if (!model) body = `<div class="cab"><div class="scr"><div class="fine">${S.loading || "reading the chain…"}</div></div></div>`;
    else if (!S.ids.length) body = `<div class="cab"><div class="scr"><div class="fine">this wallet holds no brokers.</div></div></div>`;
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
    <p class="fine">Hours are New York time, labelled by the hour they close. Weights count from the settle after a hire or promotion; a wallet's brokers are read from the chain, so a broker sold since shows on the buyer's records from his rehire on.</p></div></div>`;

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
      S.error = "could not read the chain: " + String(e && e.message || e).slice(0, 120) + " — reload to try again";
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
