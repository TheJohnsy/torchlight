import { describe, expect, it } from "vitest";
import { LinearFramebuffer } from "../src/framebuffer";
import { renderHeldTorch } from "../src/heldtorch";

const W = 320;
const H = 200;

describe("renderHeldTorch (first-person viewmodel)", () => {
  it("draws only in the lower-right of the frame", () => {
    const fb = new LinearFramebuffer(W, H);
    renderHeldTorch(fb, 0.5);
    let lit = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const on = fb.data[(y * W + x) * 3] > 0;
        if (on) lit++;
        if (x < W / 2 && y < H / 2) {
          expect(on).toBe(false); // top-left quadrant must stay scene-only
        }
      }
    }
    expect(lit).toBeGreaterThan(200); // the torch actually shows up
  });

  it("has a warm emissive flame: linear red past 1, red over green over blue", () => {
    const fb = new LinearFramebuffer(W, H);
    renderHeldTorch(fb, 0.5);
    let hot = 0;
    for (let i = 0; i < fb.data.length; i += 3) {
      const [r, g, b] = [fb.data[i], fb.data[i + 1], fb.data[i + 2]];
      if (r > 1 && r > g && g > b) hot++;
    }
    expect(hot).toBeGreaterThan(30); // flame core feeds the bloom pass
  });

  it("is deterministic per time and flickers across time", () => {
    const a = new LinearFramebuffer(W, H);
    const b = new LinearFramebuffer(W, H);
    const c = new LinearFramebuffer(W, H);
    renderHeldTorch(a, 0.5);
    renderHeldTorch(b, 0.5);
    renderHeldTorch(c, 0.9);
    expect(Array.from(a.data)).toEqual(Array.from(b.data)); // same t → same frame
    let differs = false;
    for (let i = 0; i < a.data.length && !differs; i++) {
      if (a.data[i] !== c.data[i]) differs = true;
    }
    expect(differs).toBe(true); // the flame moves
  });

  it("scales with the framebuffer (SSAA buffer gets a proportional torch)", () => {
    const lo = new LinearFramebuffer(W, H);
    const hi = new LinearFramebuffer(W * 2, H * 2);
    renderHeldTorch(lo, 0.5);
    renderHeldTorch(hi, 0.5);
    const litFrac = (fb: LinearFramebuffer): number => {
      let lit = 0;
      for (let i = 0; i < fb.data.length; i += 3) if (fb.data[i] > 0) lit++;
      return lit / (fb.width * fb.height);
    };
    // Same fraction of the screen covered at both resolutions (within a pixel-edge margin).
    expect(Math.abs(litFrac(lo) - litFrac(hi))).toBeLessThan(0.01);
  });
});
