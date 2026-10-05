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
  assert.ok(["jenkins-stage-progress", "snyk-security", "splunk-logs", "jira-work-items", "application-health", "vault-health", "servicenow-infrastructure", "portal-appearance"].includes(name));
  if (["application-health", "portal-appearance"].includes(name)) {
    const version = require(path.join(root, "plugins", name, "frontend/package.json")).version;
    const entries = JSON.parse(fs.readFileSync(path.join(root,"artifacts",name,version,"packages.json")));
    assert.deepEqual(entries.map(e=>e.part), ["frontend"]);
    assert.ok(!fs.existsSync(path.join(root,"plugins",name,"backend")));
    const archive=path.join(root,"artifacts",name,version,entries[0].name);
    const manifest=JSON.parse(execFileSync("tar",["-xOf",archive,"package/package.json"],{encoding:"utf8"}));
    if (name === "portal-appearance") { assert.equal(manifest.backstage.role,"frontend-plugin"); console.log("Portal appearance frontend archive verified."); return; }
    const schema=JSON.parse(execFileSync("tar",["-xOf",archive,"package/"+manifest.configSchema],{encoding:"utf8"}));
    assert.equal(schema.properties.applicationHealth.properties.enabledCards.visibility,"frontend");
    assert.equal(schema.properties.applicationHealth.properties.detailTabs.visibility,"frontend");
    console.log("Application Overview is frontend-only; no Vault backend configuration required.");
    return;
  }
  const version = require(path.join(
    root,
    "plugins",
    name,
    "backend/package.json"
  )).version;
  if (name === "servicenow-infrastructure") {
    const archive = path.join(root,"artifacts",name,version,`${name}-frontend-${version}.tgz`);
    const manifest = JSON.parse(execFileSync("tar",["-xOf",archive,"package/package.json"],{encoding:"utf8"}));
    const schema = JSON.parse(execFileSync("tar",["-xOf",archive,"package/"+manifest.configSchema],{encoding:"utf8"}));
    assert.equal(schema.properties.serviceNowInfrastructure.properties.entities.visibility,"frontend");
    assert.equal(schema.properties.serviceNowInfrastructure.properties.bridgeToken,undefined);
  }
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
      ({"jenkins-stage-progress":"ci-progress","snyk-security":"snyk-security","splunk-logs":"splunk-logs","jira-work-items":"jira-work-items","vault-health":"vault-health","servicenow-infrastructure":"servicenow-infrastructure"})[name]
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
            ...(name === 'servicenow-infrastructure' ? {serviceNowInfrastructure:{bridgeUrl:'http://bridge.example.com',bridgeToken:'test-only',entities:[]}} : name === 'vault-health' ? {vaultHealth:{bindings:[]}} : name === 'snyk-security' ? {snykSecurity:{bindings:[]}} : name === 'splunk-logs' ? {splunkLogs:{baseUrl:'https://splunk.example.com:8089',bindings:[]}} : {jiraWorkItems:{siteUrl:'https://example.atlassian.net',cloudId:'11111111-1111-4111-8111-111111111111',email:'reader@example.com',apiToken:'test-only',bindings:[],entities:[]}}),
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
      database: {getClient: async()=>({schema:{hasTable:async()=>true}})},
      userInfo: {},
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
