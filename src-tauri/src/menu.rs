use tauri::menu::{IsMenuItem, Menu, MenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Wry};

use crate::windows;

fn item(app: &AppHandle, id: &str, text: &str, accelerator: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    MenuItem::with_id(app, id, text, true, accelerator)
}

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let mut file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item(app, "new-window", "New Window", Some("CmdOrCtrl+Shift+N"))?)
        .separator()
        .item(&item(app, "close-tab", "Close Tab", Some("CmdOrCtrl+W"))?);
    if !cfg!(target_os = "macos") {
        file = file.separator().quit();
    }

    let edit = SubmenuBuilder::new(app, "Edit").copy().select_all().build()?;

    let theme = SubmenuBuilder::new(app, "Theme")
        .item(&item(app, "theme-system", "System", None)?)
        .item(&item(app, "theme-light", "Light", None)?)
        .item(&item(app, "theme-dark", "Dark", None)?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
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
    if id == "new-window" {
        let _ = windows::create(app, Vec::new(), None);
    } else if let Some(window) = windows::target(app) {
        let _ = app.emit_to(window.label(), "menu", id);
    }
}
