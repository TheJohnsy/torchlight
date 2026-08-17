import type { GridMap } from "./map";
import type { Mob } from "./mob";
import type { Player } from "./player";

/**
 * The torch swing (roadmap E1.5): a melee attack keyframed on the held-torch viewmodel
 * (heldtorch.ts reads `swingT` to arc the tip). `swingT` IS the animation timeline — main.ts
 * doesn't track its own swing clock, it just feeds this back into renderHeldTorch().
 */
const SWING_DURATION = 0.35; // seconds, idle→arc→idle
const SWING_COOLDOWN = 0.15; // seconds before another swing can start
const HIT_WINDOW_START = 0.35; // fraction of the swing where the torch is "in" the target
const HIT_WINDOW_END = 0.65;
const ATTACK_REACH = 1.3; // world units
const ATTACK_HALF_ANGLE = Math.PI / 3; // 60° each side of where the player's facing
const ATTACK_DAMAGE = 1;

export class TorchAttack {
  /** -1 = idle; 0..1 = swing progress. Feed straight into renderHeldTorch(). */
  swingT = -1;
  private cooldown = 0;
  private hitThisSwing = false;

  get swinging(): boolean {
    return this.swingT >= 0;
  }

  /** Starts a swing if idle and off cooldown; a no-op otherwise (safe to call every frame). */
  trigger(): void {
    if (this.swinging || this.cooldown > 0) return;
    this.swingT = 0;
    this.hitThisSwing = false;
  }

  /**
   * Advances the swing clock and lands damage once, in the window where the arc connects.
   * `targets` lets the boss (roadmap E5) and the regular slime coexist under one melee swing.
   * Picks the CLOSEST target in reach+cone, not the first in array order — with a roaming
   * slime that constantly seeks the player, "first in the array" would let it wander between
   * the player and the boss and silently soak every swing meant for the boss instead.
   */
  update(dt: number, player: Player, targets: Mob[], map?: GridMap): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.swinging) return;

    this.swingT += dt / SWING_DURATION;
    if (!this.hitThisSwing && this.swingT >= HIT_WINDOW_START && this.swingT <= HIT_WINDOW_END) {
      let best: Mob | null = null;
      let bestDist = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      for (const mob of targets) {
        if (!mob.alive) continue;
        const dx = mob.x - player.x;
        const dy = mob.y - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 1e-4 || dist >= ATTACK_REACH || dist >= bestDist) continue;
        const dot = (dx / dist) * player.dirX + (dy / dist) * player.dirY;
        if (dot > Math.cos(ATTACK_HALF_ANGLE)) {
          best = mob;
          bestDist = dist;
          bestDx = dx;
          bestDy = dy;
        }
      }
      if (best) {
        best.takeDamage(ATTACK_DAMAGE, map, bestDx, bestDy); // knocked further along the swing's line
        this.hitThisSwing = true;
      }
    }
    if (this.swingT >= 1) {
      this.swingT = -1;
      this.cooldown = SWING_COOLDOWN;
    }
  }
}
