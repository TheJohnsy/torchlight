import { LinearFramebuffer } from "./framebuffer";
import { fbm2 } from "./noise";
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

/**
 * Procedural slime mob (roadmap E1): a squashed blob whose edge is perturbed by FBm noise
 * sampled around its silhouette angle — the same noise field that shapes stone walls, now
 * warping a creature's outline instead of a height map, so no two slimes (or frames) trace
 * a mechanically perfect ellipse. Two dark eye dots read as a face. Not emissive — this is
 * a creature, not a light source, unlike the key/gems.
 */
export function mobTexel(u: number, v: number, out: Color): number {
  // Body: an ellipse squashed toward the floor, center low in the tile.
  const dx = (u - 0.5) / 0.36;
  const dy = (v - 0.34) / 0.3;
  const r = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const wobble = fbm2(Math.cos(angle) * 3 + 11, Math.sin(angle) * 3 + 5, 2) - 0.5; // [-0.5,0.5]
  if (r > 1 + wobble * 0.3) return 0;

  // Eyes: two small dark ovals above center.
  const eyeDy = v - 0.42;
  const leftEye = (u - 0.42) ** 2 / 0.0006 + (eyeDy * eyeDy) / 0.0012;
  const rightEye = (u - 0.58) ** 2 / 0.0006 + (eyeDy * eyeDy) / 0.0012;
  if (leftEye <= 1 || rightEye <= 1) {
    out.r = out.g = out.b = 0.03;
    return 1;
  }

  // Body shading: darker near the base, a pale wet highlight near the upper-left.
  const shade = 0.5 + 0.5 * (v - 0.1);
  const highlight = Math.max(0, 1 - ((u - 0.38) ** 2 + (v - 0.55) ** 2) / 0.02) * 0.4;
  out.r = 0.1 * shade + highlight * 0.3;
  out.g = 0.42 * shade + highlight * 0.4;
  out.b = 0.14 * shade + highlight * 0.3;
  return 1;
}

/** The key's idle float — a slow bob, same role as the mob's Mob.bobOffset(). */
export function keyFloat(t: number): number {
  return Math.sin(t * 2) * 0.04;
}

/**
 * HUD heart (roadmap E1.5 player hearts): two circular lobes + a tapering triangle point,
 * the classic heart silhouette built from the same SDF-composition style as gem/key. Drawn
 * both in-HUD (via paintIcon, reusing its existing `dim` ghost styling for a lost heart) and
 * nowhere in-world — hearts are a HUD-only readout, not a world pickup.
 */
export function heartTexel(u: number, v: number, out: Color): number {
  const cx1 = 0.32, cx2 = 0.68, cy = 0.62, r = 0.22;
  const d1 = (u - cx1) ** 2 + (v - cy) ** 2;
  const d2 = (u - cx2) ** 2 + (v - cy) ** 2;
  const inLobes = d1 <= r * r || d2 <= r * r;
  const tipY = 0.12;
  const halfWidthAt = (vv: number) => 0.34 * Math.max(0, (vv - tipY) / (cy - tipY));
  const inTri = v <= cy && v >= tipY && Math.abs(u - 0.5) <= halfWidthAt(v);
  if (!inLobes && !inTri) return 0;
  out.r = 0.85;
  out.g = 0.12;
  out.b = 0.18;
  return 1;
}

/**
 * The fireball skill's bolt (roadmap E1.5 — "IS E3's projectile"): a soft hot core, emissive
 * (>1 linear red) so it feeds the bloom pass exactly like the key/gems, just orange-hot
 * instead of gold/emerald. Trail ghosts reuse this same texel, just drawn smaller/dimmer.
 */
export function fireTexel(u: number, v: number, out: Color): number {
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d > 0.5) return 0;
  const heat = 1 - d / 0.5;
  out.r = 1.2 + 1.2 * heat;
  out.g = 0.5 + 0.9 * heat * heat;
  out.b = 0.15 * heat * heat;
  return 1;
}
