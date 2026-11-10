/**
 * VR IK FPS Arms mode — experimental VR arm animation capture.
 * Wraps the existing CombinedViewport.
 */

import { registerMode } from '../modeRegistry';
import type { IMode } from '../IMode';
import { ViewportCameraMode } from '../../state/viewportStore';
import CombinedViewport from '../../CombinedViewport';

const vrIkFpsMode: IMode = {
  config: {
    id: 'vr-ik-fps',
    label: 'FPS Arms (VR)',
    description: 'Experimental VR IK rigged animated arms for FPS animations',
    capabilities: {
      supportsAnimation: true,
      supportsProps: false,
      supportsVR: true,
      captureOutputType: 'image-sequence',
      supportedCameraModes: [ViewportCameraMode.PLANAR],
    },
  },
  ViewportComponent: CombinedViewport,
};

registerMode(vrIkFpsMode);
