# Sprite Shot

Sprite Shot is a desktop tool for turning rigged 3D characters into 2D sprite sheets. It loads a
character, applies animation clips, renders every frame from a ring (or sphere) of cameras, and
post-processes the result into a cel-shaded sprite sheet. It also contains a few experimental 2D
asset generation features: procedural status-effect shaders, a gaussian-splat training-data
capture mode, and VR IK experiments.

Built with Tauri 2, React, TypeScript and Babylon.js.

<!-- screenshot -->

## Features

- **Sprite sheet capture.** Load a rigged GLB/GLTF character (FBX is converted on import), apply
  animation clips, and render every frame from every rig camera into a single sheet.
- **Spherical camera rigs.** Camera presets with multiple elevation rings and a configurable
  number of azimuth cameras per ring, orthographic or perspective, with automatic framing so the
  subject fills a fixed fraction of each cell.
- **Cel post-processing.** Per-cell image operations run at supersampled resolution and are then
  downsampled: cel quantization (band count, optional output range and desaturation), alpha
  outline, matte bleed (bleeds RGB into transparent pixels to avoid dark fringes), and optional
  hard alpha cutout.
- **Autopilot batch mode.** Headless batch rendering driven by a JSON config, with resume
  (existing sheets are skipped), per-sheet `--force` re-renders, a contact-sheet preview mode,
  a `batch-report.json`, and process exit codes for use in scripts.
- **Effect shaders.** Procedural, animated status-effect subjects rendered through the same
  rig: `lightning`, `fireball`, `ice`, `flame`, `miasma`, `frost`, `roots`, `wet`, `charged`,
  `paralyzed`, `evasion`, `stunned`, `silenced`. Subjects can be billboarded quads or real 3D
  geometry (sphere, box, cone) so volumetric effects look different from each angle.
- **Projects.** Scenes are saved as `.spriteshot` files (compressed binary, versioned with
  migrations) inside a per-project folder with meshes, animations, thumbnails and backups.
- **Experimental: gaussian-splat capture.** Renders a multi-view image set with camera
  intrinsics and extrinsics in the NeRF/nerfstudio `transforms.json` convention, usable with
  gsplat, nerfstudio or brush. Optional in-app training through
  [brush](https://github.com/ArthurBrussee/brush) behind a Cargo feature (see below).
- **Experimental: VR IK.** WebXR first-person arms mode using
  [ikts](https://www.npmjs.com/package/ikts) and Babylon bone IK to drive a character's arms
  from VR controllers.

## Requirements

- Node.js 20 or newer and npm
- Rust (stable) and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for
  your platform
- FBX2glTF, only if you import FBX files (see below)
- A GPU with WebGL2 support. The optional splat-training feature needs a GPU supported by wgpu
  (Vulkan, DirectX 12 or Metal).

## Setup

```sh
npm install
```

### FBX2glTF

FBX files are converted to GLB with
[FBX2glTF](https://github.com/facebookincubator/FBX2glTF). No binary is committed to this
repository. The converter is looked up in this order (`src-tauri/src/fbx_converter.rs`):

1. The `FBX2GLTF_BIN` environment variable, if it points to an existing file.
2. `node_modules/fbx2gltf/bin/<Windows_NT|Darwin|Linux>/FBX2glTF[.exe]`. The `fbx2gltf` npm
   dependency installs this during `npm install`, so development usually needs no extra step.
3. Next to the application executable (`FBX2glTF.exe` on Windows, `FBX2glTF` elsewhere). Use
   this for an installed or bundled build.

To install it manually, download the binary for your platform from the
[FBX2glTF releases page](https://github.com/facebookincubator/FBX2glTF/releases), rename it to
`FBX2glTF` (or `FBX2glTF.exe`), and either set `FBX2GLTF_BIN` to its path or place it next to the
built `sprite-shot` executable. It is not configured as a Tauri sidecar, so `tauri build` does
not require it; FBX import reports an error if it cannot be found.

GLB/GLTF files work without FBX2glTF.

## Assets

The repository contains no characters, animations or environment maps. Bring your own:

- a rigged character as GLB/GLTF or FBX (for example exported from Blender, or from your own
  pipeline), and
- animation clips as GLB or FBX that use the same skeleton. Clips are retargeted onto the loaded
  character by bone name.

Create a project from the start screen and import the mesh and animations into it. The scene is
lit by built-in lights; no HDR environment file is needed.

## Run

```sh
npm run tauri dev      # desktop app with hot reload
npm run dev            # frontend only in a browser (Tauri file APIs are unavailable)
```

To reach the dev server from another device, for example a headset for the VR mode, set
`TAURI_DEV_HOST` to the address to bind (such as `0.0.0.0`). By default it binds to localhost.
WebXR on a remote device requires HTTPS, which you need to set up yourself.

## Build

```sh
npm run build          # typecheck + production frontend build into dist/
npm run tauri build    # desktop bundle
```

### Optional: in-app splat training

The gaussian-splat capture mode works in every build. Training a splat inside the app uses
brush, which pulls in a large GPU stack (burn, wgpu), so it is behind a Cargo feature:

```sh
npm run tauri dev -- --features splat-training
npm run tauri build -- --features splat-training
```

Without the feature, the Train button reports that training is not compiled in, and the captured
dataset can be trained with an external tool instead.

## Autopilot batch mode

Autopilot renders a list of sprite sheets without using the UI. Pass the arguments to the app
executable, or through the `SPRITE_SHOT_ARGS` environment variable when running in dev:

```sh
sprite-shot --batch path/to/batch.json [--preview] [--force <sheetName>]...
sprite-shot --effects-batch path/to/effects.json [--preview] [--force <effectName>]...

# in development
SPRITE_SHOT_ARGS="--batch path/to/batch.json" npm run tauri dev
```

- `--batch` renders character sheets. `--effects-batch` renders effect-shader sheets.
- `--preview` renders a contact sheet (one row per clip or effect) instead of the full batch.
- `--force <name>` deletes and re-renders one sheet (name without `.png`). Can be repeated.
- Sheets that already exist are skipped, so an interrupted run can be resumed by running it
  again.
- Exit codes: `0` all sheets rendered or skipped, `1` at least one sheet failed or a fatal
  error occurred, `2` the config failed validation. Progress is printed to stdout and a
  `batch-report.json` is written to the output directory.

### Character batch config

```json
{
  "output": { "dir": "out/sprites" },
  "presetId": "preset-crowd-spherical-band",
  "frames": 6,
  "sourceDir": "clips",
  "modelYawDeg": 0,
  "poses": {
    "idle": "Idle.fbx",
    "cheer": { "clip": "Cheer.fbx", "trim": [10, 40] }
  },
  "archetypes": [
    { "name": "normal", "scale": [1, 1, 1] },
    { "name": "wide", "scale": [1.35, 0.95, 1.35] }
  ],
  "fit": { "heightPose": "cheer", "heightArchetype": "wide", "widthArchetype": "wide", "fillFrac": 0.9 },
  "look": { "celBands": 3, "outlinePx": 1, "outlineColor": "#1A0F26", "matteBleedPx": 2, "supersample": 4 },
  "preview": { "out": "contact.png" }
}
```

- Relative paths resolve against the config file's directory; `poses` resolve against
  `sourceDir`.
- One sheet is written per archetype and pose, named `<archetype>_<pose>.png`. Archetype and
  pose names must be letters and digits only.
- `fit` computes the camera distance once, from the tallest and widest combination, so the
  world scale stays the same across every sheet in the batch.
- A sheet is `camsPerRing * frames` cells wide and `rings` cells tall, taken from the preset.
- `look` also accepts `celRange`, `celDesat`, `alphaMode` (`"binary"` or `"straight"`) and
  `lighting` (`key`, `fill`, `rim`, `ambient` intensities).

### Effects batch config

```json
{
  "output": { "dir": "out/effects" },
  "presetId": "preset-effect-spherical-band",
  "frames": 8,
  "effects": {
    "lightning-bolt": { "shader": "lightning", "params": { "coreColor": "#FFFFFF", "glowColor": "#B8E6FF" } },
    "fireball": { "shader": "fireball", "geometry": "sphere" }
  },
  "look": { "celBands": 4, "outlinePx": 0, "outlineColor": "#1A0F26", "matteBleedPx": 2, "supersample": 4, "alphaMode": "straight" }
}
```

One sheet is written per effect, named `<effectName>.png`. `shader` is one of the effect names
listed under Features, `geometry` is `quad` (default), `sphere`, `box` or `cone`, and `params`
are passed to the shader (colors as hex strings).

## Tests

```sh
npm test               # vitest
npx tsc --noEmit       # typecheck
cd src-tauri && cargo check
```

## Project layout

```
src/
  autopilot/       batch runners, config parsing, contact sheets
  core/capture/    spherical sheet capture and frame rendering
  core/engine/     scene, mesh loading, animation, camera rig
  core/format/     .spriteshot binary format and migrations
  core/image/      cel quantize, outline, matte bleed, alpha ops
  effects/         procedural effect shader materials
  modes/           static, animated, gaussian-splat and VR IK modes
src-tauri/src/     project files, FBX conversion, autopilot I/O, splat training
```

## License

MIT, see [LICENSE](LICENSE).

### Third-party notices

- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) is licensed under the BSD 3-Clause
  license. It is not included in this repository; the `fbx2gltf` npm package installs it, or you
  install it yourself as described above.
- [brush](https://github.com/ArthurBrussee/brush) (Apache-2.0) is an optional Cargo dependency,
  fetched only when building with `--features splat-training`.
- All other dependencies are installed through npm and Cargo under their own licenses.
