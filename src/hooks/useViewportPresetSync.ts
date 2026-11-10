import { useEffect, useRef } from 'react';
import { useViewportStore } from '../state/viewportStore';
import { useProjectStore } from '../state/projectStore';
import { useMeshTreeStore } from '../state/meshTree';
import { CameraPreset } from '../types/project';
import { CameraPresetManager } from '../utils/cameraPresets';

/**
 * Hook that automatically syncs viewport settings changes to camera presets
 * with deduplication to avoid creating duplicate presets for identical settings
 */
export function useViewportPresetSync() {
  const viewportStore = useViewportStore();
  const projectStore = useProjectStore();
  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);
  
  // Track the last synced settings to avoid unnecessary updates
  const lastSyncedSettings = useRef<string | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);

  // Create a hash of current viewport settings for comparison
  const createSettingsHash = () => {
    const settings = {
      cameraProps: viewportStore.cameraProps,
      cameraMode: viewportStore.cameraMode,
      renderType: viewportStore.renderType,
      pixelSize: viewportStore.pixelSize,
    };
    return JSON.stringify(settings);
  };

  // Find existing preset with identical settings
  const findMatchingPreset = (settings: any): CameraPreset | null => {
    const { currentProject } = projectStore;
    if (!currentProject) return null;

    return currentProject.cameraPresets.find(preset => 
      JSON.stringify({
        cameraProps: preset.cameraProps,
        cameraMode: preset.cameraMode,
        renderType: preset.renderType,
        pixelSize: preset.pixelSize,
      }) === JSON.stringify(settings)
    ) || null;
  };

  // Create or find preset for current settings
  const getOrCreatePresetForSettings = (settings: any): CameraPreset => {
    // First, try to find existing preset with identical settings
    const existingPreset = findMatchingPreset(settings);
    if (existingPreset) {
      return existingPreset;
    }

    // Create new preset with auto-generated name
    const presetCount = projectStore.currentProject?.cameraPresets.length || 0;
    const newPreset = CameraPresetManager.createPresetFromCurrentSettings(
      `Auto-Generated ${presetCount + 1}`,
      'Automatically created from viewport settings',
      settings
    );

    projectStore.addCameraPreset(newPreset);
    return newPreset;
  };

  // Sync viewport settings to mesh preset
  const syncViewportToPreset = () => {
    const { currentProject } = projectStore;
    if (!currentProject || !selectedMeshId) return;

    const currentMesh = projectStore.getMesh(selectedMeshId);
    if (!currentMesh) return;

    const currentSettings = {
      cameraProps: viewportStore.cameraProps,
      cameraMode: viewportStore.cameraMode,
      renderType: viewportStore.renderType,
      pixelSize: viewportStore.pixelSize,
    };

    // Get or create preset for current settings
    const targetPreset = getOrCreatePresetForSettings(currentSettings);

    // Update mesh to use this preset (only if different)
    if (currentMesh.cameraPresetId !== targetPreset.id) {
      projectStore.setMeshPreset(selectedMeshId, targetPreset.id);
      console.log(`Auto-synced viewport settings to preset "${targetPreset.name}" for mesh "${currentMesh.name}"`);
    }
  };

  // Debounced sync function
  const debouncedSync = () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(() => {
      const currentHash = createSettingsHash();
      
      // Only sync if settings actually changed
      if (currentHash !== lastSyncedSettings.current) {
        syncViewportToPreset();
        lastSyncedSettings.current = currentHash;
      }
    }, 1000); // 1 second debounce
  };

  // Watch for viewport changes
  useEffect(() => {
    // Only sync if we have a selected mesh and project loaded
    if (selectedMeshId && projectStore.isProjectLoaded) {
      debouncedSync();
    }

    // Cleanup timeout on unmount
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [
    viewportStore.cameraProps,
    viewportStore.cameraMode,
    viewportStore.renderType,
    viewportStore.pixelSize,
    selectedMeshId,
    projectStore.isProjectLoaded
  ]);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Expose manual sync function if needed
    syncNow: () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncViewportToPreset();
    },
    
    // Expose current sync status
    isAutoSyncEnabled: selectedMeshId !== null && projectStore.isProjectLoaded,
  };
}
