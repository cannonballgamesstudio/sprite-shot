use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Find the FBX2glTF binary.
///
/// Search order:
/// 1. `FBX2GLTF_BIN` env var
/// 2. `node_modules/fbx2gltf/bin/<platform>/FBX2glTF[.exe]` (dev — cwd is frontend root)
/// 3. Next to the running executable (production bundle)
pub fn find_converter() -> Result<PathBuf, String> {
    // 1. Explicit override
    if let Ok(path) = std::env::var("FBX2GLTF_BIN") {
        let p = PathBuf::from(&path);
        if p.exists() {
            return Ok(p);
        }
    }

    let (platform_dir, bin_name) = platform_binary();

    // 2. Dev mode — relative to cwd (which is the frontend root during `tauri dev`)
    let dev_path = PathBuf::from(format!(
        "node_modules/fbx2gltf/bin/{}/{}",
        platform_dir, bin_name
    ));
    if dev_path.exists() {
        return Ok(fs::canonicalize(&dev_path).unwrap_or(dev_path));
    }

    // 3. Production — next to the app executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let bundled = dir.join(bin_name);
            if bundled.exists() {
                return Ok(bundled);
            }
        }
    }

    Err(
        "FBX2glTF binary not found. Set FBX2GLTF_BIN env var or install 'fbx2gltf' npm package."
            .to_string(),
    )
}

/// Convert an FBX file to GLB, writing the result into `output_dir`.
/// Returns the full path to the resulting `.glb` file.
pub fn convert_to_glb(fbx_path: &Path, output_dir: &Path) -> Result<PathBuf, String> {
    let converter = find_converter()?;

    let stem = fbx_path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid FBX filename")?;

    // Ensure output directory exists
    if !output_dir.exists() {
        fs::create_dir_all(output_dir)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    // FBX2glTF: --binary --input <src.fbx> --output <dir/stem>
    // It appends .glb to the output path automatically.
    let output_base = output_dir.join(stem);

    println!(
        "Converting FBX → GLB: {} → {}.glb",
        fbx_path.display(),
        output_base.display()
    );

    let result = Command::new(&converter)
        .args(["--binary", "--input"])
        .arg(fbx_path)
        .arg("--output")
        .arg(&output_base)
        .output()
        .map_err(|e| format!("Failed to run FBX2glTF: {}", e))?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let stdout = String::from_utf8_lossy(&result.stdout);
        return Err(format!("FBX conversion failed:\n{}{}", stdout, stderr));
    }

    // Clean up .fbm directory that the FBX SDK sometimes creates next to the source
    let fbm_dir = fbx_path.with_extension("fbm");
    if fbm_dir.is_dir() {
        let _ = fs::remove_dir_all(&fbm_dir);
    }

    // FBX2glTF output naming varies by version: <stem>.glb or <stem>_out.glb
    let expected = output_dir.join(format!("{}.glb", stem));
    if expected.exists() {
        println!("FBX conversion complete: {}", expected.display());
        return Ok(expected);
    }

    // Try the _out suffix variant
    let alt = output_dir.join(format!("{}_out.glb", stem));
    if alt.exists() {
        fs::rename(&alt, &expected)
            .map_err(|e| format!("Failed to rename {}: {}", alt.display(), e))?;
        println!("FBX conversion complete: {}", expected.display());
        return Ok(expected);
    }

    // Last resort: find any .glb starting with the stem that was just created
    if let Ok(entries) = fs::read_dir(output_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("glb") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    if name.starts_with(stem) {
                        fs::rename(&path, &expected)
                            .map_err(|e| format!("Failed to rename {}: {}", path.display(), e))?;
                        println!("FBX conversion complete: {}", expected.display());
                        return Ok(expected);
                    }
                }
            }
        }
    }

    Err(format!(
        "FBX2glTF ran successfully but no .glb output found. Expected: {}",
        expected.display()
    ))
}

/// Check if a path has an .fbx extension (case-insensitive).
pub fn is_fbx(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("fbx"))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn platform_binary() -> (&'static str, &'static str) {
    ("Windows_NT", "FBX2glTF.exe")
}

#[cfg(target_os = "macos")]
fn platform_binary() -> (&'static str, &'static str) {
    ("Darwin", "FBX2glTF")
}

#[cfg(target_os = "linux")]
fn platform_binary() -> (&'static str, &'static str) {
    ("Linux", "FBX2glTF")
}

/// Tauri command: convert an FBX file to GLB.
/// Returns the full path to the output .glb file.
#[tauri::command]
pub fn convert_fbx_to_glb(fbx_path: String, output_dir: String) -> Result<String, String> {
    let fbx = Path::new(&fbx_path);
    let out = Path::new(&output_dir);

    if !fbx.exists() {
        return Err(format!("FBX file not found: {}", fbx_path));
    }

    let glb_path = convert_to_glb(fbx, out)?;
    Ok(glb_path.to_string_lossy().to_string())
}
