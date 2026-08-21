/* ===========================================================================
   The district. Two parallax bands of skyline and one street surface, each
   painted ONCE into an offscreen canvas at load and then handed to the
   compositor as a tiled background image.

   Why canvases and not more divs: the old skyline was 21 outlined elements,
   each carrying two repeating gradients, and every one of them is a separate
   paint the raster thread has to do. Two tiled textures cost two. Walking is
   already a transform on a composited layer either way, so the whole upgrade
   is paid for once, at build, in about the time a single frame takes.

   Nothing here animates. The clouds, birds and plane stay exactly as they were.
   =========================================================================== */
(function () {
  "use strict";

  // Deterministic, so the city is the same city on every load and can be
  // regenerated from the seed if it ever needs to be checked.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // parapet cap · stepped setback · roof plant + mast · deco crown · flat
  const CROWNS = [0, 1, 3, 4, 5];

  const snap = (v, g) => Math.round(v / g) * g;
  const mix = (a, b, t) => {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const [ar, ag, ab] = p(a), [br, bg, bb] = p(b);
    const h = (n) => Math.round(n).toString(16).padStart(2, "0");
    return "#" + h(ar + (br - ar) * t) + h(ag + (bg - ag) * t) + h(ab + (bb - ab) * t);
  };

  /* --------------------------------------------------------------- moods
     The light is the biggest single lever on how this street feels, and it is
     almost free: the geometry never changes, only the values it is painted in.
     Each mood supplies the sky gradient, the haze colour everything dissolves
     into, and how wide and warm the sun-struck face of a building is.

     "bell" is the low morning sun of an opening bell — the left face of every
     tower catches warm light and the right face goes cold, which is the whole
     reason it reads with more depth than noon does. */
  const MOODS = {
    day: {
      sky: "linear-gradient(180deg,#3f93d4 0%,#5aabe8 26%,#84c6f0 50%,#aed8f2 68%,#cbe5f5 78%,#d3e8f7 100%)",
      haze: [211, 232, 247], glowRGB: [214, 234, 248], litW: 4, litFreq: 0.9967,
      over: {},
    },
    bell: {
      sky: "linear-gradient(180deg,#1f4f8f 0%,#3f7cbb 22%,#79a8d0 44%,#c2b5bd 62%,#f0c894 78%,#ffdcae 100%)",
      haze: [255, 216, 168], glowRGB: [255, 224, 182], litW: 10, litFreq: 0.984,
      over: {
        farFill: "#c9b9ba", farBack: "#d8cbc4", farEdge: "#b6a5aa",
        midFill: "#6f7f9e", midBack: "#8794ad", midEdge: "#46536e",
        midLit:  "#e0b075", midShade: "#4e5a76",
        win: "#54617e", winPale: "#a9b6cc", winLit: "#ffc933",
        roofPlant: "#66718c",
        walk: "#c4b6a2", walkLit: "#e0d0b4", walkJoint: "#a0917d", walkGrit: "#b3a48f",
        curbTop: "#e8d6b8", curbFace: "#95836f", curbFoot: "#5f5445",
      },
    },
  };
  // "bell" is the chosen light. __CITY_MOOD can still force "day" back for a
  // comparison without touching anything else.
  const MOOD = MOODS[window.__CITY_MOOD] || MOODS.bell;
  const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";

  // ------------------------------------------------------------- palette
  // Every value is the site's own token, or a step between two of them. The
  // outlines are deliberately NOT --ink: a black keyline at distance is what
  // made the old skyline read as clip art rather than as buildings in air.
  const P = {
    haze:     "#d3e8f7",
    farFill:  "#b6cee0", farBack: "#c6dae8", farEdge: "#a3bfd4",
    midFill:  "#7da6c9", midBack: "#93b6d4", midEdge: "#56789a",
    midLit:   "#98bcd9", midShade: "#6a91b2",
    win:      "#5b83a8", winLit: "#ffc933", winPale: "#a9c9e2",
    roofPlant:"#6d8aa6",
    walk:     "#b9b3a6", walkLit: "#cec8bb", walkJoint: "#9a9385", walkGrit: "#a8a294",
    curbTop:  "#d6d0c3", curbFace: "#8a8375", curbFoot: "#5e5849",
    gutter:   "#3d3a32",
    // The asphalt tones sit within four steps of each other on purpose. Wider
    // spacing turned the grit into static rather than a surface.
    road:     "#474339", roadWorn: "#4e4a3f", roadPatch: "#4c473d",
    roadDark: "#3e3b33", roadGrit: "#514d42", line: "#b39429",
  };
  Object.assign(P, MOOD.over);
  P.haze = "#" + MOOD.haze.map((n) => n.toString(16).padStart(2, "0")).join("");
  window.__CITY_SKY = MOOD.sky;

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  /* ---------------------------------------------------------------- towers
     One band of buildings, drawn back-row first so the front row overlaps it.
     Silhouette variety is the whole point: the old skyline was 21 plain
     rectangles with an identical window grid, which is why it read as
     wallpaper instead of as a district. */
  function drawBand(ctx, tileW, bandH, cfg, rand) {
    const { fill, back, edge, outline, detail, grid } = cfg;

    function windows(x, y, w, h, tone) {
      if (!grid) return;
      const step = grid.step, wsz = grid.size;
      const cols = Math.floor((w - 8) / step);
      const inset = Math.round((w - (cols * step - (step - wsz))) / 2);
      for (let r = y + 10; r < y + h - 8; r += grid.rowStep) {
        for (let c = 0; c < cols; c++) {
          const wx = x + inset + c * step;
          const roll = rand();
          // a dark column here and there reads as a service core or a blind
          if (roll < 0.08) continue;
          // It is the middle of a working morning. A lit window has to be rare
          // enough to read as one office working late-early, not as grain: at
          // one in three hundred there are two or three in a whole viewport.
          ctx.fillStyle = roll > (cfg.litFreq || 0.9967) ? P.winLit : roll > 0.94 ? P.winPale : tone;
          ctx.fillRect(wx, r, wsz, grid.size);
        }
      }
    }

    // Masts belong to the near band only. They are painted in P.midEdge, the
    // darkest value in the file, and the haze wash starts 30% down the band —
    // so a mast poking above that line gets no haze at all and stays fully
    // dark. On the near band that is right: it sits on a solid mid-value
    // building and reads as an antenna. On the FAR band everything else has
    // dissolved into the horizon, so the mast is the only hard dark mark in a
    // pale wash and reads as a scratch on the screen rather than as a distant
    // aerial. Skipping it changes no rand() call, so every building in both
    // bands still lands in exactly the same place.
    const mast = (mx, my, mw, mh) => {
      if (!detail) return;
      ctx.fillStyle = P.midEdge;
      ctx.fillRect(mx, my, mw, mh);
    };

    function crown(x, y, w, kind, tone) {
      ctx.fillStyle = tone;
      if (kind === 0) {                                   // parapet cap
        ctx.fillRect(x - 2, y - 4, w + 4, 4);
      } else if (kind === 1) {                            // stepped setback
        const w2 = snap(w * 0.62, 2), x2 = x + snap((w - w2) / 2, 2);
        ctx.fillRect(x2, y - 22, w2, 22);
        if (outline) { ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.strokeRect(x2 + 1, y - 21, w2 - 2, 22); }
        const w3 = snap(w2 * 0.5, 2), x3 = x2 + snap((w2 - w3) / 2, 2);
        ctx.fillStyle = tone; ctx.fillRect(x3, y - 34, w3, 12);
      } else if (kind === 3) {                            // roof plant + mast
        ctx.fillStyle = detail ? P.roofPlant : tone;
        ctx.fillRect(x + 6, y - 8, 14, 8);
        ctx.fillRect(x + w - 20, y - 6, 10, 6);
        mast(x + snap(w / 2, 2), y - 30, 2, 24);
      } else if (kind === 4) {                            // deco crown
        let cw = w, cy = y;
        for (let s = 0; s < 3; s++) {
          cw = snap(cw * 0.66, 2);
          const cx = x + snap((w - cw) / 2, 2);
          ctx.fillStyle = tone;
          ctx.fillRect(cx, cy - 10, cw, 10);
          cy -= 10;
        }
        mast(x + snap(w / 2, 2) - 1, cy - 16, 2, 16);
      }
      // kind 5 = flat, draw nothing
    }

    function tower(x, w, h, tone, isBack) {
      const y = bandH - h;
      ctx.fillStyle = tone;
      ctx.fillRect(x, y, w, h);

      // light comes from the upper left, same as the sun on the street
      if (!isBack) {
        const lw = Math.min(cfg.litW || 4, Math.floor(w / 3));
        ctx.fillStyle = cfg.lit;   ctx.fillRect(x, y, lw, h);
        ctx.fillStyle = cfg.shade; ctx.fillRect(x + w - 4, y, 4, h);
      }
      if (outline) {
        ctx.strokeStyle = edge; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, h);
      }
      windows(x, y, w, h, cfg.win);
      // 2 was a water tower and is gone. Picking out of a list rather than
      // renumbering keeps this drawing one rand() per tower, so the rest of
      // the city lands in exactly the same place as before.
      crown(x, y, w, CROWNS[Math.floor(rand() * CROWNS.length)], tone);
    }

    // back row: hazier, no side shading, sits lower
    for (let x = -40; x < tileW + 40;) {
      const w = snap(40 + rand() * 70, 2);
      const h = snap(bandH * (0.20 + rand() * 0.40), 2);
      tower(x, w, h, back, true);
      x += w + snap(rand() * 30, 2);
    }
    // Front row. The gaps matter as much as the buildings: the billboard and
    // the sun have to keep a piece of open sky behind them, or the street
    // gains texture and loses its focal point. Widening the spacing here is
    // what buys that back.
    for (let x = -60; x < tileW + 60;) {
      const w = snap(44 + rand() * 80, 2);
      const h = snap(bandH * (0.30 + rand() * 0.52), 2);
      tower(x, w, h, fill, false);
      x += w + snap(14 + rand() * 62, 2);
    }

    // Atmospheric perspective. One gradient over the finished band, heaviest
    // at the horizon, is what makes the district sit in air instead of on top
    // of the sky. It is also the cheapest thing in this file.
    const g = ctx.createLinearGradient(0, bandH * 0.3, 0, bandH);
    g.addColorStop(0, rgba(MOOD.haze, 0));
    g.addColorStop(1, rgba(MOOD.haze, cfg.haze));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tileW, bandH);

    // A second, tighter wash over the last strip above the pavement. Haze is
    // genuinely thickest at the horizon, and it does a job beyond realism:
    // the characters stand exactly here, and against a mid-value building they
    // disappeared. Paling the band they stand on is what makes them read.
    const g2 = ctx.createLinearGradient(0, bandH - 160, 0, bandH);
    g2.addColorStop(0, rgba(MOOD.glowRGB, 0));
    g2.addColorStop(1, rgba(MOOD.glowRGB, cfg.glow));
    ctx.fillStyle = g2;
    ctx.fillRect(0, bandH - 160, tileW, 160);
  }

  function cityTile(tileW, bandH, cfg, seed) {
    const c = canvas(tileW, bandH);
    drawBand(c.getContext("2d"), tileW, bandH, cfg, rng(seed));
    return c.toDataURL("image/png");
  }

  /* ---------------------------------------------------------------- street
     Same three bands the old ground had — walk, curb, road — at the same
     heights, so nothing standing on the pavement moves by a pixel. What
     changes is that each band now has a surface instead of being a flat fill. */
  function streetTile(tileW, h) {
    const c = canvas(tileW, h), ctx = c.getContext("2d");
    const rand = rng(0x9705);
    const WALK = 26, CURB = 34;                    // the existing band edges

    // --- pavement
    ctx.fillStyle = P.walk; ctx.fillRect(0, 0, tileW, WALK);
    for (let x = 0; x < tileW; x += 64) {          // slabs, each a shade apart
      const t = rand();
      ctx.fillStyle = mix(P.walk, t > 0.5 ? P.walkLit : P.walkGrit, 0.16 + rand() * 0.2);
      ctx.fillRect(x, 3, 64, WALK - 3);
      ctx.fillStyle = P.walkJoint;                 // expansion joint
      ctx.fillRect(x, 3, 2, WALK - 3);
    }
    // Contact shadow. The district's bases now fade into the horizon haze, and
    // without a dark line where they meet the pavement the whole skyline looks
    // like it is hovering just above the street.
    ctx.fillStyle = "rgba(25,19,9,0.30)"; ctx.fillRect(0, 0, tileW, 5);
    ctx.fillStyle = "rgba(25,19,9,0.14)"; ctx.fillRect(0, 5, tileW, 4);
    ctx.fillStyle = P.walkLit; ctx.fillRect(0, 9, tileW, 2);   // lit top edge
    for (let i = 0; i < tileW / 26; i++) {         // grit
      ctx.fillStyle = rand() > 0.5 ? P.walkGrit : P.walkLit;
      ctx.fillRect(snap(rand() * tileW, 2), 6 + snap(rand() * (WALK - 10), 2), 2, 2);
    }

    // --- kerb: a lit top, a face, a dark foot. Three rows do all the work.
    ctx.fillStyle = P.curbTop;  ctx.fillRect(0, WALK, tileW, 2);
    ctx.fillStyle = P.curbFace; ctx.fillRect(0, WALK + 2, tileW, 5);
    ctx.fillStyle = P.curbFoot; ctx.fillRect(0, CURB - 1, tileW, 1);
    for (let x = 0; x < tileW; x += 128) {         // kerb joints
      ctx.fillStyle = P.curbFoot; ctx.fillRect(x, WALK, 2, CURB - WALK);
    }

    // --- roadway
    ctx.fillStyle = P.road; ctx.fillRect(0, CURB, tileW, h - CURB);
    ctx.fillStyle = P.gutter; ctx.fillRect(0, CURB, tileW, 5);   // gutter shadow

    // Worn wheel paths. Drawn column by column with a jittered top and bottom
    // rather than as two rectangles: a straight-edged band reads as a painted
    // stripe, and the whole point is that this is polish worn into the surface
    // by traffic.
    for (const top of [CURB + 34, CURB + 108]) {
      for (let x = 0; x < tileW; x += 2) {
        const j1 = Math.round(rand() * 3) * 2, j2 = Math.round(rand() * 3) * 2;
        ctx.fillStyle = P.roadWorn;
        ctx.fillRect(x, top + j1, 2, 26 - j1 + j2);
      }
    }

    // oil, down the middle where cars stand
    for (let i = 0; i < 7; i++) {
      const ox = snap(rand() * tileW, 2), oy = CURB + 66 + snap(rand() * 24, 2);
      ctx.fillStyle = P.roadDark;
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(ox + snap(rand() * 22, 2), oy + snap(rand() * 10, 2), 4 + snap(rand() * 6, 2), 2);
      }
    }

    // cracks — a few short runs that step like a real fracture
    for (let i = 0; i < 6; i++) {
      let cx = snap(rand() * tileW, 2), cy = CURB + 12 + snap(rand() * (h - CURB - 24), 2);
      ctx.fillStyle = P.roadDark;
      for (let k = 0; k < 6 + rand() * 8; k++) {
        ctx.fillRect(cx, cy, 2, 2);
        cx += 2; cy += rand() > 0.62 ? (rand() > 0.5 ? 2 : -2) : 0;
      }
    }

    // repairs: darker rectangles with a lip, placed off any regular rhythm
    for (let i = 0; i < 5; i++) {
      const pw = snap(70 + rand() * 150, 2), ph = snap(24 + rand() * 34, 2);
      const px2 = snap(rand() * (tileW - pw), 2), py = CURB + 10 + snap(rand() * (h - CURB - ph - 16), 2);
      ctx.fillStyle = P.roadPatch; ctx.fillRect(px2, py, pw, ph);
      ctx.fillStyle = P.roadDark;
      ctx.fillRect(px2, py, pw, 2); ctx.fillRect(px2, py + ph - 2, pw, 2);
    }

    // aggregate
    for (let i = 0; i < tileW / 7; i++) {
      ctx.fillStyle = rand() > 0.5 ? P.roadGrit : P.roadDark;
      ctx.fillRect(snap(rand() * tileW, 2), CURB + 6 + snap(rand() * (h - CURB - 10), 2), 2, 2);
    }

    // centre line — 40 on, 32 off, so it divides the 1280 tile evenly and the
    // dashes never stutter where the texture wraps
    const lineY = CURB + 78;
    for (let x = 0; x < tileW; x += 72) {
      ctx.fillStyle = P.line;     ctx.fillRect(x, lineY, 40, 4);
      ctx.fillStyle = P.roadDark; ctx.fillRect(x, lineY + 4, 40, 1);
    }
    return c.toDataURL("image/png");
  }

  /* ------------------------------------------------------------------ build
     Deferred on purpose. buildBack() runs at boot, before setFlat() decides
     the visitor is on a phone — so today every phone builds the whole street
     and then hides it behind display:none. The district is the most expensive
     thing on the street now, so it waits until the street is actually going to
     be looked at. A visitor who never leaves flat mode pays nothing at all. */
  let pending = null, built = false;

  // Mirrors wantsFlat() in level.js — the body class is not set yet at boot.
  // The two have to say the same thing or a phone gets the street with its
  // skyline missing, which is exactly what happened the day the street became
  // the default at every width and only level.js was told: this kept its own
  // copy of the old `innerWidth < 1024` and refused to paint a district for
  // anyone narrow. If one of these rules ever changes again, change both.
  function startsFlat() {
    try {
      const saved = localStorage.getItem("firmbrokers.flat.v1");
      if (saved === "level") return false;
      if (saved === "flat") return true;
    } catch (e) { /* private mode: fall through to the media query */ }
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // A parallax layer travelling at k only ever exposes world-x 0 .. span(k).
  // Anything placed beyond that is painted and composited and can never be
  // looked at. Defined here rather than inside the paint, because buildBack()
  // asks for it while placing the clouds, which happens whether or not the
  // district has been painted yet.
  function spanFor(worldW, k) {
    return Math.ceil(k * Math.max(0, worldW - innerWidth) + innerWidth) + 80;
  }

  window.__CITY_BUILD = function (back, stage, worldW, groundH) {
    pending = [back, stage, worldW, groundH];
    window.__CITY_SPAN = (k) => spanFor(worldW, k);
    if (!startsFlat()) window.__CITY_ENSURE();
  };

  window.__CITY_ENSURE = function () {
    if (built || !pending) return window.__CITY_MS || null;
    built = true;
    return paint.apply(null, pending);
  };

  // The flat page's hero paints the same district at postcard size: same
  // palette, same mood, same tile painters, so the phone's skyline can never
  // drift from the street's. Returns a dataURL like the internal callers get.
  // `over` exists because the haze gradients are sized for street-height
  // bands — the bottom 160px of ANY band gets the horizon wash, and a 200px
  // strip under the street's values comes out as a plain warm wall.
  window.__CITY_STRIP = function (kind, w, h, over) {
    if (kind === "street") return streetTile(w, h);
    if (kind === "far") return cityTile(w, h, Object.assign({
      fill: P.farFill, back: P.farBack, edge: P.farEdge, lit: P.farBack, shade: P.farEdge,
      win: P.farWin || "#adc6d9", outline: false, detail: false, haze: 0.78, glow: 0.30,
      litW: MOOD.litW, litFreq: 1.1,
      grid: { step: 8, size: 2, rowStep: 10 },
    }, over), 0x51ce);
    return cityTile(w, h, Object.assign({
      fill: P.midFill, back: P.midBack, edge: P.midEdge, lit: P.midLit, shade: P.midShade,
      win: P.win, outline: true, detail: true, haze: 0.4, glow: 0.42,
      litW: MOOD.litW, litFreq: MOOD.litFreq,
      grid: { step: 12, size: 4, rowStep: 16 },
    }, over), 0x9a17);
  };

  function paint(back, stage, worldW, groundH) {
    const t0 = performance.now();
    const sky = Math.max(300, innerHeight - groundH - 56);

    // Bands only have to cover the ground they actually travel over: the layer
    // moves at a fraction of the camera, so it needs far less width than the
    // world. This is why the textures stay small.
    const span = (k) => spanFor(worldW, k);

    const FAR_K = 0.16, MID_K = 0.35;             // MID_K must match the tick

    // Band heights are the composition. The old skyline topped out at 0.90 of
    // the sky and left the upper half empty; filling all of it turned out to be
    // just as wrong the other way, because the billboard lost its backdrop.
    // The district now tops out around two thirds and the last third stays air.
    const farBand = Math.round(sky * 0.40);
    const midBand = Math.round(sky * 0.66);

    const farTex = cityTile(1120, farBand, {
      fill: P.farFill, back: P.farBack, edge: P.farEdge, lit: P.farBack, shade: P.farEdge,
      win: P.farWin || "#adc6d9", outline: false, detail: false, haze: 0.78, glow: 0.30,
      litW: MOOD.litW, litFreq: 1.1,
      grid: { step: 8, size: 2, rowStep: 10 },
    }, 0x51ce);

    const midTex = cityTile(1600, midBand, {
      fill: P.midFill, back: P.midBack, edge: P.midEdge, lit: P.midLit, shade: P.midShade,
      win: P.win, outline: true, detail: true, haze: 0.4, glow: 0.42,
      litW: MOOD.litW, litFreq: MOOD.litFreq,
      grid: { step: 12, size: 4, rowStep: 16 },
    }, 0x9a17);

    const mk = (cls, tex, w, hh) => {
      const d = document.createElement("div");
      d.className = cls;
      d.style.cssText =
        "position:absolute;left:0;bottom:" + groundH + "px;width:" + w + "px;height:" + hh + "px;" +
        "background-image:url(" + tex + ");background-repeat:repeat-x;background-position:left bottom;" +
        "image-rendering:pixelated;pointer-events:none;";
      return d;
    };

    // the far band gets its own layer so it can travel slower than the near one
    const farLayer = document.createElement("div");
    farLayer.className = "fb-layer fb-far";
    farLayer.style.willChange = "transform";
    farLayer.appendChild(mk("fb-cityfar", farTex, span(FAR_K), farBand));
    stage.insertBefore(farLayer, back);
    window.__CITY_FAR = farLayer;

    back.appendChild(mk("fb-citymid", midTex, span(MID_K), midBand));

    // the street surface, on the element that already exists
    const st = document.createElement("style");
    st.id = "fb-city-street";
    st.textContent =
      ".fb-stage{background:" + MOOD.sky + " !important;}" +
      ".fb-ground{background-image:url(" + streetTile(1280, groundH) + ");" +
      "background-repeat:repeat-x;background-position:left top;image-rendering:pixelated;}" +
      ".fb-ground::after{content:none;}";
    document.head.appendChild(st);

    window.__CITY_MS = (performance.now() - t0).toFixed(1);
    return window.__CITY_MS;
  }
})();
