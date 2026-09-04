import { describe, expect, it } from "vitest";
import { clamp01, lerp, progress, smoothstep } from "../src/anim";

describe("clamp01", () => {
  it("clamps outside [0,1], passes through inside", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBeCloseTo(0.4);
  });
});

describe("smoothstep", () => {
  it("is 0 at t<=0 and 1 at t>=1", () => {
    expect(smoothstep(-0.5)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(1.5)).toBe(1);
  });

  it("has zero slope at both ends (eases in and out)", () => {
    const eps = 1e-4;
    const dStart = smoothstep(eps) - smoothstep(0);
    const dEnd = smoothstep(1) - smoothstep(1 - eps);
    expect(dStart).toBeLessThan(eps); // slope near 0, not a linear ramp
    expect(dEnd).toBeLessThan(eps);
  });

  it("is monotonic and passes through 0.5 at the midpoint", () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0.25)).toBeLessThan(smoothstep(0.75));
  });
});

describe("progress", () => {
  it("is 0 before the start and 1 once the duration elapses", () => {
    expect(progress(0, 1, 2)).toBe(0);
    expect(progress(1, 1, 2)).toBe(0);
    expect(progress(3, 1, 2)).toBe(1);
    expect(progress(10, 1, 2)).toBe(1);
  });

  it("eases through the middle of the window", () => {
    expect(progress(2, 1, 2)).toBeCloseTo(0.5);
  });
});

describe("lerp (re-exported)", () => {
  it("interpolates linearly", () => {
    expect(lerp(0, 10, 0.3)).toBeCloseTo(3);
  });
});
