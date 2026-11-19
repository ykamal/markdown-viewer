mod menu;
mod recent;
mod watcher;
mod windows;

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use tauri::{Manager, WindowEvent};

#[tauri::command]
async fn read_file(path: PathBuf) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn paths_from_args(args: impl IntoIterator<Item = impl Into<OsString>>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter().skip(1).map(|arg| cwd.join(arg.into())).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = paths_from_args(args, Path::new(&cwd));
            if paths.iter().any(|path| path.is_file()) {
                windows::open_paths(app, paths);
            } else if let Some(window) = windows::target(app) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(windows::Windows::default())
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(true) => windows::focused(window.app_handle(), window.label()),
            WindowEvent::Destroyed => {
                windows::destroyed(window.app_handle(), window.label());
                window.state::<watcher::Watcher>().forget_window(window.label());
            }
            _ => {}
        })
        .setup(|app| {
            app.manage(watcher::Watcher::new(app.handle().clone())?);
            app.manage(recent::Recent::load(app.handle()));
            app.set_menu(menu::build(app.handle())?)?;
            let cwd = std::env::current_dir().unwrap_or_default();
            windows::open_paths(app.handle(), paths_from_args(std::env::args_os(), &cwd));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            windows::window_ready,
            windows::new_window,
            windows::drop_tab,
            windows::drag_tab_move,
            windows::drag_tab_end,
            watcher::watch,
            watcher::unwatch,
            recent::recent_files,
            recent::add_recent
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            windows::open_paths(app, urls.iter().filter_map(|url| url.to_file_path().ok()).collect());
        }
    });
}
