/* ===========================================================================
   THE OFFICE POOL — the referral card. Same machinery as the application
   card (xapply.js): drawn on canvas in the browser, 1200×628 (X's large
   image box), travels INSIDE the post — the share sheet on phones, the
   clipboard on desktop, a download as the last fallback — while the post
   text carries the player's link so the sender gets their 5%.
   Registers window.__POOL_CARD = { open }. pool.js calls it guarded.
   =========================================================================== */
(function () {
  "use strict";
  const F = window.Firm;
  const CFG = F ? F.CFG : {};
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /// unavatar sends CORS (verified for the application card); null → silhouette
  function loadPfp(handle) {
    if (!handle) return Promise.resolve(null);
    return new Promise((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = "https://unavatar.io/x/" + encodeURIComponent(handle) + "?fallback=false";
    });
  }

  function drawCard(canvas, d) {
    const W = 1200, H = 628;
    canvas.width = W; canvas.height = H;
    const x = canvas.getContext("2d");
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1a11"); bg.addColorStop(1, "#06110b");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = "#06080c"; x.lineWidth = 16; x.strokeRect(8, 8, W - 16, H - 16);
    x.strokeStyle = "#3a4148"; x.lineWidth = 4; x.strokeRect(22, 22, W - 44, H - 44);

    // the pfp in its gold frame, or the firm's silhouette
    const PX = 78, PY = 120, PS = 280;
    x.fillStyle = "#8a6d35"; x.fillRect(PX - 14, PY - 14, PS + 28, PS + 28);
    x.fillStyle = "#06080c"; x.fillRect(PX - 6, PY - 6, PS + 12, PS + 12);
    if (d.pfp) x.drawImage(d.pfp, PX, PY, PS, PS);
    else {
      x.fillStyle = "#0f2418"; x.fillRect(PX, PY, PS, PS);
      x.fillStyle = "#2f6b47";
      x.beginPath(); x.arc(PX + PS / 2, PY + 100, 58, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(PX + PS / 2, PY + 300, 122, Math.PI, 0); x.fill();
    }
    x.fillStyle = "#ffc933";
    for (const [cx, cy] of [[PX - 14, PY - 14], [PX + PS + 2, PY - 14], [PX - 14, PY + PS + 2], [PX + PS + 2, PY + PS + 2]]) x.fillRect(cx, cy, 12, 12);
    x.textAlign = "center"; x.fillStyle = "#fff3dc";
    const who = d.handle ? "@" + d.handle : d.code;
    for (let size = 28; size >= 16; size -= 2) { x.font = size + "px 'Press Start 2P', monospace"; if (x.measureText(who).width <= PS + 40) break; }
    x.fillText(who, PX + PS / 2, PY + PS + 62);
    x.fillStyle = "#67b184"; x.font = "18px 'Press Start 2P', monospace";
    x.fillText("is in today's pool", PX + PS / 2, PY + PS + 98);

    // the right column: the jackpot is the hero
    const RX = 440;
    x.textAlign = "left";
    const fit = (text, y, color, max, from, to) => {
      x.fillStyle = color;
      for (let size = from; size >= to; size -= 2) { x.font = size + "px 'Press Start 2P', monospace"; if (x.measureText(text).width <= max) break; }
      x.fillText(text, RX, y);
    };
    fit("THE OFFICE POOL · FIRM BROKERS", 112, "#ffc933", 700, 22, 14);
    fit("TODAY'S JACKPOT", 168, "#67b184", 700, 20, 14);
    x.save();
    x.shadowColor = "#b6ffcf"; x.shadowBlur = 30;
    fit(d.jackpot + " $9TO5", 262, "#b6ffcf", 700, 72, 40);
    x.restore();
    fit("one takes the jackpot", 330, "#fff3dc", 700, 26, 16);
    fit("one gets their money back", 374, "#fff3dc", 700, 26, 16);
    fit("chip in before the " + d.bell + " NY bell", 418, "#c6d1da", 700, 22, 14);
    x.fillStyle = "#8a6d35"; x.fillRect(RX, 448, 700, 6);
    fit("sent by " + d.code, 500, "#ffc933", 700, 24, 14);
    fit(d.link.replace(/^https?:\/\//, ""), 546, "#c6d1da", 700, 20, 12);

    x.fillStyle = "rgba(0,0,0,0.14)";
    for (let sy = 26; sy < H - 26; sy += 4) x.fillRect(26, sy, W - 52, 2);
  }

  // ---------------------------------------------------------------- the modal
  let modal = null, state = null;
  function close() { if (modal) modal.remove(); modal = null; document.removeEventListener("keydown", onKey); }
  function onKey(e) { if (e.key === "Escape") close(); }

  const cardBlob = () => new Promise((res) => { const cv = document.createElement("canvas"); drawCard(cv, state); cv.toBlob(res, "image/png"); });
  const isTouch = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

  /// d: { code, link, jackpot (formatted), bell ("4:00 PM"), postText }
  async function open(d) {
    close();
    state = Object.assign({ handle: "", pfp: null }, d);
    try { state.handle = (localStorage.getItem("firmbrokers.pool.handle") || "").replace(/^@/, ""); } catch (e) {}
    try { await document.fonts.load("20px 'Press Start 2P'"); } catch (e) {}
    modal = el("div", "pc-overlay");
    modal.innerHTML = `<div class="pc-box"><div class="pc-head"><span class="lab">YOUR CARD</span><button class="chip pc-x" type="button">CLOSE</button></div>
      <div class="pc-row"><span class="dim">your X handle</span><input type="text" class="pc-handle" placeholder="optional · puts your picture on it" value="${esc(state.handle)}" autocapitalize="off" spellcheck="false"></div>
      <div class="pc-card"><canvas></canvas></div>
      <div class="pc-post"><div class="dim">the post</div><div class="pc-text"></div></div>
      <div class="pc-actions"><button class="go pc-share" type="button">POST ON X</button><button class="chip pc-dl" type="button">DOWNLOAD</button><button class="chip pc-copy" type="button">COPY LINK</button></div>
      <div class="fine pc-hint">the card goes with the post: on a phone the share sheet opens X with it attached; on a desktop it is copied — press ⌘V (ctrl+V) in the post box.</div></div>`;
    document.body.appendChild(modal);
    document.addEventListener("keydown", onKey);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".pc-x").addEventListener("click", close);
    const canvas = modal.querySelector("canvas");
    const textEl = modal.querySelector(".pc-text");
    const hint = modal.querySelector(".pc-hint");
    const paint = () => { drawCard(canvas, state); textEl.textContent = state.postText; };
    paint();
    if (state.handle) loadPfp(state.handle).then((img) => { state.pfp = img; paint(); });
    const input = modal.querySelector(".pc-handle");
    let t = null;
    input.addEventListener("input", () => {
      state.handle = input.value.trim().replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
      try { localStorage.setItem("firmbrokers.pool.handle", state.handle); } catch (e) {}
      state.pfp = null; paint();
      clearTimeout(t); t = setTimeout(() => loadPfp(state.handle).then((img) => { if (img) { state.pfp = img; paint(); } }), 500);
    });
    modal.querySelector(".pc-copy").addEventListener("click", () => { if (navigator.clipboard) navigator.clipboard.writeText(state.link).then(() => { hint.textContent = "link copied"; }); });
    modal.querySelector(".pc-dl").addEventListener("click", async () => {
      const blob = await cardBlob(); if (!blob) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "office-pool-" + state.code + ".png"; a.click();
    });
    modal.querySelector(".pc-share").addEventListener("click", () => {
      const blobP = cardBlob();
      const intent = "https://x.com/intent/post?text=" + encodeURIComponent(state.postText);
      const fallbackDownload = (blob) => {
        if (!blob) return;
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "office-pool-" + state.code + ".png"; a.click();
        hint.innerHTML = "your card just <b>downloaded</b> — attach it to the post with the image button, then post.";
      };
      if (isTouch() && navigator.share) {
        (async () => {
          const blob = await blobP;
          const file = blob && new File([blob], "office-pool-" + state.code + ".png", { type: "image/png" });
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ text: state.postText, files: [file] }); hint.textContent = "posted? your link is in it — 5% of every chip-in from whoever arrives is yours."; return; }
            catch (e) { /* sheet dismissed */ }
          }
          fallbackDownload(blob);
          window.open(intent, "_blank", "noopener");
        })();
        return;
      }
      let wrote = null;
      try { if (navigator.clipboard && window.ClipboardItem) wrote = navigator.clipboard.write([new ClipboardItem({ "image/png": blobP })]); } catch (e) { wrote = null; }
      window.open(intent, "_blank", "noopener");
      if (wrote) { hint.innerHTML = "your card is <b>copied</b> — in the post box, press <b>⌘V</b> (ctrl+V) to attach it, then post."; wrote.catch(async () => fallbackDownload(await blobP)); }
      else blobP.then(fallbackDownload);
    });
  }

  window.__POOL_CARD = { open, drawCard };
})();
