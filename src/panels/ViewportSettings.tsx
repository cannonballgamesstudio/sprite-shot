import React, { useEffect, useRef, useState } from 'react';
import {
  useViewportStore,
  ViewportCameraMode,
  ViewportRenderType,
  CameraProjection,
} from '../state/viewportStore';

export const ViewportSettings: React.FC = () => {
  const { cameraMode, renderType, cameraProps, setCameraMode, setRenderType } = useViewportStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const handleCameraPropChange = (key: keyof typeof cameraProps, value: any) => {
    useViewportStore.getState().setCamerasProps({
      ...cameraProps,
      [key]: value,
    });
  };

  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      const maxHeight = 384; // max-h-96 = 384px
      setContentHeight(Math.min(fullHeight, maxHeight));
    }
  }, [isExpanded, cameraMode, cameraProps.projection]);

  const handleResolutionChange = (value: number) => {
    const newResolution = [...cameraProps.resolution];
    newResolution[0] = value;
    newResolution[1] = value;
    handleCameraPropChange('resolution', newResolution);
  };

  return (
    <div className="text-gray-300">
      {/* Collapsible Header */}
      <div
        className="flex items-center justify-between p-3 transition-colors hover:text-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          Render Settings
        </h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 hover:text-white ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {/* Collapsible Content with Slide Animation */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          height: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          ref={contentRef}
          className={`p-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 scrollbar-background-gray-600 transform transition-transform duration-300 ease-in-out ${
            isExpanded ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          {/* Camera Mode Section */}
          <div className="mb-6 p-4 bg-neutral-800/60 rounded-lg border border-gray-600">
            <h3 className="text-xs font-semibold text-white mb-4 uppercase tracking-wider">
              Camera Mode
            </h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="cameraMode"
                  checked={cameraMode === ViewportCameraMode.PLANAR}
                  onChange={() => setCameraMode(ViewportCameraMode.PLANAR)}
                  className="accent-blue-500"
                />
                Planar (2D Circle)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="cameraMode"
                  checked={cameraMode === ViewportCameraMode.SPHERICAL}
                  onChange={() => setCameraMode(ViewportCameraMode.SPHERICAL)}
                  className="accent-blue-500"
                />
                Spherical (3D)
              </label>
            </div>
          </div>

          {/* Render Type Section */}
          <div className="mb-6 p-4 bg-neutral-800/60 rounded-lg border border-gray-600">
            <h4 className="text-xs font-semibold text-white mb-4 uppercase tracking-wider">
              Render Type
            </h4>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="renderType"
                  checked={renderType === ViewportRenderType.STATIC}
                  onChange={() => setRenderType(ViewportRenderType.STATIC)}
                  className="accent-blue-500"
                />
                Static
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="renderType"
                  checked={renderType === ViewportRenderType.ANIMATED}
                  onChange={() => setRenderType(ViewportRenderType.ANIMATED)}
                  className="accent-blue-500"
                />
                Animated
              </label>
            </div>
          </div>

          {/* Camera Properties Section */}
          <div className="mb-6 p-4 bg-neutral-800/60 rounded-lg border border-gray-600">
            <h4 className="text-xs font-semibold text-white mb-4 uppercase tracking-wider">
              Camera Properties
            </h4>

            {/* Projection */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">Projection:</label>
              <select
                value={cameraProps.projection}
                onChange={e => handleCameraPropChange('projection', parseInt(e.target.value))}
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option className="text-xs" value={CameraProjection.ORTHOGRAPHIC}>
                  Orthographic
                </option>
                <option className="text-xs" value={CameraProjection.PERSPECTIVE}>
                  Perspective
                </option>
              </select>
            </div>

            {/* Resolution */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">Resolution:</label>

              <input
                type="number"
                value={cameraProps.resolution[0]}
                onChange={e => handleResolutionChange(parseInt(e.target.value))}
                min="1"
                max="4096"
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* FOV (only for perspective) */}
            {cameraProps.projection === CameraProjection.PERSPECTIVE && (
              <div className="flex items-center mb-3 gap-3 text-xs">
                <label className="min-w-[100px] text-xs">Field of View:</label>
                <input
                  type="number"
                  value={cameraProps.fov}
                  onChange={e => handleCameraPropChange('fov', parseFloat(e.target.value))}
                  min="1"
                  max="180"
                  step="1"
                  className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs">°</span>
              </div>
            )}

            {/* Ortho Scale (only for orthographic) */}
            {cameraProps.projection === CameraProjection.ORTHOGRAPHIC && (
              <div className="flex items-center mb-3 gap-3 text-xs">
                <label className="min-w-[100px] text-xs">Orthographic Scale:</label>
                <input
                  type="number"
                  value={cameraProps.orthoScale}
                  onChange={e => handleCameraPropChange('orthoScale', parseFloat(e.target.value))}
                  min="0.1"
                  max="100"
                  step="0.1"
                  className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Near/Far Clipping */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">Near Clipping:</label>
              <input
                type="number"
                value={cameraProps.minZ}
                onChange={e => handleCameraPropChange('minZ', parseFloat(e.target.value))}
                min="0.001"
                max="1"
                step="0.001"
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">Far Clipping:</label>
              <input
                type="number"
                value={cameraProps.maxZ}
                onChange={e => handleCameraPropChange('maxZ', parseFloat(e.target.value))}
                min="1"
                max="10000"
                step="1"
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Camera Distance */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">Radius:</label>
              <input
                type="number"
                value={cameraProps.radius}
                onChange={e => handleCameraPropChange('radius', parseFloat(e.target.value))}
                min="0.1"
                max="10"
                step="0.01"
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Rings (only for spherical mode) */}
            {cameraMode === ViewportCameraMode.SPHERICAL && (
              <div className="flex items-center mb-3 gap-3 text-xs">
                <label className="min-w-[100px] text-xs">Number of Rings:</label>
                <input
                  type="number"
                  value={cameraProps.rings}
                  onChange={e => handleCameraPropChange('rings', parseInt(e.target.value))}
                  min="1"
                  max="100"
                  step="1"
                  className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Cameras per Ring */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="min-w-[100px] text-xs">
                Cameras per {cameraMode === ViewportCameraMode.SPHERICAL ? 'Ring' : 'Circle'}:
              </label>
              <input
                type="number"
                value={cameraProps.camsPerRing}
                onChange={e => handleCameraPropChange('camsPerRing', parseInt(e.target.value))}
                min="1"
                max="24"
                step="1"
                className="text-center flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Animate Each Camera */}
            <div className="flex items-center mb-3 gap-3 text-xs">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={cameraProps.animateEachCamera}
                  onChange={e => handleCameraPropChange('animateEachCamera', e.target.checked)}
                  className="accent-blue-500"
                />
                Animate Each Camera
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
