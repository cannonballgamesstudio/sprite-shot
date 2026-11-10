import { CameraProps, ViewportCameraMode, ViewportRenderType } from '../state/viewportStore';
import { AnimationSettings } from '../state/animationSettingStore';

// Camera preset system
export interface CameraPreset {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  
  // Camera configuration
  cameraProps: CameraProps;
  cameraMode: ViewportCameraMode;
  renderType: ViewportRenderType;
  pixelSize: number;
  
  // Toon shader settings (if enabled)
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
  
  // Post-processing effects
  postProcessing?: {
    pixelization: boolean;
    outline: boolean;
    customShaders: string[];
  };
}

// Mesh data in project
export interface ProjectMesh {
  id: string;
  name: string;
  filePath: string; // Relative to project root
  
  // Associated camera preset
  cameraPresetId: string;
  
  // Mesh-specific overrides
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  
  // Metadata
  importedAt: Date;
  fileSize: number;
  vertexCount?: number;
  triangleCount?: number;
}

// Animation data in project
export interface ProjectAnimation {
  id: string;
  name: string;
  filePath: string; // Relative to project root
  
  // Animation settings
  settings: AnimationSettings;
  
  // Associated mesh (if any)
  meshId?: string;
  
  // Metadata
  importedAt: Date;
  duration: number; // in seconds
  frameRate: number;
  frameCount: number;
}

export interface ProjectProp {
  id: string;
  name: string;
  filePath: string; // Relative to project root
  
  // Bone attachment
  parentMeshId: string; // ID of the rigged mesh this prop is attached to
  parentBoneName: string; // Name of the bone to attach to
  
  // Transform offsets relative to bone
  positionOffset: [number, number, number];
  rotationOffset: [number, number, number]; // Euler angles in radians
  scaleOffset: [number, number, number];
  
  // Visibility
  isVisible: boolean;
  
  // Metadata
  importedAt: Date;
  fileSize: number;
}

// Project/Scene structure
export interface SpriteShotProject {
  // Project metadata
  id: string;
  name: string;
  description?: string;
  version: string; // Sprite Shot version used
  createdAt: Date;
  modifiedAt: Date;
  
  // Project structure
  projectPath: string; // Root folder path
  
  // Camera presets
  cameraPresets: CameraPreset[];
  defaultCameraPresetId?: string;
  
  // Assets
  meshes: ProjectMesh[];
  animations: ProjectAnimation[];
  props: ProjectProp[];
  
  // Project settings
  settings: {
    autoSave: boolean;
    backupCount: number;
    defaultPixelSize: number;
    defaultCameraMode: ViewportCameraMode;
  };
  
  // Cache data (for performance)
  cache?: {
    thumbnails: { [meshId: string]: string }; // Base64 thumbnails
    lastUsedPresets: string[]; // Recently used preset IDs
    meshBoundingBoxes: { [meshId: string]: { min: [number, number, number], max: [number, number, number] } };
  };
}

// Binary format structure for .scene files
export interface SpriteShotBinaryFormat {
  header: {
    magic: string; // "CBAL" (4 bytes)
    version: number; // Format version (4 bytes)
    projectDataSize: number; // Size of compressed project data (4 bytes)
    checksumCRC32: number; // CRC32 checksum (4 bytes)
  };
  
  // Compressed JSON data of SpriteShotProject
  projectData: Uint8Array;
}

// Project folder structure
export interface ProjectFolderStructure {
  root: string;
  meshes: string;      // root/meshes/
  animations: string;  // root/animations/

  thumbnails: string;  // root/.cache/thumbnails/
  backups: string;     // root/.backups/
  sceneFile: string; // root/scene.spriteshot
}

// Events for project system
export type ProjectEvent = 
  | { type: 'project_created'; project: SpriteShotProject }
  | { type: 'project_loaded'; project: SpriteShotProject }
  | { type: 'project_saved'; project: SpriteShotProject }
  | { type: 'mesh_added'; mesh: ProjectMesh }
  | { type: 'mesh_removed'; meshId: string }
  | { type: 'animation_added'; animation: ProjectAnimation }
  | { type: 'animation_removed'; animationId: string }
  | { type: 'preset_applied'; meshId: string; presetId: string }
  | { type: 'preset_created'; preset: CameraPreset }
  | { type: 'preset_updated'; preset: CameraPreset }
  | { type: 'preset_deleted'; presetId: string }
  | { type: 'prop_added'; prop: ProjectProp }
  | { type: 'prop_removed'; propId: string }
  | { type: 'prop_attached'; propId: string; boneName: string };
