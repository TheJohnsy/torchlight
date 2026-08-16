import type { GridMap } from "./map";
import type { Mob } from "./mob";

/**
 * The fireball skill (roadmap E1.5 — "IS E3's projectile"): a cooldown-gated bolt that flies
 * straight until it hits a wall, hits the mob, or times out. `trail` is the last few
 * positions, cheapest possible motion-blur streak: main.ts draws it as a few fading ghost
 * billboards behind the head instead of a screen-space convolution.
 */
const SPEED = 5; // world units/sec
const MAX_LIFE = 2; // seconds — dies even down an open corridor
const RADIUS = 0.15;
const DAMAGE = 2;
const TRAIL_LENGTH = 4;

export class Fireball {
  alive = true;
  private life = MAX_LIFE;
  private readonly vx: number;
  private readonly vy: number;
  readonly trail: { x: number; y: number }[] = [];

  constructor(
    public x: number,
    public y: number,
    dirX: number,
    dirY: number,
  ) {
    this.vx = dirX * SPEED;
    this.vy = dirY * SPEED;
  }

  update(dt: number, map: GridMap, mob: Mob): void {
    if (!this.alive) return;

    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.pop();

    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.life <= 0 || map.isWall(this.x, this.y)) {
      this.alive = false;
      return;
    }
    if (mob.alive) {
      const dist = Math.hypot(mob.x - this.x, mob.y - this.y);
      if (dist < mob.radius + RADIUS) {
        mob.takeDamage(DAMAGE, map, this.vx, this.vy); // punched further along the bolt's flight
        this.alive = false;
      }
    }
  }
}

/** Cooldown-gated launcher: owns the recharge timer main.ts's HUD slot reads from. */
export class FireballLauncher {
  private cooldown = 0;
  readonly cooldownDuration: number;

  constructor(cooldownDuration = 1.5) {
    this.cooldownDuration = cooldownDuration;
  }

  /** 0 = ready, 1 = just fired — main.ts fills the HUD slot with `1 - readiness()`. */
  readiness(): number {
    return 1 - this.cooldown / this.cooldownDuration;
  }

  get ready(): boolean {
    return this.cooldown <= 0;
  }

  tick(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
  }

  /** Spawns a bolt if off cooldown; returns null otherwise (safe to call every frame). */
  fire(x: number, y: number, dirX: number, dirY: number): Fireball | null {
    if (!this.ready) return null;
    this.cooldown = this.cooldownDuration;
    return new Fireball(x, y, dirX, dirY);
  }
}
