use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::display::{resolve_target_display, Display};

/// A request to create a Game Overlay window.
#[derive(Debug, Clone, PartialEq)]
pub struct OverlayRequest {
    pub label: String,
    pub url: String,
    pub title: String,
    pub transparent: bool,
    pub decorations: bool,
    pub always_on_top: bool,
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub ignore_cursor_events: bool,
}

/// A platform-independent overlay window handle.
pub trait OverlayWindow: Send + Sync {
    fn close(&self) -> Result<(), String>;
    fn emit(&self, event: &str, payload: serde_json::Value) -> Result<(), String>;
}

/// A factory for querying displays and creating overlay windows.
pub trait WindowFactory: Send + Sync {
    fn create_overlay(&self, request: OverlayRequest) -> Result<Box<dyn OverlayWindow>, String>;
    fn displays(&self) -> Result<Vec<Display>, String>;
    fn primary_display(&self) -> Result<Option<Display>, String>;
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct Settings {
    target_display: Option<String>,
}

fn load_settings(path: &Path) -> Result<Settings, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn save_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())
}

/// In-memory and persisted state for the Live Event Client overlay.
pub struct GameOverlay {
    factory: Arc<dyn WindowFactory>,
    config_path: PathBuf,
    overlay_id: Option<String>,
    target_display: Option<String>,
    overlay_window: Option<Box<dyn OverlayWindow>>,
    running: bool,
    emergency_shortcut_registered: bool,
}

impl GameOverlay {
    pub fn new(factory: Arc<dyn WindowFactory>, config_path: PathBuf) -> Self {
        let settings = load_settings(&config_path).unwrap_or_default();
        Self {
            factory,
            config_path,
            overlay_id: None,
            target_display: settings.target_display,
            overlay_window: None,
            running: false,
            emergency_shortcut_registered: false,
        }
    }

    pub fn set_overlay_id(&mut self, id: String) {
        self.overlay_id = Some(id);
    }

    pub fn overlay_id(&self) -> Option<&str> {
        self.overlay_id.as_deref()
    }

    pub fn target_display(&self) -> Option<&str> {
        self.target_display.as_deref()
    }

    pub fn set_target_display(&mut self, name: Option<String>) -> Result<(), String> {
        self.target_display = name.clone();
        let settings = Settings {
            target_display: name,
        };
        save_settings(&self.config_path, &settings)
    }

    pub fn available_displays(&self) -> Result<Vec<Display>, String> {
        self.factory.displays()
    }

    pub fn primary_display(&self) -> Result<Option<Display>, String> {
        self.factory.primary_display()
    }

    /// Resolve the display the overlay should appear on, falling back when the
    /// chosen Target Display is unavailable.
    pub fn resolved_display(&self) -> Result<Option<Display>, String> {
        let displays = self.factory.displays()?;
        Ok(resolve_target_display(
            &displays,
            self.target_display.as_deref(),
        ))
    }

    fn build_overlay_request(display: &Display) -> OverlayRequest {
        OverlayRequest {
            label: "overlay".to_string(),
            url: "index.html".to_string(),
            title: "StarTip Game Overlay".to_string(),
            transparent: true,
            decorations: false,
            always_on_top: true,
            position: display.position,
            size: display.size,
            ignore_cursor_events: true,
        }
    }

    /// Start the Game Overlay on the resolved Target Display.
    pub fn start_overlay(&mut self) -> Result<(), String> {
        if self.running {
            return Ok(());
        }

        let display = self
            .resolved_display()?
            .ok_or("no displays are available")?;

        let request = Self::build_overlay_request(&display);
        let window = self.factory.create_overlay(request)?;
        self.running = true;
        self.overlay_window = Some(window);

        if let Some(window) = self.overlay_window.as_ref() {
            let _ = window.emit("overlay-state", json!({ "running": true }));
        }

        Ok(())
    }

    /// Stop the Game Overlay and remove any visible alert or effect.
    pub fn stop_overlay(&mut self) -> Result<(), String> {
        if let Some(window) = self.overlay_window.take() {
            let _ = window.emit("overlay-state", json!({ "running": false }));
            window.close()?;
        }
        self.running = false;
        Ok(())
    }

    /// Emergency stop the current effect media and audio while keeping the
    /// Game Overlay active. This dispatches an event to the overlay webview.
    pub fn emergency_stop(&mut self) -> Result<(), String> {
        if let Some(window) = self.overlay_window.as_ref() {
            window.emit("emergency-stop", json!({}))?;
        }
        Ok(())
    }

    pub fn is_overlay_running(&self) -> bool {
        self.running
    }

    #[cfg(test)]
    fn set_emergency_shortcut_registered(&mut self, registered: bool) {
        self.emergency_shortcut_registered = registered;
    }

    pub fn is_emergency_shortcut_registered(&self) -> bool {
        self.emergency_shortcut_registered
    }
}

#[cfg(desktop)]
pub mod tauri_impl {
    use super::*;
    use tauri::{
        Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
        WebviewWindow, WebviewWindowBuilder,
    };

    impl GameOverlay {
        pub fn register_emergency_shortcut(&mut self, app: tauri::AppHandle) -> Result<(), String> {
            use tauri_plugin_global_shortcut::{
                Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
            };

            app.plugin(tauri_plugin_global_shortcut::Builder::new().build())
                .map_err(|e| e.to_string())?;

            let shortcut = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER),
                Code::KeyE,
            );

            app.global_shortcut()
                .on_shortcut(shortcut, |app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Ok(mut overlay) = app.state::<std::sync::Mutex<GameOverlay>>().lock()
                        {
                            let _ = overlay.emergency_stop();
                        }
                    }
                })
                .map_err(|e| e.to_string())?;

            self.emergency_shortcut_registered = true;
            Ok(())
        }
    }

    fn to_display(m: &tauri::Monitor, primary: bool) -> Display {
        Display {
            name: m.name().cloned().unwrap_or_else(|| "Display".to_string()),
            position: (m.position().x, m.position().y),
            size: (m.size().width, m.size().height),
            scale_factor: m.scale_factor(),
            primary,
        }
    }

    pub struct TauriWindowFactory {
        window: WebviewWindow,
    }

    impl TauriWindowFactory {
        pub fn new(window: WebviewWindow) -> Self {
            Self { window }
        }
    }

    impl WindowFactory for TauriWindowFactory {
        fn create_overlay(
            &self,
            request: OverlayRequest,
        ) -> Result<Box<dyn OverlayWindow>, String> {
            let window = WebviewWindowBuilder::new(
                &self.window,
                &request.label,
                WebviewUrl::App(request.url.into()),
            )
            .title(request.title)
            .decorations(request.decorations)
            .transparent(request.transparent)
            .background_color(tauri::webview::Color(0, 0, 0, 0))
            .always_on_top(request.always_on_top)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;

            window
                .set_position(Position::Physical(PhysicalPosition::new(
                    request.position.0,
                    request.position.1,
                )))
                .map_err(|e| e.to_string())?;
            window
                .set_size(Size::Physical(PhysicalSize::new(
                    request.size.0,
                    request.size.1,
                )))
                .map_err(|e| e.to_string())?;
            window
                .set_ignore_cursor_events(request.ignore_cursor_events)
                .map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;

            Ok(Box::new(TauriOverlayWindow(window)))
        }

        fn displays(&self) -> Result<Vec<Display>, String> {
            let monitors = self
                .window
                .available_monitors()
                .map_err(|e| e.to_string())?;
            Ok(monitors.iter().map(|m| to_display(m, false)).collect())
        }

        fn primary_display(&self) -> Result<Option<Display>, String> {
            let monitor = self.window.primary_monitor().map_err(|e| e.to_string())?;
            Ok(monitor.as_ref().map(|m| to_display(m, true)))
        }
    }

    struct TauriOverlayWindow(WebviewWindow);

    impl OverlayWindow for TauriOverlayWindow {
        fn close(&self) -> Result<(), String> {
            self.0.close().map_err(|e| e.to_string())
        }

        fn emit(&self, event: &str, payload: serde_json::Value) -> Result<(), String> {
            self.0.emit(event, payload).map_err(|e| e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Mutex;

    fn display(name: &str, x: i32, y: i32, w: u32, h: u32, primary: bool) -> Display {
        Display {
            name: name.to_string(),
            position: (x, y),
            size: (w, h),
            scale_factor: 1.0,
            primary,
        }
    }

    struct MockWindow {
        closed: AtomicBool,
        emitted: Mutex<Vec<(String, serde_json::Value)>>,
    }

    impl MockWindow {
        fn new(_label: &str) -> Self {
            Self {
                closed: AtomicBool::new(false),
                emitted: Mutex::new(Vec::new()),
            }
        }

        fn emissions(&self) -> Vec<(String, serde_json::Value)> {
            self.emitted.lock().unwrap().clone()
        }
    }

    impl OverlayWindow for MockWindow {
        fn close(&self) -> Result<(), String> {
            self.closed.store(true, Ordering::SeqCst);
            Ok(())
        }

        fn emit(&self, event: &str, payload: serde_json::Value) -> Result<(), String> {
            self.emitted
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
            Ok(())
        }
    }

    impl OverlayWindow for std::sync::Arc<MockWindow> {
        fn close(&self) -> Result<(), String> {
            OverlayWindow::close(&**self)
        }

        fn emit(&self, event: &str, payload: serde_json::Value) -> Result<(), String> {
            OverlayWindow::emit(&**self, event, payload)
        }
    }

    struct MockFactory {
        displays: Vec<Display>,
        created: Mutex<Vec<OverlayRequest>>,
        windows: Mutex<Vec<(String, std::sync::Arc<MockWindow>)>>,
    }

    impl MockFactory {
        fn new(displays: Vec<Display>) -> Self {
            Self {
                displays,
                created: Mutex::new(Vec::new()),
                windows: Mutex::new(Vec::new()),
            }
        }
    }

    impl WindowFactory for MockFactory {
        fn create_overlay(
            &self,
            request: OverlayRequest,
        ) -> Result<Box<dyn OverlayWindow>, String> {
            self.created.lock().unwrap().push(request.clone());
            let window = std::sync::Arc::new(MockWindow::new(&request.label));
            self.windows
                .lock()
                .unwrap()
                .push((request.label.clone(), window.clone()));
            Ok(Box::new(window))
        }

        fn displays(&self) -> Result<Vec<Display>, String> {
            Ok(self.displays.clone())
        }

        fn primary_display(&self) -> Result<Option<Display>, String> {
            Ok(self.displays.iter().find(|d| d.primary).cloned())
        }
    }

    fn temp_config() -> PathBuf {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir =
            std::env::temp_dir().join(format!("live-client-test-{}-{}", std::process::id(), id));
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn start_overlay_uses_selected_display_dimensions() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![
            display("Primary", 0, 0, 1920, 1080, true),
            display("Secondary", 1920, 0, 2560, 1440, false),
        ]));
        let mut overlay = GameOverlay::new(factory.clone(), config);
        overlay
            .set_target_display(Some("Secondary".to_string()))
            .unwrap();

        overlay.start_overlay().unwrap();

        let created = factory.created.lock().unwrap();
        assert_eq!(created.len(), 1);
        let request = &created[0];
        assert_eq!(request.label, "overlay");
        assert!(request.transparent);
        assert!(!request.decorations);
        assert!(request.always_on_top);
        assert!(request.ignore_cursor_events);
        assert_eq!(request.position, (1920, 0));
        assert_eq!(request.size, (2560, 1440));
        assert!(overlay.is_overlay_running());
    }

    #[test]
    fn start_overlay_falls_back_to_primary_display() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![
            display("Primary", 0, 0, 1920, 1080, true),
            display("Secondary", 1920, 0, 2560, 1440, false),
        ]));
        let mut overlay = GameOverlay::new(factory, config);
        overlay
            .set_target_display(Some("Missing".to_string()))
            .unwrap();

        overlay.start_overlay().unwrap();

        assert_eq!(overlay.primary_display().unwrap().unwrap().name, "Primary");
        assert!(overlay.is_overlay_running());
    }

    #[test]
    fn stop_overlay_closes_window_and_clears_state() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![display(
            "Primary", 0, 0, 1920, 1080, true,
        )]));
        let mut overlay = GameOverlay::new(factory.clone(), config);

        overlay.start_overlay().unwrap();
        assert!(overlay.is_overlay_running());

        overlay.stop_overlay().unwrap();
        assert!(!overlay.is_overlay_running());
    }

    #[test]
    fn target_display_is_persisted_to_settings() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![]));
        let mut overlay = GameOverlay::new(factory, config.clone());

        overlay
            .set_target_display(Some("Secondary".to_string()))
            .unwrap();
        drop(overlay);

        let settings: Settings =
            serde_json::from_str(&fs::read_to_string(&config).unwrap()).unwrap();
        assert_eq!(settings.target_display.as_deref(), Some("Secondary"));

        let overlay2 = GameOverlay::new(Arc::new(MockFactory::new(vec![])), config);
        assert_eq!(overlay2.target_display().unwrap(), "Secondary");
    }

    #[test]
    fn overlay_id_is_not_persisted() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![]));
        let mut overlay = GameOverlay::new(factory, config.clone());
        overlay.set_overlay_id("secret-id".to_string());
        drop(overlay);

        if let Ok(text) = fs::read_to_string(&config) {
            assert!(!text.contains("secret-id"));
        }
    }

    #[test]
    fn start_overlay_emits_overlay_state_running() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![display(
            "Primary", 0, 0, 1920, 1080, true,
        )]));
        let mut overlay = GameOverlay::new(factory.clone(), config);

        overlay.start_overlay().unwrap();

        let created = factory.created.lock().unwrap();
        let window = created[0].label.clone();
        drop(created);

        assert!(overlay.is_overlay_running());
        let windows = factory.windows.lock().unwrap();
        let mock = windows
            .iter()
            .find(|(l, _)| l == &window)
            .map(|(_, w)| w)
            .unwrap();
        assert!(mock
            .emissions()
            .iter()
            .any(|(e, p)| e == "overlay-state" && p["running"] == true));
    }

    #[test]
    fn stop_overlay_emits_overlay_state_stopped_before_closing() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![display(
            "Primary", 0, 0, 1920, 1080, true,
        )]));
        let mut overlay = GameOverlay::new(factory.clone(), config);

        overlay.start_overlay().unwrap();
        overlay.stop_overlay().unwrap();

        assert!(!overlay.is_overlay_running());
        let created = factory.created.lock().unwrap();
        let window = created[0].label.clone();
        drop(created);
        let windows = factory.windows.lock().unwrap();
        let mock = windows
            .iter()
            .find(|(l, _)| l == &window)
            .map(|(_, w)| w)
            .unwrap();
        let emissions = mock.emissions();
        assert!(emissions
            .iter()
            .any(|(e, p)| e == "overlay-state" && p["running"] == false));
    }

    #[test]
    fn emergency_stop_emits_emergency_stop_event() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![display(
            "Primary", 0, 0, 1920, 1080, true,
        )]));
        let mut overlay = GameOverlay::new(factory.clone(), config);

        overlay.start_overlay().unwrap();
        overlay.emergency_stop().unwrap();

        let created = factory.created.lock().unwrap();
        let window = created[0].label.clone();
        drop(created);
        let windows = factory.windows.lock().unwrap();
        let mock = windows
            .iter()
            .find(|(l, _)| l == &window)
            .map(|(_, w)| w)
            .unwrap();
        assert!(mock.emissions().iter().any(|(e, _)| e == "emergency-stop"));
    }

    #[test]
    fn emergency_shortcut_registered_flag_is_persisted_in_memory() {
        let config = temp_config();
        let factory = Arc::new(MockFactory::new(vec![]));
        let mut overlay = GameOverlay::new(factory, config);

        assert!(!overlay.is_emergency_shortcut_registered());
        overlay.set_emergency_shortcut_registered(true);
        assert!(overlay.is_emergency_shortcut_registered());
    }
}
