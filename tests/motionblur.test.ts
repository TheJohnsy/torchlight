import { describe, expect, it } from "vitest";
import { LinearFramebuffer } from "../src/framebuffer";
import { applyRadialBlur } from "../src/motionblur";

function checkerFb(w: number, h: number): LinearFramebuffer {
  const fb = new LinearFramebuffer(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (x + y) % 2 === 0 ? 1 : 0;
      fb.setPixel(x, y, v, v, v);
    }
  }
  return fb;
}

describe("applyRadialBlur", () => {
  it("is a no-op at amount <= 0", () => {
    const fb = checkerFb(20, 20);
    const before = Float32Array.from(fb.data);
    const scratch = new LinearFramebuffer(20, 20);
    applyRadialBlur(fb, scratch, 0);
    expect(Array.from(fb.data)).toEqual(Array.from(before));
  });

  it("leaves the exact screen center unaffected (radial pull has zero distance there)", () => {
    const w = 21, h = 21; // odd dims so there's an exact center pixel
    const fb = checkerFb(w, h);
    const centerBefore = fb.data.slice(0);
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    const centerIdx = (cy * w + cx) * 3;
    const before = [centerBefore[centerIdx], centerBefore[centerIdx + 1], centerBefore[centerIdx + 2]];
    const scratch = new LinearFramebuffer(w, h);
    applyRadialBlur(fb, scratch, 1);
    expect([fb.data[centerIdx], fb.data[centerIdx + 1], fb.data[centerIdx + 2]]).toEqual(before);
  });

  it("changes pixels away from center (checkerboard gets averaged toward mid-grey)", () => {
    const fb = checkerFb(20, 20);
    const before = Float32Array.from(fb.data);
    const scratch = new LinearFramebuffer(20, 20);
    applyRadialBlur(fb, scratch, 1);
    let changed = 0;
    for (let i = 0; i < before.length; i++) {
      if (Math.abs(fb.data[i] - before[i]) > 1e-6) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it("stronger amount pulls samples from farther away (more change) than a weak amount", () => {
    const weakFb = checkerFb(40, 40);
    const strongFb = checkerFb(40, 40);
    const before = Float32Array.from(weakFb.data);
    const scratch = new LinearFramebuffer(40, 40);
    applyRadialBlur(weakFb, scratch, 0.1);
    const scratch2 = new LinearFramebuffer(40, 40);
    applyRadialBlur(strongFb, scratch2, 1);

    const diffSum = (fb: LinearFramebuffer): number => {
      let sum = 0;
      for (let i = 0; i < before.length; i++) sum += Math.abs(fb.data[i] - before[i]);
      return sum;
    };
    expect(diffSum(strongFb)).toBeGreaterThan(diffSum(weakFb));
  });
});
