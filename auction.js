/* ===========================================================================
   THE AUCTION HOUSE — one broker on stage a day, bid in the partner token.

   Wired like lobby.js and flathero.js: this file registers window.__AUCTION and
   level.js calls it guarded, so old level.js + this file, or new level.js
   WITHOUT this file, must both land on a working page. html and js sit behind
   separate 600s edge caches and can be skewed by ten minutes either way.

   It is deliberately TOKEN-AGNOSTIC. The bid token is an immutable constructor
   argument of the contract, so a second AuctionHouse denominated in something
   else is a second deployment of the same audited bytecode — and this room
   serves it by reading the symbol and decimals off the chain. Nothing here says
   FRONG.

   Reads go through F.callBatch (one batched call per poll). Writes go through
   F.send. Everything the room needs is on-chain: no indexer, no worker, no logs
   — the RHC rpc caps eth_getLogs at 10,000 results and it has bitten this
   project twice.

   ⚠️ lotView().status: 0 scheduled · 1 live · 2 ended, bell not rung · 3 done ·
   4 NO SUCH LOT. Status 4 (and lot id 0) mean "nothing is scheduled", never
   "ring the bell".
   =========================================================================== */
(function () {
  "use strict";

  const SEL = {
    lotView: "0x36ab6b0a",   // lotView(uint256)
    ladder: "0x54f45f0a",    // ladder(uint256,uint256)
    current: "0x9fa6a6e3",   // current()
    bid: "0x4cafdb15",       // bid(uint256,uint128)
    settle: "0x8df82800",    // settle(uint256)
    approve: "0x095ea7b3",   // approve(address,uint256)
    allowance: "0xdd62ed3e", // allowance(address,address)
    balanceOf: "0x70a08231", // balanceOf(address)
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
    artworkOf: "0x8cfd9b5b",
    recent: "0x41d41daf", // recent(uint256) — NOT recentSettled(), which does not exist
    upcoming: "0x68560cd7",     // upcoming(uint256)
    dueForSettle: "0xc4ed128f", // dueForSettle() — ended lots still waiting for the bell
  };
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  // lot.outcome. status() folds ALL of SOLD/UNSOLD/CANCELLED into status 3
  // (AuctionHouse.sol:376), so the button and the countdown must read `outcome`
  // to tell "someone won him" from "nobody bid" from "we pulled the lot".
  const OPEN = 0, SOLD = 1, UNSOLD = 2, CANCELLED = 3;
  const POLL_IDLE = 20000;
  const POLL_HOT = 4000;
  const HOT_WINDOW = 600; // seconds before the hammer to poll fast

  // ---------------------------------------------------------------- helpers
  const w = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
  const big = (hex, i) => BigInt("0x" + w(hex, i));
  const num = (hex, i) => Number(big(hex, i));
  const addr = (hex, i) => "0x" + w(hex, i).slice(24);
  const short = (a) => (a && a !== "0x0000000000000000000000000000000000000000"
    ? a.slice(0, 6) + "…" + a.slice(-4) : "—");

  /// LotView is a struct of statics, so it comes back as 16 flat words:
  /// lotId, then the 12 members of Lot, then minBid, status, nowTs.
  function decodeLotView(hex) {
    if (!hex || hex.length < 2 + 64 * 16) return null;
    return {
      lotId: num(hex, 0),
      tokenId: big(hex, 1),
      seller: addr(hex, 2),
      startsAt: num(hex, 3),
      endsAt: num(hex, 4),
      reserve: big(hex, 5),
      highest: big(hex, 6),
      bidder: addr(hex, 7),
      escrow: big(hex, 8),
      rebatesPaid: big(hex, 9),
      bids: num(hex, 10),
      feeBps: num(hex, 11),
      outcome: num(hex, 12),
      minBid: big(hex, 13),
      status: num(hex, 14),
      nowTs: num(hex, 15),
    };
  }

  /// Bid[] — offset, length, then three words each.
  function decodeLadder(hex) {
    if (!hex || hex.length < 2 + 64 * 2) return [];
    const n = num(hex, 1);
    const out = [];
    for (let i = 0; i < n; i++) {
      const b = 2 + i * 3;
      out.push({ bidder: addr(hex, b), amount: big(hex, b + 1), at: num(hex, b + 2) });
    }
    return out;
  }

  /// DISPLAY ONLY. Groups with the viewer's locale and truncates to two places,
  /// so it is both lossy and locale-shaped. It must never reach the input box.
  function fmtUnits(v, dec, dp) {
    const d = BigInt(10) ** BigInt(dec);
    const whole = v / d;
    if (dp === 0) return whole.toLocaleString();
    const frac = ((v % d) * 100n) / d;
    return whole.toLocaleString() + (frac ? "." + String(frac).padStart(2, "0") : "");
  }

  /// DISPLAY ONLY, and rounds UP. A board that says TO BEAT must never print a
  /// number the desk will then refuse: fmtUnits TRUNCATES, so a 4428.9025
  /// minimum renders as 4,428.90, which is below the minimum. Same class of bug
  /// as the two below, one surface further out.
  function ceilUnits(v, dec, dp) {
    const p = BigInt(10) ** BigInt(Math.max(0, dec - dp));
    return fmtUnits(((v + p - 1n) / p) * p, dec, dp);
  }

  /// MACHINE-READABLE. Exact, no grouping, no locale, round-trips through
  /// parseAmount for any value. This is what goes INTO the input box.
  ///
  /// Two launch-blocking bugs came from prefilling fmtUnits instead (both found
  /// by a peer audit 2026-08-30, both reproduced):
  ///   1 fmtUnits TRUNCATES to two places, so from the 7th bid of a 5,000
  ///     reserve ladder the prefilled minimum parses back BELOW minBid and the
  ///     desk refuses the number it just put in the box, quoting the same
  ///     figure back at the bidder.
  ///   2 toLocaleString uses the VIEWER's locale, so es-AR/de-DE render
  ///     "8.857.80" and fr-FR "8 857.80". parseAmount rejects all of them and
  ///     the button is dead from the first bid for most of the world.
  function exactUnits(v, dec) {
    const d = BigInt(10) ** BigInt(dec);
    const frac = (v % d).toString().padStart(dec, "0").replace(/0+$/, "");
    return (v / d).toString() + (frac ? "." + frac : "");
  }

  function clock(sec) {
    if (sec <= 0) return "00:00:00";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
  }

  // ------------------------------------------------------------------- CSS
  let cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = `
/* THE AUCTION HOUSE.
   Drawn from the room's own tokens (--ink, --gold, --steel, --font-display) so
   it reads as the same building, and anchored to --ground-h rather than to
   top: that variable steps 220 -> 180 -> 120 as the window shortens, and
   anything pinned to the top edge drifts away from everything on the floor.

   ☠️ WALL, NOT WINDOW. glassWall() paints glazing at fixed x ranges. A board
   hung across one reads as a screen floating on glass. Every mounted piece
   here sits on SOLID wall and the walls are placed around them, not after. */

/* ---------- THE STAGE ---------- */
.au-stage{position:absolute;bottom:var(--ground-h);width:550px;height:300px;pointer-events:none}
/* a pelmet across the top, the way a real proscenium is finished */
.au-stage .pelmet{position:absolute;left:0;right:0;top:0;height:30px;
  background:linear-gradient(#7d2438,#4d1424);border:4px solid var(--ink);
  box-shadow:inset 0 -5px 0 -2px #ffc93355}
.au-stage .pelmet:after{content:"";position:absolute;left:6px;right:6px;bottom:-9px;height:10px;
  background:repeating-linear-gradient(90deg,#7d2438 0 16px,transparent 16px 32px);
  -webkit-mask:radial-gradient(9px 10px at 8px 0,#000 98%,transparent);
          mask:radial-gradient(9px 10px at 8px 0,#000 98%,transparent)}
/* velvet, with folds: three reds on a repeat so it does not read as bars */
.au-stage .drape{position:absolute;left:14px;right:14px;top:26px;bottom:58px;
  background:repeating-linear-gradient(90deg,#5e1c2c 0 13px,#7d2438 13px 22px,#40121f 22px 31px);
  border:4px solid var(--ink);box-shadow:inset 0 14px 22px -10px #000,inset 0 -10px 18px -8px #000}
/* the light: a cone from the pelmet plus the pool it throws on the boards */
.au-stage .cone{position:absolute;left:115px;top:30px;width:320px;bottom:58px;
  background:linear-gradient(180deg,#ffe9a866,#ffe9a80f);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%)}
.au-stage .pool{position:absolute;left:115px;bottom:52px;width:320px;height:30px;
  background:radial-gradient(50% 100% at 50% 100%,#ffe9a866,transparent 72%)}
/* the boards, with a front panel and a brass lip */
.au-stage .dais{position:absolute;left:0;right:0;bottom:0;height:58px;
  background:linear-gradient(#3f474f,#222831);border:4px solid var(--ink);
  box-shadow:inset 0 6px 0 #8ea3b8,0 5px 0 rgba(0,0,0,.3)}
.au-stage .dais:after{content:"";position:absolute;left:8px;right:8px;bottom:12px;height:4px;
  background:var(--gold);opacity:.55}
.au-stage .frame{position:absolute;left:0;right:0;margin:0 auto;bottom:100px;width:164px;height:164px;
  background:#0d1014;border:5px solid var(--gold);padding:9px;
  box-shadow:0 0 0 4px var(--ink),0 0 34px #ffc93340,0 6px 0 rgba(0,0,0,.35)}
.au-stage .frame img{width:100%;height:100%;image-rendering:pixelated;display:block}
.au-stage .curtain{position:absolute;left:179px;bottom:100px;width:164px;height:164px;
  background:#40121f;border:5px solid var(--gold);box-shadow:0 0 0 4px var(--ink);
  display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;
  box-sizing:border-box;color:#f0dcb0;font:9px/1.8 var(--font-display)}
/* the brass nameplate on the front of the dais */
.au-stage .plate{position:absolute;left:50%;transform:translateX(-50%);bottom:66px;z-index:2;
  padding:5px 14px;background:linear-gradient(#c8a24a,#8a6a2a);border:3px solid var(--ink);
  color:#2a1f08;font:8px/1.5 var(--font-display);white-space:nowrap}

/* the rope: brass posts and a hanging swag, in FRONT of the stage */
.au-rope-post{position:absolute;bottom:var(--ground-h);width:11px;height:52px;
  background:linear-gradient(#c8a24a,#7d6224);border:3px solid var(--ink)}
.au-rope-post:before{content:"";position:absolute;top:-9px;left:-4px;width:15px;height:9px;
  background:#e0be6a;border:3px solid var(--ink);border-radius:50% 50% 0 0}
.au-rope-swag{position:absolute;bottom:calc(var(--ground-h) + 26px);height:30px;
  border-bottom:9px solid #7a2740;border-radius:0 0 50% 50%/0 0 26px 26px;
  box-shadow:0 4px 0 -1px #00000040}

/* ---------- THE TOTE BOARD ---------- */
.au-tote{position:absolute;width:510px;box-sizing:border-box;
  background:linear-gradient(160deg,#2b323a,#1a1e24);border:4px solid var(--ink);
  box-shadow:0 0 0 4px #3a4148,7px 8px 0 rgba(0,0,0,.32)}
.au-tote .bolt{position:absolute;width:8px;height:8px;background:#8ea3b8;border:2px solid var(--ink)}
.au-tote .bolt.a{left:9px;top:9px} .au-tote .bolt.b{right:9px;top:9px}
.au-tote h4{margin:0;padding:11px 30px 10px;text-align:center;background:linear-gradient(#3b444e,#2a3036);
  border-bottom:4px solid var(--ink);box-shadow:inset 0 -7px 0 -3px #ffc93340;
  font:9px/1.5 var(--font-display);color:#ffd75e;text-shadow:0 0 9px #ffc93355;letter-spacing:.06em}
.au-tote .scr{position:relative;background:#0b1016;margin:10px;padding:8px 13px;
  border:3px solid var(--ink);box-shadow:inset 0 0 0 2px #0d1014,inset 0 0 26px #00000090;overflow:hidden}
.au-tote .scr:before{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(180deg,#ffffff0e 0 1px,transparent 1px 3px)}
.au-tote .scr:after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 40%,transparent 55%,#000000a0)}
.au-tote .big{font:24px/1.1 'VT323',monospace;color:#a8f0b6;text-shadow:0 0 12px #6fe08c45}
.au-tote .row{display:flex;justify-content:space-between;gap:12px;
  font:17px/1.4 'VT323',monospace;color:#79b98c}
.au-tote .row b{color:#eaffea;font-weight:400}
.au-tote .cd{font:24px/1.25 'VT323',monospace;color:#eaffea}
.au-tote.hot .cd{color:#ff8f6b;text-shadow:0 0 12px #ff6b3a66}
.au-tote .lad{margin-top:7px;border-top:2px solid #ffffff14;padding-top:6px;min-height:50px;
  font:15px/1.4 'VT323',monospace}
.au-tote .lad div{display:flex;justify-content:space-between;gap:10px;color:#5f9c72}
.au-tote .lad div.top{color:var(--gold);text-shadow:0 0 9px #ffc93344}
.au-tote .lad div.ph{color:#2f4a39}\n@media (max-height:848px){.au-tote .lad{display:none}}\n@media (max-height:791px){.au-tote{display:none}}

/* ---------- brass plaques ---------- */
.au-desk .au-counters{display:flex;gap:18px;margin-top:9px;padding-top:8px;border-top:2px solid #ffffff14;
  font:15px/1.4 'VT323',monospace;color:#79b98c}

.au-desk .au-counters b{font:8px/1.4 var(--font-display);color:#ffd75e}
.au-desk .au-counters u{text-decoration:none;color:#a8f0b6}


/* ---------- the wall of past hammers ---------- */
.au-sold{position:absolute;width:392px;box-sizing:border-box;min-height:198px;
  display:flex;flex-direction:column;
  background:linear-gradient(160deg,#2b323a,#1a1e24);
  border:4px solid var(--ink);box-shadow:0 0 0 3px #55606b,5px 5px 0 rgba(0,0,0,.28)}
.au-sold b{display:block;padding:9px 12px;text-align:center;
  background:linear-gradient(#c8a24a,#8a6a2a);border-bottom:3px solid var(--ink);
  color:#2a1f08;font:8px/1.5 var(--font-display)}
.au-sold .row{display:flex;gap:13px;justify-content:center;align-items:center;
  flex:1;padding:11px}
.au-sold .f{width:114px;background:#0d1014;border:5px solid #c8a24a;
  box-shadow:0 0 0 3px var(--ink),4px 4px 0 rgba(0,0,0,.3);padding:6px}
.au-sold .f img{display:block;width:100%;image-rendering:pixelated}
.au-sold .f u{display:block;margin-top:5px;text-align:center;text-decoration:none;
  font:14px/1.3 'VT323',monospace;color:#a8f0b6}
.au-sold .none{flex:1;display:flex;align-items:center;justify-content:center;padding:0 14px;
  font:16px/1.4 'VT323',monospace;color:#6b7a86;text-align:center;width:100%}\n@media (max-height:829px){.au-sold{display:none}}

/* ---------- the sale room's own furniture ---------- */
/* bidders' chairs, in a row facing the stage. An auction house without seating
   reads as a lobby with a curtain in it. */
.au-chair{position:absolute;bottom:var(--ground-h);width:52px;height:86px}
.au-chair .back{position:absolute;left:8px;top:0;width:36px;height:44px;
  background:linear-gradient(#5e1c2c,#40121f);border:3px solid var(--ink);
  box-shadow:inset 0 5px 0 -2px #ffffff1a}
.au-chair .seat{position:absolute;left:0;top:42px;width:52px;height:15px;
  background:linear-gradient(#7d2438,#521a28);border:3px solid var(--ink)}
.au-chair i{position:absolute;top:55px;width:7px;height:31px;background:#2b3038;border:2px solid var(--ink)}
.au-chair i.l{left:6px} .au-chair i.r{right:6px}

/* the catalogue easel by the door: what is up today, before you walk in */
.au-easel{position:absolute;bottom:var(--ground-h);width:132px;height:186px}
.au-easel .board{position:absolute;left:0;top:0;width:132px;height:142px;
  background:linear-gradient(160deg,#2b323a,#1a1e24);border:4px solid var(--ink);
  box-shadow:0 0 0 3px #c8a24a,4px 4px 0 rgba(0,0,0,.3);padding:9px;box-sizing:border-box}
.au-easel .board b{display:block;font:7px/1.6 var(--font-display);color:var(--gold);text-align:center}
.au-easel .board u{display:block;margin-top:7px;text-decoration:none;text-align:center;
  font:19px/1.2 'VT323',monospace;color:#a8f0b6}
.au-easel .board span{display:block;margin-top:3px;text-align:center;
  font:14px/1.3 'VT323',monospace;color:#79b98c}
.au-easel i{position:absolute;top:138px;width:7px;height:48px;background:#5e4a22;border:2px solid var(--ink)}
.au-easel i.l{left:26px;transform:rotate(9deg)} .au-easel i.r{right:26px;transform:rotate(-9deg)}

/* a pendant over the stage, hung from the ceiling like the room's own lights */
.au-pendant{position:absolute;top:44px;width:150px;height:96px;pointer-events:none}
.au-pendant .cord{position:absolute;left:50%;top:0;width:4px;height:44px;background:#2b3038;transform:translateX(-50%)}
.au-pendant .shade{position:absolute;left:0;top:42px;width:150px;height:30px;
  background:linear-gradient(#e0be6a,#8a6a2a);border:4px solid var(--ink);
  clip-path:polygon(16% 0,84% 0,100% 100%,0 100%)}
.au-pendant .glow{position:absolute;left:15px;top:70px;width:120px;height:26px;
  background:radial-gradient(50% 100% at 50% 0,#ffe9a875,transparent 72%)}

/* ---------- small furniture: the things a working sale room accumulates ---- */

/* a runner from the door to the stage. Flat, so it is safe at every height, and
   it warms the floor where the wainscot cannot reach (most of that wall is glass). */
.au-runner{position:absolute;bottom:calc(var(--ground-h) - 46px);height:58px;
  background:linear-gradient(#6d2338 0 12px,#521a28 12px);
  border:3px solid var(--ink);box-sizing:border-box;
  box-shadow:inset 0 4px 0 #c8a24a55}
.au-runner:before,.au-runner:after{content:"";position:absolute;top:3px;bottom:3px;width:5px;background:#c8a24a;opacity:.5}
.au-runner:before{left:12px} .au-runner:after{right:12px}
/* the fringe at each end */
.au-runner u{position:absolute;top:3px;bottom:3px;width:9px;background:
  repeating-linear-gradient(#c8a24a 0 4px,transparent 4px 8px);opacity:.6}
.au-runner u.l{left:24px} .au-runner u.r{right:24px}

/* the catalogue stack: today's lots, printed, left where people pick them up */
.au-cats{position:absolute;bottom:var(--ground-h);width:74px;height:46px}
.au-cats i{position:absolute;left:0;width:74px;height:12px;
  background:linear-gradient(#e8e2d2,#c9c2ae);border:3px solid var(--ink)}
.au-cats i:nth-child(1){bottom:0}
.au-cats i:nth-child(2){bottom:11px;left:4px;width:66px}
.au-cats i:nth-child(3){bottom:22px;left:-2px;transform:rotate(-3deg)}

/* the floor sign the porters put out while a lot is on stage */
.au-quiet{position:absolute;bottom:var(--ground-h);width:64px;height:100px}
.au-quiet .board{position:absolute;left:0;top:0;width:64px;height:60px;
  background:linear-gradient(160deg,#2b323a,#1a1e24);border:4px solid var(--ink);
  box-shadow:0 0 0 3px #c8a24a;padding:7px 4px;box-sizing:border-box;text-align:center}
.au-quiet .board b{display:block;font:7px/1.7 var(--font-display);color:#ffd75e}
.au-quiet i{position:absolute;top:56px;width:7px;height:44px;background:#3f474f;border:2px solid var(--ink)}
.au-quiet i.l{left:13px;transform:rotate(7deg)} .au-quiet i.r{right:13px;transform:rotate(-7deg)}

/* crate detail: a clipboard hung on the stack, a crowbar leaning on it, and a
   stencil that says whose crates these are */
.au-crate .stamp{position:absolute;left:7px;bottom:7px;padding:1px 4px;
  background:#e6dec9;border:2px solid var(--ink);box-shadow:1px 1px 0 rgba(0,0,0,.3);
  font:6px/1.4 var(--font-display);color:#2e2314;transform:rotate(-4deg)}
.au-clip{position:absolute;bottom:calc(var(--ground-h) + 74px);width:34px;height:44px;
  background:#e8e2d2;border:3px solid var(--ink);box-shadow:2px 2px 0 rgba(0,0,0,.3)}
.au-clip:before{content:"";position:absolute;left:8px;top:-7px;width:18px;height:8px;
  background:#8ea3b8;border:3px solid var(--ink)}
.au-clip i{position:absolute;left:6px;right:6px;height:3px;background:#9aa3ad}
.au-clip i:nth-child(1){top:11px} .au-clip i:nth-child(2){top:19px} .au-clip i:nth-child(3){top:27px;right:14px}
.au-bar{position:absolute;bottom:var(--ground-h);width:12px;height:92px;
  background:linear-gradient(#8ea3b8,#5f7690);border:3px solid var(--ink);transform:rotate(11deg)}
.au-bar:after{content:"";position:absolute;left:-5px;top:-8px;width:20px;height:11px;
  background:#5f7690;border:3px solid var(--ink);border-radius:6px 6px 0 0}

/* the porter's stool and a wrapped lot, flanking the catalogues. Both are kept
   under 55px because the bid desk comes down to ground+60 on a short window. */
.au-stool{position:absolute;bottom:var(--ground-h);width:56px;height:48px}
.au-stool u{position:absolute;left:0;top:0;width:56px;height:15px;
  background:linear-gradient(#7a2740,#521a28);border:3px solid var(--ink);box-sizing:border-box}
.au-stool i{position:absolute;top:15px;width:12px;height:33px;
  background:linear-gradient(90deg,#8a6039,#5c3f22);border:3px solid var(--ink);box-sizing:border-box}
.au-stool i:nth-of-type(1){left:5px;transform:rotate(7deg)}
.au-stool i:nth-of-type(2){right:5px;transform:rotate(-7deg)}
.au-stool s{position:absolute;left:9px;right:9px;top:34px;height:6px;
  background:#5c3f22;border:2px solid var(--ink);box-sizing:border-box}
.au-parcel{position:absolute;bottom:var(--ground-h);width:62px;height:44px;
  background:linear-gradient(150deg,#9c8b6a,#7a6b4f);border:3px solid var(--ink);box-sizing:border-box}
.au-parcel:before{content:"";position:absolute;left:26px;top:-3px;bottom:-3px;width:7px;
  background:#3a2c1c;border-left:2px solid var(--ink);border-right:2px solid var(--ink)}
.au-parcel:after{content:"";position:absolute;left:-3px;right:-3px;top:16px;height:7px;
  background:#3a2c1c;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}
.au-parcel b{position:absolute;right:5px;bottom:4px;padding:1px 4px;z-index:1;
  background:#e6dec9;border:2px solid var(--ink);transform:rotate(3deg);
  font:6px/1.4 var(--font-display);color:#2e2314}

/* the broom lives in the 64px the bid desk leaves free before the notice board */
.au-broom{position:absolute;bottom:var(--ground-h);width:14px;height:158px;
  transform-origin:50% 100%;transform:rotate(14deg)}
.au-broom u{position:absolute;left:4px;top:0;width:7px;height:126px;background:#8a6a3e;border:2px solid var(--ink)}
.au-broom i{position:absolute;left:-6px;bottom:0;width:26px;height:34px;
  background:linear-gradient(#b9954f,#8a6a3e);border:3px solid var(--ink);box-sizing:border-box}

/* the bidder paddles, and the spare rope the porters coil by the wall. Both are
   under 55px for the same reason the rest of section E is. */
.au-paddles{position:absolute;bottom:var(--ground-h);width:58px;height:52px}
.au-paddles u{position:absolute;left:0;bottom:0;width:58px;height:28px;
  background:linear-gradient(#9c7b45,#6b5228);border:3px solid var(--ink);box-sizing:border-box;z-index:1}
.au-paddles i{position:absolute;bottom:20px;width:13px;height:26px;
  background:#e8e2d2;border:3px solid var(--ink);box-sizing:border-box}
.au-paddles i:nth-of-type(1){left:6px;transform:rotate(-9deg)}
.au-paddles i:nth-of-type(2){left:23px}
.au-paddles i:nth-of-type(3){right:6px;transform:rotate(9deg)}
.au-coil{position:absolute;bottom:var(--ground-h);width:44px;height:34px}
.au-coil i{position:absolute;left:0;width:44px;height:11px;border-radius:50%;
  background:linear-gradient(#7a2740,#4a1724);border:3px solid var(--ink);box-sizing:border-box}
.au-coil i:nth-of-type(1){bottom:0}
.au-coil i:nth-of-type(2){bottom:8px;left:3px;width:38px}
.au-coil i:nth-of-type(3){bottom:17px;left:7px;width:30px}

/* Above the bid desk. The room's whole schedule hangs on one city, so that is
   what goes on the wall. Hidden under 920px tall, where the ceiling is lower
   than the top of the frame -- same rule as the clock and RECENT HAMMERS. */
.au-view{position:absolute;width:300px;height:120px;box-sizing:border-box;
  border:5px solid #c8a24a;box-shadow:0 0 0 4px var(--ink),inset 0 0 0 3px var(--ink),
    0 6px 0 rgba(0,0,0,.28);
  background:linear-gradient(#1b2740 0 62%,#3a3050 62%,#6b4a44);overflow:hidden}
.au-view i{position:absolute;bottom:0;background:#141c2e;box-shadow:inset 0 3px 0 #ffffff10}
.au-view i:before{content:"";position:absolute;left:4px;top:8px;right:4px;height:4px;
  background:repeating-linear-gradient(90deg,#ffd75e 0 4px,transparent 4px 11px);opacity:.75}
.au-view i:after{content:"";position:absolute;left:4px;top:20px;right:4px;height:4px;
  background:repeating-linear-gradient(90deg,#ffd75e 0 4px,transparent 4px 11px);opacity:.45}
.au-view u{position:absolute;right:34px;top:16px;width:15px;height:15px;border-radius:50%;
  background:#f3e3b0;box-shadow:0 0 12px 5px #f3e3b055}
.au-viewplate{position:absolute;width:150px;text-align:center;box-sizing:border-box;
  background:linear-gradient(#d8b25c,#a07c36);border:3px solid var(--ink);
  font:8px/2 var(--font-display);color:#2a2013;letter-spacing:1px}
/* a pair of sconces so the wall is lit rather than just occupied */
.au-sconce{position:absolute;width:44px;height:58px}
/* backplate against the wall, then the arm, then the shade */
.au-sconce em{position:absolute;left:15px;bottom:0;width:14px;height:14px;font-style:normal;
  background:linear-gradient(#c8a24a,#8a6a3e);border:3px solid var(--ink);box-sizing:border-box}
.au-sconce u{position:absolute;left:19px;bottom:11px;width:6px;height:22px;
  background:#8a6a3e;border:3px solid var(--ink);box-sizing:border-box}
.au-sconce i{position:absolute;left:0;bottom:30px;width:44px;height:22px;box-sizing:border-box;
  background:linear-gradient(#e8c469,#a8823a);border:3px solid var(--ink);
  clip-path:polygon(24% 0,76% 0,100% 100%,0 100%)}
.au-sconce b{position:absolute;left:6px;bottom:22px;width:32px;height:11px;
  background:radial-gradient(ellipse at 50% 0,#ffe9a8cc,#ffd75e00 72%)}
@media (max-height:945px){.au-view,.au-viewplate,.au-sconce{display:none}}

/* the house emblem: two gavels crossed. No words on it -- that wall already
   has three boards to read. */
.au-crest{position:absolute;width:132px;height:96px}
.au-crest u{position:absolute;inset:0;
  background:radial-gradient(circle at 38% 30%,#3b444e,#20262c);
  border:4px solid var(--ink);box-shadow:0 0 0 3px #c8a24a,4px 4px 0 rgba(0,0,0,.3)}
.au-crest i{position:absolute;left:50%;top:50%;width:72px;height:9px;margin:-5px 0 0 -36px;
  background:linear-gradient(#a8823a,#6b5228);border:3px solid var(--ink);box-sizing:border-box}
.au-crest i:after{content:"";position:absolute;top:-8px;width:20px;height:22px;
  background:linear-gradient(#d8b25c,#8a6a2a);border:3px solid var(--ink);box-sizing:border-box}
.au-crest i.a{transform:rotate(-33deg)} .au-crest i.a:after{right:-9px}
.au-crest i.b{transform:rotate(33deg)}  .au-crest i.b:after{left:-9px}
@media (max-height:959px){.au-crest{display:none}}

/* ---------- DECOR. Each piece is independent and selected by CFG.decor, so
   they can be compared like-for-like in the same slot before one is chosen. */

/* panelling: dark wainscot with a brass dado rail, on the SOLID wall runs only.
   Glazing reaches the floor, and panelling behind glass reads as a mistake. */
.au-panel{position:absolute;bottom:var(--ground-h);height:112px;
  background:linear-gradient(#3a2b1c,#241a10);
  background-image:repeating-linear-gradient(90deg,#00000038 0 46px,#ffffff0e 46px 50px);
  border-top:5px solid #c8a24a;box-shadow:inset 0 7px 0 -3px #00000055}
.au-panel:after{content:"";position:absolute;left:0;right:0;top:-11px;height:6px;
  background:linear-gradient(#e0be6a,#8a6a2a);border-top:3px solid var(--ink);border-bottom:3px solid var(--ink)}

/* the lot queue: crates stencilled with the REAL upcoming lot numbers */
.au-queue{position:absolute;bottom:var(--ground-h);height:132px;display:flex;align-items:flex-end;gap:14px}
.au-crate{position:relative;width:96px;background:linear-gradient(#8a6a3a,#5e4a22);
  border:4px solid var(--ink);box-shadow:inset 0 0 0 3px #00000030,4px 4px 0 rgba(0,0,0,.3)}
.au-crate.a{height:104px} .au-crate.b{height:126px} .au-crate.c{height:92px}
.au-crate:before,.au-crate:after{content:"";position:absolute;left:-4px;right:-4px;height:5px;
  background:#3f2f16;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}
.au-crate:before{top:22%} .au-crate:after{bottom:24%}
.au-crate b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);
  padding:3px 8px;background:linear-gradient(#f0e9d5,#d6cdb4);border:2px solid var(--ink);
  box-shadow:1px 2px 0 rgba(0,0,0,.35);
  font:8px/1.5 var(--font-display);color:#2e2314;text-align:center;white-space:nowrap}
.au-crate i{position:absolute;width:11px;height:11px;background:#8ea3b8;border:2px solid var(--ink)}
.au-crate i.tl{top:3px;left:3px} .au-crate i.br{bottom:3px;right:3px}
.au-porter{position:absolute;bottom:var(--ground-h);width:96px;height:118px}
.au-porter .body{position:absolute;left:44px;bottom:0;width:34px;height:70px;
  background:linear-gradient(#2f3a4d,#1d2432);border:3px solid var(--ink)}
.au-porter .head{position:absolute;left:50px;bottom:68px;width:22px;height:22px;
  background:#e8b98c;border:3px solid var(--ink)}
.au-porter .cap{position:absolute;left:47px;bottom:86px;width:28px;height:9px;
  background:#7a2740;border:3px solid var(--ink)}
/* a sack barrow: two uprights, a toe plate, a wheel, and a crate on it */
.au-porter .trolley{position:absolute;left:6px;bottom:10px;width:30px;height:84px;
  background:repeating-linear-gradient(90deg,#8ea3b8 0 7px,transparent 7px 23px);
  border-left:3px solid var(--ink);border-right:3px solid var(--ink)}
.au-porter .trolley:before{content:"";position:absolute;left:-6px;bottom:-10px;width:42px;height:8px;
  background:#8ea3b8;border:3px solid var(--ink)}
.au-porter .trolley:after{content:"";position:absolute;left:-9px;bottom:-22px;width:18px;height:18px;
  border-radius:50%;background:#2b3038;border:3px solid var(--ink);box-shadow:inset 0 0 0 3px #8ea3b8}
.au-porter .load{position:absolute;left:2px;bottom:22px;width:38px;height:44px;
  background:linear-gradient(#8a6a3a,#5e4a22);border:3px solid var(--ink)}
.au-porter .load:after{content:"";position:absolute;left:-3px;right:-3px;top:14px;height:4px;
  background:#3f2f16;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}

/* telephone bidding booths: absentee bidders on the line */
.au-phones{position:absolute;bottom:var(--ground-h);height:162px;display:flex;align-items:flex-end;gap:12px}
.au-booth{width:104px;height:162px;background:linear-gradient(160deg,#2b323a,#1a1e24);
  border:4px solid var(--ink);box-shadow:0 0 0 3px #55606b,4px 4px 0 rgba(0,0,0,.28);
  position:relative;padding:9px;box-sizing:border-box}
.au-booth .set{position:absolute;left:50%;top:22px;transform:translateX(-50%);
  width:52px;height:38px;background:#3f474f;border:3px solid var(--ink)}
.au-booth .set:before{content:"";position:absolute;left:-9px;top:-13px;width:70px;height:12px;
  background:#c8a24a;border:3px solid var(--ink);border-radius:9px 9px 0 0}
.au-booth .cord{position:absolute;left:50%;top:64px;width:3px;height:26px;background:#2b3038}
.au-booth .lamp{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);
  width:13px;height:13px;border-radius:50%;background:#2b3038;border:3px solid var(--ink)}
.au-booth.on .lamp{background:#9ff0a8;box-shadow:0 0 12px #6fe08c88}
.au-booth u{position:absolute;left:0;right:0;bottom:34px;text-align:center;text-decoration:none;
  font:7px/1.5 var(--font-display);color:#ffd75e}

/* the settlement window: brass bars, a ledger, and a clerk behind it */
.au-settle{position:absolute;bottom:var(--ground-h);width:300px;height:162px}
.au-settle .frame{position:absolute;inset:0;background:linear-gradient(160deg,#2b323a,#12161c);
  border:5px solid var(--ink);box-shadow:0 0 0 4px #55606b,5px 5px 0 rgba(0,0,0,.3)}
.au-settle .bars{position:absolute;left:16px;right:16px;top:38px;bottom:48px;
  background:repeating-linear-gradient(90deg,#c8a24a 0 6px,transparent 6px 26px);
  border-top:3px solid var(--ink);border-bottom:3px solid var(--ink)}
.au-settle b{position:absolute;left:0;right:0;top:12px;text-align:center;
  font:8px/1.5 var(--font-display);color:#ffd75e}
.au-settle .sill{position:absolute;left:8px;right:8px;bottom:26px;height:16px;
  background:linear-gradient(#3f474f,#242a30);border:3px solid var(--ink)}
.au-settle .ledger{position:absolute;left:34px;bottom:38px;width:56px;height:16px;
  background:#e8e2d2;border:3px solid var(--ink);transform:rotate(-4deg)}
.au-settle .clerk{position:absolute;right:44px;bottom:52px;width:24px;height:24px;
  background:#e8b98c;border:3px solid var(--ink)}
.au-settle .clerk:after{content:"";position:absolute;left:-4px;top:-9px;width:32px;height:9px;
  background:#2f3a4d;border:3px solid var(--ink)}

/* the house notice: the four rules that decide every lot, on the wall you pass
   between the desk and the hammers */
.au-notice{position:absolute;width:392px;background:linear-gradient(160deg,#2b323a,#1a1e24);
  border:4px solid var(--ink);box-shadow:0 0 0 3px #55606b,5px 5px 0 rgba(0,0,0,.28);padding:0 0 11px}
.au-notice b{display:block;padding:9px 12px;margin-bottom:8px;
  background:linear-gradient(#c8a24a,#8a6a2a);border-bottom:3px solid var(--ink);
  color:#2a1f08;font:8px/1.5 var(--font-display);text-align:center}
.au-notice .rows{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;padding:0 12px 2px}
.au-notice u{display:block;text-decoration:none;padding:2px 0 2px 14px;position:relative;
  font:16px/1.5 'VT323',monospace;color:#a8f0b6}
.au-notice u:before{content:"";position:absolute;left:0;top:11px;width:5px;height:5px;background:var(--gold)}

/* a ground-anchored clock: hr2-clock is pinned to top: and drifts into the
   boards below it as the window shortens */
.au-clock{position:absolute;width:84px;height:84px;border-radius:50%;
  background:radial-gradient(circle at 36% 30%,#f6efda,#ddd2b4 60%,#b5a888);
  border:5px solid var(--ink);box-sizing:border-box;
  box-shadow:0 0 0 6px #c8a24a,0 0 0 10px var(--ink),inset 0 5px 0 #ffffff66,inset 0 -6px 0 #00000018}
.au-clock .ticks{position:absolute;inset:0}
.au-clock .ticks s{position:absolute;left:50%;top:3px;width:2px;height:6px;margin-left:-1px;
  background:#6f6555;transform-origin:50% 34px}
.au-clock .ticks s.mj{width:4px;height:9px;margin-left:-2px;background:#3b3327}
.au-clock i{position:absolute;left:50%;bottom:50%;transform-origin:50% 100%;background:var(--ink)}
.au-clock i.h{width:6px;margin-left:-3px;height:18px;transform:rotate(150deg)}  /* five o'clock */
.au-clock i.m{width:4px;margin-left:-2px;height:27px}
.au-clock b{position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;
  border-radius:50%;background:#8a2b2b;border:3px solid var(--ink);box-sizing:border-box}
.au-clockold{position:absolute;width:46px;height:46px;border-radius:50%;
  background:linear-gradient(#e8e2d2,#b9b2a0);border:4px solid var(--ink);
  box-shadow:0 0 0 3px #c8a24a}
.au-clock:before,.au-clock:after{content:"";position:absolute;left:50%;top:50%;background:var(--ink);transform-origin:0 0}
.au-clock:before{width:3px;height:13px;transform:translate(-50%,-100%)}
.au-clock:after{width:11px;height:3px;transform:translate(0,-50%)}
@media (max-height:976px){.au-clock{display:none}}
@media (max-height:619px){.au-lit{display:none}}

/* the auctioneer's gavel */
.au-rostrum .gavel{position:absolute;right:16px;top:-15px;width:28px;height:10px;
  background:#8a6a3a;border:3px solid var(--ink);transform:rotate(-16deg)}
.au-rostrum .gavel:after{content:"";position:absolute;left:-10px;top:-6px;width:14px;height:21px;
  background:#c8a24a;border:3px solid var(--ink)}

/* ---------- the bid desk ---------- */
.au-desk{font:14px/1.6 system-ui,sans-serif;color:#e8ecf2}
.au-desk h3{margin:0 0 5px;font:10px/1.5 var(--font-display);color:var(--gold)}
/* the desk carries the state too, so a short window that stands the wall board
   down loses the theatre and never the numbers */
.au-desk .strip{display:flex;justify-content:space-between;gap:12px;margin:0 0 9px;
  padding:8px 11px;background:#0b1016;border:3px solid var(--ink);
  box-shadow:inset 0 0 0 2px #0d1014;font:17px/1.35 'VT323',monospace;color:#79b98c}
.au-desk .strip b{color:#a8f0b6;font-weight:400}
.au-desk .sub{opacity:.82;font-size:13px;margin-bottom:9px}
.au-desk .amt{display:flex;gap:8px;align-items:center;margin-bottom:9px}
.au-desk input{flex:1;min-width:0;background:#0b1016;border:3px solid var(--ink);
  box-shadow:inset 0 0 0 2px #3a4148;color:#a8f0b6;font:20px/1 'VT323',monospace;padding:10px}
.au-desk .chip{min-height:44px;min-width:56px;background:#2a3036;color:#cbd3dd;
  border:3px solid var(--ink);box-shadow:0 0 0 2px #3a4148;cursor:pointer;font:8px/1 var(--font-display)}
.au-desk .go{width:100%;min-height:50px;border:3px solid var(--ink);box-shadow:0 0 0 3px #3a4148,0 4px 0 rgba(0,0,0,.3);
  background:linear-gradient(#ffd75e,#e0a713);color:#231a05;font:10px/1.5 var(--font-display);
  cursor:pointer;padding:0 10px}
.au-desk .go[disabled]{background:linear-gradient(#3a4148,#2a3036);color:#8b94a1;cursor:default;box-shadow:0 0 0 3px #3a4148}
.au-desk .echo{font:16px/1.4 'VT323',monospace;color:#a8f0b6;margin-top:9px}
.au-desk .echo.bad{color:var(--warn,#ff8f6b)}
.au-desk .bal{font-size:12px;opacity:.72;margin-top:6px}
.au-desk .fine{font-size:12px;opacity:.78;margin-top:8px;line-height:1.4}
/* The same line, carrying the bell when a lot is waiting for it. It replaces
   the rebate note rather than sitting under it, so this costs the desk card no
   height at all -- and the card is shared furniture that already overflows the
   ceiling at 560px, so a new line would have made an existing problem worse. */
.au-desk .fine.bell{opacity:1;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.au-desk .fine.bell b{color:#ffd75e;font-weight:400}
.au-desk .fine.bell button{font:inherit;cursor:pointer;padding:7px 12px;min-height:34px;
  background:linear-gradient(#e8c469,#a8823a);color:#2a2013;border:3px solid var(--ink);
  box-shadow:2px 2px 0 rgba(0,0,0,.35)}
.au-desk .fine.bell button:hover{filter:brightness(1.08)}
.au-desk .fine.bell button:disabled{filter:grayscale(.6);cursor:default}

/* ---------- the phone card ---------- */
.au-flat{background:linear-gradient(160deg,#2b323a,#1a1e24);border:4px solid var(--ink);
  box-shadow:0 0 0 3px #3a4148;padding:16px;color:#e8ecf2}
.au-flat .hd{display:flex;gap:14px;align-items:center}
.au-flat .hd img{width:104px;height:104px;image-rendering:pixelated;border:5px solid var(--gold);
  box-shadow:0 0 0 3px var(--ink);background:#0d1014}
.au-flat .ttl{font:9px/1.6 var(--font-display);color:var(--gold)}
.au-flat .cd{font:25px/1.25 'VT323',monospace;color:#a8f0b6}
@media (max-width:520px){.au-flat .hd img{width:84px;height:84px}}
`;
    document.head.appendChild(s);
  }

  // ------------------------------------------------------------------ core
  /// One batched read of everything the room shows.
  async function readAll(F, CFG, account) {
    const A = CFG.auction;
    const tok = CFG.auctionToken;
    const reqs = [
      { to: A, data: SEL.current },
      { to: tok, data: SEL.symbol },
      { to: tok, data: SEL.decimals },
      { to: tok, data: SEL.balanceOf + F.word(DEAD) },
    ];
    if (CFG.bonusPool) reqs.push({ to: tok, data: SEL.balanceOf + F.word(CFG.bonusPool) });
    const head = await F.callBatch(reqs);
    const lotId = head[0] ? Number(F.toBig(head[0])) : 0;
    const symbol = decodeStr(head[1]) || "TOKEN";
    const decimals = head[2] ? Number(F.toBig(head[2])) : 18;
    // THIS HOUSE's burn, not the token's graveyard. FRONG carried 5,501,467.83
    // at dEaD before we deployed; showing that as "BURNED" is a false claim of
    // the exact kind this project must never make.
    const deadNow = head[3] ? F.toBig(head[3]) : 0n;
    const base = BigInt(CFG.burnBaseline || 0);
    const burned = deadNow > base ? deadNow - base : 0n;
    const bonus = CFG.bonusPool && head[4] ? F.toBig(head[4]) : 0n;

    if (!lotId) return { lotId: 0, symbol, decimals, burned, bonus, lot: null, ladder: [], due: [] };

    const reqs2 = [
      { to: A, data: SEL.lotView + F.word(lotId) },
      { to: A, data: SEL.ladder + F.word(lotId) + F.word(8) },
      { to: A, data: SEL.recent + F.word(3) },
      { to: A, data: SEL.upcoming + F.word(3) },
      // Lots that have ENDED and are still waiting for the bell. current()
      // returns the LIVE lot, so once the next lot starts the ended one is
      // invisible to the whole room — and daily lots are back to back, so it
      // is invisible immediately. Without this read, settling depends entirely
      // on the keeper and a bidder has no way to collect what they won.
      { to: A, data: SEL.dueForSettle },
    ];
    // ⚠️ these two stay LAST: the indices below are positional
    if (account) {
      reqs2.push({ to: tok, data: SEL.balanceOf + F.word(account) });
      reqs2.push({ to: tok, data: SEL.allowance + F.word(account) + F.word(A) });
    }
    const r = await F.callBatch(reqs2);
    const lot = decodeLotView(r[0]);
    let art = 0;
    if (lot) {
      const a = await F.call(CFG.nft, SEL.artworkOf + F.word(lot.tokenId));
      art = a ? Number(F.toBig(a)) : 0;
    }
    return {
      lotId, symbol, decimals, burned, bonus, art,
      lot,
      ladder: decodeLadder(r[1]),
      settled: await readSettled(F, CFG, r[2]),
      upcoming: decodeUintArray(r[3]),
      due: decodeUintArray(r[4]),
      balance: account && r[5] ? F.toBig(r[5]) : 0n,
      allowance: account && r[6] ? F.toBig(r[6]) : 0n,
    };
  }

  /// The last few closed lots, for the wall. Two extra batched calls on a 20s
  /// poll, which is worth it: it is the only surface that shows the room has
  /// ever run. A lot that closed UNSOLD or CANCELLED is skipped, never drawn as
  /// a sale.
  async function readSettled(F, CFG, idsHex) {
    try {
      const ids = decodeUintArray(idsHex).slice(0, 3);
      if (!ids.length) return [];
      const views = await F.callBatch(ids.map((id) => ({ to: CFG.auction, data: SEL.lotView + F.word(id) })));
      const lots = views.map(decodeLotView).filter((v) => v && v.outcome === SOLD);
      if (!lots.length) return [];
      const arts = await F.callBatch(lots.map((v) => ({ to: CFG.nft, data: SEL.artworkOf + F.word(v.tokenId) })));
      return lots.map((v, i) => ({ ...v, art: arts[i] ? Number(F.toBig(arts[i])) : 0 }));
    } catch (e) { return []; }
  }

  function decodeUintArray(hex) {
    if (!hex || hex.length < 2 + 64 * 2) return [];
    const n = num(hex, 1);
    const out = [];
    for (let i = 0; i < n; i++) out.push(num(hex, 2 + i));
    return out;
  }

  function decodeStr(hex) {
    if (!hex || hex.length < 2 + 64 * 3) return null;
    try {
      const len = Number(BigInt("0x" + hex.slice(66, 130)));
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(parseInt(hex.slice(130 + i * 2, 132 + i * 2), 16));
      return s;
    } catch (e) { return null; }
  }

  /// "nothing is scheduled" is status 4 or a zero lot id — NEVER a bell.
  const nothingScheduled = (d) => !d || !d.lotId || !d.lot || d.lot.status === 4;

  // ------------------------------------------------------------------ room
  function room(ctx) {
    injectCss();
    const { el, px, roomLayer, CFG, deskCard } = ctx;
    const put = (node, css) => { px(node, css); roomLayer.appendChild(node); return node; };

    // ---- THE STAGE, on the solid wall past the entrance glazing (220-580).
    const stage = el("div", "au-stage");
    stage.innerHTML = `<i class="pelmet"></i><i class="drape"></i><i class="cone"></i>
      <div class="curtain">NEXT BROKER<br>TOMORROW</div>
      <i class="pool"></i><i class="dais"></i><div class="plate"></div>`;
    put(stage, { left: "665px" });

    // the rope stands in FRONT of it, on the floor
    put(el("div", "au-rope-post"), { left: "654px" });
    put(el("div", "au-rope-post"), { left: "1215px" });
    put(el("div", "au-rope-swag"), { left: "660px", width: "560px" });

    // ---- the seating: five chairs in the light from the windows, facing the
    // stage. Without them the room is a lobby with a curtain in it.
    [344, 404, 464, 524].forEach((x) => {
      const c = el("div", "au-chair");
      c.innerHTML = '<i class="back"></i><i class="seat"></i><i class="l"></i><i class="r"></i>';
      put(c, { left: x + "px" });
    });

    // ---- the catalogue easel, by the door, before you have walked in
    const easel = el("div", "au-easel");
    easel.innerHTML = `<div class="board"><b>TODAY'S LOT</b><u class="elot">&mdash;</u><span class="ewhen">hammer at five</span></div><i class="l"></i><i class="r"></i>`;
    put(easel, { left: "152px" });

    // ---- a pendant over the seating
    const pend = el("div", "au-pendant");
    pend.innerHTML = '<i class="cord"></i><i class="shade"></i><i class="glow"></i>';
    put(pend, { left: "385px" });

    // ---- THE TOTE BOARD, hung on the wall above the stage, inside its width
    const tote = el("div", "au-tote");
    tote.innerHTML = `<i class="bolt a"></i><i class="bolt b"></i><h4>THE AUCTION HOUSE</h4>
      <div class="scr">
        <div class="big">&mdash;</div>
        <div class="row"><span>TOP BID</span><b class="hi">&mdash;</b></div>
        <div class="row"><span>TO BEAT</span><b class="next">&mdash;</b></div>
        <div class="row"><span>TIME LEFT</span><b class="cd">&mdash;</b></div>
        <div class="lad"></div>
      </div>`;
    put(tote, { left: "685px", bottom: "calc(var(--ground-h) + 326px)" });

    // ---- THE BID DESK, further along: you walk to it to bid
    const desk = el("div", "au-desk");
    // ⚠️ KEEP THIS SHORT. deskCard grows with its content and is shared
    // furniture: at 451px it punched the ceiling and fell off the viewport at
    // 820px, where the mint desk it replaced (331px) only did at 560. Every
    // line added here costs a supported window height.
    desk.innerHTML = `<h3>THE BID DESK</h3>
      <div class="strip"><span>LOT <b class="dlot">&mdash;</b></span><span>TIME LEFT <b class="dcd">&mdash;</b></span></div>
      <div class="amt"><input type="text" inputmode="decimal" placeholder="&mdash;"><button class="chip min" type="button">MIN</button></div>
      <button class="go" disabled>CHECKING&hellip;</button>
      <div class="echo"></div>
      <div class="fine"></div>
      <div class="au-counters"><span><b>BURNED</b> <u class="burn">&mdash;</u></span>
        <span><b>BONUS POOL</b> <u class="bonus">&mdash;</u></span></div>`;
    deskCard(1520, 560, desk);

    // ---- the house notice, on the long wall between the desk and the hammers
    const rules = el("div", "au-notice");
    rules.innerHTML = `<b>HOUSE RULES</b><div class="rows">`
      + `<u>One lot a day</u><u>+10% a bid</u>`
      + `<u>Outbid pays 105%</u><u>Late bid, +5 min</u></div>`;
    put(rules, { left: "2144px", bottom: "calc(var(--ground-h) + 196px)" });

    // ---- the wall of past hammers, on the far solid wall
    const sold = el("div", "au-sold");
    sold.innerHTML = `<b>RECENT HAMMERS</b><div class="row"><div class="none">no lots have closed yet</div></div>`;
    put(sold, { left: "2144px", bottom: "calc(var(--ground-h) + 366px)" });

    // ---- DECOR, selected by CFG.decor so options can be compared in the same
    // slot before one is chosen. Section E's floor (centre 1800) is the slot.
    const want = String(CFG.decor == null ? "panel,queue" : CFG.decor).split(",").map((x) => x.trim());
    const on = (k) => want.indexOf(k) !== -1;

    if (on("panel")) {
      // SOLID WALL RUNS ONLY: the glazing reaches the floor, and panelling
      // behind glass reads as a mistake. Inserted right after .room-wall so it
      // sits behind every piece of furniture rather than on top of it.
      const anchor = roomLayer.querySelector(".room-wall");
      for (const [x, w] of [[0, 280], [640, 610], [1490, 1270]]) {
        const pn = el("div", "au-panel");
        px(pn, { left: x + "px", width: w + "px" });
        if (anchor && anchor.nextSibling) roomLayer.insertBefore(pn, anchor.nextSibling);
        else roomLayer.appendChild(pn);
      }
    }
    if (on("queue")) {
      const q = el("div", "au-queue");
      q.innerHTML = ["a", "b", "c"].map((k, i) =>
        `<div class="au-crate ${k}"><i class="tl"></i><i class="br"></i>`
        + `<b>LOT<br><u class="n">&mdash;</u></b>`
        + `<span class="stamp">${i === 1 ? "FRAGILE" : "THIS WAY UP"}</span></div>`).join("");
      put(q, { left: "2182px" });                       // 3x96 + 2x14 = 316, centre 2340
      const por = el("div", "au-porter");
      por.innerHTML = '<i class="trolley"></i><i class="load"></i><i class="body"></i><i class="head"></i><i class="cap"></i>';
      put(por, { left: "2520px" });
      // the paperwork and the tool that opens them
      const clip = el("div", "au-clip");
      clip.innerHTML = "<i></i><i></i><i></i>";
      put(clip, { left: "2296px" });
      put(el("div", "au-bar"), { left: "2492px" });
    }
    // the wall over the bid desk
    const view = el("div", "au-view");
    view.innerHTML = '<u></u>'
      + [[10, 34, 58], [50, 30, 40], [86, 26, 70], [118, 34, 50], [156, 28, 62],
         [190, 36, 44], [232, 26, 66], [264, 30, 36]]
        .map(([x, w, h]) => `<i style="left:${x}px;width:${w}px;height:${h}px"></i>`).join("");
    put(view, { left: "1650px", bottom: "calc(var(--ground-h) + 552px)" });   // centre 1800
    const vplate = el("div", "au-viewplate");
    vplate.textContent = "NEW YORK \u00b7 FIVE";
    put(vplate, { left: "1725px", bottom: "calc(var(--ground-h) + 524px)" }); // clears the desk top at +515
    for (const x of [1568, 1998]) {                                           // 1800 +/- 215
      const sc = el("div", "au-sconce");
      sc.innerHTML = "<em></em><u></u><i></i><b></b>";
      put(sc, { left: x + "px", bottom: "calc(var(--ground-h) + 560px)" });
    }

    if (on("queue")) {
      // Behind the furniture but IN FRONT of the floor strip: the strip is a
      // full-height box, so anchoring on the panelling paints the runner out.
      const anchor2 = roomLayer.querySelector(".room-floorstrip") || roomLayer.querySelector(".room-wall");
      const run = el("div", "au-runner");
      run.innerHTML = '<u class="l"></u><u class="r"></u>';
      px(run, { left: "150px", width: "1320px" });      // the door through to the rostrum
      if (anchor2 && anchor2.nextSibling) roomLayer.insertBefore(run, anchor2.nextSibling);
      else roomLayer.appendChild(run);

      // section E's floor: only ever short things here, because the bid desk
      // floats above it and comes down to meet the floor on a short window
      const cats = el("div", "au-cats");
      cats.innerHTML = "<i></i><i></i><i></i>";
      put(cats, { left: "1662px" });                    // pushed up against the stool

      const stool = el("div", "au-stool");
      stool.innerHTML = "<u></u><i></i><i></i><s></s>";
      put(stool, { left: "1600px" });                   // stool + catalogues = one group

      const parcel = el("div", "au-parcel");
      parcel.innerHTML = "<b>SOLD</b>";
      put(parcel, { left: "1900px" });                  // parcel + coil = the second group

      const paddles = el("div", "au-paddles");
      paddles.innerHTML = "<i></i><i></i><i></i><u></u>";
      put(paddles, { left: "1508px" });                 // tucked in by the rostrum

      const coil = el("div", "au-coil");
      coil.innerHTML = "<i></i><i></i><i></i>";
      put(coil, { left: "1962px" });                    // set down against the parcel
      // Two groups and one leaning broom, with the gaps deliberately unequal:
      //   1508 paddles | 1600 stool+catalogues | ..164.. | 1900 parcel+coil
      //   | ..134.. | 2140 broom, leaning on the crates at 2182

      const broom = el("div", "au-broom");
      broom.innerHTML = "<u></u><i></i>";
      put(broom, { left: "2140px" });                   // tipped against the crate stack

      const quiet = el("div", "au-quiet");
      quiet.innerHTML = '<div class="board"><b>QUIET<br>PLEASE</b></div><i class="l"></i><i class="r"></i>';
      put(quiet, { left: "583px" });                    // 64 wide into the 78px gap at 576..654
    }
    if (on("phones")) {
      const ph = el("div", "au-phones");
      ph.innerHTML = [1, 2, 3].map((i) =>
        `<div class="au-booth${i === 1 ? " on" : ""}"><i class="set"></i><i class="cord"></i><u>LINE ${i}</u><i class="lamp"></i></div>`).join("");
      put(ph, { left: "2172px" });                      // 3x104 + 2x12 = 336, centre 2340
    }
    if (on("settle")) {
      const st = el("div", "au-settle");
      st.innerHTML = '<i class="frame"></i><b>SETTLEMENT</b><i class="bars"></i>'
        + '<i class="clerk"></i><i class="ledger"></i><i class="sill"></i>';
      put(st, { left: "2190px" });                      // 300 wide, centre 2340
    }

    const clock = el("div", "au-clock");
    clock.innerHTML = '<div class="ticks">'
      + Array.from({ length: 12 }, (_, k) =>
          `<s class="${k % 3 === 0 ? "mj" : ""}" style="transform:rotate(${k * 30}deg)"></s>`).join("")
      + '</div><i class="m"></i><i class="h"></i><b></b>';
    put(clock, {
      left: "898px",                                          // 84 wide, centre 940
      bottom: "calc((var(--ground-h) + 100% + 441px) / 2)",   // centred by VISUAL box, rings included
    });

    // the house emblem takes the wall the clock left, above RECENT HAMMERS
    const crest = el("div", "au-crest");
    crest.innerHTML = '<u></u><i class="a"></i><i class="b"></i>';
    put(crest, { left: "2274px", bottom: "calc(var(--ground-h) + 600px)" });   // 132 wide, centre 2340

    const mount = { stage, tote, counters: desk, sold, desk, root: roomLayer };
    start(ctx, mount, false);
    return mount;
  }

  // ------------------------------------------------------------- flat card
  function flatCard(ctx) {
    injectCss();
    const { el, host, F, CFG } = ctx;
    const card = el("div", "au-flat");
    card.innerHTML = `<div class="hd"><img alt=""><div>
        <div style="font:700 11px/1.4 'Press Start 2P',monospace;color:#ffd666">ON STAGE TODAY</div>
        <div class="who" style="margin:4px 0">—</div>
        <div class="cd">—</div></div></div>
      <div class="au-desk"><div class="amt"><input type="text" inputmode="decimal" placeholder="—"><button class="chip min" type="button">MIN</button></div>
      <button class="go" disabled>CHECKING…</button>
      <div class="echo"></div>
      <div class="bal"></div></div>`;
    host.appendChild(card);
    const mount = { card, tote: card, desk: card.querySelector(".au-desk"), stage: null, root: host };
    start(ctx, mount, true);
    return mount;
  }

  // ------------------------------------------------------- the live machine
  function start(ctx, mount, flat) {
    // txFlow is used three times below (approve, bid, ring the bell) and was
    // NOT in this list, so every one of those clicks threw ReferenceError. The
    // catch swallowed it, so the desk did nothing, silently, always.
    const { F, CFG, state, txFlow } = ctx;
    let data = null, timer = null, tick = null, busy = false;
    // lotView hands back block.timestamp; hold the offset so the hammer counts
    // down against the CHAIN and not against the viewer's device clock. Inside
    // the last five minutes a skewed clock is the difference between bidding
    // and not.
    let skew = 0;

    const q = (sel) => (flat ? mount.card : mount.root).querySelector(sel) || mount.desk.querySelector(sel);
    const deskEl = mount.desk;
    const goBtn = deskEl.querySelector(".go");
    const input = deskEl.querySelector("input");
    const minChip = deskEl.querySelector(".chip.min");
    const fineEl = deskEl.querySelector(".fine");
    let bellBusy = false;

    /// A lot that has ENDED and not been rung. current() returns the LIVE lot,
    /// so the room cannot see this one at all once the next day's lot starts —
    /// and daily lots are back to back, so that is immediately. Until this
    /// existed, the winner's broker and every bidder's escrow sat in the house
    /// until the keeper woke up, with nothing a person could do about it.
    function paintFine(d) {
      const dueId = d && d.due && d.due.find((x) => x !== (d.lotId || 0));
      if (!dueId) {
        fineEl.className = "fine";
        fineEl.textContent = "OUTBID? 105% BACK \u2014 PAID BY THE NEXT BID";
        return;
      }
      if (fineEl.dataset.due === String(dueId) && bellBusy) return;
      fineEl.dataset.due = String(dueId);
      fineEl.className = "fine bell";
      fineEl.innerHTML = `<span>LOT <b>${dueId}</b> IS WAITING</span>`;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "RING THE BELL";
      b.addEventListener("click", async () => {
        if (bellBusy) return;
        bellBusy = true;
        b.disabled = true;
        const me = state && state.account;
        if (!me) { bellBusy = false; b.disabled = false; if (ctx.connect) ctx.connect(); return; }
        try {
          await txFlow("ring the bell",
            () => F.send(CFG.auction, SEL.settle + F.word(dueId), 0n, me),
            async () => { await refresh(); });
        } catch (e) {
          console.error("[auction] bell:", e);
          if (ctx.toast) ctx.toast("that did not go through — try again", false);
        } finally { bellBusy = false; b.disabled = false; }
      });
      fineEl.appendChild(b);
    }

    const alive = () => document.body.contains(deskEl);

    const chainNow = () => Math.floor(Date.now() / 1000) + skew;

    function paintCountdown() {
      if (!data || nothingScheduled(data)) return;
      const left = Math.max(0, data.lot.endsAt - chainNow());
      const word = data.lot.status === 3 ? outcomeWord(data.lot.outcome) : clock(left);
      const cd = (flat ? mount.card : mount.tote).querySelector(".cd");
      if (cd) cd.textContent = word;
      // the desk repeats it, so standing the wall board down on a short window
      // costs the theatre and never the numbers
      const dcd = mount.desk && mount.desk.querySelector(".dcd");
      if (dcd) dcd.textContent = word;
      if (!flat) mount.tote.classList.toggle("hot", left > 0 && left <= 300);
    }

    /// status 3 is three different endings. Saying SOLD for all of them tells a
    /// holder his broker found a buyer when nobody bid at all.
    function outcomeWord(o) {
      return o === UNSOLD ? "NO BIDS" : o === CANCELLED ? "PULLED" : "SOLD";
    }

    function paint() {
      if (!alive()) return stop();
      const d = data;
      const sym = d ? d.symbol : "";
      const dec = d ? d.decimals : 18;
      const symEl = deskEl.querySelector(".sym");
      if (symEl) symEl.textContent = sym;

      if (!flat) {
        mount.counters.querySelector(".burn").textContent = d ? fmtUnits(d.burned, dec, 0) + " " + sym : "—";
        mount.counters.querySelector(".bonus").textContent = d ? fmtUnits(d.bonus, dec, 0) + " " + sym : "—";
        // the crates say which lots are actually queued, not a decoration
        const crates = mount.root.querySelectorAll(".au-crate .n");
        const up = (d && d.upcoming) || [];
        crates.forEach((n, i) => { n.textContent = up[i] ? String(up[i]) : "\u2014"; });
        const row = mount.sold.querySelector(".row");
        const past = (d && d.settled) || [];
        row.innerHTML = past.length
          ? past.map((v) => `<div class="f"><img src="${CFG.imageBase}/${v.art}.png" alt=""><u>${fmtUnits(v.highest, dec, 0)}</u></div>`).join("")
          : `<div class="none">no lots have closed yet</div>`;
      }

      if (nothingScheduled(d)) {
        if (!flat) {
          mount.tote.querySelector(".big").textContent = "NOTHING ON STAGE";
          mount.tote.querySelector(".hi").textContent = "—";
          mount.tote.querySelector(".next").textContent = "—";
          mount.tote.querySelector(".cd").textContent = "—";
          mount.tote.querySelector(".lad").innerHTML = "";
          mount.stage.querySelector(".curtain").style.display = "";
          const f = mount.stage.querySelector(".frame");
          if (f) f.remove();
          mount.stage.querySelector(".plate").textContent = "";
        } else {
          mount.card.querySelector(".who").textContent = "nothing scheduled";
        }
        const e0 = mount.root && mount.root.querySelector(".au-easel .elot");
        if (e0) e0.textContent = "\u2014";
        goBtn.disabled = true;
        goBtn.textContent = "NOTHING SCHEDULED";
        paintFine(d);   // an ended lot can still be waiting, and often is
        return;
      }

      const lot = d.lot;
      const art = d.art || 0;
      // stage art
      if (!flat) {
        mount.stage.querySelector(".curtain").style.display = "none";
        let fr = mount.stage.querySelector(".frame");
        if (!fr) {
          fr = document.createElement("div");
          fr.className = "frame";
          fr.innerHTML = "<img alt=''>";
          mount.stage.insertBefore(fr, mount.stage.querySelector(".plate"));
        }
        const img = fr.querySelector("img");
        const want = `${CFG.imageBase}/${art}.png`;
        if (art && img.getAttribute("src") !== want) img.setAttribute("src", want);
        mount.stage.querySelector(".plate").textContent = `BROKER #${art} · CLOCKED OUT`;
        mount.tote.querySelector(".big").textContent = `LOT ${lot.lotId}`;
        mount.tote.querySelector(".hi").textContent =
          lot.highest > 0n ? fmtUnits(lot.highest, dec, 0) + " " + sym : "NO BIDS YET";
        // TO BEAT rounds UP. fmtUnits truncates, so a 4428.9025 minimum printed
        // as "4,428.90" is a number the desk would then refuse.
        mount.tote.querySelector(".next").textContent = ceilUnits(lot.minBid, dec, 0) + " " + sym;
        const lad = mount.tote.querySelector(".lad");
        // ladder() already returns NEWEST FIRST (out[i] = b[len-1-i]), so the
        // leader is index 0. Reversing it here put the gold `.top` highlight on
        // the OLDEST, lowest bid and rendered the actual leader dim at the
        // bottom (peer audit 2026-08-30).
        // The standings always show four slots. Reserving the space keeps the
        // board one height (the clock above it is centred on that), and empty
        // slots read as room for more bids rather than as dead screen.
        const rows = d.ladder.slice(0, 2).map((b, i) =>
          `<div class="${i === 0 ? "top" : ""}"><span>${short(b.bidder)}</span><span>${fmtUnits(b.amount, dec, 2)}</span></div>`);
        while (rows.length < 2) rows.push('<div class="ph"><span>&mdash;</span><span>&mdash;</span></div>');
        lad.innerHTML = rows.join("");
      } else {
        mount.card.querySelector(".who").textContent = `Lot ${lot.lotId} · Broker #${art}`;
        const img = mount.card.querySelector("img");
        const want = `${CFG.imageBase}/${art}.png`;
        if (art && img.getAttribute("src") !== want) img.setAttribute("src", want);
      }
      paintCountdown();
      const dlot = deskEl.querySelector(".dlot");
      if (dlot) dlot.textContent = String(lot.lotId);
      const elot = mount.root.querySelector(".au-easel .elot");
      if (elot) elot.textContent = art ? "#" + art : "\u2014";

      // ---- the button state machine
      const me = state && state.account;
      const leading = me && lot.bidder && me.toLowerCase() === lot.bidder.toLowerCase();
      if (!input.value || input.dataset.auto === "1") {
        input.value = exactUnits(lot.minBid, dec); // machine-readable, never fmtUnits
        input.dataset.auto = "1";
      }


      paintEcho();
      paintFine(d);
      // a poll landing while the wallet is open must not repaint over whatever
      // txFlow put on the button, nor re-enable it mid-signature
      if (busy) return;
      goBtn.disabled = false;
      if (!me) { goBtn.textContent = "CONNECT"; return; }
      if (lot.status === 3) {
        goBtn.textContent = outcomeWord(lot.outcome);
        goBtn.disabled = true;
        return;
      }
      if (lot.status === 2) {
        // settle() on a bidless lot takes the l.bids == 0 branch: it marks the
        // lot UNSOLD and hands the broker back to the seller. That is a real
        // and useful action, but it is not a hammer, so it must not promise one.
        goBtn.textContent = lot.bids > 0 ? "RING THE BELL" : "CLOSE THIS LOT";
        return;
      }
      if (lot.status === 0) { goBtn.textContent = "NOT OPEN YET"; goBtn.disabled = true; return; }
      if (leading) { goBtn.textContent = "YOU LEAD"; goBtn.disabled = true; return; }
      if (d.allowance < lot.minBid) { goBtn.textContent = `APPROVE ${sym}`; return; }
      goBtn.textContent = `BID ${fmtUnits(lot.minBid, dec, 2)}`;
    }

    async function refresh() {
      if (!alive()) return stop();
      try {
        const prev = data;
        data = await readAll(F, CFG, state && state.account);
        // OUTBID: the leader moved away from me since the last poll
        // record the chain's own clock from this read
        if (data.lot && data.lot.nowTs) skew = data.lot.nowTs - Math.floor(Date.now() / 1000);
        // ☠️ ONLY diff two reads of the SAME lot. current() rolls to the next lot
        // the moment one finishes, so an ungated comparison fires across that
        // boundary: the winner of lot 5 sees lot 6's empty bidder and is told
        // "outbid, X came back to you" — false, at the best moment of his day,
        // quoting a rebate he never got. The day-long jump in endsAt likewise
        // announced a late bid on a lot nobody had bid on.
        if (prev && prev.lot && data.lot && prev.lotId === data.lotId && state && state.account) {
          const meL = state.account.toLowerCase();
          const was = prev.lot.bidder && prev.lot.bidder.toLowerCase() === meL;
          const now = data.lot.bidder && data.lot.bidder.toLowerCase() === meL;
          if (was && !now && ctx.toast) {
            const back = (prev.lot.highest * 10500n) / 10000n;
            ctx.toast(`outbid — ${fmtUnits(back, data.decimals, 2)} ${data.symbol} came back to you`);
          }
          if (data.lot.endsAt > prev.lot.endsAt && ctx.toast) ctx.toast("+5 min — someone bid late");
        }
        paint();
      } catch (e) { /* a poll may fail; the next one repaints */ }
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (!alive()) return stop();
      if (document.hidden) return; // resumed by visibilitychange
      let ms = POLL_IDLE;
      if (data && !nothingScheduled(data)) {
        const left = data.lot.endsAt - Math.floor(Date.now() / 1000);
        if (left > 0 && left <= HOT_WINDOW) ms = POLL_HOT;
      }
      timer = setTimeout(refresh, ms);
    }

    function stop() {
      clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
    }
    function onVis() { if (!document.hidden) refresh(); }
    document.addEventListener("visibilitychange", onVis);
    tick = setInterval(() => { if (alive()) paintCountdown(); else stop(); }, 1000);

    /// Read back, in words, the number that will actually be signed.
    ///
    /// parseAmount has to resolve genuinely ambiguous input, and every rule it
    /// could use is wrong for somebody: a lone comma is a decimal point here, so
    /// an en-US whale typing "5000,000" for five million gets 5000 — which at
    /// the reserve is exactly minBid, so it is ACCEPTED and he leads the auction
    /// at a thousandth of what he meant. No parser setting removes that class of
    /// mistake; showing him the parsed number before he signs does.
    /// (Residual raised by a peer audit 2026-08-30 on the lone-comma fix.)
    function paintEcho() {
      const e = deskEl.querySelector(".echo");
      if (!e) return;
      if (!data || nothingScheduled(data)) { e.textContent = ""; return; }
      const raw = input.value.trim();
      if (!raw) { e.textContent = ""; e.className = "echo"; return; }
      const amt = parseAmount(raw, data.decimals);
      if (amt === null) {
        e.className = "echo bad";
        e.textContent = "NOT A NUMBER";
        return;
      }
      const under = amt < data.lot.minBid;
      e.className = "echo" + (under ? " bad" : "");
      const bal = (state && state.account)
        ? ` \u00b7 YOU HAVE ${fmtUnits(data.balance, data.decimals, 0)}` : "";
      // the minimum stays EXACT here: this is the number they have to type
      e.textContent = under
        ? `TOO LOW \u00b7 MIN ${exactUnits(data.lot.minBid, data.decimals)}`
        : `YOUR BID ${exactUnits(amt, data.decimals)} ${data.symbol}${bal}`;
    }

    minChip.addEventListener("click", () => {
      if (data && !nothingScheduled(data)) {
        input.value = exactUnits(data.lot.minBid, data.decimals);
        input.dataset.auto = "1";
        paintEcho();
      }
    });
    input.addEventListener("input", () => { input.dataset.auto = "0"; paintEcho(); });

    goBtn.addEventListener("click", async () => {
      if (busy || goBtn.disabled) return;
      const d = data;
      if (!d || nothingScheduled(d)) return;
      const me = state && state.account;
      if (!me) { if (ctx.connect) ctx.connect(); return; }
      busy = true;
      const label = goBtn.textContent;
      try {
        if (d.lot.status === 2) {
          await txFlow("ring the bell",
            () => F.send(CFG.auction, SEL.settle + F.word(d.lotId), 0n, me),
            async () => { await refresh(); });
        } else if (d.allowance < d.lot.minBid) {
          await txFlow(`approve ${d.symbol}`,
            () => F.send(CFG.auctionToken, SEL.approve + F.word(CFG.auction) + F.word((1n << 256n) - 1n), 0n, me),
            async () => { await refresh(); });
        } else {
          const amt = parseAmount(input.value, d.decimals);
          if (amt === null || amt < d.lot.minBid) {
            if (ctx.toast) ctx.toast(`the minimum is ${fmtUnits(d.lot.minBid, d.decimals, 2)} ${d.symbol}`);
          } else {
            await txFlow("place your bid",
              () => F.send(CFG.auction, SEL.bid + F.word(d.lotId) + F.word(amt), 0n, me),
              async () => { input.dataset.auto = "1"; await refresh(); });
          }
        }
      } catch (e) {
        // the sequencer is FCFS: two identical minimum bids in the same second
        // and the second one loses. Re-quote rather than blame the user.
        // The chain returns the SELECTOR, not the name: eth_call bid(1,1)
        // against the live deployment gives "custom error 0xa0d26eb6". Whether
        // it ever becomes the word "BidTooLow" depends on the wallet decoding
        // it, which the site cannot rely on. Matching only the name meant the
        // one arm that exists for two people bidding the same minimum in the
        // same second — the most likely contested-auction failure — usually
        // fell through to the generic message. level.js:114 has matched name
        // OR selector for every other custom error on this site since the
        // mint; the desk was the one place it was not applied.
        if (/BidTooLow|0xa0d26eb6/i.test(String(e && e.message))) {
          await refresh();
          if (ctx.toast) ctx.toast(`someone bid first — the new minimum is ${data ? fmtUnits(data.lot.minBid, data.decimals, 2) : "higher"}`);
        } else {
          // ANYTHING ELSE MUST BE VISIBLE. This arm used to be absent, so a
          // ReferenceError on the very first line of the bid path produced no
          // toast, no console entry and no transaction — a dead button that
          // looked exactly like a working one.
          console.error("[auction] bid desk:", e);
          if (ctx.toast) ctx.toast("that did not go through — try again", false);
        }
      } finally {
        busy = false;
        if (goBtn.textContent === label) paint();
      }
    });

    refresh();
    return { refresh };
  }

  /// Strict, and deliberately biased toward REFUSING rather than guessing high:
  /// every ambiguous reading resolves to a SMALLER number, which the minBid
  /// check then rejects. A misread can cost a bidder a retry; it can never sign
  /// them up for more than they meant to pay.
  /// ⚠️ A LONE COMMA IS A DECIMAL POINT HERE, not grouping. That looks wrong on
  /// instinct and it is deliberate; see the asymmetry note below. The echo line
  /// under the button reads the parsed number back so a misread is visible.
  ///   "8,857.80"  both separators -> the comma is grouping, strip it
  ///   "8857,80"   one comma, no dot -> the comma is a decimal point (es-AR, de-DE)
  ///   "8,857"     one comma, no dot -> read as 8.857, which is below any
  ///               minimum and is refused. The prefill is exact, so hand-typing
  ///               grouping is the rare path.
  /// Multi-comma input is only grouping if it IS grouping. "2,500,5" stripped
  /// to 25005 is ten times the comma-decimal reading of 2500.5, and "1,000,50"
  /// is a hundred times — the one direction that can sign a bidder up for more
  /// than they meant, which is the only direction that matters here. So every
  /// group after the first must be exactly three digits, or the number is
  /// refused outright. (Audit F5, 2026-08-31.)
  const groupingIsSane = (intPart) => {
    const parts = intPart.split(",");
    if (parts.length === 1) return true;
    if (!parts[0].length || parts[0].length > 3) return false;
    return parts.slice(1).every((g) => g.length === 3);
  };

  function parseAmount(str, dec) {
    let t = String(str || "").replace(/[\s_\u00a0\u202f]/g, "").trim();
    const commas = (t.match(/,/g) || []).length;
    if (t.includes(".")) {
      if (!groupingIsSane(t.slice(0, t.indexOf(".")))) return null;
      t = t.replace(/,/g, "");
    } else if (commas === 1) t = t.replace(",", ".");
    else if (commas > 1) {
      if (!groupingIsSane(t)) return null;
      t = t.replace(/,/g, "");
    }
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    const [i, f = ""] = t.split(".");
    const frac = (f + "0".repeat(dec)).slice(0, dec);
    try { return BigInt(i) * 10n ** BigInt(dec) + BigInt(frac || "0"); } catch (e) { return null; }
  }

  window.__AUCTION = { room, flatCard, decodeLotView, decodeLadder, parseAmount, nothingScheduled, fmtUnits, exactUnits };
})();
