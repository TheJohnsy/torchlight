import { LinearFramebuffer } from "./framebuffer";
import { Cell, GridMap } from "./map";
import { Player } from "./player";

/** Half-width of the camera plane = tan(FOV/2); 0.66 ≈ 66° horizontal FOV. */
const PLANE_HALF = 0.66;

/** Phase-1 flat wall colors (linear space) until materials arrive. */
const FLAT_COLOR: Record<number, [number, number, number]> = {
  [Cell.Stone]: [0.32, 0.32, 0.34],
  [Cell.Brick]: [0.36, 0.22, 0.18],
};

export class Raycaster {
  /** Perpendicular hit distance per column — kept for sprite/edge passes later (spec §5). */
  readonly depth: Float32Array;

  constructor(
    private readonly fb: LinearFramebuffer,
    private readonly map: GridMap,
  ) {
    this.depth = new Float32Array(fb.width);
  }

  render(player: Player): void {
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

      // Phase 1: flat colors; y-sides darkened so faces read as distinct before lighting.
      const [r, g, b] = FLAT_COLOR[cell] ?? FLAT_COLOR[Cell.Stone];
      const shade = side === 1 ? 0.7 : 1.0;

      for (let y = 0; y < drawStart; y++) fb.setPixel(x, y, 0.02, 0.02, 0.025); // ceiling
      for (let y = drawStart; y <= drawEnd; y++) fb.setPixel(x, y, r * shade, g * shade, b * shade);
      for (let y = drawEnd + 1; y < h; y++) fb.setPixel(x, y, 0.05, 0.05, 0.055); // floor
    }
  }
}
