/**
 * Scene tree slice — tree UI state for asset sidebar.
 * Extracted from state/meshTree.ts.
 */

import type { StateCreator } from 'zustand';
import type { MeshTreeNode } from '../meshTree';
import { createSectionNode } from '../meshTree';

export interface SceneTreeSlice {
  meshTree: MeshTreeNode[];
  selectedMeshId: string | null;
  loadedMeshes: string[];
  loadedAnimations: string[];

  setMeshTree: (tree: MeshTreeNode[]) => void;
  setSelectedMeshId: (id: string | null) => void;
  addLoadedMesh: (path: string, meshData: MeshTreeNode) => void;
  removeLoadedMesh: (path: string) => void;
  addLoadedAnimation: (path: string, animData: MeshTreeNode) => void;
  removeLoadedAnimation: (path: string) => void;
  initializeTree: () => void;
}

const findSectionNode = (tree: MeshTreeNode[], value: string): MeshTreeNode | undefined => {
  return tree.find((node) => node.type === 'section' && node.value === value);
};

const defaultTree = (): MeshTreeNode[] => [
  createSectionNode('Meshes', 'meshes-section', crypto.randomUUID()),
  createSectionNode('Animations', 'animations-section', crypto.randomUUID()),
];

export const createSceneTreeSlice: StateCreator<SceneTreeSlice, [], [], SceneTreeSlice> = (set) => ({
  meshTree: defaultTree(),
  selectedMeshId: null,
  loadedMeshes: [],
  loadedAnimations: [],

  setMeshTree: (tree) => set({ meshTree: tree }),
  setSelectedMeshId: (id) => set({ selectedMeshId: id }),

  addLoadedMesh: (path, meshData) =>
    set((state) => {
      const newTree = [...state.meshTree];
      const section = findSectionNode(newTree, 'meshes-section');
      if (section?.children) {
        section.children = [...section.children, meshData];
      }
      return { loadedMeshes: [...state.loadedMeshes, path], meshTree: newTree };
    }),

  removeLoadedMesh: (path) =>
    set((state) => {
      const newTree = [...state.meshTree];
      const section = findSectionNode(newTree, 'meshes-section');
      if (section?.children) {
        section.children = section.children.filter((m) => m.value !== path);
      }
      return { loadedMeshes: state.loadedMeshes.filter((m) => m !== path), meshTree: newTree };
    }),

  addLoadedAnimation: (path, animData) =>
    set((state) => {
      const newTree = [...state.meshTree];
      const section = findSectionNode(newTree, 'animations-section');
      if (section?.children) {
        section.children = [...section.children, animData];
      }
      return { loadedAnimations: [...state.loadedAnimations, path], meshTree: newTree };
    }),

  removeLoadedAnimation: (path) =>
    set((state) => {
      const newTree = [...state.meshTree];
      const section = findSectionNode(newTree, 'animations-section');
      if (section?.children) {
        section.children = section.children.filter((a) => a.value !== path);
      }
      return { loadedAnimations: state.loadedAnimations.filter((a) => a !== path), meshTree: newTree };
    }),

  initializeTree: () => set({ meshTree: defaultTree() }),
});
