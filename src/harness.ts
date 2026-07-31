/**
 * Standalone material test harness (spec §5, Owner B): renders each material flat to a
 * canvas — albedo map, normal map, and a live-lit quad with a mouse-driven point light —
 * so textures and normals can be verified independently of the 3D view.
 */
import { linearToByte } from "./framebuffer";
import { BrickMaterial, CeilingMaterial, FloorMaterial, StoneMaterial } from "./material";
import { BakedSampler } from "./sampler";
import type { Color, Material, Normal } from "./types";

const SIZE = 256;

const MATERIALS: [string, Material][] = [
  ["stone", new StoneMaterial()],
  ["brick", new BrickMaterial()],
  ["floor", new FloorMaterial()],
  ["ceiling", new CeilingMaterial()],
];

const root = document.getElementById("materials")!;
const col: Color = { r: 0, g: 0, b: 0 };
const nrm: Normal = { x: 0, y: 0, z: 1 };

function makePanel(parent: HTMLElement, caption: string): CanvasRenderingContext2D {
  const fig = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const cap = document.createElement("figcaption");
  cap.textContent = caption;
  fig.append(canvas, cap);
  parent.append(fig);
  return canvas.getContext("2d")!;
}

/** u right, v UP (tile convention) — so flip v against canvas y, which grows downward. */
const uvAt = (x: number, y: number): [number, number] => [(x + 0.5) / SIZE, 1 - (y + 0.5) / SIZE];

function drawAlbedo(ctx: CanvasRenderingContext2D, s: BakedSampler): void {
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0, j = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, j += 4) {
      const [u, v] = uvAt(x, y);
      s.albedoAt(u, v, col);
      img.data[j] = linearToByte(col.r);
      img.data[j + 1] = linearToByte(col.g);
      img.data[j + 2] = linearToByte(col.b);
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawNormals(ctx: CanvasRenderingContext2D, s: BakedSampler): void {
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0, j = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, j += 4) {
      const [u, v] = uvAt(x, y);
      s.normalAt(u, v, nrm);
      // Standard normal-map encoding: [-1,1] → [0,255]; flat surface reads as (128,128,255).
      img.data[j] = (nrm.x * 0.5 + 0.5) * 255;
      img.data[j + 1] = (nrm.y * 0.5 + 0.5) * 255;
      img.data[j + 2] = (nrm.z * 0.5 + 0.5) * 255;
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Phong-lit flat quad in the z=0 plane; the light hovers at the mouse position. */
function drawLit(ctx: CanvasRenderingContext2D, s: BakedSampler, lx: number, ly: number): void {
  const img = ctx.createImageData(SIZE, SIZE);
  const lz = 0.35;
  const ex = 0.5, ey = 0.5, ez = 1.5; // eye above the quad center
  for (let y = 0, j = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++, j += 4) {
      const [u, v] = uvAt(x, y);
      s.albedoAt(u, v, col);
      s.normalAt(u, v, nrm);
      // Quad lies in the xy plane facing +z, so tangent space == world space here.
      let dx = lx - u, dy = ly - v, dz = lz;
      const d = Math.hypot(dx, dy, dz);
      dx /= d; dy /= d; dz /= d;
      const ndotl = Math.max(0, nrm.x * dx + nrm.y * dy + nrm.z * dz);
      const att = 1.6 / (1 + 0.6 * d + 2.5 * d * d);
      // Phong reflection of the light dir, viewed from the eye.
      const rx = 2 * ndotl * nrm.x - dx, ry = 2 * ndotl * nrm.y - dy, rz = 2 * ndotl * nrm.z - dz;
      let vx = ex - u, vy = ey - v, vz = ez;
      const vd = Math.hypot(vx, vy, vz);
      const spec = ndotl > 0 ? Math.pow(Math.max(0, (rx * vx + ry * vy + rz * vz) / vd), 24) : 0;
      const light = att;
      img.data[j] = linearToByte(col.r * (0.06 + ndotl * light) + spec * light);
      img.data[j + 1] = linearToByte(col.g * (0.06 + ndotl * light) + spec * light);
      img.data[j + 2] = linearToByte(col.b * (0.06 + ndotl * light) + spec * light);
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

for (const [name, mat] of MATERIALS) {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("div");
  label.className = "name";
  label.textContent = name;
  row.append(label);
  root.append(row);

  const sampler = new BakedSampler(mat, SIZE);
  drawAlbedo(makePanel(row, "albedo"), sampler);
  drawNormals(makePanel(row, "normals (derived)"), sampler);

  const litCtx = makePanel(row, "lit — move mouse");
  drawLit(litCtx, sampler, 0.5, 0.5);
  let pending = false;
  litCtx.canvas.addEventListener("mousemove", (e) => {
    if (pending) return; // throttle to one redraw per animation frame
    pending = true;
    const rect = litCtx.canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / rect.width;
    const ly = 1 - (e.clientY - rect.top) / rect.height;
    requestAnimationFrame(() => {
      drawLit(litCtx, sampler, lx, ly);
      pending = false;
    });
  });
}
