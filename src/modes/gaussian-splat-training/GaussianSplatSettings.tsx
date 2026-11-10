/**
 * Settings panel for the Gaussian Splat Training mode.
 *
 * Controls: camera count, elevation rings, output format,
 * resolution, background color.
 */

import { useState } from 'react';
import { useAppStore } from '../../state/appStore';
import type { OutputFormat } from './GaussianSplatCaptureStrategy';

export interface GaussianSplatModeConfig {
  outputFormat: OutputFormat;
  backgroundColor: [number, number, number, number];
  captureResolution: [number, number];
}

const DEFAULT_CONFIG: GaussianSplatModeConfig = {
  outputFormat: 'nerf-synthetic',
  backgroundColor: [1, 1, 1, 1], // white for segmentation
  captureResolution: [800, 800],
};

export function GaussianSplatSettings() {
  const cameraProps = useAppStore((s) => s.cameraProps);
  const setCamerasProps = useAppStore((s) => s.setCamerasProps);
  const gsplatBackground = useAppStore((s) => s.gsplatBackground);
  const setGsplatBackground = useAppStore((s) => s.setGsplatBackground);
  const [config, setConfig] = useState<GaussianSplatModeConfig>(DEFAULT_CONFIG);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888' }}>
        Gaussian Splat Training
      </div>

      {/* Camera Count */}
      <label style={{ fontSize: 12 }}>
        Cameras per ring: {cameraProps.camsPerRing}
        <input
          type="range"
          min={4}
          max={64}
          step={4}
          value={cameraProps.camsPerRing}
          onChange={(e) =>
            setCamerasProps({ ...cameraProps, camsPerRing: parseInt(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </label>

      {/* Elevation Rings */}
      <label style={{ fontSize: 12 }}>
        Elevation rings: {cameraProps.rings}
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={cameraProps.rings}
          onChange={(e) =>
            setCamerasProps({ ...cameraProps, rings: parseInt(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </label>

      <div style={{ fontSize: 11, color: '#666' }}>
        Total cameras: {cameraProps.rings * cameraProps.camsPerRing}
      </div>

      {/* Camera Distance */}
      <label style={{ fontSize: 12 }}>
        Camera distance: {cameraProps.radius.toFixed(1)}×
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={cameraProps.radius}
          onChange={(e) =>
            setCamerasProps({ ...cameraProps, radius: parseFloat(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </label>

      {/* Resolution */}
      <label style={{ fontSize: 12 }}>
        Capture resolution
        <select
          value={`${config.captureResolution[0]}x${config.captureResolution[1]}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            setConfig({ ...config, captureResolution: [w, h] });
            setCamerasProps({ ...cameraProps, resolution: [w, h] });
          }}
          style={{ width: '100%', marginTop: 4, padding: '4px 8px', background: '#333', color: '#eee', border: '1px solid #555', borderRadius: 4 }}
        >
          <option value="64x64">64 × 64</option>
          <option value="128x128">128 × 128</option>
          <option value="256x256">256 × 256</option>
          <option value="512x512">512 × 512</option>
          <option value="800x800">800 × 800</option>
          <option value="1024x1024">1024 × 1024</option>
          <option value="1920x1080">1920 × 1080</option>
        </select>
      </label>

      {/* Output Format */}
      <label style={{ fontSize: 12 }}>
        Output format
        <select
          value={config.outputFormat}
          onChange={(e) =>
            setConfig({ ...config, outputFormat: e.target.value as OutputFormat })
          }
          style={{ width: '100%', marginTop: 4, padding: '4px 8px', background: '#333', color: '#eee', border: '1px solid #555', borderRadius: 4 }}
        >
          <option value="nerf-synthetic">NeRF Synthetic (transforms.json)</option>
          <option value="colmap">COLMAP (sparse/0/)</option>
          <option value="both">Both</option>
        </select>
      </label>

      {/* Background Color */}
      <label style={{ fontSize: 12 }}>
        Background
        <select
          value={gsplatBackground[0] === 1 ? 'white' : gsplatBackground[3] === 1 ? 'black' : 'transparent'}
          onChange={(e) => {
            const bg = e.target.value === 'white'
              ? [1, 1, 1, 1] as [number, number, number, number]
              : e.target.value === 'black'
                ? [0, 0, 0, 1] as [number, number, number, number]
                : [0, 0, 0, 0] as [number, number, number, number];
            setGsplatBackground(bg);
            setConfig({ ...config, backgroundColor: bg });
          }}
          style={{ width: '100%', marginTop: 4, padding: '4px 8px', background: '#333', color: '#eee', border: '1px solid #555', borderRadius: 4 }}
        >
          <option value="white">White (segmentation)</option>
          <option value="black">Black</option>
          <option value="transparent">Transparent</option>
        </select>
      </label>

      <div style={{ fontSize: 10, color: '#666', marginTop: 8, lineHeight: 1.5 }}>
        Output is compatible with nerfstudio, gsplat, and 3DGS training pipelines.
        Use "Capture Animation" to generate training data.
      </div>
    </div>
  );
}

/** Get the current gaussian splat config (for use by capture orchestration) */
export function getGaussianSplatConfig(): GaussianSplatModeConfig {
  return DEFAULT_CONFIG;
}
