const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeReport } = require("../report.cjs");
const now = Date.now(),
  ref = "component:default/app";
const report = () => ({
  schemaVersion: 1,
  entityRef: ref,
  observedAt: new Date(now).toISOString(),
  checks: {
    delivery: {
      status: "healthy",
      secret: "never-return",
      message: "private",
      lastSuccessAt: new Date(now).toISOString(),
    },
  },
  token: "never-return",
});
test("only allowlisted health metadata reaches the browser", () => {
  const r = sanitizeReport(report(), ref, now);
  assert.equal(r.checks.delivery.status, "healthy");
  assert.equal(r.checks.authentication.status, "unknown");
  assert.ok(!JSON.stringify(r).includes("never-return"));
  assert.ok(!JSON.stringify(r).includes("private"));
});
test("stale evidence cannot report healthy", () => {
  const r = sanitizeReport(report(), ref, now + 181000);
  assert.equal(r.stale, true);
  assert.equal(r.checks.delivery.status, "stale");
});
test("rejects incorrect entity and future evidence", () => {
  assert.throws(() => sanitizeReport(report(), "component:default/other", now));
  assert.throws(() => sanitizeReport(report(), ref, now - 60000));
});
