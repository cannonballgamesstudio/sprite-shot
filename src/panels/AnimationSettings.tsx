import { useEffect, useRef, useState } from 'react';
import { useAnimationSettings } from '../state/animationSettingStore';
import { useMeshTreeStore } from '../state/meshTree';
import { useProjectStore } from '../state/projectStore';
import { NumberInput, Text, RangeSlider, Stack, Badge } from '@mantine/core';
import classes from '../style/slider.module.css';

export default function AnimationSettings() {
  const {
    animations,
    selectAnimation,
    addAnimation,
    setTotalFrames,
    setTrim,
    getSelectedAnimation,
    isPlaying,
    currentFrame,
    setCurrentFrame,
  } = useAnimationSettings();

  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);
  const currentProject = useProjectStore(state => state.currentProject);

  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const initializedAnimations = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      const maxHeight = 384;
      setContentHeight(Math.min(fullHeight, maxHeight));
    }
  }, [isExpanded, selectedMeshId]);

  useEffect(() => {
    if (!selectedMeshId) {
      setIsExpanded(false);
      return;
    }

    if (initializedAnimations.current.has(selectedMeshId)) {
      const animIndex = animations.findIndex(anim => anim.id === selectedMeshId);
      if (animIndex >= 0) {
        selectAnimation(animIndex);
        setIsExpanded(true);
      }
      return;
    }

    const animation = currentProject?.animations.find(a => a.id === selectedMeshId);

    if (animation) {
      addAnimation({
        id: animation.id,
        name: animation.name,
        totalFrames: animation.frameCount || 60,
        currentFrameTarget: animation.frameRate || 30,
        trimStart: 0,
        trimEnd: animation.frameCount || 60,
      });

      initializedAnimations.current.add(selectedMeshId);
      setIsExpanded(true);
    }
  }, [selectedMeshId]);

  const selectedAnimation = getSelectedAnimation();

  useEffect(() => {
    if (!isPlaying || !selectedAnimation) return;

    const fps = selectedAnimation.currentFrameTarget;
    const interval = setInterval(() => {
      setCurrentFrame(currentFrame + 1);

      if (currentFrame >= selectedAnimation.trimEnd) {
        setCurrentFrame(selectedAnimation.trimStart);
      }
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, currentFrame, selectedAnimation, setCurrentFrame]);

  if (!selectedAnimation) {
    return (
      <div className="text-gray-300">
        <div className="p-4 text-center text-gray-500">
          Select an animation in the Scene Tree to edit its settings
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-300">
      <div
        className="flex items-center justify-between p-3 transition-colors hover:text-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          Animation Settings{' '}
          <Badge size="sm" variant="light" color="green">
            {selectedAnimation.name}
          </Badge>
        </h3>

        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 hover:text-white ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          height: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          ref={contentRef}
          className={`p-4 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 transform transition-transform duration-300 ease-in-out ${
            isExpanded ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          <Stack gap="md">
            <NumberInput
              label="Total Frames"
              value={selectedAnimation.totalFrames}
              onChange={value => setTotalFrames(Number(value))}
              min={1}
              size="xs"
            />

            <div>
              <Text size="xs" fw={500} mb="xs">
                Trim Range
              </Text>
              <RangeSlider
                labelAlwaysOn
                value={[selectedAnimation.trimStart, selectedAnimation.trimEnd]}
                onChange={value => setTrim(Number(value[0]), Number(value[1]))}
                min={0}
                max={selectedAnimation.totalFrames}
                classNames={classes}
                color="blue"
                size="xs"
                mt="20px"
                p="md"
              />
            </div>

            <Text size="xs" c="dimmed" className="text-right">
              Animation ID: {selectedAnimation.id}
            </Text>
          </Stack>
        </div>
      </div>
    </div>
  );
}
