import { describe, it, expect } from 'vitest';
import { quantizeCel, outlineAlpha, matteBleed, binarizeAlpha, RGBA } from '../cellOps';

function img(w: number, h: number, fill: [number, number, number, number]): RGBA {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { data, width: w, height: h };
}
const px = (im: RGBA, x: number, y: number) =>
  Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

describe('quantizeCel', () => {
  it('snaps luminance to band centers, preserving hue ratios', () => {
    // mid-gray 120 in a 2-band quantize → band 0 center = 63.75 ≈ 64
    const im = img(1, 1, [120, 120, 120, 255]);
    quantizeCel(im, 2);
    const [r, g, , a] = px(im, 0, 0);
    expect(a).toBe(255);
    expect(r).toBe(g);
    expect(Math.abs(r - 64)).toBeLessThanOrEqual(1);
  });
  it('two different input lumas in the same band converge to one value', () => {
    const a1 = img(1, 1, [100, 100, 100, 255]);
    const a2 = img(1, 1, [20, 20, 20, 255]);
    quantizeCel(a1, 2); quantizeCel(a2, 2);
    expect(px(a1, 0, 0)[0]).toBe(px(a2, 0, 0)[0]);
  });
  it('ignores transparent pixels', () => {
    const im = img(1, 1, [120, 120, 120, 0]);
    quantizeCel(im, 2);
    expect(px(im, 0, 0)).toEqual([120, 120, 120, 0]);
  });
  it('snaps near-black opaque pixels to band center when hue is meaningless', () => {
    // pure black (0,0,0) with luma ≈ 0; in 2-band quantize should snap to band 0 center = 64
    const im = img(1, 1, [0, 0, 0, 255]);
    quantizeCel(im, 2);
    const [r, g, b, a] = px(im, 0, 0);
    expect(a).toBe(255);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(Math.abs(r - 64)).toBeLessThanOrEqual(1);
  });

  describe('with a compressed output range', () => {
    it('defaults to [0,255], leaving existing behavior unchanged', () => {
      // mid-gray 120 in a 2-band quantize with no range arg → band 0 center = 63.75 ≈ 64
      const im = img(1, 1, [120, 120, 120, 255]);
      quantizeCel(im, 2);
      const [r] = px(im, 0, 0);
      expect(Math.abs(r - 64)).toBeLessThanOrEqual(1);
    });

    it('compresses band centers into [min,max] instead of [0,255]', () => {
      // bands=3, range=[70,195]: band 0 center = 70 + (0.5/3)*125 ≈ 90.83
      const dark = img(1, 1, [10, 10, 10, 255]);
      quantizeCel(dark, 3, [70, 195]);
      const [r1] = px(dark, 0, 0);
      expect(Math.abs(r1 - 90.8)).toBeLessThanOrEqual(2);

      // band 2 center = 70 + (2.5/3)*125 ≈ 174.17
      const light = img(1, 1, [240, 240, 240, 255]);
      quantizeCel(light, 3, [70, 195]);
      const [r2] = px(light, 0, 0);
      expect(Math.abs(r2 - 174.2)).toBeLessThanOrEqual(2);
    });

    it('band selection still uses the full 0-255 luma domain even when output is compressed', () => {
      // luma 10 and luma 240 must land in DIFFERENT bands (0 and 2) despite compressed output range
      const dark = img(1, 1, [10, 10, 10, 255]);
      const light = img(1, 1, [240, 240, 240, 255]);
      quantizeCel(dark, 3, [70, 195]);
      quantizeCel(light, 3, [70, 195]);
      expect(px(dark, 0, 0)[0]).not.toBe(px(light, 0, 0)[0]);
    });

    it('preserves hue ratio under range compression (scale-based, same as today)', () => {
      // saturated red-ish pixel; R:G:B ratio should be preserved after scaling to the new target
      const im = img(1, 1, [200, 100, 50, 255]);
      const [r0, g0, b0] = px(im, 0, 0);
      quantizeCel(im, 3, [70, 195]);
      const [r, g, b] = px(im, 0, 0);
      // ratios preserved within floating rounding
      expect(Math.abs(r / g - r0 / g0)).toBeLessThan(0.05);
      expect(Math.abs(g / b - g0 / b0)).toBeLessThan(0.05);
    });
  });

  describe('clipping / desaturation regression (the "pink hair" bug)', () => {
    // Measured defect pixel: dark, highly-saturated hair rgb(119,16,78). With bands=3,
    // range=[70,195] the required scale (target/luma ≈ 2.14) pushes red past 255 under
    // the old per-channel Math.min(255,...) clamp, breaking the R:G:B ratio (hue shift)
    // and reading as neon pink once lifted to mid-lightness.
    const HAIR: [number, number, number, number] = [119, 16, 78, 255];

    function hslSaturation(r: number, g: number, b: number): number {
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
      const l = (max + min) / 2;
      if (max === min) return 0;
      const d = max - min;
      return l > 0.5 ? d / (2 - max - min) : d / (max + min);
    }

    it('never clips a channel past 255, preserving hue (r/b ratio)', () => {
      const im = img(1, 1, HAIR);
      const [r0, , b0] = px(im, 0, 0);
      quantizeCel(im, 3, [70, 195]);
      const [r, g, b, a] = px(im, 0, 0);
      expect(a).toBe(255);
      expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeLessThanOrEqual(255);
      // r/b ratio within 2% of the input's ratio (119/78)
      const inputRatio = r0 / b0;
      const outputRatio = r / b;
      expect(Math.abs(outputRatio - inputRatio) / inputRatio).toBeLessThan(0.02);
    });

    it('desat tames the lift while landing on the band-0 target luminance', () => {
      const withoutDesat = img(1, 1, HAIR);
      quantizeCel(withoutDesat, 3, [70, 195], 0);
      const [r0, g0, b0] = px(withoutDesat, 0, 0);
      const satWithout = hslSaturation(r0, g0, b0);

      const withDesat = img(1, 1, HAIR);
      quantizeCel(withDesat, 3, [70, 195], 0.4);
      const [r1, g1, b1] = px(withDesat, 0, 0);
      const satWith = hslSaturation(r1, g1, b1);

      expect(satWith).toBeLessThan(satWithout - 0.05); // materially lower saturation

      // luminance still ≈ band-0 target for range [70,195] (≈90.8), ±3
      const outLuma = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
      expect(Math.abs(outLuma - 90.8)).toBeLessThanOrEqual(3);
    });

    it('desat is a no-op for pixels whose luma already equals the band target (s ≈ 1)', () => {
      // bands=2, default range [0,255]: band 0 center = 64. Pick an unsaturated pixel
      // whose luma is already 64, so s ≈ 1 and desat has nothing to blend.
      const flat: [number, number, number, number] = [64, 64, 64, 255];
      const withoutDesat = img(1, 1, flat);
      quantizeCel(withoutDesat, 2, [0, 255], 0);
      const withDesat = img(1, 1, flat);
      quantizeCel(withDesat, 2, [0, 255], 0.4);
      expect(px(withDesat, 0, 0)).toEqual(px(withoutDesat, 0, 0));
    });

    it('never fully desaturates an extremely dark, heavily-lifted pixel (bounded-amount regression)', () => {
      // Deep hair shadow: luma ≈ 8, band-0 target ≈ 90.83 for range [70,195] → s ≈ 11.3.
      // Under the old unbounded `Math.min(1, (s - 1) * desat)` formula this hits amount = 1
      // and the pixel blends fully to neutral gray (saturation 0). The bounded curve
      // `desat * (1 - 1/s)` can never reach 1, so desat=0.6 must leave >40% of chroma headroom.
      const im = img(1, 1, [20, 4, 13, 255]);
      quantizeCel(im, 3, [70, 195], 0.6);
      const [r, g, b, a] = px(im, 0, 0);
      expect(a).toBe(255);
      const sat = hslSaturation(r, g, b);
      expect(sat).toBeGreaterThan(0.15);
    });

    it('is monotone in lift: a moderately-lifted pixel keeps more saturation than a heavily-lifted one at the same desat', () => {
      const moderate = img(1, 1, HAIR); // s ≈ 2.14
      quantizeCel(moderate, 3, [70, 195], 0.6);
      const [rm, gm, bm] = px(moderate, 0, 0);
      const satModerate = hslSaturation(rm, gm, bm);

      const extreme = img(1, 1, [20, 4, 13, 255]); // s ≈ 11.3, much larger lift
      quantizeCel(extreme, 3, [70, 195], 0.6);
      const [re, ge, be] = px(extreme, 0, 0);
      const satExtreme = hslSaturation(re, ge, be);

      expect(satModerate).toBeGreaterThan(satExtreme);
    });
  });
});

describe('outlineAlpha', () => {
  it('draws color on transparent pixels adjacent to opaque ones, 1px thick', () => {
    const im = img(5, 5, [0, 0, 0, 0]);
    im.data.set([200, 200, 200, 255], (2 * 5 + 2) * 4); // opaque center
    outlineAlpha(im, 1, [26, 15, 38]);
    expect(px(im, 1, 2)).toEqual([26, 15, 38, 255]);  // side neighbor
    expect(px(im, 1, 1)).toEqual([26, 15, 38, 255]);  // diagonal (Chebyshev 1)
    expect(px(im, 0, 0)).toEqual([0, 0, 0, 0]);        // distance 2 — untouched
    expect(px(im, 2, 2)).toEqual([200, 200, 200, 255]); // opaque pixel untouched
  });
  it('does not dilate off its own outline', () => {
    const im = img(7, 1, [0, 0, 0, 0]);
    im.data.set([200, 200, 200, 255], (0 * 7 + 3) * 4);
    outlineAlpha(im, 1, [26, 15, 38]);
    expect(px(im, 1, 0)[3]).toBe(0); // 2 away from original opaque — still clear
  });
});

describe('matteBleed', () => {
  it('copies nearest opaque RGB into transparent neighbors without touching alpha', () => {
    const im = img(3, 1, [0, 0, 0, 0]);
    im.data.set([250, 10, 10, 255], (0 * 3 + 0) * 4);
    matteBleed(im, 2);
    expect(px(im, 1, 0)).toEqual([250, 10, 10, 0]);
    expect(px(im, 2, 0)).toEqual([250, 10, 10, 0]);
  });
  it('respects true Euclidean radius (not square search window)', () => {
    // 5x5 image, only opaque pixel at (0,0), radiusPx=2
    const im = img(5, 5, [0, 0, 0, 0]);
    im.data.set([200, 100, 50, 255], (0 * 5 + 0) * 4);
    matteBleed(im, 2);
    // (1,1): distance = sqrt(2) ≈ 1.41 ≤ 2, should bleed
    expect(px(im, 1, 1)).toEqual([200, 100, 50, 0]);
    // (2,2): distance = sqrt(8) ≈ 2.83 > 2, should NOT bleed
    expect(px(im, 2, 2)).toEqual([0, 0, 0, 0]);
  });
});

describe('binarizeAlpha', () => {
  it('snaps partial alpha to 0/255 at the 128 threshold', () => {
    const im = img(2, 1, [10, 20, 30, 127]);
    im.data.set([10, 20, 30, 128], 4);
    binarizeAlpha(im);
    expect(px(im, 0, 0)[3]).toBe(0);
    expect(px(im, 1, 0)[3]).toBe(255);
    expect(px(im, 0, 0).slice(0, 3)).toEqual([10, 20, 30]); // RGB untouched
  });
});
