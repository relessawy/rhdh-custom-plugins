import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, act } from "react-test-renderer";
import { SecurityPanel, safeLink, Summary } from "../src/SecurityPanel";
const sample: Summary = {
  observedAt: "2026-10-01T00:00:00Z",
  projects: [
    {
      id: "p",
      name: "payments-api",
      type: "npm",
      status: "active",
      targetId: "t",
      reference: "main",
      url: "https://app.snyk.io/org/example/project/p",
      issues: [
        {
          id: "i",
          title: "<script>alert(1)</script>",
          severity: "high",
          type: "package_vulnerability",
          status: "open",
          ignored: false,
        },
      ],
      partial: true,
      counts: { high: 1 },
    },
  ],
};
const content = (r: any) => JSON.stringify(r.toJSON());
test("loading, partial counts, plain-text findings and severity filter", async () => {
  let finish: any;
  const load = () => new Promise<Summary>((r) => (finish = r));
  let view: any;
  await act(async () => {
    view = create(
      <SecurityPanel entityRef="component:default/payments-api" load={load} />
    );
  });
  assert.match(content(view), /Loading Snyk/);
  await act(async () => finish(sample));
  assert.match(content(view), /Partial results/);
  assert.match(content(view), /shown findings/);
  assert.equal(view.root.findAllByType("script").length, 0);
  await act(async () =>
    view.root.findByType("select").props.onChange({ target: { value: "low" } })
  );
  assert.match(content(view), /No displayed findings match/);
  view.unmount();
});
test("provider error clears previous results on refresh", async () => {
  let calls = 0;
  const load = async () => {
    if (calls++) throw Error("secret provider error");
    return sample;
  };
  let view: any;
  await act(async () => {
    view = create(
      <SecurityPanel entityRef="component:default/payments-api" load={load} />
    );
  });
  assert.match(content(view), /payments-api/);
  await act(async () => view.root.findByType("button").props.onClick());
  assert.match(content(view), /No successful scan is implied/);
  assert.doesNotMatch(content(view), /payments-api|secret provider error/);
  view.unmount();
});
test("empty response has qualified wording and unsafe links are rejected", async () => {
  assert.equal(safeLink("javascript:alert(1)"), undefined);
  assert.equal(safeLink("https://name:pass@example.com"), undefined);
  let view: any;
  await act(async () => {
    view = create(
      <SecurityPanel
        entityRef="component:default/payments-api"
        load={async () => ({
          ...sample,
          projects: [
            { ...sample.projects[0], issues: [], partial: false, counts: {} },
          ],
        })}
      />
    );
  });
  assert.match(content(view), /does not establish scan coverage/);
  view.unmount();
});
test("changing entity ignores a late response from the previous component", async () => {
  let finish: any;
  const slow = () => new Promise<Summary>((r) => (finish = r)),
    fast = async () => ({
      ...sample,
      projects: [{ ...sample.projects[0], name: "new-component" }],
    });
  let view: any;
  await act(async () => {
    view = create(
      <SecurityPanel entityRef="component:default/old" load={slow} />
    );
  });
  await act(async () =>
    view.update(<SecurityPanel entityRef="component:default/new" load={fast} />)
  );
  await act(async () => finish(sample));
  assert.match(content(view), /new-component/);
  assert.doesNotMatch(content(view), /payments-api/);
  view.unmount();
});
