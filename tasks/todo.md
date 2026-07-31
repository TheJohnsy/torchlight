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
- [ ] Supersampling anti-aliasing
- [ ] Bloom on the torch (threshold → Gaussian blur → composite)
- [ ] One billboard sprite with depth-buffer occlusion
- [ ] Key + door win condition
