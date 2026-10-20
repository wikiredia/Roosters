// Geen consolevenster op Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    roosters_lib::run()
}
