import { LinearFramebuffer } from "./framebuffer";
import { shadeTorch, type Torch } from "./lighting";
import { Cell, GridMap } from "./map";
import { Player } from "./player";
import { BakedSampler } from "./sampler";
import type { Color, Normal } from "./types";

/** Half-width of the camera plane = tan(FOV/2); 0.66 ≈ 66° horizontal FOV. */
const PLANE_HALF = 0.66;

/** Which sampler covers which surface. */
export interface MaterialSet {
  walls: Map<Cell, BakedSampler>;
  floor: BakedSampler;
  ceiling: BakedSampler;
}

/** Eye (and torch) height above the floor, in wall units. */
const EYE_Z = 0.5;

// Scratch objects reused across every pixel — the hot loop must not allocate.
const albedo: Color = { r: 0, g: 0, b: 0 };
const tsNormal: Normal = { x: 0, y: 0, z: 1 };
const shaded: Color = { r: 0, g: 0, b: 0 };

export class Raycaster {
  /** Perpendicular hit distance per column — kept for sprite/edge passes later (spec §5). */
  readonly depth: Float32Array;

  constructor(
    private readonly fb: LinearFramebuffer,
    private readonly map: GridMap,
  ) {
    this.depth = new Float32Array(fb.width);
  }

  render(player: Player, mats: MaterialSet, torch: Torch): void {
    const { fb, map } = this;
    const w = fb.width;
    const h = fb.height;
    const px = player.x;
    const py = player.y;
    const dirX = player.dirX;
    const dirY = player.dirY;
    // Camera plane is perpendicular to the view direction; screen-right is +plane.
    const planeX = -dirY * PLANE_HALF;
    const planeY = dirX * PLANE_HALF;

    for (let x = 0; x < w; x++) {
      // cameraX sweeps -1 (left edge) → +1 (right edge); the ray fans across the plane.
      const cameraX = (2 * x) / w - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      // --- DDA setup: which grid lines will this ray cross, and how far apart are they? ---
      let mapX = Math.floor(px);
      let mapY = Math.floor(py);
      const deltaDistX = Math.abs(1 / rayDirX); // Infinity when the ray is axis-parallel — DDA handles it
      const deltaDistY = Math.abs(1 / rayDirY);
      let stepX: number, sideDistX: number;
      let stepY: number, sideDistY: number;
      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (px - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1 - px) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (py - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1 - py) * deltaDistY;
      }

      // --- March cell to cell until we hit something solid. ---
      let side = 0; // 0 = crossed a vertical grid line (x-side), 1 = horizontal (y-side)
      let cell = Cell.Stone;
      for (let guard = 0; guard < 128; guard++) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        cell = map.cellAt(mapX, mapY);
        if (cell !== Cell.Floor) break;
      }

      // PERPENDICULAR distance, not euclidean ray length — using ray length curves every
      // wall into a fisheye. Because |dir|=1 and rays are dir + plane*cameraX, this is also
      // exactly the ray parameter t of the hit point.
      const perpDist = Math.max(
        side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY,
        1e-4,
      );
      this.depth[x] = perpDist;

      // The perspective divide: a wall 1 unit tall spans screenH/perpDist pixels.
      const lineHeight = h / perpDist;
      const wallTop = (h - lineHeight) / 2;
      const drawStart = Math.max(0, Math.ceil(wallTop));
      const drawEnd = Math.min(h - 1, Math.floor(wallTop + lineHeight));

      // --- texture u: where along the wall face did we hit? -----------------------------
      // Fractional part of the non-stepped coordinate at the hit point.
      let wallX = side === 0 ? py + perpDist * rayDirY : px + perpDist * rayDirX;
      wallX -= Math.floor(wallX);
      // Mirror u on faces we see "from behind" so texturing winds consistently around a block.
      const flipU = (side === 0 && rayDirX > 0) || (side === 1 && rayDirY < 0);
      const u = flipU ? 1 - wallX : wallX;

      const sampler = mats.walls.get(cell) ?? mats.walls.get(Cell.Stone)!;

      // --- tangent frame of this wall face (the "critical agreement" of spec §4) --------
      // Outward face normal points back toward the ray; tangent points along increasing u.
      const faceNX = side === 0 ? -Math.sign(rayDirX) : 0;
      const faceNY = side === 1 ? -Math.sign(rayDirY) : 0;
      const tanX = side === 1 ? (flipU ? -1 : 1) : 0;
      const tanY = side === 0 ? (flipU ? -1 : 1) : 0;
      // World position of the hit (perpDist is exactly the ray parameter t — see above).
      const hitX = px + perpDist * rayDirX;
      const hitY = py + perpDist * rayDirY;

      for (let y = 0; y < drawStart; y++) fb.setPixel(x, y, 0.02, 0.02, 0.025); // ceiling
      for (let y = drawStart; y <= drawEnd; y++) {
        // v runs UP the wall (tile convention, types.ts): bottom of the slice is v=0,
        // which also makes v the fragment's world z.
        const v = 1 - (y - wallTop) / lineHeight;
        sampler.albedoAt(u, v, albedo);
        sampler.normalAt(u, v, tsNormal);
        // Rotate tangent→world: tangent x → wall tangent, tangent y → world up (z),
        // tangent z → outward face normal.
        const wnx = tanX * tsNormal.x + faceNX * tsNormal.z;
        const wny = tanY * tsNormal.x + faceNY * tsNormal.z;
        const wnz = tsNormal.y;
        shadeTorch(
          shaded,
          albedo.r, albedo.g, albedo.b,
          wnx, wny, wnz,
          hitX, hitY, v,
          px, py, EYE_Z,
          torch,
        );
        fb.setPixel(x, y, shaded.r, shaded.g, shaded.b);
      }
      for (let y = drawEnd + 1; y < h; y++) fb.setPixel(x, y, 0.05, 0.05, 0.055); // floor
    }
  }
}
