/**
 * SceneManager — owns Babylon.js engine/scene lifecycle.
 * Extracted from hooks/useSpriteEngine.ts.
 *
 * Pure class, no React dependency. Hooks wrap this for React integration.
 */

import * as BABYLON from '@babylonjs/core';
import { pixelShader, outlineShader } from '../../utils/shaders';

export interface SceneManagerOptions {
  canvas: HTMLCanvasElement;
  clearColor?: BABYLON.Color4;
  lightIntensity?: number;
}

export class SceneManager {
  readonly engine: BABYLON.Engine;
  readonly scene: BABYLON.Scene;
  readonly mainCamera: BABYLON.ArcRotateCamera;
  readonly light: BABYLON.HemisphericLight;
  readonly gizmoManager: BABYLON.GizmoManager;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: SceneManagerOptions) {
    const { canvas, clearColor, lightIntensity = 0.9 } = options;

    this.engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = clearColor ?? new BABYLON.Color4(0, 0, 0, 0);

    // Hemispheric light — matches original useSpriteEngine setup
    this.light = new BABYLON.HemisphericLight(
      'pureAmbient',
      new BABYLON.Vector3(1, 1, 1),
      this.scene,
    );
    this.light.intensity = lightIntensity;
    this.light.diffuse = new BABYLON.Color3(1.15, 1.15, 1.15);
    this.light.specular = new BABYLON.Color3(0, 0, 0);
    this.light.groundColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    // Main camera for editor navigation
    this.mainCamera = new BABYLON.ArcRotateCamera(
      'camera',
      Math.PI / 2,
      Math.PI / 2,
      10,
      BABYLON.Vector3.Zero(),
      this.scene,
    );
    this.mainCamera.minZ = 0.001;
    this.mainCamera.maxZ = 1000;
    this.mainCamera.wheelPrecision = 50;
    this.mainCamera.wheelDeltaPercentage = 0.01;
    this.mainCamera.fov = BABYLON.Tools.ToRadians(75);
    this.mainCamera.layerMask = 1 | 2;
    this.mainCamera.attachControl(canvas, true);

    // Gizmo manager
    this.gizmoManager = new BABYLON.GizmoManager(this.scene);
    this.gizmoManager.positionGizmoEnabled = true;
    this.gizmoManager.rotationGizmoEnabled = true;
    this.gizmoManager.scaleGizmoEnabled = true;
    this.gizmoManager.usePointerToAttachGizmos = false;
    if (this.gizmoManager.utilityLayer) {
      this.gizmoManager.utilityLayer.setRenderCamera(this.mainCamera);
    }

    // Register shaders
    BABYLON.Effect.ShadersStore['pixelizerFragmentShader'] = pixelShader;
    BABYLON.Effect.ShadersStore['outlineFragmentShader'] = outlineShader;

    // Start render loop
    this.engine.runRenderLoop(() => this.scene.render());

    // Auto-resize
    const handleResize = () => {
      this.engine.resize();
    };
    window.addEventListener('resize', handleResize);
    this.resizeObserver = new ResizeObserver(handleResize);
    this.resizeObserver.observe(canvas);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
