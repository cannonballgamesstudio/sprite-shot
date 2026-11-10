/** Pure pixel ops on a plain RGBA record (structurally = DOM ImageData).
 *  All ops are in-place and environment-agnostic (no canvas, no DOM). */
export interface RGBA {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Binary-intent alpha cutoff shared by every op in this module (see binarizeAlpha). */
const OPACITY_THRESHOLD = 128;

/** Snap opaque pixels' luminance to band centers; hue preserved by uniform RGB scale.
 *  `range` compresses the OUTPUT band centers into [min,max] (default [0,255], today's
 *  behavior). Band SELECTION still uses the pixel's own luminance against the full 0–255
 *  domain — only the target luma the band snaps to is remapped into the narrower range.
 *  `desat` (default 0, no-op) tames the saturation/lightness spike that a dark, highly-
 *  saturated pixel gets when lifted to a much brighter band target (see cellOps.test.ts
 *  "pink hair" regression) by blending the scaled color toward the neutral gray of the
 *  target luminance, in proportion to how much scale-up ("lift") was required. */
export function quantizeCel(
  img: RGBA, bands: number, range: [number, number] = [0, 255], desat: number = 0,
): void {
  const d = img.data;
  const [min, max] = range;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < OPACITY_THRESHOLD) continue;
    const l = luma(d[i], d[i + 1], d[i + 2]);
    const band = Math.min(bands - 1, Math.floor((l / 256) * bands));
    const target = min + ((band + 0.5) / bands) * (max - min);
    if (l < 1) {
      // Near-black: hue is meaningless, set RGB directly to gray band center
      d[i] = target;
      d[i + 1] = target;
      d[i + 2] = target;
    } else {
      // Scale RGB uniformly to reach target luma. Never clip a single channel in isolation
      // (that breaks the R:G:B ratio i.e. shifts hue) — cap the scale itself so the largest
      // channel lands at exactly 255 and every channel is scaled by the SAME factor.
      const s = target / l;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const sSafe = Math.min(s, 255 / Math.max(r, g, b, 1));
      let rr = r * sSafe, gg = g * sSafe, bb = b * sSafe;
      if (desat > 0 && s > 1) {
        // Blend toward gray(target) in proportion to how much lift was needed. Both endpoints
        // (the scaled color and gray(target)) have luma == target, so this is luminance-
        // preserving — it recovers the luminance sSafe's cap gave up while taming saturation.
        // Asymptotic in s (never reaches 1): desat is a true CEILING on how much chroma can
        // ever be removed, however large the lift. A naive `(s - 1) * desat` clamped to 1 blows
        // past full desaturation for very dark pixels (s can be 10+), flattening them to gray.
        const amount = desat * (1 - 1 / s);
        rr = rr * (1 - amount) + target * amount;
        gg = gg * (1 - amount) + target * amount;
        bb = bb * (1 - amount) + target * amount;
      }
      d[i] = rr;
      d[i + 1] = gg;
      d[i + 2] = bb;
    }
  }
}

/** Transparent px within `thicknessPx` (Chebyshev) of an ORIGINALLY-opaque px → color, a=255. */
export function outlineAlpha(img: RGBA, thicknessPx: number, color: [number, number, number]): void {
  const { data: d, width: w, height: h } = img;
  const wasOpaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) wasOpaque[i] = d[i * 4 + 3] >= OPACITY_THRESHOLD ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (wasOpaque[i]) continue;
      let hit = false;
      for (let dy = -thicknessPx; dy <= thicknessPx && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -thicknessPx; dx <= thicknessPx; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && wasOpaque[yy * w + xx]) { hit = true; break; }
        }
      }
      if (hit) {
        d[i * 4] = color[0]; d[i * 4 + 1] = color[1]; d[i * 4 + 2] = color[2]; d[i * 4 + 3] = 255;
      }
    }
  }
}

/** Copy the nearest opaque px's RGB into transparent px within radius; alpha untouched. */
export function matteBleed(img: RGBA, radiusPx: number): void {
  const { data: d, width: w, height: h } = img;
  const wasOpaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) wasOpaque[i] = d[i * 4 + 3] >= OPACITY_THRESHOLD ? 1 : 0;
  const radiusSq = radiusPx * radiusPx;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (wasOpaque[i]) continue;
      let best = -1, bestDist = Infinity;
      for (let dy = -radiusPx; dy <= radiusPx; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radiusPx; dx <= radiusPx; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !wasOpaque[yy * w + xx]) continue;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) { bestDist = dist; best = yy * w + xx; }
        }
      }
      if (best >= 0 && bestDist <= radiusSq) {
        d[i * 4] = d[best * 4]; d[i * 4 + 1] = d[best * 4 + 1]; d[i * 4 + 2] = d[best * 4 + 2];
      }
    }
  }
}

/** Snap alpha to the binary-intent contract: a >= 128 -> 255, else 0. RGB untouched. */
export function binarizeAlpha(img: RGBA): void {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= OPACITY_THRESHOLD ? 255 : 0;
}
