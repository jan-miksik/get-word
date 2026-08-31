export function LandingDemoStyles() {
  return (
    <style>{`
.lp-demo-card{
  --lp-demo-game-surface:var(--paper);
  --lp-demo-game-surface-hover:var(--paper-hi);
  --lp-demo-game-ink:var(--ink);
  --lp-demo-game-ink-soft:var(--ink-soft);
  --lp-demo-game-accent:var(--sea);
  --lp-demo-game-correct:var(--green-alt);
  --lp-demo-game-wrong:var(--brick);
  --lp-demo-match-1:56 189 248;
  --lp-demo-match-2:167 139 250;
  --lp-demo-match-3:251 191 36;
  display:flex; flex-direction:column; gap:1.15rem; text-align:center;
  background:var(--lp-demo-game-surface); border:2px solid var(--lp-demo-game-ink); border-radius:22px;
  color:var(--lp-demo-game-ink);
  padding:1.55rem 1.45rem 1.35rem;
  box-shadow:0 22px 44px -24px rgba(33,26,15,.55);
  overflow:visible;
}
.lp-demo-card .lp-display{ font-family:var(--font-hanken),system-ui,sans-serif; letter-spacing:0; }
.lp-demo-pair{ font-size:.74rem; letter-spacing:.12em; color:#8a7a55; white-space:nowrap; }
.lp-demo-dots{ display:inline-flex; gap:5px; }
.lp-demo-dot{
  width:8px; height:8px; border-radius:999px;
  border:1.5px solid #8a7a55; background:transparent;
  transition:background .25s, border-color .25s, transform .25s;
}
.lp-demo-dot.is-on{ background:var(--sea); border-color:var(--sea-700); }
.lp-demo-dot.is-current{ transform:scale(1.2); border-color:var(--sea-700); }
.lp-demo-stage{
  display:grid; grid-template-rows:minmax(0,1fr) auto;
  gap:1rem;
  min-height:390px;
  transform-origin:center center;
}
.lp-demo-words{
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1.65rem;
  min-height:0;
}
.lp-demo-front{
  font-size:clamp(2.25rem,5.1vw,2.75rem); font-weight:500; color:var(--ink-850); line-height:1.2;
  overflow-wrap:anywhere;
}
.lp-demo-answer-row{
  display:flex; align-items:center; justify-content:center;
  width:100%;
}
.lp-demo-answer{
  position:relative; display:flex; align-items:center; justify-content:center;
  width:100%; min-height:4.25rem; padding:.4rem .75rem; border-radius:.75rem;
}
.lp-demo-back-word{
  font-size:clamp(2.25rem,5.1vw,2.75rem); font-weight:500; line-height:1.2;
  color:var(--ink-850); overflow-wrap:anywhere;
}
.lp-demo-action-zone{
  position:relative;
  width:100%;
  max-width:560px;
  margin-inline:auto;
  padding-top:4.45rem;
}
.lp-demo-action-zone--no-audio{ padding-top:0; }
.lp-demo-audio-slot{
  position:absolute; inset-inline:0; top:-.4rem;
  display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;
  pointer-events:none;
}
.lp-demo-audio{
  grid-column:3; justify-self:end; margin-right:.2rem;
  width:64px; height:64px; min-width:64px; border-radius:999px;
  border:2px solid var(--ink); background:var(--paper); color:var(--ink);
  display:inline-flex; align-items:center; justify-content:center;
  cursor:pointer;
  pointer-events:auto;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
  transition:background .15s, color .15s, border-color .15s, transform .15s;
}
.lp-demo-audio:disabled{ opacity:.38; cursor:default; }
.lp-demo-audio:not(:disabled):active{ transform:scale(.96); }
.lp-demo-actions{
  position:relative;
  display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px;
  width:100%; margin-inline:auto;
}
.lp-demo-btn{
  width:100%;
}
.lp-demo-btn:disabled{ cursor:default; opacity:.7; }
.lp-demo-btn-hint{
  opacity:.35 !important;
  white-space:normal !important;
  letter-spacing:.06em;
}
.lp-demo-btn-custom-label{
  line-height:.8;
}
.lp-demo-match{
  grid-row:1 / -1;
  position:relative;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:1.1rem; min-height:0;
  /* Standing room for the continue bar, which is positioned against the border
     box and so lands on whatever the flow put at the bottom — on a phone that
     was the "all matched" line, half-hidden behind it. Reserved from the start
     rather than added on completion: the bar and the line appear in the same
     instant, and paying for the space only then would shove the grid upwards
     exactly as the learner looks at it. */
  padding-bottom:3.5rem;
}
.lp-demo-match-badge{
  display:inline-flex; align-items:center; gap:.4rem;
  border:1.5px solid var(--lp-demo-game-ink); border-radius:999px; padding:.24rem .75rem;
  background:transparent; font-size:.72rem; font-weight:700; letter-spacing:.08em;
  color:var(--lp-demo-game-ink); text-transform:uppercase;
}
.lp-demo-match-grid{
  display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 14px;
  width:100%; max-width:26rem;
}
.lp-demo-match-col{ display:flex; flex-direction:column; gap:10px; min-width:0; }
.lp-demo-match-btn{
  min-height:3.4rem; padding:.55rem .7rem; border-radius:14px;
  border:2px solid var(--lp-demo-game-ink); background:var(--lp-demo-game-surface); color:var(--lp-demo-game-ink);
  font-size:1.08rem; font-weight:600; line-height:1.15; overflow-wrap:anywhere;
  cursor:pointer;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
  transition:background .15s, border-color .15s, color .15s, transform .15s;
}
.lp-demo-match-btn--selected{ background:var(--lp-demo-game-accent); border-color:var(--lp-demo-game-ink); color:#fff; }
.lp-demo-match-btn--wrong{ background:var(--lp-demo-game-wrong); border-color:var(--lp-demo-game-ink); color:#fff; }
.lp-demo-match-btn--matched{ cursor:default; opacity:.92; }
.lp-demo-match-btn--matched.lp-demo-match-btn--pair0{ background:rgb(var(--lp-demo-match-1) / .18); border-color:var(--lp-demo-game-ink); }
.lp-demo-match-btn--matched.lp-demo-match-btn--pair1{ background:rgb(var(--lp-demo-match-2) / .18); border-color:var(--lp-demo-game-ink); }
.lp-demo-match-btn--matched.lp-demo-match-btn--pair2{ background:rgb(var(--lp-demo-match-3) / .22); border-color:var(--lp-demo-game-ink); }
.lp-demo-match-feedback{
  min-height:44px; display:flex; align-items:center; justify-content:center;
  width:100%;
  font-size:.92rem; font-weight:800; color:var(--lp-demo-game-correct); opacity:0;
  transition:opacity .18s ease;
}
.lp-demo-match-feedback.is-on{ opacity:1; }
/* Mirrors the app's finished overlay (features/learning/components/MiniGameCard.tsx): a
   transparent, full-area tap target that keeps the matched result visible and
   only paints a slide-up continue bar pinned to the bottom edge. */
.lp-demo-match-continue{
  position:absolute; inset:0; z-index:10;
  display:flex; flex-direction:column; align-items:stretch; justify-content:flex-end;
  border:0; padding:0; background:transparent;
  cursor:pointer; border-radius:18px;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}
.lp-demo-match-continue-bar{
  display:flex; align-items:center; justify-content:center;
  padding:.85rem 1rem; border-radius:14px;
  background:var(--lp-demo-game-ink); color:var(--lp-demo-game-surface);
  border:2px solid var(--lp-demo-game-ink);
  box-shadow:0 -6px 18px rgba(0,0,0,.18);
  font-size:.85rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
  opacity:0; transform:translateY(6px);
  animation:lp-demo-match-continue-in .3s cubic-bezier(.34,1.56,.64,1) forwards;
}
@keyframes lp-demo-match-continue-in{
  from { opacity:0; transform:translateY(6px); }
  to { opacity:1; transform:translateY(0); }
}
.lp-demo-done{
  grid-row:1 / -1;
  min-height:390px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.75rem; color:var(--lp-demo-game-ink);
}
.lp-demo-done-mark{
  display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px;
  border-radius:999px; border:2px solid var(--sea-700); background:var(--lp-demo-game-accent); color:var(--lp-demo-game-surface);
  font-size:1.55rem; font-weight:900;
}
.lp-demo-done-title{ margin:0; font-size:clamp(1.45rem,3.2vw,1.85rem); font-weight:800; line-height:1.05; }
.lp-demo-continue{
  display:inline-flex; align-items:center; justify-content:center;
  min-height:3rem; border:2px solid var(--ink); border-radius:999px;
  background:var(--sea); color:var(--paper); padding:.65rem 1.15rem;
  font-size:.95rem; font-weight:900; text-decoration:none;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
  transition:transform .15s, background .15s;
}
.lp-demo-replay{
  border:0; background:transparent; color:var(--sea-700); font-weight:800;
  text-decoration:underline; text-underline-offset:4px; cursor:pointer; padding:.2rem .4rem;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}
.lp-demo-custom-wrap{ position:relative; display:flex; min-width:0; }
.lp-demo-custom-wrap > .lp-demo-btn{ width:100%; }
.lp-demo-custom-menu{
  position:absolute; right:0; bottom:calc(100% + .55rem); z-index:20;
  width:min(15rem, calc(100vw - 2rem)); max-height:min(76dvh,27rem);
  display:flex; flex-direction:column; overflow:hidden;
  border:2px solid var(--ink); border-radius:18px; background:var(--paper); color:var(--ink);
  box-shadow:0 18px 42px -24px rgba(33,26,15,.7);
}
.lp-demo-custom-menu-head{
  flex:none;
  padding:.62rem .75rem; border-bottom:1px solid rgba(42,34,24,.22);
  font-size:.72rem; font-weight:900; letter-spacing:.18em; text-transform:uppercase; color:rgba(42,34,24,.68);
}
.lp-demo-custom-menu-scroll{
  display:flex; flex-direction:column; overflow-y:auto; min-height:0;
}
.lp-demo-custom-option{
  border:0; border-bottom:1px solid rgba(42,34,24,.08); background:var(--paper); color:var(--ink);
  padding:.56rem .75rem; text-align:left; font-size:.9rem; line-height:1.15; cursor:pointer;
  flex:none;
  touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;
}
.lp-demo-custom-option:nth-child(odd){ background:rgba(42,34,24,.045); }
.lp-demo-custom-option.is-current{
  background:rgba(42,34,24,.13); font-weight:800;
  box-shadow:inset 4px 0 0 var(--ink);
}
.lp-demo-custom-option--done{ color:var(--green-bright); font-weight:700; background:rgba(18,117,15,.08); }
/* Touch browsers can synthesize hover during taps, which makes the matching
   words flash between idle/hover/selected colors. Keep those hover lifts for
   precise pointers only. */
@media (hover:hover) and (pointer:fine){
  .lp-demo-audio:not(:disabled):hover{
    background:var(--sea); border-color:var(--sea); color:var(--paper); transform:translateY(-1px);
  }
  .lp-demo-match-btn--idle:not(:disabled):hover{
    transform:translateY(-1px);
    background:var(--lp-demo-game-surface-hover);
    border-color:var(--lp-demo-game-accent);
  }
  .lp-demo-match-continue:hover .lp-demo-match-continue-bar{
    background:var(--lp-demo-game-accent); border-color:var(--lp-demo-game-accent);
  }
  .lp-demo-continue:hover{
    background:#175b8a; transform:translateY(-1px);
  }
  .lp-demo-custom-option:hover{
    background:rgba(30,111,168,.14);
  }
}
@media (max-width:480px){
  .lp-demo-card{
    margin-inline:-1rem;
    border-radius:0; border-left:0; border-right:0;
    padding-inline:.7rem;
  }
  .lp-demo-stage{ min-height:360px; }
  .lp-demo-action-zone{ max-width:none; padding-top:4rem; }
  .lp-demo-audio-slot,
  .lp-demo-actions{ gap:6px; }
  .lp-demo-audio{ width:56px; height:56px; min-width:56px; }
  .lp-demo-btn{ min-height:68px; padding-inline:5px; }
  .lp-demo-btn .srs-btn-label{ font-size:clamp(.72rem, 3.7vw, .98rem); letter-spacing:0; }
  .lp-demo-btn .lp-demo-btn-hint{ font-size:clamp(.55rem, 2.6vw, .68rem); }
  .lp-demo-match-grid{ gap:8px 10px; }
  .lp-demo-match-feedback{ min-height:40px; }
  .lp-demo-custom-menu{ right:-.2rem; }
}
    `}</style>
  );
}
