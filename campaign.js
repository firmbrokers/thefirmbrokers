/* ===========================================================================
   SPONSORED CAMPAIGNS — a partner's token, streamed as an extra paycheck on
   top of the wage, each hour's earnings unlocking a fixed delay later. Contract: src/Campaign.sol, registry:
   src/CampaignFactory.sol, spec: SPONSORED_CAMPAIGN_PLAN.md.

   Wired like auction.js: this file registers window.__CAMPAIGN and level.js
   calls it guarded, so a page with the old level.js, or without this file,
   still works. Everything is off until config.js carries `campaignFactory`.

   Two surfaces:
     brokerRows(ctx, b, pop, card)  — inside a broker's file: one row per
                                      running campaign: state + OPT IN / OUT.
     holderCard(ctx, container)     — for the connected wallet: per campaign,
                                      earned / still locked / claimable, CLAIM,
                                      and OPT IN ALL for the rest of the roster.

   Reads go through F.callBatch; writes through F.send with explicit gas.
   Token-agnostic: symbol comes off the chain; amounts are 18-decimals (the
   deploy gate refuses anything else).
   =========================================================================== */
(function () {
  "use strict";

  const SEL = {
    all: "0x10c4e8b0",
    status: "0x200d2ed2",
    token: "0xfc0c546a",
    startAt: "0xc7446565",
    distributionEnd: "0xefa90b54",
    delay: "0x6a42b8f8",
    days_: "0x81ef7339",
    minHold: "0xd471ed75",
    totalWeight: "0x96c82e57",
    totalTokensBought: "0xbaa9e531",
    totalEthSpent: "0x92d3b886",
    totalClaimed: "0xd54ad2a1",
    optedCount: "0xcfe8bb61",
    slots: "0x387dd9e9",
    earned: "0x4d6ed8c4",
    released: "0xa94d373b",
    summary: "0x8a331567",
    optIn: "0x36130f00",
    optInMany: "0x7c4ebeee",
    optOut: "0x44dc6e1a",
    claim: "0x6ba4c138",
    symbol: "0x95d89b41",
    balanceOf: "0x70a08231",
  };

  const CSS = `
.fb-camp{margin-top:8px;border:3px solid var(--ink);background:rgba(255,255,255,.06);padding:8px 10px;font-size:11px}
.fb-camp header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.fb-camp header b{letter-spacing:.06em}
.fb-camp header span{opacity:.75}
.fb-camp .line{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0;border-top:1px dashed rgba(255,255,255,.18)}
.fb-camp .line:first-of-type{border-top:0}
.fb-camp .line i{font-style:normal;opacity:.8}
.fb-camp .line b.on{color:#9be36d}
.fb-camp .line b.off{opacity:.6}
.fb-camp .line b.no{color:#e0a15a}
.fb-camp .sub{opacity:.7;font-size:10px;margin-top:2px}
.fb-camp .lockd{opacity:.85}
`;

  let cssDone = false;
  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const hexU = (h) => (h && h.length >= 66 ? BigInt(h.slice(0, 66)) : 0n);
  const hexAddr = (h) => (h && h.length >= 66 ? "0x" + h.slice(26, 66) : null);
  function decodeString(hex) {
    try {
      if (!hex || hex.length < 130) return "";
      const len = Number(BigInt("0x" + hex.slice(66, 130)));
      const bytes = hex.slice(130, 130 + len * 2);
      return decodeURIComponent(bytes.replace(/(..)/g, "%$1"));
    } catch (e) {
      return "";
    }
  }
  function fmtUnits(v, dec) {
    const d = BigInt(dec || 18);
    const whole = v / 10n ** d;
    const frac = v % 10n ** d;
    if (whole >= 1000n) return whole.toLocaleString("en-US");
    const f = frac.toString().padStart(Number(d), "0").slice(0, whole >= 10n ? 1 : 3).replace(/0+$/, "");
    return whole.toString() + (f ? "." + f : "");
  }
  function fmtDate(ts) {
    const dt = new Date(Number(ts) * 1000);
    return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function daysLeft(ts) {
    const s = Number(ts) - Date.now() / 1000;
    if (s <= 0) return "now";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return Math.round(s / 3600) + " h";
    return Math.round(s / 86400) + " d";
  }
  // 0 pending review · 1 approved, not started · 2 distributing · 3 releasing · 4 done
  const STATUS = ["pending review", "starts soon", "distributing", "releasing", "done"];
  function delayText(sec) {
    const s = Number(sec);
    if (s === 0) return "unlocks as it is earned";
    const d = Math.round(s / 86400);
    return `each hour's pay unlocks ${d} day${d === 1 ? "" : "s"} later`;
  }

  // ---------------------------------------------------------------- reads
  let cache = { at: 0, list: [] };

  async function load(F, CFG, force) {
    if (!CFG.campaignFactory) return [];
    if (!force && Date.now() - cache.at < 60_000) return cache.list;
    const raw = await F.call(CFG.campaignFactory, SEL.all, true);
    if (!raw || raw.length < 130) return (cache = { at: Date.now(), list: [] }).list;
    const n = Number(BigInt("0x" + raw.slice(66, 130)));
    const addrs = [];
    for (let i = 0; i < n; i++) addrs.push("0x" + raw.slice(130 + i * 64 + 24, 130 + (i + 1) * 64));
    const fields = ["status", "token", "startAt", "distributionEnd", "delay", "days_", "minHold", "totalWeight", "totalTokensBought", "totalEthSpent", "totalClaimed", "optedCount"];
    const probes = [];
    for (const a of addrs) for (const f of fields) probes.push({ to: a, data: SEL[f] });
    const res = await F.callBatch(probes);
    const list = [];
    for (let i = 0; i < addrs.length; i++) {
      const r = (k) => res[i * fields.length + k];
      const c = {
        address: addrs[i],
        status: Number(hexU(r(0))),
        token: hexAddr(r(1)),
        startAt: hexU(r(2)),
        distributionEnd: hexU(r(3)),
        delay: hexU(r(4)),
        days: Number(hexU(r(5))),
        minHold: hexU(r(6)),
        totalWeight: hexU(r(7)),
        totalTokensBought: hexU(r(8)),
        totalEthSpent: hexU(r(9)),
        totalClaimed: hexU(r(10)),
        optedCount: Number(hexU(r(11))),
        symbol: "?",
      };
      list.push(c);
    }
    const syms = await F.callBatch(list.map((c) => ({ to: c.token, data: SEL.symbol })));
    list.forEach((c, i) => { c.symbol = decodeString(syms[i]) || "?"; });
    cache = { at: Date.now(), list };
    return list;
  }

  async function brokerState(F, c, id) {
    const [slot, earned, released] = await F.callBatch([
      { to: c.address, data: SEL.slots + F.word(id) },
      { to: c.address, data: SEL.earned + F.word(id) },
      { to: c.address, data: SEL.released + F.word(id) },
    ]);
    const holder = slot && slot.length >= 130 ? "0x" + slot.slice(26, 66) : null;
    const weight = slot && slot.length >= 130 ? BigInt("0x" + slot.slice(66, 130)) : 0n;
    return { holder: holder && /^0x0{40}$/.test(holder) ? null : holder, weight, earned: hexU(earned), released: hexU(released) };
  }

  /// summary(holder, ids) -> (earned in total, unlocked so far, claimable now)
  async function holderState(F, c, account, ids) {
    const data = SEL.summary + F.word(account) + F.word(64) + F.word(ids.length) + ids.map((i) => F.word(i)).join("");
    const [sum, bal] = await F.callBatch([
      { to: c.address, data },
      { to: c.token, data: SEL.balanceOf + F.word(account) },
    ]);
    const w = (i) => (sum && sum.length >= 2 + 64 * (i + 1) ? BigInt("0x" + sum.slice(2 + 64 * i, 2 + 64 * (i + 1))) : 0n);
    const earned = w(0), unlocked = w(1), claimable = w(2);
    return { earned, unlocked, claimable, locked: earned - unlocked, balance: hexU(bal) };
  }

  // ---------------------------------------------------------------- writes
  const optInTx = (F, c, id, from) => F.send(c.address, SEL.optIn + F.word(id), 0n, from, 350_000);
  const optOutTx = (F, c, id, from) => F.send(c.address, SEL.optOut + F.word(id), 0n, from, 250_000);
  const optInManyTx = (F, c, ids, from) =>
    F.send(c.address, SEL.optInMany + F.word(32) + F.word(ids.length) + ids.map((i) => F.word(i)).join(""), 0n, from, 200_000 + 250_000 * ids.length);
  const claimTx = (F, c, ids, from) =>
    F.send(c.address, SEL.claim + F.word(32) + F.word(ids.length) + ids.map((i) => F.word(i)).join(""), 0n, from, 200_000 + 120_000 * ids.length);

  // ---------------------------------------------------------------- surfaces
  /// Inside a broker's file. `b` is the level's broker object (id, active,
  /// owner). Renders nothing when no campaign is running.
  async function brokerRows(ctx, b, pop, card) {
    const { F, CFG, state, txFlow } = ctx;
    if (!CFG.campaignFactory) return;
    ensureCss();
    let list;
    try { list = await load(F, CFG); } catch (e) { return; }
    const running = list.filter((c) => c.status === 2);
    if (!running.length) return;
    const box = document.createElement("div");
    box.className = "fb-camp";
    box.innerHTML = `<header><b>CAMPAIGNS</b><span>an extra paycheck in a partner's token, on top of his wage</span></header>`;
    card.appendChild(box);
    for (const c of running) {
      const line = document.createElement("div");
      line.className = "line";
      box.appendChild(line);
      const st = await brokerState(F, c, b.id).catch(() => null);
      const mine = st && st.holder && state.account && st.holder.toLowerCase() === state.account.toLowerCase();
      const lockTxt = delayText(c.delay);
      const info = document.createElement("div");
      const status = document.createElement("b");
      if (mine) {
        status.className = "on";
        status.textContent = b.active ? "EARNING" : "OPTED IN · not clocked in";
      } else {
        status.className = "off";
        status.textContent = "NOT OPTED IN";
      }
      info.innerHTML = `<i>${c.symbol}</i> `;
      info.appendChild(status);
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = (mine && st ? `earned ${fmtUnits(st.earned)} ${c.symbol}, ${fmtUnits(st.released)} unlocked · ` : "") + lockTxt + (c.minHold > 0n ? ` · hold ≥ ${fmtUnits(c.minHold)} ${c.symbol} to join and to claim` : "");
      info.appendChild(sub);
      line.appendChild(info);
      if (!state.account || (b.owner && state.account.toLowerCase() !== String(b.owner).toLowerCase())) continue;
      const btn = document.createElement("button");
      btn.className = "fb-btn small";
      btn.textContent = mine ? "OPT OUT" : "OPT IN";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        if (mine) {
          await txFlow(`opt out of ${c.symbol}`, () => optOutTx(F, c, b.id, state.account), () => brokerRows(ctx, b, pop, card));
        } else {
          await txFlow(`opt into ${c.symbol}`, () => optInTx(F, c, b.id, state.account), () => brokerRows(ctx, b, pop, card));
        }
        box.remove();
      });
      line.appendChild(btn);
    }
  }

  /// For the connected wallet: per campaign that has anything for it.
  async function holderCard(ctx, container) {
    const { F, CFG, state, txFlow } = ctx;
    if (!CFG.campaignFactory || !state.account) return;
    ensureCss();
    let list;
    try { list = await load(F, CFG); } catch (e) { return; }
    if (!list.length) return;
    const ids = (state.brokers || []).map((x) => x.id);
    const box = document.createElement("div");
    box.className = "fb-camp";
    box.innerHTML = `<header><b>YOUR CAMPAIGN PAY</b><span>bought on the open market, paid by weight, released hour by hour</span></header>`;
    let any = false;
    for (const c of list) {
      const hs = await holderState(F, c, state.account, ids).catch(() => null);
      if (!hs) continue;
      if (hs.earned === 0n && c.status !== 2) continue;
      any = true;
      const line = document.createElement("div");
      line.className = "line";
      const info = document.createElement("div");
      info.innerHTML = `<i>${c.symbol}</i> <b class="${hs.claimable > 0n ? "on" : "lockd"}">${fmtUnits(hs.claimable)} ${c.symbol} claimable</b>
        <div class="sub">earned ${fmtUnits(hs.earned)} · still locked ${fmtUnits(hs.locked)} · ${STATUS[c.status]} · ${delayText(c.delay)}${c.minHold > 0n && hs.balance < c.minHold ? ` · <b class="no">hold ≥ ${fmtUnits(c.minHold)} ${c.symbol} to claim</b>` : ""}</div>`;
      line.appendChild(info);
      // one signature for every hired broker of theirs that is not in yet
      if (c.status === 2 && !(c.minHold > 0n && hs.balance < c.minHold)) {
        const mine = (state.brokers || []).filter((x) => x.active);
        const states = await Promise.all(mine.map((x) => brokerState(F, c, x.id).catch(() => null)));
        const out = mine.filter((x, i) => !(states[i] && states[i].holder && states[i].holder.toLowerCase() === state.account.toLowerCase()));
        if (out.length > 1) {
          const all = document.createElement("button");
          all.className = "fb-btn small";
          all.textContent = `OPT IN ALL ${out.length}`;
          all.addEventListener("click", async () => {
            all.disabled = true;
            await txFlow(`opt ${out.length} brokers into ${c.symbol}`, () => optInManyTx(F, c, out.map((x) => x.id), state.account), () => { box.remove(); holderCard(ctx, container); });
          });
          line.appendChild(all);
        }
      }
      if (hs.claimable > 0n && !(c.minHold > 0n && hs.balance < c.minHold)) {
        const btn = document.createElement("button");
        btn.className = "fb-btn small";
        btn.textContent = "CLAIM";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          await txFlow(`claim ${c.symbol}`, () => claimTx(F, c, ids, state.account), () => { box.remove(); holderCard(ctx, container); });
        });
        line.appendChild(btn);
      }
      box.appendChild(line);
    }
    if (any) container.appendChild(box);
  }

  window.__CAMPAIGN = { load, brokerRows, holderCard, brokerState, holderState, fmtUnits };
})();
