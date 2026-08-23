import { describe, expect, it } from "vitest";
import { Cell } from "../src/map";
import { cellColor, playerArrowPoints } from "../src/minimap";

describe("cellColor", () => {
  it("gives Stone, Brick, and Door three distinct, non-null colors", () => {
    const stone = cellColor(Cell.Stone);
    const brick = cellColor(Cell.Brick);
    const door = cellColor(Cell.Door);
    expect(stone).not.toBeNull();
    expect(brick).not.toBeNull();
    expect(door).not.toBeNull();
    expect(new Set([stone, brick, door]).size).toBe(3);
  });

  it("leaves Floor blank", () => {
    expect(cellColor(Cell.Floor)).toBeNull();
  });
});

describe("playerArrowPoints", () => {
  it("puts the tip along the facing angle at the given size", () => {
    const [tip] = playerArrowPoints(10, 10, 0, 5); // facing +x
    expect(tip[0]).toBeCloseTo(15);
    expect(tip[1]).toBeCloseTo(10);
  });

  it("rotates the tip with the angle", () => {
    const [tip] = playerArrowPoints(0, 0, Math.PI / 2, 4); // facing +y
    expect(tip[0]).toBeCloseTo(0);
    expect(tip[1]).toBeCloseTo(4);
  });

  it("keeps the two base corners equidistant from center and symmetric about the facing axis", () => {
    const [, left, right] = playerArrowPoints(2, 3, 0.7, 6);
    const dLeft = Math.hypot(left[0] - 2, left[1] - 3);
    const dRight = Math.hypot(right[0] - 2, right[1] - 3);
    expect(dLeft).toBeCloseTo(dRight);
    // Midpoint of the two base corners should sit on the (px,py)->tip facing line.
    const midX = (left[0] + right[0]) / 2;
    const midY = (left[1] + right[1]) / 2;
    const midAngle = Math.atan2(midY - 3, midX - 2);
    // Base midpoint is directly behind the tip — same line, opposite direction.
    const normalized = ((midAngle - 0.7 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    expect(Math.abs(normalized)).toBeCloseTo(Math.PI, 1);
  });
});
