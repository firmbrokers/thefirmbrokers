// Firm Brokers — the application, campaign A. Wallet + handle, done.
//
// Two steps: paste the wallet that will mint, type the X handle, and the
// card draws itself while they type. APPLY sends both (plus the captcha
// token) to the Worker, which writes wl2. The card is the SUCCESS REWARD:
// download it, and — entirely optional — post it. No post is required, no
// permissions are ever asked, nothing is verified beyond the captcha: the
// goal of this campaign is volume, and the sellout is the point.
//
// Self-contained like lobby.js: level.js's openApply hands over here
// when this module is present (`window.__X_APPLY`), passing `grant` so the
// street's clearance (booth lamps, HR door) keeps working unchanged.
(function () {
  "use strict";

  const CFG = window.FIRM_CFG;
  const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
  const XNAME_RE = /^[A-Za-z0-9_]{1,15}$/;
  const POST_RE = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{10,25}/;

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  // ---------------------------------------------------------------- code
  /// FB- + the first six hex of sha256(lowercased address). The Worker derives
  /// the same thing server-side and refuses a mismatch, so this is a rendering
  /// of the rule, not the rule.
  async function codeFor(evm) {
    const data = new TextEncoder().encode(evm.toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return "FB-" + hex.slice(0, 6).toUpperCase();
  }

  // ---------------------------------------------------------------- pfp
  /// unavatar first (it sends CORS, verified), the Worker's proxy as fallback,
  /// null when neither answers — the card then draws its silhouette.
  function loadPfp(handle) {
    const tryUrl = (src) => new Promise((res) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
    return tryUrl("https://unavatar.io/x/" + handle + "?fallback=false").then(
      (img) => img || tryUrl(CFG.applyUrl + "/pfp/" + handle)
    );
  }

  // ---------------------------------------------------------------- card
  /// 1200x628, the exact box X renders for a summary_large_image. Palette is
  /// the street's own. Deterministic apart from the pfp, so the same wallet
  /// always draws the same card.
  function drawCard(canvas, { handle, code, pfp }) {
    const W = 1200, H = 628;
    canvas.width = W; canvas.height = H;
    const x = canvas.getContext("2d");

    // the room: dark screen, ink frame, steel ring
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#131924"); bg.addColorStop(1, "#0a0e14");
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.strokeStyle = "#06080c"; x.lineWidth = 16; x.strokeRect(8, 8, W - 16, H - 16);
    x.strokeStyle = "#3a4148"; x.lineWidth = 4; x.strokeRect(22, 22, W - 44, H - 44);

    // the skyline along the bottom, seeded by the code so it never shuffles
    let seed = 0;
    for (const c of code) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    x.fillStyle = "#1d2634";
    let bx = 30;
    while (bx < W - 40) {
      const bw = 46 + Math.floor(rnd() * 60);
      const bh = 40 + Math.floor(rnd() * 90);
      x.fillRect(bx, H - 30 - bh, Math.min(bw, W - 40 - bx), bh);
      bx += bw + 10;
    }
    x.fillStyle = "#06080c"; x.fillRect(24, H - 34, W - 48, 12);

    // the pfp in its gold frame
    const PX = 78, PY = 130, PS = 300;
    x.fillStyle = "#8a6d35"; x.fillRect(PX - 14, PY - 14, PS + 28, PS + 28);
    x.fillStyle = "#06080c"; x.fillRect(PX - 6, PY - 6, PS + 12, PS + 12);
    if (pfp) {
      x.drawImage(pfp, PX, PY, PS, PS);
    } else {
      x.fillStyle = "#182029"; x.fillRect(PX, PY, PS, PS);
      x.fillStyle = "#3a4148";
      x.beginPath(); x.arc(PX + PS / 2, PY + 110, 62, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(PX + PS / 2, PY + 320, 130, Math.PI, 0); x.fill();
    }
    // corner pins, like the room's boards
    x.fillStyle = "#ffc933";
    for (const [cx, cy] of [[PX - 14, PY - 14], [PX + PS + 2, PY - 14], [PX - 14, PY + PS + 2], [PX + PS + 2, PY + PS + 2]]) {
      x.fillRect(cx, cy, 12, 12);
    }
    // the handle under the frame
    x.textAlign = "center";
    x.fillStyle = "#fff3dc";
    x.font = "600 30px 'Press Start 2P', monospace";
    let hText = "@" + handle;
    if (x.measureText(hText).width > PS + 60) x.font = "600 22px 'Press Start 2P', monospace";
    x.fillText(hText, PX + PS / 2, PY + PS + 66);

    // the right column
    const RX = 470;
    x.textAlign = "left";
    x.fillStyle = "#ffc933";
    // "FIRM BROKERS" is the name, not "The Firm". Fit-guard the wider string so
    // it can never clip the card edge (measures 660px at 22px; budget ~686).
    let eyebrow = "FIRM BROKERS \u00b7 ROBINHOOD CHAIN";
    for (let size = 22; size >= 16; size -= 2) { x.font = size + "px 'Press Start 2P', monospace"; if (x.measureText(eyebrow).width <= 680) break; }
    x.fillText(eyebrow, RX, 120);
    x.fillStyle = "#fff3dc";
    x.font = "54px 'Press Start 2P', monospace";
    x.fillText("EMPLOYMENT", RX, 205);
    x.fillText("APPLICATION", RX, 275);
    x.save();
    x.shadowColor = "#6fe08c"; x.shadowBlur = 26;
    x.fillStyle = "#6fe08c";
    x.font = "44px 'Press Start 2P', monospace";
    x.fillText(code, RX, 356);
    x.restore();
    x.fillStyle = "#8a6d35"; x.fillRect(RX, 388, 640, 6);
    // Each line measures itself into the 640px column and steps down until it
    // fits — the live card clipped "robinhood chain" off the frame's edge, and
    // a canvas never wraps, it just keeps painting past the border.
    const fitLine = (text, y, color) => {
      x.fillStyle = color;
      for (let size = 26; size >= 16; size -= 2) {
        x.font = size + "px 'Press Start 2P', monospace";
        if (x.measureText(text).width <= 640) break;
      }
      x.fillText(text, RX, y);
    };
    // no supply number on the card: posts and cards outlive decisions
    fitLine("pixel brokers on robinhood chain", 448, "#c6d1da");
    fitLine("paid every hour in stocks", 494, "#c6d1da");
    fitLine("$9TO5 · thefirmbrokers.com", 540, "#ffc933");

    // scanlines, over everything but inside the ring
    x.fillStyle = "rgba(0,0,0,0.14)";
    for (let sy = 26; sy < H - 26; sy += 4) x.fillRect(26, sy, W - 52, 2);
  }

  // ------------------------------------------------------------ turnstile
  /// The same widget the old booth used. One token per POST: taken before the
  /// call, reset after, refused calls surface as errors rather than retries.
  let tsLoad = null, tsWidget = null, tsHost = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (tsLoad) return tsLoad;
    tsLoad = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.defer = true;
      s.onload = () => (window.turnstile ? res(window.turnstile) : rej(new Error("no api")));
      s.onerror = () => { tsLoad = null; rej(new Error("blocked")); };
      document.head.appendChild(s);
    });
    return tsLoad;
  }
  function mountTurnstile(host) {
    tsHost = host;
    if (!CFG.turnstileSiteKey) return;
    loadTurnstile().then((ts) => {
      if (!tsHost || !tsHost.isConnected) return;
      tsWidget = ts.render(tsHost, { sitekey: CFG.turnstileSiteKey, theme: "dark" });
    }).catch(() => { /* absent widget sends an empty token; the Worker decides */ });
  }
  const tsToken = () => {
    try { return window.turnstile && tsWidget !== null ? window.turnstile.getResponse(tsWidget) || "" : ""; }
    catch (e) { return ""; }
  };
  const tsReset = () => { try { if (window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget); } catch (e) {} };

  // ---------------------------------------------------------------- referral
  // A source/referral code, for INTERNAL attribution only (which community sent
  // an applicant). Optional, accepts anything, normalized to a clean token, and
  // pre-filled from ?ref=CODE so a partner can just share a tagged link.
  function sanitizeRef(v) { return String(v || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32); }
  const REF0 = (() => { try { return sanitizeRef(new URLSearchParams(location.search).get("ref") || ""); } catch (e) { return ""; } })();

  // ---------------------------------------------------------------- modal
  const state = { evm: "", handle: "", code: "", cardUrl: "", pfp: null, step: 0, busy: false, ref: REF0 };
  let wrap = null, hooks = null;

  function close() {
    if (wrap) { wrap.remove(); wrap = null; tsWidget = null; tsHost = null; }
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  function postText() {
    return String(CFG.applyPost || "").replace("{code}", state.code);
  }

  function open(h) {
    hooks = h || {};
    close();
    wrap = el("div", "xa-wrap");
    wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });
    const modal = el("div", "xa-modal");
    modal.appendChild(el("div", "xa-head", "EMPLOYMENT APPLICATION"));
    const closeBtn = el("button", "xa-close", "X");
    closeBtn.addEventListener("click", close);
    modal.querySelector(".xa-head").appendChild(closeBtn);
    const dots = el("div", "xa-steps", "<i></i><i></i><i></i><i></i>");
    modal.appendChild(dots);
    modal.appendChild(el("div", "xa-body"));
    const foot = el("div", "xa-foot");
    foot.appendChild(el("div", "xa-ts"));
    foot.appendChild(el("div", "xa-note", "NO PERMISSIONS ASKED · NOTHING CONNECTS"));
    modal.appendChild(foot);
    wrap.appendChild(modal);
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);
    mountTurnstile(foot.querySelector(".xa-ts"));
    state.step = 0;
    paint();
  }

  function paint() {
    const body = wrap.querySelector(".xa-body");
    body.innerHTML = "";
    wrap.querySelectorAll(".xa-steps i").forEach((d, i) => {
      d.className = i < state.step ? "done" : i === state.step ? "on" : "";
    });
    [stepWallet, stepHandle, stepPost, stepVerify][state.step](body);
  }

  const err = (body, msg) => {
    let e = body.querySelector(".xa-err");
    if (!e) { e = el("div", "xa-err"); body.appendChild(e); }
    e.textContent = msg;
    e.classList.add("show");
  };

  // step 1 — the wallet
  function stepWallet(body) {
    body.appendChild(el("div", "xa-title", "STEP 1 · YOUR WALLET"));
    body.appendChild(el("div", "xa-sub", "The wallet that will mint. Paste it. Nothing connects."));
    const row = el("div", "xa-row");
    const input = el("input", "xa-input");
    input.placeholder = "0x…";
    input.value = state.evm;
    input.spellcheck = false;
    const use = el("button", "fb-btn xa-btn ghost", "USE MY WALLET");
    use.style.display = window.ethereum ? "" : "none";
    use.addEventListener("click", async () => {
      try {
        const acc = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (acc && acc[0]) input.value = acc[0];
      } catch (e) { /* they closed the wallet window */ }
    });
    const next = el("button", "fb-btn xa-btn", "NEXT");
    next.addEventListener("click", async () => {
      const v = input.value.trim();
      if (!EVM_RE.test(v)) return err(body, "That is not an address. It starts 0x and has 40 characters after.");
      state.evm = v;
      state.ref = sanitizeRef(refInput.value);
      state.code = await codeFor(v);
      state.step = 1;
      paint();
    });
    row.appendChild(input); row.appendChild(use);
    body.appendChild(row);

    // referral code (optional). Pre-fills from ?ref=, stays out of the way.
    const refRow = el("div", "xa-row");
    const refInput = el("input", "xa-input");
    refInput.placeholder = "Referral code (optional)";
    refInput.value = state.ref;
    refInput.spellcheck = false;
    refInput.addEventListener("input", () => { state.ref = sanitizeRef(refInput.value); });
    refRow.appendChild(refInput);
    body.appendChild(refRow);

    const nextRow = el("div", "xa-row");
    nextRow.appendChild(next);
    body.appendChild(nextRow);
  }

  // step 2 — the handle, and the card drawing itself
  function stepHandle(body) {
    body.appendChild(el("div", "xa-title", "STEP 2 · YOUR X ACCOUNT"));
    body.appendChild(el("div", "xa-sub", "Your X handle. The card draws itself."));
    const row = el("div", "xa-row");
    const input = el("input", "xa-input");
    input.placeholder = "@yourhandle";
    input.value = state.handle;
    input.spellcheck = false;
    row.appendChild(input);
    body.appendChild(row);
    const cardwrap = el("div", "xa-cardwrap");
    const canvas = document.createElement("canvas");
    cardwrap.appendChild(canvas);
    body.appendChild(cardwrap);
    drawCard(canvas, { handle: state.handle || "you", code: state.code, pfp: state.pfp });

    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const h = input.value.trim().replace(/^@+/, "");
        if (!XNAME_RE.test(h)) return;
        state.handle = h;
        state.pfp = await loadPfp(h);
        drawCard(canvas, { handle: h, code: state.code, pfp: state.pfp });
      }, 450);
    });

    const row2 = el("div", "xa-row");
    const back = el("button", "fb-btn xa-btn ghost", "← BACK");
    back.addEventListener("click", () => { state.step = 0; paint(); });
    const next = el("button", "fb-btn xa-btn", "LOOKS LIKE ME →");
    next.addEventListener("click", async () => {
      const h = input.value.trim().replace(/^@+/, "");
      if (!XNAME_RE.test(h)) return err(body, "That is not a handle. Letters, numbers and _ only.");
      state.handle = h;
      if (!state.pfp) { state.pfp = await loadPfp(h); }
      state.step = 2;
      paint();
    });
    row2.appendChild(back); row2.appendChild(next);
    body.appendChild(row2);
  }

  // step 3 — the post, shown AS the post: text and card together, exactly
  // what will land on the timeline. The card travels inside the post itself:
  // the share sheet attaches it on phones; on desktop it is copied to the
  // clipboard and one paste drops it into the composer. No link in the tweet.
  function cardBlob() {
    return new Promise((res) => {
      const cv = document.createElement("canvas");
      drawCard(cv, { handle: state.handle, code: state.code, pfp: state.pfp });
      cv.toBlob(res, "image/png");
    });
  }
  function stepPost(body) {
    body.appendChild(el("div", "xa-title", "STEP 3 · POST IT"));
    body.appendChild(el("div", "xa-mandate", "<b>Posting this IS the application.</b> No post, no whitelist."));
    const mock = el("div", "xa-mock");
    const head = el("div", "head");
    if (state.pfp) { const im = el("img"); im.src = state.pfp.src; head.appendChild(im); }
    head.appendChild(el("b", null, "@" + state.handle));
    mock.appendChild(head);
    mock.appendChild(el("div", "txt", postText()));
    const cv = document.createElement("canvas");
    drawCard(cv, { handle: state.handle, code: state.code, pfp: state.pfp });
    const imwrap = el("div", "cardimg");
    imwrap.appendChild(cv);
    mock.appendChild(imwrap);
    body.appendChild(mock);
    const hint = el("div", "xa-sub xa-hint");
    body.appendChild(hint);
    const row = el("div", "xa-row");
    const back = el("button", "fb-btn xa-btn ghost", "← BACK");
    back.addEventListener("click", () => { state.step = 1; paint(); });
    const post = el("button", "fb-btn xa-btn", "POST ON X");
    /// Two worlds, told apart by TOUCH, not by canShare: macOS Safari says it
    /// can share files, then opens an AirDrop sheet with no X in it. Phones
    /// (and touch iPads) get the share sheet — X opens with the card attached.
    /// Desktop gets the composer tab SYNCHRONOUSLY on the click (popup rules)
    /// while the card lands on the clipboard in the same gesture — Safari
    /// accepts a ClipboardItem whose value is a promise, which is the one
    /// pattern that survives its gesture timing.
    const isTouch = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
    post.addEventListener("click", () => {
      const blobP = cardBlob();
      const fallbackDownload = (blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "firm-application-" + state.code + ".png";
        a.click();
        hint.innerHTML = "your card just <b>downloaded</b> — attach it to the post with the image button, then post.";
      };
      if (isTouch && navigator.share) {
        (async () => {
          const blob = await blobP;
          const file = blob && new File([blob], "firm-application-" + state.code + ".png", { type: "image/png" });
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ text: postText(), files: [file] }); state.step = 3; paint(); return; }
            catch (e) { /* sheet dismissed */ }
          }
          fallbackDownload(blob);
          window.open("https://x.com/intent/post?text=" + encodeURIComponent(postText()), "_blank", "noopener");
        })();
        return;
      }
      // desktop: everything gesture-bound happens NOW, synchronously
      let wrote = null;
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          wrote = navigator.clipboard.write([new ClipboardItem({ "image/png": blobP })]);
        }
      } catch (e) { wrote = null; }
      window.open("https://x.com/intent/post?text=" + encodeURIComponent(postText()), "_blank", "noopener");
      if (wrote) {
        hint.innerHTML = "your card is <b>copied</b> — in the post box, press <b>⌘V</b> (ctrl+V) to attach it, then post.";
        wrote.catch(async () => fallbackDownload(await blobP));
      } else {
        blobP.then(fallbackDownload);
      }
    });
    // some people would rather download the card and attach it by hand — an
    // explicit button, not just the auto-download fallback on POST.
    const dl = el("button", "fb-btn xa-btn ghost", "DOWNLOAD CARD");
    dl.addEventListener("click", async () => {
      const blob = await cardBlob();
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "firm-application-" + state.code + ".png";
      a.click();
      hint.innerHTML = "card <b>downloaded</b> \u2014 attach it to your post with X's image button, then paste your post link in the next step.";
    });
    const done = el("button", "fb-btn xa-btn", "I POSTED IT →");
    done.addEventListener("click", () => { state.step = 3; paint(); });
    row.appendChild(back); row.appendChild(post); row.appendChild(dl); row.appendChild(done);
    body.appendChild(row);
  }

  // step 4 — the proof
  function stepVerify(body) {
    body.appendChild(el("div", "xa-title", "STEP 4 · SHOW US THE POST"));
    body.appendChild(el("div", "xa-sub", "Paste your post's link."));
    const row = el("div", "xa-row");
    const input = el("input", "xa-input");
    input.placeholder = "https://x.com/you/status/…";
    input.spellcheck = false;
    const back = el("button", "fb-btn xa-btn ghost", "← BACK");
    back.addEventListener("click", () => { state.step = 2; paint(); });
    const verify = el("button", "fb-btn xa-btn", "VERIFY");
    verify.addEventListener("click", async () => {
      const v = input.value.trim();
      if (!POST_RE.test(v)) return err(body, "That is not a post link. It looks like x.com/you/status/12345…");
      if (state.busy) return;
      state.busy = true;
      verify.textContent = "READING…";
      try {
        const r = await fetch(CFG.applyUrl + "/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evm: state.evm, x: state.handle, tweet: v, ref: state.ref, ts: tsToken() }),
        });
        const out = await r.json();
        tsReset();
        if (!r.ok) {
          const say = {
            "wrong account": "That post is by @" + (out.author || "someone else") + ", not @" + state.handle + ". Post from your own account.",
            "code missing": "Your code " + state.code + " is not in that post. Post the text exactly as step 3 shows it.",
            "template missing": "That post is missing the application text. Use the POST ON X button in step 3.",
            "post not found": "X does not know that post. Is the link right, and the post public?",
            "tag missing": "The post must tag @" + (CFG.x || "thefirmbrokers") + ". Post it as step 3 shows it.",
            "card missing": "Your card is not attached. Post again with the card image on it.",
            "handle taken": "That X account already applied with a different wallet.",
            "captcha": "The robot check refused. Solve the checkbox below and try again.",
          }[out.error] || "Could not verify. Try again in a moment.";
          throw new Error(say);
        }
        success(body);
      } catch (e) {
        err(body, e.message || "Could not verify. Try again in a moment.");
        verify.textContent = "VERIFY";
      }
      state.busy = false;
    });
    row.appendChild(input);
    body.appendChild(row);
    const row2 = el("div", "xa-row");
    row2.style.marginTop = "10px";
    row2.appendChild(back); row2.appendChild(verify);
    body.appendChild(row2);
  }

  function success(body) {
    wrap.querySelectorAll(".xa-steps i").forEach((d) => (d.className = "done"));
    body.innerHTML = "";
    const ok = el("div", "xa-ok");
    // An application is an application. Approval is a separate act — the
    // waves land in THE LIST, and the checker is the only voice that says
    // "you are in". This screen must never promise what only a wave grants.
    ok.appendChild(el("b", null, "APPLICATION RECEIVED"));
    ok.appendChild(el("span", null, "@" + state.handle + " · " + state.code + "<br>You're in the pile. Approvals land in waves — check THE LIST to see when your name comes up. The card is yours either way."));
    const cardwrap = el("div", "xa-cardwrap");
    const cv = document.createElement("canvas");
    drawCard(cv, { handle: state.handle, code: state.code, pfp: state.pfp });
    cardwrap.appendChild(cv);
    ok.appendChild(cardwrap);
    const row = el("div", "xa-row");
    row.style.justifyContent = "center";
    const dl = el("a", "fb-btn xa-btn ghost", "DOWNLOAD YOUR CARD");
    cv.toBlob((b) => { if (b) { dl.href = URL.createObjectURL(b); dl.download = "firm-application-" + state.code + ".png"; } }, "image/png");
    const check = el("button", "fb-btn xa-btn ghost", "CHECK THE LIST");
    check.style.display = window.__WL_CHECK ? "" : "none";
    check.addEventListener("click", () => { const evm = state.evm; close(); window.__WL_CHECK.open(evm); });
    const done = el("button", "fb-btn xa-btn", "DONE");
    done.addEventListener("click", () => {
      const after = hooks.onPass;
      close();
      if (after) after();
    });
    row.appendChild(dl); row.appendChild(check); row.appendChild(done);
    ok.appendChild(row);
    body.appendChild(ok);
    if (hooks.grant) hooks.grant({ evm: state.evm, user: state.handle });
  }

  window.__X_APPLY = { open, drawCard, codeFor };
})();
