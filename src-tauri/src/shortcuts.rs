use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::window::show_dashboard_window;

pub struct RegisteredShortcuts {
    pub shortcuts: Mutex<HashMap<String, String>>, 
}

impl Default for RegisteredShortcuts {
    fn default() -> Self {
        RegisteredShortcuts {
            shortcuts: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutBinding {
    pub action: String,
    pub key: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutsConfig {
    pub bindings: HashMap<String, ShortcutBinding>,
}

pub fn handle_shortcut_action<R: Runtime>(app: &AppHandle<R>, action_id: &str) {
    match action_id {
        "toggle_dashboard" => handle_toggle_dashboard(app),
        "focus_input" => handle_focus_input(app),
        "audio_recording" => handle_audio_shortcut(app),
        _ => {}
    }
}

fn handle_audio_shortcut<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(false) = window.is_visible() {
            if let Err(_e) = window.show() {
                return;
            }
            if let Err(e) = window.set_focus() {
                eprintln!("Failed to focus window: {}", e);
            }
        }
        if let Err(e) = window.emit("start-audio-recording", json!({})) {
            eprintln!("Failed to emit audio recording event: {}", e);
        }
    }
}

#[tauri::command]
pub fn update_shortcuts<R: Runtime>(
    app: AppHandle<R>,
    config: ShortcutsConfig,
) -> Result<(), String> {
    let mut shortcuts_to_register = Vec::new();

    for (action_id, binding) in &config.bindings {
        if binding.enabled && !binding.key.is_empty() {
            match binding.key.parse::<Shortcut>() {
                Ok(shortcut) => {
                    shortcuts_to_register.push((action_id.clone(), binding.key.clone(), shortcut));
                }
                Err(e) => {
                    return Err(format!("Invalid shortcut '{}': {}", binding.key, e));
                }
            }
        }
    }

    unregister_all_shortcuts(&app)?;

    let mut successfully_registered = HashMap::new();
    let mut registration_failures: Vec<(String, String, String)> = Vec::new();

    for (action_id, shortcut_str, shortcut) in shortcuts_to_register {
        match app.global_shortcut().register(shortcut) {
            Ok(_) => {
                successfully_registered.insert(action_id, shortcut_str);
            }
            Err(e) => {
                registration_failures.push((action_id, shortcut_str, e.to_string()));
            }
        }
    }

    {
        let state = app.state::<RegisteredShortcuts>();
        let mut registered = match state.shortcuts.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner()
        };
        registered.clear();
        registered.extend(successfully_registered);
    }

    if !registration_failures.is_empty() {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("shortcut-registration-error", &registration_failures);
        }
        let error_messages: Vec<String> = registration_failures
            .into_iter()
            .map(|(action, key, error)| format!("{} ({}) - {}", action, key, error))
            .collect();

        return Err(format!("Could not register: {}", error_messages.join("; ")));
    }

    Ok(())
}

fn unregister_all_shortcuts<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<RegisteredShortcuts>();
    let registered = match state.shortcuts.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner()
    };

    for (_, shortcut_str) in registered.iter() {
        if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(shortcut);
        }
    }
    Ok(())
}

fn handle_toggle_dashboard<R: Runtime>(app: &AppHandle<R>) {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        match dashboard_window.is_visible() {
            Ok(true) => {
                let _ = dashboard_window.close();
            }
            Ok(false) => {
                let _ = dashboard_window.show();
                let _ = dashboard_window.set_focus();
            }
            Err(_) => {}
        }
    } else {
        let _ = show_dashboard_window(app);
    }
}

fn handle_focus_input<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(false) = window.is_visible() {
            let _ = window.show();
        }
        let _ = window.set_focus();
        let _ = window.emit("focus-text-input", json!({}));
    }
}