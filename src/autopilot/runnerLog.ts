import { invoke } from '@tauri-apps/api/core';

/** Mirrors progress to the webview console AND the process stdout (so a wrapper script can
 *  follow a batch run). Rust side: autopilot::log_line (src-tauri/src/autopilot.rs). */
export function logLine(line: string): void {
  console.log(line);
  void invoke('log_line', { line }).catch(() => {});
}
