const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  CommonJSModuleLoader,
} = require("@backstage/backend-dynamic-feature-service");
const { ConfigReader } = require("@backstage/config");
const express = require("express");
(async () => {
  const root = process.cwd(),
    name = process.argv[2];
  assert.ok(["jenkins-stage-progress", "snyk-security"].includes(name));
  const version = require(path.join(
    root,
    "plugins",
    name,
    "backend/package.json"
  )).version;
  const temp = fs.mkdtempSync(path.join(root, "artifacts", ".load-"));
  try {
    execFileSync("tar", [
      "-xzf",
      path.join(
        root,
        "artifacts",
        name,
        version,
        `${name}-backend-${version}.tgz`
      ),
      "-C",
      temp,
    ]);
    const pkgDir = path.join(temp, "package"),
      manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json")));
    assert.equal(
      manifest.peerDependencies["@backstage/backend-plugin-api"],
      "1.8.0"
    );
    assert.equal(manifest.backstage.role, "backend-plugin");
    assert.equal(manifest.dependencies, undefined);
    assert.ok(!fs.existsSync(path.join(pkgDir, "node_modules")));
    const logger = { info() {}, debug() {}, warn() {}, error() {} };
    const loader = new CommonJSModuleLoader({ logger });
    await loader.bootstrap(root, [pkgDir], new Map([[pkgDir, manifest]]));
    const mod = await loader.load(path.join(pkgDir, manifest.main));
    assert.equal(mod.default.$$type, "@backstage/BackendFeature");
    const registrations = mod.default.getRegistrations();
    assert.equal(registrations.length, 1);
    const registration = registrations[0];
    assert.equal(
      registration.pluginId,
      name === "jenkins-stage-progress" ? "ci-progress" : "snyk-security"
    );
    const config =
      name === "jenkins-stage-progress"
        ? {
            ciProgress: {
              baseUrl: "https://jenkins.example.com",
              publicUrl: "https://jenkins.example.com",
              username: "reader",
              apiKey: "test-only",
              bindings: [
                {
                  entityRef: "component:default/payments-api",
                  jobFullName: "apps/payments/main",
                },
              ],
            },
          }
        : {
            snykSecurity: {
              bindings: [],
            },
          };
    const app = express();
    let routes = 0;
    await registration.init.func({
      config: new ConfigReader(config),
      logger,
      httpRouter: {
        use(router) {
          assert.equal(typeof router, "function");
          app.use(router);
          routes++;
        },
      },
      httpAuth: {},
      auth: {},
      discovery: {},
    });
    assert.equal(routes, 1);
    console.log(
      `${name}: archive loaded by CommonJSModuleLoader 0.8.0; real BackendFeature registration and Express router initialized.`
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
