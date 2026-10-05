import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, act } from "react-test-renderer";
import { SecurityPanel, safeLink, Summary } from "../src/SecurityPanel";
const sample: Summary = {
  entityRef: "component:default/payments",
  commit: "a".repeat(40),
  buildNumber: "7",
  observedAt: new Date().toISOString(),
  stale: true,
  gate: "BLOCKED",
  scans: ["code", "dependencies", "container"].map((kind) => ({
    kind,
    status: kind === "container" ? "NOT_RUN" : "BLOCKED",
    counts: { high: 1 },
    findings: [{ id: "V1", title: "<script>bad</script>", severity: "high" }],
    truncated: true,
  })),
};
const content = (v: any) =>
  JSON.stringify(v.toJSON(), (k, x) => (x?.type === "style" ? null : x));
test("three scan categories, incomplete evidence, gate and plain-text findings", async () => {
  let v: any;
  await act(async () => {
    v = create(
      <SecurityPanel entityRef={sample.entityRef} load={async () => sample} />
    );
  });
  for (const text of [
    "Source code",
    "Dependencies",
    "Container image",
    "BLOCKED",
    "NOT RUN",
    "Scanned",
    "first 200",
  ])
    assert.ok(content(v).includes(text));
  assert.equal(v.root.findAllByType("script").length, 0);
  v.unmount();
});
test("refresh failure removes stale successes and conceals provider error", async () => {
  let n = 0,
    v: any;
  await act(async () => {
    v = create(
      <SecurityPanel
        entityRef={sample.entityRef}
        load={async () => {
          if (n++) throw Error("private-token");
          return sample;
        }}
      />
    );
  });
  await act(async () => v.root.findAllByType("button")[0].props.onClick());
  assert.match(content(v), /No successful scan is implied/);
  assert.doesNotMatch(content(v), /private-token|BLOCKED/);
  v.unmount();
});
test("entity change discards previous in-flight report", async () => {
  let finish: any, v: any;
  await act(async () => {
    v = create(
      <SecurityPanel
        entityRef="old"
        load={() => new Promise((r) => (finish = r))}
      />
    );
  });
  await act(async () =>
    v.update(
      <SecurityPanel
        entityRef="new"
        load={async () => ({ ...sample, buildNumber: "99" })}
      />
    )
  );
  await act(async () => finish(sample));
  assert.match(content(v), /Build 99/);
  assert.doesNotMatch(content(v), /Build 7/);
  v.unmount();
});
test("unsafe specialist URLs rejected", () => {
  assert.equal(safeLink("javascript:alert(1)"), undefined);
  assert.equal(safeLink("https://user:password@example.com"), undefined);
  assert.ok(safeLink("https://jenkins.example.com/job/a/7/"));
});
