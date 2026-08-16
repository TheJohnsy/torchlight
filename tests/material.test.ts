import { describe, expect, it } from "vitest";
import {
  BrickMaterial,
  CeilingMaterial,
  CrackedStoneMaterial,
  DoorMaterial,
  FloorMaterial,
  heightToNormal,
  MarbleMaterial,
  StoneMaterial,
} from "../src/material";
import type { Material } from "../src/types";

const MATERIALS: [string, Material][] = [
  ["stone", new StoneMaterial()],
  ["brick", new BrickMaterial()],
  ["floor", new FloorMaterial()],
  ["ceiling", new CeilingMaterial()],
  ["door", new DoorMaterial()],
  ["marble", new MarbleMaterial()],
  ["cracked stone", new CrackedStoneMaterial()],
];

describe.each(MATERIALS)("%s material", (_name, mat) => {
  it("returns albedo channels in [0,1]", () => {
    for (let i = 0; i < 400; i++) {
      const u = (i * 0.937) % 1;
      const v = (i * 0.413) % 1;
      const { r, g, b } = mat.albedo(u, v);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns unit-length tangent-space normals pointing out of the surface", () => {
    for (let i = 0; i < 400; i++) {
      const u = (i * 0.937) % 1;
      const v = (i * 0.413) % 1;
      const n = mat.normal(u, v);
      const len = Math.hypot(n.x, n.y, n.z);
      expect(len).toBeCloseTo(1, 5);
      expect(n.z).toBeGreaterThan(0); // +z is out of the surface, always
    }
  });
});

describe("heightToNormal", () => {
  it("returns +z for a flat field", () => {
    const n = heightToNormal(() => 0.5, 0.3, 0.7, 1);
    expect(n.x).toBeCloseTo(0, 10);
    expect(n.y).toBeCloseTo(0, 10);
    expect(n.z).toBeCloseTo(1, 10);
  });

  it("tilts against an upward slope in u", () => {
    // Height rises with u → surface faces back toward -u.
    const n = heightToNormal((u) => u, 0.5, 0.5, 1);
    expect(n.x).toBeLessThan(0);
    expect(Math.abs(n.y)).toBeLessThan(1e-6);
  });

  it("scales tilt with strength", () => {
    const weak = heightToNormal((u) => u, 0.5, 0.5, 0.1);
    const strong = heightToNormal((u) => u, 0.5, 0.5, 2);
    expect(Math.abs(strong.x)).toBeGreaterThan(Math.abs(weak.x));
  });
});

describe("door material", () => {
  const door = new DoorMaterial();

  it("has groove gaps between planks (height dips at plank seams)", () => {
    // 4 planks across → seams at u = 0.25, 0.5, 0.75; face centers halfway between.
    const seam = door.height(0.5, 0.4);
    const face = door.height(0.375, 0.4);
    expect(seam).toBeLessThan(face);
  });

  it("looks like wood: warm brown with red over green over blue", () => {
    const { r, g, b } = door.albedo(0.375, 0.4); // plank face, away from seams
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("brick height field", () => {
  it("is lower in the mortar groove than on the brick face", () => {
    const brick = new BrickMaterial();
    // lv=0 is a horizontal mortar line; the face center of the same brick sits at lv=0.5.
    const mortar = brick.height(0.3, 0); // row boundary
    const face = brick.height(0.3, 0.125); // center of row 0 (rows=4 → lv=0.5)
    expect(mortar).toBeLessThan(face);
  });
});

describe("marble material (roadmap E4)", () => {
  const marble = new MarbleMaterial();

  it("ripples: the height field is not a flat plane or a simple linear ramp", () => {
    const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((u) =>
      marble.height(u, 0.5),
    );
    // A sine-of-turbulence field must go up AND down somewhere across a full tile.
    let rose = false, fell = false;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i] > samples[i - 1]) rose = true;
      if (samples[i] < samples[i - 1]) fell = true;
    }
    expect(rose).toBe(true);
    expect(fell).toBe(true);
  });

  it("veins read as a cooler, darker grey-blue than the pale stone base", () => {
    // Find a low-height (vein) sample and a high-height (base) sample, compare their albedo.
    let veinUV: [number, number] | null = null;
    let baseUV: [number, number] | null = null;
    for (let i = 0; i < 50 && (!veinUV || !baseUV); i++) {
      const u = i / 50;
      const h = marble.height(u, 0.5);
      if (h < 0.15 && !veinUV) veinUV = [u, 0.5];
      if (h > 0.85 && !baseUV) baseUV = [u, 0.5];
    }
    expect(veinUV).not.toBeNull();
    expect(baseUV).not.toBeNull();
    const vein = marble.albedo(...(veinUV as [number, number]));
    const base = marble.albedo(...(baseUV as [number, number]));
    expect(vein.r + vein.g + vein.b).toBeLessThan(base.r + base.g + base.b);
  });
});

describe("cracked stone material (roadmap E4)", () => {
  const cracked = new CrackedStoneMaterial();
  const stone = new StoneMaterial();

  it("Worley-carved pits gouge the height field down from the plain stone base", () => {
    // Scan for the deepest pit within a tile; it should read meaningfully lower than the
    // corresponding plain-stone height at the same UV (the crack term only ever subtracts).
    let deepest = Infinity;
    let deepestUV: [number, number] = [0, 0];
    for (let u = 0; u < 1; u += 0.05) {
      for (let v = 0; v < 1; v += 0.05) {
        const h = cracked.height(u, v);
        if (h < deepest) {
          deepest = h;
          deepestUV = [u, v];
        }
      }
    }
    const plain = stone.height(...deepestUV);
    expect(deepest).toBeLessThan(plain);
  });
});
