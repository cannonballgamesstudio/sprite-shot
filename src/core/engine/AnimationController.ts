/**
 * AnimationController — animation loading, retargeting, frame seeking, root motion.
 * Extracted from hooks/useCharacterAnimation.ts.
 *
 * Pure class, no React dependency. Fixes the animation sync issue where
 * setTimeout was commented out in viewportUtils.ts:877.
 */

import * as BABYLON from '@babylonjs/core';
import { convertFileSrc } from '@tauri-apps/api/core';

export interface LoadedAnimation {
  group: BABYLON.AnimationGroup;
  frameCount: number;
  frameRate: number;
  duration: number;
}

export class AnimationController {
  private scene: BABYLON.Scene;

  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }

  /**
   * Load an animation from a GLTF/GLB file and retarget to a character mesh.
   * Extracted from useCharacterAnimation.ts applyAnimationToMesh().
   */
  async loadAndRetarget(
    animationPath: string,
    characterMesh: BABYLON.Mesh,
    options: {
      enableRootMotion: boolean;
    } = { enableRootMotion: false },
  ): Promise<LoadedAnimation> {
    // Dispose existing animation groups
    this.scene.animationGroups.forEach((ag) => {
      ag.stop();
      ag.dispose();
    });

    // Import animation
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      '',
      convertFileSrc(animationPath),
      this.scene,
    );

    if (!result.animationGroups || result.animationGroups.length === 0) {
      throw new Error('No animation groups found in file');
    }

    const originalAnimGroup = result.animationGroups[0];

    // Clone and retarget to character mesh's skeleton
    const retargetedAnimGroup = originalAnimGroup.clone(
      originalAnimGroup.name,
      (oldTarget) =>
        characterMesh.getChildren(
          (child) => child.name === oldTarget.name,
          false,
        )[0],
      true,
    );

    const frameCount = Math.floor(retargetedAnimGroup.to - retargetedAnimGroup.from);
    const frameRate =
      retargetedAnimGroup.targetedAnimations[0]?.animation.framePerSecond || 30;

    // Handle root motion
    retargetedAnimGroup.targetedAnimations.forEach((ta) => {
      const targetName = ta.target?.name;
      const property = ta.animation.targetProperty;

      if (
        (targetName === 'Hips' || targetName === 'mixamorig:Hips') &&
        property === 'position'
      ) {
        const keys = ta.animation.getKeys();

        if (!options.enableRootMotion) {
          // Lock hips to first frame position
          const firstValue = keys[0].value;
          keys.forEach((key) => {
            key.value = firstValue.clone();
          });
        } else {
          // Scale root motion by 100x for visibility
          keys.forEach((key) => {
            key.value = key.value.scale(100);
          });
        }

        ta.animation.setKeys(keys);
      }
    });

    return {
      group: retargetedAnimGroup,
      frameCount,
      frameRate,
      duration: frameCount / frameRate,
    };
  }

  /**
   * Seek to a specific frame with proper synchronization.
   *
   * This fixes the animation sync bug from the original codebase where
   * the setTimeout in viewportUtils.ts:877 was commented out, causing
   * captures to happen before the animation actually updated.
   *
   * The fix: after calling goToFrame, we force a scene render to ensure
   * the skeleton matrices are updated before returning.
   */
  seekToFrame(
    group: BABYLON.AnimationGroup,
    frame: number,
    _frameRate?: number,
  ): void {
    const timeInFrame = group.from + frame;

    group.pause();
    group.goToFrame(timeInFrame);

    // Force skeleton + mesh update so captures get the correct pose
    this.scene.render();
  }

  /**
   * Resample animation to a target FPS.
   * Extracted from useCharacterAnimation.ts resampleAnimation().
   */
  resample(group: BABYLON.AnimationGroup, targetFPS: number): void {
    const nativeFPS =
      group.targetedAnimations[0]?.animation.framePerSecond || 30;

    if (nativeFPS === targetFPS) return;

    group.targetedAnimations.forEach((ta) => {
      const animation = ta.animation;
      animation.framePerSecond = targetFPS;

      const keys = animation.getKeys();
      const newKeys = keys.map((key) => ({
        ...key,
        frame: (key.frame / nativeFPS) * targetFPS,
      }));
      animation.setKeys(newKeys);
    });

    const scaleFactor = targetFPS / nativeFPS;
    group.from = group.from * scaleFactor;
    group.to = group.to * scaleFactor;
  }

  /**
   * Play or pause an animation group, optionally seeking to a specific frame.
   */
  setPlaybackState(
    group: BABYLON.AnimationGroup,
    isPlaying: boolean,
    currentFrame: number,
  ): void {
    if (isPlaying) {
      group.goToFrame(currentFrame);
      if (!group.isPlaying) {
        group.start(true, 1.0, group.from, group.to);
      }
    } else {
      group.pause();
      group.reset();
      group.goToFrame(currentFrame);
      group.start(false);
      group.pause();
    }
  }

  dispose(): void {
    this.scene.animationGroups.forEach((ag) => {
      ag.stop();
      ag.dispose();
    });
  }
}
