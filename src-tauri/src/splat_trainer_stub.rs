//! Stand-in for `splat_trainer` when the `splat-training` feature is disabled.
//! Exposes the same Tauri commands so the frontend keeps working; starting a
//! training run returns an error explaining how to enable the feature.

use std::sync::{Arc, Mutex};

pub struct TrainingState;

pub type SharedTrainingState = Arc<Mutex<TrainingState>>;

pub fn new_training_state() -> SharedTrainingState {
    Arc::new(Mutex::new(TrainingState))
}

#[tauri::command]
pub async fn start_training(
    _dataset_path: String,
    _total_steps: Option<u32>,
    _export_path: Option<String>,
) -> Result<(), String> {
    Err("In-app gaussian splat training is not compiled in. Rebuild with `--features splat-training`.".into())
}

#[tauri::command]
pub async fn cancel_training() -> Result<(), String> {
    Err("No training in progress".into())
}

#[tauri::command]
pub async fn get_training_status() -> Result<bool, String> {
    Ok(false)
}
