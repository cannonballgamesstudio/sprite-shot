use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Config;

use crate::fbx_converter;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub modified_at: String,
    pub mesh_count: usize,
    pub animation_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectFolderStructure {
    pub root: String,
    pub meshes: String,
    pub animations: String,
    pub thumbnails: String,
    pub backups: String,
    pub scene_file: String,
}

/// Get the Sprite Shot projects directory in AppData
fn get_projects_directory() -> Result<PathBuf, String> {
    let app_data = crate::get_app_data_path().ok_or("App data path not initialized")?;

    let projects_dir = app_data.join("SpriteShot").join("Projects");

    // Create directory if it doesn't exist
    if !projects_dir.exists() {
        fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects directory: {}", e))?;
    }

    Ok(projects_dir)
}

/// Create a new project folder structure
#[tauri::command]
pub fn create_project_folder(project_name: String) -> Result<ProjectFolderStructure, String> {
    let projects_dir = get_projects_directory()?;
    let project_path = projects_dir.join(&project_name);

    // Check if project already exists
    if project_path.exists() {
        return Err(format!("Project '{}' already exists", project_name));
    }

    // Create project folder structure
    let meshes_dir = project_path.join("meshes");
    let animations_dir = project_path.join("animations");
    let cache_dir = project_path.join(".cache");
    let thumbnails_dir = cache_dir.join("thumbnails");
    let backups_dir = project_path.join(".backups");

    // Create all directories
    fs::create_dir_all(&meshes_dir)
        .map_err(|e| format!("Failed to create meshes directory: {}", e))?;
    fs::create_dir_all(&animations_dir)
        .map_err(|e| format!("Failed to create animations directory: {}", e))?;
    fs::create_dir_all(&thumbnails_dir)
        .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;
    fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("Failed to create backups directory: {}", e))?;

    let structure = ProjectFolderStructure {
        root: project_path.to_string_lossy().to_string(),
        meshes: meshes_dir.to_string_lossy().to_string(),
        animations: animations_dir.to_string_lossy().to_string(),
        thumbnails: thumbnails_dir.to_string_lossy().to_string(),
        backups: backups_dir.to_string_lossy().to_string(),
        scene_file: project_path
            .join("scene.spriteshot")
            .to_string_lossy()
            .to_string(),
    };

    println!("Created project folder structure: {:?}", structure);
    Ok(structure)
}

/// Save project data to .scene file
#[tauri::command]
pub fn save_project_file(project_path: String, project_data: Vec<u8>) -> Result<String, String> {
    let scene_path = Path::new(&project_path).join("scene.spriteshot");

    // Create backup if file exists
    if scene_path.exists() {
        let backup_name = format!(
            "scene_backup_{}.spriteshot",
            chrono::Utc::now().format("%Y%m%d_%H%M%S")
        );
        let backup_path = Path::new(&project_path).join(".backups").join(backup_name);

        if let Err(e) = fs::copy(&scene_path, &backup_path) {
            println!("Warning: Failed to create backup: {}", e);
        }
    }

    // Write project data
    fs::write(&scene_path, project_data)
        .map_err(|e| format!("Failed to write project file: {}", e))?;

    println!("Saved project file: {}", scene_path.display());
    Ok(scene_path.to_string_lossy().to_string())
}

/// Load project data from .scene file
#[tauri::command]
pub fn load_project_file(project_path: String) -> Result<Vec<u8>, String> {
    let scene_path = Path::new(&project_path);
    println!("Loading project file: {}", scene_path.display());
    if !scene_path.exists() {
        return Err(format!(
            "Project file ({}) not found",
            scene_path.display()
        ));
    }

    let data =
        fs::read(&scene_path).map_err(|e| format!("Failed to read project file: {}", e))?;

    println!("Loaded project file: {}", scene_path.display());
    Ok(data)
}

/// List all projects in the projects directory
#[tauri::command]
pub fn list_projects(_config: tauri::State<Config>) -> Result<Vec<ProjectInfo>, String> {
    let projects_dir = get_projects_directory()?;
    let mut projects = Vec::new();

    if !projects_dir.exists() {
        return Ok(projects);
    }

    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let project_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string();

            let scene_path = path.join("scene.spriteshot");

            if scene_path.exists() {
                let metadata = fs::metadata(&scene_path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let modified_at = metadata
                    .modified()
                    .map_err(|e| format!("Failed to get modification time: {}", e))?;

                // Try to get basic project info (this would require parsing the scene file)
                // For now, we'll use placeholder values
                let project_info = ProjectInfo {
                    name: project_name,
                    path: path.to_string_lossy().to_string(),
                    created_at: "Unknown".to_string(), // Would parse from scene file
                    modified_at: format!("{:?}", modified_at),
                    mesh_count: 0,      // Would parse from scene file
                    animation_count: 0, // Would parse from scene file
                };

                projects.push(project_info);
            }
        }
    }

    // Sort by modification time (newest first)
    projects.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(projects)
}

/// Delete a project and all its files
#[tauri::command]
pub fn delete_project(project_path: String) -> Result<String, String> {
    let path = Path::new(&project_path);

    if !path.exists() {
        return Err("Project not found".to_string());
    }

    fs::remove_dir_all(path).map_err(|e| format!("Failed to delete project: {}", e))?;

    println!("Deleted project: {}", project_path);
    Ok(format!("Project deleted: {}", project_path))
}

/// Import a mesh file to project.
/// FBX files are automatically converted to GLB via FBX2glTF.
#[tauri::command]
pub fn import_mesh_file(
    project_path: String,
    source_file_path: String,
    mesh_name: Option<String>,
) -> Result<String, String> {
    let source_path = Path::new(&source_file_path);

    if !source_path.exists() {
        return Err("Source file not found".to_string());
    }

    let meshes_dir = Path::new(&project_path).join("meshes");
    if !meshes_dir.exists() {
        fs::create_dir_all(&meshes_dir)
            .map_err(|e| format!("Failed to create meshes directory: {}", e))?;
    }

    // FBX → convert to GLB first, then import the GLB
    if fbx_converter::is_fbx(source_path) {
        let glb_path = fbx_converter::convert_to_glb(source_path, &meshes_dir)?;
        let glb_name = glb_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("converted.glb")
            .to_string();

        // Rename if a custom name was provided
        if let Some(name) = mesh_name {
            let final_name = ensure_glb_extension(&name);
            let final_path = meshes_dir.join(&final_name);
            if final_path != glb_path {
                fs::rename(&glb_path, &final_path)
                    .map_err(|e| format!("Failed to rename converted mesh: {}", e))?;
            }
            println!("Imported FBX mesh (converted): {} -> meshes/{}", source_file_path, final_name);
            return Ok(format!("meshes/{}", final_name));
        }

        println!("Imported FBX mesh (converted): {} -> meshes/{}", source_file_path, glb_name);
        return Ok(format!("meshes/{}", glb_name));
    }

    // GLB/GLTF — copy directly
    let file_name = mesh_name
        .map(|name| {
            let extension = source_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("glb");
            if name.contains('.') { name } else { format!("{}.{}", name, extension) }
        })
        .unwrap_or_else(|| {
            source_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.glb")
                .to_string()
        });

    let target_path = meshes_dir.join(&file_name);
    fs::copy(&source_path, &target_path).map_err(|e| format!("Failed to copy mesh file: {}", e))?;

    println!("Imported mesh: {} -> {}", source_file_path, target_path.display());
    Ok(format!("meshes/{}", file_name))
}

/// Import an animation file to project.
/// FBX files are automatically converted to GLB via FBX2glTF.
#[tauri::command]
pub fn import_animation_file(
    project_path: String,
    source_file_path: String,
    animation_name: Option<String>,
) -> Result<String, String> {
    let source_path = Path::new(&source_file_path);

    if !source_path.exists() {
        return Err("Source file not found".to_string());
    }

    let animations_dir = Path::new(&project_path).join("animations");
    if !animations_dir.exists() {
        fs::create_dir_all(&animations_dir)
            .map_err(|e| format!("Failed to create animations directory: {}", e))?;
    }

    // FBX → convert to GLB first
    if fbx_converter::is_fbx(source_path) {
        let glb_path = fbx_converter::convert_to_glb(source_path, &animations_dir)?;
        let glb_name = glb_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("converted.glb")
            .to_string();

        if let Some(name) = animation_name {
            let final_name = ensure_glb_extension(&name);
            let final_path = animations_dir.join(&final_name);
            if final_path != glb_path {
                fs::rename(&glb_path, &final_path)
                    .map_err(|e| format!("Failed to rename converted animation: {}", e))?;
            }
            println!("Imported FBX animation (converted): {} -> animations/{}", source_file_path, final_name);
            return Ok(format!("animations/{}", final_name));
        }

        println!("Imported FBX animation (converted): {} -> animations/{}", source_file_path, glb_name);
        return Ok(format!("animations/{}", glb_name));
    }

    // GLB/GLTF — copy directly
    let file_name = animation_name.unwrap_or_else(|| {
        source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.glb")
            .to_string()
    });

    let target_path = animations_dir.join(&file_name);
    fs::copy(&source_path, &target_path)
        .map_err(|e| format!("Failed to copy animation file: {}", e))?;

    println!("Imported animation: {} -> {}", source_file_path, target_path.display());
    Ok(format!("animations/{}", file_name))
}

/// Ensure a filename ends with .glb (replace .fbx or append if no extension).
fn ensure_glb_extension(name: &str) -> String {
    if name.to_lowercase().ends_with(".glb") || name.to_lowercase().ends_with(".gltf") {
        return name.to_string();
    }
    if name.to_lowercase().ends_with(".fbx") {
        return format!("{}.glb", &name[..name.len() - 4]);
    }
    if name.contains('.') {
        return name.to_string();
    }
    format!("{}.glb", name)
}

/// Save thumbnail image for a mesh
#[tauri::command]
pub fn save_mesh_thumbnail(
    project_path: String,
    mesh_id: String,
    thumbnail_data: String, // Base64 image data
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let base64_data = thumbnail_data
        .strip_prefix("data:image/png;base64,")
        .ok_or("Invalid base64 PNG string")?;

    let decoded_data = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let thumbnails_dir = Path::new(&project_path).join(".cache").join("thumbnails");

    // Create thumbnails directory if it doesn't exist
    if !thumbnails_dir.exists() {
        fs::create_dir_all(&thumbnails_dir)
            .map_err(|e| format!("Failed to create thumbnails directory: {}", e))?;
    }

    let thumbnail_path = thumbnails_dir.join(format!("{}.png", mesh_id));

    fs::write(&thumbnail_path, decoded_data)
        .map_err(|e| format!("Failed to write thumbnail: {}", e))?;

    println!("Saved thumbnail: {}", thumbnail_path.display());
    Ok(thumbnail_path.to_string_lossy().to_string())
}

/// Get project file info without loading the entire file
#[tauri::command]
pub fn get_project_info(project_path: String) -> Result<ProjectInfo, String> {
    let scene_path = Path::new(&project_path).join("scene.spriteshot");

    if !scene_path.exists() {
        return Err("Project file not found".to_string());
    }

    let metadata = fs::metadata(&scene_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let modified_at = metadata
        .modified()
        .map_err(|e| format!("Failed to get modification time: {}", e))?;

    let project_name = Path::new(&project_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();

    // For now, return basic info. In a full implementation, you'd parse the scene file header
    let project_info = ProjectInfo {
        name: project_name,
        path: project_path,
        created_at: "Unknown".to_string(),
        modified_at: format!("{:?}", modified_at),
        mesh_count: 0,
        animation_count: 0,
    };

    Ok(project_info)
}
