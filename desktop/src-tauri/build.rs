// De eigen commando's krijgen een permissie (allow-<commando>). Zonder die lijst weigert Tauri
// elke aanroep vanaf een webadres (je server) stil, zie capabilities/server.json.
const COMMANDS: &[&str] = &["get_server", "set_server", "hide_popover", "set_tray_title", "open_external"];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("tauri-build mislukt");
}
