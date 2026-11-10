import { describe, it, expect } from 'vitest';
import { parseEffectBatchConfig } from '../effectBatchConfig';

const base = {
  output: { dir: '/work/game/public/sprites/effects' },
  presetId: 'preset-effect-spherical-band',
  frames: 8,
  effects: {
    'lightning-bolt': { shader: 'lightning', params: { coreColor: '#FFFFFF', glowColor: '#B8E6FF' } },
  },
  look: {
    celBands: 4, outlinePx: 0, outlineColor: '#1A0F26', matteBleedPx: 2, supersample: 4,
    alphaMode: 'straight',
  },
};

describe('parseEffectBatchConfig', () => {
  it('resolves one job per effect and builds contract filenames', () => {
    const { jobs, errors } = parseEffectBatchConfig(JSON.stringify(base));
    expect(errors).toEqual([]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      effectName: 'lightning-bolt',
      spec: base.effects['lightning-bolt'],
      fileName: 'lightning-bolt.png',
    });
  });

  it('reports invalid JSON as an error, not a throw', () => {
    const { errors } = parseEffectBatchConfig('{nope');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('treats explicit null for a required key as missing', () => {
    const cfg = { ...base, look: null };
    const { errors, jobs } = parseEffectBatchConfig(JSON.stringify(cfg));
    expect(errors.some((e) => e.includes('look'))).toBe(true);
    expect(jobs).toEqual([]);
  });

  it('rejects an empty effects map', () => {
    const cfg = { ...base, effects: {} };
    const { errors } = parseEffectBatchConfig(JSON.stringify(cfg));
    expect(errors.some((e) => e.includes('effects'))).toBe(true);
  });

  it('rejects an effect entry missing "shader"', () => {
    const cfg = { ...base, effects: { 'lightning-bolt': { params: {} } } };
    const { errors } = parseEffectBatchConfig(JSON.stringify(cfg));
    expect(errors.some((e) => e.includes('shader'))).toBe(true);
  });

  it('rejects a spaced effect name (filename-is-manifest parsing)', () => {
    const cfg = { ...base, effects: { 'lightning bolt': { shader: 'lightning' } } };
    const { errors } = parseEffectBatchConfig(JSON.stringify(cfg));
    expect(errors.some((e) => e.includes('lightning bolt'))).toBe(true);
  });

  it('rejects a non-positive frames value', () => {
    const cfg = { ...base, frames: 0 };
    const { errors } = parseEffectBatchConfig(JSON.stringify(cfg));
    expect(errors.some((e) => e.includes('frames'))).toBe(true);
  });

  it('allows a hyphenated effect name (unlike batchConfig.ts archetype/pose names)', () => {
    const { errors } = parseEffectBatchConfig(JSON.stringify(base));
    expect(errors).toEqual([]);
  });
});
