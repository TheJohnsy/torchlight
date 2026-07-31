import { describe, expect, it } from "vitest";
import { Cell, GridMap } from "../src/map";
import { generateDungeon, type Dungeon } from "../src/mapgen";

/** 4-directional flood fill over walkable tiles from a start tile. */
function reachable(map: GridMap, sx: number, sy: number): Set<number> {
  const seen = new Set<number>();
  const stack = [[Math.floor(sx), Math.floor(sy)]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const id = y * map.width + x;
    if (seen.has(id) || map.cellAt(x, y) !== Cell.Floor) continue;
    seen.add(id);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

const tileId = (map: GridMap, x: number, y: number) =>
  Math.floor(y) * map.width + Math.floor(x);

function vaultTiles(d: Dungeon): [number, number][] {
  const { x0, y0, x1, y1 } = d.placements.vault;
  const tiles: [number, number][] = [];
  for (let y = Math.floor(y0); y < y1; y++) {
    for (let x = Math.floor(x0); x < x1; x++) {
      if (d.map.cellAt(x, y) === Cell.Floor) tiles.push([x, y]);
    }
  }
  return tiles;
}

describe("generateDungeon", () => {
  const d = generateDungeon(7);

  it("is deterministic per seed and varies across seeds", () => {
    const again = generateDungeon(7);
    const other = generateDungeon(8);
    expect(again.placements).toEqual(d.placements);
    let same = true;
    let diff = false;
    for (let y = 0; y < d.map.height && (same || !diff); y++) {
      for (let x = 0; x < d.map.width; x++) {
        if (again.map.cellAt(x, y) !== d.map.cellAt(x, y)) same = false;
        if (other.map.cellAt(x, y) !== d.map.cellAt(x, y)) diff = true;
      }
    }
    expect(same).toBe(true);
    expect(diff).toBe(true);
  });

  it("is fully enclosed by solid border cells", () => {
    for (let x = 0; x < d.map.width; x++) {
      expect(d.map.cellAt(x, 0)).not.toBe(Cell.Floor);
      expect(d.map.cellAt(x, d.map.height - 1)).not.toBe(Cell.Floor);
    }
    for (let y = 0; y < d.map.height; y++) {
      expect(d.map.cellAt(0, y)).not.toBe(Cell.Floor);
      expect(d.map.cellAt(d.map.width - 1, y)).not.toBe(Cell.Floor);
    }
  });

  it("spawns and places the key on walkable tiles, with exactly one door", () => {
    expect(d.map.isWall(d.placements.spawn.x, d.placements.spawn.y)).toBe(false);
    expect(d.map.isWall(d.placements.key.x, d.placements.key.y)).toBe(false);
    let doors = 0;
    for (let y = 0; y < d.map.height; y++) {
      for (let x = 0; x < d.map.width; x++) {
        if (d.map.cellAt(x, y) === Cell.Door) doors++;
      }
    }
    expect(doors).toBe(1);
  });

  it("lets the player reach the key without the door, but not the vault", () => {
    const open = reachable(d.map, d.placements.spawn.x, d.placements.spawn.y);
    expect(open.has(tileId(d.map, d.placements.key.x, d.placements.key.y))).toBe(true);
    for (const [x, y] of vaultTiles(d)) {
      expect(open.has(y * d.map.width + x)).toBe(false);
    }
  });

  it("opens the vault once the door unlocks", () => {
    const unlocked = generateDungeon(7); // fresh copy — openDoors mutates
    unlocked.map.openDoors();
    const open = reachable(unlocked.map, d.placements.spawn.x, d.placements.spawn.y);
    const tiles = vaultTiles(d);
    expect(tiles.length).toBeGreaterThan(0);
    for (const [x, y] of tiles) {
      expect(open.has(y * d.map.width + x)).toBe(true);
    }
  });

  it("scatters treasures on walkable tiles, with at least one in the vault", () => {
    expect(d.placements.treasures.length).toBeGreaterThanOrEqual(3);
    const v = d.placements.vault;
    let inVault = 0;
    for (const t of d.placements.treasures) {
      expect(d.map.isWall(t.x, t.y)).toBe(false);
      if (t.x >= v.x0 && t.x < v.x1 && t.y >= v.y0 && t.y < v.y1) inVault++;
    }
    expect(inVault).toBeGreaterThan(0);
  });

  it("survives a spread of seeds without violating its own invariants", () => {
    for (let seed = 100; seed < 130; seed++) {
      const g = generateDungeon(seed);
      const open = reachable(g.map, g.placements.spawn.x, g.placements.spawn.y);
      expect(open.has(tileId(g.map, g.placements.key.x, g.placements.key.y))).toBe(true);
      for (const [x, y] of vaultTiles(g)) {
        expect(open.has(y * g.map.width + x)).toBe(false);
      }
    }
  });
});
