/**
 * Sprite Shot Project Schema V2
 *
 * Key differences from V1:
 * - All dates are ISO 8601 strings (not Date objects)
 * - projectPath removed from serialized data (derived at load time)
 * - All asset paths relative to project root
 * - cache field removed from persisted format (runtime-only)
 * - activeMode field added for mode system
 * - modeConfigs field added for per-mode persistent settings
 * - animation.settings inlined (trimStart/trimEnd on animation directly)
 */

import type { CameraProps, ViewportCameraMode, ViewportRenderType } from '../../state/viewportStore';

export const SCHEMA_VERSION = 2;

// ── V2 Types ──────────────────────────────────────────────────────

export interface CameraPresetV2 {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO 8601

  cameraProps: CameraProps;
  cameraMode: ViewportCameraMode;
  renderType: ViewportRenderType;
  pixelSize: number;

  toonSettings?: {
    enabled: boolean;
    toonSteps: number;
    rimColor: [number, number, number];
    rimPower: number;
    diffuseColor: [number, number, number];
    posterizationLevels: number;
    edgeThreshold: number;
    edgeColor: [number, number, number];
  };

  postProcessing?: {
    pixelization: boolean;
    outline: boolean;
    customShaders: string[];
  };
}

export interface ProjectMeshV2 {
  id: string;
  name: string;
  filePath: string; // Always relative to project root
  cameraPresetId: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  importedAt: string; // ISO 8601
  fileSize: number;
  vertexCount?: number;
  triangleCount?: number;
}

export interface ProjectAnimationV2 {
  id: string;
  name: string;
  filePath: string; // Always relative to project root
  meshId?: string;
  importedAt: string; // ISO 8601
  duration: number;
  frameRate: number;
  frameCount: number;
  trimStart: number;
  trimEnd: number;
}

export interface ProjectPropV2 {
  id: string;
  name: string;
  filePath: string; // Always relative to project root
  parentMeshId: string;
  parentBoneName: string;
  positionOffset: [number, number, number];
  rotationOffset: [number, number, number];
  scaleOffset: [number, number, number];
  isVisible: boolean;
  importedAt: string; // ISO 8601
  fileSize: number;
}

export interface ProjectSettingsV2 {
  autoSave: boolean;
  backupCount: number;
  defaultPixelSize: number;
  defaultCameraMode: ViewportCameraMode;
}

export interface SpriteShotProjectV2 {
  schemaVersion: 2;
  id: string;
  name: string;
  description?: string;
  appVersion: string;
  createdAt: string; // ISO 8601
  modifiedAt: string; // ISO 8601
  // NOTE: projectPath is NOT stored — derived from file location at load time
  activeMode: string;
  cameraPresets: CameraPresetV2[];
  defaultCameraPresetId?: string;
  meshes: ProjectMeshV2[];
  animations: ProjectAnimationV2[];
  props: ProjectPropV2[];
  settings: ProjectSettingsV2;
  modeConfigs: Record<string, unknown>;
}

// ── Validation ────────────────────────────────────────────────────

export function validateProjectV2(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null) {
    return { valid: false, errors: ['Project data is not an object'] };
  }

  const d = data as Record<string, unknown>;

  if (d.schemaVersion !== 2) {
    errors.push(`Expected schemaVersion 2, got ${d.schemaVersion}`);
  }
  if (typeof d.id !== 'string' || !d.id) {
    errors.push('Missing or invalid id');
  }
  if (typeof d.name !== 'string' || !d.name) {
    errors.push('Missing or invalid name');
  }
  if (typeof d.createdAt !== 'string') {
    errors.push('Missing or invalid createdAt (expected ISO 8601 string)');
  }
  if (typeof d.modifiedAt !== 'string') {
    errors.push('Missing or invalid modifiedAt (expected ISO 8601 string)');
  }
  if (!Array.isArray(d.meshes)) {
    errors.push('Missing or invalid meshes array');
  }
  if (!Array.isArray(d.animations)) {
    errors.push('Missing or invalid animations array');
  }
  if (!Array.isArray(d.props)) {
    errors.push('Missing or invalid props array');
  }
  if (!Array.isArray(d.cameraPresets)) {
    errors.push('Missing or invalid cameraPresets array');
  }
  if (typeof d.settings !== 'object' || d.settings === null) {
    errors.push('Missing or invalid settings');
  }

  return { valid: errors.length === 0, errors };
}
