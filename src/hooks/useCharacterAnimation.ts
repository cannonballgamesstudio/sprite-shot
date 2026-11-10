import { useEffect, useState } from 'react';
import * as BABYLON from '@babylonjs/core';
import { MutableRefObject } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useAnimationSettings } from '../state/animationSettingStore';
import { useProjectStore } from '../state/projectStore';

interface UseCharacterAnimationParams {
  sceneRef: MutableRefObject<BABYLON.Scene | null>;
  characterRef: MutableRefObject<BABYLON.Mesh | null>;
  selectedMeshId: string | null;
  currentMeshPath: string | null;
  reloadAnimationTrigger: number;
}

export const useCharacterAnimation = ({
  sceneRef,
  characterRef,
  selectedMeshId,
  currentMeshPath,
  reloadAnimationTrigger,
}: UseCharacterAnimationParams) => {
  const [currentAnimationPath, setCurrentAnimationPath] = useState<string | null>(null);
  const [loadedAnimationId, setLoadedAnimationId] = useState<string | null>(null);

  const isPlaying = useAnimationSettings(state => state.isPlaying);
  const currentFrame = useAnimationSettings(state => state.currentFrame);

  const applyAnimationToMesh = async (animationPath: string) => {
    const scene = sceneRef.current;
    if (!scene) {
      console.error('Scene not initialized');
      return;
    }

    if (!characterRef.current) {
      console.error('No character mesh loaded');
      return;
    }

    try {
      console.log('Loading animation from:', animationPath);

      const animSettings = useAnimationSettings.getState();
      console.log('Root motion setting:', animSettings.enableRootMotion);
      animSettings.pause();
      animSettings.setCurrentFrame(0);

      scene.animationGroups.forEach(ag => {
        ag.stop();
        ag.dispose();
      });

      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        '',
        '',
        convertFileSrc(animationPath),
        scene
      );

      if (result.animationGroups && result.animationGroups.length > 0) {
        const originalAnimGroup = result.animationGroups[0];

        console.log('Cloning animation with retargeting...');

        const retargetedAnimGroup = originalAnimGroup.clone(
          originalAnimGroup.name,
          oldTarget =>
            characterRef.current!.getChildren(child => child.name === oldTarget.name, false)[0],
          true
        );

        const frameCount = Math.floor(retargetedAnimGroup.to - retargetedAnimGroup.from);
        const frameRate =
          retargetedAnimGroup.targetedAnimations[0]?.animation.framePerSecond || 30;

        console.log('Animation retargeted:', {
          name: retargetedAnimGroup.name,
          frameCount,
          frameRate,
          targetedAnimations: retargetedAnimGroup.targetedAnimations.length,
        });

        console.log(
          'Animation targets:',
          retargetedAnimGroup.targetedAnimations.map(ta => ({
            target: ta.target?.name,
            property: ta.animation.targetProperty,
          }))
        );

        const hipsPositionAnim = retargetedAnimGroup.targetedAnimations.find(ta => {
          const targetName = ta.target?.name;
          const property = ta.animation.targetProperty;
          return (
            (targetName === 'Hips' || targetName === 'mixamorig:Hips') && property === 'position'
          );
        });

        if (hipsPositionAnim) {
          const keys = hipsPositionAnim.animation.getKeys();
          const firstPos = keys[0]?.value;
          const lastPos = keys[keys.length - 1]?.value;
          const midPos = keys[Math.floor(keys.length / 2)]?.value;

          console.log('Hips position animation found:', {
            keyCount: keys.length,
            firstKey: firstPos,
            midKey: midPos,
            lastKey: lastPos,
            hasMovement: keys.length > 1 && !firstPos.equals(lastPos),
            xMovement: lastPos.x - firstPos.x,
            yMovement: lastPos.y - firstPos.y,
            zMovement: lastPos.z - firstPos.z,
          });
        } else {
          console.log('No Hips position animation found in this animation');
        }

        retargetedAnimGroup.targetedAnimations.forEach(ta => {
          const targetName = ta.target?.name;
          const property = ta.animation.targetProperty;

          if (
            (targetName === 'Hips' || targetName === 'mixamorig:Hips') &&
            property === 'position'
          ) {
            const keys = ta.animation.getKeys();

            if (!animSettings.enableRootMotion) {
              const firstValue = keys[0].value;
              keys.forEach(key => {
                key.value = firstValue.clone();
              });
              console.log(`Zeroed root motion: ${targetName}.${property}`);
            } else {
              keys.forEach(key => {
                key.value = key.value.scale(100);
              });
              console.log(`Scaled root motion by 100x: ${targetName}.${property}`);
            }

            ta.animation.setKeys(keys);
          }
        });

        if (loadedAnimationId !== selectedMeshId) {
          const selectedAnimation = animSettings.getSelectedAnimation();
          if (selectedAnimation) {
            animSettings.setTotalFrames(frameCount);
            animSettings.setCurrentFrameTarget(frameRate);
            animSettings.setTrim(0, frameCount);
            animSettings.setCurrentFrame(0);
          }

          const projectStore = useProjectStore.getState();
          const animation = projectStore.currentProject?.animations.find(
            a => a.id === selectedMeshId
          );

          if (animation) {
            projectStore.updateAnimation(animation.id, {
              frameCount,
              frameRate,
              duration: frameCount / frameRate,
              settings: {
                ...animation.settings,
                totalFrames: frameCount,
                currentFrameTarget: frameRate,
                trimEnd: frameCount,
              },
            });
          }

          setLoadedAnimationId(selectedMeshId || null);
        }
      }
    } catch (error) {
      console.error('Error loading animation:', error);
    }
  };

  useEffect(() => {
    if (!selectedMeshId) return;
    const scene = sceneRef.current;
    if (!scene) return;

    const projectStore = useProjectStore.getState();
    const animation = projectStore.currentProject?.animations.find(
      a => a.id === selectedMeshId
    );
    if (animation) {
      if (loadedAnimationId !== selectedMeshId) {
        setLoadedAnimationId(null);
      }
      const projectPath = projectStore.projectPath;
      if (projectPath && currentMeshPath) {
        const fullAnimPath = `${projectPath}/${animation.filePath}`;
        setCurrentAnimationPath(fullAnimPath);
        applyAnimationToMesh(fullAnimPath);
      }
    }
  }, [selectedMeshId, currentMeshPath, loadedAnimationId]);

  useEffect(() => {
    if (!currentAnimationPath) return;
    if (reloadAnimationTrigger === 0) return;

    console.log('Reloading animation due to root motion toggle');
    applyAnimationToMesh(currentAnimationPath);
  }, [reloadAnimationTrigger, currentAnimationPath]);

  const resampleAnimation = (animGroup: BABYLON.AnimationGroup, targetFPS: number) => {
    const nativeFPS = animGroup.targetedAnimations[0]?.animation.framePerSecond || 30;

    if (nativeFPS === targetFPS) return;

    animGroup.targetedAnimations.forEach(targetedAnim => {
      const animation = targetedAnim.animation;

      animation.framePerSecond = targetFPS;

      const keys = animation.getKeys();
      const newKeys = keys.map(key => ({
        ...key,
        frame: (key.frame / nativeFPS) * targetFPS,
      }));

      animation.setKeys(newKeys);
    });

    const scaleFactor = targetFPS / nativeFPS;
    animGroup.from = animGroup.from * scaleFactor;
    animGroup.to = animGroup.to * scaleFactor;

    const animSettings = useAnimationSettings.getState();
    const selectedAnimation = animSettings.getSelectedAnimation();
    if (selectedAnimation) {
      const newTotalFrames = Math.floor(animGroup.to - animGroup.from);
      animSettings.setTotalFrames(newTotalFrames);
      animSettings.setTrim(0, newTotalFrames);
    }

    console.log(`Resampled animation from ${nativeFPS}fps to ${targetFPS}fps`);
  };

  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    if (scene.animationGroups.length === 0) return;

    const selectedAnimation = useAnimationSettings.getState().getSelectedAnimation();
    const targetFPS = selectedAnimation?.currentFrameTarget || 30;

    scene.animationGroups.forEach(animGroup => {
      const nativeFPS = animGroup.targetedAnimations[0]?.animation.framePerSecond || 30;
      if (nativeFPS !== targetFPS) {
        resampleAnimation(animGroup, targetFPS);
      }

      if (isPlaying) {
        animGroup.goToFrame(currentFrame);
        if (!animGroup.isPlaying) {
          animGroup.start(true, 1.0, animGroup.from, animGroup.to);
        }
      } else {
        animGroup.pause();
        animGroup.reset();
        animGroup.goToFrame(currentFrame);
        animGroup.start(false);
        animGroup.pause();
      }
    });
  }, [isPlaying, currentFrame, sceneRef]);
};
