/* ===========================================================================
   THE LIST — "am I on it?" checker.

   One modal, two sources of truth, never a stronger claim than the source
   supports. THE MINT IS ON OPENSEA (2026-08-25): the allowlist is no longer
   loaded into our contract, it is uploaded to the OpenSea presale stage, so
   the chain has nothing to say about who is listed and this file no longer
   asks it. What it knows:

   1. LIST (site/wl.json exists and is non-empty): the allowlist as approved
      SO FAR, shipped as sha256 hashes of lowercased addresses (the addresses
      themselves are never published; OpenSea keeps its copy encrypted too).
      Approvals land in WAVES while applications are open, so an address that
      is absent is "not on it YET" — never a definitive no — until the file
      says final:true (wl/build.py --final, run at the launch lock). Built by
      wl/build.py from wl/allowlist.txt — the SAME file whose --opensea CSV
      is uploaded to Studio, so this page and the presale cannot disagree.
      Refetched every couple of minutes so a tab left open sees new waves
      without a reload.
   2. PENDING (no file): the honest answer is that no wave has been posted
      yet. Deliberately NOT wired to the application Worker: nobody on this
      side owns it, and "nope" from a catch-all must never render as "you are
      not on the list".

   Once FIRM_CFG.mintUrl is set (the OpenSea drop page exists) a listed wallet
   is handed that link — the ONE mint link the site ever shows.

   Self-contained on purpose (own CSS, wl- prefix, no dependencies): it
   registers window.__WL_CHECK and callers use it guarded, so a stale cached
   copy of any other file — or of this one — leaves a working page.
   =========================================================================== */
(function () {
  "use strict";

  const CSS = `
  .wl-veil {
    position: fixed; inset: 0; z-index: 240;
    background: rgba(6, 8, 12, 0.72);
    display: flex; align-items: center; justify-content: center;
    padding: 18px;
  }
  .wl-box {
    width: min(92vw, 430px);
    background: #2a2f36; border: 4px solid var(--ink, #16161a); padding: 8px;
    box-shadow: 0 0 22px #ffc93322, 6px 6px 0 rgba(0, 0, 0, 0.35);
  }
  .wl-screen {
    position: relative; overflow: hidden;
    background: linear-gradient(#10151d, #0a0e14); border: 3px solid #06080c;
    padding: 18px 16px 20px;
  }
  .wl-screen::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent 0 3px, #00000048 3px 4px);
  }
  .wl-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  }
  .wl-head h2 {
    font-family: var(--font-display, monospace); font-size: 17px;
    color: var(--gold, #ffc933); text-shadow: 0 0 10px #ffc93380, 2px 2px 0 #000;
  }
  .wl-x {
    position: relative; z-index: 1;
    font-family: var(--font-display, monospace); font-size: 11px;
    background: none; border: 0; color: #9fe0af; cursor: pointer; padding: 4px 6px;
  }
  .wl-row { position: relative; z-index: 1; margin-top: 14px; display: flex; gap: 8px; }
  .wl-row input {
    flex: 1; min-width: 0;
    font: 12px/1.4 ui-monospace, Menlo, monospace;
    color: #d7e6da; background: #0a0e14;
    border: 3px solid #06080c; outline: none; padding: 10px 8px;
  }
  .wl-row input:focus { border-color: var(--gold, #ffc933); }
  .wl-row button {
    font-family: var(--font-display, monospace); font-size: 11px;
    padding: 10px 12px; cursor: pointer;
    background: #10151d; color: var(--gold, #ffc933);
    border: 3px solid var(--ink, #16161a);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.3);
  }
  .wl-row button:active { transform: translate(2px, 2px); box-shadow: none; }
  .wl-out { position: relative; z-index: 1; margin-top: 14px; min-height: 58px; }
  .wl-verdict {
    font-family: var(--font-display, monospace); font-size: 18px; line-height: 1.5;
  }
  .wl-verdict.on { color: #6fe08c; text-shadow: 0 0 8px #6fe08c55; }
  .wl-verdict.off { color: #e06f6f; text-shadow: 0 0 8px #e06f6f44; }
  .wl-verdict.hold { color: var(--gold, #ffc933); text-shadow: 0 0 8px #ffc93355; }
  .wl-why { margin-top: 12px; color: #b7c9bd; font-size: 16px; line-height: 1.7; }
  .wl-act { position: relative; z-index: 1; margin-top: 12px; }
  .wl-act button {
    font-family: var(--font-display, monospace); font-size: 9px;
    padding: 9px 11px; cursor: pointer;
    background: #10151d; color: #9fe0af; border: 3px solid var(--ink, #16161a);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.3);
  }
  `;

  const style = document.createElement("style");
  style.id = "fb-wlcheck-css";
  style.textContent = CSS;
  document.head.appendChild(style);

  const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
  async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /// site/wl.json — the waves approved so far. null = absent or unusable; an
  /// empty list counts as absent: an empty file must not say "not on it".
  /// Cached briefly, then refetched: approval waves land while a tab is open.
  let wlPromise = null;
  let wlAt = 0;
  const WL_TTL = 120_000;
  function loadList() {
    if (!wlPromise || performance.now() - wlAt > WL_TTL) {
      wlAt = performance.now();
      wlPromise = fetch("wl.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : null))
        // two tiers since 2026-08-27: `hashes` = the GTD (guaranteed) list,
        // `fcfs` = the first-come round, both sha256(lowercase address)
        .then((j) => (j && j.algo === "sha256(lowercase)" && Array.isArray(j.hashes)
          && (j.hashes.length || (Array.isArray(j.fcfs) && j.fcfs.length))
          ? { set: new Set(j.hashes), fcfs: new Set(Array.isArray(j.fcfs) ? j.fcfs : []), final: !!j.final } : null))
        .catch(() => null);
    }
    return wlPromise;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // ------------------------------------------------------------- the answers
  async function checkList(addr, wl) {
    const live = !!(window.FIRM_CFG || {}).mintUrl;
    const h = await sha256Hex(addr.toLowerCase());
    if (wl.set.has(h)) {
      return ["on", "YOU ARE IN \u00b7 GTD", live
        ? "Guaranteed whitelist. You mint first, in the GTD round on our OpenSea page."
        : "Guaranteed whitelist. You mint first, in the GTD round on OpenSea, before anyone else."];
    }
    if (wl.fcfs.has(h)) {
      return ["on", "YOU ARE IN \u00b7 FCFS", live
        ? "First-come whitelist. You mint right after the GTD round on our OpenSea page, while supply lasts."
        : "First-come whitelist. You mint right after the GTD round on OpenSea, while supply lasts."];
    }
    // absent from a ROLLING list is "not yet", never a verdict — approvals
    // land in waves until the list locks for launch
    return wl.final
      ? ["off", "NOT ON THE LIST", live
        ? "The list is closed. You can still mint in the public round on OpenSea, after the whitelist rounds."
        : "The list is closed. You can still mint in the public round, after the whitelist rounds."]
      : ["hold", "NOT ON IT YET",
        "The list is being made name by name, and not everyone gets in. Sent the form? Check back later."];
  }

  // ---------------------------------------------------------------- the modal
  let veil = null;
  let restoreFocus = null;

  function close() {
    if (!veil) return;
    veil.remove();
    veil = null;
    document.removeEventListener("keydown", onKey);
    if (restoreFocus && restoreFocus.focus) restoreFocus.focus();
    restoreFocus = null;
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  /// opts.onApply: a street-mode caller routes "GO TO HR" to a real warp;
  /// without it the flat page's first zone section is the destination.
  function open(prefill, opts) {
    if (veil) close();
    opts = opts || {};
    restoreFocus = document.activeElement;

    veil = el("div", "wl-veil");
    veil.addEventListener("click", (e) => { if (e.target === veil) close(); });
    const box = el("div", "wl-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Allowlist check");
    const screen = el("div", "wl-screen");

    const head = el("div", "wl-head");
    head.appendChild(el("h2", null, "THE LIST"));
    const x = el("button", "wl-x", "✕ CLOSE");
    x.type = "button";
    x.addEventListener("click", close);
    head.appendChild(x);
    screen.appendChild(head);

    const row = el("div", "wl-row");
    const input = el("input");
    input.placeholder = "0x… your wallet address";
    input.spellcheck = false;
    input.autocapitalize = "off";
    input.autocomplete = "off";
    if (prefill && ADDR_RE.test(prefill)) input.value = prefill;
    const go = el("button", null, "CHECK");
    go.type = "button";
    row.appendChild(input);
    row.appendChild(go);
    screen.appendChild(row);

    const out = el("div", "wl-out");
    screen.appendChild(out);

    function verdict(kind, headline, why, act) {
      out.innerHTML = "";
      out.appendChild(el("div", "wl-verdict " + kind, headline));
      out.appendChild(el("p", "wl-why", why));
      if (act) {
        const wrap = el("div", "wl-act");
        let b;
        if (act.href) {
          // the one mint link the site shows: the OpenSea drop page, verbatim
          b = el("a", null, act.label);
          b.href = act.href;
          b.target = "_blank";
          b.rel = "noopener";
        } else {
          b = el("button", null, act.label);
          b.type = "button";
          b.addEventListener("click", act.run);
        }
        wrap.appendChild(b);
        out.appendChild(wrap);
      }
    }

    // a listed wallet (or a closed list, in public) goes to OpenSea to mint —
    // only once the drop page exists; before that there is nothing to link
    const toOpenSea = () => {
      const url = (window.FIRM_CFG || {}).mintUrl;
      return url ? { label: "MINT ON OPENSEA \u2197", href: url } : null;
    };
    const toHR = {
      label: "OPEN THE FORM",
      run() {
        close();
        if (opts.onApply) { opts.onApply(); return; }
        const secs = document.querySelectorAll("#fb-flat .zone-sec:not(.fh-sec)");
        if (secs[0]) secs[0].scrollIntoView({ behavior: "smooth", block: "start" });
      },
    };

    async function run() {
      const addr = input.value.trim();
      if (!ADDR_RE.test(addr)) {
        verdict("hold", "THAT IS NOT AN ADDRESS", "Paste your whole wallet address. It starts with 0x.");
        return;
      }
      verdict("hold", "CHECKING…", "");
      try {
        const wl = await loadList();
        if (wl) {
          const [kind, headline, why] = await checkList(addr, wl);
          // "not yet" earns the apply button; in and locked-out both get the
          // OpenSea link once it exists (a locked-out wallet still mints in
          // the public round there)
          // "not yet" earns the form only while applications are open
          const closed = !!(window.FIRM_CFG || {}).applyClosed;
          verdict(kind, headline, why, kind === "hold" ? (closed ? null : toHR) : toOpenSea());
          return;
        }
        if ((window.FIRM_CFG || {}).applyClosed) {
          // the cut is made but the names are not published yet: say so, offer nothing
          verdict("hold", "THE LIST IS BEING FINALIZED",
            "Applications are closed. The names drop here soon. Check back.");
          return;
        }
        verdict("hold", "THE FIRST NAMES DROP SOON",
          "Spots are limited and picked by hand. Fill in the form, then check back later.",
          toHR);
      } catch (e) {
        verdict("hold", "CAN'T CHECK RIGHT NOW", "Try again in a minute.");
      }
    }

    go.addEventListener("click", run);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

    box.appendChild(screen);
    veil.appendChild(box);
    document.body.appendChild(veil);
    document.addEventListener("keydown", onKey);
    input.focus();
  }

  // Entry points are the callers': level.js builds the zone-bar THE LIST
  // button beside DOCS (with the connected wallet as prefill and the real
  // application form as onApply), and flathero.js builds the flat chip. Both
  // call this guarded, so a stale cache means no button, never a dead one.
  window.__WL_CHECK = { open: open, close: close };
})();
