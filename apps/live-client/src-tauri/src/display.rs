/// Display information used by the Live Event Client.
///
/// This is a platform-independent mirror of the data needed to place the Game
/// Overlay on a Target Display and fall back when that display is unavailable.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Display {
    pub name: String,
    pub position: (i32, i32),
    pub size: (u32, u32),
    pub scale_factor: f64,
    pub primary: bool,
}

/// Resolve the Target Display from the available set.
///
/// If a selected display name is provided and is present, it is returned.
/// Otherwise the primary display is used. If there is no primary display, the
/// first available display is used. If no displays are available, `None` is
/// returned.
pub fn resolve_target_display(displays: &[Display], selected: Option<&str>) -> Option<Display> {
    if let Some(name) = selected {
        if let Some(display) = displays.iter().find(|d| d.name == name) {
            return Some(display.clone());
        }
    }

    displays
        .iter()
        .find(|d| d.primary)
        .cloned()
        .or_else(|| displays.first().cloned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display(name: &str, x: i32, y: i32, w: u32, h: u32, primary: bool) -> Display {
        Display {
            name: name.to_string(),
            position: (x, y),
            size: (w, h),
            scale_factor: 2.0,
            primary,
        }
    }

    #[test]
    fn uses_selected_display_when_available() {
        let displays = vec![
            display("Primary", 0, 0, 1920, 1080, true),
            display("Secondary", 1920, 0, 2560, 1440, false),
        ];

        let resolved = resolve_target_display(&displays, Some("Secondary"));

        assert_eq!(resolved.as_ref().map(|d| d.name.as_str()), Some("Secondary"));
        assert_eq!(resolved.map(|d| d.size), Some((2560, 1440)));
    }

    #[test]
    fn falls_back_to_primary_when_selected_is_unavailable() {
        let displays = vec![
            display("Primary", 0, 0, 1920, 1080, true),
            display("Secondary", 1920, 0, 2560, 1440, false),
        ];

        let resolved = resolve_target_display(&displays, Some("Missing"));

        assert_eq!(resolved.as_ref().map(|d| d.name.as_str()), Some("Primary"));
    }

    #[test]
    fn falls_back_to_first_display_when_no_primary() {
        let displays = vec![display("Left", -1920, 0, 1920, 1080, false)];

        let resolved = resolve_target_display(&displays, None);

        assert_eq!(resolved.as_ref().map(|d| d.name.as_str()), Some("Left"));
    }

    #[test]
    fn returns_none_for_empty_display_list() {
        let resolved = resolve_target_display(&[], None);
        assert!(resolved.is_none());
    }
}
