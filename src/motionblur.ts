import { LinearFramebuffer } from "./framebuffer";

/**
 * Cheap radial "speed" blur (roadmap E1.5/E3, the dash skill): samples pull inward toward
 * screen center, strongest at the edges — exactly what a first-person forward surge looks
 * like, since the camera (not any one object) is what's moving. `amount` in [0,1] fades the
 * effect in/out (dash.ts's blurAmount()); 0 is a no-op so callers can invoke this every frame.
 */
const TAPS = 4;
const MAX_PULL = 0.12; // fraction of the way toward center at full strength

export function applyRadialBlur(
  fb: LinearFramebuffer,
  scratch: LinearFramebuffer,
  amount: number,
): void {
  if (amount <= 0) return;
  const w = fb.width;
  const h = fb.height;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const src = fb.data;
  const dst = scratch.data;
  const pull = MAX_PULL * Math.max(0, Math.min(1, amount));

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < TAPS; i++) {
        const t = 1 - (i / (TAPS - 1)) * pull;
        const sx = Math.min(w - 1, Math.max(0, Math.round(cx + dx * t)));
        const sy = Math.min(h - 1, Math.max(0, Math.round(cy + dy * t)));
        const si = (sy * w + sx) * 3;
        r += src[si];
        g += src[si + 1];
        b += src[si + 2];
      }
      const j = (y * w + x) * 3;
      dst[j] = r / TAPS;
      dst[j + 1] = g / TAPS;
      dst[j + 2] = b / TAPS;
    }
  }
  fb.data.set(dst);
}
