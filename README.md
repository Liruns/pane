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
(load URL/host/localhost/IP, else search), back/forward/reload, detached devtools,
animated loading bar, native window controls, resize integrity.

Follow-ups (intentionally deferred): full §10 address parser (Public Suffix List, IDN,
IPv6, single-label intranet), bundled Inter font, custom in-app error page, Mica-through-
toolbar (flip `--toolbar-bg` in `chrome.css` and confirm on a Win11 box).

Not in v0 (roadmap): tabs → runtime/devtools depth → infinite-canvas multi-instance.
