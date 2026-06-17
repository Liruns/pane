# Infinite Canvas — Architecture & Plan

> Status: **planning + groundwork**. No canvas feature ships yet. This document is the design
> contract for the deferred infinite-canvas mode (DESIGN.md §11), plus a record of the prep
> already landed. Precedence still holds: **DESIGN.md > preferences.md > this doc**; nothing here
> overrides a design principle, it only plans how to honor them at canvas scale.

## 1. The vision (from DESIGN §11)

> *"an optional infinite-canvas mode where many Pane instances float and arrange on one surface."*

The canvas is the third roadmap milestone — after tabs, after optional devtools depth — and it is
**deliberately deferred**. DESIGN §6 (*Scope discipline is a design principle*) and §11 are explicit:
the canvas future is *earned by a flawless single pane first*. So this plan's first rule is the same
as the product's: **the canvas must not make v0 ugly or slow.** Everything below is sequenced so that
nothing user-visible changes until a deliberate, flagged step turns it on.

What the canvas is, concretely: a zoom-/pan-able surface on which **multiple live web panes** (each
today's `PageView`) float, move, and resize — Diego's "park a staging site, a localhost build, and
the docs on one surface" (DESIGN §13). It is the gesture surface the motion story has been holding
spring physics in reserve for (DESIGN §15: *"spring arrives with the canvas"*).

## 2. Where v0 stands (the starting architecture)

The foundation is already the right one (DESIGN §5): a single Electron **`BaseWindow`** hosts a
stack of native **`WebContentsView`s** — never the deprecated `BrowserView`. The current layering:

```
BaseWindow
 ├─ ChromeView            (the 48px toolbar + 40px tabstrip; HTML/CSS)
 ├─ Sidebar view          (optional vertical-tabs rail; DESIGN §11 Arc/Zen lineage)
 ├─ DevtoolsDock host(s)  (per-tab devtools WebContentsView + splitter)
 └─ PageView (×N tabs)    (one native WebContentsView each)
        ▲ only the ACTIVE tab's view is added to contentView; the rest are detached but live
```

- `TabManager` owns the set of `PageView`s and exactly one `activeId`.
- `PaneWindow._setActiveView()` **swaps** the visible page: removes the old child view, adds the new
  one, tiles it. This single-active-view model is the thing the canvas generalizes — from *one
  visible page* to *many positioned pages*.
- `PaneWindow.layout()` is the one place page-region geometry is computed (page │ splitter │
  devtools, inset by the rail). The canvas will need a second layout strategy beside this one.

### The single-window assumption (now addressed — see §5)

Until this prep, the main process held one window in a `current` ref and every IPC handler routed to
"the" window. The code already flagged this as the canvas blocker (the old comment on
`PaneWindow.isTrustedChromeSender`). That assumption is what §5's groundwork removes.

## 3. The core technical challenge — native views don't CSS-transform

This is the make-or-break constraint, and the reason the canvas is hard rather than just fiddly.

A `WebContentsView` is a **native OS view** composited by the OS, not a DOM element. It can only be
**positioned and sized in integer device pixels via `setBounds`**. It **cannot** be CSS-transformed,
rotated, sub-pixel-scaled, given a border-radius, or stacked under a `backdrop-filter` the way a DOM
node can. So the obvious "wrap every page in a `<div>` on a zoomable canvas and `transform: scale()`
the whole thing" **does not work for live pages** — the native page views would ignore the transform
and float at 1:1 over the zoomed DOM.

This forces an explicit decision about what "zoom" and "pan" mean for live web content. The realistic
model, and the one this plan adopts:

- **Pan** = recompute every pane's `setBounds` from `(worldX, worldY, scale)` and re-tile. Pages stay
  live; only their rectangles move. This is just `layout()` over many views with a camera transform
  applied in main — tractable, and it reuses the synchronous-`setBounds` resize discipline (DESIGN §5)
  that already keeps the seam from flashing. Pan is a P0 *resize-integrity* problem at heart.
- **Zoom** = the hard half. Two layered techniques:
  1. **Live focused pane:** `webContents.setZoomFactor(scale)` on the focused/interactive pane,
     with its `setBounds` scaled to match, gives true interactive zoom of one pane. (`PageView`
     already has `zoomBy`/`resetZoom`; this generalizes them to a canvas camera.) Zoom factor has a
     usable band (~0.25×–5×); outside it, fall to (2).
  2. **Frozen tiles when zoomed out / unfocused:** capture each non-focused pane to an image
     (`webContents.capturePage()`), detach the native view, and render the **snapshot in the canvas
     DOM** where it *can* be transformed/scaled freely and cheaply. The native `WebContentsView`
     re-attaches and goes live only for the pane the user is interacting with. This is the standard
     "many tiles, few live" pattern and it's also what keeps N live web processes from melting the
     machine (DESIGN: *fast* is a requirement, not a nicety).

The canvas surface itself (the pan/zoom camera, pane chrome, selection, the world↔screen math) is a
**DOM `WebContentsView`** — like the toolbar and rail — because it must transform freely. Live panes
are tiled *under* it by main, in screen coordinates main computes from the shared camera.

**Implication for the seam-hider (DESIGN §5):** the canvas background is `canvas` (`#0a0a0b`) —
the seam-hider is promoted from "the gap behind one page" to "the substrate of the whole surface."
Gaps between panes are *intentional* dark, exactly as the spec already frames a resize gap.

## 4. Target architecture (proposed)

Introduce a **layout mode** on `PaneWindow`: `'tabs'` (today) | `'canvas'` (new), behind a setting
(`canvasMode`), defaulting off — mirroring how `verticalTabs` was added without disturbing the
default. No new top-level window type; the canvas lives in the existing `BaseWindow`.

```
PaneWindow
 ├─ mode: 'tabs' | 'canvas'
 ├─ layout()            → delegates to TabLayout (today) or CanvasLayout (new)
 ├─ CanvasView          → a DOM WebContentsView: camera (worldX/worldY/scale), pane frames,
 │                         selection, pan/zoom gestures, "go live" on focus. Trusted chrome.
 └─ TabManager → PageViews
        • tabs mode:   one active view, swapped (unchanged)
        • canvas mode: many views tiled by CanvasLayout from the camera; non-focused → frozen tiles
```

New pieces, each small and testable in isolation:

- **`Camera`** — `(worldX, worldY, scale)` + `worldToScreen` / `screenToWorld`. Pure math, unit-testable
  with no Electron. The one source of truth both the DOM `CanvasView` and main's `setBounds` read.
- **`CanvasLayout`** — the second `layout()` strategy: given the camera and each pane's world rect,
  compute screen `setBounds` for live panes and visibility for frozen ones. Reuses the synchronous
  main-process reposition rule (DESIGN §5) so pan never lags.
- **`CanvasView`** (DOM) — pane frames (pill-radius? no — rectangular chrome ≤12px per DESIGN §5
  radius scale), drag/resize handles, selection, the pan/zoom gesture surface. **This is where
  spring physics finally land** (DESIGN §15 `ease-spring`) — gesture-driven motion, not chrome ease.
- **Pane model** — each tab gains an optional `world` rect (`{x,y,w,h}`) used only in canvas mode;
  null in tabs mode. Persisted with the session.

## 5. Groundwork already landed (this prep)

The single-window assumption is removed so IPC routes to the **sender's** window — the prerequisite
for any multi-pane/multi-window step:

- **`src/main/windows.js`** — a live-window registry (`add`/`remove`/`all`/`count`/`fromSender`/
  `focused`) replacing `index.js`'s `current` ref.
- **`PaneWindow.owns(wc)`** — does a webContents belong to this window? (chrome + rail + splitter via
  `isTrustedChromeSender`, plus the page views and their devtools hosts.) Used purely for *routing*;
  trust is still re-gated per lane.
- **`ipc.js` / `internal-ipc.js`** — both now resolve the window via `windows.fromSender(sender)`
  instead of a zero-arg `getWindow()`. With one window this is behavior-identical; with several, each
  window vouches only for its own views (the security note that motivated the change).
- **`index.js`** — creates windows through the registry; `before-quit` saves the focused window.

This is intentionally **invisible** at runtime (one window, same behavior) — scope discipline. It
just makes the next steps possible without touching the trust model again.

## 6. Phased roadmap

Each phase is shippable and leaves v0 behavior intact until the flag flips.

1. **(done) Per-sender IPC routing** — §5. Foundation; no UI.
2. **Layout-strategy seam** — extract `PaneWindow.layout()`'s page-region math into a `TabLayout`
   object and route `layout()` through a `mode`. Still tabs-only. Pure refactor, fully testable.
3. **Camera + CanvasLayout (math only)** — land `Camera` and `CanvasLayout` with unit tests; not yet
   wired to a view. Validates the world↔screen contract in isolation.
4. **Static canvas (no zoom)** — behind `canvasMode`, render the `CanvasView`, tile live panes by pan
   only (scale locked at 1). Proves multi-live-view tiling + the seam-hider substrate + resize
   integrity at N views.
5. **Zoom via focused-live / frozen-tiles** — add `setZoomFactor` for the focused pane and
   `capturePage` snapshots for the rest (§3). The performance gate: N panes must stay *fast*.
6. **Gestures + spring** — drag/resize/pan/pinch with `ease-spring` (DESIGN §15). The canvas is the
   surface springs were reserved for.
7. **Persistence + polish** — world rects in the session, per-pane devtools in canvas mode, reduced
   motion (§15.5), the new-tab/start affordance for an empty canvas.

## 7. Open questions / risks

- **Performance ceiling.** Each live `PageView` is a full renderer process. "Many instances" must cap
  live panes (focus + neighbors) and freeze the rest, or it violates *fast*. The frozen-tile pattern
  (§3) is the mitigation; phase 5 is the proof.
- **Resize integrity at N (DESIGN §5, P0).** One lagging seam is the cheap-Electron tell; N panes
  multiply the chance. Pan/zoom must reposition synchronously in main, same as window resize — never
  gated behind renderer rAF.
- **Session model for multiple windows.** v0 persists one window's snapshot (`before-quit` saves the
  focused one). Multi-window / canvas needs a richer session schema (per-window, per-pane world
  rects). Deferred; flagged in `index.js`.
- **Devtools per pane.** `DevtoolsDock` assumes one host region in the window. In canvas mode each
  pane may want its own docked devtools — a per-pane dock, or detach-only on canvas. To decide.
- **WCO / Mica interaction.** Unchanged — the toolbar still owns the top strip and WCO; the canvas is
  the page region. No new platform-chrome surface.
- **Zoom fidelity.** `setZoomFactor` reflows the page (it's not a pixel scale), so a zoomed live pane
  re-lays-out its content; snapshots scale as pixels. The visual jump on go-live/freeze must be made
  imperceptible (a crossfade), or it reads as jank.

## 8. Non-goals (for the canvas milestone, restating DESIGN §11)

Not a tiling window manager, not multi-monitor spanning, not collaborative/shared canvases, not
arbitrary rotation of panes, not a widget/note canvas — **web panes only**. The scope stays one
sentence: *many Pane web views, arranged on one quiet dark surface.*
