import { describe, it, expect } from 'vitest';
import { cellPlacement, hexToRgb, wantsHardCutout } from '../sphericalAnimationCapture';

describe('cellPlacement', () => {
  it('matches the frozen contract grid: row = ring, col = cam*F + frame (128px cells)', () => {
    expect(cellPlacement(0, 0, 0, 6, 128)).toEqual({ x: 0, y: 0 });
    expect(cellPlacement(0, 0, 5, 6, 128)).toEqual({ x: 640, y: 0 });   // frame 5 of cam 0
    expect(cellPlacement(0, 1, 0, 6, 128)).toEqual({ x: 768, y: 0 });   // cam 1 starts at col 6
    expect(cellPlacement(3, 7, 5, 6, 128)).toEqual({ x: 6016, y: 384 }); // ring 3 row (of 5)
    expect(cellPlacement(4, 7, 5, 6, 128)).toEqual({ x: 6016, y: 512 }); // last cell of a 6144x640 sheet (5 rings)
  });
  it('mirrors the game loader inference: cellH = height/RINGS, frames = width/cellW/CAMS (128px cells)', () => {
    const last = cellPlacement(4, 7, 5, 6, 128);
    expect(last.x + 128).toBe(128 * 8 * 6); // sheet width 6144
    expect(last.y + 128).toBe(128 * 5);     // sheet height 640 (5 rings)
  });
  it('is cellSize-parametric (pure math, not hardcoded to any one contract resolution)', () => {
    expect(cellPlacement(3, 7, 5, 6, 64)).toEqual({ x: 3008, y: 192 });
  });
});

describe('hexToRgb', () => {
  it('parses the contract outline color', () => {
    expect(hexToRgb('#1A0F26')).toEqual([26, 15, 38]);
  });
});

describe('wantsHardCutout (LookSpec.alphaMode gate)', () => {
  it('defaults to hard-cutout when alphaMode is absent — crowd-batch.json is byte-for-byte unaffected', () => {
    expect(wantsHardCutout(undefined)).toBe(true);
  });
  it('"binary" explicitly requests hard-cutout', () => {
    expect(wantsHardCutout('binary')).toBe(true);
  });
  it('"straight" opts out of hard-cutout, preserving soft alpha edges for glowing VFX', () => {
    expect(wantsHardCutout('straight')).toBe(false);
  });
});
