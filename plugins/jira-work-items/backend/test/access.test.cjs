const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs");
async function run(o = {}) {
  let init,
    reads = 0,
    writes = 0;
  const routes = {},
    audit = [],
    entity = "component:default/payments-api";
  const db = () => ({
    insert: async (x) => {
      if (o.auditFailure) throw Error("DB unavailable");
      audit.push(x);
    },
    where: () => ({ update: async (x) => Object.assign(audit.at(-1), x) }),
  });
  db.schema = { hasTable: async () => true };
  const services = {
    database: { getClient: async () => db },
    userInfo: {
      getUserInfo: async () => ({
        userEntityRef: "user:default/alice",
        ownershipEntityRefs: o.reader ? [] : ["group:default/developers"],
      }),
    },
    config: {
      getConfig: () => ({
        getOptionalStringArray: () => ["group:default/developers"],
        getConfigArray: () => [
          { getString: (k) => ({ entity, project: "PAY" }[k]) },
        ],
        getString: (k) =>
          ({
            siteUrl: "https://example.atlassian.net",
            cloudId: "11111111-1111-4111-8111-111111111111",
            email: "demo@example.com",
            apiToken: "secret",
          }[k]),
      }),
    },
    logger: { warn() {} },
    httpRouter: { use() {} },
    httpAuth: {
      credentials: async () => {
        if (o.anonymous) {
          const e = Error();
          e.name = "AuthenticationError";
          throw e;
        }
        return {};
      },
    },
    auth: { getPluginRequestToken: async () => ({ token: "catalog-token" }) },
    discovery: { getBaseUrl: async () => "http://catalog" },
  };
  const response = (data) => ({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(c) {
        c.enqueue(Buffer.from(JSON.stringify(data)));
        c.close();
      },
    }),
  });
  const context = {
    Buffer,
    AbortSignal,
    URLSearchParams,
    Date,
    Set,
    module: { exports: {} },
    fetch: async (url, options) => {
      if (url.startsWith("http://catalog"))
        return {
          ok: !o.denied,
          json: async () => ({
            kind: "Component",
            metadata: { name: "payments-api", namespace: "default" },
          }),
        };
      reads++;
      if (options.method === "POST") {
        writes++;
        if (o.unknown) throw Error("timeout");
        if (o.reject) return { ok: false, status: 400 };
        assert.equal(options.body.includes("user:default/alice"), true);
        return { ok: true, status: 204 };
      }
      if (o.unavailable) return { ok: false, status: 503 };
      if (url.includes("/transitions"))
        return response({
          transitions: [
            {
              id: "21",
              name: "In Progress",
              to: {
                id: o.self ? "10004" : "10005",
                name: o.self ? "To Do" : "In Progress",
              },
              fields: o.required ? { resolution: { required: true } } : {},
            },
          ],
        });
      if (url.includes("/issue/"))
        return response({
          fields: {
            project: { key: "PAY" },
            status: { id: "10004", name: writes ? "In Progress" : "To Do" },
            updated: o.stale ? "new" : "original",
          },
        });
      const data = o.malformed
        ? {}
        : {
            issues: [
              {
                key: o.foreign ? "OTHER-1" : "PAY-1",
                fields: {
                  summary: "Demo issue",
                  status: {
                    name: o.done ? "Done" : "To Do",
                    statusCategory: { key: o.done ? "done" : "new" },
                  },
                },
              },
            ],
          };
      return response(data);
    },
    require: (n) => {
      if (n === "express")
        return {
          json: () => () => {},
          Router: () => ({
            use() {},
            get: (p, h) => (routes["GET " + p] = h),
            post: (p, h) => (routes["POST " + p] = h),
          }),
        };
      if (n === "node:crypto") return { randomUUID: () => "audit-1" };
      if (n === "@backstage/backend-plugin-api")
        return {
          coreServices: {},
          createBackendPlugin: (d) => {
            d.register({ registerInit: (a) => (init = a.init(services)) });
            return d;
          },
        };
      throw Error(n);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../index.cjs"), "utf8"),
    context
  );
  await init;
  const out = { status: 200 };
  const res = {
    status: (n) => {
      out.status = n;
      return res;
    },
    json: (v) => {
      out.body = v;
      return res;
    },
    set: () => res,
  };
  const write = o.write,
    route = write
      ? "POST /transitions"
      : o.transitions
      ? "GET /transitions"
      : "GET /issues";
  const fields = {
    entity: o.entity || entity,
    ...(o.extra ? { jql: "project=OTHER" } : {}),
  };
  const req = {
    headers: { authorization: o.noBearer ? "" : "Bearer portal" },
    is: () => true,
    query: write
      ? {}
      : { ...fields, ...(o.transitions ? { issue: o.issue || "PAY-1" } : {}) },
    body: {
      ...fields,
      issue: o.issue || "PAY-1",
      transition: o.transition || "21",
      expectedStatus: "10004",
      expectedUpdated: "original",
    },
  };
  await routes[route](req, res);
  return { ...out, reads, writes, audit };
}
test("Authentication and catalog denial precede Jira reads and writes", async () => {
  for (const write of [false, true])
    for (const o of [{ anonymous: true }, { denied: true }]) {
      const r = await run({ ...o, write });
      assert.equal(r.status, o.anonymous ? 401 : 403);
      assert.equal(r.reads, 0);
    }
});
test("Unbound entities and query injection are rejected", async () => {
  for (const o of [
    { entity: "component:default/other" },
    { entity: "../../admin" },
    { extra: true },
  ]) {
    const r = await run(o);
    assert.ok([400, 403].includes(r.status));
    assert.equal(r.reads, 0);
  }
});
test("Completed states remain visible; readers cannot change status", async () => {
  assert.equal((await run({ done: true })).body.issues[0].status, "Done");
  assert.equal((await run({ reader: true })).body.canTransition, false);
  for (const o of [{ write: true }, { transitions: true }]) {
    const r = await run({ ...o, reader: true });
    assert.equal(r.status, 403);
    assert.equal(r.writes, 0);
  }
});
test("Unavailable malformed and foreign results are errors", async () => {
  for (const o of [
    { unavailable: true },
    { malformed: true },
    { foreign: true },
  ])
    assert.equal((await run(o)).status, 503);
});
test("Cross project, missing bearer, stale and unavailable transitions cannot write", async () => {
  for (const o of [
    { issue: "OTHER-1" },
    { issue: "PAY-1/../../admin" },
    { noBearer: true },
    { stale: true },
    { transition: "99" },
    { required: true },
    { self: true },
  ]) {
    const r = await run({ ...o, write: true });
    assert.ok([400, 401, 403, 409].includes(r.status));
    assert.equal(r.writes, 0);
  }
});
test("Successful change audits the authenticated actor and verifies resulting status", async () => {
  const r = await run({ write: true });
  assert.equal(r.status, 200);
  assert.equal(r.writes, 1);
  assert.equal(r.body.status, "In Progress");
  assert.equal(r.audit[0].actor, "user:default/alice");
  assert.equal(r.audit[0].outcome, "SUCCEEDED");
});
test("No mutation without durable intent; uncertain write is never retried", async () => {
  let r = await run({ write: true, auditFailure: true });
  assert.equal(r.writes, 0);
  assert.equal(r.status, 503);
  r = await run({ write: true, unknown: true });
  assert.equal(r.writes, 1);
  assert.equal(r.audit[0].outcome, "UNKNOWN");
  assert.match(r.body.error, /uncertain/);
});
test("Jira rejected transition is explicitly recorded", async () => {
  const r = await run({ write: true, reject: true });
  assert.equal(r.status, 409);
  assert.equal(r.audit[0].outcome, "REJECTED");
  assert.equal(r.writes, 1);
});

test("Workflow options are dynamic and exclude the current destination status", async () => {
  const source = fs.readFileSync(require.resolve("../index.cjs"), "utf8");
  const fn = source.slice(
    source.indexOf("function choices("),
    source.search(/const plugin\s*=/)
  );
  const ctx = {};
  vm.runInNewContext(fn, ctx);
  const raw = {
    transitions: [
      { id: "11", name: "Reset", to: { id: "1", name: "To Do" } },
      { id: "21", name: "Continue", to: { id: "2", name: "In Progress" } },
      { id: "31", name: "Revoke approval", to: { id: "3", name: "Revoked" } },
      {
        id: "41",
        name: "Complete",
        to: { id: "4", name: "Done" },
        fields: { resolution: { required: true } },
      },
    ],
  };
  assert.deepEqual(
    Array.from(ctx.choices(raw, { id: "2", name: "In Progress" }), (x) => x.to),
    ["To Do", "Revoked"]
  );
  assert.deepEqual(
    Array.from(ctx.choices(raw, { id: "1", name: "To Do" }), (x) => x.to),
    ["In Progress", "Revoked"]
  );
});
