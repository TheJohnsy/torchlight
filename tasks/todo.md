# Torchlight — build plan (spec §7 phases)

- [x] Phase 0: scaffold repo (Vite + TS, zero runtime deps), contracts in `types.ts`
- [x] Phase 1: grey corridor — framebuffer + DDA raycaster + movement/collision
- [x] Phase 2: noise on a quad — noise lib + materials + standalone harness page
- [x] Phase 3: textured walls — wire `Material.albedo` into the wall loop
- [x] Phase 4: lit walls — tangent→world normals, Phong, torch attenuation (core deliverable)
- [x] Phase 5: floor/ceiling casting + authored level + collision polish
- [x] Phase 6: debug panel — per-stage toggles + torch slider
- [x] Stretch: distance fog
- [x] Stretch: bilinear vs nearest sampling toggle
- [x] Verify: unit tests green (47), typecheck clean, headless smoke frames inspected

## Remaining stretch candidates (spec §2 priority order)
- [x] Supersampling anti-aliasing (2× render → linear box resolve, debug toggle)
- [x] Bloom on the torch (linear bright-pass → separable Gaussian → additive composite)
- [x] One billboard sprite with depth-buffer occlusion (the glowing key, procedural SDF)
- [x] Key + door win condition (key opens the plank-wood vault door; vault = win)

All spec §2 stretch goals complete. 77 tests, typecheck clean, build green.

## Enrichment roadmap (lecture-anchored)

The rule: **every feature must trace to a lecture slide.** If it can't name its lecture,
it's scope creep — cut it. That mapping is also the demo defense: point at anything on
screen and name the technique behind it.

### Already banked (feature → lecture topic)
- [x] Bloom — Advanced deck: threshold → Gaussian blur → composite (`src/bloom.ts`)
- [x] Fog — Advanced deck fog equations; we use exponential e^(−d·b) with true Euclidean
      distance (say the Z-depth-vs-sqrt tradeoff out loud in the demo — free nuance point)
- [x] Supersampling AA — deck's "more samples over edges", honest raycaster version:
      2× cast + linear box resolve, on a toggle (the shimmer on/off is a demo beat)
- [x] Filtering toggle — Textures deck sampling schemes: nearest vs bilinear, on a toggle
- [x] Billboard sprite + depth occlusion — billboarding + Z-buffer slides made
      load-bearing: the key tests per-column against `Raycaster.depth` (`src/sprite.ts`)
- [x] Emissive loot feeding bloom — the key's >1 linear gold blooms when enabled

### Phase E0 — procedural dungeon generation (map becomes computed, like everything else)
Anchor: the procedural-content/noise lectures — seeded hashing makes generation
deterministic and repeatable, same principle as the seeded noise fields.
- [x] Seeded PRNG + `generateDungeon(seed)`: scattered non-overlapping rooms, L-corridors,
      guaranteed connectivity (validated by flood fill, rejection-resample on failure)
- [x] Vault room sealed behind the one door; key placed in the farthest ordinary room
- [x] Treasure gems scattered in rooms, jackpot inside the vault; pickup counter
- [x] Same `GridMap` contract — renderer untouched; authored level stays for tests
- [x] URL `?seed=` for reproducible dungeons in the demo

### Player-feel additions (user-requested, beyond the slide roadmap)
- [x] Held-torch viewmodel: procedural wood/leather/iron handle + turbulent flame
      (heat-field with scrolling FBm, real-flame width profile, ember-lit collar seam)
- [x] Flame drives the real light: `torchFlicker` scales intensity AND `torchSway`
      wanders the light position — highlights crawl over the normal-mapped stone
- [x] In-game HUD: translucent corner plate, icons rasterized from the sprite texels,
      key slot ghosts until pickup; seed readout for reproducing runs
- [x] Turn-speed slider (0.6–6 rad/s) in a controls fieldset
- [x] Input by physical key (`e.code`) — WASD survives non-Latin keyboard layouts

### Phase E1 — one mob (richest single feature: unlocks 3 slides)
- [x] Procedurally-drawn slime sprite (`mobTexel`, `src/sprite.ts`) — FBm-perturbed blob
      silhouette, the same noise field as the walls, warping a creature outline instead
- [x] Billboarded, depth-tested against walls per column (Z-buffer, transparency slides) —
      reuses the existing `renderSprite`/depth-occlusion pipeline built for the key
- [x] Trivial wander-toward-player behavior; touching it just knocks the player back
      (`src/mob.ts`)

### Phase E1.5 — combat loop (makes it a real game, not a walkthrough)
- [x] Attack input (Space): torch swing — the viewmodel plays a keyframed arc
      (`heldtorch.ts` rotates the tip around the base via `swingT`), hits what's in reach
      ahead in a facing cone (`src/combat.ts`)
- [x] Mob HP + hit feedback: white hit-flash frame on damage (`Mob.takeDamage`/`flashing`,
      `src/mob.ts`) — no separate "emissive pulse" beyond the flash tint itself
- [x] Mob death: particle burst (`src/particles.ts`, reuses the sprite billboard pipeline
      instead of a second rendering path) + drops a gem (pushed into `game.treasures`)
- [x] Player life points: heart icons in the HUD (`heartTexel`, texel-painted like gem/key);
      mob contact costs a heart + knockback; 0 hearts → red death overlay, R to restart
      the same seed (`src/game.ts`, `index.html`, `src/main.ts`)
- [x] One skill: fireball on a cooldown (`src/projectile.ts`) — a ghost-trail streak
      standing in for per-object motion blur (the raycaster has no velocity buffer to
      convolve), HUD cooldown slot, hitting the mob applies damage
- [x] Skill #2 (optional): dash (`src/dash.ts`) — reuses `Player.knockback()`'s
      collision-checked displacement as a self-inflicted burst, paired with a screen-space
      radial "speed" blur (`src/motionblur.ts`) that fades out over ~0.2s
- [x] Keyframe + lerp timeline helper: `src/anim.ts` (`lerp`/`smoothstep`/`progress`),
      used by the door swing and (via `sin(t·π)`) the torch swing arc
- [x] Vault door swings open over ~1s (`GameState.doorProgress`) instead of popping —
      expressed as a timed unlock + pulsing glow (`raycaster.ts`) rather than literal
      swinging geometry, since wall height is uniform per column with no partial-height
      hook; the door stays solid and impassable for the full second either way
- [x] Mob idle bob + lunge as keyframed motion (`Mob.bobOffset()`, lunge speed inside
      `LUNGE_RANGE`); key gets a float cycle (`keyFloat`) — no literal "spin" for either,
      since a camera-facing billboard has no visible rotation around its vertical axis

### Phase E3 — particles + motion blur (combat feel)
- [~] Torch spark particles: tried, cut. The held torch is a screen-space viewmodel
      overlay (`heldtorch.ts`) with no real world (x,y) — it isn't actually "at" any world
      position, so world-space particles can never track it, and anything spawned close
      enough to read as "near the torch" is close enough to the camera to blow up huge
      under the perspective divide (near-plane blowup, not a tunable bug). Not worth
      fighting the renderer's own screen-space/world-space split for a checklist bullet —
      the mob-death burst below already demonstrates the same emitter technique, just at a
      real world distance where it actually works.
- [x] One projectile (magic bolt) with a streak — the fireball skill (`src/projectile.ts`),
      already built for E1.5; its "streak" is a fading ghost-trail of past positions rather
      than a screen-space motion-blur kernel, since the raycaster has no velocity buffer to
      convolve. The dash skill's radial blur (`src/motionblur.ts`) is the actual
      motion-blur-kernel technique from the slides, applied to camera surge instead

### Phase E4 — material variety (near-zero cost; noise lib exists)
- [x] Worley noise added to `noise.ts` (`worley2`, tileable F1 cellular noise)
- [x] Marble: marble(x) = f(sin(x + turbulence)) — vault interior floor (`MarbleMaterial`,
      applied as a region override by world position by `raycaster.ts`, not a new Cell type)
- [x] Cracked/Worley stone variant for one room band (`CrackedStoneMaterial`, applied to
      the key's room — `Placements.keyRoomBounds` — via the same region-override mechanism)

### Phase E5 — boss showcase (where every effect stacks)
- [ ] Big billboard mob guarding the vault key
- [ ] Health-driven emissive pulse (game state drives a shader parameter)
- [ ] Concentrate effects: bloom-heavy, particle hits, distinct shading

### Phase E6 — pro tier (only if budget remains)
- [ ] Cheap SSAO: blur depth buffer − depth, scale/clamp, darken (Advanced deck fake)
- [ ] Shadows: 1D shadow map from the torch, or blob shadows under mobs (shadow-map slides)
- [ ] Minimap: top-down grid beside the first-person view — the 2D→projection
      relationship made literally visible for the grader
- [ ] Lava pit hazard: metaballs/marching squares over a thresholded noise field
