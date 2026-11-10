import { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAutopilotEngine } from './useAutopilotEngine';
import { parseEffectBatchConfig, EffectBatchConfig, ResolvedEffectJob } from './effectBatchConfig';
import { loadShaderEffect } from './loadShaderEffect';
import { computeFitRadius, applyLightingOverrides } from './AutopilotRunner';
import { captureSphericalSheet } from '../core/capture/sphericalAnimationCapture';
import { calculateCameraPositions, createCamerasAtPositions } from '../core/engine/CameraRig';
import { ViewportCameraMode, type CameraProps, type BoundingBox } from '../state/viewportStore';
import { DEFAULT_CAMERA_PRESETS } from '../utils/cameraPresets';
import { logLine } from './runnerLog';

/**
 * EffectAutopilotRunner — the effects-batch sibling to AutopilotRunner.tsx. Mirrors its
 * run()/runBatch()/runJob() shape, but:
 *  - loads subjects via loadShaderEffect() instead of loadClip() (no FBX/skeleton machinery)
 *  - has no archetype/pose/fit crowd vocabulary — computeFitRadius is reused directly (it's
 *    already generic over bounds/fit/archetypes/fov) with one trivial default archetype
 *  - rig-camera construction and the per-job capture+probe+write are inlined here rather than
 *    reusing AutopilotRunner's buildRigCameras/runJob, because those two are typed against
 *    BatchConfig/ResolvedJob (the crowd's archetypes/fit/poses schema) — forcing EffectBatchConfig
 *    to satisfy that shape would mean padding it with meaningless crowd fields.
 *    computeFitRadius/applyLightingOverrides ARE reused as-is: neither
 *    takes a BatchConfig, both are already pure functions over their own narrow parameter types.
 */

export interface EffectAutopilotArgs { configPath: string; preview: boolean; force: string[] }

export default function EffectAutopilotRunner({ args }: { args: EffectAutopilotArgs }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { engineRef, sceneRef, liveFeedCameraRef, lightsRef, ready } = useAutopilotEngine(canvasRef);
  const [status, setStatus] = useState('booting');
  const startedRef = useRef(false);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function run() {
    await getCurrentWindow().minimize().catch(() => {});
    const scene = sceneRef.current!;
    const engine = engineRef.current!;
    let exitCode = 0;
    try {
      const text = await invoke<string>('read_text_file_any', { path: args.configPath });
      const { config, jobs, errors } = parseEffectBatchConfig(text);
      if (errors.length) {
        errors.forEach((e) => logLine(`CONFIG ERROR: ${e}`));
        await invoke('exit_app', { code: 2 });
        return;
      }
      if (lightsRef.current) applyLightingOverrides(lightsRef.current, config.look.lighting);
      exitCode = await runEffectBatch({
        scene, engine, liveFeedCamera: liveFeedCameraRef.current!,
        config, jobs, force: args.force, preview: args.preview, setStatus,
      });
    } catch (e) {
      logLine(`FATAL: ${e}`);
      exitCode = 1;
    }
    await invoke('exit_app', { code: exitCode });
  }

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#c9a0e6', background: '#160c24', height: '100vh' }}>
      <h3>sprite-shot effect autopilot</h3>
      <div>{status}</div>
      <canvas ref={canvasRef} width={512} height={512} style={{ border: '1px solid #5e2a8c' }} />
    </div>
  );
}

// ---------- batch internals ----------

interface RunnerDeps {
  scene: BABYLON.Scene; engine: BABYLON.Engine; liveFeedCamera: BABYLON.FreeCamera;
  config: EffectBatchConfig; jobs: ResolvedEffectJob[]; force: string[]; preview: boolean;
  setStatus: (s: string) => void;
}

interface SheetResult { file: string; status: 'ok' | 'skipped' | 'failed'; ms: number; error?: string }

async function runEffectBatch(deps: RunnerDeps): Promise<number> {
  const { config, jobs, force, preview } = deps;
  const outPath = (f: string) => `${config.output.dir.replace(/[\\/]+$/, '')}/${f}`;

  const presetEntry = DEFAULT_CAMERA_PRESETS.find((p) => p.id === config.presetId);
  if (!presetEntry) {
    logLine(`CONFIG ERROR: unknown preset "${config.presetId}"`);
    return 2;
  }
  const { rings, camsPerRing, resolution, fov } = presetEntry.cameraProps;
  const cellSize = resolution[0]; // contract cells are square

  if (preview) {
    const { runEffectPreview } = await import('./effectContactSheet');
    await runEffectPreview({
      scene: deps.scene, engine: deps.engine, liveFeedCamera: deps.liveFeedCamera, config, jobs, logLine,
    });
    return 0;
  }

  const results: SheetResult[] = [];
  for (const job of jobs) {
    const forced = force.includes(job.effectName);
    if (forced) {
      try {
        await invoke('delete_file_any', { path: outPath(job.fileName) });
      } catch (e) {
        results.push({ file: job.fileName, status: 'failed', ms: 0, error: `force delete: ${e}` });
        logLine(`FAIL ${job.fileName}: force delete: ${e}`);
        continue;
      }
    }
    const exists = !forced && (await invoke<boolean>('path_exists', { path: outPath(job.fileName) }));
    if (exists) {
      results.push({ file: job.fileName, status: 'skipped', ms: 0 });
      continue;
    }

    const t0 = performance.now();
    let effect: Awaited<ReturnType<typeof loadShaderEffect>> | null = null;
    let cameras: BABYLON.Camera[] = [];
    try {
      deps.setStatus(`capturing ${job.fileName}`);
      effect = await loadShaderEffect(deps.scene, job.spec, config.frames);
      // Freshly-created ShaderMaterial isn't necessarily render-ready on the very next
      // scene.render() — mirrors AutopilotRunner's identical whenReadyAsync() wait after loadClip.
      await deps.scene.whenReadyAsync();

      const fovRad = (fov * Math.PI) / 180;
      // Trivial single default archetype ([1,1,1] scale, fillFrac only) — effects have no
      // body-type variance to fit against, so computeFitRadius (a generic, already-tested
      // routine) reduces to "fit the fixed quad size at fillFrac".
      const trivialArchetypes = [{ name: 'default', scale: [1, 1, 1] as [number, number, number] }];
      const trivialFit = { heightPose: 'default', heightArchetype: 'default', widthArchetype: 'default', fillFrac: 0.76 };
      const radius = computeFitRadius(effect.bounds, trivialFit, trivialArchetypes, fovRad);
      const props: CameraProps = { ...presetEntry.cameraProps, radius };
      const half = effect.bounds.maxDimension / 2;
      const bbox: BoundingBox = {
        min: { x: -half, y: -half, z: -half },
        max: { x: half, y: half, z: half },
        center: { x: 0, y: 0, z: 0 },
        size: { x: effect.bounds.maxDimension, y: effect.bounds.maxDimension, z: effect.bounds.maxDimension },
      };
      const positions = calculateCameraPositions(bbox, ViewportCameraMode.SPHERICAL, props);
      cameras = createCamerasAtPositions(deps.scene, positions, props);
      cameras.forEach((c) => { (c as BABYLON.FreeCamera).fov = fovRad; });
      // renderFrameViaLiveFeed never renders through the rig cameras directly — see
      // AutopilotRunner.buildRigCameras's identical comment.
      deps.liveFeedCamera.fov = fovRad;
      deps.liveFeedCamera.minZ = presetEntry.cameraProps.minZ;
      deps.liveFeedCamera.maxZ = presetEntry.cameraProps.maxZ;

      const dataUrl = await captureSphericalSheet({
        scene: deps.scene, engine: deps.engine, liveFeedCamera: deps.liveFeedCamera,
        cameras, rings, camsPerRing,
        animGroup: effect.animGroup, frames: config.frames,
        trim: [effect.animGroup.from, effect.animGroup.to],
        cellSize, look: config.look,
      });
      const expectW = camsPerRing * config.frames * cellSize, expectH = rings * cellSize;
      const probe = new Image();
      await new Promise<void>((res, rej) => { probe.onload = () => res(); probe.onerror = rej; probe.src = dataUrl; });
      if (probe.width !== expectW || probe.height !== expectH) {
        throw new Error(`sheet ${probe.width}x${probe.height}, expected ${expectW}x${expectH}`);
      }
      await invoke('write_png_file', { dir: config.output.dir, fileName: job.fileName, fileData: dataUrl });
      const ms = Math.round(performance.now() - t0);
      results.push({ file: job.fileName, status: 'ok', ms });
      logLine(`OK ${job.fileName} (${ms}ms)`);
    } catch (e) {
      await invoke('delete_file_any', { path: outPath(job.fileName) }).catch(() => {});
      results.push({ file: job.fileName, status: 'failed', ms: Math.round(performance.now() - t0), error: String(e) });
      logLine(`FAIL ${job.fileName}: ${e}`);
    } finally {
      cameras.forEach((c) => c.dispose());
      effect?.dispose();
    }
  }

  const failed = results.filter((r) => r.status === 'failed');
  await invoke('write_text_file_any', {
    path: outPath('batch-report.json'),
    contents: JSON.stringify(
      { config: config.output.dir, sheets: results, finishedAt: new Date().toISOString() },
      null, 2,
    ),
  }).catch((e) => logLine(`WARN report write: ${e}`));
  logLine(`DONE ok=${results.filter((r) => r.status === 'ok').length} skipped=${results.filter((r) => r.status === 'skipped').length} failed=${failed.length}`);
  return failed.length ? 1 : 0;
}
