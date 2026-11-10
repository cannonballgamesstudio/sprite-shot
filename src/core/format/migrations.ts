/**
 * Migration system for .scene files.
 * Each migration transforms data from version N to version N+1.
 */

import type { SpriteShotProjectV2 } from './schema';
import { SCHEMA_VERSION } from './schema';

type Migrator = (data: Record<string, unknown>) => Record<string, unknown>;

const migrations: Map<number, Migrator> = new Map([
  [1, migrateV1toV2],
]);

/**
 * Migrate project data from any version to the latest schema version.
 */
export function migrateToLatest(data: unknown, fromVersion: number): SpriteShotProjectV2 {
  if (fromVersion === SCHEMA_VERSION) {
    return data as SpriteShotProjectV2;
  }
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `Cannot open file: schema version ${fromVersion} is newer than supported version ${SCHEMA_VERSION}. Update the app.`
    );
  }

  let current = data as Record<string, unknown>;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const migrator = migrations.get(v);
    if (!migrator) {
      throw new Error(`No migration path from schema version ${v} to ${v + 1}`);
    }
    current = migrator(current);
  }
  return current as unknown as SpriteShotProjectV2;
}

// ── V1 → V2 ──────────────────────────────────────────────────────

function safeISOString(val: unknown): string {
  if (typeof val === 'string') {
    // Already a string — try to parse and normalize
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  return new Date().toISOString();
}

function makeRelative(filePath: string, projectPath: string): string {
  if (!filePath) return filePath;
  // Normalize separators
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '');
  const fp = norm(filePath);
  const pp = norm(projectPath);
  if (fp.startsWith(pp + '/')) {
    return fp.slice(pp.length + 1);
  }
  // Already relative or different root — return as-is
  return fp;
}

function migrateV1toV2(v1: Record<string, unknown>): Record<string, unknown> {
  const projectPath = (v1.projectPath as string) || '';

  const meshes = (v1.meshes as Record<string, unknown>[]) || [];
  const animations = (v1.animations as Record<string, unknown>[]) || [];
  const props = (v1.props as Record<string, unknown>[]) || [];
  const cameraPresets = (v1.cameraPresets as Record<string, unknown>[]) || [];
  const settings = (v1.settings as Record<string, unknown>) || {};

  return {
    schemaVersion: 2,
    id: v1.id || crypto.randomUUID(),
    name: v1.name || 'Untitled',
    description: v1.description,
    appVersion: (v1.version as string) || '0.0.0',
    createdAt: safeISOString(v1.createdAt),
    modifiedAt: safeISOString(v1.modifiedAt),
    activeMode: 'static-imaging',
    cameraPresets: cameraPresets.map((p) => ({
      ...p,
      createdAt: safeISOString(p.createdAt),
    })),
    defaultCameraPresetId: v1.defaultCameraPresetId,
    meshes: meshes.map((m) => ({
      id: m.id,
      name: m.name,
      filePath: makeRelative(m.filePath as string, projectPath),
      cameraPresetId: m.cameraPresetId || '',
      position: m.position,
      rotation: m.rotation,
      scale: m.scale,
      importedAt: safeISOString(m.importedAt),
      fileSize: m.fileSize || 0,
      vertexCount: m.vertexCount,
      triangleCount: m.triangleCount,
    })),
    animations: animations.map((a) => {
      const animSettings = (a.settings as Record<string, unknown>) || {};
      return {
        id: a.id,
        name: a.name,
        filePath: makeRelative(a.filePath as string, projectPath),
        meshId: a.meshId,
        importedAt: safeISOString(a.importedAt),
        duration: a.duration || 0,
        frameRate: a.frameRate || 30,
        frameCount: a.frameCount || 0,
        trimStart: (animSettings.trimStart as number) ?? 0,
        trimEnd: (animSettings.trimEnd as number) ?? ((a.frameCount as number) || 0),
      };
    }),
    props: props.map((p) => ({
      ...p,
      filePath: makeRelative(p.filePath as string, projectPath),
      importedAt: safeISOString(p.importedAt),
    })),
    settings: {
      autoSave: settings.autoSave ?? true,
      backupCount: settings.backupCount ?? 5,
      defaultPixelSize: settings.defaultPixelSize ?? 1,
      defaultCameraMode: settings.defaultCameraMode ?? 0,
    },
    modeConfigs: {},
  };
}
