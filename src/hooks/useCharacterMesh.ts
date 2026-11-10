import { useEffect, MutableRefObject } from 'react';
import * as BABYLON from '@babylonjs/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';
import { convertFileSrc } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../state/projectStore';
import { CameraProps, ViewportCameraMode, BoundingBox } from '../state/viewportStore';
import { computeBoundingBoxAndCameraPositions } from './viewportUtils';

interface UseCharacterMeshParams {
  sceneRef: MutableRefObject<BABYLON.Scene | null>;
  characterRef: MutableRefObject<BABYLON.Mesh | null>;
  frustumCamerasRef: MutableRefObject<BABYLON.Camera[]>;
  skeletonViewersRef: MutableRefObject<SkeletonViewer[]>;
  currentMeshPath: string | null;
  cameraMode: ViewportCameraMode;
  cameraProps: CameraProps;
  setAvailableBones: (bones: string[]) => void;
  setCameraPositions: (positions: any[]) => void;
  setBoundingBox: (bbox: BoundingBox | null) => void;
  setMeshLoaded: (loaded: boolean) => void;
  setLoadedMeshId: (id: string | null) => void;
  currentProject: any;
  animationGroupsRef: MutableRefObject<BABYLON.AnimationGroup[]>;
}

export const useCharacterMesh = ({
  sceneRef,
  characterRef,
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
}: UseCharacterMeshParams) => {
  useEffect(() => {
    if (!currentMeshPath) return;
    const scene = sceneRef.current;
    if (!scene) return;

    if (!sceneRef.current) {
      console.error('Scene not initialized');
      return;
    }

    if (characterRef.current) {
      characterRef.current.dispose();
    }

    while (scene.meshes.length > 0) {
      scene.meshes[0].dispose(false, true);
    }

    frustumCamerasRef.current.forEach(c => c.dispose());
    frustumCamerasRef.current = [];

    skeletonViewersRef.current.forEach(v => v.dispose());
    skeletonViewersRef.current = [];

    try {
      BABYLON.AppendSceneAsync(convertFileSrc(currentMeshPath), sceneRef.current as BABYLON.Scene, {
        name: 'character',
        pluginOptions: {
          gltf: {
            createInstances: false,
          },
        },
      }).then(async () => {
        characterRef.current = (sceneRef.current as BABYLON.Scene).meshes.filter(
          m => m.name === '__root__'
        )[0] as BABYLON.Mesh;

        const root = characterRef.current!;
        const meshes = [root, ...root.getChildMeshes(false)];
        meshes.forEach(m => {
          m.computeWorldMatrix(true);
          if ((m as any).skeleton) {
            (m as any).refreshBoundingInfo(true);
          }
          m.layerMask = 2;
        });

        const skinnedMeshes = meshes.filter(mesh => mesh.skeleton) as BABYLON.Mesh[];
        skinnedMeshes.forEach(mesh => {
          const skeleton = mesh.skeleton;
          if (!skeleton) return;

          if (skeleton.bones.length > 0) {
            const boneNames = skeleton.bones.map(bone => bone.name);
            setAvailableBones(boneNames);
          }
          const viewer = new SkeletonViewer(skeleton, mesh, scene);
          viewer.isEnabled = true;

          viewer.changeDisplayMode(SkeletonViewer.DISPLAY_SPHERE_AND_SPURS);
          viewer.update();
          viewer.utilityLayer?.setRenderCamera(scene.activeCameras![0]);
          skeletonViewersRef.current.push(viewer);
        });

        const { boundingBox: bbox, cameraPositions } = computeBoundingBoxAndCameraPositions(
          meshes,
          cameraMode,
          cameraProps
        );
        setCameraPositions(cameraPositions);
        setBoundingBox(bbox);
        setMeshLoaded(true);

        const projectPath = useProjectStore.getState().projectPath;
        if (projectPath && currentMeshPath) {
          const relativePath = currentMeshPath.replace(`${projectPath}/`, '');
          const mesh = currentProject?.meshes?.find((m: any) => m.filePath === relativePath);
          if (mesh) {
            setLoadedMeshId(mesh.id);
            console.log('Loaded mesh ID set to:', mesh.id, mesh.name);
          }
        }

        console.log('Scene ready, frustum cameras created:', frustumCamerasRef.current.length);

        if (animationGroupsRef.current) {
          animationGroupsRef.current.push(...scene.animationGroups);
        } else {
          animationGroupsRef.current = scene.animationGroups;
        }
        console.log('animationGroupsRef.current: ', animationGroupsRef.current);
      });
    } catch (error) {
      message(`Failed to load mesh: ${error}`, { title: 'Error' });
    }
  }, [currentMeshPath]);
};
