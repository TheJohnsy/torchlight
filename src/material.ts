import { fbm2, hash2 } from "./noise";
import type { Color, Material, Normal } from "./types";

/** Central-difference step: about one texel at the 256² bake resolution. */
const EPS = 1 / 256;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * The gradient→normal trick (spec §1): sample the height field at ±eps in u and v, and tilt
 * the normal *against* the slope. Nothing is stored — normals are derived from the same
 * field that colors the surface. `strength` converts height units into geometric steepness
 * (tuned by eye per material). Returned in tangent space: +x right, +y up (=+v), +z out.
 */
export function heightToNormal(
  height: (u: number, v: number) => number,
  u: number,
  v: number,
  strength: number,
): Normal {
  const dhdu = (height(u + EPS, v) - height(u - EPS, v)) / (2 * EPS);
  const dhdv = (height(u, v + EPS) - height(u, v - EPS)) / (2 * EPS);
  const nx = -dhdu * strength;
  const ny = -dhdv * strength;
  const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
  return { x: nx * inv, y: ny * inv, z: inv };
}

/**
 * Rough dungeon stone. Height = 5-octave FBm that tiles across the [0,1) tile (integer
 * period), so adjacent wall tiles join seamlessly. Albedo ramps the height (crevices dark,
 * ridges pale) with a low-frequency mottle picking out mossy patches.
 */
export class StoneMaterial implements Material {
  private readonly scale = 6;
  private readonly bump = 0.28;

  readonly height = (u: number, v: number): number =>
    fbm2(u * this.scale, v * this.scale, 5, { period: this.scale });

  albedo(u: number, v: number): Color {
    const h = this.height(u, v);
    const mottle = fbm2(u * 3 + 13.7, v * 3 + 71.3, 3, { period: 3 });
    let r = mix(0.13, 0.55, h);
    let g = mix(0.125, 0.53, h);
    let b = mix(0.12, 0.5, h);
    // Moss creeps into low-lying spots, gated by the mottle so it comes in patches.
    const moss = clamp01((0.45 - h) * 2) * clamp01((mottle - 0.55) * 3) * 0.5;
    r = mix(r, 0.1, moss);
    g = mix(g, 0.22, moss);
    b = mix(b, 0.08, moss);
    return { r, g, b };
  }

  normal(u: number, v: number): Normal {
    return heightToNormal(this.height, u, v, this.bump);
  }
}
