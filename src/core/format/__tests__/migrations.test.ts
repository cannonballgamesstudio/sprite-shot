import { describe, it, expect } from 'vitest';
import { migrateToLatest } from '../migrations';

function makeV1Project(overrides?: Record<string, unknown>) {
  return {
    id: 'v1-project-id',
    name: 'My V1 Project',
    description: 'A project saved in V1 format',
    version: '0.1.0',
    createdAt: '2025-06-15T10:30:00.000Z',
    modifiedAt: '2025-12-20T14:00:00.000Z',
    projectPath: '/home/test/Projects/MyProject',
    cameraPresets: [
      {
        id: 'preset-1',
        name: 'Default 2D Sprite',
        createdAt: '2025-06-15T10:30:00.000Z',
        cameraProps: {
          projection: 0,
          resolution: [256, 256],
          fov: 75,
          minZ: 0.01,
          maxZ: 1000,
          orthoScale: 1,
          radius: 2,
          rings: 5,
          camsPerRing: 12,
          animateEachCamera: false,
        },
        cameraMode: 0,
        renderType: 0,
        pixelSize: 1,
      },
    ],
    meshes: [
      {
        id: 'mesh-1',
        name: 'hero.glb',
        filePath: '/home/test/Projects/MyProject/meshes/hero.glb',
        cameraPresetId: 'preset-1',
        importedAt: '2025-06-15T11:00:00.000Z',
        fileSize: 2048000,
      },
    ],
    animations: [
      {
        id: 'anim-1',
        name: 'idle.glb',
        filePath: '/home/test/Projects/MyProject/animations/idle.glb',
        meshId: 'mesh-1',
        importedAt: '2025-07-01T09:00:00.000Z',
        duration: 2.0,
        frameRate: 24,
        frameCount: 48,
        settings: {
          id: 'anim-1',
          name: 'idle.glb',
          totalFrames: 48,
          currentFrameTarget: 24,
          trimStart: 5,
          trimEnd: 40,
        },
      },
    ],
    props: [],
    settings: {
      autoSave: true,
      backupCount: 3,
      defaultPixelSize: 1,
      defaultCameraMode: 0,
    },
    cache: {
      thumbnails: { 'mesh-1': 'data:image/png;base64,abc123' },
      lastUsedPresets: ['preset-1'],
      meshBoundingBoxes: {},
    },
    ...overrides,
  };
}

describe('V1 → V2 migration', () => {
  it('sets schemaVersion to 2', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.schemaVersion).toBe(2);
  });

  it('converts createdAt/modifiedAt to ISO strings', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.modifiedAt).toBe('string');
    expect(result.createdAt).toContain('2025-06-15');
    expect(result.modifiedAt).toContain('2025-12-20');
  });

  it('sets activeMode to static-imaging', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.activeMode).toBe('static-imaging');
  });

  it('adds empty modeConfigs', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.modeConfigs).toEqual({});
  });

  it('converts mesh filePath from absolute to relative', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.meshes[0].filePath).toBe('meshes/hero.glb');
  });

  it('converts animation filePath from absolute to relative', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.animations[0].filePath).toBe('animations/idle.glb');
  });

  it('inlines animation trim settings', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.animations[0].trimStart).toBe(5);
    expect(result.animations[0].trimEnd).toBe(40);
    // settings object should NOT exist on V2 animation
    expect((result.animations[0] as any).settings).toBeUndefined();
  });

  it('strips cache field', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect((result as any).cache).toBeUndefined();
  });

  it('strips projectPath from serialized data', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect((result as any).projectPath).toBeUndefined();
  });

  it('renames version to appVersion', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.appVersion).toBe('0.1.0');
    expect((result as any).version).toBeUndefined();
  });

  it('converts camera preset dates to ISO strings', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(typeof result.cameraPresets[0].createdAt).toBe('string');
  });

  it('handles already-relative paths gracefully', () => {
    const v1 = makeV1Project({
      meshes: [
        {
          id: 'mesh-1',
          name: 'hero.glb',
          filePath: 'meshes/hero.glb', // already relative
          cameraPresetId: 'preset-1',
          importedAt: '2025-06-15T11:00:00.000Z',
          fileSize: 2048000,
        },
      ],
    });
    const result = migrateToLatest(v1, 1);
    expect(result.meshes[0].filePath).toBe('meshes/hero.glb');
  });

  it('handles Date objects (not just strings) for dates', () => {
    const v1 = makeV1Project({
      createdAt: new Date('2025-06-15T10:30:00.000Z'),
      modifiedAt: new Date('2025-12-20T14:00:00.000Z'),
    });
    const result = migrateToLatest(v1, 1);
    expect(result.createdAt).toContain('2025-06-15');
  });

  it('defaults missing animation settings to frameCount', () => {
    const v1 = makeV1Project({
      animations: [
        {
          id: 'anim-1',
          name: 'run.glb',
          filePath: 'animations/run.glb',
          importedAt: '2025-07-01T09:00:00.000Z',
          duration: 1.0,
          frameRate: 30,
          frameCount: 30,
          // NO settings object
        },
      ],
    });
    const result = migrateToLatest(v1, 1);
    expect(result.animations[0].trimStart).toBe(0);
    expect(result.animations[0].trimEnd).toBe(30);
  });

  it('preserves settings fields', () => {
    const result = migrateToLatest(makeV1Project(), 1);
    expect(result.settings.autoSave).toBe(true);
    expect(result.settings.backupCount).toBe(3);
  });
});

describe('migration edge cases', () => {
  it('returns data unchanged if already at latest version', () => {
    const v2 = migrateToLatest(makeV1Project(), 1);
    const v2Again = migrateToLatest(v2, 2);
    expect(v2Again).toBe(v2); // same reference, no-op
  });

  it('throws for future versions', () => {
    expect(() => migrateToLatest({}, 99)).toThrow('newer than supported');
  });
});
