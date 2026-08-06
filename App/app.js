"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(__dirname, "templates", "index.html");
const STATIC_PATH = path.join(__dirname, "static");

const MODULE_ID_FALLBACK = "aslm-nodejs-example";

// Build a compact ASLM_Module.json summary for GET /api/info.
function manifestSummary() {
    const manifestPath = path.join(BASE_DIR, "ASLM_Module.json");
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_) {
        return {};
    }

    const bridge = manifest.downloadsBridge || {};
    const interop = manifest.moduleInterop || {};
    const deps = manifest.dependencies || {};

    return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        author: manifest.author,
        hasPage: manifest.hasPage,
        downloadsBridge: {
            protocolVersion: bridge.protocolVersion,
            entryPoint: bridge.entryPoint,
            operations: bridge.operations || [],
            categories: bridge.categories || [],
            targets: bridge.targets || {},
        },
        moduleInterop: {
            protocolVersion: interop.protocolVersion,
            clientEnabled: (interop.client || {}).enabled,
        },
        dependencies: deps,
        settingsCount: (manifest.settings || []).length,
        settingTypes: [...new Set((manifest.settings || []).map((s) => String(s.type || "string")))].sort(),
    };
}

// Create and configure the Express application.
function createApp() {
    const app = express();

    app.use(express.json());
    app.use("/static", express.static(STATIC_PATH));

    // GET / — Render the reference dashboard.
    app.get("/", (req, res) => {
        const { loadHostTheme } = require("../Settings/host_theme");
        const themePayload = loadHostTheme() || {};

        let html;
        try {
            html = fs.readFileSync(TEMPLATE_PATH, "utf8");
        } catch (err) {
            res.status(500).send(`Failed to read template: ${err}`);
            return;
        }

        // Replace placeholders: theme JSON and module version from ASLM_Module.json.
        html = html.replace("__THEME_DATA_JSON__", JSON.stringify(themePayload));

        let moduleVersion = "";
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(BASE_DIR, "ASLM_Module.json"), "utf8"));
            moduleVersion = manifest.version || "";
        } catch (_) {}
        html = html.replace("__MODULE_VERSION__", moduleVersion);

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(html);
    });

    // GET /api/info — Return ASLM env vars, manifest summary, and runtime paths.
    app.get("/api/info", (req, res) => {
        const { collectAslmEnvironment } = require("../Settings/settings");

        res.json({
            moduleId: process.env.ASLM_MODULE_ID || "(not set — not launched by ASLM)",
            moduleDir: process.env.ASLM_MODULE_DIR || BASE_DIR,
            uiPort: process.env["ASLM_UI_PORT"] || process.env["ASLM_UI-PORT"] || "(not set)",
            engineEnvDir: process.env.ASLM_ENGINE_ENV_DIR || "(not set)",
            nodeVersion: process.version,
            nodeExecutable: process.execPath,
            interopBaseUrl: process.env.ASLM_MODULE_INTEROP_BASE_URL || "(not set)",
            interopPort: process.env.ASLM_MODULE_INTEROP_PORT || "(not set)",
            allAslmEnvVars: collectAslmEnvironment(),
            manifest: manifestSummary(),
        });
    });

    // GET /api/settings — Return settings.json values enriched with manifest metadata.
    app.get("/api/settings", (req, res) => {
        const { getPublicSettings } = require("../Settings/settings");
        const settings = getPublicSettings();

        // Build a lookup table from manifest setting definitions.
        const manifestPath = path.join(BASE_DIR, "ASLM_Module.json");
        const settingMeta = {};
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            for (const s of (manifest.settings || [])) {
                const key = s.key || "";
                settingMeta[key] = {
                    type: s.type || "string",
                    name: s.name || key,
                    description: s.description || "",
                    allowedValues: s.allowedValues || null,
                    default: s.default !== undefined ? s.default : null,
                };
            }
        } catch (_) {}

        // Join runtime values with type, labels, and allowedValues for the UI table.
        const enriched = Object.entries(settings).map(([key, value]) => {
            const meta = settingMeta[key] || {};
            return {
                key,
                value,
                type: meta.type || "string",
                name: meta.name || key,
                description: meta.description || "",
                allowedValues: meta.allowedValues || null,
                default: meta.default !== undefined ? meta.default : null,
            };
        });

        res.json({ settings: enriched });
    });

    // GET /api/theme — Return Settings/host_theme.json.
    app.get("/api/theme", (req, res) => {
        const { loadHostTheme, getEffectiveTheme } = require("../Settings/host_theme");
        const payload = loadHostTheme();

        if (!payload) {
            res.json({
                available: false,
                message: "No theme snapshot yet — ASLM has not pushed a theme to this module.",
                theme: "dark",
                appearance: "Dark",
                colors: {},
            });
            return;
        }

        res.json({
            available: true,
            theme: getEffectiveTheme(),
            snapshotPath: path.join(BASE_DIR, "Settings", "host_theme.json"),
            rawPayload: payload,
            ...payload,
        });
    });

    // GET /api/locale — Return Settings/host_locale.json.
    app.get("/api/locale", (req, res) => {
        const { loadHostLocale, getLanguage } = require("../Settings/host_locale");
        const payload = loadHostLocale();

        if (!payload) {
            res.json({
                available: false,
                message: "No locale snapshot yet — ASLM has not pushed a locale to this module.",
                language: "en",
                displayName: "English",
            });
            return;
        }

        res.json({
            available: true,
            language: getLanguage(),
            snapshotPath: path.join(BASE_DIR, "Settings", "host_locale.json"),
            rawPayload: payload,
            ...payload,
        });
    });

    // GET /api/downloads — Run all five bridge operations in-process for the dashboard.
    app.get("/api/downloads", (req, res) => {
        const { dispatch } = require("../Services/downloads_bridge");

        const demoCalls = [
            { operation: "list_categories" },
            { operation: "list_items", categoryId: "example-catalog" },
            { operation: "describe_item", categoryId: "example-catalog", resourceKey: "example:hello-world" },
            { operation: "resolve_install", categoryId: "example-catalog", resourceKey: "example:hello-world:latest" },
            { operation: "resolve_uninstall", categoryId: "example-catalog", resourceKey: "example:hello-world:latest" },
        ];

        const operations = demoCalls.map(({ operation, ...params }) => {
            const requestBody = { operation, ...params };
            return {
                operation,
                request: requestBody,
                response: dispatch(requestBody),
            };
        });

        const summary = manifestSummary();
        const bridgeManifest = summary.downloadsBridge || {};

        res.json({
            protocolVersion: bridgeManifest.protocolVersion || 1,
            entryPoint: bridgeManifest.entryPoint || "main.js downloads_bridge",
            protocolNote:
                "Protocol v1: one JSON object on stdin (fields: operation, categoryId?, resourceKey?), " +
                "one JSON envelope on stdout (protocolVersion, success, categories|items|itemDetail|installManifest|…). " +
                "Production entry point: main.js downloads_bridge. " +
                "Target example_data resolves to module Data/example-downloads/.",
            operations,
            manifestCategories: bridgeManifest.categories || [],
            manifestTargets: bridgeManifest.targets || {},
        });
    });

    // GET /api/interop — Proxy GET /v1/registry and include host HTTP exchange metadata.
    app.get("/api/interop", async (req, res) => {
        const { getRegistryExchange, isAvailable } = require("../Services/aslm_interop_client");

        if (!isAvailable()) {
            res.json({
                available: false,
                message:
                    "ASLM_MODULE_INTEROP_BASE_URL is not set. " +
                    "This endpoint only works when the module is launched by ASLM " +
                    "with moduleInterop.client.enabled: true.",
            });
            return;
        }

        try {
            const [registry, hostExchange] = await getRegistryExchange();
            const callerId = process.env.ASLM_MODULE_ID || MODULE_ID_FALLBACK;
            res.json({
                available: true,
                callerModuleId: callerId,
                hostExchange,
                ...registry,
            });
        } catch (err) {
            res.status(502).json({ available: false, error: String(err) });
        }
    });

    // GET /api/interop/spec — Return INTEROP_API_SPEC for the Supported HTTP API table.
    app.get("/api/interop/spec", (req, res) => {
        const { INTEROP_API_SPEC, isAvailable } = require("../Services/aslm_interop_client");
        const baseUrl = (process.env.ASLM_MODULE_INTEROP_BASE_URL || "").trim() || null;
        res.json({
            available: isAvailable(),
            interopBaseUrl: baseUrl,
            ...INTEROP_API_SPEC,
        });
    });

    // POST /api/interop/start — Proxy POST /v1/modules/start for the dashboard Start actions.
    app.post("/api/interop/start", async (req, res) => {
        const { requestStartExchange, isAvailable } = require("../Services/aslm_interop_client");

        if (!isAvailable()) {
            res.status(503).json({
                available: false,
                message: "ASLM_MODULE_INTEROP_BASE_URL is not set.",
            });
            return;
        }

        const body = req.body || {};
        const moduleIds = body.moduleIds || [];
        if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
            res.status(400).json({ error: "moduleIds array is required" });
            return;
        }

        const callerId = process.env.ASLM_MODULE_ID || MODULE_ID_FALLBACK;

        try {
            const [result, hostExchange] = await requestStartExchange({
                callerModuleId: callerId,
                moduleIds,
            });
            res.json({
                available: true,
                callerModuleId: callerId,
                hostExchange,
                proxyRequest: {
                    method: "POST",
                    path: "/api/interop/start",
                    body: { moduleIds },
                },
                ...result,
            });
        } catch (err) {
            res.status(502).json({ available: false, error: String(err) });
        }
    });

    return app;
}

module.exports = { createApp };
