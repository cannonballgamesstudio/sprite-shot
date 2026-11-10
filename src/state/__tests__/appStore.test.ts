import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../appStore';
import { ViewportCameraMode, ViewportRenderType, CameraProjection } from '../viewportStore';

// Reset store between tests
beforeEach(() => {
  useAppStore.setState({
    activeMode: 'static-imaging',
    cameraMode: ViewportCameraMode.SPHERICAL,
    renderType: ViewportRenderType.STATIC,
    currentMeshPath: null,
    pixelSize: 1,
    recenterCamerasTrigger: 0,
    cameraProps: {
      projection: CameraProjection.PERSPECTIVE,
      resolution: [256, 256],
      fov: 75,
      minZ: 0.01,
      maxZ: 1000,
      orthoScale: 1,
      radius: 2,
      rings: 5,
      camsPerRing: 12,
      animateEachCamera: false,
    },
    exportProps: { numPerRow: 8 },
    animations: [],
    selectedIndex: null,
    isPlaying: false,
    currentFrame: 0,
    enableRootMotion: false,
    reloadAnimationTrigger: 0,
    selectedMeshId: null,
    loadedMeshes: [],
    loadedAnimations: [],
  });
});

describe('appStore — mode slice', () => {
  it('defaults to static-imaging mode', () => {
    expect(useAppStore.getState().activeMode).toBe('static-imaging');
  });

  it('setActiveMode changes the active mode', () => {
    useAppStore.getState().setActiveMode('gaussian-splat-training');
    expect(useAppStore.getState().activeMode).toBe('gaussian-splat-training');
  });
});

describe('appStore — viewport slice', () => {
  it('setCameraMode updates camera mode', () => {
    useAppStore.getState().setCameraMode(ViewportCameraMode.PLANAR);
    expect(useAppStore.getState().cameraMode).toBe(ViewportCameraMode.PLANAR);
  });

  it('setRenderType updates render type', () => {
    useAppStore.getState().setRenderType(ViewportRenderType.ANIMATED);
    expect(useAppStore.getState().renderType).toBe(ViewportRenderType.ANIMATED);
  });

  it('setCamerasProps updates camera props', () => {
    const newProps = { ...useAppStore.getState().cameraProps, camsPerRing: 24 };
    useAppStore.getState().setCamerasProps(newProps);
    expect(useAppStore.getState().cameraProps.camsPerRing).toBe(24);
  });

  it('setCurrentMeshPath updates mesh path', () => {
    useAppStore.getState().setCurrentMeshPath('/path/to/mesh.glb');
    expect(useAppStore.getState().currentMeshPath).toBe('/path/to/mesh.glb');
  });

  it('triggerRecenterCameras updates trigger timestamp', () => {
    const before = useAppStore.getState().recenterCamerasTrigger;
    useAppStore.getState().triggerRecenterCameras();
    expect(useAppStore.getState().recenterCamerasTrigger).toBeGreaterThan(before);
  });
});

describe('appStore — animation slice', () => {
  it('addAnimation adds and selects new animation', () => {
    useAppStore.getState().addAnimation({ name: 'Walk' });
    const state = useAppStore.getState();
    expect(state.animations).toHaveLength(1);
    expect(state.animations[0].name).toBe('Walk');
    expect(state.selectedIndex).toBe(0);
  });

  it('removeAnimation removes and adjusts selection', () => {
    useAppStore.getState().addAnimation({ name: 'Walk' });
    useAppStore.getState().addAnimation({ name: 'Run' });
    const id = useAppStore.getState().animations[0].id;
    useAppStore.getState().removeAnimation(id);
    expect(useAppStore.getState().animations).toHaveLength(1);
    expect(useAppStore.getState().animations[0].name).toBe('Run');
  });

  it('getSelectedAnimation returns correct animation', () => {
    useAppStore.getState().addAnimation({ name: 'Idle' });
    useAppStore.getState().addAnimation({ name: 'Jump' });
    useAppStore.getState().selectAnimation(1);
    expect(useAppStore.getState().getSelectedAnimation()?.name).toBe('Jump');
  });

  it('play/pause/stop control playback state', () => {
    useAppStore.getState().play();
    expect(useAppStore.getState().isPlaying).toBe(true);
    useAppStore.getState().pause();
    expect(useAppStore.getState().isPlaying).toBe(false);
    useAppStore.getState().setCurrentFrame(10);
    useAppStore.getState().stop();
    expect(useAppStore.getState().currentFrame).toBe(0);
  });

  it('setCurrentFrame clamps to trim range', () => {
    useAppStore.getState().addAnimation({ name: 'Test', trimStart: 5, trimEnd: 20 });
    useAppStore.getState().setCurrentFrame(25);
    expect(useAppStore.getState().currentFrame).toBe(20);
    useAppStore.getState().setCurrentFrame(2);
    expect(useAppStore.getState().currentFrame).toBe(5);
  });

  it('toggleRootMotion toggles and increments reload trigger', () => {
    const before = useAppStore.getState().reloadAnimationTrigger;
    useAppStore.getState().toggleRootMotion();
    expect(useAppStore.getState().enableRootMotion).toBe(true);
    expect(useAppStore.getState().reloadAnimationTrigger).toBe(before + 1);
  });

  it('resetAnimations clears everything', () => {
    useAppStore.getState().addAnimation({ name: 'A' });
    useAppStore.getState().addAnimation({ name: 'B' });
    useAppStore.getState().play();
    useAppStore.getState().resetAnimations();
    const state = useAppStore.getState();
    expect(state.animations).toEqual([]);
    expect(state.selectedIndex).toBeNull();
    expect(state.isPlaying).toBe(false);
    expect(state.currentFrame).toBe(0);
  });
});

describe('appStore — scene tree slice', () => {
  it('starts with default mesh and animation sections', () => {
    const tree = useAppStore.getState().meshTree;
    expect(tree).toHaveLength(2);
    expect(tree[0].value).toBe('meshes-section');
    expect(tree[1].value).toBe('animations-section');
  });

  it('setSelectedMeshId updates selection', () => {
    useAppStore.getState().setSelectedMeshId('mesh-123');
    expect(useAppStore.getState().selectedMeshId).toBe('mesh-123');
  });

  it('addLoadedMesh adds to tree and list', () => {
    useAppStore.getState().addLoadedMesh('/path/hero.glb', {
      label: 'Hero',
      value: '/path/hero.glb',
      type: 'mesh',
      id: 'mesh-1',
    });
    expect(useAppStore.getState().loadedMeshes).toContain('/path/hero.glb');
    const meshSection = useAppStore.getState().meshTree[0];
    expect(meshSection.children).toHaveLength(1);
  });

  it('removeLoadedMesh removes from tree and list', () => {
    useAppStore.getState().addLoadedMesh('/path/hero.glb', {
      label: 'Hero',
      value: '/path/hero.glb',
      type: 'mesh',
      id: 'mesh-1',
    });
    useAppStore.getState().removeLoadedMesh('/path/hero.glb');
    expect(useAppStore.getState().loadedMeshes).toHaveLength(0);
  });

  it('addLoadedAnimation adds to animation section', () => {
    useAppStore.getState().addLoadedAnimation('/path/walk.glb', {
      label: 'Walk',
      value: '/path/walk.glb',
      type: 'animation',
      id: 'anim-1',
    });
    expect(useAppStore.getState().loadedAnimations).toContain('/path/walk.glb');
    const animSection = useAppStore.getState().meshTree[1];
    expect(animSection.children).toHaveLength(1);
  });

  it('initializeTree resets to default sections', () => {
    useAppStore.getState().addLoadedMesh('/path/hero.glb', {
      label: 'Hero', value: '/path/hero.glb', type: 'mesh', id: 'mesh-1',
    });
    useAppStore.getState().initializeTree();
    const tree = useAppStore.getState().meshTree;
    expect(tree).toHaveLength(2);
    expect(tree[0].children).toHaveLength(0);
  });
});

describe('appStore — cross-slice interaction', () => {
  it('all slices are accessible from the same store', () => {
    const state = useAppStore.getState();

    // Mode
    expect(state.activeMode).toBeDefined();
    // Viewport
    expect(state.cameraMode).toBeDefined();
    expect(state.cameraProps).toBeDefined();
    // Animation
    expect(state.animations).toBeDefined();
    expect(state.isPlaying).toBeDefined();
    // Scene tree
    expect(state.meshTree).toBeDefined();
    expect(state.selectedMeshId).toBeDefined();
  });

  it('changing mode and viewport in sequence works', () => {
    useAppStore.getState().setActiveMode('gaussian-splat-training');
    useAppStore.getState().setCameraMode(ViewportCameraMode.SPHERICAL);
    useAppStore.getState().setCamerasProps({
      ...useAppStore.getState().cameraProps,
      camsPerRing: 16,
      rings: 5,
    });

    const state = useAppStore.getState();
    expect(state.activeMode).toBe('gaussian-splat-training');
    expect(state.cameraMode).toBe(ViewportCameraMode.SPHERICAL);
    expect(state.cameraProps.camsPerRing).toBe(16);
  });
});
