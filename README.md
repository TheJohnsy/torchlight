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

## The game (deliberately tiny)

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
