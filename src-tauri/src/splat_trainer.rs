use std::sync::{Arc, Mutex};

use brush_process::message::ProcessMessage;
use brush_vfs::DataSource;
use futures_lite::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

// Guard against double-init of brush's SetOnce<WgpuDevice>
static DEVICE_INIT: std::sync::OnceLock<()> = std::sync::OnceLock::new();

/// Events streamed to the frontend via Tauri's event system.
#[derive(Clone, Serialize)]
#[serde(tag = "type")]
pub enum TrainingEvent {
    Started,
    Progress {
        iteration: u32,
        total_steps: u32,
        elapsed_secs: f64,
    },
    Eval {
        iteration: u32,
        avg_psnr: f32,
        avg_ssim: f32,
    },
    Refine {
        splat_count: u32,
        iteration: u32,
    },
    Warning {
        message: String,
    },
    Completed {
        export_path: String,
    },
    Error {
        message: String,
    },
}

pub struct TrainingState {
    pub cancel_requested: bool,
    pub is_running: bool,
}

pub type SharedTrainingState = Arc<Mutex<TrainingState>>;

pub fn new_training_state() -> SharedTrainingState {
    Arc::new(std::sync::Mutex::new(TrainingState {
        cancel_requested: false,
        is_running: false,
    }))
}

async fn ensure_device_initialized() {
    if DEVICE_INIT.get().is_none() {
        let _ = brush_process::burn_init_setup().await;
        let _ = DEVICE_INIT.set(());
    }
}

#[tauri::command]
pub async fn start_training(
    app: AppHandle,
    dataset_path: String,
    total_steps: Option<u32>,
    export_path: Option<String>,
    state: tauri::State<'_, SharedTrainingState>,
) -> Result<(), String> {
    {
        let mut guard = state.lock().unwrap();
        if guard.is_running {
            return Err("Training already in progress".into());
        }
        guard.is_running = true;
        guard.cancel_requested = false;
    }

    let state_clone = state.inner().clone();

    tauri::async_runtime::spawn(async move {
        let result =
            run_training(app.clone(), dataset_path, total_steps, export_path, state_clone.clone())
                .await;

        let mut guard = state_clone.lock().unwrap();
        guard.is_running = false;

        match result {
            Ok(path) => {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent::Completed {
                        export_path: path,
                    },
                );
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("cancelled") {
                    let _ = app.emit(
                        "training-event",
                        TrainingEvent::Error {
                            message: "Training cancelled".into(),
                        },
                    );
                } else {
                    let _ = app.emit(
                        "training-event",
                        TrainingEvent::Error { message: msg },
                    );
                }
            }
        }
    });

    Ok(())
}

async fn run_training(
    app: AppHandle,
    dataset_path: String,
    total_steps: Option<u32>,
    export_path: Option<String>,
    state: SharedTrainingState,
) -> Result<String, anyhow::Error> {
    ensure_device_initialized().await;

    let source = DataSource::Path(dataset_path.clone());

    let running = brush_process::create_process(source, move |mut config| async move {
        if let Some(steps) = total_steps {
            config.train_config.total_steps = steps;
        }
        if let Some(ref path) = export_path {
            config.process_config.export_path = path.clone();
        }
        // Disable rerun visualization
        config.rerun_config.rerun_enabled = false;
        config
    });

    let _ = app.emit("training-event", TrainingEvent::Started);

    let mut stream = running.stream;
    let mut final_export_path = String::new();

    while let Some(msg) = stream.next().await {
        // Check cancellation
        {
            let guard = state.lock().unwrap();
            if guard.cancel_requested {
                // Dropping stream cancels the training async generator
                drop(stream);
                return Err(anyhow::anyhow!("Training cancelled by user"));
            }
        }

        match msg {
            Ok(ProcessMessage::TrainMessage(
                brush_process::message::TrainMessage::TrainStep {
                    iter,
                    total_steps,
                    total_elapsed,
                },
            )) => {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent::Progress {
                        iteration: iter,
                        total_steps,
                        elapsed_secs: total_elapsed.as_secs_f64(),
                    },
                );
            }
            Ok(ProcessMessage::TrainMessage(
                brush_process::message::TrainMessage::EvalResult {
                    iter,
                    avg_psnr,
                    avg_ssim,
                },
            )) => {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent::Eval {
                        iteration: iter,
                        avg_psnr,
                        avg_ssim,
                    },
                );
            }
            Ok(ProcessMessage::TrainMessage(
                brush_process::message::TrainMessage::RefineStep {
                    cur_splat_count,
                    iter,
                },
            )) => {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent::Refine {
                        splat_count: cur_splat_count,
                        iteration: iter,
                    },
                );
            }
            Ok(ProcessMessage::TrainMessage(
                brush_process::message::TrainMessage::DoneTraining,
            )) => {
                break;
            }
            Ok(ProcessMessage::Warning { error }) => {
                let _ = app.emit(
                    "training-event",
                    TrainingEvent::Warning {
                        message: error.to_string(),
                    },
                );
            }
            Err(e) => {
                return Err(e);
            }
            _ => {}
        }
    }

    // Resolve export path — brush writes to {dataset}_exports/ by default
    if final_export_path.is_empty() {
        let parent = std::path::Path::new(&dataset_path)
            .parent()
            .unwrap_or(std::path::Path::new("."));
        let dataset_name = std::path::Path::new(&dataset_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("dataset");
        let exports_dir = parent.join(format!("{}_exports", dataset_name));
        final_export_path = exports_dir.to_string_lossy().to_string();
    }

    Ok(final_export_path)
}

#[tauri::command]
pub async fn cancel_training(
    state: tauri::State<'_, SharedTrainingState>,
) -> Result<(), String> {
    let mut guard = state.lock().unwrap();
    if guard.is_running {
        guard.cancel_requested = true;
        Ok(())
    } else {
        Err("No training in progress".into())
    }
}

#[tauri::command]
pub async fn get_training_status(
    state: tauri::State<'_, SharedTrainingState>,
) -> Result<bool, String> {
    let guard = state.lock().unwrap();
    Ok(guard.is_running)
}
