/**
 * CaptureOrchestrator — runs a full capture pipeline using a given strategy.
 *
 * Usage:
 *   const result = await CaptureOrchestrator.run(strategy, config, onProgress);
 *
 * Handles the prepare → execute → assemble → cleanup lifecycle
 * with proper error handling and cleanup guarantees.
 */

import type { ICaptureStrategy, CaptureConfig, CaptureResult } from './ICaptureStrategy';

export class CaptureOrchestrator {
  static async run(
    strategy: ICaptureStrategy,
    config: CaptureConfig,
    onProgress?: (current: number, total: number, phase: string) => void,
  ): Promise<CaptureResult> {
    try {
      onProgress?.(0, 1, 'Preparing...');
      await strategy.prepare(config);

      const frames = await strategy.execute(config, (current, total) => {
        onProgress?.(current, total, `Capturing (${current}/${total})...`);
      });

      onProgress?.(0, 1, 'Assembling output...');
      const result = await strategy.assemble(frames, config);

      return result;
    } finally {
      await strategy.cleanup(config);
    }
  }
}
