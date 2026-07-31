import { describe, expect, it } from "vitest";
import { downsampleInto, LinearFramebuffer } from "../src/framebuffer";

describe("downsampleInto (supersampling resolve)", () => {
  it("averages each 2×2 source block into one destination pixel, in linear space", () => {
    const src = new LinearFramebuffer(4, 2);
    const dst = new LinearFramebuffer(2, 1);
    // Left block: two white texels, two black → linear mean 0.5 (NOT the 0.25 a
    // gamma-space average would give; resolving before gamma is the whole point).
    src.setPixel(0, 0, 1, 1, 1);
    src.setPixel(1, 0, 0, 0, 0);
    src.setPixel(0, 1, 0, 0, 0);
    src.setPixel(1, 1, 1, 1, 1);
    // Right block: four distinct values per channel to catch row/column addressing slips.
    src.setPixel(2, 0, 0.1, 0.2, 0.3);
    src.setPixel(3, 0, 0.3, 0.4, 0.5);
    src.setPixel(2, 1, 0.5, 0.6, 0.7);
    src.setPixel(3, 1, 0.7, 0.8, 0.9);

    downsampleInto(src, dst, 2);

    expect(dst.data[0]).toBeCloseTo(0.5);
    expect(dst.data[1]).toBeCloseTo(0.5);
    expect(dst.data[2]).toBeCloseTo(0.5);
    expect(dst.data[3]).toBeCloseTo(0.4); // (0.1+0.3+0.5+0.7)/4
    expect(dst.data[4]).toBeCloseTo(0.5);
    expect(dst.data[5]).toBeCloseTo(0.6);
  });

  it("handles factor 3 (block size follows the factor, not a hardcoded 2)", () => {
    const src = new LinearFramebuffer(3, 3);
    const dst = new LinearFramebuffer(1, 1);
    // One bright texel among nine → mean 1/9.
    src.setPixel(1, 1, 1, 1, 1);

    downsampleInto(src, dst, 3);

    expect(dst.data[0]).toBeCloseTo(1 / 9);
  });

  it("rejects mismatched dimensions instead of silently corrupting the frame", () => {
    const src = new LinearFramebuffer(4, 4);
    const dst = new LinearFramebuffer(3, 2); // not src/2 in either axis
    expect(() => downsampleInto(src, dst, 2)).toThrow();
  });
});
