use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const GHOST: &str = "drag-ghost";

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
    dragging: AtomicBool,
    hovered: Mutex<Option<String>>,
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

fn logical(app: &AppHandle, point: PhysicalPosition<f64>) -> (f64, f64) {
    let scale = app
        .monitor_from_point(point.x, point.y)
        .ok()
        .flatten()
        .map_or(1.0, |monitor| monitor.scale_factor());
    (point.x / scale, point.y / scale)
}

pub fn create(app: &AppHandle, files: Vec<OpenRequest>, at: Option<PhysicalPosition<f64>>) -> tauri::Result<()> {
    let state = app.state::<Windows>();
    let mut config = app.config().app.windows[0].clone();
    config.label = format!("window-{}", state.counter.fetch_add(1, Ordering::Relaxed));
    state.slots.lock().unwrap().insert(config.label.clone(), Slot::Loading(files));

    let mut builder = WebviewWindowBuilder::from_config(app, &config)?;
    if let Some(point) = at {
        let (x, y) = logical(app, point);
        builder = builder.position(x - 120.0, y - 16.0);
    }
    builder.build()?;
    Ok(())
}

pub fn target(app: &AppHandle) -> Option<WebviewWindow> {
    let focused = app.state::<Windows>().focused.lock().unwrap().clone();
    app.get_webview_window(&focused)
        .or_else(|| app.webview_windows().into_values().find(|w| w.label() != GHOST))
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
    if label != GHOST {
        *app.state::<Windows>().focused.lock().unwrap() = label.to_string();
    }
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

fn window_at(app: &AppHandle, point: PhysicalPosition<f64>, source: &str) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.label() != source && w.label() != GHOST && contains(w, point))
}

fn hover(app: &AppHandle, over: Option<&WebviewWindow>, cursor: PhysicalPosition<f64>) {
    let state = app.state::<Windows>();
    let mut hovered = state.hovered.lock().unwrap();
    let label = over.map(|w| w.label().to_string());
    if *hovered != label {
        if let Some(old) = hovered.as_deref() {
            let _ = app.emit_to(old, "tab-drag-leave", ());
        }
        *hovered = label;
    }
    if let Some(window) = over {
        let left = window.inner_position().map_or(0.0, |pos| pos.x as f64);
        let scale = window.scale_factor().unwrap_or(1.0);
        let _ = app.emit_to(window.label(), "tab-drag-over", (cursor.x - left) / scale);
    }
}

fn show_ghost(app: &AppHandle, title: &str, cursor: PhysicalPosition<f64>) -> tauri::Result<()> {
    let scale = app
        .monitor_from_point(cursor.x, cursor.y)?
        .map_or(1.0, |monitor| monitor.scale_factor());
    let offset = PhysicalPosition::new(cursor.x + 14.0 * scale, cursor.y + 10.0 * scale);
    if let Some(ghost) = app.get_webview_window(GHOST) {
        return ghost.set_position(offset);
    }
    let ghost = WebviewWindowBuilder::new(app, GHOST, WebviewUrl::App("ghost.html".into()))
        .title(title)
        .inner_size(220.0, 34.0)
        .position(offset.x / scale, offset.y / scale)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .shadow(true)
        .build()?;
    let _ = ghost.set_ignore_cursor_events(true);
    if !app.state::<Windows>().dragging.load(Ordering::Relaxed) {
        let _ = ghost.destroy();
    }
    Ok(())
}

fn end_drag(app: &AppHandle) {
    app.state::<Windows>().dragging.store(false, Ordering::Relaxed);
    hover(app, None, PhysicalPosition::default());
    if let Some(ghost) = app.get_webview_window(GHOST) {
        let _ = ghost.destroy();
    }
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
pub async fn drag_tab_move(app: AppHandle, window: WebviewWindow, title: String) -> Result<(), String> {
    app.state::<Windows>().dragging.store(true, Ordering::Relaxed);
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    show_ghost(&app, &title, cursor).map_err(|e| e.to_string())?;
    let over = window_at(&app, cursor, window.label());
    hover(&app, over.as_ref(), cursor);
    Ok(())
}

#[tauri::command]
pub async fn drag_tab_end(app: AppHandle) {
    end_drag(&app);
}

#[tauri::command]
pub async fn drop_tab(app: AppHandle, window: WebviewWindow, file: OpenRequest, detach: bool) -> Result<bool, String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let inside = contains(&window, cursor);
    let other = if inside { None } else { window_at(&app, cursor, window.label()) };
    let moved = match other {
        Some(other) => {
            deliver(&app, other.label(), vec![file]);
            let _ = other.set_focus();
            true
        }
        None if !inside && detach => {
            create(&app, vec![file], Some(cursor)).map_err(|e| e.to_string())?;
            true
        }
        None => false,
    };
    end_drag(&app);
    Ok(moved)
}
