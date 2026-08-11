'use client';

/**
 * Shared sizing for the scratch field's canvases — the interactive cover and
 * the static layer beneath it both need exactly this and nothing more.
 *
 * The canvas is fixed to the viewport, matching the fixed background layers it
 * sits among, so scratched holes stay put while the page scrolls.
 */

export type ViewportPainter = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number
) => void;

// Height slack so the mobile URL bar collapsing/expanding never exposes an
// unpainted strip (and never triggers a repaint that would wipe the scratches).
const VIEWPORT_HEIGHT_SLACK = 180;

/**
 * Size `canvas` to the viewport and call `paint` whenever that size genuinely
 * changes. Returns a disposer.
 *
 * Two things this guards against, both learned the hard way:
 * - a viewport can measure 0×0 for a frame (hidden tab, a pane still being laid
 *   out) and a zero-sized backing store makes `createPattern` throw, taking the
 *   page down with it;
 * - mobile browsers fire `resize` constantly as the URL bar slides, and every
 *   repaint wipes the scratches — so only a real layout change repaints.
 */
export function attachViewportCanvas(
  canvas: HTMLCanvasElement,
  paint: ViewportPainter
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let displayW = 0;
  let displayH = 0;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight + VIEWPORT_HEIGHT_SLACK;
    if (w <= 0 || h <= 0) return;
    // Growing a little, at the same width, is the URL bar sliding — absorb it
    // with the slack rather than repainting (a repaint wipes every scratch).
    // Anything else (a rotation, a real window resize) is a genuine layout
    // change and must resize both ways, or the canvas stays stuck at whatever
    // the largest viewport of the session was.
    const urlBarWobble = w === displayW && h <= displayH && h > displayH - VIEWPORT_HEIGHT_SLACK * 2;
    if (urlBarWobble) return;
    if (w === displayW && h === displayH) return;
    displayW = w;
    displayH = h;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, displayW, displayH);
    paint(ctx, displayW, displayH, dpr);
  };

  resize();
  // A `resize` event is not guaranteed when a 0×0 viewport first gains real
  // dimensions, so observe the document element too.
  const observer = new ResizeObserver(resize);
  observer.observe(document.documentElement);
  window.addEventListener('resize', resize);

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
  };
}
