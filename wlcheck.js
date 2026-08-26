/* ===========================================================================
   THE LIST — "am I on it?" checker.

   One modal, three sources of truth, always the strongest available and never
   a stronger claim than the source supports:

   1. CHAIN (FIRM_CFG.nft is set): the contract answers — allowlisted(),
      mintAllowance(), mintedBy(), and the phase flags. Definitive, live.
   2. LIST (site/wl.json exists and is non-empty): the allowlist as approved
      SO FAR, shipped as sha256 hashes of lowercased addresses (the addresses
      themselves are not published until the chain makes them public anyway).
      Approvals land in WAVES while applications are open, so an address that
      is absent is "not on it YET" — never a definitive no — until the file
      says final:true (wl/build.py --final, run at the launch lock). Built by
      wl/build.py from wl/allowlist.txt — the SAME file
      script/Allowlist.s.sol loads on-chain, so this page and the contract can
      never disagree. Refetched every couple of minutes so a tab left open
      sees new waves without a reload.
   3. PENDING (neither): the honest answer is that no wave has been posted
      yet. Deliberately NOT wired to the application Worker: nobody on this
      side owns it, and "nope" from a catch-all must never render as "you are
      not on the list".

   Self-contained on purpose (own CSS, wl- prefix, own rpc caller): it
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
  const SEL = {
    mintOpen: "0x24bbd049",
    publicOpen: "0xba70c515",
    allowlisted: "0x03f45d41",
    mintAllowance: "0xc5119ff8",
    mintedBy: "0x3cef28d2",
  };
  const word = (addr) => addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const toNum = (hex) => (!hex || hex === "0x" ? 0 : Number(BigInt(hex)));

  /// One JSON-RPC batch against the configured endpoints, first that answers.
  async function ethBatch(calls) {
    const cfg = window.FIRM_CFG || {};
    const body = calls.map((c, i) => ({
      jsonrpc: "2.0", id: i + 1, method: "eth_call", params: [c, "latest"],
    }));
    let lastErr;
    for (const url of cfg.rpcs || []) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctl.signal,
        });
        clearTimeout(t);
        if (!r.ok) throw new Error("http " + r.status);
        const out = await r.json();
        const byId = new Map(out.map((o) => [o.id, o]));
        return calls.map((_, i) => {
          const o = byId.get(i + 1);
          if (!o || o.error) throw new Error("rpc error");
          return o.result;
        });
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("no rpc");
  }

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
        .then((j) => (j && j.algo === "sha256(lowercase)" && Array.isArray(j.hashes) && j.hashes.length
          ? { set: new Set(j.hashes), final: !!j.final } : null))
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
  async function checkChain(addr) {
    const nft = (window.FIRM_CFG || {}).nft;
    const r = await ethBatch([
      { to: nft, data: SEL.mintOpen },
      { to: nft, data: SEL.publicOpen },
      { to: nft, data: SEL.allowlisted + word(addr) },
      { to: nft, data: SEL.mintAllowance + word(addr) },
      { to: nft, data: SEL.mintedBy + word(addr) },
    ]);
    const open = !!toNum(r[0]);
    const pub = !!toNum(r[1]);
    const listed = !!toNum(r[2]);
    const left = toNum(r[3]);
    const took = toNum(r[4]);
    const taken = took ? " It has hired " + took + " already." : "";

    if (!open) {
      return listed
        ? ["on", "YOU ARE IN", "You mint first: 3 per wallet, before the doors open to everyone.", open]
        : ["off", "NOT ON THE LIST", "The list is locked. You can still mint 3 in the public sale.", open];
    }
    if (!pub) {
      return listed
        ? ["on", "YOU ARE IN", "The early door is open. You can mint " + left + " right now." + taken, open]
        : ["off", "NOT ON THE LIST", "The public sale comes next. Every wallet gets 3 then.", open];
    }
    return [left > 0 ? "on" : "hold", "DOORS OPEN TO EVERYONE",
      (left > 0 ? "This wallet can still hire " + left + "." + taken : "This wallet has taken its whole allocation." + taken), open];
  }

  async function checkList(addr, wl) {
    const hit = wl.set.has(await sha256Hex(addr.toLowerCase()));
    if (hit) {
      return ["on", "YOU ARE IN",
        "You made the list. You mint first: 3 per wallet, before the doors open to everyone."];
    }
    // absent from a ROLLING list is "not yet", never a verdict — approvals
    // land in waves until the list locks for launch
    return wl.final
      ? ["off", "NOT ON THE LIST", "The list is closed. You can still mint 3 in the public sale."]
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
        const b = el("button", null, act.label);
        b.type = "button";
        b.addEventListener("click", act.run);
        wrap.appendChild(b);
        out.appendChild(wrap);
      }
    }

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
        if ((window.FIRM_CFG || {}).nft) {
          const [kind, headline, why, mintOpen] = await checkChain(addr);
          // The on-chain list is loaded at runbook step 8c, AFTER config.js is
          // filled in with the contract address. In that window the chain
          // honestly reports "not listed" for EVERYONE, which would tell every
          // approved wallet the list is locked against them. Until the mint
          // opens, the approved file settles it.
          // Once the mint IS open the chain is the only truth: answering from
          // the file then could send someone to a mint that reverts.
          if (kind === "off" && !mintOpen) {
            const wl = await loadList();
            if (wl) {
              const [k, h, w] = await checkList(addr, wl);
              verdict(k, h, w, k === "hold" ? toHR : null);
              return;
            }
          }
          verdict(kind, headline, why);
          return;
        }
        const wl = await loadList();
        if (wl) {
          const [kind, headline, why] = await checkList(addr, wl);
          // "not yet" earns the apply button; a locked no does not
          verdict(kind, headline, why, kind === "hold" ? toHR : null);
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
