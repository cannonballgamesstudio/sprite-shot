import { describe, it, expect, vi } from 'vitest';
import { CaptureOrchestrator } from '../CaptureOrchestrator';
import type { ICaptureStrategy, CaptureConfig, CaptureFrame, CaptureResult } from '../ICaptureStrategy';

function makeMockConfig(): CaptureConfig {
  return {
    outputDir: '/tmp/test-output',
    resolution: [256, 256],
    cameras: [],
    scene: {} as any,
    engine: {} as any,
  };
}

function makeMockStrategy(overrides?: Partial<ICaptureStrategy>): ICaptureStrategy {
  return {
    id: 'test-strategy',
    label: 'Test Strategy',
    prepare: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue([
      { cameraIndex: 0, frameIndex: 0, imageData: 'data:image/png;base64,abc', width: 256, height: 256 },
      { cameraIndex: 1, frameIndex: 0, imageData: 'data:image/png;base64,def', width: 256, height: 256 },
    ] satisfies CaptureFrame[]),
    assemble: vi.fn().mockResolvedValue({
      outputPath: '/tmp/test-output/spritesheet.png',
      totalFrames: 1,
      totalCameras: 2,
      artifacts: [{ type: 'spritesheet', path: 'spritesheet.png', description: 'Test' }],
    } satisfies CaptureResult),
    cleanup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CaptureOrchestrator', () => {
  it('calls strategy lifecycle methods in order', async () => {
    const callOrder: string[] = [];
    const strategy = makeMockStrategy({
      prepare: vi.fn().mockImplementation(async () => { callOrder.push('prepare'); }),
      execute: vi.fn().mockImplementation(async () => { callOrder.push('execute'); return []; }),
      assemble: vi.fn().mockImplementation(async () => {
        callOrder.push('assemble');
        return { outputPath: '', totalFrames: 0, totalCameras: 0, artifacts: [] };
      }),
      cleanup: vi.fn().mockImplementation(async () => { callOrder.push('cleanup'); }),
    });

    await CaptureOrchestrator.run(strategy, makeMockConfig());
    expect(callOrder).toEqual(['prepare', 'execute', 'assemble', 'cleanup']);
  });

  it('passes config to all strategy methods', async () => {
    const strategy = makeMockStrategy();
    const config = makeMockConfig();

    await CaptureOrchestrator.run(strategy, config);

    expect(strategy.prepare).toHaveBeenCalledWith(config);
    expect(strategy.execute).toHaveBeenCalledWith(config, expect.any(Function));
    expect(strategy.cleanup).toHaveBeenCalledWith(config);
  });

  it('passes captured frames from execute to assemble', async () => {
    const frames: CaptureFrame[] = [
      { cameraIndex: 0, frameIndex: 0, imageData: 'a', width: 100, height: 100 },
      { cameraIndex: 1, frameIndex: 0, imageData: 'b', width: 100, height: 100 },
    ];
    const strategy = makeMockStrategy({
      execute: vi.fn().mockResolvedValue(frames),
    });

    await CaptureOrchestrator.run(strategy, makeMockConfig());

    expect(strategy.assemble).toHaveBeenCalledWith(frames, expect.any(Object));
  });

  it('returns the result from assemble', async () => {
    const expectedResult: CaptureResult = {
      outputPath: '/test/output',
      totalFrames: 10,
      totalCameras: 4,
      artifacts: [{ type: 'spritesheet', path: 'sheet.png', description: 'test' }],
    };
    const strategy = makeMockStrategy({
      assemble: vi.fn().mockResolvedValue(expectedResult),
    });

    const result = await CaptureOrchestrator.run(strategy, makeMockConfig());
    expect(result).toEqual(expectedResult);
  });

  it('reports progress during execute', async () => {
    const progressCalls: [number, number, string][] = [];
    const strategy = makeMockStrategy({
      execute: vi.fn().mockImplementation(async (_config, onProgress) => {
        onProgress(1, 3);
        onProgress(2, 3);
        onProgress(3, 3);
        return [];
      }),
      assemble: vi.fn().mockResolvedValue({
        outputPath: '', totalFrames: 0, totalCameras: 0, artifacts: [],
      }),
    });

    await CaptureOrchestrator.run(strategy, makeMockConfig(), (cur, total, phase) => {
      progressCalls.push([cur, total, phase]);
    });

    // Should have: prepare progress, 3 execute progress calls, assemble progress
    expect(progressCalls.length).toBe(5);
    expect(progressCalls[1]).toEqual([1, 3, 'Capturing (1/3)...']);
    expect(progressCalls[2]).toEqual([2, 3, 'Capturing (2/3)...']);
    expect(progressCalls[3]).toEqual([3, 3, 'Capturing (3/3)...']);
  });

  it('calls cleanup even if execute throws', async () => {
    const strategy = makeMockStrategy({
      execute: vi.fn().mockRejectedValue(new Error('GPU crashed')),
    });

    await expect(CaptureOrchestrator.run(strategy, makeMockConfig())).rejects.toThrow('GPU crashed');
    expect(strategy.cleanup).toHaveBeenCalled();
  });

  it('calls cleanup even if assemble throws', async () => {
    const strategy = makeMockStrategy({
      execute: vi.fn().mockResolvedValue([]),
      assemble: vi.fn().mockRejectedValue(new Error('Out of memory')),
    });

    await expect(CaptureOrchestrator.run(strategy, makeMockConfig())).rejects.toThrow('Out of memory');
    expect(strategy.cleanup).toHaveBeenCalled();
  });

  it('calls cleanup even if prepare throws', async () => {
    const strategy = makeMockStrategy({
      prepare: vi.fn().mockRejectedValue(new Error('Scene not ready')),
    });

    await expect(CaptureOrchestrator.run(strategy, makeMockConfig())).rejects.toThrow('Scene not ready');
    expect(strategy.cleanup).toHaveBeenCalled();
  });
});
