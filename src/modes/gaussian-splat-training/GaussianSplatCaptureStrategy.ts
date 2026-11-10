/**
 * Gaussian Splat Training capture strategy.
 *
 * Captures multi-view, multi-frame images + depth maps for training
 * dynamic (4D) gaussian splat models.
 *
 * Output structure:
 *   {projectPath}/gsplat/
 *     transforms.json
 *     images/
 *       frame_0000/           ← one dir per animation frame
 *         camera_00.png
 *         camera_01.png
 *     depth/
 *       frame_0000/
 *         camera_00.png
 *         camera_01.png
 */

import * as BABYLON from '@babylonjs/core';
import type {
  ICaptureStrategy,
  CaptureConfig,
  CaptureFrame,
  CaptureResult,
  CaptureArtifact,
} from '../../core/capture/ICaptureStrategy';
import { extractIntrinsics, extractExtrinsics } from './cameraUtils';
import {
  buildTransformsJson,
  buildCOLMAPCameras,
  buildCOLMAPImages,
  buildCOLMAPPoints3D,
} from './transforms';

export type OutputFormat = 'nerf-synthetic' | 'colmap' | 'both';

export interface GaussianSplatCaptureConfig extends CaptureConfig {
  /** Animation group to step through (null for static captures) */
  animationGroup: BABYLON.AnimationGroup | null;
  /** Total animation frames to capture */
  frameCount: number;
  /** Trim range (in animation group frame units) */
  trimStart: number;
  trimEnd: number;
  /** Animation frame rate */
  frameRate: number;
  /** Output format */
  outputFormat: OutputFormat;
  /** Background color for clean segmentation [r, g, b, a] 0-1 */
  backgroundColor: [number, number, number, number];
  /** Whether to capture depth maps alongside color */
  captureDepth: boolean;
}

export class GaussianSplatCaptureStrategy implements ICaptureStrategy {
  readonly id = 'gaussian-splat-training';
  readonly label = 'Gaussian Splat Training Data';

  private originalClearColor: BABYLON.Color4 | null = null;

  private originalEngineSize: { w: number; h: number } | null = null;
  private originalActiveCameras: BABYLON.Camera[] | null = null;
  private originalActiveCamera: BABYLON.Nullable<BABYLON.Camera> = null;

  async prepare(config: CaptureConfig): Promise<void> {
    const gc = config as GaussianSplatCaptureConfig;
    const [width, height] = gc.resolution;

    // Save and set background color
    this.originalClearColor = gc.scene.clearColor.clone();
    const [r, g, b, a] = gc.backgroundColor;
    gc.scene.clearColor = new BABYLON.Color4(r, g, b, a);

    // Stop the render loop — we'll call scene.render() manually per camera.
    // This prevents the render loop from racing with our captures and
    // ensures the engine size matches our target resolution.
    gc.engine.stopRenderLoop();

    // Save and resize engine to target resolution so the projection matrix
    // uses the correct aspect ratio (not the viewport's aspect ratio).
    this.originalEngineSize = {
      w: gc.engine.getRenderWidth(),
      h: gc.engine.getRenderHeight(),
    };
    gc.engine.setSize(width, height);

    // Save camera state
    this.originalActiveCameras = gc.scene.activeCameras ? [...gc.scene.activeCameras] : null;
    this.originalActiveCamera = gc.scene.activeCamera;

    // Hide UI meshes (frustum lines, gizmos, live feed)
    gc.scene.meshes.forEach((mesh) => {
      if (
        mesh.name.startsWith('frustum') ||
        mesh.name === 'skyBox' ||
        mesh.name === 'cameraFeedPlane'
      ) {
        mesh.setEnabled(false);
      }
    });
  }

  async execute(
    config: CaptureConfig,
    onProgress: (current: number, total: number) => void,
  ): Promise<CaptureFrame[]> {
    const gc = config as GaussianSplatCaptureConfig;
    const frames: CaptureFrame[] = [];
    const [width, height] = gc.resolution;

    // Determine frame count
    const hasAnimation = gc.animationGroup !== null;
    const totalAnimFrames = hasAnimation
      ? Math.max(1, gc.trimEnd - gc.trimStart)
      : 1;
    const totalOps = totalAnimFrames * gc.cameras.length * (gc.captureDepth ? 2 : 1);
    let completed = 0;

    for (let f = 0; f < totalAnimFrames; f++) {
      // Seek animation to exact frame
      if (gc.animationGroup) {
        const animFrame = gc.animationGroup.from +
          ((gc.trimStart + f) / gc.frameRate) * 1000;
        gc.animationGroup.pause();
        gc.animationGroup.goToFrame(
          Math.min(animFrame, gc.animationGroup.to),
        );
        // Force skeleton + mesh update
        gc.scene.render();
      }

      for (let c = 0; c < gc.cameras.length; c++) {
        const camera = gc.cameras[c];
        // Render color
        const colorData = await this.renderFromCamera(gc, camera, width, height);

        // Render depth
        let depthData: string | undefined;
        if (gc.captureDepth) {
          depthData = await this.renderDepthFromCamera(gc, camera, width, height);
        }

        frames.push({
          cameraIndex: c,
          frameIndex: f,
          imageData: colorData,
          width,
          height,
          metadata: {
            transform_matrix: extractExtrinsics(camera),
            depthData,
            time: hasAnimation ? f / Math.max(totalAnimFrames - 1, 1) : 0,
          },
        });

        completed += gc.captureDepth ? 2 : 1;
        onProgress(completed, totalOps);
      }
    }

    return frames;
  }

  private async renderFromCamera(
    gc: GaussianSplatCaptureConfig,
    camera: BABYLON.Camera,
    width: number,
    height: number,
  ): Promise<string> {
    // Set this frustum camera as sole active camera with full viewport
    // and layer mask that can see the character meshes.
    const origMask = camera.layerMask;
    camera.layerMask = 2; // character mesh layer
    camera.viewport = new BABYLON.Viewport(0, 0, 1, 1);

    gc.scene.activeCamera = camera;
    gc.scene.activeCameras = [camera];

    // Render directly — engine is already sized to target resolution (set in prepare),
    // and render loop is stopped, so no race conditions.
    gc.scene.render();

    // Copy from the engine canvas, horizontally flipped.
    // The flip compensates for the negated right-axis in the c2w matrix
    // (required to convert Babylon's LH to nerfstudio's RH with det=+1).
    const canvas = gc.engine.getRenderingCanvas() as HTMLCanvasElement;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);
    const dataUrl = tempCanvas.toDataURL('image/png');

    camera.layerMask = origMask;
    return dataUrl;
  }

  private async renderDepthFromCamera(
    gc: GaussianSplatCaptureConfig,
    camera: BABYLON.Camera,
    width: number,
    height: number,
  ): Promise<string> {
    // enableDepthRenderer binds to a specific camera at creation time and
    // won't follow activeCamera changes. Create a fresh one per camera,
    // render, read pixels, then dispose it.

    const prevCamera = gc.scene.activeCamera;
    gc.scene.activeCamera = camera;

    // Create depth renderer bound to THIS camera
    const dr = gc.scene.enableDepthRenderer(
      camera,
      false, // storeNonLinearDepth = false → linear 0..1
      true,  // force32bits
    );

    // Render twice — first pass primes the depth RTT, second ensures it's populated
    gc.scene.render();
    gc.scene.render();

    const depthMap = dr.getDepthMap();
    const depthPixels = await depthMap.readPixels();

    // Clean up this per-camera depth renderer
    gc.scene.disableDepthRenderer(camera);
    gc.scene.activeCamera = prevCamera;

    if (!depthPixels) {
      throw new Error('Failed to read depth pixels');
    }

    // Convert float depth to grayscale PNG
    const floatData = depthPixels instanceof Float32Array
      ? depthPixels
      : new Float32Array(depthPixels.buffer);

    const depthW = depthMap.getSize().width;
    const depthH = depthMap.getSize().height;

    const canvas = document.createElement('canvas');
    canvas.width = depthW;
    canvas.height = depthH;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(depthW, depthH);

    for (let i = 0; i < depthW * depthH; i++) {
      // Linear depth: 0.0 = near plane, 1.0 = far plane
      const d = Math.min(1.0, Math.max(0.0, floatData[i * 4]));
      const v = Math.round(d * 255);
      imgData.data[i * 4 + 0] = v;
      imgData.data[i * 4 + 1] = v;
      imgData.data[i * 4 + 2] = v;
      imgData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imgData, 0, 0);

    if (depthW !== width || depthH !== height) {
      const scaled = document.createElement('canvas');
      scaled.width = width;
      scaled.height = height;
      const sctx = scaled.getContext('2d')!;
      sctx.imageSmoothingEnabled = false;
      sctx.drawImage(canvas, 0, 0, width, height);
      return scaled.toDataURL('image/png');
    }

    return canvas.toDataURL('image/png');
  }

  async assemble(
    frames: CaptureFrame[],
    config: CaptureConfig,
  ): Promise<CaptureResult> {
    const gc = config as GaussianSplatCaptureConfig;
    const { invoke } = await import('@tauri-apps/api/core');
    const [width, height] = gc.resolution;
    const intrinsics = extractIntrinsics(gc.cameras[0], width, height);
    const artifacts: CaptureArtifact[] = [];

    const hasAnimation = gc.animationGroup !== null;
    const totalAnimFrames = hasAnimation
      ? Math.max(1, gc.trimEnd - gc.trimStart)
      : 1;

    // Determine unique frame indices
    const transformFrames: {
      transform_matrix: number[][];
      file_path: string;
      depth_file_path?: string;
      frame_index?: number;
      time?: number;
    }[] = [];

    for (const frame of frames) {
      const frameDir = `frame_${String(frame.frameIndex).padStart(4, '0')}`;
      const camName = `camera_${String(frame.cameraIndex).padStart(2, '0')}.png`;

      // Write color image
      const colorRelPath = `images/${frameDir}/${camName}`;
      const base64Color = frame.imageData.includes(',')
        ? frame.imageData.split(',')[1]
        : frame.imageData;
      await invoke('write_png_file', {
        dir: `${gc.outputDir}/images/${frameDir}`,
        fileName: camName,
        fileData: base64Color,
      });

      // Write depth image
      let depthRelPath: string | undefined;
      if (gc.captureDepth && frame.metadata?.depthData) {
        depthRelPath = `depth/${frameDir}/${camName}`;
        const base64Depth = (frame.metadata.depthData as string).includes(',')
          ? (frame.metadata.depthData as string).split(',')[1]
          : (frame.metadata.depthData as string);
        await invoke('write_png_file', {
          dir: `${gc.outputDir}/depth/${frameDir}`,
          fileName: camName,
          fileData: base64Depth,
        });
      }

      transformFrames.push({
        transform_matrix: frame.metadata!.transform_matrix as number[][],
        file_path: colorRelPath,
        depth_file_path: depthRelPath,
        frame_index: frame.frameIndex,
        time: frame.metadata?.time as number | undefined,
      });
    }

    artifacts.push({
      type: 'image',
      path: 'images/',
      description: `${frames.length} training images (${gc.cameras.length} cameras × ${totalAnimFrames} frames)`,
    });

    if (gc.captureDepth) {
      artifacts.push({
        type: 'image',
        path: 'depth/',
        description: `${frames.length} depth maps`,
      });
    }

    // Write NeRF Synthetic transforms.json
    if (gc.outputFormat === 'nerf-synthetic' || gc.outputFormat === 'both') {
      const transforms = buildTransformsJson(intrinsics, transformFrames);
      const jsonStr = JSON.stringify(transforms, null, 2);
      await invoke('write_png_file', {
        dir: gc.outputDir,
        fileName: 'transforms.json',
        fileData: btoa(jsonStr),
      });
      artifacts.push({
        type: 'json',
        path: 'transforms.json',
        description: 'NeRF camera transforms',
      });
    }

    // Write COLMAP format
    if (gc.outputFormat === 'colmap' || gc.outputFormat === 'both') {
      const sparseDir = `${gc.outputDir}/sparse/0`;
      await invoke('write_png_file', {
        dir: sparseDir,
        fileName: 'cameras.txt',
        fileData: btoa(buildCOLMAPCameras(intrinsics)),
      });
      await invoke('write_png_file', {
        dir: sparseDir,
        fileName: 'images.txt',
        fileData: btoa(buildCOLMAPImages(transformFrames)),
      });
      await invoke('write_png_file', {
        dir: sparseDir,
        fileName: 'points3D.txt',
        fileData: btoa(buildCOLMAPPoints3D()),
      });
      artifacts.push({
        type: 'json',
        path: 'sparse/0/',
        description: 'COLMAP sparse reconstruction',
      });
    }

    return {
      outputPath: gc.outputDir,
      totalFrames: frames.length,
      totalCameras: gc.cameras.length,
      artifacts,
    };
  }

  async cleanup(config: CaptureConfig): Promise<void> {
    const gc = config as GaussianSplatCaptureConfig;

    // Restore clear color
    if (this.originalClearColor) {
      gc.scene.clearColor = this.originalClearColor;
      this.originalClearColor = null;
    }

    // Restore engine size
    if (this.originalEngineSize) {
      gc.engine.setSize(this.originalEngineSize.w, this.originalEngineSize.h);
      this.originalEngineSize = null;
    }

    // Restore cameras
    gc.scene.activeCamera = this.originalActiveCamera;
    if (this.originalActiveCameras) {
      gc.scene.activeCameras = this.originalActiveCameras;
    }
    this.originalActiveCamera = null;
    this.originalActiveCameras = null;

    // Restart render loop
    gc.engine.runRenderLoop(() => gc.scene.render());

    // Re-enable UI meshes
    gc.scene.meshes.forEach((mesh) => {
      if (
        mesh.name.startsWith('frustum') ||
        mesh.name === 'skyBox' ||
        mesh.name === 'cameraFeedPlane'
      ) {
        mesh.setEnabled(true);
      }
    });
  }
}
