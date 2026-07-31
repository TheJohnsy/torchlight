import { LinearFramebuffer } from "./framebuffer";

/**
 * Torch bloom (stretch): bright-pass → separable Gaussian blur → additive composite.
 * Runs entirely in LINEAR light before present(), so glow adds like real light instead of
 * washing out like screen-space paint.
 */

export interface BloomParams {
  /** Linear luminance above this leaks into the halo. */
  threshold: number;
  /** How much of the blurred glow is added back. */
  strength: number;
}

/** 9-tap Gaussian (sigma ≈ 1.8), normalized so a uniform field passes through unchanged. */
const KERNEL = (() => {
  const sigma = 1.8;
  const taps = new Float32Array(9);
  let sum = 0;
  for (let i = -4; i <= 4; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    taps[i + 4] = w;
    sum += w;
  }
  for (let i = 0; i < 9; i++) taps[i] /= sum;
  return taps;
})();

/** dst = max(src - threshold, 0) per channel: only the overbright part of the frame glows. */
export function brightPass(
  src: LinearFramebuffer,
  dst: LinearFramebuffer,
  threshold: number,
): void {
  const s = src.data;
  const d = dst.data;
  for (let i = 0; i < s.length; i++) {
    const v = s[i] - threshold;
    d[i] = v > 0 ? v : 0;
  }
}

/**
 * Separable Gaussian: horizontal pass a→b, vertical pass b→a (result lands back in `a`).
 * Edges clamp (taps that fall off the frame reuse the border pixel) so brightness is
 * preserved instead of darkening at the frame border.
 */
export function blurPass(a: LinearFramebuffer, b: LinearFramebuffer): void {
  const w = a.width;
  const h = a.height;
  convolve(a.data, b.data, w, h, true);
  convolve(b.data, a.data, w, h, false);
}

function convolve(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  horizontal: boolean,
): void {
  const limit = (horizontal ? w : h) - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, bl = 0;
      for (let k = -4; k <= 4; k++) {
        // clamp-to-edge addressing along the convolution axis
        let sx = x, sy = y;
        if (horizontal) sx = Math.min(limit, Math.max(0, x + k));
        else sy = Math.min(limit, Math.max(0, y + k));
        const i = (sy * w + sx) * 3;
        const wt = KERNEL[k + 4];
        r += src[i] * wt;
        g += src[i + 1] * wt;
        bl += src[i + 2] * wt;
      }
      const j = (y * w + x) * 3;
      dst[j] = r;
      dst[j + 1] = g;
      dst[j + 2] = bl;
    }
  }
}

/** Full effect in place on `fb`; the two scratch buffers must match its dimensions. */
export function applyBloom(
  fb: LinearFramebuffer,
  scratchA: LinearFramebuffer,
  scratchB: LinearFramebuffer,
  params: BloomParams,
): void {
  brightPass(fb, scratchA, params.threshold);
  blurPass(scratchA, scratchB); // blurred glow ends up in scratchA
  const d = fb.data;
  const glow = scratchA.data;
  const k = params.strength;
  for (let i = 0; i < d.length; i++) d[i] += glow[i] * k;
}
