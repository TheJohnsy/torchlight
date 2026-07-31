import { GridMap } from "./map";
import { Player } from "./player";

/**
 * The (deliberately trivial — spec hard rule) gameplay: find the glowing key, it opens the
 * vault door, stand in the vault to win. All state fits in two booleans.
 */

/** Where the key sprite floats: the small chamber west of center. */
export const KEY_POS = { x: 2.5, y: 8.5 };
/** Walk over the key within this range to pick it up. */
const PICKUP_RADIUS = 0.5;
/** The locked bottom-right room, as a tile rect [x0..x1) × [y0..y1). */
export const VAULT = { x0: 18, y0: 12, x1: 23, y1: 15 };

export class GameState {
  hasKey = false;
  won = false;

  /** Called once per frame after movement; mutates the map when the door unlocks. */
  update(player: Player, map: GridMap): void {
    if (!this.hasKey) {
      const dx = player.x - KEY_POS.x;
      const dy = player.y - KEY_POS.y;
      if (dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS) {
        this.hasKey = true;
        map.openDoors();
      }
      return; // can't be in the vault this frame anyway — the door was still shut
    }
    if (
      !this.won &&
      player.x >= VAULT.x0 && player.x < VAULT.x1 &&
      player.y >= VAULT.y0 && player.y < VAULT.y1
    ) {
      this.won = true;
    }
  }
}
