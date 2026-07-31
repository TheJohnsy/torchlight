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
