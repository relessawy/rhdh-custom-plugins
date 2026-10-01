const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");

async function harness(options = {}) {
  let handler, initialized;
  const searches = [];
  const scope = {
    entityRef: "component:default/payments-api",
    binding: "payments-api-demo",
    service: "payments-api",
    environment: "demo",
    index: "applications",
  };
  const config = {
    getString: (k) =>
      ({
        "splunkLogs.baseUrl": "https://splunk.internal:8089",
        "splunkLogs.caFile": "test-ca",
        "splunkLogs.serverName": "SplunkServerDefaultCert",
      }[k]),
    getOptionalString: (k) =>
      ({
        "splunkLogs.caFile": "test-ca",
        "splunkLogs.serverName": "SplunkServerDefaultCert",
      }[k]),
    getConfigArray: () => [
      { getString: (k) => scope[k], getOptionalString: () => undefined },
    ],
  };
  const router = { get: (path, fn) => (handler = fn) };
  const coreServices = Object.fromEntries(
    ["httpRouter", "httpAuth", "auth", "discovery", "rootConfig", "logger"].map(
      (k) => [k, k]
    )
  );
  const services = {
    config,
    logger: { warn: () => {} },
    httpRouter: { use: () => {} },
    httpAuth: {
      credentials: async (req) => {
        if (!req.authenticated) {
          const e = new Error("no session");
          e.name = "AuthenticationError";
          throw e;
        }
        return { principal: { type: "user" } };
      },
    },
    auth: { getPluginRequestToken: async () => ({ token: "test-only" }) },
    discovery: { getBaseUrl: async () => "https://catalog.internal" },
  };
  const https = {
    request: (url, settings, callback) => {
      const req = new EventEmitter();
      req.destroy = (e) => req.emit("error", e);
      req.end = (body) => {
        searches.push(new URLSearchParams(body).get("search"));
        queueMicrotask(() => {
          const response = new EventEmitter();
          response.statusCode = options.unavailable ? 503 : 200;
          callback(response);
          response.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                results:
                  searches.length === 1
                    ? [{ requests: "3", errors: "1" }]
                    : [
                        {
                          _time: "2026-10-01T00:00:00Z",
                          service: "payments-api",
                          status: options.invalidStatus ? "invalid" : "500",
                          request_id: "123",
                        },
                      ],
              })
            )
          );
          response.emit("end");
        });
      };
      return req;
    },
  };
  const context = {
    module: { exports: {} },
    Buffer,
    URL,
    URLSearchParams,
    AbortSignal,
    fetch: async () => ({
      ok: options.catalogDenied !== true,
      json: async () => ({
        kind: "Component",
        metadata: {
          name: "payments-api",
          namespace: "default",
          annotations: {
            "splunk-logs.io/binding": options.binding || scope.binding,
          },
        },
      }),
    }),
    require: (name) => {
      if (name === "@backstage/backend-plugin-api")
        return {
          coreServices,
          createBackendPlugin: (definition) => {
            definition.register({
              registerInit: (args) => {
                initialized = args.init(services);
              },
            });
            return definition;
          },
        };
      if (name === "express") return { Router: () => router };
      if (name === "node:fs")
        return { readFileSync: () => Buffer.from("test CA") };
      if (name === "node:https") return https;
      throw new Error("Unexpected module " + name);
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../index.cjs"), "utf8"),
    context
  );
  await initialized;
  async function request(
    query = { entity: scope.entityRef },
    authenticated = true
  ) {
    const result = { status: 200 };
    const response = {
      status: (n) => {
        result.status = n;
        return response;
      },
      json: (x) => {
        result.body = x;
        return response;
      },
      set: () => response,
      end: () => response,
    };
    await handler({ query, authenticated }, response);
    return result;
  }
  return { request, searches };
}

test("Anonymous callers cannot cause a Splunk request", async () => {
  const h = await harness();
  assert.equal((await h.request(undefined, false)).status, 401);
  assert.equal(h.searches.length, 0);
});
test("Unknown bindings and injected entity references fail closed", async () => {
  const h = await harness();
  for (const entity of [
    "component:default/other",
    "component:default/payments-api | search index=*",
  ])
    assert.equal((await h.request({ entity })).status, 403);
  assert.equal(h.searches.length, 0);
});
test("Catalog denial or changed annotation cannot widen access", async () => {
  for (const options of [{ catalogDenied: true }, { binding: "other-app" }]) {
    const h = await harness(options);
    assert.equal((await h.request()).status, 403);
    assert.equal(h.searches.length, 0);
  }
});
test("Only bounded time windows are accepted", async () => {
  const h = await harness();
  assert.equal(
    (
      await h.request({
        entity: "component:default/payments-api",
        window: "-1y",
      })
    ).status,
    400
  );
  assert.equal(h.searches.length, 0);
});
test("Fixed queries deduplicate retry events and return the real summary", async () => {
  const h = await harness();
  const r = await h.request();
  assert.equal(r.status, 200);
  assert.equal(r.body.requests, 3);
  assert.equal(r.body.errors, 1);
  assert.equal(r.body.errorRate, 33.33);
  assert.equal(r.body.recentErrors.length, 1);
  assert(
    h.searches.every(
      (s) =>
        s.includes("dedup request_id") &&
        s.includes('index="applications"') &&
        s.includes("earliest=-15m")
    )
  );
});
test("Unavailable Splunk returns failure rather than a misleading zero", async () => {
  const h = await harness({ unavailable: true });
  const r = await h.request();
  assert.equal(r.status, 503);
  assert.equal(r.body.requests, undefined);
});

test("Every extended window uses a fixed bounded search", async () => {
  for (const window of ["6h", "24h", "7d"]) {
    const h = await harness();
    assert.equal(
      (await h.request({ entity: "component:default/payments-api", window }))
        .status,
      200
    );
    assert(
      h.searches.every((s) => s.includes("earliest=-" + window + " latest=now"))
    );
  }
});

test("malformed upstream status is rejected", async () => {
  const h = await harness({ invalidStatus: true });
  const res = await h.request();
  assert.equal(res.status, 503);
});
