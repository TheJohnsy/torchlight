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
const FLAME_H = 0.26; // flame height above the tip
const FLAME_W = 0.042;

/**
 * The torch's breathing, in [0.85, 1.15]: multiplies BOTH the flame's height and the
 * actual point-light intensity, so the room dims exactly when the flame shrinks. One
 * noise stream, two uses — the project's core idea applied to light itself.
 */
export function torchFlicker(t: number): number {
  return 0.85 + 0.3 * fbm2(t * 3.1, 3.7, 2);
}

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

  // Whole-flame breathing — the same stream that drives the room light in main.ts.
  const breathe = torchFlicker(t);

  for (let y = y0; y < h; y++) {
    const v = (h - 1 - y) / h;
    for (let x = x0; x < w; x++) {
      const u = (w - 1 - x) / h;

      // --- flame: a turbulent heat field, not a filled shape ----------------------------
      // Intensity = (vertical envelope × lateral envelope) × scrolling turbulence. The
      // turbulence multiplier is what tears the silhouette into rising tongues; the color
      // ramp over intensity gives red rim → orange body → yellow → white-hot core.
      const h01 = (v - BY) / (FLAME_H * breathe);
      if (h01 >= -0.02 && h01 <= 1.15) {
        // Axis sways more toward the tip; the base stays pinned to the torch head.
        const wobble = (fbm2(h01 * 2.6 + 5.2, t * 2.2, 3) - 0.5) * 0.13 * Math.max(0, h01);
        const du = u - (BX + wobble);
        // Width tapers with height but never to zero — the tip is torn off by noise, not
        // pinched by geometry (a geometric pinch is what read as a cartoon droplet).
        const halfw = FLAME_W * (1 - 0.72 * h01) + 0.01;
        const norm = Math.abs(du) / halfw;
        if (norm <= 1.25) {
          // Turbulence scrolls DOWN in texture space → tongues rise in screen space.
          const turb = fbm2(u * 26 + 7.7, v * 26 - t * 7.5, 4);
          const envelope = Math.max(0, 1 - 0.85 * h01) * Math.max(0, 1 - norm * norm);
          const heat = envelope * (0.45 + 1.05 * turb);
          if (heat > 0.14) {
            fb.setPixel(
              x, y,
              Math.min(2.6, 3.4 * Math.pow(heat, 0.9)), // rim ~0.6 deep red, core ~2.6
              2.6 * Math.pow(heat, 1.7), // lags red → orange body, yellow center
              2.2 * Math.pow(heat, 4), // only the core earns blue → warm white
            );
            continue; // flame occludes anything of the handle behind it
          }
        }
      }

      // --- ember: the wick glows where flame meets collar, even between tongues ---------
      const eu = u - BX;
      const ev = v - (BY + 0.01);
      const e2 = eu * eu + ev * ev;
      if (e2 < 0.018 * 0.018) {
        const g = 1 - Math.sqrt(e2) / 0.018;
        fb.setPixel(x, y, 1.6 * g + 0.4, 0.9 * g * g + 0.1, 0.15 * g * g);
        continue;
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
