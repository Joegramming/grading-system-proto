//! Desktop storage for the gradebook: the whole `state` object is kept as one
//! JSON file, `gradebook.json`, in the OS per-user app-data folder
//! (e.g. `%APPDATA%\com.gradebook.desktop` on Windows).
//!
//! Two commands mirror the JS adapter contract in src/api/tauri.js:
//!   load_gradebook() -> Option<String>   (None = nothing saved yet)
//!   save_gradebook(data: String)

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::Manager;

const FILE_NAME: &str = "gradebook.json";

/// Resolve (and create) the app-data folder, returning the full file path.
fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no app-data directory: {e}"))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir.join(FILE_NAME))
}

#[tauri::command]
fn load_gradebook(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_file(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read {}: {e}", path.display())),
    }
}

#[tauri::command]
fn save_gradebook(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = data_file(&app)?;
    // Write to a sibling temp file then rename, so an interrupted write can't
    // leave a half-written gradebook.json behind.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data.as_bytes())
        .map_err(|e| format!("cannot write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path)
        .map_err(|e| format!("cannot finalise {}: {e}", path.display()))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_gradebook, save_gradebook])
        .run(tauri::generate_context!())
        .expect("error while running the Gradebook app");
}
