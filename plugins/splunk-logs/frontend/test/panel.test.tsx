import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { act, create } from "react-test-renderer";
import { SplunkPanel } from "../src/SplunkPanel";
const entity = { metadata: { name: "payments-api" } },
  sample = {
    requests: 10,
    errors: 2,
    errorRate: 20,
    environment: "test",
    observedAt: new Date().toISOString(),
    recentErrors: [],
  };
const text = (v: any) =>
  JSON.stringify(v.toJSON(), (k, x) => (x?.type === "style" ? null : x));
test("seven-day selection and true metrics", async () => {
  const seen: string[] = [];
  let v: any;
  await act(async () => {
    v = create(
      <SplunkPanel
        entity={entity}
        load={async (w) => {
          seen.push(w);
          return sample;
        }}
      />
    );
  });
  assert.match(text(v), /Total requests/);
  assert.match(text(v), /20%/);
  await act(async () =>
    v.root.findByType("select").props.onChange({ target: { value: "7d" } })
  );
  assert.equal(seen.at(-1), "7d");
  await act(async () => v.unmount());
});
test("upstream failure removes earlier metrics", async () => {
  let n = 0,
    v: any;
  await act(async () => {
    v = create(
      <SplunkPanel
        entity={entity}
        load={async () => {
          if (n++) throw Error("Unavailable");
          return sample;
        }}
      />
    );
  });
  await act(async () => v.root.findByType("button").props.onClick());
  assert.match(text(v), /Unavailable/);
  assert.doesNotMatch(text(v), /Total requests/);
  await act(async () => v.unmount());
});
test("zero requests has no invented error percentage", async () => {
  let v: any;
  await act(async () => {
    v = create(
      <SplunkPanel
        entity={entity}
        load={async () => ({
          ...sample,
          requests: 0,
          errors: 0,
          recentErrors: [],
        })}
      />
    );
  });
  assert.match(text(v), /No request activity yet/);
  assert.doesNotMatch(text(v), /20%/);
  await act(async () => v.unmount());
});
