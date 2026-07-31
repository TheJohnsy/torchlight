import type { Color, Material, Normal } from "./types";

/**
 * Bakes a Material into fixed-resolution texel tables at startup. The content is still
 * 100% procedural — computed at runtime from code, never loaded — baking just moves the
 * multi-octave noise evaluation out of the per-frame loop so the raycaster reads arrays.
 */
export class BakedSampler {
  private readonly res: number;
  private readonly alb: Float32Array; // linear rgb per texel
  private readonly nrm: Float32Array; // tangent-space xyz per texel

  constructor(mat: Material, res = 256) {
    this.res = res;
    this.alb = new Float32Array(res * res * 3);
    this.nrm = new Float32Array(res * res * 3);
    for (let ty = 0; ty < res; ty++) {
      const v = (ty + 0.5) / res; // texel centers
      for (let tx = 0; tx < res; tx++) {
        const u = (tx + 0.5) / res;
        const i = (ty * res + tx) * 3;
        const a = mat.albedo(u, v);
        this.alb[i] = a.r;
        this.alb[i + 1] = a.g;
        this.alb[i + 2] = a.b;
        const n = mat.normal(u, v);
        this.nrm[i] = n.x;
        this.nrm[i + 1] = n.y;
        this.nrm[i + 2] = n.z;
      }
    }
  }

  /** Albedo fetch with wrap; nearest by default, optional bilinear. Writes into `out`. */
  albedoAt(u: number, v: number, out: Color, bilinear = false): void {
    const res = this.res;
    const a = this.alb;
    u -= Math.floor(u);
    v -= Math.floor(v);
    if (!bilinear) {
      const i = (((v * res) | 0) * res + ((u * res) | 0)) * 3;
      out.r = a[i];
      out.g = a[i + 1];
      out.b = a[i + 2];
      return;
    }
    // Bilinear: blend the 4 texels around the sample point (torus-wrapped).
    const fx = u * res - 0.5;
    const fy = v * res - 0.5;
    const x0i = Math.floor(fx);
    const y0i = Math.floor(fy);
    const tx = fx - x0i;
    const ty = fy - y0i;
    const x0 = ((x0i % res) + res) % res;
    const y0 = ((y0i % res) + res) % res;
    const x1 = (x0 + 1) % res;
    const y1 = (y0 + 1) % res;
    const i00 = (y0 * res + x0) * 3;
    const i10 = (y0 * res + x1) * 3;
    const i01 = (y1 * res + x0) * 3;
    const i11 = (y1 * res + x1) * 3;
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    out.r = a[i00] * w00 + a[i10] * w10 + a[i01] * w01 + a[i11] * w11;
    out.g = a[i00 + 1] * w00 + a[i10 + 1] * w10 + a[i01 + 1] * w01 + a[i11 + 1] * w11;
    out.b = a[i00 + 2] * w00 + a[i10 + 2] * w10 + a[i01 + 2] * w01 + a[i11 + 2] * w11;
  }

  /** Nearest normal fetch (bilinear normals would need renormalizing; nearest reads fine). */
  normalAt(u: number, v: number, out: Normal): void {
    const res = this.res;
    u -= Math.floor(u);
    v -= Math.floor(v);
    const i = (((v * res) | 0) * res + ((u * res) | 0)) * 3;
    out.x = this.nrm[i];
    out.y = this.nrm[i + 1];
    out.z = this.nrm[i + 2];
  }
}
