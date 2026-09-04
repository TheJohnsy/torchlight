import { Cell, GridMap } from "./map";

/**
 * Procedural dungeon generation (roadmap E0). Same principle as the seeded noise fields:
 * a deterministic hash-driven RNG means one integer seed reproduces the whole level —
 * rooms, corridors, vault, key, treasure — with no stored data.
 *
 * Shape of the algorithm: scatter non-overlapping rooms, chain them with L-corridors,
 * seal the room farthest from spawn behind the single door, then FLOOD-FILL VALIDATE the
 * result (key reachable, vault not). Corridors are allowed to collide and rooms to touch
 * in odd ways — anything that breaks the invariants just rejects the attempt and re-rolls
 * with the next sub-seed. Rejection sampling keeps the carving code simple and makes the
 * guarantees explicit instead of implicit in careful geometry.
 */

const WIDTH = 32;
const HEIGHT = 20;

export interface Placements {
  spawn: { x: number; y: number };
  key: { x: number; y: number };
  /** Continuous bounds of the locked room: [x0,x1) × [y0,y1) in world units. */
  vault: { x0: number; y0: number; x1: number; y1: number };
  treasures: { x: number; y: number }[];
  /** The one slime (roadmap E1): spawned in some ordinary room, never the player's own. */
  mob: { x: number; y: number };
  /** The key's room, in tile bounds like `vault` (roadmap E4: the cracked-stone wall band). */
  keyRoomBounds: { x0: number; y0: number; x1: number; y1: number };
  /** Boss guardian (roadmap E5): planted in the key's own room, distinct from the roaming mob. */
  boss: { x: number; y: number };
}

export interface Dungeon {
  map: GridMap;
  placements: Placements;
}

/** mulberry32 — tiny, seedable, good-enough PRNG (this is content, not crypto). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const center = (r: Room) => ({ cx: r.x + (r.w >> 1), cy: r.y + (r.h >> 1) });

export function generateDungeon(seed: number): Dungeon {
  // Rejection loop: each attempt reseeds deterministically, so seed → dungeon is a pure map.
  for (let attempt = 0; attempt < 64; attempt++) {
    const d = tryGenerate(mulberry32(seed * 0x9e3779b1 + attempt * 0x85ebca6b));
    if (d) return d;
  }
  throw new Error(`dungeon generation failed for seed ${seed}`); // 64 misses ≈ impossible
}

function tryGenerate(rng: () => number): Dungeon | null {
  const cells = new Uint8Array(WIDTH * HEIGHT).fill(Cell.Stone);
  const at = (x: number, y: number) => cells[y * WIDTH + x];
  const set = (x: number, y: number, c: Cell) => {
    cells[y * WIDTH + x] = c;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

  // --- scatter rooms: accept only if the rect plus a 1-tile shell is still solid --------
  const rooms: Room[] = [];
  for (let tries = 0; tries < 80 && rooms.length < 9; tries++) {
    const w = int(3, 6);
    const h = int(3, 5);
    const x = int(1, WIDTH - w - 2);
    const y = int(1, HEIGHT - h - 2);
    let clear = true;
    for (let yy = y - 1; yy <= y + h && clear; yy++) {
      for (let xx = x - 1; xx <= x + w && clear; xx++) {
        if (at(xx, yy) !== Cell.Stone) clear = false;
      }
    }
    if (!clear) continue;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) set(xx, yy, Cell.Floor);
    }
    rooms.push({ x, y, w, h });
  }
  if (rooms.length < 5) return null; // too cramped to be interesting — re-roll

  // --- pick the vault: the room whose center is farthest from the spawn room's ----------
  const spawnRoom = rooms[0];
  const sc = center(spawnRoom);
  let vaultIdx = 1;
  let best = -1;
  for (let i = 1; i < rooms.length; i++) {
    const { cx, cy } = center(rooms[i]);
    const dist = Math.abs(cx - sc.cx) + Math.abs(cy - sc.cy);
    if (dist > best) {
      best = dist;
      vaultIdx = i;
    }
  }
  const vault = rooms[vaultIdx];

  // --- corridors: chain every ordinary room to the previous ordinary one ---------------
  const carve = (x: number, y: number) => {
    if (at(x, y) === Cell.Stone) set(x, y, Cell.Floor);
  };
  const corridor = (x0: number, y0: number, x1: number, y1: number): void => {
    // L-shaped: horizontal leg then vertical, or the reverse — the RNG picks the elbow.
    const path = elbowPath(x0, y0, x1, y1, rng() < 0.5);
    for (const [x, y] of path) carve(x, y);
  };
  const ordinary = rooms.filter((_, i) => i !== vaultIdx);
  for (let i = 1; i < ordinary.length; i++) {
    const a = center(ordinary[i - 1]);
    const b = center(ordinary[i]);
    corridor(a.cx, a.cy, b.cx, b.cy);
  }

  // --- vault corridor: carve from the nearest ordinary room, door on the last tile -----
  const vc = center(vault);
  let nearest = ordinary[0];
  let nBest = Infinity;
  for (const r of ordinary) {
    const { cx, cy } = center(r);
    const dist = Math.abs(cx - vc.cx) + Math.abs(cy - vc.cy);
    if (dist < nBest) {
      nBest = dist;
      nearest = r;
    }
  }
  const nc = center(nearest);
  const path = elbowPath(nc.cx, nc.cy, vc.cx, vc.cy, rng() < 0.5);
  const inVault = (x: number, y: number) =>
    x >= vault.x && x < vault.x + vault.w && y >= vault.y && y < vault.y + vault.h;
  let doorTile: [number, number] | null = null;
  for (const [x, y] of path) {
    if (inVault(x, y)) break; // stop at the vault wall — the previous tile is the doorway
    carve(x, y);
    doorTile = [x, y];
  }
  if (!doorTile || !isAdjacentTo(doorTile, inVault)) return null; // elbow landed badly — re-roll
  set(doorTile[0], doorTile[1], Cell.Door);

  // --- decoration: brick pillars in roomy rooms (never the spawn room) ------------------
  for (const r of rooms) {
    if (r === spawnRoom || r.w < 5 || r.h < 4) continue;
    const px = int(r.x + 1, r.x + r.w - 2);
    const py = int(r.y + 1, r.y + r.h - 2);
    set(px, py, Cell.Brick);
  }

  // --- placements ----------------------------------------------------------------------
  const tileCenter = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });
  const floorIn = (r: Room): { x: number; y: number } | null => {
    for (let tries = 0; tries < 20; tries++) {
      const x = int(r.x, r.x + r.w - 1);
      const y = int(r.y, r.y + r.h - 1);
      if (at(x, y) === Cell.Floor) return tileCenter(x, y);
    }
    return null;
  };

  // Key: farthest ordinary room from spawn, so the player has to explore for it.
  let keyRoom = ordinary[1] ?? ordinary[0];
  let kBest = -1;
  for (const r of ordinary) {
    if (r === spawnRoom) continue;
    const { cx, cy } = center(r);
    const dist = Math.abs(cx - sc.cx) + Math.abs(cy - sc.cy);
    if (dist > kBest) {
      kBest = dist;
      keyRoom = r;
    }
  }
  const key = floorIn(keyRoom);
  if (!key) return null;

  // Treasure: one gem in a few ordinary rooms, the jackpot inside the vault.
  const treasures: { x: number; y: number }[] = [];
  for (const r of ordinary) {
    if (r === spawnRoom || r === keyRoom || rng() < 0.4) continue;
    const t = floorIn(r);
    if (t) treasures.push(t);
  }
  for (let i = 0; i < 3; i++) {
    const t = floorIn(vault);
    if (t && !treasures.some((o) => o.x === t.x && o.y === t.y)) treasures.push(t);
  }
  if (treasures.length < 3 || !treasures.some((t) => inVault(t.x - 0.5, t.y - 0.5))) {
    return null;
  }

  // Mob: any ordinary room but the player's own spawn room — nothing should ambush the
  // player at their own doorstep. Reuses the same floorIn() primitive as key/treasures.
  const mobCandidates = ordinary.filter((r) => r !== spawnRoom);
  if (mobCandidates.length === 0) return null;
  const mob = floorIn(mobCandidates[int(0, mobCandidates.length - 1)]);
  if (!mob) return null;

  // Boss (roadmap E5): a tougher guardian planted in the key's own room, distinct from the
  // roaming slime — reuses floorIn() same as key/treasures/mob, just scoped to keyRoom and
  // nudged off the key's exact tile so the two sprites don't render on top of each other.
  let boss: { x: number; y: number } | null = null;
  for (let tries = 0; tries < 10; tries++) {
    const candidate = floorIn(keyRoom);
    if (candidate && Math.hypot(candidate.x - key.x, candidate.y - key.y) >= 1) {
      boss = candidate;
      break;
    }
  }
  if (!boss) boss = floorIn(keyRoom);
  if (!boss) return null;

  // --- validate with flood fill: the guarantees live HERE, not in the carving ----------
  const spawn = tileCenter(sc.cx, sc.cy);
  if (at(sc.cx, sc.cy) !== Cell.Floor) return null; // pillar landed on spawn? (can't, but cheap)
  const open = floodFill(cells, sc.cx, sc.cy);
  const id = (x: number, y: number) => Math.floor(y) * WIDTH + Math.floor(x);
  if (!open.has(id(key.x, key.y))) return null; // key must be reachable pre-door
  for (let y = vault.y; y < vault.y + vault.h; y++) {
    for (let x = vault.x; x < vault.x + vault.w; x++) {
      if (at(x, y) === Cell.Floor && open.has(id(x, y))) return null; // vault leak — re-roll
    }
  }
  for (const t of treasures) {
    if (!open.has(id(t.x, t.y)) && !inVault(t.x - 0.5, t.y - 0.5)) return null;
  }
  if (!open.has(id(mob.x, mob.y))) return null; // mob must be reachable pre-door too
  if (!open.has(id(boss.x, boss.y))) return null; // boss lives in keyRoom — must be reachable too

  // Serialize through the ASCII parser so generated maps obey the exact same contract
  // (and failure modes) as the hand-authored one.
  const CELL_TO_CHAR = [".", "#", "B", "D"];
  const rows: string[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    let row = "";
    for (let x = 0; x < WIDTH; x++) row += CELL_TO_CHAR[at(x, y)];
    rows.push(row);
  }
  return {
    map: GridMap.parse(rows),
    placements: {
      spawn,
      key,
      vault: { x0: vault.x, y0: vault.y, x1: vault.x + vault.w, y1: vault.y + vault.h },
      treasures,
      mob,
      boss,
      keyRoomBounds: {
        x0: keyRoom.x,
        y0: keyRoom.y,
        x1: keyRoom.x + keyRoom.w,
        y1: keyRoom.y + keyRoom.h,
      },
    },
  };
}

/** The tile path of an L-corridor between two points; `horizontalFirst` picks the elbow. */
function elbowPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  horizontalFirst: boolean,
): [number, number][] {
  const path: [number, number][] = [];
  const sx = Math.sign(x1 - x0) || 1;
  const sy = Math.sign(y1 - y0) || 1;
  if (horizontalFirst) {
    for (let x = x0; x !== x1; x += sx) path.push([x, y0]);
    for (let y = y0; y !== y1; y += sy) path.push([x1, y]);
  } else {
    for (let y = y0; y !== y1; y += sy) path.push([x0, y]);
    for (let x = x0; x !== x1; x += sx) path.push([x, y1]);
  }
  path.push([x1, y1]);
  return path;
}

function isAdjacentTo(
  [x, y]: [number, number],
  inside: (x: number, y: number) => boolean,
): boolean {
  return inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1);
}

/** 4-directional flood over Floor cells (doors count as walls — that's the point). */
function floodFill(cells: Uint8Array, sx: number, sy: number): Set<number> {
  const seen = new Set<number>();
  const stack = [sy * WIDTH + sx];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || cells[id] !== Cell.Floor) continue;
    seen.add(id);
    const x = id % WIDTH;
    if (x + 1 < WIDTH) stack.push(id + 1);
    if (x > 0) stack.push(id - 1);
    stack.push(id + WIDTH, id - WIDTH); // top/bottom rows are solid, so no bounds risk
  }
  return seen;
}
