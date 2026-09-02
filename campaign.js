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
    trancheCount: "0x29dc62b4",
    optIn: "0x36130f00",
    optInMany: "0x7c4ebeee",
    optOut: "0x44dc6e1a",
    claim: "0x6ba4c138",
    symbol: "0x95d89b41",
    balanceOf: "0x70a08231",
  };

  const CSS = `
/* the campaign panel: a highlighted box in the broker's file, in the data
   font at a size a child can read, one thing per line */
.fb-camp{margin-top:12px;border:4px solid var(--gold-deep,#c9a237);background:rgba(201,162,55,.10);padding:12px 14px;
  font-family:var(--font-data,"VT323",monospace);font-size:22px;line-height:1.15;box-shadow:0 0 0 2px rgba(0,0,0,.35) inset}
.fb-camp header{display:grid;gap:4px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px dashed rgba(201,162,55,.55)}
.fb-camp header b{font-family:var(--font-display,"Press Start 2P",monospace);font-size:10px;letter-spacing:.06em;color:var(--gold-deep,#c9a237)}
.fb-camp header span{font-size:20px;opacity:.9}
.fb-camp .line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px dashed rgba(255,255,255,.18)}
.fb-camp .line:first-of-type{border-top:0}
.fb-camp .line i{font-style:normal;font-size:26px;font-weight:700}
.fb-camp .line b{font-size:22px}
.fb-camp .line b.on{color:#9be36d}
.fb-camp .line b.off{opacity:.7}
.fb-camp .line b.no{color:#e0a15a}
.fb-camp .line b.lockd{opacity:.9}
.fb-camp .sub{opacity:.8;font-size:19px;margin-top:3px}
.fb-camp .fb-btn.small{font-size:11px;padding:10px 14px}
.fb-camp .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
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
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const cleanSymbol = (v) => (/^[A-Za-z0-9 _.$-]{1,16}$/.test(String(v || "")) ? String(v) : "?");
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
    if (s === 0) return "yours the moment it is earned";
    const d = Math.round(s / 86400);
    return `each hour's pay is yours ${d} day${d === 1 ? "" : "s"} later`;
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
    list.forEach((c, i) => { c.symbol = cleanSymbol(decodeString(syms[i])); });
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
    const claimed = slot && slot.length >= 322 ? BigInt("0x" + slot.slice(258, 322)) : 0n;
    return { holder: holder && /^0x0{40}$/.test(holder) ? null : holder, weight, earned: hexU(earned), released: hexU(released), claimed };
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
  // claim walks every tranche the holder has and prunes the finished ones
  // (~24k each), so the budget has to count them (audit F4).
  const claimTx = async (F, c, ids, from) => {
    const n = Number(hexU(await F.call(c.address, SEL.trancheCount + F.word(from))));
    return F.send(c.address, SEL.claim + F.word(32) + F.word(ids.length) + ids.map((i) => F.word(i)).join(""), 0n, from, 200_000 + 120_000 * ids.length + 40_000 * n);
  };

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
    box.dataset.kind = "rows";
    box.innerHTML = `<header><b>EXTRA PAYCHECK</b><span>A partner pays him in their token, on top of his wage. Free to join.</span></header>`;
    const holderBox = card.querySelector('.fb-camp[data-kind="holder"]');
    if (holderBox) card.insertBefore(box, holderBox); else card.appendChild(box);
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
        status.textContent = b.active ? "HE IS IN, EARNING" : "IN, BUT NOT CLOCKED IN";
      } else {
        status.className = "off";
        status.textContent = "NOT IN YET";
      }
      info.innerHTML = `<i>${esc(c.symbol)}</i> `;
      info.appendChild(status);
      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = (mine && st ? `earned ${fmtUnits(st.earned)} ${c.symbol} so far · ` : "") + lockTxt + (c.minHold > 0n ? ` · you must hold ${fmtUnits(c.minHold)} ${c.symbol} to join and to claim` : "");
      info.appendChild(sub);
      line.appendChild(info);
      if (!state.account || (b.owner && state.account.toLowerCase() !== String(b.owner).toLowerCase())) continue;
      if (mine && st) {
        const cardBtn = document.createElement("button");
        cardBtn.className = "fb-btn small";
        cardBtn.textContent = "SHARE CARD";
        cardBtn.addEventListener("click", () => openCard(ctx, c, b, st).catch(() => {}));
        line.appendChild(cardBtn);
      }
      const btn = document.createElement("button");
      btn.className = "fb-btn small";
      btn.textContent = mine ? "LEAVE" : "JOIN";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        if (mine) {
          await txFlow(`leave ${c.symbol}`, () => optOutTx(F, c, b.id, state.account), () => brokerRows(ctx, b, pop, card));
        } else {
          await txFlow(`join ${c.symbol}`, () => optInTx(F, c, b.id, state.account), () => brokerRows(ctx, b, pop, card));
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
    box.dataset.kind = "holder";
    box.innerHTML = `<header><b>YOUR EXTRA PAY</b><span>What your brokers earned from partners. Claim it any time it is unlocked.</span></header>`;
    let any = false;
    for (const c of list) {
      const hs = await holderState(F, c, state.account, ids).catch(() => null);
      if (!hs) continue;
      if (hs.earned === 0n && c.status !== 2) continue;
      any = true;
      const line = document.createElement("div");
      line.className = "line";
      const info = document.createElement("div");
      info.innerHTML = `<i>${esc(c.symbol)}</i> <b class="${hs.claimable > 0n ? "on" : "lockd"}">${fmtUnits(hs.claimable)} ready to claim</b>
        <div class="sub">earned ${fmtUnits(hs.earned)} · still locked ${fmtUnits(hs.locked)} · ${delayText(c.delay)}${c.minHold > 0n && hs.balance < c.minHold ? ` · <b class="no">you must hold ${fmtUnits(c.minHold)} ${esc(c.symbol)} to claim</b>` : ""}</div>`;
      line.appendChild(info);
      // one signature for every hired broker of theirs that is not in yet
      if (c.status === 2 && !(c.minHold > 0n && hs.balance < c.minHold)) {
        const mine = (state.brokers || []).filter((x) => x.active);
        const states = await Promise.all(mine.map((x) => brokerState(F, c, x.id).catch(() => null)));
        const out = mine.filter((x, i) => !(states[i] && states[i].holder && states[i].holder.toLowerCase() === state.account.toLowerCase()));
        if (out.length > 1) {
          const all = document.createElement("button");
          all.className = "fb-btn small";
          all.textContent = `JOIN WITH ALL ${out.length}`;
          all.addEventListener("click", async () => {
            all.disabled = true;
            await txFlow(`join ${c.symbol} with ${out.length} brokers`, () => optInManyTx(F, c, out.map((x) => x.id), state.account), () => { box.remove(); holderCard(ctx, container); });
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

  // ---------------------------------------------------------------- the share card
  /// A 1200x675 card from real numbers: the broker's portrait and number, the
  /// token, earned / claimable / still working, the release rule, time left.
  /// Drawn in the browser; the holder downloads it and attaches it to the post
  /// the SHARE button prepares. No claim about price, nothing paid for.
  function renderCard(d) {
    const W = 1200, H = 675;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.fillStyle = "#15171A"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#C9A237"; g.fillRect(0, 0, W, 6);
    // portrait, pixel-exact scaling
    const px = 300, x0 = 70, y0 = 110;
    g.fillStyle = "#0f1113"; g.fillRect(x0 - 10, y0 - 10, px + 20, px + 20);
    g.fillStyle = "#C9A237"; g.fillRect(x0 - 12, y0 - 12, px + 24, 2); g.fillRect(x0 - 12, y0 + px + 10, px + 24, 2);
    if (d.img) { g.imageSmoothingEnabled = false; g.drawImage(d.img, x0, y0, px, px); }
    const mono = "'Menlo', 'Courier New', monospace";
    const dot = " \u00b7 ";
    g.fillStyle = "#C9A237"; g.font = "bold 22px " + mono;
    g.fillText("FIRM BROKERS" + dot + "SPONSORED PAYROLL", 70, 66);
    g.fillStyle = "#F4F3EF"; g.font = "bold 40px " + mono;
    g.fillText(`MY BROKER #${d.id}`, 420, 150);
    g.fillText(`CLOCKED INTO $${d.symbol}`, 420, 198);
    const rows = [["EARNED", d.earned], ["CLAIMABLE", d.claimable], ["STILL WORKING", d.locked]];
    let y = 262;
    for (const [k, v] of rows) {
      g.fillStyle = "#878C93"; g.font = "20px " + mono; g.fillText(k, 420, y);
      g.fillStyle = "#F4F3EF"; g.font = "bold 36px " + mono; g.fillText(`${v} $${d.symbol}`, 420, y + 42);
      y += 96;
    }
    g.fillStyle = "#878C93"; g.font = "20px " + mono;
    g.fillText(d.release, 70, 566);
    g.fillText(d.remaining, 70, 596);
    g.fillStyle = "#4E535A"; g.font = "18px " + mono;
    g.fillText("bought on the open market, paid by the hour, on top of the wage", 70, 640);
    g.fillStyle = "#C9A237"; g.fillText("every number is on chain" + dot + "thefirmbrokers.com/campaign", 70, 664);
    return cv;
  }
  function timeLeft(ts) {
    const s = Number(ts) - Date.now() / 1000;
    if (s <= 0) return "distribution finished";
    const dd = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600);
    return `campaign time remaining: ${dd ? dd + "d " : ""}${hh}h`;
  }
  async function openCard(ctx, c, b, st) {
    ensureCss();
    const d = {
      id: b.id, symbol: c.symbol,
      earned: fmtUnits(st.earned), claimable: fmtUnits(st.released > st.claimed ? st.released - st.claimed : 0n), locked: fmtUnits(st.earned > st.released ? st.earned - st.released : 0n),
      release: c.delay > 0n ? `release: ${delayText(c.delay)}` : "release: unlocks as it is earned",
      remaining: timeLeft(c.distributionEnd), img: null,
    };
    try {
      d.img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `art/images/${b.artwork}.png`; });
    } catch (e) { d.img = null; }
    const cv = renderCard(d);
    const wrap = document.createElement("div");
    wrap.className = "fb-camp";
    wrap.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;max-width:min(92vw,640px);background:#15171A;padding:12px";
    const caption = `MY BROKER #${b.id} CLOCKED INTO $${c.symbol}\nEarned: ${d.earned}\nClaimable: ${d.claimable}\nStill working: ${d.locked}\n${location.origin}/campaign?c=${c.address}`;
    wrap.innerHTML = `<header><b>HIS CARD</b><span>real numbers, drawn now</span></header>`;
    cv.style.cssText = "width:100%;height:auto;display:block;image-rendering:pixelated";
    wrap.appendChild(cv);
    const row = document.createElement("div");
    row.className = "line";
    const dl = document.createElement("a");
    dl.className = "fb-btn small"; dl.textContent = "DOWNLOAD PNG"; dl.download = `broker-${b.id}-${c.symbol}.png`;
    cv.toBlob((blob) => { dl.href = URL.createObjectURL(blob); });
    const share = document.createElement("a");
    share.className = "fb-btn small"; share.textContent = "SHARE ON X"; share.target = "_blank"; share.rel = "noopener";
    share.href = "https://x.com/intent/post?text=" + encodeURIComponent(caption);
    const close = document.createElement("button");
    close.className = "fb-btn small"; close.textContent = "CLOSE";
    close.addEventListener("click", () => wrap.remove());
    row.appendChild(dl); row.appendChild(share); row.appendChild(close);
    wrap.appendChild(row);
    const hint = document.createElement("div");
    hint.className = "sub"; hint.textContent = "download the card, then attach it to the post the SHARE button opens";
    wrap.appendChild(hint);
    document.body.appendChild(wrap);
  }

  window.__CAMPAIGN = { load, brokerRows, holderCard, brokerState, holderState, fmtUnits, renderCard, openCard, ensureCss };
})();
