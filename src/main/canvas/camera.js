'use strict';
const { CANVAS } = require('../../shared/config');

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * The infinite-canvas camera (CANVAS.md §3–4) — the single source of truth for the world↔screen
 * transform that both the DOM CanvasView and the main-process pane tiling (CanvasLayout) read.
 *
 * Coordinates are **region-local**: screen (0,0) is the top-left of the content region the window
 * hands the layout (right of the vertical-tabs rail, below the chrome). CanvasLayout adds the
 * region's (left, top) offset; the camera stays pure so it's unit-testable with no Electron.
 *
 * Transform: screen = world * scale + pan. `x`/`y` are the pan offset in region-local screen px,
 * `scale` the zoom factor (clamped to the usable band, CANVAS.MIN_SCALE..MAX_SCALE).
 */
class Camera {
  constructor({ x = 0, y = 0, scale = 1 } = {}) {
    this.x = x;
    this.y = y;
    this.scale = clamp(scale, CANVAS.MIN_SCALE, CANVAS.MAX_SCALE);
  }

  /** World point → region-local screen point. */
  worldToScreen(wx, wy) {
    return { x: wx * this.scale + this.x, y: wy * this.scale + this.y };
  }

  /** Region-local screen point → world point. */
  screenToWorld(sx, sy) {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  /** World rect ({x,y,width,height}) → region-local screen rect (floats — round at setBounds). */
  worldRectToScreen(r) {
    const p = this.worldToScreen(r.x, r.y);
    return { x: p.x, y: p.y, width: r.width * this.scale, height: r.height * this.scale };
  }

  /** Pan by a region-local screen delta (drag the empty canvas). */
  panBy(dx, dy) {
    this.x += dx;
    this.y += dy;
    return this;
  }

  /** Set the absolute zoom, keeping the world point under screen anchor (ax,ay) fixed (pinch/wheel).
   *  Clamps to the usable band; when clamped, the anchor still stays put for the scale we land on. */
  zoomTo(scale, ax = 0, ay = 0) {
    const next = clamp(scale, CANVAS.MIN_SCALE, CANVAS.MAX_SCALE);
    const w = this.screenToWorld(ax, ay); // the world point we want to keep under the cursor
    this.scale = next;
    this.x = ax - w.x * next;
    this.y = ay - w.y * next;
    return this;
  }

  /** Multiply the zoom by `factor` about a screen anchor. */
  zoomBy(factor, ax = 0, ay = 0) {
    return this.zoomTo(this.scale * factor, ax, ay);
  }

  /** Serialize for the session (CANVAS.md persistence). */
  toJSON() { return { x: this.x, y: this.y, scale: this.scale }; }
}

module.exports = Camera;
