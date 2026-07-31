import { defaultTorch, type Torch } from "./lighting";

/** Per-stage pipeline views — this is what makes grading easy (spec §2). */
export type RenderMode = "full" | "albedo" | "normals" | "lighting";

export interface Settings {
  mode: RenderMode;
  torch: Torch;
  /** Bilinear vs nearest texture sampling (stretch). */
  bilinear: boolean;
  /** Distance fog (stretch). */
  fog: boolean;
  fogDensity: number;
}

export function defaultSettings(): Settings {
  return {
    mode: "full",
    torch: defaultTorch(),
    bilinear: false,
    fog: false,
    fogDensity: 0.22,
  };
}
