mod menu;
mod windows;

use std::path::PathBuf;

use tauri::{Manager, WindowEvent};

#[tauri::command]
async fn read_file(path: PathBuf) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(windows::Windows::default())
        .menu(|app| menu::build(app))
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(true) => windows::focused(window.app_handle(), window.label()),
            WindowEvent::Destroyed => windows::destroyed(window.app_handle(), window.label()),
            _ => {}
        })
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            windows::open_paths(app.handle(), std::env::args_os().skip(1).map(|arg| cwd.join(arg)).collect());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            windows::window_ready,
            windows::new_window,
            windows::drop_tab
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
