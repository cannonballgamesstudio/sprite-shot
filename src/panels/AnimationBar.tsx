import { useEffect, useRef, useState } from 'react';
import { useAnimationSettings } from '../state/animationSettingStore';
import { useMeshTreeStore } from '../state/meshTree';
import { useProjectStore } from '../state/projectStore';
import { NumberInput, Text, Stack, Group, ActionIcon, Badge } from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconTarget,
  IconWalk,
} from '@tabler/icons-react';
import { useViewportStore } from '../state/viewportStore';

export default function AnimationBar() {
  const {
    animations,
    selectAnimation,
    addAnimation,
    setCurrentFrameTarget,
    getSelectedAnimation,
    isPlaying,
    currentFrame,
    play,
    pause,
    stop,
    setCurrentFrame,
    enableRootMotion,
    toggleRootMotion,
    setTrim,
  } = useAnimationSettings();
  const triggerRecenterCameras = useViewportStore(state => state.triggerRecenterCameras);
  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);
  const currentProject = useProjectStore(state => state.currentProject);
  const initializedAnimations = useRef<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingTab, setDraggingTab] = useState<'start' | 'end' | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      const maxHeight = 384;
      setContentHeight(Math.min(fullHeight, maxHeight));
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!selectedMeshId) {
      return;
    }
    if (initializedAnimations.current.has(selectedMeshId)) {
      const animIndex = animations.findIndex(anim => anim.id === selectedMeshId);
      if (animIndex >= 0) {
        selectAnimation(animIndex);
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

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingTab) return; // Don't scrub while dragging trim tabs
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const frame = Math.floor(percentage * selectedAnimation!.totalFrames);
    setCurrentFrame(frame);
  };

  const handleTrimDrag = (e: React.MouseEvent, tab: 'start' | 'end') => {
    e.stopPropagation();
    setDraggingTab(tab);
  };

  useEffect(() => {
    if (!draggingTab || !timelineRef.current || !selectedAnimation) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = timelineRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const frame = Math.round(percentage * selectedAnimation.totalFrames);

      if (draggingTab === 'start') {
        setTrim(Math.min(frame, selectedAnimation.trimEnd - 1), selectedAnimation.trimEnd);
      } else if (draggingTab === 'end') {
        setTrim(selectedAnimation.trimStart, Math.max(frame, selectedAnimation.trimStart + 1));
      }
    };

    const handleMouseUp = () => {
      setDraggingTab(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTab, selectedAnimation, setTrim]);

  useEffect(() => {
    if (!draggingTab || !timelineRef.current || !selectedAnimation) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = timelineRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const frame = Math.round(percentage * selectedAnimation.totalFrames);

      if (draggingTab === 'start') {
        setTrim(Math.min(frame, selectedAnimation.trimEnd - 1), selectedAnimation.trimEnd);
      } else if (draggingTab === 'end') {
        setTrim(selectedAnimation.trimStart, Math.max(frame, selectedAnimation.trimStart + 1));
      }
    };

    const handleMouseUp = () => {
      setDraggingTab(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTab, selectedAnimation, setTrim]);

  if (!selectedAnimation) {
    return null;
  }

  const progressPercentage = (currentFrame / selectedAnimation!.totalFrames) * 100;
  const trimStartPercentage = (selectedAnimation!.trimStart / selectedAnimation!.totalFrames) * 100;
  const trimEndPercentage = (selectedAnimation!.trimEnd / selectedAnimation!.totalFrames) * 100;

  return (
    <div className="text-gray-300">
      <div className="overflow-hidden transition-all duration-300 ease-in-out">
        <Group className="p-3">
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Animation Settings{' '}
            <Badge size="sm" variant="light" color="green">
              {selectedAnimation.name}
            </Badge>
          </h3>
          <div className="flex-1"></div>
          <div
            className="flex items-center justify-between transition-colors hover:text-white cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
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
        </Group>
        <Stack gap="md">
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
              <div>
                <Group gap="xs" mb="xs">
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color={isPlaying ? 'gray' : 'blue'}
                    onClick={isPlaying ? pause : play}
                  >
                    {isPlaying ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                  </ActionIcon>
                  <ActionIcon size="sm" variant="filled" color="red" onClick={stop}>
                    <IconPlayerStop size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color="cyan"
                    onClick={triggerRecenterCameras}
                    title="Recenter cameras based on current mesh position"
                  >
                    <IconTarget size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    color={enableRootMotion ? 'green' : 'gray'}
                    onClick={toggleRootMotion}
                    title={`Root Motion: ${enableRootMotion ? 'Enabled' : 'Disabled'} (Click to toggle and reload)`}
                  >
                    <IconWalk size={16} />
                  </ActionIcon>
                  <Text size="xs" className="flex-1 text-right">
                    Sample Rate
                  </Text>
                  <NumberInput
                    value={selectedAnimation.currentFrameTarget}
                    onChange={value => setCurrentFrameTarget(Number(value))}
                    min={1}
                    size="xs"
                    className="w-16 text-center"
                  />
                </Group>

                <div
                  ref={timelineRef}
                  className="relative h-8 bg-gray-700 rounded cursor-pointer"
                  onClick={handleTimelineClick}
                >
                  <div
                    className="absolute top-0 bottom-0 bg-blue-900/30"
                    style={{
                      left: `${trimStartPercentage}%`,
                      right: `${100 - trimEndPercentage}%`,
                    }}
                  />

                  {/* Trim Start Tab */}
                  <div
                    className="absolute top-0 bottom-0 w-3 bg-blue-500 hover:bg-blue-400 cursor-ew-resize transition-colors z-10"
                    style={{ left: `${trimStartPercentage}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={e => handleTrimDrag(e, 'start')}
                    title={`Trim Start: ${selectedAnimation.trimStart}`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-0.5 h-4 bg-white/50" />
                    </div>
                  </div>

                  {/* Trim End Tab */}
                  <div
                    className="absolute top-0 bottom-0 w-3 bg-blue-500 hover:bg-blue-400 cursor-ew-resize transition-colors z-10"
                    style={{ left: `${trimEndPercentage}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={e => handleTrimDrag(e, 'end')}
                    title={`Trim End: ${selectedAnimation.trimEnd}`}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-0.5 h-4 bg-white/50" />
                    </div>
                  </div>

                  <div
                    className="absolute top-0 bottom-0 w-1 bg-yellow-500 z-20"
                    style={{ left: `${progressPercentage}%` }}
                  />

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Text size="xs" className="text-gray-400">
                      {currentFrame} / {selectedAnimation.totalFrames}
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Stack>
      </div>
    </div>
  );
}
