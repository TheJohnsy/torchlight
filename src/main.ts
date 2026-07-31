import { defaultSettings } from "./debug";
import { LinearFramebuffer } from "./framebuffer";
import { Cell, level1 } from "./map";
import { BrickMaterial, CeilingMaterial, FloorMaterial, StoneMaterial } from "./material";
import { Player } from "./player";
import { Raycaster, type MaterialSet } from "./raycaster";
import { BakedSampler } from "./sampler";

// Internal render resolution; the canvas is scaled up by CSS with nearest-neighbour.
const W = 320;
const H = 200;

const canvas = document.getElementById("view") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const fb = new LinearFramebuffer(W, H);
const map = level1();
const player = new Player(1.5, 1.5, 0);
const raycaster = new Raycaster(fb, map);

// Bake every procedural material once at startup (~a second of FBm; then the loop is free).
const materials: MaterialSet = {
  walls: new Map([
    [Cell.Stone, new BakedSampler(new StoneMaterial())],
    [Cell.Brick, new BakedSampler(new BrickMaterial())],
  ]),
  floor: new BakedSampler(new FloorMaterial()),
  ceiling: new BakedSampler(new CeilingMaterial()),
};

// --- input -------------------------------------------------------------------------------
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.startsWith("Arrow")) e.preventDefault(); // don't scroll the page
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const down = (...ks: string[]) => ks.some((k) => keys.has(k));

const settings = defaultSettings();

const MOVE_SPEED = 2.6; // units/sec
const TURN_SPEED = 2.4; // rad/sec

// --- game loop ---------------------------------------------------------------------------
let last = performance.now();
function frame(now: number): void {
  // Clamp dt so a background tab doesn't teleport the player through geometry on resume.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const run = down("shift") ? 1.8 : 1;
  const forward = (down("w", "arrowup") ? 1 : 0) - (down("s", "arrowdown") ? 1 : 0);
  const strafe = (down("d") ? 1 : 0) - (down("a") ? 1 : 0);
  const turn = (down("arrowright", "e") ? 1 : 0) - (down("arrowleft", "q") ? 1 : 0);

  player.turn(turn * TURN_SPEED * dt);
  player.move(map, forward * MOVE_SPEED * run, strafe * MOVE_SPEED * run, dt);

  raycaster.render(player, materials, settings);
  fb.present(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
