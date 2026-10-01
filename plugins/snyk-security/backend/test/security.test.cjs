const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { ConfigReader } = require("@backstage/config");
const { createRouter, readSettings } = require("../index.cjs");
const {
  json,
  parseProject,
  parseIssues,
  loadSecurity,
  endpoint,
} = require("../client.cjs");
const orgId = "11111111-1111-4111-8111-111111111111",
  projectId = "22222222-2222-4222-8222-222222222222",
  targetId = "33333333-3333-4333-8333-333333333333";
const b = { orgId, projectId, targetId, orgSlug: "example" },
  settings = {
    apiBase: "https://api.snyk.io",
    webBase: "https://app.snyk.io",
    apiVersion: "2024-10-15",
    token: "test-only-credential",
  };
const project = () => ({
  data: {
    id: projectId,
    type: "project",
    attributes: {
      name: "payments-api",
      type: "npm",
      status: "active",
      target_reference: "main",
    },
    relationships: {
      organization: { data: { id: orgId } },
      target: { data: { id: targetId } },
    },
  },
});
const issue = () => ({
  id: "44444444-4444-4444-8444-444444444444",
  type: "issue",
  attributes: {
    title: "Example finding",
    effective_severity_level: "high",
    status: "open",
    ignored: false,
    type: "package_vulnerability",
  },
  relationships: {
    organization: { data: { id: orgId } },
    scan_item: { data: { id: projectId, type: "project" } },
  },
});
const entity = {
  kind: "Component",
  metadata: {
    name: "payments-api",
    namespace: "default",
    annotations: { "snyk-security.io/binding": "payments" },
  },
};
async function request(
  overrides = {},
  query = "component:default/payments-api"
) {
  let calls = 0;
  const services = {
    settings,
    bindings: new Map([
      ["component:default/payments-api", { key: "payments", projects: [b] }],
    ]),
    httpAuth: { credentials: async () => ({ principal: { type: "user" } }) },
    auth: { getPluginRequestToken: async () => ({ token: "catalog-test" }) },
    discovery: { getBaseUrl: async () => "https://catalog.example.com" },
    logger: { warn() {} },
    fetcher: async () => Response.json(entity),
    loader: async () => {
      calls++;
      return { projects: [] };
    },
    ...overrides,
  };
  const app = express();
  app.use(createRouter(services));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const r = await fetch(
      `http://127.0.0.1:${
        server.address().port
      }/summary?entity=${encodeURIComponent(query)}`
    );
    return { status: r.status, body: await r.json(), calls };
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("signed-in catalog reader can access an exact configured mapping", async () => {
  const r = await request();
  assert.equal(r.status, 200);
  assert.equal(r.calls, 1);
});
test("anonymous request denied before provider call", async () => {
  const r = await request({
    httpAuth: {
      credentials: async () => {
        const e = Error();
        e.name = "AuthenticationError";
        throw e;
      },
    },
  });
  assert.equal(r.status, 401);
  assert.equal(r.calls, 0);
});
test("catalog access denied and annotation mismatch fail closed", async () => {
  for (const fetcher of [
    async () => new Response("", { status: 403 }),
    async () =>
      Response.json({
        ...entity,
        metadata: {
          ...entity.metadata,
          annotations: { "snyk-security.io/binding": "other" },
        },
      }),
  ]) {
    const r = await request({ fetcher });
    assert.equal(r.status, 403);
    assert.equal(r.calls, 0);
  }
});
test("unmapped or injected entity cannot choose another project", async () => {
  for (const ref of [
    "component:default/other",
    "../../projects",
    "https://evil.example",
  ]) {
    const r = await request({}, ref);
    assert.ok([400, 403].includes(r.status));
    assert.equal(r.calls, 0);
  }
});
test("provider details and tokens never leave error handler", async () => {
  const r = await request({
    loader: async () => {
      throw Error(settings.token);
    },
  });
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.body).includes(settings.token));
});
test("project identity, organization and optional target are verified", () => {
  assert.equal(parseProject(project(), b, settings.webBase).status, "active");
  for (const field of ["id", "target", "org"]) {
    const x = project();
    if (field === "id") x.data.id = targetId;
    if (field === "target") x.data.relationships.target.data.id = orgId;
    if (field === "org") x.data.relationships.organization.data.id = targetId;
    assert.throws(() => parseProject(x, b, settings.webBase));
  }
});
test("issues validate relationship, severity and duplicate IDs", () => {
  assert.equal(parseIssues({ data: [issue()] }, b).issues.length, 1);
  for (const mutate of [
    (i) => (i.relationships.scan_item.data.id = orgId),
    (i) => (i.relationships.organization.data.id = targetId),
    (i) => (i.attributes.effective_severity_level = "unknown"),
    (i) => (i.attributes.ignored = null),
  ]) {
    const i = issue();
    mutate(i);
    assert.throws(() => parseIssues({ data: [i] }, b));
  }
  assert.throws(() => parseIssues({ data: [issue(), issue()] }, b));
});
test("provider status, oversized body and malformed JSON fail clearly", async () => {
  for (const status of [401, 403, 404, 429, 500])
    await assert.rejects(
      json(
        "https://api.snyk.io",
        settings.token,
        undefined,
        async () => new Response("", { status })
      )
    );
  await assert.rejects(
    json(
      "https://api.snyk.io",
      settings.token,
      undefined,
      async () => new Response("x".repeat(1000001))
    )
  );
  await assert.rejects(
    json(
      "https://api.snyk.io",
      settings.token,
      undefined,
      async () => new Response("{broken")
    )
  );
});
test("bounded API requests use exact filters and never follow pagination links", async () => {
  const calls = [];
  const result = await loadSecurity(settings, [b], async (url, opts) => {
    calls.push(String(url));
    assert.equal(opts.redirect, "error");
    assert.equal(opts.headers.Authorization, `token ${settings.token}`);
    return Response.json(
      calls.length === 1
        ? project()
        : { data: [issue()], links: { next: "https://evil.example/page" } }
    );
  });
  assert.equal(calls.length, 2);
  const u = new URL(calls[1]);
  assert.equal(u.searchParams.get("scan_item.id"), projectId);
  assert.equal(u.searchParams.get("status"), "open");
  assert.equal(result.projects[0].counts.high, 1);
  assert.equal(result.projects[0].partial, true);
  assert.ok(!JSON.stringify(result).includes(settings.token));
});
test("empty and ignored results are not invented findings", async () => {
  const i = issue();
  i.attributes.ignored = true;
  const result = await loadSecurity(settings, [b], async (u) =>
    Response.json(String(u).includes("/projects/") ? project() : { data: [i] })
  );
  assert.equal(result.projects[0].issues.length, 0);
  assert.equal(result.projects[0].partial, false);
});
test("configuration requires HTTPS origins and bounded explicit mappings", () => {
  for (const u of [
    "http://api.snyk.io",
    "https://user:pass@api.snyk.io",
    "https://api.snyk.io/rest",
    "https://api.snyk.io?token=abc",
  ])
    assert.throws(() => endpoint(u));
  const config = {
    snykSecurity: {
      apiBaseUrl: settings.apiBase,
      webBaseUrl: settings.webBase,
      token: settings.token,
      bindings: [
        {
          entityRef: "component:default/payments-api",
          bindingKey: "payments",
          projects: [b],
        },
      ],
    },
  };
  assert.equal(readSettings(new ConfigReader(config)).bindings.size, 1);
  config.snykSecurity.bindings.push(config.snykSecurity.bindings[0]);
  assert.throws(() => readSettings(new ConfigReader(config)));
});
