import type { GridMap } from "./map";
import type { Player } from "./player";

/**
 * Dash/blink (roadmap E1.5, optional skill #2): an instant forward burst reusing
 * Player.knockback()'s collision-checked raw displacement — a dash IS a knockback the
 * player applies to themself. `blurAmount()` feeds motionblur.ts's radial "speed" blur,
 * which fades out over BLUR_DURATION.
 */
const DASH_DISTANCE = 1.8; // world units
const DASH_COOLDOWN = 1.2; // seconds
const BLUR_DURATION = 0.2; // seconds the post-dash blur lingers

export class Dash {
  private cooldown = 0;
  private blurTimer = 0;

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  /** 0..1, how much of the post-dash motion blur is still visible (0 once it's faded). */
  blurAmount(): number {
    return this.blurTimer / BLUR_DURATION;
  }

  /** No-op if still on cooldown — safe to call unconditionally on the input edge. */
  trigger(player: Player, map: GridMap): void {
    if (!this.ready) return;
    player.knockback(map, player.dirX * DASH_DISTANCE, player.dirY * DASH_DISTANCE);
    this.cooldown = DASH_COOLDOWN;
    this.blurTimer = BLUR_DURATION;
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.blurTimer > 0) this.blurTimer = Math.max(0, this.blurTimer - dt);
  }
}
