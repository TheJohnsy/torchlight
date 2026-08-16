/**
 * Procedural noise library: hash → value noise → Perlin (gradient) noise → FBm.
 * Everything here is deterministic and allocation-free — it runs per texel.
 */

/**
 * 2D integer hash → [0,1). Multiply-xorshift avalanche in 32-bit space (Math.imul keeps JS
 * from drifting into floats). Same inputs always give the same output: our "random" lattice.
 */
export function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Quintic fade 6t^5-15t^4+10t^3: zero 1st AND 2nd derivative at 0/1, so cell seams vanish. */
export function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wrap a lattice index to [0,period) so the noise tiles; period 0 disables wrapping. */
function wrapIndex(i: number, period: number): number {
  return period > 0 ? ((i % period) + period) % period : i;
}

/**
 * Value noise: random values at integer lattice points, smoothly interpolated between.
 * Range [0,1). Blobby compared to Perlin, but cheap — and the stepping stone to it.
 */
export function valueNoise2(x: number, y: number, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const x0 = wrapIndex(ix, period);
  const x1 = wrapIndex(ix + 1, period);
  const y0 = wrapIndex(iy, period);
  const y1 = wrapIndex(iy + 1, period);
  const u = fade(fx);
  const v = fade(fy);
  return lerp(
    lerp(hash2(x0, y0), hash2(x1, y0), u),
    lerp(hash2(x0, y1), hash2(x1, y1), u),
    v,
  );
}

/** Dot of a hash-derived unit gradient at lattice corner (ix,iy) with offset (dx,dy). */
function gradDot(ix: number, iy: number, dx: number, dy: number): number {
  const angle = hash2(ix, iy) * Math.PI * 2;
  return Math.cos(angle) * dx + Math.sin(angle) * dy;
}

/**
 * Perlin (gradient) noise: instead of random *values* at lattice points, random *slopes*.
 * The surface passes through 0 at every lattice point, which kills value noise's blobby
 * grid pattern. Scaled by sqrt(2) so the practical range is ≈[-1,1]. `period` (integer)
 * makes it tile.
 */
export function perlin2(x: number, y: number, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Lattice ids may wrap for tiling, but the geometric offsets must not.
  const x0 = wrapIndex(ix, period);
  const x1 = wrapIndex(ix + 1, period);
  const y0 = wrapIndex(iy, period);
  const y1 = wrapIndex(iy + 1, period);
  const u = fade(fx);
  const v = fade(fy);
  const n = lerp(
    lerp(gradDot(x0, y0, fx, fy), gradDot(x1, y0, fx - 1, fy), u),
    lerp(gradDot(x0, y1, fx, fy - 1), gradDot(x1, y1, fx - 1, fy - 1), u),
    v,
  );
  return n * Math.SQRT2;
}

/**
 * Fractal Brownian motion: octaves of Perlin, each double the frequency and half the
 * amplitude of the last. Low octaves give the large shapes, high octaves the fine grain —
 * this is what makes the stone read as *stone*. Normalized to [0,1] for use as a height
 * field. Lacunarity is fixed at 2 so an integer `period` keeps tiling at every octave.
 */
export function fbm2(
  x: number,
  y: number,
  octaves = 5,
  opts?: { gain?: number; period?: number },
): number {
  const gain = opts?.gain ?? 0.5;
  let period = opts?.period ?? 0;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin2(fx, fy, period);
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
    if (period) period *= 2;
  }
  const n = 0.5 + (0.5 * sum) / norm; // [-1,1] → [0,1]
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Worley (cellular) noise, F1: the distance from (x,y) to the nearest of one randomly
 * jittered "feature point" per lattice cell, searched across the 3×3 neighborhood so a
 * point near a cell edge still finds points from the adjacent cells. Where Perlin/value
 * noise are smooth height fields, Worley gives cell-like blobs and veins (roadmap E4:
 * marble veining, cracked-stone pits) — a different noise family, same hash primitive.
 * Range is approximately [0, 1.2]; callers clamp/scale as their material needs.
 */
export function worley2(x: number, y: number, period = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let minD2 = Infinity;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      // Jitter is hashed from the WRAPPED cell id (so tiling repeats), but the feature
      // point's position stays in real (unwrapped) coordinates for correct distances.
      const hx = wrapIndex(cx, period);
      const hy = wrapIndex(cy, period);
      const fx = cx + hash2(hx, hy);
      const fy = cy + hash2(hx + 101, hy + 57); // second hash channel, decorrelated from the first
      const dx = x - fx;
      const dy = y - fy;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
    }
  }
  return Math.sqrt(minD2);
}
