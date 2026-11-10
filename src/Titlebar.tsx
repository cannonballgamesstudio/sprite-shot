import { useState } from 'react';
import { Menu, Button } from '@mantine/core';

import IconMinimize from '~icons/mdi-light/minus';
import IconMaximize from '~icons/mdi-light/square';
import IconClose from '~icons/lets-icons/close-square-light';
import IconFile from '~icons/mdi/file';
import IconFolderOpen from '~icons/mdi/folder-open';
import IconContentSave from '~icons/mdi/content-save';
import IconFileDocument from '~icons/mdi/file-document'; // For scene files
// import IconContentSaveAs from '~icons/mdi/content-save-as';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './utils/isTauri';
const appWindow = isTauri ? getCurrentWindow() : (null as any);

import { TitlebarIconButton } from './components/TitlebarComponents';
import { useMenuActions } from './state/menuActions';
import { useProjectStore } from './state/projectStore';

import { message, open } from '@tauri-apps/plugin-dialog';
import { IconMovie } from '@tabler/icons-react';

export default function Titlebar() {
  const [spinning, setSpinning] = useState(false);
  const triggerOpen = useMenuActions(state => state.triggerOpen);

  // Project store actions
  const {
    newProject,
    saveProject,
    saveAsProject,
    loadProject,
    hasUnsavedChanges,
    importAnimation,
    currentProject,
    projectPath,
  } = useProjectStore();

  const handleLogoClick = () => {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
  };

  const handleNew = () => {
    if (hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Create new project anyway?');
      if (!confirmed) return;
    }
    newProject();
  };

  const handleSave = async () => {
    try {
      if (!projectPath) {
        // This is an unsaved project, need Save As
        const projectName = prompt('Enter project name:');
        if (projectName) {
          await saveAsProject(projectName);
        }
      } else {
        await saveProject();
      }
    } catch (error) {
      console.error('Save failed:', error);
      alert(`Save failed: ${error}`);
    }
  };

  const handleSaveAs = async () => {
    const projectName = prompt('Enter project name:');
    if (projectName) {
      try {
        await saveAsProject(projectName);
      } catch (error) {
        console.error('Save As failed:', error);
        alert(`Save As failed: ${error}`);
      }
    }
  };
  const handleLoadScene = async () => {
    if (hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Load a different scene anyway?');
      if (!confirmed) return;
    }

    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Sprite Shot Scene Files', extensions: ['spriteshot'] }],
        title: 'Load Scene',
      });

      if (selected && typeof selected === 'string') {
        await loadProject(selected);
        console.log('Scene loaded successfully');
      }
    } catch (error) {
      console.error('Load scene failed:', error);
      alert(`Failed to load scene: ${error}`);
    }
  };
  const handleImportAnimation = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Animation Files', extensions: ['glb', 'fbx'] }],
      });

      if (!selected) return;

      const path = Array.isArray(selected) ? selected[0] : selected;

      // Import the animation into the project
      await importAnimation(path);

      await message('Animation imported successfully', {
        title: 'Success',
        kind: 'info',
      });
    } catch (error) {
      console.error('Failed to import animation:', error);
      await message(`Failed to import animation: ${error}`, {
        title: 'Error',
        kind: 'error',
      });
    }
  };
  return (
    <div
      data-tauri-drag-region
      className="relative z-[1000] h-[35px] bg-[#FBF236] select-none flex justify-between"
    >
      <div className="flex items-center">
        <div className="w-[6px]"></div>

        {/* Logo */}
        <div
          className="flex items-center h-[24px] w-[24px]"
          onClick={handleLogoClick}
          style={{ cursor: 'pointer' }}
        >
          <img src="fav.png" className={spinning ? 'spin' : ''} />
        </div>
        <div className="w-[6px]"></div>

        {/* File Menu */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="xs"
              className="h-[35px] px-3 text-black font-mono text-[12px] hover:bg-[rgba(157,157,157,0.3)] rounded-none"
              leftSection={<IconFile width={14} height={14} />}
            >
              File
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFile width={14} height={14} />} onClick={handleNew}>
              New
            </Menu.Item>

            <Menu.Divider />
            <Menu.Item
              leftSection={<IconFileDocument width={14} height={14} />}
              onClick={handleLoadScene}
            >
              Load Scene
            </Menu.Item>
            <Menu.Item
              leftSection={<IconFolderOpen width={14} height={14} />}
              onClick={() => triggerOpen()}
            >
              Open
            </Menu.Item>

            <Menu.Divider />

            <Menu.Item
              leftSection={<IconContentSave width={14} height={14} />}
              onClick={handleSave}
              disabled={!currentProject}
            >
              {projectPath ? 'Save' : 'Save As...'}
            </Menu.Item>

            <Menu.Item
              leftSection={<IconContentSave width={14} height={14} />}
              onClick={handleSaveAs}
              disabled={!currentProject}
            >
              Save As...
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Edit Menu */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="xs"
              className="h-[35px] px-3 text-black font-mono text-[12px] hover:bg-[rgba(157,157,157,0.3)] rounded-none"
            >
              Edit
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item disabled>Undo</Menu.Item>
            <Menu.Item disabled>Redo</Menu.Item>
            <Menu.Divider />
            <Menu.Item disabled>Cut</Menu.Item>
            <Menu.Item disabled>Copy</Menu.Item>
            <Menu.Item disabled>Paste</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="xs"
              className="h-[35px] px-3 text-black font-mono text-[12px] hover:bg-[rgba(157,157,157,0.3)] rounded-none"
            >
              Import
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item>Rigged Mesh</Menu.Item>
            <Menu.Item>Prop</Menu.Item>
            <Menu.Item leftSection={<IconMovie size={14} />} onClick={handleImportAnimation}>
              Animation
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Render Menu */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="xs"
              className="h-[35px] px-3 text-black font-mono text-[12px] hover:bg-[rgba(157,157,157,0.3)] rounded-none"
            >
              Render
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item disabled>Capture Current View</Menu.Item>
            <Menu.Item disabled>Capture All Cameras</Menu.Item>
            <Menu.Divider />
            <Menu.Item disabled>Export Spritesheet</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Help Menu */}
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              size="xs"
              className="h-[35px] px-3 text-black font-mono text-[12px] hover:bg-[rgba(157,157,157,0.3)] rounded-none"
            >
              Help
            </Button>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item disabled>Documentation</Menu.Item>
            <Menu.Item disabled>Keyboard Shortcuts</Menu.Item>
            <Menu.Divider />
            <Menu.Item disabled>About Sprite Shot</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Project Status Indicator */}
        <div className="ml-4 flex items-center text-xs font-mono text-gray-700">
          {currentProject?.name || 'No Project'}
          {hasUnsavedChanges() && <span className="text-red-600 ml-1">*</span>}
        </div>
      </div>

      {/* Window Controls */}
      <div className="flex items-center">
        <TitlebarIconButton
          title="Minimize"
          onClick={() => appWindow && appWindow.minimize()}
          hoverBg="hover:bg-[rgba(157,157,157,0.5)]"
        >
          <IconMinimize className="w-4 h-4 text-gray-700" />
        </TitlebarIconButton>
        <TitlebarIconButton
          title="Maximize"
          onClick={() => appWindow && appWindow.toggleMaximize()}
          hoverBg="hover:bg-[rgba(157,157,157,0.5)]"
        >
          <IconMaximize className="w-4 h-4 text-gray-700" />
        </TitlebarIconButton>
        <TitlebarIconButton
          title="Close"
          onClick={() => appWindow && appWindow.close()}
          hoverBg="hover:bg-red-500"
        >
          <IconClose className="w-4 h-4 text-gray-700 group-hover:text-white transition-colors duration-200" />
        </TitlebarIconButton>
      </div>
    </div>
  );
}
