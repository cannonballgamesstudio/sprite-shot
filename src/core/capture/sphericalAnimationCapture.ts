import * as BABYLON from '@babylonjs/core';
import { renderFrameViaLiveFeed } from './frameRenderer';
import { quantizeCel, outlineAlpha, matteBleed, binarizeAlpha, RGBA } from '../image/cellOps';

export interface LookSpec {
  celBands: number;      // 2–3
  outlinePx: number;     // thickness at FINAL cell resolution (1)
  outlineColor: string;  // '#1A0F26'
  matteBleedPx: number;  // 2
  supersample: number;   // 4 → capture cells at cellSize*4
  /** Optional output-range compression for quantizeCel's band centers (see cellOps.ts).
   *  Absent = full [0,255] domain (today's behavior: bands=3 → 42/127/212). */
  celRange?: [number, number];
  /** Optional desaturation-on-lift for quantizeCel (see cellOps.ts). Absent/0 = no-op
   *  (today's behavior). */
  celDesat?: number;
  /** Optional overrides (intensities only) for the studio 3-point rig in useAutopilotEngine.ts.
   *  Absent = the rig's built-in defaults (key 1.2 / fill 0.4 / rim 0.5 / ambient 0.3). Applied
   *  in AutopilotRunner after config parse, by name, to the already-built lights. */
  lighting?: { key?: number; fill?: number; rim?: number; ambient?: number };
  /** Alpha-cutout mode for the captured cell. 'binary' (default/absent) = today's crowd
   *  contract: hard ink outline (outlineAlpha) + snapped 0/255 alpha (binarizeAlpha), byte-for-
   *  byte unchanged from before this field existed — crowd-batch.json is provably unaffected.
   *  'straight' = skip both ops so soft/glowing VFX edges (lightning, goop, bloom) keep smooth
   *  antialiased alpha instead of being hard-cutout into a silhouette. matteBleed still runs
   *  unconditionally either way (it only bleeds RGB into near-transparent pixels to prevent
   *  dark-edge fringing under blend, desirable regardless of cutout mode). */
  alphaMode?: 'binary' | 'straight';
}

/** Whether `alphaMode` requests the hard-cutout post-process (outlineAlpha + binarizeAlpha).
 *  Exported as a pure predicate so the gating decision itself is unit-testable without a
 *  DOM/canvas setup — captureSphericalSheet's own body isn't unit tested for the same reason
 *  (WebGL render + canvas dependency); this file's existing test only covers pure helpers. */
export function wantsHardCutout(alphaMode: LookSpec['alphaMode']): boolean {
  return alphaMode !== 'straight';
}

export interface SphericalCaptureJob {
  scene: BABYLON.Scene;
  engine: BABYLON.Engine;
  liveFeedCamera: BABYLON.FreeCamera;
  cameras: BABYLON.Camera[]; // ring-major: index = ring*camsPerRing + cam; ring 0 = 5° band min
  rings: number;
  camsPerRing: number;
  animGroup: BABYLON.AnimationGroup;
  frames: number;            // F = 6
  trim: [number, number];
  cellSize: number;          // 64
  look: LookSpec;
  onCell?: (done: number, total: number) => void;
}

export function cellPlacement(
  ring: number, cam: number, frame: number, framesPerPose: number, cellSize: number,
): { x: number; y: number } {
  return { x: (cam * framesPerPose + frame) * cellSize, y: ring * cellSize };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
}

/** Render one pose as a spherical-animation sheet. Caller owns scene/cameras/animGroup lifetime. */
export async function captureSphericalSheet(job: SphericalCaptureJob): Promise<string> {
  const { cellSize, frames: F, rings, camsPerRing, look } = job;
  const superSize = cellSize * look.supersample;
  const outlineColor = hexToRgb(job.look.outlineColor);
  const total = rings * camsPerRing * F;
  let done = 0;

  const sheet = document.createElement('canvas');
  sheet.width = camsPerRing * F * cellSize;   // 8*6*64 = 3072
  sheet.height = rings * cellSize;            // 4*64 = 256
  const sheetCtx = sheet.getContext('2d')!;

  const work = document.createElement('canvas'); // supersampled cell workspace
  work.width = superSize; work.height = superSize;
  const workCtx = work.getContext('2d', { willReadFrequently: true })!;
  const cell = document.createElement('canvas');
  cell.width = cellSize; cell.height = cellSize;
  const cellCtx = cell.getContext('2d', { willReadFrequently: true })!;

  // Park the group paused; goToFrame + render then samples deterministically.
  job.animGroup.start(true, 1.0, job.animGroup.from, job.animGroup.to);
  job.animGroup.pause();
  const [trimStart, trimEnd] = job.trim;
  const span = trimEnd - trimStart;

  try {
    for (let f = 0; f < F; f++) {
      const actualFrame = trimStart + Math.floor((f * span) / F); // no wrap duplicate
      job.animGroup.goToFrame(actualFrame);
      job.scene.render();
      for (let ci = 0; ci < rings * camsPerRing; ci++) {
        const dataUrl = await renderFrameViaLiveFeed(
          job.scene, job.engine, job.cameras[ci], job.liveFeedCamera, superSize, superSize,
        );
        const img = await dataUrlToImage(dataUrl);

        // look ops at supersample res
        workCtx.clearRect(0, 0, superSize, superSize);
        workCtx.drawImage(img, 0, 0, superSize, superSize);
        const superData = workCtx.getImageData(0, 0, superSize, superSize) as unknown as RGBA;
        quantizeCel(superData, look.celBands, look.celRange, look.celDesat);
        if (wantsHardCutout(look.alphaMode)) {
          outlineAlpha(superData, look.outlinePx * look.supersample, outlineColor);
        }
        workCtx.putImageData(superData as unknown as ImageData, 0, 0);

        // downscale, smoothing off (contract), then matte bleed at final res
        cellCtx.imageSmoothingEnabled = false;
        cellCtx.clearRect(0, 0, cellSize, cellSize);
        cellCtx.drawImage(work, 0, 0, cellSize, cellSize);
        const cellData = cellCtx.getImageData(0, 0, cellSize, cellSize) as unknown as RGBA;
        matteBleed(cellData, look.matteBleedPx);
        // The WebGL render is antialiased, so the supersampled cell has soft alpha edges; the
        // smoothing-OFF downscale above point-samples those soft-edge pixels straight into the
        // final cell, leaving some 0<alpha<255 pixels even though quantizeCel/outlineAlpha only
        // ever act on (or set) alpha at the extremes. The frozen sheet contract requires
        // binary-intent alpha (renderer alpha-tests at 0.5, never blends) — snap post-matteBleed
        // (same >=128 threshold matteBleed itself already partitions on, so this doesn't change
        // which pixels matteBleed treated as opaque vs. transparent) and before the final write.
        // Skipped under alphaMode:'straight' — see LookSpec.alphaMode/wantsHardCutout above.
        if (wantsHardCutout(look.alphaMode)) {
          binarizeAlpha(cellData);
        }
        cellCtx.putImageData(cellData as unknown as ImageData, 0, 0);

        const ring = Math.floor(ci / camsPerRing);
        const cam = ci % camsPerRing;
        const { x, y } = cellPlacement(ring, cam, f, F, cellSize);
        sheetCtx.drawImage(cell, x, y);
        job.onCell?.(++done, total);
      }
    }
  } finally {
    job.animGroup.play(true); // restore looping playback state
  }
  return sheet.toDataURL('image/png');
}
