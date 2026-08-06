"use strict";

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const SETTINGS_FILE = path.join(BASE_DIR, "Settings", "settings.json");

// Keys withheld from GET /api/settings (password fields show *** when set).
const SECRET_KEYS = new Set(["example-password"]);

// Env keys listed for documentation only; not persisted in settings.json.
const IGNORED_ENV_KEYS = new Set([
    "ASLM_MODULE_ID",
    "ASLM_MODULE_DIR",
    "ASLM_MODULE_INTEROP_BASE_URL",
    "ASLM_MODULE_INTEROP_PORT",
]);

// Default setting values (must match ASLM_Module.json defaults).
const DEFAULTS = {
    "example-port": 20200,
    "example-string": "Example Node.js Module - ASLM reference UI",
    "example-bool": true,
    "example-int": 10000,
    "example-number": 0.25,
    "example-password": "sk-1234-5678-9012-3456-7890",
    "example-select": "debug",
    "nodejs-runtime": true,
    "nodejs-runtime_path": null,
    "nodejs-runtime_data": null,
    "nodejs-runtime_models": null,
};

// In-memory settings cache (Node.js is single-threaded; no mutex needed).
let _settingsCache = null;

// Load settings.json merged with DEFAULTS.
function loadSettings() {
    if (_settingsCache !== null) {
        return Object.assign({}, _settingsCache);
    }

    let persisted = {};
    if (fs.existsSync(SETTINGS_FILE)) {
        try {
            const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
            const loaded = JSON.parse(raw);
            if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
                persisted = loaded;
            }
        } catch (_) {
            // Corrupt or missing settings.json — use defaults.
        }
    }

    const merged = Object.assign({}, DEFAULTS, persisted);
    _settingsCache = merged;
    return Object.assign({}, _settingsCache);
}

// Persist settings.json using an atomic rename (write .tmp then rename).
function saveSettings(data) {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });

    const tmp = SETTINGS_FILE + ".tmp";
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 4) + "\n", "utf8");
        fs.renameSync(tmp, SETTINGS_FILE);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        throw err;
    }

    _settingsCache = Object.assign({}, data);
}

// Return one setting value for get_setting.
function get(key) {
    const settings = loadSettings();
    return key in settings ? settings[key] : (key in DEFAULTS ? DEFAULTS[key] : null);
}

// Persist one setting value for set_setting.
function set(key, value) {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
}

// Coerce an ASLM {value} string into a typed scalar or JSON value.
function normalizeSettingValue(raw) {
    if (raw === null || raw === undefined) return null;

    const s = String(raw).trim();

    // Boolean literals from ASLM setExec.
    if (s.toLowerCase() === "true") return true;
    if (s.toLowerCase() === "false") return false;
    if (s === "null") return null;

    // Integer before float so "42" stays an int.
    const asInt = Number(s);
    if (s !== "" && Number.isInteger(asInt) && !s.includes(".") && !s.includes(",")) return asInt;

    // Use Number() for strict float parsing: parseFloat("0,25") silently returns 0
    // (stops at the comma), while Number("0,25") correctly returns NaN.
    const asFloat = Number(s);
    if (!isNaN(asFloat) && s !== "") return asFloat;

    // Fallback: try with comma as decimal separator (e.g. "0,25" → 0.25).
    if (s.includes(",")) {
        const asFloatComma = Number(s.replace(",", "."));
        if (!isNaN(asFloatComma)) return asFloatComma;
    }

    // JSON object/array when the host sends structured values.
    if (s.startsWith("{") || s.startsWith("[")) {
        try { return JSON.parse(s); } catch (_) {}
    }

    return raw;
}

// Return settings for the dashboard API with secrets redacted.
function getPublicSettings() {
    const settings = loadSettings();
    const result = {};
    for (const [key, value] of Object.entries(settings)) {
        result[key] = (SECRET_KEYS.has(key) && value) ? "***" : value;
    }
    return result;
}

// Return all ASLM_* variables injected by the host.
function collectAslmEnvironment() {
    const result = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith("ASLM_")) {
            result[key] = value;
        }
    }
    return result;
}

module.exports = {
    DEFAULTS,
    SETTINGS_FILE,
    SECRET_KEYS,
    IGNORED_ENV_KEYS,
    loadSettings,
    saveSettings,
    get,
    set,
    normalizeSettingValue,
    getPublicSettings,
    collectAslmEnvironment,
};
