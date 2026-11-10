/**
 * Camera matrix extraction: Babylon.js → NeRF/3DGS convention.
 *
 * NeRF Synthetic format expects:
 * - camera_angle_x/y: FOV in radians
 * - fl_x/fl_y: focal length in pixels
 * - cx/cy: principal point (image center)
 * - transform_matrix: 4×4 camera-to-world, row-major
 *
 * Babylon.js uses a left-handed coordinate system internally.
 * NeRF/3DGS uses right-handed (OpenGL convention) with Y-up.
 * We convert by flipping the Z axis.
 */

import * as BABYLON from '@babylonjs/core';

export interface CameraIntrinsics {
  camera_angle_x: number;
  camera_angle_y: number;
  fl_x: number;
  fl_y: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface CameraExtrinsics {
  transform_matrix: number[][];
  file_path: string;
  depth_file_path?: string;
  frame_index?: number;
  time?: number;
}

/**
 * Extract NeRF-compatible intrinsics from a Babylon.js camera.
 */
export function extractIntrinsics(
  camera: BABYLON.Camera,
  width: number,
  height: number,
): CameraIntrinsics {
  const fovY = camera.fov; // Babylon stores vertical FOV in radians
  const aspect = width / height;
  const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);

  const fl_y = height / (2 * Math.tan(fovY / 2));
  const fl_x = width / (2 * Math.tan(fovX / 2));

  return {
    camera_angle_x: fovX,
    camera_angle_y: fovY,
    fl_x,
    fl_y,
    cx: width / 2,
    cy: height / 2,
    w: width,
    h: height,
  };
}

/**
 * Extract camera-to-world transform matrix from a Babylon.js camera.
 * Returns 4×4 row-major matrix for nerfstudio/brush consumption.
 *
 * We construct the c2w to match EXACTLY how Babylon rendered the image,
 * using Babylon's LH basis (computed by LookAtLH). Then we convert to
 * nerfstudio's OpenGL convention by negating the X axis (right), which:
 *   - Changes handedness from LH to RH (det stays +1)
 *   - Mirrors the horizontal projection, but since brush uses the same
 *     c2w to project, the mirror is consistent between image and pose
 *
 * Babylon LH: right = cross(up, forward)
 * OpenGL RH:  right = cross(forward, up) = -cross(up, forward)
 *
 * So: c2w_opengl = [−right_LH, up_LH, −forward_LH, position]
 * This has det = (−1)(+1)(−1) * det_LH = +1 ✓
 *
 * Brush then applies y_axis *= -1, z_axis *= -1 to get its internal convention.
 */
export function extractExtrinsics(camera: BABYLON.Camera): number[][] {
  const pos = camera.position;

  // Get the target the camera is looking at
  let target: BABYLON.Vector3;
  if (camera instanceof BABYLON.FreeCamera && camera.getTarget) {
    target = camera.getTarget();
  } else {
    target = BABYLON.Vector3.Zero();
  }

  // Compute Babylon's LH basis (same as LookAtLH)
  const forward = target.subtract(pos).normalize();
  const worldUp = BABYLON.Vector3.Up(); // (0, 1, 0)

  // LH: right = cross(up, forward)
  let rightLH = BABYLON.Vector3.Cross(worldUp, forward).normalize();

  // Handle degenerate case: camera looking straight up/down
  if (rightLH.length() < 0.001) {
    rightLH = BABYLON.Vector3.Cross(new BABYLON.Vector3(0, 0, 1), forward).normalize();
  }

  // LH: up = cross(forward, right)
  const upLH = BABYLON.Vector3.Cross(forward, rightLH).normalize();

  // Babylon is LH, nerfstudio is RH. Converting requires a reflection (det=-1),
  // but brush needs det=+1. Solution: negate right AND forward (det=+1),
  // which mirrors the horizontal projection. We compensate by horizontally
  // flipping each captured image (see renderFromCamera).
  //
  // c2w columns: [-right_LH, up_LH, -forward_LH, position]
  // det = (-1)(+1)(-1) * det_LH = +1 ✓
  //
  // After brush's y/z flip: [-right, -up, forward, pos]
  //   pixel_x = fx * (-Xc) / Zc + cx  → horizontally mirrored (image flip compensates)
  //   pixel_y = fy * (-Yc) / Zc + cy  → matches Babylon's cy - fy*Yc/Zc ✓
  return [
    [-rightLH.x,  upLH.x,  -forward.x,  pos.x],
    [-rightLH.y,  upLH.y,  -forward.y,  pos.y],
    [-rightLH.z,  upLH.z,  -forward.z,  pos.z],
    [0,           0,        0,           1    ],
  ];
}
