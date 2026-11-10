import { useState, useCallback, useRef } from 'react';
import { Document, NodeIO, Node, Property, PropertyResolver } from '@gltf-transform/core';
import { mergeDocuments, createDefaultPropertyResolver, unpartition } from '@gltf-transform/functions';

import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

export interface AnimationConflict {
  bone_name: string;
  conflict_type: string;
  details: string;
}

export interface BoneInfo {
  name: string;
  index: number;
  parent_index?: number;
  children: number[];
}

export const useGltfTransform = () => {
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [baseMeshLoaded, setBaseMeshLoaded] = useState(false);
  const [animationCount, setAnimationCount] = useState(0);
  const [boneHierarchy, setBoneHierarchy] = useState<BoneInfo[]>([]);
  const [lastConflicts, setLastConflicts] = useState<AnimationConflict[]>([]);

  // Refs to maintain state across renders
  const documentRef = useRef<Document | null>(null);
  const ioRef = useRef<NodeIO>(new NodeIO());
  const baseMeshPathRef = useRef<string | null>(null);

  // Helper function to convert binary to base64 without stack overflow
  const binaryToBase64 = useCallback((binary: Uint8Array): string => {
    let binaryString = '';
    const chunkSize = 8192;
    
    for (let i = 0; i < binary.length; i += chunkSize) {
      const chunk = binary.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    
    return btoa(binaryString);
  }, []);

  // Helper function to extract bone hierarchy
  const extractBoneHierarchy = useCallback((document: Document): BoneInfo[] => {
    const bones: BoneInfo[] = [];
    const root = document.getRoot();
    const scenes = root.listScenes();
    
    scenes.forEach(scene => {
      scene.listChildren().forEach((node, index) => {
        const extractBoneInfo = (node: any, bones: BoneInfo[], index: number, parentIndex?: number): void => {
          const boneInfo: BoneInfo = {
            name: node.getName() || `Node_${index}`,
            index: index,
            parent_index: parentIndex,
            children: []
          };

          bones.push(boneInfo);

          const children = node.listChildren();
          children.forEach((child: any) => {
            const childGlobalIndex = bones.length;
            boneInfo.children.push(childGlobalIndex);
            extractBoneInfo(child, bones, childGlobalIndex, index);
          });
        };

        extractBoneInfo(node, bones, index);
      });
    });

    return bones;
  }, []);

  const loadBaseMesh = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLTF Files', extensions: ['gltf', 'glb'] }]
      });

      if (!selected) return null;

      const path = Array.isArray(selected) ? selected[0] : selected;
      const fileData = await readFile(path);
      const arrayBuffer = fileData.buffer.slice(
        fileData.byteOffset,
        fileData.byteOffset + fileData.byteLength
      );

      // Load the document
      documentRef.current = await ioRef.current.readBinary(new Uint8Array(arrayBuffer));
      baseMeshPathRef.current = path;
      
      const root = documentRef.current.getRoot();
      const scenes = root.listScenes();
      const nodes = scenes.flatMap(scene => scene.listChildren());
      
      // Update state
      setBaseMeshLoaded(true);
      setAnimationCount(root.listAnimations().length);
      setBoneHierarchy(extractBoneHierarchy(documentRef.current));
      
      // Return base64 data immediately
      const binary = await ioRef.current.writeBinary(documentRef.current);
      const base64Data = binaryToBase64(binary);
      
      console.log(`Base mesh loaded from '${path}' with ${nodes.length} root nodes`);
      return base64Data;
      
    } catch (error) {
      console.error('Failed to load base mesh:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [binaryToBase64, extractBoneHierarchy]);

  const mergeAnimation = useCallback(async (): Promise<void> => {
    if (!documentRef.current) {
      throw new Error('No base mesh loaded. Load a base mesh first.');
    }

    setIsLoading(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'GLTF Animation Files', extensions: ['gltf', 'glb'] }]
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      const fileData = await readFile(path);
      const arrayBuffer = fileData.buffer.slice(
        fileData.byteOffset,
        fileData.byteOffset + fileData.byteLength
      );

      // Load animation document
      const animationDoc = await ioRef.current.readBinary(new Uint8Array(arrayBuffer));
      const conflicts: AnimationConflict[] = [];
      
      // Get current scene count before merging
      const root = documentRef.current.getRoot();
      
      // Merge the animation document
    //   const baseRoot = documentRef.current.getRoot();
    //   for (const anim of animationDoc.getRoot().listAnimations()) {
    //     baseRoot.addAnimation(anim.clone(baseRoot)); // deep-clone animation
    //   } 
    
    
    // Use mergeDocuments with the custom resolver


    const dstRoot = documentRef.current.getRoot();
    const defaultResolver = createDefaultPropertyResolver(documentRef.current, animationDoc);
    const resolver: PropertyResolver<Property> = (srcProp) => {
      if (srcProp instanceof Node && srcProp.getName()) {
        // Find matching node by name in the destination document
        const dstNode = dstRoot.listNodes().find(n => n.getName() === srcProp.getName());
        if (dstNode) return dstNode;
      }
      // Fall back to default resolver for other properties
      return defaultResolver(srcProp);
    };
    mergeDocuments(documentRef.current, animationDoc, resolver);
    // Map node names from source and target
    // const sourceNodeMap = new Map<string, Node>();
    // srcRoot.listNodes().forEach(node => {
    // if (node.getName()) {
    //     sourceNodeMap.set(node.getName(), node);
    // }
    // });

    // const targetNodeMap = new Map<string, Node>();
    // dstRoot.listNodes().forEach(node => {
    // if (node.getName()) {
    //     targetNodeMap.set(node.getName(), node);
    // }
    // });

    // const sourceAnimations = srcRoot.listAnimations();

    // sourceAnimations.forEach((sourceAnim) => {
    // const newAnim = documentRef.current?.createAnimation(sourceAnim.getName());

    // sourceAnim.listChannels().forEach((channel) => {
    //     const sourceNode = channel.getTargetNode();
    //     if (!sourceNode) return;

    //     const targetNode = targetNodeMap.get(sourceNode.getName());
    //     if (!targetNode) {
    //     console.warn(`Node "${sourceNode.getName()}" not found in target. Skipping channel.`);
    //     return;
    //     }

    //     const sourceInput = channel.getSampler()?.getInput();
    //     const sourceOutput = channel.getSampler()?.getOutput();
    //     const sourceInterpolation = channel.getSampler()?.getInterpolation();
    //     if (!sourceInput || !sourceOutput || !sourceInterpolation) return;
    //     const clonedInput = sourceInput.clone().copy(sourceInput).setName(sourceInput.getName());
    //     const clonedOutput = sourceOutput.clone().copy(sourceOutput).setName(sourceOutput.getName());
        

    //     documentRef.current?.createAccessor(clonedInput.getName(), clonedInput.getBuffer());
    //     documentRef.current?.createAccessor(clonedOutput.getName(), clonedOutput.getBuffer());
        
    //     const newSampler = documentRef.current?.createAnimationSampler(newAnim?.getName())
    //     .setInput(clonedInput as Accessor)
    //     .setOutput(clonedOutput as Accessor)
    //     .setInterpolation('LINEAR');

    //     const clonedTargetPath = channel.getTargetPath()?.toString();

    //     documentRef.current?.createAnimationChannel(newAnim?.getName())
    //     .setTargetNode(targetNode)
    //     .setTargetPath(clonedTargetPath as GLTF.AnimationChannelTargetPath)
    //     .setSampler(newSampler as AnimationSampler);
    // });
    // });
    // const nodeMap = new Map<Property, Property>();
    

   // srcRoot.listNodes().forEach(srcNode => {
    //   const name = srcNode.getName();
    //   if (!name) return;
    
    //   const dstNode = dstRoot.listNodes().find(n => n.getName() === name);
    //   if (dstNode) nodeMap.set(srcNode, dstNode);
    // });
    // const resolve = createDefaultPropertyResolver(documentRef.current, animationDoc);
    // console.log(resolve);
    // const map = mergeDocuments(documentRef.current, animationDoc, resolve);
    
    // const map = mergeDocuments(documentRef.current, animationDoc);
    // const sceneA = documentRef.current.getRoot().listScenes()[0];

    // Find counterpart of the source Scene in the target Document.
    // const sceneB = map.get(animationDoc.getRoot().listScenes()[0]) as Scene;

    // Create a Node, and append source Scene's direct children.
    // const baseRoot = documentRef.current.getRoot();
    // for (const scene of baseRoot.listScenes().slice(1)) {
    //   for (const child of scene.listChildren()) sceneA.addChild(child);
    //   scene.dispose(); // remove empty scene
    // }
    // for (const node of sceneB?.listChildren() || []) {
    //     console.log(node);
    //     sceneA.addChild(node);
    // }

    // sceneB.dispose();
    // await documentRef.current?.transform(unpartition());
    // await documentRef.current.transform(prune());
    logMergedScene();
    // await documentRef.current.transform(unpartition());      
      // Move children from additional scenes to main scene
    //   const scenes = root.listScenes();
    //   const mainScene = scenes[0];
      
    //   for (let i = originalSceneCount; i < scenes.length; i++) {
    //     const scene = scenes[i];
        
    //     for (const child of scene.listChildren()) {
    //       const childName = child.getName();
    //       if (childName) {
    //         const existingNodes = mainScene.listChildren();
    //         const existingNode = existingNodes.find(node => node.getName() === childName);
            
    //         if (existingNode) {
    //           conflicts.push({
    //             bone_name: childName,
    //             conflict_type: 'name_conflict',
    //             details: `Node with name '${childName}' already exists in main scene`
    //           });
    //           console.warn(`Bone conflict: Node '${childName}' already exists`);
    //         }
    //       }
          
    //       mainScene.addChild(child);
    //     }
        
    //     scene.dispose();
    //   }
      
      // Update state
      await documentRef.current?.transform(unpartition());
      // await documentRef.current.transform(prune());
      logMergedScene();
      setLastConflicts(conflicts);
      setAnimationCount(root.listAnimations().length);
      setBoneHierarchy(extractBoneHierarchy(documentRef.current));
      
      console.log(`Animation merged from '${path}' with ${conflicts.length} conflicts`);
      
    } catch (error) {
      console.error('Failed to merge animation:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [extractBoneHierarchy]);

  const printNode = (node: Node, depth = 0) => {
    const indent = '  '.repeat(depth);
    console.log(`${indent}${node.getName() || '(unnamed node)'}`);
  
    for (const child of node.listChildren()) {
      printNode(child, depth + 1);
    }
  };
  const logMergedScene = () => {
    const root = documentRef.current?.getRoot();
    const anims = root?.listAnimations();
    console.log('--- Merged scene graph ---');
    for (const anim of anims || []) {
      console.log(anim.getName());
    }
    console.log('--------------------------');
  };

  const getMergedGltfAsBase64 = useCallback(async (): Promise<string> => {
    if (!documentRef.current) {
      throw new Error('No document loaded');
    }

    const binary = await ioRef.current.writeBinary(documentRef.current);
    return binaryToBase64(binary);
  }, [binaryToBase64]);

  const saveMergedGltf = useCallback(async (): Promise<string> => {
    if (!documentRef.current || !baseMeshPathRef.current) {
      throw new Error('No document or base path available');
    }

    const binary = await ioRef.current.writeBinary(documentRef.current);
    const base64 = binaryToBase64(binary);
    
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_merged_gltf_file', { 
      data: base64, 
      originalPath: baseMeshPathRef.current 
    });
    
    return 'Merged GLTF saved successfully';
  }, [binaryToBase64]);

  const getBoneHierarchy = useCallback(() => {
    return boneHierarchy;
  }, [boneHierarchy]);

  const getAnimationCount = useCallback(() => {
    return animationCount;
  }, [animationCount]);

  return {
    // State
    isLoading,
    baseMeshLoaded,
    animationCount,
    boneHierarchy,
    lastConflicts,
    
    // Actions
    loadBaseMesh,
    mergeAnimation,
    getBoneHierarchy,
    getAnimationCount,
    saveMergedGltf,
    getMergedGltfAsBase64,
  };
};
