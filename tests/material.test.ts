import { describe, expect, it } from "vitest";
import {
  BrickMaterial,
  CeilingMaterial,
  DoorMaterial,
  FloorMaterial,
  heightToNormal,
  StoneMaterial,
} from "../src/material";
import type { Material } from "../src/types";

const MATERIALS: [string, Material][] = [
  ["stone", new StoneMaterial()],
  ["brick", new BrickMaterial()],
  ["floor", new FloorMaterial()],
  ["ceiling", new CeilingMaterial()],
  ["door", new DoorMaterial()],
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
