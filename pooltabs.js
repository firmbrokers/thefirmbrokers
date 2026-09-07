/* ===========================================================================
   THE POOL PAGE'S TABS — one per branch, every branch's pool on this domain.
   Built from CFG.branches (HQ first), the open one lit, each tab's live pot
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
  const asked = url ? String(url.searchParams.get("b") || "").toLowerCase() : "";
  const slug = list.some((b) => b.slug === asked) ? asked : "hq";
  const ref = url ? String(url.searchParams.get("ref") || "") : "";
  const hrefOf = (b) => {
    const q = [];
    if (b.slug !== "hq") q.push("b=" + encodeURIComponent(b.slug));
    if (ref) q.push("ref=" + encodeURIComponent(ref));
    return "pool.html" + (q.length ? "?" + q.join("&") : "");
  };
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
    a.appendChild(el("b", null, esc(b.symbol || b.slug.toUpperCase())));
    a.appendChild(el("i", "pot", "…"));
    host.appendChild(a);
    tabs[b.slug] = a;
  }
  // on a phone the strip scrolls: bring the open tab into view
  try { const on = host.querySelector(".op-tab.on"); if (on && host.scrollWidth > host.clientWidth) on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { /* cosmetic */ }

  if (window.__BRANCHES && window.__BRANCHES.subscribe) {
    window.__BRANCHES.subscribe((s) => {
      for (const o of s) {
        const a = tabs[o.slug]; if (!a) continue;
        const pot = a.querySelector(".pot");
        pot.textContent = o.open ? window.__BRANCHES.fmtShort(o.pot, o.decimals) : o.drawing ? "drawing" : "at the bell";
        a.classList.toggle("is-open", !!o.open);
      }
    });
  }
  window.__POOL_TABS = { slug, hrefOf, list: list.map((b) => b.slug) };
})();
