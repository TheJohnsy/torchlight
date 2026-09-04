import { lerp } from "./noise";

export { lerp };

/** Clamp to [0,1] — every ease/progress helper below is built on this. */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Ease t∈[0,1] with zero velocity at both ends — the standard keyframe ease (roadmap E1.5). */
export function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/**
 * Eased progress of a timeline that starts at `startSec` and lasts `durationSec` seconds.
 * The shared building block for every keyframed transform (door swing, torch swing, etc.):
 * feed it into `lerp`/`smoothstep`-driven values instead of hand-rolling timers per feature.
 */
export function progress(nowSec: number, startSec: number, durationSec: number): number {
  return smoothstep((nowSec - startSec) / durationSec);
}
