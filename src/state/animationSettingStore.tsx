/**
 * animationSettingStore — now re-exports from the unified appStore.
 *
 * The AnimationSettings interface remains here as the canonical source.
 * The hook is an alias for useAppStore.
 */

import { useAppStore } from './appStore';

// ── Types (unchanged, still the canonical source) ──

export interface AnimationSettings {
  id: string;
  name: string;
  totalFrames: number;
  currentFrameTarget: number;
  trimStart: number;
  trimEnd: number;
}

// ── Hook (alias for unified store, lazy to avoid circular init) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _proxy: any = (...args: any[]) => (useAppStore as any)(...args);
Object.defineProperty(_proxy, 'getState', { get: () => useAppStore.getState });
Object.defineProperty(_proxy, 'setState', { get: () => useAppStore.setState });
Object.defineProperty(_proxy, 'subscribe', { get: () => useAppStore.subscribe });
Object.defineProperty(_proxy, 'destroy', { get: () => (useAppStore as any).destroy });
export const useAnimationSettings = _proxy as typeof useAppStore;
