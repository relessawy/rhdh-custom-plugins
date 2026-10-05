import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrder, orderedTabs, move } from "../src/order";
const tabs = ["overview", "ci", "docs", "vault"].map((id) => ({
  id,
  label: id,
  href: "/" + id,
}));
test("moves Docs to the end and back", () => {
  assert.deepEqual(
    move(
      tabs.map((t) => t.id),
      "docs",
      "vault"
    ),
    ["overview", "ci", "vault", "docs"]
  );
  assert.deepEqual(move(["ci", "docs", "overview"], "overview", "ci"), [
    "overview",
    "ci",
    "docs",
  ]);
});
test("missing plugins are omitted and new plugins append in shell order", () => {
  assert.deepEqual(
    orderedTabs(tabs, ["vault", "removed", "overview"]).map((t) => t.id),
    ["vault", "overview", "ci", "docs"]
  );
});
test("invalid preferences and duplicates are safe", () => {
  assert.deepEqual(parseOrder("{"), []);
  assert.deepEqual(parseOrder("{}"), []);
  assert.deepEqual(parseOrder('["docs",12,"docs"]'), ["docs"]);
  assert.deepEqual(move(["ci"], "missing", "ci"), ["ci"]);
});

import {tabLabel,hasBrandIcon} from "../src/brands";
test("brand labels preserve route identities",()=>{assert.equal(tabLabel("infrastructure","Infrastructure"),"ServiceNow");assert.equal(tabLabel("ci","CI"),"CI");for(const id of ["cd","jira","splunk","infrastructure"])assert.ok(hasBrandIcon(id));assert.ok(!hasBrandIcon("docs"));});

import {visibleTabs} from "../src/order";
test("visibility retains Overview and restores hidden or newly installed tabs",()=>{
 assert.deepEqual(visibleTabs(tabs,["overview","ci","vault"]).map(t=>t.id),["overview","docs"]);
 assert.deepEqual(visibleTabs(tabs,[]),tabs);
 assert.deepEqual(visibleTabs(tabs,["missing"]).map(t=>t.id),tabs.map(t=>t.id));
 assert.ok(hasBrandIcon("topology"));
});
