/* ===========================================================================
   The Lobby — the frame every visitor lands on, and the source of the X banner.

   Three problems it is solving, all measured rather than assumed:

   1. There is no call to action on arrival. BUY $9TO5 is gated behind
      `DEPLOYED && state.tokenLive`, so before launch the jumbotron carries a
      headline, a tagline and nothing to press. It is about to lose the button
      permanently, so the sign needs a different job.
   2. The mascot stands at x290. X's avatar covers x25-358 of a 1500x500
      banner, so the one character in the shot is the one thing the avatar
      hides. He moves under the sign, where the camera still clamps to 0 at
      banner width and the framing does not shift.
   3. The lobby is empty. Its entire contents are a billboard, a bus stop, one
      manhole and a crosswalk — no people, no traffic, no lamps, on a street
      whose whole story is people going to work.

   Everything below is built from parts the project already has: npcWalker and
   the CAST palettes, the twenty walker frames, .fb-lamp (drawn in CSS and
   never once placed), .fb-pigeon and .fb-taxi.
   =========================================================================== */
(function () {
  "use strict";

  // Dead centre of the billboard (540 + 640/2), so the player stands directly
  // under the headline. state.x is his CENTRE — the element is drawn at x-32 —
  // so this is the sign's centre, not its centre minus half a sprite.
  const PLAYER_X = 860;          // must match the state.x / streetX patch

  const CSS = `
  /* --- the jumbotron ------------------------------------------------------
     Sized so it survives being shrunk to a banner: X renders one at about
     600px wide, a 0.4 scale, and at the old 22px the headline landed at 9px.
     34px lands near 14px, which reads.

     The two posts are ::before/::after with top:100% and a height that has to
     equal the sign's own lift, or they stop reaching the pavement. Both are
     driven from --bb-lift, which is set in JS once the sign is measured. */
  /* The sign is 640 wide and the camera opens dead centre under it, which is
     where START_X's own arithmetic comes from (540 + 640/2). A phone is
     narrower than the sign, so it used to hang 125px off each edge and the
     wordmark arrived cropped at both ends — the exact failure the note below
     calls worse than a plain sign, on the one screen that decides whether a
     stranger stays. It fits the window instead, and the offset is derived from
     the same 640 rather than typed, so the centre cannot drift away from
     START_X: above 656px both expressions collapse to today's values exactly. */
  .fb-billboard {
    width: min(640px, calc(100vw - 16px)) !important;
    margin-left: calc((640px - min(640px, 100vw - 16px)) / 2) !important;
    bottom: calc(var(--ground-h) + var(--bb-lift, 172px)) !important;
  }
  .fb-billboard::before, .fb-billboard::after { height: var(--bb-lift, 172px) !important; }
  .fb-billboard h1 { font-size: 34px !important; letter-spacing: 1px; }
  .fb-billboard p  { font-size: 23px !important; margin-top: 14px !important; }

  /* short windows: shrink the type. The sign carries a headline and a tagline
     and nothing else, so there are no supporting lines left to shed first. */
  .fb-billboard.bb-tight .inner { padding: 14px 18px !important; }
  .fb-billboard.bb-tight p { margin-top: 10px !important; }
  .fb-billboard.bb-tiny h1 { font-size: 26px !important; }
  .fb-billboard.bb-tiny p  { font-size: 19px !important; }

  /* --- street furniture --------------------------------------------------- */
  .fb-hydrant {
    position: absolute; bottom: var(--ground-h); width: 14px; height: 26px;
    background: #b22c2c; border: 3px solid var(--ink);
  }
  .fb-hydrant::before {
    content: ""; position: absolute; left: -6px; top: 6px;
    width: 26px; height: 6px; background: #b22c2c; border: 3px solid var(--ink);
  }
  .fb-hydrant::after {
    content: ""; position: absolute; left: 1px; top: -9px;
    width: 8px; height: 6px; background: #8f2020; border: 3px solid var(--ink);
  }
  .fb-newsbox {
    position: absolute; bottom: var(--ground-h); width: 34px; height: 52px;
    background: #2f6f8f; border: 3px solid var(--ink);
  }
  .fb-newsbox::before {
    content: ""; position: absolute; left: 5px; top: 7px;
    width: 21px; height: 16px; background: #cfe1ea; border: 2px solid var(--ink);
  }
  .fb-newsbox::after {
    content: ""; position: absolute; left: 0; bottom: 8px;
    width: 34px; height: 3px; background: #1d4a61;
  }
  .fb-taxi.parked { bottom: calc(var(--ground-h) * .30); }

  /* the porter's dog, a street prop of its own so no body can ever overlap
     it. z-index 6: over the buildings, under the people, like all furniture. */
  .fb-dog { position: absolute; bottom: var(--ground-h); width: 34px; height: 24px; z-index: 6; }
  .fb-dog .b { position: absolute; left: 4px; bottom: 5px; width: 22px; height: 10px;
    background: #5e3e26; border: 2px solid var(--ink); }
  .fb-dog .h { position: absolute; right: 0; bottom: 10px; width: 11px; height: 10px;
    background: #5e3e26; border: 2px solid var(--ink); }
  .fb-dog .h::after { content: ""; position: absolute; right: 2px; top: 2px;
    width: 2px; height: 2px; background: var(--ink); }
  .fb-dog .e { position: absolute; right: 9px; bottom: 19px; width: 4px; height: 5px;
    background: #4a3019; }
  .fb-dog .t { position: absolute; left: 0; bottom: 13px; width: 4px; height: 8px;
    background: #5e3e26; border: 2px solid var(--ink);
    transform-origin: bottom center; animation: fb-tailwag 0.7s steps(2, end) infinite; }
  .fb-dog .l1, .fb-dog .l2 { position: absolute; bottom: 0; width: 4px; height: 7px;
    background: var(--ink); }
  .fb-dog .l1 { left: 7px; } .fb-dog .l2 { right: 6px; }
  @keyframes fb-tailwag { 50% { transform: rotate(24deg); } }
  @media (prefers-reduced-motion: reduce) { .fb-dog .t { animation: none; } }

  /* ===================================================================== *
     THE REST OF THE STREET
     Drawn the way the hydrant and the news box already are: flat colour on
     the 4px grid with a 3px ink keyline, so it sits in the same world as the
     walkers instead of on top of it. Nothing here animates — the street
     already has clouds, birds, a plane and a taxi in motion, and still
     furniture is what lets the eye settle on them.
   * ===================================================================== */

  /* the exchange is the only building on the street with a hard perimeter,
     and a row of bollards says so faster than any sign would */
  .fb-bollard { position: absolute; bottom: var(--ground-h); width: 10px; height: 26px;
    background: var(--steel); border: 3px solid var(--ink); }
  .fb-bollard::before { content: ""; position: absolute; left: 0; top: 3px;
    width: 10px; height: 3px; background: var(--gold); }

  .fb-bin { position: absolute; bottom: var(--ground-h); width: 26px; height: 30px;
    background: #4a5a52; border: 3px solid var(--ink); }
  .fb-bin::before { content: ""; position: absolute; left: -5px; top: -8px;
    width: 36px; height: 8px; background: #5d7166; border: 3px solid var(--ink); }
  .fb-bin::after { content: ""; position: absolute; left: 5px; top: 6px;
    width: 3px; height: 16px; background: #3a4a42;
    box-shadow: 6px 0 0 #3a4a42, 12px 0 0 #3a4a42; }

  .fb-planter { position: absolute; bottom: var(--ground-h); width: 36px; height: 20px;
    background: #8a8375; border: 3px solid var(--ink); }
  .fb-planter::before { content: ""; position: absolute; left: 1px; top: -19px;
    width: 34px; height: 19px; background: #3f7a4a; border: 3px solid var(--ink); }
  .fb-planter::after { content: ""; position: absolute; left: 9px; top: -25px;
    width: 18px; height: 8px; background: #4f9159; border: 3px solid var(--ink); }

  .fb-mailbox { position: absolute; bottom: var(--ground-h); width: 8px; height: 16px;
    background: var(--ink); }
  .fb-mailbox::before { content: ""; position: absolute; left: -12px; top: -28px;
    width: 32px; height: 28px; background: #2f5f9f; border: 3px solid var(--ink); }
  .fb-mailbox::after { content: ""; position: absolute; left: -6px; top: -21px;
    width: 20px; height: 4px; background: #16406f; }

  /* the coffee cart. The one piece of colour on a street of grey suits, and
     the reason the pavement outside the exchange reads as a place people
     stand around rather than a corridor. */
  .fb-cart { position: absolute; bottom: var(--ground-h); width: 78px; height: 44px; }
  /* The sign is an element rather than a ::before, and it sits ABOVE the
     awning rather than behind it. level.css used to carry a ::before for a
     cart 34px taller, and the awning sliced the word in half. */
  .fb-cart .sign { position: absolute; left: 5px; top: -33px; padding: 4px 5px;
    background: #f2ece0; border: 3px solid var(--ink);
    font-family: var(--font-display); font-size: 7px; color: #2b1d0e; line-height: 1; }
  .fb-cart .awn { position: absolute; left: -8px; top: -14px; width: 94px; height: 14px;
    background: repeating-linear-gradient(90deg, #b22c2c 0 12px, #f2ece0 12px 24px);
    border: 3px solid var(--ink); }
  .fb-cart .body { position: absolute; left: 0; bottom: 8px; width: 78px; height: 34px;
    background: #c9a227; border: 3px solid var(--ink); }
  /* A serving hatch and a counter lip, not a window and a slot. The old urn
     and cup read as two holes punched in a slab; what says "someone sells
     coffee here" is the opening you are served through. */
  .fb-cart .hatch { position: absolute; left: 8px; top: 5px; width: 40px; height: 15px;
    background: #4a3a12; box-shadow: inset 0 0 0 2px var(--ink); }
  .fb-cart .lip { position: absolute; left: 4px; top: 21px; width: 48px; height: 4px;
    background: #e0cf9a; box-shadow: 0 2px 0 var(--ink); }
  .fb-cart .urn { position: absolute; left: 14px; top: 7px; width: 9px; height: 11px;
    background: #8ea3b8; box-shadow: inset 0 0 0 2px var(--ink); }
  .fb-cart .cup { position: absolute; right: 10px; top: 8px; width: 7px; height: 9px;
    background: #f2ece0; border: 2px solid var(--ink); }
  .fb-cart .w { position: absolute; bottom: 0; width: 12px; height: 12px;
    background: #2b3038; border: 3px solid var(--ink); }
  .fb-cart .w.l { left: 12px; }
  .fb-cart .w.r { right: 12px; }

  /* The newsstand and the A-board are gone with the elements that used them.
     Leaving the rules behind is how .fb-cart and .fb-hydrant became traps: a
     class drawn here and placed nowhere is a name the next person reuses, and
     then two definitions fight and the loser bleeds through a pseudo-element. */

  .fb-grate { position: absolute; bottom: calc(var(--ground-h) - 7px); width: 44px; height: 8px;
    background: repeating-linear-gradient(90deg, #3a372f 0 5px, #565248 5px 8px);
    border: 2px solid #2a2822; }

  /* Street furniture sits in FRONT of the buildings and BEHIND the people.
     __LOBBY_BUILD runs from inside buildFront, before the facades are added,
     so everything here is an earlier sibling than the exchange and the bank
     and was painted underneath them — the four bollards guarding the exchange
     door were in the DOM, correctly sized and coloured, and entirely
     invisible. Walkers never showed the bug because .fb-walker already
     carries z-index 7-10. Buildings are z-index auto, so 6 puts furniture
     over them while a person still walks in front of a bin. */
  .fb-bollard, .fb-bin, .fb-planter, .fb-mailbox, .fb-cart,
  .fb-grate, .fb-lamp, .fb-hydrant, .fb-newsbox,
  .fb-pigeon { z-index: 6; }
  `;

  /* Every colour below is lifted straight from the trait tables in
     gen/generate.py — HAIRS, SKINS, SUITS, TIES — so nobody on this street
     wears something a broker could not be minted in.

     They exist because the first pass reused the CAST entries directly, and
     npcWalker(x, "clerk"|"blonde"|"brunette") does not just borrow a
     silhouette, it borrows the whole palette. That put three exact clones on
     the street: the HR receptionist was standing in the lobby, and so were two
     of the three from the hiring line. npccheck caught the receptionist
     (`!line.some(n => n.H === clerk.H)`); the other two it could not see.

     None of these uses Redhead #9c4a28. That one belongs to the receptionist
     and the test guards it deliberately. */
  const PAL = {
    // Buzz · Fair · Charcoal · Purple
    cutter:  { H: "#584636", S: "#eecaaa", d: "#c9a382", N: "#3a3a3e", D: "#2c2c30",
               T: "#6e3e96", L: "#16161a", M: "#111114" },
    // Curls · Olive · Navy · Blue
    runner:  { H: "#30221c", S: "#bc9468", d: "#96714b", N: "#2a3858", D: "#1e2940",
               T: "#3454a0", L: "#16161a", M: "#111114" },
    // Slick Back · Brown · Grey · Pink
    reader:  { H: "#201c1a", S: "#966a48", d: "#734f34", N: "#6e727a", D: "#565a62",
               T: "#da789a", L: "#16161a", M: "#111114" },
    // Clean Cut · Deep · Black · Red
    porter:  { H: "#3c2c20", S: "#6c4a32", d: "#4f3524", N: "#1c1c20", D: "#161619",
               T: "#b22c2c", L: "#16161a", M: "#111114" },
    // Blonde Part · Tan · Brown · Black
    courier: { H: "#c8a860", S: "#d8ac80", d: "#9f7f5e", N: "#5e4834", D: "#48371f",
               T: "#1e1e22", L: "#16161a", M: "#111114" },
  };

  window.__LOBBY_BUILD = function (ctx) {
    const { front, px, el, npcWalker, dress, warpTo, ZONES } = ctx;

    const style = document.createElement("style");
    style.id = "fb-lobby";
    style.textContent = CSS;
    document.head.appendChild(style);

    /* ------------------------------------------------------- the jumbotron */
    const bbEl = document.querySelector(".fb-billboard");
    const bb = bbEl && bbEl.querySelector(".inner");
    if (bb) {
      // The sign stays pure brand: headline and tagline, nothing to press.
      // They are word for word the token's own description, and that is
      // deliberate — this is the surface a stranger cross-checks against the
      // launchpad listing. Every call to action lives in the zone bar.
      //
      // What changes is scale. X renders a header at about 600px wide, a 0.4
      // scale, and at the old 22px the headline landed at 9px there. 34px
      // lands near 14px, which reads.

      // Lift the sign clear of the bus stop roof without pushing it off the top
      // of a short window. The posts follow, because their height is the same
      // variable.
      //
      // The sign is tall now, and a 500px-high window has under 380px of sky:
      // at full size its headline ran off the top of the frame entirely. When
      // there is not enough room it drops the supporting lines and shrinks
      // rather than overflowing, because a cropped headline is the one failure
      // that is worse than a plain sign.
      const STOP_H = 190;                       // the bus stop shelter
      // Both axes, because the sign can run out of either. Height was the only
      // one measured while a narrow window was handed the flat page and never
      // stood here; now that the street is the default at every width, a phone
      // hits the horizontal wall first — the frame fits, but a 34px headline
      // does not, so it wraps to two lines and the sign grows taller instead.
      const fit = (groundH) => {
        const room = innerHeight - groundH - STOP_H - 24;   // sky above the shelter
        if (bbEl.offsetHeight > room) return false;
        // the inner screen is what the type has to live inside, and it can only
        // be measured once the width rule above has done its clamping
        const inner = bbEl.querySelector(".inner");
        return !inner || inner.scrollWidth <= inner.clientWidth + 1;
      };
      // Measured, not decided once. The ladder used to be walked a single time
      // at build, which is before the pixel fonts land: the headline was sized
      // in the fallback face, came out one line, passed, and was never asked
      // again — so a 360px window kept the full size, wrapped when Press Start
      // arrived, and pushed the sign 10px off the top of the screen. Fonts and
      // rotation both change the answer, and on a phone rotation is a gesture
      // rather than an edge case.
      const place = () => {
        const groundH = parseInt(getComputedStyle(document.documentElement)
          .getPropertyValue("--ground-h"), 10) || 220;
        bbEl.classList.remove("bb-tight", "bb-tiny");
        if (!fit(groundH)) bbEl.classList.add("bb-tight");
        if (!fit(groundH)) bbEl.classList.add("bb-tiny");
        const h = bbEl.offsetHeight;
        // The 96 floor keeps the sign clear of the shelter roof, but it must
        // never win against the top of the window: a sign that has run off the
        // screen is not a sign. Anything that still cannot fit sits lower and
        // overlaps the roof, which is the cheaper of the two failures.
        const top = Math.min(260, innerHeight - groundH - h - 40);
        bbEl.style.setProperty("--bb-lift", Math.max(top < 96 ? 24 : 96, top) + "px");
      };
      place();
      try { document.fonts.ready.then(place); } catch (e) { /* no font api: one pass stands */ }
      let raf = 0;
      addEventListener("resize", () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(place);
      });
    }

    /* --------------------------------------------------- street furniture */
    const put = (cls, x) => {
      const n = el("div", cls);
      front.appendChild(px(n, { left: x + "px" }));
      return n;
    };
    const putH = (cls, x, html) => { const n = put(cls, x); n.innerHTML = html; return n; };

    // .fb-lamp has been in the stylesheet since the beginning and has never
    // been placed on the street.
    // 940 stood under the billboard and split the headline. The lamps left are
    // the ones that light pavement nobody is trying to read across.
    [240, 1520].forEach((x) => put("fb-lamp", x));
    put("fb-hydrant", 96);
    put("fb-newsbox", 300);

    // the flock all sat at x2350 and beyond, so the opening frame never had one
    put("fb-pigeon hop", 600);
    put("fb-pigeon", 980);

    // a cab at the kerb. The animated one spawns at WORLD_W-400 and takes half
    // a minute to arrive, so the first frame has no traffic in it at all.
    const cab = el("div", "fb-taxi parked");
    cab.innerHTML = '<div class="light"></div><div class="cab"></div><div class="body"></div>' +
                    '<div class="check"></div><div class="wheel b"></div><div class="wheel f"></div>';
    front.appendChild(px(cab, { left: "880px" }));

    /* -------------------------------------------------------- the commuters
       Poses chosen by rendering all twenty frames at 1:1 and looking at them.
       Only five hold up as stills: stand, stand-b, blink, phone-a and phone-b,
       walk-4 looked like the one usable walk frame and is not: at 3x it is a
       wide lunge with the feet at different heights. It is used nowhere. Every other walk frame, all six run frames and
       jump/land/fall read as a lunge when they are not moving — walk-3 in
       particular, which is what the first commuter was posed in.

       .fb-walker.face-left flips a sprite, so they do not all face the same
       way. That is what turns a row of people into a scene: two of them are
       mid-conversation, one is reading her phone, one is watching down the
       street for a bus that is not coming, and one is walking off to work. */
    /* The CAST key is borrowed for its silhouette only — the look classes,
       so we keep the bob, the waves, the ponytail — and then dress() replaces
       the palette outright, which is what stops them being clones. */
    const crowd = [
      [376,  "clerk",    "stand",   "cutter",  false],  // the pair: she is talking
      [462,  null,       "phone-a", "runner",  true],   // he is half-listening
      // nobody at 830: that is the middle of the billboard, and the player now
      // starts there. Two people on the same square metre in the landing frame.
      [1046, null,       "stand-b", "porter",  true],   // watching the street; his dog sniffs ahead of him
      [1424, "brunette", "stand-b", "courier", false],  // waiting at the stop
    ];
    crowd.forEach(([x, who, frame, pal, faceLeft, pieces]) => {
      const n = npcWalker(x, who, frame);
      if (pal && dress) dress(n, PAL[pal]);
      if (faceLeft) n.classList.add("face-left");
      if (pieces) pieces.split(" ").forEach((c) => n.classList.add(c));
    });


    /* ===================================================================
       THE REST OF THE STREET

       The world is 5300px and all of it lived in the first 1900: ten people
       at the start, then three thousand pixels of empty pavement holding two
       signs, three manholes and three pigeons. Both landmark buildings — the
       exchange and the bank — stood on bare ground.

       Density here is deliberately uneven. People gather at doors and thin
       out between them, because even spacing reads as a line-up rather than
       a city. What is even is the coverage: no 500px slice is empty now.
     * =================================================================== */

    // --- the trait tables, straight out of gen/generate.py ----------------
    // Redhead #9c4a28 is the HR receptionist's. city.mjs asserts nobody on
    // the street wears it, so it is absent from this table on purpose.
    const HAIR = { clean: "#3c2c20", slick: "#201c1a", buzz: "#584636",
                   curls: "#30221c", blonde: "#c8a860", silver: "#bebec4" };
    const SKIN = { fair: ["#eecaaa", "#c9a382"], tan: ["#d8ac80", "#9f7f5e"],
                   olive: ["#bc9468", "#96714b"], brown: ["#966a48", "#734f34"],
                   deep: ["#6c4a32", "#4f3524"], grey: ["#b0b0b8", "#8a8a92"] };
    const SUIT = { navy: ["#2a3858", "#1e2940"], charcoal: ["#3a3a3e", "#2c2c30"],
                   black: ["#1c1c20", "#161619"], grey: ["#6e727a", "#565a62"],
                   brown: ["#5e4834", "#48371f"], pin: ["#2e344e", "#232839"],
                   white: ["#e4e4de", "#c2c2bc"], gold: ["#c49e3e", "#9a7b2e"] };
    const TIE = { blue: "#3454a0", red: "#b22c2c", green: "#388e54",
                  black: "#1e1e22", purple: "#6e3e96", pink: "#da789a" };
    const pal = (h, s, n, t) => ({ H: HAIR[h], S: SKIN[s][0], d: SKIN[s][1],
      N: SUIT[n][0], D: SUIT[n][1], T: TIE[t], L: "#16161a", M: "#111114" });

    /* Poses are stand / stand-b / blink / phone-a / phone-b only.
       walk-4 is on the suite's whitelist and is deliberately unused: rendered
       at 3x it is a wide lunge with the feet at different heights, which is
       right mid-animation and wrong in a still. Variety comes from costume
       instead, and the costume vocabulary is far richer than the leg poses.

       Every piece below is a real mintable trait — Coffee, FlipPhone,
       Newspaper, TickerTape (the shoulder scarf), Cigar, MoneyPhone,
       SecurityBadge, PocketSquare, RoundGlasses, Tired, Sunglasses, Monocle,
       Pinstripe. The exclusives — waves, ponytail, pendant, brooch,
       boutonniere, clutch, attache — belong to the three in the hiring line
       and stay theirs. hr-flat and hd-briefcase are the default dress and are
       never named; hr-buzz, hr-part and hr-bald are distinct silhouettes even
       though they paint the same number of pixels as the default. */
    const STREET = [
      // ---- the western approach, before the lobby
      [140, "", ["clean", "fair", "navy", "blue"], "stand", 0, "hd-coffee"],

      // ---- out of HR, newly hired
      [2360, "hr-slick", ["slick", "tan", "charcoal", "red"], "stand-b", 0, ""],
      [2440, "hr-curls", ["curls", "olive", "grey", "green"], "stand", 1, "hd-newspaper"],
      [2580, "hr-part", ["blonde", "fair", "navy", "pink"], "phone-a", 0, ""],

      // ---- the block between HR and the exchange
      [2790, "hr-buzz", ["buzz", "brown", "black", "blue"], "stand-b", 1, "wr-cigar"],

      // ---- the exchange. Two of them are mid-conversation, and the door is
      //      kept clear from 3190 to 3336, which is where the bollards stand.
      [2990, "hr-slick", ["slick", "fair", "navy", "green"], "stand", 0, "hd-coffee ey-tired"],
      [3062, "hr-part", ["blonde", "olive", "grey", "blue"], "phone-b", 1, ""],
      [3410, "hr-guardcap", ["clean", "deep", "charcoal", "black"], "stand", 1, "pk-badge"],
      [3482, "hr-buzz", ["buzz", "tan", "brown", "red"], "stand-b", 0, "hd-coffee"],

      // ---- between the exchange and the bank
      [3700, "hr-part", ["silver", "fair", "grey", "purple"], "stand", 0, "wr-scarf"],
      [3780, "hr-slick", ["slick", "olive", "navy", "pink"], "blink", 1, "ey-glasses"],
      [3990, "hr-curls", ["curls", "deep", "charcoal", "blue"], "stand-b", 0, "hd-newspaper"],

      // ---- the bank frontage, its guard on the door side
      [4220, "hr-bowler", ["clean", "brown", "charcoal", "black"], "stand", 1, "pk-badge"],
      [4292, "hr-part", ["blonde", "grey", "navy", "purple"], "stand-b", 0, "wr-headphones"],
      [4540, "hr-buzz", ["buzz", "olive", "pin", "blue"], "stand", 0, "wr-moneyphone st-pinstripe"],

      // ---- past the armoured van, to the end of the street
      [4860, "hr-curls", ["curls", "fair", "brown", "green"], "stand-b", 0, "hd-coffee"],
      [5020, "hr-slick", ["slick", "deep", "grey", "pink"], "stand", 1, "wr-cigar"],
      [5190, "hr-bald", ["silver", "olive", "charcoal", "red"], "stand-b", 0, "hd-newspaper ey-monocle"],
    ];

    STREET.forEach(([x, hair, cols, frame, faceLeft, pieces]) => {
      const n = npcWalker(x, null, frame);
      if (hair) {
        // the default dress carries hr-flat; a second hr- class would stack
        [...n.classList].filter((c) => c.startsWith("hr-")).forEach((c) => n.classList.remove(c));
        n.classList.add(hair);
      }
      if (pieces) pieces.split(" ").filter(Boolean).forEach((c) => n.classList.add(c));
      dress(n, pal.apply(null, cols));
      if (faceLeft) n.classList.add("face-left");
    });

    // --- furniture, the length of the street -----------------------------
    // Positions were solved against each piece's real visual width, which is
    // wider than it measures: the lamp head, the bin lid, the cart awning and
    // the kiosk roof all overhang their element box.
    // 2120 stood in the HR doorway, 3150 across the exchange front, and 3880
    // straight through THE MONEY sign. A lamp post is a vertical bar at this
    // scale, so it reads as a defect anywhere it crosses something you read.
    // 2720 went too: it stood over the YOUR DESKS signpost at 2680. That one
    // was not reported — the obstruction check in city.mjs found it, which is
    // the point of comparing full boxes rather than pavement footprints.
    [4160, 4960, 5290].forEach((x) => put("fb-lamp", x));
    // nothing at HR's frontage: the doorway, the plate and the rope are the
    // whole composition there and it was being cluttered from both sides
    // (was: a hydrant at 2260)
    put("fb-newsbox", 3930);
    putH("fb-dog", 985,
      '<i class="t"></i><i class="b"></i><i class="h"></i><i class="e"></i><i class="l1"></i><i class="l2"></i>');
    [2520, 3360, 5120].forEach((x) => put("fb-bin", x));
    // NOT 4470. The bank facade builds two planters of its own, at
    // calc(50% - 92px) and calc(50% + 66px) off a 4400 centre — 4308 and 4466 —
    // so a street planter there lands on top of one of them. They are children
    // of .fb-door, so nothing walking top-level elements will ever report it.
    // 4640 is where the armoured truck parks — DOOR_AT(bank) + 240 — so a bush
    // there sits in front of it. 2200 was part of the clutter at HR's door.
    [4080].forEach((x) => put("fb-planter", x));
    put("fb-mailbox", 2670);
    put("fb-grate", 3700);   // 3620 put it under the coffee cart (3580..3658)
    put("fb-grate", 4700);

    // bollards guard the exchange door, which is why they stand exactly where
    // nobody else does: the gap the crowd leaves is the entrance
    [3200, 3240, 3280, 3320].forEach((x) => put("fb-bollard", x));

    putH("fb-cart", 3580,
      '<i class="sign">COFFEE</i><i class="awn"></i><i class="body"></i>' +
      '<i class="hatch"></i><i class="urn"></i><i class="lip"></i><i class="cup"></i>' +
      '<i class="w l"></i><i class="w r"></i>');

    // more of the flock, so the far half of the street is not silent either
    // in the gaps, never at anybody's feet: a small blue-grey shape beside
    // a shoe reads as dropped litter rather than as a bird
    [2342, 3550, 4126, 4832].forEach((x, i) => put("fb-pigeon" + (i % 2 ? " hop" : ""), x));

    // handles for art work: posing a walker at 1:1 is the only way to judge a
    // frame, and rebuilding that rig from scratch every time wasted real time
    window.__NPC = npcWalker; window.__DRESS = dress;

    window.__LOBBY_OK = true;
  };
})();
