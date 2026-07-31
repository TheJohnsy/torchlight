import { GridMap } from "./map";
import { Player } from "./player";

/**
 * The (deliberately trivial — spec hard rule) gameplay: find the glowing key, it opens the
 * vault door, stand in the vault to win; gems along the way just count up. State is two
 * booleans and a counter — placements come either from the authored level's constants
 * below or from the procedural generator.
 */

/** Authored-level defaults: key in the small chamber west of center, vault bottom-right. */
export const KEY_POS = { x: 2.5, y: 8.5 };
export const VAULT = { x0: 18, y0: 12, x1: 23, y1: 15 };
/** Walk within this range of a pickup to take it. */
const PICKUP_RADIUS = 0.5;

export interface GamePlacements {
  key: { x: number; y: number };
  vault: { x0: number; y0: number; x1: number; y1: number };
  treasures: { x: number; y: number }[];
}

export interface Treasure {
  x: number;
  y: number;
  taken: boolean;
}

const near = (px: number, py: number, x: number, y: number): boolean => {
  const dx = px - x;
  const dy = py - y;
  return dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS;
};

export class GameState {
  hasKey = false;
  won = false;
  collected = 0;
  readonly treasures: Treasure[];
  private readonly key: { x: number; y: number };
  private readonly vault: { x0: number; y0: number; x1: number; y1: number };

  constructor(placements?: GamePlacements) {
    this.key = placements?.key ?? KEY_POS;
    this.vault = placements?.vault ?? VAULT;
    this.treasures = (placements?.treasures ?? []).map((t) => ({ ...t, taken: false }));
  }

  /** Called once per frame after movement; mutates the map when the door unlocks. */
  update(player: Player, map: GridMap): void {
    for (const t of this.treasures) {
      if (!t.taken && near(player.x, player.y, t.x, t.y)) {
        t.taken = true;
        this.collected++;
      }
    }
    if (!this.hasKey) {
      if (near(player.x, player.y, this.key.x, this.key.y)) {
        this.hasKey = true;
        map.openDoors();
      }
      return; // can't be in the vault this frame anyway — the door was still shut
    }
    if (
      !this.won &&
      player.x >= this.vault.x0 && player.x < this.vault.x1 &&
      player.y >= this.vault.y0 && player.y < this.vault.y1
    ) {
      this.won = true;
    }
  }
}
