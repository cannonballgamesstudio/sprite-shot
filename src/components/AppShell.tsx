/**
 * AppShell — root layout component.
 *
 * Two states:
 * 1. No project loaded → renders StartScreen
 * 2. Project loaded → renders the docked editor grid layout
 */

import { useProjectStore } from '../state/projectStore';
import { useTrainingEvents } from '../hooks/useTrainingEvents';
import { StartScreen } from './StartScreen';
import { StatusBar } from './StatusBar';
import { PropertiesPanel } from './PropertiesPanel';
import { BottomBar } from './BottomBar';
import CharacterViewport from '../CharacterViewport';

export function AppShell() {
  const isProjectLoaded = useProjectStore((s) => s.isProjectLoaded);
  const currentProject = useProjectStore((s) => s.currentProject);

  useTrainingEvents();

  if (!isProjectLoaded || !currentProject) {
    return <StartScreen />;
  }

  return (
    <div className="grid grid-cols-[1fr_280px] grid-rows-[1fr_24px] h-full overflow-hidden bg-canvas">
      {/* Main area: viewport + bottom bar */}
      <div className="flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 relative">
          <CharacterViewport />
        </div>
        <BottomBar />
      </div>

      {/* Right properties panel */}
      <PropertiesPanel />

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}
