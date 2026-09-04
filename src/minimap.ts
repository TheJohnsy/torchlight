import { Cell, type GridMap } from "./map";
import type { Player } from "./player";

/**
 * Top-down minimap (roadmap E6): the 2D grid the raycaster projects from, made literally
 * visible next to the 3D view. Drawn straight to a real 2D canvas context — deliberately
 * OUTSIDE the linear-light framebuffer pipeline, same convention as the HUD icon painter
 * (`paintIcon` in main.ts): this is flat UI, not a lit part of the 3D scene, so the spec's
 * "gamma only at present()" rule doesn't apply here.
 */
export const MINIMAP_CELL_PX = 4;

const WALL_COLORS: Partial<Record<Cell, string>> = {
  [Cell.Stone]: "#3a3630",
  [Cell.Brick]: "#4a3f30",
  [Cell.Door]: "#e8b56a",
};

/** Flat fill color for a map cell, or null for open floor (left blank/transparent). */
export function cellColor(cell: Cell): string | null {
  return WALL_COLORS[cell] ?? null;
}

export interface MinimapMarker {
  x: number;
  y: number;
  color: string;
}

/**
 * Three points of a triangle centered at (px,py), tip pointing along `angle` — the
 * player's facing indicator. Base corners are symmetric about the facing axis.
 */
export function playerArrowPoints(
  px: number,
  py: number,
  angle: number,
  size: number,
): [number, number][] {
  const tip: [number, number] = [px + Math.cos(angle) * size, py + Math.sin(angle) * size];
  const back = angle + Math.PI;
  const spread = 2.4; // radians between the two base corners, split around dead-back
  const left: [number, number] = [
    px + Math.cos(back - spread / 2) * size * 0.7,
    py + Math.sin(back - spread / 2) * size * 0.7,
  ];
  const right: [number, number] = [
    px + Math.cos(back + spread / 2) * size * 0.7,
    py + Math.sin(back + spread / 2) * size * 0.7,
  ];
  return [tip, left, right];
}

/** Clears and redraws the full minimap: wall layout, entity markers, player facing arrow. */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: GridMap,
  player: Player,
  markers: MinimapMarker[],
): void {
  const px = MINIMAP_CELL_PX;
  ctx.clearRect(0, 0, map.width * px, map.height * px);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const color = cellColor(map.cellAt(x, y));
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * px, y * px, px, px);
    }
  }

  for (const m of markers) {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x * px, m.y * px, px * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const [tip, left, right] = playerArrowPoints(player.x * px, player.y * px, player.angle, px * 1.4);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.closePath();
  ctx.fill();
}
