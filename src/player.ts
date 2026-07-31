import type { GridMap } from "./map";

export class Player {
  /** Collision radius in grid units — keeps the near plane out of walls. */
  readonly radius = 0.2;

  constructor(
    public x: number,
    public y: number,
    /** Facing angle in radians; 0 looks along +x. */
    public angle: number,
  ) {}

  get dirX(): number {
    return Math.cos(this.angle);
  }
  get dirY(): number {
    return Math.sin(this.angle);
  }

  turn(delta: number): void {
    this.angle += delta;
  }

  /**
   * Move with axis-separated collision: try x and y independently so hitting a wall at an
   * angle slides you along it instead of stopping dead.
   * `forward`/`strafe` are speeds in units/sec; strafe + is to the camera's right.
   */
  move(map: GridMap, forward: number, strafe: number, dt: number): void {
    // Camera right = the raycaster's plane direction (-dirY, dirX)... rotated: right on
    // screen corresponds to +plane, which is (-dirY, dirX). See raycaster.ts.
    const vx = this.dirX * forward + -this.dirY * strafe;
    const vy = this.dirY * forward + this.dirX * strafe;
    const nx = this.x + vx * dt;
    const ny = this.y + vy * dt;
    if (!this.blocked(map, nx, this.y)) this.x = nx;
    if (!this.blocked(map, this.x, ny)) this.y = ny;
  }

  /** Solid if any corner of the player's bounding square touches a wall cell. */
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
