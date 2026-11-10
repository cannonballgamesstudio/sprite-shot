/**
 * Static Object Imaging mode — captures static sprites from multiple angles.
 * Wraps the existing CharacterViewport with renderType=STATIC.
 */

import { registerMode } from '../modeRegistry';
import type { IMode } from '../IMode';
import { ViewportCameraMode, ViewportRenderType } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';
import CharacterViewport from '../../CharacterViewport';

const staticImagingMode: IMode = {
  config: {
    id: 'static-imaging',
    label: 'Static Sprite',
    description: 'Capture static sprites from multiple camera angles',
    capabilities: {
      supportsAnimation: false,
      supportsProps: true,
      supportsVR: false,
      captureOutputType: 'spritesheet',
      supportedCameraModes: [ViewportCameraMode.PLANAR, ViewportCameraMode.SPHERICAL],
    },
  },
  ViewportComponent: CharacterViewport,
  onActivate() {
    useAppStore.getState().setRenderType(ViewportRenderType.STATIC);
  },
};

registerMode(staticImagingMode);
