use std::sync::{Arc, Mutex};

use tauri::path::BaseDirectory;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

mod display;
mod overlay;

use display::Display;
use overlay::{tauri_impl::TauriWindowFactory, GameOverlay};

#[tauri::command]
fn set_overlay_id(id: String, state: State<'_, Mutex<GameOverlay>>) {
    state.lock().unwrap().set_overlay_id(id);
}

#[tauri::command]
fn get_overlay_id(state: State<'_, Mutex<GameOverlay>>) -> Result<Option<String>, String> {
    Ok(state.lock().unwrap().overlay_id().map(String::from))
}

#[tauri::command]
fn get_available_displays(state: State<'_, Mutex<GameOverlay>>) -> Result<Vec<Display>, String> {
    state.lock().unwrap().available_displays()
}

#[tauri::command]
fn get_primary_display(state: State<'_, Mutex<GameOverlay>>) -> Result<Option<Display>, String> {
    state.lock().unwrap().primary_display()
}

#[tauri::command]
fn set_target_display(name: String, state: State<'_, Mutex<GameOverlay>>) -> Result<(), String> {
    state.lock().unwrap().set_target_display(Some(name))
}

#[tauri::command]
fn get_target_display(state: State<'_, Mutex<GameOverlay>>) -> Result<Option<String>, String> {
    Ok(state.lock().unwrap().target_display().map(String::from))
}

#[tauri::command]
fn start_overlay(state: State<'_, Mutex<GameOverlay>>) -> Result<(), String> {
    state.lock().unwrap().start_overlay()
}

#[tauri::command]
fn stop_overlay(state: State<'_, Mutex<GameOverlay>>) -> Result<(), String> {
    state.lock().unwrap().stop_overlay()
}

#[tauri::command]
fn is_overlay_running(state: State<'_, Mutex<GameOverlay>>) -> bool {
    state.lock().unwrap().is_overlay_running()
}

#[tauri::command]
fn emergency_stop(state: State<'_, Mutex<GameOverlay>>) -> Result<(), String> {
    state.lock().unwrap().emergency_stop()
}

#[tauri::command]
fn is_emergency_shortcut_registered(state: State<'_, Mutex<GameOverlay>>) -> bool {
    state.lock().unwrap().is_emergency_shortcut_registered()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_overlay_id,
            get_overlay_id,
            get_available_displays,
            get_primary_display,
            set_target_display,
            get_target_display,
            start_overlay,
            stop_overlay,
            is_overlay_running,
            emergency_stop,
            is_emergency_shortcut_registered,
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap_or_else(|| {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("StarTip Live Event Client")
                    .inner_size(420.0, 560.0)
                    .build()
                    .expect("failed to create control window")
            });

            let factory = Arc::new(TauriWindowFactory::new(main_window));
            let config_path = app
                .path()
                .resolve("settings.json", BaseDirectory::AppConfig)?;
            if let Some(parent) = config_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let overlay = GameOverlay::new(factory, config_path);
            app.manage(Mutex::new(overlay));

            #[cfg(desktop)]
            {
                let handle = app.handle();
                if let Ok(mut overlay) = app.state::<Mutex<GameOverlay>>().lock() {
                    let _ = overlay.register_emergency_shortcut(handle.clone());
                }
            }

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/128x128.png"))
                .unwrap_or_else(|_| app.default_window_icon().unwrap().to_owned());

            let show_item = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "Show Control Window",
                true,
                None::<&str>,
            )?;
            let stop_item = tauri::menu::MenuItem::with_id(
                app,
                "stop-overlay",
                "Stop Overlay",
                true,
                None::<&str>,
            )?;
            let quit_item =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_item, &stop_item, &quit_item])?;

            tauri::tray::TrayIconBuilder::new()
                .icon(icon)
                .tooltip("StarTip Live Event Client")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "stop-overlay" => {
                        if let Ok(mut overlay) = app.state::<Mutex<GameOverlay>>().lock() {
                            let _ = overlay.stop_overlay();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::WindowEvent { label, event, .. } = event {
            if label == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
        }
    });
}
