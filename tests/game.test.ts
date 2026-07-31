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
});
