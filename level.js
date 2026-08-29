// Firm Brokers — the level. A financial-district street with three buildings
// you actually walk into: HR (mint), the Trading Floor (your brokers), and
// the Bank (the money). Vanilla JS on purpose: the site stays a static folder.
(function () {
  const CFG = window.FIRM_CFG;
  const F = window.Firm;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const px = (node, styles) => { Object.assign(node.style, styles); return node; };

  const DEPLOYED = !!CFG.nft;
  // mirrors EmployeeNFT.WL_MAX_PER_WALLET / PUBLIC_MAX_PER_WALLET, which are
  // solidity constants and so can never move once deployed. The caps do NOT
  // stack (2026-08-24): a wallet gets 3, whether it mints on the list or in
  // public, and the count is cumulative — a listed wallet that took its 3
  // early has nothing left when the doors open. Connected wallets always show
  // the chain's own mintAllowance(), so these two only ever caption the phases.
  const WL_CAP = 3;
  const PUBLIC_CAP = 3;
  // `w` is EmployeeNFT.TIER_WEIGHT in the same basis points the contract uses,
  // so a promotion can be priced in the weight it actually adds rather than in
  // the headline multiplier, which ignores merge parts and the 1-of-1 bonus.
  //
  // `level` is the same rung counted rather than named. A job title tells you
  // what a broker is; a number tells you how far up he is and how far is left,
  // and the two together answer both without anybody having to learn the
  // ladder first. They are always shown as a pair.
  const TIERS = [
    { name: "Intern", burn: 25000n * 10n ** 18n, mult: "1.0x", w: 100, idx: 0, level: 1 },
    { name: "Analyst", burn: 75000n * 10n ** 18n, mult: "1.4x", w: 140, idx: 1, level: 2 },
    { name: "Manager", burn: 150000n * 10n ** 18n, mult: "1.9x", w: 190, idx: 2, level: 3 },
    { name: "VP", burn: 300000n * 10n ** 18n, mult: "2.5x", w: 250, idx: 3, level: 4 },
    { name: "CEO", burn: 850000n * 10n ** 18n, mult: "3.5x", w: 350, idx: 4, level: 5 },
  ];
  const MAX_LEVEL = TIERS.length;

  // ------------------------------------------------------------- the world
  const GROUND = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ground-h")) || 220;
  const ZONES = [
    { id: "lobby", name: "The Lobby", short: "LOBBY", does: "start here", x: 200, w: 1350, room: null },
    { id: "hr", name: "HR Desk", short: "HR", does: "mint a broker", x: 1700, w: 900, room: "hr" },
    { id: "floor", name: "Trading Floor", short: "FLOOR", does: "your brokers", x: 2750, w: 1000, room: "floor" },
    { id: "bank", name: "The Bank", short: "BANK", does: "the money", x: 3900, w: 1000, room: "bank" },
  ];
  const WORLD_W = 5300;
  /// THE ONE PLACE THE STARTING MARK IS WRITTEN DOWN. It was a literal in three
  /// places and moving it to the billboard's centre only updated two: warpTo
  /// still sent you to 290 when you pressed 1, so the zone bar's own button put
  /// you somewhere the street no longer starts. lobby.js composes the landing
  /// frame around the same number as PLAYER_X, and city.mjs asserts the two
  /// agree and that nothing here has gone back to a literal.
  const START_X = 860;   // dead centre under the billboard (540 + 640/2)
  const DOOR_AT = (z) => z.x + z.w / 2;

  function zoneLive(z) {
    // before anything is on chain the whole street is a walkthrough: every room
    // opens and runs on sample numbers, so the place can be shown and tested
    if (!DEPLOYED) return true;
    if (z.id === "bank") return state.tokenLive;
    return true;
  }

  const state = {
    x: START_X, y: 0, vx: 0, vy: 0, facing: 1,
    keys: {}, frozen: false, mode: "street", streetX: START_X, roomW: 0,
    cueKey: null, cueW: 0, thoughtW: 0, thoughtH: 0, agentLineW: 0, agentLineH: 0, agentLineL: 0, boothEl: null,
    tokenLive: false, mintOpen: false, stats: null,
    brokers: [], assetMeta: null, account: null,
    fusePick: new Set(), wheelVel: 0,
    // the trading floor: which three are out front, and the roster menu's own
    // state. The lineup itself lives in localStorage, keyed by wallet.
    rosterOpen: false, rosterPage: 0, rosterSlot: null, rosterPick: null,
    rosterSortId: false,
    // the bank's furnace: who is on the belt, and which rung is aimed at
    furnacePick: null, furnaceTier: null,
    // whose file is open, and what he looked like when it was drawn
    popBrokerId: null, popBrokerSig: null,
  };

  // ------------------------------------------------------------ formatting
  function fmtEth(wei, dp) {
    if (wei === null || wei === undefined) return "—";
    return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: dp ?? 4 });
  }
  function fmtCompact(wei) {
    const v = Number(wei) / 1e18;
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
    return v.toFixed(0);
  }
  function fmtUnits(amount, decimals) {
    const v = Number(amount) / Math.pow(10, decimals);
    return v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 6 : 2 });
  }
  function tierOf(burned) {
    let t = TIERS[0];
    for (const tier of TIERS) if (burned >= tier.burn) t = tier;
    return t;
  }
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

  function humanError(e) {
    const m = String(e?.shortMessage || e?.message || e || "").toLowerCase();
    if (m.includes("user rejected") || m.includes("denied")) return "you closed the wallet window";
    if (m.includes("insufficient funds")) return "not enough ETH in this wallet";
    if (m.includes("chain") || m.includes("network")) return "your wallet is on the wrong network";
    if (m.includes("soldout") || m.includes("sold out")) return "sold out. Every broker is minted";
    // custom errors reach us either decoded by the wallet or as raw selectors
    if (m.includes("notallowlisted") || m.includes("0x06fb10a9")) return "this wallet is not on the whitelist";
    if (m.includes("onlywallets") || m.includes("0x91d01199")) return "minting needs a regular wallet, not a smart-contract wallet";
    if (m.includes("nothired") || m.includes("0x1f32ed20")) return "hire him first: burn 25,000 $9TO5, then promote";
    if (m.includes("walletcapreached") || m.includes("0xc2c77a0e")) return "that is more than this wallet may mint";
    if (m.includes("mintclosed") || m.includes("0x589ed34b")) return "the mint is not open";
    const raw = String(e?.shortMessage || e?.message || e);
    return raw.length > 90 ? "the chain refused it. Try again in a moment" : raw;
  }

  function toast(msg, ok) {
    const t = $("fb-toast");
    t.textContent = msg;
    t.className = "fb-toast show" + (ok === false ? " bad" : "");
    clearTimeout(t._t);
    t._t = setTimeout(() => (t.className = "fb-toast"), 6000);
  }

  async function txFlow(label, fn, after) {
    try {
      toast(label + "…");
      const hash = await fn();
      toast("sent, waiting for the block…");
      await F.waitForTx(hash);
      toast(label + ": done", true);
      if (after) await after();
    } catch (e) {
      toast(humanError(e), false);
    }
  }

  // ------------------------------------------------------------- wallet
  const WALLET_KEY = "firmbrokers.wallet.v1";

  function openWalletPicker(list) {
    closePopover();
    const pop = popoverShell();
    const card = el("div", "fb-card");
    card.style.maxWidth = "360px";
    card.innerHTML = `<h2>PICK YOUR WALLET</h2><p>This browser has more than one.</p>`;
    const rows = el("div");
    rows.style.cssText = "display:grid;gap:8px;margin-top:12px";
    for (const w of list) {
      const b = el("button", "fb-walletbtn");
      b.innerHTML = `${w.info.icon ? `<img src="${w.info.icon}" alt="">` : ""}<span>${w.info.name}</span>`;
      b.addEventListener("click", () => {
        F.setProvider(w.provider);
        state.walletInfo = w.info;
        try { localStorage.setItem(WALLET_KEY, w.info.rdns); } catch (e) {}
        closePopover();
        doConnect();
      });
      rows.appendChild(b);
    }
    card.appendChild(rows);
    const cancel = el("button", "fb-btn small ghost", "CANCEL");
    cancel.style.marginTop = "12px";
    cancel.addEventListener("click", closePopover);
    card.appendChild(cancel);
    pop.appendChild(card);
    document.body.appendChild(pop);
  }

  /// navigator.clipboard only exists in a secure context, and this site is on
  /// plain http until the certificate lands, so fall back to the old selection
  /// trick rather than failing silently.
  async function copyText(text) {
    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = el("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  /// The address, and one tap to take the whole thing.
  function addressRow(addr) {
    const row = el("button", "fb-addr");
    row.type = "button";
    row.title = "copy the full address";
    row.innerHTML = `<span class="a">${short(addr)}</span><i class="cp"></i>`;
    const label = row.querySelector(".a");
    row.addEventListener("click", async () => {
      const ok = await copyText(addr);
      row.classList.add("done");
      label.textContent = ok ? "COPIED" : "PRESS CTRL C";
      if (!ok) row.classList.add("bad");
      clearTimeout(row._t);
      row._t = setTimeout(() => {
        row.classList.remove("done", "bad");
        label.textContent = short(addr);
      }, 1500);
    });
    return row;
  }

  function openWalletMenu() {
    closePopover();
    const pop = popoverShell();
    const card = el("div", "fb-card");
    card.style.maxWidth = "360px";
    card.innerHTML = `<h2>${state.walletInfo?.name || "WALLET"}</h2>`;
    card.appendChild(addressRow(state.account));
    const rows = el("div");
    rows.style.cssText = "display:grid;gap:8px;margin-top:12px";
    if (F.wallets().length > 1) {
      const sw = el("button", "fb-btn small", "SWITCH WALLET");
      sw.addEventListener("click", () => { closePopover(); openWalletPicker(F.wallets()); });
      rows.appendChild(sw);
    }
    const dc = el("button", "fb-btn small ghost", "CLOCK OUT (DISCONNECT)");
    dc.addEventListener("click", () => { closePopover(); disconnect(); });
    rows.appendChild(dc);
    const cancel = el("button", "fb-btn small ghost", "CANCEL");
    cancel.addEventListener("click", closePopover);
    rows.appendChild(cancel);
    card.appendChild(rows);
    pop.appendChild(card);
    document.body.appendChild(pop);
  }

  async function disconnect() {
    // best effort: ask the wallet to drop the permission too
    try { await F.provider()?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch (e) {}
    state.account = null;
    state.brokers = [];
    state.walletInfo = null;
    state.fusePick.clear();
    F.setProvider(null);
    try { localStorage.removeItem(WALLET_KEY); } catch (e) {}
    updateThought();
    if (state.mode !== "street") rebuildRoom();
    if (document.body.classList.contains("flat-mode")) buildFlat();
    toast("clocked out", true);
  }

  /// The site has to notice the wallet switching accounts: people keep their
  /// brokers in a second account and flip to it. Without this the site keeps
  /// the old address, shows its floor, and sends a transaction from an account
  /// the wallet is no longer on.
  function watchWallet(p) {
    if (!p || p._fbWatched || typeof p.on !== "function") return;
    p._fbWatched = true;
    try {
      p.on("accountsChanged", (accs) => {
        state.account = accs && accs.length ? accs[0] : null;
        state.brokers = [];
        updateThought();
        paintHud();
        if (state.mode !== "street") rebuildRoom();
        if (document.body.classList.contains("flat-mode")) buildFlat();
        refreshBrokers();
      });
      // the safe move on a network change is a clean slate
      p.on("chainChanged", () => location.reload());
    } catch (e) {}
  }

  /// Tapping your own walker. Connected already? Then this is the same menu the
  /// badge in the corner opens, rather than the list of wallets to connect with.
  function tapWalker() {
    if (state.account) { openWalletMenu(); return; }
    connect();
  }

  async function connect() {
    const list = F.wallets();
    if (!F.hasChosen()) {
      let remembered = null;
      try { remembered = localStorage.getItem(WALLET_KEY); } catch (e) {}
      const saved = remembered && list.find((w) => w.info.rdns === remembered);
      if (saved) { F.setProvider(saved.provider); state.walletInfo = saved.info; }
      else if (list.length > 1) { openWalletPicker(list); return; }
      else if (list.length === 1) { F.setProvider(list[0].provider); state.walletInfo = list[0].info; }
    }
    await doConnect();
  }

  async function doConnect() {
    const p = F.provider();
    if (!p) return toast("no wallet in this browser. Open the site in your wallet app", false);
    try {
      const accounts = await p.request({ method: "eth_requestAccounts" });
      state.account = accounts[0];
      try {
        await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CFG.chainHex }] });
      } catch (e) {
        if (e && e.code === 4902) {
          await p.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: CFG.chainHex, chainName: CFG.chainName, rpcUrls: [CFG.rpcs[0]], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, blockExplorerUrls: [CFG.explorer] }],
          });
        }
      }
      watchWallet(p);
      updateThought();
      refreshBrokers();
    } catch (e) {
      toast(humanError(e), false);
    }
  }

  /// A freshly hired broker is set to pay straight to his owner's wallet, so
  /// the vault and the claiming step never enter the picture at all. It is a
  /// second transaction rather than part of hiring because collectToWallet has
  /// its own setter and the contracts are frozen. Turning it down costs nobody
  /// anything: he simply pays into his vault, and the file has a switch.
  async function preferWallet(id) {
    try {
      toast("one more: pay him straight to your wallet");
      const hash = await F.setCollectMode(id, true, state.account);
      await F.waitForTx(hash);
      toast("he pays into your wallet", true);
    } catch (e) {
      toast("he will pay into his vault. The switch is on his file", false);
    }
  }

  /// Every vault emptied into the wallet in one go. PayVault claims one token
  /// at a time and the contracts are frozen, so this is a LIST of calls either
  /// way: a wallet that speaks EIP-5792 signs the lot once, and every other
  /// wallet asks per broker. The count is said out loud so ten prompts are
  /// never a surprise.
  async function runForAll(list, makeCall, working, finished) {
    if (!list.length || !state.account) return;
    const calls = list.map((b) => makeCall(b.id));
    try {
      const one = list.length === 1 || (await F.batchSupported(state.account));
      if (!one) toast(`${list.length} brokers, ${list.length} confirmations`);
      const res = await F.runCalls(calls, state.account, (done, total, batched) => {
        toast(batched ? `${working} all ${total}…` : `broker ${done + 1} of ${total}…`);
      });
      toast(finished(res.done), true);
    } catch (e) {
      toast(humanError(e), false);
    }
    await refreshBrokers();
    if (state.mode === "floor") rebuildRoom();
    if (document.body.classList.contains("flat-mode")) buildFlat();
  }
  const claimAll = (list) => runForAll(list, (id) => F.claimCall(id), "claiming",
    (n) => `paid out ${n} broker${n === 1 ? "" : "s"}`);
  /// setCollectMode is per token as well, so switching a roster over is the
  /// same shape of job. Once it is done the vaults stop filling and neither of
  /// the floor's cleanup buttons ever appears again.
  const goAutomatic = (list) => runForAll(list, (id) => F.collectCall(id, true), "switching",
    (n) => `${n} broker${n === 1 ? "" : "s"} now pay into your wallet`);
  /// upgradeTier is per token as well, so a squad climbing to the same rung is
  /// the same shape of job again. The list is the CALLER's responsibility and
  /// the contract is unforgiving about it: a broker who was never hired reverts
  /// NotHired, one already standing on the rung reverts BadTier, one sold since
  /// the roster was drawn reverts NotOwner — and a 5792 batch is atomic, so any
  /// one of those takes the whole squad down. Filter, then re-read, then send.
  /// HIRE ALL: every unhired broker in one run. The allowance covers the whole
  /// bill up front, so a regular wallet only signs the hires themselves.
  const hireAll = async (list) => {
    const burn = (await loadActivateBurn()) ?? ACTIVATE_FALLBACK;
    const total = burn * BigInt(list.length);
    const bal = await F.tokenBalance(state.account);
    if (bal !== null && bal < total) { toast(`hiring ${list.length} burns ${fmtCompact(total)} $9TO5. The cash machine is at the bank`, false); return; }
    if (!(await ensureAllowance(total))) return;
    await runForAll(list, (id) => F.activateCall(id), "hiring", (n) => `${n} broker${n === 1 ? "" : "s"} hired`);
  };
  /// COLLECT PAY: the holder triggers payroll delivery themselves. The engine
  /// only swaps a pot of 0.01+ ETH per asset, so a small holder's claim is
  /// padded with OTHER brokers' rolled credit (they get paid too — deliver is
  /// permissionless and pay only ever goes to each broker's own owner/vault).
  const PAYDAY_OWED = 5_000_000_000_000_000n; // fees waiting in the splitter worth a harvest
  const engineMinSwap = () => (state.stats && state.stats.minSwap) || 10_000_000_000_000_000n;
  const collectNeed = () => (engineMinSwap() * 12n) / 10n; // 20% over the swap floor
  /// the USDG-bound settled total a click could deliver (holder + padding).
  /// This IS the click's pre-flight, so the machine only arms on a real plan.
  async function payPlan(act) {
    const mine = await F.pendingOf(act);
    const myShare = {};
    for (const [id, b] of await F.usdgShareOf(act)) myShare[id] = BigInt(b);
    const ids = mine.filter(([, p]) => p > 0n).map(([id]) => id);
    let total = mine.reduce((a, [id, p]) => a + (p * (myShare[id] ?? 10000n)) / 10000n, 0n);
    const own = total;
    if (total < collectNeed()) {
      const pool = (await F.rolledIds()).filter((id) => !ids.includes(id)).slice(0, 600);
      const [pend, shares] = await Promise.all([F.pendingOf(pool), F.usdgShareOf(pool)]);
      const bpsOf = {};
      for (const [id, b] of shares) bpsOf[id] = BigInt(b);
      const cand = pend
        .map(([id, p]) => [id, (p * (bpsOf[id] ?? 0n)) / 10000n])
        .filter(([, c]) => c > 0n);
      cand.sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0));
      for (const [id, c] of cand) {
        if (total >= collectNeed() || ids.length >= 150) break;
        ids.push(id);
        total += c;
      }
    }
    return { ids, total, own };
  }
  const collectPay = async (bs, roundDue) => {
    const act = bs.filter((b) => b.active).map((b) => b.id);
    if (!act.length || !state.account) return;
    toast("adding up your pay…");
    // self-serve payday: if the splitter holds unpulled fees, the click
    // harvests them into the pot first — the payroll runs on holders now,
    // not on a bot
    let ranHarvest = false;
    try {
      const owedFees = await F.owedEngine();
      if (owedFees >= PAYDAY_OWED) {
        toast("pulling the fee pot in…");
        const h = await F.harvest(state.account);
        await F.waitForTx(h);
        ranHarvest = true;
      }
    } catch (e) { /* the pot pull is best-effort; collection continues */ }
    let ids, total;
    try {
      const plan = await payPlan(act);
      ids = plan.ids;
      total = plan.total;
      if (!ids.length) {
        if (!ranHarvest && !roundDue) { toast("nothing settled to collect yet — the hour has to close first", false); return; }
        // fresh pot on its way: the settle inside deliver credits everyone,
        // so start the batch from the clicker's own brokers
        ids = act.slice();
      }
      if ((ranHarvest || roundDue) && ids.length < 150) {
        // fresh pot: pendings credit at the settle inside deliver, so widen
        // the batch by recency — whoever has credit gets paid
        const extraPool = (await F.rolledIds()).filter((id) => !ids.includes(id));
        for (const id of extraPool) {
          if (ids.length >= 150) break;
          ids.push(id);
        }
      }
    } catch (e) { toast(humanError(e), false); return; }
    if (!ranHarvest && !roundDue && total < engineMinSwap()) {
      toast("the pot is under the swap minimum right now — the machine arms when a collect can really pay", false);
      return;
    }
    const mineBefore = total; // includes padding; the honest check is below
    const ownBefore = (await F.pendingOf(act)).reduce((a, [, p]) => a + p, 0n);
    await txFlow("collecting pay", () => F.deliver(ids, state.account), async () => {
      // a deliver can "succeed" while every credit rolls (pot under the swap
      // floor). Never tell the holder it worked without reading the result.
      const ownAfter = (await F.pendingOf(act)).reduce((a, [, p]) => a + p, 0n);
      if (ownBefore > 0n && ownAfter >= ownBefore) {
        toast("the pot is still under the swap minimum — your pay rolled forward, nothing lost. It lands with the next payday", false);
      } else {
        toast("pay collected — check your broker's vault or wallet", true);
      }
      await refreshBrokers();
      if (state.mode === "floor") rebuildRoom();
    });
  };
  const promoteAll = (list, idx) => runForAll(list, (id) => F.upgradeCall(id, idx), "promoting",
    (n) => `${n} broker${n === 1 ? "" : "s"} promoted to ${TIERS[idx].name}`);

  /// true when the wallet may burn `needed`; false (with the reason shown)
  /// when there is nothing to approve yet. Before the token exists this used
  /// to fall through to an approve() on a null address and hang on the
  /// "one-time approval…" toast (seen 2026-08-28 with the reserve broker).
  async function ensureAllowance(needed) {
    const allowance = await F.tokenAllowance(state.account);
    if (allowance === null) { toast("$9TO5 is not live yet — hiring opens at launch", false); return false; }
    if (allowance >= needed) return true;
    toast("one-time approval…");
    const hash = await F.approveMax(state.account);
    await F.waitForTx(hash);
    return true;
  }

  // ------------------------------------------------------------ data
  /// What is TRUE before anything is on chain — not a mock-up of a busy day.
  ///
  /// This was invented data: 1,234 minted, 12.34 ETH paid, 0.42 ETH in the pot,
  /// 141M burned. It rendered in the live furnace and the live cash machine as
  /// though it were real, on a site with no token, and the one line that used
  /// to caption the whole street as an example was the top ribbon — which has
  /// since been removed. So the numbers lost their disclaimer and kept their
  /// authority.
  ///
  /// Supply and price are real and fixed by the contract, so they stay. Every
  /// figure that can only come from a chain is null, and null already renders
  /// as "—" through fmtEth and as 0 in the minted counter, which is the truth:
  /// nothing has been minted, burned or paid yet.
  const PRELAUNCH = {
    minted: null, maxSupply: 5000, priceWei: 3500000000000000n,
    totalHarvested: null, potBuffer: null, burned: null,
    publicOpen: false,
  };

  /// THE MINT IS ON OPENSEA (decided 2026-08-25). Nothing on this site mints.
  /// "The mint is open" means exactly one thing now: the OpenSea drop page
  /// exists (config.js mintUrl), and that link is the only mint link the site
  /// ever shows. The public round is read from SeaDrop's public stage once the
  /// contract is live; config.js mintPublicAt covers the window before the
  /// stage is configured. Both are the truth or nothing — never a guess.
  // scheduled = the drop page exists but the first stage has not started yet
  // (config.js mintStartsAt). Re-evaluated on every stats refresh, so the
  // street flips to "minting now" by itself at the minute it opens.
  const mintScheduled = () => !!CFG.mintUrl && !!CFG.mintStartsAt && Date.now() / 1000 < Number(CFG.mintStartsAt);
  const mintOpen = () => !!CFG.mintUrl && !mintScheduled();
  const publicByConfig = () => !!CFG.mintPublicAt && Date.now() / 1000 >= Number(CFG.mintPublicAt);
  /// "Fri 28 Aug, 15:00 UTC" — one format everywhere the schedule is spoken
  function fmtUtc(ts) {
    const d = new Date(Number(ts) * 1000);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
    const hh = String(d.getUTCHours()).padStart(2, "0"), mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${day} ${d.getUTCDate()} ${mon}, ${hh}:${mm} UTC`;
  }

  async function refreshStats() {
    state.mintOpen = mintOpen();
    if (!DEPLOYED) { state.stats = { ...PRELAUNCH, publicOpen: publicByConfig() }; paintHud(); return; }
    try {
      const s = await F.stats();
      // the price is a stage setting on OpenSea; until the stage is configured
      // the number on the desk is the one the launch was announced with
      if (s.priceWei == null) s.priceWei = PRELAUNCH.priceWei;
      // SeaDrop answered: the chain decides. It did not: config decides.
      s.publicOpen = s.publicOpen === null || s.publicOpen === undefined ? publicByConfig() : !!s.publicOpen;
      state.stats = s;
      state.tokenLive = s.burned !== null;
      try { state.owedFees = await F.owedEngine(); } catch (e) { /* stale value stands */ }
      paintHud();
      if (state.mode !== "street") rebuildRoom();
    } catch (e) { /* stale values stay */ }
  }

  async function refreshBrokers() {
    if (!DEPLOYED || !state.account) return;
    try {
      const ids = await F.tokensOf(state.account);
      state.assetMeta = await F.assetMeta();
      state.brokers = await F.brokerBundle(ids);
      if (state.mode === "floor" || state.mode === "hr") rebuildRoom();
      if (document.body.classList.contains("flat-mode")) buildFlat();
      refreshOpenBroker();
    } catch (e) { /* retried on next tick */ }
  }

  // ------------------------------------------------------------ stage DOM
  const stage = $("fb-stage");
  const back = el("div", "fb-layer");   // parallax skyline
  const front = el("div", "fb-layer");  // street
  const fg = el("div", "fb-layer");     // foreground traffic
  const actors = el("div", "fb-layer"); // walker, shadow, bubbles — every mode
  stage.appendChild(back);
  stage.appendChild(front);
  stage.appendChild(fg);
  stage.appendChild(actors);
  fg.style.pointerEvents = "none";
  let roomLayer = null;

  function buildBack() {
    back.appendChild(px(el("div", "fb-sun"), { left: "520px" }));
    // The district is two canvas-painted parallax bands now, and it sizes its
    // own bands off the sky it is given, so the twenty-one hand-placed towers
    // and the height table that fed them are gone. groundH is still wanted:
    // both bands stand on it.
    const groundH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--ground-h"), 10) || 220;
    // Guarded like the other three hand-offs. index.html carries max-age=600,
    // so for ten minutes after a deploy a returning visitor can hold the OLD
    // html — which has no city.js tag — while fetching the new level.js. An
    // unguarded call throws here and takes the whole of buildBack with it: no
    // sun, no clouds, no birds, no street at all, rather than just no skyline.
    if (window.__CITY_BUILD) window.__CITY_BUILD(back, stage, WORLD_W, groundH);

    const birdBody = '<i class="wing up"></i><i class="wing r up"></i><b class="body"></b>';
    const birdBodyDown = '<i class="wing"></i><i class="wing r"></i><b class="body"></b>';
    [[900, 70], [2400, 150], [3400, 90], [4600, 190], [5100, 120]].forEach(([x, top], i) => {
      const b2 = el("div", "fb-bird2 glide");
      b2.innerHTML = `<span class="flap-a">${birdBody}</span><span class="flap-b">${birdBodyDown}</span>`;
      px(b2, { left: x + "px", top: top + "px" });
      b2.style.animationDuration = 46 + (i % 4) * 14 + "s";
      b2.style.animationDelay = -(i * 9) + "s";
      const flapDur = (0.42 + (i % 3) * 0.1).toFixed(2) + "s";
      b2.querySelector(".flap-a").style.animationDuration = flapDur;
      b2.querySelector(".flap-b").style.animationDuration = flapDur;
      back.appendChild(b2);
    });

    const plane = el("div", "fb-plane");
    plane.innerHTML = `<div class="inner">
        <div class="banner">BUY $9TO5</div><div class="rope"></div>
        <div class="tailfin"></div><div class="fuselage"></div>
        <div class="windows"></div><div class="wing"></div><div class="nose"></div>
      </div>`;
    px(plane, { left: "-1100px", top: "58px" });
    plane.style.animationDuration = "80s";
    plane.style.animationDelay = "-30s";
    back.appendChild(plane);

    // A second tow, lower and flying the name rather than the ticker. Both run
    // the same 80s cruise and the delays sit 40s apart — exactly half a cycle —
    // so they are separated by construction and can never drift into each other
    // the way two different durations eventually would.
    const plane2 = el("div", "fb-plane");
    plane2.innerHTML = `<div class="inner">
        <div class="banner">FIRM BROKERS</div><div class="rope"></div>
        <div class="tailfin"></div><div class="fuselage"></div>
        <div class="windows"></div><div class="wing"></div><div class="nose"></div>
      </div>`;
    // Height in CSS rather than inline, because it has to answer the window:
    // 150 clears the lobby sign on a desktop, where the sign hangs at 252, but
    // on a phone the sign lifts to 145 and a plane at 150 spends its whole pass
    // hidden behind it. The narrow rule flies it up into the open strip instead.
    plane2.classList.add("lo");
    px(plane2, { left: "-1100px" });
    plane2.style.animationDuration = "80s";
    plane2.style.animationDelay = "-70s";
    back.appendChild(plane2);

    for (let i = 0; i < 10; i++) {
      const c = el("div", "fb-cloud");
      // spread across the width this layer can actually expose, so none is
      // composited where no camera position could ever show it
      const span = window.__CITY_SPAN ? window.__CITY_SPAN(0.35) : innerWidth;
      px(c, { left: Math.round(-120 + (span + 260) / 10 * i) + "px", top: (40 + (i % 5) * 46) + "px", width: (60 + (i % 3) * 30) + "px" });
      c.style.animationDuration = 60 + (i % 7) * 20 + "s";
      back.appendChild(c);
    }
  }

  function sign(x, title, body) {
    const s = el("div", "fb-signpost");
    s.appendChild(el("b", null, title));
    s.appendChild(el("span", null, body));
    s.appendChild(el("i", "leg g"));
    s.appendChild(el("i", "leg r"));
    front.appendChild(px(s, { left: x + "px" }));
  }

  /// The crowd. These used to be one man under three CSS filters, which is why
  /// they were one man: hue-rotate moves skin and suit together, so it can tint
  /// a character but never cast a different one. Each is now a silhouette plus
  /// a palette, the same mechanism the brokers use.
  ///
  /// Every colour is a real trait from the collection's own tables — the names
  /// in the comments are the trait values, and the hex is what
  /// walker.py::palette_for() derives from them — so nobody on the street is
  /// wearing a colour no broker could be minted in.
  /// The hiring line carries pieces no token can draw — long waves, a ponytail,
  /// a gold collar chain, an earring, a lapel brooch, a boutonniere, a clutch,
  /// a full attaché. Everything a broker wears has to survive being minted 5,000
  /// times; these three do not, so they get to be the best-dressed people on the
  /// street. The palettes are still real trait values.
  const CAST = {
    // Clean Cut / Olive / Charcoal / Purple
    brunette: { look: "hr-waves pk-pendant hd-clutch",
      pal: { H: "#3c2c20", S: "#bc9468", d: "#8b6d4c", N: "#3a3a3e", D: "#2d2d30", T: "#6e3e96", L: "#2e2e31", M: "#232326" } },
    // Blonde Part / Fair / Grey / Pink
    blonde: { look: "hr-ponytail wr-earring pk-brooch hd-clutch",
      pal: { H: "#c8a860", S: "#eecaaa", d: "#b0957d", N: "#6e727a", D: "#55585f", T: "#da789a", L: "#585b61", M: "#44464b" } },
    // Silver Fox / Tan / Pinstripe / Golden — "well dressed" is the whole brief
    // for him, so he is the only one carrying a suit-pattern layer. His height
    // comes from the frame, not from a scale: see the queue below.
    sharp: { look: "hr-slick st-pinstripe pk-boutonniere hd-attache",
      pal: { H: "#bebec4", S: "#d8ac80", d: "#9f7f5e", N: "#2e344e", D: "#23283c", T: "#deb23e", L: "#24293e", M: "#1c2030" } },
    // Redhead / Tan / Black / Green Candle — behind the HR counter, so she has
    // to be nobody from the hiring line
    clerk: { look: "hr-bob",
      pal: { H: "#9c4a28", S: "#d8ac80", d: "#9f7f5e", N: "#1c1c20", D: "#161619", T: "#388e54", L: "#16161a", M: "#111114" } },
  };

  /// STAFF — the people who work in the rooms.
  ///
  /// The floor and the bank had furniture, the player's own brokers, and nobody
  /// else. These are four: a handful on purpose, because the rooms are already
  /// full and the desks are the thing you are meant to look at.
  ///
  /// Every one of them wears ONLY pieces the collection can actually mint, and
  /// colours lifted straight from HAIRS/SKINS/SUITS/TIES in gen/generate.py.
  /// The unmintable pieces — waves, ponytail, brooch, clutch, attaché — stay
  /// the hiring line's, which is the whole reason those three are special.
  /// None of these four repeats a hair class plus palette already on the site.
  const STAFF = {
    // Bald · Brown · Navy · Green Candle — took the call away from the desks
    caller: { look: "hr-bald ey-glasses",
      pal: { H: "#201c1a", S: "#966a48", d: "#734f34", N: "#2a3858", D: "#1e2940", T: "#388e54", L: "#16161a", M: "#111114" } },
    // Buzz · Tan · Charcoal · Bolo — at the machine, cup already poured
    barista: { look: "hr-buzz hd-coffee ti-bolo",
      pal: { H: "#584636", S: "#d8ac80", d: "#9f7f5e", N: "#3a3a3e", D: "#2c2c30", T: "#785428", L: "#16161a", M: "#111114" } },
    // Slick Back · Fair · Black · Blue — behind the counter, badged
    teller: { look: "hr-slick pk-badge",
      pal: { H: "#201c1a", S: "#eecaaa", d: "#c9a382", N: "#1c1c20", D: "#161619", T: "#3454a0", L: "#16161a", M: "#111114" } },
    // Clean Cut · Olive · Grey · Black — waiting on the cash machine
    cashing: { look: "hr-flat ey-tired",
      pal: { H: "#3c2c20", S: "#bc9468", d: "#96714b", N: "#6e727a", D: "#565a62", T: "#1e1e22", L: "#16161a", M: "#111114" } },
  };

  /// Same as npcWalker but into the room rather than the street, and marked
  /// `staff` so a test can tell the people who work here from the ones outside.
  /// Rooms are torn down and rebuilt by rebuildRoom(), so these are created
  /// inside the room builders and never outlive one.
  function roomNpc(x, who, frame, faceLeft) {
    const c = STAFF[who];
    const n = walkerEl(`fb-walker npc staff ${c.look}`);
    dress(n, c.pal);
    n.dataset.frame = frame;
    if (faceLeft) n.classList.add("face-left");
    px(n, { left: x + "px", bottom: "var(--ground-h)" });
    roomLayer.appendChild(n);
    return n;
  }

  function npcWalker(x, who, frame) {
    const c = CAST[who];
    const n = walkerEl(`fb-walker npc ${c ? c.look : WALKER_DEFAULT}`);
    if (c) dress(n, c.pal);
    n.dataset.frame = frame || "stand";
    px(n, { left: x + "px", bottom: "var(--ground-h)" });
    front.appendChild(n);
    return n;
  }

  function buildFront() {
    front.appendChild(px(el("div", "fb-ground"), { width: WORLD_W + 120 + "px" }));

    const bb = el("div", "fb-billboard");
    // Word for word the token's own description. This sign sits directly above
    // BUY $9TO5, so it is the one surface a stranger cross-checks against the
    // launchpad listing; anything else here reads as a different project.
    const bbInner = el("div", "inner",
      `<h1>FIRM BROKERS</h1><p>GET HIRED. GET PAID EVERY HOUR.</p>`);
    // The sign is brand and nothing else: a headline, a tagline, and nothing to
    // press. It used to carry a BUY $9TO5 that was invisible only because the
    // token was not live yet, so it would have arrived on the sign on launch
    // day — inside a frame that had just been enlarged for the banner, which is
    // the worst possible moment for it. Buying lives in the zone bar on every
    // screen and at the bank's cash machine, which is where it belongs.
    bb.appendChild(bbInner);
    front.appendChild(px(bb, { left: "540px" }));


    // Two lines each, broken by hand rather than left to wrap. The board is a
    // fixed 280px and centred, so ragged wrapping is what made these look
    // untidy: the bank ran to four lines of arithmetic and the last one was a
    // stub. Matched lengths keep the two boards the same height as well.
    //
    // The bank no longer states the fee. The number is right — 3% of a trade,
    // 2.16% of it reaching payroll — but a street sign is the wrong place to
    // do arithmetic at somebody, and docs.html walks the whole chain properly.
    // It says what the room is FOR instead, and does not repeat the floor's
    // "every hour", which the floor board has already said by then.
    sign(2680, "YOUR DESKS", "Your brokers work here.<br>They earn every hour.");
    sign(3860, "THE MONEY", "Buy $9TO5 here.<br>Hire and promote brokers.");

    // the bus stop: the deal, read while you wait
    const stop = el("div", "fb-busstop");
    stop.innerHTML = `
      <div class="roof"></div>
      <div class="post l"></div><div class="post r"></div>
      <div class="glass"></div>
      <div class="poster"><b>THE DEAL</b>
        <span>1. Mint a broker</span>
        <span>2. Burn $9TO5 to hire him</span>
        <span>3. He earns stocks hourly</span></div>
      <div class="bench"><i></i><i></i></div>`;
    front.appendChild(px(stop, { left: "1120px" }));
    if (window.__LOBBY_BUILD) window.__LOBBY_BUILD({ front, px, el, npcWalker, dress, warpTo, ZONES });

    [700, 2450, 4500].forEach((x) => front.appendChild(px(el("div", "fb-manhole"), { left: x + "px" })));

    state.pigeons = [];
    [2350, 3550, 4850].forEach((x, i) => {
      const p = el("div", "fb-pigeon" + (i % 2 ? " hop" : ""));
      front.appendChild(px(p, { left: x + "px" }));
      state.pigeons.push({ x, elm: p });
    });

    const FACADES = {
      hr: { w: 300, h: 560, wtc: true, statusTop: 168, cueY: 226 }, // the FIRM BROKERS plate sits 380..404, so the prompt stays above the lower band
      floor: { w: 540, h: 340, exchange: true, statusTop: -128, noLintel: true },
      bank: { w: 400, h: 320, bank2: true, noLintel: true },
    };
    for (const z of ZONES) {
      if (!z.room) continue;
      const cfg = FACADES[z.id] || {};
      const d = el("div", `fb-door theme-${z.id === "floor" ? "navy" : z.id === "bank" ? "steel" : "marble"}` + (cfg.wtc ? " fb-wtc" : ""));
      d.dataset.zone = z.id;
      px(d, { left: DOOR_AT(z) - (cfg.w || 190) / 2 + "px", width: (cfg.w || 190) + "px", height: (cfg.h || 210) + "px" });

      if (cfg.bank2) {
        d.classList.add("fb-bank2");
        d.appendChild(el("div", "parapet"));
        const dome = el("div", "dome");
        dome.innerHTML = '<i class="finial"></i>';
        d.appendChild(dome);
        d.appendChild(el("div", "brassplate", "THE $9TO5 BANK"));
        [46, 268].forEach((ax) => {
          const arch = el("div", "arch");
          px(arch, { left: ax + "px" });
          d.appendChild(arch);
        });
        d.appendChild(el("div", "bankclock"));
        const atm = el("div", "atm");
        atm.innerHTML = '<i class="screen"></i><i class="pad"></i>';
        d.appendChild(atm);
        d.appendChild(el("div", "camera"));
        d.appendChild(el("div", "mat"));
        const p1 = el("div", "planter"); p1.appendChild(el("i")); d.appendChild(px(p1, { left: "calc(50% - 92px)" }));
        const p2 = el("div", "planter"); p2.appendChild(el("i")); d.appendChild(px(p2, { left: "calc(50% + 66px)" }));
      }
      if (cfg.exchange) {
        d.classList.add("fb-exch");
        // colonnade: six stone columns flanking the entrance bay
        // even 88px spacing with a 128px bay for the door, the whole run centred:
        // the old set had an 86px last gap and sat 5px right of the doorway
        [13, 101, 189, 317, 405, 493].forEach((cx) => d.appendChild(px(el("div", "col"), { left: cx + "px" })));
        // the wrap-around ticker band, mounted on the frieze
        const band = el("div", "tickband");
        const tape = "AAPL ▲ · NVDA ▲ · TSLA ▼ · MSFT ▲ · AMZN ▲ · GOOGL ▼ · META ▲ · GME ▲ · PLTR ▼ · AMD ▲ · SPCX ▲ · USDG — · $9TO5 ▲ · ";
        const tapeEl = el("div", "tape");
        tapeEl.innerHTML = (tape + tape).replace(/▲/g, '<span class="up">▲</span>').replace(/▼/g, '<span class="dn">▼</span>');
        band.appendChild(tapeEl);
        d.appendChild(band);
        // engraved architrave + pediment with the trading bell
        d.appendChild(el("div", "architrave", "TRADING FLOOR"));
        const ped = el("div", "pediment2");
        ped.innerHTML = '<i></i><i></i><i></i><span class="bell"></span>';
        d.appendChild(ped);
        d.appendChild(el("div", "steps"));
      }
      if (cfg.wtc) {
        const twin = el("div", "fb-wtc-twin");
        twin.appendChild(el("div", "crown"));
        twin.appendChild(el("div", "floors"));
        px(twin, { left: DOOR_AT(z) - 150 - 240 + "px", width: "252px", height: "500px" });
        front.appendChild(twin);
        // the mint board goes on the main tower, where the eye already is; the
        // twin is left bare so there is one thing to look at, not two
        const ad = el("div", "fb-ledwall");
        ad.id = "fb-mintwall";
        px(ad, { top: "28px", left: "30px", width: "240px" });
        d.appendChild(ad);

        d.appendChild(el("div", "floors"));
        d.appendChild(el("div", "crown"));
        d.appendChild(el("div", "mast"));
        d.appendChild(px(el("div", "mech"), { top: "30%" }));
        d.appendChild(px(el("div", "mech"), { top: "62%" }));
        d.appendChild(px(el("div", "beacon"), { left: "4px" }));
        d.appendChild(px(el("div", "beacon r"), { right: "4px" }));
        d.appendChild(el("div", "arcade"));
        d.appendChild(el("div", "canopy"));
        d.appendChild(el("div", "carpet"));
        d.appendChild(px(el("div", "stanchion"), { left: "calc(50% - 82px)" }));
        d.appendChild(px(el("div", "stanchion"), { left: "calc(50% + 75px)" }));
        d.appendChild(el("div", "rope l"));
        d.appendChild(el("div", "rope r"));
        d.appendChild(px(el("div", "lamp2"), { left: "calc(50% - 82px)" }));
        d.appendChild(px(el("div", "lamp2"), { left: "calc(50% + 70px)" }));
      }
      // the wtc tower carries the mint board instead of a name plate
      if (!cfg.noLintel && !cfg.wtc) {
        const lintel = el("div", "lintel");
        lintel.appendChild(el("div", "name", z.name));
        d.appendChild(lintel);
      }

      if (cfg.winrows) {
        for (const top of cfg.winrows) {
          const row = el("div", "winrow");
          for (let i = 0; i < 4; i++) row.appendChild(el("i", cfg.lit && (i + top) % 3 === 0 ? "lit" : null));
          px(row, { top: top + "px" });
          d.appendChild(row);
        }
      }
      if (cfg.cornice) d.appendChild(el("div", "cornice"));
      if (cfg.shaded) d.appendChild(el("div", "shadow-side"));
      if (cfg.deco === "floor") d.appendChild(px(el("div", "fascia", "FIRM BROKERS · TRADING FLOOR"), { bottom: "128px" }));
      if (cfg.deco === "bank") d.appendChild(px(el("div", "fascia", "THE $9TO5 BANK"), { bottom: "128px" }));
      if (cfg.roof) {
        const roof = el("div", "fb-roof");
        for (const [kind, leftPos] of cfg.roof) {
          const item = el("div", kind === "flag" ? "fb-flag" : kind);
          px(item, { left: leftPos });
          roof.appendChild(item);
        }
        d.appendChild(roof);
      }
      d.appendChild(el("div", "doorway"));
      d.addEventListener("click", () => tryEnter(z));
      front.appendChild(d);
      z.facadeH = cfg.h || 210;
      z.cueY = cfg.cueY || null;
    }

    // He is taller by exactly one sprite pixel, and it costs nothing: "stand"
    // paints from row 2 and "stand-b" from row 3, both ending on row 23, so the
    // two frames already differ by a pixel with the feet on the same line.
    // Scaling him instead made him bigger rather than taller — a wider body and
    // a bigger head read as standing closer, not as height.
    // Marked, because the street has other people on it now: the lobby stages
    // its own commuters, and "the hiring line" has to stay something the DOM
    // can name rather than "every NPC that happens to be outdoors".
    npcWalker(1600, "brunette", "stand-b").classList.add("hiring");
    npcWalker(1665, "blonde", "stand-b").classList.add("hiring");
    npcWalker(1730, "sharp", "stand").classList.add("hiring");
    const qs = el("div", "fb-queue-sign", "HIRING LINE<br>STARTS HERE");
    qs.appendChild(el("i", "leg g"));
    qs.appendChild(el("i", "leg r"));
    front.appendChild(px(qs, { left: "1585px" }));

    // the security booth: he checks clearance from behind the glass
    const booth = el("div", "fb-booth");
    booth.innerHTML = '<div class="roof"></div><div class="plate"><span>SECURITY</span></div><div class="win"></div><div class="scr"></div>';
    px(booth, { left: BOOTH_X + "px", bottom: "var(--ground-h)" });
    booth.addEventListener("click", openApply);
    booth.classList.toggle("cleared", clearanceDone());
    state.boothEl = booth;
    front.appendChild(booth);

    // the agent who runs the whitelist, framed by the booth window
    const agent = walkerEl("fb-walker npc fb-agent " + WALKER_DEFAULT);
    agent.dataset.frame = "stand";
    agent.innerHTML = '<i class="shades"></i><i class="ear"></i><i class="tie"></i><i class="pin"></i>';
    agent.setAttribute("role", "button");
    agent.setAttribute("tabindex", "0");
    agent.setAttribute("aria-label", "apply for the whitelist");
    px(agent, { left: AGENT_X + "px", bottom: "var(--ground-h)" });
    agent.addEventListener("click", openApply);
    agent.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openApply(); } });
    front.appendChild(agent);
    const sill = el("div", "fb-boothsill");
    sill.innerHTML = '<div class="lip"></div>';
    px(sill, { left: BOOTH_X + "px", bottom: "var(--ground-h)" });
    sill.addEventListener("click", openApply);
    front.appendChild(sill);

    state.agentLine = el("div", "room-speech fb-agentline");
    state.agentLine.innerHTML = agentLine();
    px(state.agentLine, { left: AGENT_X - 32 + "px" });
    measureAgentLine();
    state.agentLine.addEventListener("click", openApply);
    front.appendChild(state.agentLine);

    const truck = el("div", "fb-armored");
    truck.innerHTML = `<div class="box"><b>$9TO5</b><span>SECURE TRANSPORT</span></div>
      <div class="cab2"><i class="glass"></i></div>
      <div class="wheel2 a"></div><div class="wheel2 b"></div><div class="wheel2 c"></div>`;
    front.appendChild(px(truck, { left: DOOR_AT(ZONES[3]) + 240 + "px" }));


    state.taxi = el("div", "fb-taxi");
    state.taxi.innerHTML = '<div class="light"></div><div class="cab"></div><div class="body"></div><div class="check"></div><div class="wheel b"></div><div class="wheel f"></div>';
    state.taxiX = WORLD_W - 400;
    fg.appendChild(state.taxi);

    state.shadowEl = el("div", "fb-shadow");
    actors.appendChild(state.shadowEl);
    state.playerEl = walkerEl("fb-walker " + WALKER_DEFAULT);
    state.playerEl.dataset.frame = "stand";
    state.playerEl.addEventListener("click", tapWalker);
    actors.appendChild(state.playerEl);
    state.thoughtEl = el("div", "fb-thought", "");
    actors.appendChild(state.thoughtEl);
    state.cueEl = px(el("div", "fb-cue", ""), { display: "none" });
    actors.appendChild(state.cueEl);
  }

  // ------------------------------------------------------------ HUD
  function paintHud() {
    const s = state.stats;

    // every way to buy the token: the street jumbotron and the persistent HUD
    // button. Both stay dark until the token is live
    // POLICY: no letscash link exists anywhere until the token does — a
    // pre-launch link finds nothing, or worse, finds a fake. Deep link only.
    const buyHref = CFG.token ? CFG.buyUrl + "token/" + CFG.token : null;
    const buyOpen = DEPLOYED && state.tokenLive && !!buyHref;
    const hudBuy = $("fb-buybtn");
    if (hudBuy) {
      hudBuy.style.display = buyOpen ? "" : "none";
      hudBuy.href = buyHref;
    }

    // The follow link ships with the handle written into index.html so it works
    // before any script does; config is still the authority once one has run.
    const hudX = $("fb-xbtn");
    if (hudX) hudX.href = xProfile();

    const bar = $("fb-zonebar");
    bar.querySelectorAll(".fb-zonebtn").forEach((b) => b.remove());
    const anchor = bar.firstChild;
    ZONES.forEach((z, i) => {
      if (z.bar === false) return;
      const live = z.room ? zoneLive(z) : true;
      const btn = el("button", "fb-zonebtn" + (live ? "" : " is-locked"));
      btn.innerHTML = `<span class="marker"></span><small>${i + 1} ${z.name}</small><b class="short">${z.short || z.name}</b><span>${live ? z.does : "locked"}</span>`;
      btn.addEventListener("click", () => warpTo(z));
      btn.dataset.zone = z.id;
      bar.insertBefore(btn, anchor);
    });
    markHere();
    paintDoors();
  }

  function paintMintWall() {
    const wall = $("fb-mintwall");
    if (!wall) return;
    // "open" = the OpenSea drop page exists. The contract being deployed is
    // not the mint being open any more; the page is.
    const open = state.mintOpen;
    // ☠️ THIS SAID "WALK RIGHT IN" WHILE THE DOOR WAS SHUT. The booth below it
    // says the form comes first, so the building was giving two opposite
    // instructions at once — which is how somebody read a locked door as a bug
    // rather than as a step they had not done. The last line now says which of
    // the three states the building is actually in.
    const st = state.stats || PRELAUNCH;
    const gated = open && !st.publicOpen && !clearanceDone();
    wall.innerHTML = `<b>${open ? "MINTING NOW" : "MINT HERE"}</b>
      <span>5,000 BROKERS</span><span>0.0035 ETH EACH</span>
      <span>${!open ? (mintScheduled() ? "OPENS " + fmtUtc(CFG.mintStartsAt).toUpperCase() : "SOON, ON OPENSEA") : gated ? "SEND THE FORM FIRST" : "WALK RIGHT IN"}</span>`;
  }

  function paintDoors() {
    paintMintWall();
    document.querySelectorAll(".fb-door").forEach((d) => {
      const z = ZONES.find((x) => x.id === d.dataset.zone);
      d.classList.toggle("is-open", zoneLive(z));
    });
  }

  /// Which zone the bar should light. The zones DO NOT TILE THE STREET: there
  /// are 150px between each pair and 400px past the bank, and `|| ZONES[0]`
  /// meant every one of those gaps lit THE LOBBY. Standing outside the bank at
  /// the far end of the street, the bar said you were in the lobby 4,700px
  /// away. Nearest zone instead, which hands over at the middle of each gap.
  ///
  /// Safe to make this generous because it drives nothing but the highlight:
  /// markHere() is the only caller and it only toggles a class. The door
  /// prompt and E-to-enter measure DOOR_AT separately, so nobody can walk into
  /// a building from outside it.
  function currentZone() {
    if (state.mode !== "street") return ZONES.find((z) => z.room === state.mode) || ZONES[0];
    // only zones with a button can be lit; a `bar: false` zone hands the
    // highlight to the nearest zone that has one
    const lit = ZONES.filter((z) => z.bar !== false);
    const inside = lit.find((z) => state.x >= z.x && state.x < z.x + z.w);
    if (inside) return inside;
    return lit.reduce((best, z) => {
      const d = state.x < z.x ? z.x - state.x : state.x - (z.x + z.w);
      return d < best.d ? { d, z } : best;
    }, { d: Infinity, z: ZONES[0] }).z;
  }
  /// The prompt over a door. Its width depends on the label, so a fixed offset
  /// can only ever centre one of them; measure once per label instead and keep
  /// the result. Called every frame, so nothing here may read layout unless the
  /// text actually changed.
  function showCue(key, label, centreX, bottom) {
    const c = state.cueEl;
    if (state.cueKey !== key) {
      state.cueKey = key;
      c.innerHTML = `<em>E</em>${label}<i class="tail"></i>`;
      c.style.visibility = "hidden";
      c.style.display = "block";
      c.style.left = "0px";
      state.cueW = c.offsetWidth;
      c.style.visibility = "";
    }
    c.style.display = "block";
    // never let it hang off the left edge of the world
    const left = Math.max(6, Math.round(centreX - state.cueW / 2));
    c.style.left = left + "px";
    c.style.bottom = bottom + "px";
    // when the box has to be clamped, the tail still points at the door
    const tail = c.firstElementChild && c.querySelector(".tail");
    if (tail) tail.style.left = Math.max(15, Math.min(state.cueW - 15, Math.round(centreX - left))) + "px";
  }

  function hideCue() {
    if (state.cueKey !== null) {
      state.cueEl.style.display = "none";
      state.cueKey = null;
    }
  }

  function markHere() {
    const here = currentZone();
    document.querySelectorAll(".fb-zonebtn").forEach((b) => b.classList.toggle("is-here", b.dataset.zone === here.id));
  }

  function updateThought() {
    if (state.account) {
      state.thoughtEl.style.display = "none";
    } else {
      state.thoughtEl.style.display = "";
      // Both branches point at the next step. The visitor with no extension used
      // to be told only what they lacked, in the biggest bubble on the opening
      // screen, which is a poor first sentence to read.
      state.thoughtEl.textContent = F.provider() ? "Tap me to clock in" : "Add a wallet to clock in";
      state.thoughtW = state.thoughtEl.offsetWidth;
      state.thoughtH = state.thoughtEl.offsetHeight;
    }
    refreshAgent();
    paintWalletBadge();
  }

  function paintWalletBadge() {
    let badge = $("fb-walletbadge");
    if (!state.account) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = el("button", "fb-walletbadge");
      badge.id = "fb-walletbadge";
      badge.addEventListener("click", openWalletMenu);
      document.body.appendChild(badge);
    }
    const icon = state.walletInfo?.icon
      ? `<img src="${state.walletInfo.icon}" alt="">`
      : "";
    badge.innerHTML = `<i class="dot"></i>${icon}<span>${short(state.account)}</span>`;
    badge.title = state.walletInfo?.name ? state.walletInfo.name + ". Click to switch" : "click to switch wallet";
  }

  // ------------------------------------------------------------ interiors
  const ROOM_THEMES = { hr: "room-hr", floor: "room-floor", bank: "room-bank" };

  function enterRoom(id) {
    exitRoom();
    state.streetX = state.x;
    state.mode = id;
    back.style.display = "none";
    front.style.display = "none";
    fg.style.display = "none";
    roomLayer = el("div", "fb-layer fb-room " + ROOM_THEMES[id]);
    stage.insertBefore(roomLayer, actors);
    document.body.classList.add("paneled");
    buildRoom(id);
    state.x = 200;
    state.wheelVel = 0;
    markHere();
  }
  /// The roster hangs off the stage rather than the room layer, so that it
  /// holds still while the floor scrolls behind it. That also means nothing
  /// clears it for us: every teardown has to take it down by hand.
  function clearRoster() {
    for (const n of document.querySelectorAll(".floor-roster")) n.remove();
  }

  function exitRoom() {
    if (state.mode === "street") return;
    state.mode = "street";
    clearRoster();
    state.rosterOpen = false;
    state.rosterSlot = null;
    state.rosterPick = null;
    if (roomLayer) roomLayer.remove();
    roomLayer = null;
    back.style.display = "";
    front.style.display = "";
    fg.style.display = "";
    document.body.classList.remove("paneled");
    state.x = state.streetX;
    state.wheelVel = 0;
    closePopover();
    markHere();
  }
  function rebuildRoom() {
    if (state.mode === "street" || !roomLayer) return;
    const keepX = state.x;
    clearRoster();
    roomLayer.innerHTML = "";
    buildRoom(state.mode);
    state.x = keepX;
  }

  function roomShell(w, lights = []) {
    state.roomW = w;
    roomLayer.appendChild(px(el("div", "room-wall"), { width: w + "px" }));
    roomLayer.appendChild(px(el("div", "room-floorstrip"), { width: w + "px" }));
    roomLayer.appendChild(px(el("div", "room-ceiling"), { width: w + "px" }));
    for (const x of lights) {
      const l = el("div", "room-light");
      l.appendChild(el("i"));
      roomLayer.appendChild(px(l, { left: x + "px" }));
    }
    const exit = el("div", "room-exit");
    exit.innerHTML = '<div class="frame"></div><b>EXIT</b>';
    exit.addEventListener("click", exitRoom);
    roomLayer.appendChild(px(exit, { left: "40px" }));
  }

  function deskCard(x, w, inner, standCls) {
    const wrap = el("div", "room-deskcard" + (standCls ? " " + standCls : ""));
    wrap.appendChild(inner);
    px(wrap, { left: x + "px", width: w + "px" });
    roomLayer.appendChild(wrap);
    return wrap;
  }

  function prop(cls, x, html) {
    const p = el("div", cls, html);
    px(p, { left: x + "px" });
    roomLayer.appendChild(p);
    return p;
  }

  function glassWall(x, w, bldgs) {
    const win = el("div", "hr2-window");
    for (const [bx, bw, bh, shade] of bldgs) {
      win.appendChild(px(el("i", "b " + shade), { left: bx + "px", width: bw + "px", height: bh + "px" }));
    }
    roomLayer.appendChild(px(win, { left: x + "px", width: w + "px" }));
  }

  function buildRoom(id) {
    if (id === "hr") buildHrRoom();
    else if (id === "floor") buildFloorRoom();
    else if (id === "bank") buildBankRoom();
  }

  // ---------- HR: the mint desk inside the tower lobby
  /// The mint desk, room and page alike. Since 2026-08-25 the mint is on
  /// OpenSea: the desk shows the count, the price, the round, and ONE link —
  /// config.js mintUrl — or, before the drop page exists, says so and shows no
  /// button at all. It never asks for a wallet and never sends a transaction.
  /// The anti-phishing rule is the same as the token's: this site links
  /// exactly one mint page, and says out loud that any other is fake.
  function mintLink(label) {
    const a = el("a", "fb-btn fb-oslink", label + " \u2197");
    a.href = CFG.mintUrl;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }
  function mintDesk(s, into, withTitle) {
    const pct = Math.min(100, (100 * (s.minted || 0)) / (s.maxSupply || 1));
    const soldOut = (s.maxSupply || 0) > 0 && (s.minted || 0) >= s.maxSupply;
    into.innerHTML = `${withTitle ? "<h2>MINT A BROKER</h2>" : ""}
      <div class="big">${(s.minted ?? 0).toLocaleString()} / ${(s.maxSupply ?? 0).toLocaleString()}</div>
      <div class="fb-progress"><i style="width:${pct}%"></i></div>
      <p style="margin-top:10px">${fmtEth(s.priceWei)} ETH each, minted on OpenSea. Art is on-chain and revealed the moment you mint.</p>`;
    const note = el("div", "fb-mintnote");
    if (soldOut) {
      if (CFG.mintUrl) into.appendChild(mintLink("SEE THEM ON OPENSEA"));
      note.innerHTML = "Sold out. Every broker is minted \u2014 the trading floor is where they live now.";
    } else if (state.mintOpen) {
      into.appendChild(mintLink("MINT ON OPENSEA"));
      note.innerHTML = s.publicOpen
        ? `Open to everyone: ${PUBLIC_CAP} per wallet.`
        : `Whitelist round: ${WL_CAP} per wallet. Public round next, ${PUBLIC_CAP} per wallet.`;
    } else if (mintScheduled()) {
      // the page exists, the clock has not struck: link it, say when, claim nothing more
      into.appendChild(mintLink("SEE THE DROP ON OPENSEA"));
      note.innerHTML = `Minting opens ${fmtUtc(CFG.mintStartsAt)}, on our OpenSea page: team round first, whitelist rounds next` +
        (CFG.mintPublicAt ? `, public at ${fmtUtc(CFG.mintPublicAt)}` : "") + `. This is the only mint link. Anywhere else is fake.`;
    } else {
      note.innerHTML = `The mint opens on OpenSea at launch. The link will be right here. Anywhere else is fake.`;
    }
    into.appendChild(note);
  }

  function buildHrRoom() {
    const s = state.stats || PRELAUNCH;
    roomShell(2050, []);
    glassWall(230, 400, [[20, 58, 290, "far"], [92, 56, 238, "near"], [172, 52, 300, "far"], [252, 62, 216, "near"], [330, 52, 264, "far"]]);
    glassWall(1520, 300, [[16, 56, 284, "far"], [86, 58, 230, "near"], [162, 52, 292, "far"], [238, 50, 240, "near"]]);
    [750, 1200].forEach((x) => prop("hr2-light", x));
    prop("hr2-plant", 140);
    roomLayer.appendChild(px(el("div", "hr2-rug"), { left: "270px", width: "300px" }));
    prop("hr2-lamp", 232, "<i></i>");
    prop("hr2-sofa", 290, '<i class="l"></i><i class="r"></i>');
    prop("hr2-table", 470);
    prop("hr2-snake", 910);
    prop("hr2-sidetable", 1226);
    prop("hr2-roomba", 1242);
    prop("hr2-bin", 1480);
    prop("hr2-lowplanter", 1560, "<i></i><i></i><i></i>");
    prop("hr2-chair", 1935, '<i class="a"></i><i class="b"></i>');
    // the right half of the room past the planter was four hundred pixels of
    // bare wall on any monitor wide enough to see it: back office furniture
    prop("hr2-cabinet", 1680, '<i class="d"></i><i class="d"></i><i class="d"></i>');
    prop("hr2-copier", 1770, '<i class="lid"></i><i class="body"></i><i class="tray"></i>');
    prop("hr2-clock", 1874);
    prop("hr2-sign", 665, `<b>EMPLOYEE HANDBOOK</b><i class="pin l"></i><i class="pin r"></i><span>`
      + `<u>Only ${(s.maxSupply ?? 0).toLocaleString()} will exist</u>`
      + `<u>${fmtEth(s.priceWei)} ETH each</u>`
      + `<u>Whitelist: ${WL_CAP} per wallet</u>`
      + `<u>Public: ${PUBLIC_CAP} per wallet</u></span>`);
    prop("hr2-stanchion", 600);
    prop("hr2-stanchion", 686);
    roomLayer.appendChild(px(el("div", "hr2-belt"), { left: "606px", width: "82px" }));
    const rec = el("div", "room-reception");
    rec.innerHTML = '<div class="counter"><i class="mon"></i><b>HR</b></div>';
    // the receptionist rode on .npc-2's filter, so she needs a palette of her
    // own now that the filters are gone, or she reverts to being the player
    const npc = walkerEl("fb-walker npc " + CAST.clerk.look);
    dress(npc, CAST.clerk.pal);
    npc.dataset.frame = "stand";
    px(npc, { left: "40px", bottom: "0px" });
    rec.appendChild(npc);
    px(rec, { left: "700px" });
    roomLayer.appendChild(rec);
    prop("hr2-poster", 710, '<div class="pic"><i class="m2"></i><i class="m1"></i><u class="sun"></u></div>');
    prop("room-speech", 758, s.maxSupply > 0 && s.minted >= s.maxSupply ? "All full. Try the floor." : state.mintOpen ? "The mint is on OpenSea. Link's on the desk." : mintScheduled() ? `We open ${fmtUtc(CFG.mintStartsAt)}.` : "We open at launch.");

    const inner = el("div");
    mintDesk(s, inner, true);
    deskCard(960, 500, inner);

    const frame = el("div", "hr2-frame");
    frame.innerHTML = `<div class="scr"><img src="${CFG.imageBase}/777.png" alt=""><b>EMPLOYEE OF THE MONTH</b></div>`;
    px(frame, { left: "1860px" });
    roomLayer.appendChild(frame);
  }

  // ---------- Trading floor: three desks, and a roster behind them
  /// The room is a FIXED 2800px whatever the wallet holds. Three seats, always
  /// — staffed by the brokers you post there, vacant otherwise. A wallet with
  /// a hundred brokers does not get a hundred desks; it gets the same room and
  /// a roster menu. Nothing in here may be sized or gated on state.brokers.
  // The room is laid out symmetrically about its own middle. Every zone has a
  // mirror the same width on the far side, so the three desks sit dead centre
  // and the furniture reads as balanced rather than piled up on one wall:
  //
  //   0    250      450        680              1520      1750     1950   2200
  //   | A  |  window |  props   |  THE  DESKS    |  props  | window |  G   |
  //          B            C            D             E        F
  const FLOOR_W = 2200;
  const MID = FLOOR_W / 2;                       // 1100
  const DESK_X = [680, 980, 1280];               // 3 x 240, span 680..1520
  const LINEUP_KEY = "firmbrokers.lineup.v1";

  function lineupStore() {
    try { return JSON.parse(localStorage.getItem(LINEUP_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function savedLineup() {
    if (!state.account) return [];
    const v = lineupStore()[state.account.toLowerCase()];
    return Array.isArray(v) ? v : [];
  }
  function saveLineup(ids) {
    if (!state.account) return;
    try {
      const all = lineupStore();
      all[state.account.toLowerCase()] = ids;
      localStorage.setItem(LINEUP_KEY, JSON.stringify(all));
    } catch (e) { /* private mode: the lineup just resets next visit */ }
  }
  /// Who is standing at the three desks. Saved choices win, anything sold or
  /// merged away drops out, and the gaps fill with the heaviest brokers left —
  /// so a fresh wallet walks in to its best people already out front.
  function lineup() {
    const bs = state.brokers;
    const byId = new Map(bs.map((b) => [b.id, b]));
    const slots = [null, null, null];
    const used = new Set();
    savedLineup().slice(0, 3).forEach((id, i) => {
      const b = byId.get(id);
      if (b && !used.has(id)) { slots[i] = b; used.add(id); }
    });
    const rest = bs.filter((b) => !used.has(b.id)).sort((a, b) => b.weight - a.weight || a.id - b.id);
    for (let i = 0; i < 3; i++) if (!slots[i] && rest.length) slots[i] = rest.shift();
    return slots;
  }
  function postToDesk(id, slot) {
    const cur = lineup().map((b) => (b ? b.id : null));
    const was = cur.indexOf(id);
    if (was >= 0) cur[was] = null;           // never stand at two desks at once
    cur[slot] = id;
    saveLineup(cur);
    // Coming from a desk's swap control the intent was to fill that one seat,
    // so the menu is done. Coming from the menu itself you are probably
    // rearranging more than one, so it stays up.
    if (state.rosterSlot !== null) state.rosterOpen = false;
    state.rosterSlot = null;
    state.rosterPick = null;
    rebuildRoom();
  }

  function buildFloorRoom() {
    const bs = state.brokers;
    const s = state.stats || PRELAUNCH;
    roomShell(FLOOR_W, []);

    // two lights only, over the outer desks, mirrored about the middle
    const LIGHT_W = 170;
    [800, 1400].forEach((cx) => prop("hr2-light", cx - LIGHT_W / 2));

    // B and F: the curtain walls, each 200 wide and each 250 from its end
    const WIN_W = 200, WIN_L = 250, WIN_R = FLOOR_W - WIN_L - WIN_W;   // 250 / 1750
    const SKY = [[16, 52, 228, "far"], [80, 54, 186, "near"], [148, 46, 236, "far"]];
    glassWall(WIN_L, WIN_W, SKY);
    glassWall(WIN_R, WIN_W, SKY);
    // the planters are centred ON the glass rather than tucked against one edge
    const PLANT_W = 220;
    [WIN_L, WIN_R].forEach((x) => prop("hr2-lowplanter", Math.round(x + WIN_W / 2 - PLANT_W / 2), "<i></i><i></i><i></i>"));

    // A and G: the door on one side, the merger on the other
    prop("hr2-plant", 160);
    // C and E: the working furniture, split so neither wall is bare
    buildPaydayMachine(state.brokers || []);
    prop("floor3-printer", 1540, '<div class="stand"></div><div class="box"></div>');
    prop("floor3-pizza", 1660, "<i></i><i></i><i></i>");

    // The tape is centred on the room. It has to stop short of both curtain
    // walls, so the band is the gap between them (500..1970) trimmed until its
    // own middle lands on the room's: 510 + 1180/2 = 1100 = FLOOR_W / 2.
    const tape = "AAPL ▲ · NVDA ▲ · TSLA ▼ · MSFT ▲ · AMZN ▲ · GOOGL ▼ · META ▲ · GME ▲ · PLTR ▼ · AMD ▲ · SPCX ▲ · USDG — · $9TO5 ▲ · ";
    const bandW = 1180;
    const bandX = Math.round(MID - bandW / 2);
    const tick = el("div", "floor3-tick");
    const tp = el("div", "tp");
    tp.innerHTML = tape.repeat(Math.ceil(bandW / 700) * 2).replace(/▲/g, '<span class="up">▲</span>').replace(/▼/g, '<span class="dn">▼</span>');
    tick.appendChild(tp);
    roomLayer.appendChild(px(tick, { left: bandX + "px", width: bandW + "px" }));

    [["NYC", -4], ["LON", 1], ["TYO", 9]].forEach(([c, off], i) => {
      const d = new Date(Date.now() + (off * 60 + new Date().getTimezoneOffset()) * 60000);
      // Left-aligned with the chart grid directly beneath them (also 510), and
      // the 30px that buys is what keeps them off the sign: the three clocks
      // run to 830 and the sign hangs from 850. They used to clear it only
      // because the sign sat lower down the wall than they did.
      prop("floor2-clock", 510 + i * 112, `<b>${c}</b><span>${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</span>`);
    });

    // Decoration, not data. THE FLOOR board used to stand here restating three
    // numbers the site already shows elsewhere: payroll paid is in the HUD on
    // every screen, next payday is the bank's whole job, and what you are owed
    // now sits on the roster sign, where the brokers who earned it are counted.
    const GRID_W = 236;
    const tile = (cls, sym) => `<i class="${cls}"><b>${sym}</b></i>`;
    // eight instruments, eight climbs, green and gold mixed across the wall
    prop("floor3-wall grid2 mounted", 510,
      tile("rise-steady", "AAPL") + tile("rise-stairs", "TSLA")
      + tile("rise-curve", "NVDA") + tile("rise-grind", "MSFT"));
    prop("floor3-wall grid2 mounted", FLOOR_W - 510 - GRID_W,
      tile("rise-late", "$9TO5") + tile("rise-spike", "GME")
      + tile("rise-early", "PLTR") + tile("rise-double", "SPCX"));
    prop("floor3-cooler", 1233, '<i class="bottle"></i><i class="tank"></i>');
    prop("room-clock", FLOOR_W - 120 - 54);

    // Two of them, against the two fixtures that are not the desks: the desk
    // row is what the room is for, and a crowd standing in front of it would
    // be competing with the thing the player came to look at.
    // The window bay looks like the obvious place for the second one and is
    // not: hr2-lowplanter runs the full width of the glass, so anyone standing
    // there stands IN the planting. The aisle between desks one and two is the
    // only clear floor in the room, and someone crossing it is what a trading
    // floor actually looks like.
    // NOT walk-4. Rendering all the candidate frames at 1:1 side by side shows
    // it is a wide straddle with the feet apart — as spread as walk-1 — so it
    // reads as a lunge the moment it stops moving. Only stand, stand-b, blink,
    // phone-a and phone-b survive being held still.
    roomNpc(922, "caller", "phone-a", false);   // in the aisle, taking a call
    roomNpc(668, "barista", "stand-b", true);   // at the coffee machine, facing it

    buildRosterBoard(bs);
    buildNudge(bs);
    buildMerger();

    const seats = lineup();
    seats.forEach((b, i) => buildDesk(DESK_X[i], b, i));
    roomLayer.classList.toggle("posting", state.rosterPick !== null);
    if (state.rosterOpen) buildRoster(bs);
    layoutWallSigns();
  }

  /// The sign and the empty-desk plaque share the wall between the ticker and
  /// the desk readouts. Both hung from the ground at fixed offsets, so the air
  /// above the sign grew with the window while the plaque stayed pinned just
  /// over the desks: 308 above and 10 below on a tall screen. They are spread
  /// evenly through that band now — the same air above the sign, between the
  /// two, and below the plaque — which is a measurement of two boxes whose
  /// heights change with the breakpoints, so it happens here and not in CSS.
  /// The CSS offsets stay as the arrangement before this runs.
  function layoutWallSigns() {
    if (state.mode !== "floor" || !roomLayer) return;
    const board = roomLayer.querySelector(".floor-board");
    const tape = roomLayer.querySelector(".floor3-tick");
    const scr = roomLayer.querySelector(".floor-desk .scr");
    if (!board || !tape || !scr) return;
    const nudge = roomLayer.querySelector(".floor-nudge");
    const base = roomLayer.getBoundingClientRect().top;
    const top = tape.getBoundingClientRect().bottom;
    const floor = scr.getBoundingClientRect().top;
    // measured where the stylesheet left them, before anything moves
    let items = nudge ? [board, nudge] : [board];
    let hs = items.map((e) => e.getBoundingClientRect().height);
    const airFor = (list) => floor - top - list.reduce((a, b) => a + b, 0);
    // On a wall too short for both, the plaque stands down rather than being
    // crammed through the desk readouts. It is the smaller loss: the sign
    // carries the button that does the same job.
    if (nudge) {
      nudge.style.display = "";
      if (airFor(hs) < 0) {
        nudge.style.display = "none";
        items = [board];
        hs = [board.getBoundingClientRect().height];
      }
    }
    // The air is shared out, never padded to a minimum: forcing a floor under
    // the gap is what pushed the plaque 14px onto the readouts at 640.
    // Carried as a fraction and rounded only where it lands, or three rounded
    // gaps plus two fractional heights drift the last one 4px off the first.
    const gap = Math.max(0, airFor(hs) / (items.length + 1));
    let y = top;
    items.forEach((e, i) => {
      y += gap;
      e.style.bottom = "auto";
      e.style.top = Math.round(y - base) + "px";
      y += hs[i];
    });
  }
  // the two boxes are sized by breakpoints, so their spacing has to be taken
  // again when the window changes. Nothing else in the room needs a rebuild.
  let signFrame = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(signFrame);
    signFrame = requestAnimationFrame(layoutWallSigns);
  });

  /// The empty desks are the pitch, so they get a sign rather than a button
  /// wedged into the furniture. It stands above the desk run whenever there is
  /// a seat going spare -- which includes a visitor who owns nothing at all.
  function buildNudge(bs) {
    const empty = 3 - Math.min(3, bs.length);
    if (empty <= 0) return;
    const WORDS = [
      null,
      ["ONE DESK STILL EMPTY", "hire one more broker"],
      ["TWO DESKS STILL EMPTY", "hire another broker"],
      ["THREE EMPTY DESKS", "put somebody at one"],
    ][empty];
    const run = DESK_X[0] + (DESK_X[2] + 240 - DESK_X[0]) / 2;
    const n = prop("floor-nudge", Math.round(run - 210), `<div class="plate">
        <b>${WORDS[0]}</b><span>${WORDS[1]} <u>→</u></span>
      </div>`);
    n.addEventListener("click", goHire);
    n.title = "hire a broker at HR";
  }

  // ---------------------------------------------------- the broker's colours
  /// A broker at a desk is the player's own sprite wearing his colours. The
  /// grids are palette-indexed and walker_palette.py exposes the eight
  /// trait-driven slots as custom properties, so dressing one is eight
  /// assignments and no new art.
  ///
  /// art/walker_palette.json is generated from the same trait tables the bust
  /// is drawn from, so it is exact by construction -- including the two cases
  /// no amount of pixel-reading can settle: Pinstripe alternates colours by
  /// design, and a Bolo is two cords with shirt between them, so neither has a
  /// canonical pixel. It must stay same-origin; it is small (18KB gzipped) and
  /// fetched once.
  const WALKER_PAL = "art/walker_palette.json";
  const WALKER_TRAITS = "art/walker_traits.json";
  const SLOTS = ["H", "S", "d", "N", "D", "T", "L", "M"];
  /// Paint order. Hair sits under everything; a phone held to the ear has to
  /// sit over it. The DOM order IS the paint order, so this is the order the
  /// layers are appended in.
  const WALKER_LAYERS = ["hr", "st", "ti", "pk", "hd", "ey", "wr"];
  /// The default dress: what the player and the NPCs have always worn. Without
  /// it they would be bald and empty-handed, because both the hair and the
  /// briefcase moved out of the body and onto layers.
  const WALKER_DEFAULT = "hr-flat hd-briefcase";
  let walkerPal = null;
  let walkerTraits = null;
  let walkerPending = false;

  /// A walker is the body plus seven trait layers. Everything that draws one
  /// goes through here so no walker can be built without them.
  function walkerEl(cls) {
    const w = el("div", cls);
    for (const k of WALKER_LAYERS) w.appendChild(el("i", k));
    return w;
  }

  function loadWalkerData() {
    if (walkerPending) return;
    walkerPending = true;
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get(WALKER_PAL), get(WALKER_TRAITS)]).then(([p, t]) => {
      walkerPal = p || walkerPal;
      walkerTraits = t || walkerTraits;
      if ((p || t) && state.mode === "floor") rebuildRoom();
    });
  }

  /// Pinstripe wants the suit lightened and a pocket square wants the tie
  /// lightened. Neither is in the palette file, and neither needs to be: both
  /// derive from slots we already have.
  function lift(hexc, f) {
    const n = parseInt(hexc.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function dress(node, entry) {
    for (const k of SLOTS) if (entry[k]) node.style.setProperty("--w" + k, entry[k]);
    // 1.9, where the bust art uses 1.4 on the same navy. Matching the number
    // did not match the result: the bust runs four stripes across a wide torso
    // and the eye reads the repeat, while the walker has room for two on a
    // six-pixel chest and has only raw contrast to work with. At 1.4 the
    // sprite read as plain navy, so a Pinstripe broker was wearing a suit his
    // own artwork did not show. This is the walker only — the artwork is
    // pinned and untouched.
    if (entry.N) node.style.setProperty("--wX", lift(entry.N, 1.9));
    if (entry.T) node.style.setProperty("--wQ", lift(entry.T, 1.35));
    // Rounded to a whole pixel on purpose. The two scaled legendaries ask for
    // 0.85 and 1.15, which land on 3.4px and 4.6px, and every box-shadow offset
    // is a multiple of --px — so a fraction puts the whole sprite on half pixels
    // and the browser antialiases edges that are meant to be hard, unevenly,
    // some rows 3px and some 4px. The Intern draws at 3 and the Whale at 5,
    // which is still small and still oversized, and still pixel art.
    if (entry.scale && entry.scale !== 1) {
      node.style.setProperty("--px", Math.max(1, Math.round(4 * entry.scale)) + "px");
    }
  }

  /// The shapes: hair silhouette, eyewear, what he is holding, what he wears.
  /// Colour alone left every broker in the same body with the same haircut,
  /// holding a briefcase he did not own.
  function shapeBroker(node, artwork) {
    const cls = walkerTraits && walkerTraits[artwork];
    for (const c of [...node.classList]) {
      if (/^(hr|ey|wr|hd|pk|st|ti)-/.test(c)) node.classList.remove(c);
    }
    // an empty string would split to [""], and classList.add("") throws
    const add = (cls ? cls.split(" ") : []).filter(Boolean);
    node.classList.add(...(add.length ? add : ["hr-flat"]));
  }

  /// Fallback for when the table cannot be fetched. The bust is drawn from the
  /// same tables, so its pixels approximate the palette: measured against all
  /// 2,490 non-legendary tokens this is exact on hair, skin and suit, and
  /// right on 95.9% of ties. Only ever used if the table is missing.
  const sampled = new Map();
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const dim = (c, f) => hex(c.map((v) => Math.round(v * f)));

  function modal(g, x, y, w, h, skip) {
    const d = g.getImageData(x, y, w, h).data;
    const seen = new Map();
    let best = null, bestN = 0;
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (k === skip) continue;
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n > bestN) { bestN = n; best = k; }
    }
    return best === null ? null : [(best >> 16) & 255, (best >> 8) & 255, best & 255];
  }

  function sampleArtwork(node, artwork) {
    const hit = sampled.get(artwork);
    if (hit) { dress(node, hit); return; }
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 480;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(im, 0, 0);
        const one = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
        const bg = one(6, 6);
        const bgk = (bg[0] << 16) | (bg[1] << 8) | bg[2];
        const S = one(240, 185);
        let H = null;
        for (let y = 72; y < 140 && !H; y += 2) {
          const p = modal(g, 224, y, 32, 2, bgk);
          if (p && Math.max(Math.abs(p[0] - S[0]), Math.abs(p[1] - S[1]), Math.abs(p[2] - S[2])) > 10) H = p;
        }
        const N = modal(g, 118, 312, 50, 40, bgk) || [42, 56, 88];
        let T = modal(g, 232, 318, 16, 74, bgk);
        if (T && Math.min(T[0], T[1], T[2]) > 225) T = null;   // a narrow tie samples the shirt
        const e = {
          H: hex(H || S), S: hex(S), d: dim(S, 0.74),
          N: hex(N), D: dim(N, 0.78), T: hex(T || N),
          L: dim(N, 0.80), M: dim(N, 0.62),
        };
        sampled.set(artwork, e);
        if (node.isConnected) dress(node, e);
      } catch (e) { /* tainted or unreadable: he keeps the default palette */ }
    };
    im.src = `${CFG.imageBase}/${artwork}.png`;
  }

  function dressBroker(node, artwork) {
    shapeBroker(node, artwork);
    const e = walkerPal && walkerPal[artwork];
    if (e) { dress(node, e); return; }
    loadWalkerData();
    sampleArtwork(node, artwork);
  }

  /// A station: the broker at true scale, an open-frame desk in front of him
  /// so his legs and shoes still read beneath the top, and the readout on the
  /// wall above, because at this size the furniture cannot carry text.
  function buildDesk(x, b, i) {
    const t = b ? tierOf(b.tierBurned) : null;
    const status = !b ? "vac" : b.liveNow ? "live" : b.active ? "soon" : "off";
    const legendary = !!b && !!(walkerPal && walkerPal[b.artwork] && walkerPal[b.artwork].legendary);
    const d = el("div", "floor-desk s-" + status + (t ? " t" + t.idx : "")
      + (legendary ? " legendary" : "")
      + (b && state.fusePick.has(b.id) ? " fusemark" : ""));

    // What a broker is worth, not what he happened to make this hour. The ETH
    // figure moved every refresh, needed five decimals to say anything, and
    // told nobody what to do about it — the multiplier is the number a
    // promotion actually changes. The level and the job title are the same
    // rung said twice on purpose: the number is the ladder, the title is him.
    const state3 = !b ? null
      : b.liveNow ? `<div class="live"><i></i><i></i><i></i><u>EARNING</u></div>`
      : b.active ? `<div class="wait">STARTS NEXT HOUR</div>`
      : `<div class="wait idle">NOT HIRED</div>`;

    d.innerHTML = `
      <div class="scr">
        <span class="lamp"></span>
        <b>${b ? `#${b.id}${b.parts > 1 ? "·" + b.parts + "×" : ""} · ${t.name.toUpperCase()}${legendary ? " ★" : ""}` : "DESK AVAILABLE"}</b>
        ${b
          ? `<div class="row"><span>LEVEL ${t.level} OF ${MAX_LEVEL}</span><i>${(b.weight / 100).toFixed(2)}x</i></div>
             ${state3}`
          : `<div class="row">nobody here</div>
             <div class="row">click to hire <u>→</u></div>`}
        ${state.account && state.brokers.length ? '<button class="swap" type="button">⇄</button>' : ""}
      </div>
      <div class="desk">
        <div class="top"></div><i class="lg l"></i><i class="lg r"></i>
        <div class="mon"></div>
        ${b ? '<div class="mug"></div>' : ""}
      </div>
      ${b ? "" : '<div class="chair"><i class="bk"></i><i class="st"></i><i class="ps"></i><i class="ft"></i></div>'}`;

    if (b) {
      const who = walkerEl("fb-walker deskbroker");
      who.dataset.frame = "stand";
      who.style.animationDelay = (i * 0.8).toFixed(1) + "s";
      dressBroker(who, b.artwork);
      d.appendChild(who);
    }

    const swap = d.querySelector(".swap");
    if (swap) swap.addEventListener("click", (e) => {
      e.stopPropagation();
      state.rosterSlot = i;
      state.rosterOpen = true;
      state.rosterPick = null;
      rebuildRoom();
    });
    d.addEventListener("click", () => {
      // while a broker is picked in the roster, every seat is somewhere to put him
      if (state.rosterPick !== null) { postToDesk(state.rosterPick, i); return; }
      if (b) { openBrokerPopover(b); return; }
      goHire();
    });
    px(d, { left: x + "px" });
    roomLayer.appendChild(d);
  }


  /// An empty desk is an invitation, so it walks you to the people who fill it.
  function goHire() {
    const z = ZONES[1];
    warpTo(z);
    tryEnter(z);
  }

  /// THE PAYDAY MACHINE — the payroll engine, walk-up edition. The whole
  /// cabinet is one click target: it collects every broker you own through
  /// the same COLLECT PAY runner, and between paydays it counts down to the
  /// next hour so it is never a dead prop.
  function paydayUsdgOf(b) {
    const p = b.pending || 0n;
    if (!p || !b.split || !b.split.length) return p;
    return (p * b.split.reduce((a, sp) => a + (sp.idx === 11 ? BigInt(sp.bps) : 0n), 0n)) / 10000n;
  }
  function buildPaydayMachine(bs) {
    const out = !state.account;
    const collectable = out ? 0n : bs.filter((b) => b.active).reduce((acc, b) => acc + paydayUsdgOf(b), 0n);
    const hasActive = !out && bs.some((b) => b.active);
    const st = state.stats || {};
    const nowRound = Math.floor(Date.now() / 3_600_000);
    const roundDue = hasActive && st.lastSettled !== null && st.lastSettled !== undefined
      && nowRound > st.lastSettled && (st.potBuffer || 0n) >= engineMinSwap();
    // hired but never seated on payroll: admission lost its heartbeat with the
    // keeper, so the machine seats the visitor's own brokers on click
    const stranded = out ? [] : bs.filter((b) => b.active && !b.liveNow && b.liveFrom > 0 && nowRound >= b.liveFrom).map((b) => b.id);
    const mm = String(59 - new Date().getUTCMinutes()).padStart(2, "0");
    // faces: the button is only ever CLICKABLE when a click will really pay.
    // Until the async pre-flight answers, earnings show as BUILDING.
    const crt = (label, big) => `<div class="crt"><i class="scan"></i><i class="vig"></i><b>${label}</b><u>${big}</u></div>`;
    const faceArmed = (label, big) => crt(label, big) + `<div class="btn">&#9654; CLICK TO COLLECT &#9664;</div>`;
    const faceIdle = () => (out
      ? crt("EVERY BROKER PAID", "CLOCK IN") + `<div class="btn dim">CLOCK IN TO SEE PAY</div>`
      : collectable > 0n
        ? crt("PAY BUILDING", `${fmtEth(collectable)} ETH`) + `<div class="btn dim">NEXT PAYDAY IN ${mm} MIN</div>`
        : crt("ALL COLLECTED", `PAYDAY :${mm}`) + `<div class="btn dim">NEXT PAYDAY IN ${mm} MIN</div>`);
    let armed = false;
    let face = out ? faceIdle() : crt(collectable > 0n ? "PAY BUILDING" : "PAYROLL", collectable > 0n ? `${fmtEth(collectable)} ETH` : "CHECKING…") + `<div class="btn dim">CHECKING THE POT…</div>`;
    const m = prop("fb-payday", 386, `
      <div class="body">
        <div class="marq">PAYDAY</div>
        <div class="face">${face}</div>
        <div class="mouth"><i class="cav"></i><i class="bill b1"></i><i class="bill b2"></i><i class="bill b3"></i><i class="lip"></i></div>
        <div class="louv"><i></i><i></i><i></i></div>
        <div class="plate"><i class="bolt bl"></i>PAYROLL&nbsp;ENGINE<i class="bolt br"></i></div>
      </div>
      <div class="crank"><i class="boss"></i><i class="arm"></i><i class="handle"></i></div>
      <i class="plinth p1"></i><i class="plinth p2"></i>`);
    m.title = "collect your brokers' pay";
    const setFace = (html, on) => {
      if (!document.body.contains(m)) return;
      armed = on;
      m.classList.toggle("armed", on);
      const f = m.querySelector(".face");
      if (f) f.innerHTML = html;
    };
    // async pre-flight: arm only when a click would truly pay out
    if (!out) (async () => {
      try {
        if (stranded.length) { setFace(faceArmed(`${stranded.length} BROKER${stranded.length === 1 ? "" : "S"} OFF PAYROLL`, "CLICK TO SEAT"), true); return; }
        if (roundDue) { setFace(faceArmed("FEES ACCRUED FOR PAYDAY", "RUN PAYDAY"), true); return; }
        const owedFees = await F.owedEngine();
        state.owedFees = owedFees;
        if (hasActive && owedFees >= PAYDAY_OWED) { setFace(faceArmed("FEES ACCRUED FOR PAYDAY", "RUN PAYDAY"), true); return; }
        if (hasActive) {
          const plan = await payPlan(bs.filter((b) => b.active).map((b) => b.id));
          if (plan.total >= engineMinSwap() && plan.ids.length) {
            // a stock-split holder can carry the batch without any USDG-bound
            // pay of their own: arm honestly as a floor payday, not "you
            // earned 0.0000"
            setFace(plan.own > 0n
              ? faceArmed("YOUR BROKERS EARNED", `${fmtEth(plan.own)} ETH`)
              : faceArmed("POOLED PAY IS READY", "RUN PAYDAY"), true);
            return;
          }
        }
        setFace(faceIdle(), false);
      } catch (e) { if (document.body.contains(m)) setFace(faceIdle(), false); }
    })();
    m.addEventListener("click", async () => {
      if (out) { connect(); return; }
      if (m.classList.contains("working")) return;
      if (!armed) { toast(`your pay is building — it becomes collectable at the top of the hour (${String(59 - new Date().getUTCMinutes()).padStart(2, "0")} min), when the whole floor's payday pot fills`); return; }
      m.classList.add("working");
      try {
        if (stranded.length) {
          toast(`seating ${stranded.length} broker${stranded.length === 1 ? "" : "s"} on payroll…`);
          const h = await F.sync(stranded, state.account);
          await F.waitForTx(h);
          toast("seated — they start earning at the next payday", true);
          await refreshBrokers();
        } else {
          await collectPay(bs, roundDue);
        }
      } finally { m.classList.remove("working"); }
    });
  }

  /// The board over the desks. It exists to say the thing three desks cannot:
  /// how many brokers you actually own, and that all of them are on payroll
  /// whether or not they are one of the three standing here.
  function buildRosterBoard(bs) {
    const out = !state.account;
    const label = out ? "CLOCK IN" : bs.length ? "OPEN THE ROSTER" : "GO TO HR";
    const hired = bs.filter((x) => x.active).length;
    // Two cleanup jobs, and never both at once: empty the vaults that have
    // something in them, then stop them filling. Showing one at a time keeps
    // the sign at two buttons, which is all it has room for lying sideways,
    // and once the second is done neither ever comes back.
    const claimable = out ? [] : bs.filter((b) => b.holdings.length);
    const manual = out ? [] : bs.filter((b) => b.active && !b.collect);
    // mid-sale the one job is getting people ON payroll, so a squad of two or
    // more unhired brokers takes the slot ahead of the cleanup buttons
    const unhired = out ? [] : bs.filter((b) => !b.active);
    // collecting moved to the PAYDAY machine beside the window; the slot goes
    // back to the squad jobs
    const extra = unhired.length >= 2
      ? { cls: "hireall", label: `HIRE ALL <i>${unhired.length}</i>` }
      : claimable.length
        ? { cls: "claimall", label: `CLAIM ALL <i>${claimable.length}</i>` }
        : manual.length
          ? { cls: "autoall", label: `GO AUTOMATIC <i>${manual.length}</i>` }
          : null;
    // The one number anyone came here for is how many of the brokers you own
    // are actually on payroll. A big figure with a caption beside it did not
    // read; a labelled fraction with a bar under it does, and it does it
    // without anybody having to work out what a row of little desks meant.
    const pct = bs.length ? Math.round((hired / bs.length) * 100) : 0;
    const tally = out ? "<u>—</u>" : `<u>${hired}</u><i>of ${bs.length}</i>`;
    const say = out
      ? "connect your wallet to see who is on your payroll"
      : bs.length
        ? "pick who stands at these three desks"
        : "no brokers yet — hire your first one at HR";
    // The desks are a shop window, not the payroll. Say so in the words that
    // answer the question people actually ask: does standing here pay more?
    // kept short enough to break onto two centred lines in both the tall and
    // the sideways layout — "for show only" already carries the desk part, so
    // spelling it out a second time only bought a third line with one word on it
    const also = out ? ""
      : !bs.length
        ? `<div class="also">every broker you hire earns a share of the pot, every hour</div>`
        : hired === 0
          ? `<div class="also"><b>none of them is hired yet.</b> hire one to start earning</div>`
          : `<div class="also"><b>a desk is for show only.</b> ${hired === 1 ? "your hired broker earns" : `all ${hired} hired brokers earn`} every hour</div>`;
    // hung from the room's midpoint and pulled back by half its own width in
    // CSS, so a short viewport can widen the sign — going wide instead of tall
    // is the only way it clears both the ticker tape and the empty-desk plaque
    // — without the left edge having to be recomputed here.
    const bd = prop("floor-board", MID, `<div class="ttl">YOUR BROKERS</div>
      <div class="body">
        <div class="scr">
          <div class="fig">
            <div class="tally"><span class="lab">ON PAYROLL</span><span class="num">${tally}</span></div>
            <div class="bar"><s style="width:${pct}%"></s></div>
            <div class="alltime"></div>
          </div>
          <div class="txt"><div class="say">${say}</div>${also}</div>
        </div>
        <div class="side"><button class="btn" type="button">${label}</button>${
          extra ? `<button class="btn ${extra.cls}" type="button">${extra.label}</button>` : ""
        }</div>
      </div>`);
    // the number that answers "was it worth it": everything this wallet's
    // brokers have ever been paid, plus what is building right now
    if (!out && bs.length) (async () => {
      try {
        const paid = await F.earnedAllTime(bs.map((b) => b.id));
        const building = bs.reduce((a2, b) => a2 + (b.pending || 0n), 0n);
        const totalEarned = paid + building;
        if (totalEarned <= 0n) return;
        const el2 = bd.querySelector(".alltime");
        if (!el2 || !document.body.contains(el2)) return;
        const px6 = (state.stats || {}).usdPerEth;
        const usd = px6 ? Number((totalEarned * px6) / 10n ** 18n) / 1e6 : null;
        el2.textContent = `earned all time: ${fmtEth(totalEarned)} ETH${usd !== null ? ` · $${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}`;
      } catch (e) { /* the line just stays absent */ }
    })();
    const ha = bd.querySelector(".hireall");
    if (ha) ha.addEventListener("click", () => hireAll(unhired));
    const ca = bd.querySelector(".claimall");
    if (ca) ca.addEventListener("click", () => claimAll(claimable));
    const aa = bd.querySelector(".autoall");
    if (aa) aa.addEventListener("click", () => goAutomatic(manual));
    const btn = bd.querySelector(".btn");
    btn.addEventListener("click", () => {
      if (out) { connect(); return; }
      if (!bs.length) { goHire(); return; }
      state.rosterOpen = !state.rosterOpen;
      state.rosterSlot = null;
      state.rosterPick = null;
      rebuildRoom();
    });
  }

  /// The roster menu. Two rows of cards on a tall viewport, one on a short one,
  /// so it always stops above the counters and you can still read what the
  /// broker you are about to replace is earning.
  function buildRoster(bs) {
    // Two rows only where two rows FIT. The panel hangs from 106 and has to end
    // above the desk readouts, which sit at ground+190 and grew when they
    // started carrying the level and the earning state. At 780 the second row
    // ran 85px into them — it did before those readouts grew, too, by 43.
    const rows = innerHeight >= 900 ? 2 : 1;
    // 14 across keeps a two-row panel short enough to clear the station
    // readouts beneath it, and fits more of the roster on a page
    const per = 14 * rows;
    // heaviest first by default, so page one is always your best people and
    // most wallets never press NEXT; newest first is the other thing anyone
    // actually wants ("where is the one I just minted")
    const sorted = state.rosterSortId
      ? [...bs].sort((a, b) => b.id - a.id)
      : [...bs].sort((a, b) => b.weight - a.weight || a.id - b.id);
    const pages = Math.max(1, Math.ceil(sorted.length / per));
    const page = Math.min(state.rosterPage || 0, pages - 1);
    state.rosterPage = page;
    const seats = lineup();
    const at = new Map(seats.map((b, i) => [b && b.id, i]));

    // Once you have picked someone up, the menu folds to a single bar. It has
    // to: open, it covers the top half of every desk, and the instruction is
    // "click a desk". Getting out of the way is the instruction.
    const carrying = state.rosterPick !== null;
    const pan = el("div", "floor-roster" + (carrying ? " carrying" : ""));
    const hired = bs.filter((b) => b.active).length;
    const hint = state.rosterSlot !== null
      ? `pick who takes desk ${state.rosterSlot + 1}`
      : "click a broker to open him · ⇄ moves him to a desk";
    pan.innerHTML = `
      <div class="head">
        <b>${carrying ? "CARRYING #" + state.rosterPick : "THE ROSTER"}</b>
        <span class="sub">${carrying
          ? "click the desk he should take"
          : `${bs.length} broker${bs.length === 1 ? "" : "s"} · <b class="lit">${hired} hired</b> · a desk is for show only — every hired broker earns every hour, standing at one or not`}</span>
        ${carrying ? "" : `<button class="sort" type="button">SORT: ${state.rosterSortId ? "NEWEST" : "TIER"}</button>`}
        <button class="x" type="button">${carrying ? "PUT HIM BACK" : "X"}</button>
      </div>
      <div class="grid"></div>
      <div class="foot">
        <button class="pg prev" type="button">‹ PREV</button>
        <span class="of">PAGE ${page + 1} OF ${pages}</span>
        <button class="pg next" type="button">NEXT ›</button>
        <span class="key"><i class="live"></i>earning <i class="soon"></i>starts next hour <i class="off"></i>not hired</span>
        <span class="hint">${hint}</span>
      </div>`;

    const grid = pan.querySelector(".grid");
    for (const b of sorted.slice(page * per, page * per + per)) {
      const t = tierOf(b.tierBurned);
      const slot = at.has(b.id) ? at.get(b.id) : -1;
      const st = b.liveNow ? "live" : b.active ? "soon" : "off";
      const card = el("button", "card s-" + st + (slot >= 0 ? " posted" : "") + (state.rosterPick === b.id ? " picked" : ""));
      card.type = "button";
      card.innerHTML = `<span class="pic">
          <img src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="">
          <span class="dot"></span>
          ${b.active ? "" : '<em>NOT HIRED</em>'}
          ${slot >= 0 ? `<s>DESK ${slot + 1}</s>` : ""}
          ${state.rosterSlot === null ? '<span class="move" role="button" title="move him to a desk">⇄</span>' : ""}
        </span><b>#${b.id}</b><u>L${t.level} · ${t.name}</u>`;
      card.title = state.rosterSlot !== null
        ? `put #${b.id} at desk ${state.rosterSlot + 1}`
        : `open #${b.id} — level ${t.level}, ${t.name} · ${b.active
            ? (b.liveNow ? "earning now" : "starts next hour")
            : "not hired — burn $9TO5 to hire him"}`;
      // THE ONLY WAY IN for all but three brokers. This used to pick him up to
      // seat him, which meant a wallet holding more than three could not reach
      // its own brokers' paycheck, promotion or pay-to-wallet switch at all —
      // and the sign on this very panel says a desk is for show only. Opening
      // the file is the click; moving him is the handle, exactly as it is on
      // the desk itself.
      card.addEventListener("click", (e) => {
        if (state.rosterSlot !== null) { postToDesk(b.id, state.rosterSlot); return; }
        if (e.target.closest(".move")) {
          state.rosterPick = state.rosterPick === b.id ? null : b.id;
          rebuildRoom();
          return;
        }
        openBrokerPopover(b);
      });
      grid.appendChild(card);
    }
    if (!sorted.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No brokers in this wallet yet.</div>';

    // carrying someone, the same button puts him back down and unfolds the
    // menu again rather than throwing the whole thing away
    pan.querySelector(".x").addEventListener("click", () => {
      if (carrying) { state.rosterPick = null; rebuildRoom(); return; }
      state.rosterOpen = false;
      state.rosterSlot = null;
      rebuildRoom();
    });
    const prev = pan.querySelector(".prev");
    const next = pan.querySelector(".next");
    prev.disabled = page === 0;
    next.disabled = page >= pages - 1;
    prev.addEventListener("click", () => { state.rosterPage = page - 1; rebuildRoom(); });
    next.addEventListener("click", () => { state.rosterPage = page + 1; rebuildRoom(); });
    const sort = pan.querySelector(".sort");
    if (sort) sort.addEventListener("click", () => {
      state.rosterSortId = !state.rosterSortId;
      state.rosterPage = 0;
      rebuildRoom();
    });
    // On the body and fixed, the same way popovers are done. Anywhere inside
    // the stage it would ride along with the camera, and with any scroll the
    // stage picked up.
    document.body.appendChild(pan);
  }

  /// The merger is a machine that stands on the floor at a fixed x, so it can
  /// never migrate with the broker count the way the old card did. The machine
  /// itself is only a door: everything you can do to it — load, take out,
  /// choose who survives, empty it, merge — lives in the menu behind it, so
  /// there is one place to look and backing out is a button rather than a
  /// hunt through three separate popovers.
  function buildMerger() {
    const m = mergeState();
    const el0 = prop("floor-merger" + (m.ok ? " armed" : "") + (m.picked.length ? " loaded" : ""), 1980,
      `<div class="hopper"></div>
      <div class="body">
        <div class="scr"><b>MERGER</b><u>${m.picked.length ? m.picked.map((b) => "#" + b.id).join(" ") : "EMPTY"}</u></div>
        <div class="slots">${[0, 1, 2].map((i) => `<i class="${i < m.picked.length ? "on" : ""}"></i>`).join("")}</div>
        <div class="grille"></div>
        <button class="fb-btn go" type="button">${m.picked.length ? "OPEN · " + m.picked.length : "OPEN"}</button>
      </div><div class="foot"></div>`);
    el0.querySelector(".go").addEventListener("click", (e) => { e.stopPropagation(); openMergeMenu(); });
    el0.addEventListener("click", openMergeMenu);
    el0.title = "load 2–3 brokers in and merge them into one";
  }

  // ---------- the merger's rules, mirrored from EmployeeNFT.fuse so the menu
  // can show what will happen before the wallet is ever opened.
  // ids[0] survives and keeps its token; the rest are burned. parts add up and
  // may never exceed 3, the merge bonus is 1.2x at two parts and 1.3x at three,
  // and the survivor's 1-of-1 bonus multiplies the lot — while an absorbed
  // 1-of-1 throws its own bonus away.
  const PART_MULT = { 1: 1, 2: 1.2, 3: 1.3 };
  const LEGENDARY_COUNT = 10;                 // artwork ids 1..10 are the 1-of-1s
  function isLegendary(b) { return !!b && b.artwork > 0 && b.artwork <= LEGENDARY_COUNT; }
  /// Weight with the merge and 1-of-1 multipliers taken back off — what this
  /// token contributes when something else absorbs it (EmployeeNFT._rawWeight).
  function rawWeight(b) {
    return b.weight / ((PART_MULT[b.parts] || 1) * (isLegendary(b) ? 1.5 : 1));
  }
  /// What is in the machine right now, and what would come out. Anything sold
  /// or already merged away falls out of the hopper on its own.
  function mergeState() {
    const byId = new Map(state.brokers.map((b) => [b.id, b]));
    const picked = [...state.fusePick].map((i) => byId.get(i)).filter(Boolean);
    if (picked.length !== state.fusePick.size) {
      state.fusePick.clear();
      picked.forEach((b) => state.fusePick.add(b.id));
    }
    const parts = picked.reduce((a, b) => a + b.parts, 0);
    const survivor = picked[0] || null;
    const raw = picked.reduce((a, b) => a + rawWeight(b), 0);
    return {
      picked, survivor, absorbed: picked.slice(1), parts,
      out: survivor ? raw * (PART_MULT[parts] || 1) * (isLegendary(survivor) ? 1.5 : 1) : 0,
      ok: picked.length >= 2 && picked.length <= 3 && parts <= 3,
    };
  }
  /// The two burn constants, read once. Null until they arrive, so the menu
  /// shows a dash rather than a wrong number.
  let fuseBurns = null;
  async function loadFuseBurns() {
    if (fuseBurns) return fuseBurns;
    try {
      const [two, three] = await Promise.all([F.nftNumber("FUSE_BURN_TWO"), F.nftNumber("FUSE_BURN_THREE")]);
      if (two === null || three === null) return null;
      fuseBurns = { two, three };
    } catch (e) { return null; }
    return fuseBurns;
  }
  function fuseCost(m) {
    if (!fuseBurns || !m.survivor) return null;
    if (m.parts <= 2) return fuseBurns.two;
    // a survivor that is already a 2-merge only pays the third-part burn
    if (m.survivor.parts === 2) return fuseBurns.three;
    return fuseBurns.two + fuseBurns.three;
  }
  function mergeBlocker(b, m) {
    if (state.fusePick.has(b.id)) return null;
    if (m.picked.length >= 3) return "the machine only takes three";
    if (b.parts >= 3) return "already a 3-part merge — it cannot go further";
    if (m.parts + b.parts > 3) return "that would be more than three parts";
    return null;
  }

  /// The merging menu. Load brokers in, take them out again, say which one
  /// survives, see the cost and the result before signing anything, and empty
  /// the whole machine in one click.
  function openMergeMenu() {
    closePopover();
    const pop = popoverShell();
    const card = el("div", "fb-merge");
    pop.appendChild(card);
    document.body.appendChild(pop);
    renderMergeMenu(card);
    // the burn constants arrive after the first paint; redraw when they do
    loadFuseBurns().then((v) => { if (v && document.body.contains(card)) renderMergeMenu(card); });
  }

  function renderMergeMenu(card) {
    const m = mergeState();
    const cost = fuseCost(m);
    const scroll = card.querySelector(".pick")?.scrollTop || 0;
    const slots = [0, 1, 2].map((i) => {
      const b = m.picked[i];
      if (!b) return '<div class="slot empty"><span>EMPTY</span></div>';
      const t = tierOf(b.tierBurned);
      const leg = isLegendary(b);
      return `<div class="slot ${i === 0 ? "keep" : "burn"}${leg ? " leg" : ""}">
          <img src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="">
          <em>${i === 0 ? "SURVIVES" : "BURNED"}</em>
          <b>#${b.id}${leg ? " ★" : ""}</b>
          <u>${t.name} · ${(b.weight / 100).toFixed(2)}x${b.parts > 1 ? " · " + b.parts + " PARTS" : ""}</u>
          <div class="ctl">
            ${i === 0 ? "" : `<button class="mini keepit" data-id="${b.id}" type="button">KEEP THIS ONE</button>`}
            <button class="mini out" data-id="${b.id}" type="button">TAKE OUT</button>
          </div>
        </div>`;
    }).join("");

    // absorbing a 1-of-1 destroys its 1.5x for good. It is the one mistake in
    // this menu that cannot be undone, so it gets said in full.
    const wasted = m.absorbed.filter(isLegendary);
    const warn = wasted.length
      ? `<div class="warn">★ ${wasted.map((b) => "#" + b.id).join(" and ")} ${wasted.length > 1 ? "are 1-of-1s" : "is a 1-of-1"}. Burned, ${wasted.length > 1 ? "their" : "its"} 1.5x bonus is gone forever — put ${wasted.length > 1 ? "one of them" : "it"} in the first slot instead and it keeps the bonus over everything else.</div>`
      : "";

    const sorted = [...state.brokers].sort((a, b) => b.weight - a.weight || a.id - b.id);
    const cards = sorted.map((b) => {
      const inside = state.fusePick.has(b.id);
      const stop = mergeBlocker(b, m);
      const t = tierOf(b.tierBurned);
      const leg = isLegendary(b);
      return `<button class="card${inside ? " in" : ""}${stop ? " no" : ""}" type="button" data-id="${b.id}"
          title="${inside ? "loaded — click to take it out" : stop || "click to load it in"}">
          <span class="pic"><img loading="lazy" src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="">
          ${inside ? "<s>IN</s>" : ""}</span>
          <b>#${b.id}${leg ? " ★" : ""}</b><u>${(b.weight / 100).toFixed(2)}x${b.parts > 1 ? " · " + b.parts + "p" : ""}</u>
        </button>`;
    }).join("");

    card.innerHTML = `<header>
        <div class="who"><b>THE MERGER</b><span>two or three brokers go in, one comes out</span></div>
        <button class="fb-btn small ghost" id="pop-close">X</button>
      </header>
      <p class="lead">The broker in the first slot keeps his token and takes on everyone else's weight. The others are burned and never come back.</p>
      <div class="slots">${slots}</div>
      ${warn}
      <div class="scr">
        <div><span>comes out</span><i>${m.survivor
          ? `#${m.survivor.id} · ${m.parts} PART${m.parts === 1 ? "" : "S"} · ≈${(m.out / 100).toFixed(2)}x`
          : "load two brokers to see"}</i></div>
        <div><span>up from</span><i>${m.survivor
          ? `${(m.survivor.weight / 100).toFixed(2)}x today  (+${((m.out - m.survivor.weight) / 100).toFixed(2)}x)`
          : "—"}</i></div>
        <div><span>this costs</span><i>${cost === null ? "—" : fmtCompact(cost) + " $9TO5 burned"}</i></div>
      </div>
      <div class="bar">
        <button class="fb-btn go" type="button">MERGE ${m.picked.length || ""}</button>
        <button class="fb-btn small ghost clr" type="button">EMPTY THE MACHINE</button>
      </div>
      <div class="pickhd"><b>LOAD A BROKER IN</b><span>${state.brokers.length} owned · click one to put it in the machine</span></div>
      <div class="pick">${cards || '<div class="none">No brokers in this wallet yet.</div>'}</div>`;

    card.querySelector(".pick").scrollTop = scroll;
    const redraw = () => { renderMergeMenu(card); if (state.mode === "floor") rebuildRoom(); };
    card.querySelector("#pop-close").addEventListener("click", closePopover);
    card.querySelectorAll(".out").forEach((btn) => btn.addEventListener("click", () => {
      state.fusePick.delete(Number(btn.dataset.id));
      redraw();
    }));
    // promoting a slot to survivor is just re-inserting it first: the Set keeps
    // insertion order, and insertion order is what fuse() reads as ids[0]
    card.querySelectorAll(".keepit").forEach((btn) => btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const rest = [...state.fusePick].filter((x) => x !== id);
      state.fusePick.clear();
      state.fusePick.add(id);
      rest.forEach((x) => state.fusePick.add(x));
      redraw();
    }));
    card.querySelectorAll(".pick .card").forEach((btn) => btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      if (state.fusePick.has(id)) { state.fusePick.delete(id); redraw(); return; }
      const b = state.brokers.find((x) => x.id === id);
      const stop = mergeBlocker(b, mergeState());
      if (stop) return toast(stop, false);
      state.fusePick.add(id);
      redraw();
    }));
    const clr = card.querySelector(".clr");
    clr.disabled = !m.picked.length;
    clr.addEventListener("click", () => { state.fusePick.clear(); redraw(); });
    const go = card.querySelector(".go");
    go.disabled = !m.ok;
    go.addEventListener("click", async () => {
      const ids = m.picked.map((b) => b.id);
      const burn = fuseCost(m) ?? (await loadFuseBurns(), fuseCost(m));
      if (burn === null) return toast("could not read the merge cost — try again", false);
      if (!(await ensureAllowance(burn))) return;
      await txFlow("merger", () => F.fuse(ids, state.account), async () => {
        state.fusePick.clear();
        closePopover();
        await refreshBrokers();
      });
    });
  }

  // ---------- the furnace: the Bank's burn counter
  /// Both things that burn $9TO5 — hiring a broker and moving him up the
  /// ladder — happen at the machine that already displays the burn total. The
  /// broker's own file still offers the next rung as a shortcut, because a
  /// player holding a broker should never have to know which room to walk to;
  /// this is the place that shows the whole climb and what each step costs.
  ///
  /// EmployeeNFT.upgradeTier takes any rung 1..4 and charges only the
  /// difference, so rungs are never climbed one at a time: Intern to CEO is a
  /// single burn of 825,000, not four separate ones adding to the same total.
  const ACTIVATE_FALLBACK = 25_000n * 10n ** 18n;
  let activateBurn = null;
  async function loadActivateBurn() {
    if (activateBurn !== null) return activateBurn;
    try {
      const n = await F.nftNumber("ACTIVATE_BURN");
      if (n !== null) activateBurn = n;
    } catch (e) { /* the fallback stands until the chain answers */ }
    return activateBurn;
  }
  /// A broker who has never been hired has burned nothing, and tierOf() reads
  /// him as an Intern he has not paid for. Every rung decision keys off this
  /// rather than off the tier name, which is the same for both.
  const isHired = (b) => !!b && b.tierBurned > 0n;
  /// What it costs him to stand on rung `idx` from wherever he is now —
  /// cumulative, exactly as the contract computes it.
  const rungCost = (b, idx) => TIERS[idx].burn - b.tierBurned;
  /// Who is on the belt and which rung is aimed at. A rung that stopped making
  /// sense — he was promoted past it in another tab, or sold, or merged away —
  /// falls off rather than quoting a price that would revert.
  function furnaceState() {
    const b = state.brokers.find((x) => x.id === state.furnacePick) || null;
    if (!b) return { b: null, tier: null, target: null, cost: null };
    let target = state.furnaceTier;
    if (target === null || target < 1 || target > 4 || !isHired(b) || TIERS[target].burn <= b.tierBurned) target = null;
    return { b, tier: tierOf(b.tierBurned), target, cost: target === null ? null : rungCost(b, target) };
  }

  function openFurnaceMenu(id) {
    closePopover();
    if (id !== undefined) { state.furnacePick = id; state.furnaceTier = null; }
    // one broker is not a choice, so make it for them
    if (state.furnacePick === null && state.brokers.length === 1) state.furnacePick = state.brokers[0].id;
    const pop = popoverShell();
    const card = el("div", "fb-merge fb-furnace");
    pop.appendChild(card);
    document.body.appendChild(pop);
    renderFurnaceMenu(card);
    // the hire cost lives on-chain and lands after the first paint
    loadActivateBurn().then((v) => { if (v !== null && document.body.contains(card)) renderFurnaceMenu(card); });
  }

  function renderFurnaceMenu(card) {
    const f = furnaceState();
    const b = f.b;
    const hireCost = activateBurn ?? ACTIVATE_FALLBACK;
    const scroll = card.querySelector(".pick")?.scrollTop || 0;
    const hired = isHired(b);

    // The ladder. Rungs below him are spent, the one he stands on is lit, and
    // the ones above are priced from here — so the CEO row shows what the whole
    // climb costs rather than only the next step.
    const rungs = !b ? "" : TIERS.map((t, i) => {
      const spent = hired && i < f.tier.idx;
      const here = hired && i === f.tier.idx;
      const cost = rungCost(b, i);
      const reachable = hired && i > f.tier.idx;
      const cls = "rung" + (spent ? " spent" : "") + (here ? " here" : "") + (f.target === i ? " aimed" : "") + (reachable ? "" : " off");
      // Before he is hired every rung would say the same thing, so instead they
      // price themselves from where hiring will put him: activate() seeds the
      // Intern burn, so that rung comes with the job and the rest cost the
      // difference from there. The note below says the order once.
      const right = here ? "he is here"
        : spent ? "passed"
        : !hired ? (i === 0 ? "comes with hiring" : `then ${fmtCompact(TIERS[i].burn - TIERS[0].burn)}`)
        : `burn ${fmtCompact(cost)}`;
      return `<button class="${cls}" type="button" data-tier="${i}" ${reachable ? "" : "disabled"}>
          <i></i><b><em>L${t.level}</em>${t.name.toUpperCase()}</b><u>${t.mult}</u><span>${right}</span>
        </button>`;
    }).join("");

    // Promoting before hiring is the one mistake here that quietly costs money:
    // activate() only seeds the 25,000 base when nothing has been burned yet, so
    // paying for a rung first means paying that base twice.
    const note = b && !hired
      ? `<div class="warn">Hire him before promoting him. A promotion sets what he has burned outright, so buying a rung first means the ${fmtCompact(hireCost)} $9TO5 hiring burn buys nothing — the same CEO costs 875,000 instead of 850,000.</div>`
      : "";

    const sorted = [...state.brokers].sort((a, c) => c.weight - a.weight || a.id - c.id);
    const cards = sorted.map((x) => {
      const t = tierOf(x.tierBurned);
      const leg = isLegendary(x);
      const on = x.id === state.furnacePick;
      return `<button class="card${on ? " in" : ""}" type="button" data-id="${x.id}"
          title="${isHired(x) ? t.name + " · " + (x.weight / 100).toFixed(2) + "x" : "not hired yet"}">
          <span class="pic"><img loading="lazy" src="${CFG.imageBase}/${x.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="">
          ${on ? "<s>IN</s>" : ""}</span>
          <b>#${x.id}${leg ? " ★" : ""}</b><u>${isHired(x) ? t.name : "OFF"}</u>
        </button>`;
    }).join("");

    // Swapping the tier's own weight inside EmployeeNFT.weightOf, so a merged
    // or 1-of-1 broker is quoted the gain he will actually see: his bonuses
    // multiply the promotion too, and the headline multiplier hides that.
    const projected = (x, idx) =>
      (rawWeight(x) - TIERS[tierOf(x.tierBurned).idx].w + TIERS[idx].w)
      * (PART_MULT[x.parts] || 1) * (isLegendary(x) ? 1.5 : 1);

    // A broker on the top rung has nothing to pick, so nothing here may ask him
    // to pick it. The belt above already carries what he earns today, so the
    // readout only says what changes.
    const topped = hired && f.tier.idx === 4;
    const after = !b ? "—"
      : !hired ? `${(TIERS[0].w / 100).toFixed(2)}x once hired`
      : topped ? "he is on the top rung"
      : f.target === null ? "pick a level above"
      : `${(projected(b, f.target) / 100).toFixed(2)}x  (+${((projected(b, f.target) - b.weight) / 100).toFixed(2)}x)`;
    const costLine = !b ? "—"
      : !hired ? `${fmtCompact(hireCost)} $9TO5 burned`
      : f.cost === null ? "—"
      : `${fmtCompact(f.cost)} $9TO5 burned`;

    const goLabel = !b ? "PICK A BROKER"
      : !hired ? "HIRE HIM"
      : topped ? "CEO ALREADY"
      : f.target === null ? "PICK A LEVEL"
      : `PROMOTE TO ${TIERS[f.target].name.toUpperCase()}`;

    // The squad: every hired broker standing BELOW the aimed rung, the one on
    // the belt included. Both filters are the contract's own refusals —
    // upgradeTier reverts NotHired on a broker who never clocked in and BadTier
    // on one already at or above the rung — and a batch is all-or-nothing, so a
    // list that contains either promotes nobody. It only offers itself for two
    // or more, because for one the button above already says it better.
    const squad = f.target === null ? []
      : state.brokers.filter((x) => isHired(x) && x.tierBurned < TIERS[f.target].burn);
    const squadCost = squad.reduce((sum, x) => sum + rungCost(x, f.target), 0n);
    const squadBar = squad.length > 1
      ? `<div class="bar"><button class="fb-btn go all" type="button">PROMOTE ALL ${squad.length} · BURN ${fmtCompact(squadCost)}</button></div>`
      : "";

    card.innerHTML = `<header>
        <div class="who"><b>THE FURNACE</b><span>burn $9TO5 to hire a broker and move him up</span></div>
        <button class="fb-btn small ghost" id="pop-close">X</button>
      </header>
      <p class="lead">Everything burned here is gone from the supply for good. A higher level is a permanently bigger share of every payday, and it stays with the broker if you sell him.</p>
      ${b ? `<div class="belt">
        <img src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="Broker ${b.id}">
        <div class="who"><b>#${b.id}${isLegendary(b) ? " ★" : ""}</b>
          <span>${hired ? "Level " + f.tier.level + " · " + f.tier.name + " · " + (b.weight / 100).toFixed(2) + "x today" : "not hired yet"}</span></div>
      </div>
      <div class="rungs">${rungs}</div>` : `<div class="none pickme">Pick a broker below to see his ladder.</div>`}
      ${note}
      <div class="scr">
        <div><span>would earn</span><i>${after}</i></div>
        <div><span>this costs</span><i>${costLine}</i></div>
      </div>
      <div class="bar"><button class="fb-btn go" type="button">${goLabel}</button></div>
      ${squadBar}
      <div class="pickhd"><b>WHOSE TURN</b><span>${state.brokers.length} owned · click one to put him on the belt</span></div>
      <div class="pick">${cards || '<div class="none">No brokers in this wallet yet. HR hires them.</div>'}</div>`;

    card.querySelector(".pick").scrollTop = scroll;
    const redraw = () => renderFurnaceMenu(card);
    card.querySelector("#pop-close").addEventListener("click", closePopover);
    card.querySelectorAll(".rungs .rung").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.tier);
      state.furnaceTier = state.furnaceTier === i ? null : i;
      redraw();
    }));
    card.querySelectorAll(".pick .card").forEach((btn) => btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      state.furnacePick = state.furnacePick === id ? null : id;
      state.furnaceTier = null;
      redraw();
      // the machine wears whoever is on the belt, and only this changes him
      if (state.mode === "bank") rebuildRoom();
    }));

    // two buttons carry .go now, and the squad's is the second one
    const go = card.querySelector(".go:not(.all)");
    go.disabled = !b || (hired && f.target === null);
    go.addEventListener("click", async () => {
      if (!b) return;
      const bal = await F.tokenBalance(state.account);
      if (!hired) {
        const burn = (await loadActivateBurn()) ?? ACTIVATE_FALLBACK;
        if (bal !== null && bal < burn) return toast(`hiring burns ${fmtCompact(burn)} $9TO5. The cash machine is in this room`, false);
        if (!(await ensureAllowance(burn))) return;
        return txFlow("hiring", () => F.activate(b.id, state.account), async () => {
          await preferWallet(b.id);
          await refreshBrokers();
          if (document.body.contains(card)) redraw();
        });
      }
      // re-read the belt: the wallet may have taken a minute, and the rung is
      // priced off what he has burned
      const cur = furnaceState();
      if (!cur.b || cur.target === null) return toast("that level is no longer ahead of him", false);
      if (bal !== null && bal < cur.cost) return toast(`this burns ${fmtCompact(cur.cost)} $9TO5. Not enough in the wallet`, false);
      if (!(await ensureAllowance(cur.cost))) return;
      await txFlow("promotion", () => F.upgradeTier(cur.b.id, cur.target, state.account), async () => {
        state.furnaceTier = null;
        await refreshBrokers();
        if (document.body.contains(card)) redraw();
      });
    });

    // The whole squad to the same rung, behind one confirmation where the
    // wallet allows it. Everything here is ordered by what the batch cannot
    // survive: the roster is read from the chain again first, because a broker
    // sold or promoted in another tab since this menu was drawn reverts the
    // list entire; the allowance is settled before the calls, because the burn
    // is a transferFrom and the first failed pull ends the batch; and the
    // balance is checked against the TOTAL, since a wallet that can afford four
    // rungs and not the fifth promotes nobody.
    card.querySelector(".go.all")?.addEventListener("click", async () => {
      const idx = state.furnaceTier;
      if (idx === null) return;
      await refreshBrokers();
      const list = state.brokers.filter((x) => isHired(x) && x.tierBurned < TIERS[idx].burn);
      if (!list.length) return toast("nobody is standing below that level any more", false);
      const total = list.reduce((sum, x) => sum + rungCost(x, idx), 0n);
      const bal = await F.tokenBalance(state.account);
      if (bal !== null && bal < total) {
        return toast(`promoting ${list.length} burns ${fmtCompact(total)} $9TO5. Not enough in the wallet`, false);
      }
      if (!(await ensureAllowance(total))) return;
      await promoteAll(list, idx);
      state.furnaceTier = null;
      if (document.body.contains(card)) redraw();
    });
  }

  // ---------- The bank: same building as HR and the floor, filled with the
  // machinery that actually moves the money. Two clusters under the camera wall
  // and the box wall, so no long stretch of bare concrete.
  function buildBankRoom() {
    const s = state.stats || PRELAUNCH;
    const mins = 59 - new Date().getMinutes();
    roomShell(3100, []);
    glassWall(460, 360, [[18, 56, 288, "far"], [90, 58, 232, "near"], [166, 54, 296, "far"], [242, 52, 240, "near"], [312, 44, 262, "far"]]);
    glassWall(2820, 280, [[14, 54, 276, "far"], [80, 56, 224, "near"], [152, 50, 286, "far"], [224, 48, 232, "near"]]);
    [290, 880, 1210, 1500, 1900, 2280, 2620].forEach((x) => prop("hr2-light", x));

    // the payday clock greets you at the door: it is the one number the whole
    // street is waiting on
    prop("bank2-pillar", 300, `<div class="col">
        <div class="scr"><b>NEXT PAYDAY</b><u>${mins}</u><s>MINUTES</s></div>
        <div class="vent"></div><div class="plate"><span>PAYROLL</span></div>
        <div class="leds">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < Math.round((5 * (59 - mins)) / 59) ? "on" : ""}"></i>`).join("")}</div>
      </div><div class="foot"></div>`);

    // the number the bank exists to show: everything the payroll has ever
    // pulled in for the brokers, in dollars when the TWAP answers, in ETH
    // when it does not. totalHarvested only ever rises.
    {
      const h = s.totalHarvested;
      const px6 = s.usdPerEth; // USDG (6 dec) per 1 ETH
      const usd = h != null && px6 ? Number((h * px6) / 10n ** 18n) / 1e6 : null;
      const big = usd !== null ? `$${Math.round(usd).toLocaleString()}` : h != null ? `${fmtEth(h)} ETH` : "—";
      const board = prop("bank2-earned", 1870, `<div class="frame">
          <i class="scan"></i>
          <b>EARNED BY BROKERS · ALL TIME</b>
          <u data-usd="${usd !== null ? Math.round(usd) : ""}">${big}</u>
          <s>in USDG and real stocks · 5,000 brokers · every hour, on-chain</s>
          <div class="count"></div>
        </div>`);
      // the headcount joins the money on the same board: hired == isActive,
      // derived from the activation ledger. Hidden (not zero) if the scan
      // fails — "0 brokers hired" would be a lie.
      (async () => {
        try {
          const hired = await F.hiredCount();
          const c = board.querySelector(".count");
          if (!c || !document.body.contains(c) || !hired) return;
          c.textContent = `BROKERS ON PAYROLL · ${hired.toLocaleString()} OF 5,000 · ${(100 * hired / 5000).toFixed(1)}% of the collection working`;
        } catch (e) { /* stat stays hidden */ }
      })();
      // odometer: the number rolls up on entry, because a number this good
      // deserves a moment
      const uEl = board.querySelector("u");
      const target = usd !== null ? Math.round(usd) : null;
      if (uEl && target && target > 0) {
        const t0 = performance.now();
        const tick = (t) => {
          if (!document.body.contains(uEl)) return;
          const k = Math.min(1, (t - t0) / 1200);
          const eased = 1 - Math.pow(1 - k, 3);
          uEl.textContent = `$${Math.round(target * eased).toLocaleString()}`;
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }

    prop("bank2-office", 870, `<div class="inside">
        <div class="pin"></div><div class="cab"></div><div class="chair"></div>
        <div class="desk"></div><div class="mon"></div><div class="papers"></div><div class="lamp"></div>
      </div>
      <div class="rail"></div><div class="glass"></div>
      <div class="door"><i class="bar"></i><i class="kick"></i><i class="hinge"></i></div><b>TREASURY</b>`);

    // burn cluster: the furnace, what it leaves behind, and the cameras watching
    prop("bank2-flue", 1418, "<i></i><i></i>");
    // the furnace is the room's second door: it displayed the burn total for a
    // long time without being the place anything was burned, and hiring and
    // promoting are the only two things that burn at all
    const onBelt = state.brokers.find((x) => x.id === state.furnacePick) || null;
    const furn = prop("bank2-furnace" + (onBelt ? " loaded" : ""), 1300, `<div class="hopper"></div>
      <div class="body">
        <div class="scr"><b>BURNED</b><u>${s.burned !== null ? fmtCompact(s.burned) : "—"} $9TO5</u></div>
        <div class="grille"></div><div class="slot"></div><div class="warn"></div>
        <button class="fb-btn go" type="button">${onBelt ? "OPEN · #" + onBelt.id : "OPEN"}</button>
      </div><div class="glow"></div>`);
    furn.querySelector(".go").addEventListener("click", (e) => { e.stopPropagation(); openFurnaceMenu(); });
    furn.addEventListener("click", () => openFurnaceMenu());
    furn.title = "burn $9TO5 to hire a broker and move him up the ladder";
    prop("bank2-cctv", 1510, `<b>FLOOR CAMS</b><div class="grid">
      <div class="m c1" data-cam="HR"><i></i><u></u></div>
      <div class="m c2" data-cam="FLOOR"><i></i><u></u><span class="rec"></span></div>
      <div class="m c3" data-cam="VAULT"><i></i></div>
      <div class="m c4" data-cam="DOOR"><i></i><u></u></div>
      <div class="m c5" data-cam="STREET"><s></s><i></i><u></u></div>
      <div class="m c6" data-cam="ROOF"><s></s><i></i><u></u></div>
    </div>`);
    prop("bank2-slag", 1520, "<i></i><i></i><i></i><i></i><i></i><i></i>");
    prop("bank2-planter", 1730, "<div class='box'></div><i></i><i></i><i></i><i></i><i></i><i></i>");

    // money-handling cluster: the counter, then where it gets put away
    prop("bank2-counter", 1890, `<div class="base"></div><div class="top"></div>
      <div class="bills"><i></i><i></i><i></i></div><div class="hopper"><i></i></div>
      <div class="mach"><div class="scr"><i></i></div><div class="slot"><i></i></div><div class="led"></div></div>`);
    // the cash machine: the room's only call to action, and the one place the
    // current pot is shown
    const atm = el("div", "bank2-atm");
    atm.innerHTML = `<div class="hood"></div>
      <div class="body">
        <div class="scr"><b>THIS HOUR'S POT</b><u>${fmtEth(s.potBuffer)} ETH</u></div>
        <div class="pad">${"<i></i>".repeat(12)}</div>
        <div class="slot"></div><div class="led"></div>
      </div>`;
    if (DEPLOYED && state.tokenLive && CFG.token) {
      const buy = el("a", "fb-btn", "BUY $9TO5");
      buy.href = CFG.buyUrl + "token/" + CFG.token;
      buy.target = "_blank"; buy.rel = "noopener";
      atm.querySelector(".body").appendChild(buy);
    } else {
      atm.querySelector(".body").appendChild(el("div", "soon", "OPENS AT LAUNCH"));
    }
    px(atm, { left: "2170px" });
    roomLayer.appendChild(atm);

    // One at each of the two places a person actually transacts. The furnace
    // end is left empty on purpose — it is the room's own call to action and
    // the fire is the thing that should catch the eye there.
    roomNpc(1824, "teller", "stand", false);    // at the counter
    roomNpc(2352, "cashing", "phone-b", true);  // waiting on the cash machine

    prop("bank2-boxes", 2400, Array.from({ length: 30 }, (_, i) => `<i class="${i === 15 ? "open" : ""}"></i>`).join(""));
    prop("bank2-planter", 2450, "<div class='box'></div><i></i><i></i><i></i><i></i><i></i><i></i>");
  }

  function link(label, addr) {
    if (!addr) return `<s>${label}</s>`;
    return `<a href="${CFG.explorer}/address/${addr}" target="_blank" rel="noopener" style="color:var(--ember)">${label}</a>`;
  }

  // ------------------------------------------------------- whitelist agent
  /// The whole application lives in the browser until it is sent: the steps are
  /// self attested, so what actually matters is the address and the handle, and
  /// those only leave here when APPLY is pressed.
  // the security booth against the HR frontage, left of the doors at 2150
  const BOOTH_X = 1824;
  const AGENT_X = BOOTH_X + 30;
  const APPLY_KEY = "firmbrokers.apply.v1";
  const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
  const XNAME_RE = /^[A-Za-z0-9_]{1,15}$/;

  function loadApply() {
    try { return JSON.parse(localStorage.getItem(APPLY_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveApply(a) {
    try { localStorage.setItem(APPLY_KEY, JSON.stringify(a)); } catch (e) { /* private mode */ }
  }
  /// One fallback, in one place. Both call sites used to spell out a handle
  /// that belongs to somebody else, so an empty config would have quietly
  /// pointed every whitelist applicant at a stranger's account.
  const X_HANDLE = CFG.x || "thefirmbrokers";
  const xProfile = () => "https://x.com/" + X_HANDLE;
  const xPinned = () => CFG.xPinned || xProfile();
  // closed beats open: once the cut is made, no endpoint reopens the booth
  const applyClosed = () => !!CFG.applyClosed;
  const applyOpen = () => !applyClosed() && !!(CFG.applyUrl || CFG.applyFormUrl);

  /// The four steps, and the send when there is somewhere to send to. Without an
  /// endpoint the steps alone are the clearance, or nobody could ever get in.
  function clearanceDone() {
    // the list is closed: there is no form left to ask for, so nobody is gated
    if (applyClosed()) return true;
    const a = loadApply();
    const four = !!(a.follow && a.like && EVM_RE.test(a.evm || "") && XNAME_RE.test(cleanUser(a.user)));
    return applyOpen() ? !!a.sent : four;
  }

  /// The booth lamps say whether you may pass, so this stays a call to action
  /// rather than a status readout, and goes away entirely once there is nothing
  /// left to ask for.
  /// Someone could not get into HR, could not see why, and thought the door
  /// was broken. It was not — the form IS the door — but nothing on the street
  /// said so. The sign states the rule and what happens if you skip it, in
  /// that order, in the shortest words that carry it.
  function agentLine() {
    // after the cut the booth is the list desk: the sign says so and invites
    // the check, instead of vanishing (a silent booth reads as broken)
    if (applyClosed()) {
      return '<span class="hd">THE LIST IS CLOSED</span>' +
        '<span class="dt">Applications are over.<br>Check your wallet here</span>';
    }
    if (clearanceDone()) return "";
    return '<span class="hd">FORM FIRST</span>' +
      '<span class="dt">HR will not let you in<br>until you send this form</span>';
  }
  function measureAgentLine() {
    if (!state.agentLine) return;
    state.agentLineW = state.agentLine.offsetWidth;
    // The main tower overlaps the twin's right 12px, so the visible face runs
    // 1760..2000 and its centre is 6.5px left of the booth's. Centre the board
    // on what the eye sees; the tail still points at the booth.
    const boothMid = BOOTH_X + 62.5;
    const faceMid = BOOTH_X + 56;
    // floor rather than round, so any half pixel falls to the left, never right
    state.agentLineL = Math.floor(faceMid - state.agentLineW / 2);
    state.agentLineH = state.agentLine.offsetHeight;
    state.agentLine.style.left = state.agentLineL + "px";
    // the tail still points at the booth, wherever the box ended up
    const tail = Math.round(boothMid - state.agentLineL);
    state.agentLine.style.setProperty("--tail-x", tail + "px");
  }
  function refreshAgent() {
    // red lamps until the clearance is done, green once it is
    if (state.boothEl) state.boothEl.classList.toggle("cleared", clearanceDone());
    // the wall above the door reads the same clearance, so it has to be
    // repainted here too or it keeps telling people to walk right in
    paintMintWall();
    if (!state.agentLine) return;
    const line = agentLine();
    state.agentLine.innerHTML = line;
    state.agentLine.style.display = line ? "" : "none";
    measureAgentLine();
  }

  function cleanUser(v) { return String(v || "").trim().replace(/^@+/, ""); }

  /// Cloudflare Turnstile, loaded only when the booth is actually opened so the
  /// street costs nothing to walk. Resolves to the API or rejects if the script
  /// cannot be fetched at all; the caller decides what a failure means.
  let turnstileLoad = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileLoad) return turnstileLoad;
    turnstileLoad = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = () => (window.turnstile ? res(window.turnstile) : rej(new Error("no api")));
      s.onerror = () => { turnstileLoad = null; rej(new Error("blocked")); };
      document.head.appendChild(s);
    });
    return turnstileLoad;
  }

  function openApply(onPass) {
    // the list is closed: every door that used to open the application opens
    // THE LIST checker instead (booth, agent, sill, sign, flat page, HR gate)
    if (applyClosed()) {
      if (window.__WL_CHECK) window.__WL_CHECK.open(state.account || undefined, {});
      else toast("The whitelist is closed. The list drops here soon.", false);
      return;
    }
    // v2: the application is a post on X now. xapply.js runs the whole flow
    // and calls back `grant` so the street's clearance stays one system: the
    // booth lamps, the mint wall and HR's door all keep reading clearanceDone.
    if (window.__X_APPLY) {
      return window.__X_APPLY.open({
        onPass,
        grant: ({ evm, user }) => {
          saveApply({ follow: 1, like: 1, evm, user, sent: 1 });
          refreshAgent();
        },
      });
    }
    closePopover();
    const a = loadApply();
    const pop = popoverShell();

    const card = el("div", "fb-quest");
    const scr = el("div", "scr");
    card.appendChild(scr);

    scr.appendChild(el("b", "", "WHITELIST APPLICATION"));
    scr.appendChild(el("p", "", clearanceDone()
      ? "Your form is in, and the HR door is open. If you make the whitelist you mint first, "
        + WL_CAP + " per wallet, before anyone else."
      : "This form is the door. Fill in all four lines and send it, and HR lets you in. "
        + "Whitelist mints first, " + WL_CAP + " per wallet, before anyone else."));

    const steps = el("div", "steps");
    scr.appendChild(steps);

    const rows = {};
    /// One line of the chain. `kind` is either a link to open or a field to fill.
    function row(key, label, kind, opts) {
      const r = el("div", "q");
      const box = el("i", "box" + (a[key] ? " on" : ""));
      const text = el("span", "", label);
      r.appendChild(box);
      r.appendChild(text);
      const mark = (v) => {
        a[key] = v;
        box.classList.toggle("on", !!v);
        saveApply(a);
        paint();
      };
      if (kind === "link") {
        const b = el("button", "fb-step wide", "OPEN");
        b.type = "button";
        b.addEventListener("click", () => {
          window.open(opts.href(), "_blank", "noopener");
          mark(true);
        });
        r.appendChild(b);
        // already following? tick it yourself
        box.addEventListener("click", () => mark(!a[key]));
      } else {
        const inp = el("input", "fb-input");
        inp.type = "text";
        inp.spellcheck = false;
        inp.placeholder = opts.placeholder;
        inp.value = a[opts.field] || "";
        inp.setAttribute("aria-label", label);
        // a field's tick is derived from what is in it. It must never be stored
        // under the same name as the value, or the flag overwrites the answer.
        const check = () => {
          const raw = opts.field === "user" ? cleanUser(inp.value) : inp.value.trim();
          a[opts.field] = raw;
          saveApply(a);
          box.classList.toggle("on", opts.valid(raw));
          paint();
        };
        inp.addEventListener("input", check);
        inp.addEventListener("blur", check);
        box.classList.toggle("on", opts.valid(a[opts.field] || ""));
        r.appendChild(inp);
      }
      rows[key] = r;
      steps.appendChild(r);
      return r;
    }

    row("follow", "Follow @" + X_HANDLE + " on X", "link", { href: xProfile });
    // One post, three things, all required. The repost used to be a "BONUS"
    // worth better odds, which made it look optional and made the form longer
    // than the thing it is gating.
    row("like", "Like, repost and comment this post", "link", { href: xPinned });
    row("evm", "Your EVM address", "field", { field: "evm", placeholder: "0x…", valid: (v) => EVM_RE.test(v) });
    row("user", "Your X username", "field", { field: "user", placeholder: "yourname", valid: (v) => XNAME_RE.test(v) });

    // ---- the bouncer ------------------------------------------------------
    // Turnstile only exists when a site key is configured. With the key empty
    // every line below is inert and the booth behaves exactly as it always has,
    // which is what makes turning it off a one-character change in config.js.
    //
    // `tsState` is the honest answer to "can this browser prove it is one":
    //   ""      not asked yet          -> the send button waits
    //   token   solved                 -> the token rides along in the payload
    //   "off"   no key configured, or the script could not be fetched at all
    //           -> we do NOT hold a real person hostage to a blocked CDN; the
    //              Worker is the thing that decides whether a tokenless
    //              application is acceptable, not the page.
    let tsState = CFG.turnstileSiteKey ? "" : "off";
    let tsWidget = null;
    let tsTries = 0;
    const tsBox = el("div", "fb-turnstile");
    tsBox.style.margin = "10px 0 2px";
    tsBox.style.minHeight = CFG.turnstileSiteKey ? "65px" : "0";
    if (CFG.turnstileSiteKey) {
      scr.appendChild(tsBox);
      // A widget that renders and then answers NOTHING — no token, no error —
      // would leave the send button dead forever with no way out. Seen for
      // real: the challenge handshake ran to Cloudflare and simply never came
      // back. So the page gives up on its own and lets the application through
      // untokened; the Worker is the gate, and it can refuse with a reason,
      // which is a better dead end than a button that will not press.
      //
      // "Never answered" is not the same as "still being solved": a managed
      // challenge that puts a checkbox on screen is waiting on a HUMAN, and
      // that human is allowed to take longer than twelve seconds. The iframe
      // is the difference — no iframe means nothing was ever drawn to answer.
      const giveUp = setTimeout(() => {
        if (tsState !== "" || tsBox.querySelector("iframe")) return;
        tsState = "off";
        tsBox.style.minHeight = "0";
        paint();
      }, 12000);
      loadTurnstile().then((ts) => {
        tsWidget = ts.render(tsBox, {
          sitekey: CFG.turnstileSiteKey,
          theme: "dark",
          callback: (tok) => { clearTimeout(giveUp); tsState = tok; paint(); },
          "expired-callback": () => { tsState = ""; paint(); },
          "timeout-callback": () => { tsState = ""; paint(); },
          // Cloudflare's 600* is "generic challenge failure / bot behaviour
          // detected" and it documents the code as RETRYABLE. A real person on
          // a hardened browser, a flaky connection or a shared IP can trip it,
          // and giving up on the first one hands them an empty token and a 403
          // they cannot do anything about. So try twice more before falling
          // back to letting them through untokened.
          "error-callback": (code) => {
            if (tsTries < 2 && window.turnstile && tsWidget !== null) {
              tsTries++;
              try { window.turnstile.reset(tsWidget); return true; } catch (_) {}
            }
            clearTimeout(giveUp);
            tsState = "off";
            paint();
            return true;
          },
        });
      }).catch(() => { clearTimeout(giveUp); tsState = "off"; tsBox.style.minHeight = "0"; paint(); });
    }
    // the last refusal from the Worker, shown until the next attempt
    let sendErr = "";
    const tsReady = () => tsState !== "";
    const tsToken = () => (tsState === "off" ? "" : tsState);

    const send = el("button", "fb-btn", "APPLY FOR WL");
    send.type = "button";
    send.id = "apply-send";
    const msg = el("div", "msg");
    scr.appendChild(send);
    scr.appendChild(msg);

    function ready() {
      return !!(a.follow && a.like && EVM_RE.test(a.evm || "") && XNAME_RE.test(cleanUser(a.user)))
        && tsReady();
    }
    function paint() {
      // the booth lamps track the clearance as it is filled in, not just on send
      refreshAgent();
      if (pass) pass.disabled = !clearanceDone();
      if (a.sent) {
        send.textContent = "APPLICATION SENT";
        send.disabled = true;
        msg.textContent = "Sent as " + a.evm + ".";
        msg.className = "msg ok";
        return;
      }
      const done = ["follow", "like"].filter((k) => a[k]).length
        + (EVM_RE.test(a.evm || "") ? 1 : 0)
        + (XNAME_RE.test(cleanUser(a.user)) ? 1 : 0);
      send.textContent = "APPLY FOR WL";
      send.disabled = !ready() || !applyOpen();
      if (!applyOpen()) {
        msg.textContent = done === 4
          ? "All four done. Security will let you in."
          : done + " of 4 done. Security needs all four before you go in.";
        msg.className = "msg";
        return;
      }
      // a refusal has to outlive the repaint that follows it. The widget
      // re-challenges on reset and solves itself a moment later, and that
      // callback repaints — so without this the reason flashes and is gone.
      if (sendErr) {
        msg.textContent = sendErr;
        msg.className = "msg bad";
        return;
      }
      // four ticks but no token yet means security is still looking at you —
      // saying "all four done" next to a dead button reads as a broken form
      msg.textContent = done < 4 ? done + " of 4 done"
        : !tsReady() ? "All four done. Security is checking you are a person."
        : "All four done. Send your application.";
      msg.className = "msg";
    }

    send.addEventListener("click", async () => {
      if (!ready() || a.sent) return;
      const payload = {
        evm: a.evm.trim(),
        x: cleanUser(a.user),
        // was a separate optional step; the repost is part of the required
        // post row now, so anyone who sends this has done it
        reposted: true,
        at: new Date().toISOString(),
        // the Turnstile token. The Worker verifies it against Cloudflare and
        // stamps its own `at` regardless of what is sent here.
        ts: tsToken(),
      };
      sendErr = "";
      send.disabled = true;
      msg.textContent = "sending…";
      try {
        if (CFG.applyUrl) {
          const r = await fetch(CFG.applyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(payload),
          });
          if (!r.ok) throw new Error("http " + r.status);
        } else {
          const u = new URL(CFG.applyFormUrl);
          u.searchParams.set("evm", payload.evm);
          u.searchParams.set("x", payload.x);
          u.searchParams.set("rt", payload.reposted ? "yes" : "no");
          window.open(u.toString(), "_blank", "noopener");
        }
        a.sent = true;
        saveApply(a);
        refreshAgent();
        paint();
        toast("application sent", true);
      } catch (e) {
        // a token is single-use: whatever went wrong, the old one is spent and
        // a retry with it would be refused for the wrong reason
        if (tsWidget !== null && window.turnstile) {
          try { window.turnstile.reset(tsWidget); tsState = ""; } catch (_) {}
        }
        // paint() re-derives the button AND the line under it, so the reason
        // has to be written after it or the repaint erases it
        sendErr = String(e.message || "").indexOf("403") >= 0
          ? "security did not clear that. Redo the check and send again"
          : "that did not send. Try again in a moment";
        send.disabled = false;
        paint();
      }
    });

    // stopped at the door: the way in only unlocks once the clearance is done
    let pass = null;
    if (typeof onPass === "function") {
      pass = el("button", "fb-step wide", "GO IN");
      pass.type = "button";
      pass.id = "gate-pass";
      pass.addEventListener("click", () => {
        if (!clearanceDone()) return;
        closePopover();
        onPass();
      });
      scr.appendChild(pass);
    }
    const close = el("button", "fb-btn small", "CLOSE");
    close.type = "button";
    close.id = "pop-close";
    close.addEventListener("click", closePopover);
    scr.appendChild(close);

    paint();
    pop.appendChild(card);
    document.body.appendChild(pop);
  }

  // ---------- broker popover (opened from a desk, or from the flat list)
  /// One broker's file. The readout is the same lit panel the desks and the
  /// roster board use, and every action is a row that says what it does and
  /// what it costs rather than a gold pill you have to guess at. Nothing in
  /// here posts a broker to a desk or loads him into the merger: those are the
  /// roster's and the merger's own menus, and having three doors into the same
  /// job was most of what made this card hard to read.
  function openBrokerPopover(b) {
    closePopover();
    const t = tierOf(b.tierBurned);
    const leg = isLegendary(b);
    const pop = popoverShell();
    const card = el("div", "fb-broker" + (b.active ? " working" : ""));
    const holdings = b.holdings.map((h) => `<span class="chip">${h.symbol} ${fmtUnits(h.amount, h.decimals)}</span>`).join("");
    const paidIn = b.split.length
      ? b.split.map((sp) => `${state.assetMeta?.[sp.idx]?.symbol ?? "#" + sp.idx} ${sp.bps / 100}%`).join(" · ")
      : `${state.assetMeta?.[defaultIdx()]?.symbol ?? "USDG"} 100% (default)`;
    const flat = document.body.classList.contains("flat-mode");
    const seat = flat ? -1 : lineup().findIndex((x) => x && x.id === b.id);
    card.innerHTML = `<header>
        <img src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'" alt="Broker ${b.id}">
        <div class="who"><b>#${b.id}${leg ? " ★" : ""}${b.parts > 1 ? " · " + b.parts + " PARTS" : ""}</b>
        <span>Level ${t.level} · ${t.name} · ${(b.weight / 100).toFixed(2)}x${leg ? " · 1-OF-1" : ""}</span>
        <span class="status${b.active ? "" : " off"}">${b.active ? (b.liveNow ? "ON THE CLOCK" : "STARTS NEXT HOUR") : "NOT HIRED"}</span></div>
        <button class="fb-btn small ghost" id="pop-close">X</button>
      </header>
      <div class="scr">
        <div><span>paid in</span><i>${paidIn}</i></div>
        ${flat ? "" : `<div><span>on the floor</span><i>${seat >= 0 ? "DESK " + (seat + 1) : "not at a desk"}</i></div>`}
      </div>${holdings ? `<div class="chips">${holdings}</div>` : ""}`;

    // Every action is a title and one sentence saying what it actually does.
    const acts = el("div", "acts");
    const act = (kind, title, note, fn) => {
      const bt = el("button", "act " + kind);
      bt.type = "button";
      bt.innerHTML = `<b>${title}</b><span>${note}</span>`;
      bt.addEventListener("click", fn);
      acts.appendChild(bt);
      return bt;
    };
    // the burn constants live on-chain, so the sentence is written without the
    // number and the number is dropped in when it lands
    const withCost = (row, make) => {
      F.nftNumber("ACTIVATE_BURN").then((n) => {
        if (n && document.body.contains(row)) row.querySelector("span").textContent = make(n);
      }).catch(() => {});
    };
    if (!b.active) {
      const hireNote = (n) => `burn ${n ? fmtCompact(n) : "25,000"} $9TO5 to put him on payroll. He starts earning at the top of the next hour, at a desk or not.`;
      const row = act("go", "HIRE HIM", hireNote(null), async () => {
        const burn = await F.nftNumber("ACTIVATE_BURN");
        const bal = await F.tokenBalance(state.account);
        if (bal !== null && bal < burn) return toast(`needs ${fmtCompact(burn)} $9TO5. The Bank sells it`, false);
        if (!(await ensureAllowance(burn))) return;
        await txFlow("hiring", () => F.activate(b.id, state.account), async () => {
          await preferWallet(b.id);
          await refreshBrokers();
        });
      });
      withCost(row, hireNote);
    } else if (t.idx < 4) {
      // This used to burn straight to the next rung. It is a door to the
      // furnace now because upgradeTier charges only the difference to whatever
      // rung you name: climbing Intern to CEO one step at a time costs four
      // approvals and four transactions to reach the same 850,000 a single
      // burn reaches, and the card had no room to show that.
      const next = TIERS[t.idx + 1];
      const cost = next.burn - b.tierBurned;
      act("go", "PROMOTE HIM",
        `He is ${t.name} (${t.mult}). ${next.name} (${next.mult}) is ${fmtCompact(cost)} $9TO5 away, and CEO (3.5x) is ${fmtCompact(TIERS[4].burn - b.tierBurned)} — one burn, whichever you pick. Opens the furnace at The Bank.`,
        () => openFurnaceMenu(b.id));
    }
    // "PACKAGE" told nobody anything. This is the button that decides which
    // stocks his ETH earnings are turned into before they reach the vault.
    // The "paid in" row above already says what he is on, so saying it again
    // here was the same fact twice on one small card.
    const payRow = act("", "CHOOSE HIS PAYCHECK",
      "He earns ETH. Pick which stocks it turns into, up to three.",
      () => openSplitEditor(b, pop, payRow));
    // The vault only exists because pay has to land somewhere. With this on,
    // PayrollEngine.deliver pays the owner directly and there is nothing to
    // claim, ever — which is why hiring turns it on. Off is the chain's own
    // default, so this row is how it moves afterwards.
    act("sw" + (b.collect ? " on" : ""), `PAY TO MY WALLET <i>${b.collect ? "ON" : "OFF"}</i>`,
      b.collect
        ? "His pay goes straight to your wallet every hour."
        : "Turn this on and his pay goes straight to your wallet.",
      () => txFlow(b.collect ? "switching off" : "switching on",
        () => F.setCollectMode(b.id, !b.collect, state.account),
        async () => { closePopover(); await refreshBrokers(); }));
    if (b.holdings.length) {
      act("", "CLAIM WHAT HE IS HOLDING",
        `Send the ${b.holdings.map((h) => h.symbol).join(" and ")} sitting in his vault to your wallet. It stays his until you do.`,
        () => txFlow("claim", () => F.claim(b.id, state.account), refreshBrokers));
    }
    card.appendChild(acts);
    pop.appendChild(card);
    document.body.appendChild(pop);
    pop.querySelector("#pop-close").addEventListener("click", closePopover);
    // set last: popoverShell ran closePopover, which clears these
    state.popBrokerId = b.id;
    state.popBrokerSig = brokerSig(b);
  }
  /// Every popover is built from this, so clicking the dimmed area outside the
  /// card always closes it. Escape already does; this is the same escape hatch
  /// for anyone reaching for the mouse.
  function popoverShell() {
    const pop = el("div", "fb-popover");
    pop.id = "fb-popover";
    pop.addEventListener("click", (e) => { if (e.target === pop) closePopover(); });
    return pop;
  }

  function closePopover() {
    const p = document.getElementById("fb-popover");
    if (p) p.remove();
    state.popBrokerId = null;
    state.popBrokerSig = null;
  }

  /// Everything the open file actually draws. Deliberately not the pending pay,
  /// which ticks up on every read: the file would redraw itself under the
  /// reader's hands once a minute for a number it no longer shows.
  const brokerSig = (b) => !b ? "" : [
    b.active, b.liveNow, b.tierBurned, b.weight, b.parts, b.collect,
    b.holdings.map((h) => h.idx + ":" + h.amount).join(","),
    b.split.map((s) => s.idx + ":" + s.bps).join(","),
  ].join("|");

  /// The file is a snapshot, so anything that changes the broker has to make it
  /// take another one. Hiring from the roster used to leave it reading NOT
  /// HIRED and still offering to hire him, until the panel was closed and
  /// opened again — the popover kept the object it was built with.
  function refreshOpenBroker() {
    if (state.popBrokerId === null) return;
    if (!document.querySelector("#fb-popover .fb-broker")) return;
    const fresh = state.brokers.find((x) => x.id === state.popBrokerId);
    // sold, or merged into somebody else, while his file was open
    if (!fresh) { closePopover(); return; }
    if (brokerSig(fresh) === state.popBrokerSig) return;
    openBrokerPopover(fresh);
  }
  function actBtn(label, fn) {
    const b = el("button", "fb-btn small", label);
    b.addEventListener("click", fn);
    return b;
  }

  /// The paycheck editor. The engine takes as many salary assets as the owner
  /// registered — the picker is built from whatever is on-chain, so adding a
  /// tenth stock at the contract needs no change here. Three lines, because
  /// three is what setSplit accepts, and a running total that will not let you
  /// sign a transaction the contract is going to reject.
  /// The row that opens this stays on screen underneath it, so a second click
  /// has to close the editor. It used to append: three stacked copies of the
  /// same form, all editing the same broker, and only the last one you touched
  /// held what you actually meant to save.
  function openSplitEditor(b, pop, row) {
    const already = pop.querySelector(".fb-pay");
    if (already) {
      already.remove();
      if (row) row.classList.remove("on");
      return;
    }
    const meta = Object.entries(state.assetMeta || {});
    const ed = el("div", "fb-pay");
    const current = b.split.length ? b.split : [{ idx: defaultIdx(), bps: 10000 }];
    const opts = (chosen) => '<option value="">— nothing —</option>' + meta.map(([k, m]) =>
      `<option value="${k}"${Number(k) === chosen ? " selected" : ""}>${m.symbol}</option>`).join("");
    ed.innerHTML = `<header><b>HIS PAYCHECK</b>
        <span>He earns ETH. This is what it gets swapped for on its way into his vault — up to three, adding up to 100%.</span>
      </header>
      <div class="lines">${[0, 1, 2].map((i) => `<label class="line">
          <select class="fb-input">${opts(current[i] ? current[i].idx : -1)}</select>
          <input class="fb-input pct" type="number" min="0" max="100" step="1" placeholder="0"
            value="${current[i] ? current[i].bps / 100 : ""}"><em>%</em>
        </label>`).join("")}</div>
      <div class="tot"><span>TOTAL</span><b>0%</b></div>
      <div class="quick">quick:
        <button class="mini" data-q="usdg" type="button">ALL USDG</button>
        <button class="mini" data-q="even" type="button">SPLIT EVENLY</button>
      </div>
      <div class="bar">
        <button class="fb-btn small save" type="button">SAVE ON-CHAIN</button>
        <button class="fb-btn small ghost cancel" type="button">CANCEL</button>
      </div>`;
    const lines = [...ed.querySelectorAll(".line")];
    const totEl = ed.querySelector(".tot");
    const save = ed.querySelector(".save");
    const read = () => lines.map((l) => ({
      idx: l.children[0].value === "" ? null : Number(l.children[0].value),
      pct: l.children[1].value === "" ? 0 : Number(l.children[1].value),
    })).filter((r) => r.idx !== null);
    // one live verdict, because "percentages must total exactly 100" arriving
    // after the click is a worse way to learn it
    function check() {
      const rows = read();
      const total = rows.reduce((a, r) => a + r.pct, 0);
      const dupe = new Set(rows.map((r) => r.idx)).size !== rows.length;
      const zero = rows.some((r) => r.pct <= 0);
      const ok = rows.length > 0 && total === 100 && !dupe && !zero;
      totEl.className = "tot" + (ok ? " ok" : total ? " bad" : "");
      totEl.querySelector("b").textContent = dupe ? "SAME STOCK TWICE" : zero ? "A LINE IS AT 0%" : total + "%";
      save.disabled = !ok;
      return { rows, ok };
    }
    ed.addEventListener("input", check);
    ed.addEventListener("change", check);
    ed.querySelectorAll(".quick .mini").forEach((q) => q.addEventListener("click", () => {
      if (q.dataset.q === "usdg") {
        lines.forEach((l, i) => { l.children[0].value = i ? "" : String(usdgIdx()); l.children[1].value = i ? "" : "100"; });
      } else {
        const on = lines.filter((l) => l.children[0].value !== "");
        // 100 does not divide by three, so the first line carries the remainder
        const each = on.length ? Math.floor(100 / on.length) : 0;
        on.forEach((l, i) => { l.children[1].value = String(i ? each : 100 - each * (on.length - 1)); });
      }
      check();
    }));
    save.addEventListener("click", async () => {
      const { rows, ok } = check();
      if (!ok) return;
      await txFlow("paycheck",
        () => F.setSplit(b.id, rows.map((r) => r.idx), rows.map((r) => r.pct * 100), state.account),
        async () => { closePopover(); await refreshBrokers(); });
    });
    ed.querySelector(".cancel").addEventListener("click", () => {
      ed.remove();
      if (row) row.classList.remove("on");
    });
    check();
    pop.appendChild(ed);
    if (row) row.classList.add("on");
    ed.scrollIntoView({ block: "nearest" });
  }
  function usdgIdx() {
    for (const [k, m] of Object.entries(state.assetMeta || {})) if (m.symbol === "USDG") return Number(k);
    return 0;
  }
  // The engine pays the DEFAULT asset when a broker has no split set, and that
  // default is the first non-stock asset on the menu (PayrollEngine._defaultIdx);
  // script/Assets.s.sol registers USDG as the only non-stock, so the default is
  // USDG. This mirrors it so the card label and the editor prefill match what
  // the chain actually pays. Falls back to asset 0.
  function defaultIdx() {
    return usdgIdx();
  }

  // ------------------------------------------------------------ movement
  const SPEED = 8.6, GRAV = 0.9;
  const WALK_SEQ = ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"];
  const WALK_STRIDE_PX = 47;
  state.anim = { prevX: null, phase: 0, dustAcc: 0, landUntil: 0, quirk: null, quirkUntil: 0, nextQuirk: 0, wasAir: false };

  const dustPool = [];
  function spawnDust(n, spread) {
    const g = GROUND();
    const host = state.mode === "street" ? front : roomLayer;
    if (!host) return;
    for (let i = 0; i < n; i++) {
      const d = el("div", "fb-dust");
      const jitterX = (Math.random() - 0.5) * (spread || 10);
      d.style.left = state.x - state.facing * (16 + Math.random() * 10) + jitterX + "px";
      d.style.bottom = g - 2 + "px";
      d.style.setProperty("--dx", (-state.facing * (10 + Math.random() * 14)).toFixed(0) + "px");
      host.appendChild(d);
      dustPool.push(d);
      setTimeout(() => { d.remove(); dustPool.shift(); }, 520);
      if (dustPool.length > 14) { const old = dustPool.shift(); if (old) old.remove(); }
    }
  }

  let lastNow = null;
  function tick(now) {
    const dt = lastNow === null ? 1 : Math.min(3, (now - lastNow) / 16.667);
    lastNow = now;
    const maxX = (state.mode === "street" ? WORLD_W : state.roomW) - 60;
    if (!state.frozen) {
      const left = state.keys.ArrowLeft || state.keys.a;
      const right = state.keys.ArrowRight || state.keys.d;
      state.vx = right ? SPEED : left ? -SPEED : 0;
      state.x = Math.max(60, Math.min(maxX, state.x + state.vx * dt));

      if (state.wheelVel) {
        const glide = Math.max(-16, Math.min(16, state.wheelVel));
        state.x = Math.max(60, Math.min(maxX, state.x + glide * dt));
        state.wheelVel *= Math.pow(0.88, dt);
        if (Math.abs(state.wheelVel) < 0.35) state.wheelVel = 0;
      }
      if (state.y > 0 || state.vy > 0) {
        state.y += state.vy * dt;
        state.vy -= GRAV * dt;
        if (state.y <= 0) { state.y = 0; state.vy = 0; }
      }
    }

    // ---- sprite animation, distance-driven
    const p = state.playerEl;
    const anim = state.anim;
    const dxRaw = anim.prevX === null ? 0 : state.x - anim.prevX;
    anim.prevX = state.x;
    const adx = Math.min(Math.abs(dxRaw), 22);
    if (Math.abs(dxRaw) > 0.4) state.facing = dxRaw > 0 ? 1 : -1;
    const movingGround = adx > 0.5 && state.y === 0;

    let frame;
    if (state.y > 0) {
      frame = state.vy > 1.2 ? "jump" : "fall";
      anim.wasAir = true;
    } else if (anim.wasAir) {
      anim.wasAir = false;
      anim.landUntil = now + 150;
      spawnDust(3, 26);
      frame = "land";
    } else if (now < anim.landUntil) {
      frame = "land";
    } else if (movingGround) {
      anim.phase = (anim.phase + Math.min(adx, 8)) % (WALK_STRIDE_PX * WALK_SEQ.length);
      frame = WALK_SEQ[Math.floor(anim.phase / WALK_STRIDE_PX)];
      anim.dustAcc += adx;
      if (anim.dustAcc > (adx > 9 ? 110 : 190)) { anim.dustAcc = 0; spawnDust(1, 8); }
      anim.quirkUntil = 0;
    } else {
      anim.phase = 0;
      if (!anim.nextQuirk) anim.nextQuirk = now + 2400;
      if (now < anim.quirkUntil) {
        frame = anim.quirk === "phone" ? (Math.floor(now / 300) % 2 ? "phone-b" : "phone-a") : "blink";
      } else {
        if (now >= anim.nextQuirk) {
          anim.quirk = Math.random() < 0.65 ? "blink" : "phone";
          anim.quirkUntil = now + (anim.quirk === "phone" ? 1700 : 150);
          anim.nextQuirk = now + 3400 + Math.random() * 4200;
        }
        frame = Math.floor(now / 900) % 2 ? "stand-b" : "stand";
      }
    }
    p.dataset.frame = frame;
    p.classList.toggle("face-left", state.facing < 0);

    const g = GROUND();
    p.style.left = state.x - 32 + "px";
    p.style.bottom = g + state.y + "px";
    state.thoughtEl.style.left = state.x - 10 + "px";
    state.thoughtEl.style.bottom = g + state.y + 120 + "px";
    // Getting on the whitelist is the point of the street, so the board stays up
    // and your own thought bubble is the one that steps aside. The old rule
    // tested horizontal overlap alone, which hid the board whenever you stood
    // near the booth even though the two never touched; this checks both axes.
    if (state.agentLine) {
      const barkUp = state.agentLine.style.display !== "none";
      const tl = state.x - 10, tr = tl + state.thoughtW;
      const al = state.agentLineL, ar = al + state.agentLineW;
      const tb = state.y + 120, tt = tb + state.thoughtH;
      const ab = 248, at = ab + state.agentLineH;
      const clash = barkUp && tl < ar && tr > al && tb < at && tt > ab;
      state.thoughtEl.style.visibility = clash ? "hidden" : "";
    }
    const sh = state.shadowEl;
    sh.style.left = state.x - 23 + "px";
    sh.style.bottom = g - 3 + "px";
    const squeeze = Math.max(0.35, 1 - state.y / 150);
    sh.style.transform = `scaleX(${squeeze.toFixed(2)})`;
    sh.style.opacity = (0.5 * squeeze + 0.1).toFixed(2);

    const spanW = state.mode === "street" ? WORLD_W : state.roomW;
    const cam = Math.max(0, Math.min(Math.max(0, spanW - innerWidth), state.x - innerWidth / 2));
    // Keep the bubble on the screen. It is placed in world coordinates above,
    // which is right until the world is wider than the window: at 390px "Add a
    // wallet to clock in" is 200px of bubble on a 64px character, and it ran
    // off the right edge and stayed there — a permanent half-sentence, which is
    // what a phone user reported as a warning that would not go away. It is a
    // thought bubble rather than a toast, so it never had a timer to blame.
    // Clamped here rather than at the assignment because the camera is not
    // known until this line, and measured off state.thoughtW so no layout is
    // read in the frame loop.
    if (state.thoughtEl && state.thoughtEl.style.display !== "none" && state.thoughtW) {
      const want = state.x - 10 - cam;
      const room = innerWidth - state.thoughtW - 6;
      state.thoughtEl.style.left = Math.round(cam + Math.max(6, Math.min(want, room))) + "px";
    }
    if (state.mode === "street") {
      front.style.transform = `translateX(${-cam}px)`;
      back.style.transform = `translateX(${-cam * 0.35}px)`;
      if (window.__CITY_FAR) window.__CITY_FAR.style.transform = `translateX(${-cam * 0.16}px)`;
      fg.style.transform = `translateX(${-cam * 1.18}px)`;

      state.taxiX -= 3.1 * dt;
      if (state.taxiX < -300) state.taxiX = WORLD_W + 300;
      state.taxi.style.left = state.taxiX + "px";

      for (const pg of state.pigeons) {
        const near = Math.abs(pg.x - state.x) < 90;
        if (near && !pg.flying) { pg.flying = true; pg.elm.classList.add("fly"); }
        else if (!near && pg.flying && Math.abs(pg.x - state.x) > 260) {
          pg.flying = false; pg.elm.classList.remove("fly");
        }
      }

      const z = ZONES.find((zz) => zz.room && Math.abs(DOOR_AT(zz) - state.x) < 110);
      if (z && !state.frozen) {
        state.nearZone = z;
        if (zoneLive(z)) {
          // HR is gated on the form until the mint goes public, so the prompt
          // says which of the two it is. The cue caches on its key, so the key
          // has to carry the state or the label never changes when it does.
          const st0 = state.stats || PRELAUNCH;
          const shut = z.id === "hr" && !st0.publicOpen && !clearanceDone();
          showCue(z.id + (shut ? ":shut" : ""),
            shut ? " FILL THE FORM TO GET IN" : ` WALK INTO ${z.name.toUpperCase()}`,
            DOOR_AT(z), g + (z.cueY || Math.min(z.facadeH || 210, 300) + 96));
        } else {
          hideCue();
        }
      } else {
        hideCue();
        state.nearZone = null;
      }
    } else {
      if (roomLayer) roomLayer.style.transform = `translateX(${-cam}px)`;
      if (state.x < 220) {
        // the exit door is 100 wide at x 40, so its middle is 90
        showCue("exit", " BACK OUTSIDE", 90, g + 200);
        state.nearZone = "exit";
      } else {
        hideCue();
        state.nearZone = null;
      }
    }
    actors.style.transform = `translateX(${-cam}px)`;
    markHere();
    requestAnimationFrame(tick);
  }

  function warpTo(z) {
    exitRoom();
    state.x = z.room ? DOOR_AT(z) : START_X;
    state.anim.prevX = state.x;
  }

  // ------------------------------------------------------------ input
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "Escape") {
      if (document.getElementById("fb-popover")) { closePopover(); return; }
      if (document.querySelector(".fb-panel.open")) { closeDocs(); return; }
      // put a picked-up broker down before backing out of the room entirely
      if (state.rosterPick !== null) { state.rosterPick = null; rebuildRoom(); return; }
      if (state.rosterOpen) { state.rosterOpen = false; state.rosterSlot = null; rebuildRoom(); return; }
      exitRoom();
      return;
    }
    if (document.querySelector(".fb-panel.open")) return;
    if (/^[1-4]$/.test(e.key)) { warpTo(ZONES[Number(e.key) - 1]); return; }
    if (e.key === "e" || e.key === "E" || e.key === "Enter") {
      if (state.mode !== "street") { if (state.nearZone === "exit") exitRoom(); return; }
      if (state.nearZone) tryEnter(state.nearZone);
      return;
    }
    state.keys[e.key] = true;
    if (e.key.startsWith("Arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { state.keys[e.key] = false; });

  stage.addEventListener("wheel", (e) => {
    if (state.frozen) return;
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    state.wheelVel = (state.wheelVel || 0) + d * 0.34;
  }, { passive: false });

  // The camera is a transform, so the stage must never hold a scroll offset:
  // anything that scrolls it (tabbing to a control that is off to one side,
  // find-in-page, a script calling scrollIntoView) would shift every layer out
  // from under the camera and never be corrected. overflow:hidden still allows
  // that programmatically, so put it straight back.
  stage.addEventListener("scroll", () => {
    if (stage.scrollLeft) stage.scrollLeft = 0;
    if (stage.scrollTop) stage.scrollTop = 0;
  });

  let dragFrom = null;
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".fb-door,.fb-walker,button,a,select,input,.room-deskcard,.floor-desk,.floor-board,.floor-roster,.floor-merger,.room-exit")) return;
    dragFrom = { px: e.clientX, x: state.x };
    stage.classList.add("dragging");
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragFrom || state.frozen) return;
    const maxX = (state.mode === "street" ? WORLD_W : state.roomW) - 60;
    state.x = Math.max(60, Math.min(maxX, dragFrom.x - (e.clientX - dragFrom.px) * 1.4));
  });
  window.addEventListener("pointerup", () => { dragFrom = null; stage.classList.remove("dragging"); });

  async function tryEnter(z) {
    if (!zoneLive(z)) {
      toast(DEPLOYED ? `${z.name} opens with the token launch` : "nothing is deployed yet. This is a preview", false);
      return;
    }
    // the booth: no clearance, no entry. It lifts itself once the mint is public,
    // because there is no whitelist to apply for then and this must never be the
    // thing standing between someone and the mint on the day.
    const st = state.stats || PRELAUNCH;
    if (z.id === "hr" && !st.publicOpen && !clearanceDone()) {
      openApply(() => enterRoom(z.room));
      return;
    }
    // The floor used to demand a wallet at the door, which meant the one state
    // most first-time visitors would ever reach — three lit, empty desks — was
    // unreachable in the deployed build. The vacancy IS the pitch, so anyone
    // may walk in; the desks ask for the wallet themselves.
    enterRoom(z.room);
  }

  // ------------------------------------------------------------ docs panel
  function openDocs() {
    const p = $("fb-panel");
    p.className = "fb-panel open theme-plank";
    document.body.classList.add("paneled");
    const room = $("fb-room");
    room.innerHTML = "";
    docsCards(room);
    state.frozen = true;
  }
  function closeDocs() {
    $("fb-panel")?.classList.remove("open");
    if (state.mode === "street") document.body.classList.remove("paneled");
    state.frozen = false;
  }
  /// `bare` drops the title and the standfirst, for the flat page where the
  /// section heading directly above already says both. There the button stands
  /// on its own rather than inside a card framing nothing.
  function docsCards(host, bare) {
    const hb = el("a", "fb-btn", "READ THE EMPLOYEE HANDBOOK →");
    hb.href = "/docs";
    hb.target = "_blank";
    hb.rel = "noopener";
    hb.style.cssText = "display:inline-block;text-decoration:none;margin-top:10px";
    if (bare) {
      hb.style.marginTop = "0";
      host.appendChild(hb);
    } else {
      const head = el("div", "fb-card dark",
        `<h2>THE PAPERWORK</h2><p>Everything on this street, in plain words.</p>`);
      head.appendChild(hb);
      host.appendChild(head);
    }
    const items = [
      ["The brokers", "5,000 pixel brokers. " + fmtEth((state.stats || PRELAUNCH).priceWei) + " ETH each. Mint one and you meet him right away — his picture is yours the second the mint goes through. And the collection only ever gets smaller."],
      ["The token", "$9TO5 is born on launch day, right before the mint opens — until then it does not exist. Its job is to be burned: 25k puts a broker to work, more promotes him, 50–150k merges two into one. Every burn is gone forever, so the token only gets scarcer."],
      ["The pay", "Every $9TO5 trade feeds the payroll pot, and the split is locked in a contract nobody can change — not even us. Once an hour, the pot turns into real tokenized stocks and lands with every working broker."],
      ["The vault", "Pay belongs to the broker, not the wallet. Sell him and his savings go with him. Claiming is free, and nobody but his owner can ever touch it."],
    ];
    for (const [t, b] of items) host.appendChild(el("div", "fb-card", `<h2>${t}</h2><p>${b}</p>`));
    if (DEPLOYED) host.appendChild(el("div", "fb-card", `<p>${link("collection", CFG.nft)} · ${link("engine", CFG.engine)} · ${link("vault", CFG.vault)} · ${link("splitter", CFG.splitter)}</p>`));
  }
  // DOCS is a plain link to docs.html, the handbook. It used to preventDefault
  // and open the in-page cards — the deprecated docs — with the handbook link
  // one level further down inside that panel.
  $("fb-back")?.addEventListener("click", () => {
    if (document.querySelector(".fb-panel.open")) closeDocs();
    else exitRoom();
  });

  // ------------------------------------------------------------ flat mode
  const FLAT_KEY = "firmbrokers.flat.v1";
  function wantsFlat() {
    const saved = localStorage.getItem(FLAT_KEY);
    if (saved === "level") return false;
    if (saved === "flat") return true;
    // The street is the site, at every width. It used to hand any window under
    // 1024px the flat page instead, which on this chain meant almost everyone:
    // the wallet browsers people arrive in are phones, so the thing the whole
    // build is for was the thing they never saw. Panning is pointer-driven, so
    // a finger drags the camera exactly as a mouse does, and the zone bar under
    // it goes to each door without walking. Reduced motion still opts out —
    // that one is a stated preference rather than a guess about the device.
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function setFlat(on, remember) {
    const wasFlat = document.body.classList.contains("flat-mode");
    document.body.classList.toggle("flat-mode", on);
    // The thought bubble is measured with offsetWidth, and in flat mode the
    // whole stage is hidden so that measurement is 0. A phone boots into flat,
    // so state.thoughtW was 0 for the entire session and every consumer of it —
    // including the clamp that keeps the bubble on screen — silently did
    // nothing. Re-measure when the street becomes visible again.
    if (wasFlat && !on) updateThought();
    // every caller gets the right toggle label, and the label names the
    // DESTINATION in the site's own words: STREET from the page, PAGE from
    // the street. "LEVEL" and "FLAT" were engine vocabulary — the user asked
    // what "LEVEL" even did, which is the whole review.
    const fb = $("fb-flatbtn");
    if (fb) fb.textContent = on ? "STREET" : "PAGE";
    if (remember) localStorage.setItem(FLAT_KEY, on ? "flat" : "level");
    if (on) buildFlat();
    else if (window.__CITY_ENSURE) window.__CITY_ENSURE();
  }
  function flatSection(host, title, sub, fill) {
    const sec = el("section", "zone-sec");
    sec.appendChild(el("div", "zone-head", `${title} <small>${sub}</small>`));
    const room = el("div");
    room.style.cssText = "display:grid;gap:14px";
    sec.appendChild(room);
    host.appendChild(sec);
    fill(room);
  }
  function buildFlat() {
    const host = $("fb-flat");
    host.innerHTML = "";
    // The hero scene, the deal poster and the staff strip live in
    // flathero.js behind the same guarded hook as the lobby. Optional on
    // purpose — see the cache-skew note below: either file arriving without
    // the other must still land on a working page, so the old text hero
    // stays here as the fallback branch.
    if (window.__FLAT_HERO) {
      window.__FLAT_HERO({ host, el, px, walkerEl, dress });
    } else {
      host.appendChild(el("div", "fb-hero-flat",
        `<h1>FIRM BROKERS</h1><p>GET HIRED. GET PAID EVERY HOUR. IN REAL STOCKS.</p>
         <p class="sub">Get a broker → burn $9TO5 → he earns stocks every hour. The payroll split is locked on-chain.</p>`));
      const note = el("div", "fb-flatnote",
        `Everything works right here. The street is walkable too. <button class="fb-btn small" id="fb-play">WALK THE STREET</button>`);
      host.appendChild(note);
    }

    flatSection(host, "HR Desk", zoneLive(ZONES[1]) ? "mint a broker" : "locked", (room) => {
      if (!zoneLive(ZONES[1])) { room.appendChild(el("div", "fb-card", `<p>Opens at launch.</p>`)); return; }
      const s = state.stats || PRELAUNCH;
      // The street has a security booth; the flat page had no door to the
      // whitelist at all, so a phone user in the whitelist phase could only
      // press MINT and be turned away. Same form, same clearance, and the
      // wording is the popover's own so the gate says the same thing
      // everywhere. Gone once the mint is public, same as the booth.
      if (applyClosed() && !s.publicOpen) {
        // the cut is made: the phone page offers the check, never the form
        const wl = el("div", "fb-card");
        wl.innerHTML = `<h2>The Whitelist</h2><p>Applications are closed. Paste your wallet to see if you are on the list. Whitelist wallets mint first, on OpenSea, before the doors open to everyone.</p>`;
        const cb = el("button", "fb-btn", "AM I ON THE LIST?");
        cb.style.marginTop = "10px";
        cb.addEventListener("click", () => { if (window.__WL_CHECK) window.__WL_CHECK.open(state.account || undefined, {}); });
        wl.appendChild(cb);
        room.appendChild(wl);
      } else if (applyOpen() && !s.publicOpen) {
        const wl = el("div", "fb-card");
        wl.innerHTML = clearanceDone()
          ? `<h2>The Whitelist</h2><p>Your form is in, and the HR door is open. If you make the whitelist you mint first, ${WL_CAP} per wallet, before anyone else.</p>`
          : `<h2>The Whitelist</h2><p>This form is the door. Fill in all four lines and send it, and HR lets you in. Whitelist mints first, ${WL_CAP} per wallet, before anyone else.</p>`;
        const ab = el("button", "fb-btn", clearanceDone() ? "REVIEW YOUR APPLICATION" : "APPLY FOR THE WHITELIST");
        ab.style.marginTop = "10px";
        ab.addEventListener("click", () => openApply());
        wl.appendChild(ab);
        room.appendChild(wl);
      }
      const c = el("div", "fb-card");
      mintDesk(s, c, false);
      room.appendChild(c);
    });

    flatSection(host, "Trading Floor", zoneLive(ZONES[2]) ? "your brokers" : "locked", (room) => {
      if (!zoneLive(ZONES[2])) { room.appendChild(el("div", "fb-card", `<p>Opens at launch.</p>`)); return; }
      if (!state.account) {
        const c = el("div", "fb-card", `<p>Connect your wallet to see your brokers.</p>`);
        const b = el("button", "fb-btn", "CLOCK IN");
        b.addEventListener("click", connect);
        b.style.marginTop = "8px";
        c.appendChild(b);
        room.appendChild(c);
        return;
      }
      if (!state.brokers.length) { room.appendChild(el("div", "fb-card", `<p>No brokers here yet. HR is one section up.</p>`)); return; }
      // the board is not on the page in flat mode, so claim-all needs its own
      // door here or it exists only on a desktop
      const claimable = state.brokers.filter((b) => b.holdings.length);
      const manual = state.brokers.filter((b) => b.active && !b.collect);
      if (claimable.length) {
        const cc = el("div", "fb-card", `<h2>Money waiting</h2><p>${claimable.length} broker${claimable.length === 1 ? " has" : "s have"} pay sitting in ${claimable.length === 1 ? "his vault" : "their vaults"}.</p>`);
        const cb = el("button", "fb-btn", `CLAIM ALL ${claimable.length}`);
        cb.style.marginTop = "10px";
        cb.addEventListener("click", () => claimAll(claimable));
        cc.appendChild(cb);
        room.appendChild(cc);
      } else if (manual.length) {
        const ac = el("div", "fb-card", `<h2>Get paid automatically</h2><p>${manual.length} broker${manual.length === 1 ? " pays" : "s pay"} into a vault you have to empty. Switch ${manual.length === 1 ? "him" : "them"} to paying your wallet every hour.</p>`);
        const ab = el("button", "fb-btn", `GO AUTOMATIC ${manual.length}`);
        ab.style.marginTop = "10px";
        ab.addEventListener("click", () => goAutomatic(manual));
        ac.appendChild(ab);
        room.appendChild(ac);
      }
      const grid = el("div", "fb-brokers");
      for (const b of state.brokers) {
        const t = tierOf(b.tierBurned);
        const card = el("div", "fb-broker" + (b.active ? " working" : ""));
        card.innerHTML = `<header><img src="${CFG.imageBase}/${b.artwork}.png" onerror="this.src='${CFG.sealedImage}'">
          <div class="who"><b>#${b.id}</b><span>Level ${t.level} · ${t.name} · ${(b.weight / 100).toFixed(2)}x</span>
          <span class="status${b.active ? "" : " off"}">${b.active ? "ON THE CLOCK" : "OFF DUTY"}</span></div></header>`;
        const acts = el("div", "acts");
        acts.appendChild(actBtn("OPEN", () => openBrokerPopover(b)));
        card.appendChild(acts);
        grid.appendChild(card);
      }
      room.appendChild(grid);
      // the merger has no machine to click in flat mode, so the menu needs its
      // own door here or merging is unreachable without the world
      if (state.brokers.length > 1) {
        const mg = el("div", "fb-card", "<h2>The Merger</h2><p>Feed two or three brokers in and one comes out carrying their combined weight. The rest are burned.</p>");
        const open = el("button", "fb-btn", "OPEN THE MERGER");
        open.style.marginTop = "10px";
        open.addEventListener("click", openMergeMenu);
        mg.appendChild(open);
        room.appendChild(mg);
      }
    });

    flatSection(host, "The Bank", zoneLive(ZONES[3]) ? "the money" : "locked", (room) => {
      if (!zoneLive(ZONES[3])) { room.appendChild(el("div", "fb-card", `<p>${DEPLOYED ? "Opens with the token." : "Opens at launch."}</p>`)); return; }
      const s = state.stats || PRELAUNCH;
      room.appendChild(el("div", "fb-card dark", `<div class="big">${fmtEth(s.totalHarvested, 3)} ETH</div><p>paid into payroll · pot this hour: ${fmtEth(s.potBuffer)} ETH · burned: ${s.burned !== null ? fmtCompact(s.burned) : "—"} $9TO5</p>`));
      if (DEPLOYED && state.tokenLive && CFG.token) {
        const c = el("div", "fb-card", `<h2>Buy $9TO5</h2><p>Trades on letscash.fun. The fee on every trade pays the salaries here.</p>`);
        const a = el("a", "fb-btn", "OPEN THE EXCHANGE →");
        a.href = CFG.buyUrl + "token/" + CFG.token;
        a.target = "_blank"; a.rel = "noopener";
        a.style.cssText = "display:inline-block;text-decoration:none;margin-top:10px";
        c.appendChild(a);
        room.appendChild(c);
      } else {
        room.appendChild(el("div", "fb-card", `<h2>$9TO5</h2><p>The token does not exist yet. It is born on launch day, right before the mint opens, and a green BUY button appears here and all over the street. Anything called 9TO5 before then is fake. Do not buy it.</p>`));
      }
      // the furnace has no machine to walk up to in flat mode, so it needs its
      // own door here or hiring and promoting are reachable only from a broker
      if (state.account && state.brokers.length) {
        const fc = el("div", "fb-card", "<h2>The Furnace</h2><p>Burn $9TO5 to put a broker on payroll, or to move him up from Intern to CEO. A higher level is a permanently bigger share of every payday.</p>");
        const open = el("button", "fb-btn", "OPEN THE FURNACE");
        open.style.marginTop = "10px";
        open.addEventListener("click", () => openFurnaceMenu());
        fc.appendChild(open);
        room.appendChild(fc);
      }
    });

    flatSection(host, "The Paperwork", "plain words", (room) => docsCards(room, true));
    $("fb-play")?.addEventListener("click", () => setFlat(false, true));
  }
  // ☠️ EVERY ONE OF THESE IS OPTIONAL ON PURPOSE. index.html and level.js are
  // separate files behind a 600s edge cache, and html is served DYNAMIC while
  // js is a cached HIT — so html reaches visitors MINUTES before js does. For
  // that window the new page is running the old script. When #fb-ribbon was
  // removed from index.html, the old level.js still did $("fb-ribbon").style,
  // paintHud threw on it, and every zone button was built after that line: the
  // street shipped with an empty navigation bar for four and a half minutes.
  //
  // The guard does not prevent the skew — nothing can, it is a property of two
  // files and one TTL. It makes the skew SURVIVABLE: one element missing for a
  // few minutes instead of a page that throws.
  // setFlat owns the label now, so this only has to decide the direction.
  // Two copies of "what should the button say" is how it came to disagree
  // with itself: WALK THE STREET changed the mode without going through here.
  // The list checker's street door: a chip beside DOCS. Built only when the
  // module is present, so a stale cache degrades to no button rather than a
  // dead one, and clicking APPLY inside the modal opens the real form.
  if (window.__WL_CHECK) {
    const wb = el("button", "fb-hudbtn", "THE LIST");
    wb.id = "fb-wlbtn";
    wb.type = "button";
    // after the cut the modal must never offer the form, so no onApply is passed
    wb.addEventListener("click", () =>
      window.__WL_CHECK.open(state.account || undefined, applyClosed() ? {} : { onApply: () => openApply() }));
    const db = $("fb-docsbtn");
    if (db && db.parentElement) db.parentElement.insertBefore(wb, db);
  }

  $("fb-flatbtn")?.addEventListener("click", () => {
    setFlat(!document.body.classList.contains("flat-mode"), true);
  });

  // ------------------------------------------------------------ boot
  buildBack();
  buildFront();
  paintHud();
  updateThought();
  paintWalletBadge();
  // Anything measured before the pixel fonts arrive is measured in a fallback
  // face and comes out too wide. Re-measure once the real fonts are in.
  try {
    document.fonts.ready.then(() => {
      state.cueKey = null; // makes the door prompt measure itself again
      updateThought();
    });
  } catch (e) { /* no font loading api: the first measurement stands */ }
  refreshStats();
  setInterval(refreshStats, 60000);
  setInterval(() => state.account && refreshBrokers(), 90000);
  if (wantsFlat()) {
    setFlat(true, false);
  }
  requestAnimationFrame(tick);
})();
