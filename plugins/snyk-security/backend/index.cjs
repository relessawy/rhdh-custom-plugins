"use strict";
const {
  createBackendPlugin,
  coreServices,
} = require("@backstage/backend-plugin-api");
const express = require("express");
const { loadSecurity, endpoint, safePath } = require("./client.cjs");
const REF = /^component:([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/;
const messages = {};
function readSettings(config) {
  const c = config.getConfig("snykSecurity");
  const bindings = new Map();
  for (const b of c.getConfigArray("bindings")) {
    const ref = b.getString("entityRef"),
      key = b.getString("bindingKey");
    if (
      !REF.test(ref) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(key) ||
      bindings.has(ref)
    )
      throw Error("Invalid binding");
    const file = b.getOptionalString("reportFile"),
      job = b.getOptionalString("jobFullName");
    if (Boolean(file) === Boolean(job)) throw Error("Choose one report source");
    if (file && !require("node:path").isAbsolute(file))
      throw Error("Report path must be absolute");
    if (job) safePath(job);
    const artifact =
      b.getOptionalString("artifactPath") || "evidence/security/report.json";
    safePath(artifact);
    const annotationKey =
      b.getOptionalString("annotationKey") || "snyk-security.io/binding";
    if (!/^[a-z0-9.-]+\/[a-zA-Z0-9_.-]+$/.test(annotationKey))
      throw Error("Invalid annotation key");
    bindings.set(ref, {
      key,
      entityRef: ref,
      file,
      job,
      artifact,
      annotationKey,
    });
  }
  const j = c.getOptionalConfig("jenkins");
  let settings = {};
  if (j)
    settings = {
      base: endpoint(j.getString("baseUrl")),
      publicBase: endpoint(j.getString("publicUrl")),
      authorization:
        "Basic " +
        Buffer.from(
          j.getString("username") + ":" + j.getString("apiKey")
        ).toString("base64"),
    };
  if ([...bindings.values()].some((b) => b.job) && !j)
    throw Error("Jenkins configuration required");
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
        entity.metadata?.annotations?.[
          binding.annotationKey || "snyk-security.io/binding"
        ] !== binding.key
      )
        return res
          .status(403)
          .json({ error: "Snyk binding does not match the catalog entity." });
      return res.json(await loader(settings, binding));
    } catch (e) {
      if (e.name === "AuthenticationError")
        return res.status(401).json({ error: "RHDH sign-in required." });
      logger.warn("Snyk security data unavailable");
      return res
        .status(503)
        .json({
          error:
            "Security evidence unavailable. No successful scan is implied.",
        });
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
