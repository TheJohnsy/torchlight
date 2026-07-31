import type { Framebuffer } from "./types";

/**
 * One linear-light channel → display byte. sqrt is a cheap gamma-2 approximation of the
 * sRGB curve (spec §8: linear internally, gamma only at write-out).
 */
export function linearToByte(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return (Math.sqrt(c) * 255 + 0.5) | 0;
}

/**
 * Supersampling resolve: box-average each factor×factor block of `src` into one pixel of
 * `dst`. Both buffers are linear light, so a plain mean IS the physically-right filter —
 * averaging after gamma would darken edges (that's why this runs before present()).
 */
export function downsampleInto(
  src: LinearFramebuffer,
  dst: LinearFramebuffer,
  factor: number,
): void {
  if (src.width !== dst.width * factor || src.height !== dst.height * factor) {
    throw new Error(
      `downsampleInto: src ${src.width}x${src.height} is not ${factor}x dst ${dst.width}x${dst.height}`,
    );
  }
  const inv = 1 / (factor * factor);
  const s = src.data;
  const d = dst.data;
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = y * factor; sy < (y + 1) * factor; sy++) {
        let i = (sy * src.width + x * factor) * 3;
        for (let sx = 0; sx < factor; sx++, i += 3) {
          r += s[i];
          g += s[i + 1];
          b += s[i + 2];
        }
      }
      const j = (y * dst.width + x) * 3;
      d[j] = r * inv;
      d[j + 1] = g * inv;
      d[j + 2] = b * inv;
    }
  }
}

/**
 * CPU framebuffer: 3 floats per pixel, kept in LINEAR space so lighting math adds/scales
 * correctly. Converted to bytes exactly once, in present().
 */
export class LinearFramebuffer implements Framebuffer {
  readonly width: number;
  readonly height: number;
  /** Linear RGB, row-major, 3 floats per pixel. */
  readonly data: Float32Array;
  private image: ImageData | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height * 3);
  }

  setPixel(x: number, y: number, r: number, g: number, b: number): void {
    // Cheap guard; callers are expected to stay in-bounds in the hot loops.
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }

  clear(r = 0, g = 0, b = 0): void {
    const d = this.data;
    for (let i = 0; i < d.length; i += 3) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }

  /** Gamma-correct the linear buffer and blit it to the canvas via ImageData. */
  present(ctx: CanvasRenderingContext2D): void {
    if (!this.image) this.image = ctx.createImageData(this.width, this.height);
    const out = this.image.data;
    const src = this.data;
    for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
      out[j] = linearToByte(src[i]);
      out[j + 1] = linearToByte(src[i + 1]);
      out[j + 2] = linearToByte(src[i + 2]);
      out[j + 3] = 255;
    }
    ctx.putImageData(this.image, 0, 0);
  }
}
