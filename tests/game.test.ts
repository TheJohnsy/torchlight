import { describe, expect, it } from "vitest";
import { GameState, KEY_POS, VAULT } from "../src/game";
import { Cell, level1 } from "../src/map";
import { Player } from "../src/player";

/** Ticks GameState.update with a fixed dt, holding the player still, `n` times. */
function tick(g: GameState, player: Player, map: ReturnType<typeof level1>, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i++) g.update(player, map, dt);
}

describe("GameState", () => {
  it("starts keyless and unwon, with the key on a walkable tile", () => {
    const g = new GameState();
    expect(g.hasKey).toBe(false);
    expect(g.won).toBe(false);
    expect(level1().isWall(KEY_POS.x, KEY_POS.y)).toBe(false);
  });

  it("walking over the key picks it up immediately, but the door swings open over time", () => {
    const map = level1();
    const g = new GameState();
    const player = new Player(KEY_POS.x + 0.2, KEY_POS.y, 0);
    g.update(player, map, 0.1);
    expect(g.hasKey).toBe(true);
    expect(map.cellAt(18, 11)).toBe(Cell.Door); // not yet — the swing just started
    expect(g.doorProgress).toBeLessThan(1);

    tick(g, player, map, 20, 0.1); // 2s total, comfortably past the 1s swing
    expect(g.doorProgress).toBe(1);
    expect(map.cellAt(18, 11)).toBe(Cell.Floor); // door swung open
  });

  it("does not pick up the key from across the room", () => {
    const map = level1();
    const g = new GameState();
    g.update(new Player(KEY_POS.x + 3, KEY_POS.y, 0), map, 0.1);
    expect(g.hasKey).toBe(false);
    expect(map.cellAt(18, 11)).toBe(Cell.Door);
  });

  it("wins when the player stands inside the vault", () => {
    const g = new GameState();
    const map = level1();
    g.update(new Player(KEY_POS.x, KEY_POS.y, 0), map, 0.1); // grab key first
    g.update(new Player(VAULT.x0 + 0.5, VAULT.y0 + 0.5, 0), map, 0.1);
    expect(g.won).toBe(true);
  });

  it("standing in the vault region without ever entering through play still requires the key", () => {
    // Guards the state machine ordering: no key → no win, even inside the vault rect.
    const g = new GameState();
    g.update(new Player(VAULT.x0 + 0.5, VAULT.y0 + 0.5, 0), level1(), 0.1);
    expect(g.won).toBe(false);
  });

  it("accepts generated placements instead of the authored defaults", () => {
    const map = level1();
    const g = new GameState({
      key: { x: 10.5, y: 4.5 },
      vault: { x0: 1, y0: 1, x1: 3, y1: 3 },
      treasures: [],
    });
    g.update(new Player(KEY_POS.x, KEY_POS.y, 0), map, 0.1); // authored key spot: no pickup now
    expect(g.hasKey).toBe(false);
    g.update(new Player(10.5, 4.5, 0), map, 0.1);
    expect(g.hasKey).toBe(true);
    g.update(new Player(1.5, 1.5, 0), map, 0.1);
    expect(g.won).toBe(true);
  });

  it("collects each treasure once when walked over", () => {
    const map = level1();
    const g = new GameState({
      key: { x: 10.5, y: 4.5 },
      vault: { x0: 1, y0: 1, x1: 3, y1: 3 },
      treasures: [
        { x: 5.5, y: 4.5 },
        { x: 8.5, y: 4.5 },
      ],
    });
    expect(g.collected).toBe(0);
    g.update(new Player(5.6, 4.5, 0), map, 0.1);
    expect(g.collected).toBe(1);
    g.update(new Player(5.6, 4.5, 0), map, 0.1); // stand on the same spot — no double count
    expect(g.collected).toBe(1);
    expect(g.treasures[0].taken).toBe(true);
    expect(g.treasures[1].taken).toBe(false);
  });
});

describe("GameState hearts and death", () => {
  it("starts at full hearts, alive", () => {
    const g = new GameState();
    expect(g.hearts).toBe(3);
    expect(g.dead).toBe(false);
  });

  it("loses a heart per damagePlayer() call and dies at 0", () => {
    const g = new GameState();
    g.damagePlayer();
    expect(g.hearts).toBe(2);
    expect(g.dead).toBe(false);
    g.damagePlayer();
    expect(g.hearts).toBe(1);
    g.damagePlayer();
    expect(g.hearts).toBe(0);
    expect(g.dead).toBe(true);
  });

  it("does not go below 0 hearts or un-die once dead", () => {
    const g = new GameState();
    for (let i = 0; i < 10; i++) g.damagePlayer();
    expect(g.hearts).toBe(0);
    expect(g.dead).toBe(true);
  });
});
