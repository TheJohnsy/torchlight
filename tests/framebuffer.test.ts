import { describe, expect, it } from "vitest";
import { LinearFramebuffer, linearToByte } from "../src/framebuffer";

describe("linearToByte", () => {
  it("maps 0→0 and 1→255", () => {
    expect(linearToByte(0)).toBe(0);
    expect(linearToByte(1)).toBe(255);
  });

  it("clamps out-of-range light before gamma", () => {
    expect(linearToByte(-2)).toBe(0);
    expect(linearToByte(7)).toBe(255); // specular blowout must clamp, not wrap
  });

  it("applies gamma-2: linear 0.25 displays as half-bright", () => {
    expect(linearToByte(0.25)).toBe(128); // sqrt(0.25)*255 = 127.5, rounds to 128
  });
});

describe("LinearFramebuffer", () => {
  // present() needs a canvas 2D context, so it's exercised in the browser; here we pin the
  // pure parts: addressing, storage, clearing, bounds.
  it("stores pixels row-major at 3 floats per pixel", () => {
    const fb = new LinearFramebuffer(4, 3);
    fb.setPixel(2, 1, 0.1, 0.2, 0.3);
    const i = (1 * 4 + 2) * 3;
    expect(fb.data[i]).toBeCloseTo(0.1);
    expect(fb.data[i + 1]).toBeCloseTo(0.2);
    expect(fb.data[i + 2]).toBeCloseTo(0.3);
  });

  it("ignores out-of-bounds writes", () => {
    const fb = new LinearFramebuffer(2, 2);
    fb.setPixel(-1, 0, 1, 1, 1);
    fb.setPixel(0, 5, 1, 1, 1);
    expect(Array.from(fb.data).every((v) => v === 0)).toBe(true);
  });

  it("clears to a solid color", () => {
    const fb = new LinearFramebuffer(2, 2);
    fb.clear(0.5, 0.25, 0.125);
    expect(fb.data[0]).toBe(0.5);
    expect(fb.data[10]).toBe(0.25);
    expect(fb.data[11]).toBe(0.125);
  });
});
