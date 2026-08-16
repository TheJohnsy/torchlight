import type { LinearFramebuffer } from "./framebuffer";
import type { Player } from "./player";
import { renderSprite } from "./sprite";
import type { Color } from "./types";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
}

const GRAVITY = -1.4; // world z units/sec² — a little pop-and-fall, not a hang in the air
const LIFE = 0.5; // seconds

/**
 * Tiny burst emitter (roadmap E1.5, feeding E3): short-lived billboards that scatter from a
 * point, fall under gravity, and shrink as they die. A particle IS a sprite with a lifetime —
 * this reuses the existing billboard/depth-occlusion pipeline (sprite.ts) instead of inventing
 * a second rendering path.
 */
export class ParticleSystem {
  private particles: Particle[] = [];

  get count(): number {
    return this.particles.length;
  }

  /** Scatter `count` particles of one color outward from a world point. */
  burst(x: number, y: number, z: number, count: number, color: Color): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.4;
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 1 + Math.random() * 1.2,
        life: LIFE,
        maxLife: LIFE,
        r: color.r,
        g: color.g,
        b: color.b,
      });
    }
  }

  /** Integrate motion, age out expired particles, and drop any that fell through the floor. */
  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz += GRAVITY * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.z > -0.2);
  }

  draw(fb: LinearFramebuffer, depth: Float32Array, player: Player): void {
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife); // shrinks toward 0 as it dies
      const texel = (u: number, v: number, out: Color): number => {
        if (Math.hypot(u - 0.5, v - 0.5) > 0.5) return 0;
        out.r = p.r;
        out.g = p.g;
        out.b = p.b;
        return 1;
      };
      renderSprite(fb, depth, player, p.x, p.y, texel, { size: 0.05 + 0.12 * t, zCenter: p.z });
    }
  }
}
