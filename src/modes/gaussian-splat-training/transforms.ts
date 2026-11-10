/**
 * NeRF transforms.json and COLMAP output generation.
 *
 * Supports two output formats:
 * 1. NeRF Synthetic / Instant-NGP: transforms.json with camera-to-world matrices
 * 2. COLMAP: cameras.txt, images.txt, points3D.txt in sparse/0/
 */

import type { CameraIntrinsics, CameraExtrinsics } from './cameraUtils';

// ── NeRF Synthetic / Instant-NGP ──────────────────────────────────

export interface TransformsJson extends CameraIntrinsics {
  aabb_scale: number;
  has_depth: boolean;
  is_dynamic: boolean;
  total_frames: number;
  frames: CameraExtrinsics[];
}

export function buildTransformsJson(
  intrinsics: CameraIntrinsics,
  frames: CameraExtrinsics[],
  aabbScale: number = 4,
): TransformsJson {
  const frameIndices = new Set(frames.map((f) => f.frame_index ?? 0));
  const hasDepth = frames.some((f) => f.depth_file_path);
  const isDynamic = frameIndices.size > 1;

  return {
    ...intrinsics,
    aabb_scale: aabbScale,
    has_depth: hasDepth,
    is_dynamic: isDynamic,
    total_frames: frameIndices.size,
    frames,
  };
}

// ── COLMAP ────────────────────────────────────────────────────────

/**
 * COLMAP cameras.txt — PINHOLE camera model.
 */
export function buildCOLMAPCameras(intrinsics: CameraIntrinsics): string {
  return [
    '# Camera list with one line of data per camera:',
    '# CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]',
    `1 PINHOLE ${intrinsics.w} ${intrinsics.h} ${intrinsics.fl_x} ${intrinsics.fl_y} ${intrinsics.cx} ${intrinsics.cy}`,
  ].join('\n');
}

/**
 * COLMAP images.txt — each image has pose as quaternion + translation.
 */
export function buildCOLMAPImages(frames: CameraExtrinsics[]): string {
  const lines = [
    '# Image list with two lines of data per image:',
    '# IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
    '# POINTS2D[] as (X, Y, POINT3D_ID)',
  ];

  frames.forEach((frame, i) => {
    const m = frame.transform_matrix;
    const { qw, qx, qy, qz } = matrixToQuaternion(m);
    const tx = m[0][3], ty = m[1][3], tz = m[2][3];

    lines.push(
      `${i + 1} ${qw} ${qx} ${qy} ${qz} ${tx} ${ty} ${tz} 1 ${frame.file_path}`,
    );
    lines.push(''); // empty POINTS2D line
  });

  return lines.join('\n');
}

/**
 * COLMAP points3D.txt — empty (no 3D points from SfM, training will create them).
 */
export function buildCOLMAPPoints3D(): string {
  return '# 3D point list with one line of data per point:\n# POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)\n';
}

// ── Helpers ───────────────────────────────────────────────────────

function matrixToQuaternion(
  m: number[][],
): { qw: number; qx: number; qy: number; qz: number } {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let qw: number, qx: number, qy: number, qz: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m[2][1] - m[1][2]) * s;
    qy = (m[0][2] - m[2][0]) * s;
    qz = (m[1][0] - m[0][1]) * s;
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]);
    qw = (m[2][1] - m[1][2]) / s;
    qx = 0.25 * s;
    qy = (m[0][1] + m[1][0]) / s;
    qz = (m[0][2] + m[2][0]) / s;
  } else if (m[1][1] > m[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]);
    qw = (m[0][2] - m[2][0]) / s;
    qx = (m[0][1] + m[1][0]) / s;
    qy = 0.25 * s;
    qz = (m[1][2] + m[2][1]) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]);
    qw = (m[1][0] - m[0][1]) / s;
    qx = (m[0][2] + m[2][0]) / s;
    qy = (m[1][2] + m[2][1]) / s;
    qz = 0.25 * s;
  }

  return { qw, qx, qy, qz };
}
