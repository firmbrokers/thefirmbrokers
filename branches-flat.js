/* ===========================================================================
   THE BRANCH OFFICES on the flat page (phones, and the PAGE button).

   The building on the street has a split-flap board and one counter per
   branch; a phone gets the same facts in one card: every branch with its live
   pot, who is in, the bell counting down, the last bell's payout and winner,
   a GO to the branch's page, and OPEN A BRANCH with the same ask the desk
   composes upstairs. Reads NOTHING itself: it subscribes to branches.js
   (window.__BRANCHES.subscribe), so the card, the board and the counters
   always say the same numbers.

   Registers window.__BRANCHES_FLAT(ctx) with ctx = { el, host, F, CFG }.
   level.js calls it guarded from buildFlat, next to the auction card.
   =========================================================================== */
(function () {
  "use strict";

  const CSS = `
  .br-flat { background: var(--plank); color: var(--cream); }
  .br-flat h2 { color: var(--gold); text-shadow: 2px 2px 0 var(--ink); }
  .br-flat p { color: var(--cream); }
  .br-flat p.dim { color: #b9b3a6; font-size: 19px; }
  .br-flat .rows { display: grid; gap: 10px; margin-top: 12px; }
  .br-flat .row {
    display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center;
    padding: 10px 12px; background: var(--ink); border: 3px solid #000; color: var(--cream);
    text-decoration: none; box-shadow: 4px 4px 0 #000;
  }
  .br-flat .row:hover { border-color: var(--gold); }
  .br-flat .row .br-mark { width: 48px; height: 48px; }
  .br-flat .row .name { font-family: var(--font-display); font-size: 9px; line-height: 1.6; color: var(--gold); }
  .br-flat .row .line { font-family: var(--font-data); font-size: 19px; line-height: 1.15; color: var(--cream); }
  .br-flat .row .line .bell { color: #8fe0a8; white-space: nowrap; }
  .br-flat .row .line .bell.hot { color: var(--gold); }
  .br-flat .row .last { font-family: var(--font-data); font-size: 17px; line-height: 1.15; color: #b9b3a6; }
  .br-flat .row .pot { text-align: right; }
  .br-flat .row .pot b { display: block; font-family: var(--font-display); font-size: 15px; line-height: 1.3; color: #b6ffcf; text-shadow: 0 0 10px #6fe08c66; white-space: nowrap; }
  .br-flat .row .pot span { font-family: var(--font-data); font-size: 17px; color: #8fe0a8; }
  .br-flat .row .pot .go { display: inline-block; margin-top: 4px; font-family: var(--font-display); font-size: 8px; color: var(--ink); background: var(--gold); padding: 6px 8px; border: 2px solid #000; }
  .br-flat .row.closed .pot b { color: #b9b3a6; text-shadow: none; }
  .br-flat .open { margin-top: 14px; padding-top: 12px; border-top: 3px solid #000; }
  .br-flat .open h3 { font-family: var(--font-display); font-size: 10px; color: var(--gold); margin: 0 0 6px; }
  .br-flat .open .in { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
  .br-flat .open label { display: grid; gap: 4px; font-family: var(--font-display); font-size: 7px; color: #b9b3a6; }
  .br-flat .open input { height: 40px; padding: 0 10px; background: var(--field); border: 3px solid #000; color: var(--ink); font-family: var(--font-data); font-size: 20px; min-width: 0; }
  .br-flat .open .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .br-flat .open .acts .fb-btn { font-size: 9px; padding: 10px 12px; text-decoration: none; display: inline-block; }
  .br-flat .open .echo { min-height: 20px; margin-top: 6px; font-family: var(--font-data); font-size: 18px; color: var(--gold); overflow-wrap: anywhere; }
  @media (max-width: 400px) { .br-flat .row { grid-template-columns: 40px 1fr auto; gap: 8px; padding: 8px 9px; } .br-flat .row .br-mark { width: 40px; height: 40px; } .br-flat .row .pot b { font-size: 12px; } .br-flat .open .in { grid-template-columns: 1fr; } }
  `;
  let cssDone = false;
  function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }

  const two = (n) => String(n).padStart(2, "0");
  const hms = (s) => `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /// "pool.html" → "/pool" on this site; an absolute URL stays as it is
  const pageHref = (p) => (/^https?:\/\//.test(p) ? p : "/" + String(p || "/pool").replace(/^\//, "").replace(/\.html(?=$|[?#])/, ""));

  let live = null; // { unsub, tick }
  window.__BRANCHES_FLAT = function (ctx) {
    const { el, host, CFG } = ctx;
    const BR = window.__BRANCHES;
    if (!BR || !BR.live || !BR.live()) return null;
    injectCss();
    // the faster branches, named: " THE PUNCH CLOCK rings every 4 hours, three in or the bell waits." (nothing when every branch is daily)
    const fastLine = () => {
      if (!BR.periodOf || !BR.periodWords) return "";
      return BR.list().filter((b) => !BR.periodWords(BR.periodOf(b)).daily)
        .map((b) => ` <b>${esc(b.name)}</b> rings ${esc(BR.periodWords(BR.periodOf(b)).every)}, three in or the bell waits.`).join("");
    };
    if (live) { try { live.unsub(); } catch (e) {} clearInterval(live.tick); live = null; }

    const card = el("div", "fb-card dark br-flat");
    card.innerHTML = `<h2>THE BRANCH OFFICES</h2>
      <p>Firm opens a daily pot in any Robinhood Chain token: same bell, same audited contract, same draw nobody can rig. One player takes the pot, one gets their money back, every day.${fastLine()}</p>
      <div class="rows"><p class="dim">Reading the branches…</p></div>`;
    host.appendChild(card);
    const rows = card.querySelector(".rows");

    // OPEN A BRANCH: the same ask the desk upstairs composes; the user answers the DMs
    const handle = CFG && CFG.x ? "@" + String(CFG.x).replace(/^@/, "") : "@thefirmbrokers";
    const open = el("div", "open");
    open.innerHTML = `<h3>OPEN A BRANCH</h3>
      <p class="dim">A daily pot in <b>your</b> token. 5% of every chip-in goes to your community, forever. Ask, and the firm opens the doors.</p>
      <div class="in"><label>TOKEN<input class="sym" type="text" maxlength="12" placeholder="$TICKER" autocomplete="off"></label><label>YOUR X<input class="who" type="text" maxlength="24" placeholder="@handle" autocomplete="off"></label></div>
      <div class="acts"><a class="fb-btn post" target="_blank" rel="noopener">POST THE REQUEST ON X</a><button class="fb-btn copy" type="button">COPY FOR A DM</button></div>
      <div class="echo"></div>`;
    card.appendChild(open);
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

    // the rows: one per branch, rebuilt on every snapshot; the bell ticks between snapshots
    let snap = null;
    function paint(list) {
      snap = list;
      rows.innerHTML = "";
      if (!list || !list.length) { rows.appendChild(el("p", "dim", "The chain did not answer. It will retry.")); return; }
      for (const o of list) {
        const a = el("a", "row" + (o.open ? "" : " closed"));
        a.href = pageHref(o.page);
        a.dataset.slug = o.slug;
        if (/^https?:\/\//.test(o.page)) { a.target = "_blank"; a.rel = "noopener"; }
        a.appendChild(BR.markEl(el, o, 48));
        const who = el("div");
        who.appendChild(el("div", "name", esc(o.name)));
        const line = el("div", "line");
        const left = BR.secondsLeft(o);
        line.innerHTML = o.open
          ? `${esc(o.symbol)} · ${o.players} in · bell in <span class="bell${left <= 600 ? " hot" : ""}">${hms(left)}</span>`
          : (o.drawing ? `${esc(o.symbol)} · the bell rang · drawing…` : `${esc(o.symbol)} · nobody in yet · the first chip-in opens ${BR.periodWords ? (BR.periodWords(o.period).daily ? "today's pot" : "the next pot") : "today's pot"}`);
        who.appendChild(line);
        if (o.last) who.appendChild(el("div", "last", `last bell ${esc(BR.fmtShort(o.last.jackpotPaid + o.last.refundPaid, o.decimals))} paid, jackpot to ${esc(BR.who(o))}`));
        a.appendChild(who);
        const pot = el("div", "pot");
        pot.innerHTML = `<b>${o.open ? esc(BR.fmtLong(o.pot, o.decimals)) : "—"}</b><span>${esc(o.symbol)}</span><br><span class="go">${o.open ? "CHIP IN →" : "GO →"}</span>`;
        a.appendChild(pot);
        rows.appendChild(a);
      }
    }
    const unsub = BR.subscribe(paint);
    const tick = setInterval(() => {
      if (!snap || !card.isConnected) return;
      for (const o of snap) {
        if (!o.open) continue;
        const b = rows.querySelector(`.row[data-slug="${o.slug}"] .bell`);
        if (!b) continue;
        const left = BR.secondsLeft(o);
        b.textContent = hms(left);
        b.classList.toggle("hot", left <= 600);
      }
    }, 1000);
    live = { unsub, tick };
    return card;
  };
})();
