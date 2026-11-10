/**
 * StatusBar — 24px info strip at the bottom.
 */

import { useAppStore } from '../state/appStore';
import { useProjectStore } from '../state/projectStore';

export function StatusBar() {
  const cameraCount = useAppStore((s) => s.cameraCount);
  const cameraProps = useAppStore((s) => s.cameraProps);
  const currentMeshPath = useAppStore((s) => s.currentMeshPath);
  const projectName = useProjectStore((s) => s.currentProject?.name);

  const meshName = currentMeshPath
    ? currentMeshPath.split('/').pop()?.split('\\').pop() ?? '\u2014'
    : 'No mesh';

  return (
    <div className="col-span-2 flex items-center gap-2 px-3 h-6 bg-panel border-t border-panel-border text-[10px] text-fg-muted">
      <span>{cameraCount} cameras</span>
      <span className="w-px h-2.5 bg-panel-border" />
      <span>{meshName}</span>
      <span className="w-px h-2.5 bg-panel-border" />
      <span>{cameraProps.resolution[0]}x{cameraProps.resolution[1]}</span>
      <span className="flex-1" />
      <span>{projectName ?? 'Unsaved'}</span>
    </div>
  );
}
