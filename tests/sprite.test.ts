import { describe, expect, it } from "vitest";
import { LinearFramebuffer } from "../src/framebuffer";
import { Player } from "../src/player";
import { gemTexel, keyTexel, projectSprite, renderSprite } from "../src/sprite";
import type { Color } from "../src/types";

const scratch: Color = { r: 0, g: 0, b: 0 };

describe("projectSprite", () => {
  it("puts a sprite dead ahead in the screen center, at its perpendicular depth", () => {
    const p = projectSprite(new Player(0, 0, 0), 4, 0, 320, 200);
    expect(p).not.toBeNull();
    expect(p!.screenX).toBeCloseTo(160);
    expect(p!.depth).toBeCloseTo(4);
    expect(p!.size).toBeCloseTo(200 / 4); // one world unit spans h/depth pixels
  });

  it("puts a sprite left of the view direction left of center", () => {
    // Facing +x, screen-right is +y (the camera plane) — so y=-1 lands left of center.
    const p = projectSprite(new Player(0, 0, 0), 4, -1, 320, 200);
    expect(p!.screenX).toBeLessThan(160);
    expect(p!.depth).toBeCloseTo(4); // perpendicular depth ignores lateral offset
  });

  it("culls sprites behind the camera", () => {
    expect(projectSprite(new Player(0, 0, 0), -4, 0, 320, 200)).toBeNull();
  });
});

describe("renderSprite depth occlusion", () => {
  const opaque = (_u: number, _v: number, out: Color): number => {
    out.r = 1;
    out.g = 1;
    out.b = 1;
    return 1;
  };

  it("draws visible columns and skips columns a wall already covered", () => {
    const fb = new LinearFramebuffer(20, 20);
    const depth = new Float32Array(20).fill(100);
    depth.fill(0.5, 0, 10); // left half: wall closer than the sprite → occluded
    renderSprite(fb, depth, new Player(0, 0, 0), 2, 0, opaque);

    let leftLit = 0;
    let rightLit = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (fb.data[(y * 20 + x) * 3] > 0) {
          if (x < 10) leftLit++;
          else rightLit++;
        }
      }
    }
    expect(rightLit).toBeGreaterThan(0); // open half shows the sprite
    expect(leftLit).toBe(0); // occluded half stays wall
  });

  it("draws nothing when every column is occluded", () => {
    const fb = new LinearFramebuffer(20, 20);
    const depth = new Float32Array(20).fill(0.5);
    renderSprite(fb, depth, new Player(0, 0, 0), 2, 0, opaque);
    expect(Array.from(fb.data).every((v) => v === 0)).toBe(true);
  });
});

describe("renderSprite size options", () => {
  const opaque = (_u: number, _v: number, out: Color): number => {
    out.r = 1;
    out.g = 1;
    out.b = 1;
    return 1;
  };

  it("a smaller size covers fewer pixels", () => {
    const count = (size: number): number => {
      const fb = new LinearFramebuffer(40, 40);
      const depth = new Float32Array(40).fill(100);
      renderSprite(fb, depth, new Player(0, 0, 0), 2, 0, opaque, { size, zCenter: 0.35 });
      let lit = 0;
      for (let i = 0; i < fb.data.length; i += 3) if (fb.data[i] > 0) lit++;
      return lit;
    };
    const big = count(0.45);
    const small = count(0.2);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(big);
  });
});

describe("gemTexel (procedural treasure sprite)", () => {
  it("is transparent at the corners, opaque at the center", () => {
    expect(gemTexel(0.02, 0.02, scratch)).toBe(0);
    expect(gemTexel(0.98, 0.98, scratch)).toBe(0);
    expect(gemTexel(0.5, 0.5, scratch)).toBeGreaterThan(0.5);
  });

  it("glows emerald: green leads red", () => {
    gemTexel(0.5, 0.5, scratch);
    expect(scratch.g).toBeGreaterThan(scratch.r);
  });
});

describe("keyTexel (procedural key sprite)", () => {
  it("is transparent at the texture corners", () => {
    expect(keyTexel(0.02, 0.02, scratch)).toBe(0);
    expect(keyTexel(0.98, 0.98, scratch)).toBe(0);
  });

  it("is opaque gold on the shaft", () => {
    const a = keyTexel(0.5, 0.3, scratch);
    expect(a).toBeGreaterThan(0.5);
    expect(scratch.r).toBeGreaterThan(scratch.b); // gold: red over blue
  });

  it("has a hole in the middle of the bow (it's a ring, not a disc)", () => {
    expect(keyTexel(0.5, 0.72, scratch)).toBe(0);
  });
});
