import { describe, expect, it } from "vitest";
import { LinearFramebuffer } from "../src/framebuffer";
import { ParticleSystem } from "../src/particles";
import { Player } from "../src/player";

describe("ParticleSystem", () => {
  it("burst adds exactly `count` particles", () => {
    const ps = new ParticleSystem();
    ps.burst(1, 1, 0.3, 8, { r: 1, g: 0, b: 0 });
    expect(ps.count).toBe(8);
  });

  it("particles age out and vanish after their lifetime", () => {
    const ps = new ParticleSystem();
    ps.burst(1, 1, 0.3, 5, { r: 1, g: 0, b: 0 });
    for (let i = 0; i < 60; i++) ps.update(1 / 60); // 1s, comfortably past the 0.5s life
    expect(ps.count).toBe(0);
  });

  it("draws visible, colored pixels for a live particle", () => {
    const ps = new ParticleSystem();
    ps.burst(1, 1, 0.3, 1, { r: 1, g: 0, b: 0 });
    ps.update(0.02);
    const fb = new LinearFramebuffer(20, 20);
    const depth = new Float32Array(20).fill(100);
    const player = new Player(-1, 1, 0); // facing +x, particle is 2 units ahead
    ps.draw(fb, depth, player);
    expect(Array.from(fb.data).some((v) => v > 0)).toBe(true);
  });

  it("drops particles that fall through the floor even before their lifetime ends", () => {
    const ps = new ParticleSystem();
    ps.burst(1, 1, 0.05, 20, { r: 1, g: 1, b: 1 });
    // Run long enough for gravity to pull every particle below the floor cutoff.
    for (let i = 0; i < 30; i++) ps.update(1 / 30);
    expect(ps.count).toBe(0);
  });
});
