/** Grid cell contents. Anything that isn't Floor blocks movement and rays. */
export enum Cell {
  Floor = 0,
  Stone = 1,
  Brick = 2,
  /** Solid until the key is picked up; openDoors() turns it into Floor. */
  Door = 3,
}

const CHAR_TO_CELL: Record<string, Cell> = {
  ".": Cell.Floor,
  "#": Cell.Stone,
  "B": Cell.Brick,
  "D": Cell.Door,
};

export class GridMap {
  private constructor(
    readonly width: number,
    readonly height: number,
    private readonly cells: Uint8Array,
  ) {}

  /** Parse an ASCII level. Throws on ragged rows / unknown chars so bad data fails loudly. */
  static parse(rows: string[]): GridMap {
    const height = rows.length;
    const width = rows[0]?.length ?? 0;
    const cells = new Uint8Array(width * height);
    rows.forEach((row, y) => {
      if (row.length !== width) {
        throw new Error(`map row ${y} has length ${row.length}, expected ${width}`);
      }
      for (let x = 0; x < width; x++) {
        const cell = CHAR_TO_CELL[row[x]];
        if (cell === undefined) throw new Error(`unknown map char '${row[x]}' at ${x},${y}`);
        cells[y * width + x] = cell;
      }
    });
    return new GridMap(width, height, cells);
  }

  /** Cell at integer grid coords. Out of bounds reads as Stone so rays/players can't escape. */
  cellAt(ix: number, iy: number): Cell {
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) return Cell.Stone;
    return this.cells[iy * this.width + ix];
  }

  /** Solid test at continuous world coords. */
  isWall(x: number, y: number): boolean {
    return this.cellAt(Math.floor(x), Math.floor(y)) !== Cell.Floor;
  }

  /** The key was picked up: every door swings open (becomes walkable floor). */
  openDoors(): void {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === Cell.Door) this.cells[i] = Cell.Floor;
    }
  }
}

/**
 * The one hand-authored level (spec §2). 24x16. '#' stone, 'B' brick, '.' floor, 'D' the
 * locked vault door. Three room bands connected by door gaps; brick pillars give the torch
 * something to rake light across. The bottom-right room is the vault: reachable only
 * through the door at (18,11), which the glowing key opens.
 */
export const LEVEL_1 = [
  "########################",
  "#..........#...........#",
  "#.BB.......#..BBBBB....#",
  "#.BB.......#......B....#",
  "#......................#",
  "#####.#####...#####.####",
  "#...#......#...#.......#",
  "#.B.#..BB..#.B.#..BBB..#",
  "#...#......#...#.......#",
  "#...#......#...........#",
  "#......................#",
  "####.########.####D#####",
  "#..........#.....#.....#",
  "#.BBBBBB...#..B..#..B..#",
  "#..........#.....#.....#",
  "########################",
];

export function level1(): GridMap {
  return GridMap.parse(LEVEL_1);
}
