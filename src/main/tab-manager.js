'use strict';
const { EventEmitter } = require('node:events');
const PageView = require('./page-view');
const { handlePageKey } = require('./shortcuts');
const history = require('./history');

/**
 * Owns the set of tabs (one PageView each) and which is active. Only the active
 * tab's view is shown by the window; background tabs keep running.
 *
 * Emits: 'active-page'(PageView), 'tabs'(state), 'all-closed', 'focus-address',
 *        re-emits the ACTIVE tab's 'loading'/'nav-state'/'load-error', and any
 *        tab's 'open-external'.
 */
class TabManager extends EventEmitter {
  constructor() {
    super();
    this.tabs = [];
    this.activeId = null;
    this._seq = 0;
  }

  get active() {
    const t = this.tabs.find((x) => x.id === this.activeId);
    return t ? t.view : null;
  }

  _state() {
    return {
      activeId: this.activeId,
      tabs: this.tabs.map((t) => ({
        id: t.id, title: t.title, url: t.url, loading: t.loading, favicon: t.favicon,
      })),
    };
  }
  _emitTabs() { this.emit('tabs', this._state()); }

  newTab(url) {
    const id = ++this._seq;
    const view = new PageView();
    const tab = { id, view, title: 'New Tab', url: '', loading: false, favicon: '' };
    this.tabs.push(tab);

    view.on('title', (title) => {
      tab.title = title || 'New Tab';
      history.updateTitle(tab.url, title);
      this._emitTabs();
    });
    view.on('navigated', (navUrl) => history.record(navUrl));
    view.on('favicon', (f) => { tab.favicon = f; this._emitTabs(); });
    view.on('found', (r) => { if (id === this.activeId) this.emit('found', r); });
    view.on('loading', (loading) => {
      tab.loading = loading;
      this._emitTabs();
      if (id === this.activeId) this.emit('loading', loading);
    });
    view.on('nav-state', (state) => {
      tab.url = state.url;
      this._emitTabs();
      if (id === this.activeId) this.emit('nav-state', state);
    });
    view.on('load-error', (err) => { if (id === this.activeId) this.emit('load-error', err); });
    view.on('open-external', (u) => this.emit('open-external', u));
    view.webContents.on('before-input-event', (e, input) => handlePageKey(this, e, input));

    this.activate(id);
    if (url) view.navigate(url); else view.loadStart();
    return id;
  }

  activate(id) {
    if (!this.tabs.some((t) => t.id === id)) return;
    this.activeId = id;
    const view = this.active;
    this.emit('active-page', view);
    this._emitTabs();
    if (view) view.refreshState();
  }

  /** Re-emit the current state — used after the toolbar renderer (re)loads. */
  refresh() {
    this._emitTabs();
    const view = this.active;
    if (view) view.refreshState();
  }

  nextTab() { this._cycle(1); }
  prevTab() { this._cycle(-1); }
  _cycle(dir) {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = this.tabs[(i + dir + this.tabs.length) % this.tabs.length];
    this.activate(next.id);
  }

  closeActive() { if (this.activeId != null) this.closeTab(this.activeId); }

  closeTab(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    const wasActive = this.activeId === id;
    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      this.emit('all-closed');
      tab.view.destroy();
      return;
    }
    if (wasActive) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activate(next.id);
    } else {
      this._emitTabs();
    }
    tab.view.destroy();
  }
}

module.exports = TabManager;
