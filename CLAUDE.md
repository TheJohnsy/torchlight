# Torchlight — agent notes

First-person dungeon crawler rendered by a hand-written software rasterizer onto a canvas
`ImageData`. The full spec lives in the project brief; this file is the trimmed working copy.

## Hard rules
- **No image assets, no rendering libraries, no GPU/shader code.** Everything visible is
  computed at runtime from code. If a task seems to need an asset, generate it procedurally.
- **No runtime dependencies.** Vite/TypeScript/vitest are dev-time only.
- Colors are **linear floats [0,1]** everywhere internally; gamma (`sqrt`) is applied only in
  `Framebuffer.present()`.
- Wall height uses **perpendicular** distance, not ray length (fisheye bug otherwise).
- The contracts in `src/types.ts` are frozen. `Material.normal` returns **tangent space**
  (+x right, +y up, +z out of the surface); the raycaster rotates it into world space.
  Convention: `v` increases **upward** along a wall and equals world `z` (floor 0 → ceiling 1).
- Prefer readable, commented math over cleverness — every non-obvious step gets a one-line
  "what and why" comment, because this code is explained to a grader.
- Keep gameplay trivial; this is a graphics project.

## The one core idea
One noise field, three uses: (1) FBm noise → albedo via a color ramp, (2) the *gradient* of the
same height field (central differences) → tangent-space normals, (3) optionally thresholded for
geometry detail. Normals feed Phong lighting from a single attenuated point light — the torch
at the player's position — so the specular highlight slides across the stone as you move.

## Layout
`src/main.ts` bootstrap/loop · `framebuffer.ts` (+ SSAA resolve) · `raycaster.ts` DDA +
wall/floor casting · `lighting.ts` Phong + attenuation · `bloom.ts` post-process ·
`sprite.ts` billboards (key/gems) · `player.ts` · `map.ts` grid + authored level ·
`mapgen.ts` seeded procedural dungeons · `game.ts` key/door/win state · `noise.ts`
value/Perlin/FBm · `material.ts` stone/brick/floor/door · `sampler.ts` baked texel cache ·
`debug.ts` toggle panel · `harness.html` + `src/harness.ts` standalone material viewer.

## Commands
`npm run dev` · `npm test` (vitest, pure-math tests) · `npm run build` (tsc + vite).
