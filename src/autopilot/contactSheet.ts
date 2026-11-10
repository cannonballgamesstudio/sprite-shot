import * as BABYLON from '@babylonjs/core';
import { invoke } from '@tauri-apps/api/core';
import { renderFrameViaLiveFeed } from '../core/capture/frameRenderer';
import { loadClip } from './AutopilotRunner';
import type { BatchConfig } from './batchConfig';

const CELL = 128, F = 6, LABEL_H = 18;

export async function runPreview(deps: {
  scene: BABYLON.Scene; engine: BABYLON.Engine; liveFeedCamera: BABYLON.FreeCamera;
  config: BatchConfig; clipPool: { name: string; path: string }[];
  logLine: (s: string) => void;
}): Promise<void> {
  const { scene, engine, liveFeedCamera, config, clipPool, logLine } = deps;
  const unique = [...new Map(clipPool.map((c) => [c.path, c])).values()];
  const sheet = document.createElement('canvas');
  sheet.width = F * CELL;
  sheet.height = unique.length * (CELL + LABEL_H);
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#160c24';
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  let vertexRef = -1;
  for (let row = 0; row < unique.length; row++) {
    const { name, path } = unique[row];
    logLine(`preview ${row + 1}/${unique.length}: ${name}`);
    // Label drawn unconditionally, before the try — a failed row still shows its filename
    // against an otherwise-blank (background-colored) cell band, so a human scanning the PNG
    // can see exactly which clip failed without cross-referencing the log. Draw order vs. the
    // frame images doesn't matter: the label band (y = row*(CELL+LABEL_H)+CELL..+CELL+LABEL_H)
    // never overlaps the image band (y = row*(CELL+LABEL_H)..+CELL) above it.
    ctx.fillStyle = '#e9c97a';
    ctx.font = '12px monospace';
    ctx.fillText(name, 4, row * (CELL + LABEL_H) + CELL + 13);

    let clip: Awaited<ReturnType<typeof loadClip>> | null = null;
    let cam: BABYLON.FreeCamera | null = null;
    try {
      clip = await loadClip(scene, path, config.modelYawDeg ?? 0);
      // Freshly imported materials/textures aren't render-ready on the very next scene.render()
      // — Babylon silently skips drawing a mesh until its material reports isReady(). Without
      // this, the first 2-4 captured frames per row (worse on the very first clip, cold shader
      // cache) come out as pure background with no character at all. whenReadyAsync() blocks
      // until every mesh/material/texture in the scene (just this clip's, since the previous
      // clip was fully disposed) is actually drawable.
      await scene.whenReadyAsync();
      const verts = clip.meshes.reduce((s, m) => s + m.getTotalVertices(), 0);
      if (vertexRef < 0) vertexRef = verts;
      else if (verts !== vertexRef) {
        logLine(`WARN ${name}: embedded mesh differs (${verts} verts vs ${vertexRef}) — crowd must be ONE character`);
      }
      // front 3/4 camera at 25° elevation
      const d = clip.bounds.maxDimension * 2.2;
      const elev = (25 * Math.PI) / 180;
      cam = new BABYLON.FreeCamera('previewCam',
        new BABYLON.Vector3(0, clip.bounds.height / 2 + Math.sin(elev) * d, -Math.cos(elev) * d), scene);
      cam.setTarget(new BABYLON.Vector3(0, clip.bounds.height / 2, 0));
      clip.animGroup.start(true, 1.0, clip.animGroup.from, clip.animGroup.to);
      clip.animGroup.pause();
      const span = clip.animGroup.to - clip.animGroup.from;
      for (let f = 0; f < F; f++) {
        clip.animGroup.goToFrame(clip.animGroup.from + Math.floor((f * span) / F));
        scene.render();
        const url = await renderFrameViaLiveFeed(scene, engine, cam, liveFeedCamera, CELL, CELL);
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error(`preview: image decode failed for ${name} frame ${f}`));
          img.src = url;
        });
        ctx.drawImage(img, f * CELL, row * (CELL + LABEL_H));
      }
    } catch (e) {
      logLine(`FAIL preview row ${name}: ${e}`);
    } finally {
      cam?.dispose();
      clip?.dispose();
    }
  }
  const out = config.preview?.out ?? 'crowd-clips-contact.png';
  await invoke('write_png_file', { dir: config.output.dir, fileName: out, fileData: sheet.toDataURL('image/png') });
  logLine(`PREVIEW written: ${out}`);
}
