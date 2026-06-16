// Pane — toolbar (chrome) entry. Wires the feature modules; each owns its own DOM
// and its own subscriptions to the window.pane bridge.
import { initNavigation } from './features/navigation.js';
import { initAddressBar } from './features/address-bar.js';
import { initLoadingBar } from './features/loading-bar.js';
import { initWindowControls } from './features/window-controls.js';

initNavigation();
initAddressBar();
initLoadingBar();
initWindowControls();
