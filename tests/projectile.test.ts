import { describe, expect, it } from "vitest";
import { GridMap } from "../src/map";
import { Mob } from "../src/mob";
import { Fireball, FireballLauncher } from "../src/projectile";

const room = GridMap.parse([
  "#######",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#######",
]);

describe("Fireball", () => {
  it("flies in a straight line at constant speed", () => {
    const fb = new Fireball(1.5, 3, 1, 0); // facing +x
    const mob = new Mob(50, 50); // far away, never in play
    const x0 = fb.x;
    fb.update(0.1, room, mob);
    const step1 = fb.x - x0;
    fb.update(0.1, room, mob);
    const step2 = fb.x - (x0 + step1);
    expect(step1).toBeGreaterThan(0);
    expect(step2).toBeCloseTo(step1, 5);
    expect(fb.y).toBeCloseTo(3); // no lateral drift
  });

  it("dies on hitting a wall", () => {
    const fb = new Fireball(4.5, 3, 1, 0); // wall at x=6
    const mob = new Mob(50, 50);
    for (let i = 0; i < 20 && fb.alive; i++) fb.update(0.05, room, mob);
    expect(fb.alive).toBe(false);
  });

  it("expires after its max lifetime even in the open", () => {
    // A long open corridor so it never hits a wall first.
    const corridor = GridMap.parse(["#".repeat(50), `#${".".repeat(48)}#`, "#".repeat(50)]);
    const fb = new Fireball(1.5, 1.5, 1, 0);
    const mob = new Mob(-50, -50);
    for (let i = 0; i < 100 && fb.alive; i++) fb.update(0.05, corridor, mob);
    expect(fb.alive).toBe(false);
  });

  it("damages and kills itself against a mob in its path", () => {
    const fb = new Fireball(1.5, 3, 1, 0);
    const mob = new Mob(2.5, 3); // dead ahead
    for (let i = 0; i < 20 && fb.alive; i++) fb.update(0.05, room, mob);
    expect(fb.alive).toBe(false);
    expect(mob.hp).toBeLessThan(3);
  });

  it("does not damage an already-dead mob (passes through)", () => {
    const fb = new Fireball(1.5, 3, 1, 0);
    const mob = new Mob(2.5, 3);
    mob.takeDamage(3); // kill it first
    for (let i = 0; i < 5; i++) fb.update(0.05, room, mob);
    expect(mob.hp).toBe(0); // no further change
  });

  it("keeps a bounded trail of its recent positions", () => {
    const fb = new Fireball(1.5, 3, 1, 0);
    const mob = new Mob(50, 50);
    for (let i = 0; i < 10; i++) fb.update(0.05, room, mob);
    expect(fb.trail.length).toBeGreaterThan(0);
    expect(fb.trail.length).toBeLessThanOrEqual(4);
  });
});

describe("FireballLauncher", () => {
  it("is ready immediately and fires a bolt", () => {
    const launcher = new FireballLauncher(1.5);
    expect(launcher.ready).toBe(true);
    const bolt = launcher.fire(1, 1, 1, 0);
    expect(bolt).not.toBeNull();
  });

  it("goes on cooldown after firing and refuses another shot", () => {
    const launcher = new FireballLauncher(1.5);
    launcher.fire(1, 1, 1, 0);
    expect(launcher.ready).toBe(false);
    expect(launcher.fire(1, 1, 1, 0)).toBeNull();
  });

  it("readiness ramps from 0 back to 1 over the cooldown window", () => {
    const launcher = new FireballLauncher(1);
    launcher.fire(1, 1, 1, 0);
    expect(launcher.readiness()).toBeCloseTo(0);
    launcher.tick(0.5);
    expect(launcher.readiness()).toBeCloseTo(0.5);
    launcher.tick(0.5);
    expect(launcher.readiness()).toBeCloseTo(1);
    expect(launcher.ready).toBe(true);
  });
});
