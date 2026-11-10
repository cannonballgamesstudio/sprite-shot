import { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';

export default function CombinedViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const dudeRef = useRef<BABYLON.AbstractMesh | null>(null);
  const skeletonRef = useRef<BABYLON.Skeleton | null>(null);
  const skeletonViewerRef = useRef<SkeletonViewer | null>(null);
  const controlMeshesRef = useRef<BABYLON.AbstractMesh[]>([]);
  const ikControllerRef = useRef<BABYLON.BoneIKController | null>(null);

  const xrExperienceRef = useRef<BABYLON.WebXRDefaultExperience | null>(null);
  const leftControllerRef = useRef<BABYLON.WebXRInputSource | null>(null);
  const rightControllerRef = useRef<BABYLON.WebXRInputSource | null>(null);
  const leftTargetBoxRef = useRef<BABYLON.Mesh | null>(null);
  const rightTargetBoxRef = useRef<BABYLON.Mesh | null>(null);
  const leftPoleRef = useRef<BABYLON.Mesh | null>(null);
  const rightPoleRef = useRef<BABYLON.Mesh | null>(null);
  const spectatorCameraRef = useRef<BABYLON.FreeCamera | null>(null);
  const staticCameraRef = useRef<BABYLON.ArcRotateCamera | null>(null);
  const leftHandBoneRef = useRef<BABYLON.Bone | null>(null);
  const rightHandBoneRef = useRef<BABYLON.Bone | null>(null);

  const [status, setStatus] = useState('Ready to load model');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [vrSupported, setVrSupported] = useState(false);
  const [vrInitialized, setVrInitialized] = useState(false);

  function addIK() {
    if (!sceneRef.current || !dudeRef.current || !skeletonRef.current) return;
    const scene = sceneRef.current;
    const dude = dudeRef.current;
    const skeleton = skeletonRef.current;

    const leftPole = BABYLON.MeshBuilder.CreateSphere('leftPole', { diameter: 0.1 }, scene);
    leftPole.position = new BABYLON.Vector3(-0.3, 1.8, -0.5);
    leftPole.addBehavior(new BABYLON.PointerDragBehavior());
    const leftPoleMat = new BABYLON.StandardMaterial('leftPoleMat', scene);
    leftPoleMat.emissiveColor = new BABYLON.Color3(0, 1, 1);
    leftPole.material = leftPoleMat;
    leftPoleRef.current = leftPole;

    const rightPole = BABYLON.MeshBuilder.CreateSphere('rightPole', { diameter: 0.1 }, scene);
    rightPole.position = new BABYLON.Vector3(0.3, 1.8, -0.5);
    rightPole.addBehavior(new BABYLON.PointerDragBehavior());
    const rightPoleMat = new BABYLON.StandardMaterial('rightPoleMat', scene);
    rightPoleMat.emissiveColor = new BABYLON.Color3(1, 1, 0);
    rightPole.material = rightPoleMat;
    rightPoleRef.current = rightPole;

    const leftTargetBox = BABYLON.MeshBuilder.CreateBox('leftTarget', { size: 0.1 }, scene);
    leftTargetBox.position = new BABYLON.Vector3(-0.5, 1.0, 0.3);
    const leftTargetMat = new BABYLON.StandardMaterial('leftTargetMat', scene);
    leftTargetMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
    leftTargetBox.material = leftTargetMat;
    leftTargetBoxRef.current = leftTargetBox;

    const rightTargetBox = BABYLON.MeshBuilder.CreateBox('rightTarget', { size: 0.1 }, scene);
    rightTargetBox.position = new BABYLON.Vector3(0.5, 1.0, 0.3);
    const rightTargetMat = new BABYLON.StandardMaterial('rightTargetMat', scene);
    rightTargetMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
    rightTargetBox.material = rightTargetMat;
    rightTargetBoxRef.current = rightTargetBox;

    controlMeshesRef.current = [leftTargetBox, rightTargetBox, leftPole, rightPole];

    const forearmPatterns = ['forearm', 'lowerarm', 'elbow'];
    const upperArmPatterns = ['upperarm', 'arm', 'shoulder'];

    const rightForearm = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('right') && forearmPatterns.some(p => name.includes(p));
    });

    const rightUpperArm = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('right') && upperArmPatterns.some(p => name.includes(p));
    });

    const leftForearm = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('left') && forearmPatterns.some(p => name.includes(p));
    });

    const leftUpperArm = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('left') && upperArmPatterns.some(p => name.includes(p));
    });

    const leftHand = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('left') && name.includes('hand') && !name.includes('thumb') && !name.includes('index') && !name.includes('middle') && !name.includes('ring') && !name.includes('pinky');
    });

    const rightHand = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('right') && name.includes('hand') && !name.includes('thumb') && !name.includes('index') && !name.includes('middle') && !name.includes('ring') && !name.includes('pinky');
    });

    if (leftHand) leftHandBoneRef.current = leftHand;
    if (rightHand) rightHandBoneRef.current = rightHand;

    if (!rightForearm || !rightUpperArm || !leftForearm || !leftUpperArm) {
      console.warn('Could not find arm bones for IK');
      console.log(
        'Available bones:',
        skeleton.bones.map((b, i) => `${i}: ${b.name}`)
      );
      setStatus('IK setup failed - could not find arm bones');
      return;
    }

    console.log(`Right IK Chain: ${rightUpperArm.name} -> ${rightForearm.name}`);
    console.log(`Left IK Chain: ${leftUpperArm.name} -> ${leftForearm.name}`);

    const rightIK = new BABYLON.BoneIKController(dude, rightForearm, {
      targetMesh: rightTargetBox,
      poleTargetMesh: rightPole,
      poleAngle: Math.PI / 2,
    });

    const leftIK = new BABYLON.BoneIKController(dude, leftForearm, {
      targetMesh: leftTargetBox,
      poleTargetMesh: leftPole,
      poleAngle: Math.PI / 2,
    });

    scene.registerBeforeRender(() => {
      rightIK.update();
      leftIK.update();
    });

    setStatus(`IK active on both arms`);
  }

  function toggleSkViewer(needed: boolean) {
    if (!sceneRef.current || !skeletonRef.current || !dudeRef.current) return;

    if (needed) {
      if (!skeletonViewerRef.current) {
        const skeletonViewer = new SkeletonViewer(
          skeletonRef.current,
          dudeRef.current,
          sceneRef.current,
          false,
          3,
          {
            displayMode: SkeletonViewer.DISPLAY_SPHERE_AND_SPURS,
          }
        );
        skeletonViewer.update();
        skeletonViewer.color = BABYLON.Color3.Green();
        skeletonViewerRef.current = skeletonViewer;
      }
    }
    if (skeletonViewerRef.current) {
      skeletonViewerRef.current.isEnabled = needed;
    }
  }

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new BABYLON.Engine(canvasRef.current, true);
    engineRef.current = engine;

    const createScene = function () {
      const scene = new BABYLON.Scene(engine);
      const camera = new BABYLON.ArcRotateCamera('camera', 0, 1, 25, BABYLON.Vector3.Zero(), scene);
      camera.setTarget(new BABYLON.Vector3(0, 4, 0));
      camera.attachControl(canvasRef.current!, true);
      staticCameraRef.current = camera;

      const spectatorCamera = new BABYLON.FreeCamera(
        'spectatorCamera',
        new BABYLON.Vector3(0, 2, -3),
        scene
      );
      spectatorCamera.setTarget(new BABYLON.Vector3(0, 1, 0));
      spectatorCameraRef.current = spectatorCamera;

      spectatorCamera.minZ = 0.001;
      spectatorCamera.fov = BABYLON.Tools.ToRadians(100);
      spectatorCamera.fovMode = BABYLON.Constants.FOVMODE_VERTICAL_FIXED;
      spectatorCamera.keysUp = [87];
      spectatorCamera.keysDown = [83];
      spectatorCamera.keysLeft = [65];
      spectatorCamera.keysRight = [68];
      spectatorCamera.keysUpward = [69];
      spectatorCamera.keysDownward = [81];
      spectatorCamera.keysRotateLeft = [37];
      spectatorCamera.keysRotateRight = [39];
      spectatorCamera.keysRotateUp = [38];
      spectatorCamera.keysRotateDown = [40];
      spectatorCamera.speed = 0.1;
      spectatorCamera.angularSensibility = 10000;
      spectatorCamera.attachControl(canvasRef.current!, false);

      scene.activeCamera = camera;

      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.7;

      const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
      const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
      groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      ground.material = groundMat;

      setStatus('Scene ready - click Load Model to import a GLB');

      return scene;
    };

    const scene = createScene();
    sceneRef.current = scene;

    engine.runRenderLoop(() => {
      scene.render();
    });

    window.addEventListener('resize', () => {
      engine.resize();
    });

    checkVRSupport();

    return () => {
      engine.dispose();
      window.removeEventListener('resize', () => engine.resize());
    };
  }, []);

  async function checkVRSupport() {
    try {
      const supported = await BABYLON.WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
      setVrSupported(supported);
      if (supported) {
        console.log('VR supported');
      }
    } catch (error) {
      console.error('VR check failed:', error);
      setVrSupported(false);
    }
  }

  async function initializeVR() {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      setStatus('Initializing VR...');

      const xrHelper = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
          sessionMode: 'immersive-vr',
        },
        inputOptions: {
          doNotLoadControllerMeshes: false,
        },
      });

      xrExperienceRef.current = xrHelper;

      xrHelper.input.onControllerAddedObservable.add(controller => {
        controller.onMotionControllerInitObservable.add(motionController => {
          const handedness = motionController.handedness;
          console.log(`${handedness} controller connected`);

          if (handedness === 'left') {
            leftControllerRef.current = controller;
            setupControllerTracking(controller, 'right');
          } else if (handedness === 'right') {
            rightControllerRef.current = controller;
            setupControllerTracking(controller, 'left');
          }
        });
      });

      xrHelper.baseExperience.onStateChangedObservable.add(state => {
        console.log('XR State changed:', BABYLON.WebXRState[state]);

        if (state === BABYLON.WebXRState.IN_XR) {
          setStatus('In VR - Desktop shows spectator view (WASD+Arrows)');
          if (spectatorCameraRef.current && canvasRef.current) {
            scene.activeCamera = spectatorCameraRef.current;
            spectatorCameraRef.current.attachControl(canvasRef.current, true);
          }
        } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
          setStatus('Exited VR');
          if (staticCameraRef.current && canvasRef.current) {
            scene.activeCamera = staticCameraRef.current;
            staticCameraRef.current.attachControl(canvasRef.current, true);
          }
        }
      });

      setVrInitialized(true);
      setStatus('VR initialized - Click "Enter VR" to start');
    } catch (error) {
      console.error('VR initialization failed:', error);
      setStatus(
        `VR initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  function setupControllerTracking(controller: BABYLON.WebXRInputSource, hand: 'left' | 'right') {
    const scene = sceneRef.current;
    if (!scene) return;

    const grip = controller.grip;
    if (!grip) return;

    const targetBox = hand === 'left' ? leftTargetBoxRef.current : rightTargetBoxRef.current;

    scene.onBeforeRenderObservable.add(() => {
      if (grip && targetBox) {
        targetBox.position.copyFrom(grip.absolutePosition);
        targetBox.rotationQuaternion = grip.absoluteRotationQuaternion?.clone() || null;
      }
    });
  }

  async function enterVR() {
    const xrHelper = xrExperienceRef.current;
    if (!xrHelper) {
      setStatus('VR not initialized. Click "Initialize VR" first.');
      return;
    }

    try {
      setStatus('Entering VR...');
      await xrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');

      if (dudeRef.current) {
        const modelPos = dudeRef.current.position.clone();
        xrHelper.baseExperience.camera.position.copyFrom(modelPos);
        console.log(`VR camera positioned at model location: ${modelPos.toString()}`);
      }

      setStatus('In VR');
    } catch (error) {
      console.error('Failed to enter VR:', error);
      setStatus(`Failed to enter VR: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function loadModel() {
    const scene = sceneRef.current;
    if (!scene) return;

    try {
      setStatus('Opening file dialog...');

      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLB/GLTF Files', extensions: ['glb', 'gltf'] }],
      });

      if (!selected) {
        setStatus('Load cancelled');
        return;
      }

      setStatus('Loading model...');

      if (dudeRef.current) {
        dudeRef.current.dispose();
        dudeRef.current = null;
      }
      if (skeletonViewerRef.current) {
        skeletonViewerRef.current.dispose();
        skeletonViewerRef.current = null;
      }
      if (ikControllerRef.current) {
        ikControllerRef.current = null;
      }
      controlMeshesRef.current.forEach(mesh => mesh.dispose());
      controlMeshesRef.current = [];

      const path = Array.isArray(selected) ? selected[0] : selected;
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', convertFileSrc(path), scene);

      const skinned = result.meshes.find(m => m.skeleton) as BABYLON.AbstractMesh | undefined;
      if (!skinned || !skinned.skeleton) {
        setStatus('No skeleton found on loaded mesh');
        return;
      }

      const dude = result.meshes[0];
      dudeRef.current = dude;

      console.log('Character loaded. Bones:', skinned.skeleton.bones.length);

      result.meshes.forEach(mesh => {
        if (mesh.skeleton) {
          mesh.computeBonesUsingShaders = false;
          console.log(`Enabled CPU skinning for mesh: ${mesh.name}`);
        }
      });

      const skeleton = skinned.skeleton;
      skeletonRef.current = skeleton;

      console.log(
        'Available bones:',
        skeleton.bones.map((b, i) => `${i}: ${b.name}`)
      );

      toggleSkViewer(showSkeleton);
      addIK();

      setStatus('Model loaded with IK');
    } catch (error) {
      console.error('Load failed:', error);
      setStatus('Failed to load model');
    }
  }

  function toggleSkeleton() {
    const newState = !showSkeleton;
    setShowSkeleton(newState);
    toggleSkViewer(newState);
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '10px',
          borderRadius: '5px',
          color: 'white',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ marginBottom: '10px' }}>Status: {status}</div>
        <button onClick={loadModel} style={{ marginRight: '10px' }}>
          Load Model
        </button>
        <button onClick={toggleSkeleton} style={{ marginRight: '10px' }}>
          {showSkeleton ? 'Hide' : 'Show'} Skeleton
        </button>
        {vrSupported && !vrInitialized && (
          <button onClick={initializeVR} style={{ marginRight: '10px' }}>
            Initialize VR
          </button>
        )}
        {vrInitialized && <button onClick={enterVR}>Enter VR</button>}
      </div>
    </div>
  );
}
