import { useEffect, RefObject, MutableRefObject } from 'react';
import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { useViewportStore, CameraProjection, CameraProps } from '../state/viewportStore';
import { outlineShader, pixelShader } from '../utils/shaders';

interface UseSpriteEngineParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sceneRef: MutableRefObject<BABYLON.Scene | null>;
  mainCameraRef: MutableRefObject<BABYLON.ArcRotateCamera | null>;
  liveFeedCameraRef: MutableRefObject<BABYLON.FreeCamera | null>;
  liveFeedRectangleRef: MutableRefObject<GUI.Rectangle | null>;
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>;
  gizmoRef: MutableRefObject<BABYLON.GizmoManager | null>;
  isResizingRef: MutableRefObject<boolean>;
  activeCameraIndex: number;
  setActiveCameraIndex: (index: number) => void;
  setOnOpen: (handler: (action: string | undefined) => void) => void;
  handleLoadAnimation: () => void | Promise<void>;
  handleLoadMesh: () => void | Promise<void>;
  updateLiveFeedViewport: () => void;
  cameraProps: CameraProps;
}

export const useSpriteEngine = ({
  canvasRef,
  sceneRef,
  mainCameraRef,
  liveFeedCameraRef,
  liveFeedRectangleRef,
  frustumCamerasRef,
  gizmoRef,
  isResizingRef,
  activeCameraIndex,
  setActiveCameraIndex,
  setOnOpen,
  handleLoadAnimation,
  handleLoadMesh,
  updateLiveFeedViewport,
  cameraProps,
}: UseSpriteEngineParams) => {
  useEffect(() => {
    setOnOpen((action: string | undefined) => {
      if (action === 'loadAnimation') {
        handleLoadAnimation();
      } else {
        handleLoadMesh();
      }
    });

    if (!canvasRef.current) return;

    const engine = new BABYLON.Engine(canvasRef.current!, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    const initEngine = () => {
      const scene = new BABYLON.Scene(engine);

      sceneRef.current = scene;
      scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
      const pureAmbient = new BABYLON.HemisphericLight(
        'pureAmbient',
        new BABYLON.Vector3(1, 1, 1),
        scene
      );
      pureAmbient.intensity = 0.9;
      pureAmbient.diffuse = new BABYLON.Color3(1.15, 1.15, 1.15);
      pureAmbient.specular = new BABYLON.Color3(0.0, 0.0, 0.0);
      pureAmbient.groundColor = new BABYLON.Color3(0.3, 0.3, 0.3);

      const camera = new BABYLON.ArcRotateCamera(
        'camera',
        Math.PI / 2,
        Math.PI / 2,
        10,
        BABYLON.Vector3.Zero(),
        scene
      );
      camera.minZ = 0.001;
      camera.maxZ = 1000;
      camera.wheelPrecision = 50;
      camera.wheelDeltaPercentage = 0.01;

      mainCameraRef.current = camera;
      camera.layerMask = 1 | 2;
      camera.attachControl(canvasRef.current, true);
      gizmoRef.current = new BABYLON.GizmoManager(scene);
      gizmoRef.current.positionGizmoEnabled = true;
      gizmoRef.current.rotationGizmoEnabled = true;
      gizmoRef.current.scaleGizmoEnabled = true;
      gizmoRef.current.usePointerToAttachGizmos = false;
      if (gizmoRef.current.utilityLayer) {
        gizmoRef.current.utilityLayer.setRenderCamera(camera);
      }
      const liveFeedCamera = new BABYLON.FreeCamera(
        'liveFeedCamera',
        new BABYLON.Vector3(0, 0, 0),
        sceneRef.current,
        false
      );
      liveFeedCamera.layerMask = 2;

      liveFeedCamera.minZ = cameraProps.minZ;
      liveFeedCamera.maxZ = cameraProps.maxZ;

      if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
        liveFeedCamera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        const orthoScale = cameraProps.orthoScale;
        liveFeedCamera.orthoTop = orthoScale;
        liveFeedCamera.orthoBottom = -orthoScale;
        liveFeedCamera.orthoLeft = -orthoScale;
        liveFeedCamera.orthoRight = orthoScale;
      } else {
        liveFeedCamera.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
        liveFeedCamera.fov = BABYLON.Tools.ToRadians(cameraProps.fov);
      }
      scene.activeCameras?.push(camera);
      scene.activeCameras?.push(liveFeedCamera);

      const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');

      if (advancedTexture.layer?.layerMask) advancedTexture.layer.layerMask = 1;
      const rectangle = new GUI.Rectangle();
      rectangle.width = '30%';
      rectangle.height = '30%';
      rectangle.thickness = 4;
      rectangle.color = '#3D3D3D';
      rectangle.background = '#222';
      rectangle.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
      rectangle.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
      rectangle.leftInPixels = 0.025 * canvasRef.current!.clientWidth;
      rectangle.topInPixels = -(0.025 * canvasRef.current!.clientHeight);
      rectangle.cornerRadius = 10;
      liveFeedRectangleRef.current = rectangle;
      advancedTexture.addControl(rectangle);

      liveFeedCameraRef.current = liveFeedCamera;
      setTimeout(() => updateLiveFeedViewport(), 100);

      camera.onViewMatrixChangedObservable.add(() => {
        let minDist = Infinity;
        let closest: number | null = null;
        frustumCamerasRef.current.forEach((c, index) => {
          const dist = BABYLON.Vector3.Distance(mainCameraRef.current!.position, c.position);
          if (dist < minDist) {
            minDist = dist;
            closest = index;
          }
        });
        if (typeof closest === 'number' && closest !== activeCameraIndex) {
          setActiveCameraIndex(closest);
        }
      });

      const fovDegrees = 75;
      const fovRadians = BABYLON.Tools.ToRadians(fovDegrees);
      camera.fov = fovRadians;

      canvasRef.current?.addEventListener('keydown', event => {
        if (event.key == 'l') {
          pureAmbient.intensity = pureAmbient.intensity + 0.1;
          if (pureAmbient.intensity > 2) {
            pureAmbient.intensity = 0.1;
          }
        }
      });

      engine.runRenderLoop(() => {
        scene.render();
      });

      const handleResize = () => {
        isResizingRef.current = true;

        engine.stopRenderLoop();

        setTimeout(() => {
          engine.resize();
          updateLiveFeedViewport();

          engine.runRenderLoop(() => {
            scene.render();
          });

          isResizingRef.current = false;
        }, 100);
      };

      window.addEventListener('resize', handleResize);
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvasRef.current!);

      BABYLON.Effect.ShadersStore['pixelizerFragmentShader'] = pixelShader;

      const pixelPostProcess = new BABYLON.PostProcess(
        'Pixelizer',
        'pixelizer',
        ['targetRes'],
        null,
        1.0,
        liveFeedCameraRef.current
      );

      pixelPostProcess.onApply = effect => {
        const { cameraProps: currentCameraProps } = useViewportStore.getState();
        effect.setVector2(
          'targetRes',
          new BABYLON.Vector2(currentCameraProps.resolution[0], currentCameraProps.resolution[1])
        );
      };

      BABYLON.Effect.ShadersStore['outlineFragmentShader'] = outlineShader;
    };

    initEngine();

    return () => {
      const scene = sceneRef.current;
      if (scene) {
        const engine = scene.getEngine();
        if (engine) {
          engine.stopRenderLoop();
          scene.dispose();
          engine.dispose();
        }
      }
    };
  }, []);
};
