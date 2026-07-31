import { describe, expect, it } from "vitest";
import { Cell, GridMap, LEVEL_1, level1 } from "../src/map";

describe("GridMap.parse", () => {
  it("rejects ragged rows", () => {
    expect(() => GridMap.parse(["###", "#."])).toThrow(/length/);
  });

  it("rejects unknown characters", () => {
    expect(() => GridMap.parse(["#?#"])).toThrow(/unknown map char/);
  });

  it("maps chars to cells", () => {
    const m = GridMap.parse(["#B."]);
    expect(m.cellAt(0, 0)).toBe(Cell.Stone);
    expect(m.cellAt(1, 0)).toBe(Cell.Brick);
    expect(m.cellAt(2, 0)).toBe(Cell.Floor);
  });
});

describe("level 1", () => {
  const map = level1();

  it("is 24x16 with rectangular rows", () => {
    expect(map.width).toBe(24);
    expect(map.height).toBe(16);
    for (const row of LEVEL_1) expect(row.length).toBe(24);
  });

  it("is fully enclosed by walls (rays and players cannot escape)", () => {
    for (let x = 0; x < map.width; x++) {
      expect(map.cellAt(x, 0)).not.toBe(Cell.Floor);
      expect(map.cellAt(x, map.height - 1)).not.toBe(Cell.Floor);
    }
    for (let y = 0; y < map.height; y++) {
      expect(map.cellAt(0, y)).not.toBe(Cell.Floor);
      expect(map.cellAt(map.width - 1, y)).not.toBe(Cell.Floor);
    }
  });

  it("treats out-of-bounds as solid", () => {
    expect(map.isWall(-3.2, 5)).toBe(true);
    expect(map.isWall(5, 99)).toBe(true);
  });

  it("has an open spawn cell at (1.5, 1.5)", () => {
    expect(map.isWall(1.5, 1.5)).toBe(false);
  });
});
