import type { Settings } from "./debug";
import { LinearFramebuffer } from "./framebuffer";
import { shadeTorch } from "./lighting";
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

/**
 * One fragment through the (toggleable) shading pipeline, into `shaded`:
 * albedo-only / normals-as-color / lighting-on-white / the full Phong composite.
 */
function shadeFragment(
  s: Settings,
  aR: number, aG: number, aB: number,
  wnx: number, wny: number, wnz: number, // world-space normal
  fx: number, fy: number, fz: number, // fragment world position
  ex: number, ey: number, ez: number, // eye/torch position
): void {
  switch (s.mode) {
    case "albedo":
      shaded.r = aR;
      shaded.g = aG;
      shaded.b = aB;
      return;
    case "normals":
      // World normal remapped [-1,1]→[0,1]; a flat wall reads as one solid color.
      shaded.r = wnx * 0.5 + 0.5;
      shaded.g = wny * 0.5 + 0.5;
      shaded.b = wnz * 0.5 + 0.5;
      return;
    case "lighting":
      shadeTorch(shaded, 1, 1, 1, wnx, wny, wnz, fx, fy, fz, ex, ey, ez, s.torch);
      return;
    default:
      shadeTorch(shaded, aR, aG, aB, wnx, wny, wnz, fx, fy, fz, ex, ey, ez, s.torch);
  }
}

export class Raycaster {
  /** Perpendicular hit distance per column — kept for sprite/edge passes later (spec §5). */
  readonly depth: Float32Array;

  constructor(
    private readonly fb: LinearFramebuffer,
    private readonly map: GridMap,
  ) {
    this.depth = new Float32Array(fb.width);
  }

  render(player: Player, mats: MaterialSet, settings: Settings): void {
    this.renderFloorCeiling(player, mats, settings);
    this.renderWalls(player, mats, settings);
  }

  /**
   * Horizontal-span casting: every screen row below center maps to one fixed distance on
   * the floor plane (similar triangles: rowDist = eyeZ·h / pixelsBelowCenter). With the
   * eye exactly halfway up the wall, the ceiling is the mirror image, so one distance and
   * one world walk serve both planes.
   */
  private renderFloorCeiling(player: Player, mats: MaterialSet, settings: Settings): void {
    const { fb } = this;
    const w = fb.width;
    const h = fb.height;
    const px = player.x;
    const py = player.y;
    const dirX = player.dirX;
    const dirY = player.dirY;
    const planeX = -dirY * PLANE_HALF;
    const planeY = dirX * PLANE_HALF;
    // Ray directions at the left and right screen edges; each row interpolates between them.
    const rx0 = dirX - planeX;
    const ry0 = dirY - planeY;
    const rx1 = dirX + planeX;
    const ry1 = dirY + planeY;
    const halfH = h / 2;
    const mid = h >> 1;

    for (let y = mid + 1; y < h; y++) {
      const p = y - halfH; // pixels below the horizon
      const rowDist = (EYE_Z * h) / p;
      const stepX = (rowDist * (rx1 - rx0)) / w;
      const stepY = (rowDist * (ry1 - ry0)) / w;
      let fx = px + rowDist * rx0;
      let fy = py + rowDist * ry0;
      const yCeil = h - 1 - y; // mirrored ceiling row (valid because EYE_Z = 0.5)

      for (let x = 0; x < w; x++, fx += stepX, fy += stepY) {
        const u = fx - Math.floor(fx);
        const v = fy - Math.floor(fy);

        // Floor: tangent frame coincides with world axes (u→+x, v→+y, out→+z).
        mats.floor.albedoAt(u, v, albedo, settings.bilinear);
        mats.floor.normalAt(u, v, tsNormal);
        shadeFragment(
          settings,
          albedo.r, albedo.g, albedo.b,
          tsNormal.x, tsNormal.y, tsNormal.z,
          fx, fy, 0,
          px, py, EYE_Z,
        );
        fb.setPixel(x, y, shaded.r, shaded.g, shaded.b);

        // Ceiling: faces down, so tangent y and z flip (keeps the basis right-handed).
        mats.ceiling.albedoAt(u, v, albedo, settings.bilinear);
        mats.ceiling.normalAt(u, v, tsNormal);
        shadeFragment(
          settings,
          albedo.r, albedo.g, albedo.b,
          tsNormal.x, -tsNormal.y, -tsNormal.z,
          fx, fy, 1,
          px, py, EYE_Z,
        );
        fb.setPixel(x, yCeil, shaded.r, shaded.g, shaded.b);
      }
    }
  }

  private renderWalls(player: Player, mats: MaterialSet, settings: Settings): void {
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

      for (let y = drawStart; y <= drawEnd; y++) {
        // v runs UP the wall (tile convention, types.ts): bottom of the slice is v=0,
        // which also makes v the fragment's world z.
        const v = 1 - (y - wallTop) / lineHeight;
        sampler.albedoAt(u, v, albedo, settings.bilinear);
        sampler.normalAt(u, v, tsNormal);
        // Rotate tangent→world: tangent x → wall tangent, tangent y → world up (z),
        // tangent z → outward face normal.
        const wnx = tanX * tsNormal.x + faceNX * tsNormal.z;
        const wny = tanY * tsNormal.x + faceNY * tsNormal.z;
        const wnz = tsNormal.y;
        shadeFragment(
          settings,
          albedo.r, albedo.g, albedo.b,
          wnx, wny, wnz,
          hitX, hitY, v,
          px, py, EYE_Z,
        );
        fb.setPixel(x, y, shaded.r, shaded.g, shaded.b);
      }
    }
  }
}
