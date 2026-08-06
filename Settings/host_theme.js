"use strict";

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const HOST_THEME_FILE = path.join(BASE_DIR, "Settings", "host_theme.json");

// Write JSON atomically via a temporary file.
function _atomicWriteJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + ".tmp";
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 4) + "\n", "utf8");
        fs.renameSync(tmp, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        throw err;
    }
}

// Persist the host theme JSON from apply_aslm_host_theme --file.
function saveHostThemePayload(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("host theme payload must be an object");
    }
    _atomicWriteJson(HOST_THEME_FILE, data);
}

// Return Settings/host_theme.json or null if missing or invalid.
function loadHostTheme() {
    if (!fs.existsSync(HOST_THEME_FILE)) return null;

    let raw;
    try {
        raw = fs.readFileSync(HOST_THEME_FILE, "utf8");
    } catch (_) {
        return null;
    }

    // Strip UTF-8 BOM from .NET temp files.
    raw = raw.replace(/^\uFEFF/, "").trim();

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch (_) {}

    return null;
}

// Return the effective theme id ("dark" or "light").
function getEffectiveTheme() {
    const payload = loadHostTheme();
    if (payload) {
        return String(payload.theme || "dark").toLowerCase();
    }
    return "dark";
}

module.exports = {
    HOST_THEME_FILE,
    saveHostThemePayload,
    loadHostTheme,
    getEffectiveTheme,
};
