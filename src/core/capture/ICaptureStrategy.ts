/**
 * Capture strategy interface.
 *
 * Each mode provides its own capture strategy that determines
 * how frames are captured and assembled into final output.
 */

import type * as BABYLON from '@babylonjs/core';

export interface CaptureConfig {
  outputDir: string;
  resolution: [number, number];
  cameras: BABYLON.Camera[];
  scene: BABYLON.Scene;
  engine: BABYLON.Engine;
}

export interface CaptureFrame {
  cameraIndex: number;
  frameIndex: number;
  imageData: string; // data URL (data:image/png;base64,...)
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}

export interface CaptureArtifact {
  type: 'spritesheet' | 'image' | 'json' | 'video';
  path: string;
  description: string;
}

export interface CaptureResult {
  outputPath: string;
  totalFrames: number;
  totalCameras: number;
  artifacts: CaptureArtifact[];
}

export interface ICaptureStrategy {
  readonly id: string;
  readonly label: string;

  /** Prepare for capture (pause animations, hide UI meshes, etc.) */
  prepare(config: CaptureConfig): Promise<void>;

  /** Execute the capture loop, reporting progress */
  execute(
    config: CaptureConfig,
    onProgress: (current: number, total: number) => void,
  ): Promise<CaptureFrame[]>;

  /** Post-process captured frames into final output */
  assemble(
    frames: CaptureFrame[],
    config: CaptureConfig,
  ): Promise<CaptureResult>;

  /** Cleanup after capture */
  cleanup(config: CaptureConfig): Promise<void>;
}
