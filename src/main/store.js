'use strict';
// Tiny JSON persistence in the OS userData dir. Shared by history / session / settings.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const file = (name) => path.join(app.getPath('userData'), name);

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
  catch { return fallback; }
}

function writeJSON(name, data) {
  try { fs.writeFileSync(file(name), JSON.stringify(data)); } catch { /* best-effort */ }
}

module.exports = { readJSON, writeJSON };
