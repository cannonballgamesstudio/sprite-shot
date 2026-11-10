use std::path::Path;

#[tauri::command]
pub fn get_cli_args() -> Vec<String> {
    let mut v: Vec<String> = std::env::args().skip(1).collect();
    if !v.iter().any(|a| a == "--batch") {
        if let Ok(extra) = std::env::var("SPRITE_SHOT_ARGS") {
            v.extend(extra.split_whitespace().map(|s| s.to_string()));
        }
    }
    v
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn read_text_file_any(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {}: {}", path, e))
}

#[tauri::command]
pub fn write_text_file_any(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create dir for {}: {}", path, e))?;
    }
    std::fs::write(p, contents).map_err(|e| format!("write {}: {}", path, e))
}

#[tauri::command]
pub fn delete_file_any(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    std::fs::remove_file(p).map_err(|e| format!("delete {}: {}", path, e))
}

/// FBX → sibling GLB with mtime cache; .glb paths pass through untouched.
#[tauri::command]
pub fn ensure_glb(source_path: String) -> Result<String, String> {
    let src = Path::new(&source_path);
    if !src.exists() {
        return Err(format!("missing source: {}", source_path));
    }
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if ext == "glb" {
        return Ok(source_path);
    }
    if ext != "fbx" {
        return Err(format!("unsupported clip extension .{} ({})", ext, source_path));
    }
    let glb = src.with_extension("glb");
    if glb.exists() {
        let fresh = match (glb.metadata().and_then(|m| m.modified()),
                           src.metadata().and_then(|m| m.modified())) {
            (Ok(g), Ok(s)) => g >= s,
            _ => false,
        };
        if fresh {
            return Ok(glb.to_string_lossy().into_owned());
        }
    }
    let out_dir = src.parent().ok_or_else(|| format!("source has no parent dir: {}", source_path))?;
    crate::fbx_converter::convert_to_glb(src, out_dir)
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn exit_app(code: i32) {
    std::process::exit(code);
}

#[tauri::command]
pub fn log_line(line: String) {
    println!("{}", line);
}
