import { describe, it, expect } from 'vitest';
import {
  buildTransformsJson,
  buildCOLMAPCameras,
  buildCOLMAPImages,
  buildCOLMAPPoints3D,
} from '../transforms';
import type { CameraIntrinsics, CameraExtrinsics } from '../cameraUtils';

const testIntrinsics: CameraIntrinsics = {
  camera_angle_x: 1.2,
  camera_angle_y: 0.9,
  fl_x: 600,
  fl_y: 600,
  cx: 400,
  cy: 400,
  w: 800,
  h: 800,
};

const testFrames: CameraExtrinsics[] = [
  {
    transform_matrix: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    file_path: 'images/camera_00/frame_0000.png',
  },
  {
    transform_matrix: [
      [0.707, -0.707, 0, 2],
      [0.707, 0.707, 0, 0],
      [0, 0, 1, 1],
      [0, 0, 0, 1],
    ],
    file_path: 'images/camera_01/frame_0000.png',
  },
];

describe('buildTransformsJson', () => {
  it('includes all intrinsic fields', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames);
    expect(result.camera_angle_x).toBe(1.2);
    expect(result.camera_angle_y).toBe(0.9);
    expect(result.fl_x).toBe(600);
    expect(result.fl_y).toBe(600);
    expect(result.cx).toBe(400);
    expect(result.cy).toBe(400);
    expect(result.w).toBe(800);
    expect(result.h).toBe(800);
  });

  it('includes all frames', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames);
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].file_path).toBe('images/camera_00/frame_0000.png');
    expect(result.frames[1].file_path).toBe('images/camera_01/frame_0000.png');
  });

  it('includes aabb_scale with default value', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames);
    expect(result.aabb_scale).toBe(4);
  });

  it('accepts custom aabb_scale', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames, 16);
    expect(result.aabb_scale).toBe(16);
  });

  it('produces valid JSON', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames);
    const json = JSON.stringify(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves 4x4 transform matrices', () => {
    const result = buildTransformsJson(testIntrinsics, testFrames);
    expect(result.frames[0].transform_matrix).toHaveLength(4);
    result.frames[0].transform_matrix.forEach((row) => {
      expect(row).toHaveLength(4);
    });
  });
});

describe('buildCOLMAPCameras', () => {
  it('outputs PINHOLE camera model', () => {
    const result = buildCOLMAPCameras(testIntrinsics);
    expect(result).toContain('PINHOLE');
  });

  it('includes resolution and focal lengths', () => {
    const result = buildCOLMAPCameras(testIntrinsics);
    expect(result).toContain('800 800'); // w h
    expect(result).toContain('600'); // fl_x and fl_y
    expect(result).toContain('400'); // cx and cy
  });

  it('starts with comment header', () => {
    const result = buildCOLMAPCameras(testIntrinsics);
    expect(result.startsWith('#')).toBe(true);
  });
});

describe('buildCOLMAPImages', () => {
  it('includes all frames', () => {
    const result = buildCOLMAPImages(testFrames);
    expect(result).toContain('images/camera_00/frame_0000.png');
    expect(result).toContain('images/camera_01/frame_0000.png');
  });

  it('has correct number of image entries', () => {
    const result = buildCOLMAPImages(testFrames);
    // Each image has 2 lines: data line + empty POINTS2D line
    const dataLines = result.split('\n').filter((l) => l.match(/^\d+ /));
    expect(dataLines).toHaveLength(2);
  });

  it('starts with comment header', () => {
    const result = buildCOLMAPImages(testFrames);
    expect(result.startsWith('#')).toBe(true);
  });

  it('assigns sequential image IDs', () => {
    const result = buildCOLMAPImages(testFrames);
    const dataLines = result.split('\n').filter((l) => l.match(/^\d+ /));
    expect(dataLines[0]).toMatch(/^1 /);
    expect(dataLines[1]).toMatch(/^2 /);
  });

  it('references camera ID 1', () => {
    const result = buildCOLMAPImages(testFrames);
    const dataLines = result.split('\n').filter((l) => l.match(/^\d+ /));
    // Format: IMAGE_ID QW QX QY QZ TX TY TZ CAMERA_ID NAME
    // CAMERA_ID should be 1 (second-to-last field before filename)
    dataLines.forEach((line) => {
      const parts = line.split(' ');
      expect(parts[parts.length - 2]).toBe('1');
    });
  });
});

describe('buildCOLMAPPoints3D', () => {
  it('returns a comment-only file', () => {
    const result = buildCOLMAPPoints3D();
    const lines = result.split('\n').filter((l) => l.trim());
    lines.forEach((line) => {
      expect(line.startsWith('#')).toBe(true);
    });
  });
});
