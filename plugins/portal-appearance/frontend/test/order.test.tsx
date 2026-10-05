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
