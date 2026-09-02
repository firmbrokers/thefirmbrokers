// THE MARKET — every listed broker with his real level next to the price,
// and one card per broker that says, in a glance, what he is worth.
//
// Reads only. Listings come from the firm-market worker (CFG.marketApi, which
// holds the OpenSea key); level, merge, pay and history come straight from
// the contracts through the same batched eth_call / topic-filtered log paths
// the trading floor uses. Nothing here connects a wallet or sends anything.
(() => {
  const F = window.Firm;
  const CFG = F.CFG;
  const { SEL, word, toBig } = F;
  const $ = (s) => document.querySelector(s);
  const TIERS = [
    { name: "INTERN", burn: 25000n * 10n ** 18n, mult: "1.0x", level: 1 },
    { name: "ANALYST", burn: 75000n * 10n ** 18n, mult: "1.4x", level: 2 },
    { name: "MANAGER", burn: 150000n * 10n ** 18n, mult: "1.9x", level: 3 },
    { name: "VP", burn: 300000n * 10n ** 18n, mult: "2.5x", level: 4 },
    { name: "CEO", burn: 850000n * 10n ** 18n, mult: "3.5x", level: 5 },
  ];
  const tierOf = (burned) => { if (!burned || burned === 0n) return null; let t = TIERS[0]; for (const x of TIERS) if (burned >= x.burn) t = x; return t; };
  const LEGENDARY_MAX_ART = 10;
  const isLegendary = (s) => !!s && s.artwork >= 1 && s.artwork <= LEGENDARY_MAX_ART;
  // what he earns once hired, in intern units: a hired broker is his weight;
  // a never-hired one starts at level 1 (every bought broker is hired once)
  const potential = (s) => (!s || s.gone || s.failed ? 0 : s.tierBurned > 0n ? s.weight : 100 * (isLegendary(s) ? 1.5 : 1));
  const osUrl = (id) => `https://opensea.io/item/robinhood/${CFG.nft}/${id}`;
  const pic = (art) => `${CFG.imageBase}/${art}.png`;
  const fmtEth = (s) => { const n = Number(s); return n >= 1 ? n.toFixed(3) : n.toFixed(4); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SEL_FUSED = "0xac36e815";
  const DASH = "—";

  // ------------------------------------------------------------ chain reads
  const FIELDS = ["tierBurned", "parts", "isActive", "weightOf", "artworkOf", "ownerOf"];
  const state = new Map();
  async function readBrokers(ids) {
    const want = ids.filter((id) => !state.has(id) || (Date.now() - state.get(id).at > 300_000));
    for (let i = 0; i < want.length; i += 6) { // 6 ids × 6 fields = 36 calls, one batch
      const slice = want.slice(i, i + 6);
      const reqs = [];
      for (const id of slice) for (const fn of FIELDS) reqs.push({ to: CFG.nft, data: SEL[fn] + word(id) });
      let res = null;
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try { res = await F.callBatch(reqs); } catch (e) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
      }
      if (!res) { slice.forEach((id) => state.set(id, { failed: true, at: 0 })); continue; }
      slice.forEach((id, k) => {
        const r = (n) => res[k * FIELDS.length + n];
        if (r(0) === null || r(0) === undefined) { state.set(id, { failed: true, at: 0 }); return; }
        const owner = r(5);
        const gone = !owner || owner === "0x" || /^0x0{64}$/.test(owner);
        state.set(id, { tierBurned: toBig(r(0)), parts: Number(toBig(r(1))) || 1, active: toBig(r(2)) === 1n, weight: Number(toBig(r(3))), artwork: Number(toBig(r(4))), gone, at: Date.now() });
      });
      if (i + 6 < want.length) renderRows();
    }
  }

  // hourly pay: the engine's last settled round gives ETH per weight-unit per hour
  let _round = null;
  async function roundRate() {
    if (_round) return _round;
    try {
      const head = await F.blockNumber();
      const logs = await F.rpcLogsRange({ address: CFG.engine, topics: ["0x866f813a2289b14a1e94be9b6a7db4b5ad759df3fb1466245f650642f3cc7a56"] }, Math.max(head - 120_000, CFG.deployBlock), "latest", 0, true);
      const last = logs[logs.length - 1];
      if (!last) return null;
      const pot = BigInt("0x" + last.data.slice(2, 66)), tw = BigInt("0x" + last.data.slice(66, 130));
      _round = tw > 0n ? { perWeight: pot / tw, pot, tw } : null; // wei per weight-unit per round
    } catch (e) { _round = null; }
    return _round;
  }
  let _stats = null;
  async function stats() { if (_stats) return _stats; try { _stats = await F.stats(); } catch (e) { _stats = {}; } return _stats; }
  const usd = (wei, px6) => (px6 ? Number((wei * px6) / 10n ** 18n) / 1e6 : null);

  async function readOne(id) {
    state.delete(id); // the card carries a block stamp: never serve it from the board's cache
    await readBrokers([id]);
    const s = state.get(id);
    if (!s || s.failed) return { failed: true };
    const meta = (await F.assetMeta().catch(() => null)) || {};
    const [pendRaw, splitRaw, fusedRaw, block, rr, st] = await Promise.all([
      F.callBatch([{ to: CFG.engine, data: SEL.pendingEth + word(id) }]).then((r) => r[0]).catch(() => null),
      F.callBatch([{ to: CFG.engine, data: SEL.splitOf + word(id) }]).then((r) => r[0]).catch(() => null),
      F.callBatch([{ to: CFG.nft, data: SEL_FUSED + word(id) }]).then((r) => r[0]).catch(() => null),
      F.blockNumber().catch(() => null),
      roundRate(), stats(),
    ]);
    // paid in: the split survives a transfer, so a buyer inherits it
    const split = [];
    if (splitRaw && splitRaw.length >= 2 + 64 * 7) {
      const b = splitRaw.slice(2); const count = Number(BigInt("0x" + b.slice(6 * 64, 7 * 64)));
      for (let k = 0; k < count; k++) split.push({ idx: Number(BigInt("0x" + b.slice(k * 64, (k + 1) * 64))), bps: Number(BigInt("0x" + b.slice((3 + k) * 64, (4 + k) * 64))) });
    }
    if (!split.length) split.push({ idx: 11, bps: 10000 });
    const paidIn = split.map((x) => ({ symbol: (meta[x.idx] || {}).symbol || `#${x.idx}`, pct: Math.round(x.bps / 100) }));
    // merged: the absorbed artworks, two 16-bit marks
    const marks = fusedRaw ? Number(toBig(fusedRaw)) : 0;
    const absorbed = [marks & 0xffff, (marks >>> 16) & 0xffff].filter((a) => a > 0);
    // history: first hire, last pay (topic-filtered, tiny result sets)
    let hiredAt = null, lastPaid = null, paidTotal = 0n;
    try {
      const t = "0x" + BigInt(id).toString(16).padStart(64, "0");
      const [act, del] = await Promise.all([
        F.rpcLogsRange({ address: CFG.nft, topics: [F.TOPICS.ACTIVATED, t] }, CFG.deployBlock, "latest", 0, true),
        F.rpcLogsRange({ address: CFG.engine, topics: [F.TOPICS.DELIVERED, t] }, CFG.deployBlock, "latest", 0, true),
      ]);
      if (act.length) hiredAt = Number(BigInt(act[0].blockNumber));
      if (del.length) { lastPaid = Number(BigInt(del[del.length - 1].blockNumber)); for (const g of del) paidTotal += BigInt("0x" + g.data.slice(2, 66)); }
    } catch (e) {}
    const perHour = rr && s.weight ? rr.perWeight * BigInt(s.weight) : rr ? rr.perWeight * BigInt(Math.round(potential(s))) : null;
    return { ...s, id, pending: pendRaw ? toBig(pendRaw) : null, paidIn, absorbed, hiredAt, lastPaid, paidTotal, block, perHour, px6: st.usdPerEth || null };
  }

  // artwork number → token id: a static file (verified 5,000 ↔ 5,000), chain only as fallback
  const ART_KEY = "firmbrokers.artmap.v1";
  let artMap = null; try { artMap = JSON.parse(localStorage.getItem(ART_KEY) || "null"); } catch (e) { artMap = null; }
  let artBuilding = null;
  async function buildArtMap() {
    if (artMap && artMap.__done) return artMap;
    if (artBuilding) return artBuilding;
    artBuilding = (async () => {
      try {
        const r = await fetch("artmap.json", { cache: "force-cache" });
        if (r.ok) { const m = await r.json(); if (m && Object.keys(m).length >= 5000) { m.__done = true; try { localStorage.setItem(ART_KEY, JSON.stringify(m)); } catch (e) {} artMap = m; return m; } }
      } catch (e) {}
      const map = artMap || {}; const have = {}; for (const k in map) if (k !== "__done") have[map[k]] = 1;
      for (let start = 1; start <= 5000; start += 40) {
        const ids = []; for (let id = start; id < start + 40 && id <= 5000; id++) if (!have[id]) ids.push(id);
        if (!ids.length) continue;
        let res; try { res = await F.callBatch(ids.map((id) => ({ to: CFG.nft, data: SEL.artworkOf + word(id) }))); } catch (e) { continue; }
        ids.forEach((id, k) => { if (res[k]) map[String(Number(toBig(res[k])))] = id; });
      }
      map.__done = true; try { localStorage.setItem(ART_KEY, JSON.stringify(map)); } catch (e) {} artMap = map; return map;
    })();
    return artBuilding;
  }

  // ------------------------------------------------------------ the book
  let book = null, sortBy = "price";
  const levelOf = (s) => (s && !s.failed ? tierOf(s.tierBurned) : null);
  const DEAL_EDGE = 1.3;
  const isBest = (x, s) => !!(s && !s.failed && !s.gone && book && book.floor && potential(s) > 100 && potential(s) / Number(x.price) >= DEAL_EDGE * (100 / Number(book.floor)));
  const cheapestByLevel = () => { const c = {}; if (!book) return c; for (const x of book.items) { const t = levelOf(state.get(x.id)); if (t && (!c[t.level] || Number(x.price) < c[t.level])) c[t.level] = Number(x.price); } return c; };
  async function loadBook() {
    const base = (CFG.marketApi || "").replace(/\/$/, "");
    if (!base) { $("#mk-stat").textContent = "LISTINGS OFF · LOOKUP WORKS"; tapeText(["FIRM BROKERS · THE MARKET"]); return; }
    try {
      const r = await fetch(base + "/listings", { headers: { Accept: "application/json" } });
      const j = await r.json(); if (!j.items) throw new Error(j.error || "no book"); book = j;
    } catch (e) { $("#mk-stat").innerHTML = '<span class="mk-err">LISTINGS UNAVAILABLE</span>'; tapeText(["FIRM BROKERS · THE MARKET · LISTINGS UNAVAILABLE"]); return; }
    renderStat(); renderRows(); tape();
    Promise.all([roundRate(), stats()]).then(() => renderRows()).catch(() => {});
    await readBrokers(book.items.map((x) => x.id));
    renderRows(); tape();
  }
  // what a row earns per hour, in the reader's money, once hired
  const hourly = (s) => {
    if (!_round || !s || s.failed || s.gone) return null;
    const wei = _round.perWeight * BigInt(Math.round(potential(s)));
    const px6 = (_stats || {}).usdPerEth;
    const u = usd(wei, px6);
    return u != null ? `$${u < 0.1 ? u.toFixed(3) : u.toFixed(2)}` : `${fmtEth(Number(wei / 10n ** 12n) / 1e6)} ETH`;
  };
  function renderStat() {
    const hh = new Date(book.at).toISOString().slice(11, 16);
    $("#mk-stat").textContent = `${book.count} LISTED · FLOOR ${fmtEth(book.floor)} ETH · ${hh} UTC`;
  }
  function tapeText(parts) { const t = parts.join("&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;") + "&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;"; $("#mk-tape").innerHTML = t + t; }
  function tape() {
    if (!book) return;
    const c = cheapestByLevel(); const parts = [`FLOOR ${fmtEth(book.floor)} ETH`, `${book.count} LISTED`];
    for (const t of TIERS) parts.push(c[t.level] ? `${t.name} <span class="up">▲</span> ${fmtEth(c[t.level])}` : `${t.name} <span class="dim">—</span>`);
    const best = book.items.filter((x) => isBest(x, state.get(x.id))).length;
    parts.push(best ? `<span class="up">★ ${best} BEST VALUE</span>` : `<span class="dim">no best value right now</span>`);
    parts.push(`prices from OpenSea ${new Date(book.at).toISOString().slice(11, 16)} UTC`);
    tapeText(parts);
  }
  const pips = (lvl) => `<span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lvl ? "on" : ""}"></i>`).join("")}</span>`;
  let shown = 12;
  function renderRows() {
    if (!book) return;
    const items = book.items.slice();
    if (sortBy === "level") items.sort((a, b) => potential(state.get(b.id)) - potential(state.get(a.id)) || Number(a.price) - Number(b.price));
    else if (sortBy === "value") items.sort((a, b) => potential(state.get(b.id)) / Number(b.price) - potential(state.get(a.id)) / Number(a.price));
    else items.sort((a, b) => Number(a.price) - Number(b.price));
    const rows = items.slice(0, shown).map((x) => {
      const s = state.get(x.id); const t = levelOf(s); const best = isBest(x, s);
      let lv;
      if (!s || s.failed) lv = `<span class="dim">${DASH}</span>`;
      else if (s.gone) lv = `<span class="dim">GONE</span>`;
      else if (!t) lv = `<span class="new">NEW</span>`;
      else lv = `${pips(t.level)}<span>L${t.level} ${t.name}</span><b class="x">×${(potential(s) / 100).toFixed(2).replace(/0$/, "")}</b>`;
      const marks = s && !s.failed ? `${s.parts >= 2 ? `<span class="mg">${s.parts} PARTS</span>` : ""}` : "";
      const led = !s || s.failed || s.gone || !t ? "" : `<i class="led ${s.active ? "on" : "off"}"></i>`;
      const img = s && !s.failed ? `<img loading="lazy" src="${pic(s.artwork)}" onerror="this.src='${CFG.sealedImage}'" alt="">` : `<img src="${CFG.sealedImage}" alt="">`;
      return `<a class="rw${best ? " bv" : ""}" href="${osUrl(x.id)}" rel="noopener" target="_blank">${img}<div class="who"><div class="id">${isLegendary(s) ? '<span class="star">★</span>' : ""}#${x.id}</div><div class="lv">${led}${lv}${marks}</div></div><div class="pr">${fmtEth(x.price)}<small>ETH</small>${best ? '<b class="bv">★</b>' : ""}</div></a>`;
    });
    $("#mk-rows").innerHTML = rows.join("") + (items.length > shown ? `<button type="button" class="more" id="mk-more">MORE · ${items.length - shown} LEFT</button>` : "");
    const more = $("#mk-more"); if (more) more.addEventListener("click", () => { shown += 24; renderRows(); });
  }
  document.querySelectorAll(".mk-board .tabs button").forEach((b) => b.addEventListener("click", () => { sortBy = b.dataset.sort; document.querySelectorAll(".mk-board .tabs button").forEach((o) => o.classList.toggle("on", o === b)); renderRows(); }));
  // the trading floor's empty desks arrive here with ?sort=value
  { const want = new URLSearchParams(location.search).get("sort");
    if (["price", "level", "value"].includes(want)) { sortBy = want; document.querySelectorAll(".mk-board .tabs button").forEach((o) => o.classList.toggle("on", o.dataset.sort === want)); } }

  // ------------------------------------------------------------ the card
  const ago = (blk, head) => { if (!blk || !head) return DASH; const h = Math.max(0, (head - blk) / 10 / 3600); return h < 1 ? "<1 h" : h < 48 ? `${Math.floor(h)} h` : `${Math.floor(h / 24)} d`; }; // floored: never a claim of more than the chain shows
  const moneyOf = (wei, px6) => { const u = wei != null ? usd(wei, px6) : null; return u != null ? `$${u < 0.1 ? u.toFixed(3) : u.toFixed(2)}` : wei != null ? `${fmtEth(Number(wei / 10n ** 12n) / 1e6)} ETH` : DASH; };
  function stairs(level, art) {
    // five steps, the broker on his; a never-hired broker stands on the floor
    const steps = [1, 2, 3, 4, 5].map((i) => `<i class="st s${i}${i <= level ? " on" : ""}"></i>`).join("");
    return `<div class="stairs">${steps}<img class="me p${Math.max(0, Math.min(5, level))}" src="${pic(art)}" alt=""></div>`;
  }
  function card(b, title, n, twin) {
    const t = tierOf(b.tierBurned);
    const listing = book ? book.items.find((x) => x.id === b.id) : null;
    const best = listing ? isBest(listing, state.get(b.id)) : false;
    const gone = b.gone, hired = b.tierBurned > 0n;
    const status = gone ? '<span class="st gone">MERGED AWAY</span>' : b.active ? '<span class="st on"><i class="led on"></i>EARNING</span>' : hired ? '<span class="st off"><i class="led off"></i>CLOCKED OUT</span>' : '<span class="st new"><i class="led none"></i>NEVER HIRED</span>';
    const absorbed = b.absorbed.length ? `<div class="busts">${b.absorbed.map((a) => `<img src="${pic(a)}" alt="">`).join("")}</div>` : "";
    const mult = gone ? DASH : `×${(potential(b) / 100).toFixed(2).replace(/0$/, "")}`;
    const line = gone || !hired ? "" : [b.hiredAt ? `${ago(b.hiredAt, b.block)} on payroll` : "", b.lastPaid ? `paid ${ago(b.lastPaid, b.block)} ago` : "never paid"].filter(Boolean).join(" · ");
    return `<article class="idc${gone ? " gone" : ""}${isLegendary(b) ? " leg" : ""}${best ? " best" : ""}" id="card-${b.id}">
      <div class="head"><h2>${title}</h2>${status}</div>
      <div class="stats">
        <div class="cell"><div class="k">LEVEL</div><div class="num">${gone ? DASH : t ? `${t.level}<small>${t.name}</small>` : `1<small>WHEN HIRED</small>`}</div></div>
        <div class="cell main"><div class="k">MULTIPLIER</div><div class="num${mult.length >= 6 ? " long" : ""}">${mult}</div></div>
        <div class="cell"><div class="k">MERGED</div><div class="num">${gone ? DASH : b.parts >= 2 ? `${b.parts}<small>PARTS</small>` : `<span class="no">NO</span>`}</div></div>
      </div>
      <div class="pic"><div class="frame"><img src="${pic(b.artwork)}" onerror="this.src='${CFG.sealedImage}'" alt="">${isLegendary(b) ? '<span class="ribbon">LEGENDARY</span>' : ""}</div>${absorbed}</div>
      <div class="lvl">${gone ? '<div class="lbl">this token was merged into another broker</div>' : stairs(t ? t.level : 0, b.artwork)}</div>
      <div class="price">${gone ? '<span class="pv dim">—</span>' : listing ? `<span class="pv">${fmtEth(listing.price)} ETH${best ? '<b class="bv">★ BEST VALUE</b>' : ""}</span><a class="osbtn" href="${osUrl(b.id)}" rel="noopener" target="_blank">OPENSEA →</a>` : `<span class="pv dim">NOT LISTED</span><a class="osbtn ghost" href="${osUrl(b.id)}" rel="noopener" target="_blank">OPENSEA →</a>`}</div>
      ${line ? `<div class="line">${esc(line)}</div>` : ""}
      <div class="stamp"><span>thefirmbrokers.com/market · token #${b.id} · block ${b.block || DASH} · ${new Date().toISOString().slice(11, 16)} UTC</span><button type="button" class="copy" data-id="${n}">COPY</button></div>
      ${twin ? `<button type="button" class="twin" data-twin="${twin.id}">${twin.label}</button>` : ""}
    </article>`;
  }
  async function lookup(raw, asToken) {
    const cardEl = $("#mk-card");
    const n = Number(String(raw).replace(/[^0-9]/g, ""));
    if (!n || n < 1 || n > 5000) { cardEl.hidden = false; cardEl.innerHTML = '<p class="mk-msg err">A NUMBER BETWEEN 1 AND 5000</p>'; return; }
    cardEl.hidden = false; cardEl.innerHTML = '<p class="mk-msg">READING THE CHAIN…</p>';
    history.replaceState(null, "", `?id=${n}${asToken ? "&token=1" : ""}`);
    // OpenSea's number first — it is the one on the listing a buyer is looking
    // at; the same digits as a token id are a different broker, one click away
    const m = await buildArtMap();
    const artToken = m[String(n)];
    const showToken = asToken || !artToken;
    const id = showToken ? n : artToken;
    const b = await readOne(id);
    if (!b || b.failed) { cardEl.innerHTML = '<p class="mk-msg err">COULDN\'T READ THE CHAIN · TRY AGAIN</p>'; return; }
    let twin = null;
    if (!showToken && artToken !== n) twin = { id: n, label: `LOOKING FOR TOKEN #${n}? →` };
    else if (showToken && artToken && artToken !== n) twin = { id: n, label: `LOOKING FOR OPENSEA'S #${n}? →`, back: true };
    cardEl.innerHTML = card(b, `FIRM BROKER #${b.artwork}`, n, twin);
    const tw = cardEl.querySelector(".twin"); if (tw) tw.addEventListener("click", () => lookup(n, !showToken));
    cardEl.querySelectorAll(".copy").forEach((btn) => btn.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}?id=${btn.dataset.id}${showToken ? "&token=1" : ""}`;
      try { await navigator.clipboard.writeText(url); btn.textContent = "COPIED"; } catch (e) { btn.textContent = url; }
      setTimeout(() => { btn.textContent = "COPY"; }, 1500);
    }));
  }
  $("#mk-form").addEventListener("submit", (e) => { e.preventDefault(); lookup($("#mk-q").value); });
  $("#mk-q").addEventListener("paste", (e) => { const t = (e.clipboardData || window.clipboardData).getData("text"); const d = t.replace(/[^0-9]/g, "").slice(0, 4); if (d) { e.preventDefault(); $("#mk-q").value = d; lookup(d); } });
  const qs = new URLSearchParams(location.search); const q = qs.get("id") || (location.hash.match(/^#(\d+)$/) || [])[1];
  if (q) { document.body.classList.add("deep"); $("#mk-q").value = q; lookup(q, qs.get("token") === "1"); }
  loadBook();
})();
