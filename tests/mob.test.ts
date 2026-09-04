import { describe, expect, it } from "vitest";
import { GridMap } from "../src/map";
import { Mob } from "../src/mob";
import { Player } from "../src/player";

// Open 7x7 room, plus a variant with a solid column splitting it in two.
const room = GridMap.parse([
  "#######",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#.....#",
  "#######",
]);
const walled = GridMap.parse([
  "#######",
  "#..#..#",
  "#..#..#",
  "#..#..#",
  "#..#..#",
  "#..#..#",
  "#######",
]);

describe("Mob.update", () => {
  it("steps toward the player each frame", () => {
    const mob = new Mob(1.5, 1.5);
    const player = new Player(5.5, 1.5, 0);
    const startDist = Math.hypot(player.x - mob.x, player.y - mob.y);
    mob.update(0.1, player, room);
    const dist = Math.hypot(player.x - mob.x, player.y - mob.y);
    expect(dist).toBeLessThan(startDist);
  });

  it("does not pass through a wall while seeking", () => {
    const mob = new Mob(1.5, 1.5);
    const player = new Player(5.5, 1.5, 0); // wall column sits at x in [3,4)
    for (let i = 0; i < 200; i++) mob.update(0.1, player, walled);
    expect(mob.x).toBeLessThanOrEqual(3 - mob.radius + 1e-9);
  });

  it("knocks the player back on touch and reports the hit", () => {
    const mob = new Mob(2.5, 1.5);
    const player = new Player(2.6, 1.5, 0); // already within touch range
    const before = player.x;
    const hit = mob.update(0.1, player, room);
    expect(hit).toBe(true);
    expect(player.x).toBeGreaterThan(before); // mob is to the west; pushed further east, away
  });

  it("gates repeated knockback with a cooldown even if contact resumes immediately", () => {
    const mob = new Mob(2.5, 1.5);
    const player = new Player(2.6, 1.5, 0);
    mob.update(0.1, player, room); // first hit, cooldown starts

    // Player moves right back into contact with the mob (e.g. still pressing forward).
    player.x = mob.x + 0.1;
    const before = player.x;
    const hit = mob.update(0.01, player, room); // still well within the cooldown window
    expect(hit).toBe(false);
    expect(player.x).toBeCloseTo(before, 5);
  });

  it("lunges faster once within lunge range than while ambling from afar", () => {
    const far = new Mob(1.5, 1.5);
    const farPlayer = new Player(4.5, 1.5, 0); // dist 3, outside lunge range
    far.update(0.1, farPlayer, room);

    const near = new Mob(1.5, 1.5);
    const nearPlayer = new Player(2.5, 1.5, 0); // dist 1, inside lunge range
    near.update(0.1, nearPlayer, room);

    const farStep = far.x - 1.5;
    const nearStep = near.x - 1.5;
    expect(nearStep).toBeGreaterThan(farStep); // same dt, same direction — lunge covers more ground
  });
});

describe("Mob combat", () => {
  it("takes damage, flashes, and dies at 0 HP", () => {
    const mob = new Mob(1.5, 1.5);
    expect(mob.alive).toBe(true);
    expect(mob.flashing).toBe(false);

    mob.takeDamage(1);
    expect(mob.hp).toBe(2);
    expect(mob.alive).toBe(true);
    expect(mob.flashing).toBe(true);

    mob.takeDamage(2);
    expect(mob.hp).toBe(0);
    expect(mob.alive).toBe(false);
  });

  it("the hit-flash clears itself after its duration", () => {
    const mob = new Mob(1.5, 1.5);
    const player = new Player(10, 10, 0); // far away — no seek/touch interference
    mob.takeDamage(1);
    expect(mob.flashing).toBe(true);
    for (let i = 0; i < 5; i++) mob.update(0.1, player, room); // well past HIT_FLASH_DURATION
    expect(mob.flashing).toBe(false);
  });

  it("jumps back away from a hit when given a map and direction, wall-collision-checked", () => {
    const mob = new Mob(2.5, 2.5);
    const before = mob.x;
    mob.takeDamage(1, room, 1, 0); // struck from the west — punched east
    expect(mob.x).toBeGreaterThan(before);
  });

  it("does not move on takeDamage without a map (damage-only callers stay backward compatible)", () => {
    const mob = new Mob(2.5, 2.5);
    mob.takeDamage(1, undefined, 1, 0);
    expect(mob.x).toBeCloseTo(2.5);
    expect(mob.y).toBeCloseTo(2.5);
  });

  it("shakes on a hit and the shake decays to nothing", () => {
    const mob = new Mob(1.5, 1.5);
    const player = new Player(10, 10, 0);
    expect(mob.shaking).toBe(false);
    expect(mob.shakeOffset()).toEqual({ x: 0, y: 0 });

    mob.takeDamage(1);
    expect(mob.shaking).toBe(true);
    const s = mob.shakeOffset();
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) mob.update(0.1, player, room); // past SHAKE_DURATION
    expect(mob.shaking).toBe(false);
    expect(mob.shakeOffset()).toEqual({ x: 0, y: 0 });
  });

  it("stops wandering and can no longer hit the player once dead", () => {
    const mob = new Mob(2.5, 1.5);
    const player = new Player(2.6, 1.5, 0); // touching distance
    mob.takeDamage(3); // lethal
    expect(mob.alive).toBe(false);
    const hit = mob.update(0.1, player, room);
    expect(hit).toBe(false);
    expect(mob.x).toBeCloseTo(2.5); // didn't keep seeking
  });

  it("honors MobOptions overrides (roadmap E5 boss stats), defaulting when omitted", () => {
    const plain = new Mob(1.5, 1.5);
    expect(plain.maxHp).toBe(3);
    expect(plain.hp).toBe(3);

    const boss = new Mob(1.5, 1.5, { maxHp: 10, radius: 0.4, speed: 0.6 });
    expect(boss.maxHp).toBe(10);
    expect(boss.hp).toBe(10);
    expect(boss.radius).toBe(0.4);

    const player = new Player(5.5, 1.5, 0);
    const plainStep = (() => {
      const m = new Mob(1.5, 1.5);
      m.update(0.1, player, room);
      return m.x - 1.5;
    })();
    const slowStep = (() => {
      const m = new Mob(1.5, 1.5, { speed: 0.6 });
      m.update(0.1, player, room);
      return m.x - 1.5;
    })();
    expect(slowStep).toBeLessThan(plainStep); // custom speed actually takes effect
  });

  it("idle bob oscillates around zero without net drift", () => {
    const mob = new Mob(1.5, 1.5);
    const player = new Player(1.5, 1.5, 0); // right on top of it — no seek movement to confound it
    const samples: number[] = [];
    // Run past half the bob period (π/BOB_RATE ≈ 1.05s) so the sample set crosses zero.
    for (let i = 0; i < 100; i++) {
      mob.update(1 / 60, player, room);
      samples.push(mob.bobOffset());
    }
    expect(Math.max(...samples)).toBeGreaterThan(0);
    expect(Math.min(...samples)).toBeLessThan(0);
  });
});
