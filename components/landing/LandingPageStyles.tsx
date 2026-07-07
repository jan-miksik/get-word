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

  position:relative;
  isolation:isolate;
  min-height:100dvh;
  width:100%;
  color:var(--ink);
  background:var(--paper);
  font-family:var(--font-hanken),system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  overflow-x:clip;
}
.lp-display{ font-family:system-ui,-apple-system,"Segoe UI",sans-serif; letter-spacing:-0.01em; }
.lp-mono{ font-family:var(--font-mono-accent),ui-monospace,monospace; }
.italic{ font-style:italic; }
.lp-root ::selection{ background:var(--blue); color:var(--card-2); }
.lp-demo-caption-mark{ font-weight:700; color:var(--ink); }

.lp-site-header{
  background:color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
}
.lp-site-header::after{
  content:""; position:absolute; left:1rem; right:1rem; bottom:0; height:1px;
  background:linear-gradient(90deg, transparent, rgba(33,26,15,.16), transparent);
  opacity:0;
  transition:opacity .18s ease;
}
.lp-site-header:is(:hover,:focus-within)::after{ opacity:1; }
@supports not (backdrop-filter:blur(1px)){
  .lp-site-header{ background:var(--paper); }
}

.lp-btn-primary,.lp-btn-cream,.lp-btn-ghost,.lp-btn-outline{
  display:inline-flex; align-items:center; justify-content:center; gap:.55rem;
  font-weight:600; border-radius:999px; border:2px solid var(--ink);
  transition:transform .18s cubic-bezier(.2,.8,.3,1), background .18s, color .18s;
}
.lp-btn-primary{
  background:var(--blue); color:var(--card-2); border-color:var(--blue-deep);
  padding:.85rem 1.5rem; font-size:1rem;
}
.lp-btn-primary:hover{ background:var(--blue-deep); transform:translateY(-2px); }
.lp-btn-primary:active{ transform:translateY(0); }
.lp-btn-hero{ padding:1.05rem 2.4rem; font-size:1.15rem; }
.lp-btn-cream{
  background:var(--card-2); color:var(--ink); border-color:var(--card-2);
  padding:.85rem 1.6rem; font-size:1.02rem;
}
.lp-btn-cream:hover{ transform:translateY(-2px); }
.lp-btn-cream:active{ transform:translateY(0); }
.lp-btn-outline{
  background:var(--card-2); color:var(--ink); padding:.7rem 1.25rem; font-size:.92rem;
}
.lp-btn-outline:hover{ transform:translateY(-2px); background:#fff; }
.lp-btn-ghost{
  background:transparent; color:var(--ink); padding:.5rem 1.05rem; font-size:.92rem;
  min-height:2.75rem; white-space:nowrap;
}
.lp-btn-ghost:hover{ background:var(--ink); color:var(--card-2); }
.lp-btn-arrow{ width:1.05rem; height:1.05rem; transition:transform .2s ease; }
.group:hover .lp-btn-arrow{ transform:translateX(4px); }
.lp-link-quiet{
  font-size:.95rem; font-weight:600; color:var(--blue-deep);
  text-decoration:underline; text-underline-offset:5px; text-decoration-thickness:1.5px;
  text-decoration-color:rgba(19,79,120,.4); padding:.4rem .2rem; transition:text-decoration-color .2s,color .2s;
}
.lp-link-quiet:hover{ color:var(--rust); text-decoration-color:var(--rust); }

@media (max-width:639px){
  .lp-btn-ghost{
    min-height:2.3rem; padding:.38rem .68rem; font-size:.8rem;
  }
}

.lp-hero-picker{
  padding:0;
}
.lp-hero-picker .onboarding-combobox{
  background:rgba(243,234,213,.78);
  box-shadow:0 16px 34px -28px rgba(33,26,15,.5);
}
.lp-hero-picker .onboarding-combobox:focus-within{
  background:var(--card-2);
}
.lp-custom-list-checkbox{
  appearance:none;
  display:grid;
  place-content:center;
  border:1.5px solid var(--line-strong);
  border-radius:3px;
  background:var(--paper);
  color:var(--blue);
  transition:background .15s, border-color .15s, box-shadow .15s;
}
.lp-custom-list-checkbox::before{
  content:"";
  width:.62rem;
  height:.38rem;
  border:solid currentColor;
  border-width:0 0 2px 2px;
  transform:translateY(-.05rem) rotate(-45deg) scale(0);
  transform-origin:center;
  transition:transform .12s ease;
}
.lp-custom-list-checkbox:checked{
  background:var(--paper);
  border-color:var(--blue-deep);
}
.lp-custom-list-checkbox:checked::before{
  transform:translateY(-.05rem) rotate(-45deg) scale(1);
}
.lp-custom-list-checkbox:focus-visible{
  outline:none;
  box-shadow:0 0 0 3px rgba(30,111,168,.2);
}

.lp-heading-rule::after{
  content:""; display:block; width:44px; height:3px; margin-top:.8rem;
  background:var(--rust); border-radius:2px;
}

.lp-fade-in{ opacity:0; animation:lp-fade 1s ease forwards .15s; }
@keyframes lp-rise{ from{ opacity:0; transform:translateY(24px) } to{ opacity:1; transform:none } }
@keyframes lp-fade{ to{ opacity:1 } }
.lp-reveal{ animation:lp-rise .8s cubic-bezier(.2,.8,.25,1) both; animation-delay:var(--d,0ms); }

.lp-feature{ background:var(--card); padding:1.6rem 1.5rem 1.7rem; transition:background .25s; }
.lp-feature:hover{ background:var(--card-2); }
.lp-feature-icon{
  display:inline-flex; align-items:center; justify-content:center; width:46px; height:46px;
  border-radius:13px; border:2px solid var(--ink); transition:transform .3s cubic-bezier(.2,.8,.3,1);
}
.lp-feature:hover .lp-feature-icon{ transform:translateY(-3px) rotate(-4deg); }
.lp-accent-blue{ background:rgba(30,111,168,.14); color:var(--blue-deep); }
.lp-accent-rust{ background:rgba(191,71,42,.14); color:var(--rust-deep); }

.lp-step{ position:relative; background:var(--card); border:2px solid var(--ink); border-radius:20px; padding:1.5rem 1.4rem 1.6rem; }
.lp-step-n{ font-size:2.4rem; font-weight:700; color:var(--rust); line-height:1; }
.lp-step-arrow{ position:absolute; right:-26px; top:50%; width:26px; height:26px; color:var(--ink-soft); transform:translateY(-50%); z-index:5; }
@media (max-width:639px){ .lp-step-arrow{ display:none } }

.lp-opensource{
  display:flex; flex-direction:column; gap:1.4rem; align-items:flex-start;
  background:var(--card); border:2px solid var(--ink); border-radius:24px;
  padding:clamp(1.5rem,4vw,2.2rem);
}
@media (min-width:720px){ .lp-opensource{ flex-direction:row; align-items:center; justify-content:space-between; } }

.lp-cta{
  position:relative; overflow:hidden; border-radius:30px; border:2px solid var(--ink);
  background:linear-gradient(150deg,#243042,#16202f 60%,#101824);
  padding:clamp(2.2rem,6vw,4rem);
}
.lp-cta-halftone{
  position:absolute; inset:0; opacity:.5; pointer-events:none;
  background-image:radial-gradient(rgba(30,111,168,.5) 1.3px, transparent 1.6px);
  background-size:15px 15px;
  -webkit-mask-image:radial-gradient(80% 120% at 90% 110%, #000, transparent 70%);
  mask-image:radial-gradient(80% 120% at 90% 110%, #000, transparent 70%);
}

.lp-foot-link{ font-size:.9rem; font-weight:500; color:var(--ink-2); text-decoration:none; transition:color .15s; }
.lp-foot-link:hover{ color:var(--rust); }

@media (prefers-reduced-motion:reduce){
  .lp-fade-in,.lp-reveal{
    animation:none !important; opacity:1 !important; transform:none !important;
  }
}
    `}</style>
  );
}
