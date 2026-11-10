import type { LookSpec } from '../core/capture/sphericalAnimationCapture';

export interface ArchetypeSpec { name: string; scale: [number, number, number] }
export interface FitSpec {
  heightPose: string; heightArchetype: string; widthArchetype: string; fillFrac: number;
}
export interface BatchConfig {
  tool?: { exe?: string };
  output: { dir: string };
  presetId: string;
  frames: number;
  sourceDir: string;
  /** Fixed yaw (degrees) applied to the model so its authored front lands on the rig's cam-0
   *  (+X) axis — a MODEL property (belongs to the clip/rig geometry), not a per-look one.
   *  Optional; defaults to 0 (no rotation) when absent. */
  modelYawDeg?: number;
  poses: Record<string, string | { clip: string; trim?: [number, number] } | null>;
  archetypes: ArchetypeSpec[];
  fit: FitSpec;
  look: LookSpec;
  preview?: { out: string };
  /** optional raw clip pool for --preview; pose assignments are added to the pool automatically */
  clips?: string[];
}
export interface ResolvedJob {
  archetype: ArchetypeSpec; pose: string; clipPath: string;
  trim?: [number, number]; fileName: string;
}

const isAbs = (p: string) => /^([a-zA-Z]:[\\/]|\/)/.test(p);
const join = (a: string, b: string) => `${a.replace(/[\\/]+$/, '')}/${b}`.replace(/\\/g, '/');
const resolve = (base: string, p: string) => (isAbs(p) ? p.replace(/\\/g, '/') : join(base, p));

export function parseBatchConfig(
  jsonText: string, configDir: string, opts: { preview: boolean },
): { config: BatchConfig; jobs: ResolvedJob[]; clipPool: { name: string; path: string }[]; errors: string[] } {
  const errors: string[] = [];
  let config = {} as BatchConfig;
  try {
    config = JSON.parse(jsonText) as BatchConfig;
  } catch (e) {
    return { config, jobs: [], clipPool: [], errors: [`config is not valid JSON: ${e}`] };
  }

  for (const key of ['output', 'presetId', 'frames', 'sourceDir', 'poses', 'archetypes', 'fit', 'look'] as const) {
    if (config[key] === undefined || config[key] === null) errors.push(`config.${key} is required`);
  }
  // modelYawDeg is optional (defaults to 0 downstream) but must be a finite number when present.
  if (config.modelYawDeg !== undefined && (typeof config.modelYawDeg !== 'number' || !Number.isFinite(config.modelYawDeg))) {
    errors.push(`config.modelYawDeg must be a finite number`);
  }
  // Filenames parse as <archetype>_<pose>.png (downstream tooling can match /^[a-z0-9]+_[a-z0-9]+\.png$/i)
  // — both halves must be letters/digits only, or a hyphenated/spaced name bakes a sheet that
  // such a filter would silently ignore.
  const CHARSET_RE = /^[a-z0-9]+$/i;
  const charsetError = (kind: string, name: string) =>
    `${kind} "${name}": letters/digits only — filenames parse as <archetype>_<pose>.png ` +
    `(no underscores, hyphens, spaces, etc.)`;
  for (const a of config.archetypes ?? []) {
    if (!CHARSET_RE.test(a.name)) {
      errors.push(charsetError('archetype', a.name));
    }
    if (!Array.isArray(a.scale) || a.scale.length !== 3) {
      errors.push(`archetype "${a.name}": scale must be [x, y, z]`);
    }
  }
  for (const pose of Object.keys(config.poses ?? {})) {
    if (!CHARSET_RE.test(pose)) {
      errors.push(charsetError('pose', pose));
    }
  }
  if (config.clips !== undefined && (!Array.isArray(config.clips) || !config.clips.every((c) => typeof c === 'string'))) {
    errors.push(`config.clips must be an array of clip filenames`);
  }

  const clipPoolMap = new Map<string, { name: string; path: string }>();
  const jobs: ResolvedJob[] = [];

  // Skip job generation if there are required-key errors
  if (errors.length === 0) {
    const sourceDir = config.sourceDir ? resolve(configDir, config.sourceDir) : '';

    // Seed clipPool from optional clips field
    for (const clip of config.clips ?? []) {
      const clipPath = resolve(sourceDir, clip);
      if (!clipPoolMap.has(clipPath)) {
        clipPoolMap.set(clipPath, { name: clip, path: clipPath });
      }
    }

    for (const [pose, assignment] of Object.entries(config.poses ?? {})) {
      if (assignment === null) {
        if (!opts.preview) {
          errors.push(`pose "${pose}" is unassigned (null) — run --preview and fill in crowd-batch.json`);
        }
        continue;
      }
      const clip = typeof assignment === 'string' ? assignment : assignment.clip;
      const trim = typeof assignment === 'string' ? undefined : assignment.trim;
      const clipPath = resolve(sourceDir, clip);
      if (!clipPoolMap.has(clipPath)) {
        clipPoolMap.set(clipPath, { name: clip, path: clipPath });
      }
      for (const archetype of config.archetypes ?? []) {
        jobs.push({ archetype, pose, clipPath, trim, fileName: `${archetype.name}_${pose}.png` });
      }
    }
  }

  const clipPool = Array.from(clipPoolMap.values());
  return { config, jobs, clipPool, errors };
}
