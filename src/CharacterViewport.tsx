import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { useElementSize } from '@mantine/hooks';
import './App.css';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';
registerBuiltInLoaders();
import { open, message } from '@tauri-apps/plugin-dialog';
import { useMenuActions } from './state/menuActions';
import { useMeshTreeStore } from './state/meshTree';
import '@babylonjs/core/Debug/debugLayer';
import '@babylonjs/inspector';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';
import { useViewportStore, CameraProjection } from './state/viewportStore';
import { useViewportPresetSync } from './hooks/useViewportPresetSync';
// PropManager now rendered in PropertiesPanel
import { usePropManagement } from './hooks/usePropManagement';
import {
  useCameraRig,
  useLoadAnimation,
  useInitializeAnimation,
  useCaptureSprites,
  useCaptureAnimationFrames,
} from './hooks/viewportUtils';
import { useSpriteEngine } from './hooks/useSpriteEngine';
import { useCharacterAnimation } from './hooks/useCharacterAnimation';
import { useCharacterMesh } from './hooks/useCharacterMesh';
import { useProjectStore } from './state/projectStore';
// ViewportSettings, SceneTree now rendered in PropertiesPanel
import { useAnimationSettings } from './state/animationSettingStore';
// AnimationBar now rendered in BottomBar
import { useAppStore } from './state/appStore';
import { CaptureOrchestrator } from './core/capture/CaptureOrchestrator';
import type { GaussianSplatCaptureConfig } from './modes/gaussian-splat-training/GaussianSplatCaptureStrategy';
// GaussianSplatSettings now rendered in PropertiesPanel

const CharacterViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const skeletonViewersRef = useRef<SkeletonViewer[]>([]);
  const frustumCamerasRef = useRef<BABYLON.Camera[]>([]);
  const gizmoRef = useRef<BABYLON.GizmoManager | null>(null);
  const mainCameraRef = useRef<BABYLON.ArcRotateCamera | null>(null);
  const liveFeedCameraRef = useRef<BABYLON.FreeCamera | null>(null);
  const isResizingRef = useRef(false);
  const animationGroupsRef = useRef<BABYLON.AnimationGroup[]>([]);
  const characterRef = useRef<BABYLON.Mesh | null>(null);
  // Capture state — lifted to store for cross-component access
  const setIsCapturing = useAppStore((s) => s.setIsCapturing);
  const captureProgress = useAppStore((s) => s.captureProgress);
  const setCaptureProgress = useAppStore((s) => s.setCaptureProgress);
  const setAvailableBones = useAppStore((s) => s.setAvailableBones);
  const setCameraCount = useAppStore((s) => s.setCameraCount);
  const setLoadedMeshId = useAppStore((s) => s.setLoadedMeshId);
  const loadedMeshId = useAppStore((s) => s.loadedMeshId);

  const [activeCameraIndex, setActiveCameraIndex] = useState<number>(0);
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);

  const animationCycleRef = useRef<number>(0);

  const setOnOpen = useMenuActions(state => state.setOnOpen);
  const { setSelectedMeshId } = useMeshTreeStore();
  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);

  const cameraProps = useViewportStore(state => state.cameraProps);
  const cameraMode = useViewportStore(state => state.cameraMode);
  const { setBoundingBox, meshLoaded, setMeshLoaded, setCameraPositions } = useCameraRig({
    sceneRef,
    characterRef,
    frustumCamerasRef,
  });
  const currentMeshPath = useViewportStore(state => state.currentMeshPath);
  const setCurrentMeshPath = useViewportStore(state => state.setCurrentMeshPath);
  const liveFeedRectangleRef = useRef<GUI.Rectangle | null>(null);
  const initializeAnimation = useInitializeAnimation(
    animationGroupsRef,
    setSelectedMeshId,
    setCurrentAnimation
  );

  const handleLoadAnimation = useLoadAnimation(sceneRef, characterRef, initializeAnimation);
  const importMesh = useProjectStore(state => state.importMesh);

  useViewportPresetSync();

  const captureSpritesheet = useCaptureSprites(
    sceneRef,
    frustumCamerasRef,
    setActiveCameraIndex,
    setIsCapturing,
    setCaptureProgress
  );
  const reloadAnimationTrigger = useAnimationSettings(state => state.reloadAnimationTrigger);
  const captureAnimationFrames = useCaptureAnimationFrames(
    sceneRef,
    animationGroupsRef,
    currentAnimation,
    frustumCamerasRef,
    setActiveCameraIndex,
    setIsCapturing,
    setCaptureProgress,
    reloadAnimationTrigger
  );

  // Hook still runs for Babylon.js side effects (prop loading/attachment)
  usePropManagement({
      sceneRef,
      characterRef,
      gizmoRef,
      meshLoaded,
      loadedMeshId, // Pass the loaded mesh ID, not the selected ID
      selectedMeshId,
    });

  const currentProject = useProjectStore(state => state.currentProject);
  useCharacterAnimation({
    sceneRef: sceneRef as React.MutableRefObject<BABYLON.Scene | null>,
    characterRef: characterRef as React.MutableRefObject<BABYLON.Mesh | null>,
    selectedMeshId,
    currentMeshPath,
    reloadAnimationTrigger,
  });

  useCharacterMesh({
    sceneRef: sceneRef as React.MutableRefObject<BABYLON.Scene | null>,
    characterRef: characterRef as React.MutableRefObject<BABYLON.Mesh | null>,
    frustumCamerasRef,
    skeletonViewersRef,
    currentMeshPath,
    cameraMode,
    cameraProps,
    setAvailableBones,
    setCameraPositions,
    setBoundingBox,
    setMeshLoaded,
    setLoadedMeshId,
    currentProject,
    animationGroupsRef,
  });

  const updateLiveFeedViewport = useCallback(() => {
    if (!liveFeedCameraRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    console.log('Canvas dimensions:', canvas.clientWidth, 'x', canvas.clientHeight);

    const aspectRatio = canvas.clientWidth / canvas.clientHeight;
    const feedSizePixels = 200;

    let viewportWidth, viewportHeight;
    if (aspectRatio > 1) {
      viewportHeight = feedSizePixels / canvas.clientHeight;
      viewportWidth = feedSizePixels / canvas.clientWidth;
    } else {
      viewportWidth = feedSizePixels / canvas.clientWidth;
      viewportHeight = feedSizePixels / canvas.clientHeight;
    }

    console.log('Calculated viewport:', viewportWidth, 'x', viewportHeight);

    liveFeedCameraRef.current.viewport = new BABYLON.Viewport(
      0.0325,
      0.04,
      viewportWidth,
      viewportHeight
    );
    if (liveFeedRectangleRef.current) {
      liveFeedRectangleRef.current.widthInPixels = feedSizePixels * 1.1;
      liveFeedRectangleRef.current.heightInPixels = feedSizePixels * 1.1;
      liveFeedRectangleRef.current.leftInPixels = 0.025 * canvas.clientWidth;
      liveFeedRectangleRef.current.topInPixels = -(0.025 * canvas.clientHeight);
    }
  }, []);

  const updateLiveFeedImage = useCallback(() => {
    if (!sceneRef.current || !liveFeedCameraRef.current || frustumCamerasRef.current.length === 0)
      return;

    const liveFeedCamera = liveFeedCameraRef.current;
    const referenceCamera = frustumCamerasRef.current[activeCameraIndex];
    if (!liveFeedCamera || !referenceCamera) return;

    // Position the live feed camera to match the reference camera
    liveFeedCamera.position = referenceCamera.position.clone();

    if (referenceCamera.getViewMatrix) {
      const viewMatrix = referenceCamera.getViewMatrix();
      const worldMatrix = viewMatrix.clone().invert();
      const rotationQuaternion = new BABYLON.Quaternion();
      worldMatrix.decompose(undefined, rotationQuaternion);

      // Apply camera animation if enabled
      if (cameraProps.animateEachCamera) {
        // Animation cycle: 0=initial, 1=down, 2=right, 3=up, 4=left
        const animationOffset = new BABYLON.Vector3(0, 0, 0);
        const pixelOffset = 1; // 1 pixel offset

        switch (animationCycleRef.current) {
          case 1: // down
            animationOffset.y = -pixelOffset * 0.002; // Convert pixel to world space
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

        // Apply the offset to the rotation quaternion
        const offsetRotation = BABYLON.Quaternion.FromEulerAngles(
          animationOffset.x,
          animationOffset.y,
          animationOffset.z
        );
        rotationQuaternion.multiplyInPlace(offsetRotation);

        // Apply orthographic scale animation if using orthographic projection
        if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
          let scaleVariation = 1.0;
          switch (animationCycleRef.current) {
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

          // Keep base orthoScale to maintain mesh appearance
          // viewPadding will be applied during capture by increasing resolution
          const baseOrthoScale = cameraProps.orthoScale * scaleVariation;
          liveFeedCamera.orthoTop = baseOrthoScale;
          liveFeedCamera.orthoBottom = -baseOrthoScale;
          liveFeedCamera.orthoLeft = -baseOrthoScale;
          liveFeedCamera.orthoRight = baseOrthoScale;
        }
      }

      (liveFeedCamera as any).rotationQuaternion = rotationQuaternion;
    }

    for (let i = 0; i < frustumCamerasRef.current.length; i++) {
      const frustumMesh = sceneRef.current.getMeshByName(
        `frustumNearLines_${i}`
      ) as BABYLON.LinesMesh;
      if (frustumMesh) {
        if (i === activeCameraIndex) {
          (frustumMesh as any).color = new BABYLON.Color3(1, 1, 0);
          frustumMesh.edgesColor = new BABYLON.Color4(1, 1, 0, 1);
          frustumMesh.edgesWidth = 2.0;
        } else {
          (frustumMesh as any).color = BABYLON.Color3.Teal();
          frustumMesh.edgesColor = new BABYLON.Color4(0, 1, 0, 1);
          frustumMesh.edgesWidth = 1.2;
        }
      }
    }
  }, [activeCameraIndex, cameraProps]);

  useEffect(() => {
    updateLiveFeedImage();
    const interval = setInterval(updateLiveFeedImage, 100);

    return () => {
      clearInterval(interval);
    };
  }, [updateLiveFeedImage]);

  useEffect(() => {
    if (!liveFeedCameraRef.current) return;

    const liveFeedCamera = liveFeedCameraRef.current;
    liveFeedCamera.minZ = cameraProps.minZ;
    liveFeedCamera.maxZ = cameraProps.maxZ;

    if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
      liveFeedCamera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      // Keep base orthoScale to maintain mesh appearance
      // viewPadding will be applied during capture by increasing resolution
      const orthoScale = cameraProps.orthoScale;
      liveFeedCamera.orthoTop = orthoScale;
      liveFeedCamera.orthoBottom = -orthoScale;
      liveFeedCamera.orthoLeft = -orthoScale;
      liveFeedCamera.orthoRight = orthoScale;
    } else {
      liveFeedCamera.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
      liveFeedCamera.fov = BABYLON.Tools.ToRadians(cameraProps.fov);
    }
  }, [cameraProps]);

  async function handleLoadMesh() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'GLTF Files', extensions: ['gltf', 'glb'] }],
    });

    if (!selected) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      // Use the new importMesh method from project store
      const mesh = await importMesh(path);

      // Get the project path to construct full path for viewport loading
      const projectPath = useProjectStore.getState().projectPath;
      if (projectPath) {
        // Construct full path: projectPath + "/" + mesh.filePath
        const fullMeshPath = `${projectPath}/${mesh.filePath}`;
        setCurrentMeshPath(fullMeshPath);
      } else {
        // Fallback to original path if no project is loaded
        setCurrentMeshPath(path);
      }

      console.log('Mesh imported and added to project:', mesh);
    } catch (error) {
      console.error('Failed to import mesh:', error);
      await message(`Failed to import mesh: ${error}`, {
        title: 'Import Error',
        kind: 'error',
      });
    }
  }

  useSpriteEngine({
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
  });

  const { ref: containerRef } = useElementSize();

  const exportFormat = useAppStore((s) => s.exportFormat);

  const handleCapture = useCallback(async () => {
    if (exportFormat === 'gaussian-splat' && sceneRef.current) {
      // Gaussian splat export — save to project gsplat/ directory
      const scene = sceneRef.current;
      const engine = scene.getEngine() as BABYLON.Engine;

      const projectPath = useProjectStore.getState().projectPath;
      if (!projectPath) {
        await message('No project loaded. Save your project first.', { title: 'Error' });
        return;
      }
      const outputDir = `${projectPath}/gsplat`;

      setIsCapturing(true);
      setCaptureProgress({ frame: 0, totalFrames: 1 });

      try {
        const { cameraProps: cp } = useViewportStore.getState();
        const animGroup = scene.animationGroups.length > 0 ? scene.animationGroups[0] : null;
        const selectedAnim = useAnimationSettings.getState().getSelectedAnimation();

        // Resolve animation frame range
        const trimStart = selectedAnim?.trimStart ?? 0;
        const trimEnd = selectedAnim?.trimEnd ?? (selectedAnim?.totalFrames ?? 0);
        const frameRate = 30; // Default frame rate

        const { GaussianSplatCaptureStrategy } = await import('./modes/gaussian-splat-training/GaussianSplatCaptureStrategy');
        const strategy = new GaussianSplatCaptureStrategy();

        const config: GaussianSplatCaptureConfig = {
          outputDir,
          resolution: [cp.resolution[0], cp.resolution[1]] as [number, number],
          cameras: frustumCamerasRef.current,
          scene,
          engine,
          animationGroup: animGroup,
          frameCount: trimEnd - trimStart,
          trimStart,
          trimEnd,
          frameRate,
          outputFormat: 'nerf-synthetic',
          backgroundColor: useAppStore.getState().gsplatBackground,
          captureDepth: false,
        };

        const result = await CaptureOrchestrator.run(
          strategy,
          config,
          (current, total, phase) => {
            setCaptureProgress({ frame: current, totalFrames: total });
            console.log(phase);
          },
        );

        // Store the output path for training
        useAppStore.getState().setLastCaptureOutputPath(outputDir);

        await message(
          `Capture complete! ${result.totalFrames} images from ${result.totalCameras} cameras.\n\nSaved to: ${outputDir}\n\nArtifacts:\n${result.artifacts.map((a) => `  ${a.path} — ${a.description}`).join('\n')}`,
          { title: 'Success' },
        );
      } catch (error) {
        console.error('Capture error:', error);
        await message(`Capture failed: ${error}`, { title: 'Error' });
      } finally {
        setIsCapturing(false);
        setCaptureProgress(null);
      }
      return;
    }

    // Spritesheet / animation spritesheet — use existing capture hooks
    if (exportFormat === 'animation-spritesheet') {
      captureAnimationFrames();
    } else {
      captureSpritesheet();
    }
  }, [exportFormat, currentAnimation, captureAnimationFrames, captureSpritesheet]);

  // Register handleCapture in store so BottomBar can call it
  const setCaptureHandler = useAppStore((s) => s.setCaptureHandler);
  useEffect(() => {
    setCaptureHandler(handleCapture);
    return () => setCaptureHandler(null);
  }, [handleCapture, setCaptureHandler]);

  // Keep camera count in store for StatusBar — update when cameras change
  const currentCameraCount = frustumCamerasRef.current.length;
  useEffect(() => {
    setCameraCount(currentCameraCount);
  }, [currentCameraCount, setCameraCount]);
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      style={{ background: 'var(--viewport-bg)' }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Active camera index overlay */}
      {frustumCamerasRef.current.length > 0 && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/70 text-[11px] text-white font-mono tabular-nums z-10">
          cam {activeCameraIndex} / {frustumCamerasRef.current.length}
          {frustumCamerasRef.current[activeCameraIndex] && (() => {
            const p = frustumCamerasRef.current[activeCameraIndex].position;
            return <span className="text-fg-muted ml-2">({p.x.toFixed(1)}, {p.y.toFixed(1)}, {p.z.toFixed(1)})</span>;
          })()}
        </div>
      )}

      {/* Capture Progress Dialog — modal overlay, stays here */}
      {captureProgress && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div style={{ background: 'var(--panel-bg)', padding: '16px 24px', borderRadius: 6, minWidth: 250 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              Capturing...
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {captureProgress.frame} / {captureProgress.totalFrames}
            </div>
            <div style={{ height: 4, background: '#3a3a3a', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--accent)',
                  width: `${(captureProgress.frame / captureProgress.totalFrames) * 100}%`,
                  transition: 'width 0.1s',
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterViewport;
