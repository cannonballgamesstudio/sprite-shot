import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useMeshTreeStore } from '../state/meshTree';
import {
  Group,
  Button,
  Select,
  Stack,
  Text,
  NumberInput,
  Switch,
  Badge,
  ActionIcon,
} from '@mantine/core';
import { IconPlus, IconTrash, IconCube } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { message } from '@tauri-apps/plugin-dialog';
import { ProjectProp } from '../types/project';

interface PropManagerProps {
  availableBones: string[];
  selectedPropId?: string | null;
  onSelectProp?: (propId: string | null) => void;
  loadedMeshId?: string | null; // The mesh that's actually loaded in viewport
}

export const PropManager: React.FC<PropManagerProps> = ({
  availableBones,
  onSelectProp,
  loadedMeshId,
}) => {
  const currentProject = useProjectStore(state => state.currentProject);
  const selectedMeshId = useMeshTreeStore(state => state.selectedMeshId);
  const getPropsForMesh = useProjectStore(state => state.getPropsForMesh);
  const importProp = useProjectStore(state => state.importProp);
  const removeProp = useProjectStore(state => state.removeProp);
  const updateProp = useProjectStore(state => state.updateProp);

  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Use loadedMeshId if available, otherwise fall back to selectedMeshId
  const meshIdForProps = loadedMeshId || selectedMeshId;
  const meshProps = meshIdForProps ? getPropsForMesh(meshIdForProps) : [];

  const handleImportProp = async () => {
    const meshId = loadedMeshId || selectedMeshId;
    if (!meshId || !selectedBone) {
      await message('Please load a mesh and select a bone first', {
        title: 'Import Prop',
        kind: 'warning',
      });
      return;
    }

    try {
      setIsImporting(true);

      const selected = await open({
        multiple: false,
        filters: [{ name: 'Mesh Files', extensions: ['gltf', 'glb', 'fbx'] }],
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;
      // Extract display name without extension for UI messages
      const displayName =
        path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.(gltf|glb|fbx)$/i, '') || 'Prop';

      // Pass undefined to use original filename with extension
      await importProp(path, meshId, selectedBone, undefined);

      await message(`Prop "${displayName}" attached to bone "${selectedBone}"`, {
        title: 'Success',
        kind: 'info',
      });
    } catch (error) {
      console.error('Failed to import prop:', error);
      await message(`Failed to import prop: ${error}`, { title: 'Error', kind: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRemoveProp = async (propId: string, propName: string) => {
    try {
      removeProp(propId);
      await message(`Prop "${propName}" removed`, { title: 'Success', kind: 'info' });
    } catch (error) {
      console.error('Failed to remove prop:', error);
    }
  };

  const handleUpdatePropTransform = (
    propId: string,
    field: 'positionOffset' | 'rotationOffset' | 'scaleOffset',
    index: number,
    value: number
  ) => {
    const prop = currentProject?.props.find(p => p.id === propId);
    if (!prop) return;

    const newOffset = [...prop[field]] as [number, number, number];
    newOffset[index] = value;

    updateProp(propId, { [field]: newOffset });
  };

  const handleToggleVisibility = (propId: string, isVisible: boolean) => {
    updateProp(propId, { isVisible });
  };

  const [propExpandTrigger, setPropExpandTrigger] = useState(0);
  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      const maxHeight = 384; // max-h-96 = 384px
      setContentHeight(Math.min(fullHeight, maxHeight));
    }
  }, [isExpanded, meshProps, propExpandTrigger]);

  if (!selectedMeshId) {
    return (
      <Stack gap="sm" className="p-4">
        <Text size="sm" c="dimmed">
          Select a mesh to manage props
        </Text>
      </Stack>
    );
  }
  return (
    <div>
      <div
        className="flex items-center justify-between p-3 transition-colors hover:text-white"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
          Props{' '}
          <Badge size="sm" variant="light">
            {meshProps.length} props
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
          className={`p-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-700 scrollbar-background-gray-600 transform transition-transform duration-300 ease-in-out ${
            isExpanded ? 'translate-y-0' : '-translate-y-4'
          }`}
        >
          {/* Import Section */}
          <Stack gap="xs">
            <Text size="xs" fw={500}>
              Attach New Prop
            </Text>
            <Select
              placeholder="Select bone"
              data={availableBones}
              value={selectedBone}
              onChange={setSelectedBone}
              searchable
              size="xs"
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleImportProp}
              disabled={!selectedBone || isImporting}
              loading={isImporting}
              size="xs"
              fullWidth
            >
              Import Prop
            </Button>
          </Stack>

          {/* Props List */}
          {meshProps.length > 0 && (
            <Stack gap="sm">
              <Text size="xs" fw={500}>
                Attached Props
              </Text>
              {meshProps.map(prop => (
                <PropItem
                  key={prop.id}
                  prop={prop}
                  onRemove={() => handleRemoveProp(prop.id, prop.name)}
                  onUpdateTransform={handleUpdatePropTransform}
                  onToggleVisibility={handleToggleVisibility}
                  onSelectProp={onSelectProp}
                  onExpandChange={() => setPropExpandTrigger(prev => prev + 1)}
                />
              ))}
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
};

interface PropItemProps {
  prop: ProjectProp;
  onRemove: () => void;
  onUpdateTransform: (
    propId: string,
    field: 'positionOffset' | 'rotationOffset' | 'scaleOffset',
    index: number,
    value: number
  ) => void;
  onToggleVisibility: (propId: string, isVisible: boolean) => void;
  onSelectProp?: (propId: string | null) => void;
  onExpandChange?: () => void;
}

const PropItem: React.FC<PropItemProps> = ({
  prop,
  onRemove,
  onUpdateTransform,
  onToggleVisibility,
  onSelectProp,
  onExpandChange,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Stack gap="xs" className="p-2 border border-gray-700 rounded flex-1 w-full">
      <Group
        gap="xs"
        wrap="nowrap"
        onClick={() => onSelectProp?.(prop.id)}
        style={{ cursor: 'pointer' }}
      >
        <IconCube size={16} />
        <div className="flex-1 truncate text-xs flex items-center gap-1">
          <span>{prop.name}</span>
          <Badge size="xs" variant="light">
            {prop.parentBoneName}
          </Badge>
        </div>

        <Switch
          size="xs"
          checked={prop.isVisible}
          onChange={e => onToggleVisibility(prop.id, e.currentTarget.checked)}
        />
        <ActionIcon size="xs" color="red" variant="subtle" onClick={onRemove}>
          <IconTrash size={14} />
        </ActionIcon>
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={() => {
            setExpanded(!expanded);
            onExpandChange?.();
          }}
        >
          <Text size="xs">{expanded ? '−' : '+'}</Text>
        </ActionIcon>
      </Group>

      {expanded && (
        <Stack gap="xs" className="pl-4">
          <Group gap="xs">
            <Text size="xs" fw={500} w="50">
              Position
            </Text>
            <Text size="xs">X</Text>
            <NumberInput
              size="xs"
              value={prop.positionOffset[0]}
              onChange={val => onUpdateTransform(prop.id, 'positionOffset', 0, Number(val))}
              step={0.01}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Y</Text>
            <NumberInput
              size="xs"
              value={prop.positionOffset[1]}
              onChange={val => onUpdateTransform(prop.id, 'positionOffset', 1, Number(val))}
              step={0.01}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Z</Text>
            <NumberInput
              size="xs"
              value={prop.positionOffset[2]}
              onChange={val => onUpdateTransform(prop.id, 'positionOffset', 2, Number(val))}
              step={0.01}
              styles={{ root: { flex: 1 } }}
            />
          </Group>

          <Group gap="xs">
            <Text size="xs" fw={500} w="50">
              Rotation
            </Text>
            <Text size="xs">X</Text>
            <NumberInput
              size="xs"
              value={(prop.rotationOffset[0] * 180) / Math.PI}
              onChange={val =>
                onUpdateTransform(prop.id, 'rotationOffset', 0, (Number(val) * Math.PI) / 180)
              }
              step={1}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Y</Text>
            <NumberInput
              size="xs"
              value={(prop.rotationOffset[1] * 180) / Math.PI}
              onChange={val =>
                onUpdateTransform(prop.id, 'rotationOffset', 1, (Number(val) * Math.PI) / 180)
              }
              step={1}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Z</Text>
            <NumberInput
              size="xs"
              value={(prop.rotationOffset[2] * 180) / Math.PI}
              onChange={val =>
                onUpdateTransform(prop.id, 'rotationOffset', 2, (Number(val) * Math.PI) / 180)
              }
              step={1}
              styles={{ root: { flex: 1 } }}
            />
          </Group>

          <Group gap="xs">
            <Text size="xs" fw={500} w="50">
              Scale
            </Text>
            <Text size="xs">X</Text>
            <NumberInput
              size="xs"
              value={prop.scaleOffset[0]}
              onChange={val => onUpdateTransform(prop.id, 'scaleOffset', 0, Number(val))}
              step={0.1}
              min={0.01}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Y</Text>
            <NumberInput
              size="xs"
              value={prop.scaleOffset[1]}
              onChange={val => onUpdateTransform(prop.id, 'scaleOffset', 1, Number(val))}
              step={0.1}
              min={0.01}
              styles={{ root: { flex: 1 } }}
            />
            <Text size="xs">Z</Text>
            <NumberInput
              size="xs"
              value={prop.scaleOffset[2]}
              onChange={val => onUpdateTransform(prop.id, 'scaleOffset', 2, Number(val))}
              step={0.1}
              min={0.01}
              styles={{ root: { flex: 1 } }}
            />
          </Group>
        </Stack>
      )}
    </Stack>
  );
};
