import * as BABYLON from '@babylonjs/core';
import { toonShader, toonFragmentShader, toonPostProcessShader } from './shaders';

export interface ToonMaterialOptions {
  // Material properties
  diffuseColor?: BABYLON.Color3;
  specularColor?: BABYLON.Color3;
  shininess?: number;
  
  // Lighting
  lightDirection?: BABYLON.Vector3;
  lightColor?: BABYLON.Color3;
  ambientColor?: BABYLON.Color3;
  
  // Toon shading parameters
  toonSteps?: number;
  rimPower?: number;
  rimColor?: BABYLON.Color3;
  useRampTexture?: boolean;
  
  // Textures
  diffuseTexture?: BABYLON.Texture;
  rampTexture?: BABYLON.Texture;
}

export interface ToonPostProcessOptions {
  posterizationLevels?: number;
  edgeThreshold?: number;
  edgeColor?: BABYLON.Color3;
}

export class ToonMaterial {
  private scene: BABYLON.Scene;
  private material: BABYLON.ShaderMaterial;
  
  constructor(name: string, scene: BABYLON.Scene, options: ToonMaterialOptions = {}) {
    this.scene = scene;
    
    // Create shader material
    this.material = new BABYLON.ShaderMaterial(name, scene, {
      vertexSource: toonShader,
      fragmentSource: toonFragmentShader,
    }, {
      attributes: ["position", "normal", "uv"],
      uniforms: [
        "worldViewProjection", "world", "view",
        "lightDirection", "cameraPosition",
        "diffuseColor", "specularColor", "shininess",
        "lightColor", "ambientColor",
        "toonSteps", "rimPower", "rimColor", "useRampTexture"
      ],
      samplers: ["diffuseTexture", "rampTexture"]
    });
    
    // Set default values
    this.setDefaults();
    
    // Apply user options
    this.updateOptions(options);
  }
  
  private setDefaults() {
    // Material defaults
    this.material.setColor3("diffuseColor", new BABYLON.Color3(1, 1, 1));
    this.material.setColor3("specularColor", new BABYLON.Color3(1, 1, 1));
    this.material.setFloat("shininess", 32.0);
    
    // Lighting defaults
    this.material.setVector3("lightDirection", new BABYLON.Vector3(0, -1, -1));
    this.material.setColor3("lightColor", new BABYLON.Color3(1, 1, 1));
    this.material.setColor3("ambientColor", new BABYLON.Color3(0.2, 0.2, 0.2));
    
    // Toon shading defaults
    this.material.setFloat("toonSteps", 4.0);
    this.material.setFloat("rimPower", 2.0);
    this.material.setColor3("rimColor", new BABYLON.Color3(0.5, 0.5, 1.0));
    this.material.setInt("useRampTexture", 0);
    
    // Update camera position automatically
    this.scene.registerBeforeRender(() => {
      if (this.scene.activeCamera) {
        this.material.setVector3("cameraPosition", this.scene.activeCamera.position);
      }
    });
  }
  
  public updateOptions(options: ToonMaterialOptions) {
    if (options.diffuseColor) {
      this.material.setColor3("diffuseColor", options.diffuseColor);
    }
    if (options.specularColor) {
      this.material.setColor3("specularColor", options.specularColor);
    }
    if (options.shininess !== undefined) {
      this.material.setFloat("shininess", options.shininess);
    }
    if (options.lightDirection) {
      this.material.setVector3("lightDirection", options.lightDirection);
    }
    if (options.lightColor) {
      this.material.setColor3("lightColor", options.lightColor);
    }
    if (options.ambientColor) {
      this.material.setColor3("ambientColor", options.ambientColor);
    }
    if (options.toonSteps !== undefined) {
      this.material.setFloat("toonSteps", options.toonSteps);
    }
    if (options.rimPower !== undefined) {
      this.material.setFloat("rimPower", options.rimPower);
    }
    if (options.rimColor) {
      this.material.setColor3("rimColor", options.rimColor);
    }
    if (options.useRampTexture !== undefined) {
      this.material.setInt("useRampTexture", options.useRampTexture ? 1 : 0);
    }
    if (options.diffuseTexture) {
      this.material.setTexture("diffuseTexture", options.diffuseTexture);
    }
    if (options.rampTexture) {
      this.material.setTexture("rampTexture", options.rampTexture);
    }
  }
  
  public getMaterial(): BABYLON.ShaderMaterial {
    return this.material;
  }
  
  public applyToMesh(mesh: BABYLON.AbstractMesh) {
    mesh.material = this.material;
  }
  
  public applyToMeshes(meshes: BABYLON.AbstractMesh[]) {
    meshes.forEach(mesh => this.applyToMesh(mesh));
  }
  
  public dispose() {
    this.material.dispose();
  }
}

export class ToonPostProcessManager {
  private scene: BABYLON.Scene;
  private postProcess: BABYLON.PostProcess | null = null;
  
  constructor(scene: BABYLON.Scene) {
    this.scene = scene;
  }
  
  public enableToonPostProcess(camera: BABYLON.Camera, options: ToonPostProcessOptions = {}): BABYLON.PostProcess {
    // Dispose existing post-process if any
    if (this.postProcess) {
      this.postProcess.dispose();
    }
    
    // Create toon post-process
    this.postProcess = new BABYLON.PostProcess(
      "toonPostProcess",
      toonPostProcessShader,
      ["posterizationLevels", "edgeThreshold", "edgeColor", "screenSize"],
      ["textureSampler", "depthSampler"],
      1.0,
      camera,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      this.scene.getEngine(),
      false
    );
    
    // Set default values
    const posterizationLevels = options.posterizationLevels ?? 8.0;
    const edgeThreshold = options.edgeThreshold ?? 0.1;
    const edgeColor = options.edgeColor ?? new BABYLON.Color3(0, 0, 0);
    
    this.postProcess.onApply = (effect) => {
      effect.setFloat("posterizationLevels", posterizationLevels);
      effect.setFloat("edgeThreshold", edgeThreshold);
      effect.setColor3("edgeColor", edgeColor);
      effect.setVector2("screenSize", new BABYLON.Vector2(
        this.scene.getEngine().getRenderWidth(),
        this.scene.getEngine().getRenderHeight()
      ));
    };
    
    return this.postProcess;
  }
  
  public disableToonPostProcess() {
    if (this.postProcess) {
      this.postProcess.dispose();
      this.postProcess = null;
    }
  }
  
  public updatePostProcessOptions(options: ToonPostProcessOptions) {
    if (!this.postProcess) return;
    
    const posterizationLevels = options.posterizationLevels ?? 8.0;
    const edgeThreshold = options.edgeThreshold ?? 0.1;
    const edgeColor = options.edgeColor ?? new BABYLON.Color3(0, 0, 0);
    
    this.postProcess.onApply = (effect) => {
      effect.setFloat("posterizationLevels", posterizationLevels);
      effect.setFloat("edgeThreshold", edgeThreshold);
      effect.setColor3("edgeColor", edgeColor);
      effect.setVector2("screenSize", new BABYLON.Vector2(
        this.scene.getEngine().getRenderWidth(),
        this.scene.getEngine().getRenderHeight()
      ));
    };
  }
  
  public dispose() {
    this.disableToonPostProcess();
  }
}
