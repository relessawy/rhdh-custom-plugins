"use strict";
const {
  createBackendPlugin,
  coreServices,
} = require("@backstage/backend-plugin-api");
const express = require("express");
const { UUID, endpoint, loadSecurity } = require("./client.cjs");
const REF = /^component:([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/;
const messages = {
  access_denied:
    "Snyk API access denied. Check token permissions and API entitlement.",
  rate_limited: "Snyk API rate limit reached. Retry later.",
  not_found: "A configured Snyk project was not found.",
  invalid_response: "Snyk returned an invalid or oversized response.",
  unavailable: "Snyk data is unavailable. No successful scan is implied.",
};
function readSettings(config) {
  const c = config.getConfig("snykSecurity");
  const settings = {
    apiBase: endpoint(c.getString("apiBaseUrl")),
    webBase: endpoint(c.getString("webBaseUrl")),
    token: c.getString("token"),
    apiVersion: c.getOptionalString("apiVersion") || "2024-10-15",
  };
  if (
    !settings.token.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(settings.apiVersion)
  )
    throw Error("Invalid Snyk settings");
  const bindings = new Map();
  for (const b of c.getConfigArray("bindings")) {
    const ref = b.getString("entityRef"),
      key = b.getString("bindingKey");
    if (
      !REF.test(ref) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(key) ||
      bindings.has(ref)
    )
      throw Error("Invalid or duplicate Snyk binding");
    const projects = b
      .getConfigArray("projects")
      .map((p) => ({
        orgId: p.getString("orgId"),
        orgSlug: p.getString("orgSlug"),
        projectId: p.getString("projectId"),
        targetId: p.getOptionalString("targetId"),
      }));
    if (
      !projects.length ||
      projects.length > 5 ||
      new Set(projects.map((p) => p.orgId + "/" + p.projectId)).size !==
        projects.length ||
      projects.some(
        (p) =>
          !UUID.test(p.orgId) ||
          !UUID.test(p.projectId) ||
          (p.targetId && !UUID.test(p.targetId)) ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(p.orgSlug)
      )
    )
      throw Error("Invalid Snyk project mapping");
    bindings.set(ref, { key, projects });
  }
  return { settings, bindings };
}
function createRouter({
  settings,
  bindings,
  httpAuth,
  auth,
  discovery,
  logger,
  fetcher = fetch,
  loader = loadSecurity,
}) {
  const router = express.Router();
  router.get("/summary", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const credentials = await httpAuth.credentials(req, { allow: ["user"] });
      const ref = req.query.entity,
        m = typeof ref === "string" && ref.match(REF);
      if (!m)
        return res
          .status(400)
          .json({ error: "A valid component entity reference is required." });
      const binding = bindings.get(ref);
      if (!binding)
        return res
          .status(403)
          .json({ error: "No authorized Snyk mapping for this component." });
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: "catalog",
      });
      const cr = await fetcher(
        `${await discovery.getBaseUrl("catalog")}/entities/by-name/component/${
          m[1]
        }/${m[2]}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!cr.ok) {
        await cr.body?.cancel();
        return res.status(403).json({ error: "Catalog access denied." });
      }
      const entity = await cr.json();
      if (
        entity.kind?.toLowerCase() !== "component" ||
        entity.metadata?.name !== m[2] ||
        (entity.metadata?.namespace || "default") !== m[1] ||
        entity.metadata?.annotations?.["snyk-security.io/binding"] !==
          binding.key
      )
        return res
          .status(403)
          .json({ error: "Snyk binding does not match the catalog entity." });
      return res.json(await loader(settings, binding.projects));
    } catch (e) {
      if (e.name === "AuthenticationError")
        return res.status(401).json({ error: "RHDH sign-in required." });
      logger.warn("Snyk security data unavailable");
      return res
        .status(503)
        .json({ error: messages[e.code] || messages.unavailable });
    }
  });
  return router;
}
const plugin = createBackendPlugin({
  pluginId: "snyk-security",
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
      async init(services) {
        services.httpRouter.use(
          createRouter({ ...services, ...readSettings(services.config) })
        );
      },
    });
  },
});
module.exports = { default: plugin, readSettings, createRouter };
