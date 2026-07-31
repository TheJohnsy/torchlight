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

### Phase E1 — one mob (richest single feature: unlocks 3 slides)
- [ ] Procedurally-drawn slime/bat sprite (Worley/FBm blobs — no assets, ever)
- [ ] Billboarded, depth-tested against walls per column (Z-buffer, transparency slides)
- [ ] Trivial wander-toward-player behavior; touching it just knocks the player back

### Phase E2 — animation (unlocks the whole animation lecture)
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
