# Capture the Tauri Game Overlay

The Live Event Client's Tauri Game Overlay is the primary renderer for Donation Effects, and the Creator configures OBS to capture it together with the game. The existing browser Overlay remains a fallback and does not render the same Live Event concurrently by default, avoiding duplicate effects, synchronization delay, and two active rendering paths.
