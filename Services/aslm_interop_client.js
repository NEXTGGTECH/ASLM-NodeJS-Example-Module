"use strict";

const http = require("http");
const { URL } = require("url");

// Interop API reference.
// Mirrors AslmModuleInteropServer routes for the reference dashboard.
const INTEROP_API_SPEC = {
    protocolVersion: 1,
    baseUrlEnv: "ASLM_MODULE_INTEROP_BASE_URL",
    portEnv: "ASLM_MODULE_INTEROP_PORT",
    constraints: [
        "Loopback clients only (127.0.0.1 / ::1).",
        "Caller module must be running before POST /v1/modules/start.",
    ],
    endpoints: [
        {
            method: "GET",
            path: "/v1/registry",
            summary: "List installed and running module snapshots with port/host data.",
            requestBody: null,
            successStatus: 200,
            responseFields: {
                interopBaseUrl: "Loopback root URL of this listener.",
                aslmApi: "AslmApiDto — ASLM API mirror server state.",
                installedModules: "Array of InstalledModuleDto.",
                runningModules: "Array of RunningModuleDto with hosts.",
            },
            installedModuleFields: [
                "id", "name", "version", "installed", "enabled",
                "firstRunCompleted", "hasRunCommands", "hasMultipleInstances",
                "instanceFolder",
            ],
            runningModuleFields: ["id", "name", "instanceFolder", "sourcePath", "pageUrl", "hosts"],
            moduleHostFields: ["hostKey", "routeKey", "port", "targetUrl", "mirrorUrl"],
            aslmApiFields: ["enabled", "running", "port", "baseUrl"],
            errorResponses: [],
        },
        {
            method: "GET",
            path: "/v1/ports",
            summary: "Return ASLM API state and port/host data for running modules only.",
            requestBody: null,
            successStatus: 200,
            responseFields: {
                aslmApi: "AslmApiDto — ASLM API mirror server state.",
                runningModules: "Array of RunningModuleDto with hosts.",
            },
            runningModuleFields: ["id", "name", "instanceFolder", "sourcePath", "pageUrl", "hosts"],
            moduleHostFields: ["hostKey", "routeKey", "port", "targetUrl", "mirrorUrl"],
            aslmApiFields: ["enabled", "running", "port", "baseUrl"],
            errorResponses: [],
        },
        {
            method: "POST",
            path: "/v1/modules/start",
            summary: "Start or ensure running state for one or more modules.",
            requestBody: {
                callerModuleId: "string — id of the running module making the call",
                moduleIds: ["string — module ids to start"],
            },
            successStatus: 200,
            responseFields: {
                results: "Array of { moduleId, status, message? }.",
            },
            resultStatuses: [
                "started",
                "alreadyRunning",
                "notFound",
                "noRunCommands",
                "firstRunFailed",
                "error",
            ],
            errorResponses: [
                { status: 400, code: "bad_request", message: "JSON body / callerModuleId / moduleIds invalid." },
                { status: 403, code: "caller_not_running", message: "callerModuleId is not a running module." },
                { status: 403, code: "forbidden", message: "Non-loopback client." },
                { status: 404, code: "not_found", message: "Unknown route." },
                { status: 500, code: "error", message: "Internal server error." },
            ],
        },
    ],
};

// Return the interop base URL from ASLM_MODULE_INTEROP_BASE_URL.
function _baseUrl() {
    const url = (process.env.ASLM_MODULE_INTEROP_BASE_URL || "").trim();
    if (!url) {
        throw new Error(
            "ASLM_MODULE_INTEROP_BASE_URL is not set. " +
            "Ensure moduleInterop.client.enabled is true in ASLM_Module.json " +
            "and that this module was launched by ASLM."
        );
    }
    return url.replace(/\/$/, "") + "/";
}

// Perform one HTTP request and capture metadata for the dashboard exchange log.
function _httpExchange(method, urlPath, body = null, timeout = 120000) {
    return new Promise((resolve, reject) => {
        const base = _baseUrl();
        const fullUrl = new URL(urlPath.replace(/^\//, ""), base).toString();
        const parsedUrl = new URL(fullUrl);

        const headers = {};
        let bodyData = null;
        if (body !== null) {
            bodyData = Buffer.from(JSON.stringify(body), "utf8");
            headers["Content-Type"] = "application/json; charset=utf-8";
            headers["Content-Length"] = String(bodyData.length);
        }

        const exchange = {
            method,
            url: fullUrl,
            requestHeaders: headers,
            requestBody: body,
            statusCode: null,
            responseBody: null,
        };

        const options = {
            hostname: parsedUrl.hostname,
            port: parseInt(parsedUrl.port, 10) || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers,
        };

        const req = http.request(options, (res) => {
            let raw = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => {
                exchange.statusCode = res.statusCode;
                let parsed = {};
                try {
                    parsed = raw ? JSON.parse(raw) : {};
                    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                        parsed = { value: parsed };
                    }
                } catch (_) {
                    parsed = { raw };
                }
                exchange.responseBody = parsed;

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve([parsed, exchange]);
                } else {
                    resolve([parsed, exchange]);
                }
            });
        });

        req.setTimeout(timeout, () => {
            req.destroy(new Error("Request timed out"));
        });

        req.on("error", (err) => {
            reject(err);
        });

        if (bodyData) req.write(bodyData);
        req.end();
    });
}

// Call GET /v1/registry and include exchange metadata.
async function getRegistryExchange() {
    return _httpExchange("GET", "v1/registry", null, 30000);
}

// Return the GET /v1/registry payload.
async function getRegistry() {
    const [data] = await getRegistryExchange();
    return data;
}

// Call POST /v1/modules/start and include exchange metadata.
async function requestStartExchange({ callerModuleId, moduleIds }) {
    const body = {
        callerModuleId,
        moduleIds: Array.from(moduleIds),
    };
    return _httpExchange("POST", "v1/modules/start", body, 120000);
}

// Return the POST /v1/modules/start payload.
async function requestStart({ callerModuleId, moduleIds }) {
    const [data] = await requestStartExchange({ callerModuleId, moduleIds });
    return data;
}

// Call GET /v1/ports and include exchange metadata.
async function getPortsExchange() {
    return _httpExchange("GET", "v1/ports", null, 30000);
}

// Return the GET /v1/ports payload.
async function getPorts() {
    const [data] = await getPortsExchange();
    return data;
}

// Return whether ASLM_MODULE_INTEROP_BASE_URL is set.
function isAvailable() {
    return Boolean((process.env.ASLM_MODULE_INTEROP_BASE_URL || "").trim());
}

module.exports = {
    INTEROP_API_SPEC,
    getRegistry,
    getRegistryExchange,
    getPorts,
    getPortsExchange,
    requestStart,
    requestStartExchange,
    isAvailable,
};
