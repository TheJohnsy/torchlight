import { describe, expect, it } from "vitest";
import { defaultTorch, shadeTorch } from "../src/lighting";
import type { Color } from "../src/types";

const out: Color = { r: 0, g: 0, b: 0 };
const EYE = [0, 0, 0.5] as const;

/** Shade a white fragment 1 unit in front of the eye with the given normal. */
function shade(nx: number, ny: number, nz: number, torch = defaultTorch()): Color {
  shadeTorch(out, 1, 1, 1, nx, ny, nz, 1, 0, 0.5, EYE[0], EYE[1], EYE[2], torch);
  return { ...out };
}

describe("shadeTorch", () => {
  it("lights a facing surface brighter than a grazing one", () => {
    const facing = shade(-1, 0, 0); // normal points back at the eye/torch
    const grazing = shade(0, 1, 0); // 90° to the light
    expect(facing.r).toBeGreaterThan(grazing.r);
  });

  it("leaves only ambient at grazing incidence", () => {
    const torch = defaultTorch();
    const grazing = shade(0, 1, 0, torch);
    expect(grazing.r).toBeCloseTo(torch.ambient, 6);
  });

  it("attenuates with distance", () => {
    const torch = defaultTorch();
    const near: Color = { r: 0, g: 0, b: 0 };
    const far: Color = { r: 0, g: 0, b: 0 };
    shadeTorch(near, 1, 1, 1, -1, 0, 0, 1, 0, 0.5, 0, 0, 0.5, torch);
    shadeTorch(far, 1, 1, 1, -1, 0, 0, 4, 0, 0.5, 0, 0, 0.5, torch);
    expect(far.r).toBeLessThan(near.r);
  });

  it("keeps the flame tint: red channel >= blue channel on neutral albedo", () => {
    const lit = shade(-1, 0, 0);
    expect(lit.r).toBeGreaterThan(lit.b);
  });

  it("adds specular on top of diffuse for a mirror-aligned normal", () => {
    // With V == L, R·V = 2(N·L)²−1 maxes out at N·L = 1 → spec fires exactly head-on,
    // so compare against the analytic ambient+diffuse value at distance 1.
    const torch = defaultTorch();
    const lit = shade(-1, 0, 0, torch);
    const att = torch.intensity / (1 + torch.attLinear + torch.attQuad); // d = 1
    const diffuseOnly = torch.ambient + att * torch.r;
    expect(lit.r).toBeGreaterThan(diffuseOnly + 1e-6);
  });
});
