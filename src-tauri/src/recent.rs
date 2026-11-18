use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::menu;

#[derive(Default)]
pub struct Recent(Mutex<Vec<String>>);

const LIMIT: usize = 10;

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("recent.json"))
}

impl Recent {
    pub fn load(app: &AppHandle) -> Self {
        let list: Vec<String> = file(app)
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        Self(Mutex::new(list.into_iter().filter(|p| PathBuf::from(p).is_file()).collect()))
    }

    pub fn list(&self) -> Vec<String> {
        self.0.lock().unwrap().clone()
    }
}

fn update(app: &AppHandle, change: impl FnOnce(&mut Vec<String>)) {
    let list = {
        let state = app.state::<Recent>();
        let mut list = state.0.lock().unwrap();
        let before = list.clone();
        change(&mut list);
        if *list == before {
            return;
        }
        list.clone()
    };
    if let Some(path) = file(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, serde_json::to_string(&list).unwrap_or_default());
    }
    if let Ok(menu) = menu::build(app) {
        let _ = app.set_menu(menu);
    }
    let _ = app.emit("recent-changed", list);
}

pub fn clear(app: &AppHandle) {
    update(app, |list| list.clear());
}

#[tauri::command]
pub fn recent_files(state: State<Recent>) -> Vec<String> {
    state.list()
}

#[tauri::command]
pub fn add_recent(app: AppHandle, path: String) {
    update(&app, |list| {
        list.retain(|p| p != &path);
        list.insert(0, path);
        list.truncate(LIMIT);
    });
}
