/* ===========================================================================
   AUTO PAYDAY — when the keeper's sweep will pay, for everyone to see.

   The keeper (keeper/keeper.mjs) pays undelivered wages once an hour, after
   minute SWEEP_AFTER, to every broker carrying at least SWEEP_MIN; it only
   sends a batch once the batch holds SWEEP_TX_MIN (or someone in it has
   waited SWEEP_MAX_WAIT rounds), and inside the transaction each asset's
   slice has to clear the engine's swap floor. Nobody could see any of that,
   so "when do I get paid?" was the floor's most asked question.

   This module reads what the keeper reads — every broker's pending pay, the
   splits of those over the line, the engine's floor — and runs the keeper's
   own planner (planSweep, copied verbatim; test/keeper-sweep-config.mjs fails
   the build if the copy or the numbers in config.js drift from the keeper).
   level.js shows the result on the PAYDAY machine and in each broker's file;
   the machine opens the full picture on a click.

   Read-only. Nothing here sends a transaction. Registers window.__AUTOPAY.
   =========================================================================== */
(function () {
  "use strict";
  const F = window.Firm;
  if (!F) return;
  const CFG = F.CFG;
  const SW = CFG.sweep;
  if (!SW || !CFG.engine || !CFG.nft) return;
  const { word, toBig } = F;

  const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const SEL = { aggregate3: "0x82ad56cb", pendingEth: "0xccc73973", totalWeight: "0x96c82e57", minSwap: "0x59cd9031", maxSupply: "0xd5abeb01" };
  const TOPIC_SETTLED = "0x866f813a2289b14a1e94be9b6a7db4b5ad759df3fb1466245f650642f3cc7a56"; // RoundSettled(uint256,uint256,uint256)
  const KEY = "firmbrokers.autopay.v1";
  const TTL = 10 * 60 * 1000;
  const MIN = BigInt(SW.minWei);
  const TXMIN = BigInt(SW.txMinWei);
  const USDG = 11;

  // ---------------------------------------------------------------- helpers
  const w = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const big = (hex, i) => BigInt("0x" + w(hex, i));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtEth = (wei, d) => { const n = Number(wei) / 1e18; const digits = d != null ? d : n >= 0.01 ? 3 : 4; return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits }); };
  const sym = (a) => (window.__FB_ASSET_META && window.__FB_ASSET_META[a] && window.__FB_ASSET_META[a].symbol) || (S.meta && S.meta[a] && S.meta[a].symbol) || "#" + a;
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  // ---------------------------------------------------------------- the keeper's planner
  // COPIED VERBATIM from keeper/keeper.mjs (minus `export`). Do not edit here:
  // edit the keeper and copy again; the parity test compares the two bodies.
  function planSweep(
    starved,
    meta,
    floor,
    { slotsMax = 200, idsMax = 100, chunksMax = 3, stockFloor = floor, assetChunksMax = 2, defaultAsset = 11, txMin = 0n, overdue = new Set() } = {},
  ) {
    // worth a swap? the pay a chunk would deliver must cover the tx's fixed
    // cost many times over — unless someone in it is overdue (see SWEEP_TX_MIN)
    const worth = (value, ids) => value >= txMin || ids.some((id) => overdue.has(String(id)));
    const cut = (list) => {
      const out = [];
      let cur = [], slots = 0, pots = {};
      for (const [id, p] of list) {
        const m = meta.get(id) || { slots: 1, pots: { [defaultAsset]: p } };
        if (cur.length && (slots + m.slots > slotsMax || cur.length >= idsMax)) { out.push({ ids: cur, pots }); cur = []; slots = 0; pots = {}; }
        cur.push(id); slots += m.slots;
        for (const a in m.pots) pots[a] = (pots[a] || 0n) + m.pots[a];
      }
      if (cur.length) out.push({ ids: cur, pots });
      return out;
    };
    const best = (pots) => { let b = ["-", 0n]; for (const a in pots) if (pots[a] > b[1]) b = [a, pots[a]]; return b; };
    const potOf = (id, a) => { const m = meta.get(id); return (m && m.pots[a]) || 0n; };

    const mixed = starved.filter(([id]) => { const m = meta.get(id); return !m || m.pots[defaultAsset] > 0n; });

    // one candidate group per non-default asset anyone is waiting on
    const assets = new Set();
    for (const [id] of starved) {
      const m = meta.get(id);
      if (!m) continue;
      for (const a in m.pots) if (Number(a) !== defaultAsset && m.pots[a] > 0n) assets.add(Number(a));
    }
    const assetCandidates = [];
    for (const a of assets) {
      const group = starved
        .filter(([id]) => potOf(id, a) > 0n)
        .sort((x, y) => { const px = potOf(x[0], a), py = potOf(y[0], a); return py > px ? 1 : py < px ? -1 : 0; });
      for (const c of cut(group)) {
        assetCandidates.push({ ...c, asset: a, assetPot: c.pots[a] || 0n, stock: true });
      }
    }
    // biggest pot first: most likely to clear, and the longest waiting
    assetCandidates.sort((x, y) => (y.assetPot > x.assetPot ? 1 : y.assetPot < x.assetPot ? -1 : 0));

    const mainSend = [], assetSend = [], skipped = [];
    let mainSent = 0;
    for (const c of cut(mixed)) {
      const [asset, pot] = best(c.pots);
      const entry = { ...c, bestAsset: asset, bestPot: pot };
      const value = Object.values(c.pots).reduce((a, b) => a + b, 0n);
      if (pot < floor) skipped.push(entry);
      else if (!worth(value, c.ids)) skipped.push({ ...entry, why: `worth ${value} under txMin ${txMin}` });
      else if (mainSent < chunksMax) { mainSend.push(entry); mainSent++; } else skipped.push(entry);
    }
    // asset chunks are gated at the engine's EXACT floor: the keeper reads the
    // pots seconds before sending and pots only grow, so the 1.2x margin (which
    // guards a browser plan that may be minutes stale) would only delay the
    // group that has already waited longest.
    let assetSent = 0;
    for (const c of assetCandidates) {
      const entry = { ...c, bestAsset: String(c.asset), bestPot: c.assetPot };
      if (c.assetPot < stockFloor) skipped.push(entry);
      else if (!worth(c.assetPot, c.ids)) skipped.push({ ...entry, why: `worth ${c.assetPot} under txMin ${txMin}` });
      else if (assetSent < assetChunksMax) { assetSend.push(entry); assetSent++; } else skipped.push(entry);
    }
    // ASSET CHUNKS FIRST — see the note above. The caller sends these in order.
    return { send: [...assetSend, ...mainSend], skipped };
  }

  // ---------------------------------------------------------------- Multicall3
  /// aggregate3((address,bool,bytes)[]) for a list of 36-byte calls: one
  /// request per 250 brokers instead of the 40-per-batch eth_call path
  function encodeAggregate3(calls) {
    const TUPLE = 192; // 3 head words + length word + 36 bytes padded to 64
    let out = SEL.aggregate3 + word(32) + word(calls.length);
    for (let i = 0; i < calls.length; i++) out += word(calls.length * 32 + i * TUPLE);
    for (const c of calls) out += word(c.to) + word(1) + word(96) + word(36) + c.data.slice(2).padEnd(128, "0");
    return out;
  }
  /// → [{ ok, data }] in call order
  function decodeAggregate3(hex) {
    if (!hex || hex.length < 130) throw new Error("multicall: bad reply");
    const W = (i) => Number(BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64)));
    const arr = W(0) / 32; // word index of the array's length
    const n = W(arr);
    const base = arr + 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = base + W(base + i) / 32;
      const ok = W(t) === 1;
      const bo = t + W(t + 1) / 32;
      const len = W(bo);
      out.push({ ok, data: len ? "0x" + hex.slice(2 + (bo + 1) * 64, 2 + (bo + 1) * 64 + len * 2) : "0x" });
    }
    return out;
  }
  /// every broker's pending pay, [id, wei] for those above zero
  async function pendingAll(max) {
    const out = [];
    for (let from = 1; from <= max; from += 250) {
      const ids = [];
      for (let id = from; id <= Math.min(max, from + 249); id++) ids.push(id);
      const data = encodeAggregate3(ids.map((id) => ({ to: CFG.engine, data: SEL.pendingEth + word(id) })));
      const raw = await F.call(MULTICALL3, data, true);
      const res = decodeAggregate3(raw);
      res.forEach((r, i) => { if (r.ok && r.data.length >= 66) { const p = toBig(r.data); if (p > 0n) out.push([ids[i], p]); } });
    }
    return out;
  }

  // ---------------------------------------------------------------- state
  const S = { summary: null, loading: null, meta: null };
  const readCache = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || "null"); return c && c.v === 1 && Date.now() - c.at < TTL ? c : null; } catch (e) { return null; } };
  const writeCache = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} };
  const thaw = (c) => ({ ...c, gathered: BigInt(c.gathered), potPerHour: BigInt(c.potPerHour), totalWeight: BigInt(c.totalWeight), minSwap: BigInt(c.minSwap), assets: c.assets.map((a) => ({ ...a, pot: BigInt(a.pot) })) });
  const freeze = (s) => ({ ...s, gathered: s.gathered.toString(), potPerHour: s.potPerHour.toString(), totalWeight: s.totalWeight.toString(), minSwap: s.minSwap.toString(), assets: s.assets.map((a) => ({ ...a, pot: a.pot.toString() })) });

  /// what the keeper would do at the next :20, read the way the keeper reads it
  async function build() {
    const maxRaw = await F.call(CFG.nft, SEL.maxSupply, true);
    const max = maxRaw && maxRaw.length >= 66 ? Number(toBig(maxRaw)) || 5000 : 5000;
    const pend = await pendingAll(max);
    const starved = pend.filter(([, p]) => p >= MIN).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
    const shares = starved.length ? await F.assetSharesOf(starved.map(([id]) => id)) : [];
    const meta = new Map();
    shares.forEach(([id, by], i) => {
      const p = starved[i][1];
      const pots = {};
      for (const a in by) pots[a] = (pots[a] || 0n) + (p * BigInt(by[a])) / 10000n;
      meta.set(id, { slots: Object.keys(by).length || 1, pots });
    });
    const minSwap = toBig(await F.call(CFG.engine, SEL.minSwap, true)) || 500000000000000n;
    const floor = (minSwap * 12n) / 10n;
    const plan = planSweep(starved, meta, floor, { slotsMax: SW.slotsMax, idsMax: SW.idsMax, chunksMax: SW.chunksMax, stockFloor: minSwap, assetChunksMax: SW.assetChunksMax, txMin: TXMIN, overdue: new Set() });
    // the public number: pay gathered in the USDG-bound batch, against SWEEP_TX_MIN
    let gathered = 0n, mainBrokers = 0;
    for (const [id, p] of starved) { const m = meta.get(id); if (!m || m.pots[USDG] > 0n) { gathered += p; mainBrokers++; } }
    const mainSends = plan.send.some((c) => c.asset === undefined);
    // each non-USDG asset anyone over the line is waiting on: its pot against the engine's floor
    const assets = [];
    const seen = new Set();
    for (const c of plan.send.concat(plan.skipped)) {
      if (c.asset === undefined || seen.has(c.asset)) continue;
      seen.add(c.asset);
      let pot = 0n, n = 0;
      for (const [id] of starved) { const m = meta.get(id); if (m && m.pots[c.asset] > 0n) { pot += m.pots[c.asset]; n++; } }
      assets.push({ asset: c.asset, pot, brokers: n, sends: plan.send.some((x) => x.asset === c.asset) });
    }
    // the rate: fees per hour over the last two days, and the weight they are shared by
    let potPerHour = 0n;
    try {
      const head = await F.blockNumber();
      const logs = await F.rpcLogsRange({ address: CFG.engine, topics: [TOPIC_SETTLED] }, Math.max(CFG.deployBlock, head - 1_700_000), head, 0, true);
      let sum = 0n, lo = Infinity, hi = 0;
      for (const l of logs || []) { sum += big(l.data, 0); const r = Number(BigInt(l.topics[1])); lo = Math.min(lo, r); hi = Math.max(hi, r); }
      if (hi >= lo) potPerHour = sum / BigInt(Math.max(1, hi - lo + 1));
    } catch (e) { potPerHour = 0n; }
    const totalWeight = toBig(await F.call(CFG.engine, SEL.totalWeight, true));
    try { S.meta = await F.assetMeta(); } catch (e) {}
    return { v: 1, at: Date.now(), waiting: starved.length, mainBrokers, gathered, mainSends, assets, potPerHour, totalWeight, minSwap, max };
  }

  async function load(force) {
    if (!force && S.summary && Date.now() - S.summary.at < TTL) return S.summary;
    if (!force) { const c = readCache(); if (c) { S.summary = thaw(c); return S.summary; } }
    if (S.loading) return S.loading;
    S.loading = (async () => {
      try { const s = await build(); S.summary = s; writeCache(freeze(s)); return s; }
      finally { S.loading = null; }
    })();
    return S.loading;
  }
  const summary = () => S.summary || (S.summary = (readCache() ? thaw(readCache()) : null));

  // ---------------------------------------------------------------- words
  /// the machine's button line, at most 20 characters of the display font
  function summaryLine() {
    const s = summary();
    if (!s) return "";
    if (s.mainSends) return "AUTO PAY SENDS AT :" + String(SW.afterSec / 60).padStart(2, "0");
    return `AUTO PAY ${fmtEth(s.gathered, 3)}/${fmtEth(TXMIN, 2)}`;
  }
  /// a broker's own line: where he stands against the keeper's per-broker
  /// line, and how long at today's rate
  function brokerText(b) {
    if (!b || !b.active) return "";
    const s = summary();
    const pending = b.pending || 0n;
    const line = `${fmtEth(MIN, 3)} ETH`;
    if (pending >= MIN) {
      if (!s) return `over the ${line} line · rides the next auto payday`;
      return s.mainSends ? `over the ${line} line · rides the auto payday at :${String(SW.afterSec / 60).padStart(2, "0")}` : `over the ${line} line · rides the auto payday once the batch reaches ${fmtEth(TXMIN, 2)} ETH, within ${SW.maxWaitRounds} h`;
    }
    let eta = "";
    if (s && s.potPerHour > 0n && s.totalWeight > 0n && b.weight > 0) {
      const perHour = (s.potPerHour * BigInt(b.weight)) / s.totalWeight;
      if (perHour > 0n) {
        const hours = Number((MIN - pending) / perHour) + 1;
        eta = hours < 36 ? ` · about ${hours} h at today's rate` : ` · about ${Math.round(hours / 24)} days at today's rate`;
      }
    }
    return `auto pays at ${line} · has ${fmtEth(pending, 4)}${eta} · or press PAYDAY`;
  }
  const brokerRow = (b) => { const t = brokerText(b); if (!t) return ""; if (!summary()) load().catch(() => {}); return `<div><span>auto pay</span><i>${esc(t)}</i></div>`; };

  // ---------------------------------------------------------------- the popover
  function closeIt() { const p = document.getElementById("fb-popover"); if (p) p.remove(); }
  function openPopover(brokers) {
    closeIt();
    const pop = el("div", "fb-popover");
    pop.id = "fb-popover";
    pop.addEventListener("click", (e) => { if (e.target === pop) closeIt(); });
    const card = el("div", "fb-broker working fb-autopay");
    const paint = () => {
      const s = summary();
      const mine = (brokers || []).filter((b) => b.active);
      const rows = [];
      rows.push(`<div><span>the rule</span><i>every hour after :${String(SW.afterSec / 60).padStart(2, "0")} the keeper pays every broker holding ${fmtEth(MIN, 3)} ETH or more, once the batch holds ${fmtEth(TXMIN, 2)} ETH, or ${SW.maxWaitRounds} h after the first one crossed the line. The firm pays that gas.</i></div>`);
      if (!s) rows.push(`<div><span>gathered</span><i>reading the floor…</i></div>`);
      else {
        rows.push(`<div><span>gathered</span><i><b>${fmtEth(s.gathered, 4)} of ${fmtEth(TXMIN, 2)} ETH</b> · ${s.mainBrokers} broker${s.mainBrokers === 1 ? "" : "s"} over the line${s.mainSends ? ` · <b>sends at the next :${String(SW.afterSec / 60).padStart(2, "0")}</b>` : " · not yet full"}</i></div>`);
        for (const a of s.assets) rows.push(`<div><span>${esc(sym(a.asset))} pay</span><i>${fmtEth(a.pot, 4)} ETH · ${a.brokers} broker${a.brokers === 1 ? "" : "s"}${a.sends ? " · clears with the next payday" : a.pot < s.minSwap ? ` · under the ${fmtEth(s.minSwap, 4)} ETH swap floor` : ` · waits for the ${fmtEth(TXMIN, 2)} ETH batch, ${SW.maxWaitRounds} h at most`}</i></div>`);
        rows.push(`<div><span>as of</span><i>${new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${s.waiting} broker${s.waiting === 1 ? "" : "s"} over the line on the whole floor</i></div>`);
      }
      if (mine.length) {
        rows.push(`<div><span>your brokers</span><i><b>${mine.length} on payroll</b></i></div>`);
        for (const b of mine.slice(0, 40)) rows.push(`<div><span>#${b.id}</span><i>${esc(brokerText(b))}</i></div>`);
        if (mine.length > 40) rows.push(`<div><span>…</span><i>and ${mine.length - 40} more</i></div>`);
      }
      rows.push(`<div><span>press payday</span><i>pays your brokers now, whatever the batch holds; you pay that transaction's gas. A slice under the swap floor rides the next payday either way — nothing is ever lost.</i></div>`);
      card.innerHTML = `<header><div class="who"><b>AUTO PAYDAY</b><span>when the keeper pays, and where you stand</span></div><button class="fb-btn small ghost" id="pop-close">X</button></header>
        <div class="scr">${rows.join("")}</div>`;
      const x = card.querySelector("#pop-close");
      if (x) x.addEventListener("click", closeIt);
    };
    paint();
    pop.appendChild(card);
    document.body.appendChild(pop);
    load().then(() => { if (document.body.contains(card)) paint(); }).catch((e) => { const i = card.querySelector(".scr"); if (i) i.insertAdjacentHTML("beforeend", `<div><span>floor read</span><i>could not read every broker just now — try again in a minute</i></div>`); });
  }

  window.__AUTOPAY = { load, summary, summaryLine, brokerText, brokerRow, openPopover, planSweep, encodeAggregate3, decodeAggregate3 };
})();
