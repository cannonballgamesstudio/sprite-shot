/**
 * useTrainingEvents — listens to 'training-event' Tauri events
 * and dispatches to the training slice in appStore.
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../state/appStore';

interface TrainingEventPayload {
  type: 'Started' | 'Progress' | 'Eval' | 'Refine' | 'Warning' | 'Completed' | 'Error';
  iteration?: number;
  total_steps?: number;
  elapsed_secs?: number;
  avg_psnr?: number;
  avg_ssim?: number;
  splat_count?: number;
  message?: string;
  export_path?: string;
}

export function useTrainingEvents() {
  useEffect(() => {
    const unlisten = listen<TrainingEventPayload>('training-event', (event) => {
      const store = useAppStore.getState();
      const p = event.payload;

      switch (p.type) {
        case 'Started':
          store.setTrainingStatus('training');
          break;
        case 'Progress':
          store.setTrainingProgress({
            iteration: p.iteration!,
            totalSteps: p.total_steps!,
            elapsedSecs: p.elapsed_secs!,
            iterPerSec: p.iteration! / Math.max(p.elapsed_secs!, 0.001),
          });
          break;
        case 'Eval':
          store.setTrainingEval({
            iteration: p.iteration!,
            avgPsnr: p.avg_psnr!,
            avgSsim: p.avg_ssim!,
          });
          break;
        case 'Refine':
          store.setTrainingSplatCount(p.splat_count!);
          break;
        case 'Completed':
          store.setTrainingStatus('completed');
          store.setTrainingExportPath(p.export_path!);
          break;
        case 'Error':
          store.setTrainingStatus('error');
          store.setTrainingError(p.message!);
          break;
        case 'Warning':
          console.warn('[training]', p.message);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
