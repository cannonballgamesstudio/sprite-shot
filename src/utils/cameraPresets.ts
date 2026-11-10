import { CameraPreset } from '../types/project';
import { CameraProps, ViewportCameraMode, ViewportRenderType, CameraProjection } from '../state/viewportStore';

// Default camera presets that come with Sprite Shot
export const DEFAULT_CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'preset-default-2d',
    name: 'Default 2D Sprite',
    description: 'Standard 2D sprite capture with orthographic projection',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.PLANAR,
    renderType: ViewportRenderType.STATIC,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.ORTHOGRAPHIC,
      resolution: [256, 256],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 2,
      rings: 1,
      camsPerRing: 12,
      animateEachCamera: false,
    },
    postProcessing: {
      pixelization: false,
      outline: false,
      customShaders: [],
    },
  },
  
  {
    id: 'preset-pixelart-2d',
    name: 'Pixel Art 2D',
    description: 'Pixelated 2D sprites with 6x pixel size',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.PLANAR,
    renderType: ViewportRenderType.STATIC,
    pixelSize: 6,
    cameraProps: {
      projection: CameraProjection.ORTHOGRAPHIC,
      resolution: [128, 128],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 2,
      rings: 1,
      camsPerRing: 8,
      animateEachCamera: false,
    },
    postProcessing: {
      pixelization: true,
      outline: false,
      customShaders: [],
    },
  },
  
  {
    id: 'preset-3d-spherical',
    name: '3D Spherical Capture',
    description: 'Full 3D capture with multiple elevation rings',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.STATIC,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [256, 256],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 3,
      rings: 5,
      camsPerRing: 8,
      animateEachCamera: false,
    },
    postProcessing: {
      pixelization: false,
      outline: false,
      customShaders: [],
    },
  },
  
  {
    id: 'preset-animated-2d',
    name: 'Animated 2D Sprite',
    description: '2D sprite with camera animation for dynamic sprites',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.PLANAR,
    renderType: ViewportRenderType.ANIMATED,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.ORTHOGRAPHIC,
      resolution: [256, 256],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 2,
      rings: 1,
      camsPerRing: 12,
      animateEachCamera: true,
    },
    postProcessing: {
      pixelization: false,
      outline: false,
      customShaders: [],
    },
  },
  
  {
    id: 'preset-toon-3d',
    name: 'Toon Shaded 3D',
    description: '3D capture with toon shading effects',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.STATIC,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [256, 256],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 2.5,
      rings: 3,
      camsPerRing: 8,
      animateEachCamera: false,
    },
    toonSettings: {
      enabled: true,
      toonSteps: 4,
      rimColor: [0.8, 0.9, 1.0],
      rimPower: 2.0,
      diffuseColor: [1.0, 1.0, 1.0],
      posterizationLevels: 8,
      edgeThreshold: 0.1,
      edgeColor: [0.0, 0.0, 0.0],
    },
    postProcessing: {
      pixelization: false,
      outline: true,
      customShaders: ['toon'],
    },
  },
  
  {
    id: 'preset-high-res-portrait',
    name: 'High-Res Portrait',
    description: 'High resolution capture for detailed character portraits',
    createdAt: new Date('2024-01-01'),
    cameraMode: ViewportCameraMode.PLANAR,
    renderType: ViewportRenderType.STATIC,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [512, 512],
      fov: 45,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 1.5,
      rings: 1,
      camsPerRing: 4,
      animateEachCamera: false,
    },
    postProcessing: {
      pixelization: false,
      outline: false,
      customShaders: [],
    },
  },

  {
    id: 'preset-crowd-spherical-band',
    name: 'Crowd Spherical Band',
    description: 'Crowd preset: full-sphere band [-80°, +80°], 5 rings (ring 2 = 0° horizon, centered), 8 cams, 128px cells',
    createdAt: new Date('2026-07-18'),
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.ANIMATED,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [128, 128],
      fov: 45, minZ: 0.01, maxZ: 1000, orthoScale: 1,
      radius: 2.5, rings: 5, camsPerRing: 8,
      animateEachCamera: false,
      elevationMinDeg: -80, elevationMaxDeg: 80,
    },
    postProcessing: { pixelization: false, outline: false, customShaders: [] },
  },

  {
    id: 'preset-effect-spherical-band',
    name: 'Effect Spherical Band',
    description: 'Hero-VFX imaging contract: IDENTICAL rig to the crowd (preset-crowd-spherical-band) so effects image + angle-select exactly like the crowd. Full-sphere band [-80deg, +80deg], 5 elevation rings (ring 2 = horizon), 8 azimuth cams, 128px cells, PERSPECTIVE. The consumers pick a ring from the camera elevation AND a cam from azimuth (crowd.vert.glsl convention), so effects read correctly from the game\'s ~3/4 top-down view instead of as flat side-view PNGs (the old 1-ring, elevation-0 band).',
    createdAt: new Date('2026-07-23'),
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.ANIMATED,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [128, 128],
      fov: 45, minZ: 0.01, maxZ: 1000, orthoScale: 1,
      radius: 2.5, rings: 5, camsPerRing: 8,
      animateEachCamera: false,
      elevationMinDeg: -80, elevationMaxDeg: 80,
    },
    postProcessing: { pixelization: false, outline: false, customShaders: [] },
  },

  {
    id: 'preset-ice-spherical-band',
    name: 'Ice Spherical Band (32 cams)',
    description: 'Like preset-effect-spherical-band but 32 azimuth cams (vs 8) — a FINER angular grid for the frozen ice cube, a hard-edged subject whose sharp cube edges make the coarse-cam blend GHOST. 32 cams (11.25deg apart) makes adjacent blended views nearly identical so the cross-fade collapses to a soft edge. Keep frames LOW in the batch (e.g. 4) so the sheet stays 32*4*128 = 16384 wide (max safe texture width); fireball/lightning stay on the cheap 8-cam preset. 5 elevation rings [-80,80], PERSPECTIVE, 128px.',
    createdAt: new Date('2026-07-23'),
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.ANIMATED,
    pixelSize: 1,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [128, 128],
      fov: 45, minZ: 0.01, maxZ: 1000, orthoScale: 1,
      radius: 2.5, rings: 5, camsPerRing: 32,
      animateEachCamera: false,
      elevationMinDeg: -80, elevationMaxDeg: 80,
    },
    postProcessing: { pixelization: false, outline: false, customShaders: [] },
  },
];

// Utility functions for camera presets
export class CameraPresetManager {
  
  /**
   * Create a new camera preset from current viewport settings
   */
  static createPresetFromCurrentSettings(
    name: string,
    description: string,
    currentSettings: {
      cameraProps: CameraProps;
      cameraMode: ViewportCameraMode;
      renderType: ViewportRenderType;
      pixelSize: number;
    }
  ): CameraPreset {
    return {
      id: `preset-${crypto.randomUUID()}`,
      name,
      description,
      createdAt: new Date(),
      ...currentSettings,
      postProcessing: {
        pixelization: currentSettings.pixelSize > 1,
        outline: false,
        customShaders: [],
      },
    };
  }
  
  /**
   * Clone an existing preset with modifications
   */
  static clonePreset(
    originalPreset: CameraPreset,
    modifications: Partial<CameraPreset>
  ): CameraPreset {
    return {
      ...originalPreset,
      ...modifications,
      id: `preset-${crypto.randomUUID()}`,
      createdAt: new Date(),
    };
  }
  
  /**
   * Validate a camera preset
   */
  static validatePreset(preset: CameraPreset): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!preset.id || preset.id.trim() === '') {
      errors.push('Preset ID is required');
    }
    
    if (!preset.name || preset.name.trim() === '') {
      errors.push('Preset name is required');
    }
    
    if (!preset.cameraProps) {
      errors.push('Camera properties are required');
    } else {
      if (preset.cameraProps.resolution.length !== 2) {
        errors.push('Resolution must have width and height');
      }
      
      if (preset.cameraProps.resolution[0] <= 0 || preset.cameraProps.resolution[1] <= 0) {
        errors.push('Resolution must be positive');
      }
      
      if (preset.cameraProps.fov <= 0 || preset.cameraProps.fov >= 180) {
        errors.push('FOV must be between 0 and 180 degrees');
      }
      
      if (preset.cameraProps.radius <= 0) {
        errors.push('Camera radius must be positive');
      }
      
      if (preset.cameraProps.rings <= 0) {
        errors.push('Number of rings must be positive');
      }
      
      if (preset.cameraProps.camsPerRing <= 0) {
        errors.push('Cameras per ring must be positive');
      }
    }
    
    if (preset.pixelSize <= 0) {
      errors.push('Pixel size must be positive');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  /**
   * Get preset categories for organization
   */
  static categorizePresets(presets: CameraPreset[]): { [category: string]: CameraPreset[] } {
    const categories: { [category: string]: CameraPreset[] } = {
      '2D Sprites': [],
      '3D Models': [],
      'Pixel Art': [],
      'Toon Shaded': [],
      'High Resolution': [],
      'Animated': [],
      'Custom': [],
    };
    
    presets.forEach(preset => {
      if (preset.name.toLowerCase().includes('pixel') || preset.pixelSize > 3) {
        categories['Pixel Art'].push(preset);
      } else if (preset.toonSettings?.enabled) {
        categories['Toon Shaded'].push(preset);
      } else if (preset.cameraProps.resolution[0] >= 512 || preset.cameraProps.resolution[1] >= 512) {
        categories['High Resolution'].push(preset);
      } else if (preset.cameraProps.animateEachCamera || preset.renderType === ViewportRenderType.ANIMATED) {
        categories['Animated'].push(preset);
      } else if (preset.cameraMode === ViewportCameraMode.SPHERICAL || preset.cameraProps.rings > 1) {
        categories['3D Models'].push(preset);
      } else if (preset.cameraMode === ViewportCameraMode.PLANAR) {
        categories['2D Sprites'].push(preset);
      } else {
        categories['Custom'].push(preset);
      }
    });
    
    // Remove empty categories
    Object.keys(categories).forEach(key => {
      if (categories[key].length === 0) {
        delete categories[key];
      }
    });
    
    return categories;
  }
  
  /**
   * Export preset to JSON string
   */
  static exportPreset(preset: CameraPreset): string {
    return JSON.stringify(preset, null, 2);
  }
  
  /**
   * Import preset from JSON string
   */
  static importPreset(jsonString: string): CameraPreset {
    const preset = JSON.parse(jsonString) as CameraPreset;
    
    // Ensure dates are properly parsed
    preset.createdAt = new Date(preset.createdAt);
    
    // Generate new ID to avoid conflicts
    preset.id = `preset-${crypto.randomUUID()}`;
    
    const validation = this.validatePreset(preset);
    if (!validation.valid) {
      throw new Error(`Invalid preset: ${validation.errors.join(', ')}`);
    }
    
    return preset;
  }
}
