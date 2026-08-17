import { describe, expect, it } from "vitest";
import { TorchAttack } from "../src/combat";
import { Mob } from "../src/mob";
import { Player } from "../src/player";

/** Runs one full swing (trigger through to idle again), stepping at a fixed dt. */
function runFullSwing(attack: TorchAttack, player: Player, mob: Mob, dt = 1 / 60): void {
  attack.trigger();
  while (attack.swinging) attack.update(dt, player, [mob]);
}

describe("TorchAttack timing", () => {
  it("starts idle and enters a swing on trigger()", () => {
    const attack = new TorchAttack();
    expect(attack.swinging).toBe(false);
    attack.trigger();
    expect(attack.swinging).toBe(true);
    expect(attack.swingT).toBe(0);
  });

  it("ignores trigger() while already mid-swing", () => {
    const attack = new TorchAttack();
    attack.trigger();
    attack.update(0.05, new Player(0, 0, 0), [new Mob(5, 5)]); // advance partway
    const mid = attack.swingT;
    attack.trigger(); // should be a no-op
    expect(attack.swingT).toBe(mid);
  });

  it("returns to idle after the swing duration and gates a new trigger with a cooldown", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0);
    const mob = new Mob(5, 5); // far away — irrelevant to this timing check
    runFullSwing(attack, player, mob);
    expect(attack.swinging).toBe(false);

    attack.trigger(); // still within the cooldown window
    expect(attack.swinging).toBe(false);
  });

  it("allows a new swing once the cooldown has elapsed", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0);
    const mob = new Mob(5, 5);
    runFullSwing(attack, player, mob);
    for (let i = 0; i < 30; i++) attack.update(0.01, player, [mob]); // 0.3s, past the cooldown
    attack.trigger();
    expect(attack.swinging).toBe(true);
  });
});

describe("TorchAttack hit detection", () => {
  it("hits a mob directly ahead, within reach, exactly once per swing", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0); // facing +x
    const mob = new Mob(1, 0);
    runFullSwing(attack, player, mob);
    expect(mob.hp).toBe(2); // MAX_HP 3, one hit landed
  });

  it("does not hit a mob out of reach", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0);
    const mob = new Mob(5, 0); // well beyond ATTACK_REACH
    runFullSwing(attack, player, mob);
    expect(mob.hp).toBe(3);
  });

  it("does not hit a mob behind the player, outside the swing's cone", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0); // facing +x
    const mob = new Mob(-1, 0); // directly behind
    runFullSwing(attack, player, mob);
    expect(mob.hp).toBe(3);
  });

  it("does not damage an already-dead mob", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0);
    const mob = new Mob(1, 0);
    mob.takeDamage(3); // kill it first
    expect(mob.alive).toBe(false);
    runFullSwing(attack, player, mob);
    expect(mob.hp).toBe(0);
  });

  it("hits only one of two targets in reach, never both in the same swing", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0); // facing +x
    const mobA = new Mob(1, 0);
    const mobB = new Mob(1, 0.1);
    attack.trigger();
    while (attack.swinging) attack.update(1 / 60, player, [mobA, mobB]);
    const hits = (mobA.hp < mobA.maxHp ? 1 : 0) + (mobB.hp < mobB.maxHp ? 1 : 0);
    expect(hits).toBe(1);
  });

  it("picks the CLOSER of two targets, not just the first one listed in the array", () => {
    const attack = new TorchAttack();
    const player = new Player(0, 0, 0); // facing +x
    const far = new Mob(1.2, 0); // listed first, but farther away
    const near = new Mob(0.6, 0); // listed second, but closer — must be the one hit
    attack.trigger();
    while (attack.swinging) attack.update(1 / 60, player, [far, near]);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });
});
