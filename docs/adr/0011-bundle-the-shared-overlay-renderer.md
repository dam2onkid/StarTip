# Bundle the shared overlay renderer

The Live Event Client bundles its React renderer, effect runtime, and Default Pack instead of loading the remote browser Overlay URL inside Tauri. The browser Overlay backup and desktop client consume shared renderer components, while app releases pin the desktop runtime and assets so a network or web deployment change cannot replace code during a Creator's stream.
