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

/**
 * Running-bond brickwork. The brick/mortar step function IS the height field, so the
 * bevelled edges fall out of the same gradient→normal machinery as the stone grain —
 * that's what makes the torch catch on every brick edge.
 */
export class BrickMaterial implements Material {
  private readonly rows = 4;
  private readonly cols = 2;
  private readonly mortarWidth = 0.07; // in brick-local coords
  private readonly bevelWidth = 0.12;
  private readonly bump = 0.33;

  /** Brick-local coords + brick id; odd rows shift half a brick (running bond). */
  private local(u: number, v: number): { row: number; col: number; lu: number; lv: number } {
    const vv = v * this.rows;
    const row = Math.floor(vv);
    const uu = u * this.cols + (row & 1 ? 0.5 : 0);
    const col = Math.floor(uu);
    return { row, col, lu: uu - col, lv: vv - row };
  }

  /** Stable brick identity: wrap col so the brick spanning the u=0/1 seam is ONE brick. */
  private brickId(col: number, row: number): number {
    return ((col % this.cols) + this.cols) % this.cols + row * 16;
  }

  /** 1 on the brick face, 0 deep in the mortar groove, smooth bevel between. */
  private faceMask(lu: number, lv: number): number {
    const m = this.mortarWidth;
    const b = this.bevelWidth;
    const du = Math.min(lu, 1 - lu);
    const dv = Math.min(lv, 1 - lv);
    return smoothstep(m, m + b, du) * smoothstep(m, m + b, dv);
  }

  readonly height = (u: number, v: number): number => {
    const { row, col, lu, lv } = this.local(u, v);
    const face = this.faceMask(lu, lv);
    // Per-brick offset decorrelates the grain; period 8 keeps it tiling across the seam.
    const off = hash2(this.brickId(col, row), row) * 64;
    const grain = fbm2(u * 8 + off, v * 8 + off, 4, { period: 8 });
    const mortarH = 0.15 + 0.1 * grain;
    const brickH = 0.7 + 0.3 * grain;
    return mix(mortarH, brickH, face);
  };

  albedo(u: number, v: number): Color {
    const { row, col, lu, lv } = this.local(u, v);
    const face = this.faceMask(lu, lv);
    const id = this.brickId(col, row);
    const tint = hash2(id * 7 + 1, row * 3 + 5);
    const off = hash2(id, row) * 64;
    const grain = fbm2(u * 8 + off, v * 8 + off, 4, { period: 8 });
    const rough = mix(0.85, 1.1, grain);
    // Fired clay, tinted per brick so the wall doesn't look stamped.
    const br = mix(0.36, 0.58, tint) * rough;
    const bg = mix(0.14, 0.24, tint) * rough;
    const bb = mix(0.1, 0.16, tint) * rough;
    // Sandy mortar.
    const mr = mix(0.3, 0.42, grain);
    const mg = mix(0.28, 0.4, grain);
    const mb = mix(0.25, 0.36, grain);
    return {
      r: clamp01(mix(mr, br, face)),
      g: clamp01(mix(mg, bg, face)),
      b: clamp01(mix(mb, bb, face)),
    };
  }

  normal(u: number, v: number): Normal {
    return heightToNormal(this.height, u, v, this.bump);
  }
}
