# Pane

A small, beautiful browser developers want to use every day. The chrome is the product.

> Design system: see [`DESIGN.md`](DESIGN.md). Stack & scope are locked — Electron, one
> `WebContentsView`, ruthlessly narrow v0.

## Run

```bash
npm install      # installs Electron
npm start        # launches Pane
```

## Architecture (v0)

- **Electron `BaseWindow`** hosts two `WebContentsView`s (DESIGN.md §5):
  - `chromeView` — the HTML/CSS/JS toolbar (`src/chrome/`), transparent for Mica.
  - `pageView` — the single native web view, repositioned with `setBounds` on resize.
- Frameless window + native window buttons via **Windows Controls Overlay**.
- **Mica** translucency via `backgroundMaterial` (DESIGN.md §1/§6).
- Toolbar ⇄ page over **preload/IPC** (`src/preload.js`).

```
src/
  main/              # Electron main (Node, CommonJS)
    index.js         # app lifecycle + window bootstrap
    pane-window.js   # window shell: BaseWindow + view layout/resize + event bridge
    page-view.js     # PageView controller (nav + events) — multi-instance ready (tabs → canvas)
    chrome-view.js   # ChromeView controller (the toolbar view)
    ipc.js           # ipcMain handlers → active page
    shortcuts.js     # before-input-event keymap
    nav-history.js   # canGoBack/forward helpers
  preload/
    index.js         # window.pane bridge
  renderer/          # the chrome UI (native ES modules, no bundler)
    index.html
    main.js          # entry — wires the feature modules
    features/        # address-bar · url-parser · navigation · loading-bar · window-controls
    lib/dom.js       # $ / on helpers
    styles/          # index.css → tokens · base · toolbar · address-bar · controls
  shared/            # cross-process (CommonJS)
    channels.js      # IPC channel names (main + preload)
    config.js        # window sizes, default URL, toolbar height
```

## v0 status

Done: frameless Mica window, toolbar, single `WebContentsView`, smart address bar
(scheme / localhost / IPv4 / IPv6 / IDN / Windows-path → load, else search),
back/forward/reload, detached devtools, trickle loading bar (aborts on failure),
native window controls, resize integrity, new-tab start page, custom error page,
bundled Inter font.

Remaining hardening (deferred): full Public Suffix List + "Go to" omnibox suggestions.

Mica-through-toolbar is **blocked**: `backgroundMaterial: 'mica'` + `titleBarOverlay` (the native
window buttons) renders black and breaks on maximize (electron#42393 / #39959 / #41824). The brief
locks native window buttons, so the toolbar ships opaque dark. Revisit if Electron fixes the bug, or
via a native DWM helper (out of scope for v0).

Not in v0 (roadmap): tabs → runtime/devtools depth → infinite-canvas multi-instance.
