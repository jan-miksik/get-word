export function LandingPageStyles() {
  return (
    <style>{`
.lp-root{
  --paper:#dcd1b9;
  --card:#f3ead5; --card-2:#fbf5e7;
  --ink:#211a0f; --ink-2:#52462f; --ink-soft:#857449;
  --blue:#1E6FA8; --blue-deep:#134f78;
  --rust:#bf472a; --rust-deep:#963620;
  --line:rgba(33,26,15,0.16); --line-strong:rgba(33,26,15,0.3);
  --ob-surface:var(--card); --ob-surface-hover:var(--card-2);
  --ob-ink:var(--ink); --ob-ink-soft:var(--ink-soft);
  --ob-accent:var(--blue); --ob-danger:#B91C1C;

  /* Borrowed from the signed-in app (styles/tokens.css) so the landing is the
     same product in a lighter skin: one large radius, pill controls, hairline
     borders and wide soft shadows. Only the palette differs — the app is dark
     navy, this is parchment. */
  --radius-lg:18px;
  --radius-pill:999px;
  --hairline:1px solid rgba(33,26,15,0.14);
  --shadow-soft:0 18px 45px -28px rgba(33,26,15,0.55);
  --shadow-chip:0 10px 25px -18px rgba(33,26,15,0.5);
  --transition-fast:160ms ease-out;

  position:relative;
  isolation:isolate;
  min-height:100dvh;
  width:100%;
  color:var(--ink);
  /* Only the base colour here. The contour map is .lp-backdrop, a fixed layer of
     its own: painted on .lp-root it was sized to the *page*, and cover on a box
     five thousand pixels tall means the whole map rescales whenever the page
     grows or shrinks. Opening the "More" toggle was enough to visibly zoom it. */
  background-color:var(--paper);
  font-family:var(--font-hanken),system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  /* overflow-x hidden computes the other axis to auto, which makes this a second
     vertical scroller in Firefox. That nested scroller jumps when the Android
     keyboard changes the visual viewport. clip prevents horizontal paint
     overflow without taking ownership of vertical scrolling. */
  overflow-x:clip;
}

@media (display-mode: standalone), (display-mode: fullscreen){
  .lp-root{
    height:100dvh;
    overflow-y:auto;
    -webkit-overflow-scrolling:touch;
  }
}

/* The contour map, generated fresh per visit. It runs the whole length of the
   page and scrolls with it, on a layer of its own rather than as .lp-root's own
   background.
   The size is width-driven (100% auto) and the map repeats down the page.
   That is the whole trick: with cover, the map was scaled to fit the page box,
   so every change in page height rescaled the entire map, and merely opening
   the "More" toggle zoomed it. Tied to the width, nothing below can move it. */
.lp-backdrop{
  position:absolute; inset:0; z-index:-10;
  pointer-events:none;
  background-image:url('/api/backgrounds/topo');
  background-repeat:repeat-y;
  background-position:top center;
  background-size:100% auto;
}
.lp-display{ font-family:system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:-0.01em; }
.lp-mono{ font-family:var(--font-mono-accent),ui-monospace,"SF Mono",monospace; }
.italic{ font-style:italic; }
.lp-root ::selection{ background:var(--blue); color:var(--card-2); }

/* The soft cream field every text block sits in: a solid rounded slab, inset
   well past the text on every side and then blurred until it has no edge at
   all. Gradients were tried first and always left a visible boundary somewhere
   — a radial stop is a hard edge the moment the eye has a straight run of
   contour lines to compare it against. A blurred solid cannot: the middle is
   dense enough to read on, and the falloff is a true optical fade, so the map
   keeps running underneath without anything being framed. */
.lp-haze{ position:relative; isolation:isolate; }
.lp-haze::before{
  content:""; position:absolute; z-index:-1; pointer-events:none;
  inset:clamp(-4.5rem,-9vw,-2.5rem) clamp(-4rem,-8vw,-2rem);
  border-radius:clamp(3rem,9vw,7rem);
  background:rgba(251,245,231,.86);
  filter:blur(42px);
}

/* The easter-egg target. touch-action:manipulation kills iOS double-tap-to-zoom
   so the second tap reaches the handler; without user-select:none a double
   click on desktop also selects the brand label next to it. */
.lp-logo-egg{
  display:inline-flex;
  touch-action:manipulation;
  -webkit-user-select:none; user-select:none;
  -webkit-tap-highlight-color:transparent;
}

/* The cross-fade in and out of the easter egg. An animation rather than a
   transition so the layers can mount already fading, and so the animationend
   event tells the component when it is safe to unmount them again. */
.lp-scratch-layers{ opacity:0; }
.lp-scratch-in{ animation:lp-scratch-fade 320ms ease forwards; }
.lp-scratch-out{ animation:lp-scratch-fade 320ms ease reverse forwards; }
@keyframes lp-scratch-fade{ from{ opacity:0 } to{ opacity:1 } }
@media (prefers-reduced-motion: reduce){
  /* Not animation:none — without an animationend event the faded-out layers
     would stay mounted forever. */
  .lp-scratch-in, .lp-scratch-out{ animation-duration:1ms; }
}

.lp-site-header{ background:transparent; }

/* ------------------------------------------------------------------ *
 * Controls — pills and soft shadows, same as the app's own buttons
 * ------------------------------------------------------------------ */

.lp-btn-primary,.lp-btn-ghost{
  display:inline-flex; align-items:center; justify-content:center; gap:.55rem;
  font-weight:600; border-radius:var(--radius-pill);
  transition:transform var(--transition-fast), background var(--transition-fast),
    color var(--transition-fast), box-shadow var(--transition-fast);
}
.lp-btn-primary{
  background:var(--blue); color:var(--card-2); border:1px solid var(--blue-deep);
  padding:.9rem 1.6rem; font-size:1.02rem;
  box-shadow:var(--shadow-chip);
}
.lp-btn-primary:hover{ background:var(--blue-deep); transform:translateY(-2px); box-shadow:var(--shadow-soft); }
.lp-btn-primary:active{ transform:translateY(0); }
.lp-btn-hero{ padding:1.05rem 2rem; font-size:1.12rem; }
.lp-btn-ghost{
  background:rgba(251,245,231,.7); color:var(--ink); border:var(--hairline);
  padding:.5rem 1.05rem; font-size:.92rem;
  min-height:2.75rem; white-space:nowrap;
}
.lp-btn-ghost:hover{ background:var(--ink); color:var(--card-2); border-color:var(--ink); }
.lp-btn-arrow{ width:1.05rem; height:1.05rem; transition:transform .2s ease; }
.group:hover .lp-btn-arrow{ transform:translateX(4px); }

@media (max-width:639px){
  .lp-btn-ghost{ min-height:2.3rem; padding:.38rem .68rem; font-size:.8rem; }
}
@media (max-width:359px){
  .lp-brand-label{ display:none; }
}
@media (max-width:639px){
  .scratch-field-switcher{
    left:.75rem;
    bottom:max(.75rem,env(safe-area-inset-bottom));
    max-width:calc(100vw - 1.5rem);
  }
}

/* ------------------------------------------------------------------ *
 * Hero — the pitch and the language pair side by side, the demo below
 * ------------------------------------------------------------------ */

.lp-hero{
  display:flex; flex-direction:column;
  gap:clamp(3.5rem,9vw,7rem);
  /* Small top padding on purpose: the first screen's air comes from centring
     inside .lp-hero-top's full-height box, and padding here would only push
     that box past the fold. */
  padding-block:clamp(1rem,2vw,2rem) clamp(3rem,8vw,6rem);
}
.lp-hero-top{
  position:relative;
  display:grid;
  /* Stacked, this is the gap between the pitch and the language pair, and it is
     deliberately wider than a paragraph break: they are two different things to
     do, not two paragraphs of the same thing. */
  gap:clamp(2.75rem,6.5vw,4rem);
  /* Centred rather than top-aligned: the type column and the picker column are
     different heights, and hanging them from the top left the shorter one
     looking like it had simply run out. */
  align-items:center; align-content:center;
  /* A full screen minus the header it sits under, so the pitch and the language
     pair are the whole first view and the demo is the reward for scrolling.
     min-height, not height: on a short landscape window the content still wins
     and the section simply grows. The padding at the bottom is the scroll cue's
     room — it is positioned out of the grid. */
  min-height:calc(100dvh - 8.5rem);
  padding-bottom:4.5rem;
}
@media (min-width:960px){
  /* Narrower than the page column and pulled in from both edges, with a wide
     gutter down the middle: the pitch and the pair are one object sitting in
     the middle of the screen, not two things pinned to opposite margins. */
  .lp-hero-top{
    /* 25rem for the pair, so each field is wide enough to hold its heading on
       one line ("I want to learn" needs 181px, a field is ~194px). The type
       column still clears the widest headline line by a comfortable margin, so
       nothing re-wraps to buy this. */
    grid-template-columns:minmax(0,1fr) minmax(330px,25rem);
    column-gap:clamp(3.5rem,5.5vw,5.5rem);
    /* Sized so the type column clears 584px on a full-width desktop, which is
       what the longest headline (Ukrainian) needs to break two ways rather than
       three at its 80px cap. The gap gave up some of it and the page column the
       rest; the picker column cannot — 25rem is what keeps "I want to learn"
       on one line above its field. Narrower windows fall back to three lines,
       which is a price the headline can pay. */
    max-width:68rem; margin-inline:auto;
  }
}
/* Stacked, the pitch is a column of its own like every section below it, so it
   centres with them — but only down to the phone, where everything goes back to
   a single left edge (see the mobile block at the end of this sheet). */
@media (min-width:768px) and (max-width:959px){
  .lp-hero-lead{ text-align:center; }
  .lp-hero-subtitle{ margin-inline:auto; }
}
.lp-hero-lead{ min-width:0; }
/* Above the demo card in paint order: the "I want to learn" list opens
   downwards, over whatever follows it. */
.lp-hero-controls{ position:relative; z-index:2; min-width:0; }
/* The demo is the proof, not a companion to the headline — it sits on its own
   below the fold-line of the pitch, centred, with room around it. */
.lp-hero-demo{
  position:relative; z-index:1;
  width:100%; max-width:31rem; margin-inline:auto;
}

/* The scroll cue at the foot of the first screen: a hairline track with a dot
   running down it. Absolute, so it never becomes a third grid item and never
   pushes the pitch off centre. */
.lp-scroll-cue{
  position:absolute; left:50%; bottom:.75rem;
  display:flex; justify-content:center;
  transform:translateX(-50%);
  pointer-events:none;
}
.lp-scroll-cue-track{
  position:relative; display:block;
  width:1px; height:3.25rem; border-radius:1px;
  background:linear-gradient(180deg,
    rgba(33,26,15,0) 0%, rgba(33,26,15,.22) 35%, rgba(33,26,15,.22) 65%, rgba(33,26,15,0) 100%);
  overflow:hidden;
}
.lp-scroll-cue-dot{
  position:absolute; left:50%; top:0;
  width:3px; height:.85rem; margin-left:-1.5px; border-radius:2px;
  background:var(--blue);
  animation:lp-cue 2.2s cubic-bezier(.55,0,.45,1) infinite;
}
@keyframes lp-cue{
  0%{ transform:translateY(-100%); opacity:0 }
  25%{ opacity:1 }
  75%{ opacity:1 }
  100%{ transform:translateY(3.25rem); opacity:0 }
}

/* The largest type on the page, and it has to stay that way: it is the one h1,
   and a section heading below it that outgrows it turns the opening screen into
   the small print. So this is sized against .lp-section-title (4.6rem / 7.5vw)
   rather than against a two-line fit — a third line in the longer languages is
   the cheaper price, and the column is wide enough that no single word in them
   overflows it. */
.lp-hero-title{
  margin:0;
  font-size:clamp(2.9rem,8vw,5rem);
  font-weight:700; line-height:1.02; letter-spacing:-0.035em;
  color:var(--ink);
  text-wrap:balance;
}
/* Same exercise: one line in the desktop column needs 24px or less for English,
   22 Czech, 26 Vietnamese, 18 Ukrainian. 16px clears the tightest by 11%. */
.lp-hero-subtitle{
  margin:1.5rem 0 0; max-width:32rem;
  font-size:clamp(0.95rem,1.35vw,1rem); line-height:1.35; font-weight:500;
}
.lp-demo-caption{
  margin:1.1rem 0 0;
  font-size:.94rem; line-height:1.5; text-align:center;
}
/* The dark plaque. Nothing else on the page is this colour, which is the point:
   the two lines that have to be read — what the app is, and what to do with the
   demo — stop being one more thing floating on parchment. */
.lp-plaque{
  display:inline-block;
  padding:.55rem 1rem .62rem;
  border-radius:14px;
  background:#100c07; color:#f6eeda;
  box-shadow:0 18px 38px -26px rgba(0,0,0,.9);
}
/* The demo caption gets the blue rather than the near-black: it belongs to the
   card above it, and two black slabs in one screen read as the page having two
   headlines. The blue is the same one the primary button and the card's own
   accents use, so the caption joins the demo instead of interrupting it. */
.lp-plaque--sm{
  display:block;
  padding:.75rem 1.15rem .8rem;
  background:var(--blue-deep); color:#eef4f9;
  box-shadow:0 18px 38px -26px rgba(19,79,120,.9);
  font-size:.94rem;
}

/* Same palette as the interface-language picker in the header, so the controls
   on this screen read as one set — and this cooler cream matches the contour
   map underneath better than the warmer --card did.

   Set as the combobox's own variables rather than as a background on the field,
   so everything the component paints follows: the closed field, its focus
   state, and the dropdown list, which otherwise stayed on --card and no longer
   matched the field it opened from. (The touch bottom-sheet is portaled to the
   body, where these variables do not reach, but its CSS fallback is already
   this same #F4EFE2.)

   The literals are deliberate: InterfaceLanguageSelector pins these exact
   values inline on its own wrapper, so var(--ob-surface) here would resolve to
   .lp-root's --card and quietly break the match. */
.lp-hero-picker{
  padding:0;
  --ob-surface:#F4EFE2;
  --ob-surface-hover:#FFF8E8;
}
.lp-hero-picker .onboarding-combobox{ box-shadow:var(--shadow-chip); }

/* Side by side, the two pickers are one control, so their fields have to start
   on the same line. They are two independent components, though, and each one
   stacks its own heading above its own field, so the moment one heading wraps
   ("I want to learn" wraps at this column width, "I know" does not) that column
   pushes its field down alone and the pair reads as broken.
   The column is wide enough that the English headings fit on one line, so this
   is the fallback rather than the normal case: it catches languages whose
   heading is long enough to wrap anyway, and the narrow end of the column's
   minmax(). Subgrid puts both headings in one row track and both fields in the
   next, so the taller heading sets the height for both and the fields stay
   level. Only where subgrid exists: everywhere else this leaves the current
   behaviour. */
@supports (grid-template-rows: subgrid){
  @media (min-width:640px){
    .lp-hero-pair{ grid-template-rows:auto auto; }
    .lp-hero-pair > *{ display:grid; grid-row:span 2; grid-template-rows:subgrid; }
  }
}

/* ------------------------------------------------------------------ *
 * Sections — one measure for text, wider room for anything interactive
 * ------------------------------------------------------------------ */

.lp-section{
  /* One measure for the whole argument, centred in the canvas — headings and
     prose both. Left-aligning a narrow column inside a wide container is what
     made the page look unbalanced: half the width sat empty for every section
     without an object in it. */
  /* No break-out until there is margin to break out into — on a phone the
     column already touches both edges, and widening the cards there just
     pushed them under the viewport clip. */
  --breakout:0px;
  /* width:100% is load-bearing. The page column is a flex container, and an
     auto inline margin on a flex item cancels the stretch — without a definite
     width every section would shrink to fit its own widest child, so the text
     sections and the ones with a card in them ended up on different measures. */
  width:100%; max-width:52rem; margin-inline:auto;
  margin-block:clamp(4.5rem,11vw,8rem);
  text-align:center;
}
@media (min-width:768px){
  .lp-section{ --breakout:clamp(1rem,7vw,8rem); }
}
.lp-section-head{ display:flex; justify-content:center; }
/* Deliberately near-poster size: five headings carry the whole page, and at
   subhead size they read as a list of features rather than as the argument.
   Kept just under .lp-hero-title at every width — cap, vw term and floor all
   below its — so the headline still leads the page. */
.lp-section-title{
  margin:0;
  font-size:clamp(2.35rem,7.5vw,4.6rem);
  font-weight:700; line-height:1.0; letter-spacing:-0.04em;
  color:var(--ink); text-wrap:balance;
}
.lp-section--quiet .lp-section-title{
  font-size:clamp(1.6rem,3.4vw,2.2rem); letter-spacing:-0.03em;
}
.lp-prose{
  margin:1.5rem auto 0; max-width:60ch;
  font-size:clamp(1.08rem,1.5vw,1.24rem); line-height:1.7; color:var(--ink-2);
  text-wrap:pretty;
}
/* The only structural move on the page: text stays in one measure, the things
   you can touch break out of it on both sides. Their own contents go back to
   being left-aligned — centred body copy inside a card is unreadable. */
.lp-section-aside{
  margin-top:2.5rem;
  margin-inline:calc(-1 * var(--breakout));
  text-align:left;
}
/* Marathon puts its equation above the prose, so the paragraph after it needs
   the same air the aside would have had below it. */
.lp-section-aside--first{ margin-top:2.25rem; }
.lp-section-aside--first + .lp-prose{ margin-top:2.25rem; }

/* ------------------------------------------------------------------ *
 * The pace equation
 * ------------------------------------------------------------------ */

.lp-pace{
  display:flex; flex-direction:column; gap:1.6rem;
  padding:clamp(1.5rem,3.5vw,2rem);
  background:rgba(251,245,231,.72);
  border:var(--hairline); border-radius:var(--radius-lg);
  box-shadow:var(--shadow-soft);
}
/* The two things you set sit on one line where there is room: they are one
   sentence — this many words a week, over this long. */
.lp-pace-controls{ display:grid; gap:1.5rem; align-items:end; }
@media (min-width:680px){
  .lp-pace-controls{ grid-template-columns:minmax(0,1fr) auto; gap:2.25rem; }
}
.lp-pace-control{ display:flex; flex-direction:column; gap:.75rem; min-width:0; }
/* Full-size type, not an uppercase micro-label: these two are questions put to
   the reader, and at 11px they read as form furniture nobody touches. */
.lp-pace-label{
  font-size:clamp(1.05rem,2vw,1.25rem); font-weight:700; letter-spacing:-0.015em;
  color:var(--ink);
}
.lp-pace-select-wrap{ position:relative; display:inline-flex; }
.lp-pace-select{
  appearance:none; -webkit-appearance:none;
  width:100%; padding:.72rem 2.75rem .72rem 1.2rem;
  font-family:inherit; font-size:clamp(1rem,1.8vw,1.12rem); font-weight:600;
  color:var(--ink); background:var(--card-2);
  border:1px solid var(--line-strong); border-radius:var(--radius-pill);
  box-shadow:var(--shadow-chip); cursor:pointer;
  transition:box-shadow var(--transition-fast), transform var(--transition-fast);
}
.lp-pace-select:hover{ transform:translateY(-1px); box-shadow:var(--shadow-soft); }
.lp-pace-select:focus-visible{ outline:2px solid var(--blue); outline-offset:3px; }
.lp-pace-select-caret{
  position:absolute; right:1.15rem; top:50%; pointer-events:none;
  width:.5rem; height:.5rem; margin-top:-.38rem;
  border-right:2px solid var(--ink-soft); border-bottom:2px solid var(--ink-soft);
  transform:rotate(45deg);
}
.lp-pace-range{
  -webkit-appearance:none; appearance:none;
  width:100%; height:26px; background:transparent; cursor:pointer;
}
.lp-pace-range:focus-visible{ outline:2px solid var(--blue); outline-offset:6px; border-radius:var(--radius-pill); }
.lp-pace-range::-webkit-slider-runnable-track{
  height:6px; border-radius:var(--radius-pill);
  background:linear-gradient(90deg,
    var(--blue) 0 var(--progress,50%), rgba(33,26,15,.16) var(--progress,50%) 100%);
}
.lp-pace-range::-webkit-slider-thumb{
  -webkit-appearance:none;
  width:24px; height:24px; margin-top:-9px; border-radius:var(--radius-pill);
  background:var(--card-2); border:1px solid var(--line-strong);
  box-shadow:var(--shadow-chip);
  transition:transform var(--transition-fast);
}
.lp-pace-range:active::-webkit-slider-thumb{ transform:scale(1.08); }
.lp-pace-range::-moz-range-track{ height:6px; border-radius:var(--radius-pill); background:rgba(33,26,15,.16); }
.lp-pace-range::-moz-range-progress{ height:6px; border-radius:var(--radius-pill); background:var(--blue); }
.lp-pace-range::-moz-range-thumb{
  width:22px; height:22px; border-radius:var(--radius-pill);
  background:var(--card-2); border:1px solid var(--line-strong);
}
.lp-pace-note{ margin:0; font-size:.95rem; line-height:1.55; color:var(--ink-soft); }

/* The methodology, folded away. Not a card of its own — it is a footnote to the
   card it sits in, so it gets a rule above it and nothing else. */
.lp-method{ margin-top:-.4rem; }
.lp-method-summary{
  display:inline-flex; align-items:center; gap:.4rem;
  width:fit-content; padding:.15rem 0;
  font-size:.92rem; font-weight:600; color:var(--blue-deep);
  cursor:pointer; list-style:none;
  border-bottom:1px solid rgba(30,111,168,.35);
  transition:color var(--transition-fast), border-color var(--transition-fast);
}
.lp-method-summary::-webkit-details-marker{ display:none; }
.lp-method-summary::after{
  content:""; width:.42rem; height:.42rem; margin-left:.1rem;
  border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor;
  transform:translateY(-2px) rotate(45deg);
  transition:transform var(--transition-fast);
}
.lp-method[open] .lp-method-summary::after{ transform:translateY(1px) rotate(-135deg); }
.lp-method-summary:hover{ color:var(--rust-deep); border-color:rgba(191,71,42,.4); }
.lp-method-summary:focus-visible{ outline:2px solid var(--blue); outline-offset:4px; border-radius:4px; }
.lp-method-body{
  margin-top:1rem; padding-top:1rem;
  border-top:var(--hairline);
  display:flex; flex-direction:column; gap:.9rem;
  max-width:60ch;
}
/* Opening animation, two layers. The fade-and-rise runs everywhere, because it
   is just a keyframe on an element that has appeared. The height transition
   needs interpolate-size + ::details-content, and where those exist it also
   animates the *closing*, which no keyframe can do without JavaScript. */
.lp-method[open] .lp-method-body{
  animation:lp-method-open 280ms cubic-bezier(.2,.8,.25,1);
}
@keyframes lp-method-open{
  from{ opacity:0; transform:translateY(-6px) }
  to{ opacity:1; transform:none }
}
@supports (interpolate-size: allow-keywords){
  .lp-method{ interpolate-size:allow-keywords; }
  .lp-method::details-content{
    block-size:0; overflow:clip;
    transition:block-size 300ms cubic-bezier(.2,.8,.25,1),
      content-visibility 300ms allow-discrete;
  }
  .lp-method[open]::details-content{ block-size:auto; }
}
.lp-method-body p{ margin:0; font-size:.92rem; line-height:1.6; color:var(--ink-soft); }
.lp-method-sources{ display:flex; flex-direction:column; gap:.35rem; }
.lp-method-sources-label{
  font-size:.72rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  color:var(--ink-soft);
}
.lp-method-source{
  color:var(--blue-deep); text-decoration:underline;
  text-decoration-color:rgba(30,111,168,.35); text-underline-offset:3px;
  overflow-wrap:anywhere;
}
.lp-method-source:hover{ color:var(--rust-deep); text-decoration-color:rgba(191,71,42,.45); }

.lp-stats{
  list-style:none; margin:0; padding:0;
  display:grid; grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr)); gap:1.3rem;
}
.lp-stat{ display:flex; flex-direction:column; gap:.35rem; }
@media (min-width:640px){
  .lp-stat + .lp-stat{ border-left:var(--hairline); padding-left:1.3rem; }
}
.lp-stat-value{
  font-size:clamp(1.95rem,4.2vw,2.7rem); font-weight:700;
  line-height:1; letter-spacing:-0.035em; color:var(--blue-deep);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}
.lp-stat--accent .lp-stat-value{ color:var(--rust-deep); }
.lp-stat-label{ font-size:.92rem; line-height:1.4; color:var(--ink-soft); }

/* ------------------------------------------------------------------ *
 * The four ways words get in
 * ------------------------------------------------------------------ */

.lp-ways{ list-style:none; margin:0; padding:0; display:grid; gap:1.25rem; }
@media (min-width:720px){
  .lp-ways{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:1.4rem; }
}
.lp-way{
  padding:clamp(1.25rem,3vw,1.6rem);
  background:rgba(251,245,231,.72);
  border:var(--hairline); border-radius:var(--radius-lg);
  box-shadow:var(--shadow-chip);
  transition:transform var(--transition-fast), box-shadow var(--transition-fast),
    background var(--transition-fast);
}
.lp-way:hover{ transform:translateY(-3px); box-shadow:var(--shadow-soft); background:rgba(251,245,231,.88); }
.lp-way--soon{ background:transparent; border-style:dashed; }
/* Sits on the heading line, not above it — see the note in LandingSections. */
.lp-way-icon{
  display:inline-flex; align-items:center; justify-content:center; flex:none;
  width:36px; height:36px; border-radius:11px;
  background:rgba(30,111,168,.14); color:var(--blue-deep);
  transition:transform .3s cubic-bezier(.2,.8,.3,1);
}
.lp-way--soon .lp-way-icon{ background:rgba(191,71,42,.14); color:var(--rust-deep); }
.lp-way:hover .lp-way-icon{ transform:translateY(-2px) rotate(-5deg); }
.lp-way-title{
  display:flex; align-items:center; flex-wrap:wrap; gap:.65rem;
  margin:0 0 .5rem;
  font-size:1.22rem; font-weight:600; letter-spacing:-0.015em; color:var(--ink);
}
.lp-way-name{ min-width:0; }
.lp-badge{
  font-size:.66rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
  color:var(--rust-deep); background:rgba(191,71,42,.12);
  border-radius:var(--radius-pill);
  padding:.18rem .6rem;
}
.lp-way-body{ margin:0; font-size:1.02rem; line-height:1.62; color:var(--ink-2); }

/* Any language with any language, drawn as every chord of a small ring. */
.lp-pairweb{ display:flex; justify-content:center; }
.lp-pairweb svg{ display:block; width:100%; max-width:28rem; height:auto; }
.lp-pairweb-lines path{
  fill:none; stroke:var(--blue); stroke-opacity:.32; stroke-width:1;
  stroke-dasharray:2 6; stroke-linecap:round;
}
.lp-pairweb-node circle{ fill:var(--card-2); stroke:var(--line-strong); stroke-width:1.5; }
/* Flag emoji, so no fill and no mono stack — and a size that fills the node
   without touching its ring. Windows, which has no flag glyphs, draws the two
   regional letters here instead at a legible size. */
.lp-pairweb-node text{
  font-size:17px; font-weight:600; letter-spacing:0;
  fill:var(--ink-2); text-anchor:middle;
}

.lp-github-link{
  display:inline-flex; align-items:center; gap:.55rem; margin-top:1.3rem;
  padding:.6rem 1.1rem;
  background:rgba(251,245,231,.72);
  border:var(--hairline); border-radius:var(--radius-pill);
  box-shadow:var(--shadow-chip);
  font-size:.98rem; font-weight:600; color:var(--blue-deep);
  overflow-wrap:anywhere;
  transition:transform var(--transition-fast), box-shadow var(--transition-fast), color var(--transition-fast);
}
.lp-github-link:hover{ transform:translateY(-2px); box-shadow:var(--shadow-soft); color:var(--rust-deep); }

.lp-finish{
  display:flex; justify-content:center;
  padding:clamp(1rem,4vw,2rem) 0 clamp(3rem,8vw,5rem);
}
/* Last line before the footer rule: a footnote about the page rather than a
   part of the pitch, so it sits right on top of the line that closes the page. */
/* Wide enough for the whole sentence on one line on a desktop, in every
   language: the longest of the four (Ukrainian) measures 605px at this size,
   and 42rem is 672. Narrower than that and the line broke in two, which for a
   one-sentence aside reads as a paragraph. Phones are unaffected — the column
   there is narrower than either figure and the line wraps as it always did. */
.lp-finish-bonus{
  margin:0 auto 1.25rem; max-width:42rem;
  text-align:center; font-size:.92rem; line-height:1.6;
  color:var(--ink-soft);
}
.lp-btn-finish{
  min-width:0; text-align:center;
  padding:1.15rem clamp(1.5rem,6vw,2.75rem);
  font-size:clamp(1.1rem,2.6vw,1.4rem); font-weight:700; letter-spacing:-0.015em;
  box-shadow:var(--shadow-soft);
}

.lp-fade-in{ opacity:0; animation:lp-fade .9s ease forwards .12s; }
@keyframes lp-rise{
  from{ opacity:0; transform:translateY(18px) }
  to{ opacity:1; transform:none }
}
@keyframes lp-fade{ to{ opacity:1 } }
.lp-reveal{ animation:lp-rise .65s cubic-bezier(.2,.8,.25,1) backwards; animation-delay:var(--d,0ms); }

.lp-foot-link{ font-size:.9rem; font-weight:500; color:var(--ink-2); text-decoration:none; transition:color .15s; }
.lp-foot-link:hover{ color:var(--rust); }

/* ------------------------------------------------------------------ *
 * Phones — one left edge for everything
 * ------------------------------------------------------------------ */

/* Centred type needs margin on both sides to read as centred. A phone has none,
   so every line just starts and ends at a slightly different place and the page
   looks ragged. Below 768px headings and prose share one left edge instead. */
@media (max-width:767px){
  .lp-section{ text-align:left; }
  .lp-section-head{ justify-content:flex-start; }
  .lp-prose{ margin-inline:0; }
  .lp-demo-caption{ text-align:left; }
  .lp-finish-bonus{ margin-inline:0; text-align:left; }
}

@media (prefers-reduced-motion:reduce){
  .lp-fade-in,.lp-reveal{ animation:none !important; opacity:1 !important; }
  .lp-way,.lp-way:hover,.lp-way-icon,.lp-way:hover .lp-way-icon{ transform:none !important; }
  /* The cue keeps its dot, parked in the middle of the track, so the hint is
     still there without anything moving. */
  .lp-scroll-cue-dot{ animation:none; top:50%; transform:translateY(-50%); }
  .lp-method[open] .lp-method-body{ animation:none; }
  .lp-method::details-content{ transition:none; }
  .lp-method-summary::after{ transition:none; }
}
    `}</style>
  );
}
