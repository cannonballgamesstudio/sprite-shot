import type { LookSpec } from '../core/capture/sphericalAnimationCapture';
import type { EffectSpec } from './loadShaderEffect';

/**
 * effectBatchConfig — the effects-batch sibling to batchConfig.ts. A DELIBERATELY PARALLEL,
 * simpler schema, not an extension of BatchConfig: an effects batch is naturally "a list of
 * effect instances with variant params," and the crowd's archetypes/fit/poses vocabulary
 * (multiple body-type scale variants of the SAME clip, auto-framed consistently) has no clean
 * effect analog — forcing it in would tangle two different domain models into one config.
 */

export interface EffectBatchConfig {
  tool?: { exe?: string };
  output: { dir: string };
  presetId: string;
  frames: number;
  effects: Record<string, EffectSpec>;
  look: LookSpec;
  preview?: { out: string };
}

export interface ResolvedEffectJob {
  effectName: string;
  spec: EffectSpec;
  fileName: string;
}

// Filenames parse as <effectName>.png (mirrors batchConfig.ts's <archetype>_<pose>.png
// filename-is-manifest convention, minus the archetype axis effects don't have).
const CHARSET_RE = /^[a-z0-9-]+$/i;

export function parseEffectBatchConfig(
  jsonText: string,
): { config: EffectBatchConfig; jobs: ResolvedEffectJob[]; errors: string[] } {
  const errors: string[] = [];
  let config = {} as EffectBatchConfig;
  try {
    config = JSON.parse(jsonText) as EffectBatchConfig;
  } catch (e) {
    return { config, jobs: [], errors: [`config is not valid JSON: ${e}`] };
  }

  for (const key of ['output', 'presetId', 'frames', 'effects', 'look'] as const) {
    if (config[key] === undefined || config[key] === null) errors.push(`config.${key} is required`);
  }
  if (config.frames !== undefined && (typeof config.frames !== 'number' || !Number.isFinite(config.frames) || config.frames < 1)) {
    errors.push(`config.frames must be a positive number`);
  }

  const jobs: ResolvedEffectJob[] = [];
  if (errors.length === 0) {
    const names = Object.keys(config.effects ?? {});
    if (names.length === 0) {
      errors.push(`config.effects must have at least one entry`);
    }
    for (const effectName of names) {
      if (!CHARSET_RE.test(effectName)) {
        errors.push(`effect "${effectName}": letters/digits/hyphens only — filenames parse as <effectName>.png`);
        continue;
      }
      const spec = config.effects[effectName];
      if (!spec || typeof spec.shader !== 'string' || !spec.shader) {
        errors.push(`effect "${effectName}": "shader" is required`);
        continue;
      }
      jobs.push({ effectName, spec, fileName: `${effectName}.png` });
    }
  }

  return { config, jobs, errors };
}
