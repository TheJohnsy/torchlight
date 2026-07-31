import { describe, expect, it } from "vitest";
import { GameState, KEY_POS, VAULT } from "../src/game";
import { Cell, level1 } from "../src/map";
import { Player } from "../src/player";

describe("GameState", () => {
  it("starts keyless and unwon, with the key on a walkable tile", () => {
    const g = new GameState();
    expect(g.hasKey).toBe(false);
    expect(g.won).toBe(false);
    expect(level1().isWall(KEY_POS.x, KEY_POS.y)).toBe(false);
  });

  it("walking over the key picks it up and opens the vault door", () => {
    const map = level1();
    const g = new GameState();
    g.update(new Player(KEY_POS.x + 0.2, KEY_POS.y, 0), map);
    expect(g.hasKey).toBe(true);
    expect(map.cellAt(18, 11)).toBe(Cell.Floor); // door swung open
  });

  it("does not pick up the key from across the room", () => {
    const map = level1();
    const g = new GameState();
    g.update(new Player(KEY_POS.x + 3, KEY_POS.y, 0), map);
    expect(g.hasKey).toBe(false);
    expect(map.cellAt(18, 11)).toBe(Cell.Door);
  });

  it("wins when the player stands inside the vault", () => {
    const g = new GameState();
    const map = level1();
    g.update(new Player(KEY_POS.x, KEY_POS.y, 0), map); // grab key first
    g.update(new Player(VAULT.x0 + 0.5, VAULT.y0 + 0.5, 0), map);
    expect(g.won).toBe(true);
  });

  it("standing in the vault region without ever entering through play still requires the key", () => {
    // Guards the state machine ordering: no key → no win, even inside the vault rect.
    const g = new GameState();
    g.update(new Player(VAULT.x0 + 0.5, VAULT.y0 + 0.5, 0), level1());
    expect(g.won).toBe(false);
  });

  it("accepts generated placements instead of the authored defaults", () => {
    const map = level1();
    const g = new GameState({
      key: { x: 10.5, y: 4.5 },
      vault: { x0: 1, y0: 1, x1: 3, y1: 3 },
      treasures: [],
    });
    g.update(new Player(KEY_POS.x, KEY_POS.y, 0), map); // authored key spot: no pickup now
    expect(g.hasKey).toBe(false);
    g.update(new Player(10.5, 4.5, 0), map);
    expect(g.hasKey).toBe(true);
    g.update(new Player(1.5, 1.5, 0), map);
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
    g.update(new Player(5.6, 4.5, 0), map);
    expect(g.collected).toBe(1);
    g.update(new Player(5.6, 4.5, 0), map); // stand on the same spot — no double count
    expect(g.collected).toBe(1);
    expect(g.treasures[0].taken).toBe(true);
    expect(g.treasures[1].taken).toBe(false);
  });
});
