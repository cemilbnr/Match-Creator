use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

/// Match Creator sees this Blender session through session.json, which the
/// addon writes before launching the app. Treat entries older than 60 seconds
/// as stale so a Blender that was closed doesn't keep the footer green.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Session {
    #[serde(rename = "blendFile")]
    blend_file: String,
    #[serde(rename = "blendFileName")]
    blend_file_name: String,
    #[serde(rename = "blenderPid")]
    blender_pid: u32,
    port: u16,
    #[serde(rename = "startedAt")]
    started_at: u64,
}

const SESSION_STALE_SECS: u64 = 60;

struct AppState {
    session_path: PathBuf,
}

fn resolve_session_path() -> PathBuf {
    // %APPDATA%\Match Creator\session.json on Windows. Falls back to the
    // process working directory so the command never panics on unknown
    // platforms during development.
    let base = std::env::var("APPDATA")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    base.join("Match Creator").join("session.json")
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn read_session_file(path: &PathBuf) -> Option<Session> {
    let raw = fs::read_to_string(path).ok()?;
    let session: Session = serde_json::from_str(&raw).ok()?;
    let now = now_secs();
    if session.started_at == 0 || now.saturating_sub(session.started_at) > SESSION_STALE_SECS {
        return None;
    }
    Some(session)
}

#[tauri::command]
fn get_session(state: tauri::State<'_, AppState>) -> Option<Session> {
    read_session_file(&state.session_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session_path = resolve_session_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Another instance tried to start — focus our window and tell the
            // webview to re-read the session file (Blender may have written a
            // new one pointing at a different .blend).
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit("session-changed", ());
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState { session_path })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_session])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
