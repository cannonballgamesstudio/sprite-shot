/**
 * Gaussian Splat Training mode registration.
 *
 * Captures multi-view animated sequences for training animated gaussian
 * splat models (GauHuman, 3DGS-Avatar, RigGS, LHM).
 *
 * Uses CharacterViewport for the 3D viewport, with a dense spherical
 * camera rig and its own capture strategy + settings panel.
 */

import { registerMode } from '../modeRegistry';
import type { IMode } from '../IMode';
import { ViewportCameraMode, ViewportRenderType } from '../../state/viewportStore';
import { useAppStore } from '../../state/appStore';
import CharacterViewport from '../../CharacterViewport';
import { GaussianSplatCaptureStrategy } from './GaussianSplatCaptureStrategy';
import { GaussianSplatSettings } from './GaussianSplatSettings';

const gaussianSplatMode: IMode = {
  config: {
    id: 'gaussian-splat-training',
    label: 'Gaussian Splat',
    description: 'Capture multi-view animated sequences for gaussian splat training',
    capabilities: {
      supportsAnimation: true,
      supportsProps: true,
      supportsVR: false,
      captureOutputType: 'training-data',
      supportedCameraModes: [ViewportCameraMode.SPHERICAL],
    },
  },
  ViewportComponent: CharacterViewport,
  SettingsPanel: GaussianSplatSettings,
  captureStrategy: new GaussianSplatCaptureStrategy(),
  onActivate() {
    const store = useAppStore.getState();
    store.setCameraMode(ViewportCameraMode.SPHERICAL);
    store.setRenderType(ViewportRenderType.ANIMATED);
    store.setCamerasProps({
      ...store.cameraProps,
      rings: 5,
      camsPerRing: 16,
    });
  },
};

registerMode(gaussianSplatMode);
