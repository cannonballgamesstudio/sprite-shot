import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';
import AutopilotRunner, { AutopilotArgs } from './autopilot/AutopilotRunner';
import EffectAutopilotRunner, { EffectAutopilotArgs } from './autopilot/EffectAutopilotRunner';

function parseAutopilotArgs(args: string[]): AutopilotArgs | null {
  const i = args.indexOf('--batch');
  if (i < 0 || !args[i + 1]) return null;
  const force: string[] = [];
  args.forEach((a, idx) => { if (a === '--force' && args[idx + 1]) force.push(args[idx + 1]); });
  return { configPath: args[i + 1], preview: args.includes('--preview'), force };
}

/** --effects-batch <path> — mutually exclusive with --batch, same shape/semantics, dispatches
 *  to EffectAutopilotRunner instead of AutopilotRunner (see that file's module doc). */
function parseEffectAutopilotArgs(args: string[]): EffectAutopilotArgs | null {
  const i = args.indexOf('--effects-batch');
  if (i < 0 || !args[i + 1]) return null;
  const force: string[] = [];
  args.forEach((a, idx) => { if (a === '--force' && args[idx + 1]) force.push(args[idx + 1]); });
  return { configPath: args[i + 1], preview: args.includes('--preview'), force };
}

async function boot() {
  const args = await invoke<string[]>('get_cli_args').catch(() => [] as string[]);
  const autopilot = parseAutopilotArgs(args);
  const effectsAutopilot = autopilot ? null : parseEffectAutopilotArgs(args);
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      {autopilot ? <AutopilotRunner args={autopilot} />
        : effectsAutopilot ? <EffectAutopilotRunner args={effectsAutopilot} />
        : <App />}
    </React.StrictMode>,
  );
}

void boot();
