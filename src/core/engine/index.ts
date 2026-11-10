export { SceneManager } from './SceneManager';
export type { SceneManagerOptions } from './SceneManager';

export {
  calculateCameraPositions,
  calculateMeshBoundingBox,
  computeBoundingBoxAndCameraPositions,
  createCamerasAtPositions,
} from './CameraRig';

export { loadMesh, disposeMesh } from './MeshLoader';
export type { LoadedMeshResult } from './MeshLoader';

export { AnimationController } from './AnimationController';
export type { LoadedAnimation } from './AnimationController';
