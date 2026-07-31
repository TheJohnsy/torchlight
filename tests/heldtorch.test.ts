import { describe, expect, it } from "vitest";
import { LinearFramebuffer } from "../src/framebuffer";
import { renderHeldTorch, torchFlicker, torchSway } from "../src/heldtorch";

const W = 320;
const H = 200;

describe("torchFlicker (shared by the flame sprite and the actual light)", () => {
  it("stays within gentle bounds so the room never strobes or blacks out", () => {
    for (let t = 0; t < 12; t += 0.05) {
      const f = torchFlicker(t);
      expect(f).toBeGreaterThan(0.65);
      expect(f).toBeLessThan(1.25);
    }
  });

  it("is deterministic and actually varies over time", () => {
    expect(torchFlicker(1.5)).toBe(torchFlicker(1.5));
    let varies = false;
    for (let t = 0; t < 3 && !varies; t += 0.1) {
      if (Math.abs(torchFlicker(t) - torchFlicker(0)) > 0.02) varies = true;
    }
    expect(varies).toBe(true);
  });
});

describe("torchSway (light-position jitter — what makes shadows dance)", () => {
  it("stays a small offset around the player, never a teleport", () => {
    for (let t = 0; t < 10; t += 0.07) {
      const s = torchSway(t);
      expect(Math.abs(s.x)).toBeLessThan(0.2);
      expect(Math.abs(s.y)).toBeLessThan(0.2);
      expect(Math.abs(s.z)).toBeLessThan(0.1);
    }
  });

  it("is deterministic, moves over time, and the axes are decorrelated", () => {
    expect(torchSway(2)).toEqual(torchSway(2));
    let moves = false;
    let decorrelated = false;
    for (let t = 0; t < 4; t += 0.1) {
      const s = torchSway(t);
      if (Math.abs(s.x - torchSway(0).x) > 0.01) moves = true;
      if (Math.abs(s.x - s.y) > 0.01) decorrelated = true; // not one shared stream
    }
    expect(moves).toBe(true);
    expect(decorrelated).toBe(true);
  });
});

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
