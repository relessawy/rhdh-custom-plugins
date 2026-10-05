import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { Overview, preferenceKey, parseHidden, CardId, configuredCards } from "../src/Overview";
test("preferences are scoped to identity and entity; corrupt values recover", () => {
  assert.notEqual(
    preferenceKey("user:default/alice", "component:default/a"),
    preferenceKey("user:default/bob", "component:default/a")
  );
  assert.notEqual(
    preferenceKey("user:default/alice", "component:default/a"),
    preferenceKey("user:default/alice", "component:default/b")
  );
  assert.deepEqual(parseHidden("{bad"), []);
  assert.deepEqual(parseHidden('["snyk","made-up"]'), ["snyk"]);
});
test("hide prevents polling, manage restores a hidden card, restore defaults recovers all", async () => {
  let saved: CardId[] = [];
  const calls: string[] = [];
  let view: any;
  await act(async () => {
    view = create(
      <Overview
        ids={["vault", "snyk"]}
        read={() => ["snyk"]}
        save={(v) => {
          saved = v;
          return true;
        }}
        load={async (id) => {
          calls.push(id);
          return { status: "Unknown", detail: "Waiting for evidence" };
        }}
      />
    );
  });
  assert.deepEqual(calls, ["vault"]);
  await act(async () =>
    view.root
      .findByProps({ "aria-label": "Hide Secrets · Vault" })
      .props.onClick()
  );
  assert.deepEqual(saved, ["snyk", "vault"]);
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b: any) => b.children.includes("Manage cards"))
      .props.onClick()
  );
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b: any) => b.children.includes("Restore defaults"))
      .props.onClick()
  );
  assert.deepEqual(saved, []);
  assert.ok(calls.includes("snyk"));
  view.unmount();
});
test("Splunk starts at one week and reloads the chosen window", async () => {
  const windows: string[] = []; let view: any;
  await act(async () => {view=create(<Overview ids={["splunk"]} read={()=>[]} save={()=>true} load={async (_id,window)=>{windows.push(window||'');return {status:'3 requests',detail:'result'};}}/>);});
  assert.equal(windows[0], '7d');
  await act(async()=>view.root.findByProps({'aria-label':'Splunk time window'}).props.onChange({target:{value:'1h'}}));
  assert.equal(windows.at(-1), '1h');
  view.unmount();
});
test("one missing provider does not prevent other cards loading", async () => {
  let view: any;
  await act(async () => { view = create(<Overview ids={["snyk", "jenkins"]} read={()=>[]} save={()=>true} load={async id=>{if(id === "snyk") throw Error("404 missing backend"); return {status:"Build #13 · SUCCESS",detail:"11 stages"};}}/>); });
  const text=JSON.stringify(view.toJSON());
  assert.ok(text.includes("Unavailable"));
  assert.ok(text.includes("Build #13 · SUCCESS"));
  await act(async()=>view.unmount());
});

test("cards require explicit enablement and a binding; unknown integrations are ignored", () => {
 const annotations={"snyk-security.io/binding":"demo","vault-health.io/vault-binding":"demo"};
 assert.deepEqual(configuredCards(annotations, []), []);
 assert.deepEqual(configuredCards(annotations, ["vault", "jenkins", "unknown"]), ["vault"]);
 assert.deepEqual(configuredCards({}, ["vault", "snyk"]), []);
});
