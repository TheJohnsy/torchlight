import { describe, expect, it } from "vitest";
import { fade, fbm2, hash2, perlin2, valueNoise2 } from "../src/noise";

describe("hash2", () => {
  it("is deterministic", () => {
    expect(hash2(17, -42)).toBe(hash2(17, -42));
  });

  it("stays in [0,1) and doesn't collapse to few values", () => {
    const seen = new Set<number>();
    for (let x = -50; x < 50; x++) {
      for (let y = -50; y < 50; y++) {
        const h = hash2(x, y);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
        seen.add(h);
      }
    }
    expect(seen.size).toBeGreaterThan(9900); // 10k samples, near-zero collisions
  });
});

describe("fade", () => {
  it("pins endpoints and midpoint", () => {
    expect(fade(0)).toBe(0);
    expect(fade(1)).toBe(1);
    expect(fade(0.5)).toBeCloseTo(0.5, 10);
  });
});

describe("valueNoise2", () => {
  it("equals the lattice hash at integer coordinates", () => {
    expect(valueNoise2(3, 7)).toBeCloseTo(hash2(3, 7), 10);
  });

  it("is continuous (no jumps across cell borders)", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.173;
      const a = valueNoise2(x, 2.5);
      const b = valueNoise2(x + 1e-4, 2.5);
      expect(Math.abs(a - b)).toBeLessThan(1e-2);
    }
  });
});

describe("perlin2", () => {
  it("is zero at every lattice point (gradient noise property)", () => {
    expect(perlin2(4, 9)).toBeCloseTo(0, 10);
    expect(perlin2(-3, 11)).toBeCloseTo(0, 10);
  });

  it("stays roughly in [-1,1] with mean near 0", () => {
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const v = perlin2(i * 0.317, i * 0.771);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.45); // sqrt2-scaled theoretical bound
      sum += v;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });

  it("tiles when given an integer period", () => {
    for (let i = 0; i < 50; i++) {
      const u = i * 0.0198;
      expect(perlin2(u, 0.4, 8)).toBeCloseTo(perlin2(u + 8, 0.4, 8), 10);
      expect(perlin2(0.3, u, 8)).toBeCloseTo(perlin2(0.3, u + 8, 8), 10);
    }
  });
});

describe("fbm2", () => {
  it("stays in [0,1] and uses its octaves", () => {
    let lowDetail = 0;
    let highDetail = 0;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.913;
      const y = i * 0.377;
      const v = fbm2(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      // More octaves must change the field — otherwise the loop is broken.
      lowDetail += Math.abs(fbm2(x, y, 1) - v);
      highDetail += Math.abs(fbm2(x, y, 5) - v);
    }
    expect(lowDetail).toBeGreaterThan(1);
    expect(highDetail).toBe(0); // default is 5 octaves
  });
});
