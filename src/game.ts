import { GridMap } from "./map";
import { Player } from "./player";

/**
 * The gameplay loop: find the glowing key, the vault door swings open over DOOR_OPEN_DURATION
 * (roadmap E1.5 — a keyframed transform instead of an instant pop), stand in the vault to
 * win; gems along the way count up. Mob contact costs a heart (main.ts calls damagePlayer()
 * when Mob.update() reports a hit); 0 hearts ends the run. Placements come from the authored
 * level's constants below or the procedural generator.
 */

/** Authored-level defaults: key in the small chamber west of center, vault bottom-right. */
export const KEY_POS = { x: 2.5, y: 8.5 };
export const VAULT = { x0: 18, y0: 12, x1: 23, y1: 15 };
/** Walk within this range of a pickup to take it. */
const PICKUP_RADIUS = 0.5;
/** Seconds the vault door takes to swing open once the key is picked up. */
const DOOR_OPEN_DURATION = 1;
const MAX_HEARTS = 3;

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
  hearts = MAX_HEARTS;
  dead = false;
  /** 0 before the key is found, ramps to 1 over DOOR_OPEN_DURATION once it's picked up.
   *  main.ts feeds this into the raycaster for the door's unlock glow. */
  doorProgress = 0;
  readonly treasures: Treasure[];
  private readonly key: { x: number; y: number };
  private readonly vault: { x0: number; y0: number; x1: number; y1: number };
  private doorOpening = false;
  private doorOpened = false;

  constructor(placements?: GamePlacements) {
    this.key = placements?.key ?? KEY_POS;
    this.vault = placements?.vault ?? VAULT;
    this.treasures = (placements?.treasures ?? []).map((t) => ({ ...t, taken: false }));
  }

  /** Mob contact (main.ts, on a truthy Mob.update() return). No-op once already dead. */
  damagePlayer(): void {
    if (this.dead) return;
    this.hearts--;
    if (this.hearts <= 0) {
      this.hearts = 0;
      this.dead = true;
    }
  }

  /** Called once per frame after movement; mutates the map when the door finishes opening. */
  update(player: Player, map: GridMap, dt: number): void {
    for (const t of this.treasures) {
      if (!t.taken && near(player.x, player.y, t.x, t.y)) {
        t.taken = true;
        this.collected++;
      }
    }
    if (!this.hasKey) {
      if (near(player.x, player.y, this.key.x, this.key.y)) {
        this.hasKey = true;
        this.doorOpening = true;
      }
      return; // can't be in the vault this frame anyway — the door hasn't even started opening
    }
    if (this.doorOpening && !this.doorOpened) {
      this.doorProgress = Math.min(1, this.doorProgress + dt / DOOR_OPEN_DURATION);
      if (this.doorProgress >= 1) {
        map.openDoors();
        this.doorOpened = true;
      }
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
