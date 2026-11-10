import { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAutopilotEngine, type AutopilotLights } from './useAutopilotEngine';
import { parseBatchConfig, BatchConfig, ResolvedJob, ArchetypeSpec, FitSpec } from './batchConfig';
import { captureSphericalSheet, type LookSpec } from '../core/capture/sphericalAnimationCapture';
import { calculateCameraPositions, createCamerasAtPositions } from '../core/engine/CameraRig';
import { ViewportCameraMode, type CameraProps, type BoundingBox } from '../state/viewportStore';
import { DEFAULT_CAMERA_PRESETS } from '../utils/cameraPresets';
import type { CameraPreset } from '../types/project';
import { logLine } from './runnerLog';

export interface AutopilotArgs { configPath: string; preview: boolean; force: string[] }

/** distance so heightArchetype×heightPose fills fillFrac of the (square) frame,
 *  widened if widthArchetype would clip. Returns the CameraRig `radius` knob. */
export function computeFitRadius(
  bounds: { height: number; width: number; maxDimension: number },
  fit: FitSpec, archetypes: ArchetypeSpec[], fovRad: number,
): number {
  const scaleOf = (name: string) => archetypes.find((a) => a.name === name)?.scale ?? [1, 1, 1];
  const hMax = bounds.height * scaleOf(fit.heightArchetype)[1];
  const wMax = bounds.width * Math.max(scaleOf(fit.widthArchetype)[0], scaleOf(fit.widthArchetype)[2]);
  const visible = (worldSize: number) => worldSize / fit.fillFrac / (2 * Math.tan(fovRad / 2));
  const d = Math.max(visible(hMax), visible(wMax));
  return d / bounds.maxDimension; // CameraRig: distance = maxDimension * radius
}

const configDirOf = (p: string) => p.replace(/\\/g, '/').split('/').slice(0, -1).join('/');

/** Apply optional look.lighting intensity overrides (LookSpec.lighting) to the named lights the
 *  studio rig built in useAutopilotEngine.ts. Absent fields keep the rig's built-in defaults. */
export function applyLightingOverrides(lights: AutopilotLights, lighting?: LookSpec['lighting']): void {
  if (!lighting) return;
  if (lighting.key !== undefined) lights.key.intensity = lighting.key;
  if (lighting.fill !== undefined) lights.fill.intensity = lighting.fill;
  if (lighting.rim !== undefined) lights.rim.intensity = lighting.rim;
  if (lighting.ambient !== undefined) lights.ambient.intensity = lighting.ambient;
}

export default function AutopilotRunner({ args }: { args: AutopilotArgs }) {
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
      const { config, jobs, clipPool, errors } = parseBatchConfig(
        text, configDirOf(args.configPath), { preview: args.preview },
      );
      if (errors.length) {
        errors.forEach((e) => logLine(`CONFIG ERROR: ${e}`));
        await invoke('exit_app', { code: 2 });
        return;
      }
      if (lightsRef.current) applyLightingOverrides(lightsRef.current, config.look.lighting);
      if (args.preview) {
        const { runPreview } = await import('./contactSheet');
        await runPreview({ scene, engine, liveFeedCamera: liveFeedCameraRef.current!, config, clipPool, logLine });
      } else {
        exitCode = await runBatch({ scene, engine, liveFeedCamera: liveFeedCameraRef.current!, config, jobs, force: args.force, setStatus });
      }
    } catch (e) {
      logLine(`FATAL: ${e}`);
      exitCode = 1;
    }
    await invoke('exit_app', { code: exitCode });
  }

  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#c9a0e6', background: '#160c24', height: '100vh' }}>
      <h3>sprite-shot autopilot</h3>
      <div>{status}</div>
      <canvas ref={canvasRef} width={512} height={512} style={{ border: '1px solid #5e2a8c' }} />
    </div>
  );
}

// ---------- batch internals ----------

interface RunnerDeps {
  scene: BABYLON.Scene; engine: BABYLON.Engine; liveFeedCamera: BABYLON.FreeCamera;
  config: BatchConfig; jobs: ResolvedJob[]; force: string[];
  setStatus: (s: string) => void;
}

interface LoadedClip {
  root: BABYLON.TransformNode;           // scale wrapper (parent of everything imported)
  animGroup: BABYLON.AnimationGroup;
  meshes: BABYLON.AbstractMesh[];
  bounds: { height: number; width: number; maxDimension: number };
  dispose: () => void;
}

export async function loadClip(scene: BABYLON.Scene, clipPath: string, modelYawDeg = 0): Promise<LoadedClip> {
  const glbPath = await invoke<string>('ensure_glb', { sourcePath: clipPath });
  const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', convertFileSrc(glbPath), scene);
  // Everything past this point can throw (missing AnimationGroup, bounds computation) — if it
  // does, the import already succeeded and left meshes/skeletons/animationGroups in the scene.
  // Dispose them on the way out instead of leaking.
  let wrapper: BABYLON.TransformNode | null = null;
  let spin: BABYLON.TransformNode | null = null;
  let recenter: BABYLON.TransformNode | null = null;
  try {
    const animGroup = result.animationGroups[0];
    if (!animGroup) throw new Error(`no AnimationGroup in ${glbPath}`);
    // Three nested nodes: `wrapper` (outer) carries the per-archetype scale, set later in
    // runJob; `spin` (middle) carries the model's fixed yaw (modelYawDeg — a MODEL property,
    // not a per-look one) so its authored front lands on the rig's cam-0 (+X) axis; `recenter`
    // (inner, meshes actually parent here) carries a pure XZ translation computed below in
    // pre-rotate, pre-scale space. Landing the translation on the innermost node and the
    // rotation on the node just outside it means: (1) archetype scaling multiplies a subject
    // already centered on the orbit axis, instead of dragging an off-axis mesh (e.g.
    // Clapping.fbx's root isn't at x=0/z=0) further out — a single combined node would leave a
    // residual (scale-1)*centroid drift on non-uniform archetypes like `fat`; (2) the yaw never
    // combines with wrapper's non-uniform scale on one node, which would shear the model instead
    // of rotating it. Net vertex mapping: p → (p − centroid) → R·(p − centroid) → S·R·(p −
    // centroid) — recenter first, then rotate about the model's own centre, then scale.
    wrapper = new BABYLON.TransformNode('archetypeScale', scene);
    spin = new BABYLON.TransformNode('clipYaw', scene);
    spin.parent = wrapper;
    const yawRad = (modelYawDeg * Math.PI) / 180;
    spin.rotation.y = yawRad;
    recenter = new BABYLON.TransformNode('clipRecenter', scene);
    recenter.parent = spin;
    for (const m of result.meshes) if (!m.parent) m.parent = recenter;
    // Park the group at its first captured frame (same start/pause/goToFrame dance
    // captureSphericalSheet does — see sphericalAnimationCapture.ts) before measuring, and
    // explicitly refresh each skinned mesh's bounding info with applySkeleton=true (the same
    // computeWorldMatrix(true) + refreshBoundingInfo(true) pattern MeshLoader.ts/
    // useCharacterMesh.ts/viewportUtils.ts already use). Skinned-mesh bounding boxes do NOT
    // auto-update to the posed skeleton — without this they silently read the unposed (often
    // left/right-symmetric bind/T-pose) envelope, which made an XZ recenter computed from it a
    // near no-op for clips whose actual animated pose sits off-axis.
    animGroup.start(true, 1.0, animGroup.from, animGroup.to);
    animGroup.pause();
    animGroup.goToFrame(animGroup.from);
    scene.render();
    for (const m of result.meshes) {
      m.computeWorldMatrix(true);
      if ((m as BABYLON.Mesh).skeleton) (m as unknown as { refreshBoundingInfo: (applySkeleton: boolean) => void }).refreshBoundingInfo(true);
    }
    // bounds at identity transform (wrapper scale 1, recenter position 0), from the whole hierarchy
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of result.meshes) {
      if (m.getTotalVertices() === 0) continue;
      const bb = m.getBoundingInfo().boundingBox;
      min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
      max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
    }
    const size = max.subtract(min);
    // Recenter onto the orbit axis (rig cameras all target x=0/z=0); leave Y alone so feet stay
    // on the ground plane. Size (max-min) is translation-invariant, so bounds (above) stay
    // correct regardless of when they're measured relative to the recenter itself.
    //
    // Reference point: the MEAN AABB centroid across the same 6 frames captureSphericalSheet
    // will actually sample (`from + floor(f·span/6)`, f=0..5, full-trim default — mirrors its
    // own frame stepping in sphericalAnimationCapture.ts). Two single-reference approaches were
    // tried and rejected empirically: a single-frame AABB centroid is skewed by whatever pose
    // asymmetry THAT frame happens to have (e.g. Clapping's hands already brought together in
    // front at frame 0 shifts the centroid forward); a hips-bone anchor ignores real visual-mass
    // offset entirely (misses that same forward hand shift, and equally misses Waving's raised
    // arm). Averaging the centroid across every sampled frame cancels exactly the MEAN off-axis
    // component — which is what the per-cam azimuth sinusoid actually measures — while leaving
    // the genuine per-frame wobble (the animation itself) untouched, as it should be.
    // Measure this centroid with the yaw temporarily zeroed. `recenter` is `spin`'s CHILD, so
    // recenter.position gets rotated by spin's matrix when composed up through wrapper to world
    // (world = S·R·(v + recenter.position)). Reading world-space bounds while spin.rotation is
    // already the target yaw would bake R·centroid into recenter.position, and the final
    // composition would then apply R to it a SECOND time: S·R·(v + R·(−centroid)) = S·(R·v −
    // R²·centroid) ≠ S·R·(v − centroid). Zeroing spin for just this measurement recovers the true
    // raw (pre-rotation) centroid so recenter.position = −centroid exactly; the yaw is restored
    // immediately after, before any frame is actually captured.
    const F_SAMPLE = 6;
    const span = animGroup.to - animGroup.from;
    let sumX = 0, sumZ = 0;
    spin.rotation.y = 0;
    for (let f = 0; f < F_SAMPLE; f++) {
      const frame = animGroup.from + Math.floor((f * span) / F_SAMPLE);
      animGroup.goToFrame(frame);
      scene.render();
      let fMin = new BABYLON.Vector3(Infinity, Infinity, Infinity);
      let fMax = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
      for (const m of result.meshes) {
        m.computeWorldMatrix(true);
        if ((m as BABYLON.Mesh).skeleton) (m as unknown as { refreshBoundingInfo: (applySkeleton: boolean) => void }).refreshBoundingInfo(true);
        if (m.getTotalVertices() === 0) continue;
        const bb = m.getBoundingInfo().boundingBox;
        fMin = BABYLON.Vector3.Minimize(fMin, bb.minimumWorld);
        fMax = BABYLON.Vector3.Maximize(fMax, bb.maximumWorld);
      }
      sumX += (fMin.x + fMax.x) / 2;
      sumZ += (fMin.z + fMax.z) / 2;
    }
    spin.rotation.y = yawRad;
    recenter.position.x = -(sumX / F_SAMPLE);
    recenter.position.z = -(sumZ / F_SAMPLE);
    return {
      root: wrapper,
      animGroup,
      meshes: result.meshes,
      bounds: {
        height: size.y,
        width: Math.max(size.x, size.z),
        maxDimension: Math.max(size.x, size.y, size.z),
      },
      dispose: () => {
        result.animationGroups.forEach((ag) => ag.dispose());
        result.skeletons.forEach((s) => s.dispose());
        result.meshes.forEach((m) => m.dispose(false, true) /* keep shared, dispose materials+textures of this import */);
        recenter!.dispose();
        spin!.dispose();
        wrapper!.dispose();
      },
    };
  } catch (e) {
    result.animationGroups.forEach((ag) => ag.dispose());
    result.skeletons.forEach((s) => s.dispose());
    result.meshes.forEach((m) => m.dispose(false, true));
    recenter?.dispose();
    spin?.dispose();
    wrapper?.dispose();
    throw e;
  }
}

export async function runJob(
  deps: Pick<RunnerDeps, 'scene' | 'engine' | 'liveFeedCamera' | 'config'>,
  job: ResolvedJob,
  clip: LoadedClip,
  cameras: BABYLON.Camera[],
  rings: number,
  camsPerRing: number,
  cellSize: number,
): Promise<void> {
  const { config } = deps;
  clip.root.scaling = new BABYLON.Vector3(...job.archetype.scale);
  const trim: [number, number] = job.trim ?? [clip.animGroup.from, clip.animGroup.to];
  const dataUrl = await captureSphericalSheet({
    scene: deps.scene, engine: deps.engine, liveFeedCamera: deps.liveFeedCamera,
    cameras, rings, camsPerRing,
    animGroup: clip.animGroup, frames: config.frames, trim,
    cellSize, look: config.look,
  });
  // arithmetic self-check before the file ever exists — rings/
  // camsPerRing/cellSize all come from the SAME resolved preset the rig cameras were built from
  // (threaded in by runBatch), never re-hardcoded, so a preset edit can't silently desync this probe.
  const expectW = camsPerRing * config.frames * cellSize, expectH = rings * cellSize;
  const probe = new Image();
  await new Promise<void>((res, rej) => { probe.onload = () => res(); probe.onerror = rej; probe.src = dataUrl; });
  if (probe.width !== expectW || probe.height !== expectH) {
    throw new Error(`sheet ${probe.width}x${probe.height}, expected ${expectW}x${expectH}`);
  }
  await invoke('write_png_file', { dir: config.output.dir, fileName: job.fileName, fileData: dataUrl });
}

export function buildRigCameras(
  scene: BABYLON.Scene, config: BatchConfig, preset: CameraPreset, bounds: LoadedClip['bounds'], targetY: number,
  liveFeedCamera: BABYLON.FreeCamera,
): BABYLON.Camera[] {
  const fovRad = (preset.cameraProps.fov * Math.PI) / 180;
  const radius = computeFitRadius(bounds, config.fit, config.archetypes, fovRad);
  const props: CameraProps = { ...preset.cameraProps, radius };
  // Real BoundingBox shape (src/state/viewportStore.ts:55-60) needs min/max too, even though
  // calculateCameraPositions only reads center + size — fill them in properly rather than cast.
  const half = bounds.maxDimension / 2;
  const bbox: BoundingBox = {
    min: { x: -half, y: targetY - half, z: -half },
    max: { x: half, y: targetY + half, z: half },
    center: { x: 0, y: targetY, z: 0 },
    size: { x: bounds.maxDimension, y: bounds.maxDimension, z: bounds.maxDimension },
  };
  const positions = calculateCameraPositions(bbox, ViewportCameraMode.SPHERICAL, props);
  // createCamerasAtPositions takes cameraProps as a 3rd arg (fov/minZ/maxZ/projection) and
  // returns FreeCamera[], which already has .fov — no cast needed to set it below.
  const cams = createCamerasAtPositions(scene, positions, props);
  cams.forEach((c) => { c.fov = fovRad; });
  // renderFrameViaLiveFeed (frameRenderer.ts) never actually renders through these rig cameras —
  // it repositions/retargets liveFeedCamera to match each one and renders THAT. Without also
  // setting fov/minZ/maxZ here, liveFeedCamera keeps Babylon defaults (fov 0.8 rad, minZ 1,
  // maxZ 10000): computeFitRadius's fillFrac guarantee becomes silently approximate and the
  // default minZ=1 risks near-plane clipping of anything closer than world-unit 1.
  liveFeedCamera.fov = fovRad;
  liveFeedCamera.minZ = preset.cameraProps.minZ;
  liveFeedCamera.maxZ = preset.cameraProps.maxZ;
  return cams;
}

interface SheetResult { file: string; status: 'ok' | 'skipped' | 'failed'; ms: number; error?: string }

async function runBatch(deps: RunnerDeps): Promise<number> {
  const { config, jobs, force } = deps;
  const results: SheetResult[] = [];
  const outPath = (f: string) => `${config.output.dir.replace(/[\\/]+$/, '')}/${f}`;
  const scaleOf = (n: string) => config.archetypes.find((a) => a.name === n)?.scale ?? [1, 1, 1];

  // Resolve the preset ONCE — rings/camsPerRing/cellSize must come from here everywhere
  // downstream (rig camera build, the capture call, the dimension probe), never re-hardcoded, or
  // a preset edit (e.g. RINGS 4→5, or resolution 64→128) silently desyncs the literals from the
  // actual camera/cell count.
  const preset = DEFAULT_CAMERA_PRESETS.find((p) => p.id === config.presetId);
  if (!preset) {
    logLine(`CONFIG ERROR: unknown preset "${config.presetId}"`);
    return 2;
  }
  const { rings, camsPerRing, resolution } = preset.cameraProps;
  const cellSize = resolution[0]; // crowd contract cells are square (resolution[0] === resolution[1])

  // fit.heightPose: resolve its assigned clip and compute the rig ONCE from that
  // clip's bounds × the archetype scale extremes, then hold it constant across every archetype
  // × pose in the batch — cross-pose world scale stays honest and the bench-contact line never
  // shifts when poses swap.
  const fitJob = jobs.find((j) => j.pose === config.fit.heightPose);
  if (!fitJob) {
    logLine(`CONFIG ERROR: fit.heightPose "${config.fit.heightPose}" is not an assigned pose`);
    return 2;
  }
  let cameras: BABYLON.Camera[];
  try {
    deps.setStatus(`loading fit reference (${config.fit.heightPose}): ${fitJob.clipPath}`);
    const fitClip = await loadClip(deps.scene, fitJob.clipPath, config.modelYawDeg ?? 0);
    await deps.scene.whenReadyAsync();
    const targetY = (fitClip.bounds.height * scaleOf(config.fit.heightArchetype)[1]) / 2;
    cameras = buildRigCameras(deps.scene, config, preset, fitClip.bounds, targetY, deps.liveFeedCamera);
    fitClip.dispose();
  } catch (e) {
    logLine(`FATAL: fit reference clip (${fitJob.clipPath}) failed to load: ${e}`);
    return 1;
  }

  try {
    // group jobs by clip (parseBatchConfig already orders clip-outer)
    const byClip = new Map<string, ResolvedJob[]>();
    for (const j of jobs) byClip.set(j.clipPath, [...(byClip.get(j.clipPath) ?? []), j]);

    let clipIdx = 0;
    for (const [clipPath, clipJobs] of byClip) {
      clipIdx++;
      // resume: skip the whole clip if every sheet exists and none is forced
      const pending: ResolvedJob[] = [];
      for (const j of clipJobs) {
        const forced = force.includes(j.fileName.replace(/\.png$/, ''));
        if (forced) {
          try {
            await invoke('delete_file_any', { path: outPath(j.fileName) });
          } catch (e) {
            results.push({ file: j.fileName, status: 'failed', ms: 0, error: `force delete: ${e}` });
            logLine(`FAIL ${j.fileName}: force delete: ${e}`);
            continue; // do not capture over a locked file; matrix continues
          }
        }
        const exists = !forced && (await invoke<boolean>('path_exists', { path: outPath(j.fileName) }));
        if (exists) results.push({ file: j.fileName, status: 'skipped', ms: 0 });
        else pending.push(j);
      }
      if (!pending.length) continue;

      let clip: LoadedClip | null = null;
      try {
        deps.setStatus(`loading clip ${clipIdx}/${byClip.size}: ${clipPath}`);
        clip = await loadClip(deps.scene, clipPath, config.modelYawDeg ?? 0);
        await deps.scene.whenReadyAsync(); // materials/textures compile async after import — first renders otherwise capture blank cells
        for (const job of pending) {
          const t0 = performance.now();
          try {
            deps.setStatus(`capturing ${job.fileName}`);
            await runJob(deps, job, clip, cameras, rings, camsPerRing, cellSize);
            const ms = Math.round(performance.now() - t0);
            results.push({ file: job.fileName, status: 'ok', ms });
            logLine(`OK ${job.fileName} (${ms}ms)`);
          } catch (e) {
            await invoke('delete_file_any', { path: outPath(job.fileName) }).catch(() => {});
            results.push({ file: job.fileName, status: 'failed', ms: Math.round(performance.now() - t0), error: String(e) });
            logLine(`FAIL ${job.fileName}: ${e}`);
          }
        }
      } catch (e) {
        for (const job of pending) {
          results.push({ file: job.fileName, status: 'failed', ms: 0, error: `clip load: ${e}` });
          logLine(`FAIL ${job.fileName}: clip load: ${e}`);
        }
      } finally {
        clip?.dispose();
      }
    }
  } finally {
    cameras.forEach((c) => c.dispose());
  }

  const failed = results.filter((r) => r.status === 'failed');
  await invoke('write_text_file_any', {
    path: outPath('batch-report.json'),
    contents: JSON.stringify(
      { config: deps.config.output.dir, sheets: results, finishedAt: new Date().toISOString() },
      null, 2,
    ),
  }).catch((e) => logLine(`WARN report write: ${e}`));
  logLine(`DONE ok=${results.filter((r) => r.status === 'ok').length} skipped=${results.filter((r) => r.status === 'skipped').length} failed=${failed.length}`);
  return failed.length ? 1 : 0;
}
