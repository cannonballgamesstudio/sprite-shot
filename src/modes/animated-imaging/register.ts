/**
 * Animated Rigged Object Imaging mode — captures animation frame sequences.
 * Wraps the existing CharacterViewport with renderType=ANIMATED.
 */

import { registerMode } from '../modeRegistry';
import type { IMode } from '../IMode';
import { ViewportCameraMode, ViewportRenderType } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';
import CharacterViewport from '../../CharacterViewport';

const animatedImagingMode: IMode = {
  config: {
    id: 'animated-imaging',
    label: 'Animated Sprite',
    description: 'Capture animation frame sequences as spritesheets',
    capabilities: {
      supportsAnimation: true,
      supportsProps: true,
      supportsVR: false,
      captureOutputType: 'spritesheet',
      supportedCameraModes: [ViewportCameraMode.PLANAR, ViewportCameraMode.SPHERICAL],
    },
  },
  ViewportComponent: CharacterViewport,
  onActivate() {
    useAppStore.getState().setRenderType(ViewportRenderType.ANIMATED);
  },
};

registerMode(animatedImagingMode);
