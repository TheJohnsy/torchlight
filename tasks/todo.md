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
- [ ] Procedurally-drawn slime/bat sprite (Worley/FBm blobs — no assets, ever)
- [ ] Billboarded, depth-tested against walls per column (Z-buffer, transparency slides)
- [ ] Trivial wander-toward-player behavior; touching it just knocks the player back

### Phase E1.5 — combat loop (the gameplay glue around the mob)
Gameplay stays thin, but each piece still points at a technique on screen:
- [ ] Attack input (Space / left click): torch swing — the viewmodel plays a keyframed
      arc (animation lecture), hits what's in reach ahead (uses the depth/projection math)
- [ ] Mob HP + hit feedback: white hit-flash frame + emissive pulse on damage
      (game state driving shader parameters — same principle as the boss)
- [ ] Mob death: brief particle burst (feeds E3's emitter), drops a gem
- [ ] Player life points: heart icons in the HUD (texel-painted, like gem/key);
      mob contact costs a heart + knockback; 0 hearts → red-vignette death overlay,
      R to restart the same seed
- [ ] One skill: fireball on a cooldown — IS E3's projectile (particles + motion blur),
      with a HUD cooldown slot; hitting a mob applies damage
- [ ] Skill #2 (optional): dash/blink — motion-blur streak on the whole frame for a beat
- [ ] Keyframe + lerp timeline helper: x(t) = lerp(xa, xb, t), ease via smoothstep
- [ ] Vault door swings open over ~1s instead of popping (keyframed transform)
- [ ] Mob idle bob + lunge as keyframed motion; key gets a float/spin cycle

### Phase E3 — particles + motion blur (combat feel)
- [ ] Torch spark particles: small noise-driven emitter, emissive, bloom-fed
- [ ] One projectile (magic bolt) with a streak — motion-blur kernel from the slides

### Phase E4 — material variety (near-zero cost; noise lib exists)
- [ ] Worley noise added to `noise.ts` (it's in the Textures deck)
- [ ] Marble: marble(x) = f(sin(x + turbulence)) — vault interior floor
- [ ] Cracked/Worley stone variant for one room band

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
