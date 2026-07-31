import { LinearFramebuffer } from "./framebuffer";
import { Player } from "./player";
import { PLANE_HALF } from "./raycaster";
import type { Color } from "./types";

/**
 * Billboard sprite pass (stretch): one camera-facing quad, occluded per COLUMN by the wall
 * depth buffer the raycaster filled this frame. The sprite is drawn emissive — it's the
 * glowing key, the one thing in the dungeon that is its own light source.
 */

/** Default sprite placement: floats a little above the floor, world units tall/wide. */
const DEFAULT_SIZE = 0.45;
const DEFAULT_Z_CENTER = 0.35;

/** World-space footprint of a billboard: square of `size` units centered at `zCenter`. */
export interface SpriteOptions {
  size: number;
  zCenter: number;
}
/** Eye height — must match the raycaster's EYE_Z so sprites sit on the same horizon. */
const EYE_Z = 0.5;

export interface SpriteProjection {
  /** Screen column of the sprite's center. */
  screenX: number;
  /** Perpendicular (camera-forward) depth — comparable with Raycaster.depth. */
  depth: number;
  /** Pixels one world unit spans at this depth (the perspective divide). */
  size: number;
}

/**
 * World → camera space via the inverse of the [plane | dir] basis, then the same
 * perspective divide the walls use. Returns null when the sprite is at/behind the camera.
 */
export function projectSprite(
  player: Player,
  sx: number,
  sy: number,
  w: number,
  h: number,
): SpriteProjection | null {
  const dirX = player.dirX;
  const dirY = player.dirY;
  const planeX = -dirY * PLANE_HALF;
  const planeY = dirX * PLANE_HALF;
  const relX = sx - player.x;
  const relY = sy - player.y;
  // Inverse of the 2x2 column matrix [planeX dirX; planeY dirY].
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const camX = invDet * (dirY * relX - dirX * relY); // lateral, in plane units
  const camY = invDet * (-planeY * relX + planeX * relY); // forward = depth
  if (camY <= 1e-4) return null;
  return {
    screenX: (w / 2) * (1 + camX / camY),
    depth: camY,
    size: h / camY,
  };
}

/** Returns alpha in [0,1] and writes linear RGB into `out`. u,v in [0,1], v up. */
export type SpriteTexel = (u: number, v: number, out: Color) => number;

// Scratch color reused per pixel — sprite pass must not allocate either.
const texelColor: Color = { r: 0, g: 0, b: 0 };

export function renderSprite(
  fb: LinearFramebuffer,
  depth: Float32Array,
  player: Player,
  sx: number,
  sy: number,
  texel: SpriteTexel,
  opts: SpriteOptions = { size: DEFAULT_SIZE, zCenter: DEFAULT_Z_CENTER },
): void {
  const w = fb.width;
  const h = fb.height;
  const p = projectSprite(player, sx, sy, w, h);
  if (!p) return;

  const half = (p.size * opts.size) / 2;
  const x0 = Math.max(0, Math.ceil(p.screenX - half));
  const x1 = Math.min(w - 1, Math.floor(p.screenX + half));
  // Rows from world z, same mapping as the wall slice: screenY = h/2 + (EYE_Z - z)·h/depth.
  const zTop = opts.zCenter + opts.size / 2;
  const zBot = opts.zCenter - opts.size / 2;
  const yTop = h / 2 + ((EYE_Z - zTop) * h) / p.depth;
  const yBot = h / 2 + ((EYE_Z - zBot) * h) / p.depth;
  const y0 = Math.max(0, Math.ceil(yTop));
  const y1 = Math.min(h - 1, Math.floor(yBot));

  for (let x = x0; x <= x1; x++) {
    // Column-wise depth test against the walls; sprites don't write depth (only one sprite).
    if (depth[x] <= p.depth) continue;
    const u = (x - (p.screenX - half)) / (half * 2);
    for (let y = y0; y <= y1; y++) {
      const v = (yBot - y) / (yBot - yTop); // v runs UP, same convention as walls
      const a = texel(u, v, texelColor);
      if (a < 0.5) continue; // hard mask — crisp retro edge, no sort/blend pass needed
      fb.setPixel(x, y, texelColor.r, texelColor.g, texelColor.b);
    }
  }
}

/**
 * Procedural emerald gem: a cut-stone rhombus, brighter above the girdle line like light
 * entering the crown. Emissive (>1 linear green) so bloom picks it up. No assets.
 */
export function gemTexel(u: number, v: number, out: Color): number {
  // Rhombus |du|/a + |dv|/b <= 1 around the center; slightly taller than wide.
  const du = Math.abs(u - 0.5) / 0.32;
  const dv = Math.abs(v - 0.5) / 0.42;
  if (du + dv > 1) return 0;
  // Facets: the crown (upper half) catches more light; a bright girdle line splits them.
  const crown = v > 0.5 ? 1.25 : 0.85;
  const girdle = Math.abs(v - 0.5) < 0.04 ? 1.35 : 1;
  const glow = crown * girdle;
  out.r = 0.15 * glow;
  out.g = 1.05 * glow;
  out.b = 0.65 * glow;
  return 1;
}

/**
 * Procedural golden key, drawn with distance functions: a ring bow at the top, a shaft
 * down the middle, two teeth jutting right near the bottom. Emissive gold, brightened
 * toward the bow so it reads as glowing. No image assets — spec hard rule.
 */
export function keyTexel(u: number, v: number, out: Color): number {
  const inRect = (x0: number, x1: number, y0: number, y1: number): boolean =>
    u >= x0 && u <= x1 && v >= y0 && v <= y1;

  // Bow: annulus centered near the top.
  const dx = u - 0.5;
  const dy = v - 0.72;
  const rr = dx * dx + dy * dy;
  const bow = rr <= 0.2 * 0.2 && rr >= 0.1 * 0.1;
  // Shaft: vertical bar from below the bow to the tip.
  const shaft = inRect(0.44, 0.56, 0.08, 0.55);
  // Teeth: two nubs to the right near the tip.
  const teeth = inRect(0.56, 0.74, 0.1, 0.18) || inRect(0.56, 0.68, 0.24, 0.32);

  if (!bow && !shaft && !teeth) return 0;
  // Emissive gold, slightly hotter on the bow — values >1 so bloom catches the key too.
  const glow = bow ? 1.35 : 1.1;
  out.r = 1.0 * glow;
  out.g = 0.78 * glow;
  out.b = 0.28 * glow;
  return 1;
}
