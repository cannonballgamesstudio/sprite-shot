import { useCallback, RefObject, MutableRefObject, useState, useEffect } from 'react';

import * as BABYLON from '@babylonjs/core';
import { CameraProps, CameraPosition, CameraProjection, useViewportStore } from '../state/viewportStore';
import { BoundingBox, ViewportCameraMode } from '../state/viewportStore';
import { open } from '@tauri-apps/plugin-dialog';
import { message } from '@tauri-apps/plugin-dialog';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { documentDir } from '@tauri-apps/api/path';
import { useMeshTreeStore, MeshTreeNode } from '../state/meshTree';
import { useAnimationSettings, AnimationSettings } from '../state/animationSettingStore';

interface UseInsertCamerasParams {
  meshLoaded: boolean;
  cameraPositions: CameraPosition[];
  sceneRef: RefObject<BABYLON.Scene | null>;
  characterRef: RefObject<BABYLON.Mesh | null>;
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>;
  cameraProps: CameraProps;
}

export const useInsertCameras = ({
  meshLoaded,
  cameraPositions,
  sceneRef,
  characterRef,
  frustumCamerasRef,
  cameraProps,
}: UseInsertCamerasParams) => {
  const insertCameras = useCallback(() => {
 
    if (!meshLoaded || !cameraPositions.length || !sceneRef.current || !characterRef.current || !frustumCamerasRef.current) return;

    const scene = sceneRef.current;
    const model = characterRef.current;
    if (!scene || !model) return;

    console.log('inserting cameras, positions:', cameraPositions);
    

    frustumCamerasRef.current.forEach(cam => cam.dispose());
    frustumCamerasRef.current = [];


    const existingFrustumMeshes = scene.meshes.filter(m => m.name.startsWith('frustumNearLines_'));
    existingFrustumMeshes.forEach(mesh => mesh.dispose());

    cameraPositions.forEach(({ position, target, index }) => {
      console.log('inserting camera', index);
      const camera = new BABYLON.FreeCamera(
        `camera_${index}`,
        new BABYLON.Vector3(position.x, position.y, position.z),
        scene
      );
      camera.setTarget(new BABYLON.Vector3(target.x, target.y, target.z));

      frustumCamerasRef.current.push(camera);
      camera.fov = BABYLON.Tools.ToRadians(cameraProps.fov);
      camera.minZ = cameraProps.minZ;
      camera.maxZ = cameraProps.maxZ;

      if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        const orthoScale = cameraProps.orthoScale;
        camera.orthoTop = orthoScale;
        camera.orthoBottom = -orthoScale;
        camera.orthoLeft = -orthoScale;
        camera.orthoRight = orthoScale;
      } else {
        camera.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
      }

      const aspect = 1.0; 
      const near = camera.minZ * 5;
      const nearHeight = 2 * Math.tan(camera.fov / 2) * near;
      const nearWidth = nearHeight * aspect;
      const hw = nearWidth / 2;
      const hh = nearHeight / 2;

      const nearLocal = [
        new BABYLON.Vector3(-hw, hh, near),
        new BABYLON.Vector3(hw, hh, near),
        new BABYLON.Vector3(hw, -hh, near),
        new BABYLON.Vector3(-hw, -hh, near),
      ];

      const cameraWorldMatrix = camera.getWorldMatrix();
      const nearWorld = nearLocal.map(corner =>
        BABYLON.Vector3.TransformCoordinates(corner, cameraWorldMatrix)
      );

      const cameraPos = camera.globalPosition.clone();
      const squareLines = [
        [nearWorld[0], nearWorld[1]],
        [nearWorld[1], nearWorld[2]],
        [nearWorld[2], nearWorld[3]],
        [nearWorld[3], nearWorld[0]],
      ];

      const apexLines = nearWorld.map(corner => [cameraPos, corner]);
      const lines = squareLines.concat(apexLines);
      const mesh = BABYLON.MeshBuilder.CreateLineSystem(
        `frustumNearLines_${index}`,
        { lines, updatable: true },
        scene
      );
      mesh.layerMask = 1;
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 1.2;
      mesh.edgesColor = new BABYLON.Color4(0, 1, 0, 1);
      mesh.color = BABYLON.Color3.Teal();
    });
  }, [meshLoaded, cameraPositions, cameraProps]);

  return insertCameras;
}

interface UseCameraRigParams {
  sceneRef: RefObject<BABYLON.Scene | null>;
  characterRef: RefObject<BABYLON.Mesh | null>;
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>;
}

interface UseCameraRigResult {
  boundingBox: BoundingBox | null;
  setBoundingBox: (bbox: BoundingBox | null) => void;
  meshLoaded: boolean;
  setMeshLoaded: (loaded: boolean) => void;
  cameraPositions: CameraPosition[];
  setCameraPositions: (positions: CameraPosition[]) => void;
}

export const useCameraRig = ({
  sceneRef,
  characterRef,
  frustumCamerasRef,
}: UseCameraRigParams): UseCameraRigResult => {
  const cameraProps = useViewportStore(state => state.cameraProps);
  const cameraMode = useViewportStore(state => state.cameraMode);
  const recenterCamerasTrigger = useViewportStore(state => state.recenterCamerasTrigger);

  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null);
  const [meshLoaded, setMeshLoaded] = useState(false);
  const [cameraPositions, setCameraPositions] = useState<CameraPosition[]>([]);

  const insertCameras = useInsertCameras({
    meshLoaded,
    cameraPositions,
    sceneRef,
    characterRef,
    frustumCamerasRef,
    cameraProps,
  });

  useEffect(() => {
    insertCameras();
  }, [cameraPositions]);

  useEffect(() => {
    if (!meshLoaded || !characterRef.current || !sceneRef.current || recenterCamerasTrigger === 0)
      return;

    const root = characterRef.current;
    const meshes = [root, ...root.getChildMeshes(false)];

    meshes.forEach(m => {
      m.computeWorldMatrix(true);
      if ((m as any).skeleton) {
        (m as any).refreshBoundingInfo(true);
      }
    });

    const { boundingBox: bbox, cameraPositions: newCameraPositions } =
      computeBoundingBoxAndCameraPositions(meshes, cameraMode, cameraProps);
    setCameraPositions(newCameraPositions);
    setBoundingBox(bbox);
  }, [recenterCamerasTrigger]);

  useEffect(() => {
    if (!boundingBox || !meshLoaded) return;
    const newCameraPositions = calculateCameraPositions(boundingBox, cameraMode, cameraProps);
    setCameraPositions(newCameraPositions);
  }, [cameraMode, cameraProps, boundingBox, meshLoaded]);

  return {
    boundingBox,
    setBoundingBox,
    meshLoaded,
    setMeshLoaded,
    cameraPositions,
    setCameraPositions,
  };
}

// Re-export from core engine service for backward compatibility
export {
  calculateCameraPositions as calculateCameraPositions_v2,
  calculateMeshBoundingBox as calculateMeshBoundingBox_v2,
  computeBoundingBoxAndCameraPositions as computeBoundingBoxAndCameraPositions_v2,
  createCamerasAtPositions,
} from '../core/engine/CameraRig';

export function calculateCameraPositions(
  boundingBox: BoundingBox | null,
  cameraMode: ViewportCameraMode,
  cameraProps: CameraProps
): CameraPosition[] {
        if (!boundingBox) return [];
        console.log(cameraMode);
        const positions: CameraPosition[] = [];
        const center = boundingBox.center;
        const size = boundingBox.size;
        const maxDimension = Math.max(size.x, size.y, size.z);
        const distance = maxDimension * cameraProps.radius;
        
        if (cameraMode === ViewportCameraMode.PLANAR) {
            const { camsPerRing } = cameraProps;
            
            for (let i = 0; i < camsPerRing; i++) {
                const angle = (i / camsPerRing) * 2 * Math.PI;
                const x = center.x + Math.cos(angle) * distance;
                const z = center.z + Math.sin(angle) * distance;
                const y = center.y;
                
                positions.push({
                    position: { x, y, z },
                    target: center,
                    index: i
                });
            }
        } else {
            const { rings, camsPerRing } = cameraProps;
            let cameraIndex = 0;
            const elevMin = cameraProps.elevationMinDeg !== undefined
              ? (cameraProps.elevationMinDeg * Math.PI) / 180 : -(Math.PI * 0.7) / 2;
            const elevMax = cameraProps.elevationMaxDeg !== undefined
              ? (cameraProps.elevationMaxDeg * Math.PI) / 180 : (Math.PI * 0.7) / 2;

            for (let ring = 0; ring < rings; ring++) {

                const t = rings === 1 ? 0.5 : ring / (rings - 1); // rings=1 no longer divides by 0
                const elevationAngle = elevMin + t * (elevMax - elevMin);

                const ringRadius = Math.cos(elevationAngle) * distance;
                const ringHeight = Math.sin(elevationAngle) * distance;
                
                for (let cam = 0; cam < camsPerRing; cam++) {
                    const azimuthAngle = (cam / camsPerRing) * 2 * Math.PI;
                    
                    const x = center.x + Math.cos(azimuthAngle) * ringRadius;
                    const z = center.z + Math.sin(azimuthAngle) * ringRadius;
                    const y = center.y + ringHeight;
                    
                    positions.push({
                        position: { x, y, z },
                        target: center,
                        index: cameraIndex++
                    });
                }
            }
        }
        
        return positions;
}

export function calculateMeshBoundingBox(meshes: any[]): BoundingBox | null {
    if (!meshes || meshes.length === 0) return null;
    
    let min = {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY,
        z: Number.POSITIVE_INFINITY
    };
    let max = {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY,
        z: Number.NEGATIVE_INFINITY
    };
    
    meshes.forEach(mesh => {
        if (mesh.getBoundingInfo) {
            const boundingInfo = mesh.getBoundingInfo();
            const meshMin = boundingInfo.boundingBox.minimumWorld;
            const meshMax = boundingInfo.boundingBox.maximumWorld;
            
            min.x = Math.min(min.x, meshMin.x);
            min.y = Math.min(min.y, meshMin.y);
            min.z = Math.min(min.z, meshMin.z);
            
            max.x = Math.max(max.x, meshMax.x);
            max.y = Math.max(max.y, meshMax.y);
            max.z = Math.max(max.z, meshMax.z);
        }
    });
    
    const center = {
        x: (min.x + max.x) * 0.5,
        y: (min.y + max.y) * 0.5,
        z: (min.z + max.z) * 0.5
    };
    
    const size = {
        x: max.x - min.x,
        y: max.y - min.y,
        z: max.z - min.z
    };
    
    return { min, max, center, size };
}

export function computeBoundingBoxAndCameraPositions(
  meshes: any[],
  cameraMode: ViewportCameraMode,
  cameraProps: CameraProps
): { boundingBox: BoundingBox | null; cameraPositions: CameraPosition[] } {
  const boundingBox = calculateMeshBoundingBox(meshes);
  const cameraPositions = calculateCameraPositions(boundingBox, cameraMode, cameraProps);
  return { boundingBox, cameraPositions };
}

function getNextPowerOf2(value: number): number {
    if (value <= 1) return 1;
    if (value > 4096) return 4096;
    
    let power = 1;
    while (power < value) {
        power *= 2;
    }
    return power;
}

export const useInitializeAnimation = (
  animationGroupsRef: MutableRefObject<BABYLON.AnimationGroup[]>,
  setSelectedMeshId: (id: string) => void,
  setCurrentAnimation: (name: string) => void
) => {
  return useCallback(async (path: string, animation: BABYLON.AnimationGroup) => {
    animationGroupsRef.current.push(animation);

    const { addLoadedAnimation } = useMeshTreeStore.getState();
    const { addAnimation } = useAnimationSettings.getState();
    const animationId = crypto.randomUUID();

    const animationNode: MeshTreeNode = {
      label: animation.name,
      value: path,
      type: 'animation',
      id: animationId,
    };

    const animationSettings: AnimationSettings = {
      id: animationId,
      name: animation.name,
      totalFrames: animation.to,
      currentFrameTarget: 24,
      trimStart: 0,
      trimEnd: animation.to,
    };
    
    addAnimation(animationSettings);
    addLoadedAnimation(path, animationNode);
    setSelectedMeshId(animationNode.id);

    animation.start(true);
    setCurrentAnimation(animation.name);
  }, [animationGroupsRef, setSelectedMeshId, setCurrentAnimation]);
};

export const useLoadAnimation = (
  sceneRef: RefObject<BABYLON.Scene | null>,
  characterRef: RefObject<BABYLON.Mesh | null>,
  initializeAnimation: (path: string, animation: BABYLON.AnimationGroup) => Promise<void>
) => {
  return useCallback(async () => {
    if (!sceneRef.current) {
      await message('No scene is available. Please load a model first.', { title: 'Error' });
      return;
    }
    if (!characterRef.current) {
      await message('No character mesh found. Please load a model first.', { title: 'Error' });
      return;
    }

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLTF Animation Files', extensions: ['gltf', 'glb'] }],
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      // Import only animations, skip meshes by passing empty array
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        [],
        '',
        convertFileSrc(path),
        sceneRef.current
      );

      result.animationGroups.forEach(group => {
        group.children;
      });
      const anim = result.animationGroups[0].clone(
        result.animationGroups[0].name,
        oldTarget =>
          characterRef.current!.getChildren(child => child.name === oldTarget.name, false)[0],
        true
      );
      await initializeAnimation(path, anim);

      // No meshes to dispose since we didn't import any
    } catch (error) {
      console.error('Failed to load animation:', error);
      await message(`Failed to load animation: ${error}`, { title: 'Error' });
    }
  }, [sceneRef, characterRef, initializeAnimation]);
};


export const useRenderAndSaveAllCameras = (
  sceneRef: RefObject<BABYLON.Scene | null>,
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>
) => {
  return useCallback((outputDir: string, frameIndex: number, engine: BABYLON.Engine) => {
    sceneRef.current?.meshes.forEach(mesh => {
      if (
        mesh.name === 'skyBox' ||
        mesh.name.startsWith('frustum') ||
        mesh.name === 'cameraFeedPlane'
      ) {
        mesh.setEnabled(false);
      }
    });
    
    for (let i = 0; i < frustumCamerasRef.current.length; i++) {
      const camera = frustumCamerasRef.current[i];
      const size = { width: 256, height: 256 };

      BABYLON.Tools.CreateScreenshotUsingRenderTarget(
        engine,
        camera,
        size,
        data => {
          invoke('write_png_file', {
            dir: `${outputDir}/${i}`,
            fileName: `frame_${frameIndex}.png`,
            fileData: data,
          });
        },
        'image/png'
      );
    }

    sceneRef.current?.meshes.forEach(mesh => {
      if (
        mesh.name === 'skyBox' ||
        mesh.name.startsWith('frustum') ||
        mesh.name === 'cameraFeedPlane'
      ) {
        mesh.setEnabled(true);
      }
    });
  }, [sceneRef, frustumCamerasRef]);
};


export const useCaptureSprites = (
  sceneRef: RefObject<BABYLON.Scene | null>,
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>,
  setActiveCameraIndex: (index: number) => void,
  setIsCapturing: (capturing: boolean) => void,
  setCaptureProgress: (progress: { frame: number; totalFrames: number } | null) => void
) => {
  return useCallback(async () => {
    if (!sceneRef.current || frustumCamerasRef.current.length === 0) {
      await message('Please load a model first and ensure cameras are created', { title: 'Error' });
      return;
    }

    const scene = sceneRef.current;
    const engine = scene.getEngine();
    const totalCameras = frustumCamerasRef.current.length;
    
    const { cameraMode, cameraProps } = useViewportStore.getState();
    
    // Determine if we need to capture animated frames
    const captureAnimatedFrames = cameraProps.animateEachCamera;
    const animationFrames = captureAnimatedFrames ? 4 : 1; // 4 animated frames: down, right, up, left
    const totalCaptures = totalCameras * animationFrames;
    
    let cols: number, rows: number;
    
    if (cameraMode === ViewportCameraMode.PLANAR) {
      cols = cameraProps.camsPerRing * animationFrames;
      rows = 1;
    } else {
      cols = cameraProps.camsPerRing * animationFrames;
      rows = cameraProps.rings;
    }

    const outputDir = await open({
      directory: true,
      title: 'Select Output Directory for Spritesheet',
      filters: [],
      defaultPath: await documentDir(),
    });

    if (!outputDir) return;

    setIsCapturing(true);
    setCaptureProgress({ frame: 0, totalFrames: totalCaptures });

    const capturedImages: { img: HTMLImageElement; width: number; height: number }[] = [];
    let maxWidth = 0;
    let maxHeight = 0;

    try {
      let completedCaptures = 0;

      for (let i = 0; i < totalCameras; i++) {
        setActiveCameraIndex(i);
        
        // Capture frames for this camera position
        const framesToCapture = captureAnimatedFrames ? [1, 2, 3, 4] : [0]; // Skip initial frame (0), capture animated frames
        
        for (const animationFrame of framesToCapture) {
          // Apply animation offset to live feed camera
          const liveFeedCamera = scene.cameras.find(cam => cam.name === 'liveFeedCamera') as BABYLON.FreeCamera;
          
          if (liveFeedCamera && captureAnimatedFrames) {
            // Apply the same animation logic as in CharacterViewport
            const animationOffset = new BABYLON.Vector3(0, 0, 0);
            const pixelOffset = 1;

            switch (animationFrame) {
              case 1: // down
                animationOffset.y = -pixelOffset * 0.002;
                break;
              case 2: // right
                animationOffset.x = pixelOffset * 0.002;
                break;
              case 3: // up
                animationOffset.y = pixelOffset * 0.002;
                break;
              case 4: // left
                animationOffset.x = -pixelOffset * 0.002;
                break;
              default: // initial position
                break;
            }

            // Apply the offset to the camera rotation
            if (liveFeedCamera.getViewMatrix) {
              const viewMatrix = liveFeedCamera.getViewMatrix();
              const worldMatrix = viewMatrix.clone().invert();
              const rotationQuaternion = new BABYLON.Quaternion();
              worldMatrix.decompose(undefined, rotationQuaternion);

              const offsetRotation = BABYLON.Quaternion.FromEulerAngles(
                animationOffset.x,
                animationOffset.y,
                animationOffset.z
              );
              rotationQuaternion.multiplyInPlace(offsetRotation);
              (liveFeedCamera as any).rotationQuaternion = rotationQuaternion;

              // Apply orthographic scale animation if using orthographic projection
              if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
                let scaleVariation = 1.0;
                switch (animationFrame) {
                  case 1: // down - scale down by 1%
                  case 4: // left - scale down by 1%
                    scaleVariation = 0.99;
                    break;
                  case 2: // right - scale up by 1%
                  case 3: // up - scale up by 1%
                    scaleVariation = 1.01;
                    break;
                  default: // initial - no scale change
                    scaleVariation = 1.0;
                    break;
                }

                const baseOrthoScale = cameraProps.orthoScale * scaleVariation;
                liveFeedCamera.orthoTop = baseOrthoScale;
                liveFeedCamera.orthoBottom = -baseOrthoScale;
                liveFeedCamera.orthoLeft = -baseOrthoScale;
                liveFeedCamera.orthoRight = baseOrthoScale;
              }
            }
          }
          
          scene.render();
          await new Promise<void>((resolve, reject) => {
            requestAnimationFrame(() => {
              try {
                let originalViewport: BABYLON.Viewport | null = null;
                const mainCamera = scene.cameras.find(cam => cam.name === 'camera');
                const originalActiveCameras = scene.activeCameras ? [...scene.activeCameras] : null;
                
                // Temporarily set only live feed camera as active
                if (mainCamera && liveFeedCamera) {
                  scene.activeCameras = [liveFeedCamera];
                }
                
                if (liveFeedCamera) {
                  originalViewport = liveFeedCamera.viewport;
                  liveFeedCamera.viewport = new BABYLON.Viewport(0, 0, 1, 1); // Full screen
                }
                
                scene.render();

                const canvas = engine.getRenderingCanvas() as HTMLCanvasElement;
                
                const captureWidth = cameraProps.resolution[0];
                const captureHeight = cameraProps.resolution[1];

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = captureWidth;
                tempCanvas.height = captureHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (!tempCtx) {
                  reject(new Error('Failed to get canvas context'));
                  return;
                }

                tempCtx.imageSmoothingEnabled = false;
                (tempCtx as any).webkitImageSmoothingEnabled = false;
                (tempCtx as any).mozImageSmoothingEnabled = false;
                (tempCtx as any).msImageSmoothingEnabled = false;
                (tempCtx as any).oImageSmoothingEnabled = false;
                
                // if ('imageSmoothingQuality' in tempCtx) {
                //   (tempCtx as any).imageSmoothingQuality = 'pixelated';
                // }

                tempCtx.drawImage(
                  canvas,
                  0, 0, canvas.width, canvas.height,
                  0, 0, captureWidth, captureHeight
                );
                
                const dataURL = tempCanvas.toDataURL('image/png');
                
                // Restore viewport and active cameras
                if (liveFeedCamera && originalViewport) {
                  liveFeedCamera.viewport = originalViewport;
                }
                
                if (originalActiveCameras) {
                  scene.activeCameras = originalActiveCameras;
                }
                
                const img = new Image();
                img.onload = () => {
                  try {
                    const powerOf2Width = getNextPowerOf2(img.width);
                    const powerOf2Height = getNextPowerOf2(img.height);
                    
                    const paddingCanvas = document.createElement('canvas');
                    paddingCanvas.width = powerOf2Width;
                    paddingCanvas.height = powerOf2Height;
                    const paddingCtx = paddingCanvas.getContext('2d');
                    
                    if (paddingCtx) {
                      paddingCtx.imageSmoothingEnabled = false;
                      (paddingCtx as any).webkitImageSmoothingEnabled = false;
                      (paddingCtx as any).mozImageSmoothingEnabled = false;
                      (paddingCtx as any).msImageSmoothingEnabled = false;
                      (paddingCtx as any).oImageSmoothingEnabled = false;
                      
                      paddingCtx.clearRect(0, 0, powerOf2Width, powerOf2Height);
                      
                      const offsetX = (powerOf2Width - img.width) / 2;
                      const offsetY = (powerOf2Height - img.height) / 2;
                      paddingCtx.drawImage(img, offsetX, offsetY);
                      
                      const paddedImg = new Image();
                      paddedImg.onload = () => {
                        maxWidth = Math.max(maxWidth, paddedImg.width);
                        maxHeight = Math.max(maxHeight, paddedImg.height);
                        
                        capturedImages.push({
                          img: paddedImg,
                          width: paddedImg.width,
                          height: paddedImg.height
                        });

                        completedCaptures++;
                        setCaptureProgress({ frame: completedCaptures, totalFrames: totalCaptures });
                        resolve();
                      };
                      paddedImg.onerror = reject;
                      paddedImg.src = paddingCanvas.toDataURL('image/png');
                    } else {
                      maxWidth = Math.max(maxWidth, img.width);
                      maxHeight = Math.max(maxHeight, img.height);
                      
                      capturedImages.push({
                        img,
                        width: img.width,
                        height: img.height
                      });

                      completedCaptures++;
                      setCaptureProgress({ frame: completedCaptures, totalFrames: totalCaptures });
                      resolve();
                    }
                  } catch (error) {
                    reject(error);
                  }
                };
                img.onerror = reject;
                img.src = dataURL;
                
              } catch (error) {
                console.error('Capture error:', error);
                reject(error);
              }
            });
          });
        }
      }

      const spritesheetWidth = cols * maxWidth;
      const spritesheetHeight = rows * maxHeight;
      const canvas = document.createElement('canvas');
      canvas.width = spritesheetWidth;
      canvas.height = spritesheetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        await message('Failed to create canvas context', { title: 'Error' });
        return;
      }

      ctx.clearRect(0, 0, spritesheetWidth, spritesheetHeight);

      for (let i = 0; i < capturedImages.length; i++) {
        let row: number, col: number;
        
        if (cameraMode === ViewportCameraMode.PLANAR) {
          row = 0;
          col = i;
        } else {
          // For spherical mode with animation frames
          const cameraIndex = Math.floor(i / animationFrames);
          const frameIndex = i % animationFrames;
          row = Math.floor(cameraIndex / cameraProps.camsPerRing);
          col = (cameraIndex % cameraProps.camsPerRing) * animationFrames + frameIndex;
        }
        
        const x = col * maxWidth;
        const y = row * maxHeight;
        const { img } = capturedImages[i];

        ctx.drawImage(img, x, y, maxWidth, maxHeight);
      }

      const dataURL = canvas.toDataURL('image/png');
      await invoke('write_png_file', {
        dir: outputDir,
        fileName: 'spritesheet.png',
        fileData: dataURL,
      });

      const modeText = cameraMode === ViewportCameraMode.PLANAR ? 'planar' : 'spherical';
      const animationText = captureAnimatedFrames ? ` with ${animationFrames} animation frames per camera` : '';
      const layoutText = cameraMode === ViewportCameraMode.PLANAR 
        ? `${totalCameras} cameras × ${animationFrames} frames in 1 row`
        : `${cameraProps.rings} rings × ${cameraProps.camsPerRing} cameras × ${animationFrames} frames per camera`;

      await message(
        `Live-feed-matched spritesheet saved successfully! Combined ${totalCaptures} captures in ${modeText} mode (${layoutText})${animationText} with identical post-processing as live preview. Each sprite padded to power-of-2 dimensions: ${maxWidth}x${maxHeight}.`,
        { title: 'Success' }
      );
    } catch (error) {
      console.error('Error capturing spritesheet:', error);
      await message(`Error capturing spritesheet: ${error}`, { title: 'Error' });
    } finally {
      setIsCapturing(false);
      setCaptureProgress(null);
    }
  }, [sceneRef, frustumCamerasRef, setIsCapturing, setCaptureProgress]);
};

export const useCaptureAnimationFrames = (
  sceneRef: RefObject<BABYLON.Scene | null>,
  animationGroupsRef: MutableRefObject<BABYLON.AnimationGroup[]>,
  currentAnimation: string | null,
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>,
  setActiveCameraIndex: (index: number) => void,
  setIsCapturing: (capturing: boolean) => void,
  setCaptureProgress: (progress: { frame: number; totalFrames: number } | null) => void,
  reloadAnimationTrigger: number
) => {
 return useCallback(async () => {
  const scene = sceneRef.current;
  if (!scene) return;
  
  if (scene.animationGroups.length === 0) {
    await message('No animation found in scene', { title: 'Error' });
    return;
  }

  const animGroup = scene.animationGroups[0];
  console.log('Using animation from scene.animationGroups:', animGroup.name);
 console.log('Capture check:', {
    hasScene: !!sceneRef.current,
    animGroupCount: animationGroupsRef.current.length,
    currentAnimation: currentAnimation,
    animGroupNames: animationGroupsRef.current.map(ag => ag.name)
  });
    if (frustumCamerasRef.current.length === 0) {
      await message('No render cameras available. Please ensure cameras are created.', { title: 'Error' });
      return;
    }

    const engine = scene.getEngine();
    const totalCameras = frustumCamerasRef.current.length;

    if (!animGroup) {
      await message('Current animation not found', { title: 'Error' });
      return;
    }

    const outputDir = await open({
      directory: true,
      title: 'Select Output Directory for Animation Spritesheet',
      filters: [],
      defaultPath: await documentDir(),
    });

    if (!outputDir) return;

    const { getSelectedAnimation } = useAnimationSettings.getState();
    const selectedAnimation = getSelectedAnimation();
    if (!selectedAnimation) {
      await message('Please select an animation first', { title: 'Error' });
      return;
    }

    const { cameraProps } = useViewportStore.getState();
    
    // Calculate frames to capture based on trim settings
    const trimStart = selectedAnimation.trimStart;
    const trimEnd = selectedAnimation.trimEnd;
    const trimmedFrameCount = trimEnd - trimStart;
    const sampleRate = selectedAnimation.currentFrameTarget;

    console.log('Animation capture debug:', {
  trimStart,
  trimEnd,
  trimmedFrameCount,
  sampleRate,
  totalCameras,
});

    const totalCaptures = totalCameras * trimmedFrameCount;
    
    setIsCapturing(true);
    setCaptureProgress({ frame: 0, totalFrames: totalCaptures });

    // Pause animation
    animGroup.pause();
    const originalSpeed = animGroup.speedRatio;

    const capturedImages: { img: HTMLImageElement; width: number; height: number }[] = [];
    let maxWidth = 0;
    let maxHeight = 0;
    let completedCaptures = 0;

    try {
      // Step through each animation frame
      for (let frameIdx = 0; frameIdx < trimmedFrameCount; frameIdx++) {
        const actualFrame = trimStart + frameIdx;
        
        // Use the same mechanism as the scrub bar - update via store
        // This triggers the useEffect in CharacterViewport that properly handles animation updates
        const { setCurrentFrame, pause } = useAnimationSettings.getState();
        pause();
        setCurrentFrame(actualFrame);
        
        // Wait for the frame update to propagate through the useEffect
        scene.render();
        // await new Promise(resolve => setTimeout(resolve, 10));
        // scene.render();
        
        // Capture at all cameras for this frame using live feed method
        for (let cameraIdx = 0; cameraIdx < totalCameras; cameraIdx++) {
          setActiveCameraIndex(cameraIdx);

          // Capture using same method as static capture
          await new Promise<void>((resolve, reject) => {
            // Small delay to allow UI updates
            setTimeout(() => {
              try {
                const liveFeedCamera = scene.cameras.find(cam => cam.name === 'liveFeedCamera') as BABYLON.FreeCamera;
                const mainCamera = scene.cameras.find(cam => cam.name === 'camera');
                const originalActiveCameras = scene.activeCameras ? [...scene.activeCameras] : null;
                let originalViewport: BABYLON.Viewport | null = null;
                
                // Temporarily set only live feed camera as active
                if (mainCamera && liveFeedCamera) {
                  scene.activeCameras = [liveFeedCamera];
                }
                
                if (liveFeedCamera) {
                  originalViewport = liveFeedCamera.viewport;
                  liveFeedCamera.viewport = new BABYLON.Viewport(0, 0, 1, 1);
                }
                
                scene.render();

                const canvas = engine.getRenderingCanvas() as HTMLCanvasElement;
                const captureWidth = cameraProps.resolution[0];
                const captureHeight = cameraProps.resolution[1];

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = captureWidth;
                tempCanvas.height = captureHeight;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (!tempCtx) {
                  reject(new Error('Failed to get canvas context'));
                  return;
                }

                tempCtx.imageSmoothingEnabled = false;
                (tempCtx as any).webkitImageSmoothingEnabled = false;
                (tempCtx as any).mozImageSmoothingEnabled = false;
                (tempCtx as any).msImageSmoothingEnabled = false;
                (tempCtx as any).oImageSmoothingEnabled = false;
                // if ('imageSmoothingQuality' in tempCtx) {
                //   (tempCtx as any).imageSmoothingQuality = 'pixelated';
                // }

                tempCtx.drawImage(
                  canvas,
                  0, 0, canvas.width, canvas.height,
                  0, 0, captureWidth, captureHeight
                );
                
                // Pad directly from tempCanvas without intermediate image load
                const powerOf2Width = getNextPowerOf2(captureWidth);
                const powerOf2Height = getNextPowerOf2(captureHeight);
                
                const paddingCanvas = document.createElement('canvas');
                paddingCanvas.width = powerOf2Width;
                paddingCanvas.height = powerOf2Height;
                const paddingCtx = paddingCanvas.getContext('2d');
                
                if (paddingCtx) {
                  paddingCtx.imageSmoothingEnabled = false;
                  (paddingCtx as any).webkitImageSmoothingEnabled = false;
                  (paddingCtx as any).mozImageSmoothingEnabled = false;
                  (paddingCtx as any).msImageSmoothingEnabled = false;
                  (paddingCtx as any).oImageSmoothingEnabled = false;
                  
                  paddingCtx.clearRect(0, 0, powerOf2Width, powerOf2Height);
                  
                  const offsetX = (powerOf2Width - captureWidth) / 2;
                  const offsetY = (powerOf2Height - captureHeight) / 2;
                  paddingCtx.drawImage(tempCanvas, offsetX, offsetY);
                  
                  const paddedImg = new Image();
                  paddedImg.onload = () => {
                    maxWidth = Math.max(maxWidth, paddedImg.width);
                    maxHeight = Math.max(maxHeight, paddedImg.height);
                    
                    capturedImages.push({
                      img: paddedImg,
                      width: paddedImg.width,
                      height: paddedImg.height
                    });

                    completedCaptures++;
                    setCaptureProgress({ frame: completedCaptures, totalFrames: totalCaptures });
                    resolve();
                  };
                  paddedImg.onerror = reject;
                  paddedImg.src = paddingCanvas.toDataURL('image/png');
                } else {
                  // Fallback without padding
                  const img = new Image();
                  img.onload = () => {
                    maxWidth = Math.max(maxWidth, img.width);
                    maxHeight = Math.max(maxHeight, img.height);
                    
                    capturedImages.push({
                      img,
                      width: img.width,
                      height: img.height
                    });

                    completedCaptures++;
                    setCaptureProgress({ frame: completedCaptures, totalFrames: totalCaptures });
                    resolve();
                  };
                  img.onerror = reject;
                  img.src = tempCanvas.toDataURL('image/png');
                }
                
                // Restore viewport and active cameras
                if (liveFeedCamera && originalViewport) {
                  liveFeedCamera.viewport = originalViewport;
                }
                
                if (originalActiveCameras) {
                  scene.activeCameras = originalActiveCameras;
                }
                
              } catch (error) {
                console.error('Capture error:', error);
                reject(error);
              }
            }, 0); // Added delay parameter here
          });
        }
      }

      // Create spritesheet: rows = cameras, cols = frames
      const cols = trimmedFrameCount;
      const rows = totalCameras;
      const spritesheetWidth = cols * maxWidth;
      const spritesheetHeight = rows * maxHeight;
      
      const canvas = document.createElement('canvas');
      canvas.width = spritesheetWidth;
      canvas.height = spritesheetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        await message('Failed to create canvas context', { title: 'Error' });
        return;
      }

      ctx.clearRect(0, 0, spritesheetWidth, spritesheetHeight);

      // Draw images: each row is one camera, each column is one frame
      for (let cameraIdx = 0; cameraIdx < totalCameras; cameraIdx++) {
        for (let frameIdx = 0; frameIdx < trimmedFrameCount; frameIdx++) {
          // Array index: frameIdx * totalCameras + cameraIdx
          const arrayIndex = frameIdx * totalCameras + cameraIdx;
          const { img } = capturedImages[arrayIndex];
          
          const x = frameIdx * maxWidth;
          const y = cameraIdx * maxHeight;
          
          ctx.drawImage(img, x, y, maxWidth, maxHeight);
        }
      }
      const dataURL = canvas.toDataURL('image/png');
      await invoke('write_png_file', {
        dir: outputDir,
        fileName: 'animation_spritesheet.png',
        fileData: dataURL,
      });

      await message(
        `Animation spritesheet saved successfully! Captured ${trimmedFrameCount} frames × ${totalCameras} cameras = ${totalCaptures} total sprites. Layout: ${rows} rows (cameras) × ${cols} columns (frames). Each sprite padded to power-of-2 dimensions: ${maxWidth}x${maxHeight}.`,
        { title: 'Success' }
      );
    } catch (error) {
      console.error('Error capturing animation frames:', error);
      await message(`Error capturing animation frames: ${error}`, { title: 'Error' });
    } finally {
      setIsCapturing(false);
      setCaptureProgress(null);
      animGroup.speedRatio = originalSpeed;
      animGroup.play();
    }
  }, [sceneRef, animationGroupsRef, currentAnimation, frustumCamerasRef, setActiveCameraIndex, setIsCapturing, setCaptureProgress, reloadAnimationTrigger]);
};