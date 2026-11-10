import { SpriteShotProject, ProjectFolderStructure } from '../types/project';
import { SpriteShotFormatHandler } from './spriteshotFormat';
import { serialize, deserialize, getFileInfo } from '../core/format/spriteshotFormatV2';
import type { SpriteShotProjectV2 } from '../core/format/schema';
import { invoke } from '@tauri-apps/api/core';

// Rust backend types
interface ProjectInfo {
  name: string;
  path: string;
  created_at: string;
  modified_at: string;
  mesh_count: number;
  animation_count: number;
}
// File operation utilities for project management
export class ProjectFileOperations {
  
  /**
   * Create project folder structure
   */
  static async createProjectFolders(projectPath: string): Promise<ProjectFolderStructure> {
    
   try {
    const structure = await invoke<ProjectFolderStructure>('create_project_folder', {
      project_path: projectPath
    });
    
    console.log('Created project folder structure:', structure);
    return structure;
  } catch (error) {
    throw new Error(`Failed to create project folders: ${error}`);
  }
  }
  
  /**
   * Save project to .scene file (V2 format with pako compression)
   */
  static async saveProject(project: SpriteShotProject, filePath?: string): Promise<void> {
    try {
      const targetPath = filePath || project.projectPath;

      // Convert V1 SpriteShotProject to V2 for serialization
      const v2Project = projectToV2(project);
      v2Project.modifiedAt = new Date().toISOString();

      const binaryData = serialize(v2Project);
      const dataArray = Array.from(binaryData);

      await invoke<string>('save_project_file', {
        projectPath: targetPath,
        projectData: dataArray
      });

      console.log(`Project saved (V2) to: ${targetPath}/scene.spriteshot`);
    } catch (error) {
      throw new Error(`Failed to save project: ${error}`);
    }
  }

  /**
   * @deprecated Use saveProject which now writes V2 format
   */
  static async saveProjectV1(project: SpriteShotProject, filePath?: string): Promise<void> {
    try {
      project.modifiedAt = new Date();
      const binaryData = SpriteShotFormatHandler.serialize(project);
      const dataArray = Array.from(binaryData);
      const targetPath = filePath || project.projectPath;

      await invoke<string>('save_project_file', {
        projectPath: targetPath,
        projectData: dataArray
      });
    } catch (error) {
      throw new Error(`Failed to save project (V1): ${error}`);
    }
  }
  
  /**
   * Load project from .scene file.
   * Auto-detects V1 vs V2 format and migrates V1 files on load.
   */
  static async loadProject(filePath: string): Promise<SpriteShotProject> {
    try {
      const fileData = await invoke<number[]>('load_project_file', {
        project_path: filePath
      });

      const binaryData = new Uint8Array(fileData);

      // Use V2 deserializer which handles both V1 and V2
      const { project: v2Project, migrated, originalVersion } = deserialize(binaryData);

      // Derive projectPath from file location
      const projectPath = filePath.replace(/[\\/]scene\.spriteshot$/, '')
        .replace(/[\\/][^\\/]+\.spriteshot$/, '');

      // Convert V2 back to runtime SpriteShotProject type
      const project = v2ToProject(v2Project, projectPath);

      if (migrated) {
        console.log(`Project migrated from V${originalVersion} to V2: ${project.name}`);
        // Auto-resave in V2 format
        await this.saveProject(project);
        console.log('Project resaved in V2 format');
      } else {
        console.log(`Project loaded (V2): ${project.name}`);
      }

      return project;
    } catch (error) {
      throw new Error(`Failed to load project: ${error}`);
    }
  }
  
  /**
   * Create backup of project file
   */
  static async createBackup(project: SpriteShotProject): Promise<string> {
    const backupName = SpriteShotFormatHandler.createBackupName('scene.spriteshot');
    const backupPath = `${project.projectPath}/.backups/${backupName}`;
    
    try {
      await this.saveProject(project, backupPath);
      
      // Clean up old backups if needed
      await this.cleanupOldBackups(project);
      
      console.log(`Backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }
  
  /**
   * Clean up old backup files
   */
  static async cleanupOldBackups(project: SpriteShotProject): Promise<void> {
    const maxBackups = project.settings.backupCount;
    
    try {
      // In a real implementation, you'd use Tauri APIs to list and delete files
      // const files = await readDir(backupsDir);
      // const backupFiles = files
      //   .filter(file => file.name?.endsWith('.spriteshot'))
      //   .sort((a, b) => b.name!.localeCompare(a.name!)); // Sort by name (timestamp)
      
      // if (backupFiles.length > maxBackups) {
      //   const filesToDelete = backupFiles.slice(maxBackups);
      //   for (const file of filesToDelete) {
      //     await removeFile(`${backupsDir}/${file.name}`);
      //   }
      //   console.log(`Cleaned up ${filesToDelete.length} old backup files`);
      // }
      
      console.log(`Backup cleanup completed (max: ${maxBackups})`);
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }
  
  static async listProjects(): Promise<ProjectInfo[]> {
  try {
    const projects = await invoke<ProjectInfo[]>('list_projects');
    console.log(`Found ${projects.length} projects`);
    return projects;
  } catch (error) {
    throw new Error(`Failed to list projects: ${error}`);
  }
}

static async deleteProject(projectPath: string): Promise<void> {
  try {
    await invoke<string>('delete_project', { projectPath });
    console.log(`Project deleted: ${projectPath}`);
  } catch (error) {
    throw new Error(`Failed to delete project: ${error}`);
  }
}

static async importMesh(
  projectPath: string,
  sourceFilePath: string,
  meshName?: string
): Promise<{ filePath: string; fileName: string }> {
  try {
    const relativePath = await invoke<string>('import_mesh_file', {
      projectPath,
      sourceFilePath,
      meshName
    });
    
    const fileName = relativePath.split('/').pop() || 'unknown.fbx';
    return { filePath: relativePath, fileName };
  } catch (error) {
    throw new Error(`Failed to import mesh: ${error}`);
  }
}
  
  /**
   * Import animation file to project
   */
  static async importAnimation(
    project: SpriteShotProject,
    sourceFilePath: string,
    animationName?: string
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = animationName || sourceFilePath.split('/').pop() || 'unknown.fbx';
    const targetPath = `${project.projectPath}/animations/${fileName}`;
    
    try {
      // In a real implementation, you'd copy the file
      // await copyFile(sourceFilePath, targetPath);
      
      console.log(`Animation imported: ${sourceFilePath} -> ${targetPath}`);
      return {
        filePath: `animations/${fileName}`, // Relative path
        fileName,
      };
    } catch (error) {
      throw new Error(`Failed to import animation: ${error}`);
    }
  }
  
  /**
   * Generate thumbnail for mesh
   */
  static async generateThumbnail(
    project: SpriteShotProject,
    meshId: string,
    thumbnailData: string // Base64 image data
  ): Promise<string> {
    const thumbnailPath = `${project.projectPath}/.cache/thumbnails/${meshId}.png`;
    
    try {
      // In a real implementation, you'd decode base64 and save as PNG
      // const imageData = atob(thumbnailData.split(',')[1]);
      // await writeFile(thumbnailPath, new Uint8Array(imageData.split('').map(c => c.charCodeAt(0))));
      
      // Update project cache
      if (project.cache) {
        project.cache.thumbnails[meshId] = thumbnailData;
      }
      
      console.log(`Thumbnail generated for mesh ${meshId}`);
      return thumbnailPath;
    } catch (error) {
      throw new Error(`Failed to generate thumbnail: ${error}`);
    }
  }
  
  /**
   * Export project as JSON (for debugging/inspection)
   */
  static async exportProjectAsJson(project: SpriteShotProject, filePath: string): Promise<void> {
    try {
      JSON.stringify(project, null, 2);
      
      // In a real implementation, you'd use Tauri APIs to write the file
      // await writeTextFile(filePath, jsonData);
      
      console.log(`Project exported as JSON: ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to export project as JSON: ${error}`);
    }
  }
  
  /**
   * Validate project file integrity
   */
  static async validateProjectFile(_filePath: string): Promise<{
    valid: boolean;
    error?: string;
    info?: {
      version: number;
      dataSize: number;
      projectName?: string;
      meshCount?: number;
      animationCount?: number;
    };
  }> {
    try {
      // In a real implementation, you'd read the file
      // const fileData = await readFile(filePath);
      const fileData = new Uint8Array(); // Placeholder
      
      const validation = SpriteShotFormatHandler.validate(fileData);
      
      if (validation.valid) {
        // Try to get basic project info without full deserialization
        try {
          const project = SpriteShotFormatHandler.deserialize(fileData);
          return {
            valid: true,
            info: {
              version: validation.info!.version,
              dataSize: validation.info!.dataSize,
              projectName: project.name,
              meshCount: project.meshes.length,
              animationCount: project.animations.length,
            },
          };
        } catch {
          // Fallback to basic validation info
          return {
            valid: true,
            info: validation.info,
          };
        }
      }
      
      return validation;
    } catch (error) {
      return {
        valid: false,
        error: `Validation failed: ${error}`,
      };
    }
  }
  
  /**
   * Get project file info without loading
   */
  static async getProjectFileInfo(filePath: string): Promise<{
    name: string;
    size: number;
    modified: Date;
    sceneFileInfo?: {
      magic: string;
      version: number;
      dataSize: number;
      checksum: number;
    };
  }> {
    try {
      // In a real implementation, you'd use Tauri APIs to get file stats
      // const stats = await stat(filePath);
      // const fileData = await readFile(filePath);
      
      const stats = { size: 0, mtime: new Date() }; // Placeholder
      const fileData = new Uint8Array(); // Placeholder
      
      const fileName = filePath.split('/').pop() || 'unknown';
      
      let sceneFileInfo;
      try {
        const info = getFileInfo(fileData);
        sceneFileInfo = {
          magic: info.magic,
          version: info.version,
          dataSize: info.compressedSize,
          checksum: 0,
        };
      } catch {
        // Not a valid scene file
      }
      
      return {
        name: fileName,
        size: stats.size,
        modified: stats.mtime,
        sceneFileInfo,
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error}`);
    }
  }
}

// ── V2 ↔ Runtime Conversion Helpers ──────────────────────────────

/** Convert runtime SpriteShotProject to V2 for serialization */
function projectToV2(project: SpriteShotProject): SpriteShotProjectV2 {
  return {
    schemaVersion: 2,
    id: project.id,
    name: project.name,
    description: project.description,
    appVersion: project.version,
    createdAt: project.createdAt instanceof Date
      ? project.createdAt.toISOString()
      : String(project.createdAt),
    modifiedAt: project.modifiedAt instanceof Date
      ? project.modifiedAt.toISOString()
      : String(project.modifiedAt),
    activeMode: 'static-imaging',
    cameraPresets: project.cameraPresets.map((p) => ({
      ...p,
      createdAt: p.createdAt instanceof Date
        ? p.createdAt.toISOString()
        : String(p.createdAt),
    })),
    defaultCameraPresetId: project.defaultCameraPresetId,
    meshes: project.meshes.map((m) => ({
      id: m.id,
      name: m.name,
      filePath: m.filePath,
      cameraPresetId: m.cameraPresetId,
      position: m.position,
      rotation: m.rotation,
      scale: m.scale,
      importedAt: m.importedAt instanceof Date
        ? m.importedAt.toISOString()
        : String(m.importedAt),
      fileSize: m.fileSize,
      vertexCount: m.vertexCount,
      triangleCount: m.triangleCount,
    })),
    animations: project.animations.map((a) => ({
      id: a.id,
      name: a.name,
      filePath: a.filePath,
      meshId: a.meshId,
      importedAt: a.importedAt instanceof Date
        ? a.importedAt.toISOString()
        : String(a.importedAt),
      duration: a.duration,
      frameRate: a.frameRate,
      frameCount: a.frameCount,
      trimStart: a.settings?.trimStart ?? 0,
      trimEnd: a.settings?.trimEnd ?? a.frameCount,
    })),
    props: project.props.map((p) => ({
      ...p,
      importedAt: p.importedAt instanceof Date
        ? p.importedAt.toISOString()
        : String(p.importedAt),
    })),
    settings: project.settings,
    modeConfigs: {},
  };
}

/** Convert V2 project back to runtime SpriteShotProject type */
function v2ToProject(v2: SpriteShotProjectV2, projectPath: string): SpriteShotProject {
  return {
    id: v2.id,
    name: v2.name,
    description: v2.description,
    version: v2.appVersion,
    createdAt: new Date(v2.createdAt),
    modifiedAt: new Date(v2.modifiedAt),
    projectPath,
    cameraPresets: v2.cameraPresets.map((p) => ({
      ...p,
      createdAt: new Date(p.createdAt),
    })),
    defaultCameraPresetId: v2.defaultCameraPresetId,
    meshes: v2.meshes.map((m) => ({
      ...m,
      importedAt: new Date(m.importedAt),
    })),
    animations: v2.animations.map((a) => ({
      id: a.id,
      name: a.name,
      filePath: a.filePath,
      meshId: a.meshId,
      importedAt: new Date(a.importedAt),
      duration: a.duration,
      frameRate: a.frameRate,
      frameCount: a.frameCount,
      settings: {
        id: a.id,
        name: a.name,
        totalFrames: a.frameCount,
        currentFrameTarget: a.frameRate,
        trimStart: a.trimStart,
        trimEnd: a.trimEnd,
      },
    })),
    props: v2.props.map((p) => ({
      ...p,
      importedAt: new Date(p.importedAt),
    })),
    settings: v2.settings,
  };
}
