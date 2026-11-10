/**
 * ModeRouter — reads the active mode from appStore and renders the correct viewport.
 */

import { useEffect, useRef } from 'react';
import { getMode, getAllModes } from './modeRegistry';
import { useAppStore } from '../state/appStore';

export function ModeRouter() {
  const activeMode = useAppStore((s) => s.activeMode);
  const setActiveMode = useAppStore((s) => s.setActiveMode);
  const prevModeRef = useRef<string | null>(null);

  const mode = getMode(activeMode);
  const allModes = getAllModes();

  // Call lifecycle hooks on mode switch
  useEffect(() => {
    if (prevModeRef.current && prevModeRef.current !== activeMode) {
      const prevMode = getMode(prevModeRef.current);
      prevMode?.onDeactivate?.();
    }
    mode?.onActivate?.();
    prevModeRef.current = activeMode;
  }, [activeMode, mode]);

  return (
    <>
      {/* Mode selector tabs */}
      <div className="flex gap-2 p-2 bg-[#1a1a1a] border-b border-white/10">
        {allModes.map((m) => (
          <button
            key={m.config.id}
            onClick={() => setActiveMode(m.config.id)}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              m.config.id === activeMode
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-white/70 hover:bg-gray-600'
            }`}
            title={m.config.description}
          >
            {m.config.label}
          </button>
        ))}
      </div>

      {/* Active mode's viewport */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode ? (
          <mode.ViewportComponent key={activeMode} />
        ) : (
          <div style={{ padding: 20, color: '#999' }}>
            Unknown mode: {activeMode}
          </div>
        )}
      </div>
    </>
  );
}
