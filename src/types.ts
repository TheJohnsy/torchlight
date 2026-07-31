/**
 * Shared contracts between the renderer core and the procedural-content side.
 * Copied from SPEC.md §4 — frozen. Do not change without updating the spec first.
 */

/** A raw RGB framebuffer. Colors are linear float [0,1] until final write-out. */
export interface Framebuffer {
  width: number;
  height: number;
  setPixel(x: number, y: number, r: number, g: number, b: number): void;
  present(ctx: CanvasRenderingContext2D): void; // gamma-correct + blit via ImageData
}

/** RGB, each channel a float in [0,1]. */
export type Color = { r: number; g: number; b: number };

/**
 * A unit normal in TANGENT SPACE: +x right, +y up, +z out of the surface.
 * The raycaster rotates this into world space per wall face.
 *
 * Team convention on top of the spec: material `v` increases UPWARD along a wall and equals
 * world z (floor = 0, ceiling = 1), so tangent +y always aligns with +v. Pinning this down
 * in writing is "the critical agreement" of spec §4 — get it wrong and lighting breaks in
 * ways that are miserable to debug.
 */
export type Normal = { x: number; y: number; z: number };

/** A procedural material. u,v in [0,1) across one wall tile. */
export interface Material {
  albedo(u: number, v: number): Color;
  normal(u: number, v: number): Normal;
}
