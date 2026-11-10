/**
 * frameRenderer — single-frame render-to-image and power-of-2 padding.
 *
 * Extracts the ~120 lines of duplicated capture logic from:
 * - viewportUtils.ts useCaptureSprites (lines 592–720)
 * - viewportUtils.ts useCaptureAnimationFrames (lines 893–1017)
 *
 * Both followed the identical pattern:
 *   1. Save active cameras + viewport
 *   2. Set liveFeedCamera as sole active, full viewport
 *   3. scene.render()
 *   4. Copy engine canvas to temp canvas at target resolution (smoothing disabled)
 *   5. Pad to power-of-2
 *   6. Restore cameras + viewport
 *   7. Return as Image element
 *
 * This module replaces all of that with two clean functions.
 */

import * as BABYLON from '@babylonjs/core';

/**
 * Render a single frame from a specific camera position via the liveFeedCamera approach.
 *
 * Matches the exact rendering method used in the original capture functions:
 * sets the liveFeedCamera position/rotation to match the frustum camera,
 * renders with full viewport, copies at target resolution with smoothing disabled.
 */
export async function renderFrameViaLiveFeed(
  scene: BABYLON.Scene,
  engine: BABYLON.Engine,
  frustumCamera: BABYLON.Camera,
  liveFeedCamera: BABYLON.FreeCamera,
  width: number,
  height: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        // Save state
        const originalActiveCameras = scene.activeCameras ? [...scene.activeCameras] : null;
        const originalViewport = liveFeedCamera.viewport;

        // Position liveFeedCamera to match frustum camera
        liveFeedCamera.position = frustumCamera.position.clone();
        if (frustumCamera instanceof BABYLON.FreeCamera) {
          liveFeedCamera.setTarget(
            frustumCamera.getTarget ? frustumCamera.getTarget() : BABYLON.Vector3.Zero(),
          );
        }

        // Set as sole active camera with full viewport
        scene.activeCameras = [liveFeedCamera];
        liveFeedCamera.viewport = new BABYLON.Viewport(0, 0, 1, 1);

        scene.render();

        // Copy from engine canvas at target resolution
        const canvas = engine.getRenderingCanvas() as HTMLCanvasElement;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Disable smoothing (matching original exactly)
        ctx.imageSmoothingEnabled = false;
        (ctx as any).webkitImageSmoothingEnabled = false;
        (ctx as any).mozImageSmoothingEnabled = false;

        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);

        const dataURL = tempCanvas.toDataURL('image/png');

        // Restore state
        liveFeedCamera.viewport = originalViewport;
        if (originalActiveCameras) {
          scene.activeCameras = originalActiveCameras;
        }

        resolve(dataURL);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Render a single frame using CreateScreenshotUsingRenderTarget.
 * Simpler API — doesn't require a liveFeedCamera, renders directly from any camera.
 * Better for modes that don't use the live feed preview system (e.g., gaussian splat training).
 */
export async function renderFrameDirect(
  _scene: BABYLON.Scene,
  engine: BABYLON.Engine,
  camera: BABYLON.Camera,
  width: number,
  height: number,
): Promise<string> {
  return new Promise<string>((resolve) => {
    BABYLON.Tools.CreateScreenshotUsingRenderTarget(
      engine,
      camera,
      { width, height },
      (data) => resolve(data),
      'image/png',
    );
  });
}

/**
 * Pad an image data URL to the nearest power-of-2 dimensions, centered.
 * Returns both the padded data URL and the final dimensions.
 */
export async function padToPowerOf2(
  dataURL: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const pw = nextPowerOf2(sourceWidth);
  const ph = nextPowerOf2(sourceHeight);

  if (pw === sourceWidth && ph === sourceHeight) {
    return { dataUrl: dataURL, width: pw, height: ph };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get padding canvas context'));
        return;
      }

      ctx.imageSmoothingEnabled = false;
      (ctx as any).webkitImageSmoothingEnabled = false;
      (ctx as any).mozImageSmoothingEnabled = false;

      ctx.clearRect(0, 0, pw, ph);
      const offsetX = (pw - sourceWidth) / 2;
      const offsetY = (ph - sourceHeight) / 2;
      ctx.drawImage(img, offsetX, offsetY);

      resolve({ dataUrl: canvas.toDataURL('image/png'), width: pw, height: ph });
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

function nextPowerOf2(value: number): number {
  if (value <= 1) return 1;
  if (value > 4096) return 4096;
  let power = 1;
  while (power < value) power *= 2;
  return power;
}

/**
 * Composite an array of images into a grid spritesheet.
 * Returns a data URL of the assembled spritesheet.
 */
export async function compositeToSpritesheet(
  images: { dataUrl: string; width: number; height: number }[],
  cols: number,
  rows: number,
): Promise<string> {
  if (images.length === 0) throw new Error('No images to composite');

  const cellW = images[0].width;
  const cellH = images[0].height;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('Failed to create spritesheet canvas context');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await Promise.all(
    images.map(
      (img, i) =>
        new Promise<void>((resolve, reject) => {
          const el = new Image();
          el.onload = () => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            ctx.drawImage(el, col * cellW, row * cellH);
            resolve();
          };
          el.onerror = reject;
          el.src = img.dataUrl;
        }),
    ),
  );

  return canvas.toDataURL('image/png');
}
