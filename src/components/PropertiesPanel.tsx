/**
 * PropertiesPanel — 280px right panel with accordion sections.
 * Replaces the floating panel stack from CharacterViewport.
 */

import { Accordion } from '@mantine/core';
import {
  useViewportStore,
  ViewportCameraMode,
  CameraProjection,
} from '../state/viewportStore';
import { useAppStore } from '../state/appStore';
import { GaussianSplatSettings } from '../modes/gaussian-splat-training/GaussianSplatSettings';
import { TrainingPanel } from '../modes/gaussian-splat-training/TrainingPanel';
import SceneTree from '../panels/SceneTree';
import { PropManager } from '../panels/PropManager';
import type { ExportFormat } from '../state/slices/viewportSlice';

export function PropertiesPanel() {
  const cameraMode = useViewportStore((s) => s.cameraMode);
  const cameraProps = useViewportStore((s) => s.cameraProps);
  const setCameraMode = useViewportStore((s) => s.setCameraMode);
  const exportFormat = useAppStore((s) => s.exportFormat);
  const setExportFormat = useAppStore((s) => s.setExportFormat);
  const availableBones = useAppStore((s) => s.availableBones);
  const loadedMeshId = useAppStore((s) => s.loadedMeshId);

  const handleCameraPropChange = (key: keyof typeof cameraProps, value: any) => {
    useViewportStore.getState().setCamerasProps({
      ...cameraProps,
      [key]: value,
    });
  };

  const handleResolutionChange = (value: number) => {
    handleCameraPropChange('resolution', [value, value]);
  };

  return (
    <div className="bg-panel border-l border-panel-border overflow-y-auto overflow-x-hidden">
      <Accordion
        multiple
        defaultValue={['camera', 'export']}
        styles={{
          control: { padding: '6px 10px', minHeight: 28, background: 'var(--color-header)' },
          label: { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--color-fg)', fontWeight: 600 },
          panel: { padding: '8px 10px' },
          item: { borderBottom: '1px solid var(--color-panel-border)', background: 'transparent' },
          chevron: { color: 'var(--color-fg-muted)', width: 14, height: 14 },
        }}
      >
        {/* -- Camera --------------------------------- */}
        <Accordion.Item value="camera">
          <Accordion.Control>Camera</Accordion.Control>
          <Accordion.Panel>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
              <label className="text-[10px] text-fg-muted whitespace-nowrap">Mode</label>
              <select
                value={cameraMode}
                onChange={(e) => setCameraMode(parseInt(e.target.value))}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              >
                <option value={ViewportCameraMode.PLANAR}>Planar (2D)</option>
                <option value={ViewportCameraMode.SPHERICAL}>Spherical (3D)</option>
              </select>

              <label className="text-[10px] text-fg-muted whitespace-nowrap">Projection</label>
              <select
                value={cameraProps.projection}
                onChange={(e) => handleCameraPropChange('projection', parseInt(e.target.value))}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              >
                <option value={CameraProjection.ORTHOGRAPHIC}>Orthographic</option>
                <option value={CameraProjection.PERSPECTIVE}>Perspective</option>
              </select>

              <label className="text-[10px] text-fg-muted whitespace-nowrap">Resolution</label>
              <input
                type="number"
                value={cameraProps.resolution[0]}
                onChange={(e) => handleResolutionChange(parseInt(e.target.value))}
                min={1} max={4096}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              />

              {cameraProps.projection === CameraProjection.PERSPECTIVE && (
                <>
                  <label className="text-[10px] text-fg-muted whitespace-nowrap">FOV</label>
                  <input
                    type="number"
                    value={cameraProps.fov}
                    onChange={(e) => handleCameraPropChange('fov', parseFloat(e.target.value))}
                    min={1} max={180} step={1}
                    className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
                  />
                </>
              )}

              {cameraProps.projection === CameraProjection.ORTHOGRAPHIC && (
                <>
                  <label className="text-[10px] text-fg-muted whitespace-nowrap">Ortho Scale</label>
                  <input
                    type="number"
                    value={cameraProps.orthoScale}
                    onChange={(e) => handleCameraPropChange('orthoScale', parseFloat(e.target.value))}
                    min={0.1} max={100} step={0.1}
                    className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
                  />
                </>
              )}

              <label className="text-[10px] text-fg-muted whitespace-nowrap">Radius</label>
              <input
                type="number"
                value={cameraProps.radius}
                onChange={(e) => handleCameraPropChange('radius', parseFloat(e.target.value))}
                min={0.1} max={10} step={0.01}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              />

              {cameraMode === ViewportCameraMode.SPHERICAL && (
                <>
                  <label className="text-[10px] text-fg-muted whitespace-nowrap">Rings</label>
                  <input
                    type="number"
                    value={cameraProps.rings}
                    onChange={(e) => handleCameraPropChange('rings', parseInt(e.target.value))}
                    min={1} max={100}
                    className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
                  />
                </>
              )}

              <label className="text-[10px] text-fg-muted whitespace-nowrap">
                Cameras / {cameraMode === ViewportCameraMode.SPHERICAL ? 'Ring' : 'Circle'}
              </label>
              <input
                type="number"
                value={cameraProps.camsPerRing}
                onChange={(e) => handleCameraPropChange('camsPerRing', parseInt(e.target.value))}
                min={1} max={64}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              />

              <label className="text-[10px] text-fg-muted whitespace-nowrap">Near Clip</label>
              <input
                type="number"
                value={cameraProps.minZ}
                onChange={(e) => handleCameraPropChange('minZ', parseFloat(e.target.value))}
                min={0.001} max={1} step={0.001}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              />

              <label className="text-[10px] text-fg-muted whitespace-nowrap">Far Clip</label>
              <input
                type="number"
                value={cameraProps.maxZ}
                onChange={(e) => handleCameraPropChange('maxZ', parseFloat(e.target.value))}
                min={1} max={10000}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              />

              <label className="col-span-2 text-[10px] text-fg">
                <input
                  type="checkbox"
                  checked={cameraProps.animateEachCamera}
                  onChange={(e) => handleCameraPropChange('animateEachCamera', e.target.checked)}
                  className="accent-blue-500 mr-2"
                />
                Animate Each Camera
              </label>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* -- Export ---------------------------------- */}
        <Accordion.Item value="export">
          <Accordion.Control>Export</Accordion.Control>
          <Accordion.Panel>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
              <label className="text-[10px] text-fg-muted whitespace-nowrap">Format</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="w-full h-5 px-1.5 text-[11px] bg-input border border-input-border rounded-sm text-fg outline-none text-center focus:border-accent"
              >
                <option value="spritesheet">Spritesheet</option>
                <option value="animation-spritesheet">Animation Spritesheet</option>
                <option value="gaussian-splat">Gaussian Splat Training</option>
              </select>
            </div>
            {exportFormat === 'gaussian-splat' && (
              <>
                <GaussianSplatSettings />
                <TrainingPanel />
              </>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        {/* -- Scene (SceneTree has its own accordion) -- */}
        <div className="border-b border-panel-border">
          <SceneTree />
        </div>

        {/* -- Props ----------------------------------- */}
        <Accordion.Item value="props">
          <Accordion.Control>Props</Accordion.Control>
          <Accordion.Panel>
            <PropManager
              availableBones={availableBones}
              selectedPropId={null}
              onSelectProp={() => {}}
              loadedMeshId={loadedMeshId}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
