import { describe, it, expect } from 'vitest';
import { parseBatchConfig } from '../batchConfig';

const base = {
  output: { dir: '/work/game/public/sprites/crowd' },
  presetId: 'preset-crowd-spherical-band',
  frames: 6,
  sourceDir: 'C:/clips',
  poses: { idle: 'Sit.fbx', cheer: { clip: 'Yell.fbx', trim: [10, 40] as [number, number] } },
  archetypes: [
    { name: 'normal', scale: [1, 1, 1] as [number, number, number] },
    { name: 'fat', scale: [1.35, 0.95, 1.35] as [number, number, number] },
  ],
  fit: { heightPose: 'cheer', heightArchetype: 'fat', widthArchetype: 'fat', fillFrac: 0.9 },
  look: { celBands: 3, outlinePx: 1, outlineColor: '#1A0F26', matteBleedPx: 2, supersample: 4 },
};

describe('parseBatchConfig', () => {
  it('resolves jobs clip-outer with archetypes inner and builds contract filenames', () => {
    const { jobs, errors } = parseBatchConfig(JSON.stringify(base), '/work/game', { preview: false });
    expect(errors).toEqual([]);
    expect(jobs.map((j) => j.fileName)).toEqual([
      'normal_idle.png', 'fat_idle.png', 'normal_cheer.png', 'fat_cheer.png',
    ]);
    expect(jobs[0].clipPath).toBe('C:/clips/Sit.fbx');
    expect(jobs[2].trim).toEqual([10, 40]);
  });
  it('rejects null poses outside preview mode, naming them', () => {
    const cfg = { ...base, poses: { ...base.poses, walk: null } };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('walk'))).toBe(true);
  });
  it('allows null poses in preview mode', () => {
    const cfg = { ...base, poses: { idle: null } };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: true });
    expect(errors).toEqual([]);
  });
  it('rejects underscores in archetype names (filename-is-manifest parsing)', () => {
    const cfg = { ...base, archetypes: [{ name: 'tall_skinny', scale: [1, 1, 1] }] };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('underscore'))).toBe(true);
  });
  it('resolves relative sourceDir against the config directory', () => {
    const cfg = { ...base, sourceDir: 'clips' };
    const { jobs } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(jobs[0].clipPath).toBe('/work/game/clips/Sit.fbx');
  });
  it('reports invalid JSON as an error, not a throw', () => {
    const { errors } = parseBatchConfig('{nope', '/work/game', { preview: false });
    expect(errors.length).toBeGreaterThan(0);
  });
  it('treats explicit null for a required key as missing', () => {
    const cfg = { ...base, sourceDir: null };
    const { errors, jobs } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('sourceDir'))).toBe(true);
    expect(jobs).toEqual([]);
  });
  it('seeds clipPool from the optional clips field in preview mode with all-null poses', () => {
    const cfg = { ...base, poses: { idle: null }, clips: ['A.fbx', 'B.fbx'] };
    const { clipPool, errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: true });
    expect(errors).toEqual([]);
    expect(clipPool.map((c) => c.path)).toEqual(['C:/clips/A.fbx', 'C:/clips/B.fbx']);
  });
  it('dedups clipPool when a pose assignment repeats a clips entry', () => {
    const cfg = { ...base, clips: ['Sit.fbx'] };
    const { clipPool } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(clipPool.filter((c) => c.path === 'C:/clips/Sit.fbx')).toHaveLength(1);
  });
  it('rejects a non-array clips field', () => {
    const cfg = { ...base, clips: 'Sit.fbx' };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: true });
    expect(errors.some((e) => e.includes('clips'))).toBe(true);
  });
  it('rejects a spaced pose key (filename-is-manifest parsing)', () => {
    const cfg = { ...base, poses: { ...base.poses, 'war cry': 'Yell.fbx' } };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('war cry'))).toBe(true);
  });
  it('rejects a hyphenated archetype name (filename-is-manifest parsing)', () => {
    const cfg = { ...base, archetypes: [{ name: 'old-man', scale: [1, 1, 1] as [number, number, number] }] };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('old-man'))).toBe(true);
  });
  it('allows modelYawDeg to be absent with no error', () => {
    const { errors } = parseBatchConfig(JSON.stringify(base), '/work/game', { preview: false });
    expect(errors).toEqual([]);
  });
  it('rejects a non-numeric modelYawDeg, naming the field', () => {
    const cfg = { ...base, modelYawDeg: '90' };
    const { errors } = parseBatchConfig(JSON.stringify(cfg), '/work/game', { preview: false });
    expect(errors.some((e) => e.includes('modelYawDeg'))).toBe(true);
  });
});
