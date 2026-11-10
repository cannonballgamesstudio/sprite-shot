/**
 * viewportStore — now re-exports from the unified appStore.
 *
 * All types/enums remain here as the canonical source.
 * The hook is an alias for useAppStore — all selectors work unchanged
 * because AppState is a superset of ViewportState.
 */

import { useAppStore } from './appStore';

// ── Types & Enums (unchanged, still the canonical source) ──

export enum CameraProjection {
    ORTHOGRAPHIC = 0,
    PERSPECTIVE = 1
}

export enum ViewportCameraMode {
    PLANAR = 0,
    SPHERICAL = 1
}

export enum ViewportRenderType {
    STATIC = 0,
    ANIMATED = 1
}

export interface CameraProps {
    projection: CameraProjection;
    resolution: number[];
    fov: number;
    minZ: number;
    maxZ: number;
    orthoScale: number;
    radius: number;
    rings: number;
    camsPerRing: number;
    animateEachCamera: boolean;
    /** SPHERICAL mode: elevation band in degrees, ring 0 = min (lowest ring).
     *  Omit both for the legacy symmetric ±63° band. */
    elevationMinDeg?: number;
    elevationMaxDeg?: number;
}

export interface ExportProps {
    numPerRow: number;
}

export interface CameraPosition {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    index: number;
}

export interface BoundingBox {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
}

export interface ViewportState {
    cameraMode: ViewportCameraMode;
    cameraProps: CameraProps;
    renderType: ViewportRenderType;
    exportProps: ExportProps;
    currentMeshPath: string | null;
    pixelSize: number;
    recenterCamerasTrigger: number;
    triggerRecenterCameras: () => void;
    setCurrentMeshPath: (path: string | null) => void;
    setCameraMode: (cameraMode: ViewportCameraMode) => void;
    setRenderType: (renderType: ViewportRenderType) => void;
    setCamerasProps: (camerasProps: CameraProps) => void;
    setExportProps: (exportProps: ExportProps) => void;
    setPixelSize: (pixelSize: number) => void;
}

// ── Hook (alias for unified store, lazy to avoid circular init) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _proxy: any = (...args: any[]) => (useAppStore as any)(...args);
Object.defineProperty(_proxy, 'getState', { get: () => useAppStore.getState });
Object.defineProperty(_proxy, 'setState', { get: () => useAppStore.setState });
Object.defineProperty(_proxy, 'subscribe', { get: () => useAppStore.subscribe });
Object.defineProperty(_proxy, 'destroy', { get: () => (useAppStore as any).destroy });
export const useViewportStore = _proxy as typeof useAppStore;
