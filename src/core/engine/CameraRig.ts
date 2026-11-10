/**
 * CameraRig — camera positioning (planar/spherical) and bounding box computation.
 * Extracted from hooks/viewportUtils.ts: calculateCameraPositions, calculateMeshBoundingBox,
 * computeBoundingBoxAndCameraPositions, useInsertCameras.
 *
 * Pure functions, no React dependency.
 */

import * as BABYLON from '@babylonjs/core';
import {
  type CameraProps,
  type CameraPosition,
  type BoundingBox,
  ViewportCameraMode,
  CameraProjection,
} from '../../state/viewportStore';

/**
 * Calculate camera positions around a bounding box.
 * Direct extraction from viewportUtils.ts calculateCameraPositions (lines 195–253).
 */
export function calculateCameraPositions(
  boundingBox: BoundingBox | null,
  cameraMode: ViewportCameraMode,
  cameraProps: CameraProps,
): CameraPosition[] {
  if (!boundingBox) return [];

  const positions: CameraPosition[] = [];
  const center = boundingBox.center;
  const size = boundingBox.size;
  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = maxDimension * cameraProps.radius;

  if (cameraMode === ViewportCameraMode.PLANAR) {
    const { camsPerRing } = cameraProps;
    for (let i = 0; i < camsPerRing; i++) {
      const angle = (i / camsPerRing) * 2 * Math.PI;
      positions.push({
        position: {
          x: center.x + Math.cos(angle) * distance,
          y: center.y,
          z: center.z + Math.sin(angle) * distance,
        },
        target: center,
        index: i,
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
        positions.push({
          position: {
            x: center.x + Math.cos(azimuthAngle) * ringRadius,
            y: center.y + ringHeight,
            z: center.z + Math.sin(azimuthAngle) * ringRadius,
          },
          target: center,
          index: cameraIndex++,
        });
      }
    }
  }

  return positions;
}

/**
 * Compute bounding box of a set of meshes.
 * Direct extraction from viewportUtils.ts calculateMeshBoundingBox (lines 255–298).
 */
export function calculateMeshBoundingBox(meshes: BABYLON.AbstractMesh[]): BoundingBox | null {
  if (!meshes || meshes.length === 0) return null;

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  meshes.forEach((mesh) => {
    if (mesh.getBoundingInfo) {
      const bi = mesh.getBoundingInfo();
      const meshMin = bi.boundingBox.minimumWorld;
      const meshMax = bi.boundingBox.maximumWorld;

      min.x = Math.min(min.x, meshMin.x);
      min.y = Math.min(min.y, meshMin.y);
      min.z = Math.min(min.z, meshMin.z);
      max.x = Math.max(max.x, meshMax.x);
      max.y = Math.max(max.y, meshMax.y);
      max.z = Math.max(max.z, meshMax.z);
    }
  });

  return {
    min,
    max,
    center: {
      x: (min.x + max.x) * 0.5,
      y: (min.y + max.y) * 0.5,
      z: (min.z + max.z) * 0.5,
    },
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
  };
}

/**
 * Compute bounding box and camera positions together.
 * Direct extraction from viewportUtils.ts computeBoundingBoxAndCameraPositions (lines 300–308).
 */
export function computeBoundingBoxAndCameraPositions(
  meshes: BABYLON.AbstractMesh[],
  cameraMode: ViewportCameraMode,
  cameraProps: CameraProps,
): { boundingBox: BoundingBox | null; cameraPositions: CameraPosition[] } {
  const boundingBox = calculateMeshBoundingBox(meshes);
  const cameraPositions = calculateCameraPositions(boundingBox, cameraMode, cameraProps);
  return { boundingBox, cameraPositions };
}

/**
 * Create FreeCamera instances at calculated positions and insert frustum visualization.
 * Extracted from viewportUtils.ts useInsertCameras (lines 22–116).
 */
export function createCamerasAtPositions(
  scene: BABYLON.Scene,
  positions: CameraPosition[],
  cameraProps: CameraProps,
): BABYLON.FreeCamera[] {
  // Dispose existing frustum meshes
  scene.meshes
    .filter((m) => m.name.startsWith('frustumNearLines_'))
    .forEach((m) => m.dispose());

  return positions.map(({ position, target, index }) => {
    const cam = new BABYLON.FreeCamera(
      `camera_${index}`,
      new BABYLON.Vector3(position.x, position.y, position.z),
      scene,
    );
    cam.setTarget(new BABYLON.Vector3(target.x, target.y, target.z));
    cam.fov = BABYLON.Tools.ToRadians(cameraProps.fov);
    cam.minZ = cameraProps.minZ;
    cam.maxZ = cameraProps.maxZ;

    if (cameraProps.projection === CameraProjection.ORTHOGRAPHIC) {
      cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
      cam.orthoTop = cameraProps.orthoScale;
      cam.orthoBottom = -cameraProps.orthoScale;
      cam.orthoLeft = -cameraProps.orthoScale;
      cam.orthoRight = cameraProps.orthoScale;
    } else {
      cam.mode = BABYLON.Camera.PERSPECTIVE_CAMERA;
    }

    // Create frustum visualization lines
    const aspect = 1.0;
    const near = cam.minZ * 5;
    const nearHeight = 2 * Math.tan(cam.fov / 2) * near;
    const nearWidth = nearHeight * aspect;
    const hw = nearWidth / 2;
    const hh = nearHeight / 2;

    const nearLocal = [
      new BABYLON.Vector3(-hw, hh, near),
      new BABYLON.Vector3(hw, hh, near),
      new BABYLON.Vector3(hw, -hh, near),
      new BABYLON.Vector3(-hw, -hh, near),
    ];

    const cameraWorldMatrix = cam.getWorldMatrix();
    const nearWorld = nearLocal.map((corner) =>
      BABYLON.Vector3.TransformCoordinates(corner, cameraWorldMatrix),
    );

    const cameraPos = cam.globalPosition.clone();
    const squareLines = [
      [nearWorld[0], nearWorld[1]],
      [nearWorld[1], nearWorld[2]],
      [nearWorld[2], nearWorld[3]],
      [nearWorld[3], nearWorld[0]],
    ];
    const apexLines = nearWorld.map((corner) => [cameraPos, corner]);
    const lines = squareLines.concat(apexLines);

    const frustumMesh = BABYLON.MeshBuilder.CreateLineSystem(
      `frustumNearLines_${index}`,
      { lines, updatable: true },
      scene,
    );
    frustumMesh.layerMask = 1;
    frustumMesh.enableEdgesRendering();
    frustumMesh.edgesWidth = 1.2;
    frustumMesh.edgesColor = new BABYLON.Color4(0, 1, 0, 1);
    frustumMesh.color = BABYLON.Color3.Teal();

    return cam;
  });
}
