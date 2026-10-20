//! Roosters in de menubalk (Mac) en het systeemvak (Windows).
//!
//! Een klein venster zonder rand dat onder (Mac) of boven (Windows) het icoon openspringt en
//! verdwijnt zodra je ernaast klikt. Het toont gewoon je eigen Roosters-server met `?compact=1`,
//! dus elke update van de site zit er meteen in. Het serveradres staat in `server.txt` in de
//! configmap van de app (niet in de code: deze repo is publiek).

use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    window::{Effect, EffectState, EffectsBuilder},
    webview::NewWindowResponse,
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_positioner::{Position, WindowExt};

const TRAY: &str = "roosters";
const WIDTH: f64 = 390.0;
const HEIGHT: f64 = 640.0;
/// Hoekstraal van het venster op Mac (zelfde als --win-radius in server/web/css/compact.css)
const RADIUS: f64 = 12.0;
/// `?roosters-browser=1` op een adres van je server: niet in het venster openen maar in je
/// gewone browser (zonder dat stukje). Werkt ook als de pagina geen commando's mag aanroepen.
const BROWSER_MARK: &str = "roosters-browser";

#[derive(Default)]
struct AppState {
    server: Mutex<Option<Url>>,
    // Klik op het icoon terwijl het venster open is: eerst verliest het venster de focus (en
    // verbergt het zich), dan komt de klik. Die klik mag het venster niet meteen terug openen.
    hidden_by_blur: Mutex<Option<Instant>>,
    // Weten we al waar het icoon staat? (pas na de eerste muisbeweging erover)
    tray_known: AtomicBool,
}

// ---- Serveradres ------------------------------------------------------------------

fn config_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("server.txt"))
}

/// "1.2.3.4", "roosters.example.be" of "https://..." -> https://host[:poort]/
fn parse_server(input: &str) -> Result<Url, String> {
    let s = input.trim().trim_end_matches('/');
    let s = if s.contains("://") { s.to_string() } else { format!("https://{s}") };
    let url = Url::parse(&s).map_err(|_| "Dat is geen geldig adres.".to_string())?;
    if url.scheme() != "https" {
        return Err("Het adres moet met https:// beginnen.".into());
    }
    let host = url.host_str().ok_or("Dat is geen geldig adres.")?;
    let origin = match url.port() {
        Some(p) => format!("https://{host}:{p}/"),
        None => format!("https://{host}/"),
    };
    Url::parse(&origin).map_err(|e| e.to_string())
}

fn load_server(app: &AppHandle) -> Option<Url> {
    let text = fs::read_to_string(config_file(app)?).ok()?;
    parse_server(&text).ok()
}

/// De site in klein-venster-modus
fn compact_url(server: &Url) -> Url {
    let mut u = server.clone();
    u.set_query(Some("compact=1"));
    u
}

/// Het instelscherm dat in de app zit (andere schema's per platform)
fn setup_url() -> Url {
    let base = if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" };
    Url::parse(base).unwrap().join("index.html?change=1").unwrap()
}

fn is_local(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

/// Adres met `?roosters-browser=1` -> hetzelfde adres zonder dat stukje (anders None)
fn browser_target(url: &Url) -> Option<Url> {
    if !url.query_pairs().any(|(k, _)| k == BROWSER_MARK) {
        return None;
    }
    let rest: Vec<(String, String)> =
        url.query_pairs().filter(|(k, _)| k != BROWSER_MARK).map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    let mut out = url.clone();
    if rest.is_empty() {
        out.set_query(None);
    } else {
        out.query_pairs_mut().clear().extend_pairs(rest);
    }
    Some(out)
}

fn open_in_browser(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "https" | "http") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

// ---- Commando's voor de pagina's ------------------------------------------------

#[tauri::command]
fn get_server(state: State<AppState>) -> Option<String> {
    state.server.lock().unwrap().as_ref().map(|u| u.to_string())
}

#[tauri::command]
fn set_server(app: AppHandle, window: WebviewWindow, state: State<AppState>, url: String) -> Result<(), String> {
    let server = parse_server(&url)?;
    if let Some(path) = config_file(&app) {
        if let Some(dir) = path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        fs::write(&path, server.as_str()).map_err(|e| format!("Opslaan lukte niet: {e}"))?;
    }
    *state.server.lock().unwrap() = Some(server.clone());
    window.navigate(compact_url(&server)).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_popover(window: WebviewWindow) {
    let _ = window.hide();
}

/// Tekst naast het icoon in de menubalk (Mac) en in de tooltip (beide)
#[tauri::command]
fn set_tray_title(app: AppHandle, title: String) {
    let title: String = title.chars().take(40).collect();
    if let Some(tray) = app.tray_by_id(TRAY) {
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(if title.is_empty() { None } else { Some(title.as_str()) });
        let _ = tray.set_tooltip(Some(if title.is_empty() { "Roosters" } else { title.as_str() }));
    }
}

/// Links (bv. 'Openen in je browser', een les-link) in de gewone browser openen
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "Ongeldige link.".to_string())?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err("Enkel webadressen.".into());
    }
    app.opener().open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

// ---- Venster tonen en verbergen ---------------------------------------------------

fn toggle(app: &AppHandle) {
    let Some(w) = app.get_webview_window("main") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    let state = app.state::<AppState>();
    if let Some(t) = *state.hidden_by_blur.lock().unwrap() {
        if t.elapsed() < Duration::from_millis(250) {
            return;
        }
    }
    show(app, &w);
}

fn show(app: &AppHandle, w: &WebviewWindow) {
    let at_tray = app.state::<AppState>().tray_known.load(Ordering::Relaxed);
    let pos = match (at_tray, cfg!(target_os = "macos")) {
        (true, true) => Position::TrayCenter,
        (true, false) => Position::TrayBottomCenter,
        (false, true) => Position::TopRight,
        (false, false) => Position::BottomRight,
    };
    let _ = w.move_window(pos);
    let _ = w.show();
    let _ = w.set_focus();
}

fn create_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let server = app.state::<AppState>().server.lock().unwrap().clone();
    let start = match &server {
        Some(s) => WebviewUrl::External(compact_url(s)),
        None => WebviewUrl::App("index.html".into()),
    };
    let handle = app.clone();
    let popup_handle = app.clone();
    let mut b = WebviewWindowBuilder::new(app, "main", start)
        .title("Roosters")
        .inner_size(WIDTH, HEIGHT)
        .resizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        // Enkel het instelscherm en je eigen server in het venster; de rest in je browser
        .on_navigation(move |url| {
            if is_local(url) || url.scheme() == "about" {
                return true;
            }
            if let Some(target) = browser_target(url) {
                open_in_browser(&handle, &target);
                return false;
            }
            let ok = handle.state::<AppState>().server.lock().unwrap().as_ref().is_some_and(|s| same_origin(s, url));
            if !ok {
                open_in_browser(&handle, url);
            }
            ok
        })
        // Nieuwe vensters (target="_blank", window.open) bestaan hier niet: in je browser openen
        .on_new_window(move |url, _| {
            open_in_browser(&popup_handle, browser_target(&url).as_ref().unwrap_or(&url));
            NewWindowResponse::Deny
        });
    // Afgeronde hoeken. Mac: doorzichtig venster met echt wazig glas (afgerond), de pagina rondt
    // zichzelf ook af (compact.css). Windows 11: een randloos venster mét schaduw krijgt van het
    // systeem zelf afgeronde hoeken; een doorzichtig venster zou rechthoekig blijven.
    if cfg!(target_os = "macos") {
        b = b.transparent(true).effects(
            EffectsBuilder::new().effect(Effect::Popover).state(EffectState::Active).radius(RADIUS).build(),
        );
    } else {
        b = b.shadow(true);
    }
    let w = b.build()?;
    let handle = app.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            if let Some(w) = handle.get_webview_window("main") {
                if w.is_visible().unwrap_or(false) {
                    *handle.state::<AppState>().hidden_by_blur.lock().unwrap() = Some(Instant::now());
                    let _ = w.hide();
                }
            }
        }
    });
    Ok(w)
}

// ---- Icoon, menu, sneltoets ---------------------------------------------------------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItemBuilder::with_id("open", "Roosters openen").build(app)?;
    let reload = MenuItemBuilder::with_id("reload", "Vernieuwen").build(app)?;
    let browser = MenuItemBuilder::with_id("browser", "Openen in je browser").build(app)?;
    let autostart = CheckMenuItemBuilder::with_id("autostart", "Start bij inloggen")
        .checked(app.autolaunch().is_enabled().unwrap_or(false))
        .build(app)?;
    let server = MenuItemBuilder::with_id("server", "Serveradres wijzigen…").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Stoppen").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&open, &reload, &browser])
        .item(&PredefinedMenuItem::separator(app)?)
        .items(&[&autostart, &server])
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    // Mac: zwart-wit sjabloon dat zich aanpast aan licht/donker; Windows: het gekleurde app-icoon
    let icon = if cfg!(target_os = "macos") {
        tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?
    } else {
        app.default_window_icon().cloned().expect("app-icoon ontbreekt")
    };

    let autostart_item = autostart.clone();
    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Roosters")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            let w = app.get_webview_window("main");
            match event.id().as_ref() {
                "open" => {
                    if let Some(w) = w {
                        show(app, &w);
                    }
                }
                "reload" => {
                    if let Some(w) = w {
                        let _ = w.eval("location.reload()");
                    }
                }
                "browser" => {
                    if let Some(s) = app.state::<AppState>().server.lock().unwrap().clone() {
                        let _ = app.opener().open_url(s.as_str(), None::<&str>);
                    }
                }
                "autostart" => {
                    let al = app.autolaunch();
                    let on = al.is_enabled().unwrap_or(false);
                    let _ = if on { al.disable() } else { al.enable() };
                    let _ = autostart_item.set_checked(al.is_enabled().unwrap_or(!on));
                }
                "server" => {
                    if let Some(w) = w {
                        let _ = w.navigate(setup_url());
                        show(app, &w);
                    }
                }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            tauri_plugin_positioner::on_tray_event(app, &event);
            app.state::<AppState>().tray_known.store(true, Ordering::Relaxed);
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle(app);
            }
        })
        .build(app)?;
    Ok(())
}

/// ⌥⌘R op Mac, Ctrl+Alt+R op Windows
fn shortcut() -> Shortcut {
    if cfg!(target_os = "macos") {
        Shortcut::new(Some(Modifiers::ALT | Modifiers::SUPER), Code::KeyR)
    } else {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyR)
    }
}

pub fn run() {
    tauri::Builder::default()
        // Tweede keer starten: geen tweede icoon, gewoon het venster tonen
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                show(app, &w);
            }
        }))
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![get_server, set_server, hide_popover, set_tray_title, open_external])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            *app.state::<AppState>().server.lock().unwrap() = load_server(&handle);
            let w = create_window(&handle)?;
            build_tray(&handle)?;
            let _ = handle.global_shortcut().register(shortcut());
            // Eerste keer: meteen het instelscherm tonen
            if app.state::<AppState>().server.lock().unwrap().is_none() {
                let _ = w.center();
                let _ = w.show();
                let _ = w.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Roosters kon niet starten");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_addresses() {
        assert_eq!(parse_server("1.2.3.4").unwrap().as_str(), "https://1.2.3.4/");
        assert_eq!(parse_server(" https://1.2.3.4/#/home ").unwrap().as_str(), "https://1.2.3.4/");
        assert_eq!(parse_server("roosters.example.be:8443").unwrap().as_str(), "https://roosters.example.be:8443/");
        assert!(parse_server("http://1.2.3.4").is_err());
        assert!(parse_server("").is_err());
        assert_eq!(compact_url(&parse_server("1.2.3.4").unwrap()).as_str(), "https://1.2.3.4/?compact=1");
    }

    #[test]
    fn origins() {
        let s = parse_server("1.2.3.4").unwrap();
        assert!(same_origin(&s, &Url::parse("https://1.2.3.4/api/me").unwrap()));
        assert!(!same_origin(&s, &Url::parse("https://evil.example/").unwrap()));
        assert!(is_local(&setup_url()));
    }

    #[test]
    fn open_in_browser_marker() {
        let u = |s: &str| Url::parse(s).unwrap();
        assert_eq!(browser_target(&u("https://1.2.3.4/?roosters-browser=1#/rooster")).unwrap().as_str(), "https://1.2.3.4/#/rooster");
        assert_eq!(browser_target(&u("https://1.2.3.4/?a=b&roosters-browser=1")).unwrap().as_str(), "https://1.2.3.4/?a=b");
        assert!(browser_target(&u("https://1.2.3.4/?compact=1")).is_none());
    }
}
