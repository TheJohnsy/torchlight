import type { Color } from "./types";

/** The torch: a single warm point light carried at the player's eye. */
export interface Torch {
  intensity: number;
  /** Flame tint, linear RGB. */
  r: number;
  g: number;
  b: number;
  /** Distance attenuation 1/(1 + a·d + b·d²) (spec §5). */
  attLinear: number;
  attQuad: number;
  ambient: number;
  shininess: number;
}

/** Constants tuned by eye against the baked stone/brick in the harness. */
export function defaultTorch(): Torch {
  return {
    intensity: 1.7,
    r: 1.0,
    g: 0.85,
    b: 0.62,
    attLinear: 0.35,
    attQuad: 0.12,
    ambient: 0.07,
    shininess: 16,
  };
}

/**
 * Phong = ambient + diffuse + specular, attenuated by distance.
 *
 * Because the torch sits AT the eye, the view direction equals the light direction, and
 * Phong's reflection term collapses algebraically: R·V = 2(N·L)² − 1. That saves a
 * normalize per pixel and is exactly why the highlight tracks the player — proof the
 * normals are real (spec §1).
 *
 * Writes into `out` (linear space); the hot loop must not allocate.
 */
export function shadeTorch(
  out: Color,
  aR: number, aG: number, aB: number, // albedo
  nx: number, ny: number, nz: number, // world-space unit normal
  fx: number, fy: number, fz: number, // fragment world position
  ex: number, ey: number, ez: number, // eye == light position
  torch: Torch,
): void {
  let lx = ex - fx;
  let ly = ey - fy;
  let lz = ez - fz;
  const d = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1e-6;
  lx /= d;
  ly /= d;
  lz /= d;
  const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
  const att = torch.intensity / (1 + torch.attLinear * d + torch.attQuad * d * d);
  const rdotv = 2 * ndotl * ndotl - 1; // Phong R·V with V == L (see note above)
  const spec = rdotv > 0 ? Math.pow(rdotv, torch.shininess) * 0.6 : 0;
  const lr = torch.r * att;
  const lg = torch.g * att;
  const lb = torch.b * att;
  out.r = aR * (torch.ambient + ndotl * lr) + spec * lr;
  out.g = aG * (torch.ambient + ndotl * lg) + spec * lg;
  out.b = aB * (torch.ambient + ndotl * lb) + spec * lb;
}
