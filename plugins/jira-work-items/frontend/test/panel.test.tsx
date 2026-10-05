import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, create } from "react-test-renderer";
import { JiraPanel } from "../src/JiraPanel";
const base = {
  project: "PAY",
  canTransition: true,
  issues: [
    {
      key: "PAY-1",
      summary: "Change savings guidance",
      status: "In Progress",
      category: "indeterminate",
      url: "https://example.atlassian.net/browse/PAY-1",
    },
  ],
  observedAt: new Date().toISOString(),
};
const text = (v: any) =>
  JSON.stringify(v.toJSON(), (k, x) => (x?.type === "style" ? null : x));
test("workflow destinations shown and transition sends optimistic version", async () => {
  let post: any, v: any;
  const request = async (path: string, init?: any) => {
    if (init?.method === "POST") {
      post = JSON.parse(init.body);
      return Response.json({ status: "Revoked", requestId: "test-audit" });
    }
    return Response.json(
      path.startsWith("/issues")
        ? base
        : {
            status: "In Progress",
            expectedStatus: "2",
            expectedUpdated: "stamp",
            transitions: [
              { id: "31", name: "Revoke", to: "Revoked" },
              { id: "11", name: "Restart", to: "To Do" },
            ],
          }
    );
  };
  await act(async () => {
    v = create(
      <JiraPanel
        entityRef="component:default/payments"
        enabled
        request={request}
      />
    );
  });
  await act(async () =>
    v.root
      .findAllByType("button")
      .find((b: any) => b.props["aria-label"] === "Change status for PAY-1")
      .props.onClick()
  );
  assert.match(text(v), /Revoked/);
  await act(async () =>
    v.root.findByType("select").props.onChange({ target: { value: "31" } })
  );
  await act(async () =>
    v.root
      .findAllByType("button")
      .find((b: any) => b.props.className === "primary")
      .props.onClick()
  );
  assert.equal(post.transition, "31");
  assert.equal(post.expectedUpdated, "stamp");
  assert.match(text(v), /test-audit/);
  await act(async () => v.unmount());
});
test("read-only group cannot open actions", async () => {
  let v: any;
  await act(async () => {
    v = create(
      <JiraPanel
        entityRef="component:default/payments"
        enabled
        request={async () => Response.json({ ...base, canTransition: false })}
      />
    );
  });
  assert.equal(v.root.findAllByType("button").length, 1);
  assert.match(text(v), /read-only/);
  await act(async () => v.unmount());
});
test("upstream error is not displayed as an empty project", async () => {
  let v: any;
  await act(async () => {
    v = create(
      <JiraPanel
        entityRef="component:default/payments"
        enabled
        request={async () => new Response("", { status: 503 })}
      />
    );
  });
  assert.match(text(v), /Jira is unavailable/);
  assert.doesNotMatch(text(v), /No visible work items/);
  await act(async () => v.unmount());
});
