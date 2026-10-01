"use strict";
const {
  createBackendPlugin,
  coreServices,
} = require("@backstage/backend-plugin-api");
const { randomUUID } = require("node:crypto");
const express = require("express");
function fault(status, message) {
  return Object.assign(Error(message), { status });
}
function binding(ref, bindings) {
  if (
    typeof ref !== "string" ||
    !/^component:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(ref)
  )
    return null;
  const found = bindings.find((b) => b.entity === ref);
  return found && /^[A-Z][A-Z0-9_]{1,30}$/.test(found.project) ? found : null;
}
function issueKey(key, project) {
  return (
    typeof key === "string" &&
    key.startsWith(project + "-") &&
    /^\d+$/.test(key.slice(project.length + 1))
  );
}
function normalize(data, project, site) {
  if (!Array.isArray(data.issues) || data.issues.length > 50)
    throw Error("Invalid Jira response");
  return data.issues.map((i) => {
    if (!issueKey(i.key, project) || typeof i.fields?.summary !== "string")
      throw Error("Unexpected issue");
    const f = i.fields;
    return {
      key: i.key,
      summary: f.summary.slice(0, 500),
      status: f.status?.name || "Unknown",
      category: f.status?.statusCategory?.key || "unknown",
      assignee: f.assignee?.displayName || "Unassigned",
      priority: f.priority?.name || "Unspecified",
      updated: f.updated || null,
      url: site + "/browse/" + i.key,
    };
  });
}
async function jiraRequest(url, authorization, body) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: authorization,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw fault(
      body && [400, 403, 404, 409].includes(r.status) ? 409 : 503,
      body
        ? "Jira rejected the transition. Refresh and check workflow permissions."
        : "Jira is unavailable. Check connection, permissions or token expiry."
    );
  if (r.status === 204) return null;
  let size = 0;
  const chunks = [];
  const reader = r.body.getReader();
  try {
    while (true) {
      const x = await reader.read();
      if (x.done) break;
      size += x.value.length;
      if (size > 1000000) throw Error("Oversized response");
      chunks.push(Buffer.from(x.value));
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function choices(raw, currentStatus) {
  if (!Array.isArray(raw.transitions) || raw.transitions.length > 100)
    throw Error("Invalid transitions");
  return raw.transitions
    .filter(
      (t) =>
        /^\d+$/.test(t.id) &&
        t.to?.name &&
        (t.to.id && currentStatus?.id
          ? t.to.id !== currentStatus.id
          : t.to.name !== currentStatus?.name) &&
        t.isAvailable !== false &&
        !Object.values(t.fields || {}).some(
          (f) => f.required && !f.hasDefaultValue
        )
    )
    .map((t) => ({ id: t.id, name: t.name, to: t.to?.name }));
}
const plugin = createBackendPlugin({
  pluginId: "jira-work-items",
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        auth: coreServices.auth,
        userInfo: coreServices.userInfo,
        database: coreServices.database,
        discovery: coreServices.discovery,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({
        httpRouter,
        httpAuth,
        auth,
        userInfo,
        database,
        discovery,
        config,
        logger,
      }) {
        const c = config.getConfig("jiraWorkItems"),
          site = c.getString("siteUrl").replace(/\/$/, ""),
          cloud = c.getString("cloudId");
        if (
          !/^https:\/\/[a-z0-9-]+\.atlassian\.net$/.test(site) ||
          !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(cloud)
        )
          throw Error("Invalid Jira tenant");
        const bindings = c
          .getConfigArray("bindings")
          .map((x) => ({
            entity: x.getString("entity"),
            project: x.getString("project"),
          }));
        const writers = c.getOptionalStringArray("transitionGroups") || [],
          authorization =
            "Basic " +
            Buffer.from(
              c.getString("email") + ":" + c.getString("apiToken")
            ).toString("base64"),
          api = `https://api.atlassian.com/ex/jira/${cloud}/rest/api/3`;
        const db = await database.getClient();
        if (!(await db.schema.hasTable("jira_transition_audit")))
          await db.schema.createTable("jira_transition_audit", (t) => {
            t.string("id", 36).primary();
            for (const k of [
              "actor",
              "entity",
              "issue",
              "transition",
              "before_status",
              "after_status",
              "outcome",
              "recorded_at",
            ])
              t.text(k);
          });
        const busy = new Set(),
          router = express.Router();
        router.use(express.json({ limit: "4kb" }));
        async function access(req, fields, write = false) {
          const credentials = await httpAuth.credentials(req, {
            allow: ["user"],
          });
          if (
            Object.keys(fields).some(
              (k) =>
                ![
                  "entity",
                  "issue",
                  "transition",
                  "expectedStatus",
                  "expectedUpdated",
                ].includes(k)
            )
          )
            throw fault(400, "Unsupported input");
          const b = binding(fields.entity, bindings);
          if (!b) throw fault(403, "Jira binding not authorized");
          const [, namespace, name] = b.entity.match(
              /^component:([^/]+)\/(.+)$/
            ),
            { token } = await auth.getPluginRequestToken({
              onBehalfOf: credentials,
              targetPluginId: "catalog",
            });
          const cr = await fetch(
            `${await discovery.getBaseUrl(
              "catalog"
            )}/entities/by-name/component/${namespace}/${name}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              redirect: "error",
              signal: AbortSignal.timeout(10000),
            }
          );
          if (!cr.ok) throw fault(403, "Application not authorized");
          const catalogEntity = await cr.json();
          if (
            catalogEntity.kind?.toLowerCase() !== "component" ||
            catalogEntity.metadata?.name !== name ||
            (catalogEntity.metadata?.namespace || "default") !== namespace
          )
            throw fault(403, "Application not authorized");
          const info = await userInfo.getUserInfo(credentials),
            canTransition = (info.ownershipEntityRefs || []).some((x) =>
              writers.includes(x)
            );
          if (write && !canTransition)
            throw fault(
              403,
              "You do not have permission to change Jira status."
            );
          if (fields.issue !== undefined && !issueKey(fields.issue, b.project))
            throw fault(403, "Issue outside configured project");
          return { ...b, actor: info.userEntityRef, canTransition };
        }
        const handle = (fn) => async (req, res) => {
          res.set("Cache-Control", "no-store");
          try {
            await fn(req, res);
          } catch (e) {
            logger.warn("Jira operation failed");
            res
              .status(
                e.status || (e.name === "AuthenticationError" ? 401 : 503)
              )
              .json({
                error: e.status
                  ? e.message
                  : "Jira is unavailable. Refresh before retrying.",
              });
          }
        };
        router.get(
          "/issues",
          handle(async (req, res) => {
            if (Object.keys(req.query).some((k) => k !== "entity"))
              throw fault(400, "Unsupported query");
            const b = await access(req, req.query);
            const q = new URLSearchParams({
                jql: `project = "${b.project}" ORDER BY updated DESC`,
                maxResults: "50",
                fields: "summary,status,assignee,priority,updated",
              }),
              raw = await jiraRequest(`${api}/search/jql?${q}`, authorization);
            res.json({
              project: b.project,
              canTransition: b.canTransition,
              issues: normalize(raw, b.project, site),
              more: raw.isLast === false || !!raw.nextPageToken,
              observedAt: new Date().toISOString(),
            });
          })
        );
        async function current(key) {
          const d = await jiraRequest(
            `${api}/issue/${key}?fields=status,updated,project`,
            authorization
          );
          if (!d.fields?.status?.id || !d.fields?.updated)
            throw Error("Invalid issue");
          return d;
        }
        router.get(
          "/transitions",
          handle(async (req, res) => {
            if (
              Object.keys(req.query).some(
                (k) => !["entity", "issue"].includes(k)
              )
            )
              throw fault(400, "Unsupported query");
            const b = await access(req, req.query, true);
            if (!issueKey(req.query.issue, b.project))
              throw fault(400, "Issue required");
            const i = await current(req.query.issue);
            if (i.fields.project?.key !== b.project)
              throw fault(403, "Issue outside configured project");
            const raw = await jiraRequest(
              `${api}/issue/${req.query.issue}/transitions?expand=transitions.fields`,
              authorization
            );
            res.json({
              status: i.fields.status.name,
              expectedStatus: i.fields.status.id,
              expectedUpdated: i.fields.updated,
              transitions: choices(raw, i.fields.status),
            });
          })
        );
        router.post(
          "/transitions",
          handle(async (req, res) => {
            if (
              !/^Bearer .+/i.test(req.headers.authorization || "") ||
              !req.is("application/json")
            )
              throw fault(401, "Authenticated JSON request required");
            if (Object.keys(req.query).length)
              throw fault(400, "Unsupported query");
            const f = req.body || {},
              b = await access(req, f, true);
            if (
              !issueKey(f.issue, b.project) ||
              typeof f.transition !== "string" ||
              !/^\d+$/.test(f.transition) ||
              typeof f.expectedStatus !== "string" ||
              typeof f.expectedUpdated !== "string"
            )
              throw fault(400, "Invalid transition request");
            if (busy.has(f.issue))
              throw fault(
                409,
                "A change is already in progress. Refresh before retrying."
              );
            busy.add(f.issue);
            let id,
              attempted = false;
            try {
              const i = await current(f.issue);
              if (i.fields.project?.key !== b.project)
                throw fault(403, "Issue outside configured project");
              if (
                i.fields.status.id !== f.expectedStatus ||
                i.fields.updated !== f.expectedUpdated
              )
                throw fault(
                  409,
                  "Issue changed since you opened the action. Refresh and choose again."
                );
              const available = choices(
                await jiraRequest(
                  `${api}/issue/${f.issue}/transitions?expand=transitions.fields`,
                  authorization
                ),
                i.fields.status
              );
              if (!available.some((t) => t.id === f.transition))
                throw fault(
                  409,
                  "Transition is no longer available or requires fields. Open Jira for that workflow."
                );
              id = randomUUID();
              await db("jira_transition_audit").insert({
                id,
                actor: b.actor,
                entity: b.entity,
                issue: f.issue,
                transition: f.transition,
                before_status: i.fields.status.name,
                outcome: "INTENT",
                recorded_at: new Date().toISOString(),
              });
              attempted = true;
              await jiraRequest(
                `${api}/issue/${f.issue}/transitions`,
                authorization,
                {
                  transition: { id: f.transition },
                  historyMetadata: {
                    type: "rhdh-custom-plugins.jira",
                    description:
                      "Status changed from Developer Hub using the shared integration account",
                    extraData: {
                      rhdhUser: b.actor,
                      rhdhEntity: b.entity,
                      requestId: id,
                    },
                  },
                }
              );
              const after = await current(f.issue);
              await db("jira_transition_audit")
                .where({ id })
                .update({
                  outcome: "SUCCEEDED",
                  after_status: after.fields.status.name,
                });
              res.json({
                status: after.fields.status.name,
                requestId: id,
                actor: b.actor,
                attribution:
                  "Jira records the shared integration account. RHDH audit records the initiating portal user.",
              });
            } catch (e) {
              if (id)
                await db("jira_transition_audit")
                  .where({ id })
                  .update({
                    outcome:
                      e.status === 409
                        ? "REJECTED"
                        : attempted
                        ? "UNKNOWN"
                        : "NOT_SENT",
                  })
                  .catch(() => {});
              if (attempted && e.status !== 409)
                throw fault(
                  503,
                  "Outcome uncertain. Refresh the issue before any retry; no automatic retry was made."
                );
              throw e;
            } finally {
              busy.delete(f.issue);
            }
          })
        );
        httpRouter.use(router);
      },
    });
  },
});
module.exports = { default: plugin, binding, normalize, choices };
