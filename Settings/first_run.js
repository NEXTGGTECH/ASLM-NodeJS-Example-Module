"use strict";

const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");

// Merge manifest defaults with any existing settings.json keys.
function _buildInitialSettings(existing, uiPort) {
    const { DEFAULTS } = require("./settings");

    const initial = Object.assign({}, existing);
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
        if (key === "example-port") {
            // ASLM passes --port on first_run; preserve an existing example-port if set.
            initial[key] = key in existing ? existing[key] : uiPort;
        } else {
            initial[key] = key in existing ? existing[key] : defaultValue;
        }
    }
    return initial;
}

// Print first-run output when --log is enabled.
function _printSummary(settingsFile, initial) {
    console.log(`[ASLM-Example] Settings written to: ${settingsFile}`);
    console.log(`[ASLM-Example]   example-port   : ${initial["example-port"]}`);
    console.log(`[ASLM-Example]   example-select : ${initial["example-select"]}`);
    console.log("[ASLM-Example] First-run setup complete.");
    console.log(
        "[ASLM-Example] npm packages (e.g. express) are installed by ASLM into the " +
        "host-managed module node_modules (see ASLM_ENGINE_ENV_DIR)."
    );
}

// Write settings.json on first install (npm install is handled by ASLM).
function run({ log = false, uiPort = 20200 } = {}) {
    const { SETTINGS_FILE, loadSettings, saveSettings } = require("./settings");

    const existing = loadSettings();
    const initial = _buildInitialSettings(existing, uiPort);
    saveSettings(initial);

    if (log) {
        _printSummary(SETTINGS_FILE, initial);
    }
}

module.exports = { run };
