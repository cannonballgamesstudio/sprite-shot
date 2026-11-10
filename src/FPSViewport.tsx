import React, { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic';
registerBuiltInLoaders();

import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';
import '@babylonjs/core/Materials/standardMaterial';
import '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Helpers/sceneHelpers';
import '@babylonjs/inspector';
import * as IK from 'ikts';

interface ArmBoneChain {
  shoulder?: BABYLON.Bone;
  upperArm?: BABYLON.Bone;
  forearm?: BABYLON.Bone;
  hand: BABYLON.Bone;
}

interface IKSolverData {
  ikChain: any; // IK.Chain3D
  armChain: ArmBoneChain;
  babylonBones: BABYLON.Bone[];
  target: any; // IK.V3
  totalArmLength: number; // Cached at initialization
}

const FPSViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const xrExperienceRef = useRef<BABYLON.WebXRDefaultExperience | null>(null);

  // Character references
  const characterRootRef = useRef<BABYLON.AbstractMesh | null>(null);
  const skeletonRef = useRef<BABYLON.Skeleton | null>(null);
  const skeletonViewerRef = useRef<SkeletonViewer | null>(null);

  // IK solver references
  const leftIKSolverRef = useRef<IKSolverData | null>(null);
  const rightIKSolverRef = useRef<IKSolverData | null>(null);
  const leftControllerTargetRef = useRef<BABYLON.AbstractMesh | null>(null);
  const rightControllerTargetRef = useRef<BABYLON.AbstractMesh | null>(null);
  const leftPoleTargetRef = useRef<BABYLON.Mesh | null>(null);
  const rightPoleTargetRef = useRef<BABYLON.Mesh | null>(null);
  const leftControllerRef = useRef<BABYLON.WebXRInputSource | null>(null);
  const rightControllerRef = useRef<BABYLON.WebXRInputSource | null>(null);

  // Camera references
  const vrCameraRef = useRef<BABYLON.WebXRCamera | null>(null);
  const fallbackCameraRef = useRef<BABYLON.FreeCamera | null>(null);
  const staticFPSCameraRef = useRef<BABYLON.FreeCamera | null>(null);
  const spectatorCameraRef = useRef<BABYLON.FreeCamera | null>(null);

  // Gizmo reference
  const gizmoManagerRef = useRef<BABYLON.GizmoManager | null>(null);

  const [status, setStatus] = useState<string>('Idle');
  const [vrSupported, setVrSupported] = useState<boolean>(false);
  const [vrInitialized, setVrInitialized] = useState<boolean>(false);
  const [skeletonVisible, setSkeletonVisible] = useState<boolean>(true);
  const [cameraDistance, setCameraDistance] = useState<number>(0);
  const [spectatorFeedActive, setSpectatorFeedActive] = useState<boolean>(false);
  const [spectatorDistance, setSpectatorDistance] = useState<number>(-3);
  const [poleTargetsVisible, setPoleTargetsVisible] = useState<boolean>(true);
  const [poleOffsetX, setPoleOffsetX] = useState<number>(0.2);
  const [poleOffsetY, setPoleOffsetY] = useState<number>(0.1);
  const [poleOffsetZ, setPoleOffsetZ] = useState<number>(0.3);
  const poleOffsetXRef = useRef<number>(0.2);
  const poleOffsetYRef = useRef<number>(0.1);
  const poleOffsetZRef = useRef<number>(0.3);
  const [armLengthScale, setArmLengthScale] = useState<number>(1.0);
  const [, setCharacterCentered] = useState<boolean>(false);
  const [characterPosX, setCharacterPosX] = useState<number>(0);
  const [characterPosY, setCharacterPosY] = useState<number>(0);
  const [characterPosZ, setCharacterPosZ] = useState<number>(0);

  // Center character at VR camera position
  function centerCharacterAtVRPosition() {
    const vrCamera = vrCameraRef.current;
    const character = characterRootRef.current;

    if (vrCamera && character) {
      const cameraPos = vrCamera.position.clone();
      cameraPos.y = 0; // Keep character on ground
      character.position.copyFrom(cameraPos);
      setCharacterCentered(true);
      setStatus('Character centered at your position');
      console.log(
        `Character positioned at: (${cameraPos.x.toFixed(2)}, ${cameraPos.y.toFixed(2)}, ${cameraPos.z.toFixed(2)})`
      );
    }
  }

  // T-Pose calibration
  function calibrateTPose() {
    const character = characterRootRef.current;
    const skeleton = skeletonRef.current;
    const leftController = leftControllerTargetRef.current;
    const rightController = rightControllerTargetRef.current;
    const vrCamera = vrCameraRef.current;

    if (!character || !skeleton || !leftController || !rightController || !vrCamera) {
      setStatus('Missing character, skeleton, or controllers for calibration');
      return;
    }

    const leftArm = getArmChain(skeleton, 'left');
    const rightArm = getArmChain(skeleton, 'right');

    if (!leftArm.shoulder || !rightArm.shoulder || !leftArm.hand || !rightArm.hand) {
      setStatus('Could not find arm bones for calibration');
      return;
    }

    const userArmSpan = leftController.absolutePosition
      .subtract(rightController.absolutePosition)
      .length();

    const leftShoulderPos = leftArm.shoulder.getAbsolutePosition();
    const rightShoulderPos = rightArm.shoulder.getAbsolutePosition();
    const leftHandPos = leftArm.hand.getAbsolutePosition();
    const rightHandPos = rightArm.hand.getAbsolutePosition();

    const characterArmSpan = leftHandPos.subtract(rightHandPos).length();

    const scale = userArmSpan / characterArmSpan;
    character.scaling = new BABYLON.Vector3(scale, scale, scale);

    const controllerMidpoint = leftController.absolutePosition
      .add(rightController.absolutePosition)
      .scale(0.5);
    const shoulderMidpoint = leftShoulderPos.add(rightShoulderPos).scale(0.5);

    const offset = controllerMidpoint.subtract(shoulderMidpoint);
    character.position.addInPlace(offset);

    setArmLengthScale(1.0);

    setStatus(
      `T-Pose Calibrated! Scale: ${scale.toFixed(2)}x, Arm span: ${userArmSpan.toFixed(2)}m`
    );
    console.log(
      `User arm span: ${userArmSpan.toFixed(2)}m, Character arm span: ${characterArmSpan.toFixed(2)}m`
    );
    console.log(`Scale applied: ${scale.toFixed(2)}x`);
    console.log(`Character positioned at shoulders`);
  }

  // Initialize Babylon.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BABYLON.Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true;
    sceneRef.current = scene;
    scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.1, 1);

    // Create fallback camera for non-VR debugging
    const fallbackCamera = new BABYLON.FreeCamera(
      'fallbackCamera',
      new BABYLON.Vector3(0, 1.6, -3),
      scene
    );
    fallbackCamera.setTarget(new BABYLON.Vector3(0, 1.5, 0));
    fallbackCamera.attachControl(canvasRef.current, true);
    fallbackCameraRef.current = fallbackCamera;

    // Create static FPS camera for rendering and screenshots
    const staticFPSCamera = new BABYLON.FreeCamera(
      'staticFPSCamera',
      new BABYLON.Vector3(0, 1.6, 0),
      scene
    );
    staticFPSCamera.setTarget(new BABYLON.Vector3(0, 1.6, 5));
    staticFPSCameraRef.current = staticFPSCamera;
    scene.activeCamera = staticFPSCamera; // Use static camera for screen rendering

    // Create spectator camera for desktop preview during VR
    const spectatorCamera = new BABYLON.FreeCamera(
      'spectatorCamera',
      new BABYLON.Vector3(0, 2, -3),
      scene
    );
    spectatorCamera.setTarget(new BABYLON.Vector3(0, 1, 0));
    spectatorCameraRef.current = spectatorCamera;

    // Add WASD fly controls to spectator camera
    spectatorCamera.minZ = 0.001;
    spectatorCamera.fov = BABYLON.Tools.ToRadians(100);
    spectatorCamera.fovMode = BABYLON.Constants.FOVMODE_VERTICAL_FIXED;
    spectatorCamera.keysUp = [87]; // W
    spectatorCamera.keysDown = [83]; // S
    spectatorCamera.keysLeft = [65]; // A
    spectatorCamera.keysRight = [68]; // D
    spectatorCamera.keysUpward = [69]; // E (fly up)
    spectatorCamera.keysDownward = [81]; // Q (fly down)
    spectatorCamera.keysRotateLeft = [37]; // Left Arrow (turn left)
    spectatorCamera.keysRotateRight = [39]; // Right Arrow (turn right)
    spectatorCamera.keysRotateUp = [38]; // Up Arrow (turn up)
    spectatorCamera.keysRotateDown = [40]; // Down Arrow (turn down)
    spectatorCamera.speed = 0.1;
    spectatorCamera.angularSensibility = 10000; // Higher = less sensitive (default is 2000)
    spectatorCamera.attachControl(canvasRef.current, false);

    // Lighting
    const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.7;
    const dirLight = new BABYLON.DirectionalLight(
      'dirLight',
      new BABYLON.Vector3(-1, -2, -1),
      scene
    );
    dirLight.intensity = 0.5;

    // Ground plane for reference
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
    const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    ground.material = groundMat;

    // Add some visual reference objects
    const box = BABYLON.MeshBuilder.CreateBox('box', { size: 0.5 }, scene);
    box.position = new BABYLON.Vector3(0, 0.25, 2);
    const boxMat = new BABYLON.StandardMaterial('boxMat', scene);
    boxMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    box.material = boxMat;

    engine.runRenderLoop(() => {
      if (scene) {
        // Update IK solvers before rendering
        updateIKSolvers();
        scene.render();
      }
    });

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    // Check for VR support
    checkVRSupport();

    return () => {
      console.log('FPSViewport cleanup: stopping render loop');
      window.removeEventListener('resize', onResize);

      // Stop render loop before disposing
      engine.stopRenderLoop();

      // Cleanup XR
      if (xrExperienceRef.current) {
        try {
          xrExperienceRef.current.baseExperience.dispose();
        } catch (e) {
          console.error('Error disposing XR:', e);
        }
      }

      // Dispose scene and engine
      if (scene) {
        scene.dispose();
      }
      engine.dispose();

      console.log('FPSViewport cleanup: complete');
    };
  }, []);

  // Check VR support and initialize
  async function checkVRSupport() {
    try {
      const supported = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
      setVrSupported(supported);
      if (supported) {
        setStatus('VR supported - Click "Enter VR" to start');
      } else {
        setStatus('VR not supported on this device');
      }
    } catch (error) {
      console.error('VR check failed:', error);
      setStatus('VR check failed');
      setVrSupported(false);
    }
  }

  // Initialize VR experience
  async function initializeVR() {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      setStatus('Initializing VR...');
      console.log('Starting VR initialization...');

      const xrHelper = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
          sessionMode: 'immersive-vr',
        },
        inputOptions: {
          doNotLoadControllerMeshes: false,
        },
      });

      console.log('XR Helper created:', xrHelper);
      xrExperienceRef.current = xrHelper;
      vrCameraRef.current = xrHelper.baseExperience.camera;

      // Position VR camera at head height
      xrHelper.baseExperience.camera.position = new BABYLON.Vector3(0, 1.6, -2);

      // Handle controller input
      xrHelper.input.onControllerAddedObservable.add(controller => {
        controller.onMotionControllerInitObservable.add(motionController => {
          const handedness = motionController.handedness;
          console.log(`${handedness} controller connected`);
          setStatus(`${handedness} controller connected`);

          // Assign controllers to correct handedness
          if (handedness === 'left') {
            leftControllerRef.current = controller;
            setupControllerTracking(controller, 'left');
          } else if (handedness === 'right') {
            rightControllerRef.current = controller;
            setupControllerTracking(controller, 'right');

            const aButton = motionController.getComponent('a-button');
            if (aButton) {
              aButton.onButtonStateChangedObservable.add(component => {
                if (component.pressed) {
                  console.log('A button pressed - Running T-Pose calibration');
                  calibrateTPose();
                }
              });
            }
          }
        });
      });

      xrHelper.baseExperience.onStateChangedObservable.add(state => {
        console.log('XR State changed:', BABYLON.WebXRState[state]);

        if (state === BABYLON.WebXRState.IN_XR) {
          setStatus('In VR - Desktop shows spectator view (WASD to fly)');
          // Keep desktop canvas on spectator camera (VR headset renders independently)
          if (spectatorCameraRef.current && canvasRef.current) {
            scene.activeCamera = spectatorCameraRef.current;
          }
          setSpectatorFeedActive(true);
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          setStatus('Exited VR');
          // Switch back to static FPS camera when exiting VR
          if (staticFPSCameraRef.current) {
            scene.activeCamera = staticFPSCameraRef.current;
          }
          setSpectatorFeedActive(false);
        }
      });

      setVrInitialized(true);
      setStatus('VR initialized - Click "Enter VR" button to start');
      console.log('VR Helper initialized successfully. Click Enter VR button.');
    } catch (error) {
      console.error('VR initialization failed:', error);
      setStatus(
        `VR initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Manual VR entry function
  async function enterVRManually() {
    const xrHelper = xrExperienceRef.current;
    if (!xrHelper) {
      setStatus('VR not initialized. Click "Initialize VR" first.');
      return;
    }

    try {
      setStatus('Entering VR...');
      console.log('Manually entering VR...');
      await xrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
      console.log('Successfully entered VR');
    } catch (error) {
      console.error('Failed to enter VR:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Check for common errors
      if (errorMsg.includes('already an active')) {
        setStatus('⚠️ Exit SteamVR Home first (System button → Exit), then try again');
      } else if (errorMsg.includes('user gesture')) {
        setStatus('Click "Enter VR" button again (user gesture required)');
      } else {
        setStatus(`Failed to enter VR: ${errorMsg}`);
      }
    }
  }

  // Setup controller tracking for IK
  function setupControllerTracking(controller: BABYLON.WebXRInputSource, hand: 'left' | 'right') {
    const scene = sceneRef.current;
    if (!scene) return;

    // Get the controller's grip position (handle position)
    const grip = controller.grip;

    if (!grip) return;

    // Create or update IK target for this hand
    const targetName = `${hand}HandTarget`;
    let target = scene.getMeshByName(targetName) as BABYLON.Mesh;

    if (!target) {
      // Create a visual indicator for the IK target
      target = BABYLON.MeshBuilder.CreateSphere(targetName, { diameter: 0.05 }, scene);
      const mat = new BABYLON.StandardMaterial(`${hand}Mat`, scene);
      mat.emissiveColor =
        hand === 'left' ? new BABYLON.Color3(0, 1, 0) : new BABYLON.Color3(1, 0, 0);
      target.material = mat;

      if (hand === 'left') {
        leftControllerTargetRef.current = target;
      } else {
        rightControllerTargetRef.current = target;
      }
    }

    // Update target position to match controller every frame
    scene.onBeforeRenderObservable.add(() => {
      if (grip && target) {
        target.position.copyFrom(grip.absolutePosition);

        const controllerMesh = grip.getChildMeshes()[0];
        if (controllerMesh) {
          target.rotationQuaternion = controllerMesh.absoluteRotationQuaternion.clone();
        } else {
          target.rotationQuaternion = grip.absoluteRotationQuaternion?.clone() || null;
        }
      }

      // IK update is now handled in the main render loop
    });
  }

  // Load rigged mesh
  async function handleLoadMesh() {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clean up existing character
    if (characterRootRef.current) {
      characterRootRef.current.dispose();
    }
    if (skeletonViewerRef.current) {
      skeletonViewerRef.current.dispose();
      skeletonViewerRef.current = null;
    }
    leftIKSolverRef.current = null;
    rightIKSolverRef.current = null;

    try {
      setStatus('Loading mesh...');

      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLTF Files', extensions: ['gltf', 'glb'] }],
      });
      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', convertFileSrc(path), scene);

      // Find first mesh with a skeleton
      const skinned = result.meshes.find(m => m.skeleton) as BABYLON.AbstractMesh | undefined;
      if (!skinned || !skinned.skeleton) {
        setStatus('No skeleton found on loaded mesh');
        return;
      }

      characterRootRef.current = result.meshes[0];
      const skeleton = result.skeletons[0];
      skeletonRef.current = skeleton;

      console.log('Character loaded. Bones:', skeleton.bones.length);

      // Force CPU skinning on all meshes
      result.meshes.forEach(mesh => {
        if (mesh.skeleton) {
          mesh.computeBonesUsingShaders = false;
          console.log(`Enabled CPU skinning for mesh: ${mesh.name}`);
        }
      });

      // Create skeleton viewer for debugging
      const skeletonViewer = new SkeletonViewer(skeleton, result.meshes[0], scene, false, 3, {
        displayMode: SkeletonViewer.DISPLAY_LINES,
      });
      skeletonViewerRef.current = skeletonViewer;
      skeletonViewer.isEnabled = skeletonVisible;

      // Create gizmo manager for moving the character
      if (!gizmoManagerRef.current) {
        const gizmoManager = new BABYLON.GizmoManager(scene);
        gizmoManager.positionGizmoEnabled = true;
        gizmoManager.rotationGizmoEnabled = false;
        gizmoManager.scaleGizmoEnabled = false;
        gizmoManager.boundingBoxGizmoEnabled = false;

        // Ensure gizmo utility layer uses the active camera
        if (gizmoManager.utilityLayer) {
          gizmoManager.utilityLayer.utilityLayerScene.activeCamera = scene.activeCamera;
        }

        gizmoManager.attachToMesh(characterRootRef.current);
        gizmoManagerRef.current = gizmoManager;
        console.log('Gizmo manager attached to character');
      }

      setStatus('Mesh loaded - Setup IK for hands');

      // Log bones for debugging
      console.log(
        'Available bones:',
        skinned.skeleton.bones.map((b, i) => `${i}: ${b.name}`)
      );

      // Setup IK if controllers are available
      setupIKForHands();
    } catch (error) {
      console.error('Load failed:', error);
      setStatus('Load failed');
    }
  }
  function setupIKForHands() {
    const scene = sceneRef.current;
    const character = characterRootRef.current;
    const skeleton = skeletonRef.current;

    if (!scene || !character || !skeleton) return;

    console.log('Setting up IK for full arm chains...');
    console.log(
      'Available bones:',
      skeleton.bones.map((b, i) => `${i}: ${b.name}`)
    );

    // Create pole target meshes at elbow positions
    if (!leftPoleTargetRef.current) {
      const leftPole = BABYLON.MeshBuilder.CreateSphere(
        'leftPoleTarget',
        { diameter: 0.15 },
        scene
      );
      const poleMat = new BABYLON.StandardMaterial('leftPoleMat', scene);
      poleMat.emissiveColor = new BABYLON.Color3(0, 1, 2); // Bright blue
      poleMat.disableLighting = true; // Always bright
      leftPole.material = poleMat;
      leftPole.isVisible = false;
      leftPole.renderingGroupId = 1; // Render on top
      leftPoleTargetRef.current = leftPole;
      console.log('Left pole target created with diameter 0.15');
    }

    if (!rightPoleTargetRef.current) {
      const rightPole = BABYLON.MeshBuilder.CreateSphere(
        'rightPoleTarget',
        { diameter: 0.15 },
        scene
      );
      const poleMat = new BABYLON.StandardMaterial('rightPoleMat', scene);
      poleMat.emissiveColor = new BABYLON.Color3(2, 1, 0); // Bright orange
      poleMat.disableLighting = true;
      rightPole.material = poleMat;
      rightPole.isVisible = false;
      rightPole.renderingGroupId = 1;
      rightPoleTargetRef.current = rightPole;
      console.log('Right pole target created with diameter 0.15');
    }

    // Get left arm chain
    const leftArm = getArmChain(skeleton, 'left');
    console.log('Left arm chain:', {
      shoulder: leftArm.shoulder?.name,
      upperArm: leftArm.upperArm?.name,
      forearm: leftArm.forearm?.name,
      hand: leftArm.hand?.name,
    });

    // Initial position will be set in update loop
    console.log('Left pole target created, will position dynamically');

    // Get right arm chain
    const rightArm = getArmChain(skeleton, 'right');
    console.log('Right arm chain:', {
      shoulder: rightArm.shoulder?.name,
      upperArm: rightArm.upperArm?.name,
      forearm: rightArm.forearm?.name,
      hand: rightArm.hand?.name,
    });

    // Initial position will be set in update loop
    console.log('Right pole target created, will position dynamically');

    // Create global IK structure
    const ikStructure = new (IK as any).Structure3D();

    // Setup left arm IK with IKTS
    if (leftArm.hand && leftControllerTargetRef.current) {
      const ikData = setupIKTSChain(leftArm, 'left');
      if (ikData) {
        leftIKSolverRef.current = ikData;
        // Add chain to structure with its target
        ikStructure.add(ikData.ikChain, ikData.target);
        const chainLength = leftArm.forearm ? 2 : 1;
        console.log(`Left arm IK setup complete (chain length: ${chainLength})`);
        setStatus(prev => prev + ` | Left arm IKTS (${chainLength} bones)`);
      }
    } else {
      console.warn('Left arm IK failed: missing hand bone or controller target');
    }

    // Setup right arm IK with IKTS
    if (rightArm.hand && rightControllerTargetRef.current) {
      const ikData = setupIKTSChain(rightArm, 'right');
      if (ikData) {
        rightIKSolverRef.current = ikData;
        // Add chain to structure with its target
        ikStructure.add(ikData.ikChain, ikData.target);
        const chainLength = rightArm.forearm ? 2 : 1;
        console.log(`Right arm IK setup complete (chain length: ${chainLength})`);
        setStatus(prev => prev + ` | Right arm IKTS (${chainLength} bones)`);
      }
    } else {
      console.warn('Right arm IK failed: missing hand bone or controller target');
    }

    // Store the IK structure globally
    ikStructureRef.current = ikStructure;
    console.log('IK.Structure3D created and chains added');

    // Create activation zone spheres at hand positions
    if (leftArm.hand && scene) {
      const leftHandPos = leftArm.hand.getAbsolutePosition();

      const leftMat = new BABYLON.StandardMaterial('leftActivationMat', scene);
      leftMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
      leftMat.alpha = 0.3;
      leftMat.wireframe = true;

      console.log(
        `Left activation zone at (${leftHandPos.x.toFixed(2)}, ${leftHandPos.y.toFixed(2)}, ${leftHandPos.z.toFixed(2)})`
      );
    }

    if (rightArm.hand && scene) {
      const rightHandPos = rightArm.hand.getAbsolutePosition();

      const rightMat = new BABYLON.StandardMaterial('rightActivationMat', scene);
      rightMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
      rightMat.alpha = 0.3;
      rightMat.wireframe = true;

      console.log(
        `Right activation zone at (${rightHandPos.x.toFixed(2)}, ${rightHandPos.y.toFixed(2)}, ${rightHandPos.z.toFixed(2)})`
      );
    }

    if (!leftArm.hand && !rightArm.hand) {
      setStatus('Warning: No hand bones found. Check console for bone names.');
      console.error('No hand bones found in skeleton');
    }
  }
  // Helper function to find bone by name patterns
  function findBone(skeleton: BABYLON.Skeleton, patterns: string[]): BABYLON.Bone | undefined {
    return skeleton.bones.find(b => {
      const lowerName = b.name.toLowerCase();
      return patterns.some(pattern => lowerName.includes(pattern.toLowerCase()));
    });
  }

  // Helper function to get arm bone chain
  function getArmChain(skeleton: BABYLON.Skeleton, side: 'left' | 'right') {
    const sidePatterns =
      side === 'left' ? ['left', 'l_', '.l', '_l_'] : ['right', 'r_', '.r', '_r_'];

    // Find shoulder/clavicle
    const shoulder = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}shoulder`),
      ...sidePatterns.map(s => `${s}clavicle`),
      ...sidePatterns.map(s => `${s}collar`),
    ]);

    // Find upper arm
    const upperArm = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}upperarm`),
      ...sidePatterns.map(s => `${s}arm`),
      ...sidePatterns.map(s => `${s}uparm`),
    ]);

    // Find forearm/lower arm
    const forearm = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}forearm`),
      ...sidePatterns.map(s => `${s}lowerarm`),
      ...sidePatterns.map(s => `${s}loarm`),
    ]);

    // Find hand
    const hand = findBone(skeleton, [
      ...sidePatterns.map(s => `${s}hand`),
      ...sidePatterns.map(s => `${s}wrist`),
    ]);

    return { shoulder, upperArm, forearm, hand: hand! };
  }

  // Setup IK.ts chain for an arm
  function setupIKTSChain(armChain: ArmBoneChain, side: 'left' | 'right'): IKSolverData | null {
    const babylonBones: BABYLON.Bone[] = [];

    // Build bone array from chain (root to end effector)
    if (armChain.shoulder) babylonBones.push(armChain.shoulder);
    if (armChain.upperArm) babylonBones.push(armChain.upperArm);
    if (armChain.forearm) babylonBones.push(armChain.forearm);
    babylonBones.push(armChain.hand);

    console.log(
      `${side} arm bone chain:`,
      babylonBones.map(b => b.name)
    );

    // Create IK.ts chain
    const ikChain = new (IK as any).Chain3D();

    // Add first bone with start and end positions
    const firstBone = babylonBones[0];
    const firstStart = firstBone.getAbsolutePosition();
    let firstEnd: BABYLON.Vector3;

    if (babylonBones.length > 1) {
      firstEnd = babylonBones[1].getAbsolutePosition();
    } else {
      // Single bone case - use a default direction
      firstEnd = firstStart.add(new BABYLON.Vector3(0, -0.3, 0));
    }

    const ikFirstBone = new (IK as any).Bone3D(
      new (IK as any).V3(firstStart.x, firstStart.y, firstStart.z),
      new (IK as any).V3(firstEnd.x, firstEnd.y, firstEnd.z)
    );

    ikChain.addBone(ikFirstBone);
    console.log(`${side} added first bone: ${firstBone.name}`);

    // Set generous ball joint constraint on shoulder for natural movement
    ikFirstBone.setBallJointConstraintDegs(140);

    // Add consecutive bones and track them for constraints
    const ikBones: any[] = [ikFirstBone];

    for (let i = 1; i < babylonBones.length; i++) {
      const currentBone = babylonBones[i];
      const currentPos = currentBone.getAbsolutePosition();

      let nextPos: BABYLON.Vector3;
      if (i < babylonBones.length - 1) {
        nextPos = babylonBones[i + 1].getAbsolutePosition();
      } else {
        // Last bone - use default end point
        const prevPos = babylonBones[i - 1].getAbsolutePosition();
        const direction = currentPos.subtract(prevPos).normalize();
        nextPos = currentPos.add(direction.scale(0.2));
      }

      const direction = nextPos.subtract(currentPos);
      const length = direction.length();
      const normalizedDir = direction.normalize();

      const newBone = ikChain.addConsecutiveBone(
        new (IK as any).V3(normalizedDir.x, normalizedDir.y, normalizedDir.z),
        length
      );

      if (newBone) {
        ikBones.push(newBone);

        // Set constraints based on bone position in chain
        if (i === 1) {
          // Upper arm - generous ball joint
          newBone.setBallJointConstraintDegs(120);
        } else if (i === 2) {
          // Forearm/elbow - hinge constraint (bends one direction)
          newBone.setHingeClockwise(150);
          newBone.setHingeAnticlockwise(0);
        } else {
          // Hand - very flexible
          newBone.setBallJointConstraintDegs(100);
        }
      }

      console.log(`${side} added bone ${i}: ${currentBone.name}, length: ${length.toFixed(3)}`);
    }

    // Create target (will be updated each frame)
    const target = new (IK as any).V3(0, 0, 0);

    console.log(`${side} IK.ts chain created with ${babylonBones.length} bones`);

    // Calculate total arm length from IK chain (cache this value)
    let totalArmLength = 0;
    for (const bone of ikChain.bones) {
      totalArmLength += bone.length;
    }
    console.log(`${side} total arm length: ${totalArmLength.toFixed(3)}m`);

    return {
      ikChain,
      armChain,
      babylonBones,
      target,
      totalArmLength,
    };
  }

  // Global IK structure (holds all chains)
  const ikStructureRef = useRef<any>(null);

  // Update IK solvers each frame - bridge between IK.ts and Babylon
  function updateIKSolvers(): void {
    const scene = sceneRef.current;
    const skeleton = skeletonRef.current;
    const character = characterRootRef.current;
    if (!scene || !skeleton || !character) return;

    character.computeWorldMatrix(true);
    skeleton.prepare();
    skeleton.computeAbsoluteMatrices(true);

    // helper: update single arm
    const updateChainTarget = (
      ikData: IKSolverData,
      controllerTarget: BABYLON.AbstractMesh | null
    ) => {
      if (!ikData || !controllerTarget) return;

      controllerTarget.computeWorldMatrix(true);
      const targetPos = controllerTarget.getAbsolutePosition();
      const shoulder = ikData.armChain.shoulder;
      if (!shoulder) return;
      const shoulderPos = shoulder.getAbsolutePosition();

      // limit reach to avoid popping
      const offset = targetPos.subtract(shoulderPos);
      const reach = ikData.totalArmLength * armLengthScale * 0.95;
      const distance = offset.length();
      const clamped =
        distance > reach ? shoulderPos.add(offset.normalize().scale(reach)) : targetPos;

      // feed into IKTS (+Z system)
      ikData.target.x = clamped.x;
      ikData.target.y = clamped.y;
      ikData.target.z = -clamped.z; // flip Z from Babylon (−Z forward) → IKTS (+Z forward)

      const rootBone = ikData.ikChain.bones[0];
      rootBone.start.x = shoulderPos.x;
      rootBone.start.y = shoulderPos.y;
      rootBone.start.z = -shoulderPos.z;
    };

    if (leftIKSolverRef.current)
      updateChainTarget(leftIKSolverRef.current, leftControllerTargetRef.current);
    if (rightIKSolverRef.current)
      updateChainTarget(rightIKSolverRef.current, rightControllerTargetRef.current);

    // run solver
    try {
      const structure = ikStructureRef.current;
      if (structure) {
        for (let i = 0; i < 15; i++) structure.update();
      } else {
        if (leftIKSolverRef.current)
          for (let i = 0; i < 15; i++)
            leftIKSolverRef.current.ikChain.update(leftIKSolverRef.current.target);
        if (rightIKSolverRef.current)
          for (let i = 0; i < 15; i++)
            rightIKSolverRef.current.ikChain.update(rightIKSolverRef.current.target);
      }
    } catch (err) {
      console.error('IK solve error:', err);
    }

    // apply back to Babylon
    if (leftIKSolverRef.current && leftControllerTargetRef.current)
      applyIKToBabylonBones(leftIKSolverRef.current, leftControllerTargetRef.current);
    if (rightIKSolverRef.current && rightControllerTargetRef.current)
      applyIKToBabylonBones(rightIKSolverRef.current, rightControllerTargetRef.current);
  }

  // Apply IK.ts solved bone positions to Babylon bones via TransformNodes
  function applyIKToBabylonBones(
    ikData: IKSolverData,
    controllerTarget: BABYLON.AbstractMesh | null
  ) {
    const skeleton = skeletonRef.current;
    if (!skeleton) return;

    const ikBones = ikData.ikChain.bones;
    const babylonBones = ikData.babylonBones;

    for (let i = 0; i < babylonBones.length && i < ikBones.length; i++) {
      const bBone = babylonBones[i];
      const ikBone = ikBones[i];
      const tn = bBone.getTransformNode();
      if (!tn) continue;

      const start = new BABYLON.Vector3(ikBone.start.x, ikBone.start.y, -ikBone.start.z);
      const end = new BABYLON.Vector3(ikBone.end.x, ikBone.end.y, -ikBone.end.z);
      const worldDir = end.subtract(start).normalize();

      // convert world direction to local space
      const parentMatrix = tn.parent?.getWorldMatrix() ?? BABYLON.Matrix.Identity();
      const parentInv = BABYLON.Matrix.Invert(parentMatrix);
      const localDir = BABYLON.Vector3.TransformNormal(worldDir, parentInv).normalize();

      // most glTF arms rest along −Z → align from −Z
      const restAxis = new BABYLON.Vector3(0, 0, -1);
      const rot = new BABYLON.Quaternion();
      BABYLON.Quaternion.FromUnitVectorsToRef(restAxis, localDir, rot);

      // combine with parent's rotation safely
      let parentQuat = BABYLON.Quaternion.Identity();
      if (tn.parent instanceof BABYLON.TransformNode)
        parentQuat = tn.parent.rotationQuaternion ?? BABYLON.Quaternion.Identity();

      tn.rotationQuaternion = rot.multiply(parentQuat);
    }

    // orient hand to controller
    const handNode = babylonBones[babylonBones.length - 1].getTransformNode();
    if (handNode && controllerTarget?.rotationQuaternion) {
      const correction = BABYLON.Quaternion.FromEulerAngles(0, Math.PI, 0); // flip Z
      handNode.rotationQuaternion = controllerTarget.rotationQuaternion.multiply(correction);
    }

    skeleton.computeAbsoluteMatrices();
  }

  // Capture screenshot from static FPS camera
  async function captureVRScreenshot() {
    const engine = engineRef.current;
    const camera = staticFPSCameraRef.current;

    if (!engine || !camera) return;

    try {
      setStatus('Capturing screenshot...');

      BABYLON.Tools.CreateScreenshot(engine, camera, { width: 1920, height: 1080 }, data => {
        // Create download link
        const link = document.createElement('a');
        link.href = data;
        link.download = `fps_capture_${Date.now()}.png`;
        link.click();
        setStatus('Screenshot captured!');
      });
    } catch (error) {
      console.error('Capture failed:', error);
      setStatus('Capture failed');
    }
  }

  // Toggle skeleton visibility
  function toggleSkeleton() {
    if (skeletonViewerRef.current) {
      const newVisibility = !skeletonVisible;
      setSkeletonVisible(newVisibility);
      skeletonViewerRef.current.isEnabled = newVisibility;
    }
  }

  // Toggle pole targets visibility
  function togglePoleTargets() {
    setPoleTargetsVisible(!poleTargetsVisible);
  }

  // Update pole target visibility
  useEffect(() => {
    if (leftPoleTargetRef.current) {
      leftPoleTargetRef.current.isVisible = poleTargetsVisible;
    }
    if (rightPoleTargetRef.current) {
      rightPoleTargetRef.current.isVisible = poleTargetsVisible;
    }
  }, [poleTargetsVisible]);

  // Update static FPS camera position
  useEffect(() => {
    const camera = staticFPSCameraRef.current;
    if (!camera) return;

    camera.position = new BABYLON.Vector3(0, 1.6, cameraDistance);
    camera.setTarget(new BABYLON.Vector3(0, 1.6, cameraDistance + 5));
  }, [cameraDistance]);

  // Update character position
  useEffect(() => {
    const character = characterRootRef.current;
    const skeleton = skeletonRef.current;
    if (!character) return;

    character.position.x = characterPosX;
    character.position.y = characterPosY;
    character.position.z = characterPosZ;

    // CRITICAL: Force skeleton to update after parent mesh moves
    if (skeleton) {
      skeleton.prepare();
      skeleton.computeAbsoluteMatrices(true); // Force recompute
    }
  }, [characterPosX, characterPosY, characterPosZ]);

  // Update spectator camera position
  useEffect(() => {
    const camera = spectatorCameraRef.current;
    if (!camera) return;

    camera.position = new BABYLON.Vector3(0, 2, spectatorDistance);
    camera.setTarget(new BABYLON.Vector3(0, 1, 0));
  }, [spectatorDistance]);

  return (
    <div className="relative w-full h-full bg-[#1a1a1a] overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* VR Active Indicator */}
      {spectatorFeedActive && (
        <div className="absolute top-4 right-4 bg-green-600/90 px-4 py-2 rounded-lg border-2 border-green-400 shadow-lg">
          <div className="text-white text-sm font-semibold flex items-center gap-2">
            <div className="w-3 h-3 bg-green-300 rounded-full animate-pulse"></div>
            VR Active - Spectator View
          </div>
          <div className="text-green-100 text-xs mt-1">Adjust camera with controls below</div>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 bg-black/70 p-3 rounded-lg">
        <h2 className="text-white text-lg font-semibold">FPS Viewport (VR IK)</h2>

        <button
          onClick={handleLoadMesh}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-2 text-sm transition-colors"
        >
          Load Rigged Mesh
        </button>

        <button
          onClick={initializeVR}
          disabled={!vrSupported || vrInitialized}
          className={`${
            vrSupported && !vrInitialized
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-gray-600 cursor-not-allowed'
          } text-white rounded px-3 py-2 text-sm transition-colors`}
        >
          {!vrSupported ? 'VR Not Supported' : vrInitialized ? 'VR Initialized ✓' : 'Initialize VR'}
        </button>

        <button
          onClick={enterVRManually}
          disabled={!vrInitialized}
          className={`${
            vrInitialized ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-600 cursor-not-allowed'
          } text-white rounded px-3 py-2 text-sm transition-colors`}
        >
          Enter VR
        </button>

        <button
          onClick={centerCharacterAtVRPosition}
          disabled={!characterRootRef.current || !vrCameraRef.current}
          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded px-3 py-2 text-sm transition-colors"
        >
          Center Character Here
        </button>

        <button
          onClick={captureVRScreenshot}
          className="bg-orange-600 hover:bg-orange-700 text-white rounded px-3 py-2 text-sm transition-colors"
        >
          Capture Screenshot
        </button>

        <button
          onClick={toggleSkeleton}
          disabled={!skeletonViewerRef.current}
          className="bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded px-3 py-2 text-sm transition-colors"
        >
          {skeletonVisible ? 'Hide Skeleton' : 'Show Skeleton'}
        </button>

        <button
          onClick={togglePoleTargets}
          disabled={!leftPoleTargetRef.current && !rightPoleTargetRef.current}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 text-white rounded px-3 py-2 text-sm transition-colors"
        >
          {poleTargetsVisible ? 'Hide Pole Targets' : 'Show Pole Targets'}
        </button>

        <div className="border-t border-white/20 pt-2 mt-2">
          <div className="text-white text-xs font-semibold mb-2">Static Camera Position</div>

          <div className="space-y-2">
            <div>
              <label className="text-white/80 text-xs">
                Distance: {cameraDistance.toFixed(2)}m
              </label>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.1"
                value={cameraDistance}
                onChange={e => setCameraDistance(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {(leftIKSolverRef.current || rightIKSolverRef.current) && (
          <div className="border-t border-white/20 pt-2 mt-2">
            <div className="text-white text-xs font-semibold mb-2">IK Settings</div>

            <div className="space-y-2">
              <div>
                <label className="text-white/80 text-xs">
                  Arm Length Scale: {armLengthScale.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="1.2"
                  step="0.05"
                  value={armLengthScale}
                  onChange={e => setArmLengthScale(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-white/60 text-[10px]">
                  Adjust if your arms are longer/shorter than character
                </div>
              </div>
            </div>
          </div>
        )}

        {characterRootRef.current && (
          <div className="border-t border-white/20 pt-2 mt-2">
            <div className="text-white text-xs font-semibold mb-2">Character Position</div>

            <div className="space-y-2">
              <div>
                <label className="text-white/80 text-xs">X: {characterPosX.toFixed(2)}</label>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={characterPosX}
                  onChange={e => setCharacterPosX(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-white/80 text-xs">Y: {characterPosY.toFixed(2)}</label>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={characterPosY}
                  onChange={e => setCharacterPosY(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-white/80 text-xs">Z: {characterPosZ.toFixed(2)}</label>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={characterPosZ}
                  onChange={e => setCharacterPosZ(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {(leftIKSolverRef.current || rightIKSolverRef.current) && (
          <div className="border-t border-white/20 pt-2 mt-2">
            <div className="text-white text-xs font-semibold mb-2">Pole Target Offsets</div>

            <div className="space-y-2">
              <div>
                <label className="text-white/80 text-xs">X (Side): {poleOffsetX.toFixed(2)}</label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={poleOffsetX}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setPoleOffsetX(val);
                    poleOffsetXRef.current = val;
                  }}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-white/80 text-xs">
                  Y (Height): {poleOffsetY.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={poleOffsetY}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setPoleOffsetY(val);
                    poleOffsetYRef.current = val;
                  }}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-white/80 text-xs">
                  Z (Forward): {poleOffsetZ.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={poleOffsetZ}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setPoleOffsetZ(val);
                    poleOffsetZRef.current = val;
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {spectatorFeedActive && (
          <div className="border-t border-white/20 pt-2 mt-2">
            <div className="text-green-400 text-xs font-semibold mb-2">
              Spectator Camera Position
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-white/80 text-xs">
                  Distance: {spectatorDistance.toFixed(2)}m
                </label>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.1"
                  value={spectatorDistance}
                  onChange={e => setSpectatorDistance(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        <div className="text-white/80 text-xs mt-2 p-2 bg-black/50 rounded">
          <div className="font-semibold mb-1">Status:</div>
          <div>{status}</div>
        </div>

        <div className="text-white/60 text-xs mt-2 border-t border-white/20 pt-2">
          <div className="font-semibold mb-1">Instructions:</div>
          <ol className="list-decimal list-inside space-y-1">
            <li>Load a rigged character mesh</li>
            <li>Adjust static camera position</li>
            <li>Initialize VR</li>
            <li>⚠️ Exit SteamVR Home (System button → Exit)</li>
            <li>Click "Enter VR" button</li>
            <li>Move VR controllers to control full arms via IK</li>
            <li>Capture screenshots from static FPS view</li>
          </ol>
          <div className="mt-2 text-blue-400/80 text-[10px] font-semibold">
            💡 TIP: Pole targets (blue/orange spheres) control elbow bend direction
          </div>
          <div className="mt-1 text-yellow-500/80 text-[10px] font-semibold">
            ⚠️ IMPORTANT: Must exit SteamVR Home before entering VR
          </div>
          <div className="mt-1 text-white/50 text-[10px]">
            Desktop shows spectator camera view, VR headset has independent view
          </div>
        </div>
      </div>

      {/* Debug Info */}
      {characterRootRef.current && (
        <div className="absolute bottom-4 left-4 bg-black/70 p-2 rounded text-white/70 text-xs">
          <div>Character: {characterRootRef.current.name}</div>
          <div>Bones: {skeletonRef.current?.bones.length || 0}</div>
          <div>
            IK Active: L: {leftIKSolverRef.current ? '✓' : '✗'} R:{' '}
            {rightIKSolverRef.current ? '✓' : '✗'}
          </div>
        </div>
      )}
    </div>
  );
};

export default FPSViewport;
