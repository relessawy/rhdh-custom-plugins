"use strict";
const {
  createBackendPlugin,
  coreServices,
} = require("@backstage/backend-plugin-api");
const express = require("express");
const fs = require("node:fs/promises");
const { sanitizeReport } = require("./report.cjs");
const plugin = createBackendPlugin({
  pluginId: "vault-health",
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        config: coreServices.rootConfig,
      },
      async init({ httpRouter, httpAuth, auth, discovery, config }) {
        const bindings = new Map(
          config
            .getConfigArray("vaultHealth.bindings")
            .map((b) => [
              b.getString("entityRef"),
              {
                key: b.getString("bindingKey"),
                file: b.getString("reportFile"),
              },
            ])
        );
        const router = express.Router();
        router.get("/vault", async (req, res) => {
          try {
            const credentials = await httpAuth.credentials(req, {
              allow: ["user"],
            });
            const ref = req.query.entity;
            if (typeof ref !== "string" || !bindings.has(ref)) {
              res.status(403).json({ error: "Application not authorized" });
              return;
            }
            const parts = ref.match(
              /^component:([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/
            );
            if (!parts || Object.keys(req.query).some((k) => k !== "entity")) {
              res.status(400).end();
              return;
            }
            const { token } = await auth.getPluginRequestToken({
              onBehalfOf: credentials,
              targetPluginId: "catalog",
            });
            const r = await fetch(
              `${await discovery.getBaseUrl(
                "catalog"
              )}/entities/by-name/component/${parts[1]}/${parts[2]}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              }
            );
            if (!r.ok) {
              res.status(403).end();
              return;
            }
            const entity = await r.json(),
              binding = bindings.get(ref);
            if (
              entity.kind?.toLowerCase() !== "component" ||
              entity.metadata?.name !== parts[2] ||
              (entity.metadata.namespace || "default") !== parts[1] ||
              entity.metadata?.annotations?.[
                "vault-health.io/vault-binding"
              ] !== binding.key
            ) {
              res.status(403).end();
              return;
            }
            const handle = await fs.open(binding.file, "r");
            let raw;
            try {
              if ((await handle.stat()).size > 32768)
                throw Error("Oversized report");
              raw = await handle.readFile("utf8");
            } finally {
              await handle.close();
            }
            res
              .set("Cache-Control", "no-store")
              .json(sanitizeReport(JSON.parse(raw), ref));
          } catch (e) {
            res
              .status(e?.name === "AuthenticationError" ? 401 : 503)
              .json({ error: "Vault integration evidence unavailable" });
          }
        });
        httpRouter.use(router);
      },
    });
  },
});
module.exports.default = plugin;
