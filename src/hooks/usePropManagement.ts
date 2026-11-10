import { useCallback, useEffect, useRef, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useProjectStore } from '../state/projectStore';

interface UsePropManagementProps {
  sceneRef: React.RefObject<BABYLON.Scene | null>;
  characterRef: React.RefObject<BABYLON.Mesh | null>;
  gizmoRef: React.RefObject<BABYLON.GizmoManager | null>;
  meshLoaded: boolean;
  loadedMeshId: string | null; // The mesh that's actually loaded in the viewport
  selectedMeshId: string | null;
}

export function usePropManagement({
  sceneRef,
  characterRef,
  gizmoRef,
  meshLoaded,
  loadedMeshId,
}: UsePropManagementProps) {
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [availableBones, setAvailableBones] = useState<string[]>([]);
  const loadedPropsRef = useRef<Map<string, BABYLON.TransformNode>>(new Map());

  const currentProject = useProjectStore(state => state.currentProject);
  const getPropsForMesh = useProjectStore(state => state.getPropsForMesh);

  const loadAndAttachProp = useCallback(
    async (
      propId: string,
      propFilePath: string,
      boneName: string,
      positionOffset: [number, number, number],
      rotationOffset: [number, number, number],
      scaleOffset: [number, number, number],
      isVisible: boolean
    ) => {
      const scene = sceneRef.current;
      if (!scene || !characterRef.current) return;

      try {
        const projectPath = useProjectStore.getState().projectPath;
        if (!projectPath) return;

        // Check if propFilePath has an extension
        const hasExtension = /\.(glb|gltf|fbx)$/i.test(propFilePath);
        let fullPropPath = `${projectPath}/${propFilePath}`;

        // If no extension (legacy prop), try common extensions
        if (!hasExtension) {
          console.warn(`Prop file path missing extension: ${propFilePath}. Trying common extensions...`);
          fullPropPath = `${projectPath}/${propFilePath}.glb`; // Default to .glb
        }

        console.log('Loading prop from:', fullPropPath);

        let res = await BABYLON.SceneLoader.ImportMeshAsync(
          '',
          convertFileSrc(fullPropPath),
          '',
          scene
        );

        const propMeshes = res.meshes;

        if (propMeshes.length === 0) {
          console.error('No meshes loaded from prop file');
          return;
        }
        const propRoot = propMeshes[0];
        propRoot.name = `prop_${propId}`;
        
        console.log(`Loaded ${propMeshes.length} prop meshes:`, propMeshes.map(m => m.name));
        
        propMeshes.forEach(m => {
          m.layerMask = 2; // Same layer as character meshes
          m.isVisible = isVisible;
          m.setEnabled(isVisible);
          if ((m as BABYLON.Mesh).material) {
            console.log(`Mesh ${m.name} has material:`, (m as BABYLON.Mesh).material?.name);
          }
        });

        const skinnedMeshes = [
          characterRef.current,
          ...characterRef.current.getChildMeshes(false),
        ].filter(m => (m as BABYLON.Mesh).skeleton) as BABYLON.Mesh[];

        let targetBone: BABYLON.Bone | null = null;
        for (const mesh of skinnedMeshes) {
          if (mesh.skeleton) {
            targetBone = mesh.skeleton.bones.find(b => b.name === boneName) || null;
            if (targetBone) break;
          }
        }

        if (!targetBone) {
          console.error(`Bone "${boneName}" not found`);
          propRoot.dispose();
          return;
        }

        const boneAttachNode = new BABYLON.TransformNode(`boneAttach_${propId}`, scene);
        boneAttachNode.parent = targetBone.getTransformNode() || (targetBone as any);

        // Parent all prop meshes to the attach node
        for (const mesh of propMeshes) {
          mesh.parent = boneAttachNode;
        }

        // Apply transform offsets to the attach node (not the prop root)
        boneAttachNode.position = new BABYLON.Vector3(
          positionOffset[0],
          positionOffset[1],
          positionOffset[2]
        );
        boneAttachNode.rotation = new BABYLON.Vector3(
          rotationOffset[0],
          rotationOffset[1],
          rotationOffset[2]
        );
        boneAttachNode.scaling = new BABYLON.Vector3(
          scaleOffset[0],
          scaleOffset[1],
          scaleOffset[2]
        );

        // Visibility already set on individual meshes above

        // Store reference
        loadedPropsRef.current.set(propId, boneAttachNode);

        console.log(`Prop "${propId}" attached to bone "${boneName}"`);
      } catch (error) {
        console.error('Failed to load prop:', error);
      }
    },
    [sceneRef, characterRef]
  );

  const attachGizmoToProp = useCallback(
    (propId: string | null) => {
      const gizmoManager = gizmoRef.current;
      if (!gizmoManager) return;

      if (!propId) {
        // Deselect - detach gizmo
        gizmoManager.attachToMesh(null);
        setSelectedPropId(null);
        return;
      }

      const propNode = loadedPropsRef.current.get(propId);
      if (propNode) {
        gizmoManager.attachToNode(propNode);
        setSelectedPropId(propId);
      }
    },
    [gizmoRef]
  );

  // Load props when mesh is loaded
  useEffect(() => {
    if (!meshLoaded || !characterRef.current || !loadedMeshId) return;

    const scene = sceneRef.current;
    if (!scene) return;

    // Clear existing props
    loadedPropsRef.current.forEach(propMesh => {
      propMesh.dispose();
    });
    loadedPropsRef.current.clear();

    // Load props for the loaded mesh (not based on selection)
    const props = getPropsForMesh(loadedMeshId);
    props.forEach(prop => {
      loadAndAttachProp(
        prop.id,
        prop.filePath,
        prop.parentBoneName,
        prop.positionOffset,
        prop.rotationOffset,
        prop.scaleOffset,
        prop.isVisible
      );
    });
  }, [meshLoaded, loadedMeshId, getPropsForMesh, loadAndAttachProp, sceneRef, characterRef]);

  // Update props when project props change
  useEffect(() => {
    if (!currentProject || !loadedMeshId) return;

    const unsubscribe = useProjectStore.subscribe(
      state => state.currentProject?.props,
      props => {
        if (!loadedMeshId || !props) return;

        const meshProps = props.filter(p => p.parentMeshId === loadedMeshId);

        // Update existing props
        meshProps.forEach(prop => {
          const propMesh = loadedPropsRef.current.get(prop.id);
          if (propMesh) {
            // Update transform
            propMesh.position.set(
              prop.positionOffset[0],
              prop.positionOffset[1],
              prop.positionOffset[2]
            );
            propMesh.rotation.set(
              prop.rotationOffset[0],
              prop.rotationOffset[1],
              prop.rotationOffset[2]
            );
            propMesh.scaling.set(prop.scaleOffset[0], prop.scaleOffset[1], prop.scaleOffset[2]);
            propMesh.setEnabled(prop.isVisible);
          }
        });

        // Remove props that were deleted
        const propIds = new Set(meshProps.map(p => p.id));
        loadedPropsRef.current.forEach((propMesh, propId) => {
          if (!propIds.has(propId)) {
            propMesh.dispose();
            loadedPropsRef.current.delete(propId);
          }
        });
      }
    );

    return unsubscribe;
  }, [currentProject, loadedMeshId]);

  // Sync prop transforms with store when gizmo is used
  useEffect(() => {
    if (!selectedPropId || !gizmoRef.current) return;

    const propNode = loadedPropsRef.current.get(selectedPropId);
    if (!propNode) return;

    const scene = sceneRef.current;
    if (!scene) return;

    // Listen for transform changes
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!propNode || !selectedPropId) return;

      const prop = currentProject?.props.find(p => p.id === selectedPropId);
      if (!prop) return;

      // Check if transform changed
      const posChanged =
        Math.abs(propNode.position.x - prop.positionOffset[0]) > 0.001 ||
        Math.abs(propNode.position.y - prop.positionOffset[1]) > 0.001 ||
        Math.abs(propNode.position.z - prop.positionOffset[2]) > 0.001;

      const rotChanged =
        Math.abs(propNode.rotation.x - prop.rotationOffset[0]) > 0.001 ||
        Math.abs(propNode.rotation.y - prop.rotationOffset[1]) > 0.001 ||
        Math.abs(propNode.rotation.z - prop.rotationOffset[2]) > 0.001;

      const scaleChanged =
        Math.abs(propNode.scaling.x - prop.scaleOffset[0]) > 0.001 ||
        Math.abs(propNode.scaling.y - prop.scaleOffset[1]) > 0.001 ||
        Math.abs(propNode.scaling.z - prop.scaleOffset[2]) > 0.001;

      if (posChanged || rotChanged || scaleChanged) {
        // Update the prop in the store
        useProjectStore.getState().updateProp(selectedPropId, {
          positionOffset: [propNode.position.x, propNode.position.y, propNode.position.z],
          rotationOffset: [propNode.rotation.x, propNode.rotation.y, propNode.rotation.z],
          scaleOffset: [propNode.scaling.x, propNode.scaling.y, propNode.scaling.z],
        });
      }
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [selectedPropId, currentProject, gizmoRef, sceneRef]);

  return {
    selectedPropId,
    availableBones,
    setAvailableBones,
    attachGizmoToProp,
    loadedPropsRef,
  };
}