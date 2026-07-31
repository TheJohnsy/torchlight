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
