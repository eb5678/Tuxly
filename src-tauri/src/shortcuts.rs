use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use tokio::time::{sleep, Duration};

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

pub(crate) type MoveWindowTask = Arc<AtomicBool>;

pub(crate) struct MoveWindowState {
    tasks: Mutex<HashMap<String, MoveWindowTask>>,
}

impl Default for MoveWindowState {
    fn default() -> Self {
        MoveWindowState {
            tasks: Mutex::new(HashMap::new()),
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
        "move_window_up" => handle_move_window(app, "up"),
        "move_window_down" => handle_move_window(app, "down"),
        "move_window_left" => handle_move_window(app, "left"),
        "move_window_right" => handle_move_window(app, "right"),
        "audio_recording" => handle_audio_shortcut(app),
        _ => {}
    }
}

pub fn start_move_window<R: Runtime>(app: &AppHandle<R>, direction: &str) {
    let state = app.state::<MoveWindowState>();
    let mut tasks = match state.tasks.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    if tasks.contains_key(direction) {
        return;
    }

    let stop_flag: MoveWindowTask = Arc::new(AtomicBool::new(false));
    let flag_clone = stop_flag.clone();
    let dir = direction.to_string();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let interval = Duration::from_millis(16);
        while !flag_clone.load(Ordering::Relaxed) {
            handle_move_window(&app_handle, &dir);
            sleep(interval).await;
        }
    });

    tasks.insert(direction.to_string(), stop_flag);
}

pub fn stop_move_window<R: Runtime>(app: &AppHandle<R>, direction: &str) {
    let state = app.state::<MoveWindowState>();
    let mut tasks = match state.tasks.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    if let Some(flag) = tasks.remove(direction) {
        flag.store(true, Ordering::Relaxed);
    }
}

pub fn stop_all_move_windows<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<MoveWindowState>();
    let mut tasks = match state.tasks.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    for (_direction, flag) in tasks.drain() {
        flag.store(true, Ordering::Relaxed);
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
            if action_id == "move_window" {
                let modifiers = binding.key.trim();
                if modifiers.is_empty() {
                    continue;
                }

                let arrow_keys = vec!["up", "down", "left", "right"];
                for arrow in arrow_keys {
                    let full_key = format!("{}+{}", modifiers, arrow);
                    match full_key.parse::<Shortcut>() {
                        Ok(shortcut) => {
                            let direction_action_id = format!("move_window_{}", arrow);
                            shortcuts_to_register.push((direction_action_id, full_key, shortcut));
                        }
                        Err(e) => {
                            return Err(format!("Invalid shortcut '{}': {}", full_key, e));
                        }
                    }
                }
                continue;
            }

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

    stop_all_move_windows(&app);
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

fn handle_move_window<R: Runtime>(app: &AppHandle<R>, direction: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(current_pos) = window.outer_position() {
            let step = 12;
            let (new_x, new_y) = match direction {
                "up" => (current_pos.x, current_pos.y - step),
                "down" => (current_pos.x, current_pos.y + step),
                "left" => (current_pos.x - step, current_pos.y),
                "right" => (current_pos.x + step, current_pos.y),
                _ => return,
            };

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: new_x,
                y: new_y,
            }));
        }
    }
}