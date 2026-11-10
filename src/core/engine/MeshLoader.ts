/**
 * MeshLoader — loads GLTF/GLB meshes into a Babylon.js scene.
 * Extracted from hooks/useCharacterMesh.ts.
 *
 * Pure functions, no React dependency.
 */

import * as BABYLON from '@babylonjs/core';
import { SkeletonViewer } from '@babylonjs/core/Debug/skeletonViewer';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface LoadedMeshResult {
  root: BABYLON.Mesh;
  meshes: BABYLON.AbstractMesh[];
  skeleton: BABYLON.Skeleton | null;
  boneNames: string[];
  animationGroups: BABYLON.AnimationGroup[];
  skeletonViewers: SkeletonViewer[];
}

/**
 * Load a GLTF/GLB mesh into the scene.
 * Sets layer mask to 2 for capture visibility (matching original behavior).
 */
export async function loadMesh(
  scene: BABYLON.Scene,
  filePath: string,
): Promise<LoadedMeshResult> {
  // Clear existing meshes (matches original useCharacterMesh behavior)
  while (scene.meshes.length > 0) {
    scene.meshes[0].dispose(false, true);
  }

  await BABYLON.AppendSceneAsync(convertFileSrc(filePath), scene, {
    name: 'character',
    pluginOptions: {
      gltf: {
        createInstances: false,
      },
    },
  });

  const root = scene.meshes.find((m) => m.name === '__root__') as BABYLON.Mesh;
  if (!root) {
    throw new Error('No root mesh found after loading');
  }

  const meshes = [root, ...root.getChildMeshes(false)] as BABYLON.AbstractMesh[];

  // Compute world matrices and set layer masks
  meshes.forEach((m) => {
    m.computeWorldMatrix(true);
    if ((m as BABYLON.Mesh).skeleton) {
      (m as any).refreshBoundingInfo(true); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    m.layerMask = 2;
  });

  // Find skeleton and create skeleton viewers
  const skinnedMeshes = meshes.filter((m) => (m as BABYLON.Mesh).skeleton) as BABYLON.Mesh[];
  const boneNames: string[] = [];
  const skeletonViewers: SkeletonViewer[] = [];
  let skeleton: BABYLON.Skeleton | null = null;

  skinnedMeshes.forEach((mesh) => {
    const skel = mesh.skeleton;
    if (!skel) return;

    skeleton = skel;
    if (skel.bones.length > 0) {
      boneNames.push(...skel.bones.map((b) => b.name));
    }

    const viewer = new SkeletonViewer(skel, mesh, scene);
    viewer.isEnabled = true;
    viewer.changeDisplayMode(SkeletonViewer.DISPLAY_SPHERE_AND_SPURS);
    viewer.update();
    if (scene.activeCameras && scene.activeCameras[0]) {
      viewer.utilityLayer?.setRenderCamera(scene.activeCameras[0]);
    }
    skeletonViewers.push(viewer);
  });

  return {
    root,
    meshes,
    skeleton,
    boneNames: [...new Set(boneNames)], // deduplicate
    animationGroups: [...scene.animationGroups],
    skeletonViewers,
  };
}

/**
 * Dispose a loaded mesh and associated resources.
 */
export function disposeMesh(result: LoadedMeshResult): void {
  result.skeletonViewers.forEach((v) => v.dispose());
  result.animationGroups.forEach((ag) => ag.dispose());
  result.root.dispose(false, true);
}
