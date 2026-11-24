// Starts the Atelier window; it remembers its size and place between runs. All the work is in the web app and the Rust core (wasm) inside it.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("could not start Atelier");
}
