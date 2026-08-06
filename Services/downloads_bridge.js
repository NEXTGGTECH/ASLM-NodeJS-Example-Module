"use strict";

// Bridge configuration.
// ASLM spawns node main.js downloads_bridge: one JSON request on stdin, one response on stdout.
const PROTOCOL_VERSION = 1;
const CATEGORY_ID = "example-catalog";
const GROUP_KEY = "nodejs-reference";
const TARGET_REF = "example_data";

// Build a standard bridge response payload.
function _response({
    success = true,
    categories = undefined,
    items = undefined,
    filters = undefined,
    itemDetail = undefined,
    installManifest = undefined,
    uninstallManifest = undefined,
    warnings = [],
    error = undefined,
} = {}) {
    const payload = {
        protocolVersion: PROTOCOL_VERSION,
        success,
        warnings: warnings || [],
    };
    if (categories !== undefined) payload.categories = categories;
    if (items !== undefined) payload.items = items;
    if (filters !== undefined) payload.filters = filters;
    if (itemDetail !== undefined) payload.itemDetail = itemDetail;
    if (installManifest !== undefined) payload.installManifest = installManifest;
    if (uninstallManifest !== undefined) payload.uninstallManifest = uninstallManifest;
    if (error !== undefined) payload.error = error;
    return payload;
}

// Reference catalog

// Return categories for list_categories.
function _demoCategories() {
    return [
        {
            id: CATEGORY_ID,
            title: "Node.js reference artifacts",
            description:
                "Documents downloads bridge v1 operations. " +
                "Items map to targetRef example_data → Data/example-downloads/.",
            groupKey: GROUP_KEY,
            targetRef: TARGET_REF,
            sortOrder: 10,
        },
    ];
}

// Return items for list_items.
function _demoItems() {
    return [
        {
            resourceKey: "example:hello-world",
            categoryId: CATEGORY_ID,
            groupKey: GROUP_KEY,
            title: "Express WebView UI (this module)",
            summary: "Served by main.js runserver on setting example-port; WebView loads http://127.0.0.1:<port>/.",
            provider: "NEXTGGTECH",
            version: "1.0.0",
            homepageUrl: "https://github.com/NEXTGGTECH/ASLM-NodeJS-Example-Module",
            detail:
                "Represents the module page (App/). resolve_install returns an empty steps[] " +
                "array here so no files are written — copy the manifest shape for real " +
                "download_file / extract_zip / npm_package steps.",
            tags: ["reference", "express", "ui"],
            variantCount: 1,
            defaultVariantResourceKey: "example:hello-world:latest",
            sortOrder: 0,
        },
        {
            resourceKey: "example:sample-package",
            categoryId: CATEGORY_ID,
            groupKey: GROUP_KEY,
            title: "Host node_modules dependencies",
            summary: "express from dependencies.engines[].libraries → Engines/NodeJS/venv-aslm-nodejs-example/.",
            provider: "NEXTGGTECH",
            version: "1.0.0",
            homepageUrl: "https://github.com/NEXTGGTECH/ASLM-NodeJS-Example-Module/blob/main/ASLM_Module.json",
            detail:
                "ASLM installs npm packages on first-run into the managed node_modules " +
                "(ASLM_ENGINE_ENV_DIR). describe_item exposes variants to show how " +
                "resourceKey suffixes select install manifests.",
            tags: ["reference", "nodejs-runtime", "npm"],
            variantCount: 2,
            defaultVariantResourceKey: "example:sample-package:stable",
            sortOrder: 1,
        },
    ];
}

// Look up a catalog item by resourceKey.
function _findItem(resourceKey) {
    return _demoItems().find((item) => item.resourceKey === resourceKey) || null;
}

// Operation handlers

function _handleListCategories() {
    return _response({ categories: _demoCategories() });
}

function _handleListItems(categoryId) {
    if (categoryId && categoryId !== CATEGORY_ID) {
        return _response({ success: false, error: `Unsupported categoryId: ${JSON.stringify(categoryId)}` });
    }
    return _response({
        items: _demoItems(),
        filters: [
            {
                key: "reference-only",
                title: "Reference entries",
                kind: "tag",
                selected: true,
                sortOrder: 0,
            },
        ],
        warnings: [
            "Reference catalog: resolve_install / resolve_uninstall return empty steps[] — inspect JSON shape only.",
        ],
    });
}

function _handleDescribeItem(categoryId, resourceKey) {
    if (categoryId && categoryId !== CATEGORY_ID) {
        return _response({ success: false, error: `Unsupported categoryId: ${JSON.stringify(categoryId)}` });
    }
    if (!resourceKey) {
        return _response({ success: false, error: "Missing resourceKey for describe_item." });
    }

    const item = _findItem(resourceKey);
    if (!item) {
        return _response({ success: false, error: `Unknown resourceKey: ${JSON.stringify(resourceKey)}` });
    }

    const detail = Object.assign({}, item);

    if (resourceKey === "example:hello-world") {
        detail.variants = [
            {
                resourceKey: "example:hello-world:latest",
                title: "main branch",
                summary: "Tracks ASLM_Module.json version 1.0.0 (module page + bridge).",
                version: "1.0.0",
                sortOrder: 0,
            },
        ];
    } else {
        detail.variants = [
            {
                resourceKey: `${resourceKey}:stable`,
                title: "Release channel",
                summary: "Matches update.channel=release in the manifest.",
                version: "1.0.0",
                sortOrder: 0,
            },
            {
                resourceKey: `${resourceKey}:beta`,
                title: "Pre-release",
                summary: "Hypothetical beta node_modules pin for testing allowedValues-style pins.",
                version: "1.1.0-beta",
                sortOrder: 1,
            },
        ];
    }

    return _response({ itemDetail: detail });
}

function _handleResolveInstall(categoryId, resourceKey) {
    if (categoryId && categoryId !== CATEGORY_ID) {
        return _response({ success: false, error: `Unsupported categoryId: ${JSON.stringify(categoryId)}` });
    }
    if (!resourceKey) {
        return _response({ success: false, error: "Missing resourceKey for resolve_install." });
    }

    const baseKey = resourceKey.includes(":") ? resourceKey.split(":").slice(0, 2).join(":") : resourceKey;
    const item = _findItem(baseKey) || _findItem(resourceKey);
    const title = item ? String(item.title) : resourceKey;

    return _response({
        installManifest: {
            resourceKey,
            categoryId: CATEGORY_ID,
            targetRef: TARGET_REF,
            title,
            message:
                "Reference manifest — steps[] is empty. Add download_file, extract_zip, or npm_package objects for real installs.",
            steps: [],
        },
        warnings: [
            'Example step types: {"type":"download_file","url":"...","dest":"file.zip"}, ' +
            '{"type":"extract_zip","src":"file.zip","dest":"."}, ' +
            '{"type":"npm_package","package":"express"}.',
        ],
    });
}

function _handleResolveUninstall(categoryId, resourceKey) {
    if (categoryId && categoryId !== CATEGORY_ID) {
        return _response({ success: false, error: `Unsupported categoryId: ${JSON.stringify(categoryId)}` });
    }
    if (!resourceKey) {
        return _response({ success: false, error: "Missing resourceKey for resolve_uninstall." });
    }

    return _response({
        uninstallManifest: {
            resourceKey,
            categoryId: CATEGORY_ID,
            targetRef: TARGET_REF,
            message:
                "Reference uninstall — steps[] empty. Host removes files under targetRef when steps are provided.",
            steps: [],
        },
        warnings: [
            "Uninstall steps typically mirror install paths (delete file/tree) — see ASLM DownloadInstaller docs.",
        ],
    });
}

// Dispatcher

// Route one request object to the matching operation handler.
function dispatch(request) {
    const operation = String(request.operation || "").trim().toLowerCase();
    const categoryId = String(request.categoryId || "").trim();
    const resourceKey = String(request.resourceKey || "").trim();

    if (operation === "list_categories") return _handleListCategories();
    if (operation === "list_items") return _handleListItems(categoryId);
    if (operation === "describe_item") return _handleDescribeItem(categoryId, resourceKey);
    if (operation === "resolve_install") return _handleResolveInstall(categoryId, resourceKey);
    if (operation === "resolve_uninstall") return _handleResolveUninstall(categoryId, resourceKey);

    return _response({
        success: false,
        error: `Unsupported downloads bridge operation: ${JSON.stringify(operation)}`,
    });
}

// CLI entry point

// Read stdin, dispatch, and print one JSON response (used by main.js downloads_bridge).
async function runCli() {
    let raw = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
        raw += chunk;
    }

    let request = {};
    try {
        const trimmed = raw.trim();
        if (trimmed) {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                request = parsed;
            }
        }
    } catch (_) {}

    let response;
    try {
        response = dispatch(request);
    } catch (err) {
        response = _response({ success: false, error: String(err) });
    }

    process.stdout.write(JSON.stringify(response) + "\n");
    return 0;
}

module.exports = { dispatch, runCli };
