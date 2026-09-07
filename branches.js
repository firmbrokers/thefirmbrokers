/* ===========================================================================
   THE BRANCH OFFICES — every daily pot the firm runs, in every token.

   Wired like auction.js and cashcat.js: this file registers window.__BRANCHES
   and level.js calls it guarded, so a missing or broken file leaves the tower
   as the Auction House it was. Three surfaces:

     the street  paintWall()  the tower's LED wall becomes THE BRANCH BOARD
     the hall    hall(ctx)    the ground floor: the split-flap board, one
                              counter per branch, OPEN A BRANCH, the elevator
     the lift    elevator()   the car on either floor; ride() goes between the
                              hall (G) and the Auction House (2)

   One reader feeds all of them (and branches-flat.js on the phone): read()
   polls every pool in CFG.branches on one cadence and every subscriber gets
   the same list. Amounts are BigInt wei; times are CHAIN seconds (the round's
   own nowTs, never Date.now — the rpc replicas lag each other by ~25 blocks
   and a device clock made the pool page's countdown lie by minutes).

   ⚠️ Everything in the hall is anchored to `--ground-h`, never to `top`. That
   variable steps 220 -> 180 -> 120 as the viewport shortens, and a piece hung
   off the ceiling drifts away from every piece standing on the floor.
   =========================================================================== */
(function () {
  "use strict";
  const CFG = window.FIRM_CFG || {};
  const F = () => window.Firm;

  // ------------------------------------------------------------ the list
  const list = () => (Array.isArray(CFG.branches) ? CFG.branches : []).filter((b) => b && b.pool && b.token);
  const live = () => list().length > 0;

  // ------------------------------------------------------------ the chain
  // OfficePool selectors (verified against pool.js and cast, 2026-09-06)
  const SEL = {
    currentRound: "0x8a19c8bc", roundView: "0xdb5b4737", roundCount: "0x127f0b3f",
    codeOf: "0x2cfc2716", decimals: "0x313ce567",
  };
  const OPEN = 1, DRAWN = 2;
  const word = (v) => BigInt(v).toString(16).padStart(64, "0");
  const wordAt = (hex, i) => (hex && hex.length >= 2 + 64 * (i + 1)) ? BigInt("0x" + hex.slice(2 + 64 * i, 2 + 64 * (i + 1))) : 0n;
  const addrAt = (hex, i) => (hex && hex.length >= 2 + 64 * (i + 1)) ? "0x" + hex.slice(2 + 64 * i + 24, 2 + 64 * (i + 1)) : "0x0000000000000000000000000000000000000000";
  const ZERO = "0x0000000000000000000000000000000000000000";
  /// Round is a static struct, so roundView's words sit in place:
  ///   0 closesAt · 1 beaconRound · 2 state · 3 playerCount · 4 deposits ·
  ///   5 totalWeight · 6 pot · 7 seed · 8 accDivPerUnit · 9 refundWinner ·
  ///   10 jackpotWinner · 11 refundPaid · 12 jackpotPaid · 13 rand · 14 minDeposit
  function decodeRound(hex) {
    if (!hex || hex.length < 2 + 64 * 15) return null;
    return {
      closesAt: Number(wordAt(hex, 0)), beaconRound: Number(wordAt(hex, 1)), state: Number(wordAt(hex, 2)),
      players: Number(wordAt(hex, 3)), deposits: wordAt(hex, 4), pot: wordAt(hex, 6), seed: wordAt(hex, 7),
      refundWinner: addrAt(hex, 9), jackpotWinner: addrAt(hex, 10), refundPaid: wordAt(hex, 11), jackpotPaid: wordAt(hex, 12),
      rand: hex.slice(2 + 64 * 13, 2 + 64 * 14), minDeposit: wordAt(hex, 14),
    };
  }
  function decodeCode(hex) {
    if (!hex || hex.length < 66) return "";
    let s = "";
    for (let i = 2; i < 66; i += 2) { const c = parseInt(hex.slice(i, i + 2), 16); if (!c) break; s += String.fromCharCode(c); }
    return /^[a-z0-9]{1,20}$/.test(s) ? s : "";
  }

  const decimalsOf = {};
  let snapshot = null, lastRead = 0, timer = null, reading = null;
  const subs = new Set();

  /// One poll of every branch. Batch 1: the open round + the round count (+
  /// decimals the first time). Batch 2: the open round's view, the latest
  /// round's view, and the one before it (the last DRAWN one is whichever of
  /// those two says so; between the bell and the draw the latest is CLOSED and
  /// the pot is still in it). Batch 3: the jackpot winner's vanity code.
  async function read() {
    const f = F(), bs = list();
    if (!f || !bs.length) return [];
    const q1 = [];
    for (const b of bs) {
      q1.push({ to: b.pool, data: SEL.currentRound }, { to: b.pool, data: SEL.roundCount });
      if (decimalsOf[b.token] == null) q1.push({ to: b.token, data: SEL.decimals });
    }
    const r1 = await f.callBatch(q1);
    const heads = [];
    let k = 0;
    for (const b of bs) {
      const cur = r1[k++], cnt = r1[k++];
      if (decimalsOf[b.token] == null) { const d = r1[k++]; decimalsOf[b.token] = d && d.length >= 66 ? Number(wordAt(d, 0)) || 18 : 18; }
      heads.push({
        b, id: Number(wordAt(cur, 0)), closesAt: Number(wordAt(cur, 1)), open: wordAt(cur, 2) === 1n, nowTs: Number(wordAt(cur, 3)),
        count: Number(wordAt(cnt, 0)),
      });
    }
    const q2 = [];
    for (const h of heads) {
      h.q = [];
      const want = new Set();
      if (h.open) want.add(h.id);
      if (h.count) want.add(h.count);
      if (h.count > 1) want.add(h.count - 1);
      for (const id of want) { h.q.push(id); q2.push({ to: h.b.pool, data: SEL.roundView + word(id) }); }
    }
    const r2 = q2.length ? await f.callBatch(q2) : [];
    k = 0;
    const out = [];
    for (const h of heads) {
      const views = {};
      for (const id of h.q) views[id] = decodeRound(r2[k++]);
      const cur = h.open ? views[h.id] : null;
      const latest = h.count ? views[h.count] : null;
      let last = null, drawing = null;
      for (const id of [h.count, h.count - 1]) {
        const v = views[id];
        if (!v) continue;
        if (v.state === DRAWN && !last) last = Object.assign({ id }, v);
        else if (v.state === OPEN && id === h.count && !h.open && v.closesAt <= h.nowTs && v.players > 0) drawing = Object.assign({ id }, v);
      }
      out.push({
        slug: h.b.slug, name: h.b.name, short: h.b.short || h.b.name, symbol: h.b.symbol, decimals: decimalsOf[h.b.token] || 18,
        token: h.b.token, pool: h.b.pool, block: h.b.block || 0, page: h.b.page || "", boost: !!h.b.boost, mark: h.b.mark || "",
        id: h.open ? h.id : 0, open: h.open, closesAt: h.closesAt, nowTs: h.nowTs, readAt: Date.now(),
        pot: cur ? cur.pot : 0n, players: cur ? cur.players : 0, deposits: cur ? cur.deposits : 0n,
        minDeposit: cur ? cur.minDeposit : (latest ? latest.minDeposit : 0n),
        drawing, last, rounds: h.count,
      });
    }
    const q3 = out.filter((o) => o.last && o.last.jackpotWinner !== ZERO).map((o) => ({ to: o.pool, data: SEL.codeOf + word(o.last.jackpotWinner) }));
    if (q3.length) {
      const r3 = await f.callBatch(q3);
      let j = 0;
      for (const o of out) if (o.last && o.last.jackpotWinner !== ZERO) o.last.winnerCode = decodeCode(r3[j++]);
    }
    return out;
  }

  /// the shared poll: one in flight at a time, every subscriber sees the same
  /// list, and a failed read leaves the last snapshot standing
  function poll() {
    if (reading) return reading;
    reading = read().then((l) => { if (l.length) { snapshot = l; lastRead = Date.now(); } return snapshot; })
      .catch(() => snapshot)
      .then((s) => { reading = null; if (s) for (const fn of Array.from(subs)) { try { fn(s); } catch (e) { /* one bad listener must not stop the rest */ } } return s; });
    return reading;
  }
  function start() {
    if (timer || !live()) return;
    poll();
    timer = setInterval(poll, 30000);
  }
  function subscribe(fn) {
    subs.add(fn);
    start();
    if (snapshot) { try { fn(snapshot); } catch (e) { /* as above */ } }
    return () => subs.delete(fn);
  }

  // ------------------------------------------------------------ formatting
  const units = (v, dec) => Number(v) / Math.pow(10, dec || 18);
  /// "1.73M" · "462k" · "9,325" — the board's flaps hold nine characters
  function fmtShort(v, dec) {
    const n = units(v, dec);
    const f = (x, d) => x.toLocaleString("en-US", { maximumFractionDigits: d });
    if (n >= 1e9) return f(n / 1e9, 2) + "B";
    if (n >= 1e8) return f(n / 1e6, 0) + "M";
    if (n >= 1e7) return f(n / 1e6, 1) + "M";
    if (n >= 1e6) return f(n / 1e6, 2) + "M";
    if (n >= 1e5) return f(n / 1e3, 0) + "k";
    if (n >= 1e4) return f(n / 1e3, 1) + "k";
    return f(n, 0);
  }
  /// the counter's big number: every digit up to a million, then compact
  function fmtLong(v, dec) {
    const n = units(v, dec);
    if (n < 1e6) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return fmtShort(v, dec);
  }
  const short = (a) => (a && a !== ZERO ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const who = (o) => (o && o.last ? (o.last.winnerCode || short(o.last.jackpotWinner)) : "—");
  /// seconds until a branch's bell, by the chain's clock plus the time since we read it
  function secondsLeft(o) {
    const elapsed = Math.floor((Date.now() - (o.readAt || Date.now())) / 1000);
    return Math.max(0, o.closesAt - o.nowTs - elapsed);
  }
  const two = (n) => String(n).padStart(2, "0");
  const hms = (s) => `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
  const hm = (s) => `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nyBell = (o) => new Date(o.closesAt * 1000).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

  // ------------------------------------------------------------ the marks
  const marks = {};
  let marksP = null;
  function loadMarks() {
    if (marksP) return marksP;
    marksP = Promise.all(list().map((b) => new Promise((res) => {
      if (!b.mark) { marks[b.slug] = null; return res(); }
      const img = new Image();
      img.onload = () => { marks[b.slug] = img; res(); };
      img.onerror = () => { marks[b.slug] = null; res(); };
      img.src = b.mark;
    })));
    return marksP;
  }
  const marksReady = () => loadMarks();
  /// the same mark everywhere: the PNG at an integer scale, else a drawn coin
  /// with the symbol's first letters — the card and the counters must agree
  function drawMark(x, b, px0, py0, size) {
    const img = marks[b.slug];
    x.save();
    if (img) {
      x.imageSmoothingEnabled = false;
      const s = Math.max(1, Math.floor(size / img.width));
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, Math.round(px0 + (size - w) / 2), Math.round(py0 + (size - h) / 2), w, h);
    } else {
      const r = size / 2, cx = px0 + r, cy = py0 + r;
      x.fillStyle = "#8a6d35"; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#ffc933"; x.beginPath(); x.arc(cx, cy, r - Math.max(2, size / 12), 0, Math.PI * 2); x.fill();
      x.fillStyle = "#3a2a08"; x.textAlign = "center"; x.textBaseline = "middle";
      const letters = String(b.symbol || "?").replace(/^\$/, "").slice(0, 2).toUpperCase();
      x.font = Math.round(size * 0.38) + "px 'Press Start 2P', monospace";
      x.fillText(letters, cx, cy + size * 0.04);
    }
    x.restore();
  }
  /// the DOM twin of drawMark for the room
  function markEl(el, b, size) {
    const m = el("i", "br-mark");
    m.style.width = m.style.height = size + "px";
    if (b.mark) m.style.backgroundImage = `url("${b.mark}")`;
    const letters = String(b.symbol || "?").replace(/^\$/, "").slice(0, 2).toUpperCase();
    m.innerHTML = `<b>${esc(letters)}</b>`;
    m.classList.toggle("coin", !b.mark);
    return m;
  }

  // ------------------------------------------------------------ the street
  /// the tower's LED wall: one line per branch, the pot ticking
  function paintWall() {
    const wall = document.getElementById("fb-mintwall");
    if (!wall || !live()) return false;
    const s = snapshot;
    const rows = list().map((b) => {
      const o = s && s.find((x) => x.slug === b.slug);
      const potTxt = !o ? "…" : o.open ? fmtShort(o.pot, o.decimals) : o.drawing ? "DRAWING" : "AT THE BELL";
      const bell = o && o.open ? hm(secondsLeft(o)) : "";
      return `<span class="br"><i>${esc(b.symbol)}</i><u>${esc(potTxt)}</u><em>${bell}</em></span>`;
    }).join("");
    wall.classList.add("br-wall");
    wall.innerHTML = `<b>THE BRANCH OFFICES</b>${rows}<span class="br-open">A POT IN EVERY TOKEN</span>`;
    return true;
  }
  function wallTicker() {
    if (!live()) return;
    subscribe(() => paintWall());
    setInterval(() => { if (document.getElementById("fb-mintwall")) paintWall(); }, 60000);
  }

  // ------------------------------------------------------------ split flaps
  /// A Solari board. Every character is its own flap; a change walks the flap
  /// through the characters between old and new (capped, so a long jump still
  /// finishes inside a second), and neighbouring flaps start a beat apart so a
  /// whole row ripples rather than snaps. Nothing here is a transform on the
  /// board itself: it is 200 small squashes, and a squash is composited.
  const FLAP_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$.,:-—…";
  const FLAP_MS = 70, FLAP_MAX = 7;
  function flapSet(cell, text) {
    const w = cell.dataset.w | 0;
    const right = cell.classList.contains("r");
    const raw = String(text).toUpperCase().slice(0, w);
    const t = right ? raw.padStart(w, " ") : raw.padEnd(w, " ");
    const flaps = cell.children;
    for (let i = 0; i < w; i++) {
      const fl = flaps[i];
      const from = fl.dataset.c == null ? " " : fl.dataset.c, to = t[i];
      if (from === to) continue;
      const gen = (Number(fl.dataset.gen) || 0) + 1;
      fl.dataset.gen = String(gen);
      // the path through the alphabet, from the old face to the new one
      const a = FLAP_CHARS.indexOf(from), b = FLAP_CHARS.indexOf(to);
      let path = [];
      if (a >= 0 && b >= 0) {
        const n = FLAP_CHARS.length;
        const dist = ((b - a) % n + n) % n;
        const steps = Math.min(dist, FLAP_MAX);
        for (let s = 1; s <= steps; s++) path.push(FLAP_CHARS[(a + Math.round((dist * s) / steps)) % n]);
      } else path = [to];
      if (path[path.length - 1] !== to) path.push(to);
      const delay = i * 22 + Math.floor(Math.random() * 30);
      const step = (j) => {
        if (Number(fl.dataset.gen) !== gen) return; // a newer target took over
        fl.classList.remove("on"); void fl.offsetWidth; fl.classList.add("on");
        setTimeout(() => { if (Number(fl.dataset.gen) !== gen) return; fl.firstChild.textContent = path[j]; fl.dataset.c = path[j]; }, FLAP_MS / 2);
        if (j + 1 < path.length) setTimeout(() => step(j + 1), FLAP_MS);
        else setTimeout(() => { if (Number(fl.dataset.gen) === gen) fl.classList.remove("on"); }, FLAP_MS);
      };
      setTimeout(() => step(0), delay);
    }
  }
  function flapCell(el, w, cls) {
    const c = el("span", "br-cell" + (cls ? " " + cls : ""));
    c.dataset.w = String(w);
    for (let i = 0; i < w; i++) { const f = el("span", "br-fl"); f.appendChild(el("i", null, " ")); c.appendChild(f); }
    return c;
  }
  // BRANCH 11 · POT 9 · IN 3 · BELL 5 · WINNER 11 · lamp
  const COLS = [["BRANCH", 11, "l"], ["POT", 9, "r"], ["IN", 3, "r"], ["BELL IN", 5, "r"], ["LAST WINNER", 11, "l"]];
  const BOARD_ROWS = 5;
  function buildBoard(el, px, host, x, onRow) {
    const board = el("div", "br-board");
    board.innerHTML = `<i class="bolt a"></i><i class="bolt b"></i><i class="bolt c"></i><i class="bolt d"></i>
      <div class="hd"><b>THE BRANCH OFFICES</b><span>DAILY POTS · DRAWN AT THE FOUR O'CLOCK BELL, NEW YORK</span></div>`;
    const head = el("div", "br-row head");
    for (const [label, w, al] of COLS) { const h = el("span", "br-col " + al, label); h.style.width = `calc(${w} * var(--br-ch))`; head.appendChild(h); }
    head.appendChild(el("span", "br-col lamp", ""));
    board.appendChild(head);
    const rows = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const row = el("div", "br-row");
      row.dataset.row = String(r);
      const cells = COLS.map(([, w, al]) => { const c = flapCell(el, w, al); row.appendChild(c); return c; });
      const lamp = el("span", "br-col lamp"); lamp.appendChild(el("i")); row.appendChild(lamp);
      row.addEventListener("click", () => onRow && onRow(r, row));
      board.appendChild(row);
      rows.push({ row, cells, lamp });
    }
    px(board, { left: x + "px" });
    host.appendChild(board);
    return { board, rows };
  }
  /// what the flaps say, per branch and per empty slot
  function paintBoard(bd, s) {
    const bs = list();
    for (let r = 0; r < BOARD_ROWS; r++) {
      const { row, cells, lamp } = bd.rows[r];
      const b = bs[r];
      if (b) {
        const o = s && s.find((x) => x.slug === b.slug);
        row.dataset.slug = b.slug;
        row.classList.add("is-branch");
        flapSet(cells[0], b.short || b.name);
        if (!o) { flapSet(cells[1], "…"); flapSet(cells[2], ""); flapSet(cells[3], ""); flapSet(cells[4], ""); lamp.className = "br-col lamp"; continue; }
        if (o.open) {
          flapSet(cells[1], fmtShort(o.pot, o.decimals)); flapSet(cells[2], String(o.players)); flapSet(cells[3], hm(secondsLeft(o)));
          lamp.className = "br-col lamp open";
        } else if (o.drawing) {
          flapSet(cells[1], fmtShort(o.drawing.pot, o.decimals)); flapSet(cells[2], String(o.drawing.players)); flapSet(cells[3], "DRAW");
          lamp.className = "br-col lamp drawing";
        } else {
          flapSet(cells[1], "AT BELL"); flapSet(cells[2], ""); flapSet(cells[3], hm(secondsLeft(o)));
          lamp.className = "br-col lamp";
        }
        flapSet(cells[4], o.last ? who(o) : "NO DRAW YET");
      } else if (r === bs.length) {
        row.dataset.slug = "";
        row.classList.remove("is-branch"); row.classList.add("is-ask");
        flapSet(cells[0], "YOUR TOKEN"); flapSet(cells[1], "—"); flapSet(cells[2], "—"); flapSet(cells[3], "—:—"); flapSet(cells[4], "ASK AT DESK");
        lamp.className = "br-col lamp";
      } else {
        row.dataset.slug = "";
        row.classList.remove("is-branch", "is-ask");
        for (const c of cells) flapSet(c, "");
        lamp.className = "br-col lamp";
      }
    }
  }

  // ------------------------------------------------------------ the pot count-up
  /// a number that rolls to its new value instead of jumping; 900 ms, eased
  function countUp(node, from, to, dec, fmt) {
    if (from === to || from == null) { node.textContent = fmt(to, dec); node.dataset.v = String(to); return; }
    const t0 = performance.now(), a = Number(from), b = Number(to);
    node.classList.add("rolling");
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      const v = BigInt(Math.round(a + (b - a) * e));
      node.textContent = fmt(v, dec);
      if (k < 1) requestAnimationFrame(step); else { node.textContent = fmt(to, dec); node.classList.remove("rolling"); }
    };
    node.dataset.v = String(to);
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ the counters
  const STAFF = [
    // Bob · Fair · Black · Green candle — the HQ teller
    { look: "hr-bob pk-badge", pal: { H: "#3c2c20", S: "#eecaaa", d: "#c9a382", N: "#1c1c20", D: "#161619", T: "#388e54", L: "#16161a", M: "#111114" } },
    // Slick · Tan · Navy · Blue — the second window
    { look: "hr-slick pk-badge", pal: { H: "#201c1a", S: "#d8ac80", d: "#9f7f5e", N: "#2a3858", D: "#1e2940", T: "#3454a0", L: "#16161a", M: "#111114" } },
    // Buzz · Brown · Charcoal · Gold — the third
    { look: "hr-buzz pk-badge", pal: { H: "#584636", S: "#966a48", d: "#734f34", N: "#3a3a3e", D: "#2c2c30", T: "#deb23e", L: "#16161a", M: "#111114" } },
    // Bald · Fair · Black · Red — the fourth
    { look: "hr-bald ey-glasses", pal: { H: "#201c1a", S: "#eecaaa", d: "#c9a382", N: "#1c1c20", D: "#161619", T: "#c8283a", L: "#16161a", M: "#111114" } },
  ];
  const COUNTER_W = 400, COUNTER_GAP = 60;
  function buildCounter(ctx, b, i, x) {
    const { el, px, roomLayer, walkerEl, dress } = ctx;
    const c = el("div", "br-counter");
    c.dataset.slug = b.slug;
    // the sign over the window: the mark, the name, the pot, the bell
    const sign = el("div", "br-sign");
    sign.innerHTML = `<div class="nm"></div>
      <div class="pot"><b class="n">…</b><i class="sym">${esc(b.symbol)}</i></div>
      <div class="bell"><span class="lab">BELL IN</span><b class="cd">--:--:--</b><span class="ny"></span></div>
      <div class="sub"><span class="in"></span><span class="last"></span></div>`;
    sign.querySelector(".nm").appendChild(markEl(el, b, 48));
    sign.querySelector(".nm").appendChild(el("b", null, esc(b.name)));
    c.appendChild(sign);
    // a brass stanchion beside the window with its rope hooked to the frame:
    // the front of the queue. The rope runs the whole way, knob to hook —
    // a shorter one read as vanishing behind the desk. (A "vs yesterday"
    // meter stood here first and read bearish early in the day.)
    const post = el("div", "br-post");
    post.innerHTML = '<i class="base"></i><i class="pole"></i><i class="knob"></i><u class="rope"></u><i class="hook"></i>';
    c.appendChild(post);
    // the teller window: the clerk behind the glass on the left, and the
    // service panel on the right IN THE SAME FRAME — the two keys are set into
    // the wood, the name is a brass plate on the top rail. (A cream card used
    // to float beside the window; the user read it as a widget, not furniture.)
    // Every page opens in the SAME tab: inside a wallet's in-app browser a new
    // tab can land in the system browser, where there is no wallet (a tester
    // hit exactly that, 2026-09-07). The page's "THE STREET" link brings people
    // back to this counter through #hall/<slug>, so nothing is lost.
    const win = el("div", "br-win");
    win.innerHTML = `<i class="frame"></i><i class="glass"></i><i class="grille"></i><i class="mullion"></i>
      <div class="panel">
        <a class="key chip-in" href="${esc(b.page)}">CHIP IN →</a>
        <a class="key link" href="${esc(b.page)}${b.page.indexOf("#") === -1 ? "#link" : ""}">INVITE<br>EARN 5%</a>
        <span class="fine">${b.boost ? "brokers boost odds, up to 2x" : "flat odds, no boost"}</span>
      </div>
      <b class="plate">WINDOW ${i + 1} · ${esc(b.symbol)}</b><i class="sill"></i><i class="tray"></i>`;
    const st = STAFF[i % STAFF.length];
    const npc = walkerEl("fb-walker npc " + st.look);
    dress(npc, st.pal);
    npc.dataset.frame = "stand";
    px(npc, { left: "56px", bottom: "0px" });
    win.appendChild(npc);
    c.appendChild(win);
    px(c, { left: x + "px" });
    roomLayer.appendChild(c);
    return c;
  }
  function paintCounter(c, o) {
    if (!o) return;
    const n = c.querySelector(".pot .n"), cd = c.querySelector(".bell .cd"), lab = c.querySelector(".bell .lab"), ny = c.querySelector(".bell .ny");
    const inn = c.querySelector(".sub .in"), last = c.querySelector(".sub .last"), key = c.querySelector(".br-win .key.chip-in");
    // the key only invites a chip-in while the round is open; otherwise it
    // says the state, in brass, and still opens the page
    if (key) {
      key.textContent = o.open ? "CHIP IN →" : o.drawing ? "DRAWING…" : "AT THE BELL";
      key.classList.toggle("lit", !!o.open);
    }
    if (o.open) {
      const prev = n.dataset.v != null ? BigInt(n.dataset.v) : null;
      countUp(n, prev, o.pot, o.decimals, fmtLong);
      lab.textContent = "BELL IN"; ny.textContent = nyBell(o) + " NY";
      inn.textContent = `${o.players} IN TODAY`;
      c.classList.remove("is-drawing", "is-shut");
    } else if (o.drawing) {
      countUp(n, null, o.drawing.pot, o.decimals, fmtLong);
      lab.textContent = "DRAWING"; cd.textContent = "…"; ny.textContent = "the beacon lands in minutes";
      inn.textContent = `${o.drawing.players} PLAYED`;
      c.classList.add("is-drawing"); c.classList.remove("is-shut");
    } else {
      n.textContent = "0"; n.dataset.v = "0";
      lab.textContent = "NEXT BELL"; ny.textContent = nyBell(o) + " NY";
      inn.textContent = "OPENS WITH THE FIRST CHIP-IN";
      c.classList.add("is-shut"); c.classList.remove("is-drawing");
    }
    last.textContent = o.last ? `LAST: ${who(o)} TOOK ${fmtShort(o.last.jackpotPaid, o.decimals)}` : "NO DRAW YET";
  }
  function tickCounter(c, o) {
    const cd = c.querySelector(".bell .cd");
    if (!cd || !o) return;
    if (o.open || !o.drawing) {
      const s = secondsLeft(o);
      cd.textContent = hms(s);
      c.classList.toggle("is-lastminute", o.open && s > 0 && s <= 60);
    }
  }

  // ------------------------------------------------------------ the bell + the tape
  function ringBell(bell) {
    if (!bell) return;
    bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring");
  }
  /// ticker tape from the ceiling: forty strips, gone after they land
  function tape(roomLayer, x0, w) {
    const host = document.createElement("div");
    host.className = "br-tape";
    host.style.left = x0 + "px"; host.style.width = w + "px";
    const cols = ["#ffc933", "#f6ead0", "#6fe08c", "#d14e1d", "#3454a0"];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement("i");
      s.style.left = Math.round(Math.random() * w) + "px";
      s.style.background = cols[i % cols.length];
      s.style.animationDelay = (Math.random() * 0.9).toFixed(2) + "s";
      s.style.animationDuration = (2.2 + Math.random() * 1.4).toFixed(2) + "s";
      s.style.setProperty("--sway", (Math.random() * 40 - 20).toFixed(0) + "px");
      host.appendChild(s);
    }
    roomLayer.appendChild(host);
    setTimeout(() => host.remove(), 4200);
  }

  // ------------------------------------------------------------ the elevator
  let liftCtx = null, riding = false, rideGen = 0;
  /// where each counter stands in the hall, for deep links (#hall/<slug>) and
  /// the board's row clicks; set by hall(), read by goTo()
  let hallCtx = null; const counterAt = {};
  function goTo(slug) {
    if (!hallCtx || !hallCtx.state || api.floor !== "hall") return false;
    const x = counterAt[String(slug || "").toLowerCase()];
    if (x == null) return false;
    hallCtx.state.x = x;
    const c = hallCtx.roomLayer.querySelector(`.br-counter[data-slug="${slug}"]`);
    if (c) { c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }
    return true;
  }
  /// a room torn down mid-ride (Escape, a warp, the street door) must not
  /// have the ride's timers rebuild it a second later: exitRoom calls this
  function cancelRide() {
    rideGen++; riding = false;
    for (const n of document.querySelectorAll(".br-shaft")) n.remove();
    for (const n of document.querySelectorAll(".br-riding-up, .br-riding-down")) n.classList.remove("br-riding-up", "br-riding-down");
  }
  const api = { liftAt: null, stairsAt: null, floor: "hall" };
  /// THE STAIRS, at the entrance end of both floors: the other way between
  /// them, and upstairs the only way down (the second floor has no street
  /// door). Six treads up to a landing and a sign that says where they go.
  function stairs(ctx, floor, x) {
    const { el, px, roomLayer } = ctx;
    const up = floor === "hall";
    api.stairsAt = x + 66;
    const st = el("div", "br-stairs " + (up ? "up" : "down"));
    st.innerHTML = `<div class="sign">STAIRS ${up ? "&uarr;" : "&darr;"}<small>${up ? "2 · AUCTION HOUSE" : "G · BRANCH HALL"}</small></div>
      <i class="rail"></i>${[0, 1, 2, 3, 4, 5].map((k) => `<u class="t t${k}"></u>`).join("")}<i class="landing"></i><i class="post"></i>`;
    px(st, { left: x + "px" });
    st.addEventListener("click", () => ride(up ? "auction" : "hall"));
    roomLayer.appendChild(st);
    return st;
  }
  /// the floor chips, pinned to the stage (not the room, so they hold still
  /// while the floor scrolls): one click rides without the walk to the car
  function floorBar(ctx, floor) {
    const { el, roomLayer } = ctx;
    const stage = roomLayer.parentElement;
    if (!stage) return;
    let bar = stage.querySelector(".br-floorbar");
    if (!bar) {
      bar = el("div", "br-floorbar");
      bar.innerHTML = `<b>FLOOR</b><button type="button" data-floor="hall"><i>G</i><span class="full">BRANCH HALL</span><span class="short">HALL</span></button><button type="button" data-floor="auction"><i>2</i><span class="full">AUCTION HOUSE</span><span class="short">AUCTION</span></button>`;
      bar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) ride(b.dataset.floor); });
      stage.appendChild(bar);
    }
    for (const b of bar.querySelectorAll("button")) b.classList.toggle("on", b.dataset.floor === floor);
  }
  function elevator(ctx, floor, x) {
    const { el, px, roomLayer } = ctx;
    liftCtx = ctx;
    api.floor = floor;
    api.liftAt = x + 100;
    floorBar(ctx, floor);
    const car = el("div", "br-lift" + (ctx.state && ctx.state.brArrived ? " arrive" : ""));
    car.dataset.floor = floor;
    car.innerHTML = `<div class="sign">ELEVATOR</div>
      <div class="ind"><i class="${floor === "hall" ? "on" : ""}">G</i><i class="${floor === "auction" ? "on" : ""}">2</i></div>
      <div class="frame"><div class="cab"><i class="lamp"></i></div><div class="door l"></div><div class="door r"></div></div>
      <div class="call"><i></i></div>
      <div class="plate">${floor === "hall" ? "2 · THE AUCTION HOUSE ↑" : "G · THE BRANCH HALL ↓"}</div>`;
    px(car, { left: x + "px" });
    car.addEventListener("click", () => ride());
    roomLayer.appendChild(car);
    if (ctx.state) ctx.state.brArrived = false;
    // the doors you arrived through slide open a beat after the floor is built
    if (car.classList.contains("arrive")) setTimeout(() => car.classList.remove("arrive"), 80);
    return car;
  }
  function ride(to) {
    if (riding || !liftCtx || !liftCtx.state || !liftCtx.rebuild) return;
    const st = liftCtx.state;
    const target = to || (api.floor === "hall" ? "auction" : "hall");
    if (target === api.floor) return;
    riding = true;
    const gen = ++rideGen;
    // arrive by the piece you left by: the stairs if you were nearer them
    const byStairs = api.stairsAt != null && (api.liftAt == null || Math.abs(api.stairsAt - st.x) < Math.abs(api.liftAt - st.x));
    const car = liftCtx.roomLayer.querySelector(".br-lift");
    st.frozen = true;
    if (car) { car.classList.add("shut"); car.querySelector(".call i").classList.add("lit"); }
    // the shaft: the stage goes dark while the floors change, whether you
    // pressed E at the car or a chip on the floor bar from across the hall
    const stage = liftCtx.roomLayer.parentElement;
    let shaft = null;
    if (stage) { shaft = document.createElement("div"); shaft.className = "br-shaft"; stage.appendChild(shaft); requestAnimationFrame(() => shaft.classList.add("dark")); }
    // the doors close, the car moves, the city outside slides past the glass
    setTimeout(() => {
      if (gen !== rideGen) return;
      liftCtx.roomLayer.classList.add(target === "auction" ? "br-riding-up" : "br-riding-down");
      if (car) car.classList.add("moving");
    }, 420);
    setTimeout(() => {
      if (gen !== rideGen) { st.frozen = false; return; }
      // the room element survives the rebuild, so the riding class must go
      // BEFORE it: left on, the next floor's skyline stayed slid 170 px (user,
      // 2026-09-06: "the building gets bugged" after up then down)
      liftCtx.roomLayer.classList.remove("br-riding-up", "br-riding-down");
      st.hrFloor = target;
      st.brArrived = true;
      try { liftCtx.setFloor && liftCtx.setFloor(target); } catch (e) { /* the bar's name is decoration */ }
      liftCtx.rebuild();
      // rebuild keeps state.x; the new floor's pieces set liftAt/stairsAt, so stand by the one you took
      st.x = byStairs && api.stairsAt != null ? api.stairsAt + 70 : (api.liftAt ? api.liftAt - 130 : st.x);
      st.frozen = false;
      riding = false;
      if (shaft) { shaft.classList.remove("dark"); setTimeout(() => shaft.remove(), 500); }
    }, 1500);
  }

  // ------------------------------------------------------------ the hall
  function hall(ctx) {
    const { el, px, roomLayer, state, roomShell, glassWall, deskCard, prop, walkerEl, dress, toast } = ctx;
    const bs = list();
    const nC = bs.length + 1; // one shuttered counter: the next branch
    // ---- the plan, left to right, every piece centred on its section:
    //   A  entrance     0- 280   exit at 40, the floor directory at 170
    //   B  the board  320-1500   the split-flap board centred 910
    //   C  glazing   1540-1780
    //   D  counters  1820-…      400 wide, 60 apart, the last one shuttered
    //   E  the desk  +80         OPEN A BRANCH, 540 wide
    //   F  glazing + the elevator, 200 wide, then the far wall
    const X_BOARD = 320, X_C = 1820;
    const X_DESK = X_C + nC * (COUNTER_W + COUNTER_GAP) + 40;
    const X_GLASS2 = X_DESK + 700;
    const X_LIFT = X_GLASS2 + 300;
    const W = X_LIFT + 420;
    roomShell(W, [X_DESK + 270]); // no pendant over the board: under 780 the board's top hid the shade
    glassWall(1540, 240, [[16, 54, 268, "far"], [88, 58, 224, "near"], [162, 50, 286, "far"]]);
    glassWall(X_GLASS2, 240, [[12, 60, 250, "far"], [90, 52, 290, "near"], [160, 56, 230, "far"]]);
    // the wainscot on the solid runs, behind everything
    const wallEl = roomLayer.querySelector(".room-wall");
    for (const [x, w] of [[0, 1540], [1780, X_GLASS2 - 1780], [X_GLASS2 + 240, W - X_GLASS2 - 240]]) {
      const pn = el("div", "br-panel");
      px(pn, { left: x + "px", width: w + "px" });
      if (wallEl && wallEl.nextSibling) roomLayer.insertBefore(pn, wallEl.nextSibling); else roomLayer.appendChild(pn);
    }
    prop("hr2-bin", W - 120);

    // A: the floor directory by the door — click a floor to call the lift
    const dir = el("div", "br-directory");
    dir.innerHTML = `<b>DIRECTORY</b><div class="fl on"><i>G</i><span>THE BRANCH HALL</span></div><div class="fl"><i>2</i><span>THE AUCTION HOUSE</span></div>`;
    dir.querySelector(".fl:not(.on)").addEventListener("click", () => ride("auction"));
    px(dir, { left: "170px" }); // over the stairs' landing, well above their sign
    roomLayer.appendChild(dir);

    // B: THE BOARD and, under it, a bench and the hall clerk at her lectern
    const bd = buildBoard(el, px, roomLayer, X_BOARD, (r, row) => {
      const slug = row.dataset.slug;
      if (!slug) { state.x = X_DESK + 200; return; }
      const i = bs.findIndex((b) => b.slug === slug);
      if (i >= 0) { state.x = X_C + i * (COUNTER_W + COUNTER_GAP) + 200; flash(counters[i]); }
    });
    const bench = el("div", "br-bench"); bench.innerHTML = "<i></i><i></i><i></i><u></u>";
    px(bench, { left: "470px" }); roomLayer.appendChild(bench);
    const plant = el("div", "br-plant"); plant.innerHTML = "<i></i><i></i><i></i><u></u>";
    px(plant, { left: "1250px" }); roomLayer.appendChild(plant);
    const lectern = el("div", "br-lectern"); lectern.innerHTML = "<i></i><u></u>";
    // she stands past the board, in front of the first glazing, so her bubble
    // never lands on the flaps (it did at 640: bubble at ground+115, board
    // bottom at ground+96)
    px(lectern, { left: "1500px" }); roomLayer.appendChild(lectern);
    const host0 = walkerEl("fb-walker npc hr-ponytail pk-brooch");
    dress(host0, { H: "#c8a860", S: "#eecaaa", d: "#b0957d", N: "#6e727a", D: "#55585f", T: "#da789a", L: "#585b61", M: "#44464b" });
    host0.dataset.frame = "stand";
    px(host0, { left: "1556px", bottom: "var(--ground-h)" });
    roomLayer.appendChild(host0);
    const speech = prop("room-speech br-speech", 1560, "Reading the board…"); // max 260 wide: ends at 1820, the first post's knob starts at 1842
    // the bell over the hall, rung in the last minute and again at the draw
    const bell = el("div", "br-bell"); bell.innerHTML = '<i class="yoke"></i><i class="cup"></i><i class="clapper"></i>';
    // past the board's right edge at every width (1500 wide, 1320 compact):
    // at 780 the board's top reached 103 and the bell's cup ended at 120
    px(bell, { left: "1512px" }); roomLayer.appendChild(bell);

    // D: the counters
    hallCtx = ctx;
    const counters = bs.map((b, i) => { counterAt[b.slug] = X_C + i * (COUNTER_W + COUNTER_GAP) + 200; return buildCounter(ctx, b, i, X_C + i * (COUNTER_W + COUNTER_GAP)); });
    const shut = el("div", "br-counter shuttered");
    shut.innerHTML = `<div class="br-sign"><div class="nm"><i class="br-mark coin q"><b>?</b></i><b>YOUR TOKEN HERE</b></div><div class="pot"><b class="n">—</b></div><div class="bell"><span class="lab">THIS COUNTER OPENS</span><b class="cd">SOON</b></div><div class="sub"><span class="in">ASK AT THE DESK →</span></div></div>
      <div class="br-win"><i class="frame"></i><i class="shutter"></i><i class="mullion"></i><div class="panel"><span class="fine">your token, same bell</span></div><b class="plate">NEXT BRANCH</b><i class="sill"></i><b class="closed">CLOSED</b></div>`;
    px(shut, { left: X_C + bs.length * (COUNTER_W + COUNTER_GAP) + "px" });
    roomLayer.appendChild(shut);
    function flash(c) { if (!c) return; c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }

    // E: OPEN A BRANCH — the desk composes the ask; the user answers the DMs
    const open = el("div", "br-open");
    open.innerHTML = `<h3>OPEN A BRANCH</h3>
      <p>A daily pot in <b>your</b> token. Same bell, same audited contract, same draw nobody can rig. <b>5% of every chip-in goes to your community, forever.</b></p>
      <div class="row"><label>TOKEN<input class="sym" type="text" maxlength="12" placeholder="$TICKER" autocomplete="off"></label><label>YOUR X<input class="who" type="text" maxlength="24" placeholder="@handle" autocomplete="off"></label></div>
      <div class="acts"><a class="go post" target="_blank" rel="noopener">POST THE REQUEST ON X</a><button class="chip copy" type="button">COPY FOR A DM</button></div>
      <div class="echo"></div>`;
    deskCard(X_DESK, 540, open, "br-opendesk");
    const manager = walkerEl("fb-walker npc hr-slick st-pinstripe pk-boutonniere");
    dress(manager, { H: "#bebec4", S: "#d8ac80", d: "#9f7f5e", N: "#2e344e", D: "#23283c", T: "#deb23e", L: "#24293e", M: "#1c2030" });
    manager.dataset.frame = "stand";
    px(manager, { left: X_DESK + 560 + "px", bottom: "var(--ground-h)" });
    roomLayer.appendChild(manager);
    // the manager's corner: a filing cabinet, the water cooler, a coat stand,
    // and the branch map on the wall — the run was bare wainscot before
    const cab = el("div", "br-cabinet"); cab.innerHTML = "<i></i><i></i><i></i><u></u>";
    px(cab, { left: X_DESK + 8 + "px" }); roomLayer.appendChild(cab);
    const cooler = el("div", "br-cooler"); cooler.innerHTML = '<i class="bottle"></i><i class="body"></i><i class="tap"></i><i class="cups"></i>';
    px(cooler, { left: X_DESK + 402 + "px" }); roomLayer.appendChild(cooler);
    const coat = el("div", "br-coat"); coat.innerHTML = '<i class="pole"></i><i class="hook l"></i><i class="hook r"></i><i class="hat"></i><i class="coat"></i><u></u>';
    px(coat, { left: X_DESK + 476 + "px" }); roomLayer.appendChild(coat);
    const map = el("div", "br-map");
    map.innerHTML = `<b>BRANCH MAP</b><div class="land"><i class="a"></i><i class="b"></i><i class="c"></i>${bs.map((b, i) => `<s class="pin p${i % 6}" title="${esc(b.name)}"></s>`).join("")}<s class="pin next"></s></div><span>${bs.length} OPEN · ROBINHOOD CHAIN</span>`;
    px(map, { left: X_DESK + 552 + "px" }); roomLayer.appendChild(map);
    const nameplate = el("div", "br-nameplate", "BRANCH MANAGER");
    px(nameplate, { left: X_DESK + 548 + "px" }); roomLayer.appendChild(nameplate);
    const handle = CFG.x ? "@" + String(CFG.x).replace(/^@/, "") : "@thefirmbrokers";
    const askText = () => {
      const sym = String(open.querySelector(".sym").value || "").trim().replace(/^\$?/, "$").toUpperCase();
      const whoV = String(open.querySelector(".who").value || "").trim();
      const t = sym.length > 1 ? sym : "$OURTOKEN";
      return `${handle} open a branch for ${t}. a daily pot in our token, drawn at the four o'clock bell, 5% of every chip-in to the community.${whoV ? " reach me at " + (whoV.startsWith("@") ? whoV : "@" + whoV) + "." : ""} 🏢`;
    };
    const post = open.querySelector(".post");
    const setHref = () => { post.href = "https://x.com/intent/post?text=" + encodeURIComponent(askText()); };
    setHref();
    open.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", setHref));
    open.querySelector(".copy").addEventListener("click", async () => {
      const echo = open.querySelector(".echo");
      try { await navigator.clipboard.writeText(askText()); echo.textContent = "copied. paste it in a DM to " + handle + "."; }
      catch (e) { echo.textContent = askText(); }
    });

    // F: the elevator; and the stairs back at the entrance, so either end of
    // the hall has a way up
    elevator(ctx, "hall", X_LIFT);
    stairs(ctx, "hall", 150);

    // ---- the live feed: the board, the counters, the clerk, the bell
    let lastSeen = {};
    let lines = [], lineAt = 0;
    const speak = (t) => { speech.textContent = t; };
    const unsub = subscribe((s) => {
      if (!document.body.contains(roomLayer) || !roomLayer.querySelector(".br-board")) { unsub(); return; }
      paintBoard(bd, s);
      bs.forEach((b, i) => { const o = s.find((x) => x.slug === b.slug); paintCounter(counters[i], o); tickCounter(counters[i], o); });
      // a draw landed since the last poll: the bell, the tape, the news
      for (const o of s) {
        const seen = lastSeen[o.slug];
        if (seen != null && o.last && o.last.id !== seen) {
          ringBell(bell);
          const i = bs.findIndex((b) => b.slug === o.slug);
          tape(roomLayer, X_C + i * (COUNTER_W + COUNTER_GAP) - 40, COUNTER_W + 80);
          flash(counters[i]);
          toast && toast(`${o.short} PAID: ${fmtShort(o.last.jackpotPaid, o.decimals)} ${o.symbol} TO ${who(o)}`, true);
        }
        lastSeen[o.slug] = o.last ? o.last.id : 0;
      }
      // what the clerk says: built from the numbers on the board
      lines = [];
      for (const o of s) {
        if (o.open) lines.push(`${o.players} in at ${o.short} so far. Bell in ${Math.floor(secondsLeft(o) / 3600)}h ${Math.floor((secondsLeft(o) % 3600) / 60)}m.`);
        if (o.last) lines.push(`Yesterday: ${who(o)} took ${fmtShort(o.last.jackpotPaid, o.decimals)} ${o.symbol}.`);
      }
      lines.push("Every counter pays at the four o'clock bell, New York time.");
      if (bs.some((b) => b.boost)) lines.push("Hired brokers boost your odds at the OFFICE POOL counter. Up to 2x.");
      lines.push("Want a counter for your token? The desk at the end of the hall.");
      if (lineAt === 0) speak(lines[0]);
    });
    const talk = setInterval(() => {
      if (!document.body.contains(roomLayer)) { clearInterval(talk); return; }
      if (lines.length) { lineAt = (lineAt + 1) % lines.length; speak(lines[lineAt]); }
    }, 7000);
    const tick = setInterval(() => {
      if (!document.body.contains(roomLayer)) { clearInterval(tick); return; }
      const s = snapshot; if (!s) return;
      bs.forEach((b, i) => { const o = s.find((x) => x.slug === b.slug); tickCounter(counters[i], o); });
      // the board's minutes, and the bell in the last minute of any branch
      const sec = Math.floor(Date.now() / 1000);
      if (sec % 60 === 0) paintBoard(bd, s);
      for (const o of s) if (o.open) { const left = secondsLeft(o); if (left <= 60 && left > 0 && sec % 10 === 0) ringBell(bell); }
    }, 1000);
    return { board: bd.board, counters, open };
  }

  // ------------------------------------------------------------ exports
  window.__BRANCHES = {
    live, list, read, subscribe, snapshot: () => snapshot, marksReady, drawMark, markEl,
    paintWall, wallTicker, hall, elevator, stairs, ride, cancelRide, goTo, fmtShort, fmtLong, secondsLeft, who,
    get liftAt() { return api.liftAt; }, get stairsAt() { return api.stairsAt; }, get floor() { return api.floor; },
    // for the suite: the flap alphabet and the board's row count
    _FLAP_CHARS: FLAP_CHARS, _BOARD_ROWS: BOARD_ROWS, _poll: poll,
  };
  if (live()) { loadMarks(); start(); }
})();
