// import DraggablePanel from './components/DraggablePanel';
import { useMeshTreeStore } from '../state/meshTree';
import { Group, ActionIcon, Text } from '@mantine/core';
import {
  IconCamera,
  IconDots,
  IconEdit,
  IconTrash,
  IconCopy,
  IconCube,
  IconMovie,
  IconFolder,
} from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useViewportStore } from '../state/viewportStore';
import { Badge, Menu, Accordion, Stack, Box } from '@mantine/core';
import { useState } from 'react';

export default function SceneTree() {
  const meshTree = useMeshTreeStore(state => state.meshTree);
  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);
  const setSelectedMeshId = useMeshTreeStore(state => state.setSelectedMeshId);
  const initializeTree = useMeshTreeStore(state => state.initializeTree);

  // Project store integration
  const currentProject = useProjectStore(state => state.currentProject);
  const isProjectLoaded = useProjectStore(state => state.isProjectLoaded);
  const getMesh = useProjectStore(state => state.getMesh);
  // const getAnimation = useProjectStore(state => state.getAnimation);
  const setMeshPreset = useProjectStore(state => state.setMeshPreset);
  const applyCameraPreset = useProjectStore(state => state.applyCameraPreset);
  const cameraPresets = useProjectStore(state => state.cameraPresets);

  // Viewport store for applying presets
  const setCamerasProps = useViewportStore(state => state.setCamerasProps);
  const setCameraMode = useViewportStore(state => state.setCameraMode);
  const setRenderType = useViewportStore(state => state.setRenderType);
  const setPixelSize = useViewportStore(state => state.setPixelSize);

  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [propExpandTrigger, setPropExpandTrigger] = useState(0);
  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      const maxHeight = 384; // max-h-96 = 384px
      setContentHeight(Math.min(fullHeight, maxHeight));
    }
  }, [isExpanded, propExpandTrigger]);

  const [contextMenuMeshId, setContextMenuMeshId] = useState<string | null>(null);
  const setCurrentMeshPath = useViewportStore(state => state.setCurrentMeshPath);

  const handleMeshSelect = (meshId: string) => {
    setSelectedMeshId(meshId);

    if (isProjectLoaded && currentProject) {
      const mesh = getMesh(meshId);
      if (mesh) {
        // Load the mesh into the viewport
        const projectPath = useProjectStore.getState().projectPath;
        if (projectPath && mesh.filePath) {
          const fullMeshPath = `${projectPath}/${mesh.filePath}`;
          setCurrentMeshPath(fullMeshPath);
          console.log(`Loading mesh "${mesh.name}" into viewport:`, fullMeshPath);
        }

        // Apply camera preset if available
        if (mesh.cameraPresetId) {
          const preset = cameraPresets.find(p => p.id === mesh.cameraPresetId);
          if (preset) {
            setCamerasProps(preset.cameraProps);
            setCameraMode(preset.cameraMode);
            setRenderType(preset.renderType);
            setPixelSize(preset.pixelSize);
            applyCameraPreset(preset.id);
            console.log(`Applied camera preset "${preset.name}" for mesh "${mesh.name}"`);
          }
        }
      }
    }
  };

  // Handle preset assignment to mesh
  const handleAssignPreset = (meshId: string, presetId: string) => {
    setMeshPreset(meshId, presetId);
    setContextMenuMeshId(null);

    // If this mesh is currently selected, apply the preset immediately
    if (selectedMeshId === meshId) {
      handleMeshSelect(meshId);
    }
  };

  // Get preset name for display
  const getPresetName = (presetId: string) => {
    const preset = cameraPresets.find(p => p.id === presetId);
    return preset?.name || 'Unknown Preset';
  };

  useEffect(() => {
    if (meshTree.length === 0) {
      initializeTree();
    }
  }, []);

  return (
    <div className="text-gray-300">
      <div
        className="flex items-center justify-between p-3 transition-colors hover:text-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Stack gap="xs" align="left">
          <Text size="sm" fw={600} className="text-blue-700 dark:text-blue-300">
            Project: {isProjectLoaded && currentProject ? currentProject.name : 'Untitled'}
          </Text>
          {isProjectLoaded && currentProject && (
            <Text size="xs" className="text-blue-600 dark:text-blue-400">
              {currentProject.meshes.length} meshes, {currentProject.animations.length} animations
            </Text>
          )}
        </Stack>
        <div className="flex-1 w-full" />
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 hover:text-white justify-end ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      {/* Collapsible Content with Slide Animation */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          height: isExpanded ? `${contentHeight}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          ref={contentRef}
          className={`p-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 scrollbar-background-gray-600 transform transition-transform duration-300 ease-in-out ${
            isExpanded ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          <Accordion
            multiple
            defaultValue={['meshes', 'animations']}
            variant="separated"
            onChange={() => {
              setTimeout(() => setPropExpandTrigger(prev => prev + 1), 200);
            }}
          >
            {/* Meshes Section */}
            <Accordion.Item value="meshes">
              <Accordion.Control icon={<IconCube size={20} />}>
                <Group gap="xs">
                  <Text fw={600}>Meshes</Text>
                  <Badge size="xs" variant="light" color="blue">
                    {currentProject?.meshes.length || 0}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {currentProject?.meshes.map(mesh => (
                    <Group key={mesh.id} gap="sm" wrap="nowrap" className="py-1">
                      <IconCube size={18} />
                      <Box className="flex-1">
                        <Group gap="xs" wrap="nowrap">
                          <Text
                            size="sm"
                            fw={selectedMeshId === mesh.id ? 700 : 400}
                            className={`cursor-pointer select-none ${
                              selectedMeshId === mesh.id ? 'text-yellow-600' : ''
                            }`}
                            onClick={() => handleMeshSelect(mesh.id)}
                          >
                            {mesh.name}
                          </Text>

                          {mesh.cameraPresetId && (
                            <Badge
                              size="xs"
                              variant="light"
                              color="blue"
                              leftSection={<IconCamera size={12} />}
                            >
                              {getPresetName(mesh.cameraPresetId).substring(0, 8)}
                            </Badge>
                          )}
                        </Group>
                      </Box>

                      <Menu
                        opened={contextMenuMeshId === mesh.id}
                        onChange={opened => setContextMenuMeshId(opened ? mesh.id : null)}
                        position="bottom-end"
                        withArrow
                      >
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            size="xs"
                            onClick={e => {
                              e.stopPropagation();
                              setContextMenuMeshId(contextMenuMeshId === mesh.id ? null : mesh.id);
                            }}
                          >
                            <IconDots size={14} />
                          </ActionIcon>
                        </Menu.Target>

                        <Menu.Dropdown>
                          <Menu.Label>Camera Presets</Menu.Label>
                          {cameraPresets.map(preset => (
                            <Menu.Item
                              key={preset.id}
                              leftSection={<IconCamera size={14} />}
                              onClick={() => handleAssignPreset(mesh.id, preset.id)}
                              className={
                                mesh.cameraPresetId === preset.id
                                  ? 'bg-blue-50 dark:bg-blue-900/20'
                                  : ''
                              }
                            >
                              <div>
                                <Text size="sm">{preset.name}</Text>
                                <Text size="xs" c="dimmed">
                                  {preset.description}
                                </Text>
                              </div>
                            </Menu.Item>
                          ))}

                          <Menu.Divider />

                          <Menu.Item leftSection={<IconEdit size={14} />}>Edit Mesh</Menu.Item>
                          <Menu.Item leftSection={<IconCopy size={14} />}>Duplicate</Menu.Item>
                          <Menu.Item leftSection={<IconTrash size={14} />} color="red">
                            Remove
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Animations Section */}
            <Accordion.Item value="animations">
              <Accordion.Control icon={<IconMovie size={20} />}>
                <Group gap="xs">
                  <Text fw={600}>Animations</Text>
                  <Badge size="xs" variant="light" color="green">
                    {currentProject?.animations.length || 0}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {currentProject?.animations.map(animation => (
                    <Group
                      key={animation.id}
                      gap="sm"
                      wrap="nowrap"
                      className="py-1 cursor-pointer"
                      onClick={() => {
                        setSelectedMeshId(animation.id);
                        // This will trigger AnimationSettings to show
                      }}
                    >
                      <IconMovie size={18} />
                      <Text
                        size="sm"
                        fw={selectedMeshId === animation.id ? 700 : 400}
                        className={selectedMeshId === animation.id ? 'text-yellow-600' : ''}
                      >
                        {animation.name}
                      </Text>
                      <Badge size="xs" variant="light" color="green">
                        {animation.frameCount}f
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          {!isProjectLoaded && (
            <Box className="mt-4 p-4 text-center text-gray-500 dark:text-gray-400">
              <IconFolder size={48} className="mx-auto mb-2 opacity-50" />
              <Text size="sm">No project loaded</Text>
              <Text size="xs">Create or open a project to manage meshes and animations</Text>
            </Box>
          )}
        </div>
      </div>
    </div>
  );
}
