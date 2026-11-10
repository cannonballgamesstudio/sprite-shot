/**
 * Training slice — gaussian splat training state.
 * Tracks training progress streamed from the Rust backend via Tauri events.
 */

import type { StateCreator } from 'zustand';

export type TrainingStatus = 'idle' | 'starting' | 'training' | 'completed' | 'error';

export interface TrainingProgress {
  iteration: number;
  totalSteps: number;
  elapsedSecs: number;
  iterPerSec: number;
}

export interface TrainingEval {
  iteration: number;
  avgPsnr: number;
  avgSsim: number;
}

export interface TrainingSlice {
  trainingStatus: TrainingStatus;
  trainingProgress: TrainingProgress | null;
  trainingEval: TrainingEval | null;
  trainingSplatCount: number;
  trainingExportPath: string | null;
  trainingError: string | null;
  lastCaptureOutputPath: string | null;

  setTrainingStatus: (status: TrainingStatus) => void;
  setTrainingProgress: (progress: TrainingProgress) => void;
  setTrainingEval: (eval_: TrainingEval) => void;
  setTrainingSplatCount: (count: number) => void;
  setTrainingExportPath: (path: string) => void;
  setTrainingError: (error: string | null) => void;
  setLastCaptureOutputPath: (path: string | null) => void;
  resetTraining: () => void;
}

export const createTrainingSlice: StateCreator<TrainingSlice, [], [], TrainingSlice> = (set) => ({
  trainingStatus: 'idle',
  trainingProgress: null,
  trainingEval: null,
  trainingSplatCount: 0,
  trainingExportPath: null,
  trainingError: null,
  lastCaptureOutputPath: null,

  setTrainingStatus: (status) => set({ trainingStatus: status }),
  setTrainingProgress: (progress) => set({ trainingProgress: progress }),
  setTrainingEval: (eval_) => set({ trainingEval: eval_ }),
  setTrainingSplatCount: (count) => set({ trainingSplatCount: count }),
  setTrainingExportPath: (path) => set({ trainingExportPath: path }),
  setTrainingError: (error) => set({ trainingError: error }),
  setLastCaptureOutputPath: (path) => set({ lastCaptureOutputPath: path }),
  resetTraining: () =>
    set({
      trainingStatus: 'idle',
      trainingProgress: null,
      trainingEval: null,
      trainingSplatCount: 0,
      trainingExportPath: null,
      trainingError: null,
    }),
});
