/**
 * Animation slice — timeline, playback, animation settings.
 * Extracted from state/animationSettingStore.tsx.
 */

import type { StateCreator } from 'zustand';
import type { AnimationSettings } from '../animationSettingStore';

export interface AnimationSlice {
  animations: AnimationSettings[];
  selectedIndex: number | null;
  isPlaying: boolean;
  currentFrame: number;
  enableRootMotion: boolean;
  reloadAnimationTrigger: number;

  addAnimation: (animation?: Partial<AnimationSettings>) => void;
  removeAnimation: (id: string) => void;
  updateAnimation_anim: (id: string, updates: Partial<AnimationSettings>) => void;
  selectAnimation: (index: number | null) => void;
  getSelectedAnimation: () => AnimationSettings | null;
  setName: (name: string) => void;
  setTotalFrames: (totalFrames: number) => void;
  setCurrentFrameTarget: (currentFrameTarget: number) => void;
  setTrim: (trimStart: number, trimEnd: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setCurrentFrame: (frame: number) => void;
  toggleRootMotion: () => void;
  triggerReloadAnimation: () => void;
  resetAnimations: () => void;
}

const defaultSettings: AnimationSettings = {
  id: '',
  name: 'New Animation',
  totalFrames: 60,
  currentFrameTarget: 16,
  trimStart: 0,
  trimEnd: 60,
};

export const createAnimationSlice: StateCreator<AnimationSlice, [], [], AnimationSlice> = (set, get) => ({
  animations: [],
  selectedIndex: null,
  isPlaying: false,
  currentFrame: 0,
  enableRootMotion: false,
  reloadAnimationTrigger: 0,

  addAnimation: (animation = {}) =>
    set((state) => {
      const newAnimation: AnimationSettings = {
        ...defaultSettings,
        id: crypto.randomUUID(),
        ...animation,
      };
      return {
        animations: [...state.animations, newAnimation],
        selectedIndex: state.animations.length,
      };
    }),

  removeAnimation: (id) =>
    set((state) => {
      const index = state.animations.findIndex((a) => a.id === id);
      if (index === -1) return state;
      const newAnimations = [...state.animations];
      newAnimations.splice(index, 1);
      let newSelectedIndex = state.selectedIndex;
      if (newAnimations.length === 0) {
        newSelectedIndex = null;
      } else if (state.selectedIndex !== null) {
        if (index === state.selectedIndex) {
          newSelectedIndex = Math.max(0, state.selectedIndex - 1);
        } else if (index < state.selectedIndex) {
          newSelectedIndex = state.selectedIndex - 1;
        }
      }
      return { animations: newAnimations, selectedIndex: newSelectedIndex };
    }),

  updateAnimation_anim: (id, updates) =>
    set((state) => {
      const index = state.animations.findIndex((a) => a.id === id);
      if (index === -1) return state;
      const newAnimations = [...state.animations];
      newAnimations[index] = { ...newAnimations[index], ...updates };
      return { animations: newAnimations };
    }),

  selectAnimation: (index) =>
    set(() => ({ selectedIndex: index, isPlaying: false, currentFrame: 0 })),

  getSelectedAnimation: () => {
    const state = get();
    if (state.selectedIndex === null || !state.animations[state.selectedIndex]) return null;
    return state.animations[state.selectedIndex];
  },

  setName: (name) =>
    set((state) => {
      if (state.selectedIndex === null) return state;
      const newAnimations = [...state.animations];
      newAnimations[state.selectedIndex] = { ...newAnimations[state.selectedIndex], name };
      return { animations: newAnimations };
    }),

  setTotalFrames: (totalFrames) =>
    set((state) => {
      if (state.selectedIndex === null) return state;
      const newAnimations = [...state.animations];
      newAnimations[state.selectedIndex] = {
        ...newAnimations[state.selectedIndex],
        totalFrames,
        trimEnd: Math.min(newAnimations[state.selectedIndex].trimEnd, totalFrames),
      };
      return { animations: newAnimations };
    }),

  setCurrentFrameTarget: (currentFrameTarget) =>
    set((state) => {
      if (state.selectedIndex === null) return state;
      const newAnimations = [...state.animations];
      newAnimations[state.selectedIndex] = { ...newAnimations[state.selectedIndex], currentFrameTarget };
      return { animations: newAnimations };
    }),

  setTrim: (trimStart, trimEnd) =>
    set((state) => {
      if (state.selectedIndex === null) return state;
      const newAnimations = [...state.animations];
      const anim = newAnimations[state.selectedIndex];
      newAnimations[state.selectedIndex] = {
        ...anim,
        trimStart: Math.min(trimStart, anim.trimEnd),
        trimEnd: Math.max(trimEnd, anim.trimStart),
      };
      return { animations: newAnimations };
    }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentFrame: 0 }),

  setCurrentFrame: (frame) =>
    set(() => {
      const anim = get().getSelectedAnimation();
      if (!anim) return {};
      return { currentFrame: Math.max(anim.trimStart, Math.min(frame, anim.trimEnd)) };
    }),

  toggleRootMotion: () =>
    set((state) => ({
      enableRootMotion: !state.enableRootMotion,
      reloadAnimationTrigger: state.reloadAnimationTrigger + 1,
    })),

  triggerReloadAnimation: () =>
    set((state) => ({ reloadAnimationTrigger: state.reloadAnimationTrigger + 1 })),

  resetAnimations: () =>
    set(() => ({
      animations: [],
      selectedIndex: null,
      isPlaying: false,
      currentFrame: 0,
      enableRootMotion: false,
      reloadAnimationTrigger: 0,
    })),
});
