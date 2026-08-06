"use strict";

const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const HOST_LOCALE_FILE = path.join(BASE_DIR, "Settings", "host_locale.json");

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

// Persist the host locale JSON from apply_aslm_locale --file.
function saveHostLocalePayload(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("host locale payload must be an object");
    }
    _atomicWriteJson(HOST_LOCALE_FILE, data);
}

// Return Settings/host_locale.json or null if missing or invalid.
function loadHostLocale() {
    if (!fs.existsSync(HOST_LOCALE_FILE)) return null;

    let raw;
    try {
        raw = fs.readFileSync(HOST_LOCALE_FILE, "utf8");
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

// Return the BCP-47 language code from the snapshot.
function getLanguage() {
    const payload = loadHostLocale();
    if (payload) {
        return String(payload.language || "en");
    }
    return "en";
}

module.exports = {
    HOST_LOCALE_FILE,
    saveHostLocalePayload,
    loadHostLocale,
    getLanguage,
};
