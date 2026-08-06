"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname);
const DEFAULT_PORT = 20200;

// Lazy Express application — holds the Express request handler once loaded.
class LazyExpressApplication {
    constructor() {
        this._handler = null;
        this._error = null;
        this._loading = false;
    }

    // Start loading the Express app asynchronously after the port is bound.
    loadInBackground() {
        if (this._loading) return;
        this._loading = true;
        setImmediate(() => {
            try {
                const { createApp } = require("./App/app");
                this._handler = createApp();
            } catch (err) {
                this._error = err;
                console.error("[ASLM-Example] Failed to load Express app:", err);
            }
        });
    }

    // Return an http.RequestListener suitable for http.createServer().
    get requestListener() {
        return (req, res) => {
            if (this._handler) {
                return this._handler(req, res);
            }

            if (this._error) {
                const body = Buffer.from(
                    `ASLM-Example failed to start: ${this._error}`,
                    "utf8"
                );
                res.writeHead(500, {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Content-Length": String(body.length),
                });
                res.end(body);
                return;
            }

            // Still loading — auto-refresh so WebView retries.
            const body = Buffer.from(
                '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta http-equiv="refresh" content="1">' +
                "<title>Example Node.js Module starting</title></head>" +
                '<body style="font-family:Segoe UI,sans-serif;background:#111;color:#eee;">' +
                "Example Node.js Module is starting\u2026" +
                "</body></html>",
                "utf8"
            );
            res.writeHead(503, {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Length": String(body.length),
                "Retry-After": "1",
            });
            res.end(body);
        };
    }
}

// Bind port immediately; load Express on the next event loop tick.
function cmdRunserver(port, log) {
    if (log) {
        console.log(`[ASLM-Example] Starting server on port ${port}...`);
    }

    const lazyApp = new LazyExpressApplication();
    const server = http.createServer(lazyApp.requestListener);

    server.listen(port, "127.0.0.1", () => {
        lazyApp.loadInBackground();
        if (log) {
            console.log(
                `[ASLM-Example] UI server listening at http://127.0.0.1:${port}/`
            );
        }
    });

    server.on("error", (err) => {
        console.error("[ASLM-Example] Server error:", err);
        process.exit(1);
    });
}

function cmdFirstRun(log, uiPort) {
    const { run } = require("./Settings/first_run");
    run({ log, uiPort });
}

function cmdGetSetting(key) {
    const { get } = require("./Settings/settings");
    const value = get(key);
    process.stdout.write(value !== null && value !== undefined ? String(value) : "");
}

function cmdSetSetting(key, value) {
    const { normalizeSettingValue, set } = require("./Settings/settings");
    const parsed = normalizeSettingValue(value);
    set(key, parsed);
    console.log(`[ASLM-Example] Setting '${key}' updated to ${JSON.stringify(parsed)}`);
}

function cmdApplyAslmHostTheme(themeFile) {
    if (!fs.existsSync(themeFile)) {
        console.error(`Error: theme file not found: ${themeFile}`);
        process.exit(1);
    }

    let raw;
    try {
        raw = fs.readFileSync(themeFile, "utf8");
    } catch (err) {
        console.error(`Error: could not read theme file: ${err}`);
        process.exit(1);
    }

    // Strip UTF-8 BOM that .NET may write before JSON.
    raw = raw.replace(/^\uFEFF/, "").trim();

    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        console.error(`Error: invalid JSON in theme file: ${err}`);
        process.exit(1);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        console.error("Error: host theme JSON must be an object.");
        process.exit(1);
    }

    const { saveHostThemePayload } = require("./Settings/host_theme");
    saveHostThemePayload(data);
    console.log("[ASLM-Example] Host theme snapshot updated.");
}

function cmdApplyAslmLocale(localeFile) {
    if (!fs.existsSync(localeFile)) {
        console.error(`Error: locale file not found: ${localeFile}`);
        process.exit(1);
    }

    let raw;
    try {
        raw = fs.readFileSync(localeFile, "utf8");
    } catch (err) {
        console.error(`Error: could not read locale file: ${err}`);
        process.exit(1);
    }

    raw = raw.replace(/^\uFEFF/, "").trim();

    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        console.error(`Error: invalid JSON in locale file: ${err}`);
        process.exit(1);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        console.error("Error: host locale JSON must be an object.");
        process.exit(1);
    }

    const { saveHostLocalePayload } = require("./Settings/host_locale");
    saveHostLocalePayload(data);
    console.log("[ASLM-Example] Host locale snapshot updated.");
}

async function cmdDownloadsBridge() {
    const { runCli } = require("./Services/downloads_bridge");
    const exitCode = await runCli();
    process.exit(exitCode);
}

// CLI argument parser.
function parseArgs() {
    const argv = process.argv.slice(2);
    const result = {
        command: null,
        port: DEFAULT_PORT,
        key: null,
        value: null,
        file: null,
        log: false,
    };

    const positionals = [];
    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];
        if (arg === "--port") {
            const parsed = parseInt(argv[++i], 10);
            if (!isNaN(parsed)) result.port = parsed;
        } else if (arg === "--key") {
            result.key = argv[++i] || null;
        } else if (arg === "--value") {
            result.value = argv[++i] !== undefined ? argv[i] : null;
        } else if (arg === "--file") {
            result.file = argv[++i] || null;
        } else if (arg === "--log") {
            result.log = true;
        } else if (!arg.startsWith("--")) {
            positionals.push(arg);
        }
        i++;
    }

    result.command = positionals[0] || null;
    return result;
}

// Prefer CLI --port, then ASLM_UI_PORT env, then settings.json, then default.
function resolveRunserverPort(requestedPort) {
    if (requestedPort !== DEFAULT_PORT) return requestedPort;

    const envPort = process.env["ASLM_UI_PORT"] || process.env["ASLM_UI-PORT"];
    if (envPort) {
        const parsed = parseInt(envPort, 10);
        if (!isNaN(parsed)) return parsed;
    }

    try {
        const { loadSettings } = require("./Settings/settings");
        const settings = loadSettings();
        const p = parseInt(settings["example-port"], 10);
        if (!isNaN(p)) return p;
    } catch (_) {}

    return DEFAULT_PORT;
}

// Print the module name banner for commands that are not machine-readable hooks.
function maybePrintBanner(command) {
    const silent = new Set([
        "get_setting",
        "set_setting",
        "downloads_bridge",
        "apply_aslm_host_theme",
        "apply_aslm_locale",
    ]);
    if (silent.has(command)) return;

    try {
        const manifestPath = path.join(BASE_DIR, "ASLM_Module.json");
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            const name = manifest.name || "Example Node.js Module";
            const version = manifest.version || "";
            console.log(`[ASLM-Example] ${name} v${version}`);
        }
    } catch (_) {}
}

// Main entry point.
async function main() {
    const args = parseArgs();

    if (!args.command) {
        console.log("Usage: node main.js <command> [options]");
        console.log("Commands: runserver, first_run, get_setting, set_setting,");
        console.log("          apply_aslm_host_theme, apply_aslm_locale, downloads_bridge, help");
        process.exit(1);
    }

    maybePrintBanner(args.command);

    switch (args.command) {
        case "runserver": {
            const port = resolveRunserverPort(args.port);
            cmdRunserver(port, args.log);
            break;
        }

        case "first_run":
            cmdFirstRun(true, args.port);
            break;

        case "get_setting":
            if (!args.key) {
                console.error("Error: --key argument is required.");
                process.exit(1);
            }
            cmdGetSetting(args.key);
            break;

        case "set_setting":
            if (!args.key || args.value === null) {
                console.error("Error: --key and --value arguments are required.");
                process.exit(1);
            }
            cmdSetSetting(args.key, args.value);
            break;

        case "apply_aslm_host_theme":
            if (!args.file) {
                console.error("Error: --file argument is required.");
                process.exit(1);
            }
            cmdApplyAslmHostTheme(args.file);
            break;

        case "apply_aslm_locale":
            if (!args.file) {
                console.error("Error: --file argument is required.");
                process.exit(1);
            }
            cmdApplyAslmLocale(args.file);
            break;

        case "downloads_bridge":
            await cmdDownloadsBridge();
            break;

        case "help":
            console.log("Usage: node main.js <command> [options]");
            console.log("");
            console.log("Commands:");
            console.log("  runserver                   Start the Express UI server");
            console.log("  first_run                   Initialize Settings/settings.json");
            console.log("  get_setting --key <k>       Print one setting value to stdout");
            console.log("  set_setting --key <k> --value <v>   Persist one setting");
            console.log("  apply_aslm_host_theme --file <path> Save host theme snapshot");
            console.log("  apply_aslm_locale --file <path>     Save host locale snapshot");
            console.log("  downloads_bridge            Handle one bridge request from stdin");
            console.log("");
            console.log("Options:");
            console.log("  --port <n>    Port for runserver (default: 20200)");
            console.log("  --log         Enable verbose output");
            break;

        default:
            console.log(`[ASLM-Example] Unknown command: '${args.command}'`);
            console.log("Run 'node main.js help' for usage.");
            process.exit(1);
    }
}

main().catch((err) => {
    console.error("[ASLM-Example] Fatal error:", err);
    process.exit(1);
});
