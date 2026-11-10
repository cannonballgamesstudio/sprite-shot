import { describe, it, expect } from 'vitest';
import {
  calculateCameraPositions,
  calculateMeshBoundingBox,
  computeBoundingBoxAndCameraPositions,
} from '../CameraRig';
import { ViewportCameraMode, type BoundingBox, type CameraProps } from '../../../state/viewportStore';

const defaultCameraProps: CameraProps = {
  projection: 1,
  resolution: [256, 256],
  fov: 75,
  minZ: 0.01,
  maxZ: 1000,
  orthoScale: 1,
  radius: 2,
  rings: 5,
  camsPerRing: 12,
  animateEachCamera: false,
};

const testBoundingBox: BoundingBox = {
  min: { x: -1, y: 0, z: -1 },
  max: { x: 1, y: 2, z: 1 },
  center: { x: 0, y: 1, z: 0 },
  size: { x: 2, y: 2, z: 2 },
};

describe('calculateCameraPositions', () => {
  it('returns empty array for null bounding box', () => {
    const result = calculateCameraPositions(null, ViewportCameraMode.PLANAR, defaultCameraProps);
    expect(result).toEqual([]);
  });

  describe('PLANAR mode', () => {
    it('creates correct number of cameras', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      expect(result).toHaveLength(12);
    });

    it('cameras are at same Y as bounding box center', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      result.forEach((cam) => {
        expect(cam.position.y).toBe(testBoundingBox.center.y);
      });
    });

    it('cameras form a circle at correct distance', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      const maxDim = Math.max(testBoundingBox.size.x, testBoundingBox.size.y, testBoundingBox.size.z);
      const expectedDist = maxDim * defaultCameraProps.radius;

      result.forEach((cam) => {
        const dx = cam.position.x - testBoundingBox.center.x;
        const dz = cam.position.z - testBoundingBox.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        expect(dist).toBeCloseTo(expectedDist, 5);
      });
    });

    it('cameras are evenly spaced in angle', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      const angles = result.map((cam) =>
        Math.atan2(
          cam.position.z - testBoundingBox.center.z,
          cam.position.x - testBoundingBox.center.x,
        ),
      );
      for (let i = 1; i < angles.length; i++) {
        let diff = angles[i] - angles[i - 1];
        if (diff < 0) diff += 2 * Math.PI;
        expect(diff).toBeCloseTo((2 * Math.PI) / 12, 5);
      }
    });

    it('all cameras target the bounding box center', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      result.forEach((cam) => {
        expect(cam.target).toEqual(testBoundingBox.center);
      });
    });

    it('indexes are sequential starting from 0', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.PLANAR,
        defaultCameraProps,
      );
      result.forEach((cam, i) => {
        expect(cam.index).toBe(i);
      });
    });

    it('respects custom camsPerRing', () => {
      const props = { ...defaultCameraProps, camsPerRing: 8 };
      const result = calculateCameraPositions(testBoundingBox, ViewportCameraMode.PLANAR, props);
      expect(result).toHaveLength(8);
    });
  });

  describe('SPHERICAL mode', () => {
    it('creates rings × camsPerRing cameras', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.SPHERICAL,
        defaultCameraProps,
      );
      expect(result).toHaveLength(5 * 12); // 60
    });

    it('cameras span different elevations', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.SPHERICAL,
        defaultCameraProps,
      );
      const yValues = result.map((cam) => cam.position.y);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      // Should have cameras above and below center
      expect(minY).toBeLessThan(testBoundingBox.center.y);
      expect(maxY).toBeGreaterThan(testBoundingBox.center.y);
    });

    it('indexes are sequential across all rings', () => {
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.SPHERICAL,
        defaultCameraProps,
      );
      result.forEach((cam, i) => {
        expect(cam.index).toBe(i);
      });
    });

    it('respects custom rings and camsPerRing', () => {
      const props = { ...defaultCameraProps, rings: 3, camsPerRing: 8 };
      const result = calculateCameraPositions(
        testBoundingBox,
        ViewportCameraMode.SPHERICAL,
        props,
      );
      expect(result).toHaveLength(24);
    });

    it('respects an explicit elevation band (crowd contract: full sphere [-80°, +80°], 5 rings)', () => {
      const props = { ...defaultCameraProps, rings: 5, camsPerRing: 8,
                      elevationMinDeg: -80, elevationMaxDeg: 80 };
      const result = calculateCameraPositions(testBoundingBox, ViewportCameraMode.SPHERICAL, props);
      const distance = 2 * props.radius; // maxDimension(2) * radius
      const cy = testBoundingBox.center.y;
      expect(result).toHaveLength(40);
      // ring 0 = lowest elevation (-80°, worm's-eye/from-below) → top row of the composited sheet
      expect(result[0].position.y).toBeCloseTo(cy + Math.sin((-80 * Math.PI) / 180) * distance, 5);
      // ring 2 = band center (0°, horizon) — the new centered middle ring
      expect(result[2 * 8].position.y).toBeCloseTo(cy, 5);
      // last ring = +80° (bird's-eye/from-above)
      expect(result[4 * 8].position.y).toBeCloseTo(cy + Math.sin((80 * Math.PI) / 180) * distance, 5);
    });

    it('defaults to the legacy ±63° band when no band is set', () => {
      const props = { ...defaultCameraProps, rings: 4, camsPerRing: 8 };
      const result = calculateCameraPositions(testBoundingBox, ViewportCameraMode.SPHERICAL, props);
      expect(result[0].position.y)
        .toBeCloseTo(testBoundingBox.center.y + Math.sin(-(Math.PI * 0.7) / 2) * 4, 5);
    });
  });
});

describe('calculateMeshBoundingBox', () => {
  it('returns null for empty array', () => {
    expect(calculateMeshBoundingBox([])).toBeNull();
  });

  it('computes correct bounding box from mock meshes', () => {
    const mockMeshes = [
      {
        getBoundingInfo: () => ({
          boundingBox: {
            minimumWorld: { x: -1, y: 0, z: -1 },
            maximumWorld: { x: 1, y: 2, z: 1 },
          },
        }),
      },
      {
        getBoundingInfo: () => ({
          boundingBox: {
            minimumWorld: { x: -2, y: -1, z: 0 },
            maximumWorld: { x: 0, y: 3, z: 2 },
          },
        }),
      },
    ] as any;

    const result = calculateMeshBoundingBox(mockMeshes);
    expect(result).not.toBeNull();
    expect(result!.min).toEqual({ x: -2, y: -1, z: -1 });
    expect(result!.max).toEqual({ x: 1, y: 3, z: 2 });
    expect(result!.center.x).toBeCloseTo(-0.5);
    expect(result!.center.y).toBeCloseTo(1);
    expect(result!.center.z).toBeCloseTo(0.5);
    expect(result!.size).toEqual({ x: 3, y: 4, z: 3 });
  });

  it('handles meshes without getBoundingInfo', () => {
    const mockMeshes = [
      {}, // no getBoundingInfo
      {
        getBoundingInfo: () => ({
          boundingBox: {
            minimumWorld: { x: 0, y: 0, z: 0 },
            maximumWorld: { x: 1, y: 1, z: 1 },
          },
        }),
      },
    ] as any;

    const result = calculateMeshBoundingBox(mockMeshes);
    expect(result).not.toBeNull();
    expect(result!.min).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('computeBoundingBoxAndCameraPositions', () => {
  it('returns both bounding box and camera positions', () => {
    const mockMeshes = [
      {
        getBoundingInfo: () => ({
          boundingBox: {
            minimumWorld: { x: -1, y: 0, z: -1 },
            maximumWorld: { x: 1, y: 2, z: 1 },
          },
        }),
      },
    ] as any;

    const result = computeBoundingBoxAndCameraPositions(
      mockMeshes,
      ViewportCameraMode.PLANAR,
      defaultCameraProps,
    );

    expect(result.boundingBox).not.toBeNull();
    expect(result.cameraPositions).toHaveLength(12);
  });
});
