import { applyBloom } from "./bloom";
import { createDebugPanel, defaultSettings } from "./debug";
import { downsampleInto, LinearFramebuffer } from "./framebuffer";
import { GameState } from "./game";
import { Cell } from "./map";
import { generateDungeon } from "./mapgen";
import { BrickMaterial, CeilingMaterial, DoorMaterial, FloorMaterial, StoneMaterial } from "./material";
import { Player } from "./player";
import { Raycaster, type MaterialSet } from "./raycaster";
import { BakedSampler } from "./sampler";
import { linearToByte } from "./framebuffer";
import { renderHeldTorch, torchFlicker } from "./heldtorch";
import { gemTexel, keyTexel, renderSprite } from "./sprite";

// Internal render resolution; the canvas is scaled up by CSS with nearest-neighbour.
const W = 320;
const H = 200;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
// SSAA renders into a 2× buffer through its own raycaster (each caster's depth array is
// sized to its framebuffer), then box-resolves into `fb` before present.
const SSAA = 2;

const fb = new LinearFramebuffer(W, H);
const fbHi = new LinearFramebuffer(W * SSAA, H * SSAA);
// Bloom scratch (bright-pass + blur ping-pong), display-res: bloom runs after any resolve.
const bloomA = new LinearFramebuffer(W, H);
const bloomB = new LinearFramebuffer(W, H);
// Every playthrough gets a fresh procedural dungeon; ?seed=N reproduces one exactly
// (deterministic generation — same principle as the seeded noise fields).
const urlSeed = Number(new URLSearchParams(location.search).get("seed"));
const seed = Number.isFinite(urlSeed) && urlSeed !== 0 ? urlSeed : (Date.now() % 100000) + 1;
const { map, placements } = generateDungeon(seed);
const player = new Player(placements.spawn.x, placements.spawn.y, 0);
const raycaster = new Raycaster(fb, map);
const raycasterHi = new Raycaster(fbHi, map);

// Bake every procedural material once at startup (~a second of FBm; then the loop is free).
const materials: MaterialSet = {
  walls: new Map([
    [Cell.Stone, new BakedSampler(new StoneMaterial())],
    [Cell.Brick, new BakedSampler(new BrickMaterial())],
    [Cell.Door, new BakedSampler(new DoorMaterial())],
  ]),
  floor: new BakedSampler(new FloorMaterial()),
  ceiling: new BakedSampler(new CeilingMaterial()),
};

// --- input -------------------------------------------------------------------------------
// KeyboardEvent.code = PHYSICAL key, immune to keyboard layout (e.key turns into Hebrew/
// Cyrillic/etc. characters on non-Latin layouts, which silently killed WASD).
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow")) e.preventDefault(); // don't scroll the page
});
addEventListener("keyup", (e) => keys.delete(e.code));
const down = (...codes: string[]) => codes.some((c) => keys.has(c));

const settings = defaultSettings();
const panelRoot = document.getElementById("debug-panel")!;
const fpsEl = createDebugPanel(panelRoot, settings);
const game = new GameState(placements);
const winOverlay = document.getElementById("win-overlay")!;

// --- HUD: icons painted from the SAME texel functions that draw the world sprites -------
/** Rasterize a sprite texel into a tiny HUD canvas; `dim` = not-yet-collected ghost. */
function paintIcon(cv: HTMLCanvasElement, texel: typeof keyTexel, dim: boolean): void {
  const ictx = cv.getContext("2d")!;
  const img = ictx.createImageData(cv.width, cv.height);
  const c = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const a = texel((x + 0.5) / cv.width, 1 - (y + 0.5) / cv.height, c);
      const i = (y * cv.width + x) * 4;
      if (a < 0.5) continue; // transparent — the scene shows through the HUD plate
      if (dim) {
        // Ghost slot: flat grey silhouette says "this exists, you don't have it yet".
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 150;
        img.data[i + 3] = 90;
      } else {
        img.data[i] = linearToByte(c.r);
        img.data[i + 1] = linearToByte(c.g);
        img.data[i + 2] = linearToByte(c.b);
        img.data[i + 3] = 255;
      }
    }
  }
  ictx.putImageData(img, 0, 0);
}
const hudGems = document.getElementById("hud-gems")!;
const hudKeyCv = document.getElementById("hud-key") as HTMLCanvasElement;
document.getElementById("hud-seed")!.textContent = `seed ${seed}`;
paintIcon(document.getElementById("hud-gem") as HTMLCanvasElement, gemTexel, false);
paintIcon(hudKeyCv, keyTexel, true);
let hudHadKey = false;
const updateHud = (): void => {
  hudGems.textContent = `${game.collected}/${game.treasures.length}`;
  if (game.hasKey && !hudHadKey) {
    hudHadKey = true;
    paintIcon(hudKeyCv, keyTexel, false); // the ghost lights up gold on pickup
  }
};
updateHud();

/** Key + surviving gems, painter-sorted far→near so overlapping billboards layer right. */
function drawSprites(buf: LinearFramebuffer, caster: Raycaster): void {
  const sprites: { x: number; y: number; draw: () => void }[] = [];
  if (!game.hasKey) {
    sprites.push({
      x: placements.key.x,
      y: placements.key.y,
      draw: () =>
        renderSprite(buf, caster.depth, player, placements.key.x, placements.key.y, keyTexel),
    });
  }
  for (const t of game.treasures) {
    if (t.taken) continue;
    sprites.push({
      x: t.x,
      y: t.y,
      draw: () =>
        renderSprite(buf, caster.depth, player, t.x, t.y, gemTexel, { size: 0.28, zCenter: 0.3 }),
    });
  }
  const d2 = (s: { x: number; y: number }) =>
    (s.x - player.x) ** 2 + (s.y - player.y) ** 2;
  sprites.sort((a, b) => d2(b) - d2(a));
  for (const s of sprites) s.draw();
}
let fpsFrames = 0;
let fpsTime = 0;

const MOVE_SPEED = 2.6; // units/sec (turn speed lives in settings — panel slider)

// --- game loop ---------------------------------------------------------------------------
let last = performance.now();
function frame(now: number): void {
  // Clamp dt so a background tab doesn't teleport the player through geometry on resume.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const run = down("ShiftLeft", "ShiftRight") ? 1.8 : 1;
  const forward = (down("KeyW", "ArrowUp") ? 1 : 0) - (down("KeyS", "ArrowDown") ? 1 : 0);
  const strafe = (down("KeyD") ? 1 : 0) - (down("KeyA") ? 1 : 0);
  const turn = (down("ArrowRight", "KeyE") ? 1 : 0) - (down("ArrowLeft", "KeyQ") ? 1 : 0);

  player.turn(turn * settings.turnSpeed * dt);
  player.move(map, forward * MOVE_SPEED * run, strafe * MOVE_SPEED * run, dt);

  game.update(player, map);
  if (game.won) winOverlay.style.display = "flex";
  updateHud();

  // The flame's breathing modulates the real point light: mutate the torch intensity for
  // this render, restore after, so the slider keeps owning the base value.
  const tSec = now / 1000;
  const baseIntensity = settings.torch.intensity;
  settings.torch.intensity = baseIntensity * torchFlicker(tSec);

  // Sprites draw into whichever buffer the walls just rendered to, using ITS depth buffer,
  // so SSAA smooths their edges like everything else.
  if (settings.ssaa) {
    raycasterHi.render(player, materials, settings);
    drawSprites(fbHi, raycasterHi);
    renderHeldTorch(fbHi, tSec);
    downsampleInto(fbHi, fb, SSAA);
  } else {
    raycaster.render(player, materials, settings);
    drawSprites(fb, raycaster);
    renderHeldTorch(fb, tSec);
  }
  settings.torch.intensity = baseIntensity;
  if (settings.bloom) {
    applyBloom(fb, bloomA, bloomB, {
      threshold: settings.bloomThreshold,
      strength: settings.bloomStrength,
    });
  }
  fb.present(ctx);

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} fps`;
    fpsFrames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
