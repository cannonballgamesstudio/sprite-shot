import { useEffect, useRef, useState, RefObject } from 'react';
import * as BABYLON from '@babylonjs/core';

export interface AutopilotLights {
  ambient: BABYLON.HemisphericLight;
  key: BABYLON.DirectionalLight;
  fill: BABYLON.DirectionalLight;
  rim: BABYLON.DirectionalLight;
}

/** Minimal engine for unattended capture: no GUI layer, no post-processes, no gizmos. */
export function useAutopilotEngine(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const sceneRef = useRef<BABYLON.Scene | null>(null);
  const liveFeedCameraRef = useRef<BABYLON.FreeCamera | null>(null);
  const lightsRef = useRef<AutopilotLights | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new BABYLON.Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true, stencil: true,
    });
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0); // transparent background

    // Studio 3-point rig (model-fixed, classic prerendered-sprite convention), replacing the old
    // single flat HemisphericLight — with only ambient fill, normal maps had zero directional
    // signal to react to and every PBR surface read as flat, shadowless albedo.
    //
    // Rig geometry (CameraRig.calculateCameraPositions): cam 0 is azimuth 0 → position
    // (+ringRadius, ringHeight, 0), i.e. cam 0 sits on the +X side of center and looks back
    // toward -X. So the side of the model visible to cam 0 (and every sprite consumer downstream)
    // is the model's +X-facing surfaces.
    //
    // Babylon's diffuse term is dot(N, -direction) — `direction` is the ray's direction of
    // *travel* (light → surface), so a light that should illuminate +X-facing surfaces (cam 0's
    // view) needs direction.x < 0 (rays traveling from the +X side inward). Key/fill both keep
    // direction.x negative (front hemisphere, matching cam 0); rim flips it positive (source sits
    // behind the model, opposite cam 0) to clip the silhouette edge instead of the face.
    const ambient = new BABYLON.HemisphericLight('autopilotAmbient', new BABYLON.Vector3(0.3, 1, 0.4), scene);
    ambient.intensity = 0.3;
    ambient.diffuse = new BABYLON.Color3(1, 1, 1);      // neutral white — wash is runtime-side
    ambient.groundColor = new BABYLON.Color3(0.55, 0.55, 0.55);

    // key: upper-front-left of cam 0's view (source ~ +X front / +Y above / -Z screen-left).
    const key = new BABYLON.DirectionalLight('autopilotKey', new BABYLON.Vector3(-0.4, -0.7, 0.6), scene);
    key.intensity = 1.2;
    key.diffuse = new BABYLON.Color3(1, 1, 1);

    // fill: opposite lateral side of the key, flatter and dimmer, still frontal (still lighting
    // the cam-0-visible face — a fill lifts shadows, it doesn't backlight).
    const fill = new BABYLON.DirectionalLight('autopilotFill', new BABYLON.Vector3(-0.4, -0.3, -0.6), scene);
    fill.intensity = 0.4;
    fill.diffuse = new BABYLON.Color3(1, 1, 1);

    // rim: behind-above the model, opposite cam 0, to separate the silhouette from the
    // background rather than to model the front face.
    const rim = new BABYLON.DirectionalLight('autopilotRim', new BABYLON.Vector3(0.5, -0.8, -0.2), scene);
    rim.intensity = 0.5;
    rim.diffuse = new BABYLON.Color3(1, 1, 1);

    const liveFeed = new BABYLON.FreeCamera('autopilotLiveFeed', new BABYLON.Vector3(0, 1, -5), scene);
    // CameraRig.createCamerasAtPositions always adds debug frustum-line meshes on layerMask 1
    // (see src/core/engine/CameraRig.ts:206). Restrict the capturing camera to layer 2 (the
    // character-mesh layer, matching the convention in hooks/useSpriteEngine.ts:103 and
    // core/engine/MeshLoader.ts:56) so those debug lines never bleed into a captured cell.
    liveFeed.layerMask = 2;
    scene.activeCameras = [liveFeed];
    engineRef.current = engine;
    sceneRef.current = scene;
    liveFeedCameraRef.current = liveFeed;
    lightsRef.current = { ambient, key, fill, rim };
    setReady(true);
    return () => { scene.dispose(); engine.dispose(); };
  }, [canvasRef]);

  return { engineRef, sceneRef, liveFeedCameraRef, lightsRef, ready };
}
