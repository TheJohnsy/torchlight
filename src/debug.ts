import { defaultTorch, type Torch } from "./lighting";

/** Per-stage pipeline views — this is what makes grading easy (spec §2). */
export type RenderMode = "full" | "albedo" | "normals" | "lighting";

export interface Settings {
  mode: RenderMode;
  torch: Torch;
  /** Bilinear vs nearest texture sampling (stretch). */
  bilinear: boolean;
  /** 2× supersampling anti-aliasing (stretch): render hi-res, box-resolve down. */
  ssaa: boolean;
  /** Distance fog (stretch). */
  fog: boolean;
  fogDensity: number;
  /** Torch bloom (stretch): overbright speculars leak a soft halo. */
  bloom: boolean;
  bloomThreshold: number;
  bloomStrength: number;
}

export function defaultSettings(): Settings {
  return {
    mode: "full",
    torch: defaultTorch(),
    bilinear: false,
    ssaa: false,
    fog: false,
    fogDensity: 0.22,
    bloom: false,
    bloomThreshold: 0.7, // only genuinely hot pixels glow; sub-white stone stays matte
    bloomStrength: 0.7,
  };
}

function fieldset(root: HTMLElement, legend: string): HTMLFieldSetElement {
  const fs = document.createElement("fieldset");
  const lg = document.createElement("legend");
  lg.textContent = legend;
  fs.append(lg);
  root.append(fs);
  return fs;
}

function labeled(parent: HTMLElement, input: HTMLInputElement, text: string): void {
  const label = document.createElement("label");
  label.style.display = "block";
  label.append(input, ` ${text}`);
  parent.append(label);
}

/**
 * Builds the debug panel and mutates `settings` in place as controls change.
 * Returns the FPS readout element for the game loop to update.
 */
export function createDebugPanel(root: HTMLElement, settings: Settings): HTMLElement {
  const stages = fieldset(root, "render stage");
  const modes: [RenderMode, string][] = [
    ["full", "full pipeline"],
    ["albedo", "albedo only"],
    ["normals", "normals only"],
    ["lighting", "lighting only"],
  ];
  for (const [value, text] of modes) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "mode";
    radio.checked = value === settings.mode;
    radio.addEventListener("change", () => (settings.mode = value));
    labeled(stages, radio, text);
  }

  const torchFs = fieldset(root, "torch");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "4";
  slider.step = "0.05";
  slider.value = String(settings.torch.intensity);
  slider.style.width = "100%";
  const readout = document.createElement("div");
  readout.textContent = `intensity ${settings.torch.intensity.toFixed(2)}`;
  slider.addEventListener("input", () => {
    settings.torch.intensity = Number(slider.value);
    readout.textContent = `intensity ${settings.torch.intensity.toFixed(2)}`;
  });
  torchFs.append(slider, readout);

  const extras = fieldset(root, "sampling & fog");
  const bilinear = document.createElement("input");
  bilinear.type = "checkbox";
  bilinear.checked = settings.bilinear;
  bilinear.addEventListener("change", () => (settings.bilinear = bilinear.checked));
  labeled(extras, bilinear, "bilinear filtering");
  const ssaa = document.createElement("input");
  ssaa.type = "checkbox";
  ssaa.checked = settings.ssaa;
  ssaa.addEventListener("change", () => (settings.ssaa = ssaa.checked));
  labeled(extras, ssaa, "2× supersampling");
  const fog = document.createElement("input");
  fog.type = "checkbox";
  fog.checked = settings.fog;
  fog.addEventListener("change", () => (settings.fog = fog.checked));
  labeled(extras, fog, "distance fog");
  const bloom = document.createElement("input");
  bloom.type = "checkbox";
  bloom.checked = settings.bloom;
  bloom.addEventListener("change", () => (settings.bloom = bloom.checked));
  labeled(extras, bloom, "torch bloom");

  const fps = document.createElement("div");
  fps.textContent = "-- fps";
  root.append(fps);
  return fps;
}
