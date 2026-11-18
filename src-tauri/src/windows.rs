use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Serialize, Deserialize)]
pub struct OpenRequest {
    pub path: String,
    pub scroll: f64,
}

enum Slot {
    Loading(Vec<OpenRequest>),
    Ready,
}

#[derive(Default)]
pub struct Windows {
    slots: Mutex<HashMap<String, Slot>>,
    focused: Mutex<String>,
    counter: AtomicUsize,
}

pub fn deliver(app: &AppHandle, label: &str, files: Vec<OpenRequest>) {
    let state = app.state::<Windows>();
    let mut slots = state.slots.lock().unwrap();
    match slots.get_mut(label) {
        Some(Slot::Ready) => {
            let _ = app.emit_to(label, "open-files", files);
        }
        Some(Slot::Loading(queue)) => queue.extend(files),
        None => {
            slots.insert(label.to_string(), Slot::Loading(files));
        }
    }
}

pub fn create(app: &AppHandle, files: Vec<OpenRequest>, at: Option<PhysicalPosition<f64>>) -> tauri::Result<()> {
    let state = app.state::<Windows>();
    let mut config = app.config().app.windows[0].clone();
    config.label = format!("window-{}", state.counter.fetch_add(1, Ordering::Relaxed));
    state.slots.lock().unwrap().insert(config.label.clone(), Slot::Loading(files));

    let mut builder = WebviewWindowBuilder::from_config(app, &config)?;
    if let Some(point) = at {
        let scale = app
            .monitor_from_point(point.x, point.y)?
            .map_or(1.0, |monitor| monitor.scale_factor());
        builder = builder.position(point.x / scale - 120.0, point.y / scale - 16.0);
    }
    builder.build()?;
    Ok(())
}

pub fn target(app: &AppHandle) -> Option<WebviewWindow> {
    let focused = app.state::<Windows>().focused.lock().unwrap().clone();
    app.get_webview_window(&focused)
        .or_else(|| app.webview_windows().into_values().next())
}

pub fn open_paths(app: &AppHandle, paths: Vec<std::path::PathBuf>) {
    let files: Vec<OpenRequest> = paths
        .into_iter()
        .filter(|path| path.is_file())
        .map(|path| OpenRequest { path: path.to_string_lossy().into_owned(), scroll: 0.0 })
        .collect();
    if files.is_empty() {
        return;
    }
    match target(app) {
        Some(window) => {
            deliver(app, window.label(), files);
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        None => {
            let _ = create(app, files, None);
        }
    }
}

pub fn focused(app: &AppHandle, label: &str) {
    *app.state::<Windows>().focused.lock().unwrap() = label.to_string();
}

pub fn destroyed(app: &AppHandle, label: &str) {
    app.state::<Windows>().slots.lock().unwrap().remove(label);
}

fn contains(window: &WebviewWindow, point: PhysicalPosition<f64>) -> bool {
    if window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true) {
        return false;
    }
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return false;
    };
    let (left, top) = (pos.x as f64, pos.y as f64);
    point.x >= left && point.y >= top && point.x < left + size.width as f64 && point.y < top + size.height as f64
}

#[tauri::command]
pub fn window_ready(app: AppHandle, window: WebviewWindow) -> Vec<OpenRequest> {
    let state = app.state::<Windows>();
    let mut slots = state.slots.lock().unwrap();
    match slots.insert(window.label().to_string(), Slot::Ready) {
        Some(Slot::Loading(files)) => files,
        _ => Vec::new(),
    }
}

#[tauri::command]
pub async fn new_window(app: AppHandle, files: Vec<OpenRequest>) -> Result<(), String> {
    create(&app, files, None).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_tab(app: AppHandle, window: WebviewWindow, file: OpenRequest, detach: bool) -> Result<bool, String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    if contains(&window, cursor) {
        return Ok(false);
    }
    let other = app
        .webview_windows()
        .into_values()
        .find(|other| other.label() != window.label() && contains(other, cursor));
    match other {
        Some(other) => {
            deliver(&app, other.label(), vec![file]);
            let _ = other.set_focus();
        }
        None if detach => create(&app, vec![file], Some(cursor)).map_err(|e| e.to_string())?,
        None => return Ok(false),
    }
    Ok(true)
}
