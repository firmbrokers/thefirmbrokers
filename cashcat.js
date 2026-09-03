/* THE CASH CAT BUILDING — the first office.
 *
 * CASHCAT.description() on chain reads "The original name for Robinhood was
 * Cash Cat" and socials() carries one link, a Vlad Tenev tweet. That is their
 * whole declared identity, written by them. So this room is not cat
 * decoration: it is the company before it was renamed, kept as it was, on a
 * street where every other address is a working Firm office.
 *
 * The founder's portrait is THEIR OWN LOGO, cropped and de-grounded, not an
 * approximation of it. I drew a pixel cat four times and it was always "a cute
 * cat" rather than THE cat; in a founding office the portrait is a real
 * photograph anyway, so the real thing is both more honest and better.
 *
 * Module shape follows auction.js: registers window.__CASHCAT, level.js calls
 * .room() guarded, so a missing file leaves an honest empty room.
 */
(function () {
  "use strict";

  var CSS = `
/* ======================= THE STREET FACADE ==============================
   Rebuilt 1 Sep 2026 from their own assets rather than from a generic idea of
   an old shop, because this front is the first thing the Cash Cat team sees.

   WHAT THE RESEARCH CHANGED. Their identity is not cream-and-gold. It is ACID
   LIME #CCFF00 used as a FIELD with black type, monospace tickers, and one
   photograph of one sad cat that carries nothing -- no cash, no briefcase, no
   suit, whatever the lore says. Their og:image is already a building: black
   ground, a thin lime keyline, the cat, no text. Their own site runs a
   scrolling monospace marquee. And #CCFF00 opens with the same "cc" their
   factory forces onto the END of every token address it mints, which is too
   neat to be an accident and is why the hanging sign says cc and nothing else.

   THE TENSION, AND HOW IT IS RESOLVED. The lore makes this the OLDEST address
   on the street; the brand is neon-new. A real city resolves that every day --
   an old building with a modern tenant's sign bolted to it. So the ARCHITECTURE
   is warm brick, cream stone, a cornice, a fire escape and a water tower, which
   belongs beside the bank and the exchange; and the BRAND is black-and-lime,
   confined to the things a tenant actually installs: the hanging sign, the
   panel, the marquee. Gold stays the street's colour. Lime is only ever Cash
   Cat's. One accent, one owner, one job.

   Warm brick and a warm-lit shop window against a cool dusk sky, with a single
   acid-lime neon: that is the whole colour argument. ------------------------ */
.fb-door.theme-cashcat{
  --ccf-mortar:#6d4536;--ccf-stone:#e9e4d6;--ccf-stone2:#cbc2ad;
  --ccf-lime:#ccff00;--ccf-black:#0c0e10;--ccf-warm:#ffd98a;--ccf-metal:#6c7680;
  --ccf-gold:#c8a24a;
  background:
    repeating-linear-gradient(0deg,rgba(0,0,0,.05) 0 15px,transparent 15px 47px),
    repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 68px,transparent 68px 136px),
    radial-gradient(ellipse at 50% 8%,rgba(255,226,190,.14),transparent 62%),
    /* translucent, so the bond underneath still reads */
    linear-gradient(rgba(150,92,70,.48),rgba(108,63,48,.72)),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='34'%3E%3Crect width='36' height='34' fill='%238f5340'/%3E%3Crect y='15' width='36' height='2' fill='%2357392c'/%3E%3Crect y='32' width='36' height='2' fill='%2357392c'/%3E%3Crect x='0' width='2' height='15' fill='%2357392c'/%3E%3Crect x='18' y='17' width='2' height='15' fill='%2357392c'/%3E%3C/svg%3E");
  border:5px solid var(--ink);box-shadow:11px 13px 0 rgba(0,0,0,.30)}

/* ---------- the roof, which is where a silhouette is won ----------------- */
.cc-f-tower{position:absolute;top:4px;left:322px;width:66px;height:46px}
.cc-f-tower u{position:absolute;left:6px;top:12px;width:54px;height:22px;
  background:repeating-linear-gradient(90deg,#8a6a44 0 7px,#75583a 7px 9px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-f-tower s{position:absolute;left:0;top:0;width:0;height:0;border-style:solid;
  border-color:transparent transparent #5c4526;border-width:0 33px 15px}
.cc-f-tower i{position:absolute;bottom:0;width:4px;height:14px;background:#5c4526}
.cc-f-tower i.l{left:12px} .cc-f-tower i.r{right:12px}
.cc-f-stack{position:absolute;top:14px;left:56px;width:34px;height:36px;
  background:linear-gradient(90deg,#8e5c46,#6f4635);border:3px solid var(--ink);
  box-sizing:border-box;box-shadow:inset 0 4px 0 #00000033}
.cc-f-smoke{position:absolute;top:0px;left:60px;width:11px;height:11px;
  border-radius:50%;background:rgba(226,222,214,.5);
  animation:ccf-smoke 5.5s linear infinite}
.cc-f-smoke.b{animation-delay:1.9s;left:67px;width:15px;height:15px;
  background:rgba(226,222,214,.36);animation-duration:6.8s}
.cc-f-smoke.c{animation-delay:3.7s;left:55px;width:8px;height:8px;
  background:rgba(226,222,214,.6);animation-duration:4.6s}
@keyframes ccf-smoke{
  0%{transform:translate(0,6px) scale(.45);opacity:.55}
  100%{transform:translate(15px,-30px) scale(1.5);opacity:0}}
.cc-f-aerial{position:absolute;top:8px;left:206px;width:30px;height:42px}
.cc-f-aerial u{position:absolute;left:13px;top:0;bottom:0;width:4px;background:var(--ink)}
.cc-f-aerial i{position:absolute;left:0;width:30px;height:3px;background:var(--ink)}
.cc-f-aerial i:nth-of-type(1){top:6px} .cc-f-aerial i:nth-of-type(2){top:15px;left:4px;width:22px}
.cc-f-aerial i:nth-of-type(3){top:24px;left:8px;width:14px}
.cc-f-roofcat{position:absolute;top:30px;left:150px;width:32px;height:20px}
/* it needed a neck notch, a leg break and its tail off the body, or it is
   just a blob with ears on it */
.cc-f-roofcat u{position:absolute;left:0;bottom:2px;width:24px;height:11px;
  background:var(--ink);border-radius:7px 7px 2px 2px}
.cc-f-roofcat s{position:absolute;left:17px;bottom:8px;width:15px;height:12px;
  background:var(--ink);border-radius:6px 6px 4px 4px}
.cc-f-roofcat i{position:absolute;bottom:0;width:4px;height:4px;background:var(--ink)}
.cc-f-roofcat i.l{left:3px} .cc-f-roofcat i.r{left:14px}
.cc-f-roofcat b{position:absolute;bottom:17px;width:0;height:0;border-style:solid;
  border-color:transparent transparent var(--ink);border-width:0 4px 7px}
.cc-f-roofcat b.l{left:18px} .cc-f-roofcat b.r{left:26px}
.cc-f-roofcat em{position:absolute;left:-9px;bottom:9px;width:12px;height:4px;
  background:var(--ink);border-radius:3px;transform:rotate(-22deg)}

/* ---------- cap: parapet over a dentilled cornice ------------------------ */
.cc-f-parapet{position:absolute;left:-11px;right:-11px;top:50px;height:16px;
  background:linear-gradient(var(--ccf-stone),var(--ccf-stone2));
  border:4px solid var(--ink);box-sizing:border-box}
.cc-f-parapet:before,.cc-f-parapet:after{content:"";position:absolute;top:-13px;
  width:34px;height:13px;background:var(--ccf-stone);
  border:4px solid var(--ink);border-bottom:none;box-sizing:border-box}
.cc-f-parapet:before{left:30px} .cc-f-parapet:after{right:30px}
.cc-f-cornice{position:absolute;left:-7px;right:-7px;top:66px;height:26px;
  background:linear-gradient(var(--ccf-stone),var(--ccf-stone2));
  border:4px solid var(--ink);box-sizing:border-box}
/* dentils: the little teeth under a cornice, and the cheapest depth on offer */
.cc-f-cornice:after{content:"";position:absolute;left:4px;right:4px;bottom:2px;height:7px;
  background:repeating-linear-gradient(90deg,var(--ink) 0 4px,transparent 4px 11px)}

/* ---------- the brand panel: their og image, mounted on the brick -------- */
.cc-f-og{position:absolute;top:100px;left:130px;width:190px;height:134px;
  background:var(--ccf-black);border:4px solid var(--ink);box-sizing:border-box;
  box-shadow:inset 0 0 0 3px var(--ccf-lime),5px 6px 0 rgba(0,0,0,.32)}
.cc-f-og img{position:absolute;left:50%;bottom:7px;height:116px;width:auto;margin-left:-38px;
  image-rendering:pixelated}
.cc-f-est{position:absolute;top:240px;left:85px;width:180px;padding:4px 0;
  text-align:center;background:linear-gradient(var(--ccf-gold),#8a6a2a);
  border:3px solid var(--ink);box-sizing:border-box;
  font:7px/1.5 var(--font-display);color:#2a2013;letter-spacing:.1em}

/* ---------- windows, with stone sills and somebody in one of them -------- */
.cc-f-win{position:absolute;width:72px;height:80px;
  background:linear-gradient(var(--ccf-warm),#e6b45c);
  border:4px solid var(--ink);box-sizing:border-box;
  box-shadow:0 0 16px rgba(255,206,110,.28)}
.cc-f-win.cold{background:linear-gradient(#93a9b8,#6b8395);box-shadow:none}
.cc-f-win:after{content:"";position:absolute;left:50%;top:3px;bottom:3px;width:3px;
  margin-left:-1px;background:var(--ink)}
.cc-f-win:before{content:"";position:absolute;left:3px;right:3px;top:50%;height:3px;
  margin-top:-1px;background:var(--ink)}
.cc-f-sill{position:absolute;width:84px;height:9px;
  background:linear-gradient(var(--ccf-stone),var(--ccf-stone2));
  border:3px solid var(--ink);box-sizing:border-box}
/* was a wide dome with two horns on it and read as a bat. A cat in a window is
   a narrow head over a wider body, and the ears have to TOUCH the head. */
.cc-f-catwin{position:absolute;left:13px;bottom:0;width:26px;height:26px;
  background:var(--ink);border-radius:9px 9px 0 0}
.cc-f-catwin:before{content:"";position:absolute;left:4px;top:-9px;width:18px;height:14px;
  background:var(--ink);border-radius:7px 7px 3px 3px}
.cc-f-catwin:after{content:"";position:absolute;left:5px;top:-14px;width:16px;height:8px;
  background:
    linear-gradient(40deg,transparent 46%,var(--ink) 46%) no-repeat 0 0/7px 8px,
    linear-gradient(-40deg,transparent 46%,var(--ink) 46%) no-repeat 100% 0/7px 8px}

/* ---------- the ghost sign: the old name, still on the wall -------------
   The user asked for more emphasis on the origin story, and a ghost sign is
   the one medium where the FORM says the same thing as the content: a painted
   sign from an earlier era, left up after the name changed. So the building
   itself makes the point before a word is read.

   The line under it is the token contract's own description() string, verbatim
   -- "The original name for Robinhood was Cash Cat", no trailing period --
   which anyone can check with one eth_call. That matters: it is quoted, not
   asserted. Cash Cat themselves hedge the history ("This is fan fiction with a
   ticker"), so a wall of ours must not state it more confidently than its
   owners do. Their words, their contract, named as the source.

   And it MUST stay faded. Under a squint test the portrait holds the top of
   the hierarchy on internal contrast in a small area; a large crisp word here
   would take that slot and start a two-way fight between the cat and some
   type. Ghost signs are worn by nature, so the honest version is also the one
   that stays in the texture tier. ------------------------------------------ */
.cc-f-ghost{position:absolute;text-align:center;pointer-events:none;
  /* streaky wear, so the paint has come off unevenly the way paint does */
  -webkit-mask-image:repeating-linear-gradient(94deg,#000 0 11px,rgba(0,0,0,.72) 11px 14px,#000 14px 26px);
  mask-image:repeating-linear-gradient(94deg,#000 0 11px,rgba(0,0,0,.72) 11px 14px,#000 14px 26px)}
.cc-f-ghost b{display:block;font:28px/1 var(--font-display);font-weight:400;
  letter-spacing:.17em;color:rgba(247,238,222,.38);
  text-shadow:0 2px 0 rgba(0,0,0,.16),0 0 5px rgba(0,0,0,.18)}
.cc-f-ghost i{display:block;font-style:normal;font:9px/1.7 var(--font-display);
  white-space:nowrap;letter-spacing:.05em;color:rgba(250,243,229,.66);margin-top:8px;
  text-shadow:0 1px 0 rgba(28,14,8,.55),0 0 4px rgba(28,14,8,.45)}
.cc-f-ghost em{display:block;font-style:normal;font:9px/1.7 var(--font-display);
  white-space:nowrap;letter-spacing:.02em;color:rgba(255,251,242,.82);margin-top:5px;
  text-shadow:0 1px 0 rgba(28,14,8,.6),0 0 4px rgba(28,14,8,.5)}

/* ---------- the hanging sign. Their lime, their suffix, nothing else ----- */
.cc-f-bracket{position:absolute;top:150px;left:0;width:22px;height:12px;
  background:var(--ccf-metal);border:3px solid var(--ink);box-sizing:border-box}
.cc-f-bracket:after{content:"";position:absolute;left:-2px;top:9px;width:3px;height:16px;
  background:var(--ink)}
.cc-f-blade{position:absolute;top:162px;left:-74px;width:78px;height:84px;
  background:var(--ccf-black);border:4px solid var(--ink);box-sizing:border-box;
  box-shadow:inset 0 0 0 3px var(--ccf-lime),0 0 34px rgba(204,255,0,.46);
  display:flex;align-items:center;justify-content:center}
.cc-f-blade b{font:34px/1 var(--font-display);font-weight:400;color:var(--ccf-lime);
  letter-spacing:.04em;text-shadow:0 0 12px rgba(204,255,0,.85);
  animation:ccf-buzz 7s steps(1,end) infinite}
@keyframes ccf-buzz{0%,90%,100%{opacity:1}92%{opacity:.5}94%{opacity:1}96%{opacity:.72}}
.cc-f-glow{position:absolute;top:250px;left:-98px;width:104px;height:26px;
  background:radial-gradient(ellipse at 50% 0,rgba(204,255,0,.32),transparent 70%);
  pointer-events:none}

/* ---------- services bolted to the right-hand wall ----------------------- */
.cc-f-escape{position:absolute;top:96px;right:8px;width:64px;height:168px}
.cc-f-escape i{position:absolute;left:0;width:64px;height:6px;background:var(--ccf-metal);
  border:2px solid var(--ink);box-sizing:border-box}
.cc-f-escape i:nth-of-type(1){top:0} .cc-f-escape i:nth-of-type(2){top:64px}
.cc-f-escape i:nth-of-type(3){top:128px}
.cc-f-escape i:after{content:"";position:absolute;left:1px;right:1px;bottom:3px;height:15px;
  background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 9px)}
.cc-f-escape i:before{content:"";position:absolute;left:1px;right:1px;bottom:16px;height:2px;
  background:var(--ink)}
/* the ladders lean, which is the only diagonal on the whole front */
.cc-f-escape u{position:absolute;width:11px;box-sizing:border-box;
  border-left:2px solid var(--ink);border-right:2px solid var(--ink);
  background:repeating-linear-gradient(transparent 0 7px,var(--ink) 7px 9px)}
.cc-f-escape u{height:62px}
.cc-f-escape u.a{left:10px;top:4px;transform:rotate(8deg)}
.cc-f-escape u.b{right:10px;top:68px;transform:rotate(-8deg)}
.cc-f-pipe{position:absolute;top:86px;right:-9px;width:10px;height:184px;
  background:linear-gradient(90deg,#7b8590,#525b64);border:2px solid var(--ink);
  box-sizing:border-box}
.cc-f-pipe:before{content:"";position:absolute;left:-5px;top:-12px;width:18px;height:14px;
  background:#6c7680;border:3px solid var(--ink);box-sizing:border-box}
/* a shoe at the bottom, because it was stopping in mid air attached to nothing */
.cc-f-pipe:after{content:"";position:absolute;left:-4px;bottom:-9px;width:16px;height:12px;
  background:#6c7680;border:3px solid var(--ink);box-sizing:border-box;
  border-radius:0 0 6px 6px}

/* ---------- the marquee. Their motif, already furniture-shaped ----------- */
.cc-f-fascia:after{content:"";position:absolute;inset:0;pointer-events:none;
  box-shadow:inset 20px 0 15px -12px rgba(0,0,0,.5),inset -20px 0 15px -12px rgba(0,0,0,.5)}
.cc-f-fascia{position:absolute;left:4px;right:126px;bottom:164px;height:26px;
  background:#e0d7c0;border:4px solid var(--ink);box-sizing:border-box;overflow:hidden;
  display:flex;align-items:center}
.cc-f-tapewin{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;
  /* 22px left a half-faded letter standing at the left edge at 1x ("EY LAUNCH");
     dark type on a light fascia needs a longer run-out */
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 44px,#000 calc(100% - 44px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 44px,#000 calc(100% - 44px),transparent 100%)}
.cc-f-tape{display:flex;white-space:nowrap;animation:ccf-tape 22s linear infinite}
.cc-f-tape span{font:8px/1 var(--font-display);color:#332e26;letter-spacing:.11em;
  padding-right:24px}
@keyframes ccf-tape{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* ---------- the shopfront, where the eye actually lands ------------------ */
.cc-f-awning{position:absolute;left:-16px;right:-16px;bottom:130px;height:32px;
  background:repeating-linear-gradient(90deg,#191d20 0 26px,var(--ccf-lime) 26px 34px);
  border:4px solid var(--ink);box-sizing:border-box}
/* the valance reads as little teeth, which is what stops an awning looking flat */
.cc-f-awning:after{content:"";position:absolute;left:5px;right:5px;bottom:-11px;height:11px;
  background:repeating-linear-gradient(90deg,#191d20 0 26px,var(--ccf-lime) 26px 34px);
  clip-path:polygon(0 0,100% 0,100% 40%,98.91% 40%,98.91% 100%,93.41% 100%,93.41% 40%,91.22% 40%,91.22% 100%,85.72% 100%,85.72% 40%,83.52% 40%,83.52% 100%,78.02% 100%,78.02% 40%,75.83% 40%,75.83% 100%,70.33% 100%,70.33% 40%,68.14% 40%,68.14% 100%,62.64% 100%,62.64% 40%,60.45% 40%,60.45% 100%,54.95% 100%,54.95% 40%,52.75% 40%,52.75% 100%,47.25% 100%,47.25% 40%,45.06% 40%,45.06% 100%,39.56% 100%,39.56% 40%,37.37% 40%,37.37% 100%,31.87% 100%,31.87% 40%,29.68% 40%,29.68% 100%,24.18% 100%,24.18% 40%,21.98% 40%,21.98% 100%,16.48% 100%,16.48% 40%,14.29% 40%,14.29% 100%,8.79% 100%,8.79% 40%,6.60% 40%,6.60% 100%,1.10% 100%,1.10% 40%,0 40%)}
.cc-f-pil{position:absolute;bottom:0;width:9px;height:130px;
  background:linear-gradient(90deg,var(--ccf-stone),var(--ccf-stone2));
  border:4px solid var(--ink);box-sizing:border-box}
.cc-f-shopwin{position:absolute;bottom:26px;width:146px;height:86px;
  background:linear-gradient(180deg,#ffe6ab,#f0bd66);
  border:4px solid var(--ink);box-sizing:border-box;overflow:hidden;
  box-shadow:0 0 30px rgba(255,206,110,.42)}
.cc-f-shopwin:after{content:"";position:absolute;left:0;right:0;top:0;height:10px;
  background:linear-gradient(rgba(255,255,255,.5),transparent)}
/* the cats you can see through the glass, at two depths */
.cc-f-cats{position:absolute;left:0;right:0;bottom:0;height:40px}
.cc-f-cats.flip{transform:scaleX(-1)}
/* a shelf, so the cats are sitting on something rather than floating */
.cc-f-cats:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;
  background:rgba(60,40,22,.5)}
/* the back row used to be three soft mounds that read as sand dunes. Two are
   cats now, with ears, and the third is a crate -- things a shop window holds */
.cc-f-cats i{position:absolute;bottom:4px;background:rgba(38,26,16,.62)}
.cc-f-cats i.a{left:10px;width:23px;height:18px;border-radius:9px 9px 0 0}
.cc-f-cats i.a:before,.cc-f-cats i.a:after{content:"";position:absolute;top:-4px;
  width:0;height:0;border-style:solid;border-width:0 4px 7px;
  border-color:transparent transparent rgba(38,26,16,.62)}
.cc-f-cats i.a:before{left:4px} .cc-f-cats i.a:after{right:4px}
.cc-f-cats i.b{left:46px;width:18px;height:14px;border-radius:7px 7px 0 0}
.cc-f-cats i.b:before,.cc-f-cats i.b:after{content:"";position:absolute;top:-3px;
  width:0;height:0;border-style:solid;border-width:0 3px 6px;
  border-color:transparent transparent rgba(38,26,16,.62)}
.cc-f-cats i.b:before{left:3px} .cc-f-cats i.b:after{right:3px}
.cc-f-cats i.c{right:10px;width:21px;height:16px;
  box-shadow:inset 0 0 0 2px rgba(20,12,6,.5),inset 0 7px 0 -5px rgba(20,12,6,.45)}
.cc-f-cats b{position:absolute;bottom:4px;background:var(--ink);border-radius:10px 10px 0 0}
.cc-f-cats b.a{left:82px;width:28px;height:27px}
.cc-f-cats b.a:before,.cc-f-cats b.a:after{content:"";position:absolute;top:-8px;
  width:0;height:0;border-style:solid;border-color:transparent transparent var(--ink);
  border-width:0 5px 9px}
.cc-f-cats b.a:before{left:2px} .cc-f-cats b.a:after{right:2px}
/* window vinyl: three things their own navigation actually calls itself */
.cc-f-vinyl{position:absolute;left:0;right:0;top:7px;text-align:center;white-space:nowrap;
  font:7px/1 var(--font-display);color:var(--ccf-black);letter-spacing:.1em;opacity:.72}
.cc-f-riser{position:absolute;bottom:0;width:150px;height:26px;
  background:linear-gradient(#16181b,#0a0b0d);border:4px solid var(--ink);
  box-sizing:border-box;box-shadow:inset 0 -5px 0 rgba(204,255,0,.5)}
.cc-f-riser:after{content:"";position:absolute;left:4px;right:4px;top:5px;height:12px;
  background:repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 20px,transparent 20px 22px)}
.cc-f-transom{position:absolute;left:218px;bottom:66px;width:114px;height:22px;
  background:linear-gradient(#1a1d20,#0c0e10);border:4px solid var(--ink);
  box-sizing:border-box;display:flex;align-items:center;justify-content:center}
.cc-f-transom b{font:12px/1 var(--font-display);color:var(--ccf-lime);letter-spacing:.1em;
  text-shadow:0 0 9px rgba(204,255,0,.8)}
.cc-f-door{position:absolute;left:218px;bottom:0;width:114px;height:66px;
  background:linear-gradient(#3a332a,#221d17);border:4px solid var(--ink);box-sizing:border-box}
.cc-f-door:after{content:"";position:absolute;left:50%;top:6px;bottom:20px;width:3px;
  margin-left:-1px;background:rgba(0,0,0,.55)}
.cc-f-flap{position:absolute;left:96px;bottom:3px;width:26px;height:19px;
  background:#15120e;border:3px solid var(--ink);box-sizing:border-box;
  transform-origin:50% 0;animation:ccf-flapswing 11s ease-out infinite}
/* it swings every so often, because somebody just went through it */
@keyframes ccf-flapswing{
  0%,84%,100%{transform:rotate(0)} 87%{transform:rotate(-31deg)}
  91%{transform:rotate(11deg)} 95%{transform:rotate(-4deg)}}
.cc-f-flap:after{content:"";position:absolute;left:5px;right:5px;top:4px;height:3px;
  background:var(--ccf-lime);opacity:.65}

/* ---------- CATS. The building is called Cash Cat ------------------------
   One skeleton in side view -- body, head, two ears, tail, four legs -- with
   three animations layered on separate elements so they do not fight: the
   OUTER box patrols, an INNER rig flips in one step at each end (interpolating
   scaleX through zero squashes the cat flat, which reads as a bug), the legs
   alternate, and the tail sways on its own slower clock. Anything that moves
   here stops moving under prefers-reduced-motion. ---------------------- */
.cc-f-cat{position:absolute;bottom:-5px;width:52px;height:30px;
  animation:ccf-patrol var(--dur,26s) linear infinite}
.cc-f-cat .rig{position:absolute;inset:0;
  animation:ccf-face var(--dur,26s) steps(1,end) infinite}
.cc-f-cat .bod{position:absolute;left:8px;bottom:9px;width:32px;height:15px;
  background:var(--fur,#efe8d8);border:3px solid var(--ink);box-sizing:border-box;
  border-radius:8px 11px 7px 7px}
.cc-f-cat .hed{position:absolute;left:31px;bottom:15px;width:17px;height:15px;
  background:var(--fur,#efe8d8);border:3px solid var(--ink);box-sizing:border-box;
  border-radius:7px 7px 6px 6px}
.cc-f-cat .hed:before,.cc-f-cat .hed:after{content:"";position:absolute;top:3px;
  width:2px;height:3px;background:var(--ink);border-radius:1px}
.cc-f-cat .hed:before{left:3px} .cc-f-cat .hed:after{right:3px}
.cc-f-cat .ear{position:absolute;bottom:28px;width:0;height:0;border-style:solid;
  border-color:transparent transparent var(--ink);border-width:0 4px 7px}
.cc-f-cat .ear.l{left:32px} .cc-f-cat .ear.r{left:41px}
.cc-f-cat .tal{position:absolute;left:2px;bottom:16px;width:15px;height:9px;
  background:var(--fur,#efe8d8);border:3px solid var(--ink);box-sizing:border-box;
  border-radius:4px;transform-origin:100% 50%;
  animation:ccf-tail 2.2s ease-in-out infinite alternate}
.cc-f-cat .leg{position:absolute;bottom:0;width:10px;height:12px;
  background:var(--fur,#efe8d8);border:3px solid var(--ink);box-sizing:border-box;
  border-radius:0 0 4px 4px;transform-origin:50% 0}
.cc-f-cat .leg.a{left:10px;animation:ccf-step .62s ease-in-out infinite}
.cc-f-cat .leg.b{left:19px;animation:ccf-step .62s ease-in-out infinite reverse}
.cc-f-cat .leg.c{left:28px;animation:ccf-step .62s ease-in-out infinite reverse}
.cc-f-cat .leg.d{left:36px;animation:ccf-step .62s ease-in-out infinite}
@keyframes ccf-patrol{
  0%{transform:translateX(0)} 48%{transform:translateX(var(--range,240px))}
  50%{transform:translateX(var(--range,240px))} 98%{transform:translateX(0)}
  100%{transform:translateX(0)}}
@keyframes ccf-face{0%,48%{transform:scaleX(1)} 50%,100%{transform:scaleX(-1)}}
@keyframes ccf-step{0%,100%{transform:rotate(-13deg)} 50%{transform:rotate(13deg)}}
@keyframes ccf-tail{from{transform:rotate(-14deg)} to{transform:rotate(18deg)}}

/* ---------- moths, because there is a light on -------------------------- */
.cc-f-moth{position:absolute;width:10px;height:7px;border-radius:50%;
  background:#f6f0d6;box-shadow:0 0 7px rgba(204,255,0,.75),0 0 2px rgba(0,0,0,.5);
  animation:ccf-moth var(--md,7s) ease-in-out infinite}
.cc-f-moth:after{content:"";position:absolute;left:2px;top:-2px;width:6px;height:5px;
  border-radius:50%;background:#fffdf2;opacity:.8}
@keyframes ccf-moth{
  0%{transform:translate(0,0)}   25%{transform:translate(17px,-13px)}
  50%{transform:translate(4px,-22px)} 75%{transform:translate(-14px,-9px)}
  100%{transform:translate(0,0)}}

/* ---------- a window box, and the plain brick under a sill -------------- */
.cc-f-box{position:absolute;width:86px;height:19px;
  background:linear-gradient(#8a6a3e,#5c4526);border:3px solid var(--ink);box-sizing:border-box}
/* leaves, not pills: different widths, heights, angles and greens, and a leaf
   shape rather than a rounded bar */
.cc-f-box i{position:absolute;bottom:12px;background:#4f7f3c;
  border:2px solid var(--ink);box-sizing:border-box;
  border-radius:70% 20% 60% 20%;transform-origin:50% 100%}
.cc-f-box i:nth-of-type(1){left:5px;width:9px;height:17px;transform:rotate(-22deg)}
.cc-f-box i:nth-of-type(2){left:16px;width:12px;height:22px;background:#5b9143;transform:rotate(-5deg)}
.cc-f-box i:nth-of-type(3){left:29px;width:8px;height:14px;background:#436e33;transform:rotate(13deg)}
.cc-f-box i:nth-of-type(4){left:40px;width:13px;height:20px;transform:rotate(-11deg)}
.cc-f-box i:nth-of-type(5){left:66px;width:10px;height:16px;background:#5b9143;transform:rotate(24deg)}
.cc-f-box b{position:absolute;width:6px;height:6px;border-radius:50%;
  background:#d8556a;border:2px solid var(--ink);box-sizing:border-box}
.cc-f-box b.a{left:9px;bottom:25px} .cc-f-box b.b{left:24px;bottom:31px}
.cc-f-box b.c{left:68px;bottom:24px}

/* ---------- a cat on the awning, because of course --------------------- */
.cc-f-awncat{position:absolute;width:30px;height:34px}
.cc-f-awncat u{position:absolute;left:0;bottom:0;width:30px;height:19px;
  background:#15181a;border-radius:13px 13px 3px 3px}
.cc-f-awncat s{position:absolute;left:5px;bottom:15px;width:20px;height:16px;
  background:#15181a;border-radius:9px 9px 6px 6px}
.cc-f-awncat b{position:absolute;bottom:28px;width:0;height:0;border-style:solid;
  border-color:transparent transparent #15181a;border-width:0 4px 7px}
.cc-f-awncat b.l{left:5px} .cc-f-awncat b.r{right:5px}
.cc-f-awncat i{position:absolute;bottom:22px;width:3px;height:3px;background:var(--ccf-lime);
  border-radius:50%;opacity:.85}
.cc-f-awncat i.l{left:10px} .cc-f-awncat i.r{right:10px}
.cc-f-awncat em{position:absolute;right:-11px;bottom:1px;width:15px;height:5px;
  background:#15181a;border-radius:3px;transform-origin:0 50%;
  animation:ccf-tail 3.1s ease-in-out infinite alternate}

/* ---------- a grate, and the city breathing through it ------------------ */
.cc-f-grate{position:absolute;bottom:-9px;width:52px;height:9px;
  background:repeating-linear-gradient(90deg,#4a5158 0 5px,#2b3036 5px 8px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-f-steam{position:absolute;width:15px;height:15px;border-radius:50%;
  background:rgba(232,230,222,.4);animation:ccf-steam var(--sd,6s) linear infinite}
@keyframes ccf-steam{
  0%{transform:translate(0,4px) scale(.4);opacity:.5}
  100%{transform:translate(-13px,-44px) scale(1.7);opacity:0}}

/* ---------- the entrance -----------------------------------------------
   level.css paints .doorway as a flat opaque rectangle and appends it AFTER
   this facade, so it always won and every other surface on the building had
   been worked while the one at eye level in the centre was a dark box. It has
   only two pseudo-elements, which is not enough to build a doorway out of.

   So the doorway goes TRANSPARENT, keeping its ink border and an inset shadow
   for depth, and a real entrance is drawn underneath at the same box. That
   also lets it read as OPEN -- warm light from the room beyond, the door leaf
   standing back against the jamb, a floor you can see -- which tells a player
   they can walk in. A closed door in the middle of a shopfront says the
   opposite of what this building wants to say. ------------------------- */
.fb-door.theme-cashcat .doorway{background:transparent;bottom:-5px;
  box-shadow:inset 0 0 20px rgba(0,0,0,.55)}
.cc-f-entry{position:absolute;left:50%;margin-left:-46px;bottom:-5px;width:92px;height:120px;
  overflow:hidden;background:linear-gradient(#5d4728 0 16%,#2e2114 54%,#160f08)}
.cc-f-entry .glow{position:absolute;left:0;right:0;bottom:0;height:52px;
  background:radial-gradient(ellipse at 50% 118%,rgba(255,206,120,.55),transparent 74%)}
.cc-f-entry .flr{position:absolute;left:0;right:0;bottom:0;height:14px;
  background:linear-gradient(#6f5a3c,#3f3220);border-top:2px solid rgba(0,0,0,.4)}
.cc-f-entry .rug{position:absolute;left:20px;right:20px;bottom:3px;height:6px;
  background:#7d2230;border-radius:2px}
/* the leaf, standing back against the left jamb */
.cc-f-entry .leaf{position:absolute;left:0;top:0;bottom:0;width:27px;
  background:linear-gradient(90deg,#75512d,#48311e);border-right:3px solid var(--ink)}
.cc-f-entry .leaf:before{content:"";position:absolute;left:5px;right:6px;top:9px;height:36px;
  box-sizing:border-box;background:linear-gradient(#d6e8f2,#9db6c6);border:2px solid var(--ink)}
.cc-f-entry .leaf:after{content:"";position:absolute;left:5px;right:6px;top:54px;bottom:24px;
  background:rgba(0,0,0,.28);box-shadow:inset 0 0 0 2px rgba(255,255,255,.07)}
.cc-f-entry .knob{position:absolute;left:19px;top:66px;width:7px;height:7px;border-radius:50%;
  background:linear-gradient(#e8cb80,#a8842f);border:2px solid var(--ink);box-sizing:border-box}
/* somebody is always sitting just inside */
.cc-f-entry .sit{position:absolute;right:15px;bottom:12px;width:23px;height:20px;
  background:#0b0805;border-radius:9px 9px 3px 3px}
.cc-f-entry .sit:before,.cc-f-entry .sit:after{content:"";position:absolute;top:-6px;
  width:0;height:0;border-style:solid;border-width:0 4px 7px;
  border-color:transparent transparent #0b0805}
.cc-f-entry .sit:before{left:2px} .cc-f-entry .sit:after{right:2px}

/* ---------- the door gets a head, like everything else on this wall ----- */
.cc-f-lintel{position:absolute;left:50%;margin-left:-64px;bottom:120px;width:128px;height:11px;
  background:linear-gradient(var(--ccf-stone),var(--ccf-stone2));
  border:4px solid var(--ink);box-sizing:border-box}

/* ---------- the kerb: where a building stops being architecture ---------- */
.cc-f-step{position:absolute;left:50%;margin-left:-84px;bottom:-14px;width:168px;height:15px;
  background:linear-gradient(var(--ccf-stone),var(--ccf-stone2));
  border:4px solid var(--ink);box-sizing:border-box}
.cc-f-mat{position:absolute;left:50%;margin-left:-42px;bottom:-10px;width:84px;height:11px;
  background:#7d2230;border:3px solid var(--ink);box-sizing:border-box}
.cc-f-crate{position:absolute;left:-118px;bottom:-5px;width:44px;height:34px;
  background:repeating-linear-gradient(0deg,#a87c46 0 8px,#8a6437 8px 10px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-f-crate:after{content:"";position:absolute;left:4px;right:4px;top:6px;height:3px;
  background:rgba(0,0,0,.35)}
.cc-f-milk{position:absolute;left:-68px;bottom:-5px;width:14px;height:22px;
  background:linear-gradient(#e8f2f6,#b8ccd6);border:3px solid var(--ink);
  box-sizing:border-box;border-radius:4px 4px 2px 2px}
.cc-f-milk:after{content:"";position:absolute;left:2px;right:2px;top:-6px;height:6px;
  background:#cfd9de;border:3px solid var(--ink);box-sizing:border-box}
.cc-f-sand{position:absolute;right:-196px;bottom:-5px;width:172px;height:90px}
.cc-f-sand i{position:absolute;bottom:0;width:6px;height:18px;background:#5c4526;
  border:2px solid var(--ink);box-sizing:border-box}
.cc-f-sand i.l{left:34px} .cc-f-sand i.r{right:34px}
.cc-f-sand u{position:absolute;left:0;bottom:12px;width:172px;height:74px;box-sizing:border-box;
  display:flex;flex-direction:column;justify-content:center;
  background:linear-gradient(#16191c,#0b0d0f);border:4px solid var(--ink);
  box-shadow:0 0 0 3px var(--ccf-lime);padding:9px 4px 0;text-align:center}
.cc-f-sand b{display:block;white-space:nowrap;font:11px/1.6 var(--font-display);
  color:var(--ccf-lime);letter-spacing:.1em;font-weight:400}
.cc-f-sand b.big{font-size:18px;line-height:1.15;letter-spacing:.04em;
  text-shadow:0 0 10px rgba(204,255,0,.5)}
.cc-f-sand b.src{font-size:6px;opacity:.55;margin-top:5px;letter-spacing:.12em}
.cc-f-stoop{position:absolute;left:-46px;bottom:-5px;width:52px;height:62px}
.cc-f-stoop u{position:absolute;left:0;bottom:0;width:52px;height:34px;
  background:linear-gradient(#f0ebdf,#d5cdbb);border:4px solid var(--ink);
  border-radius:24px 24px 4px 4px;box-sizing:border-box}
.cc-f-stoop s{position:absolute;left:9px;bottom:26px;width:34px;height:28px;
  background:linear-gradient(#f6f2e8,#ded7c7);border:4px solid var(--ink);
  border-radius:16px 16px 10px 10px;box-sizing:border-box}
.cc-f-stoop b{position:absolute;bottom:50px;width:0;height:0;
  border-style:solid;border-color:transparent transparent var(--ink);border-width:0 7px 12px}
.cc-f-stoop b.l{left:10px} .cc-f-stoop b.r{right:10px}
.cc-f-stoop i{position:absolute;bottom:38px;width:5px;height:5px;background:var(--ink);
  border-radius:50%;animation:ccf-blink 9s steps(1,end) infinite}
/* a slow blink is the whole performance: across twenty of their memes the cat
   is enthroned, dressed, launched into space and televised, and its face never
   changes once. Give it a walk cycle and it becomes a different character. */
@keyframes ccf-blink{0%,95%,100%{transform:scaleY(1)} 97%{transform:scaleY(.15)}}
.cc-f-stoop i.l{left:17px} .cc-f-stoop i.r{right:17px}
.cc-f-stoop u:before,.cc-f-stoop u:after{content:"";position:absolute;bottom:-3px;
  width:20px;height:14px;background:linear-gradient(#f8f5ec,#e6dfd0);
  border:4px solid var(--ink);box-sizing:border-box;border-radius:7px 7px 5px 5px}
.cc-f-stoop u:before{left:1px} .cc-f-stoop u:after{right:1px}
.cc-f-stoop em{position:absolute;right:-20px;bottom:0;width:28px;height:14px;
  background:linear-gradient(#f0ebdf,#d5cdbb);border:4px solid var(--ink);
  box-sizing:border-box;border-radius:4px 13px 13px 4px}
.cc-f-pigeon{position:absolute;top:56px;left:248px;width:16px;height:13px;
  background:#5b636c;border-radius:7px 7px 3px 3px}
.cc-f-pigeon:before{content:"";position:absolute;right:-4px;top:-5px;width:8px;height:8px;
  background:#68717b;border-radius:50%}
.cc-f-pigeon:after{content:"";position:absolute;right:-8px;top:-1px;width:5px;height:3px;
  background:#c9a24a;border-radius:1px}

@media (prefers-reduced-motion:reduce){
  .cc-f-tape,.cc-f-blade b,.cc-f-smoke,.cc-f-cat,.cc-f-cat .rig,.cc-f-cat .tal,
  .cc-f-cat .leg,.cc-f-moth,.cc-f-awncat em,.cc-f-fetail,.cc-f-steam,
  .cc-f-flap,.cc-f-stoop i{animation:none}
  .cc-f-smoke{opacity:.3}}

/* ---------- their ground, not ours: cream over our concrete -------------- */
.cc-wall{position:absolute;bottom:var(--ground-h);top:44px;
  background:linear-gradient(#fcfaf5,#efece3)}
.cc-wall:after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,#0000 0 118px,#00000009 118px 120px)}
.cc-dado{position:absolute;bottom:var(--ground-h);height:120px;
  background:linear-gradient(#b3ada2,#948e84);
  box-shadow:inset 0 6px 0 #ffffff26}
.cc-dado:before{content:"";position:absolute;left:0;right:0;top:-9px;height:6px;
  background:linear-gradient(#c8a24a,#8a6a2a);
  border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}

/* ---------- THE FOUNDER ------------------------------------------------- */
.cc-portrait{position:absolute;width:196px;
  background:linear-gradient(160deg,#fdfbf6,#ece7dc);
  border:6px solid #c8a24a;box-shadow:0 0 0 4px var(--ink),9px 10px 0 rgba(0,0,0,.3);
  padding:14px 14px 10px;box-sizing:border-box;text-align:center}
.cc-portrait img{display:block;margin:0 auto;width:112px;image-rendering:pixelated}
.cc-portrait u{display:block;margin-top:9px;text-decoration:none;
  font:8px/1.6 var(--font-display);color:#4a4237;letter-spacing:.06em}
.cc-plaque{position:absolute;width:210px;box-sizing:border-box;text-align:center;
  background:linear-gradient(#d8b25c,#a07c36);border:3px solid var(--ink);
  padding:6px 8px;font:8px/1.7 var(--font-display);color:#2a2013;letter-spacing:.05em;
  box-shadow:inset 0 2px 0 #fff6,3px 3px 0 rgba(0,0,0,.28)}

/* ---------- the founding certificate: their own words, cited ------------- */
.cc-cert{position:absolute;width:420px;box-sizing:border-box;
  background:linear-gradient(165deg,#fffdf7,#f2ecdd);
  border:5px solid #c8a24a;box-shadow:0 0 0 4px var(--ink),8px 9px 0 rgba(0,0,0,.28);
  padding:18px 20px 16px;text-align:center}
.cc-cert h5{margin:0 0 10px;font:9px/1.6 var(--font-display);color:#8a6a2a;
  letter-spacing:.22em;text-transform:uppercase}
.cc-cert q{display:block;quotes:none;font:20px/1.35 'VT323',monospace;color:#2b2620}
.cc-cert em{display:block;margin-top:11px;font-style:normal;
  font:7px/1.7 var(--font-display);color:#6b6455;letter-spacing:.05em}
.cc-cert i{display:block;margin:12px auto 0;width:64px;height:3px;background:#c8a24a}

/* ---------- the burn board: the number their account can screenshot ------ */
.cc-burn{position:absolute;width:392px;box-sizing:border-box;
  background:linear-gradient(160deg,#2b323a,#1a1e24);
  border:4px solid var(--ink);box-shadow:0 0 0 3px #c8a24a,5px 5px 0 rgba(0,0,0,.3)}
.cc-burn b{display:block;padding:9px 12px;text-align:center;
  background:linear-gradient(#c8a24a,#8a6a2a);border-bottom:3px solid var(--ink);
  color:#2a2013;font:8px/1.5 var(--font-display)}
.cc-burn .rows{padding:12px 14px 13px}
.cc-burn .r{display:flex;justify-content:space-between;gap:12px;
  font:17px/1.5 'VT323',monospace;color:#79b98c}
.cc-burn .r b{all:unset;color:#eaffea;font-variant-numeric:tabular-nums}
.cc-burn .cap{font:8px/1.6 var(--font-display);color:#79b98c;letter-spacing:.06em}
.cc-burn .big{font:26px/1.2 'VT323',monospace;color:#ff8f6b;
  text-shadow:0 0 12px #ff6b3a55;text-align:right;margin-bottom:4px}

/* ---------- cat furniture, and it has to be good ------------------------ */
.cc-post{position:absolute;bottom:var(--ground-h);width:56px;height:172px}
.cc-post u{position:absolute;left:16px;bottom:14px;width:24px;height:158px;
  background:repeating-linear-gradient(#c9b48b 0 5px,#b09a6f 5px 10px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-post i{position:absolute;left:0;bottom:0;width:56px;height:18px;
  background:linear-gradient(#8a6a3e,#5c4526);border:3px solid var(--ink);box-sizing:border-box}
.cc-post s{position:absolute;left:6px;top:0;width:44px;height:16px;
  background:linear-gradient(#b3ada2,#8f897f);border:3px solid var(--ink);box-sizing:border-box}
/* the middle of a post that gets used every day is shredded, not smooth */
.cc-post u:after{content:"";position:absolute;left:-3px;right:-3px;top:44px;height:34px;
  background:repeating-linear-gradient(96deg,#a8905f 0 3px,transparent 3px 8px)}
.cc-post u:before{content:"";position:absolute;left:-9px;top:70px;width:11px;height:3px;
  background:#a8905f;box-shadow:1px 9px 0 -1px #a8905f,16px -22px 0 -1px #a8905f}
.cc-bowl{position:absolute;bottom:var(--ground-h);width:64px;height:30px;
  background:linear-gradient(#d8b25c,#a07c36);border:3px solid var(--ink);
  border-radius:0 0 26px 26px;box-sizing:border-box}
.cc-bowl b{position:absolute;left:0;right:0;top:5px;text-align:center;
  font:6px/1 var(--font-display);color:#2a2013}
.cc-paw{position:absolute;bottom:calc(var(--ground-h) - 30px);width:15px;height:13px}
.cc-paw u{position:absolute;left:2px;bottom:0;width:11px;height:8px;
  background:#9a8f7c;border-radius:50%;opacity:.42}
.cc-paw i{position:absolute;bottom:8px;width:4px;height:4px;background:#9a8f7c;
  border-radius:50%;opacity:.42}
.cc-paw i:nth-of-type(1){left:0} .cc-paw i:nth-of-type(2){left:5px;bottom:10px}
.cc-paw i:nth-of-type(3){left:10px}
.cc-flap{position:absolute;bottom:var(--ground-h);width:46px;height:38px;
  background:linear-gradient(#3a332a,#241f19);border:3px solid var(--ink);
  box-sizing:border-box}
.cc-flap:after{content:"";position:absolute;left:7px;right:7px;top:5px;height:3px;background:#c8a24a}

/* ---------- the BUY plate, on the wall beside the door you came in by -----
   A tenant's install, so it wears their colours like the hanging sign out
   front: black field, lime keyline, lime type, the same buzz. It is a door
   out (config.js cashcatBuyUrl: the token's page on letscash, one exact URL),
   and it sits at hand height right of the entrance so it is the first thing
   read on the way in and the last on the way out. Nothing stands in front of
   it: the flap is on the floor below, the paw prints start past it. Kept at
   EVERY height -- a call to action that vanishes on a laptop is not one. */
.cc-buy{position:absolute;width:300px;height:72px;left:1030px;cursor:pointer;   /* centre 1180, the certificate's */
  /* centred between the ceiling (44 from the top) and the certificate's top
     (ground + 338 from the bottom): mid = 50% + (ground + 338 - 44) / 2 */
  bottom:calc(50% + (var(--ground-h) + 294px) / 2 - 36px);
  background:#0c0e10;border:4px solid var(--ink);box-sizing:border-box;
  box-shadow:inset 0 0 0 3px #ccff00,5px 6px 0 rgba(0,0,0,.32),0 0 26px rgba(204,255,0,.28);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;
  text-align:center;overflow:hidden}
.cc-buy b{font:19px/1 var(--font-display);font-weight:400;color:#ccff00;letter-spacing:.04em;
  white-space:nowrap;text-shadow:0 0 10px rgba(204,255,0,.8);animation:ccf-buzz 7s steps(1,end) infinite}
.cc-buy em{font-style:normal;font:7px/1.4 var(--font-display);color:#e8e6df;letter-spacing:.14em;white-space:nowrap}
.cc-buy:hover{box-shadow:inset 0 0 0 3px #ccff00,5px 6px 0 rgba(0,0,0,.32),0 0 40px rgba(204,255,0,.6)}
/* the wall changes with the window. Under 710 the certificate is gone: the
   small plate takes its place over the desk (the big one would sit on the
   sleeper's zzz), under the ceiling even at 520. From
   890 the founding board stands between ceiling and certificate, leaving a
   62px slot: a small plate lives there. From 1010 there is room above the
   board again (its top = ground + 625): the big plate goes back, centred
   between the ceiling and the board. */
@media (max-height:709px){
  .cc-buy{width:200px;height:46px;left:1080px;gap:3px;bottom:calc(var(--ground-h) + 190px)}
  .cc-buy b{font-size:13px} .cc-buy em{font-size:6px}}
@media (min-height:890px) and (max-height:1009px){
  .cc-buy{width:200px;height:46px;left:1080px;gap:3px;bottom:calc(var(--ground-h) + 346px)}
  .cc-buy b{font-size:13px} .cc-buy em{font-size:6px}}
@media (min-height:1010px){.cc-buy{bottom:calc(50% + (var(--ground-h) + 581px) / 2 - 36px)}}

/* ---------- glazing, so the gaps are windows and not seams -------------- */
.cc-win{position:absolute;bottom:calc(var(--ground-h) + 132px);height:268px;
  background:linear-gradient(#bfe4f6,#eaf6fd);border:5px solid var(--ink);
  box-shadow:inset 0 0 0 4px #d9d3c6;overflow:hidden}
.cc-win i{position:absolute;bottom:0;background:#9fb0bd;box-shadow:inset 0 3px 0 #ffffff45}
.cc-win u{position:absolute;top:0;bottom:0;width:6px;background:#d9d3c6;
  border-left:2px solid var(--ink);border-right:2px solid var(--ink)}
.cc-win s{position:absolute;left:0;right:0;height:6px;background:#d9d3c6;
  border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}

/* ---------- the letscash board: their launchpad, in their own numbers --- */
.cc-board{position:absolute;width:392px;box-sizing:border-box;
  background:linear-gradient(160deg,#fffdf7,#f1ebdc);
  border:5px solid var(--ink);box-shadow:0 0 0 4px #c8a24a,6px 7px 0 rgba(0,0,0,.26)}
.cc-board b.t{display:block;padding:9px 12px;text-align:center;
  background:linear-gradient(#2b323a,#1a1e24);border-bottom:4px solid var(--ink);
  color:#ffd75e;font:9px/1.5 var(--font-display);letter-spacing:.14em}
.cc-board .rows{padding:13px 16px 14px}
.cc-board .r{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
  padding:5px 0;border-bottom:1px dotted #cfc7b4;
  font:8px/1.6 var(--font-display);color:#6b6455;letter-spacing:.06em}
.cc-board .r:last-child{border-bottom:none}
.cc-board .r em{font-style:normal;font:19px/1 'VT323',monospace;color:#2b2620;
  font-variant-numeric:tabular-nums}
.cc-board .src{padding:0 16px 13px;font:7px/1.7 var(--font-display);
  color:#9a917f;letter-spacing:.05em;text-align:center}

/* ---------- FIRST CONTACT: the partnership itself, as the exhibit ------- */
/* ~34px shorter than the first cut (padding, margins, line-height), so the
   panel clears the ceiling from 890 up instead of 925: on a 900-tall window,
   which most laptops give, the best fact in the room used to be hidden */
.cc-first{position:absolute;width:600px;box-sizing:border-box;text-align:center;
  background:linear-gradient(165deg,#2b323a,#191d22);
  border:5px solid #c8a24a;box-shadow:0 0 0 4px var(--ink),8px 9px 0 rgba(0,0,0,.3);
  padding:14px 26px 12px}
.cc-first h4{margin:0 0 8px;font:10px/1.6 var(--font-display);color:#ffd75e;
  letter-spacing:.26em;text-transform:uppercase}
.cc-first p{margin:0;font:21px/1.3 'VT323',monospace;color:#eae4d6}
.cc-first p b{color:#ffd75e;font-weight:400}
.cc-first .n{display:flex;justify-content:center;gap:38px;margin:10px 0 2px}
.cc-first .n span{font:8px/1.7 var(--font-display);color:#9a917f;letter-spacing:.08em}
.cc-first .n em{display:block;font:24px/1 'VT323',monospace;color:#a8f0b6;
  font-variant-numeric:tabular-nums;margin-bottom:4px}
.cc-first .src{margin-top:8px;font:7px/1.7 var(--font-display);
  color:#7d7565;letter-spacing:.06em}

/* ================= THE STAFF ============================================
   It is a cat office. It needs cats, and they need to be doing things: one
   asleep on the reception desk, one loafed on the cat tree, one sitting up
   watching the door. Built from one skeleton with pose modifiers so they read
   as the same species rather than three unrelated blobs. ---------------- */
.cc-c{position:absolute;bottom:var(--ground-h)}
.cc-c u{position:absolute;left:0;bottom:0;background:linear-gradient(#f2eee4,#d9d2c2);
  border:4px solid var(--ink);box-sizing:border-box}
.cc-c s{position:absolute;background:linear-gradient(#f8f5ec,#e2dbcb);
  border:4px solid var(--ink);box-sizing:border-box}
.cc-c b{position:absolute;width:0;height:0;border-left:7px solid transparent;
  border-right:7px solid transparent;border-bottom:12px solid var(--ink)}
.cc-c i{position:absolute;width:5px;height:5px;background:var(--ink);border-radius:50%}
.cc-c em{position:absolute;background:linear-gradient(#eee9dd,#d5cdbb);
  border:4px solid var(--ink);box-sizing:border-box}
/* SITTING, upright, watching the door */
.cc-c.sit{width:54px;height:66px}
.cc-c.sit u{width:54px;height:36px;border-radius:25px 25px 4px 4px}
.cc-c.sit s{left:10px;bottom:28px;width:34px;height:28px;border-radius:16px 16px 10px 10px}
.cc-c.sit b{bottom:52px} .cc-c.sit b.l{left:11px} .cc-c.sit b.r{right:11px}
.cc-c.sit i{bottom:40px} .cc-c.sit i.l{left:18px} .cc-c.sit i.r{right:18px}
.cc-c.sit u:before,.cc-c.sit u:after{content:"";position:absolute;bottom:-3px;
  width:20px;height:14px;background:linear-gradient(#f8f5ec,#e6dfd0);
  border:4px solid var(--ink);box-sizing:border-box;border-radius:8px 8px 5px 5px}
.cc-c.sit u:before{left:1px} .cc-c.sit u:after{right:1px}
/* lies on the floor and tapers. The old one ended in a 12x15 block hanging in
   space, which is what made a cat measuring 0px above the floor look airborne */
.cc-c.sit em{right:-21px;bottom:0;width:29px;height:14px;
  background:linear-gradient(#f2eee4,#d9d2c2);border-radius:4px 14px 14px 4px}
/* LOAFED, a bread cat, paws tucked */
.cc-c.loaf{width:66px;height:38px}
.cc-c.loaf u{width:66px;height:30px;border-radius:22px 22px 5px 5px}
.cc-c.loaf s{left:38px;bottom:16px;width:28px;height:22px;border-radius:13px 13px 8px 8px}
.cc-c.loaf b{bottom:34px;border-bottom-width:10px} .cc-c.loaf b.l{left:41px} .cc-c.loaf b.r{right:5px}
.cc-c.loaf i{bottom:24px;width:4px;height:4px} .cc-c.loaf i.l{left:45px} .cc-c.loaf i.r{right:12px}
.cc-c.loaf em{left:-16px;bottom:1px;width:22px;height:8px;border-radius:8px 0 0 8px}
/* ASLEEP, curled, eyes shut */
.cc-c.curl{width:96px;height:46px}
.cc-c.curl u{width:96px;height:38px;border-radius:34px}
.cc-c.curl s{left:8px;bottom:16px;width:36px;height:28px;border-radius:16px}
.cc-c.curl b{bottom:40px;border-bottom-width:9px;border-left-width:5px;border-right-width:5px}
.cc-c.curl b.l{left:12px} .cc-c.curl b.r{left:31px}
.cc-c.curl i{bottom:30px;width:11px;height:3px;border-radius:2px}
.cc-c.curl i.l{left:14px} .cc-c.curl i.r{left:29px}
.cc-c.curl em{right:-14px;bottom:5px;width:38px;height:9px;border-radius:9px}
.cc-z{position:absolute;font:13px/1 var(--font-display);color:#6f6757;
  transform:rotate(-12deg)}
.cc-z.b{font-size:10px;opacity:.75}

/* ---------- the way out, which this room has to draw for itself --------- */
.cc-door{position:absolute;bottom:var(--ground-h);width:112px;height:176px}
.cc-door u{position:absolute;inset:0;background:linear-gradient(#d3bd91,#a68d61);
  border:5px solid var(--ink);box-sizing:border-box}
.cc-door .tr{position:absolute;left:11px;right:11px;top:9px;height:20px;box-sizing:border-box;
  background:linear-gradient(#e6eef3,#bccbd6);border:3px solid var(--ink)}
.cc-door .tr:after{content:"";position:absolute;left:50%;top:0;bottom:0;width:3px;
  margin-left:-1px;background:var(--ink)}
.cc-door s{position:absolute;left:10px;right:10px;top:36px;bottom:0;box-sizing:border-box;
  background:linear-gradient(90deg,#7a5530,#4f3722);border:4px solid var(--ink);border-bottom:none}
.cc-door i{position:absolute;left:16px;right:16px;background:rgba(0,0,0,.26);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.07)}
.cc-door i.a{top:48px;height:44px} .cc-door i.b{top:104px;height:44px}
.cc-door b{position:absolute;right:20px;top:96px;width:10px;height:10px;border-radius:50%;
  background:linear-gradient(#e8cb80,#a8842f);border:3px solid var(--ink);box-sizing:border-box}

/* ---------- office furniture -------------------------------------------- */
.cc-desk{position:absolute;bottom:var(--ground-h);width:260px;height:96px;
  background:linear-gradient(#8a6a3e,#5c4526);border:5px solid var(--ink);
  box-shadow:inset 0 6px 0 #ffffff1f,6px 6px 0 rgba(0,0,0,.28);box-sizing:border-box}
.cc-desk .top{position:absolute;left:-10px;right:-10px;top:-12px;height:14px;
  background:linear-gradient(#a5814d,#7a5c33);border:4px solid var(--ink);box-sizing:border-box}
.cc-desk .drw{position:absolute;right:14px;width:74px;height:22px;
  background:#4a3720;border:3px solid var(--ink);box-sizing:border-box}
.cc-desk .drw:after{content:"";position:absolute;left:26px;top:7px;width:22px;height:4px;background:#c8a24a}
.cc-desk .drw.a{top:18px} .cc-desk .drw.b{top:50px}
.cc-bell{position:absolute;width:26px;height:20px;background:linear-gradient(#d8b25c,#a07c36);
  border:3px solid var(--ink);border-radius:13px 13px 0 0;box-sizing:border-box}
.cc-bell:after{content:"";position:absolute;left:9px;top:-7px;width:6px;height:7px;
  background:#a07c36;border:2px solid var(--ink)}
.cc-cab{position:absolute;bottom:var(--ground-h);width:78px;height:130px;
  background:linear-gradient(#9aa3ab,#6f777e);border:4px solid var(--ink);box-sizing:border-box}
.cc-cab i{position:absolute;left:8px;right:8px;height:30px;border:3px solid var(--ink);
  background:#828b93;box-sizing:border-box}
.cc-cab i:nth-of-type(1){top:8px} .cc-cab i:nth-of-type(2){top:46px} .cc-cab i:nth-of-type(3){top:84px}
.cc-cab i:after{content:"";position:absolute;left:50%;margin-left:-10px;top:11px;
  width:20px;height:4px;background:#c8a24a}
.cc-plant{position:absolute;bottom:var(--ground-h);width:64px;height:110px}
.cc-plant u{position:absolute;left:10px;bottom:0;width:44px;height:34px;
  background:linear-gradient(#b9754a,#8a5230);border:4px solid var(--ink);
  border-radius:0 0 8px 8px;box-sizing:border-box}
.cc-plant i{position:absolute;bottom:28px;width:20px;height:58px;background:#4e7f52;
  border:3px solid var(--ink);border-radius:12px 12px 0 0;box-sizing:border-box}
.cc-plant i:nth-of-type(1){left:6px;transform:rotate(-16deg)}
.cc-plant i:nth-of-type(2){left:22px;height:74px}
.cc-plant i:nth-of-type(3){right:6px;transform:rotate(16deg)}
.cc-rug{position:absolute;bottom:calc(var(--ground-h) - 52px);height:64px;
  background:linear-gradient(#8f2f2f 0 12px,#7a2626 12px);
  border:4px solid var(--ink);box-sizing:border-box;
  box-shadow:inset 0 0 0 6px #c8a24a,inset 0 0 0 10px #7a2626}
/* a woven field rather than fringe: at this size a row of ticks read as
   broken stitching, and a rug seen flat from the side shows its pattern, not
   its ends */
.cc-rug:after{content:"";position:absolute;left:10px;right:10px;top:10px;bottom:10px;
  background:
    repeating-linear-gradient(90deg,rgba(200,162,74,.34) 0 3px,transparent 3px 17px),
    repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 9px,transparent 9px 17px)}
.cc-cooler{position:absolute;bottom:var(--ground-h);width:52px;height:126px}
.cc-cooler u{position:absolute;left:0;bottom:0;width:52px;height:74px;
  background:linear-gradient(#e8eef2,#c3ccd3);border:4px solid var(--ink);box-sizing:border-box}
.cc-cooler s{position:absolute;left:8px;bottom:70px;width:36px;height:52px;
  background:linear-gradient(#a9d8ee,#6fb3d6);border:4px solid var(--ink);
  border-radius:8px 8px 3px 3px;box-sizing:border-box}
.cc-cooler i{position:absolute;left:14px;bottom:34px;width:24px;height:5px;background:#2b323a}
.cc-gallery{position:absolute;display:flex;gap:12px}
.cc-gallery span{display:block;width:56px;height:52px;background:linear-gradient(#f0eade,#dcd4c1);
  border:4px solid #c8a24a;box-shadow:0 0 0 3px var(--ink),3px 3px 0 rgba(0,0,0,.25);
  box-sizing:border-box;padding:5px}
.cc-gallery span{transform:rotate(-1deg)}
.cc-gallery span:nth-child(2){transform:rotate(1.5deg)}
.cc-gallery span:nth-child(4){transform:rotate(1deg)}
/* each frame is a different cat: head, two ears, one shared skeleton */
/* the sitter, built out of elements so the ears actually meet the head */
.cc-gallery span{--cf:#8d8574;position:relative}
.cc-gallery span:nth-child(2){--cf:#6d6455}
.cc-gallery span:nth-child(3){--cf:#a89a80}
.cc-gallery span:nth-child(4){--cf:#7b7f88}
.cc-gallery em{position:absolute;left:16px;top:20px;width:20px;height:19px;
  background:var(--cf);border-radius:9px 9px 7px 7px}
.cc-gallery u{position:absolute;left:19px;top:30px;width:14px;height:12px;background:var(--cf)}
.cc-gallery b{position:absolute;top:12px;width:0;height:0;border-style:solid;
  border-color:transparent transparent var(--cf);border-width:0 4px 9px}
.cc-gallery b.l{left:16px} .cc-gallery b.r{left:28px}
.cc-tree{position:absolute;bottom:var(--ground-h);width:150px;height:290px}
.cc-tree .trunk{position:absolute;left:64px;bottom:20px;width:26px;height:206px;
  background:repeating-linear-gradient(#c9b48b 0 6px,#b09a6f 6px 12px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-tree .base{position:absolute;left:16px;bottom:0;width:122px;height:24px;
  background:linear-gradient(#8a6a3e,#5c4526);border:3px solid var(--ink);box-sizing:border-box}
.cc-tree .shelf{position:absolute;height:20px;background:linear-gradient(#b3ada2,#8f897f);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-tree .shelf.lo{left:0;bottom:96px;width:88px}
.cc-tree .shelf.hi{right:0;bottom:170px;width:96px}
.cc-tree .top{position:absolute;left:34px;bottom:206px;width:86px;height:34px;
  background:linear-gradient(#c9b48b,#a68f66);border:3px solid var(--ink);
  border-radius:14px 14px 4px 4px;box-sizing:border-box}
.cc-tree .ball{position:absolute;left:112px;bottom:132px;width:22px;height:22px;
  border-radius:50%;background:linear-gradient(#d8b25c,#a07c36);border:3px solid var(--ink);
  box-sizing:border-box}
.cc-tree .string{position:absolute;left:122px;bottom:152px;width:3px;height:22px;background:#8a8272}

/* ---------- the bed nobody uses, because the desk is warmer ------------- */
.cc-bed{position:absolute;bottom:calc(var(--ground-h) - 8px);width:104px;height:52px}
.cc-bed u{position:absolute;left:0;bottom:0;width:104px;height:40px;
  background:linear-gradient(#628299,#3f5670);border:4px solid var(--ink);
  border-radius:14px 14px 28px 28px;box-sizing:border-box}
.cc-bed s{position:absolute;left:11px;bottom:24px;width:82px;height:17px;
  background:#2c3f51;border:4px solid var(--ink);border-radius:42px/9px;box-sizing:border-box}
.cc-bed i{position:absolute;left:17px;bottom:9px;width:70px;height:13px;
  background:#8aa7bf;border-radius:36px/7px}

/* ---------- a box, and the only thing that ever goes in one ------------- */
.cc-box{position:absolute;bottom:var(--ground-h);width:106px;height:96px}
.cc-box em{position:absolute;left:7px;bottom:24px;width:92px;height:40px;
  background:#8c6435;border:4px solid var(--ink);box-sizing:border-box}
.cc-box .h{position:absolute;left:29px;bottom:42px;width:48px;height:38px;
  background:linear-gradient(#f3efe6,#d9d3c5);border:4px solid var(--ink);
  border-radius:16px 16px 6px 6px;box-sizing:border-box}
.cc-box b{position:absolute;bottom:72px;width:0;height:0;border-style:solid;
  border-color:transparent transparent var(--ink);border-width:0 9px 15px}
.cc-box b.l{left:29px} .cc-box b.r{left:59px}
.cc-box .e{position:absolute;bottom:56px;width:5px;height:9px;background:var(--ink);border-radius:3px}
.cc-box .e.l{left:41px} .cc-box .e.r{left:61px}
.cc-box u{position:absolute;left:0;bottom:0;width:106px;height:54px;
  background:linear-gradient(#d3a468,#af8149);border:4px solid var(--ink);box-sizing:border-box}
.cc-box u:after{content:"THIS WAY UP";position:absolute;left:0;right:0;top:17px;text-align:center;
  font:8px/1 var(--font-display);letter-spacing:1px;color:#6b4c26}

/* ---------- the clock, stuck on home time ------------------------------- */
.cc-clock{position:absolute;width:66px;height:120px}
.cc-clock u{position:absolute;left:0;top:14px;width:66px;height:66px;border-radius:50%;
  background:linear-gradient(#f5f1e6,#dcd5c3);border:4px solid var(--ink);box-sizing:border-box}
.cc-clock b{position:absolute;top:0;width:0;height:0;border-style:solid;
  border-color:transparent transparent var(--ink);border-width:0 10px 17px}
.cc-clock b.l{left:9px} .cc-clock b.r{right:9px}
.cc-clock u:after{content:"";position:absolute;left:26px;top:26px;width:6px;height:6px;
  border-radius:50%;background:var(--ink)}
.cc-clock i{position:absolute;left:30px;top:47px;width:4px;background:var(--ink);
  transform-origin:2px 0}
.cc-clock i.h{height:16px;transform:rotate(150deg)}   /* hour hand on the five */
.cc-clock i.m{height:24px;transform:rotate(0deg)}     /* minute hand on the twelve */
.cc-clock s{position:absolute;left:29px;top:78px;width:8px;height:36px;background:var(--ink);
  border-radius:4px;transform-origin:4px 0;transform:rotate(10deg)}
/* the plate that says WHICH five o'clock: the hammer next door falls at 5pm
   New York, and until this the clock was an unexplained prop */
.cc-clock em{position:absolute;left:-8px;top:118px;width:82px;text-align:center;
  font-style:normal;font:6px/1.6 var(--font-display);color:#6b6455;letter-spacing:.14em}

/* ---------- the board by the door, where an office keeps its rules ------ */
.cc-cork{position:absolute;width:172px;height:120px;
  background:repeating-linear-gradient(46deg,#c9a06a 0 6px,#bd9460 6px 12px);
  border:6px solid #7a5a2e;box-shadow:0 0 0 4px var(--ink),4px 4px 0 rgba(0,0,0,.25);
  box-sizing:border-box}
.cc-cork i{position:absolute;width:58px;height:42px;background:#f7f2e2;
  box-shadow:2px 2px 0 rgba(0,0,0,.22);font:7px/1.6 var(--font-display);
  color:#3a3226;text-align:center;padding-top:11px;box-sizing:border-box}
.cc-cork i:after{content:"";position:absolute;left:25px;top:-4px;width:8px;height:8px;
  border-radius:50%;background:#b8392c;box-shadow:0 0 0 2px var(--ink)}
.cc-cork i:nth-of-type(1){left:12px;top:16px;transform:rotate(-3deg)}
.cc-cork i:nth-of-type(2){left:96px;top:12px;background:#fbf0b6;transform:rotate(2.5deg)}
.cc-cork i:nth-of-type(3){left:54px;top:64px;background:#e6f2da;transform:rotate(-1.5deg)}

/* ---------- a cream sign, for the things we did NOT read off the chain --- */
.cc-sign{position:absolute;box-sizing:border-box;text-align:center;
  background:linear-gradient(165deg,#fffdf7,#f2ecdd);
  border:5px solid #c8a24a;box-shadow:0 0 0 4px var(--ink),7px 8px 0 rgba(0,0,0,.28);
  padding:16px 18px 14px}
.cc-sign h5{margin:0 0 9px;font:9px/1.6 var(--font-display);color:#8a6a2a;
  letter-spacing:.2em;text-transform:uppercase}
.cc-sign q{display:block;quotes:none;font:19px/1.35 'VT323',monospace;color:#2b2620}
.cc-sign i{display:block;margin:11px auto 0;width:56px;height:3px;background:#c8a24a}
.cc-sign em{display:block;margin-top:10px;font-style:normal;
  font:7px/1.7 var(--font-display);color:#9a917f;letter-spacing:.05em}
.cc-sign b{font-weight:400;color:#8a6a2a}

/* ---------- the waiting area nobody waits in --------------------------- */
.cc-couch{position:absolute;bottom:var(--ground-h);width:200px;height:98px}
.cc-couch i{position:absolute;bottom:0;width:14px;height:18px;background:#5c4526;
  border:3px solid var(--ink);box-sizing:border-box}
.cc-couch i.l{left:18px} .cc-couch i.r{right:18px}
.cc-couch u{position:absolute;left:10px;bottom:24px;width:180px;height:60px;
  background:linear-gradient(#6d5a86,#4b3c5f);border:4px solid var(--ink);
  border-radius:10px 10px 0 0;box-sizing:border-box}
.cc-couch u:after{content:"";position:absolute;left:50%;top:8px;bottom:0;width:3px;
  margin-left:-1px;background:rgba(0,0,0,.28)}
.cc-couch b{position:absolute;bottom:14px;width:28px;height:58px;
  background:linear-gradient(#6d5a86,#463857);border:4px solid var(--ink);
  border-radius:9px 9px 0 0;box-sizing:border-box}
.cc-couch b.l{left:0} .cc-couch b.r{right:0}
.cc-couch s{position:absolute;left:0;bottom:14px;width:200px;height:34px;
  background:linear-gradient(#7d6899,#5c4a74);border:4px solid var(--ink);box-sizing:border-box}

/* ---------- somewhere to leave a hat ------------------------------------ */
.cc-coat{position:absolute;bottom:var(--ground-h);width:46px;height:168px}
.cc-coat i{position:absolute;left:5px;bottom:0;width:36px;height:13px;background:#5c4526;
  border:3px solid var(--ink);border-radius:0 0 7px 7px;box-sizing:border-box}
.cc-coat u{position:absolute;left:19px;bottom:11px;width:9px;height:142px;
  background:linear-gradient(90deg,#96754a,#6b512e);border:3px solid var(--ink);box-sizing:border-box}
.cc-coat b{position:absolute;bottom:136px;width:17px;height:9px;background:#6b512e;
  border:3px solid var(--ink);box-sizing:border-box}
.cc-coat b.l{left:0;border-radius:6px 0 0 6px} .cc-coat b.r{right:0;border-radius:0 6px 6px 0}
/* a broker's hat: narrow crown, wide thin brim, both centred on the pole */
.cc-coat s{position:absolute;left:8px;bottom:128px;width:30px;height:19px;
  background:linear-gradient(#39404c,#1e222a);border:3px solid var(--ink);
  border-radius:10px 10px 0 0;box-sizing:border-box;
  box-shadow:inset 0 -7px 0 -3px #11141a}
.cc-coat s:after{content:"";position:absolute;left:-12px;bottom:-6px;width:52px;height:7px;
  background:#2a2f38;border:3px solid var(--ink);border-radius:4px;box-sizing:border-box}

/* ---------- the founder is roped off, obviously ------------------------- */
.cc-rope{position:absolute;bottom:var(--ground-h);width:142px;height:78px}
.cc-rope i{position:absolute;bottom:0;width:11px;height:62px;
  background:linear-gradient(90deg,#e0c273,#9c7a2f);border:3px solid var(--ink);box-sizing:border-box}
.cc-rope i.l{left:9px} .cc-rope i.r{right:9px}
.cc-rope b{position:absolute;bottom:58px;width:24px;height:15px;
  background:linear-gradient(#e8cb80,#a8842f);border:3px solid var(--ink);
  border-radius:9px 9px 3px 3px;box-sizing:border-box}
.cc-rope b.l{left:3px} .cc-rope b.r{right:3px}
.cc-rope u{position:absolute;left:15px;right:15px;bottom:30px;height:28px;
  border:5px solid var(--ink);border-top:0;border-radius:0 0 46px 46px;box-sizing:border-box}
.cc-rope u:after{content:"";position:absolute;left:2px;right:2px;bottom:2px;height:22px;
  border:4px solid #8d2a38;border-top:0;border-radius:0 0 40px 40px;box-sizing:border-box}

/* ---------- a radiator, which is a cat bed with pipes ------------------- */
.cc-rad{position:absolute;bottom:var(--ground-h);width:124px;height:68px}
.cc-rad i{position:absolute;bottom:0;width:11px;height:13px;background:#8f989f;
  border:3px solid var(--ink);box-sizing:border-box}
.cc-rad i.l{left:13px} .cc-rad i.r{right:13px}
.cc-rad u{position:absolute;left:0;bottom:9px;width:124px;height:50px;
  background:repeating-linear-gradient(90deg,#e3e8ec 0 10px,#b6bec5 10px 16px);
  border:4px solid var(--ink);box-sizing:border-box}
.cc-rad s{position:absolute;left:-4px;bottom:55px;width:132px;height:9px;
  background:linear-gradient(#eaeff3,#c1c9d0);border:4px solid var(--ink);box-sizing:border-box}

/* ---------- PFP GEN, rebuilt as the thing they actually ship -----------
   First draft was a curtained photo booth printing a framed 4-up strip. Both
   halves were invented. PFP GEN is a page: a 1024x1024 canvas with a trait
   ledger beside it, and the file it hands you is BARE -- full bleed, no border,
   no watermark. The lime brackets you see around the canvas are page chrome
   outside the image, not in it. So this is a kiosk, not a booth: screen left,
   ledger right, and the print that comes out of the slot has no frame on it.

   The ledger is lifted straight from their layout -- label left, value right,
   dotted leader between, unset traits greyed to None, lime counter on top --
   and the trait names are theirs, including Front: Tenev, who is a recurring
   character in their own meme gallery.

   This is the one object indoors wearing their colours. The ROOM is the old
   office; the KIOSK is the modern product installed in it. Same split the
   street front uses. ---------------------------------------------------- */
.cc-pfp{position:absolute;bottom:var(--ground-h);width:238px;height:170px;--lime:#ccff00}
.cc-pfp u{position:absolute;left:0;bottom:0;width:238px;height:146px;box-sizing:border-box;
  background:linear-gradient(#16191c,#0a0c0e);border:4px solid var(--ink);
  box-shadow:inset 0 0 0 3px var(--lime)}
.cc-pfp .sign{position:absolute;left:-3px;bottom:144px;width:244px;height:26px;
  box-sizing:border-box;background:var(--lime);border:4px solid var(--ink);
  text-align:center;font:9px/1 var(--font-display);color:#0c0e10;padding-top:6px;
  letter-spacing:.12em}
/* the canvas */
.cc-pfp .scr{position:absolute;left:12px;bottom:34px;width:88px;height:88px;
  box-sizing:border-box;border:3px solid var(--ink);
  box-shadow:0 0 16px rgba(204,255,0,.2);
  background:radial-gradient(circle at 50% 42%,#26362c 0 22%,#16211b 22% 44%,#26362c 44% 66%,#0e1512 66%)}
.cc-pfp .scr b{position:absolute;left:50%;bottom:8px;margin-left:-22px;width:44px;height:38px;
  background:#dae7a4;border-radius:15px 15px 5px 5px}
.cc-pfp .scr i{position:absolute;bottom:36px;width:0;height:0;border-style:solid;
  border-color:transparent transparent #dae7a4;border-width:0 8px 15px}
.cc-pfp .scr i.l{left:20px} .cc-pfp .scr i.r{right:20px}
/* the eyes are the whole meme, so the screen gets them even at this size */
.cc-pfp .scr b:before,.cc-pfp .scr b:after{content:"";position:absolute;top:12px;
  width:4px;height:6px;background:#1b2620;border-radius:2px}
.cc-pfp .scr b:before{left:11px} .cc-pfp .scr b:after{right:11px}
/* the trait ledger, their layout: label, leader, value */
/* the black bucket hat with the lime band is their "Cash Cat" hat trait */
.cc-pfp .scr .hat{position:absolute;left:50%;bottom:36px;margin-left:-25px;width:50px;height:15px;
  background:#14171a;border-radius:8px 8px 2px 2px}
.cc-pfp .scr .hat:before{content:"";position:absolute;left:-5px;bottom:-5px;width:60px;height:6px;
  background:#14171a;border-radius:3px}
.cc-pfp .scr .hat:after{content:"";position:absolute;left:4px;bottom:1px;width:42px;height:3px;
  background:var(--lime)}
.cc-pfp .scr .cig{position:absolute;left:50%;bottom:17px;margin-left:8px;width:20px;height:5px;
  background:#7a5a34;border-radius:2px}
.cc-pfp .scr .cig:after{content:"";position:absolute;right:-2px;top:0;width:5px;height:5px;
  background:#ff8f4b;border-radius:2px;box-shadow:0 0 6px rgba(255,143,75,.85)}
.cc-pfp .led{position:absolute;left:110px;bottom:34px;width:116px;height:88px;
  box-sizing:border-box;background:#0e1113;border:3px solid var(--ink);padding:4px 5px 0}
.cc-pfp .led em{display:block;font-style:normal;font:6px/1 var(--font-display);
  color:var(--lime);text-align:right;margin-bottom:4px;letter-spacing:.08em}
.cc-pfp .led span{display:flex;align-items:baseline;gap:2px;
  font:5px/1.9 var(--font-display);color:#8d9a86;letter-spacing:.02em}
.cc-pfp .led span:after{content:"";flex:1;height:1px;margin-bottom:1px;
  background:repeating-linear-gradient(90deg,#4a5450 0 1px,transparent 1px 3px)}
.cc-pfp .led span b{order:3;color:#e8f0dc;font-weight:400}
.cc-pfp .led span.none b{color:#4a5450}
.cc-pfp .slot{position:absolute;left:26px;bottom:14px;width:60px;height:8px;
  box-shadow:inset 0 0 0 3px var(--ink),inset 0 0 0 20px #000}
/* what comes out has NO border, because the file they hand you has none */
.cc-pfp .print{position:absolute;left:32px;bottom:-20px;width:48px;height:48px;
  background:#ccff00;transform:rotate(-4deg);transform-origin:50% 0;
  box-shadow:2px 3px 0 rgba(0,0,0,.32)}
/* the same head and ears as the screen, built from elements, because faking
   ears with a box-shadow turned the cat into a mushroom */
.cc-pfp .print b{position:absolute;left:50%;bottom:7px;margin-left:-13px;width:26px;height:22px;
  background:#efe8d6;border-radius:10px 10px 3px 3px}
.cc-pfp .print b:before,.cc-pfp .print b:after{content:"";position:absolute;top:7px;
  width:3px;height:4px;background:#3a3a2a;border-radius:2px}
.cc-pfp .print b:before{left:6px} .cc-pfp .print b:after{right:6px}
.cc-pfp .print i{position:absolute;bottom:23px;width:0;height:0;border-style:solid;
  border-color:transparent transparent #efe8d6;border-width:0 5px 9px}
.cc-pfp .print i.l{left:11px} .cc-pfp .print i.r{right:11px}
/* every output carries the same grain plate, so the print does too */
.cc-pfp .print:after{content:"";position:absolute;inset:0;opacity:.5;
  background:repeating-linear-gradient(27deg,rgba(255,255,255,.16) 0 1px,transparent 1px 3px)}

/* ---------- the television, which is their most reusable prop -----------
   A wood-cased CRT recurs across their meme gallery as an OBJECT rather than a
   scene, which is what makes it safe to build -- none of the Napoleon problem.
   And the screen is their actual joke, written out in their own FAQ under
   "Will it go up?": "Cat goes up. Cat goes down. Cat does not care." So the
   line scrolls, and the cat sitting on it never reacts. The prop and the
   punchline are the same object. ---------------------------------------- */
.cc-tv{position:absolute;bottom:var(--ground-h);width:104px;height:94px}
.cc-tv u{position:absolute;left:0;bottom:12px;width:104px;height:82px;box-sizing:border-box;
  background:repeating-linear-gradient(92deg,#8a6a3e 0 9px,#7a5c35 9px 11px);
  border:4px solid var(--ink);border-radius:5px}
.cc-tv .scr{position:absolute;left:9px;bottom:24px;width:62px;height:56px;box-sizing:border-box;
  background:#0c1408;border:3px solid var(--ink);border-radius:9px;overflow:hidden}
.cc-tv .scr:before{content:"";position:absolute;inset:-2px;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='44'%3E%3Cpolyline points='0,38 12,30 24,34 36,18 48,24 60,8 72,17 84,5 96,14 108,3 120,11' fill='none' stroke='%23ccff00' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:120px 44px;background-repeat:repeat-x;
  background-position:0 62%;animation:cc-tape-run 9s linear infinite}
@keyframes cc-tape-run{from{background-position-x:0} to{background-position-x:-120px}}
/* scanlines, because a CRT without them is just a box */
.cc-tv .scr:after{content:"";position:absolute;inset:0;
  background:repeating-linear-gradient(rgba(0,0,0,.28) 0 1px,transparent 1px 3px)}
.cc-tv .cat{position:absolute;left:28px;bottom:38px;width:20px;height:17px;z-index:2;
  background:#e8e2d0;border-radius:8px 8px 2px 2px}
.cc-tv .cat:before,.cc-tv .cat:after{content:"";position:absolute;top:-5px;width:0;height:0;
  border-style:solid;border-width:0 3px 6px;border-color:transparent transparent #e8e2d0}
.cc-tv .cat:before{left:3px} .cc-tv .cat:after{right:3px}
.cc-tv .dial{position:absolute;right:9px;width:12px;height:12px;border-radius:50%;
  background:linear-gradient(#d8cdb4,#a2977e);border:3px solid var(--ink);box-sizing:border-box}
.cc-tv .dial.a{bottom:62px} .cc-tv .dial.b{bottom:44px}
.cc-tv .grille{position:absolute;right:7px;bottom:22px;width:16px;height:18px;
  background:repeating-linear-gradient(#3a332a 0 2px,#6b5f4a 2px 4px);
  border:3px solid var(--ink);box-sizing:border-box}
.cc-tv i{position:absolute;bottom:0;width:9px;height:13px;background:#4a3722;
  border:3px solid var(--ink);box-sizing:border-box}
.cc-tv i.l{left:14px} .cc-tv i.r{right:14px}

/* ---------- THE PAYROLL DESK: the reason the building exists now --------
   CASHCAT is on the salary menu since 2 Sep 2026. This desk is where a holder
   switches a broker's paycheck to it, and the board beside it is the number
   that proves the switch works: read from the engine's own Delivered events,
   last 24 hours, never a static figure. ------------------------------------ */
.cc-pay{box-sizing:border-box}   /* the stand sets the width; 520 here overflowed its own padding */
/* the stand is a dark screen with their lime keyline, like the kiosk: the
   room's cream desk made lime-on-cream type unreadable */
.room-deskcard.cc-paystand{background:linear-gradient(#16191c,#0a0c0e);
  box-shadow:inset 0 0 0 3px #ccff00,6px 6px 0 rgba(0,0,0,.35)}
.cc-pay h3{margin:0 0 6px;font:10px/1.5 var(--font-display);color:#ccff00;letter-spacing:.08em}
.cc-pay p{margin:0 0 10px;font:17px/1.35 'VT323',monospace;color:#eaffea}
.cc-pay .list{margin:0 0 10px;max-height:150px;overflow:auto}
.cc-pay .list div{display:flex;justify-content:space-between;align-items:center;gap:10px;
  padding:5px 0;border-bottom:1px dotted #ffffff22;font:8px/1.6 var(--font-display);color:#eaffea}
.cc-pay .list div u{text-decoration:none;color:#9fe0af}
.cc-pay .list div.on{color:#ccff00}
.cc-pay button{font:9px/1 var(--font-display);cursor:pointer;border:3px solid var(--ink);
  background:linear-gradient(#ccff00,#a6d400);color:#0c0e10;padding:9px 12px;
  box-shadow:0 0 0 3px #3a4148,0 4px 0 rgba(0,0,0,.35)}
.cc-pay button:hover{filter:brightness(1.06)}
.cc-pay button[disabled]{background:linear-gradient(#3a4148,#2a3036);color:#8b94a1;cursor:default;box-shadow:0 0 0 3px #3a4148}
.cc-pay .list button{padding:6px 9px;font-size:7px}
.cc-pay .go{width:100%;min-height:44px;margin-top:2px}
.cc-pay .fine{font:12px/1.4 'VT323',monospace;color:#9fb0a4;margin-top:8px}
/* the ledger: last ten paychecks, one line each */
.cc-board .rows.book .r{font:7px/1.6 var(--font-display);padding:4px 0}
.cc-board .rows.book .r em{font:14px/1 'VT323',monospace}
.cc-board .rows.book .r span.ago{color:#9a917f;font-size:6px}
/* a poked cat: eyes open, Zs gone; the couch cat gets up for a moment */
.cc-c.poke{cursor:pointer}
.cc-c.curl.awake i{width:5px;height:5px;border-radius:50%;bottom:28px}
.cc-z.hide{opacity:0;transition:opacity .2s}
/* the doors out: their pages, in their windows */
.cc-f-shopwin.door,.cc-pfp.door{cursor:pointer}
.cc-f-shopwin.door:hover{box-shadow:0 0 30px rgba(255,206,110,.42),inset 0 0 0 3px rgba(204,255,0,.55)}
.cc-pfp.door:hover u{box-shadow:inset 0 0 0 3px #ffffff}

/* ---------- HEIGHT THRESHOLDS, and they live HERE, at the very end -------
   Derived from measured piece heights: top + ground + the 44px ceiling.
   They are last in the file because a display:none in a media query loses
   to a plain display:flex written LATER in the same stylesheet, which is
   exactly what happened to the frame wall: hidden below 700 on paper and
   crossing the ceiling at three heights in fact. ---------------------- */
@media (max-height:889px){.cc-first{display:none}}
@media (max-height:899px){.cc-burn{display:none}}
@media (max-height:759px){.cc-portrait,.cc-plaque{display:none}}
@media (max-height:709px){.cc-cert,.cc-board{display:none}}
@media (max-height:699px){.cc-gallery{display:none}}
@media (max-height:759px){.cc-clock,.cc-cork{display:none}}
@media (max-height:899px){.cc-hi,.cc-sign{display:none}}
@media (max-height:679px){.cc-win{display:none}}
@media (max-height:899px){.cc-payboard,.cc-book{display:none}}

`;

  /// Everything on this building that used to be a dated number, read live.
  /// The salary asset's index comes from the engine by SYMBOL, never a literal
  /// (13 today, but the engine is the authority); its pool and the WETH/USDG
  /// pool come from the engine's own asset table.
  var SEL = {
    slot0: "0x3850c7bd", token0: "0x0dfe1681", totalSupply: "0x18160ddd",
    balanceOf: "0x70a08231", decimals: "0x313ce567"
  };
  var DEAD = "0x000000000000000000000000000000000000dEaD";
  var DEPLOYER = "0xcdfc08A1C1FBaFB355645E5ddC32122e5716cA90";  // LaunchToken.deployer(), read 2026-09-02
  var LIVE = null;   // { idx, usdgIdx, token, pool, priceUsd, mcapUsd, burnedPct, deployerPct, at }
  async function readCashcat(F, CFG) {
    if (LIVE && Date.now() - LIVE.at < 60000) return LIVE;
    var meta = await F.assetMeta();
    if (!meta) return null;
    var idx = null, usdgIdx = null, i;
    for (i = 0; i < 20; i++) {
      if (!meta[i]) break;
      if (meta[i].symbol === "CASHCAT") idx = i;
      if (meta[i].symbol === "USDG") usdgIdx = i;
    }
    if (idx === null) return { idx: null, usdgIdx: usdgIdx, at: Date.now() };
    var a = await F.callBatch([
      { to: CFG.engine, data: F.SEL.assets + F.word(idx) },
      { to: CFG.engine, data: F.SEL.assets + F.word(usdgIdx === null ? 0 : usdgIdx) }
    ]);
    var addrAt = function (hex, k) { return "0x" + hex.slice(2 + 64 * k + 24, 2 + 64 * (k + 1)); };
    var token = addrAt(a[0], 0), pool = addrAt(a[0], 1), upool = addrAt(a[1], 1), usdg = addrAt(a[1], 0);
    var r = await F.callBatch([
      { to: pool, data: SEL.slot0 }, { to: pool, data: SEL.token0 },
      { to: upool, data: SEL.slot0 }, { to: upool, data: SEL.token0 },
      { to: token, data: SEL.totalSupply }, { to: token, data: SEL.balanceOf + F.word(DEAD) },
      { to: token, data: SEL.balanceOf + F.word(DEPLOYER) }, { to: usdg, data: SEL.decimals }
    ]);
    var sqrt = function (hex) { return Number(BigInt("0x" + hex.slice(2, 66))) / Math.pow(2, 96); };
    var t0 = function (hex) { return ("0x" + hex.slice(26, 66)).toLowerCase(); };
    // price = token1 per token0 in raw units
    var p1 = Math.pow(sqrt(r[0]), 2);
    var wethPerCc = t0(r[1]) === token.toLowerCase() ? p1 : 1 / p1;            // both 18 dec
    var p2 = Math.pow(sqrt(r[2]), 2);
    var udec = Number(BigInt(r[7]));
    var usdPerWeth = t0(r[3]) === usdg.toLowerCase()
      ? (1 / p2) * Math.pow(10, 18 - udec)      // token0 = USDG: price = WETH raw / USDG raw
      : p2 * Math.pow(10, 18 - udec);           // token0 = WETH: price = USDG raw / WETH raw
    var supply = Number(BigInt(r[4])) / 1e18, dead = Number(BigInt(r[5])) / 1e18, dep = Number(BigInt(r[6])) / 1e18;
    var priceUsd = wethPerCc * usdPerWeth;
    LIVE = { idx: idx, usdgIdx: usdgIdx, token: token, pool: pool, priceUsd: priceUsd,
      mcapUsd: priceUsd * supply, burnedPct: 100 * dead / supply, deployerPct: 100 * dep / supply,
      usdPerWeth: usdPerWeth, at: Date.now() };
    return LIVE;
  }
  var fmtUsd = function (v) {
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
    if (v >= 1) return "$" + v.toFixed(2);
    return "$" + v.toFixed(v >= 0.1 ? 3 : 4);
  };

  /// The last 24 hours of CASHCAT paychecks, from the engine's Delivered
  /// events (assetIdx is indexed, so the node filters). ~10 blocks a second on
  /// this chain, 20k-block chunks, a few at a time; cached ten minutes per tab.
  var SCAN = null;
  /// One eth_getLogs, the endpoints in order, no bisecting: the generic reader
  /// in firm.js spends ~5 s on a 20k-block chunk (measured 2026-09-02) while a
  /// plain request answers 100k blocks in under a second.
  async function getLogs(CFG, base, from, to) {
    var params = Object.assign({}, base, { fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) });
    var last = null;
    for (var i = 0; i < CFG.rpcs.length; i++) {
      try {
        var r = await fetch(CFG.rpcs[i], { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [params] }) });
        var j = await r.json();
        if (Array.isArray(j.result)) return j.result;
        last = new Error(j.error ? j.error.message : "bad reply");
      } catch (e) { last = e; }
    }
    throw last || new Error("no rpc");
  }
  async function scanPaychecks(F, CFG, idx) {
    if (SCAN && Date.now() - SCAN.at < 600000) return SCAN;
    var head = await F.blockNumber();
    var from = Math.max(0, head - 24 * 3600 * 10), CH = 100000;
    var ranges = [];
    for (var b = from; b <= head; b += CH) ranges.push([b, Math.min(head, b + CH - 1)]);
    // F.word() is calldata (no 0x); a topic is a full 32-byte hex string
    var base = { address: CFG.engine, topics: [F.TOPICS.DELIVERED, null, "0x" + F.word(idx)] };
    var logs = [], k = 0, short = 0;
    async function worker() {
      while (k < ranges.length) {
        var rg = ranges[k++];
        try { logs = logs.concat(await getLogs(CFG, base, rg[0], rg[1])); }
        catch (e) { short++; }   // one chunk short: the board says "at least"
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    var total = 0n, ids = {}, rows = [];
    logs.forEach(function (l) {
      var out = BigInt("0x" + l.data.slice(2 + 64, 2 + 128));
      var id = Number(BigInt(l.topics[1]));
      total += out; ids[id] = 1;
      rows.push({ id: id, out: out, block: Number(BigInt(l.blockNumber)) });
    });
    rows.sort(function (a, c) { return c.block - a.block; });
    SCAN = { total: total, brokers: Object.keys(ids).length, paydays: rows.length, last: rows.slice(0, 10), head: head, short: short, at: Date.now() };
    return SCAN;
  }
  var fmtCc = function (wei) { var n = Number(wei / 10n ** 14n) / 1e4; return n >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(n >= 100 ? 1 : 2); };
  var agoBlocks = function (d) { var s = d / 10; return s < 3600 ? Math.max(1, Math.round(s / 60)) + " min ago" : Math.round(s / 3600) + " h ago"; };

  function injectCss() {
    if (document.getElementById("cc-css")) return;
    var s = document.createElement("style");
    s.id = "cc-css"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /// The room. Laid out on a 2400px shell with three solid wall runs and two
  /// glazed ones, so nothing is ever mounted on glass:
  ///   0-300 entrance | 300-640 glass | 640-1500 THE FOUNDING WALL
  ///   1500-1840 glass | 1840-2400 the burn wall
  function room(ctx) {
    injectCss();
    var el = ctx.el, px = ctx.px, layer = ctx.roomLayer, CFG = ctx.CFG;
    var put = function (node, css) { px(node, css); layer.appendChild(node); return node; };

    // drawn here rather than left to level.css, and drawn AFTER cc-wall so the
    // wall cannot bury it the way it buried .room-exit
    var doorAt = function () {
      var dr = el("div", "cc-door");
      dr.innerHTML = '<u></u><div class="tr"></div><s></s>'
        + '<i class="a"></i><i class="b"></i><b></b>';
      return dr;
    };

    // their cream over our concrete: walking in should feel older and warmer
    put(el("div", "cc-wall"), { left: "0px", width: "3700px" });
    put(el("div", "cc-dado"), { left: "0px", width: "3700px" });

    // .room-exit is a 100x150 hit box at x40 with no art; this sits on it so
    // the door the prompt is pointing at is actually there. 112 wide at x34
    // centres on the same 90.
    put(doorAt(), { left: "34px" });

    // ---- THE FOUNDING WALL -----------------------------------------------
    var p = el("div", "cc-portrait");
    p.innerHTML = '<img src="art/partners/cashcat.png" alt="Cash Cat">'
      + "<u>THE FOUNDER</u>";
    put(p, { left: "722px", bottom: "calc(var(--ground-h) + 150px)" });   // 196 wide, centre 820

    var pl = el("div", "cc-plaque");
    pl.innerHTML = "CASH CAT<br>FOUNDED THIS ADDRESS";
    put(pl, { left: "715px", bottom: "calc(var(--ground-h) + 96px)" });   // 210 wide, centre 820

    // their own words, quoted and cited, because inventing lore about someone
    // else's project is how a partnership starts badly
    var c = el("div", "cc-cert");
    c.innerHTML = "<h5>Certificate of origin</h5>"
      + "<q>&ldquo;The original name for Robinhood<br>was Cash Cat&rdquo;</q>"
      + "<i></i>"
      + "<em>THEIR OWN WORDS, READ FROM THE TOKEN CONTRACT</em>";
    put(c, { left: "970px", bottom: "calc(var(--ground-h) + 178px)" });   // 420 wide, centre 1180

    // ---- the burn wall ---------------------------------------------------
    // Only once the house exists. Until then this was the top-right exhibit
    // of the room: a board of four em-dashes and a grey footnote.
    var b = null;
    var live = !!(CFG.cashcatAuction && CFG.cashcatToken);
    if (live) b = el("div", "cc-burn");
    if (live) b.innerHTML = "<b>CASHCAT DESTROYED HERE</b><div class=\"rows\">"
      + '<div class="cap">total burned by the hammer</div>'
      + '<div class="big burned">&mdash;</div>'
      + '<div class="r"><span>bonus pool</span><b class="pool">&mdash;</b></div>'
      + '<div class="r"><span>lots hammered</span><b class="lots">&mdash;</b></div>'
      + (live ? "" : '<div class="r" style="margin-top:8px;color:#6b7a86">'
          + "the house opens with the first lot</div>")
      + "</div>";
    if (live) put(b, { left: "2454px", bottom: "calc(var(--ground-h) + 402px)" });  // 392 wide, centre 2650

    // ---- FIRST CONTACT ---------------------------------------------------
    // The best fact in this room is a NEGATIVE one, and it is only on the wall
    // because it was proved rather than assumed: the audit session walked the
    // COMPLETE history of both of their addresses -- 681 transactions and 48,
    // to the first one either ever made -- against every Firm contract, and
    // found no transaction in either direction, ever. Holdings are zero both
    // ways too. So this room is not commemorating a long friendship; it is the
    // first time the two projects have touched at all.
    var fc = el("div", "cc-first");
    fc.innerHTML = "<h4>First contact</h4>"
      + "<p>Before this building opened, these two<br>projects had "
      + "<b>never touched on this chain.</b><br>Not one transaction, either way.</p>"
      + '<div class="n">'
      + "<span><em>681</em>their transactions</span>"
      + "<span><em>48</em>and theirs</span>"
      + "<span><em>0</em>with us</span></div>"
      + '<div class="src">FULL HISTORY OF BOTH ADDRESSES, TO THE FIRST'
      + "<br>TRANSACTION EITHER EVER MADE &middot; WALKED 31 AUG 2026</div>";
    put(fc, { left: "770px", bottom: "calc(var(--ground-h) + 400px)" });   // 600 wide, centre 1070

    // ---- glazing, so the gaps read as windows rather than seams ----------
    [[300, 340], [1500, 340]].forEach(function (g) {
      var w = el("div", "cc-win");
      var sky = "";
      [[16, 38, 74], [66, 30, 112], [110, 44, 86], [168, 34, 130], [216, 42, 98], [274, 34, 118]]
        .forEach(function (b) {
          sky += '<i style="left:' + b[0] + 'px;width:' + b[1] + 'px;height:' + b[2] + 'px"></i>';
        });
      w.innerHTML = sky + '<u style="left:' + (g[1] / 2 - 3) + 'px"></u><s style="top:46%"></s>';
      put(w, { left: g[0] + "px", width: g[1] + "px" });
    });

    // ---- THE RECORD ------------------------------------------------------
    // An earlier draft of this wall said "LETSCASH . THE LAUNCHPAD" with a
    // launch count on it. Both were wrong and the audit session caught them:
    // the factory that minted CASH CAT is unverified, carries no name, and is
    // NOT the one $9TO5 launched from -- different contract, different owner --
    // so calling it letscash was unprovable. And the launch count was a true
    // number telling a false story: about twenty thousand launches in a single
    // day, then roughly fifty in the six weeks after. What is left is better
    // anyway, because it is about CASH CAT rather than about plumbing.
    var lc = el("div", "cc-board");
    lc.innerHTML = '<b class="t">WHERE IT TRADES</b><div class="rows">'
      + '<div class="r"><span>spot venues</span><em>SIX</em></div>'
      + '<div class="r"><span>including</span><em>ROBINHOOD</em></div>'
      + '<div class="r"><span>coingecko rank</span><em>#169</em></div>'
      + '</div><div class="src">THEIR OWN EXCHANGES PAGE, AND COINGECKO '
      + '&middot; 1 SEP 2026</div>';
    put(lc, { left: "1924px", bottom: "calc(var(--ground-h) + 176px)" });   // centre 2120

    var lp = el("div", "cc-board cc-hi");
    // 9,136 was MY count of launch-type transactions and it was a floor.
    // letscash.fun's own dashboard reads 9,745 COINS ISSUED, which is both
    // authoritative and higher, and a board that undercounts a partner against
    // their own front page is the worst possible way to be wrong. Their number.
    // The buy-back figure is theirs too; only the age is ours, off the chain.
    lp.innerHTML = '<b class="t">THE LAUNCHPAD</b><div class="rows">'
      + '<div class="r"><span>coins issued</span><em>9,745</em></div>'
      + '<div class="r"><span>cashcat bought back</span><em>1,700,000</em></div>'
      + '<div class="r"><span>cash cat is older by</span><em>3 WEEKS</em></div>'
      + '</div><div class="src">THEIR DASHBOARD &middot; AGE FROM THE CHAIN '
      + '&middot; 1 SEP 2026</div>';
    put(lp, { left: "274px", bottom: "calc(var(--ground-h) + 430px)" });   // centred on the window below it

    // Why the two projects are actually connected, which is stronger than
    // "same team". Their documentation, not the chain, and the wall says so.
    var fd = el("div", "cc-sign");
    fd.innerHTML = "<h5>Why the cat keeps eating</h5>"
      + "<q>every trade on every<br>letscash token buys<br><b>CASHCAT and burns it</b></q>"
      + "<i></i><em>FROM THEIR OWN DOCUMENTATION, NOT THE CHAIN</em>";
    put(fd, { left: "1500px", width: "340px", bottom: "calc(var(--ground-h) + 430px)" });

    // The motif, and it is checkable on any token you pick -- including ours.
    var cc2 = el("div", "cc-sign");
    cc2.innerHTML = "<h5>How you spot one</h5>"
      + "<q>every token launched<br>on letscash ends in <b>cc</b></q>"
      + "<i></i><em>SO DOES OURS &middot; $9TO5 IS 0x223E&hellip;8045A<b>cc</b></em>";
    put(cc2, { left: "20px", width: "240px", bottom: "calc(var(--ground-h) + 430px)" });

    // ---- CASHCAT itself --------------------------------------------------
    var cc = el("div", "cc-board");
    // every row is read from the chain when you walk in: the price off the
    // launch pool and the WETH/USDG pool, the burn off the dEaD balance
    cc.innerHTML = '<b class="t">CASH CAT &middot; RIGHT NOW</b><div class="rows">'
      + '<div class="r"><span>price</span><em class="lv-price">&hellip;</em></div>'
      + '<div class="r"><span>market cap</span><em class="lv-mcap">&hellip;</em></div>'
      + '<div class="r"><span>burned to dEaD</span><em class="lv-burn">&hellip;</em></div>'
      + '<div class="r"><span>the address that launched it holds</span><em class="lv-dep">&hellip;</em></div>'
      + '</div><div class="src lv-src">READING THE CHAIN&hellip;</div>';
    // +176 was under the burn board; without it the board sat low beneath a
    // bare wall. +260 centres it on the run and still clears the ceiling from
    // 710 up (the board is hidden at 709 and below).
    put(cc, { left: "2454px", bottom: "calc(var(--ground-h) + 260px)" });   // 392 wide, centre 2650

    // ---- THE STAFF -------------------------------------------------------
    // one skeleton, three poses, so they read as the same species
    function cat(pose, css) {
      var c = el("div", "cc-c " + pose);
      c.innerHTML = '<em></em><u></u><s></s><b class="l"></b><b class="r"></b>'
        + '<i class="l"></i><i class="r"></i>';
      return put(c, css);
    }

    // ---- reception, and whoever is asleep on it --------------------------
    var desk = el("div", "cc-desk");
    desk.innerHTML = '<i class="top"></i><i class="drw a"></i><i class="drw b"></i>';
    put(desk, { left: "1010px" });                       // 260 wide, centre 1140
    put(el("div", "cc-bell"), { left: "1050px", bottom: "calc(var(--ground-h) + 96px)" });
    var sleeper = cat("curl poke", { left: "1130px", bottom: "calc(var(--ground-h) + 98px)" });   // asleep on the desk
    // the curled cat's HEAD is at its left end, so the z rises from there
    var z1 = put(el("div", "cc-z", "z"), { left: "1152px", bottom: "calc(var(--ground-h) + 150px)" });
    var z2 = put(el("div", "cc-z b", "z"), { left: "1170px", bottom: "calc(var(--ground-h) + 168px)" });
    // poke it: eyes open, Zs stop, three seconds, back to sleep
    sleeper.title = "psst";
    sleeper.addEventListener("click", function (e) {
      e.stopPropagation();
      sleeper.classList.add("awake"); z1.classList.add("hide"); z2.classList.add("hide");
      clearTimeout(sleeper._t);
      sleeper._t = setTimeout(function () { sleeper.classList.remove("awake"); z1.classList.remove("hide"); z2.classList.remove("hide"); }, 3000);
    });

    // ---- the rest of an office -------------------------------------------
    put(el("div", "cc-rug"), { left: "1002px", width: "296px" });   // in front of reception

    var cab = el("div", "cc-cab");
    cab.innerHTML = "<i></i><i></i><i></i>";
    put(cab, { left: "1310px" });

    var cooler = el("div", "cc-cooler");
    cooler.innerHTML = "<s></s><u></u><i></i>";
    put(cooler, { left: "1420px" });

    // an empty bed, six feet from a cat asleep on a desk
var bed = el("div", "cc-bed");
    bed.innerHTML = "<u></u><s></s><i></i>";
    put(bed, { left: "700px" });

    var box = el("div", "cc-box");
    box.innerHTML = '<em></em><b class="l"></b><b class="r"></b><i class="h"></i>'
      + '<s class="e l"></s><s class="e r"></s><u></u>';
    put(box, { left: "2700px" });                       // the payoff for walking to the end

    var clk = el("div", "cc-clock");
    clk.innerHTML = '<b class="l"></b><b class="r"></b><s></s><u></u>'
      + '<i class="h"></i><i class="m"></i><em>NEW YORK</em>';
    put(clk, { left: "2318px", bottom: "calc(var(--ground-h) + 380px)" });

    var cork = el("div", "cc-cork");
    cork.innerHTML = "<i>FEED<br>THE CATS</i><i>NO<br>MEETINGS</i><i>NAPS<br>1 TO 4</i>";
    put(cork, { left: "54px", bottom: "calc(var(--ground-h) + 300px)" });   // shares the sign's centre line

    // the third plant gave way to the television, which earns its floor
    var tv = el("div", "cc-tv");
    tv.innerHTML = '<i class="l"></i><i class="r"></i><u></u>'
      + '<div class="scr"></div><div class="cat"></div>'
      + '<div class="dial a"></div><div class="dial b"></div><div class="grille"></div>';
    put(tv, { left: "1840px" });

    [[600, ""]].forEach(function (q) {
      var pl = el("div", "cc-plant");
      pl.innerHTML = "<i></i><i></i><i></i><u></u>";
      put(pl, { left: q[0] + "px" });
    });

    // a wall of small frames, the way an old office accumulates them
    var g = el("div", "cc-gallery");
    for (var fi = 0; fi < 4; fi++) {
      var fr = el("span");
      fr.innerHTML = '<b class="l"></b><b class="r"></b><em></em><u></u>';
      g.appendChild(fr);
    }
    put(g, { left: "1976px", bottom: "calc(var(--ground-h) + 400px)" });

    // ---- cat furniture ---------------------------------------------------
    var tree = el("div", "cc-tree");
    tree.innerHTML = '<i class="base"></i><i class="trunk"></i><i class="shelf lo"></i>'
      + '<i class="shelf hi"></i><i class="top"></i><i class="string"></i><i class="ball"></i>';
    put(tree, { left: "372px" });
    // the perch spans 406..492; at left 388 the cat hung 18px off its left
    // edge over air and read as floating. Centred on the perch (66 wide ->
    // 416) and 2px into the cushion, so the rounded top reads as squashed.
    cat("loaf", { left: "416px", bottom: "calc(var(--ground-h) + 238px)" });  // on top of the tree
    cat("sit", { left: "254px" });                                            // watching the door
    // it does not talk: the contract line already hangs on the wall as the
    // certificate, and a bubble saying the same thing under it read as an echo
    cat("loaf", { left: "2560px" });                                          // by the far wall
    // 804-1002 was bare floor directly under the founder. A portrait that
    // important gets roped off like a museum piece.
    var rope = el("div", "cc-rope");
    rope.innerHTML = '<i class="l"></i><i class="r"></i><u></u><b class="l"></b><b class="r"></b>';
    put(rope, { left: "830px" });

    // 1472-1660 was bare, and it sits under a window, which is where a
    // radiator goes -- and therefore where a cat goes.
    var rad = el("div", "cc-rad");
    rad.innerHTML = '<i class="l"></i><i class="r"></i><u></u><s></s>';
    put(rad, { left: "1500px" });
    cat("loaf", { left: "1520px", bottom: "calc(var(--ground-h) + 62px)" });

    // 1964-2400 was 436px of nothing: the largest empty stretch in the room.
    var couch = el("div", "cc-couch");
    couch.innerHTML = '<i class="l"></i><i class="r"></i><u></u>'
      + '<b class="l"></b><b class="r"></b><s></s>';
    put(couch, { left: "2000px" });
    var lounger = cat("curl poke", { left: "2080px", bottom: "calc(var(--ground-h) + 46px)" });
    // poke it: it sits up into a loaf for a moment, then curls back
    lounger.addEventListener("click", function (e) {
      e.stopPropagation();
      lounger.className = "cc-c loaf poke";
      clearTimeout(lounger._t);
      lounger._t = setTimeout(function () { lounger.className = "cc-c curl poke"; }, 4000);
    });

    // 2316..2454 is the one stretch of wall with nothing hanging on it, which
    // makes it the only place a 212-tall booth fits under the boards.
    var pfp = el("div", "cc-pfp");
    // their trait vocabulary, verbatim, including the greyed None
    var traits = [["BACKGROUND", "SPIRAL", ""], ["BACK", "NONE", " none"],
      ["CLOTHES", "NONE", " none"], ["HAT", "CASH CAT", ""],
      ["MOUTH", "CIGAR", ""], ["FRONT", "NONE", " none"]];
    pfp.innerHTML = '<u></u><div class="scr"><i class="l"></i><i class="r"></i><b></b>'
      + '<em class="hat"></em><s class="cig"></s></div>'
      + '<div class="led"><em>01 / 01</em>'
      + traits.map(function (t) {
        return '<span class="' + t[2] + '">' + t[0] + "<b>" + t[1] + "</b></span>";
      }).join("")
      + '</div><div class="slot"></div><div class="sign">PFP GEN</div>'
      + '<div class="print"><i class="l"></i><i class="r"></i><b></b></div>';
    put(pfp, { left: "2240px" });

    var coat = el("div", "cc-coat");
    coat.innerHTML = '<i></i><u></u><b class="l"></b><b class="r"></b><s></s>';
    put(coat, { left: "2480px" });   // beyond the kiosk, under the CASH CAT board

    var flap = el("div", "cc-flap");
    put(flap, { left: "168px" });                       // beside the exit door

    // the BUY plate: on the founding wall, directly above the certificate of
    // origin and on its centre line (1180), in the 62px slot under the
    // founding board. Its height comes from the stylesheet (a media rule
    // moves it down once the certificate is gone), so only `left` is set
    // here. Config-driven and absent when the url is empty, like every other
    // door out of this room.
    var buyUrl = CFG && CFG.cashcatBuyUrl;
    if (buyUrl) {
      var buy = el("div", "cc-buy");
      buy.innerHTML = "<b>BUY $CASHCAT</b><em>ON LETSCASH &nearr;</em>";
      buy.title = "buy $CASHCAT on letscash, where it launched";
      buy.addEventListener("click", function (e) { e.stopPropagation(); window.open(buyUrl, "_blank", "noopener"); });
      put(buy, {});                                     // left + bottom come from the stylesheet
    }

    var post = el("div", "cc-post");
    post.innerHTML = "<i></i><u></u><s></s>";
    put(post, { left: "1660px" });

    var bowl = el("div", "cc-bowl");
    bowl.innerHTML = "<b>CASHCAT</b>";
    put(bowl, { left: "1756px" });

    // paw prints crossing the floor strip, from the flap toward the portrait
    // evenly spaced, identically angled prints read as wallpaper rather than as
    // something that walked past. Vary the stride and turn each one a little.
    [[228, 0, -13], [296, 1, 6], [358, 0, -4], [438, 1, 14], [506, 0, -9],
     [590, 1, 3], [664, 0, 11]].forEach(function (q) {
      var x = q[0], i = q[1];
      var w = el("div", "cc-paw");
      w.innerHTML = "<i></i><i></i><i></i><u></u>";
      w.style.transform = "rotate(" + q[2] + "deg)";
      put(w, { left: x + "px", bottom: "calc(var(--ground-h) - " + (18 + i * 13) + "px)" });
    });

    // ---- THE PAYROLL DESK, and the two boards that prove it works ----------
    var F = ctx.F, CFG = ctx.CFG, state = ctx.state, txFlow = ctx.txFlow, toast = ctx.toast, connect = ctx.connect;
    var payboard = el("div", "cc-board cc-payboard");
    payboard.innerHTML = '<b class="t">CASHCAT PAYROLL &middot; LAST 24 HOURS</b><div class="rows">'
      + '<div class="r"><span>paid to brokers</span><em class="pb-total">&hellip;</em></div>'
      + '<div class="r"><span>brokers paid</span><em class="pb-brokers">&hellip;</em></div>'
      + '<div class="r"><span>paydays</span><em class="pb-count">&hellip;</em></div>'
      + '</div><div class="src pb-src">READING THE ENGINE&rsquo;S OWN EVENTS&hellip;</div>';
    put(payboard, { left: "2900px", bottom: "calc(var(--ground-h) + 430px)" });
    var book = el("div", "cc-board cc-book");
    book.innerHTML = '<b class="t">GUEST BOOK &middot; LAST TEN PAYCHECKS</b><div class="rows book">'
      + '<div class="r"><span>&hellip;</span></div></div>';
    put(book, { left: "3310px", width: "370px", bottom: "calc(var(--ground-h) + 430px)" });

    var desk = el("div", "cc-pay");
    desk.innerHTML = "<h3>GET PAID IN CASHCAT</h3>"
      + "<p>Set a broker&rsquo;s paycheck to 100% CASHCAT. Every hour the engine buys it on Cash Cat&rsquo;s own pool and pays him.</p>"
      + '<div class="list" hidden></div>'
      + '<button class="go" type="button">CHECKING&hellip;</button>'
      + '<div class="fine">Some hours the swap rolls to the next hour; nothing is ever lost, and the floor switches him back any time.</div>';
    if (ctx.deskCard) ctx.deskCard(2960, 520, desk, "cc-paystand");
    else put(desk, { left: "2960px" });

    var go = desk.querySelector(".go"), list = desk.querySelector(".list");
    var ccIdx = null, sig = "";
    function onCashcat(b) { return b.split && b.split.length === 1 && b.split[0].idx === ccIdx && b.split[0].bps === 10000; }
    async function setOne(b) {
      await txFlow("paycheck \u00b7 " + "#" + b.id + " to CASHCAT",
        function () { return F.setSplit(b.id, [ccIdx], [10000], state.account); },
        async function () { b.split = [{ idx: ccIdx, bps: 10000 }]; sig = ""; render(); });
    }
    function render() {
      var acct = state.account, bs = (state.brokers || []).filter(function (b) { return b.active; });
      var now = (acct || "-") + "|" + bs.map(function (b) { return b.id + ":" + (onCashcat(b) ? 1 : 0); }).join(",");
      if (now === sig) return;
      sig = now;
      go.disabled = false;
      if (ccIdx === null) { list.hidden = true; go.disabled = true; go.textContent = "CASHCAT IS NOT ON THE MENU YET"; return; }
      if (!acct) { list.hidden = true; go.textContent = "CONNECT"; go.onclick = function () { if (connect) connect(); }; return; }
      if (!bs.length) { list.hidden = true; go.disabled = true; go.textContent = "YOU OWN NO WORKING BROKER"; return; }
      list.hidden = false;
      list.innerHTML = "";
      var todo = [];
      bs.sort(function (a, c) { return a.id - c.id; }).forEach(function (b) {
        var row = el("div", onCashcat(b) ? "on" : "");
        row.innerHTML = "<span>#" + b.id + "</span>";
        if (onCashcat(b)) row.innerHTML += "<u>\u2713 ON CASHCAT PAY</u>";
        else {
          var bt = el("button", null, "PAY IN CASHCAT"); bt.type = "button";
          bt.addEventListener("click", function () { setOne(b); });
          row.appendChild(bt); todo.push(b);
        }
        list.appendChild(row);
      });
      if (!todo.length) { go.disabled = true; go.textContent = "EVERY BROKER YOU OWN IS ON CASHCAT PAY"; return; }
      go.textContent = todo.length === 1 ? "PAY HIM IN CASHCAT" : "PAY ALL " + todo.length + " IN CASHCAT";
      go.onclick = async function () { for (var i = 0; i < todo.length; i++) { try { await setOne(todo[i]); } catch (e) { break; } } };
    }
    (async function () {
      try { var lv = await readCashcat(F, CFG); if (lv) ccIdx = lv.idx; } catch (e) { ccIdx = null; }
      render();
      var t = setInterval(function () { if (!document.body.contains(desk)) { clearInterval(t); return; } render(); }, 2000);
    })();

    // ---- the live rows, and the two boards
    (async function () {
      try {
        var lv = await readCashcat(F, CFG);
        var q = function (c) { return cc.querySelector(c); };
        if (lv && lv.idx !== null) {
          q(".lv-price").textContent = fmtUsd(lv.priceUsd);
          q(".lv-mcap").textContent = fmtUsd(lv.mcapUsd);
          q(".lv-burn").textContent = lv.burnedPct.toFixed(2) + "%";
          q(".lv-dep").textContent = lv.deployerPct.toFixed(3) + "%";
          q(".lv-src").textContent = "READ FROM THE CHAIN \u00b7 JUST NOW \u00b7 PRICE OFF THEIR LAUNCH POOL";
        } else { q(".lv-src").textContent = "CASHCAT IS NOT ON THE MENU YET"; }
        if (!lv || lv.idx === null) { payboard.querySelector(".pb-src").textContent = "OPENS WITH THE SALARY"; return; }
        var sc = await scanPaychecks(F, CFG, lv.idx);
        payboard.querySelector(".pb-total").textContent = fmtCc(sc.total) + " CASHCAT";
        payboard.querySelector(".pb-brokers").textContent = String(sc.brokers);
        payboard.querySelector(".pb-count").textContent = String(sc.paydays);
        payboard.querySelector(".pb-src").textContent = sc.paydays
          ? "THE ENGINE\u2019S OWN DELIVERED EVENTS \u00b7 LIVE" + (sc.short ? " \u00b7 AT LEAST: PART OF THE DAY DID NOT ANSWER" : "")
          : "NOBODY HAS PICKED CASHCAT PAY YET \u00b7 THE DESK BELOW";
        var rows = book.querySelector(".rows");
        rows.innerHTML = sc.last.length ? sc.last.map(function (r) {
          return '<div class="r"><span>#' + r.id + '</span><em>' + fmtCc(r.out) + ' CASHCAT</em><span class="ago">' + agoBlocks(sc.head - r.block) + '</span></div>';
        }).join("") : '<div class="r"><span>the first paycheck signs here</span></div>';
      } catch (e) {
        cc.querySelector(".lv-src").textContent = "THE CHAIN DID NOT ANSWER";
        payboard.querySelector(".pb-src").textContent = "THE CHAIN DID NOT ANSWER";
      }
    })();

    // ---- the kiosk is a door to their generator
    var site = (CFG && CFG.cashcatSite) || "https://cashcat.cc";
    pfp.classList.add("door"); pfp.title = "PFP GEN, on cashcat.cc";
    pfp.addEventListener("click", function (e) { e.stopPropagation(); window.open(site + "/pfp", "_blank", "noopener"); });

    return { burn: b };
  }

  /// level.js's px() is Object.assign(node.style, styles), which SILENTLY
  /// DROPS CSS custom properties: assigning an unknown key to a
  /// CSSStyleDeclaration just creates a plain JS property on the object and
  /// never reaches the CSS. Verified -- three cats passed --range, --dur and
  /// --fur individually and all three came back with the values empty and an
  /// identical 26s fallback duration, so they were marching in lockstep while
  /// the comment above them claimed they were not. Anything named "--" has to
  /// go through setProperty.
  function styl(px, node, css) {
    var plain = {}, k;
    for (k in css) {
      if (k.slice(0, 2) === "--") node.style.setProperty(k, css[k]);
      else plain[k] = css[k];
    }
    return px(node, plain);
  }

  /// The street front. Called by level.js while it lays out the block.
  /// Ordered the way the building is read: roof, cap, shaft, brand, services,
  /// sign band, shopfront, kerb.
  function facade(d, el, px) {
    injectCss();
    var add = function (cls, html, css) {
      var e = el("div", cls);
      if (html) e.innerHTML = html;
      if (css) styl(px, e, css);
      d.appendChild(e);
      return e;
    };

    // ---- roof: four objects, because a flat roofline has no silhouette ----
    add("cc-f-tower", '<s></s><u></u><i class="l"></i><i class="r"></i>');
    add("cc-f-stack");
    add("cc-f-smoke"); add("cc-f-smoke b"); add("cc-f-smoke c");
    add("cc-f-aerial", "<u></u><i></i><i></i><i></i>");
    add("cc-f-roofcat", '<em></em><i class="l"></i><i class="r"></i><u></u><s></s>'
      + '<b class="l"></b><b class="r"></b>');

    // ---- cap ----
    add("cc-f-parapet");
    add("cc-f-cornice");
    add("cc-f-pigeon");

    // ---- the brand panel: black ground, lime keyline, the cat, no text ----
    add("cc-f-og", '<img src="art/partners/cashcat.png" alt="Cash Cat">');

    var gh = el("div", "cc-f-ghost");
    gh.innerHTML = "<b>CASH CAT</b>"
      + "<i>THE ORIGINAL NAME FOR ROBINHOOD WAS CASH CAT</i>"
      + "<em>THEIR TOKEN CONTRACT &middot; EST. BLOCK 88,836</em>";
    px(gh, { left: "14px", top: "238px", width: "426px" });
    d.appendChild(gh);

    // ---- windows. Two storeys, two bays, and one of them is occupied -----
    // Two big bays instead of four small ones. Part of the crowding the user
    // saw was four little windows fighting the crest for the same wall.
    [[20, 120, ""], [358, 120, " cold"]].forEach(function (w, i) {
      add("cc-f-win" + w[2], i === 0 ? '<i class="cc-f-catwin"></i>' : "",
        { left: w[0] + "px", top: w[1] + "px" });
      add("cc-f-sill", "", { left: (w[0] - 6) + "px", top: (w[1] + 80) + "px" });
    });

    // ---- the hanging sign ------------------------------------------------
    // It says cc and nothing else. Their factory forces every token address it
    // mints to END in cc, and the lime they brand with is #CCFF00, which BEGINS
    // with it. One mark that is provably theirs and needs no explaining.
    add("cc-f-bracket");
    add("cc-f-blade", "<b>cc</b>");
    add("cc-f-glow");

    // ---- services --------------------------------------------------------
    add("cc-f-escape", '<u class="a"></u><u class="b"></u><i></i><i></i><i></i>');
    add("cc-f-pipe");

    // ---- the marquee, doubled so the wrap at -50% is seamless ------------
    // "every token THEY launch" failed on CASHCAT itself (0x020b...18b4), which
    // predates letscash; the rule is the launchpad's, and it is checkable
    var strip = "$CASHCAT &middot; EVERY LETSCASH LAUNCH ENDS IN cc &middot; "
      + "CAT GOES UP &middot; CAT GOES DOWN &middot; CAT DOES NOT CARE &middot; ";
    var fascia = add("cc-f-fascia", '<div class="cc-f-tapewin"><div class="cc-f-tape"><span>'
      + strip + "</span><span>" + strip + "</span></div></div>");
    // and once the chain answers, the tape leads with today's numbers
    (async function () {
      try {
        var Fm = window.Firm; if (!Fm || !window.FIRM_CFG) return;
        var lv = await readCashcat(Fm, window.FIRM_CFG);
        if (!lv || lv.idx === null) return;
        var live = "$CASHCAT " + fmtUsd(lv.priceUsd) + " &middot; MCAP " + fmtUsd(lv.mcapUsd)
          + " &middot; " + lv.burnedPct.toFixed(2) + "% BURNED &middot; ON THE BROKERS&rsquo; SALARY MENU &middot; "
          + "CAT GOES UP &middot; CAT GOES DOWN &middot; CAT DOES NOT CARE &middot; ";
        fascia.querySelectorAll(".cc-f-tape span").forEach(function (sp) { sp.innerHTML = live; });
      } catch (e) { /* the printed tape stands */ }
    })();

    // ---- shopfront -------------------------------------------------------
    add("cc-f-entry", '<div class="glow"></div><div class="flr"></div>'
      + '<div class="rug"></div><div class="sit"></div>'
      + '<div class="leaf"></div><div class="knob"></div>');
    add("cc-f-lintel");
    add("cc-f-awning");
    add("cc-f-pil", "", { left: "0px" });
    add("cc-f-pil", "", { left: "441px" });
    // the game's doorway occupies 129..221; a bay sits either side of it
    var cats = '<div class="cc-f-cats"><i class="a"></i><i class="b"></i>'
      + '<i class="c"></i><b class="a"></b></div>';
    add("cc-f-riser", '<i class="cc-f-flap"></i>', { left: "8px" });
    var site = (window.FIRM_CFG && window.FIRM_CFG.cashcatSite) || "https://cashcat.cc";
    var door = function (win, url, title) {
      win.classList.add("door"); win.title = title;
      win.addEventListener("click", function (e) { e.stopPropagation(); window.open(url, "_blank", "noopener"); });
      return win;
    };
    // the windows are doors to the two things their own navigation calls itself
    door(add("cc-f-shopwin", '<div class="cc-f-vinyl">LORE &middot; MEMES</div>' + cats,
      { left: "10px" }), site + "/#lore", "lore and memes, on cashcat.cc");
    add("cc-f-riser", "", { left: "292px" });
    door(add("cc-f-shopwin", '<div class="cc-f-vinyl">PFP GEN</div>'
      + cats.replace("cc-f-cats", "cc-f-cats flip"), { left: "294px" }), site + "/pfp", "PFP GEN, on cashcat.cc");

    // ---- the residents ----------------------------------------------------
    // Different durations and ranges on purpose: three cats on the same clock
    // march in formation, which is the one thing cats never do.
    [[-300, 190, 25, "#efe8d8"], [180, 118, 33, "#c9c3b4"], [-104, 146, 19, "#e0d2b6"]]
      .forEach(function (c) {
        var k = el("div", "cc-f-cat");
        k.innerHTML = '<div class="rig"><em class="tal"></em>'
          + '<i class="leg a"></i><i class="leg b"></i><i class="leg c"></i><i class="leg d"></i>'
          + '<u class="bod"></u><b class="hed"></b>'
          + '<s class="ear l"></s><s class="ear r"></s></div>';
        styl(px, k, { left: c[0] + "px", "--range": c[1] + "px", "--dur": c[2] + "s", "--fur": c[3] });
        d.appendChild(k);
      });

    // the plain brick under the lower-left sill was the last dead panel
    var wb = el("div", "cc-f-box");
    wb.innerHTML = "<i></i><i></i><i></i><i></i><i></i>"
      + '<b class="a"></b><b class="b"></b><b class="c"></b>';
    px(wb, { left: "16px", top: "204px" });
    d.appendChild(wb);

    // sitting on the awning, silhouetted against the marquee behind it
    var ac = el("div", "cc-f-awncat");
    ac.innerHTML = '<em></em><u></u><s></s><b class="l"></b><b class="r"></b>'
      + '<i class="l"></i><i class="r"></i>';
    px(ac, { left: "344px", bottom: "156px" });
    d.appendChild(ac);

    px(add("cc-f-grate"), { left: "-206px" });
    [[-198, 5.6], [-184, 7.4]].forEach(function (v) {
      styl(px, add("cc-f-steam"), { left: v[0] + "px", bottom: "-16px", "--sd": v[1] + "s" });
    });

    // moths, because there is a light on
    [[-94, 154, 6.5], [12, 198, 8.2], [-86, 244, 5.4]].forEach(function (m) {
      styl(px, add("cc-f-moth"), { left: m[0] + "px", top: m[1] + "px", "--md": m[2] + "s" });
    });

    // ---- the kerb --------------------------------------------------------
    add("cc-f-step");
    add("cc-f-mat");
    add("cc-f-crate");
    add("cc-f-milk");
    add("cc-f-sand", '<i class="l"></i><i class="r"></i>'
      // their other line, so the board is not repeating the marquee overhead
      + '<u><b class="big">100,000+</b><b>HOLDERS</b>'
      + '<b class="src">AND COUNTING</b></u>');
    add("cc-f-stoop", '<em></em><u></u><s></s><b class="l"></b><b class="r"></b>'
      + '<i class="l"></i><i class="r"></i>');
  }

  window.__CASHCAT = { injectCss: injectCss, room: room, facade: facade, CSS: CSS };
})();
