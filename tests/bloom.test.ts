import { describe, expect, it } from "vitest";
import { applyBloom, blurPass, brightPass } from "../src/bloom";
import { LinearFramebuffer } from "../src/framebuffer";

describe("brightPass", () => {
  it("keeps only light above the threshold, per channel", () => {
    const src = new LinearFramebuffer(2, 1);
    const dst = new LinearFramebuffer(2, 1);
    src.setPixel(0, 0, 0.9, 0.5, 0.2); // partly above a 0.6 threshold
    src.setPixel(1, 0, 0.1, 0.1, 0.1); // fully below

    brightPass(src, dst, 0.6);

    expect(dst.data[0]).toBeCloseTo(0.3); // 0.9 - 0.6
    expect(dst.data[1]).toBe(0); // 0.5 clamps to 0, must not go negative
    expect(dst.data[2]).toBe(0);
    expect(dst.data[3]).toBe(0);
    expect(dst.data[4]).toBe(0);
    expect(dst.data[5]).toBe(0);
  });
});

describe("blurPass (separable Gaussian)", () => {
  it("leaves a uniform field unchanged (normalized weights, clamped edges)", () => {
    const a = new LinearFramebuffer(8, 8);
    const b = new LinearFramebuffer(8, 8);
    a.clear(0.4, 0.4, 0.4);

    blurPass(a, b); // horizontal into b, vertical back into a

    for (let i = 0; i < a.data.length; i++) {
      expect(a.data[i]).toBeCloseTo(0.4, 5);
    }
  });

  it("spreads an interior impulse symmetrically and conserves its energy", () => {
    const a = new LinearFramebuffer(16, 16);
    const b = new LinearFramebuffer(16, 16);
    a.setPixel(8, 8, 1, 0, 0);

    blurPass(a, b);

    const at = (x: number, y: number) => a.data[(y * 16 + x) * 3];
    expect(at(8, 8)).toBeLessThan(1); // peak flattened
    expect(at(8, 8)).toBeGreaterThan(at(7, 8)); // but still the peak
    expect(at(7, 8)).toBeCloseTo(at(9, 8), 5); // left/right symmetric
    expect(at(8, 7)).toBeCloseTo(at(8, 9), 5); // up/down symmetric
    expect(at(7, 8)).toBeGreaterThan(0); // actually bled into neighbors
    let sum = 0;
    for (let i = 0; i < a.data.length; i += 3) sum += a.data[i];
    expect(sum).toBeCloseTo(1, 5); // Gaussian redistributes light, never creates it
  });
});

describe("applyBloom", () => {
  it("is a no-op on a scene with nothing above the threshold", () => {
    const fb = new LinearFramebuffer(8, 8);
    const s1 = new LinearFramebuffer(8, 8);
    const s2 = new LinearFramebuffer(8, 8);
    fb.clear(0.3, 0.3, 0.3);

    applyBloom(fb, s1, s2, { threshold: 0.7, strength: 0.8 });

    for (let i = 0; i < fb.data.length; i++) expect(fb.data[i]).toBeCloseTo(0.3, 5);
  });

  it("haloes a hot specular pixel onto its dark neighbors", () => {
    const fb = new LinearFramebuffer(16, 16);
    const s1 = new LinearFramebuffer(16, 16);
    const s2 = new LinearFramebuffer(16, 16);
    fb.setPixel(8, 8, 3, 3, 3); // blown-out torch highlight

    applyBloom(fb, s1, s2, { threshold: 0.7, strength: 0.8 });

    const at = (x: number, y: number) => fb.data[(y * 16 + x) * 3];
    expect(at(7, 8)).toBeGreaterThan(0); // neighbor picked up glow
    expect(at(8, 8)).toBeGreaterThan(3); // additive: the hot core got hotter, not clipped here
  });
});
