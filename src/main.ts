import { applyBloom } from "./bloom";
import { TorchAttack } from "./combat";
import { Dash } from "./dash";
import { createDebugPanel, defaultSettings } from "./debug";
import { downsampleInto, LinearFramebuffer } from "./framebuffer";
import { GameState } from "./game";
import { Cell } from "./map";
import { generateDungeon } from "./mapgen";
import {
  BrickMaterial,
  CeilingMaterial,
  CrackedStoneMaterial,
  DoorMaterial,
  FloorMaterial,
  MarbleMaterial,
  StoneMaterial,
} from "./material";
import { Mob } from "./mob";
import { applyRadialBlur } from "./motionblur";
import { linearToByte } from "./framebuffer";
import { renderHeldTorch, torchFlicker, torchSway } from "./heldtorch";
import { drawMinimap, MINIMAP_CELL_PX, type MinimapMarker } from "./minimap";
import { ParticleSystem } from "./particles";
import { Player } from "./player";
import { Fireball, FireballLauncher } from "./projectile";
import { Raycaster, type MaterialSet } from "./raycaster";
import { BakedSampler } from "./sampler";
import {
  fireTexel,
  gemTexel,
  heartTexel,
  keyFloat,
  keyTexel,
  makeBossTexel,
  mobTexel,
  renderSprite,
} from "./sprite";

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
// Dash's post-surge radial blur reuses one more display-res scratch buffer.
const blurScratch = new LinearFramebuffer(W, H);
// Every playthrough gets a fresh procedural dungeon; ?seed=N reproduces one exactly
// (deterministic generation — same principle as the seeded noise fields).
const urlSeed = Number(new URLSearchParams(location.search).get("seed"));
const seed = Number.isFinite(urlSeed) && urlSeed !== 0 ? urlSeed : (Date.now() % 100000) + 1;
const { map, placements } = generateDungeon(seed);
const player = new Player(placements.spawn.x, placements.spawn.y, 0);
const raycaster = new Raycaster(fb, map);
const raycasterHi = new Raycaster(fbHi, map);

// Minimap (roadmap E6): sized from the actual generated map, not hardcoded — stays correct
// if mapgen's WIDTH/HEIGHT ever change. CSS then scales the native buffer 2× for legibility,
// same "native-res, CSS-scaled-up crisp" pattern as #view.
const minimapCanvas = document.getElementById("minimap") as HTMLCanvasElement;
minimapCanvas.width = map.width * MINIMAP_CELL_PX;
minimapCanvas.height = map.height * MINIMAP_CELL_PX;
minimapCanvas.style.width = `${minimapCanvas.width * 2}px`;
minimapCanvas.style.height = `${minimapCanvas.height * 2}px`;
const minimapCtx = minimapCanvas.getContext("2d")!;

// Bake every procedural material once at startup (~a second of FBm; then the loop is free).
const materials: MaterialSet = {
  walls: new Map([
    [Cell.Stone, new BakedSampler(new StoneMaterial())],
    [Cell.Brick, new BakedSampler(new BrickMaterial())],
    [Cell.Door, new BakedSampler(new DoorMaterial())],
  ]),
  floor: new BakedSampler(new FloorMaterial()),
  ceiling: new BakedSampler(new CeilingMaterial()),
  // Region overrides (roadmap E4): marble in the vault's floor, cracked stone around the
  // key's room — by world position, not a new Cell type (see raycaster.ts's MaterialSet).
  vaultFloor: { sampler: new BakedSampler(new MarbleMaterial()), bounds: placements.vault },
  crackedStone: {
    sampler: new BakedSampler(new CrackedStoneMaterial()),
    bounds: placements.keyRoomBounds,
  },
};

// --- input -------------------------------------------------------------------------------
// KeyboardEvent.code = PHYSICAL key, immune to keyboard layout (e.key turns into Hebrew/
// Cyrillic/etc. characters on non-Latin layouts, which silently killed WASD).
const keys = new Set<string>();
addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault(); // don't scroll the page
});
addEventListener("keyup", (e) => keys.delete(e.code));
const down = (...codes: string[]) => codes.some((c) => keys.has(c));

const settings = defaultSettings();
const panelRoot = document.getElementById("debug-panel")!;
const fpsEl = createDebugPanel(panelRoot, settings);
const game = new GameState(placements);
const mob = new Mob(placements.mob.x, placements.mob.y);
let mobWasAlive = true; // edge-detects the kill so the death burst/gem drop fires exactly once

// Boss (roadmap E5): tougher, slower, planted guarding the key's room. Reuses the Mob class
// via MobOptions instead of forking a parallel type — combat/AI/hit-flash all Just Work.
const boss = new Mob(placements.boss.x, placements.boss.y, {
  radius: 0.4,
  maxHp: 6, // tuned down from 10 — was outlasting the player's 3 hearts
  speed: 0.6,
  lungeSpeed: 1.1,
  lungeRange: 1.8,
  knockbackDistance: 1.1,
  hitCooldown: 1.3, // tuned up from 0.9 — more breathing room between its own hits
  hitKnockbackDistance: 1.0, // tuned up from 0.5 — punched back a real distance on a landed swing
});
let bossWasAlive = true;
let bossHpPrev = boss.hp; // edge-detects a non-lethal hit, for the per-hit particle burst

// Combat (roadmap E1.5): torch swing, fireball skill, dash, and the particle burst they feed.
const attack = new TorchAttack();
const launcher = new FireballLauncher();
const fireballs: Fireball[] = [];
const dash = new Dash();
const particles = new ParticleSystem();

const winOverlay = document.getElementById("win-overlay")!;
const deathOverlay = document.getElementById("death-overlay")!;
document.getElementById("death-seed")!.textContent = `seed ${seed}`;

// --- HUD: icons painted from the SAME texel functions that draw the world sprites -------
/** Rasterize a sprite texel into a tiny HUD canvas; `dim` = not-yet-collected/lost ghost. */
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
        // Ghost slot: flat grey silhouette says "this exists, you don't have it (right now)".
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
const hudHeartCvs = [0, 1, 2].map((i) => document.getElementById(`hud-heart-${i}`) as HTMLCanvasElement);
const hudFireballFill = document.getElementById("hud-fireball-fill")!;
document.getElementById("hud-seed")!.textContent = `seed ${seed}`;
paintIcon(document.getElementById("hud-gem") as HTMLCanvasElement, gemTexel, false);
paintIcon(hudKeyCv, keyTexel, true);
paintIcon(document.getElementById("hud-fireball") as HTMLCanvasElement, fireTexel, false);
let hudHadKey = false;
let hudHearts = -1; // forces the first paint
const updateHud = (): void => {
  hudGems.textContent = `${game.collected}/${game.treasures.length}`;
  if (game.hasKey && !hudHadKey) {
    hudHadKey = true;
    paintIcon(hudKeyCv, keyTexel, false); // the ghost lights up gold on pickup
  }
  if (game.hearts !== hudHearts) {
    hudHearts = game.hearts;
    hudHeartCvs.forEach((cv, i) => paintIcon(cv, heartTexel, i >= game.hearts));
  }
  hudFireballFill.style.width = `${Math.max(0, Math.min(1, launcher.readiness())) * 100}%`;
};
updateHud();

/** Key/gems/mob/fireballs/particles, painter-sorted far→near so overlapping billboards layer right. */
function drawSprites(buf: LinearFramebuffer, caster: Raycaster, tSec: number): void {
  const sprites: { x: number; y: number; draw: () => void }[] = [];
  if (!game.hasKey) {
    const floatZ = 0.35 + keyFloat(tSec);
    sprites.push({
      x: placements.key.x,
      y: placements.key.y,
      draw: () =>
        renderSprite(buf, caster.depth, player, placements.key.x, placements.key.y, keyTexel, {
          size: 0.45,
          zCenter: floatZ,
        }),
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
  if (mob.alive) {
    // Hit-flash: while the swing/fireball's white flash is running, override to a bright
    // near-white so the hit reads clearly, then fall back to the normal slime texel.
    const texel = mob.flashing
      ? (u: number, v: number, out: { r: number; g: number; b: number }): number => {
          const a = mobTexel(u, v, out);
          if (a > 0) {
            out.r = 1.5;
            out.g = 1.5;
            out.b = 1.5;
          }
          return a;
        }
      : mobTexel;
    const shake = mob.shakeOffset(); // draw-only jitter — never mutates mob.x/y
    sprites.push({
      x: mob.x,
      y: mob.y,
      draw: () =>
        renderSprite(buf, caster.depth, player, mob.x + shake.x, mob.y + shake.y, texel, {
          size: 0.5,
          zCenter: 0.25 + mob.bobOffset(),
        }),
    });
  }
  if (boss.alive) {
    // Same hit-flash override as the regular slime, layered on top of whatever the
    // health-driven eye-pulse texel (makeBossTexel) is doing that frame.
    const base = makeBossTexel(boss.hp / boss.maxHp, tSec);
    const texel = boss.flashing
      ? (u: number, v: number, out: { r: number; g: number; b: number }): number => {
          const a = base(u, v, out);
          if (a > 0) {
            out.r = 1.5;
            out.g = 1.5;
            out.b = 1.5;
          }
          return a;
        }
      : base;
    const shake = boss.shakeOffset();
    sprites.push({
      x: boss.x,
      y: boss.y,
      draw: () =>
        renderSprite(buf, caster.depth, player, boss.x + shake.x, boss.y + shake.y, texel, {
          size: 0.85,
          zCenter: 0.35 + boss.bobOffset(),
        }),
    });
  }
  for (const f of fireballs) {
    const trailLen = f.trail.length;
    f.trail.forEach((p, i) => {
      const t = 1 - i / trailLen;
      sprites.push({
        x: p.x,
        y: p.y,
        draw: () =>
          renderSprite(buf, caster.depth, player, p.x, p.y, fireTexel, {
            size: 0.14 * t,
            zCenter: 0.3,
          }),
      });
    });
    sprites.push({
      x: f.x,
      y: f.y,
      draw: () => renderSprite(buf, caster.depth, player, f.x, f.y, fireTexel, { size: 0.18, zCenter: 0.3 }),
    });
  }
  const d2 = (s: { x: number; y: number }) =>
    (s.x - player.x) ** 2 + (s.y - player.y) ** 2;
  sprites.sort((a, b) => d2(b) - d2(a));
  for (const s of sprites) s.draw();
  particles.draw(buf, caster.depth, player);
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

  if (game.dead) {
    deathOverlay.style.display = "flex";
    if (down("KeyR")) location.search = `?seed=${seed}`; // reload into the same dungeon
    requestAnimationFrame(frame);
    return;
  }

  const run = down("ShiftLeft", "ShiftRight") ? 1.8 : 1;
  const forward = (down("KeyW", "ArrowUp") ? 1 : 0) - (down("KeyS", "ArrowDown") ? 1 : 0);
  const strafe = (down("KeyD") ? 1 : 0) - (down("KeyA") ? 1 : 0);
  const turn = (down("ArrowRight", "KeyE") ? 1 : 0) - (down("ArrowLeft", "KeyQ") ? 1 : 0);

  player.turn(turn * settings.turnSpeed * dt);
  player.move(map, forward * MOVE_SPEED * run, strafe * MOVE_SPEED * run, dt);
  if (mob.update(dt, player, map)) game.damagePlayer();
  if (boss.update(dt, player, map)) game.damagePlayer();

  // Torch swing: held so a press auto-repeats once the swing/cooldown clears. Both enemies
  // are eligible targets (roadmap E5) — one swing still lands on at most one of them.
  if (down("Space")) attack.trigger();
  attack.update(dt, player, [mob, boss], map);

  // Fireball: cooldown-gated, same auto-repeat-while-held feel as the swing.
  if (down("KeyF")) {
    const bolt = launcher.fire(player.x, player.y, player.dirX, player.dirY);
    if (bolt) fireballs.push(bolt);
  }
  launcher.tick(dt);
  for (const bolt of fireballs) bolt.update(dt, map, [mob, boss]);
  for (let i = fireballs.length - 1; i >= 0; i--) {
    if (!fireballs[i].alive) fireballs.splice(i, 1);
  }

  // Dash: an instant forward burst with a fading radial "speed" blur (motionblur.ts).
  if (down("KeyV")) dash.trigger(player, map);
  dash.update(dt);

  // Mob death (from either the swing or a fireball): one particle burst, one gem drop.
  if (mobWasAlive && !mob.alive) {
    particles.burst(mob.x, mob.y, 0.3, 14, { r: 0.25, g: 0.95, b: 0.35 });
    game.treasures.push({ x: mob.x, y: mob.y, taken: false });
  }
  mobWasAlive = mob.alive;

  // Boss hit particles (roadmap E5 "particle hits"): a small burst on every non-lethal hit,
  // not just the kill, so the fight reads as an ongoing beating rather than one flash.
  if (boss.alive && boss.hp < bossHpPrev) {
    particles.burst(boss.x, boss.y, 0.35, 6, { r: 0.9, g: 0.25, b: 0.1 });
  }
  bossHpPrev = boss.hp;
  // Boss death: a bigger, redder burst and richer loot — the showcase payoff for the tougher
  // fight (roadmap E5 "concentrate effects").
  if (bossWasAlive && !boss.alive) {
    particles.burst(boss.x, boss.y, 0.35, 36, { r: 1.2, g: 0.35, b: 0.15 });
    for (let i = 0; i < 3; i++) {
      game.treasures.push({ x: boss.x + (i - 1) * 0.2, y: boss.y, taken: false });
    }
  }
  bossWasAlive = boss.alive;
  particles.update(dt);

  game.update(player, map, dt);
  if (game.won) winOverlay.style.display = "flex";
  updateHud();

  const markers: MinimapMarker[] = [];
  if (!game.hasKey) markers.push({ x: placements.key.x, y: placements.key.y, color: "#e8b56a" });
  if (mob.alive) markers.push({ x: mob.x, y: mob.y, color: "#3fbf5a" });
  if (boss.alive) markers.push({ x: boss.x, y: boss.y, color: "#d64b3a" });
  drawMinimap(minimapCtx, map, player, markers);

  // The flame's breathing modulates the real point light (intensity), and its sway MOVES
  // the light around the player — that position wander is what makes the shading dance on
  // the walls. Intensity is mutate-and-restore so the slider keeps owning the base value.
  const tSec = now / 1000;
  const sway = torchSway(tSec);
  const baseIntensity = settings.torch.intensity;
  settings.torch.intensity = baseIntensity * torchFlicker(tSec);

  // Sprites draw into whichever buffer the walls just rendered to, using ITS depth buffer,
  // so SSAA smooths their edges like everything else.
  if (settings.ssaa) {
    raycasterHi.render(player, materials, settings, sway, game.doorProgress);
    drawSprites(fbHi, raycasterHi, tSec);
    renderHeldTorch(fbHi, tSec, attack.swingT);
    downsampleInto(fbHi, fb, SSAA);
  } else {
    raycaster.render(player, materials, settings, sway, game.doorProgress);
    drawSprites(fb, raycaster, tSec);
    renderHeldTorch(fb, tSec, attack.swingT);
  }
  settings.torch.intensity = baseIntensity;
  if (settings.bloom) {
    applyBloom(fb, bloomA, bloomB, {
      threshold: settings.bloomThreshold,
      strength: settings.bloomStrength,
    });
  }
  applyRadialBlur(fb, blurScratch, dash.blurAmount());
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
