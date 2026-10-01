"use strict";
const {
  createBackendPlugin,
  coreServices,
} = require("@backstage/backend-plugin-api");
const express = require("express");
const https = require("node:https");
const fs = require("node:fs");
const WINDOWS = {
  "5m": "-5m",
  "15m": "-15m",
  "1h": "-1h",
  "6h": "-6h",
  "24h": "-24h",
  "7d": "-7d",
};
function safe(s) {
  if (typeof s !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(s))
    throw new Error("Invalid configured Splunk scope");
  return s;
}
function search(url, ca, serverName, query, authorization) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      search: query,
      exec_mode: "oneshot",
      output_mode: "json",
      count: "100",
    }).toString();
    const req = https.request(
      new URL("/services/search/jobs", url),
      {
        method: "POST",
        ca,
        servername: serverName,
        timeout: 15000,
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let chunks = [],
          size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > 1024 * 1024) {
            req.destroy(new Error("Response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          try {
            if (res.statusCode !== 200)
              throw new Error("Splunk query unavailable");
            const parsed = JSON.parse(Buffer.concat(chunks).toString());
            if (
              !Array.isArray(parsed.results) ||
              parsed.results.length > 100 ||
              (parsed.messages || []).some((m) =>
                ["ERROR", "FATAL"].includes(m.type)
              )
            )
              throw Error("Invalid search result");
            resolve(parsed.results);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Splunk timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
const plugin = createBackendPlugin({
  pluginId: "splunk-logs",
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({ httpRouter, httpAuth, auth, discovery, config, logger }) {
        const endpoint = config.getString("splunkLogs.baseUrl");
        const u = new URL(endpoint);
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.search ||
          u.hash ||
          u.pathname !== "/"
        )
          throw new Error("Splunk requires an HTTPS origin");
        const caFile = config.getOptionalString("splunkLogs.caFile");
        const ca = caFile ? fs.readFileSync(caFile) : undefined;
        const serverName = config.getOptionalString("splunkLogs.serverName");
        const apiToken = config.getOptionalString("splunkLogs.apiToken");
        const authorization = apiToken ? "Bearer " + apiToken : undefined;
        const bindings = new Map(
          config.getConfigArray("splunkLogs.bindings").map((b) => [
            b.getString("entityRef"),
            {
              annotationKey:
                b.getOptionalString("annotationKey") ||
                "splunk-logs.io/binding",
              binding: safe(b.getString("binding")),
              service: safe(b.getString("service")),
              environment: safe(b.getString("environment")),
              index: safe(b.getString("index")),
            },
          ])
        );
        const router = express.Router();
        let active = 0;
        router.get("/summary", async (req, res) => {
          try {
            const credentials = await httpAuth.credentials(req, {
              allow: ["user"],
            });
            const ref = req.query.entity;
            const window = req.query.window || "15m";
            if (typeof ref !== "string" || !bindings.has(ref)) {
              res.status(403).json({ error: "Application not authorized" });
              return;
            }
            if (
              typeof window !== "string" ||
              !Object.hasOwn(WINDOWS, window) ||
              Object.keys(req.query).some(
                (k) => !["entity", "window"].includes(k)
              )
            ) {
              res.status(400).json({ error: "Unsupported time window" });
              return;
            }
            const parts = ref.match(
              /^(component):([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/
            );
            if (!parts) {
              res.status(400).end();
              return;
            }
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: credentials,
              targetPluginId: "catalog",
            });
            const catalog = await fetch(
              `${await discovery.getBaseUrl("catalog")}/entities/by-name/${
                parts[1]
              }/${parts[2]}/${parts[3]}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              }
            );
            if (!catalog.ok) {
              res.status(403).json({ error: "Application not authorized" });
              return;
            }
            const entity = await catalog.json(),
              scope = bindings.get(ref);
            if (
              entity.kind?.toLowerCase() !== "component" ||
              entity.metadata?.name !== parts[3] ||
              (entity.metadata?.namespace || "default") !== parts[2] ||
              entity.metadata?.annotations?.[scope.annotationKey] !==
                scope.binding
            ) {
              res
                .status(403)
                .json({ error: "Application binding not authorized" });
              return;
            }
            if (active >= 4) {
              res.status(429).json({ error: "Try again shortly" });
              return;
            }
            active++;
            try {
              const base = `search index="${scope.index}" service="${scope.service}" environment="${scope.environment}" event_type="http_request_completed" earliest=${WINDOWS[window]} latest=now`;
              const counts = await search(
                endpoint,
                ca,
                serverName,
                base +
                  " | dedup request_id | stats count as requests count(eval(status>=500 AND status<600)) as errors",
                authorization
              );
              const recent = await search(
                endpoint,
                ca,
                serverName,
                base +
                  " status>=500 status<600 | dedup request_id | sort - _time | head 20 | table _time service status request_id",
                authorization
              );
              if (
                counts.length > 1 ||
                (counts.length &&
                  (!Object.hasOwn(counts[0], "requests") ||
                    !Object.hasOwn(counts[0], "errors")))
              )
                throw Error("Invalid counts");
              const requests = Number(counts[0]?.requests ?? 0),
                errors = Number(counts[0]?.errors ?? 0);
              if (
                !Number.isSafeInteger(requests) ||
                !Number.isSafeInteger(errors) ||
                requests < 0 ||
                errors < 0 ||
                errors > requests ||
                recent.some(
                  (x) =>
                    !Number.isFinite(Date.parse(x._time)) ||
                    !Number.isInteger(Number(x.status)) ||
                    Number(x.status) < 500 ||
                    Number(x.status) > 599 ||
                    typeof x.request_id !== "string"
                )
              )
                throw Error("Invalid metrics");
              res.set("Cache-Control", "no-store").json({
                requests,
                errors,
                errorRate: requests
                  ? Math.round((errors / requests) * 10000) / 100
                  : 0,
                environment: scope.environment,
                observedAt: new Date().toISOString(),
                recentErrors: recent.slice(0, 20).map((x) => ({
                  time: x._time,
                  service: String(x.service || "").slice(0, 128),
                  status: Number(x.status),
                  requestId: x.request_id.slice(0, 200),
                })),
              });
            } finally {
              active--;
            }
          } catch (e) {
            logger.warn("Splunk summary request failed");
            res
              .status(e.name === "AuthenticationError" ? 401 : 503)
              .json({ error: "Splunk data unavailable" });
          }
        });
        httpRouter.use(router);
      },
    });
  },
});
module.exports = { default: plugin };
