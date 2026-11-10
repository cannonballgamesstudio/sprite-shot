/**
 * StartScreen — shown when no project is loaded.
 * Lists recent projects, allows creating new or opening existing.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../state/projectStore';

interface ProjectInfo {
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
  mesh_count: number;
  animation_count: number;
}

export function StartScreen() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const loadProject = useProjectStore((s) => s.loadProject);
  const createProject = useProjectStore((s) => s.createProject);

  useEffect(() => {
    invoke<ProjectInfo[]>('list_projects')
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const handleOpen = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Sprite Shot Scene', extensions: ['spriteshot'] }],
    });
    if (!selected) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      await loadProject(path);
    } catch (err) {
      console.error('Failed to open project:', err);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createProject(newName.trim(), '');
      setCreating(false);
      setNewName('');
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  const handleClickProject = async (project: ProjectInfo) => {
    try {
      await loadProject(project.path);
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-canvas">
      <div className="w-[400px] max-w-[90vw]">
        <h1 className="text-sm font-light tracking-[0.3em] text-fg-muted text-center mb-8">
          S P R I T E &nbsp; S T U D I O
        </h1>

        {creating ? (
          <div className="flex flex-col gap-2">
            <input
              className="flex-1 py-1.5 px-2.5 bg-input border border-input-border rounded text-fg text-xs outline-none focus:border-accent"
              type="text"
              placeholder="Scene name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button
                className="py-1.5 px-4 bg-accent border border-accent rounded text-white cursor-pointer text-[11px] transition-colors hover:bg-accent-hover"
                onClick={handleCreate}
              >
                Create
              </button>
              <button
                className="py-1.5 px-4 border border-panel-border rounded bg-panel text-fg cursor-pointer text-[11px] transition-colors hover:bg-header"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-[0.12em] text-fg-muted mb-1">
              Recent Scenes
            </div>
            <div className="h-px bg-panel-border mb-2" />

            {loading ? (
              <div className="py-6 text-center text-fg-muted text-xs">Loading...</div>
            ) : projects.length === 0 ? (
              <div className="py-6 text-center text-fg-muted text-xs">No recent scenes</div>
            ) : (
              <div className="flex flex-col gap-px mb-4">
                {projects.map((p) => (
                  <button
                    key={p.path}
                    className="flex justify-between items-center py-2 px-3 bg-transparent border-none rounded text-fg cursor-pointer text-left text-xs transition-colors hover:bg-panel"
                    onClick={() => handleClickProject(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[10px] text-fg-muted">{formatDate(p.modified_at)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                className="py-1.5 px-4 bg-accent border border-accent rounded text-white cursor-pointer text-[11px] transition-colors hover:bg-accent-hover"
                onClick={() => setCreating(true)}
              >
                + New Scene
              </button>
              <button
                className="py-1.5 px-4 border border-panel-border rounded bg-panel text-fg cursor-pointer text-[11px] transition-colors hover:bg-header"
                onClick={handleOpen}
              >
                Open File...
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
