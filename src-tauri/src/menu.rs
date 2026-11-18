use tauri::menu::{IsMenuItem, Menu, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::{recent, windows};

fn item(app: &AppHandle, id: &str, text: &str, accelerator: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(app, id, text, true, accelerator)
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let recent_files = app.state::<recent::Recent>().list();
    let home = app.path().home_dir().map(|dir| dir.to_string_lossy().into_owned()).unwrap_or_default();
    let mut recent = SubmenuBuilder::new(app, "Open Recent").enabled(!recent_files.is_empty());
    for (index, path) in recent_files.iter().enumerate() {
        let label = match path.strip_prefix(&home) {
            Some(rest) if !home.is_empty() => format!("~{rest}"),
            _ => path.clone(),
        };
        recent = recent.item(&item(app, &format!("recent:{index}"), &label, None)?);
    }
    let recent = recent.separator().item(&item(app, "clear-recent", "Clear Menu", None)?).build()?;

    let mut file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item(app, "new-window", "New Window", Some("CmdOrCtrl+Shift+N"))?)
        .item(&recent)
        .separator()
        .item(&item(app, "close-tab", "Close Tab", Some("CmdOrCtrl+W"))?);
    if !cfg!(target_os = "macos") {
        file = file.separator().quit();
    }

    let edit = SubmenuBuilder::new(app, "Edit")
        .copy()
        .select_all()
        .separator()
        .item(&item(app, "find", "Find…", Some("CmdOrCtrl+F"))?)
        .item(&item(app, "find-next", "Find Next", Some("CmdOrCtrl+G"))?)
        .item(&item(app, "find-prev", "Find Previous", Some("CmdOrCtrl+Shift+G"))?)
        .build()?;

    let theme = SubmenuBuilder::new(app, "Theme")
        .item(&item(app, "theme-system", "System", None)?)
        .item(&item(app, "theme-light", "Light", None)?)
        .item(&item(app, "theme-dark", "Dark", None)?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "toc", "Table of Contents", Some("CmdOrCtrl+Shift+L"))?)
        .item(&item(app, "reload", "Reload", Some("CmdOrCtrl+R"))?)
        .separator()
        .item(&item(app, "zoom-in", "Zoom In", Some("CmdOrCtrl+="))?)
        .item(&item(app, "zoom-out", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .item(&item(app, "zoom-reset", "Actual Size", Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&theme)
        .separator()
        .item(&item(app, "next-tab", "Next Tab", Some("Ctrl+Tab"))?)
        .item(&item(app, "prev-tab", "Previous Tab", Some("Ctrl+Shift+Tab"))?)
        .build()?;

    let mut menus: Vec<Submenu<Wry>> = Vec::new();
    if cfg!(target_os = "macos") {
        menus.push(
            SubmenuBuilder::new(app, "Readme Viewer")
                .about(None)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?,
        );
    }
    menus.push(file.build()?);
    menus.push(edit);
    menus.push(view);
    if cfg!(target_os = "macos") {
        menus.push(
            SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .build()?,
        );
    }

    let refs: Vec<&dyn IsMenuItem<Wry>> = menus.iter().map(|m| m as _).collect();
    Menu::with_items(app, &refs)
}

pub fn handle(app: &AppHandle, id: &str) {
    if let Some(index) = id.strip_prefix("recent:").and_then(|i| i.parse::<usize>().ok()) {
        if let Some(path) = app.state::<recent::Recent>().list().get(index) {
            windows::open_paths(app, vec![path.into()]);
        }
    } else if id == "clear-recent" {
        recent::clear(app);
    } else if id == "new-window" {
        let _ = windows::create(app, Vec::new(), None);
    } else if let Some(window) = windows::target(app) {
        let _ = app.emit_to(window.label(), "menu", id);
    }
}
