import React, { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';
registerBuiltInLoaders();

import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';
import { BoneIKController } from '@babylonjs/core/Bones/boneIKController';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Helpers/sceneHelpers';

interface ArmBoneChain {
  shoulder?: BABYLON.Bone;
  upperArm?: BABYLON.Bone;
  forearm?: BABYLON.Bone;
  hand: BABYLON.Bone;
}

interface ArmIKControllers {
  forearmController?: BoneIKController;
  upperArmController?: BoneIKController;
  targetMesh: BABYLON.AbstractMesh;
  poleTargetMesh?: BABYLON.AbstractMesh;
  chain: ArmBoneChain;
}

const BIKFPSViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const xrExperienceRef = useRef<BABYLON.WebXRDefaultExperience | null>(null);

  const characterRootRef = useRef<BABYLON.AbstractMesh | null>(null);
  const skeletonRef = useRef<BABYLON.Skeleton | null>(null);
  const skeletonViewerRef = useRef<SkeletonViewer | null>(null);

  const leftControllerTargetRef = useRef<BABYLON.AbstractMesh | null>(null);
  const rightControllerTargetRef = useRef<BABYLON.AbstractMesh | null>(null);
  const leftPoleTargetRef = useRef<BABYLON.AbstractMesh | null>(null);
  const rightPoleTargetRef = useRef<BABYLON.AbstractMesh | null>(null);

  const leftIKRef = useRef<ArmIKControllers | null>(null);
  const rightIKRef = useRef<ArmIKControllers | null>(null);
  
  const spectatorCameraRef = useRef<BABYLON.FreeCamera | null>(null);

  const [status, setStatus] = useState<string>('Idle');
  const [vrInitialized, setVrInitialized] = useState<boolean>(false);
  const [vrActive, setVrActive] = useState<boolean>(false);
  const [skeletonVisible, setSkeletonVisible] = useState<boolean>(true);
  const [spectatorHeight, setSpectatorHeight] = useState<number>(2);
  const [spectatorDistance, setSpectatorDistance] = useState<number>(-3);

  // Update spectator camera when controls change
  useEffect(() => {
    if (spectatorCameraRef.current && characterRootRef.current && vrActive) {
      const charPos = characterRootRef.current.position;
      spectatorCameraRef.current.position = new BABYLON.Vector3(
        charPos.x,
        charPos.y + spectatorHeight,
        charPos.z + spectatorDistance
      );
      spectatorCameraRef.current.setTarget(charPos);
    }
  }, [spectatorHeight, spectatorDistance, vrActive]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BABYLON.Engine(canvasRef.current, true);
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    sceneRef.current = scene;

    const camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 1.6, -3), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvasRef.current, true);
    
    // Create spectator camera for VR mode
    const spectatorCamera = new BABYLON.FreeCamera('spectatorCamera', new BABYLON.Vector3(0, 2, -3), scene);
    spectatorCamera.setTarget(BABYLON.Vector3.Zero());
    spectatorCamera.attachControl(canvasRef.current, false); // Allow manual control
    spectatorCameraRef.current = spectatorCamera;

    const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
    const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    ground.material = groundMat;

    engine.runRenderLoop(() => {
      if (scene) {
        updateIKControllers();
        scene.render();
      }
    });

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    };
  }, []);

  async function initializeVR() {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      const xrHelper = await scene.createDefaultXRExperienceAsync({
        disableTeleportation: true,
      });

      xrExperienceRef.current = xrHelper;
      setVrInitialized(true);

      xrHelper.input.onControllerAddedObservable.add(controller => {
        controller.onMotionControllerInitObservable.add(motionController => {
          const handedness = motionController.handedness;
          console.log(`${handedness} controller connected`);
          setStatus(`${handedness} controller connected`);

          if (handedness === 'left') {
            setupControllerTracking(controller, 'left', scene);
          } else if (handedness === 'right') {
            setupControllerTracking(controller, 'right', scene);
          }
          
          if (skeletonRef.current && characterRootRef.current) {
            setupIKForHands();
          }
        });
      });

      xrHelper.baseExperience.onStateChangedObservable.add(state => {
        console.log('XR State:', BABYLON.WebXRState[state]);
        
        if (state === BABYLON.WebXRState.IN_XR) {
          setVrActive(true);
          setStatus('In VR - Spectator view active');
          
          // Switch to spectator camera for desktop view
          if (scene.activeCamera !== spectatorCameraRef.current) {
            scene.activeCamera = spectatorCameraRef.current;
          }
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          setVrActive(false);
          setStatus('VR Exited');
        }
      });

      console.log('VR initialized');
      setStatus('VR Ready - Click Start VR');
    } catch (error) {
      console.error('VR init failed:', error);
      setStatus(`VR failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  function setupControllerTracking(controller: BABYLON.WebXRInputSource, hand: 'left' | 'right', scene: BABYLON.Scene) {
    // Get the controller's grip position (handle position)
    const grip = controller.grip;
    if (!grip) return;

    // Create or update IK target for this hand
    const targetName = `${hand}HandTarget`;
    let target = scene.getMeshByName(targetName) as BABYLON.Mesh;

    if (!target) {
      // Create a visual indicator for the IK target
      target = BABYLON.MeshBuilder.CreateSphere(targetName, { diameter: 0.1 }, scene);
      const mat = new BABYLON.StandardMaterial(`${hand}Mat`, scene);
      mat.emissiveColor = hand === 'left' ? new BABYLON.Color3(0, 2, 0) : new BABYLON.Color3(2, 0, 0);
      mat.disableLighting = true;
      target.material = mat;

      if (hand === 'left') {
        leftControllerTargetRef.current = target;
      } else {
        rightControllerTargetRef.current = target;
      }
      
      console.log(`${hand} controller target created`);
    }

    // Update target position to match controller every frame
    scene.onBeforeRenderObservable.add(() => {
      if (grip && target) {
        target.position.copyFrom(grip.absolutePosition);
        target.rotationQuaternion = grip.absoluteRotationQuaternion?.clone() || null;
      }
    });
  }

  async function handleLoadMesh() {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLB Files', extensions: ['glb'] }],
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', convertFileSrc(path), scene);

      const skinned = result.meshes.find(m => m.skeleton) as BABYLON.AbstractMesh | undefined;
      if (!skinned || !skinned.skeleton) {
        setStatus('No skeleton found');
        return;
      }

      characterRootRef.current = result.meshes[0];
      const skeleton = result.skeletons[0];
      skeletonRef.current = skeleton;

      console.log('Character loaded. Bones:', skeleton.bones.length);

      result.meshes.forEach(mesh => {
        if (mesh.skeleton) {
          mesh.computeBonesUsingShaders = false;
          console.log(`CPU skinning enabled: ${mesh.name}`);
        }
      });

      const skeletonViewer = new SkeletonViewer(skeleton, result.meshes[0], scene, false, 3, {
        displayMode: SkeletonViewer.DISPLAY_LINES,
      });
      skeletonViewerRef.current = skeletonViewer;
      skeletonViewer.isEnabled = skeletonVisible;

      setStatus('Character loaded - Setup IK if VR controllers available');

      if (leftControllerTargetRef.current && rightControllerTargetRef.current) {
        setupIKForHands();
      }
    } catch (error) {
      console.error('Load failed:', error);
      setStatus(`Load failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  function findBone(skeleton: BABYLON.Skeleton, patterns: string[]): BABYLON.Bone | undefined {
    return skeleton.bones.find(b => {
      const lowerName = b.name.toLowerCase();
      return patterns.some(pattern => lowerName.includes(pattern.toLowerCase()));
    });
  }

  function getArmChain(skeleton: BABYLON.Skeleton, side: 'left' | 'right'): ArmBoneChain | null {
    const sidePatterns = side === 'left' ? ['left', 'l_', '.l', '_l_'] : ['right', 'r_', '.r', '_r_'];

    const shoulder = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}shoulder`),
      ...sidePatterns.map(s => `${s}clavicle`),
    ]);

    const upperArm = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}upperarm`),
      ...sidePatterns.map(s => `${s}uparm`),
      ...sidePatterns.map(s => `${s}arm`),
    ]);

    const forearm = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}forearm`),
      ...sidePatterns.map(s => `${s}lowerarm`),
      ...sidePatterns.map(s => `${s}loarm`),
    ]);

    const hand = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}hand`),
      ...sidePatterns.map(s => `${s}wrist`),
    ]);

    if (!hand) return null;

    return { shoulder, upperArm, forearm, hand };
  }

  function setupBoneIKChain(
    armChain: ArmBoneChain,
    targetMesh: BABYLON.AbstractMesh,
    poleTargetMesh: BABYLON.AbstractMesh | undefined,
    side: 'left' | 'right'
  ): ArmIKControllers | null {
    const mesh = characterRootRef.current;
    if (!mesh) return null;

    console.log(`\n=== Setting up ${side} arm BoneIK chain ===`);
    console.log('Chain:', {
      shoulder: armChain.shoulder?.name,
      upperArm: armChain.upperArm?.name,
      forearm: armChain.forearm?.name,
      hand: armChain.hand.name,
    });

    let forearmController: BoneIKController | undefined;
    let upperArmController: BoneIKController | undefined;

    if (armChain.forearm && armChain.hand) {
      console.log(`Creating forearm→hand controller`);
      forearmController = new BoneIKController(mesh, armChain.hand, {
        targetMesh: targetMesh,
        poleTargetMesh: poleTargetMesh,
        poleAngle: Math.PI * 0.5,
        bendAxis: BABYLON.Vector3.Forward(),
        maxAngle: Math.PI,
      });
      console.log(`✓ Forearm controller created`);
    }

    if (armChain.upperArm && armChain.forearm) {
      const tempTarget = BABYLON.MeshBuilder.CreateSphere(
        `${side}ElbowTarget`,
        { diameter: 0.01 },
        sceneRef.current!
      );
      tempTarget.isVisible = false;

      console.log(`Creating upperArm→forearm controller`);
      upperArmController = new BoneIKController(mesh, armChain.forearm, {
        targetMesh: tempTarget,
        poleTargetMesh: undefined,
        poleAngle: Math.PI * 0.5,
        bendAxis: BABYLON.Vector3.Forward(),
        maxAngle: Math.PI,
      });
      console.log(`✓ UpperArm controller created`);
    }

    return {
      forearmController,
      upperArmController,
      targetMesh,
      poleTargetMesh,
      chain: armChain,
    };
  }

  function updateIKControllers() {
    // Left arm IK
    if (leftIKRef.current && leftControllerTargetRef.current) {
      const ikData = leftIKRef.current;
      ikData.targetMesh.position.copyFrom(leftControllerTargetRef.current.position);

      if (ikData.forearmController) {
        ikData.forearmController.update();
      }

      if (ikData.upperArmController && ikData.chain.forearm) {
        const elbowTarget = ikData.upperArmController.targetMesh;
        const forearmPos = ikData.chain.forearm.getAbsolutePosition();
        elbowTarget.position.copyFrom(forearmPos);
        ikData.upperArmController.update();
      }
      
      // Update pole target to follow elbow
      if (leftPoleTargetRef.current && ikData.chain.forearm) {
        const elbowPos = ikData.chain.forearm.getAbsolutePosition();
        leftPoleTargetRef.current.position.copyFrom(elbowPos);
      }
    }

    // Right arm IK
    if (rightIKRef.current && rightControllerTargetRef.current) {
      const ikData = rightIKRef.current;
      ikData.targetMesh.position.copyFrom(rightControllerTargetRef.current.position);

      if (ikData.forearmController) {
        ikData.forearmController.update();
      }

      if (ikData.upperArmController && ikData.chain.forearm) {
        const elbowTarget = ikData.upperArmController.targetMesh;
        const forearmPos = ikData.chain.forearm.getAbsolutePosition();
        elbowTarget.position.copyFrom(forearmPos);
        ikData.upperArmController.update();
      }
      
      // Update pole target to follow elbow
      if (rightPoleTargetRef.current && ikData.chain.forearm) {
        const elbowPos = ikData.chain.forearm.getAbsolutePosition();
        rightPoleTargetRef.current.position.copyFrom(elbowPos);
      }
    }
  }

  function setupIKForHands() {
    const scene = sceneRef.current;
    const character = characterRootRef.current;
    const skeleton = skeletonRef.current;

    if (!scene || !character || !skeleton) return;

    console.log('\n=== Setting up BoneIK for both arms ===');

    if (!leftPoleTargetRef.current) {
      const leftPole = BABYLON.MeshBuilder.CreateSphere('leftPole', { diameter: 0.1 }, scene);
      const mat = new BABYLON.StandardMaterial('leftPoleMat', scene);
      mat.emissiveColor = new BABYLON.Color3(0, 1, 2);
      mat.disableLighting = true;
      leftPole.material = mat;
      leftPoleTargetRef.current = leftPole;
    }

    if (!rightPoleTargetRef.current) {
      const rightPole = BABYLON.MeshBuilder.CreateSphere('rightPole', { diameter: 0.1 }, scene);
      const mat = new BABYLON.StandardMaterial('rightPoleMat', scene);
      mat.emissiveColor = new BABYLON.Color3(2, 1, 0);
      mat.disableLighting = true;
      rightPole.material = mat;
      rightPoleTargetRef.current = rightPole;
    }

    const leftArm = getArmChain(skeleton, 'left');
    const rightArm = getArmChain(skeleton, 'right');

    if (leftArm && leftControllerTargetRef.current) {
      const ikData = setupBoneIKChain(
        leftArm,
        leftControllerTargetRef.current,
        leftPoleTargetRef.current,
        'left'
      );
      if (ikData) {
        leftIKRef.current = ikData;
        console.log('✓ Left arm IK setup complete');
        setStatus(prev => prev + ' | Left BoneIK ✓');
      }
    }

    if (rightArm && rightControllerTargetRef.current) {
      const ikData = setupBoneIKChain(
        rightArm,
        rightControllerTargetRef.current,
        rightPoleTargetRef.current,
        'right'
      );
      if (ikData) {
        rightIKRef.current = ikData;
        console.log('✓ Right arm IK setup complete');
        setStatus(prev => prev + ' | Right BoneIK ✓');
      }
    }

    console.log('=== BoneIK setup complete ===\n');
  }

  function toggleSkeleton() {
    if (skeletonViewerRef.current) {
      skeletonViewerRef.current.isEnabled = !skeletonVisible;
      setSkeletonVisible(!skeletonVisible);
    }
  }

  async function startVR() {
    const xr = xrExperienceRef.current;
    if (!xr) return;

    try {
      await xr.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
      setStatus('Entering VR...');
    } catch (error) {
      console.error('Failed to enter VR:', error);
      setStatus(`VR start failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />

      {vrActive && (
        <div className="absolute top-4 right-4 bg-green-900/90 px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2 text-green-200 text-sm font-semibold">
            <div className="w-3 h-3 bg-green-300 rounded-full animate-pulse"></div>
            VR Active - Spectator View
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4 bg-black/80 p-3 rounded-lg shadow-lg">
        <div className="text-white text-sm font-bold mb-2">BoneIK Test Viewport</div>
        <div className="text-white/80 text-xs mb-3">{status}</div>

        <div className="space-y-2">
          <button
            onClick={initializeVR}
            disabled={vrInitialized}
            className={`${
              vrInitialized ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'
            } text-white rounded px-3 py-2 text-sm w-full transition-colors`}
          >
            {vrInitialized ? 'VR Ready ✓' : 'Initialize VR'}
          </button>

          <button
            onClick={startVR}
            disabled={!vrInitialized || vrActive}
            className={`${
              !vrInitialized || vrActive
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700'
            } text-white rounded px-3 py-2 text-sm w-full transition-colors`}
          >
            {vrActive ? 'VR Running' : 'Start VR'}
          </button>

          <button
            onClick={handleLoadMesh}
            className="bg-green-600 hover:bg-green-700 text-white rounded px-3 py-2 text-sm w-full transition-colors"
          >
            Load Rigged Mesh
          </button>

          <button
            onClick={toggleSkeleton}
            className="bg-yellow-600 hover:bg-yellow-700 text-white rounded px-3 py-2 text-sm w-full transition-colors"
          >
            Toggle Skeleton: {skeletonVisible ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-white/20 text-white/70 text-xs">
          <div>Uses chained BoneIKController</div>
          <div>Forearm→Hand + UpperArm→Forearm</div>
        </div>

        {vrActive && (
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="text-white text-xs font-semibold mb-2">Spectator Camera</div>
            <div className="space-y-2">
              <div>
                <label className="text-white/80 text-xs">Height: {spectatorHeight.toFixed(1)}m</label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={spectatorHeight}
                  onChange={e => setSpectatorHeight(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-white/80 text-xs">Distance: {spectatorDistance.toFixed(1)}m</label>
                <input
                  type="range"
                  min="-5"
                  max="-1"
                  step="0.1"
                  value={spectatorDistance}
                  onChange={e => setSpectatorDistance(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {characterRootRef.current && (
        <div className="absolute bottom-4 left-4 bg-black/70 p-2 rounded text-white/70 text-xs">
          <div>Character: {characterRootRef.current.name}</div>
          <div>Bones: {skeletonRef.current?.bones.length || 0}</div>
          <div>
            IK Active: L: {leftIKRef.current ? '✓' : '✗'} R: {rightIKRef.current ? '✓' : '✗'}
          </div>
        </div>
      )}
    </div>
  );
};

export default BIKFPSViewport;
