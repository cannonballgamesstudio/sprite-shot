import { describe, it, expect } from 'vitest';
import * as BABYLON from '@babylonjs/core';
import { extractIntrinsics, extractExtrinsics } from '../cameraUtils';

// Minimal FreeCamera stand-in: passes the instanceof check without a Scene/Engine.
function makeLookAtCamera(position: BABYLON.Vector3, target: BABYLON.Vector3): BABYLON.Camera {
  const cam = Object.create(BABYLON.FreeCamera.prototype);
  Object.defineProperty(cam, 'position', { value: position });
  Object.defineProperty(cam, 'getTarget', { value: () => target });
  return cam as BABYLON.Camera;
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

describe('extractIntrinsics', () => {
  it('computes correct focal length from FOV', () => {
    const fovY = Math.PI / 3; // 60 degrees
    const width = 800;
    const height = 800;

    const result = extractIntrinsics({ fov: fovY } as any, width, height);

    const expectedFlY = height / (2 * Math.tan(fovY / 2));
    expect(result.fl_y).toBeCloseTo(expectedFlY, 5);
    expect(result.fl_x).toBeCloseTo(expectedFlY, 5); // square aspect
    expect(result.camera_angle_y).toBeCloseTo(fovY, 5);
  });

  it('computes correct FOV for non-square aspect', () => {
    const fovY = Math.PI / 4; // 45 degrees
    const width = 1920;
    const height = 1080;

    const result = extractIntrinsics({ fov: fovY } as any, width, height);

    const aspect = width / height;
    const expectedFovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);
    expect(result.camera_angle_x).toBeCloseTo(expectedFovX, 5);
    expect(result.camera_angle_y).toBeCloseTo(fovY, 5);
  });

  it('sets principal point at image center', () => {
    const result = extractIntrinsics({ fov: 1.0 } as any, 800, 600);
    expect(result.cx).toBe(400);
    expect(result.cy).toBe(300);
    expect(result.w).toBe(800);
    expect(result.h).toBe(600);
  });
});

describe('extractExtrinsics', () => {
  it('returns a 4x4 matrix with a homogeneous bottom row', () => {
    const result = extractExtrinsics(makeLookAtCamera(new BABYLON.Vector3(0, 0, -5), BABYLON.Vector3.Zero()));
    expect(result).toHaveLength(4);
    result.forEach((row) => expect(row).toHaveLength(4));
    expect(result[3]).toEqual([0, 0, 0, 1]);
  });

  it('camera on -Z looking at origin maps to [-right, up, -forward, pos]', () => {
    const result = extractExtrinsics(makeLookAtCamera(new BABYLON.Vector3(0, 0, -5), BABYLON.Vector3.Zero()));
    const expected = [
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, -1, -5],
      [0, 0, 0, 1],
    ];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(result[r][c]).toBeCloseTo(expected[r][c], 5);
      }
    }
  });

  it('carries the camera position as translation and keeps det = +1', () => {
    const pos = new BABYLON.Vector3(5, 3, -2);
    const result = extractExtrinsics(makeLookAtCamera(pos, new BABYLON.Vector3(0, 1, 0)));
    expect(result[0][3]).toBeCloseTo(5);
    expect(result[1][3]).toBeCloseTo(3);
    expect(result[2][3]).toBeCloseTo(-2);
    expect(det3(result)).toBeCloseTo(1, 5);
  });

  it('handles a camera looking straight down without NaNs', () => {
    const result = extractExtrinsics(makeLookAtCamera(new BABYLON.Vector3(0, 10, 0), BABYLON.Vector3.Zero()));
    result.flat().forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(det3(result)).toBeCloseTo(1, 5);
  });
});
