import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  SpriteShotProject, 
  CameraPreset, 
  ProjectMesh, 
  ProjectAnimation, 
  ProjectProp,
  ProjectEvent,
  ProjectFolderStructure 
} from '../types/project';
import { DEFAULT_CAMERA_PRESETS, CameraPresetManager } from '../utils/cameraPresets';
import { SpriteShotFormatHandler } from '../utils/spriteshotFormat';
import { ViewportCameraMode } from './viewportStore';
import { invoke } from '@tauri-apps/api/core';

interface ProjectState {
  // Current project
  currentProject: SpriteShotProject | null;
  isProjectLoaded: boolean;
  projectPath: string | null;
  
  // Project operations
  createProject: (name: string, path: string, description?: string) => Promise<SpriteShotProject>;
  newProject: () => void;
  saveAsProject: (projectName: string) => Promise<void>;
  hasUnsavedChanges: () => boolean;
  loadProject: (filePath: string) => Promise<SpriteShotProject>;
  saveProject: () => Promise<void>;
  saveProjectAs: (filePath: string) => Promise<void>;
  closeProject: () => void;
  
  // Camera presets
  cameraPresets: CameraPreset[];
  selectedPresetId: string | undefined;
  addCameraPreset: (preset: CameraPreset) => void;
  updateCameraPreset: (presetId: string, updates: Partial<CameraPreset>) => void;
  deleteCameraPreset: (presetId: string) => void;
  selectCameraPreset: (presetId: string | null) => void;
  applyCameraPreset: (presetId: string) => void;
  createPresetFromCurrent: (name: string, description?: string) => CameraPreset;

  importMesh: (sourceFilePath: string, meshName?: string) => Promise<ProjectMesh>;
  importAnimation: (sourceFilePath: string, animationName?: string) => Promise<ProjectAnimation>;
  
  // Mesh management
  addMesh: (mesh: ProjectMesh) => void;
  removeMesh: (meshId: string) => void;
  updateMesh: (meshId: string, updates: Partial<ProjectMesh>) => void;
  getMesh: (meshId: string) => ProjectMesh | undefined;
  setMeshPreset: (meshId: string, presetId: string) => void;
  
  // Animation management
  addAnimation: (animation: ProjectAnimation) => void;
  removeAnimation: (animationId: string) => void;
  updateAnimation: (animationId: string, updates: Partial<ProjectAnimation>) => void;
  getAnimation: (animationId: string) => ProjectAnimation | undefined;
  
  // Prop management
  addProp: (prop: ProjectProp) => void;
  removeProp: (propId: string) => void;
  updateProp: (propId: string, updates: Partial<ProjectProp>) => void;
  getProp: (propId: string) => ProjectProp | undefined;
  getPropsForMesh: (meshId: string) => ProjectProp[];
  importProp: (sourceFilePath: string, parentMeshId: string, parentBoneName: string, propName?: string) => Promise<ProjectProp>;

  // Project events
  eventListeners: ((event: ProjectEvent) => void)[];
  addEventListener: (listener: (event: ProjectEvent) => void) => () => void;
  emitEvent: (event: ProjectEvent) => void;
  
  // Utility functions
  getProjectFolderStructure: () => ProjectFolderStructure | null;
  isProjectDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
}

// Helper function to create default project structure
const createDefaultProject = (name: string, path: string, description?: string): SpriteShotProject => {
  const now = new Date();
  
  return {
    id: `project-${crypto.randomUUID()}`,
    name,
    description,
    version: '1.0.0', // Sprite Shot version
    createdAt: now,
    modifiedAt: now,
    projectPath: path,
    
    cameraPresets: [...DEFAULT_CAMERA_PRESETS],
    defaultCameraPresetId: DEFAULT_CAMERA_PRESETS[0].id,
    
    meshes: [],
    animations: [],
    props: [],
    
    settings: {
      autoSave: true,
      backupCount: 5,
      defaultPixelSize: 1,
      defaultCameraMode: ViewportCameraMode.PLANAR,
    },
    
    cache: {
      thumbnails: {},
      lastUsedPresets: [DEFAULT_CAMERA_PRESETS[0].id],
      meshBoundingBoxes: {},
    },
  };
};

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => {
    return {
      // Initial state - no project, show start screen
      currentProject: null,
      isProjectLoaded: false,
      projectPath: null,
      cameraPresets: [...DEFAULT_CAMERA_PRESETS],
      selectedPresetId: DEFAULT_CAMERA_PRESETS[0].id,
      eventListeners: [],
      isProjectDirty: false, // Not dirty initially
      
      // Project operations
      createProject: async (name: string, path: string, description?: string) => {
        const project = createDefaultProject(name, path, description);
        
        set({
          currentProject: project,
          isProjectLoaded: true,
          projectPath: path,
          cameraPresets: project.cameraPresets,
          selectedPresetId: project.defaultCameraPresetId,
          isProjectDirty: true, // New projects are dirty until saved
        });
        
        get().emitEvent({ type: 'project_created', project });
        return project;
      },
  
    newProject: () => {
  const newProject = createDefaultProject("Untitled", "", "New scene");
  
  set({
    currentProject: newProject,
    isProjectLoaded: true,
    projectPath: null, // No file path - unsaved
    cameraPresets: newProject.cameraPresets,
    selectedPresetId: newProject.defaultCameraPresetId,
    isProjectDirty: false,
  });
  
  get().emitEvent({ type: 'project_created', project: newProject });
},
saveAsProject: async (projectName: string) => {
  const { currentProject } = get();
  if (!currentProject) {
    throw new Error('No project to save');
  }
  
  try {
    // 1. Create project folder structure
    const folderStructure = await invoke('create_project_folder', {
      projectName
    }) as ProjectFolderStructure;
    
    const updatedProject: SpriteShotProject = {
      ...currentProject,
      name: projectName,
      projectPath: folderStructure.root,
      modifiedAt: new Date(),
    };
    
    // 3. Save the project file
    const binaryData = SpriteShotFormatHandler.serialize(updatedProject);
    await invoke('save_project_file', {
      projectPath: folderStructure.root,
      projectData: Array.from(binaryData)
    });
    
    // 4. Update state
    set({
      currentProject: updatedProject,
      projectPath: folderStructure.root,
      isProjectDirty: false,
    });
    
    get().emitEvent({ type: 'project_saved', project: updatedProject });
  } catch (error) {
    throw new Error(`Failed to save project: ${error}`);
  }
},
hasUnsavedChanges: () => {
  const { isProjectDirty, projectPath } = get();
  return isProjectDirty || projectPath === null; // Dirty or never saved
},
    loadProject: async (filePath: string) => {
  try {
    // Use Tauri command to load the project file
    const fileData = await invoke('load_project_file', {
      projectPath: filePath.replace('/scene.spriteshot', '') // Remove filename to get project directory
    });
    
    // Convert array back to Uint8Array
    const binaryData = new Uint8Array(fileData as ArrayBuffer);
    
    // Deserialize the project
    const project = SpriteShotFormatHandler.deserialize(binaryData);
    
    set({
      currentProject: project,
      isProjectLoaded: true,
      projectPath: project.projectPath,
      cameraPresets: project.cameraPresets,
      selectedPresetId: project.defaultCameraPresetId,
      isProjectDirty: false,
    });
    
    get().emitEvent({ type: 'project_loaded', project });
    return project;
  } catch (error) {
    throw new Error(`Failed to load project: ${error}`);
  }
},
    
    saveProject: async () => {
      const { currentProject, projectPath } = get();
      if (!currentProject) {
        throw new Error('No project to save');
      }
      
      // If no project path, this is an unsaved project - need "Save As"
      if (!projectPath) {
        throw new Error('Project has not been saved yet. Use Save As instead.');
      }
      
      const updatedProject: SpriteShotProject = {
        ...currentProject,
        modifiedAt: new Date(),
      };
      
      // Serialize and save
      const binaryData = SpriteShotFormatHandler.serialize(updatedProject);
      await invoke('save_project_file', {
        projectPath,
        projectData: Array.from(binaryData)
      });
      
      set({
        currentProject: updatedProject,
        isProjectDirty: false,
      });
      get().emitEvent({ type: 'project_saved', project: updatedProject });
    },
    
    saveProjectAs: async (filePath: string) => {
      const { currentProject } = get();
      if (!currentProject) {
        throw new Error('No project to save');
      }
      
      const updatedProject: SpriteShotProject = {
        ...currentProject,
        projectPath: filePath,
      };
      
      // Update project path and save
      set({
        currentProject: updatedProject,
        projectPath: filePath,
      });
      await get().saveProject();
    },
    
    closeProject: () => {
      set({
        currentProject: null,
        isProjectLoaded: false,
        projectPath: null,
        cameraPresets: [...DEFAULT_CAMERA_PRESETS],
        selectedPresetId: undefined,
        isProjectDirty: false,
      });
    },
    
    // Camera preset operations
    addCameraPreset: (preset: CameraPreset) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedCameraPresets = [...currentProject.cameraPresets, preset];

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        cameraPresets: updatedCameraPresets,
      };

      set({
        currentProject: updatedProject,
        cameraPresets: updatedCameraPresets,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'preset_created', preset });
    },
    
    updateCameraPreset: (presetId: string, updates: Partial<CameraPreset>) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedCameraPresets = currentProject.cameraPresets.map((preset) =>
        preset.id === presetId ? { ...preset, ...updates } : preset
      );

      const updatedPreset = updatedCameraPresets.find(p => p.id === presetId);
      if (!updatedPreset) return;

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        cameraPresets: updatedCameraPresets,
      };

      set({
        currentProject: updatedProject,
        cameraPresets: updatedCameraPresets,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'preset_updated', preset: updatedPreset });
    },
    
    deleteCameraPreset: (presetId: string) => {
      const { currentProject, selectedPresetId } = get();
      if (!currentProject) return;
      
      // Don't delete default presets
      const isDefaultPreset = DEFAULT_CAMERA_PRESETS.some(p => p.id === presetId);
      if (isDefaultPreset) return;
      
      const updatedCameraPresets = currentProject.cameraPresets.filter(p => p.id !== presetId);
      
      const newSelectedPresetId =
        selectedPresetId === presetId ? undefined : selectedPresetId;
      
      const updatedProject: SpriteShotProject = {
        ...currentProject,
        cameraPresets: updatedCameraPresets,
      };

      set({
        currentProject: updatedProject,
        cameraPresets: updatedCameraPresets,
        selectedPresetId: newSelectedPresetId,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'preset_deleted', presetId });
    },
    
    selectCameraPreset: (presetId: string | null) => {
      set({ selectedPresetId: presetId ?? undefined });
    },
    
    applyCameraPreset: (presetId: string) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const preset = currentProject.cameraPresets.find(p => p.id === presetId);
      if (!preset) return;
      
      // Update cache with recently used preset
      let updatedCache = currentProject.cache;
      if (currentProject.cache) {
        const lastUsed = currentProject.cache.lastUsedPresets || [];
        const updatedLastUsed = [
          presetId,
          ...lastUsed.filter(id => id !== presetId)
        ].slice(0, 10); // Keep last 10

        updatedCache = {
          ...currentProject.cache,
          lastUsedPresets: updatedLastUsed,
        };
      }
      
      const updatedProject: SpriteShotProject = {
        ...currentProject,
        cache: updatedCache,
      };

      set({ 
        currentProject: updatedProject,
        selectedPresetId: presetId,
        isProjectDirty: true,
      });
      
      // This would trigger viewport store updates in a real implementation
      // The viewport store would subscribe to preset changes
    },
    
    createPresetFromCurrent: (name: string, description?: string) => {
      // This would get current settings from viewport store
      // For now, we'll create a basic preset
      const preset = CameraPresetManager.createPresetFromCurrentSettings(
        name,
        description || '',
        {
          cameraProps: {
            projection: 0,
            resolution: [256, 256],
            fov: 75,
            minZ: 0.01,
            maxZ: 1000,
            orthoScale: 1,
            radius: 2,
            rings: 1,
            camsPerRing: 12,
            animateEachCamera: false,
          },
          cameraMode: ViewportCameraMode.PLANAR,
          renderType: 0,
          pixelSize: 1,
        }
      );
      
      get().addCameraPreset(preset);
      return preset;
    },
    
    importMesh: async (sourceFilePath: string, meshName?: string) => {
  const { currentProject, projectPath } = get();
  if (!currentProject || !projectPath) {
    throw new Error('No project loaded');
  }

  try {
    // 1. Copy file to project directory using Tauri command
    const relativePath = await invoke('import_mesh_file', {
      projectPath,
      sourceFilePath,
      meshName
    }) as string;

    // 2. Create ProjectMesh object
    const mesh: ProjectMesh = {
      id: `mesh-${crypto.randomUUID()}`,
      name: meshName || relativePath.split('/').pop() || 'Unknown Mesh',
      filePath: relativePath, // This is the relative path like "meshes/mymodel.fbx"
      cameraPresetId: currentProject.defaultCameraPresetId!, // Assign default preset
      importedAt: new Date(),
      fileSize: 0,
    };

    // 3. Add to project
    get().addMesh(mesh);

    // 4. Mark project as dirty
    get().markDirty();

    console.log('Mesh imported successfully:', mesh);
    return mesh;
  } catch (error) {
    throw new Error(`Failed to import mesh: ${error}`);
  }
},

importAnimation: async (sourceFilePath: string, animationName?: string) => {
  const { currentProject, projectPath } = get();
  if (!currentProject || !projectPath) {
    throw new Error('No project loaded');
  }

  try {
    // 1. Copy file to project directory using Tauri command
    const relativePath = await invoke('import_animation_file', {
      projectPath,
      sourceFilePath,
      animationName
    }) as string;

    // Extract name from file path if not provided
    const fileName = relativePath.split('/').pop() || 'Unknown Animation';
    const finalName = animationName || fileName.replace(/\.(glb|fbx)$/i, '');

    // 2. Create ProjectAnimation object
    const animation: ProjectAnimation = {
      id: `animation-${crypto.randomUUID()}`,
      name: finalName,
      filePath: relativePath, // Relative path like "animations/myanimation.fbx"
      settings: {
        id: `animation-${crypto.randomUUID()}`,
        name: finalName,
        totalFrames: 60, // Default, will be updated when loaded in viewport
        currentFrameTarget: 30, // Default FPS
        trimStart: 0,
        trimEnd: 60,
      },
      importedAt: new Date(),
      duration: 2.0, // Default, will be updated when loaded
      frameRate: 30, // Default FPS
      frameCount: 60, // Default, will be updated when loaded
    };

    // 3. Add to project
    get().addAnimation(animation);

    // 4. Emit event for listeners
    get().emitEvent?.({ type: 'animation_added', animation });

    // 5. Mark project as dirty and trigger auto-save
    get().markDirty();

    console.log('Animation imported successfully:', animation);
    return animation;
  } catch (error) {
    console.error('Failed to import animation:', error);
    throw new Error(`Failed to import animation: ${error}`);
  }
},

    // Mesh operations
    addMesh: (mesh: ProjectMesh) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedMeshes = [...currentProject.meshes, mesh];

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        meshes: updatedMeshes,
      };

      set({ 
        currentProject: updatedProject,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'mesh_added', mesh });
    },
    
    removeMesh: (meshId: string) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedMeshes = currentProject.meshes.filter(m => m.id !== meshId);

      let updatedCache = currentProject.cache;
      if (currentProject.cache) {
        const { thumbnails, meshBoundingBoxes, ...restCache } = currentProject.cache;

        let updatedThumbnails = thumbnails;
        if (thumbnails && thumbnails[meshId]) {
          const { [meshId]: _removedThumbnail, ...restThumbnails } = thumbnails;
          updatedThumbnails = restThumbnails;
        }

        let updatedMeshBoundingBoxes = meshBoundingBoxes;
        if (meshBoundingBoxes && meshBoundingBoxes[meshId]) {
          const { [meshId]: _removedBox, ...restBoxes } = meshBoundingBoxes;
          updatedMeshBoundingBoxes = restBoxes;
        }

        updatedCache = {
          ...restCache,
          thumbnails: updatedThumbnails,
          meshBoundingBoxes: updatedMeshBoundingBoxes,
        } as typeof currentProject.cache;
      }

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        meshes: updatedMeshes,
        cache: updatedCache,
      };
      
      set({
        currentProject: updatedProject,
        isProjectDirty: true,
      });
      get().emitEvent({ type: 'mesh_removed', meshId });
    },
    
    updateMesh: (meshId: string, updates: Partial<ProjectMesh>) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedMeshes = currentProject.meshes.map(mesh =>
        mesh.id === meshId ? { ...mesh, ...updates } : mesh
      );

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        meshes: updatedMeshes,
      };

      set({
        currentProject: updatedProject,
        isProjectDirty: true,
      });
    },
    
    getMesh: (meshId: string) => {
      const { currentProject } = get();
      if (!currentProject) return undefined;
      
      return currentProject.meshes.find(m => m.id === meshId);
    },
    
    setMeshPreset: (meshId: string, presetId: string) => {
      get().updateMesh(meshId, { cameraPresetId: presetId });
      get().emitEvent({ type: 'preset_applied', meshId, presetId });
    },
    
    // Animation operations
    addAnimation: (animation: ProjectAnimation) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      set({ 
        currentProject: { 
          ...currentProject,
          animations: [...currentProject.animations, animation],
          modifiedAt: new Date(),
        },
        isProjectDirty: true 
      });
    },
    
    removeAnimation: (animationId: string) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const updatedAnimations = currentProject.animations.filter(a => a.id !== animationId);

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        animations: updatedAnimations,
      };

      set({
        currentProject: updatedProject,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'animation_removed', animationId });
    },
    
    updateAnimation: (animationId: string, updates: Partial<ProjectAnimation>) => {
      const { currentProject } = get();
      if (!currentProject) return;

      const index = currentProject.animations.findIndex(a => a.id === animationId);
      if (index === -1) return;

      const updatedAnimations = [...currentProject.animations];
      updatedAnimations[index] = { ...updatedAnimations[index], ...updates };

      set({
        currentProject: {
          ...currentProject,
          animations: updatedAnimations,
          modifiedAt: new Date(),
        },
        isProjectDirty: true
      });
    },
    
    getAnimation: (animationId: string) => {
      const { currentProject } = get();
      if (!currentProject) return undefined;
      
      return currentProject.animations.find(a => a.id === animationId);
    },
    // Prop operations
    addProp: (prop: ProjectProp) => {
      const { currentProject } = get();
      if (!currentProject) return;
      
      const currentProps = currentProject.props ?? [];
      const updatedProps = [...currentProps, prop];

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        props: updatedProps,
      };

      set({ 
        currentProject: updatedProject,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'prop_added', prop });
    },

    removeProp: (propId: string) => {
      const { currentProject } = get();
      if (!currentProject) return;

      const currentProps = currentProject.props ?? [];
      const updatedProps = currentProps.filter(p => p.id !== propId);

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        props: updatedProps,
      };

      set({
        currentProject: updatedProject,
        isProjectDirty: true,
      });
      
      get().emitEvent({ type: 'prop_removed', propId });
    },

    updateProp: (propId: string, updates: Partial<ProjectProp>) => {
      const { currentProject } = get();
      if (!currentProject) return;

      const currentProps = currentProject.props ?? [];
      const updatedProps = currentProps.map(prop =>
        prop.id === propId ? { ...prop, ...updates } : prop
      );

      const updatedProject: SpriteShotProject = {
        ...currentProject,
        props: updatedProps,
      };
      
      set({ 
        currentProject: updatedProject,
        isProjectDirty: true,
      });
    },

    getProp: (propId: string) => {
      const { currentProject } = get();
      if (!currentProject) return undefined;
      const props = currentProject.props ?? [];
      return props.find(p => p.id === propId);
    },

    getPropsForMesh: (meshId: string) => {
      const { currentProject } = get();
      if (!currentProject) return [];
      const props = currentProject.props ?? [];
      return props.filter(p => p.parentMeshId === meshId);
    },

    importProp: async (sourceFilePath: string, parentMeshId: string, parentBoneName: string, propName?: string) => {
      const { currentProject, projectPath } = get();
      if (!currentProject || !projectPath) {
        throw new Error('No project loaded');
      }

      try {
        // Copy file to project meshes directory (props are stored as meshes)
        const relativePath = await invoke('import_mesh_file', {
          projectPath,
          sourceFilePath,
          meshName: propName
        }) as string;

        // Create ProjectProp object
        const prop: ProjectProp = {
          id: `prop-${crypto.randomUUID()}`,
          name: propName || relativePath.split('/').pop() || 'Unknown Prop',
          filePath: relativePath,
          parentMeshId,
          parentBoneName,
          positionOffset: [0, 0, 0],
          rotationOffset: [0, 0, 0],
          scaleOffset: [1, 1, 1],
          isVisible: true,
          importedAt: new Date(),
          fileSize: 0,
        };

        // Add to project
        get().addProp(prop);
        get().markDirty();

        console.log('Prop imported successfully:', prop);
        return prop;
      } catch (error) {
        throw new Error(`Failed to import prop: ${error}`);
      }
    },
    // Event system
    addEventListener: (listener: (event: ProjectEvent) => void) => {
      const { eventListeners } = get();
      const newListeners = [...eventListeners, listener];
      set({ eventListeners: newListeners });
      
      // Return unsubscribe function
      return () => {
        const currentListeners = get().eventListeners;
        set({ eventListeners: currentListeners.filter(l => l !== listener) });
      };
    },
    
    emitEvent: (event: ProjectEvent) => {
      const { eventListeners } = get();
      eventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in project event listener:', error);
        }
      });
    },
    
    // Utility functions
    getProjectFolderStructure: () => {
      const { currentProject } = get();
      if (!currentProject) return null;
      
      const root = currentProject.projectPath;
      return {
        root,
        meshes: `${root}/meshes`,
        animations: `${root}/animations`,
        thumbnails: `${root}/.cache/thumbnails`,
        backups: `${root}/.backups`,
        sceneFile: `${root}/scene.spriteshot`,
      };
    },
    
    markDirty: () => set({ isProjectDirty: true }),
    markClean: () => set({ isProjectDirty: false }),
    };    
}))


// Auto-save functionality
let autoSaveTimeout: number | null = null;

useProjectStore.subscribe(
  (state) => state.isProjectDirty,
  (isDirty) => {
    if (isDirty && useProjectStore.getState().currentProject?.settings.autoSave) {
      // Clear existing timeout
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
      
      // Set new timeout for auto-save (5 seconds after last change)
      autoSaveTimeout = setTimeout(async () => {
        try {
          await useProjectStore.getState().saveProject();
          console.log('Project auto-saved');
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, 5000);
    }
  }
);
