import { describe, expect, it } from "vitest";
import { GridMap } from "../src/map";
import { Player } from "../src/player";

// 5x5 room with a wall ring — plenty for collision cases.
const room = GridMap.parse([
  "#####",
  "#...#",
  "#...#",
  "#...#",
  "#####",
]);

describe("Player.move", () => {
  it("moves freely in open space", () => {
    const p = new Player(2.5, 2.5, 0); // facing +x
    p.move(room, 1, 0, 0.1);
    expect(p.x).toBeCloseTo(2.6);
    expect(p.y).toBeCloseTo(2.5);
  });

  it("stops at a wall, respecting the collision radius", () => {
    const p = new Player(3.5, 2.5, 0); // wall starts at x=4
    for (let i = 0; i < 50; i++) p.move(room, 1, 0, 0.1);
    expect(p.x).toBeLessThanOrEqual(4 - p.radius + 1e-9);
    expect(p.x).toBeGreaterThan(3.5); // it did advance up to the wall
  });

  it("slides along a wall on diagonal movement instead of sticking", () => {
    const p = new Player(3.7, 2.0, 0); // hugging the east wall, moving diagonally
    p.move(room, 1, 1, 0.1); // forward +x (blocked soon) + strafe +y (open)
    expect(p.y).toBeGreaterThan(2.0); // the open axis still progresses
  });

  it("turn wraps direction vector consistently", () => {
    const p = new Player(2.5, 2.5, 0);
    p.turn(Math.PI / 2);
    expect(p.dirX).toBeCloseTo(0, 10);
    expect(p.dirY).toBeCloseTo(1, 10);
  });
});

describe("Player.knockback", () => {
  it("displaces the player by the raw vector in open space", () => {
    const p = new Player(2.5, 2.5, 0);
    p.knockback(room, 0.3, -0.2);
    expect(p.x).toBeCloseTo(2.8);
    expect(p.y).toBeCloseTo(2.3);
  });

  it("cannot be knocked through a wall", () => {
    const p = new Player(3.7, 2.5, 0); // wall starts at x=4
    p.knockback(room, 5, 0); // a huge impulse straight into the wall
    expect(p.x).toBeLessThanOrEqual(4 - p.radius + 1e-9);
  });

  it("slides along a wall on a diagonal impulse instead of sticking", () => {
    const p = new Player(3.7, 2.0, 0); // hugging the east wall
    p.knockback(room, 1, 1); // blocked on x, open on y
    expect(p.y).toBeGreaterThan(2.0);
  });
});
