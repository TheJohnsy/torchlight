import { describe, expect, it } from "vitest";
import { Dash } from "../src/dash";
import { GridMap } from "../src/map";
import { Player } from "../src/player";

const room = GridMap.parse([
  "#######",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#######",
]);

describe("Dash", () => {
  it("bursts the player forward, collision-checked like any other movement", () => {
    const dash = new Dash();
    const player = new Player(1.5, 3, 0); // facing +x
    const before = player.x;
    dash.trigger(player, room);
    expect(player.x).toBeGreaterThan(before);
  });

  it("cannot dash through a wall", () => {
    const dash = new Dash();
    const player = new Player(1.5, 3, 0);
    dash.trigger(player, room); // wall at x=6, dash distance 1.8 from x=1.5 clears it
    expect(player.x).toBeLessThanOrEqual(6 - player.radius + 1e-9);
  });

  it("goes on cooldown after use and refuses a second dash", () => {
    const dash = new Dash();
    const player = new Player(1.5, 3, 0);
    dash.trigger(player, room);
    const after = player.x;
    dash.trigger(player, room); // still on cooldown
    expect(player.x).toBeCloseTo(after);
    expect(dash.ready).toBe(false);
  });

  it("the post-dash blur fades from full to zero and the dash rearms", () => {
    const dash = new Dash();
    const player = new Player(1.5, 3, 0);
    dash.trigger(player, room);
    expect(dash.blurAmount()).toBeCloseTo(1);
    for (let i = 0; i < 20; i++) dash.update(0.01); // 0.2s — past BLUR_DURATION
    expect(dash.blurAmount()).toBeCloseTo(0);
    expect(dash.ready).toBe(false); // cooldown (1.2s) outlasts the blur

    for (let i = 0; i < 100; i++) dash.update(0.01); // past the 1.2s cooldown too
    expect(dash.ready).toBe(true);
  });
});
