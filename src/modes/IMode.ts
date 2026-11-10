/**
 * Mode interface — the abstraction that makes sprite-shot extensible.
 *
 * Each mode (static imaging, animated imaging, VR IK, gaussian splat training)
 * implements this interface and registers itself via modeRegistry.
 */

import type { ICaptureStrategy } from '../core/capture/ICaptureStrategy';
import type { ViewportCameraMode } from '../state/viewportStore';

export interface ModeCapabilities {
  supportsAnimation: boolean;
  supportsProps: boolean;
  supportsVR: boolean;
  captureOutputType: 'spritesheet' | 'image-sequence' | 'training-data';
  supportedCameraModes: ViewportCameraMode[];
}

export interface IModeConfig {
  id: string;
  label: string;
  description: string;
  icon?: string;
  capabilities: ModeCapabilities;
}

export interface IMode {
  config: IModeConfig;

  /** React component that renders the 3D viewport for this mode */
  ViewportComponent: React.ComponentType;

  /** Optional React component for mode-specific settings in the sidebar */
  SettingsPanel?: React.ComponentType;

  /** Capture strategy that determines how frames are captured and assembled */
  captureStrategy?: ICaptureStrategy;

  /** Called when this mode becomes active */
  onActivate?(): void;

  /** Called when switching away from this mode */
  onDeactivate?(): void;
}
