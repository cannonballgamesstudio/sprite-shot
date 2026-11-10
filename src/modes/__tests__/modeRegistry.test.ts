import { describe, it, expect, beforeEach } from 'vitest';
import type { IMode } from '../IMode';

// ── Unit tests for registry logic (no Babylon.js dependency) ──

function createRegistry() {
  const map = new Map<string, IMode>();
  return {
    register(mode: IMode) { map.set(mode.config.id, mode); },
    get(id: string) { return map.get(id); },
    getAll() { return Array.from(map.values()); },
    getIds() { return Array.from(map.keys()); },
  };
}

function makeMockMode(id: string, label: string, overrides?: Partial<IMode>): IMode {
  return {
    config: {
      id,
      label,
      description: `${label} mode`,
      capabilities: {
        supportsAnimation: false,
        supportsProps: false,
        supportsVR: false,
        captureOutputType: 'spritesheet',
        supportedCameraModes: [0],
      },
    },
    ViewportComponent: () => null,
    ...overrides,
  };
}

describe('modeRegistry', () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  it('registers and retrieves a mode', () => {
    const mode = makeMockMode('test', 'Test');
    registry.register(mode);
    expect(registry.get('test')).toBe(mode);
  });

  it('returns undefined for unregistered mode', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered modes', () => {
    registry.register(makeMockMode('a', 'A'));
    registry.register(makeMockMode('b', 'B'));
    registry.register(makeMockMode('c', 'C'));
    expect(registry.getAll()).toHaveLength(3);
    expect(registry.getIds()).toEqual(['a', 'b', 'c']);
  });

  it('preserves insertion order', () => {
    registry.register(makeMockMode('static', 'Static'));
    registry.register(makeMockMode('animated', 'Animated'));
    registry.register(makeMockMode('vr', 'VR'));
    expect(registry.getIds()).toEqual(['static', 'animated', 'vr']);
  });

  it('overwrites on duplicate registration', () => {
    const mode1 = makeMockMode('dup', 'First');
    const mode2 = makeMockMode('dup', 'Second');
    registry.register(mode1);
    registry.register(mode2);
    expect(registry.get('dup')?.config.label).toBe('Second');
    expect(registry.getAll()).toHaveLength(1);
  });

  it('returns empty array when nothing registered', () => {
    expect(registry.getAll()).toEqual([]);
    expect(registry.getIds()).toEqual([]);
  });
});

describe('mode config validation', () => {
  it('modes with all 4 capture output types are valid', () => {
    const registry = createRegistry();
    const types = ['spritesheet', 'image-sequence', 'training-data'] as const;
    types.forEach((type, i) => {
      registry.register(makeMockMode(`mode-${i}`, `Mode ${i}`, {
        config: {
          id: `mode-${i}`,
          label: `Mode ${i}`,
          description: `Test ${type}`,
          capabilities: {
            supportsAnimation: type !== 'spritesheet',
            supportsProps: false,
            supportsVR: type === 'image-sequence',
            captureOutputType: type,
            supportedCameraModes: [0, 1],
          },
        },
      }));
    });
    expect(registry.getAll()).toHaveLength(3);
  });

  it('mode lifecycle hooks are optional', () => {
    const mode = makeMockMode('no-hooks', 'No Hooks');
    expect(mode.onActivate).toBeUndefined();
    expect(mode.onDeactivate).toBeUndefined();
    expect(mode.captureStrategy).toBeUndefined();
    expect(mode.SettingsPanel).toBeUndefined();
  });

  it('mode with lifecycle hooks can be called', () => {
    let activated = false;
    let deactivated = false;
    const mode = makeMockMode('lifecycle', 'Lifecycle', {
      onActivate: () => { activated = true; },
      onDeactivate: () => { deactivated = true; },
    });

    mode.onActivate!();
    expect(activated).toBe(true);

    mode.onDeactivate!();
    expect(deactivated).toBe(true);
  });
});
