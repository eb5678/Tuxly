mod db;
mod shortcuts;
mod window;
mod speaker;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tokio::task::JoinHandle;

#[derive(Default)]
pub struct AudioState {
    pub stream_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    pub is_capturing: Arc<Mutex<bool>>,
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pluely.db", db::migrations())
                .build(),
        )
        .manage(AudioState::default())
        .manage(shortcuts::RegisteredShortcuts::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init());
        
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            window::open_dashboard,
            window::toggle_dashboard,
            shortcuts::update_shortcuts,
            speaker::start_system_audio_capture,
            speaker::stop_system_audio_capture,
            speaker::manual_stop_continuous,
            speaker::get_input_devices,
            speaker::get_output_devices,
        ])
        .setup(|app| {
            window::setup_main_window(app).expect("Failed to setup main window");

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};
                        let action_id = {
                            let state = app.state::<shortcuts::RegisteredShortcuts>();
                            let registered = match state.shortcuts.lock() {
                                Ok(guard) => guard,
                                Err(poisoned) => poisoned.into_inner()
                            };

                            registered.iter().find_map(|(action_id, shortcut_str)| {
                                if let Ok(s) = shortcut_str.parse::<Shortcut>() {
                                    if &s == shortcut { return Some(action_id.clone()); }
                                }
                                None
                            })
                        };

                        if let Some(action_id) = action_id {
                            match event.state() {
                                ShortcutState::Pressed => {
                                    shortcuts::handle_shortcut_action(app, &action_id);
                                }
                                ShortcutState::Released => {}
                            }
                        }
                    })
                    .build(),
            ).expect("Failed to initialize global shortcut plugin");

            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}