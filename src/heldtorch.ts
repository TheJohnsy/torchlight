import { LinearFramebuffer } from "./framebuffer";
import { fbm2 } from "./noise";

/**
 * First-person held torch: a screen-space viewmodel drawn AFTER the scene, so it sits in
 * front of everything — no depth test, exactly like classic raycaster weapon sprites.
 * Fully procedural: a wood handle with a leather grip and metal collar (distance-to-segment
 * shapes), topped by an FBm-flickered flame whose core is emissive (>1 linear) so the bloom
 * pass wraps it in a halo. All coordinates are in HEIGHT units measured from the
 * bottom-right corner, so the torch keeps its size and place at any resolution (SSAA).
 */

// Handle segment: base near the bottom edge, tip tilted toward screen center.
const AX = 0.28, AY = -0.03; // (u = from right edge, v = up from bottom), height units
const BX = 0.44, BY = 0.38;
const HANDLE_HALF = 0.026;
const FLAME_H = 0.2; // flame height above the tip
const FLAME_W = 0.05;

/** Distance from point to the handle segment + the segment parameter t01 of the foot. */
function segDist(u: number, v: number): { d: number; t01: number } {
  const dx = BX - AX;
  const dy = BY - AY;
  const t01 = Math.max(0, Math.min(1, ((u - AX) * dx + (v - AY) * dy) / (dx * dx + dy * dy)));
  const px = AX + dx * t01;
  const py = AY + dy * t01;
  return { d: Math.hypot(u - px, v - py), t01 };
}

export function renderHeldTorch(fb: LinearFramebuffer, t: number): void {
  const w = fb.width;
  const h = fb.height;
  // Bounding region of everything we might touch, clipped to the frame.
  const x0 = Math.max(0, Math.floor(w - 1 - 0.6 * h));
  const y0 = Math.max(0, Math.floor(h - 1 - 0.66 * h));

  // Whole-flame breathing: length pumps a little every few hundred ms.
  const breathe = 0.85 + 0.3 * fbm2(t * 3.1, 3.7, 2);

  for (let y = y0; y < h; y++) {
    const v = (h - 1 - y) / h;
    for (let x = x0; x < w; x++) {
      const u = (w - 1 - x) / h;

      // --- flame: teardrop above the tip, axis wobbling with height and time ------------
      const h01 = (v - BY) / (FLAME_H * breathe);
      if (h01 >= 0 && h01 <= 1) {
        // The wobble grows toward the flame tip — the base stays pinned to the torch.
        const wobble = (fbm2(h01 * 3 + 5.2, t * 2.6, 3) - 0.5) * 0.11 * h01;
        const du = u - (BX + wobble);
        const halfw = FLAME_W * (1 - Math.pow(h01, 1.2)) + 0.006;
        if (Math.abs(du) <= halfw) {
          // q: 1 at the base core, 0 at the tip/edges; drives the heat ramp.
          const lat = 1 - (du / halfw) * (du / halfw);
          const q = Math.max(0, (1 - h01) * lat);
          if (q > 0.08) {
            fb.setPixel(
              x, y,
              0.35 + 2.2 * q, // white-hot core → deep red edge; r>g>b everywhere
              0.08 + 1.7 * q * q,
              0.02 + 0.55 * q * q * q * q,
            );
            continue; // flame occludes anything of the handle behind it
          }
        }
      }

      // --- handle ------------------------------------------------------------------------
      const { d, t01 } = segDist(u, v);
      if (d > HANDLE_HALF) continue;
      // Rounded shaft shading: full at the axis, falling toward the silhouette edge.
      const round = Math.sqrt(Math.max(0, 1 - (d / HANDLE_HALF) * (d / HANDLE_HALF)));
      const shade = 0.35 + 0.65 * round;
      if (t01 > 0.9) {
        // Iron collar holding the wick.
        fb.setPixel(x, y, 0.3 * shade, 0.3 * shade, 0.34 * shade);
      } else if (t01 > 0.32 && t01 < 0.62) {
        // Leather grip wrap, ribbed by bands along the shaft.
        const band = 0.8 + 0.2 * Math.sin(t01 * 90);
        fb.setPixel(x, y, 0.16 * shade * band, 0.09 * shade * band, 0.05 * shade * band);
      } else {
        // Bare wood with grain running along the handle.
        const grain = 0.75 + 0.5 * fbm2(t01 * 9 + 2.3, d * 30, 3);
        fb.setPixel(x, y, 0.34 * shade * grain, 0.2 * shade * grain, 0.1 * shade * grain);
      }
    }
  }
}
