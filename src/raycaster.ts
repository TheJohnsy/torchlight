import type { Settings } from "./debug";
import { LinearFramebuffer } from "./framebuffer";
import { shadeTorch } from "./lighting";
import { Cell, GridMap } from "./map";
import { Player } from "./player";
import { BakedSampler } from "./sampler";
import type { Color, Normal } from "./types";

/** Half-width of the camera plane = tan(FOV/2); 0.66 ≈ 66° horizontal FOV. */
export const PLANE_HALF = 0.66;

/** A continuous-coordinate rectangle: [x0,x1) × [y0,y1), same shape as Placements.vault. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Which sampler covers which surface. `vaultFloor`/`crackedStone` (roadmap E4) are
 * REGION overrides rather than per-Cell ones: the raycaster checks world position against
 * `bounds` instead of the grid's Cell type, so one room's floor or one wall band can get a
 * different material without adding a new Cell value (Cell stays purely about collision).
 */
export interface MaterialSet {
  walls: Map<Cell, BakedSampler>;
  floor: BakedSampler;
  ceiling: BakedSampler;
  vaultFloor?: { sampler: BakedSampler; bounds: Rect };
  crackedStone?: { sampler: BakedSampler; bounds: Rect };
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
      break;
    default:
      shadeTorch(shaded, aR, aG, aB, wnx, wny, wnz, fx, fy, fz, ex, ey, ez, s.torch);
  }
  if (s.fog) {
    // Beer–Lambert extinction toward black — dungeon murk, not sky haze. Skipped in the
    // albedo/normals debug views so those stay diagnostic.
    const dx = ex - fx;
    const dy = ey - fy;
    const dz = ez - fz;
    const f = Math.exp(-Math.sqrt(dx * dx + dy * dy + dz * dz) * s.fogDensity);
    shaded.r *= f;
    shaded.g *= f;
    shaded.b *= f;
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

  /**
   * `lightOff` displaces the torch light (and shading eye) from the player — the flame
   * sway. Rays still originate at the player; only the shading positions move.
   * `doorProgress` (roadmap E1.5, GameState.doorProgress) pulses the vault door with an
   * unlock glow while it's swinging open (0 or 1 = no glow — shut, or already open).
   */
  render(
    player: Player,
    mats: MaterialSet,
    settings: Settings,
    lightOff: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    doorProgress = 0,
  ): void {
    this.renderFloorCeiling(player, mats, settings, lightOff);
    this.renderWalls(player, mats, settings, lightOff, doorProgress);
  }

  /**
   * Horizontal-span casting: every screen row below center maps to one fixed distance on
   * the floor plane (similar triangles: rowDist = eyeZ·h / pixelsBelowCenter). With the
   * eye exactly halfway up the wall, the ceiling is the mirror image, so one distance and
   * one world walk serve both planes.
   */
  private renderFloorCeiling(
    player: Player,
    mats: MaterialSet,
    settings: Settings,
    lightOff: { x: number; y: number; z: number },
  ): void {
    const { fb } = this;
    const w = fb.width;
    const h = fb.height;
    const px = player.x;
    const py = player.y;
    const lx = px + lightOff.x;
    const ly = py + lightOff.y;
    const lz = EYE_Z + lightOff.z;
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

        // Floor: tangent frame coincides with world axes (u→+x, v→+y, out→+z). A region
        // override (e.g. marble in the vault) swaps the sampler by world position, not Cell.
        const vf = mats.vaultFloor;
        const floorSampler =
          vf && fx >= vf.bounds.x0 && fx < vf.bounds.x1 && fy >= vf.bounds.y0 && fy < vf.bounds.y1
            ? vf.sampler
            : mats.floor;
        floorSampler.albedoAt(u, v, albedo, settings.bilinear);
        floorSampler.normalAt(u, v, tsNormal);
        shadeFragment(
          settings,
          albedo.r, albedo.g, albedo.b,
          tsNormal.x, tsNormal.y, tsNormal.z,
          fx, fy, 0,
          lx, ly, lz,
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
          lx, ly, lz,
        );
        fb.setPixel(x, yCeil, shaded.r, shaded.g, shaded.b);
      }
    }
  }

  private renderWalls(
    player: Player,
    mats: MaterialSet,
    settings: Settings,
    lightOff: { x: number; y: number; z: number },
    doorProgress: number,
  ): void {
    const { fb, map } = this;
    const w = fb.width;
    const h = fb.height;
    const px = player.x;
    const py = player.y;
    const lx = px + lightOff.x;
    const ly = py + lightOff.y;
    const lz = EYE_Z + lightOff.z;
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

      // Region override (e.g. a cracked-stone room band): only ever replaces plain Stone,
      // by the hit cell's integer coordinates rather than its Cell type.
      const cz = mats.crackedStone;
      const sampler =
        cell === Cell.Stone &&
        cz &&
        mapX >= cz.bounds.x0 && mapX < cz.bounds.x1 && mapY >= cz.bounds.y0 && mapY < cz.bounds.y1
          ? cz.sampler
          : (mats.walls.get(cell) ?? mats.walls.get(Cell.Stone)!);

      // --- tangent frame of this wall face (the "critical agreement" of spec §4) --------
      // Outward face normal points back toward the ray; tangent points along increasing u.
      const faceNX = side === 0 ? -Math.sign(rayDirX) : 0;
      const faceNY = side === 1 ? -Math.sign(rayDirY) : 0;
      const tanX = side === 1 ? (flipU ? -1 : 1) : 0;
      const tanY = side === 0 ? (flipU ? -1 : 1) : 0;
      // World position of the hit (perpDist is exactly the ray parameter t — see above).
      const hitX = px + perpDist * rayDirX;
      const hitY = py + perpDist * rayDirY;

      // Vault-door unlock glow (E1.5): pulses while it's mid-swing, silent once shut (0) or
      // fully open (1) — |sin| naturally bookends to zero at both ends of doorProgress.
      const doorGlow =
        cell === Cell.Door && doorProgress > 0 && doorProgress < 1
          ? Math.abs(Math.sin(doorProgress * Math.PI * 6)) * 0.6
          : 0;

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
          lx, ly, lz,
        );
        if (doorGlow > 0) {
          shaded.r += doorGlow;
          shaded.g += doorGlow * 0.7;
          shaded.b += doorGlow * 0.15;
        }
        fb.setPixel(x, y, shaded.r, shaded.g, shaded.b);
      }
    }
  }
}
