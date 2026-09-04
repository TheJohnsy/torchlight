import type { GridMap } from "./map";
import type { Player } from "./player";

/**
 * One slime (roadmap E1/E1.5): wanders straight toward the player at a slow constant speed,
 * lunging faster once close, colliding against walls the same axis-separated way the player
 * does. Touching the player knocks them back; the torch swing (combat.ts) can kill it via
 * takeDamage(), which flashes it white for a beat and — at 0 HP — ends its updates so
 * main.ts can cut to a death-particle burst and gem drop.
 */
const SPEED = 0.9; // units/sec — slower than the player's base MOVE_SPEED, so it's escapable
const LUNGE_RANGE = 1.6; // within this distance it charges instead of ambling
const LUNGE_SPEED = 1.4;
const RADIUS = 0.25;
const KNOCKBACK_DISTANCE = 0.9; // one-shot displacement applied to the player on touch
// Grace period after a knockback: long enough that the lunge speed can't immediately
// close the knockback gap and re-hit before the player has a beat to see it and react.
const HIT_COOLDOWN = 1.0;
const MAX_HP = 3;
const HIT_FLASH_DURATION = 0.15; // white hit-flash window after takeDamage()
const HIT_KNOCKBACK_DISTANCE = 1.05; // one-shot "jump back" applied to the MOB when it's hit
const SHAKE_DURATION = 0.2; // seconds the hit-shake jitter lasts
const SHAKE_MAGNITUDE = 0.05; // world units, at full strength (decays to 0 over SHAKE_DURATION)
const BOB_AMPLITUDE = 0.03; // idle up/down bob, world z units
const BOB_RATE = 3; // radians/sec

/**
 * Per-instance stat overrides (roadmap E5): the boss is a Mob too, just tougher and slower
 * to close in — reusing this class instead of forking a parallel "Boss" class means combat,
 * AI, hit-flash/shake, and the death bookkeeping in main.ts all Just Work for both.
 */
export interface MobOptions {
  speed?: number;
  lungeSpeed?: number;
  lungeRange?: number;
  radius?: number;
  knockbackDistance?: number;
  hitCooldown?: number;
  maxHp?: number;
  hitKnockbackDistance?: number;
}

export class Mob {
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  alive = true;
  private readonly speed: number;
  private readonly lungeSpeed: number;
  private readonly lungeRange: number;
  private readonly knockbackDistance: number;
  private readonly hitCooldown: number;
  private readonly hitKnockbackDistance: number;
  private cooldown = 0;
  private flashTimer = 0;
  private shakeTimer = 0;
  private t = 0; // own elapsed time, for the idle bob — pauses/resumes with the mob itself

  constructor(
    public x: number,
    public y: number,
    options: MobOptions = {},
  ) {
    this.radius = options.radius ?? RADIUS;
    this.maxHp = options.maxHp ?? MAX_HP;
    this.hp = this.maxHp;
    this.speed = options.speed ?? SPEED;
    this.lungeSpeed = options.lungeSpeed ?? LUNGE_SPEED;
    this.lungeRange = options.lungeRange ?? LUNGE_RANGE;
    this.knockbackDistance = options.knockbackDistance ?? KNOCKBACK_DISTANCE;
    this.hitCooldown = options.hitCooldown ?? HIT_COOLDOWN;
    this.hitKnockbackDistance = options.hitKnockbackDistance ?? HIT_KNOCKBACK_DISTANCE;
  }

  get flashing(): boolean {
    return this.flashTimer > 0;
  }

  get shaking(): boolean {
    return this.shakeTimer > 0;
  }

  /** Small cosmetic up/down bob, purely for the sprite's zCenter — no gameplay effect. */
  bobOffset(): number {
    return Math.sin(this.t * BOB_RATE) * BOB_AMPLITUDE;
  }

  /**
   * Hit-shake: a decaying jitter for the sprite's draw position only (never mutates x/y).
   * Driven by the mob's own clock so it's deterministic, not per-frame randomness.
   */
  shakeOffset(): { x: number; y: number } {
    if (this.shakeTimer <= 0) return { x: 0, y: 0 };
    const mag = SHAKE_MAGNITUDE * (this.shakeTimer / SHAKE_DURATION);
    return { x: Math.sin(this.t * 90) * mag, y: Math.cos(this.t * 130) * mag };
  }

  /**
   * Damage from the player's torch swing or a fireball. Flashes white and shakes; if `map`
   * and an `away` direction are given, also "jumps back" a bit (wall-collision-checked, same
   * as the player's own knockback) so a hit visibly punches the mob, not just tints it.
   * At 0 HP the mob stops updating.
   */
  takeDamage(amount: number, map?: GridMap, awayX = 0, awayY = 0): void {
    if (!this.alive) return;
    this.hp -= amount;
    this.flashTimer = HIT_FLASH_DURATION;
    this.shakeTimer = SHAKE_DURATION;
    const d = Math.hypot(awayX, awayY);
    if (map && d > 1e-4) {
      const nx = this.x + (awayX / d) * this.hitKnockbackDistance;
      const ny = this.y + (awayY / d) * this.hitKnockbackDistance;
      if (!this.blocked(map, nx, this.y)) this.x = nx;
      if (!this.blocked(map, this.x, ny)) this.y = ny;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  /** Returns true the frame it knocks the player back (main.ts costs a heart on that). */
  update(dt: number, player: Player, map: GridMap): boolean {
    this.t += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.shakeTimer > 0) this.shakeTimer -= dt;
    if (!this.alive) return false;
    if (this.cooldown > 0) this.cooldown -= dt;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-4) {
      // Seek: step straight toward the player, sliding along walls axis-by-axis. Close in
      // fast (a "lunge") once within range, ambling the rest of the time.
      const speed = dist < this.lungeRange ? this.lungeSpeed : this.speed;
      const step = Math.min(speed * dt, dist);
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;
      if (!this.blocked(map, nx, this.y)) this.x = nx;
      if (!this.blocked(map, this.x, ny)) this.y = ny;
    }

    // Touch: knock the player straight away, gated by a cooldown so standing in contact
    // doesn't re-trigger every frame.
    const touchDist = player.radius + this.radius;
    if (this.cooldown <= 0 && dist > 1e-4 && dist < touchDist) {
      player.knockback(
        map,
        (dx / dist) * this.knockbackDistance,
        (dy / dist) * this.knockbackDistance,
      );
      this.cooldown = this.hitCooldown;
      return true;
    }
    return false;
  }

  /** Solid if any corner of the mob's bounding square touches a wall cell. */
  private blocked(map: GridMap, cx: number, cy: number): boolean {
    const r = this.radius;
    return (
      map.isWall(cx - r, cy - r) ||
      map.isWall(cx + r, cy - r) ||
      map.isWall(cx - r, cy + r) ||
      map.isWall(cx + r, cy + r)
    );
  }
}
