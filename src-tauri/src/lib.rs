mod addresses;
mod memory;

/// Capture/demo support: the launcher may set TGM3_SHOWCASE=<scenario id>
/// to auto-start the debug scenario player in that scenario (used by the
/// README GIF capture script). None during normal launches.
#[tauri::command]
fn showcase_override() -> Option<String> {
    std::env::var("TGM3_SHOWCASE").ok().filter(|s| !s.is_empty())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![showcase_override])
        .setup(|app| {
            memory::spawn_poll_thread(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
