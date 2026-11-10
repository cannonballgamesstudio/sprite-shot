/**
 * TrainingPanel — controls and progress display for Gaussian Splat training.
 * Renders inside PropertiesPanel when export format is 'gaussian-splat'.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../state/appStore';

export function TrainingPanel() {
  const [totalSteps, setTotalSteps] = useState(30000);
  const status = useAppStore((s) => s.trainingStatus);
  const progress = useAppStore((s) => s.trainingProgress);
  const eval_ = useAppStore((s) => s.trainingEval);
  const splatCount = useAppStore((s) => s.trainingSplatCount);
  const exportPath = useAppStore((s) => s.trainingExportPath);
  const error = useAppStore((s) => s.trainingError);
  const lastCapturePath = useAppStore((s) => s.lastCaptureOutputPath);
  const resetTraining = useAppStore((s) => s.resetTraining);

  const handleStart = async () => {
    if (!lastCapturePath) return;
    useAppStore.getState().setTrainingStatus('starting');
    try {
      await invoke('start_training', {
        datasetPath: lastCapturePath,
        totalSteps,
      });
    } catch (err) {
      useAppStore.getState().setTrainingStatus('error');
      useAppStore.getState().setTrainingError(String(err));
    }
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_training');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  const pct = progress
    ? Math.min(100, (progress.iteration / Math.max(progress.totalSteps, 1)) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-panel-border">
      <div className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-semibold">
        Training
      </div>

      {/* Idle — show start controls */}
      {(status === 'idle' || status === 'completed' || status === 'error') && (
        <>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
            <label className="text-[10px] text-fg-muted whitespace-nowrap">Steps</label>
            <input
              type="number"
              value={totalSteps}
              onChange={(e) => setTotalSteps(parseInt(e.target.value) || 30000)}
              min={100}
              max={100000}
              step={1000}
              className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
            />
          </div>

          {!lastCapturePath && (
            <div className="text-[10px] text-fg-muted italic">
              Capture images first, then train.
            </div>
          )}

          <button
            className="w-full py-1.5 bg-accent border-none rounded text-white text-[10px] font-semibold tracking-wide cursor-pointer hover:bg-accent-hover disabled:bg-[#444] disabled:text-[#888] disabled:cursor-not-allowed"
            onClick={status === 'completed' || status === 'error' ? () => { resetTraining(); handleStart(); } : handleStart}
            disabled={!lastCapturePath}
          >
            {status === 'completed'
              ? 'RETRAIN'
              : status === 'error'
                ? 'RETRY'
                : 'START TRAINING'}
          </button>
        </>
      )}

      {/* Training — show progress */}
      {status === 'training' && progress && (
        <>
          {/* Progress bar */}
          <div className="h-1.5 bg-[#3a3a3a] rounded-sm overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-fg-muted tabular-nums">
            <span>{progress.iteration} / {progress.totalSteps}</span>
            <span>{progress.iterPerSec.toFixed(1)} it/s</span>
          </div>

          <div className="flex justify-between text-[10px] text-fg-muted tabular-nums">
            <span>{Math.floor(progress.elapsedSecs)}s elapsed</span>
            {splatCount > 0 && <span>{splatCount.toLocaleString()} splats</span>}
          </div>

          {eval_ && (
            <div className="flex justify-between text-[10px] text-fg tabular-nums">
              <span>PSNR: {eval_.avgPsnr.toFixed(2)} dB</span>
              <span>SSIM: {eval_.avgSsim.toFixed(4)}</span>
            </div>
          )}

          <button
            className="w-full py-1 border border-panel-border rounded bg-panel text-fg-muted cursor-pointer text-[10px] hover:bg-header hover:text-fg"
            onClick={handleCancel}
          >
            CANCEL
          </button>
        </>
      )}

      {/* Completed */}
      {status === 'completed' && exportPath && (
        <div className="text-[10px] text-fg-muted break-all">
          Exported to: {exportPath}
        </div>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <div className="text-[10px] text-red-400 break-all">{error}</div>
      )}
    </div>
  );
}
