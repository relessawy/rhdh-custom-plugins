const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { ConfigReader } = require("@backstage/config");
const { createRouter, readSettings } = require("../index.cjs");
const {
  json,
  validateReport,
  loadSecurity,
  endpoint,
} = require("../client.cjs");
const settings = {
  base: "https://jenkins.example.com",
  publicBase: "https://jenkins.example.com",
  authorization: "test-only-credential",
};
const binding = {
  entityRef: "component:default/payments-api",
  key: "payments",
  job: "apps/payments/main",
  artifact: "evidence/security/report.json",
};
const report = () => ({
  schemaVersion: 1,
  entityRef: binding.entityRef,
  commit: "a".repeat(40),
  buildNumber: "7",
  observedAt: new Date().toISOString(),
  scans: ["code", "dependencies", "container"].map((kind) => ({
    schemaVersion: 1,
    entityRef: binding.entityRef,
    commit: "a".repeat(40),
    kind,
    status: "PASSED",
    threshold: "high",
    exitCode: 0,
    counts: {},
    findings: [],
    ...(kind === "container" ? { archiveSha256: "b".repeat(64) } : {}),
  })),
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
    bindings: new Map([["component:default/payments-api", binding]]),
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
      throw Error(settings.authorization);
    },
  });
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.body).includes(settings.authorization));
});
test("scan identities, unknown states, missing image and timestamps fail closed", () => {
  assert.equal(validateReport(report(), binding).gate, "PASSED");
  for (const change of [
    (r) => (r.entityRef = "component:default/other"),
    (r) => (r.scans[0].commit = "c".repeat(40)),
    (r) => (r.scans[0].status = "SUCCESS"),
    (r) => delete r.scans[2].archiveSha256,
    (r) => (r.observedAt = "invalid"),
    (r) => r.scans.pop(),
    (r) => (r.scans[0].exitCode = 2),
  ]) {
    const r = report();
    change(r);
    assert.throws(() => validateReport(r, binding));
  }
});
test("partial and blocked scans never become a passing policy", () => {
  for (const [status, gate] of [
    ["NOT_RUN", "INCOMPLETE"],
    ["BLOCKED", "BLOCKED"],
    ["ERROR", "ERROR"],
  ]) {
    const r = report();
    r.scans[0].status = status;
    if (status === "BLOCKED") r.scans[0].counts.high = 1;
    assert.equal(validateReport(r, binding).gate, gate);
  }
});
test("old evidence and oversized findings are labelled", () => {
  const r = report();
  r.observedAt = "2020-01-01T00:00:00Z";
  r.scans[0].counts.low = 201;
  r.scans[0].findings = Array.from({ length: 201 }, () => ({
    severity: "low",
    title: "x",
  }));
  const out = validateReport(r, binding);
  assert.equal(out.stale, true);
  assert.equal(out.scans[0].findings.length, 200);
  assert.equal(out.scans[0].truncated, true);
});
test("Jenkins build resolved once and report bound to metadata", async () => {
  const calls = [];
  const out = await loadSecurity(settings, binding, async (url, opts) => {
    calls.push(url);
    assert.equal(opts.redirect, "error");
    return Response.json(
      calls.length === 1
        ? {
            number: 7,
            building: false,
            result: "SUCCESS",
            actions: [{ lastBuiltRevision: { SHA1: "a".repeat(40) } }],
          }
        : report()
    );
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1], /\/7\/artifact\/evidence\/security\/report.json$/);
  assert.equal(out.buildNumber, "7");
  assert.ok(out.jenkinsUrl.endsWith("/7/"));
  for (const mutate of [
    (r) => (r.buildNumber = "6"),
    (r) => (r.commit = "c".repeat(40)),
  ]) {
    let n = 0;
    await assert.rejects(
      loadSecurity(settings, binding, async () => {
        const r = report();
        mutate(r);
        return Response.json(
          n++
            ? r
            : {
                number: 7,
                building: false,
                actions: [{ lastBuiltRevision: { SHA1: "a".repeat(40) } }],
              }
        );
      })
    );
  }
});
test("upstream failures, malformed JSON and oversized responses rejected", async () => {
  for (const r of [
    new Response("", { status: 403 }),
    new Response("{"),
    new Response("x".repeat(900001)),
  ])
    await assert.rejects(
      json(settings.base, settings.authorization, undefined, async () => r)
    );
});
test("mounted report source uses the same validation", async () => {
  const fs = require("node:fs/promises"),
    os = require("node:os"),
    path = require("node:path");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "security-"));
  try {
    const file = path.join(dir, "report.json");
    await fs.writeFile(file, JSON.stringify(report()));
    assert.equal(
      (await loadSecurity({}, { ...binding, file })).buildNumber,
      "7"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("configuration selects exactly one source and rejects unsafe paths", () => {
  const c = {
    snykSecurity: {
      jenkins: {
        baseUrl: settings.base,
        publicUrl: settings.publicBase,
        username: "reader",
        apiKey: "test",
      },
      bindings: [
        {
          entityRef: binding.entityRef,
          bindingKey: "payments",
          jobFullName: binding.job,
        },
      ],
    },
  };
  assert.equal(readSettings(new ConfigReader(c)).bindings.size, 1);
  c.snykSecurity.bindings[0].jobFullName = "../other";
  assert.throws(() => readSettings(new ConfigReader(c)));
  for (const url of [
    "https://user:pass@example.com",
    "https://example.com?token=x",
    "file:///tmp/report",
  ])
    assert.throws(() => endpoint(url));
});
