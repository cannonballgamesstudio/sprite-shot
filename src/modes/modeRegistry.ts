/**
 * Mode registry — central registration and lookup for all modes.
 *
 * Modes register themselves via registerMode() at import time.
 * App.tsx imports the register files to trigger registration.
 */

import type { IMode } from './IMode';

const registry = new Map<string, IMode>();

export function registerMode(mode: IMode): void {
  if (registry.has(mode.config.id)) {
    console.warn(`Mode "${mode.config.id}" already registered, overwriting`);
  }
  registry.set(mode.config.id, mode);
}

export function getMode(id: string): IMode | undefined {
  return registry.get(id);
}

export function getAllModes(): IMode[] {
  return Array.from(registry.values());
}

export function getModeIds(): string[] {
  return Array.from(registry.keys());
}
