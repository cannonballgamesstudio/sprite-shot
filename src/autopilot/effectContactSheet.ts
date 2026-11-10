import * as BABYLON from '@babylonjs/core';
import { invoke } from '@tauri-apps/api/core';
import { renderFrameViaLiveFeed } from '../core/capture/frameRenderer';
import { loadShaderEffect } from './loadShaderEffect';
import type { EffectBatchConfig, ResolvedEffectJob } from './effectBatchConfig';

/** effects-batch sibling to contactSheet.ts's runPreview — same "one labeled row per subject,
 *  frames across, fixed single camera" contact-sheet shape, but rows are effects (loaded via
 *  loadShaderEffect) instead of crowd clips (loaded via loadClip). */

const CELL = 128, LABEL_H = 18;

export async function runEffectPreview(deps: {
  scene: BABYLON.Scene; engine: BABYLON.Engine; liveFeedCamera: BABYLON.FreeCamera;
  config: EffectBatchConfig; jobs: ResolvedEffectJob[];
  logLine: (s: string) => void;
}): Promise<void> {
  const { scene, engine, liveFeedCamera, config, jobs, logLine } = deps;
  const F = config.frames;
  const sheet = document.createElement('canvas');
  sheet.width = F * CELL;
  sheet.height = jobs.length * (CELL + LABEL_H);
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#160c24';
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let row = 0; row < jobs.length; row++) {
    const job = jobs[row];
    logLine(`preview ${row + 1}/${jobs.length}: ${job.effectName}`);
    ctx.fillStyle = '#e9c97a';
    ctx.font = '12px monospace';
    ctx.fillText(job.effectName, 4, row * (CELL + LABEL_H) + CELL + 13);

    let effect: Awaited<ReturnType<typeof loadShaderEffect>> | null = null;
    let cam: BABYLON.FreeCamera | null = null;
    try {
      effect = await loadShaderEffect(scene, job.spec, F);
      // Freshly-created ShaderMaterial isn't necessarily render-ready on the very next
      // scene.render() — mirrors contactSheet.ts's identical whenReadyAsync() wait.
      await scene.whenReadyAsync();
      const d = effect.bounds.maxDimension * 2.2;
      cam = new BABYLON.FreeCamera('effectPreviewCam', new BABYLON.Vector3(0, 0, -d), scene);
      cam.setTarget(BABYLON.Vector3.Zero());
      effect.animGroup.start(true, 1.0, effect.animGroup.from, effect.animGroup.to);
      effect.animGroup.pause();
      const span = effect.animGroup.to - effect.animGroup.from;
      for (let f = 0; f < F; f++) {
        effect.animGroup.goToFrame(effect.animGroup.from + Math.floor((f * span) / F));
        scene.render();
        const url = await renderFrameViaLiveFeed(scene, engine, cam, liveFeedCamera, CELL, CELL);
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error(`preview: image decode failed for ${job.effectName} frame ${f}`));
          img.src = url;
        });
        ctx.drawImage(img, f * CELL, row * (CELL + LABEL_H));
      }
    } catch (e) {
      logLine(`FAIL preview row ${job.effectName}: ${e}`);
    } finally {
      cam?.dispose();
      effect?.dispose();
    }
  }
  const out = config.preview?.out ?? 'effects-clips-contact.png';
  await invoke('write_png_file', { dir: config.output.dir, fileName: out, fileData: sheet.toDataURL('image/png') });
  logLine(`PREVIEW written: ${out}`);
}
