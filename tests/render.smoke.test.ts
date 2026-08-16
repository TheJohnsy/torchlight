import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultSettings, type RenderMode } from "../src/debug";
import { downsampleInto, LinearFramebuffer, linearToByte } from "../src/framebuffer";
import { Cell, level1 } from "../src/map";
import {
  BrickMaterial,
  CeilingMaterial,
  CrackedStoneMaterial,
  DoorMaterial,
  FloorMaterial,
  MarbleMaterial,
  StoneMaterial,
} from "../src/material";
import { Player } from "../src/player";
import { Raycaster, type MaterialSet } from "../src/raycaster";
import { BakedSampler } from "../src/sampler";

/**
 * Headless end-to-end smoke test: run the REAL pipeline (map → raycast → materials →
 * lighting) into the framebuffer with no canvas involved, assert frame-level invariants,
 * and dump PPMs to .preview/ for eyeballing. This is how the whole renderer gets verified
 * in CI, where there is no browser.
 */

const W = 320;
const H = 200;

const fb = new LinearFramebuffer(W, H);
const map = level1();
const raycaster = new Raycaster(fb, map);
const materials: MaterialSet = {
  walls: new Map([
    [Cell.Stone, new BakedSampler(new StoneMaterial(), 128)],
    [Cell.Brick, new BakedSampler(new BrickMaterial(), 128)],
    [Cell.Door, new BakedSampler(new DoorMaterial(), 128)],
  ]),
  floor: new BakedSampler(new FloorMaterial(), 128),
  ceiling: new BakedSampler(new CeilingMaterial(), 128),
};

function renderFrame(mode: RenderMode, px: number, py: number, angle: number): void {
  const settings = defaultSettings();
  settings.mode = mode;
  raycaster.render(new Player(px, py, angle), materials, settings);
}

function dumpPPM(name: string): void {
  mkdirSync(".preview", { recursive: true });
  const header = `P6\n${W} ${H}\n255\n`;
  const bytes = new Uint8Array(header.length + W * H * 3);
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i);
  for (let i = 0; i < W * H * 3; i++) bytes[header.length + i] = linearToByte(fb.data[i]);
  writeFileSync(`.preview/${name}.ppm`, bytes);
}

function frameStats(): { mean: number; nonBlack: number; distinct: number } {
  let sum = 0;
  let nonBlack = 0;
  const seen = new Set<number>();
  for (let i = 0; i < fb.data.length; i += 3) {
    const l = (fb.data[i] + fb.data[i + 1] + fb.data[i + 2]) / 3;
    sum += l;
    if (l > 0.01) nonBlack++;
    seen.add((linearToByte(fb.data[i]) << 16) | (linearToByte(fb.data[i + 1]) << 8) | linearToByte(fb.data[i + 2]));
  }
  const n = fb.data.length / 3;
  return { mean: sum / n, nonBlack: nonBlack / n, distinct: seen.size };
}

describe("full-pipeline smoke render", () => {
  it("renders a lit, textured, non-degenerate frame from spawn", () => {
    renderFrame("full", 1.5, 1.5, 0.4);
    dumpPPM("spawn-full");
    const s = frameStats();
    expect(s.nonBlack).toBeGreaterThan(0.5); // torch reaches most of the frame
    expect(s.mean).toBeGreaterThan(0.01); // not a black screen
    expect(s.mean).toBeLessThan(0.9); // not blown out either
    expect(s.distinct).toBeGreaterThan(2000); // real texture/lighting variety, not flat fills
  });

  it("torch lighting falls off with distance (center of a long view is darker up close than a near wall)", () => {
    // Face straight down the long top corridor: the far wall should be dimmer than a
    // close-up wall thanks to attenuation.
    renderFrame("full", 1.5, 1.5, 0);
    const farLum = fb.data[(100 * W + 160) * 3];
    renderFrame("full", 10.6, 1.5, 0); // nose up against the x=11 wall column
    const nearLum = fb.data[(100 * W + 160) * 3];
    expect(nearLum).toBeGreaterThan(farLum);
  });

  it("albedo mode is flat-lit (no distance falloff), normals mode is colorful", () => {
    renderFrame("albedo", 1.5, 1.5, 0.4);
    dumpPPM("spawn-albedo");
    const albedoStats = frameStats();
    renderFrame("normals", 1.5, 1.5, 0.4);
    dumpPPM("spawn-normals");
    const normalStats = frameStats();
    expect(albedoStats.nonBlack).toBeGreaterThan(0.99); // albedo ignores the torch entirely
    expect(normalStats.nonBlack).toBeGreaterThan(0.99); // encoded normals are never black
  });

  it("2× supersampled resolve matches the 1× frame in brightness but differs at edges", () => {
    renderFrame("full", 1.5, 1.5, 0.4);
    const base = Float32Array.from(fb.data);
    const baseMean = frameStats().mean;

    // Same frame through the SSAA path: render 2× hi-res, box-resolve into fb.
    const fbHi = new LinearFramebuffer(W * 2, H * 2);
    const hiCaster = new Raycaster(fbHi, map);
    const settings = defaultSettings();
    hiCaster.render(new Player(1.5, 1.5, 0.4), materials, settings);
    downsampleInto(fbHi, fb, 2);
    dumpPPM("spawn-ssaa");

    const s = frameStats();
    // Averaging shouldn't change what the frame IS — same scene, same overall exposure.
    expect(Math.abs(s.mean - baseMean)).toBeLessThan(0.02);
    expect(s.nonBlack).toBeGreaterThan(0.5);
    // ...but it must actually change pixels (edge smoothing), else the toggle is a no-op.
    let changed = 0;
    for (let i = 0; i < base.length; i += 3) {
      if (Math.abs(fb.data[i] - base[i]) > 0.01) changed++;
    }
    expect(changed / (base.length / 3)).toBeGreaterThan(0.05);
  });

  it("renders the glowing key sprite into the real scene with real wall depth", async () => {
    const { keyTexel, renderSprite } = await import("../src/sprite");
    const { KEY_POS } = await import("../src/game");
    // Stand two tiles east of the key, facing it (west = angle π).
    const player = new Player(KEY_POS.x + 2, KEY_POS.y, Math.PI);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings);
    renderSprite(fb, raycaster.depth, player, KEY_POS.x, KEY_POS.y, keyTexel);
    dumpPPM("key-sprite");

    // The key is emissive gold (>1 linear red) — nothing else in the dungeon gets there.
    let golden = 0;
    for (let i = 0; i < fb.data.length; i += 3) {
      if (fb.data[i] > 1 && fb.data[i] > fb.data[i + 1] && fb.data[i + 1] > fb.data[i + 2]) golden++;
    }
    expect(golden).toBeGreaterThan(20);
  });

  it("renders the slime mob sprite into a generated dungeon with real wall depth", async () => {
    const { mobTexel, renderSprite } = await import("../src/sprite");
    const { generateDungeon } = await import("../src/mapgen");
    const { map: genMap, placements } = generateDungeon(7);
    const genCaster = new Raycaster(fb, genMap);
    const settings = defaultSettings();
    // Stand half a tile west of the mob, facing it (east = angle 0) — close enough to stay
    // inside the mob's own floor tile, so there's no wall in between regardless of seed.
    const player = new Player(placements.mob.x - 0.5, placements.mob.y, 0);
    genCaster.render(player, materials, settings);
    renderSprite(fb, genCaster.depth, player, placements.mob.x, placements.mob.y, mobTexel, {
      size: 0.5,
      zCenter: 0.25,
    });
    dumpPPM("mob-sprite");

    // Slime green: some pixel should have g clearly leading r and b (unlike stone/floor).
    let slimeGreen = 0;
    for (let i = 0; i < fb.data.length; i += 3) {
      if (fb.data[i + 1] > fb.data[i] * 1.5 && fb.data[i + 1] > fb.data[i + 2] * 1.5) slimeGreen++;
    }
    expect(slimeGreen).toBeGreaterThan(20);
  });

  it("renders a procedurally generated dungeon end-to-end", async () => {
    const { generateDungeon } = await import("../src/mapgen");
    const { map: genMap, placements } = generateDungeon(7);
    const genCaster = new Raycaster(fb, genMap);
    const settings = defaultSettings();
    // Face along +x from spawn — generated rooms are ≥3 wide so something is in view.
    genCaster.render(
      new Player(placements.spawn.x, placements.spawn.y, 0.4),
      materials,
      settings,
    );
    dumpPPM("gen-dungeon");
    const s = frameStats();
    expect(s.nonBlack).toBeGreaterThan(0.5);
    expect(s.mean).toBeGreaterThan(0.01);
    expect(s.distinct).toBeGreaterThan(2000);
  });

  it("offsetting the torch light position visibly shifts the wall lighting", () => {
    renderFrame("full", 1.5, 1.5, 0);
    const base = Float32Array.from(fb.data);
    raycaster.render(
      new Player(1.5, 1.5, 0),
      materials,
      defaultSettings(),
      { x: 0.25, y: 0.15, z: 0.08 }, // a hand-wave of torch movement
    );
    let changed = 0;
    for (let i = 0; i < base.length; i += 3) {
      if (Math.abs(fb.data[i] - base[i]) > 0.003) changed++;
    }
    // The highlight and falloff must crawl across a good chunk of the frame — this is
    // the "shadows dance with the flame" effect, so a near-identical frame is a failure.
    expect(changed / (base.length / 3)).toBeGreaterThan(0.2);
  });

  it("a mid-swing doorProgress pulses the vault door with an unlock glow", () => {
    // Stand in the room above the door (18,11), facing straight down at it.
    const player = new Player(18.5, 10.9, Math.PI / 2);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings, undefined, 0); // shut, no glow
    const shut = Float32Array.from(fb.data);
    raycaster.render(player, materials, settings, undefined, 0.3); // mid-swing
    dumpPPM("door-glow");

    let changed = 0;
    for (let i = 0; i < shut.length; i++) {
      if (Math.abs(fb.data[i] - shut[i]) > 0.01) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it("doorProgress 0 and 1 both render with no glow (shut vs. fully open, no mid-pulse)", () => {
    const player = new Player(18.5, 10.9, Math.PI / 2);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings, undefined, 0);
    const at0 = Float32Array.from(fb.data);
    raycaster.render(player, materials, settings, undefined, 1);
    const at1 = Float32Array.from(fb.data);
    // Same door material/lighting either way — only the mid-swing pulse should differ.
    for (let i = 0; i < at0.length; i++) {
      expect(at1[i]).toBeCloseTo(at0[i], 5);
    }
  });

  it("a vaultFloor region override swaps the floor material only inside its bounds (roadmap E4)", () => {
    // Look straight down at the floor from inside the vault (bottom-right room, LEVEL_1).
    const player = new Player(20, 13.5, -Math.PI / 2);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings);
    const plain = Float32Array.from(fb.data);

    const withVaultFloor: MaterialSet = {
      ...materials,
      vaultFloor: {
        sampler: new BakedSampler(new MarbleMaterial(), 128),
        bounds: { x0: 18, y0: 12, x1: 23, y1: 15 }, // VAULT, from game.ts
      },
    };
    raycaster.render(player, withVaultFloor, settings);
    dumpPPM("vault-floor-marble");

    let changed = 0;
    for (let i = 0; i < plain.length; i++) {
      if (Math.abs(fb.data[i] - plain[i]) > 0.01) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it("a vaultFloor override leaves floor OUTSIDE its bounds untouched", () => {
    // Same look-straight-down setup, but from the spawn room — well outside the vault rect.
    const player = new Player(2, 2, -Math.PI / 2);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings);
    const plain = Float32Array.from(fb.data);

    const withVaultFloor: MaterialSet = {
      ...materials,
      vaultFloor: {
        sampler: new BakedSampler(new MarbleMaterial(), 128),
        bounds: { x0: 18, y0: 12, x1: 23, y1: 15 },
      },
    };
    raycaster.render(player, withVaultFloor, settings);
    expect(Array.from(fb.data)).toEqual(Array.from(plain));
  });

  it("a crackedStone region override swaps ONLY Stone walls inside its bounds (roadmap E4)", () => {
    // Face straight up at the top border wall (all Stone) from just inside it.
    const player = new Player(5, 1.4, -Math.PI / 2);
    const settings = defaultSettings();
    raycaster.render(player, materials, settings);
    const plain = Float32Array.from(fb.data);

    const withCracked: MaterialSet = {
      ...materials,
      crackedStone: {
        sampler: new BakedSampler(new CrackedStoneMaterial(), 128),
        bounds: { x0: 0, y0: 0, x1: 24, y1: 1 }, // the whole top wall row
      },
    };
    raycaster.render(player, withCracked, settings);
    dumpPPM("cracked-stone-band");

    let changed = 0;
    for (let i = 0; i < plain.length; i++) {
      if (Math.abs(fb.data[i] - plain[i]) > 0.01) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  it("depth buffer holds sane perpendicular distances after a frame", () => {
    renderFrame("full", 1.5, 1.5, 0);
    for (let x = 0; x < W; x++) {
      expect(raycaster.depth[x]).toBeGreaterThan(0);
      expect(raycaster.depth[x]).toBeLessThan(32); // nothing farther than the map diagonal
    }
  });
});
