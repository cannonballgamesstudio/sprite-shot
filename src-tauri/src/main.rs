// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![recursion_limit = "256"]

mod autopilot;
mod fbx_converter;
mod project_manager;
#[cfg(feature = "splat-training")]
mod splat_trainer;
#[cfg(not(feature = "splat-training"))]
#[path = "splat_trainer_stub.rs"]
mod splat_trainer;

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::AppHandle;
use tauri::Manager;

static APP_DATA_PATH: OnceLock<PathBuf> = OnceLock::new();

pub fn get_app_data_path() -> Option<&'static PathBuf> {
    APP_DATA_PATH.get()
}

#[tauri::command]
fn write_png_file(dir: String, file_name: String, file_data: String) -> Result<(), String> {
    use base64::{engine::general_purpose, Engine as _};

    // Strip data URL prefix if present, otherwise treat as raw base64
    let base64_data = file_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| file_data.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| file_data.strip_prefix("data:application/octet-stream;base64,"))
        .unwrap_or(&file_data);

    let decoded_data = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let write_dir = PathBuf::from(&dir);
    if !write_dir.exists() {
        fs::create_dir_all(&write_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    let file_path = write_dir.join(&file_name);
    std::fs::write(&file_path, decoded_data).map_err(|e| format!("Failed to write file: {}", e))?;
    println!("Saved: {}", file_path.display());
    Ok(())
}

#[tauri::command]
fn read_fbx_file(path: String) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(path);
    match fs::read(&path) {
        Ok(bytes) => Ok(bytes),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
fn save_merged_gltf_file(data: String, original_path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    use std::env;
    use std::fs;
    use std::path::Path;

    // Decode base64 data
    let bytes = general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Failed to decode base64 data: {}", e))?;

    // Get downloads directory
    let downloads_dir = dirs_next::download_dir().unwrap_or_else(|| env::current_dir().unwrap());

    // Extract filename from original path
    let filename = if let Some(name) = Path::new(&original_path).file_name() {
        let mut os_string = name.to_os_string();
        os_string.push("_merged.glb");
        os_string
    } else {
        std::ffi::OsString::from("merged.glb")
    };

    let out_path = downloads_dir.join(filename);

    // Write the file
    fs::write(&out_path, &bytes).map_err(|e| format!("Failed to write merged GLTF file: {}", e))?;

    Ok(format!("Merged GLTF saved to {}", out_path.display()))
}
fn get_app_local_data_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    match app_handle.path().app_local_data_dir() {
        Ok(path) => Ok(path),
        Err(e) => Err(format!("Failed to get app local data directory: {}", e)),
    }
}
fn main() {
    tauri::Builder::default()
        .manage(splat_trainer::new_training_state())
        .setup(|app| {
            let app_handle = app.handle();
            match get_app_local_data_path(&app_handle) {
                Ok(path) => {
                    APP_DATA_PATH
                        .set(path.clone())
                        .expect("Failed to set app data path");
                    println!("App local data path: {:?}", path);
                }
                Err(e) => {
                    eprintln!("Failed to get app data path: {}", e);
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            write_png_file,
            read_fbx_file,
            save_merged_gltf_file,
            fbx_converter::convert_fbx_to_glb,
            autopilot::get_cli_args,
            autopilot::path_exists,
            autopilot::read_text_file_any,
            autopilot::write_text_file_any,
            autopilot::delete_file_any,
            autopilot::ensure_glb,
            autopilot::exit_app,
            autopilot::log_line,
            splat_trainer::start_training,
            splat_trainer::cancel_training,
            splat_trainer::get_training_status,
            project_manager::create_project_folder,
            project_manager::save_project_file,
            project_manager::load_project_file,
            project_manager::list_projects,
            project_manager::delete_project,
            project_manager::import_mesh_file,
            project_manager::import_animation_file,
            project_manager::save_mesh_thumbnail,
            project_manager::get_project_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
