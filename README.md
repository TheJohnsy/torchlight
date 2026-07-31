# Torchlight

A first-person dungeon crawler rendered entirely by a **software rasterizer written from
scratch** — no game engine, no GPU shaders, no image assets. Every pixel you see (geometry,
stone texture, surface bumps, torchlight) is computed at runtime from code.

## The core idea — one noise field, three uses

1. **Texture** — FBm/Perlin noise evaluated per texel, mapped through a color ramp → stone albedo.
2. **Normals** — the *gradient* of that same height field (central differences) → per-texel
   surface normal. Nothing is stored; normals are derived.
3. **Geometry detail** — the field thresholded for surface structure (brick bevels, floor grooves).

Those normals feed a **Phong** lighting model lit by one attenuated point light: the torch the
player carries. The specular highlight slides across the stone as you move — proof the normals
are real.

## Running

```sh
npm install
npm run dev      # game at the printed URL; /harness.html shows raw materials
npm test         # vitest unit tests (noise, materials, lighting, projection math)
npm run build    # typecheck + production bundle
```

## Controls

WASD move · ←/→ or Q/E turn · Shift run (physical-key input, so any keyboard layout
works). The debug panel has per-stage render toggles (albedo / normals / lighting / full),
torch-intensity and turn-speed sliders, and stretch-feature toggles: bilinear filtering,
2× supersampling, distance fog, torch bloom.

You carry a **procedural torch**: its flame is a turbulent noise field, and the same noise
stream drives the actual point light — intensity flickers and the light position sways, so
the shading dances on the walls. A translucent HUD shows gems collected and the key slot,
with icons rasterized from the same texel code that draws the world sprites.

## The game

Every playthrough generates a **fresh procedural dungeon** — seeded rooms, corridors, and a
locked vault, flood-fill validated so the run is always completable (`?seed=N` in the URL
reproduces a dungeon exactly). Somewhere in it floats a **glowing key** — a procedural
billboard sprite, occluded per column by the wall depth buffer. Walk over it and the wooden
**vault door** swings open; step inside the vault to win. Emerald **gems** along the way
feed a loot counter, with the jackpot inside the vault.

## How it works, briefly

- One ray per screen column marched through a 2D grid with **DDA**; the **perpendicular** hit
  distance sets wall-slice height (`h = screenH / perpDist` — the perspective divide).
- Colors stay **linear** through the whole pipeline; gamma is applied once at present time.
- Materials return tangent-space normals; the raycaster rotates them into world space per wall
  face before shading.

---

## For Liran — the project tour

Hey Liran — this section is the onboarding. If you run Claude Code in this repo and ask
for the tour, it will walk you through exactly this. Read it top to bottom once and you'll
know why everything is the way it is.

### The goals

1. **A graphics course project AND a real game — both, on purpose.** Not a production
   title, but a genuinely playable dungeon crawl: explore a generated dungeon, loot it,
   find the key, beat the vault (combat is next on the roadmap). The rule that keeps the
   two goals from fighting: every game feature must *also* demonstrate a course
   technique — the game is the vehicle, the techniques are the cargo, and both have to
   work. A grader should enjoy playing it, then be able to point at any element on
   screen and hear which lecture it came from.
2. **Everything is computed.** Hard rules we never broke: no image assets, no rendering
   libraries, no GPU/shaders, no runtime dependencies. Every pixel — stone, fire, the HUD
   icons — comes from code at runtime.
3. **Every feature must trace to a lecture slide.** That rule (top of `tasks/todo.md`)
   is the scope-creep firewall AND the demo defense: point at anything on screen and name
   the technique behind it.

### The one core idea

One FBm noise field, three uses: (1) mapped through a color ramp → **albedo**; (2) its
*gradient* (central differences) → **tangent-space normals**, nothing stored; (3)
thresholded → **geometry detail** (brick bevels, floor grooves). Those normals feed Phong
lighting from a single attenuated point light — the torch — so the specular highlight
sliding across stone as you move is *proof the normals are real*. Later we applied the
same principle to light itself: one noise stream drives the flame's shape, the light's
intensity, and the light's position.

### Decisions you'd otherwise have to reverse-engineer

- **Linear-light pipeline.** Colors are linear floats [0,1] everywhere; gamma (`sqrt`) is
  applied exactly once, in `Framebuffer.present()`. This is why lighting adds correctly,
  why the SSAA resolve averages *before* gamma, and why bloom composites *before* gamma.
- **Perpendicular distance, not ray length**, sets wall height — ray length curves every
  wall (fisheye). Classic raycaster bug, avoided by construction.
- **Frozen contracts** in `src/types.ts` (from the spec). The critical agreement:
  `Material.normal` is tangent-space (+x right, +y up, +z out), and `v` increases *upward*
  along walls, equal to world z. Get this wrong and lighting breaks undebugably.
- **Baked samplers** (`sampler.ts`): FBm is too slow per-pixel, so materials bake to a
  texel cache once at startup (~1s), then the frame loop just samples.
- **TDD throughout.** ~99 vitest tests, all pure math — no browser needed. Visual output
  is verified by headless smoke tests that render real frames and dump PPMs to
  `.preview/`. The tests caught real bugs (e.g. a wrong matrix term in sprite projection
  that the dead-ahead case masked).
- **Procedural dungeons by rejection, not cleverness** (`mapgen.ts`): scatter rooms, carve
  L-corridors, seal the farthest room as the vault — then *flood-fill validate* (key
  reachable, vault not) and re-roll deterministically on failure. The guarantees live in
  the validator, not in careful geometry. Same seed → same dungeon (`?seed=N`).
- **Input uses `e.code`** (physical keys) because `e.key` dies on non-Latin keyboard
  layouts — WASD stopped working on a Hebrew layout until we fixed this.

### What's done (the steps, in order)

1. **Core phases 0–6**: scaffold → grey corridor (DDA + collision) → noise lib + material
   harness → textured walls → *lit* walls (the core deliverable) → floor/ceiling casting +
   authored level → debug panel with per-stage views (albedo / normals / lighting / full).
2. **All spec stretch goals**: exponential fog (Euclidean distance), bilinear filtering
   toggle, 2× supersampling AA (linear box resolve), torch bloom (bright-pass → separable
   Gaussian → additive), a depth-occluded billboard sprite (the glowing key), and the
   key → vault-door → win condition.
3. **Enrichment**: procedural dungeon generation with gem loot; the held-torch viewmodel
   with a turbulent noise flame; flame-driven lighting (intensity flicker + position sway =
   dancing highlights); the in-game HUD (icons rasterized from the same texel functions
   that draw the world sprites).

### Where things live

`tasks/todo.md` is the plan of record — done work checked off, and the road ahead as
phases E1–E6 (mob → combat loop → animation → particles → materials → boss → SSAO/
shadows/minimap), each anchored to its lecture. `.preview/` holds rendered frames from the
smoke tests. `CLAUDE.md` is the working brief Claude Code reads. Git flow: work lands on
the `Yonatan` branch and merges into `main`.

### Verify it yourself in two minutes

```sh
npm install && npm test     # ~99 tests, pure math, no browser
npm run dev                 # play it; try ?seed=7, toggle SSAA/bloom/fog live
```

Open `/harness.html` for raw materials, and flip the debug panel's render stages while
walking around — albedo → normals → lighting → full is the whole pipeline, staged.
