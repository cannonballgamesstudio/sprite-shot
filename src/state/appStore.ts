/**
 * Unified app store — composes all slices into a single Zustand store.
 *
 * This replaces the 4 separate stores (viewportStore, animationSettingStore,
 * meshTree, projectStore) with a single store using Zustand's slice pattern.
 *
 * Consumers can migrate incrementally — the old stores now re-export from
 * this unified store with backward-compatible APIs.
 *
 * Usage:
 *   // New way (preferred)
 *   const cameraMode = useAppStore((s) => s.cameraMode);
 *
 *   // Old way (still works via re-exports, deprecated)
 *   const cameraMode = useViewportStore((s) => s.cameraMode);
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createViewportSlice, type ViewportSlice } from './slices/viewportSlice';
import { createAnimationSlice, type AnimationSlice } from './slices/animationSlice';
import { createSceneTreeSlice, type SceneTreeSlice } from './slices/sceneTreeSlice';
import { createTrainingSlice, type TrainingSlice } from './slices/trainingSlice';

export interface ModeSlice {
  activeMode: string;
  setActiveMode: (mode: string) => void;
}

export type AppState = ModeSlice & ViewportSlice & AnimationSlice & SceneTreeSlice & TrainingSlice;

export const useAppStore = create<AppState>()(
  subscribeWithSelector((...a) => ({
    // Mode
    activeMode: 'static-imaging',
    setActiveMode: (mode: string) => a[0]({ activeMode: mode }),

    // Slices
    ...createViewportSlice(...a),
    ...createAnimationSlice(...a),
    ...createSceneTreeSlice(...a),
    ...createTrainingSlice(...a),
  })),
);

// Re-export slice types for consumers
export type { ViewportSlice } from './slices/viewportSlice';
export type { AnimationSlice } from './slices/animationSlice';
export type { SceneTreeSlice } from './slices/sceneTreeSlice';
export type { TrainingSlice } from './slices/trainingSlice';
