/**
 * BottomBar — 48px horizontal bar with transport controls, timeline, and capture button.
 * Replaces the floating AnimationBar and capture button from CharacterViewport.
 */

import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../state/appStore';

export function BottomBar() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentFrame = useAppStore((s) => s.currentFrame);
  const play = useAppStore((s) => s.play);
  const pause = useAppStore((s) => s.pause);
  const stop = useAppStore((s) => s.stop);
  const setCurrentFrame = useAppStore((s) => s.setCurrentFrame);
  const triggerRecenterCameras = useAppStore((s) => s.triggerRecenterCameras);
  const enableRootMotion = useAppStore((s) => s.enableRootMotion);
  const toggleRootMotion = useAppStore((s) => s.toggleRootMotion);

  const captureHandler = useAppStore((s) => s.captureHandler);
  const isCapturing = useAppStore((s) => s.isCapturing);
  const exportFormat = useAppStore((s) => s.exportFormat);
  const cameraCount = useAppStore((s) => s.cameraCount);

  // Read animation state reactively via selectors (not getState snapshot)
  const animations = useAppStore((s) => s.animations);
  const selectedIndex = useAppStore((s) => s.selectedIndex);
  const selectedAnim = selectedIndex !== null ? animations[selectedIndex] ?? null : null;
  const trimStart = selectedAnim?.trimStart ?? 0;
  const trimEnd = selectedAnim?.trimEnd ?? 0;
  const totalFrames = selectedAnim?.totalFrames ?? 0;

  const handlePlayPause = () => {
    if (isPlaying) pause();
    else play();
  };

  const handleCapture = () => {
    captureHandler?.();
  };

  // Timeline progress as percentage
  const range = trimEnd - trimStart || 1;
  const progress = totalFrames > 0 ? ((currentFrame - trimStart) / range) * 100 : 0;

  const btnBase = 'w-7 h-7 flex items-center justify-center bg-transparent border border-transparent rounded-sm text-fg-muted cursor-pointer text-xs hover:bg-header hover:text-fg';

  return (
    <div className="h-12 shrink-0 flex items-center gap-1 px-2 bg-panel border-t border-panel-border">
      {/* Transport */}
      <button className={btnBase} onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>
      <button className={btnBase} onClick={stop} title="Stop">{'\u25A0'}</button>
      <button className={btnBase} onClick={triggerRecenterCameras} title="Recenter Cameras">{'\u27F2'}</button>
      <button
        className={`${btnBase} ${enableRootMotion ? 'text-accent' : ''}`}
        onClick={toggleRootMotion}
        title="Root Motion"
      >
        {'\u2299'}
      </button>

      <div className="w-px h-6 bg-panel-border mx-1" />

      {/* Timeline */}
      <div className="flex-1 relative h-7 flex items-center">
        {totalFrames > 0 ? (
          <>
            <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-1 bg-[#3a3a3a] rounded-sm overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-50" style={{ width: `${progress}%` }} />
            </div>
            <input
              type="range"
              className="relative z-10 w-full h-7 bg-transparent appearance-none cursor-pointer"
              min={trimStart}
              max={trimEnd}
              value={currentFrame}
              onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
            />
          </>
        ) : (
          <span className="flex-1 text-center text-[10px] text-fg-muted">No animation</span>
        )}
      </div>

      {/* Frame counter */}
      <span className="text-[10px] text-fg-muted min-w-[60px] text-center tabular-nums">
        {totalFrames > 0 ? `${currentFrame} / ${totalFrames}` : '\u2014'}
      </span>

      <div className="w-px h-6 bg-panel-border mx-1" />

      {/* Capture */}
      <button
        className="px-3.5 py-1 bg-accent border-none rounded text-white text-[10px] font-semibold tracking-wide cursor-pointer whitespace-nowrap hover:bg-accent-hover disabled:bg-[#444] disabled:text-[#888] disabled:cursor-not-allowed"
        onClick={handleCapture}
        disabled={isCapturing || cameraCount === 0 || !captureHandler}
      >
        {isCapturing
          ? 'CAPTURING...'
          : exportFormat === 'gaussian-splat'
            ? 'CAPTURE GSPLAT'
            : 'CAPTURE'}
      </button>

      {/* Train (gaussian-splat mode only) */}
      {exportFormat === 'gaussian-splat' && <TrainButton />}
    </div>
  );
}

function TrainButton() {
  const status = useAppStore((s) => s.trainingStatus);
  const progress = useAppStore((s) => s.trainingProgress);
  const lastCapturePath = useAppStore((s) => s.lastCaptureOutputPath);

  const handleTrain = async () => {
    if (!lastCapturePath) return;
    useAppStore.getState().setTrainingStatus('starting');
    try {
      await invoke('start_training', { datasetPath: lastCapturePath, totalSteps: 30000 });
    } catch (err) {
      useAppStore.getState().setTrainingStatus('error');
      useAppStore.getState().setTrainingError(String(err));
    }
  };

  const handleCancel = async () => {
    try { await invoke('cancel_training'); } catch {}
  };

  if (status === 'training' && progress) {
    return (
      <button
        className="px-3.5 py-1 bg-[#444] border-none rounded text-fg-muted text-[10px] font-semibold tracking-wide cursor-pointer whitespace-nowrap hover:bg-[#555] tabular-nums"
        onClick={handleCancel}
      >
        TRAINING {progress.iteration}/{progress.totalSteps}
      </button>
    );
  }

  if (status === 'starting') {
    return (
      <button className="px-3.5 py-1 bg-[#444] border-none rounded text-fg-muted text-[10px] font-semibold tracking-wide cursor-not-allowed whitespace-nowrap" disabled>
        INIT GPU...
      </button>
    );
  }

  if (status === 'completed') {
    return (
      <button className="px-3.5 py-1 bg-green-700 border-none rounded text-white text-[10px] font-semibold tracking-wide cursor-default whitespace-nowrap">
        TRAINED
      </button>
    );
  }

  return (
    <button
      className="px-3.5 py-1 bg-accent border-none rounded text-white text-[10px] font-semibold tracking-wide cursor-pointer whitespace-nowrap hover:bg-accent-hover disabled:bg-[#444] disabled:text-[#888] disabled:cursor-not-allowed"
      onClick={handleTrain}
      disabled={!lastCapturePath}
    >
      TRAIN
    </button>
  );
}
