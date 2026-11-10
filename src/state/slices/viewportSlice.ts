/**
 * Viewport slice — camera config, render settings, mesh path.
 * Extracted from state/viewportStore.ts.
 */

import type { StateCreator } from 'zustand';
import type {
  CameraProps,
  ExportProps,
  ViewportCameraMode,
  ViewportRenderType,
} from '../viewportStore';

// Use literal values for defaults to avoid circular import
// (viewportStore → appStore → viewportSlice → viewportStore)
const SPHERICAL = 1 as ViewportCameraMode;
const STATIC = 0 as ViewportRenderType;
const PERSPECTIVE = 1;

export type ExportFormat = 'spritesheet' | 'animation-spritesheet' | 'gaussian-splat';

export interface ViewportSlice {
  cameraMode: ViewportCameraMode;
  cameraProps: CameraProps;
  renderType: ViewportRenderType;
  exportProps: ExportProps;
  currentMeshPath: string | null;
  pixelSize: number;
  recenterCamerasTrigger: number;

  // Lifted from CharacterViewport local state
  availableBones: string[];
  loadedMeshId: string | null;
  cameraCount: number;
  isCapturing: boolean;
  captureProgress: { frame: number; totalFrames: number } | null;
  captureHandler: (() => Promise<void>) | null;
  exportFormat: ExportFormat;
  gsplatBackground: [number, number, number, number];

  triggerRecenterCameras: () => void;
  setCurrentMeshPath: (path: string | null) => void;
  setCameraMode: (cameraMode: ViewportCameraMode) => void;
  setRenderType: (renderType: ViewportRenderType) => void;
  setCamerasProps: (camerasProps: CameraProps) => void;
  setExportProps: (exportProps: ExportProps) => void;
  setPixelSize: (pixelSize: number) => void;
  setAvailableBones: (bones: string[]) => void;
  setLoadedMeshId: (id: string | null) => void;
  setCameraCount: (count: number) => void;
  setIsCapturing: (v: boolean) => void;
  setCaptureProgress: (v: { frame: number; totalFrames: number } | null) => void;
  setCaptureHandler: (handler: (() => Promise<void>) | null) => void;
  setExportFormat: (format: ExportFormat) => void;
  setGsplatBackground: (bg: [number, number, number, number]) => void;
}

export const createViewportSlice: StateCreator<ViewportSlice, [], [], ViewportSlice> = (set) => ({
  cameraMode: SPHERICAL,
  renderType: STATIC,
  currentMeshPath: null,
  pixelSize: 1,
  recenterCamerasTrigger: 0,
  cameraProps: {
    projection: PERSPECTIVE,
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
  exportProps: {
    numPerRow: 8,
  },

  // Lifted state defaults
  availableBones: [],
  loadedMeshId: null,
  cameraCount: 0,
  isCapturing: false,
  captureProgress: null,
  captureHandler: null,
  exportFormat: 'spritesheet' as ExportFormat,
  gsplatBackground: [0, 0, 0, 0] as [number, number, number, number],

  triggerRecenterCameras: () => set({ recenterCamerasTrigger: Date.now() }),
  setCurrentMeshPath: (path) => set({ currentMeshPath: path }),
  setPixelSize: (pixelSize) => set({ pixelSize }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setRenderType: (renderType) => set({ renderType }),
  setCamerasProps: (cameraProps) => set({ cameraProps }),
  setExportProps: (exportProps) => set({ exportProps }),
  setAvailableBones: (bones) => set({ availableBones: bones }),
  setLoadedMeshId: (id) => set({ loadedMeshId: id }),
  setCameraCount: (count) => set({ cameraCount: count }),
  setIsCapturing: (v) => set({ isCapturing: v }),
  setCaptureProgress: (v) => set({ captureProgress: v }),
  setCaptureHandler: (handler) => set({ captureHandler: handler }),
  setExportFormat: (format) => set({ exportFormat: format }),
  setGsplatBackground: (bg) => set({ gsplatBackground: bg }),
});
