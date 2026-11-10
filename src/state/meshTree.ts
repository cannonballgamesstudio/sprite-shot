/**
 * meshTree — now re-exports from the unified appStore.
 *
 * Types and helper functions remain here as the canonical source.
 * The hook is an alias for useAppStore.
 */

import { useAppStore } from './appStore';
import { TreeNodeData } from '@mantine/core';

// ── Types (unchanged, still the canonical source) ──

export type NodeType = 'mesh' | 'animation' | 'folder' | 'section';

export interface MeshTreeNode extends TreeNodeData {
  type: NodeType;
  id: string;
  children?: MeshTreeNode[];
}

// ── Helpers (unchanged) ──

export const createSectionNode = (label: string, value: string, id: string): MeshTreeNode => ({
  label,
  value,
  type: 'section',
  id,
  children: [],
});

export function convertToTreeNodeData(nodes: MeshTreeNode[]): TreeNodeData[] {
  return nodes.map(node => ({
    value: node.id,
    label: node.label,
    children: node.children ? convertToTreeNodeData(node.children) : undefined,
  }));
}

// ── Hook (alias for unified store, lazy to avoid circular init) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _proxy: any = (...args: any[]) => (useAppStore as any)(...args);
Object.defineProperty(_proxy, 'getState', { get: () => useAppStore.getState });
Object.defineProperty(_proxy, 'setState', { get: () => useAppStore.setState });
Object.defineProperty(_proxy, 'subscribe', { get: () => useAppStore.subscribe });
Object.defineProperty(_proxy, 'destroy', { get: () => (useAppStore as any).destroy });
export const useMeshTreeStore = _proxy as typeof useAppStore;
