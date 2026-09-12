/* ===========================================================================
   THE POOL PAGE'S TABS — one per branch, every branch's pool on this domain.
   Built from CFG.branches (HQ first), the open one lit (the page's own
   branch, /pool/<slug>, or the old ?b=), each tab's live pot
   through branches.js's shared reader. A click loads that branch's page in
   THIS tab; a ?ref= code travels along (codes are checked per pool; an
   unknown one never blocks anything). Mounts into #op-tabs; with one branch
   or none, the strip stays hidden.
   =========================================================================== */
(function () {
  "use strict";
  const CFG = window.FIRM_CFG || {};
  const host = document.getElementById("op-tabs");
  if (!host) return;
  const list = (Array.isArray(CFG.branches) ? CFG.branches : []).filter((b) => b && b.slug && b.pool && b.token);
  if (list.length < 2) { host.hidden = true; return; }
  list.sort((a, b) => (a.slug === "hq" ? -1 : b.slug === "hq" ? 1 : 0));

  let url = null;
  try { url = new URL(location.href); } catch (e) { url = null; }
  // which branch is open: the page says so (/pool/<slug>.html sets __POOL_BRANCH), else the path, else the old ?b= — same order as pool.js
  let asked = String(window.__POOL_BRANCH || "").toLowerCase();
  if (!asked && url) { const m = /^\/pool\/([a-z0-9-]+)/.exec(url.pathname); if (m) asked = m[1].toLowerCase(); }
  if (!asked && url) asked = String(url.searchParams.get("b") || "").toLowerCase();
  const slug = list.some((b) => b.slug === asked) ? asked : "hq";
  const ref = url ? String(url.searchParams.get("ref") || "") : "";
  const hrefOf = (b) => `/pool${b.slug === "hq" ? "" : "/" + encodeURIComponent(b.slug)}${ref ? "?ref=" + encodeURIComponent(ref) : ""}`; // each branch's own page
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  host.innerHTML = "";
  const tabs = {};
  for (const b of list) {
    const a = el("a", "op-tab" + (b.slug === slug ? " on" : ""));
    a.href = hrefOf(b);
    a.dataset.slug = b.slug;
    a.title = b.name || b.symbol;
    if (b.slug === slug) a.setAttribute("aria-current", "page");
    const mark = window.__BRANCHES && window.__BRANCHES.markEl ? window.__BRANCHES.markEl(el, b, 24) : null;
    if (mark) a.appendChild(mark);
    // the symbol — unless two branches share one (HQ and THE PUNCH CLOCK are both $9TO5): then the short name
    const label = window.__BRANCHES && window.__BRANCHES.tabName ? window.__BRANCHES.tabName(b) : b.symbol;
    a.appendChild(el("b", null, esc(label || b.slug.toUpperCase())));
    a.appendChild(el("i", "pot", "…"));
    host.appendChild(a);
    tabs[b.slug] = a;
  }
  // on a phone the strip scrolls: keep the open tab in view. Not only at mount —
  // the pots arrive later ("…" → "704k") and widen the tabs, which is when a
  // third branch first overflows (audit F2, 2026-09-07: the page's own tab 60%
  // visible at 390 until a swipe). scrollLeft on the strip, never the page.
  const reveal = () => {
    try {
      const on = host.querySelector(".op-tab.on");
      if (!on || host.scrollWidth <= host.clientWidth + 1) { if (host.scrollLeft) host.scrollLeft = 0; return; }
      const want = on.offsetLeft - (host.clientWidth - on.offsetWidth) / 2;
      host.scrollLeft = Math.max(0, Math.min(host.scrollWidth - host.clientWidth, want));
    } catch (e) { /* cosmetic */ }
  };
  reveal();
  window.addEventListener("resize", reveal);

  if (window.__BRANCHES && window.__BRANCHES.subscribe) {
    window.__BRANCHES.subscribe((s) => {
      for (const o of s) {
        const a = tabs[o.slug]; if (!a) continue;
        const pot = a.querySelector(".pot");
        pot.textContent = o.open ? window.__BRANCHES.fmtShort(o.pot, o.decimals) : o.drawing ? "drawing" : "at the bell";
        a.classList.toggle("is-open", !!o.open);
      }
      reveal();
    });
  }
  window.__POOL_TABS = { slug, hrefOf, reveal, list: list.map((b) => b.slug) };
})();
