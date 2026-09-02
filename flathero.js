/* ===========================================================================
   The flat page's street — the hero scene, the deal, and the staff strip.

   Flat mode used to be the landing page for every phone; it is now the PAGE
   button and the reduced-motion opt-out, since the street is the default at
   every width. It was the one place the project's identity did not exist: no
   street, no walkers, no art — a stack of text cards for exactly the visitors
   who arrive from an X post. This module puts the world into the first
   screenful:

   1. A compact street scene — the district skyline painted by city.js's own
      tile painters (same palette, same mood, so the two can never drift),
      the jumbotron billboard, and pedestrians in the collection's real
      mintable pieces and trait colours strolling past.
   2. THE DEAL, word for word the bus-stop poster from the street.
   3. THE STAFF — real bust art from the collection, the ten legendaries in
      gold frames, so a phone visitor sees what a broker looks like before
      the mint card asks them for ETH.

   Wired exactly like lobby.js: it registers window.__FLAT_HERO and level.js
   calls it guarded. Optional on purpose — html and js sit behind separate
   600s edge caches, so old level.js + this file, or new level.js without it,
   must both land on a working page (the old text hero is level.js's
   fallback branch).

   Every palette below is a real trait value from gen/generate.py's tables,
   and every worn piece is mintable — the hiring line's exclusives (waves,
   ponytail, brooch, clutch, attaché) stay the hiring line's, and nobody here
   clones a CAST or STAFF character outright.
   =========================================================================== */
(function () {
  "use strict";

  const CSS = `
  .fh-sec { max-width: 860px; margin: 0 auto 26px; }

  /* --- the scene ---------------------------------------------------------
     A window onto the street: sky, two skyline bands, pavement, billboard,
     people. --ground-h is overridden locally so everything borrowed from the
     street (walkers, pigeons) stands on THIS pavement, not the street's. */
  .fh-scene {
    position: relative; overflow: hidden;
    height: clamp(250px, 44vh, 330px);
    border: 4px solid var(--ink);
    box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.3);
    background: var(--sky);
    --ground-h: 88px;
  }
  .fh-band {
    position: absolute; left: 0; right: 0; pointer-events: none;
    /* -320px lands the window on a dense stretch of the tile — its first
       screenful is sparse and read as one lonely tower on a phone */
    background-repeat: repeat-x; background-position: -320px bottom;
    image-rendering: pixelated;
  }
  .fh-mid { bottom: var(--ground-h); height: min(calc(100% - var(--ground-h)), 200px); }
  .fh-groundband {
    position: absolute; left: 0; right: 0; bottom: 0; height: var(--ground-h);
    background-repeat: repeat-x; background-position: left top;
    image-rendering: pixelated;
    /* fallback if city.js is a stale cached copy without __CITY_STRIP */
    background-color: var(--concrete);
  }

  /* the jumbotron, scaled to fit a phone rather than a 640px street frame */
  .fh-bb {
    position: absolute; left: 50%; transform: translateX(-50%);
    bottom: calc(var(--ground-h) + var(--fh-lift, 66px));
    width: min(88%, 560px);
    background: #2a2f36; border: 4px solid var(--ink); padding: 8px;
    box-shadow: 0 0 22px #ffc93322, 6px 6px 0 rgba(0, 0, 0, 0.35);
  }
  .fh-bb::before, .fh-bb::after {
    content: ""; position: absolute; top: 100%; width: 14px;
    height: var(--fh-lift, 66px);
    background: linear-gradient(90deg, #3a4148, #21262c);
    border: 3px solid var(--ink);
  }
  .fh-bb::before { left: 16%; }
  .fh-bb::after { right: 16%; }
  .fh-bb .inner {
    position: relative; overflow: hidden; text-align: center;
    background: linear-gradient(#10151d, #0a0e14); border: 3px solid #06080c;
    padding: clamp(12px, 3.6vw, 20px) 14px;
  }
  .fh-bb .inner::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent 0 3px, #00000048 3px 4px);
  }
  .fh-bb .inner::before {
    content: ""; position: absolute; top: -60%; bottom: -60%; width: 46px;
    background: #ffffff10; transform: rotate(18deg);
    animation: fb-sweep 7s linear infinite;
  }
  .fh-bb h1 {
    font-family: var(--font-display);
    font-size: clamp(17px, 4.6vw, 27px);
    color: var(--gold); text-shadow: 0 0 10px #ffc93380, 2px 2px 0 #000;
    line-height: 1.5;
  }
  .fh-bb p {
    margin-top: 8px; color: #6fe08c;
    font-size: clamp(9px, 2.5vw, 16px); line-height: 1.6;
    text-shadow: 0 0 8px #6fe08c55;
  }

  .fh-scene .fb-walker { --px: 3px; }

  /* --- the deal ----------------------------------------------------------- */
  .fh-deal ol { list-style: none; margin-top: 10px; display: grid; gap: 8px; }
  .fh-deal li { padding-left: 2px; }
  .fh-deal li b { color: var(--gold); margin-right: 8px; }
  .fh-deal .fine { margin-top: 12px; }
  .fh-deal .walkrow {
    margin-top: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }

  /* --- section chips ------------------------------------------------------ */
  .fh-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .fh-chips button {
    font-family: var(--font-display); font-size: 9px; letter-spacing: 0.5px;
    padding: 10px 12px; cursor: pointer;
    background: #10151d; color: var(--gold); border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.3);
  }
  .fh-chips button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 rgba(0,0,0,.3); }

  /* --- the staff ---------------------------------------------------------- */
  .fh-staffrow {
    display: flex; gap: 10px; overflow-x: auto;
    padding: 4px 2px 12px; scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .fh-staffcard {
    flex: 0 0 auto; width: 88px; scroll-snap-align: start;
    background: #2a2f36; border: 3px solid var(--ink); padding: 6px;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.3); text-align: center;
  }
  /* 72 = the 24px art grid times exactly 3, so nearest-neighbour lands every
     sample inside the art pixel it belongs to; 74 shears the grid */
  .fh-staffcard img {
    display: block; width: 72px; height: 72px;
    image-rendering: pixelated;
    background: #10151d; border: 2px solid #06080c;
  }
  .fh-staffcard b {
    display: block; margin-top: 6px;
    font-family: var(--font-display); font-size: 8px; color: #9fe0af;
  }
  .fh-staffcard.leg { border-color: var(--gold-deep); }
  .fh-staffcard.leg b { color: var(--gold); }
  .fh-stafffoot { margin-top: 4px; }
  .fh-stafffoot a { color: var(--gold); }

  @media (prefers-reduced-motion: reduce) {
    .fh-bb .inner::before { animation: none; }
    .fh-scene .fb-pigeon.hop { animation: none; }
  }
  `;

  const style = document.createElement("style");
  style.id = "fb-flathero-css";
  style.textContent = CSS;
  document.head.appendChild(style);

  /* The pedestrians. Mintable pieces only, palettes straight from the trait
     tables (the hexes are the same values CAST and STAFF cite), and no
     combination that already walks the street or works a room. */
  const PEOPLE = [
    // Buzz · Tan · Navy · Blue — the commuter
    { look: "hr-buzz hd-briefcase",
      pal: { H: "#584636", S: "#d8ac80", d: "#9f7f5e", N: "#2a3858", D: "#1e2940", T: "#3454a0", L: "#16161a", M: "#111114" } },
    // Curls · Brown · Grey · Purple — reading on the way in
    { look: "hr-curls hd-newspaper ey-glasses",
      pal: { H: "#201c1a", S: "#966a48", d: "#734f34", N: "#6e727a", D: "#565a62", T: "#6e3e96", L: "#16161a", M: "#111114" } },
    // Blonde Part · Fair · Charcoal · Green Candle — coffee first
    { look: "hr-part hd-coffee",
      pal: { H: "#c8a860", S: "#eecaaa", d: "#c9a382", N: "#3a3a3e", D: "#2c2c30", T: "#388e54", L: "#16161a", M: "#111114" } },
  ];

  const WALK = ["walk-1", "walk-2", "walk-3", "walk-4", "walk-5", "walk-6"];
  const STRIDE = 9; // px of travel per frame step, matches the street's feel

  // The ten legendaries lead the strip; the eight regulars are a hand-picked
  // spread of ranks and suits so the row reads as a workforce, not one man
  // repeated. Ids are stable so the page is the same page on every visit.
  const LEGENDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const REGULARS = [77, 231, 404, 618, 905, 1204, 1533, 2222];

  // buildFlat() is re-run by every stats refresh, so this module keeps the
  // expensive and the visible things OUTSIDE the rebuild: painted strips are
  // cached, and pedestrian positions survive so nobody teleports mid-stroll.
  const stripCache = {};
  let savedPeople = null;
  let live = null; // { raf, io } of the scene currently on the page

  function strip(kind, w, h, over) {
    const key = kind + w + "x" + h;
    if (!stripCache[key] && window.__CITY_STRIP) {
      try { stripCache[key] = window.__CITY_STRIP(kind, w, h, over); } catch (e) { /* fallback colours stand */ }
    }
    return stripCache[key] || null;
  }

  window.__FLAT_HERO = function (ctx) {
    const { host, el, px, walkerEl, dress } = ctx;

    if (live) {
      cancelAnimationFrame(live.raf);
      if (live.io) live.io.disconnect();
      live = null;
    }

    // ---------------------------------------------------------- the scene
    const sec = el("section", "fh-sec");
    const scene = el("div", "fh-scene");
    scene.setAttribute("aria-label", "The street: the Firm Brokers billboard over the district skyline");
    if (window.__CITY_SKY) scene.style.background = window.__CITY_SKY;

    // One band, not the street's two: the far band is nearly all horizon haze
    // at this height and read as a blank wall behind the pavement.
    const mid = el("div", "fh-band fh-mid");
    // the street's haze values are sized for ~400px bands; at 200px they
    // painted a plain warm wall where the district should be
    const midTex = strip("mid", 1600, 200, { haze: 0.14, glow: 0.2 });
    if (midTex) mid.style.backgroundImage = "url(" + midTex + ")";
    else mid.style.background = "linear-gradient(transparent 30%, var(--skyline) 30%)";
    const ground = el("div", "fh-groundband");
    const gTex = strip("street", 1280, 88);
    if (gTex) ground.style.backgroundImage = "url(" + gTex + ")";

    const bb = el("div", "fh-bb",
      `<div class="inner"><h1>FIRM BROKERS</h1><p>GET HIRED. GET PAID EVERY HOUR.</p></div>`);

    scene.appendChild(mid);
    scene.appendChild(ground);
    scene.appendChild(bb);

    // pigeons stand on the local pavement because --ground-h is scoped here
    scene.appendChild(px(el("div", "fb-pigeon"), { left: "16%" }));
    scene.appendChild(px(el("div", "fb-pigeon hop"), { left: "70%" }));

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const people = PEOPLE.map((c, i) => {
      const n = walkerEl("fb-walker npc " + c.look);
      dress(n, c.pal);
      n.style.bottom = "var(--ground-h)";
      scene.appendChild(n);
      const prev = savedPeople && savedPeople[i];
      // the scene is not in the DOM yet, so its width is the section's:
      // full viewport up to the .fh-sec cap
      const w = Math.min(innerWidth, 860);
      return {
        elm: n,
        x: prev ? prev.x : Math.round(w * (0.12 + 0.3 * i)),
        dir: prev ? prev.dir : (i % 2 ? -1 : 1),
        speed: 16 + i * 5,
        phase: 0,
        pausedUntil: 0,
        pauseKind: "stand",
        nextPause: performance.now() + 4000 + i * 3000,
      };
    });

    if (still) {
      // reduced motion: a posed frame from the standing set, never a walk
      // frame — frozen mid-stride is a straddle, and it is whitelisted out
      const POSES = ["stand", "phone-a", "stand-b"];
      people.forEach((p, i) => {
        p.elm.dataset.frame = POSES[i % POSES.length];
        if (i % 2) p.elm.classList.add("face-left");
        p.elm.style.left = 12 + i * 30 + "%";
      });
    } else {
      people.forEach((p) => { p.elm.dataset.frame = "walk-1"; p.elm.style.left = p.x + "px"; });

      let prevT = performance.now();
      let width = scene.clientWidth || innerWidth;
      let widthAt = prevT;
      const step = (now) => {
        const dt = Math.min(0.05, (now - prevT) / 1000);
        prevT = now;
        if (now - widthAt > 500) { width = scene.clientWidth || width; widthAt = now; }
        for (const p of people) {
          if (now < p.pausedUntil) {
            p.elm.dataset.frame = p.pauseKind === "phone"
              ? (Math.floor(now / 300) % 2 ? "phone-b" : "phone-a")
              : (Math.floor(now / 900) % 2 ? "stand-b" : "stand");
            continue;
          }
          if (now >= p.nextPause) {
            p.pausedUntil = now + 1600 + Math.random() * 2000;
            p.nextPause = p.pausedUntil + 6000 + Math.random() * 8000;
            p.pauseKind = Math.random() < 0.4 ? "phone" : "stand";
            continue;
          }
          p.x += p.dir * p.speed * dt;
          p.phase = (p.phase + p.speed * dt) % (STRIDE * WALK.length);
          if (p.x > width + 60) p.x = -60;
          if (p.x < -60) p.x = width + 60;
          p.elm.dataset.frame = WALK[Math.floor(p.phase / STRIDE)];
          p.elm.classList.toggle("face-left", p.dir < 0);
          p.elm.style.left = p.x + "px";
        }
        savedPeople = people.map((p) => ({ x: p.x, dir: p.dir }));
        live.raf = requestAnimationFrame(step);
      };
      live = { raf: requestAnimationFrame(step), io: null };

      // no point walking a street nobody is looking at
      if ("IntersectionObserver" in window) {
        live.io = new IntersectionObserver((entries) => {
          if (!live) return;
          if (entries[0].isIntersecting) {
            prevT = performance.now();
            cancelAnimationFrame(live.raf);
            live.raf = requestAnimationFrame(step);
          } else {
            cancelAnimationFrame(live.raf);
          }
        });
        live.io.observe(scene);
      }
    }

    sec.appendChild(scene);
    host.appendChild(sec);

    // ---------------------------------------------------------- the deal
    // Word for word the street's bus-stop poster; the fee chain stays
    // qualitative here — docs.html walks the numbers properly.
    const dealSec = el("section", "fh-sec");
    const deal = el("div", "fb-card fh-deal");
    deal.innerHTML = `<h2>THE DEAL</h2>
      <ol>
        <li><b>1.</b>Buy a broker</li>
        <li><b>2.</b>Burn $9TO5 to hire him</li>
        <li><b>3.</b>He earns stocks hourly</li>
      </ol>
      <p class="fine">Salaries come out of every $9TO5 trade, and the payroll split is locked on-chain.</p>`;
    const walkrow = el("div", "walkrow");
    walkrow.appendChild(el("span", null, "Everything works right here. The street is walkable too."));
    const play = el("button", "fb-btn small", "WALK THE STREET");
    play.id = "fb-play";
    walkrow.appendChild(play);
    deal.appendChild(walkrow);
    dealSec.appendChild(deal);
    host.appendChild(dealSec);

    // ---------------------------------------------------------- the chips
    // The zone sections don't exist yet when this runs — buildFlat appends
    // them after the hook returns — so the chips find their target when
    // pressed, not when built.
    const chipSec = el("section", "fh-sec");
    const chips = el("div", "fh-chips");
    // "MINT A BROKER" until 2026-09-02: the mint sold out on 28 August, and a
    // chip that promises a mint to a newcomer is a broken promise
    [["GET A BROKER", 0], ["YOUR BROKERS", 1], ["THE MONEY", 2], ["THE HANDBOOK", 3]].forEach(([label, i]) => {
      const b = el("button", null, label);
      b.type = "button";
      b.addEventListener("click", () => {
        const secs = document.querySelectorAll("#fb-flat .zone-sec:not(.fh-sec)");
        if (secs[i]) secs[i].scrollIntoView({ behavior: "smooth", block: "start" });
      });
      chips.appendChild(b);
    });
    // the allowlist checker — guarded, so a stale cached page without
    // wlcheck.js simply shows no chip rather than a dead button
    if (window.__WL_CHECK) {
      const b = el("button", null, "AM I ON THE LIST?");
      b.type = "button";
      b.id = "fh-wlchip";
      b.addEventListener("click", () => window.__WL_CHECK.open());
      chips.appendChild(b);
    }
    chipSec.appendChild(chips);
    host.appendChild(chipSec);

    // ---------------------------------------------------------- the staff
    const cfg = window.FIRM_CFG || {};
    const base = cfg.imageBase || "art/images";
    const staffSec = el("section", "fh-sec");
    staffSec.appendChild(el("div", "zone-head", `The Staff <small>the collection</small>`));
    const row = el("div", "fh-staffrow");
    for (const id of LEGENDS) row.appendChild(staffCard(el, base, id, true));
    for (const id of REGULARS) row.appendChild(staffCard(el, base, id, false));
    staffSec.appendChild(row);
    staffSec.appendChild(el("p", "fh-stafffoot",
      `5,000 exist. The gold frames are the ten legendaries — the first ten employees, hand-drawn, one of each.`));
    host.appendChild(staffSec);
  };

  function staffCard(el, base, id, legend) {
    const c = el("div", "fh-staffcard" + (legend ? " leg" : ""));
    const img = el("img");
    img.src = base + "/" + id + ".png";
    img.alt = "Broker #" + id;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 480; img.height = 480;
    c.appendChild(img);
    c.appendChild(el("b", null, "#" + id));
    return c;
  }
})();
