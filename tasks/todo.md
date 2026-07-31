# Torchlight — build plan (spec §7 phases)

- [ ] Phase 0: scaffold repo (Vite + TS, zero runtime deps), contracts in `types.ts`
- [ ] Phase 1: grey corridor — framebuffer + DDA raycaster + movement/collision
- [ ] Phase 2: noise on a quad — noise lib + materials + standalone harness page
- [ ] Phase 3: textured walls — wire `Material.albedo` into the wall loop
- [ ] Phase 4: lit walls — tangent→world normals, Phong, torch attenuation (core deliverable)
- [ ] Phase 5: floor/ceiling casting + authored level + collision polish
- [ ] Phase 6: debug panel — per-stage toggles + torch slider
- [ ] Stretch: distance fog
- [ ] Stretch: bilinear vs nearest sampling toggle
- [ ] Verify: unit tests green, typecheck clean, visual check in browser
