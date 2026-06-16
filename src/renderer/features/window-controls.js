// Reserve the native window-controls (WCO) region at runtime (DESIGN §8).
// Never hard-code a width — it changes with DPI scale and maximize/restore.
export function initWindowControls() {
  const root = document.documentElement;

  function apply() {
    const o = navigator.windowControlsOverlay;
    if (o && o.visible) {
      const r = o.getBoundingClientRect();
      const reservedRight = window.innerWidth - (r.x + r.width);
      root.style.setProperty('--wco-right', Math.max(0, reservedRight) + 'px');
    }
  }

  if (navigator.windowControlsOverlay) {
    navigator.windowControlsOverlay.addEventListener('geometrychange', apply);
    apply();
  }

  // throttle resize re-measure to one per frame (optimization)
  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; apply(); });
  });
}
