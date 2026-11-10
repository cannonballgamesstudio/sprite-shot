import { describe, it, expect } from 'vitest';
import { serialize, deserialize, getFileInfo } from '../spriteshotFormatV2';
import type { SpriteShotProjectV2 } from '../schema';
import { SCHEMA_VERSION } from '../schema';

function makeTestProject(overrides?: Partial<SpriteShotProjectV2>): SpriteShotProjectV2 {
  return {
    schemaVersion: 2,
    id: 'test-id-123',
    name: 'Test Project',
    description: 'A test project',
    appVersion: '1.0.0',
    createdAt: '2026-01-15T12:00:00.000Z',
    modifiedAt: '2026-03-15T12:00:00.000Z',
    activeMode: 'static-imaging',
    cameraPresets: [
      {
        id: 'preset-1',
        name: 'Default',
        createdAt: '2026-01-15T12:00:00.000Z',
        cameraProps: {
          projection: 1,
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
        name: 'character.glb',
        filePath: 'meshes/character.glb',
        cameraPresetId: 'preset-1',
        importedAt: '2026-01-15T12:00:00.000Z',
        fileSize: 1024000,
        vertexCount: 5000,
      },
    ],
    animations: [
      {
        id: 'anim-1',
        name: 'walk.glb',
        filePath: 'animations/walk.glb',
        meshId: 'mesh-1',
        importedAt: '2026-01-15T12:00:00.000Z',
        duration: 1.5,
        frameRate: 30,
        frameCount: 45,
        trimStart: 0,
        trimEnd: 45,
      },
    ],
    props: [],
    settings: {
      autoSave: true,
      backupCount: 5,
      defaultPixelSize: 1,
      defaultCameraMode: 0,
    },
    modeConfigs: {},
    ...overrides,
  };
}

describe('spriteshotFormatV2', () => {
  describe('serialize + deserialize roundtrip', () => {
    it('roundtrips a full project without data loss', () => {
      const project = makeTestProject();
      const binary = serialize(project);
      const { project: loaded, migrated } = deserialize(binary);

      expect(migrated).toBe(false);
      expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
      expect(loaded.id).toBe(project.id);
      expect(loaded.name).toBe(project.name);
      expect(loaded.description).toBe(project.description);
      expect(loaded.appVersion).toBe(project.appVersion);
      expect(loaded.createdAt).toBe(project.createdAt);
      expect(loaded.modifiedAt).toBe(project.modifiedAt);
      expect(loaded.activeMode).toBe(project.activeMode);
    });

    it('preserves meshes', () => {
      const project = makeTestProject();
      const binary = serialize(project);
      const { project: loaded } = deserialize(binary);

      expect(loaded.meshes).toHaveLength(1);
      expect(loaded.meshes[0].id).toBe('mesh-1');
      expect(loaded.meshes[0].filePath).toBe('meshes/character.glb');
      expect(loaded.meshes[0].vertexCount).toBe(5000);
    });

    it('preserves animations with trim settings', () => {
      const project = makeTestProject();
      const binary = serialize(project);
      const { project: loaded } = deserialize(binary);

      expect(loaded.animations).toHaveLength(1);
      expect(loaded.animations[0].trimStart).toBe(0);
      expect(loaded.animations[0].trimEnd).toBe(45);
      expect(loaded.animations[0].frameRate).toBe(30);
    });

    it('preserves camera presets', () => {
      const project = makeTestProject();
      const binary = serialize(project);
      const { project: loaded } = deserialize(binary);

      expect(loaded.cameraPresets).toHaveLength(1);
      expect(loaded.cameraPresets[0].cameraProps.camsPerRing).toBe(12);
      expect(loaded.cameraPresets[0].cameraProps.rings).toBe(5);
    });

    it('preserves modeConfigs', () => {
      const project = makeTestProject({
        modeConfigs: {
          'gaussian-splat-training': { cameraCount: 64, outputFormat: 'nerf-synthetic' },
        },
      });
      const binary = serialize(project);
      const { project: loaded } = deserialize(binary);

      expect(loaded.modeConfigs['gaussian-splat-training']).toEqual({
        cameraCount: 64,
        outputFormat: 'nerf-synthetic',
      });
    });
  });

  describe('binary format', () => {
    it('starts with CBAL magic bytes', () => {
      const binary = serialize(makeTestProject());
      const magic = new TextDecoder().decode(binary.slice(0, 4));
      expect(magic).toBe('SPSH');
    });

    it('has correct version in header', () => {
      const binary = serialize(makeTestProject());
      const view = new DataView(binary.buffer, binary.byteOffset);
      const version = view.getUint16(4, true);
      expect(version).toBe(SCHEMA_VERSION);
    });

    it('compressed payload is smaller than raw JSON', () => {
      const project = makeTestProject();
      const binary = serialize(project);
      const rawJson = JSON.stringify(project);
      // Binary = 20-byte header + compressed payload
      // Should be meaningfully smaller than raw JSON for any non-trivial project
      expect(binary.byteLength).toBeLessThan(rawJson.length);
    });

    it('getFileInfo reads header correctly', () => {
      const binary = serialize(makeTestProject());
      const info = getFileInfo(binary);
      expect(info.magic).toBe('SPSH');
      expect(info.version).toBe(SCHEMA_VERSION);
      expect(info.isV1).toBe(false);
      expect(info.compressedSize).toBeGreaterThan(0);
      expect(info.totalSize).toBe(binary.byteLength);
    });
  });

  describe('error handling', () => {
    it('rejects data that is too small', () => {
      expect(() => deserialize(new Uint8Array(10))).toThrow('too small');
    });

    it('rejects wrong magic bytes', () => {
      const bad = new Uint8Array(20);
      bad.set(new TextEncoder().encode('NOPE'), 0);
      expect(() => deserialize(bad)).toThrow('wrong magic');
    });

    it('rejects corrupted checksums', () => {
      const binary = serialize(makeTestProject());
      // Corrupt a byte in the payload
      binary[binary.byteLength - 1] ^= 0xFF;
      expect(() => deserialize(binary)).toThrow('checksum mismatch');
    });

    it('rejects truncated files', () => {
      const binary = serialize(makeTestProject());
      // Truncate to just the header
      const truncated = binary.slice(0, 20);
      expect(() => deserialize(truncated)).toThrow('truncated');
    });
  });

  describe('empty/minimal projects', () => {
    it('handles project with no meshes, animations, or props', () => {
      const project = makeTestProject({
        meshes: [],
        animations: [],
        props: [],
        cameraPresets: [],
      });
      const binary = serialize(project);
      const { project: loaded } = deserialize(binary);
      expect(loaded.meshes).toEqual([]);
      expect(loaded.animations).toEqual([]);
      expect(loaded.props).toEqual([]);
    });
  });
});
