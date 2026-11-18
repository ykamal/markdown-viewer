use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

struct Entry {
    path: String,
    windows: HashSet<String>,
}

pub struct Watcher {
    debouncer: Mutex<Debouncer<RecommendedWatcher>>,
    files: Mutex<HashMap<PathBuf, Entry>>,
}

impl Watcher {
    pub fn new(app: AppHandle) -> Result<Self, notify_debouncer_mini::notify::Error> {
        let debouncer = new_debouncer(Duration::from_millis(150), move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let state = app.state::<Watcher>();
            let files = state.files.lock().unwrap();
            for event in events {
                if let Some(entry) = files.get(&event.path) {
                    for label in &entry.windows {
                        let _ = app.emit_to(label, "file-changed", &entry.path);
                    }
                }
            }
        })?;
        Ok(Self { debouncer: Mutex::new(debouncer), files: Mutex::default() })
    }

    fn release(&self, files: &mut HashMap<PathBuf, Entry>, key: &Path) {
        files.remove(key);
        let Some(dir) = key.parent() else { return };
        if !files.keys().any(|other| other.parent() == Some(dir)) {
            let _ = self.debouncer.lock().unwrap().watcher().unwatch(dir);
        }
    }

    pub fn forget_window(&self, label: &str) {
        let mut files = self.files.lock().unwrap();
        let empty: Vec<PathBuf> = files
            .iter_mut()
            .filter_map(|(key, entry)| {
                entry.windows.remove(label);
                entry.windows.is_empty().then(|| key.clone())
            })
            .collect();
        for key in empty {
            self.release(&mut files, &key);
        }
    }
}

#[tauri::command]
pub fn watch(state: State<Watcher>, window: WebviewWindow, path: String) -> Result<(), String> {
    let key = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let dir = key.parent().ok_or("no parent folder")?.to_path_buf();
    let mut files = state.files.lock().unwrap();
    if !files.keys().any(|other| other.parent() == Some(&dir)) {
        state
            .debouncer
            .lock()
            .unwrap()
            .watcher()
            .watch(&dir, RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;
    }
    files
        .entry(key)
        .or_insert_with(|| Entry { path, windows: HashSet::new() })
        .windows
        .insert(window.label().to_string());
    Ok(())
}

#[tauri::command]
pub fn unwatch(state: State<Watcher>, window: WebviewWindow, path: String) {
    let mut files = state.files.lock().unwrap();
    let key = std::fs::canonicalize(&path)
        .ok()
        .filter(|key| files.contains_key(key))
        .or_else(|| files.iter().find(|(_, entry)| entry.path == path).map(|(key, _)| key.clone()));
    let Some(key) = key else { return };
    let Some(entry) = files.get_mut(&key) else { return };
    entry.windows.remove(window.label());
    if entry.windows.is_empty() {
        state.release(&mut files, &key);
    }
}
