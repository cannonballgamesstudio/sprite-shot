import { useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';

export default function BabylonViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const dudeRef = useRef<BABYLON.AbstractMesh | null>(null);
  const skeletonRef = useRef<BABYLON.Skeleton | null>(null);
  const skeletonViewerRef = useRef<SkeletonViewer | null>(null);
  const controlMeshesRef = useRef<BABYLON.AbstractMesh[]>([]);
  const ikControllerRef = useRef<BABYLON.BoneIKController | null>(null);

  const [status, setStatus] = useState('Ready to load model');
  const [showSkeleton, setShowSkeleton] = useState(true);

  function addIK() {
    if (!sceneRef.current || !dudeRef.current || !skeletonRef.current) return;
    const scene = sceneRef.current;
    const dude = dudeRef.current;
    const skeleton = skeletonRef.current;

    const ArmIKPole_R = BABYLON.MeshBuilder.CreateSphere('', { diameter: 0.1 }, scene);
    ArmIKPole_R.position = new BABYLON.Vector3(0.5, 1.2, -0.3);
    ArmIKPole_R.addBehavior(new BABYLON.PointerDragBehavior());

    const ArmIKController_R = BABYLON.MeshBuilder.CreateBox('', { size: 0.1 }, scene);
    ArmIKController_R.position = new BABYLON.Vector3(0.5, 1.0, 0.3);
    ArmIKController_R.addBehavior(new BABYLON.PointerDragBehavior());

    controlMeshesRef.current = [ArmIKController_R, ArmIKPole_R];

    // Find right arm bones for 2-bone IK chain (upperarm -> forearm)
    const rightForearmPatterns = [
      'forearm',
      'lowerarm',
      'elbow',
    ];
    const rightUpperArmPatterns = [
      'upperarm',
      'arm',
      'shoulder',
    ];

    // Find forearm (this is the bone we target for IK)
    let ikBone_R = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('right') && rightForearmPatterns.some(p => name.includes(p));
    });

    // Find upperarm (parent bone in the chain)
    const upperArm_R = skeleton.bones.find(b => {
      const name = b.name.toLowerCase();
      return name.includes('right') && rightUpperArmPatterns.some(p => name.includes(p));
    });

    if (!ikBone_R || !upperArm_R) {
      console.warn('Could not find right arm bones for IK');
      console.log('Available bones:', skeleton.bones.map((b, i) => `${i}: ${b.name}`));
      setStatus('IK setup failed - could not find right arm bones');
      return;
    }

    console.log(`IK Chain: ${upperArm_R.name} -> ${ikBone_R.name}`);
    console.log(`Using bone "${ikBone_R.name}" (index ${skeleton.bones.indexOf(ikBone_R)}) for IK target`);

    const ikCtl = new BABYLON.BoneIKController(dude, ikBone_R, {
      targetMesh: ArmIKController_R,
      poleTargetMesh: ArmIKPole_R,
      poleAngle: Math.PI / 2,
    });

    ikControllerRef.current = ikCtl;

    scene.registerBeforeRender(() => {
      ikCtl.update();
    });

    setStatus(`IK active on ${ikBone_R.name}`);
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

      const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
      light.intensity = 0.7;

      // Scene is ready for loading models
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

    return () => {
      engine.dispose();
      window.removeEventListener('resize', () => engine.resize());
    };
  }, []);

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

      // Clean up previous model
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
      // Dispose control meshes
      controlMeshesRef.current.forEach(mesh => mesh.dispose());
      controlMeshesRef.current = [];

      const path = Array.isArray(selected) ? selected[0] : selected;
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', convertFileSrc(path), scene);

      // Find first mesh with a skeleton
      const skinned = result.meshes.find(m => m.skeleton) as BABYLON.AbstractMesh | undefined;
      if (!skinned || !skinned.skeleton) {
        setStatus('No skeleton found on loaded mesh');
        return;
      }

      const dude = result.meshes[0];
      dudeRef.current = dude;

      console.log('Character loaded. Bones:', skinned.skeleton.bones.length);

      // Force CPU skinning on all meshes
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
        <button onClick={toggleSkeleton}>{showSkeleton ? 'Hide' : 'Show'} Skeleton</button>
      </div>
    </div>
  );
}
